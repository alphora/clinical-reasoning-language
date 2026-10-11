"""Derived candidate mapping (DESIGN §4): never hand-typed.

Dispositions from package.json + ActivityDefinitions + AST activities; questions via StructureDefinitions;
answerableFor from the build_crl_ast dependency closure (called through the pinned crl-mcp.mjs)."""
import json
import os
import re
import subprocess
from pathlib import Path

from .util import OUTCOMES, KeAuditError, mcp_body, read_json, sha_file, write_atomic, write_json

PIPELINE = Path(__file__).resolve().parents[2]  # .claude/ke-pipeline


def pins():
    accepted = read_json(PIPELINE / 'pins.json')
    local = PIPELINE.parents[1] / 'tmp/runtime/pins.local.json'
    if not local.exists():
        return accepted
    bound = read_json(local)
    for key in ('crlVersion', 'kitSchema', 'kitHash'):
        if bound.get(key) != accepted.get(key):
            raise KeAuditError('local runtime identity mismatch: ' + key)
    for key in ('server', 'driver', 'engine'):
        if bound.get(key, {}).get('sha256') != accepted.get(key, {}).get('sha256'):
            raise KeAuditError('local runtime identity mismatch: ' + key + '.sha256')
    return bound


def select_crl(artifact, name):
    """Same selection rule as pipeline.mjs."""
    d = Path(artifact) / 'src/crl'
    files = sorted(p for p in d.glob('*.crl')) if d.exists() else []
    for pick in (lambda f: f.stem == name, lambda f: f.stem == f'{name}-medical-policy',
                 lambda f: f.stem != 'medical-policy-determination'):
        hit = [f for f in files if pick(f)]
        if hit:
            return hit[0]
    raise KeAuditError(f'no policy CRL under {d}')


def select_cel(artifact, suite):
    files = sorted((Path(artifact) / 'src/cel' / suite).glob('*.cel'))
    if len(files) != 1:
        raise KeAuditError(f'exactly one {suite} CEL required under {artifact}/src/cel/{suite}, found {len(files)}')
    return files[0]


def build_ast(crl_path, cwd, out_dir):
    """Call build_crl_ast through the pinned crl-mcp.mjs; keep request, response and stderr under out_dir."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    req = out_dir / 'ast-request.json'
    resp = out_dir / 'ast-response.json'
    write_atomic(req, json.dumps({'cwd': str(out_dir).replace('\\', '/'), 'calls': [{'name': 'build_crl_ast', 'arguments': {'path': str(crl_path).replace('\\', '/')}, 'out': str(resp)}],
                               'receipt': str(out_dir / 'ast-transport-receipt.json')}))  # cwd=out_dir: no side effects in the artifact
    p = pins()
    r = subprocess.run([p['node'], str(PIPELINE / 'crl-mcp.mjs'), str(req)], capture_output=True, text=True, timeout=600)
    if r.returncode != 0 or not resp.exists():
        raise KeAuditError(f'build_crl_ast failed (exit {r.returncode}): {r.stderr[-400:]}')
    env, body = mcp_body(resp)
    if env.get('isError') or not body or not body.get('success'):
        raise KeAuditError(f'build_crl_ast returned an error: {str(body)[:400]}')
    return body['result'], sha_file(resp)


def _refs(node, out):
    if isinstance(node, dict):
        if node.get('type') == 'NConceptRef':
            out.append(node.get('value'))
        for v in node.values():
            _refs(v, out)
    elif isinstance(node, list):
        for v in node:
            _refs(v, out)
    return out


def _activities(node, out):
    if isinstance(node, dict):
        if node.get('type') == 'RecommendActivity':
            a = node.get('activityName')
            name = a.get('name') if isinstance(a, dict) else a
            if not isinstance(name, str) or not name:
                raise KeAuditError(f'unrecognized RecommendActivity.activityName shape: {a!r}')
            out.add(name)
        for v in node.values():
            _activities(v, out)
    elif isinstance(node, list):
        for v in node:
            _activities(v, out)
    return out


def _flat_actions(actions):
    for action in actions or []:
        yield action
        yield from _flat_actions(action.get('action'))


class Model:
    def __init__(self, artifact, ast):
        self.artifact = Path(artifact)
        self.pkg = read_json(self.artifact / 'package.json')
        self.name, self.version = self.pkg['name'], self.pkg.get('version', '0.0.0')
        crl = self.pkg.get('crl', {})
        self.base = crl.get('canonicalBase', '')
        if not self.base.endswith('/'):
            self.base += '/'
        # package dispositions: key "<group>.<option>" -> label
        self.package_keys = {}
        for group, opts in (crl.get('dispositions', {}).get('options', {}) or {}).items():
            for opt, spec in opts.items():
                self.package_keys[f'{group}.{opt}'] = (spec or {}).get('label', opt)
        self.label_to_key = {v: k for k, v in self.package_keys.items()}
        # AST
        stmts = ast.get('statements', [])
        self.concepts, self.terminologies = {}, set()
        for s in stmts:
            if s.get('type') == 'Concept':
                # question: askable (has `code is`, or no definition and no Patient source);
                # patient: pure Patient projection without a code (no question exists);
                # computed: `definition is` over other concepts. A question may ALSO carry a Patient
                # projection (age asserted OR computed from birth date) -> patientProjection flag.
                inputs = []
                has_patient = any((r or {}).get('conceptType') == 'Patient' for r in s.get('representations') or [])
                if s.get('definition'):
                    kind = 'computed'
                    inputs = _refs(s['definition'], [])
                elif has_patient and not s.get('code'):
                    kind = 'patient'
                elif (s.get('representations') and not s.get('code')
                      and all((r or {}).get('conceptType') in ('MedicationRequest', 'ServiceRequest')
                              for r in s['representations'])):
                    kind = 'source'
                else:
                    kind = 'question'
                self.concepts[s['name']] = {'kind': kind, 'inputs': inputs, 'valueTypes': s.get('valueTypes'), 'code': s.get('code'),
                                            'patientProjection': has_patient}
            elif s.get('type') == 'Terminology':
                self.terminologies.add(s.get('name'))
        self.activities_used = sorted(_activities([s for s in stmts if s.get('type') == 'Decision'], set()))
        self.presentations = {p['target']: {'text': p.get('questionText'), 'description': p.get('questionDescription')}
                              for p in ast.get('presentations', []) or []}
        # emitted PlanDefinition inputs: SD profile -> (cpg-input-text, cpg-input-description)
        self.inputs = {}
        for f in (self.artifact / 'src/fhir/PlanDefinition').glob('*.json'):
            d = read_json(f)
            stack = list(d.get('action') or [])
            while stack:
                a = stack.pop()
                stack.extend(a.get('action') or [])
                for i in a.get('input') or []:
                    ext = {e.get('url', '').rsplit('/', 1)[-1]: e.get('valueString', e.get('valueMarkdown')) for e in i.get('extension') or []}
                    for prof in i.get('profile') or []:
                        self.inputs.setdefault(prof, []).append({'text': ext.get('cpg-input-text'), 'description': ext.get('cpg-input-description')})
        # emitted StructureDefinitions: url -> title (concept)
        self.sd = {}
        for f in (self.artifact / 'src/fhir/StructureDefinition').glob('*.json'):
            d = read_json(f)
            self.sd[d['url']] = d.get('title')
        self.sd_by_title = {}
        for u, t in self.sd.items():
            self.sd_by_title.setdefault(t, []).append(u)
        # ActivityDefinitions: key -> {label, x12, url, kind}
        self.ad = {}
        self.duplicate_ad_titles = set()
        for f in (self.artifact / 'src/fhir/ActivityDefinition').glob('*.json'):
            d = read_json(f)
            label = x12 = None
            reason_codes = []
            label_path = {'Task': 'description', 'CommunicationRequest': 'payload.contentString'}.get(d.get('kind'))
            for dv in d.get('dynamicValue', []) or []:
                expr = (dv.get('expression') or {}).get('expression', '')
                if dv.get('path') == label_path:
                    m = re.fullmatch(r"'(.*)'", expr.strip())
                    label = m.group(1) if m else None
                elif dv.get('path') == 'reasonCode':
                    reason_codes = re.findall(r"code:\s*code\s*\{\s*value:\s*'([^']+)'", expr)
                    x12 = reason_codes[0] if reason_codes else None
            title = d.get('title')
            if title in self.ad:
                self.duplicate_ad_titles.add(title)
            self.ad[title] = {'label': label, 'x12': x12, 'reasonCodes': reason_codes,
                              'url': d.get('url'), 'id': d.get('id'), 'kind': d.get('kind')}
        # Use the emitted identity, which may have a shortened FHIR id. A key must
        # resolve to exactly one emitted recommendation PlanDefinition.
        self.recommendations = {}
        plans = [read_json(f) for f in (self.artifact / 'src/fhir/PlanDefinition').glob('*.json')]
        referenced_plans = {(a.get('definitionCanonical') or '').split('|', 1)[0]
                            for d in plans for a in _flat_actions(d.get('action'))
                            if (a.get('definitionCanonical') or '').split('|', 1)[0].startswith(self.base + 'PlanDefinition/')}
        self.entry_by_title = {}
        for d in plans:
            if (isinstance(d.get('url'), str) and d['url'] not in referenced_plans
                    and isinstance(d.get('title'), str)):
                self.entry_by_title.setdefault(d['title'], []).append(
                    f"{d['url']}|{d.get('version') or self.version}")
        decision_names = {s.get('name') for s in stmts if s.get('type') == 'Decision'}
        root_entries = [canonical for title, candidates in self.entry_by_title.items()
                        if title in decision_names for canonical in candidates]
        self.entry_canonical = root_entries[0] if len(root_entries) == 1 else None
        for d in plans:
            definitions = [a.get('definitionCanonical') or '' for a in _flat_actions(d.get('action'))]
            for key, ad in self.ad.items():
                if (key not in self.duplicate_ad_titles and isinstance(d.get('url'), str)
                        and d['url'] and ad['url']
                        and any(canonical.split('|', 1)[0] == ad['url']
                                for canonical in definitions)):
                    self.recommendations.setdefault(key, []).append(
                        f"{d.get('url')}|{d.get('version') or self.version}")

    # ---- answerableFor (183-R8/184-G): concept -> set of question concepts; patient projections marked ----
    def answerable(self, name, _seen=None):
        """Returns (questions:set, patient:set, problems:list)."""
        _seen = _seen or ()
        if name in _seen:
            return set(), set(), [f'cycle via {name}']
        c = self.concepts.get(name)
        if c is None:
            return set(), set(), [f'unresolved concept {name!r}']
        if c['kind'] == 'question':
            return {name}, set(), []
        if c['kind'] == 'patient':
            return set(), {name}, []
        if c['kind'] == 'source':
            return set(), set(), [f'source-only concept {name!r} has no editable question']
        qs, ps, probs = set(), set(), []
        for i in c['inputs']:
            if i in self.terminologies:
                continue
            q, p, pr = self.answerable(i, _seen + (name,))
            qs |= q
            ps |= p
            probs += pr
        if not qs and not ps and not probs:
            probs.append(f'computed concept {name!r} has no concept inputs')
        return qs, ps, probs

    def concept_of_definition(self, definition):
        if not definition or not definition.endswith('#Observation.value[x]'):
            return None
        return self.sd.get(definition[:-len('#Observation.value[x]')])

    def key_for_label(self, label):
        return self.label_to_key.get(label) or OUTCOMES.get(label)

    def recommendation_canonical(self, key):
        candidates = self.recommendations.get(key, [])
        return candidates[0] if len(candidates) == 1 else None

    def entry_for_decision(self, name):
        candidates = self.entry_by_title.get(name, []) if name else []
        return candidates[0] if len(candidates) == 1 else self.entry_canonical if not name else None


def load(artifact, ast_dir, crl_path=None):
    art = Path(artifact)
    pkg = read_json(art / 'package.json')
    crl = Path(crl_path) if crl_path else select_crl(art, pkg['name'])
    ast, ast_sha = build_ast(crl, art, ast_dir)
    m = Model(art, ast)
    m.crl_path, m.ast_sha, m.crl_sha = crl, ast_sha, sha_file(crl)
    write_json(Path(ast_dir) / 'derived-mapping.json', {
        'package': m.name, 'version': m.version, 'canonicalBase': m.base, 'packageKeys': m.package_keys,
        'activitiesUsed': m.activities_used, 'activityDefinitions': m.ad,
        'entryCanonical': m.entry_canonical, 'entryCandidatesByTitle': m.entry_by_title,
        'recommendationCanonicals': m.recommendations,
        'concepts': {k: {'kind': v['kind'], 'inputs': v['inputs']} for k, v in m.concepts.items()},
        'crlSha256': m.crl_sha, 'astResponseSha256': ast_sha})
    return m
