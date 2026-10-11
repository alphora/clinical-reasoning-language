"""Append-only, hash-chained JSONL (DESIGN §4): executor/assessment.jsonl and usage/lead-adjudication.jsonl."""
import datetime as dt
import json
from pathlib import Path

from .util import KeAuditError, _no_dupes, canonical, sha_bytes, write_atomic

VIEWS = ('earned', 'not-earned', 'needs-lead', 'equivalent-proof', 'explained')  # mapping overrides are not supported
# The lead is the orchestrating agent (automated runs) and must close every judgment item with one of:
#   accept   - agrees with the executor's clearing view
#   override - decides against the executor's view (visible in the audit trail as LEAD OVERRIDE)
#   flag     - cannot resolve it to its satisfaction: creates a KE review flag and hands it to humans (medical validation)
# There is no `reject`: "cannot resolve" IS `flag`. An item left needs-lead means the lead has not finished.
RESOLUTIONS = ('accept', 'override', 'flag')
# `accept` confirms the executor's view; it is valid only over a view that clears the item.
ACCEPTABLE_VIEWS = ('earned', 'equivalent-proof', 'explained')


def read_chain(path):
    p = Path(path)
    if not p.exists():
        return [], None
    entries, prev = [], None
    for i, line in enumerate(p.read_text(encoding='utf-8').splitlines()):
        if not line.strip():
            continue
        try:
            e = json.loads(line, object_pairs_hook=_no_dupes)
        except json.JSONDecodeError as ex:
            raise KeAuditError(f'{p}: malformed line {i + 1}: {ex}') from ex
        h = e.pop('hash', None)
        if e.get('seq') != i or e.get('prev') != prev or sha_bytes(canonical(e).encode('utf-8')) != h:
            raise KeAuditError(f'{p}: hash chain broken at line {i + 1}')
        e['hash'] = h
        entries.append(e)
        prev = h
    return entries, prev


def append(path, entry):
    entries, head = read_chain(path)
    e = {**entry, 'seq': len(entries), 'prev': head, 'at': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')}
    e['hash'] = sha_bytes(canonical(e).encode('utf-8'))
    p = Path(path)
    old = p.read_text(encoding='utf-8') if p.exists() else ''
    write_atomic(p, old + canonical(e) + '\n')
    return e


def cmd_assess(a):
    if a.view not in VIEWS:
        raise KeAuditError(f'--view must be one of {VIEWS}')
    e = append(Path(a.workspace) / 'executor' / 'assessment.jsonl',
               {'key': a.key, 'evidenceSha': a.evidence_sha, 'view': a.view, 'reason': a.reason})
    print(f'assessment #{e["seq"]} {a.key} = {a.view}')
    return 0


def cmd_adjudicate(a):
    if a.resolution not in RESOLUTIONS:
        raise KeAuditError(f'--resolution must be one of {RESOLUTIONS}')
    if (a.resolution == 'flag') != bool(a.flag_id):
        raise KeAuditError('--resolution flag requires --flag-id (and --flag-id is only for flag)')
    if a.flag_id and not flag_exists(a.artifact or Path(a.workspace) / 'artifact', a.flag_id):
        raise KeAuditError(f'KE flag {a.flag_id} not found in the artifact flag store (create it with create_flag first)')
    ass, head = read_chain(Path(a.workspace) / 'executor' / 'assessment.jsonl')
    match = [x for x in ass if x['key'] == a.key and x['evidenceSha'] == a.evidence_sha]
    if not match:
        raise KeAuditError(f'no executor assessment for {a.key} on that evidence; the lead resolves only what the executor assessed')
    if a.resolution == 'accept' and match[-1]['view'] not in ACCEPTABLE_VIEWS:
        raise KeAuditError(f'`accept` confirms the executor view; the current view is {match[-1]["view"]!r}, which does not clear the item. '
                           f'Use `override` to decide against the executor view (reported as lead-overridden)')
    lead, _ = read_chain(Path(a.workspace) / 'usage' / 'lead-adjudication.jsonl')
    prior = [x for x in lead if x['key'] == a.key and x['evidenceSha'] == a.evidence_sha]
    if prior and prior[-1]['resolution'] != a.resolution and a.supersedes != prior[-1]['seq']:
        raise KeAuditError(f'conflicts with lead adjudication #{prior[-1]["seq"]}; pass --supersedes {prior[-1]["seq"]} to change it')
    if a.supersedes is not None and (not prior or a.supersedes != prior[-1]['seq']):
        raise KeAuditError('--supersedes must name the latest lead adjudication for this key and evidence')
    e = append(Path(a.workspace) / 'usage' / 'lead-adjudication.jsonl',
               {'key': a.key, 'evidenceSha': a.evidence_sha, 'resolution': a.resolution, 'reason': a.reason, 'assessmentHead': head,
                'supersedes': a.supersedes, 'assessmentSeq': match[-1]['seq'], 'flagId': a.flag_id})
    print(f'lead adjudication #{e["seq"]} {a.key} = {a.resolution}')
    return 0


def views(ws):
    """(assessment by (key, sha) -> latest entry, lead by (key, sha) -> entry). Conflicting lead entries raise."""
    ws = Path(ws)
    ass, _ = read_chain(ws / 'executor' / 'assessment.jsonl')
    lead, _ = read_chain(ws / 'usage' / 'lead-adjudication.jsonl')
    head_index = {e['hash']: e['seq'] for e in ass}
    A = {}
    for e in ass:
        A[(e['key'], e['evidenceSha'])] = e
    L = {}
    for e in lead:
        if e.get('assessmentHead') not in head_index:
            raise KeAuditError(f'lead adjudication #{e["seq"]} does not anchor to the assessment chain')
        k = (e['key'], e['evidenceSha'])
        # the matching assessment must exist in the chain PREFIX the lead saw (no retroactive validation)
        prefix = [x for x in ass[:head_index[e['assessmentHead']] + 1] if (x['key'], x['evidenceSha']) == k]
        if not prefix or e.get('assessmentSeq') != prefix[-1]['seq']:
            raise KeAuditError(f'lead adjudication #{e["seq"]} resolves {k[0]} with no executor assessment for that evidence at that time')
        if k in L and L[k]['resolution'] != e['resolution'] and e.get('supersedes') != L[k]['seq']:
            raise KeAuditError(f'conflicting lead adjudications for {k[0]} (use --supersedes <seq> to change one)')
        L[k] = e
    return A, L


def flag_exists(artifact, flag_id):
    p = Path(artifact) / 'src' / 'medical-validation' / 'flags' / f'{flag_id}.json'
    if not p.exists():
        return False
    try:
        return json.loads(p.read_text(encoding='utf-8')).get('id') == flag_id
    except json.JSONDecodeError:
        return False


def decide(res, key, a, l, artifact):
    """Apply a current lead decision to res. Returns the state name, or None when the item stays needs-lead."""
    if not (a and l and l.get('assessmentSeq') == a['seq']):
        return None
    view = a['view']
    if l['resolution'] == 'accept' and view in ACCEPTABLE_VIEWS:
        res.lead_resolved.append([key, f'executor view: {view}', l['reason']])
        return 'lead-resolved'
    if l['resolution'] == 'override':
        res.lead_resolved.append([key, f'LEAD OVERRIDE of executor view {view!r}', l['reason']])
        return 'lead-overridden'
    if l['resolution'] == 'flag':
        if not flag_exists(artifact, l.get('flagId')):
            res.fail(key, f'KE flag {l.get("flagId")} named by the lead is not in the artifact flag store')
            return 'flag-missing'
        res.flagged.append([key, f'KE flag {l["flagId"]}', f'executor view: {view}', l['reason']])
        return 'flagged'
    return None


def resolve(res, key, sha, A, L, why, artifact=None):
    """Route a judgment item: an executor assessment plus a lead `accept` for the same (key, evidence sha) is
    lead-resolved; everything else stays needs-lead. Never a tool pass."""
    a, l = A.get((key, sha)), L.get((key, sha))
    # a later executor reassessment of the same item voids an earlier lead decision (it decided a different view)
    if decide(res, key, a, l, artifact) is None:
        res.needs_lead.append([key, why, f'executor view: {a["view"]}' if a else 'no executor assessment', 'evidenceSha', sha])
