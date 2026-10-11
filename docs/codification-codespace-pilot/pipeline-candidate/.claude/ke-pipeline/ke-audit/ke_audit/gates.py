"""Gates 1-7 (DESIGN §5). Integrity problems raise KeAuditError (exit 2); coverage/evidence failures go to Result.failures."""
import datetime as dt
from pathlib import Path

from . import view as V
from .model import PIPELINE, pins
from .util import CAPTURE_CJS_SHA256, KeAuditError, Result, mcp_body, norm, read_json, sha_bytes, sha_file, tree_hash, walk_files


def _t(s):
    return dt.datetime.fromisoformat(s.replace('Z', '+00:00'))


def _raw_refs(node, out):
    if isinstance(node, dict):
        for k, v in node.items():
            if k == 'raw' and isinstance(v, str):
                out.add(norm(v))
            else:
                _raw_refs(v, out)
    elif isinstance(node, list):
        for v in node:
            _raw_refs(v, out)
    return out


class Evidence:
    """Transport-bound index of every stage in every --evidence dir (gate 4/5)."""

    def __init__(self, dirs, ws, res, package):
        self.stages = []
        self.receipts = []
        p = pins()
        pin_map = {'crl': p['crlVersion'], 'kitHash': p['kitHash'], 'server': p['server']['sha256'],
                   'driver': p['driver']['sha256'], 'engine': p['engine']['sha256']}
        for d in dirs:
            d = Path(d)
            rc = read_json(d / 'receipt.json')
            if rc.get('pipeline') != 'ke-initial-implementation/1':
                raise KeAuditError(f'{d}: receipt.pipeline {rc.get("pipeline")!r} != ke-initial-implementation/1')
            if rc.get('package') != package:
                raise KeAuditError(f'{d}: receipt.package {rc.get("package")!r} != package.json name {package!r}')
            for k, v in pin_map.items():
                if (rc.get('pins') or {}).get(k) != v:
                    raise KeAuditError(f'{d}: receipt pin {k} {rc.get("pins", {}).get(k)!r} != pins.json {v!r}')
            producer = 'executor' if norm(d).startswith(norm(Path(ws) / 'executor') + '/') else 'lead'
            self.receipts.append({'dir': str(d), 'receipt': rc, 'producer': producer, 'sha256': sha_file(d / 'receipt.json')})
            for stage, summary in (rc.get('stages') or {}).items():
                self.stages.append(self._bind(d, stage, summary, res, pin_map, producer))

    def _bind(self, d, stage, summary, res, pin_map, producer):
        sd = d / stage
        rec = {'dir': str(d), 'stage': stage, 'stageDir': sd, 'summary': summary, 'calls': [], 'producer': producer, 'failed': False}
        reqp, trp = sd / 'request.json', sd / 'transport-receipt.json'
        if not trp.exists() or not reqp.exists():
            res.fail('gate4-transport', f'{d.name}/{stage}', 'missing request.json or transport-receipt.json: stage failed')
            rec['failed'] = True
            return rec
        req, tr = read_json(reqp), read_json(trp)
        for k in ('server', 'driver', 'engine'):
            if (tr.get('pins') or {}).get(k) != pin_map[k]:
                raise KeAuditError(f'{sd}: transport pin {k} mismatch')
        rq = {}
        for c in req.get('calls', []):
            key = (c['name'], norm(c['out']))
            if key in rq:
                raise KeAuditError(f'{sd}: duplicate request call {key}')
            rq[key] = c
        tc = {}
        for c in tr.get('calls', []):
            key = (c['name'], norm(c['out']))
            if key in tc:
                raise KeAuditError(f'{sd}: duplicate transport call {key}')
            tc[key] = c
        if set(rq) != set(tc):
            res.fail('gate4-transport', f'{d.name}/{stage}', 'request/transport calls differ',
                     sorted(k[0] for k in set(rq) ^ set(tc)))
            rec['failed'] = True
        for key in sorted(set(rq) & set(tc)):
            r, t = rq[key], tc[key]
            out = Path(t['out'])
            if not out.exists():
                raise KeAuditError(f'{sd}: response file missing {out}')
            if sha_file(out) != t['sha256']:
                raise KeAuditError(f'{sd}: response sha mismatch for {out.name}')
            env, body = mcp_body(out)
            if bool(env.get('isError')) != bool(t['isError']) or (env.get('transportError') is None) != (t.get('transportError') is None):
                raise KeAuditError(f'{sd}: envelope error flags disagree with transport receipt for {out.name}')
            if t['isError'] or t.get('transportError'):
                res.fail('gate8-completion', f'{d.name}/{stage}', f'{t["name"]} returned an error/transport error')
                rec['failed'] = True
            rec['calls'].append({'name': t['name'], 'out': out, 'arguments': r.get('arguments', {}), 'sha256': t['sha256'], 'body': body})
        refs = _raw_refs(summary, set())
        outs = {norm(c['out']) for c in rec['calls']}
        if not refs <= outs:
            raise KeAuditError(f'{sd}: summary raw references outside the joined calls: {sorted(refs - outs)[:3]}')
        return rec

    def stage(self, name):
        return [s for s in self.stages if s['stage'] == name]


def role_hashes(rc, artifact):
    ih = {norm(k): v for k, v in (rc.get('inputHashes') or {}).items()}
    inputs = rc.get('inputs') or {}
    if norm(rc.get('artifact')) != norm(artifact):
        raise KeAuditError(f'evidence artifact root {rc.get("artifact")} != --artifact {artifact}')
    out = {}
    for role, p in (('crl', inputs.get('crl')), ('mv', inputs.get('mv')), ('regression', inputs.get('regression')),
                    ('package.json', str(Path(rc['artifact']) / 'package.json'))):
        if isinstance(p, list):
            if len(p) != 1:
                raise KeAuditError(f'receipt inputs.{role} must list exactly one file, found {len(p)}')
            p = p[0]
        out[role] = ih.get(norm(p)) if p else None
    return out


def run(ws, r, artifact, evidence_dirs, backtest=False, simple=False):
    """Returns (Result, context dict). Raises KeAuditError on integrity failure."""
    ws, artifact = Path(ws), Path(artifact)
    res = Result('gates')
    P = V.paths(ws, r)
    freeze = read_json(P['freeze'])
    if sha_file(P['expectations']) != freeze['expectationsSha256']:
        raise KeAuditError('expectations changed after freeze (sha mismatch)')
    # a live workspace (hold recorded) can never be audited as a backtest, and a backtest freeze never passes live
    if backtest and P['hold'].exists():
        raise KeAuditError('--backtest refused: this workspace has a hold record (live round)')
    if not backtest and freeze.get('backtest'):
        raise KeAuditError('this round was frozen with --backtest; a live audit needs a live round')
    if simple != (freeze.get('mode') == 'simple'):
        raise KeAuditError('audit mode differs from the freeze mode (simple vs strict): use the mode the round was frozen in')
    # gate 1: hold -> freeze -> release, each bound to the previous (DESIGN §3, D13)
    blind = 'unrecorded'
    if P['release'].exists():
        rel = read_json(P['release'])
        if rel.get('round') != r or rel.get('freezeSha256') != sha_file(P['freeze']):
            raise KeAuditError('release record does not match this round/freeze')
        if not P['hold'].exists():
            raise KeAuditError('release without a hold record')
        hold = read_json(P['hold'])
        hsha = sha_file(P['hold'])
        if hold.get('status') != 'complete' or freeze.get('holdSha256') != hsha or rel.get('holdSha256') != hsha:
            raise KeAuditError('hold record incomplete or not bound to both the freeze and the release')
        for key, t in rel.get('trees', {}).items():
            files = walk_files(t['path'])
            if tree_hash(files) != t['treeHash']:
                raise KeAuditError(f'released tree {key} changed since release')
        ordered = _t(hold['heldAt']) <= _t(freeze['frozenAt']) <= _t(rel['releasedAt'])
        blind = 'enforced-by-process' if ordered else 'violated'
        if not ordered:
            res.fail('gate1-release', 'hold/freeze/release out of order (heldAt <= frozenAt <= releasedAt)')
        refrozen = [h for h in freeze.get('history', []) if _t(h['at']) > _t(hold['heldAt'])]
        if refrozen:
            res.needs_lead.append(['gate1-refreeze', 'expectations were refrozen within the round', [h['diff'] for h in refrozen]])
        if r > 1 and blind == 'enforced-by-process':
            blind = 'enforced-by-process (blind to round-r evidence only)'
    elif simple:
        if P['hold'].exists():
            raise KeAuditError('simple mode refused: this round has a hold record')
        blind = 'not-enforced (simple mode: the executor was not held blind)'
        res.limit('gate1-release', 'simple mode: no hold/release; executor independence is by instruction, not enforced')
    elif backtest:
        res.limit('gate1-release', 'no release record (backtest): blindness unrecorded')
    else:
        raise KeAuditError(f'no release record {P["release"]}')
    if freeze.get('history'):
        res.data['refreezes'] = [{'at': h['at'], 'reason': h['reason'], 'diff': h['diff']}
                                for h in freeze['history']]
        if simple or backtest:
            res.limit('gate1-refreeze', 'expectations were refrozen; inspect data.refreezes for changes and reasons')
    # frozen authority must still be what was frozen (182-R5)
    src = ws / 'inputs' / 'source-only'
    so = walk_files(src) if src.exists() else {}
    if tree_hash(so) != freeze['sourceOnly']['treeHash']:
        raise KeAuditError('inputs/source-only changed after the freeze (the oracle is no longer bound to its source)')
    br = freeze.get('brief')
    if br and (not Path(br['path']).exists() or sha_file(br['path']) != br['sha256']):
        raise KeAuditError('the brief/specifics bound at freeze changed')
    if not br:
        res.limit('freeze', 'no brief/specifics sha was bound at freeze')
    # gate 2: manifest
    man_bytes = P['manifest'].read_bytes()
    if sha_bytes(man_bytes) != freeze['manifestSha256']:
        raise KeAuditError('manifest sha != freeze.manifestSha256')
    man = read_json(P['manifest'])
    # gate 3: regenerate view + map from released CEL with the manifest seed
    if man.get('mode', 'strict') != freeze.get('mode', 'strict') and not backtest:
        raise KeAuditError('manifest mode differs from the freeze mode')
    frozen_view_bytes = P['view'].read_bytes()
    if sha_bytes(frozen_view_bytes) != freeze['viewSha256']:
        raise KeAuditError('executor view changed after freeze (sha mismatch)')
    frozen_view = read_json(P['view'])
    view_bytes, amap, cels = V.build(artifact, man['seed'], r, simple=man.get('mode') == 'simple', schema=frozen_view.get('schema'))
    if view_bytes != frozen_view_bytes:
        raise KeAuditError('regenerated executor view differs from the frozen view')
    if amap != man['aliases']:
        raise KeAuditError('regenerated alias map differs from the manifest map')
    for role in ('crl', 'mv', 'regression', 'package.json'):
        f = man['files'][role]
        if sha_file(artifact / f['path']) != f['sha256']:
            raise KeAuditError(f'{role} changed since the manifest was written')
    # gates 4-6: evidence. Live rounds: every lead evidence dir must lie inside a released tree, so gate 1 bound it
    if P['release'].exists():
        released = [norm(t['path']) for t in read_json(P['release']).get('trees', {}).values()]
        for d in evidence_dirs:
            nd = norm(d)
            under_exec = nd.startswith(norm(ws / 'executor') + '/')
            if not under_exec and not any(nd.startswith(r + '/') for r in released):
                raise KeAuditError(f'evidence dir {d} is outside the released trees (post-release evidence needs a new round)')
    ev = Evidence(evidence_dirs, ws, res, man['package'])
    for rcd in ev.receipts:
        rh = role_hashes(rcd['receipt'], artifact)
        for role, h in rh.items():
            if h != man['files'][role]['sha256']:
                raise KeAuditError(f'{rcd["dir"]}: receipt {role} hash differs from the frozen candidate (stale or mixed evidence)')
    cap = sha_file(PIPELINE / 'capture.cjs')
    if cap != CAPTURE_CJS_SHA256:  # the tool is not qualified for this capture: integrity (exit 2), not a check failure
        raise KeAuditError(f'capture.cjs {cap[:12]} is not the qualified {CAPTURE_CJS_SHA256[:12]}: re-qualify ke-audit before trusting native parsing')
    res.limit('gate5-capture', 'capture.cjs is checked as the current file; evidence does not record which capture produced it')
    # gate 7: closure
    pre = Path(man['preEmitInventory']['path'])
    closure_now = V.closure(artifact, artifact / man['files']['crl']['path'], {s: artifact / man['files'][s]['path'] for s in ('mv', 'regression')})
    if closure_now != man['closure']:
        diff = sorted(set(closure_now.items()) ^ set(man['closure'].items()))[:5]
        raise KeAuditError(f'execution-input closure changed since the manifest: {diff}')
    ok_pre, why = False, 'missing, unbound or rooted elsewhere'
    if pre.exists() and man['preEmitInventory']['sha256'] == sha_file(pre):
        inv = read_json(pre)
        if norm(inv.get('root')) == norm(artifact):
            fixed = {man['files'][s]['path'] for s in ('mv', 'regression', 'package.json')}
            proj = {f['path']: f['sha256'] for f in inv.get('files', [])
                    if f['path'] in fixed or f['path'].startswith(('src/crl/', 'node_modules/'))}
            if proj == man['closure']:
                ok_pre = True
            else:
                diff = sorted(set(proj.items()) ^ set(man['closure'].items()))[:5]
                why = f'closure differs from the manifest closure (both directions): {diff}'
                if not backtest:
                    raise KeAuditError(f'pre-emit {why}')
    if not ok_pre:
        if backtest:
            res.limit('gate7-closure', f'pre-emit inventory {why} (backtest): unrecorded')
        else:
            raise KeAuditError(f'pre-emit inventory {why}')
    # coverage: suites executed, from receipts only
    for need, label in (('native', 'MV native'), ('controls', 'regression native'), ('final', 'FINAL')):
        if not ev.stage(need):
            res.fail('coverage', f'{label} stage absent from evidence')
    if not ev.stage('cre') and not ev.stage('controls'):
        res.fail('coverage', 'no CRE evidence')
    res.data.update({'blindness': blind, 'evidence': [{'dir': x['dir'], 'producer': x['producer'], 'receiptSha256': x['sha256']} for x in ev.receipts]})
    return res, {'freeze': freeze, 'manifest': man, 'aliases': amap, 'cels': cels, 'evidence': ev, 'blindness': blind}
