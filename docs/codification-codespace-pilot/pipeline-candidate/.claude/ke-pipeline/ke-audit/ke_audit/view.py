"""Lead-side `view`, `hold`, `release`, `watch`; executor-side `freeze` (DESIGN §3)."""
import datetime as dt
import os
import random
import secrets
import shutil
import time
from pathlib import Path

from . import cel, guard
from .answer_options import validate_option_codings
from .model import select_cel, select_crl
from .util import (EXPECTATIONS_SCHEMA, FREEZE_SCHEMA, OUTCOMES, MANIFEST_SCHEMA, RELEASE_SCHEMA, VERSION, VIEW_SCHEMA, LEGACY_VIEW_SCHEMA,
                   KeAuditError, canonical, is_link, read_json, sha_bytes, sha_file, tree_hash, walk_files, write_atomic, write_json)

HELD_TREES = {'artifact': 'artifact', 'evidence': 'evidence', 'author': 'author', 'inputs-restricted': 'inputs/restricted'}


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='microseconds')


def paths(ws, r):
    ws = Path(ws)
    return {'view': ws / f'executor-view-{r}' / 'facts.json', 'manifest': ws / 'held' / f'candidate-manifest-{r}.json',
            'expectations': ws / 'executor' / f'expectations-{r}.json', 'freeze': ws / 'executor' / f'freeze-{r}.json',
            'release': ws / 'usage' / f'executor-release-{r}.json', 'hold': ws / 'usage' / f'executor-hold-{r}.json'}


def build(artifact, seed, rnd, simple=False, schema=VIEW_SCHEMA):
    """(facts.json bytes, alias map {alias: [suite, caseId]}, cel file paths). Deterministic in (CEL bytes, seed).
    New views mask case IDs in every mode. v1 is retained only for exact frozen-view replay."""
    if schema not in (VIEW_SCHEMA, LEGACY_VIEW_SCHEMA):
        raise KeAuditError(f'unsupported executor view schema: {schema!r}')
    legacy_simple = simple and schema == LEGACY_VIEW_SCHEMA
    parsed = {s: cel.parse(select_cel(artifact, s)) for s in ('mv', 'regression')}
    keys = sorted((s, c['id']) for s in parsed for c in parsed[s]['cases'])
    order = keys[:]
    if not legacy_simple:
        random.Random(seed).shuffle(order)
    width = max(2, len(str(len(order))))
    amap, cases = {}, {}
    by_id = {(s, c['id']): c for s in parsed for c in parsed[s]['cases']}
    for i, k in enumerate(order, 1):
        alias = f'{k[0]}/{k[1]}' if legacy_simple else f'c{i:0{width}d}'
        amap[alias] = list(k)
        cases[alias] = {'suite': k[0], **cel.case_facts(parsed[k[0]], by_id[k])}
    view = {'schema': schema, 'round': rnd, 'cases': cases}
    return (canonical(view) + '\n').encode('utf-8'), amap, {s: Path(parsed[s]['path']) for s in parsed}


def closure(artifact, crl, cels):
    """Execution-input closure file map (DESIGN §5 gate 7): src/crl/**, both CELs, package.json, node_modules/**."""
    art = Path(artifact)
    out = {}
    for sub in ('src/crl', 'node_modules'):
        d = art / sub
        if d.exists():
            out.update({f'{sub}/{p}': h for p, h in walk_files(d).items()})
    for p in list(cels.values()) + [art / 'package.json']:
        out[os.path.relpath(p, art).replace('\\', '/')] = sha_file(p)
    return out


def _is_ws_artifact(ws, art):
    if Path(art).exists() and is_link(art):
        raise KeAuditError(f'{art} is a symlink/junction; hold would move the link, not the tree')
    return os.path.normcase(os.path.realpath(art)) == os.path.normcase(os.path.realpath(Path(ws) / 'artifact'))


def cmd_view(a):
    ws, art, r = Path(a.workspace), Path(a.artifact), a.round
    # deny the held TREES (and their live locations), not held/ itself: the lead's manifest is written there
    guard.install([ws / 'held' / k for k in HELD_TREES] + [ws / 'author', ws / 'inputs' / 'restricted'])
    P = paths(ws, r)
    if P['view'].exists() or P['manifest'].exists():
        raise KeAuditError(f'round {r} view/manifest already exists; use a new round')
    if a.simple and a.backtest:
        raise KeAuditError('--simple and --backtest are different modes')
    external = not _is_ws_artifact(ws, art)
    if external and not a.backtest:
        raise KeAuditError(f'--artifact must be {ws / "artifact"} (hold moves exactly that tree); use --backtest for a historical artifact')
    seed = a.seed or secrets.token_hex(8)
    view_bytes, amap, cels = build(art, seed, r, simple=a.simple)
    pkg = read_json(art / 'package.json')
    crl = select_crl(art, pkg['name'])
    pre = Path(a.pre_emit) if a.pre_emit else ws / 'evidence' / f'artifact-pre-emit-r{r}.json'
    manifest = {'schema': MANIFEST_SCHEMA, 'round': r, 'tool': VERSION, 'package': pkg['name'], 'artifact': str(art.resolve()).replace('\\', '/'),
                'externalArtifact': external, 'mode': 'simple' if a.simple else 'backtest' if a.backtest else 'strict',
                'files': {'crl': {'path': os.path.relpath(crl, art).replace('\\', '/'), 'sha256': sha_file(crl)},
                          'mv': {'path': os.path.relpath(cels['mv'], art).replace('\\', '/'), 'sha256': sha_file(cels['mv'])},
                          'regression': {'path': os.path.relpath(cels['regression'], art).replace('\\', '/'), 'sha256': sha_file(cels['regression'])},
                          'package.json': {'path': 'package.json', 'sha256': sha_file(art / 'package.json')}},
                'closure': closure(art, crl, cels), 'aliases': amap, 'seed': seed, 'factsSha256': sha_bytes(view_bytes),
                'preEmitInventory': {'path': str(pre).replace('\\', '/'), 'sha256': sha_file(pre) if pre.exists() else None}}
    write_atomic(P['view'], view_bytes)
    write_json(P['manifest'], manifest)
    msha = sha_file(P['manifest'])
    print(f'view: {len(amap)} cases -> {P["view"]}')
    print(f'manifest: {P["manifest"]} sha256={msha}  (give the executor this sha, never the manifest)')
    if manifest['preEmitInventory']['sha256'] is None:
        print(f'WARNING: pre-emit inventory missing at {pre}; gate 7 will fail outside --backtest')
    return 0


# ---------------- hold / release: a fail-closed state machine with a progress journal ----------------
class round_lock:
    """Exclusive per-round transition lock (usage/.round-<r>.lock, O_CREAT|O_EXCL). hold, freeze, release, watch and
    recover serialize on it. A stale lock after a crash is removed only by `recover`, after inspection."""

    def __init__(self, ws, r, op):
        self.p = Path(ws) / '.ke-audit-locks' / f'round-{r}.lock'  # neutral: both lead and executor transitions take it
        self.op = op

    def __enter__(self):
        self.p.parent.mkdir(parents=True, exist_ok=True)
        try:
            fd = os.open(self.p, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            raise KeAuditError(f'round transition in progress or crashed ({self.p.read_text(encoding="utf-8", errors="replace").strip()}); '
                               f'if no ke-audit process is running, inspect usage/ and run `ke-audit recover`')
        with os.fdopen(fd, 'w') as f:
            f.write(f'{self.op} pid={os.getpid()} at={now()}')
        return self

    def __exit__(self, *exc):
        try:
            self.p.unlink()
        except FileNotFoundError:
            pass
        return False
def _journal(path, rec):
    write_json(path, rec)


def cmd_hold(a):
    with round_lock(a.workspace, a.round, 'hold'):
        return _hold(a)


def _hold(a):
    ws, r = Path(a.workspace), a.round
    P = paths(ws, r)
    if not P['manifest'].exists():
        raise KeAuditError(f'hold needs the round-{r} view/manifest first (run `view`)')
    if read_json(P['manifest']).get('externalArtifact'):
        raise KeAuditError('the round manifest was built from an external (backtest) artifact; nothing to hold')
    if read_json(P['manifest']).get('mode') == 'simple':
        raise KeAuditError('this round was viewed in simple mode (no hold/release); start a new round without --simple for strict')
    if P['hold'].exists():
        st = read_json(P['hold']).get('status')
        raise KeAuditError(f'{P["hold"]} exists (status {st}); ' + ('an incomplete hold must be rolled back with `ke-audit recover`'
                           if st != 'complete' else 'a hold is recorded once per round'))
    if P['freeze'].exists():
        raise KeAuditError('the executor already froze this round; holding now proves nothing (use a new round)')
    for need in ('artifact', 'evidence'):
        if not (ws / need).exists():
            raise KeAuditError(f'{ws / need} is missing: hold runs after the lead has produced the round\'s evidence')
    man = read_json(P['manifest'])
    if not man['preEmitInventory']['sha256']:
        raise KeAuditError('the manifest has no bound pre-emit inventory; run the snapshot before emit, then view')
    plan = [(k, rel) for k, rel in HELD_TREES.items() if (ws / rel).exists()]
    for k, _ in plan:
        if (ws / 'held' / k).exists():
            raise KeAuditError(f'{ws / "held" / k} already exists')
    rec = {'round': r, 'status': 'in-progress', 'planned': [k for k, _ in plan], 'moved': {}, 'startedAt': now()}
    _journal(P['hold'], rec)
    for k, rel in plan:
        (ws / 'held').mkdir(exist_ok=True)
        shutil.move(str(ws / rel), str(ws / 'held' / k))
        rec['moved'][k] = {'from': str(ws / rel), 'to': str(ws / 'held' / k)}
        _journal(P['hold'], rec)
    rec.update({'status': 'complete', 'heldAt': now()})
    _journal(P['hold'], rec)
    print(f'held round {r}: {sorted(rec["moved"])}')
    return 0


def cmd_recover(a):
    """Recover an interrupted round transition, after the lead has confirmed no ke-audit process is running:
    - an incomplete hold is rolled back (moved trees returned, journal kept as hold-aborted), so the round can restart;
    - an interrupted release is completed by re-running `release` (it is idempotent);
    then the stale lock is removed."""
    ws, r = Path(a.workspace), a.round
    P = paths(ws, r)
    lock = ws / '.ke-audit-locks' / f'round-{r}.lock'
    if P['hold'].exists():
        h = read_json(P['hold'])
        if h.get('status') != 'complete':
            for k, mv in h.get('moved', {}).items():
                if (ws / 'held' / k).exists() and not (ws / HELD_TREES[k]).exists():
                    shutil.move(str(ws / 'held' / k), str(ws / HELD_TREES[k]))
            os.replace(P['hold'], P['hold'].with_name(P['hold'].stem + f'-aborted-{int(time.time())}.json'))
            print(f'rolled back incomplete hold for round {r}')
    if lock.exists():
        lock.unlink()
        print('removed stale lock')
    if P['freeze'].exists() and P['hold'].exists() and not P['release'].exists():
        return release(ws, r)
    return 0


def hold_ok(ws, r):
    """The hold record is complete and every held tree is absent from its live location."""
    P = paths(ws, r)
    if not P['hold'].exists():
        return None, 'no hold record'
    h = read_json(P['hold'])
    if h.get('status') != 'complete' or 'artifact' not in h.get('moved', {}):
        return h, 'hold incomplete or artifact not held'
    live = [rel for k, rel in HELD_TREES.items() if k in h['moved'] and (Path(ws) / rel).exists()]
    return h, (f'held trees visible at live paths: {live}' if live else None)


def release(ws, r):
    with round_lock(ws, r, 'release'):
        return _release(ws, r)


def _release(ws, r):
    ws = Path(ws)
    P = paths(ws, r)
    if not P['freeze'].exists():
        raise KeAuditError(f'no freeze for round {r}: {P["freeze"]}')
    if P['release'].exists():
        raise KeAuditError(f'{P["release"]} exists; a round is released once')
    h, why = hold_ok(ws, r)
    if why:
        raise KeAuditError(f'cannot release round {r}: {why}')
    fz = read_json(P['freeze'])
    if fz.get('holdSha256') != sha_file(P['hold']):
        raise KeAuditError('the freeze is not bound to this hold record')
    # release journal: a tree may already be live ONLY if an earlier interrupted release recorded moving it back
    jp = P['release'].with_name(P['release'].stem + '-progress.json')
    journal = read_json(jp) if jp.exists() else {'round': r, 'movedBack': []}
    for k in h['moved']:
        live, held = (ws / HELD_TREES[k]).exists(), (ws / 'held' / k).exists()
        if live and held:
            raise KeAuditError(f'{k} exists both held and live; refusing to guess on release')
        if live and k not in journal['movedBack']:
            raise KeAuditError(f'{ws / HELD_TREES[k]} is live but no release moved it back; refusing to certify it')
        if not live and not held:
            raise KeAuditError(f'{k} is missing from both held and live locations')
    trees = {}
    for k in h['moved']:
        src, dst = ws / 'held' / k, ws / HELD_TREES[k]
        if src.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(dst))
            journal['movedBack'].append(k)
            write_json(jp, journal)
        files = walk_files(dst)
        trees[k] = {'path': str(dst.resolve()).replace('\\', '/'), 'treeHash': tree_hash(files), 'count': len(files)}
    rec = {'schema': RELEASE_SCHEMA, 'round': r, 'freezeSha256': sha_file(P['freeze']), 'holdSha256': sha_file(P['hold']),
           'releasedAt': now(), 'trees': trees, 'tool': VERSION}
    write_json(P['release'], rec)
    print(f'released round {r}: {sorted(trees)} -> {P["release"]}')
    return 0


def cmd_release(a):
    return release(a.workspace, a.round)


def cmd_watch(a):
    P = paths(a.workspace, a.round)
    while not P['freeze'].exists():
        time.sleep(a.interval)
    for attempt in range(120):  # a freeze/refreeze may still hold the round lock: retry, bounded (~10 min)
        try:
            return release(a.workspace, a.round)
        except KeAuditError as e:
            if 'in progress or crashed' not in str(e) or attempt == 119:
                raise
            time.sleep(5)


# ---------------- expectations schema (hand-validated; stdlib only) ----------------
MODES = ('anyOf', 'allOf', 'exactly')
TYPES = ('boolean', 'quantity', 'coding', 'date', 'dateTime', 'integer', 'string')


def _strs(v):
    return isinstance(v, list) and all(isinstance(x, str) and x for x in v)


def validate_expectations(e, aliases):
    """Full structural + semantic validation: every container and scalar type is checked before use."""
    if not isinstance(e, dict):
        return ['expectations must be a JSON object']
    errs = []
    legacy = e.get('schema') == 'ke-audit-expectations/2'
    if e.get('schema') not in (EXPECTATIONS_SCHEMA, 'ke-audit-expectations/2'):
        errs.append(f'schema must be {EXPECTATIONS_SCHEMA} or legacy ke-audit-expectations/2')
    for k, t in (('policy', str), ('basis', str), ('dispositions', list), ('cases', dict)):
        if not isinstance(e.get(k), t):
            errs.append(f'{k} missing or not a {t.__name__}')
    allowed_top = {'schema', 'policy', 'basis', 'dispositions', 'cases', 'questions', 'conjuncts', 'notes'}
    errs += [f'unknown top-level key {k}' for k in e if k not in allowed_top]
    if 'notes' in e and not isinstance(e['notes'], (str, list)):
        errs.append('notes must be a string or a list')
    if isinstance(e.get('dispositions'), list):
        if not e['dispositions']:
            errs.append('dispositions is empty')
        for d in e['dispositions']:
            if d not in OUTCOMES:
                errs.append(f'disposition {d!r} not in customer set {sorted(OUTCOMES)}')
    cases = e.get('cases') if isinstance(e.get('cases'), dict) else {}
    missing, extra = sorted(set(aliases) - set(cases)), sorted(set(cases) - set(aliases))
    if missing:
        errs.append(f'expectations missing cases {missing}')
    if extra:
        errs.append(f'expectations name unknown cases {extra}')
    for a, c in cases.items():
        if not isinstance(c, dict):
            errs.append(f'{a}: case entry must be an object')
            continue
        errs += [f'{a}: unknown key {k}' for k in c if k not in ('expect', 'pause', 'reasons', 'form')]
        if 'reasons' in c and not (isinstance(c['reasons'], list) and all(isinstance(x, str) for x in c['reasons'])):
            errs.append(f'{a}: reasons must be a list of strings')
        if 'form' in c and (legacy or c['form'] not in ('none', 'generated')):
            errs.append(f'{a}: form needs the initial schema and none/generated')
        if c.get('form') == 'none' and c.get('expect') == 'pause':
            errs.append(f'{a}: a needed-question pause cannot declare form none')
        x = c.get('expect')
        allowed = list(OUTCOMES) + ['pause'] + ([] if legacy else ['none'])
        if x not in allowed:
            errs.append(f'{a}: expect {x!r} not in {allowed}')
        if x == 'none' and c.get('form') != 'none':
            errs.append(f'{a}: no determination requires form none')
        p = c.get('pause')
        if x == 'pause':
            if not isinstance(p, dict) or p.get('mode') not in MODES or not _strs(p.get('questions')) or not p['questions']:
                errs.append(f'{a}: pause needs mode in {MODES} and a non-empty list of question names')
            else:
                errs += [f'{a}: pause unknown key {k}' for k in p if k not in ('mode', 'questions', 'mustNotName')]
                if 'mustNotName' in p and not _strs(p['mustNotName']):
                    errs.append(f'{a}: mustNotName must be a list of names')
                if len(set(p['questions'])) != len(p['questions']):
                    errs.append(f'{a}: duplicate pause question names')
        elif p is not None:
            errs.append(f'{a}: pause given for a non-pause expectation')
    q = e.get('questions', {})
    if q is None:
        q = {}
    if not isinstance(q, dict):
        errs.append('questions must be an object')
        q = {}
    errs += [f'questions: unknown key {k}' for k in q if k not in ('forbidden', 'options', 'optionCodings', 'types', 'notAskedIn', 'askedIn', 'exactIn')]
    if 'forbidden' in q and not _strs(q['forbidden']):
        errs.append('questions.forbidden must be a list of names')
    for key in ('options', 'types', 'notAskedIn', 'askedIn'):
        if key in q and not isinstance(q[key], dict):
            errs.append(f'questions.{key} must be an object')
    for concept, codes in (q.get('options') or {}).items() if isinstance(q.get('options'), dict) else []:
        if not _strs(codes):
            errs.append(f'questions.options[{concept}] must be a list of codes')
    if 'optionCodings' in q:
        if legacy:
            errs.append('optionCodings requires the initial expectations schema')
        coding_errors = validate_option_codings(q['optionCodings'])
        errs += coding_errors
        if not coding_errors and isinstance(q.get('options'), dict):
            for concept, choices in q['optionCodings'].items():
                codes = q['options'].get(concept)
                if _strs(codes) and sorted(codes) != sorted(c['code'] for c in choices):
                    errs.append(f'questions.options and optionCodings disagree for {concept}')
    for concept, t in (q.get('types') or {}).items() if isinstance(q.get('types'), dict) else []:
        if t not in TYPES:
            errs.append(f'questions.types[{concept}] {t!r} not in {TYPES}')
    if 'askedIn' in q and legacy:
        errs.append('askedIn requires the initial expectations schema')
    for key in ('notAskedIn', 'askedIn'):
        for concept, al in (q.get(key) or {}).items() if isinstance(q.get(key), dict) else []:
            if not isinstance(concept, str) or not concept.strip():
                errs.append(f'questions.{key} needs a non-empty concept name')
            if not _strs(al):
                errs.append(f'questions.{key}[{concept}] must be a list of case aliases')
                continue
            if len(set(al)) != len(al):
                errs.append(f'questions.{key}[{concept}] duplicates case aliases')
            errs += [f'questions.{key}[{concept}] unknown case {x}' for x in al if x not in aliases]
            if key == 'askedIn':
                forbidden = q.get('forbidden') if _strs(q.get('forbidden')) else []
                absent = q.get('notAskedIn') if isinstance(q.get('notAskedIn'), dict) else {}
                if al and concept in forbidden:
                    errs.append(f'questions.askedIn[{concept}] conflicts with forbidden')
                if _strs(absent.get(concept)) and set(al) & set(absent[concept]):
                    errs.append(f'questions.askedIn[{concept}] conflicts with notAskedIn')
                for alias in al:
                    if isinstance(cases.get(alias), dict) and cases[alias].get('form') == 'none':
                        errs.append(f'questions.askedIn[{concept}] requires a form in {alias}, declared form none')
    if 'exactIn' in q:
        if legacy:
            errs.append('exactIn requires the initial expectations schema')
        exact = q['exactIn']
        if not isinstance(exact, dict):
            errs.append('questions.exactIn must be an object')
        else:
            for alias, names in exact.items():
                if alias not in aliases:
                    errs.append(f'questions.exactIn unknown case {alias}')
                if not _strs(names) or any(not n.strip() for n in names):
                    errs.append(f'questions.exactIn[{alias}] must be a list of non-empty concept names')
                    continue
                if len(set(names)) != len(names):
                    errs.append(f'questions.exactIn[{alias}] duplicates concept names')
                if names and isinstance(cases.get(alias), dict) and cases[alias].get('form') == 'none':
                    errs.append(f'questions.exactIn[{alias}] requires questions but declares form none')
                if _strs(q.get('forbidden')) and set(names) & set(q['forbidden']):
                    errs.append(f'questions.exactIn[{alias}] conflicts with forbidden')
                for key in ('askedIn', 'notAskedIn'):
                    for concept, al in q.get(key, {}).items() if isinstance(q.get(key), dict) else []:
                        if _strs(al) and alias in al and ((concept in names) != (key == 'askedIn')):
                            errs.append(f'questions.exactIn[{alias}] conflicts with {key}[{concept}]')
                # Pause names can be computed concepts. Native verification resolves
                # their answerable dependencies through Model.answerable(); compare
                # exactIn only with actual answerable identities in check_assoc.
    cj = e.get('conjuncts', [])
    if cj is None:
        cj = []
    if not isinstance(cj, list):
        errs.append('conjuncts must be a list')
        cj = []
    names = []
    for i, c in enumerate(cj):
        if not isinstance(c, dict) or not isinstance(c.get('name'), str) or not isinstance(c.get('concept'), str) or not c['name'] or not c['concept']:
            errs.append(f'conjuncts[{i}] needs string name and concept')
            continue
        errs += [f'conjuncts[{i}]: unknown key {k}' for k in c if k not in ('name', 'concept', 'polarity')]
        if 'polarity' in c and not isinstance(c['polarity'], str):
            errs.append(f'conjuncts[{i}]: polarity must be a string')
        names.append(c['name'])
    if len(set(names)) != len(names):
        errs.append('duplicate conjunct names')
    return errs


def cmd_freeze(a):
    with round_lock(a.workspace, a.round, 'freeze'):
        return _freeze(a)


def _freeze(a):
    ws, r = Path(a.workspace), a.round
    # the executor never reads held/ at all (the manifest is bound by the sha it was given)
    guard.install([ws / 'held', ws / 'author', ws / 'inputs' / 'restricted', ws / 'evidence', ws / 'artifact'])
    P = paths(ws, r)
    if P['release'].exists():  # checked first: after release the held trees are legitimately back in place
        raise KeAuditError('this round was already released: its evidence is visible, so a new freeze needs a NEW round')
    hold_rec, hold_sha = None, None
    if a.backtest or a.simple:
        if P['hold'].exists():
            raise KeAuditError('--backtest/--simple freeze refused: this round has a hold record (strict round)')
    else:
        # read the hold record through the lead-owned usage/ path (not denied), and require it complete
        hold_rec, why = hold_ok(ws, r)
        if why:
            raise KeAuditError(f'freeze refused: {why}. The lead must run `view` then `hold` before the executor freezes.')
        hold_sha = sha_file(P['hold'])
    view_bytes = P['view'].read_bytes()
    view = read_json(P['view'])
    if view.get('schema') not in (VIEW_SCHEMA, LEGACY_VIEW_SCHEMA):
        raise KeAuditError(f'unsupported executor view schema: {view.get("schema")!r}')
    exp_bytes = P['expectations'].read_bytes()
    exp = read_json(P['expectations'])
    errs = validate_expectations(exp, list(view['cases']))
    if errs:
        raise KeAuditError('expectations invalid:\n  ' + '\n  '.join(errs[:40]))
    src = ws / 'inputs' / 'source-only'
    so = walk_files(src) if src.exists() else {}
    rec = {'schema': FREEZE_SCHEMA, 'round': r, 'tool': VERSION, 'expectationsSchema': exp['schema'], 'frozenAt': now(),
           'expectationsSha256': sha_bytes(exp_bytes), 'viewSha256': sha_bytes(view_bytes), 'manifestSha256': a.manifest_sha,
           'holdSha256': hold_sha, 'backtest': bool(a.backtest), 'mode': 'simple' if a.simple else 'backtest' if a.backtest else 'strict',
           'sourceOnly': {'treeHash': tree_hash(so), 'count': len(so)},
           'brief': {'path': str(Path(a.brief).resolve()).replace('\\', '/'), 'sha256': sha_file(a.brief)} if a.brief else None,
           'history': []}
    if P['freeze'].exists():
        if not a.refreeze:
            raise KeAuditError(f'{P["freeze"]} exists; a second freeze needs --refreeze --reason')
        if not a.reason:
            raise KeAuditError('--refreeze needs --reason')
        prior = read_json(P['freeze'])
        prior_exp = prior.get('expectationsContent')
        diff = {}
        if prior_exp:
            for al in sorted(set(prior_exp['cases']) | set(exp['cases'])):
                o, n = prior_exp['cases'].get(al), exp['cases'].get(al)
                if o != n:
                    diff[al] = 'added' if o is None else 'removed' if n is None else 'changed'
            old_questions, new_questions = prior_exp.get('questions', {}), exp.get('questions', {})
            if old_questions != new_questions:
                diff['questions'] = {'before': old_questions, 'after': new_questions}
        rec['history'] = prior.get('history', []) + [{'at': rec['frozenAt'], 'reason': a.reason, 'priorExpectationsSha256': prior['expectationsSha256'],
                                                      'priorFrozenAt': prior['frozenAt'], 'priorExpectations': prior_exp, 'diff': diff}]
    rec['expectationsContent'] = exp
    write_json(P['freeze'], rec)
    print(f'frozen round {r}: {len(exp["cases"])} cases, expectations {rec["expectationsSha256"][:12]}, view {rec["viewSha256"][:12]}')
    return 0
