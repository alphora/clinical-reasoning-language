"""trees, outcome, conjuncts, final, disagreements (DESIGN §6)."""
import itertools
import re
from pathlib import Path

from . import ledger
from .checks_exec import cel_suites, oracle
from .util import GEN, OUTCOMES, X12_BY_ACTIVITY, DETERMINATION_RESOURCE_TYPE, Result, canonical, norm, read_json, rel_posix, sha_bytes, sha_file, walk_files

AUTHORED_KINDS = ('.crl', '.cel', '.docx', '.txt', '.provenance.json')


def _fixture(ctx):
    st = (ctx['evidence'].stage('controls') or [None])[0]
    return Path(st['summary'].get('fixture') or st['stageDir'] / 'fixture') if st else None


# ---------------- trees ----------------
def result_artifacts(ctx, manifest, res):
    """Inventory saved MV pairs; no-form absence requires verified native completion."""
    expected = {cid: e for (suite, cid), e in oracle(ctx).items() if suite == 'mv'}
    rows = manifest.get('cases')
    if not isinstance(rows, list):
        res.fail('result manifest', 'cases must be a list')
        return []
    seen, paths, artifacts = set(), set(), []
    for row in rows:
        if not isinstance(row, dict):
            res.fail('result manifest', 'case must be an object')
            continue
        cid = row.get('caseId')
        if not isinstance(cid, str) or cid not in expected or cid in seen:
            res.fail('result manifest', 'missing, duplicate or unexpected case identity', cid)
            continue
        seen.add(cid)
        arts = row.get('artifacts')
        e = expected[cid]
        if row.get('state') == 'no-questionnaire':
            native = ctx.get('nativeRows', {}).get(('mv', cid), {})
            if (e.get('form') != 'none' or e.get('expect') not in (*OUTCOMES, 'none')
                    or arts not in (None, [])
                    or native.get('ok') is not True
                    or native.get('noQuestionnaireTerminal') is not True):
                res.fail('result manifest', cid, 'no questionnaire lacks expected successful native terminal')
            continue
        if (row.get('state') != 'generated' or e.get('form', 'generated') != 'generated'
                or not isinstance(arts, list) or len(arts) != 2
                or any(not isinstance(a, dict) for a in arts)
                or {a.get('resourceType') for a in arts} != {'Questionnaire', 'QuestionnaireResponse'}):
            res.fail('result manifest', cid, 'expected generated Questionnaire/QuestionnaireResponse pair')
            continue
        for a in arts:
            path, digest = a.get('path'), a.get('sha256')
            if (not isinstance(path, str) or not path.startswith('tests/results/')
                    or '\\' in path or any(x in ('', '.', '..') for x in path.split('/'))
                    or ':' in path or path.casefold() in paths
                    or not isinstance(digest, str) or not re.fullmatch(r'[0-9a-f]{64}', digest)):
                res.fail('result manifest', cid, 'invalid or duplicate artifact path/hash')
                continue
            paths.add(path.casefold())
            artifacts.append(a)
    if seen != set(expected):
        res.fail('result manifest', 'missing cases', sorted(set(expected) - seen))
    return artifacts


def check_trees(ctx, model, backtest=False):
    res = Result('trees')
    art, ws = Path(ctx['artifact']), Path(ctx['ws'])
    after = walk_files(art)
    pre_p = Path(ctx['manifest']['preEmitInventory']['path'])
    pre = None
    if pre_p.exists():
        inv = read_json(pre_p)
        if norm(inv.get('root')) == norm(art):
            pre = {f['path']: f['sha256'] for f in inv.get('files', [])}
    if pre is None:
        (res.limit if backtest else res.fail)('pre-emit inventory unusable for authored-change reporting')
    # producer-owned trees == what producers wrote
    emit = [c for st in ctx['evidence'].stage('emit') for c in st['calls'] if c['name'] == 'emit_crl']
    if len(emit) != 1:
        res.fail('emit', f'expected one emit_crl call, found {len(emit)}')
        written = None
    else:
        w = (emit[0]['body'] or {}).get('written') or {}
        written = {rel_posix(p, art) for k in ('cql', 'fhir') for p in w.get(k, [])}
    dman = read_json(art / 'tests/data/fhir/cel-data-manifest.json')
    rman = read_json(art / 'tests/results/questionnaire-manifest-mv.json')
    data = {'tests/data/fhir/cel-data-manifest.json'} | {'tests/data/fhir/' + a['path'] for c in dman['cases'] for a in c['artifacts']}
    result_files = result_artifacts(ctx, rman, res)
    results = {'tests/results/questionnaire-manifest-mv.json'} | {a['path'] for a in result_files}
    actual = {g: {p for p in after if p.startswith(g)} for g in GEN}
    cmp = {'tests/data/fhir/': data, 'tests/results/': results}
    if written is not None:
        cmp['src/'] = written
        actual['src/'] = actual['src/cql/'] | actual['src/fhir/']
    for g, want in cmp.items():
        miss, extra = sorted(want - actual[g]), sorted(actual[g] - want)
        if miss or extra:
            res.fail('producer tree', g, {'missing': miss[:10], 'extra': extra[:10], 'counts': [len(miss), len(extra)]})
    bad_hash = [a['path'] for c in dman['cases'] for a in c['artifacts'] if after.get('tests/data/fhir/' + a['path']) != a['sha256']]
    bad_hash += [a['path'] for a in result_files if after.get(a['path']) != a['sha256']]
    if bad_hash:
        res.fail('manifest hash mismatch', bad_hash[:10])
    inside = sorted(p for p in after if p.startswith(GEN) and p.endswith(AUTHORED_KINDS))
    if inside:
        res.fail('authored file kinds inside producer trees', inside[:10])
    # authored changes are REPORTED (183-R15/184-F), never passed by exemption
    changes = []
    if pre is not None:
        for p in sorted(set(pre) | set(after)):
            if p.startswith(GEN):
                continue
            if pre.get(p) != after.get(p):
                changes.append({'path': p, 'before': pre.get(p), 'after': after.get(p)})
    res.data['authoredChanges'] = changes
    if changes:  # 182-R15: accepting an authored change is the lead's call, never a pass
        A, L = ledger.views(ws)
        ledger.resolve(res, 'trees|authored-changes', sha_bytes(canonical(changes).encode('utf-8')), A, L,
                       f'{len(changes)} authored file(s) changed after the pre-emit snapshot', art)
    # refined-source clarification invariant: prior anchor is a byte-identical prefix of the current anchor
    prior_dir = ws / 'inputs' / 'restricted' / 'prior-artifact' / 'src' / 'anchor-source'
    inv_rows = []
    for cur in sorted((art / 'src' / 'anchor-source').glob('*.txt')):
        old = prior_dir / cur.name
        if not old.exists():
            inv_rows.append({'anchor': cur.name, 'invariant': 'not-applicable (no prior anchor of that name)'})
            continue
        ob, nb = old.read_bytes(), cur.read_bytes()
        if ob == nb:
            inv_rows.append({'anchor': cur.name, 'invariant': 'unchanged'})
        elif nb.startswith(ob):
            inv_rows.append({'anchor': cur.name, 'invariant': 'prior anchor is a byte-identical prefix', 'appendedBytes': len(nb) - len(ob)})
        else:
            inv_rows.append({'anchor': cur.name, 'invariant': 'VIOLATED'})
            res.fail('anchor prefix invariant', cur.name, 'policy text changed, not only appended')
    res.data['anchorInvariant'] = inv_rows
    # regression fixture byte-identity
    fx = _fixture(ctx)
    if fx is not None:
        crl_a, crl_f = walk_files(art / 'src/crl'), walk_files(fx / 'src/crl')
        same = {'crl': crl_a == crl_f, 'package.json': sha_file(art / 'package.json') == sha_file(fx / 'package.json')}
        if (art / 'node_modules').exists():
            same['node_modules'] = walk_files(art / 'node_modules') == walk_files(fx / 'node_modules')
        reg = art / ctx['manifest']['files']['regression']['path']
        fcel = fx / 'src/cel/mv' / reg.name
        same['regressionCel'] = fcel.exists() and sha_file(fcel) == sha_file(reg)
        for k, v in same.items():
            if not v:
                res.fail('fixture not byte-identical', k)
        res.data['fixture'] = same
    res.data['counts'] = {g: len(v) for g, v in actual.items()}
    return res


# ---------------- outcome ----------------
def check_outcome(ctx, model):
    res = Result('outcome')
    keys = model.package_keys
    for k, label in keys.items():
        if OUTCOMES.get(label) != k:
            res.fail('package option outside the customer set', k, label)
    for a in model.activities_used:
        if a not in keys:
            res.fail('CRL recommends an activity outside the package options', a)
    for s, p in cel_suites(ctx).items():
        used = {c['result']['value'] for c in p['cases'] if c['result']} - {'pause'}
        if used - set(keys):  # vocabulary only; values stay quarantined in disagreements.json
            res.fail('CEL result keys outside the package options', s, f'{len(used - set(keys))} key(s)')
    for k in model.activities_used:
        ad = model.ad.get(k)
        if k in model.duplicate_ad_titles:
            res.fail('duplicate ActivityDefinition title for an activity the CRL recommends', k)
        if ad is None:
            res.fail('no ActivityDefinition for an activity the CRL recommends', k)
            continue
        if ad['label'] != keys.get(k):
            res.fail('ActivityDefinition disposition label differs from the package label', k, ad['label'])
        if ad['kind'] != DETERMINATION_RESOURCE_TYPE:
            res.fail('ActivityDefinition determination resource type differs from the customer binding', k, ad['kind'], DETERMINATION_RESOURCE_TYPE)
        if k in X12_BY_ACTIVITY and ad['x12'] != X12_BY_ACTIVITY[k]:
            res.fail('ActivityDefinition X12 code differs from the customer binding', k, ad['x12'], X12_BY_ACTIVITY[k])
    for k in model.ad:
        if k not in keys:
            res.fail('ActivityDefinition outside the package options', k)
    for (s, cid), out in (ctx.get('nativeOutcomes') or {}).items():
        if out == 'none' and oracle(ctx).get((s, cid), {}).get('expect') == 'none':
            continue
        if out not in keys and out != 'pause':
            res.fail('native activity outside the package options', f'{s}/{cid}', out)
    for f in sorted((Path(ctx['artifact']) / 'src/fhir').rglob('*.json')):
        d = read_json(f)
        url, rt = d.get('url'), d.get('resourceType')
        if url is None:
            continue
        if not url.startswith(model.base + f'{rt}/') or re.search(r'(?<!:)//', url):
            res.fail('canonical not under canonicalBase/<type>/', rel_posix(f, ctx['artifact']), url)
        for s in re.findall(r'"(https?://[^"]+)"', canonical(d)):
            if s.startswith(model.base) and re.search(r'(?<!:)//', s):
                res.fail('double slash in canonical reference', rel_posix(f, ctx['artifact']))
    src = set(ctx['freeze']['expectationsContent'].get('dispositions', []))
    used = {keys.get(a) for a in model.activities_used}
    res.data['fidelity'] = {'sourceExpected': sorted(src), 'crlUsed': sorted(x for x in used if x),
                            'finding': None if src == used else 'source-expected dispositions differ from those the CRL recommends'}
    if src != used:
        A, L = ledger.views(ctx['ws'])
        ledger.resolve(res, 'outcome|disposition-fidelity', sha_bytes(canonical(res.data['fidelity']).encode('utf-8')), A, L,
                       'source-expected dispositions differ from the CRL-recommended set (fidelity finding)', ctx['artifact'])
    return res


# ---------------- conjuncts ----------------
def _vector(parsed, case):
    v = {}
    for fn in case['facts']:
        f = parsed['facts'][fn]
        if 'resourceType' in f:
            v.setdefault('@request:' + f['resourceType'], []).append(canonical([f['requestCode'], f.get('date')]))
            continue
        v.setdefault(f['concept'], []).append(canonical([f['value'], f.get('date')]))
    out = {k: tuple(sorted(x)) for k, x in v.items()}
    subj = parsed['facts'].get(case['subject']) if case['subject'] else None
    out['@birthDate'] = (subj or {}).get('birthDate')
    return out


def check_conjuncts(ctx, model):
    res = Result('conjuncts')
    orc, parsed = oracle(ctx), cel_suites(ctx)
    nat = ctx.get('nativeOutcomes') or {}
    A, L = ledger.views(ctx['ws'])
    vecs = {(s, c['id']): _vector(parsed[s], c) for s in parsed for c in parsed[s]['cases']}
    out = []
    for cj in ctx['freeze']['expectationsContent'].get('conjuncts', []) or []:
        q, p, probs = model.answerable(cj['concept'])
        # a question with a Patient projection is also answerable from the birth date (D8)
        inputs = set(q) | ({'@birthDate'} if p or any(model.concepts.get(x, {}).get('patientProjection') for x in q) else set())
        row = {'name': cj['name'], 'concept': cj['concept'], 'inputs': sorted(inputs), 'problems': probs, 'proven': [], 'confounded': 0}
        if probs or not inputs:
            res.fail('conjunct', cj['name'], 'input set unresolved', probs)
        for a, b in itertools.combinations(sorted(vecs), 2):
            va, vb = vecs[a], vecs[b]
            diff = {k for k in set(va) | set(vb) if va.get(k) != vb.get(k)}
            if not diff or not (diff & inputs):
                continue
            if not diff <= inputs:
                row['confounded'] += 1
                continue
            ea, eb = orc[a]['expect'], orc[b]['expect']
            if ea == eb or 'pause' in (ea, eb) or 'none' in (ea, eb):
                continue
            if nat.get(a) == model.key_for_label(ea) and nat.get(b) == model.key_for_label(eb):
                row['proven'].append([f'{a[0]}/{a[1]}', f'{b[0]}/{b[1]}'])
        row['missingInputPauses'] = sorted(f'{k[0]}/{k[1]}' for k, v in vecs.items() if not (set(v) & inputs - {'@birthDate'}) and orc[k]['expect'] == 'pause')
        if not row['proven']:
            key, sha = f'conjunct|{cj["name"]}', ctx['freezeSha']
            claim = A.get((key, sha))
            if claim and claim['view'] == 'equivalent-proof':
                ledger.resolve(res, key, sha, A, L, 'executor claims an equivalent proof for an unwitnessed conjunct', ctx['artifact'])
            else:
                res.fail('conjunct', cj['name'], 'no proven witness pair')
        row['proven'] = row['proven'][:10]
        out.append(row)
    if not out:  # the executor named no source-required conjunct: the lead confirms the source has none
        ledger.resolve(res, 'conjuncts|none-named', ctx['freezeSha'], A, L, 'no conjuncts named in the frozen oracle', ctx['artifact'])
    zero = [[f'{a[0]}/{a[1]}', f'{b[0]}/{b[1]}'] for a, b in itertools.combinations(sorted(vecs), 2) if vecs[a] == vecs[b]]
    res.data.update({'conjuncts': out, 'zeroDifferencePairs': zero[:20], 'zeroDifferencePairCount': len(zero)})
    return res


# ---------------- final ----------------
def check_final(ctx, model):
    res = Result('final')
    A, L = ledger.views(ctx['ws'])
    art = Path(ctx['artifact'])
    want = {norm(art / ctx['manifest']['files'][s]['path']): s for s in ('mv', 'regression')}
    items, seen_keys, suites_seen = [], set(), set()
    for st in ctx['evidence'].stage('final'):
        for c in st['calls']:
            if c['name'] != 'validate_provenance':
                continue
            suite = want.get(norm(c['arguments'].get('cel')))
            if suite is None:
                res.fail('final', 'validate_provenance on a CEL that is not the frozen candidate')
                continue
            if suite in suites_seen:
                res.fail('final', suite, 'more than one validate_provenance call for this suite')
            suites_seen.add(suite)
            b = c['body'] or {}
            if not b.get('pass'):
                res.fail('final', suite, 'strict FINAL did not pass', {'errors': b.get('errorCount'), 'warnings': b.get('warningCount')})
            anchor = Path(c['arguments'].get('anchor', ''))
            ab = anchor.read_bytes() if anchor.exists() else b''
            for f in b.get('findings', []) or []:
                rng = f.get('range') or {}
                ident = f.get('itemId') or f.get('caseId') or f.get('ref') or (f'[{rng.get("start")},{rng.get("end")})' if rng else '?')
                key = f'final|{suite}|{f.get("kind")}|{ident}'
                seen_keys.add((key, c['sha256']))
                span = ab[rng['start']:rng['end']].decode('utf-8', 'replace') if rng and ab else None
                a = A.get((key, c['sha256']))
                l = L.get((key, c['sha256']))
                view = a['view'] if a else None
                if f.get('severity') == 'error':
                    res.fail('final', key, 'FINAL error')
                if view == 'earned':
                    state = 'earned'
                elif (state := ledger.decide(res, key, a, l, art)) is not None:
                    pass
                else:
                    state = 'needs-lead'
                    res.needs_lead.append([key, 'no executor view' if a is None else f'executor view: {view}'])
                items.append({'key': key, 'responseSha256': c['sha256'], 'severity': f.get('severity'), 'scrutiny': f.get('scrutiny'),
                              'span': span, 'view': view, 'state': state})
    for suite in ('mv', 'regression'):
        if suite not in suites_seen:
            res.fail('final', suite, 'no strict FINAL (validate_provenance) for this suite')
    stale = sorted(k for (k, s) in A if k.startswith('final|') and (k, s) not in seen_keys)
    if stale:
        res.limit('stale executor FINAL views (finding or response no longer present)', stale[:10])
    res.data['items'] = items
    return res


# ---------------- disagreements (quarantined) ----------------
def check_disagreements(ctx, model):
    res = Result('disagreements')
    orc = oracle(ctx)
    rows = []
    for s, p in cel_suites(ctx).items():
        for c in p['cases']:
            e = orc[(s, c['id'])]
            author = (c['result'] or {}).get('value')
            mine = None if e['expect'] == 'none' else ('pause' if e['expect'] == 'pause' else model.key_for_label(e['expect']))
            if author != mine:
                rows.append({'suite': s, 'caseId': c['id'], 'author': author, 'executor': mine})
    res.data['disagreements'] = rows
    if rows:
        res.limit(f'{len(rows)} author/executor disagreements: lead adjudicates; the oracle is unchanged')
    return res
