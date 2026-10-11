"""ke-audit command line (DESIGN §3, §7). Exit 0 pass / 1 check failed or needs-lead / 2 usage-schema-integrity."""
import argparse
import sys
from pathlib import Path

from . import checks_exec as X
from . import checks_static as S
from . import gates, guard, ledger, model, view
from .util import VERSION, KeAuditError, norm, sha_file, write_atomic, write_json

CHECKS = ('cre', 'native', 'casedata', 'assoc', 'trees', 'outcome', 'conjuncts', 'final', 'disagreements')


def _prior_round(ws, r, ctx):
    """changedFromPriorRound per case, when round r-1 was frozen through this tool."""
    if r < 2:
        return {}
    P = view.paths(ws, r - 1)
    if not (P['freeze'].exists() and P['manifest'].exists()):
        return {}
    from .util import read_json, sha_file
    fr = read_json(P['freeze'])
    if sha_file(P['manifest']) != fr['manifestSha256']:
        raise KeAuditError(f'round {r - 1} manifest does not match its freeze')
    amap = read_json(P['manifest'])['aliases']
    old = {tuple(amap[a]): c for a, c in fr['expectationsContent']['cases'].items()}
    new = X.oracle(ctx)
    return {k: ('added' if k not in old else 'changed') for k in new if old.get(k) != new[k]}


def cmd_all(a):
    ws, art, r = Path(a.workspace), Path(a.artifact), a.round
    out = Path(a.out)
    for forbidden in (art, *[Path(e) for e in a.evidence]):
        if norm(out).startswith(norm(forbidden) + '/') or norm(out) == norm(forbidden):
            raise KeAuditError(f'--out must not be inside {forbidden}')
    g, ctx = gates.run(ws, r, art, a.evidence, backtest=a.backtest, simple=a.simple)
    ctx.update({'ws': str(ws), 'artifact': str(art), 'freezeSha': sha_file(view.paths(ws, r)['freeze'])})
    m = model.load(art, out / 'model', art / ctx['manifest']['files']['crl']['path'])
    if m.crl_sha != ctx['manifest']['files']['crl']['sha256']:
        raise KeAuditError('CRL used for the AST differs from the frozen candidate')
    parsed = X.cel_suites(ctx)
    only = a.only.split(',') if a.only else list(CHECKS)
    unknown = [c for c in only if c not in CHECKS]
    if unknown:
        raise KeAuditError(f'--only names unknown checks {unknown}; valid: {list(CHECKS)}')
    partial = set(only) != set(CHECKS)
    results = [g]
    run = {'cre': lambda: X.check_cre(ctx, m), 'native': lambda: X.check_native(ctx, m, parsed),
           'casedata': lambda: X.check_casedata(ctx, m, parsed), 'assoc': lambda: X.check_assoc(ctx, m),
           'trees': lambda: S.check_trees(ctx, m, a.backtest), 'outcome': lambda: S.check_outcome(ctx, m),
           'conjuncts': lambda: S.check_conjuncts(ctx, m), 'final': lambda: S.check_final(ctx, m),
           'disagreements': lambda: S.check_disagreements(ctx, m)}
    order = [c for c in CHECKS if c in only]
    if ('conjuncts' in order or 'outcome' in order or 'assoc' in order or 'trees' in order) and 'native' not in order:
        order.insert(0, 'native')  # native outcomes feed conjuncts/outcome and no-questionnaire association checks
    for c in order:
        rr = run[c]()
        results.append(rr)
        write_json(out / f'{c}.json', rr.to_json())
    write_json(out / 'gates.json', g.to_json())
    changed = _prior_round(ws, r, ctx)
    cre = {}
    for x in next((q.data.get('rows', []) for q in results if q.name == 'cre'), []):  # every CRE source must agree
        k = (x['suite'], x['caseId'])
        cre[k] = {'ok': x.get('ok') is True and cre.get(k, {'ok': True})['ok']}
    nat = ctx.get('nativeRows', {})
    amap_inv = {tuple(v): k for k, v in ctx['aliases'].items()}
    orc = X.oracle(ctx)
    matrix = [{'suite': k[0], 'caseId': k[1], 'alias': amap_inv.get(k), 'expected': orc[k]['expect'],
               'creOk': cre.get(k, {}).get('ok'), 'nativeOk': nat.get(k, {}).get('ok'), 'native': ctx.get('nativeOutcomes', {}).get(k),
               'changedFromPriorRound': changed.get(k)} for k in sorted(orc)]
    write_json(out / 'matrix.json', matrix)
    statuses = {q.name: q.status for q in results}
    fail = any(q.failures for q in results if q.name != 'disagreements')
    needs = any(q.needs_lead for q in results)
    leadres = any(q.lead_resolved for q in results)
    flagged = any(q.flagged for q in results)
    status = 'fail' if fail else 'needs-lead' if needs else 'pass-with-flags' if flagged else 'pass-with-lead-resolutions' if leadres else 'pass'
    if partial and status in ('pass', 'pass-with-lead-resolutions', 'pass-with-flags', 'needs-lead'):
        status = 'incomplete'  # a subset run is never a verdict
    lim = [[q.name] + l for q in results for l in q.limitations]
    summary = {'tool': VERSION, 'round': r, 'status': status, 'blindness': ctx['blindness'], 'checks': statuses,
               'cases': len(matrix), 'creMismatch': sum(1 for x in matrix if x['creOk'] is not True),
               'nativeMismatch': sum(1 for x in matrix if x['nativeOk'] is not True), 'limitations': lim, 'partial': partial,
               'evidence': g.data.get('evidence'), 'backtest': a.backtest}
    write_json(out / 'summary.json', summary)
    lines = [f'ke-audit round {r}: {status.upper()} (blindness: {ctx["blindness"]}{", backtest" if a.backtest else ""})',
             f'cases {len(matrix)}; CRE mismatches {summary["creMismatch"]}; native mismatches {summary["nativeMismatch"]}',
             '  ' + ' '.join(f'{k}={v}' for k, v in statuses.items())]
    for q in results:
        for f in q.failures[:2]:
            lines.append(f'  ! {q.name}: {str(f)[:150]}')
        for n in q.needs_lead[:2]:
            lines.append(f'  ? {q.name}: {str(n)[:150]}')
        for n in q.flagged[:2]:
            lines.append(f'  F {q.name}: {str(n)[:150]}')
    lines.append(f'  limitations: {len(lim)}; outputs: {out}')
    text = '\n'.join(lines[:20])
    write_atomic(out / 'summary.txt', text + '\n')
    print(text)
    return 1 if status in ('fail', 'needs-lead', 'incomplete') else 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog='ke-audit', description=f'{VERSION}: shared independent-executor audit (see pipeline CONTRACT.md)')
    sp = ap.add_subparsers(dest='cmd', required=True)

    def ws(p, rnd=True):
        p.add_argument('--workspace', required=True)
        if rnd:
            p.add_argument('--round', type=int, required=True)
        return p
    p = ws(sp.add_parser('view', help='lead: alias-keyed executor view + held manifest'))
    p.add_argument('--artifact', required=True)
    p.add_argument('--seed')
    p.add_argument('--pre-emit')
    p.add_argument('--backtest', action='store_true', help='allow an artifact outside <ws>/artifact (historical back-test)')
    p.add_argument('--simple', action='store_true', help='simple mode: case ids as aliases, no hold/release (DESIGN D21)')
    p.set_defaults(fn=view.cmd_view)
    ws(sp.add_parser('hold', help='lead: move artifact/evidence/author/inputs-restricted under held/')).set_defaults(fn=view.cmd_hold)
    ws(sp.add_parser('release', help='lead: release held trees after the freeze')).set_defaults(fn=view.cmd_release)
    ws(sp.add_parser('recover', help='lead: roll back an interrupted hold / complete an interrupted release, then clear the lock')).set_defaults(fn=view.cmd_recover)
    p = ws(sp.add_parser('watch', help='lead: wait for the freeze, then release'))
    p.add_argument('--interval', type=float, default=5.0)
    p.set_defaults(fn=view.cmd_watch)
    p = ws(sp.add_parser('freeze', help='executor: bind expectations to the view and manifest sha'))
    p.add_argument('--manifest-sha', required=True)
    p.add_argument('--brief')
    p.add_argument('--refreeze', action='store_true')
    p.add_argument('--backtest', action='store_true', help='historical back-test only: no hold record may exist')
    p.add_argument('--simple', action='store_true', help='simple mode: no hold required (DESIGN D21)')
    p.add_argument('--reason')
    p.set_defaults(fn=view.cmd_freeze)
    p = ws(sp.add_parser('assess', help='executor: append a view to executor/assessment.jsonl'), rnd=False)
    for k in ('--key', '--evidence-sha', '--view', '--reason'):
        p.add_argument(k, required=True)
    p.set_defaults(fn=ledger.cmd_assess)
    p = ws(sp.add_parser('adjudicate', help='lead: append a resolution to usage/lead-adjudication.jsonl'), rnd=False)
    for k in ('--key', '--evidence-sha', '--resolution', '--reason'):
        p.add_argument(k, required=True)
    p.add_argument('--supersedes', type=int)
    p.add_argument('--flag-id', help='with --resolution flag: an existing KE review flag id in the artifact flag store')
    p.add_argument('--artifact', help='artifact root holding src/medical-validation/flags (default <ws>/artifact)')
    p.set_defaults(fn=ledger.cmd_adjudicate)
    p = ws(sp.add_parser('all', help='executor after release: gates + every check'))
    p.add_argument('--artifact', required=True)
    p.add_argument('--evidence', nargs='+', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--only')
    p.add_argument('--backtest', action='store_true')
    p.add_argument('--simple', action='store_true', help='audit a round frozen in simple mode (DESIGN D21)')
    p.set_defaults(fn=cmd_all)
    a = ap.parse_args(argv)
    try:
        return a.fn(a)
    except KeAuditError as e:
        print(f'ke-audit: INTEGRITY/USAGE ERROR (exit 2): {e}', file=sys.stderr)
        return 2
    except guard.GuardDenied as e:
        print(f'ke-audit: GUARD (exit 2): {e}', file=sys.stderr)
        return 2
    except Exception:  # a crashed audit must never read as a scored failure (exit 1)
        import traceback
        traceback.print_exc()
        print('ke-audit: INTERNAL ERROR (exit 2)', file=sys.stderr)
        return 2
