"""Checks over executed evidence: cre, native, casedata, assoc (DESIGN §6)."""
import base64
import copy
import json
import re
from collections import Counter
from pathlib import Path

from . import cel
from .answer_options import compare_option_codings
from .util import DETERMINATION_RESOURCE_TYPE, Result, flat_items, norm, read_json, sha_file, walk_resources

SUFFIX = '#Observation.value[x]'


# ---------------- shared ----------------
def oracle(ctx):
    """{(suite, caseId): expectation} via the regenerated alias map (gate 3)."""
    exp = ctx['freeze']['expectationsContent']
    return {tuple(ctx['aliases'][a]): c for a, c in exp['cases'].items()}


def resolve_named(model, names):
    """[(name, questionSet)], problems. A pause may never name a patient projection."""
    groups, probs = [], []
    for n in names or []:
        q, p, pr = model.answerable(n)
        probs += pr
        if p and not q:
            probs.append(f'pause names patient projection {n!r} (no question exists)')
        groups.append((n, q))
    return groups, probs


def answer_value(ans):
    if not ans:
        return None
    if len(ans) != 1:
        return ('multiple', len(ans))
    a = ans[0]
    for k in ('valueBoolean', 'valueCoding', 'valueQuantity', 'valueDecimal', 'valueInteger', 'valueDate', 'valueDateTime', 'valueString'):
        if k in a:
            return (k, a[k])
    return ('unsupported', sorted(a))


def matches(fact_value, tagged, base=None, value_types=None):
    """CEL typed value vs a QR/Observation value tag."""
    if tagged is None or not isinstance(tagged, tuple):
        return False
    k, v = tagged
    if 'boolean' in fact_value:
        return k == 'valueBoolean' and v is fact_value['boolean']
    if 'code' in fact_value:
        # The frozen CEL view stores the quoted lexical payload under "code".
        # Use the authored AST type, never the observed output tag, to interpret it.
        if value_types == ['string']:
            # Pinned CEL unquote strips delimiters and preserves escape characters.
            return k == 'valueString' and isinstance(v, str) and v == fact_value['code']
        if value_types == ['dateTime']:
            # Preserve the source answer's precision and offset; the CEL fact's
            # separate `date` is the assertion time, not the answer value.
            return k == 'valueDateTime' and isinstance(v, str) and v == fact_value['code']
        if value_types == ['date']:
            return k == 'valueDate' and isinstance(v, str) and v == fact_value['code']
        if value_types is not None and value_types != ['CodeableConcept']:
            return False
        if k == 'valueCoding':
            return v.get('code') == fact_value['code'] and (base is None or str(v.get('system', '')).startswith(base + 'CodeSystem/'))
        if k == 'valueCodeableConcept':
            cs = v.get('coding') or []
            return len(cs) == 1 and cs[0].get('code') == fact_value['code'] and (base is None or str(cs[0].get('system', '')).startswith(base + 'CodeSystem/'))
        return False
    if 'quantity' in fact_value:
        return k == 'valueQuantity' and float(v.get('value', 'nan')) == fact_value['quantity'] and fact_value['unit'] in (v.get('unit'), v.get('code'))
    if 'number' in fact_value:
        return k in ('valueDecimal', 'valueInteger') and float(v) == fact_value['number']
    return False


def case_answers(parsed, case, model, res, where):
    """{concept: typed value} for question concepts (latest date wins; ties are ambiguous)."""
    out, dates = {}, {}
    for fname in case['facts']:
        f = parsed['facts'][fname]
        if 'resourceType' in f:
            continue  # supplied request data is not a QR answer
        c = f['concept']
        kind = model.concepts.get(c, {}).get('kind')
        if kind != 'question':
            res.limit(where, f'fact on non-question concept {c!r} ({kind}) not compared to QR')
            continue
        d = f.get('date') or ''
        if c in out and d == dates[c] and out[c] != f['value']:
            res.fail(where, f'ambiguous same-date facts for {c!r}')
        if c not in out or d > dates[c]:
            out[c], dates[c] = f['value'], d
    return out


def flat_actions(actions):
    for a in actions or []:
        yield a
        yield from flat_actions(a.get('action'))


_ENTRY_UNSET = object()


def disposition_chain(groups, requests, model, entry_canonical=_ENTRY_UNSET):
    """Walk the actual RequestGroup closure and resolve Task/CommunicationRequest leaves."""
    rgs = {r.get('id'): r for r in groups}
    leaves = {f"{r.get('resourceType')}/{r.get('id')}": r for r in requests}
    incoming = Counter()
    invalid_refs = []
    for group in groups:
        for action in flat_actions(group.get('action')):
            resource = action.get('resource')
            if resource is None:
                continue
            ref = resource.get('reference') if isinstance(resource, dict) else None
            if (not isinstance(ref, str) or not ref or
                    not ref.startswith(('RequestGroup/', 'CommunicationRequest/', 'Task/')) or
                    not ref.split('/', 1)[1]):
                invalid_refs.append(ref)
            else:
                incoming[ref] += 1
    referenced = {ref.split('/', 1)[1] for ref in incoming if ref.startswith('RequestGroup/')}
    tops = [gid for gid in rgs if gid not in referenced]
    if entry_canonical is _ENTRY_UNSET:
        entry_canonical = model.entry_canonical
    entry = [gid for gid, group in rgs.items()
             if entry_canonical and (group.get('instantiatesCanonical') or []) == [entry_canonical]]
    checks = {'entryPlanDefinitionResolved': bool(entry_canonical),
              'uniqueRequestGroupIds': len(rgs) == len(groups) and None not in rgs,
              'uniqueDeterminationIds': len(leaves) == len(requests) and all(r.get('id') for r in requests),
              'oneTopRequestGroup': len(tops) == 1,
              'entryRequestGroup': len(entry) == 1 and tops == entry,
              'uniqueDispositionReferences': (len(entry) == 1 and
                  incoming[f'RequestGroup/{entry[0]}'] == 0 and
                  all(incoming[f'RequestGroup/{gid}'] == 1 for gid in rgs if gid != entry[0]) and
                  all(incoming[ref] == 1 for ref in leaves)),
              'dispositionGraphAcyclic': True, 'uniqueDispositionPaths': True,
              'dispositionReferencesResolved': not invalid_refs}
    acts, visited, active, reached_leaves = [], set(), set(), set()

    def visit(gid):
        if gid in active:
            checks['dispositionGraphAcyclic'] = False
            return
        if gid in visited:
            checks['uniqueDispositionPaths'] = False
            return
        group = rgs.get(gid)
        if group is None:
            checks['dispositionReferencesResolved'] = False
            return
        active.add(gid)
        visited.add(gid)
        for action in flat_actions(group.get('action')):
            resource = action.get('resource')
            ref = resource.get('reference', '') if isinstance(resource, dict) else ''
            if isinstance(ref, str) and ref.startswith('RequestGroup/'):
                visit(ref.split('/', 1)[1])
            elif isinstance(ref, str) and ref.startswith(('CommunicationRequest/', 'Task/')):
                leaf = leaves.get(ref)
                reached_leaves.add(ref)
                payload = (leaf or {}).get('payload') or []
                label = ((leaf or {}).get('description') if ref.startswith('Task/') else
                         (payload[0].get('contentString') if len(payload) == 1 else ('multiple' if payload else None)))
                reason = (leaf or {}).get('reasonCode') or []
                reasons = reason if isinstance(reason, list) else [reason]
                key = action.get('title')
                expected_canonical = model.recommendation_canonical(key or '')
                acts.append({'key': key, 'resourceType': ref.split('/', 1)[0], 'resolved': leaf is not None,
                             'canonical': bool(expected_canonical) and (group.get('instantiatesCanonical') or []) == [expected_canonical],
                             'label': label,
                             'x12': [cd.get('code') for cc in reasons if isinstance(cc, dict) for cd in cc.get('coding', [])]})
                if leaf is None:
                    checks['dispositionReferencesResolved'] = False
        active.remove(gid)

    if len(entry) == 1:
        visit(entry[0])
    orphans = (sorted(set(leaves) - reached_leaves)
               + sorted(f"RequestGroup/{gid}" for gid in set(rgs) - visited))
    checks['noOrphanDispositionResources'] = not orphans
    return checks, acts, orphans


def no_determination_resources(by):
    """A no-result terminal has no determination or form, including Task outputs."""
    return not any(by.get(kind) for kind in (
        'CommunicationRequest', 'ServiceRequest', 'Task', 'Questionnaire', 'QuestionnaireResponse'))


def cel_suites(ctx):
    return {s: cel.parse(ctx['cels'][s]) for s in ('mv', 'regression')}


# ---------------- cre ----------------
def _unknown_refs(ct, acc):
    """Concept refs without a truth value, through and/or (`operands`), not (`operand`) and criterion (`body`)."""
    if isinstance(ct, dict):
        if ct.get('op') == 'ref' and 'satisfied' not in ct:
            c = ct.get('concept')
            acc.append(c.get('name') if isinstance(c, dict) else c)
        for o in ct.get('operands') or []:
            _unknown_refs(o, acc)
        for k in ('operand', 'body'):
            if isinstance(ct.get(k), dict):
                _unknown_refs(ct[k], acc)
    return acc


def _unknown_nodes(trace, acc, path):
    """Evaluated when-nodes whose condition has no truth value (explicit `unknown`, or `satisfied` absent)."""
    for n in trace or []:
        if n.get('evaluated'):
            path.append(n.get('nodeId'))
            if n.get('unknown') or (n.get('kind') == 'when' and 'satisfied' not in n):
                if n.get('conditionTrace'):
                    _unknown_refs(n['conditionTrace'], acc)
                elif n.get('concept'):
                    acc.append(n['concept'])
        _unknown_nodes(n.get('children'), acc, path)
    return acc


def no_determination_cre(produced, unknowns, model):
    """An empty result is valid only when no answerable question is pending."""
    unresolved = []
    for name in unknowns:
        questions, patient, problems = model.answerable(name)
        if questions or patient or any(not problem.startswith('source-only concept ') for problem in problems):
            unresolved.append({'concept': name, 'questions': sorted(questions),
                               'patientProjections': sorted(patient), 'problems': problems})
    return not produced and not unresolved, unresolved


def cre_run_execution_ok(run):
    # CRE's status compares against the author's oracle and cannot be used here.
    return (isinstance(run.get('decision'), str)
            and isinstance(run.get('produced'), list)
            and all(isinstance(p, dict) for p in run['produced'])
            and isinstance(run.get('trace'), list))


def check_cre(ctx, model):
    res = Result('cre')
    orc, parsed, ev = oracle(ctx), cel_suites(ctx), ctx['evidence']
    art = Path(ctx['artifact'])
    want = {norm(art / ctx['manifest']['files'][s]['path']): s for s in ('mv', 'regression')}
    reg_name = Path(ctx['manifest']['files']['regression']['path']).name
    primary, fallback = {'mv': [], 'regression': []}, {'mv': [], 'regression': []}
    for st in ev.stage('cre'):
        for c in st['calls']:
            if c['name'] == 'run_decision' and want.get(norm(c['arguments'].get('path'))):
                primary[want[norm(c['arguments'].get('path'))]].append((st, c))
    for st in ev.stage('controls'):
        for c in st['calls']:
            if c['name'] == 'run_decision' and norm(c['arguments'].get('path')).endswith('/' + reg_name.casefold()):
                fallback['regression'].append((st, c))
    rows = []
    for suite in ('mv', 'regression'):
        seen_out, cands = set(), []
        for st, c in primary[suite] + fallback[suite]:  # all sources; a duplicate call file is counted once
            if norm(c['out']) not in seen_out:
                seen_out.add(norm(c['out']))
                cands.append((st, c))
        if not cands:
            res.fail('coverage', suite, 'no run_decision evidence for this suite')
            continue
        # every source for the suite is evaluated; each must agree with the oracle (a good duplicate cannot hide a bad run)
        for st, call in cands:
            body = call['body'] or {}
            if body.get('success') is not True or body.get('errorCount') != 0:
                res.fail(suite, 'CRE execution error in run_decision response')
            names = {}
            for c in parsed[suite]['cases']:
                if c['display'] in names:
                    res.fail(suite, 'duplicate case display name; cannot join CRE runs')
                names[c['display']] = c['id']
            seen = set()
            for run in body.get('runs', []) or []:
                if not isinstance(run, dict):
                    res.fail(suite, 'CRE response contains a malformed run')
                    continue
                cid = names.get(run.get('case'))
                if cid is None:
                    res.fail(suite, 'CRE run for a case not in the candidate CEL')
                    continue
                if cid in seen:
                    res.fail(suite, cid, 'duplicate CRE run')
                seen.add(cid)
                e = orc.get((suite, cid))
                raw_produced = run.get('produced')
                produced = [p.get('recommendation') if isinstance(p, dict) else None
                            for p in raw_produced] if isinstance(raw_produced, list) else []
                path = []
                unk = _unknown_nodes(run['trace'], [], path) if isinstance(run.get('trace'), list) else []
                row = {'suite': suite, 'caseId': cid, 'produced': produced, 'path': path}
                execution_ok = cre_run_execution_ok(run)
                if e['expect'] == 'none':
                    row['ok'], unresolved = no_determination_cre(produced, unk, model)
                    row['nonAnswerableUnknowns'] = unk
                    if not row['ok']:
                        res.fail(suite, cid, 'CRE no-determination mismatch', {'produced': produced, 'unresolved': unresolved})
                elif e['expect'] != 'pause':
                    key = model.key_for_label(e['expect'])
                    row['ok'] = produced == [key]
                    if not row['ok']:
                        res.fail(suite, cid, f'CRE produced {produced} expected {key}')
                else:
                    U, P, probs = set(), set(), []
                    for u in unk:
                        q, p, pr = model.answerable(u)
                        U |= q
                        P |= p
                        probs += pr
                    groups, gp = resolve_named(model, e['pause']['questions'])
                    probs += gp
                    mode = e['pause']['mode']
                    hit = [bool(q & U) for _, q in groups]
                    union = set().union(*[q for _, q in groups]) if groups else set()
                    ok = produced == [] and not probs and (
                        any(hit) if mode == 'anyOf' else all(hit) if mode == 'allOf' else (U == union and not P))
                    bad_named = sorted(set().union(*[q for _, q in resolve_named(model, e['pause'].get('mustNotName'))[0]]) & U) if e['pause'].get('mustNotName') else []
                    ok = ok and not bad_named
                    row.update({'unknownQuestions': sorted(U), 'unknownPatientProjections': sorted(P), 'mode': mode, 'ok': ok})
                    if not ok:
                        res.fail(suite, cid, 'CRE pause mismatch', {'produced': produced, 'unknown': sorted(U), 'named': [n for n, _ in groups],
                                                                    'mode': mode, 'mustNotNameHit': bad_named, 'problems': probs})
                if not execution_ok:
                    row['ok'] = False
                    res.fail(suite, cid, 'CRE evaluation returned an incomplete run')
                row['source'] = st['dir']
                rows.append(row)
            for (s, cid) in orc:
                if s == suite and cid not in seen:
                    res.fail(suite, cid, 'not-run in CRE')
            res.data.setdefault('sources', {}).setdefault(suite, []).append({'stage': st['stage'], 'dir': st['dir'], 'responseSha256': call['sha256']})
    res.data['rows'] = rows
    return res


# ---------------- native ----------------
def _is_apply(req, package):
    a = (req.get('request') or {}).get('arguments') or []
    return (len(a) >= 3 and '-Dloader.main=ApplyDriver' in a and a[-2] == package and str(a[-1]).startswith('Patient/'))


def exchanges(obs_dir, package, res, where):
    out = {}
    for rq in sorted(Path(obs_dir).glob('*.request.json')):
        stem = str(rq)[:-len('.request.json')]
        req = read_json(rq)
        if not _is_apply(req, package):
            continue
        a = req['request']['arguments']
        subj = a[-1]
        if not Path(stem + '.repository.json').exists():
            res.fail(where, subj, '$apply exchange without repository capture')
            continue
        try:
            payload = json.loads(base64.b64decode(req['args'][-1]).decode('utf-8'))
            same = payload.get('arguments') == a and payload.get('token') == req['request'].get('token')
        except Exception:
            same = False
        ex = read_json(stem + '.exit.json') if Path(stem + '.exit.json').exists() else {}
        stdout = Path(stem + '.stdout.txt').read_text(encoding='utf-8', errors='replace') if Path(stem + '.stdout.txt').exists() else ''
        stderr = Path(stem + '.stderr.txt').read_text(encoding='utf-8', errors='replace') if Path(stem + '.stderr.txt').exists() else ''
        plines = [l for l in stdout.splitlines() if l.startswith('{"resourceType":"Parameters"')]
        params = None
        if len(plines) == 1:
            try:
                params = json.loads(plines[0])
            except json.JSONDecodeError:
                params = None
        token = req['request'].get('token')
        rec = {'stem': stem, 'subject': subj, 'payloadMatches': same, 'exit': ex.get('code'), 'paramLines': len(plines), 'params': params,
               'cleanup': f'CRL_JOB_DONE:{token}:exit:confirmed:0' in stderr.splitlines(), 'repository': stem + '.repository.json'}
        if subj in out:
            res.fail(where, subj, 'two $apply exchanges for one compartment')
            continue
        out[subj] = rec
    return out


def check_native(ctx, model, parsed=None):
    res = Result('native')
    orc, parsed = oracle(ctx), parsed or cel_suites(ctx)
    ev, art = ctx['evidence'], Path(ctx['artifact'])
    rows, native_outcomes = [], {}
    for suite, stage_name in (('mv', 'native'), ('regression', 'controls')):
        stages = ev.stage(stage_name)
        if len(stages) != 1:
            res.fail('coverage', suite, f'expected exactly one {stage_name} stage, found {len(stages)}')
            continue
        st = stages[0]
        root = art if suite == 'mv' else Path(st['summary'].get('fixture') or st['stageDir'] / 'fixture')
        call = [c for c in st['calls'] if c['name'] == 'emit_results']
        if len(call) != 1:
            res.fail(suite, 'emit_results call missing')
            continue
        emit = call[0]['body'] or {}
        dman = read_json(root / 'tests/data/fhir/cel-data-manifest.json')
        rman = read_json(root / 'tests/results/questionnaire-manifest-mv.json')
        cids = [c['id'] for c in parsed[suite]['cases']]
        disp = {c['id']: c['display'] for c in parsed[suite]['cases']}
        dm = {c['caseId']: c for c in dman.get('cases', [])}
        rm = {c['caseId']: c for c in rman.get('cases', [])}
        er = {}
        for c in emit.get('cases', []) or []:
            er.setdefault(c.get('caseName'), []).append(c)
        if len(dm) != len(dman.get('cases', [])) or len(rm) != len(rman.get('cases', [])):
            res.fail(suite, 'duplicate caseId rows in a manifest')
        if set(dm) != set(cids) or set(rm) != set(cids):
            res.fail(suite, 'manifest case inventory != CEL', sorted(set(cids) ^ set(dm)), sorted(set(cids) ^ set(rm)))
        comp = {}
        for cid in cids:
            if cid in dm and cid in rm:
                if dm[cid]['compartmentDir'] != rm[cid]['compartmentDir']:
                    res.fail(suite, cid, 'data/results manifests disagree on compartment')
                comp[cid] = 'Patient/' + dm[cid]['compartmentDir'].rstrip('/').split('/')[-1]
        if len(set(comp.values())) != len(comp):
            res.fail(suite, 'compartment map is not one-to-one')
        exs = exchanges(st['stageDir'] / 'observed', model.name, res, suite)
        extra = sorted(set(exs) - set(comp.values()))
        if extra:
            res.fail(suite, 'observed $apply exchanges for unknown compartments', len(extra))
        for cid in cids:
            e = orc[(suite, cid)]
            where = f'{suite}/{cid}'
            x = exs.get(comp.get(cid))
            row = {'suite': suite, 'caseId': cid, 'expected': e['expect']}
            rows.append(row)
            if x is None:
                res.fail(where, 'not-run natively (no $apply exchange)')
                row['ok'] = False
                continue
            checks = {'payloadMatchesArgs': x['payloadMatches'], 'exit0': x['exit'] == 0, 'cleanupMarker': x['cleanup'],
                      'oneParametersLine': x['paramLines'] == 1 and x['params'] is not None}
            rs = list(walk_resources(x['params'])) if x['params'] else []
            by = {}
            for r in rs:
                by.setdefault(r['resourceType'], []).append(r)
            leaves = by.get('CommunicationRequest', []) + by.get('Task', [])
            srs = by.get('ServiceRequest', [])
            oo = [i for r in by.get('OperationOutcome', []) for i in r.get('issue', []) if i.get('severity') in ('error', 'fatal')]
            qs, qrs = by.get('Questionnaire', []), by.get('QuestionnaireResponse', [])
            no_form_terminal = not qs and not qrs and e['expect'] != 'pause'
            checks.update({'noServiceRequest': not srs, 'noErrorOutcome': not oo,
                           'questionnaireShape': no_form_terminal or (len(qs) == 1 and len(qrs) == 1),
                           'expectedForm': e.get('form', 'generated') == ('none' if no_form_terminal else 'generated')})
            case = next(c for c in parsed[suite]['cases'] if c['id'] == cid)
            decision_name = (case.get('result') or {}).get('decision')
            graph_checks, acts, orphans = disposition_chain(by.get('RequestGroup', []), leaves, model,
                                                              model.entry_for_decision(decision_name))
            checks.update(graph_checks)
            row['orphanDispositionResources'] = orphans
            row['activities'] = [a['key'] for a in acts]
            if e['expect'] in ('pause', 'none'):
                checks['noActivity'] = not leaves and not acts
                if e['expect'] == 'none':
                    checks['noDeterminationResources'] = no_determination_resources(by)
            else:
                key = model.key_for_label(e['expect'])
                ad = model.ad.get(key, {})
                checks['exactlyOneActivity'] = len(leaves) == 1 and len(acts) == 1
                if acts:
                    a = acts[0]
                    checks.update({'activityKey': a['key'] == key, 'chainResolved': a['resolved'], 'recommendationCanonical': a['canonical'],
                                   'recommendationResourceType': a['resourceType'] == ad.get('kind') == DETERMINATION_RESOURCE_TYPE,
                                   'payloadLabel': a['label'] == model.package_keys.get(key),
                                   'reasonCodes': a['x12'] == ad.get('reasonCodes')})
            native_outcomes[(suite, cid)] = ((e['expect'] if e['expect'] in ('pause', 'none') else 'unreached')
                                             if not acts and not leaves else (acts[0]['key'] if len(acts) == 1 else 'multiple'))
            ms = rm.get(cid, {})
            if len(qs) == 1 and len(qrs) == 1:
                q, qr = qs[0], qrs[0]
                checks['runtimeQCanonical'] = q.get('url') == f'{model.base}Questionnaire/{model.name}'
                checks['qrQuestionnaireMatchesQ'] = str(qr.get('questionnaire', '')).split('|')[0] == q.get('url')
                qitems = [(it, par) for it, par in flat_items(q.get('item')) if it.get('type') not in ('group', 'display')]
                ritems = [it for it, _ in flat_items(qr.get('item'))]
                qkeys = [(it.get('linkId'), it.get('definition')) for it, _ in qitems]
                checks['uniqueQItems'] = len(set(qkeys)) == len(qkeys) and len({k[0] for k in qkeys}) == len(qkeys)
                checks['uniqueQRLinkIds'] = len({r.get('linkId') for r in ritems}) == len(ritems)
                checks['noUnassociatedQRAnswers'] = all((r.get('linkId'), r.get('definition')) in set(qkeys) for r in ritems if r.get('answer'))
                concepts_seen = [model.concept_of_definition(it.get('definition')) for it, _ in qitems]
                checks['oneItemPerConcept'] = len([c for c in concepts_seen if c]) == len({c for c in concepts_seen if c})
                # the runtime pair must equal the saved pair emit_results wrote (items and answers), D4 canonicals aside
                saved = {a['resourceType']: root / a['path'] for a in ms.get('artifacts') or []}
                if 'Questionnaire' in saved and 'QuestionnaireResponse' in saved and saved['Questionnaire'].exists() and saved['QuestionnaireResponse'].exists():
                    sq, sqr = read_json(saved['Questionnaire']), read_json(saved['QuestionnaireResponse'])
                    shape = lambda items: sorted((str(it.get('linkId')), str(it.get('definition')), str(it.get('type')), json.dumps(it.get('answerOption'), sort_keys=True), str(it.get('answerValueSet'))) for it, _ in flat_items(items))
                    ans = lambda items: sorted((it.get('linkId'), json.dumps(it.get('answer'), sort_keys=True)) for it, _ in flat_items(items))
                    checks['runtimeEqualsSavedPair'] = shape(q.get('item')) == shape(sq.get('item')) and ans(qr.get('item')) == ans(sqr.get('item'))
                else:
                    checks['runtimeEqualsSavedPair'] = False
                present, unanswered, answered = set(), set(), {}
                for it, _ in qitems:
                    concept = model.concept_of_definition(it.get('definition'))
                    if concept is None:
                        checks['itemDefinitionsResolve'] = False
                        continue
                    present.add(concept)
                    resp = [r for r in ritems if r.get('linkId') == it.get('linkId') and r.get('definition') == it.get('definition')]
                    if len(resp) > 1:
                        checks['qrJoinUnique'] = False
                    v = answer_value(resp[0].get('answer')) if resp else None
                    if v is None:
                        unanswered.add(concept)
                    else:
                        answered[concept] = v
                facts = case_answers(parsed[suite], next(c for c in parsed[suite]['cases'] if c['id'] == cid), model, res, where)
                # an answer with no CEL fact is legitimate only for a question that also has a Patient projection
                # (prepopulated from the birth date); its value is not recomputed here (reported as a limitation)
                derived = sorted(c for c in answered if c not in facts and model.concepts.get(c, {}).get('patientProjection'))
                if derived:
                    row['projectionDerivedAnswers'] = derived
                    res.limit(where, 'answer prepopulated from a Patient projection; value not recomputed', derived)
                mism = sorted(c for c, v in answered.items() if c not in derived and (c not in facts or not matches(facts[c], v, model.base, model.concepts.get(c, {}).get("valueTypes"))))
                missing = sorted(c for c in facts if c in present and c not in answered)
                not_on_route = sorted(c for c in facts if c not in present)
                if not_on_route:
                    row['factsNotAskedOnRoute'] = not_on_route  # data supplied, question not generated for this route
                    res.limit(where, 'facts whose question the route did not ask (D12)', not_on_route)
                checks['qrAnswersEqualCelFacts'] = not mism and not missing
                if mism or missing:
                    row['answerProblems'] = {'mismatchOrInvented': mism, 'askedButUnanswered': missing}
                if e['expect'] == 'pause':
                    groups, probs = resolve_named(model, e['pause']['questions'])
                    not_asked = [n for n, qset in groups if not (qset & present)]
                    hit = [bool(qset & unanswered) for _, qset in groups]
                    mode = e['pause']['mode']
                    # anyOf: at least one named question asked (the runtime Q may ask only the next one on the route);
                    # allOf/exactly: every named question asked
                    asked_ok = (len(not_asked) < len(groups)) if mode == 'anyOf' else not not_asked
                    checks['pauseQuestionsAsked'] = asked_ok and not probs
                    checks['pauseQuestionsUnanswered'] = any(hit) if mode == 'anyOf' else all(hit)
                    row.update({'unansweredQuestions': sorted(unanswered), 'notAsked': not_asked})
                    if mode == 'exactly' or e['pause'].get('mustNotName'):
                        res.limit(where, 'native checks `exactly` as allOf and cannot evaluate mustNotName; both are enforced by CRE only (D1)')
            elif e['expect'] == 'pause':
                checks['pauseQuestionsAsked'] = False
            if no_form_terminal:
                facts = case_answers(parsed[suite], next(c for c in parsed[suite]['cases'] if c['id'] == cid), model, res, where)
                if facts:
                    row['factsNotAskedOnRoute'] = sorted(facts)
                    res.limit(where, 'terminal produced no questionnaire though the case supplies question-concept facts', sorted(facts))
            # manifest states + saved pair
            arts = ms.get('artifacts') or []
            wanted_state = 'no-questionnaire' if no_form_terminal else 'generated'
            checks['manifestState'] = ms.get('state') == wanted_state and [c.get('state') for c in er.get(disp[cid], [])] == [wanted_state]
            checks['savedPairHashes'] = (not arts if no_form_terminal else
                len(arts) == 2 and {a.get('resourceType') for a in arts} == {'Questionnaire', 'QuestionnaireResponse'}
                and all((root / a['path']).exists() and sha_file(root / a['path']) == a['sha256'] for a in arts))
            row['noQuestionnaireTerminal'] = no_form_terminal and all(checks.values())
            row['checks'] = checks
            row['ok'] = all(checks.values())
            row['rawStdoutSha256'] = sha_file(x['stem'] + '.stdout.txt')
            if not row['ok']:
                res.fail(where, 'native', sorted(k for k, v in checks.items() if not v), row.get('answerProblems'))
        res.data.setdefault('sources', {})[suite] = {'dir': st['dir'], 'stage': stage_name, 'root': str(root)}
    res.data['rows'] = rows
    ctx['nativeOutcomes'] = native_outcomes
    ctx['nativeRows'] = {(r['suite'], r['caseId']): r for r in rows}
    ctx['nativeExchanges'] = {}
    return res


def request_matches(fact, resource, subject_reference):
    resource_type = fact.get('resourceType')
    field = {'MedicationRequest': 'medicationCodeableConcept', 'ServiceRequest': 'code'}.get(resource_type)
    if not field or resource.get('resourceType') != resource_type:
        return False
    coding = (resource.get(field) or {}).get('coding') or []
    return (len(coding) == 1 and isinstance(coding[0], dict)
            and {k: coding[0].get(k) for k in ('system', 'code')} == fact['requestCode']
            and resource.get('authoredOn') == fact.get('date')
            and (resource.get('subject') or {}).get('reference') == subject_reference
            and resource.get('status') == 'active' and resource.get('intent') == 'order')


# ---------------- casedata ----------------
def check_casedata(ctx, model, parsed=None):
    res = Result('casedata')
    parsed = parsed or cel_suites(ctx)
    ev, art = ctx['evidence'], Path(ctx['artifact'])
    rows = []
    for suite, stage_name in (('mv', 'native'), ('regression', 'controls')):
        st = (ev.stage(stage_name) or [None])[0]
        root = art if suite == 'mv' else (Path(st['summary'].get('fixture') or st['stageDir'] / 'fixture') if st else None)
        if root is None:
            res.fail('coverage', suite, 'no data tree')
            continue
        D = root / 'tests/data/fhir'
        man = read_json(D / 'cel-data-manifest.json')
        listed = set()
        exs = exchanges(st['stageDir'] / 'observed', model.name, Result('scratch'), suite) if st else {}
        cases = {c['id']: c for c in parsed[suite]['cases']}
        for row in man.get('cases', []):
            cid = row['caseId']
            where = f'{suite}/{cid}'
            c = cases.get(cid)
            if c is None:
                res.fail(where, 'data manifest case not in CEL')
                continue
            resources = []
            for a in row.get('artifacts', []):
                p = D / a['path']
                listed.add(norm(p))
                if not p.exists() or sha_file(p) != a['sha256']:
                    res.fail(where, 'data file missing or hash mismatch', a['path'])
                    continue
                r = read_json(p)
                if r.get('id') != a.get('id') or r.get('resourceType') != a.get('resourceType'):
                    res.fail(where, 'data file identity mismatch', a['path'])
                resources.append(r)
            pats = [r for r in resources if r['resourceType'] == 'Patient']
            obs = [r for r in resources if r['resourceType'] == 'Observation']
            requests = [r for r in resources if r['resourceType'] in ('MedicationRequest', 'ServiceRequest')]
            if len(pats) != 1 or len(resources) != 1 + len(obs) + len(requests):
                res.fail(where, 'resource kinds', sorted(r['resourceType'] for r in resources))
                continue
            subj = parsed[suite]['facts'].get(c['subject']) if c['subject'] else None
            if pats[0].get('birthDate') != (subj or {}).get('birthDate'):
                res.fail(where, 'birthDate differs from the subject fact')
            ref = 'Patient/' + pats[0]['id']
            need = [(parsed[suite]['facts'][f]) for f in c['facts']]
            request_facts = [f for f in need if 'resourceType' in f]
            need = [f for f in need if 'resourceType' not in f]
            remaining_requests = list(request_facts)
            for request in requests:
                hits = [f for f in remaining_requests if request_matches(f, request, ref)]
                if hits:
                    remaining_requests.remove(hits[0])
                else:
                    res.fail(where, 'request does not equal a CEL fact', request.get('id'))
            if remaining_requests or len(requests) != len(request_facts):
                res.fail(where, 'request inventory differs', {'data': len(requests), 'cel': len(request_facts), 'unmatched': len(remaining_requests)})
            remaining = list(need)
            seen = []
            for o in obs:
                prof = (o.get('meta', {}).get('profile') or [None])[0]
                concept = model.sd.get(prof)
                val = next(((k, o[k]) for k in ('valueBoolean', 'valueCodeableConcept', 'valueQuantity', 'valueDecimal', 'valueInteger', 'valueDateTime', 'valueString') if k in o), None)
                hit = [f for f in remaining if f['concept'] == concept and f.get('date') == o.get('effectiveDateTime') and matches(f['value'], val, model.base, model.concepts.get(concept, {}).get('valueTypes'))]
                if hit:
                    remaining.remove(hit[0])  # consume: each fact is matched by exactly one observation
                ok = bool(hit) and o.get('subject', {}).get('reference') == ref and o.get('status') == 'final'
                if not ok:
                    res.fail(where, 'observation does not equal a CEL fact', concept)
                seen.append(concept)
            if sorted(seen) != sorted(f['concept'] for f in need):
                res.fail(where, 'answer inventory differs', {'data': sorted(seen), 'cel': sorted(f['concept'] for f in need)})
            x = exs.get('Patient/' + row['compartmentDir'].rstrip('/').split('/')[-1])
            repo_eq = None
            if x:
                rep = read_json(x['repository'])
                look = {(e['resource']['resourceType'], e['resource']['id']): e['resource'] for e in rep.get('entry', []) if 'resource' in e}
                repo_eq = all(look.get((r['resourceType'], r['id'])) == r for r in resources)
                if not repo_eq:
                    res.fail(where, 'data differs from the native input repository')
            rows.append({'suite': suite, 'caseId': cid, 'resources': len(resources), 'nativeRepositoryEqual': repo_eq})
        actual = {norm(p) for p in (D / 'patient').rglob('*.json')} if (D / 'patient').exists() else set()
        if actual != listed:
            res.fail(suite, 'unlisted or missing data files', len(actual ^ listed))
    res.data['rows'] = rows
    return res


# ---------------- assoc ----------------
def association(q, qr, model):
    probs, answers = [], {}
    qi = list(flat_items(q.get('item')))
    ri = [x for x, _ in flat_items(qr.get('item'))]
    if len({x['linkId'] for x, _ in qi}) != len(qi):
        probs.append('duplicate Q linkId')
    if len({x['linkId'] for x in ri}) != len(ri):
        probs.append('duplicate QR linkId')
    per = {}
    texts = {k: v['text'] for k, v in model.presentations.items() if v.get('text')}
    for it, par in qi:
        if it.get('type') in ('group', 'display'):
            continue
        d = it.get('definition')
        concept = model.concept_of_definition(d)
        if concept is None:
            probs.append(('non-exact or unknown definition', it.get('linkId')))
            continue
        per.setdefault(concept, []).append((it, par))
    for concept, lst in per.items():
        if len(lst) != 1:
            probs.append(('duplicate answer association', concept, len(lst)))
            continue
        it, par = lst[0]
        want = (model.presentations.get(concept) or {}).get('text')
        groups = [g for g, _ in qi if g.get('type') == 'group' and g.get('definition') and model.concept_of_definition(g['definition'] + ('' if g['definition'].endswith(SUFFIX) else SUFFIX)) == concept]
        owner = groups[0] if len(groups) == 1 and groups[0] in par else it
        if want is not None and owner.get('text') != want:
            probs.append(('wording', concept))
        for p in par:
            if p is not owner and p.get('text') in {t for k, t in texts.items() if k != concept}:
                probs.append(('borrowed ancestor wording', concept))
        resp = [r for r in ri if r.get('linkId') == it['linkId'] and r.get('definition') == it.get('definition')]
        if len(resp) > 1:
            probs.append(('QR join not unique', concept))
        answers[concept] = {'item': it, 'answer': answer_value(resp[0].get('answer')) if resp else None}
    qkeys = {(x['linkId'], x.get('definition')) for x, _ in qi}
    for r in ri:
        if r.get('answer') and (r.get('linkId'), r.get('definition')) not in qkeys:
            probs.append(('unassociated QR answer', r.get('linkId')))
    return probs, answers


def _mutations(q, qr, model):
    """Built-in controls that MUST be rejected (located by content, not index)."""
    items = [(it, par) for it, par in flat_items(q.get('item')) if it.get('type') not in ('group', 'display') and model.concept_of_definition(it.get('definition'))]
    if not items:
        return []
    it0 = items[0][0]
    out = []
    m1 = copy.deepcopy(q)
    dup = copy.deepcopy(it0)
    dup['linkId'] = it0['linkId'] + '-dup'
    m1['item'] = (m1.get('item') or []) + [dup]
    out.append(('duplicate-answer', m1, qr))
    m2 = copy.deepcopy(q)
    for it, _ in flat_items(m2.get('item')):
        if it.get('linkId') == it0['linkId']:
            it['definition'] = it['definition'].replace('StructureDefinition/', 'StructureDefinition/decoy-')
    out.append(('decoy-definition', m2, qr))
    other = [t['text'] for k, t in model.presentations.items() if t.get('text') and k != model.concept_of_definition(it0.get('definition'))]
    if other:
        m3 = copy.deepcopy(q)
        m3['item'] = [{'linkId': 'g-borrow', 'type': 'group', 'text': other[0], 'item': m3.get('item') or []}]
        out.append(('borrowed-wording', m3, qr))
    return out


TYPE_OF = {'boolean': ('boolean',), 'quantity': ('quantity',), 'coding': ('choice', 'open-choice', 'coding'), 'date': ('date',), 'dateTime': ('dateTime',), 'integer': ('integer',), 'string': ('string',)}


def check_assoc(ctx, model):
    res = Result('assoc')
    orc_alias = ctx['freeze']['expectationsContent'].get('questions', {}) or {}
    amap = ctx['aliases']
    art, ev = Path(ctx['artifact']), ctx['evidence']
    pairs = []
    for suite, stage_name in (('mv', 'native'), ('regression', 'controls')):
        st = (ev.stage(stage_name) or [None])[0]
        root = art if suite == 'mv' else (Path(st['summary'].get('fixture') or st['stageDir'] / 'fixture') if st else None)
        if root is None:
            continue
        man = read_json(root / 'tests/results/questionnaire-manifest-mv.json')
        for c in man.get('cases', []):
            by = {a['resourceType']: root / a['path'] for a in c.get('artifacts', [])}
            if 'Questionnaire' in by and 'QuestionnaireResponse' in by:
                pairs.append((suite, c['caseId'], read_json(by['Questionnaire']), read_json(by['QuestionnaireResponse'])))
            elif (c.get('state') == 'no-questionnaire' and not c.get('artifacts')
                  and ctx.get('nativeRows', {}).get((suite, c['caseId']), {}).get('noQuestionnaireTerminal') is True):
                res.data.setdefault('verifiedNoQuestionnaireCases', []).append(f'{suite}/{c["caseId"]}')
            else:
                res.fail(f'{suite}/{c["caseId"]}', 'saved Q/QR pair incomplete or no-questionnaire outcome unverified')
    coding_contracts = orc_alias.get('optionCodings') or {}
    observed_codings = set()
    not_asked = {(tuple(amap[a])) : set() for a in amap}
    for concept, al in (orc_alias.get('notAskedIn') or {}).items():
        for a in al:
            not_asked[tuple(amap[a])].add(concept)
    asked = {}
    for concept, al in (orc_alias.get('askedIn') or {}).items():
        for a in al:
            asked.setdefault(tuple(amap[a]), set()).add(concept)
    exact = {tuple(amap[a]): set(names) for a, names in (orc_alias.get('exactIn') or {}).items()}
    observed_pairs = set()
    res.data['exactQuestionsChecked'] = []
    res.data['requiredQuestionsChecked'] = []
    for suite, cid, q, qr in pairs:
        where = f'{suite}/{cid}'
        observed_pairs.add((suite, cid))
        probs, answers = association(q, qr, model)
        for p in probs:
            res.fail(where, 'association', p)
        if (suite, cid) in exact:
            wanted = exact[(suite, cid)]
            actual = set(answers)
            missing, extra = sorted(wanted - actual), sorted(actual - wanted)
            res.data['exactQuestionsChecked'].append({'case': where, 'expected': sorted(wanted),
                'actual': sorted(actual), 'missing': missing, 'extra': extra})
            if missing or extra:
                res.fail(where, 'exact question membership differs', {'missing': missing, 'extra': extra})
        for concept in orc_alias.get('forbidden') or []:
            if concept in answers:
                res.fail(where, 'forbidden question asked', concept)
        for concept, codes in (orc_alias.get('options') or {}).items():
            if concept in answers:
                item = answers[concept]['item']
                choices = item.get('answerOption') or []
                if item.get('answerValueSet'):
                    res.fail(where, 'answer options unresolved answerValueSet', concept)
                    continue
                if not isinstance(choices, list) or any(not isinstance(o, dict) or not isinstance(o.get('valueCoding'), dict) or not isinstance(o['valueCoding'].get('code'), str) for o in choices):
                    res.fail(where, 'malformed coded answer option', concept)
                    continue
                got = sorted(o['valueCoding']['code'] for o in choices)
                if got != sorted(codes):
                    res.fail(where, 'answer options differ', concept, {'got': got, 'want': sorted(codes)})
        for concept, expected in coding_contracts.items():
            if concept in answers:
                observed_codings.add(concept)
                error = compare_option_codings(answers[concept]['item'], expected)
                if error:
                    res.fail(where, 'answer coding contract', concept, error)
        for concept, t in (orc_alias.get('types') or {}).items():
            if concept in answers and answers[concept]['item'].get('type') not in TYPE_OF[t]:
                res.fail(where, 'question type differs', concept, answers[concept]['item'].get('type'), t)
        for concept in not_asked.get((suite, cid), ()):
            if concept in answers:
                res.fail(where, 'question asked where the oracle says it is not', concept)
        for concept in sorted(asked.get((suite, cid), ())):
            present = concept in answers
            res.data['requiredQuestionsChecked'].append({'case': where, 'concept': concept, 'present': present})
            if not present:
                res.fail(where, 'required question absent', concept)
    for key in sorted(set(asked) - observed_pairs):
        for concept in sorted(asked[key]):
            res.fail('/'.join(key), 'required question has no saved Q/QR evidence', concept)
            res.data['requiredQuestionsChecked'].append({'case': '/'.join(key), 'concept': concept, 'present': False})
    verified_empty = set(res.data.get('verifiedNoQuestionnaireCases', []))
    for key in sorted(set(exact) - observed_pairs):
        where = '/'.join(key)
        verified = where in verified_empty
        res.data['exactQuestionsChecked'].append({'case': where, 'expected': sorted(exact[key]),
            'actual': [] if verified else None, 'verifiedNoForm': verified})
        if not verified:
            res.fail(where, 'exact question membership has no verified Q/QR or no-form evidence')
        elif exact[key]:
            res.fail(where, 'exact question membership differs', {'missing': sorted(exact[key]), 'extra': []})
    for concept in sorted(set(coding_contracts) - observed_codings):
        res.fail('answer coding contract', concept, 'required vocabulary was never observed in native forms')
    res.data['optionCodingsObserved'] = sorted(observed_codings)
    res.data['nativeEvidenceSources'] = {s: [str(x['dir']) for x in ev.stage(stage)] for s, stage in (('mv', 'native'), ('regression', 'controls'))}
    # authored wording + descriptions on the emitted cpg-input-text / cpg-input-description (right owner, 183-R14)
    for concept, pres in model.presentations.items():
        if model.concepts.get(concept, {}).get('kind') != 'question':
            continue
        urls = model.sd_by_title.get(concept, [])
        if not urls or not any(model.inputs.get(u) for u in urls):
            res.fail('emitted input', concept, 'authored question has no emitted PlanDefinition input (text/description owner missing)')
        for url in urls:
            got = model.inputs.get(url, [])
            if not got:
                continue
            if any(g['text'] != pres.get('text') for g in got):
                res.fail('emitted input', concept, 'cpg-input-text differs from the authored question text')
            if pres.get('description') and any(g['description'] != pres['description'] for g in got):
                res.fail('emitted input', concept, 'cpg-input-description missing or differs from the authored description')
    controls = []
    if pairs:
        _, _, q0, qr0 = pairs[0]
        for name, mq, mqr in _mutations(q0, qr0, model):
            p, _ = association(mq, mqr, model)
            controls.append({'control': name, 'rejected': bool(p)})
            if not p:
                res.fail('control', name, 'mutation control was NOT rejected: checker cannot fail')
    res.data.update({'pairs': len(pairs), 'controls': controls})
    return res
