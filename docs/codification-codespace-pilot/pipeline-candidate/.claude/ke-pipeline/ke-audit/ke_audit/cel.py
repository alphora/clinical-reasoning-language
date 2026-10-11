"""Strict CEL parser (DESIGN §3/§8.5). Unsupported syntax is a KeAuditError naming the line (184-R24/183-R15).

Returns facts, cases (with display names and result lines kept separately so callers can mask them)."""
import re
from pathlib import Path

from .util import KeAuditError

_Q = r'"((?:[^"\\]|\\.)*)"'
_RX = {
    'library': re.compile(rf'^library {_Q}\.$'),
    'covers': re.compile(rf'^covers {_Q}\.$'),
    'fact': re.compile(rf'^fact {_Q}:$'),
    'case': re.compile(rf'^case {_Q}:$'),
    'name': re.compile(rf'^- name is {_Q}\.$'),
    'birth': re.compile(rf'^- birth date is {_Q}\.$'),
    'date': re.compile(rf'^- date is {_Q}\.$'),
    'value': re.compile(r'^- value is (.+)\.$'),
    'defrequest': re.compile(r'^- defined by \"(MedicationRequest|ServiceRequest)\"\.$'),
    'requestcode': re.compile(rf'^- code is {_Q}\.$'),
    'defpat': re.compile(r'^- defined by "Patient"\.$'),
    'defcon': re.compile(rf'^- defined by {_Q}\.{_Q}\.$'),
    'id': re.compile(rf'^- id is {_Q}\.$'),
    'subject': re.compile(rf'^- subject is {_Q}\.$'),
    'factref': re.compile(rf'^- fact is {_Q}\.$'),
    'result': re.compile(rf'^- result is {_Q} is (?:{_Q}|(pause))\.$'),
}


def parse_value(s):
    s = s.strip()
    if s == 'true':
        return {'boolean': True}
    if s == 'false':
        return {'boolean': False}
    m = re.fullmatch(r'"((?:[^"\\]|\\.)*)"', s)
    if m:
        return {'code': m.group(1)}
    m = re.fullmatch(r"(-?[0-9]+(?:\.[0-9]+)?)\s*'([^']+)'", s)
    if m:
        return {'quantity': float(m.group(1)), 'unit': m.group(2)}
    m = re.fullmatch(r'-?[0-9]+(?:\.[0-9]+)?', s)
    if m:
        return {'number': float(s)}
    raise ValueError(s)


def parse(path):
    """{'library','covers','facts':{name:{...}},'cases':[{display,id,subject,facts,result,line}]}"""
    path = Path(path)
    lib = covers = None
    facts, cases = {}, []
    cur, kind = None, None
    for ln, raw in enumerate(path.read_text(encoding='utf-8-sig').splitlines(), 1):
        s = raw.strip()
        if not s or s.startswith('#') or s.startswith('//'):
            continue

        def bad(why='unsupported CEL syntax'):
            raise KeAuditError(f'{path}:{ln}: {why}: {s[:160]}')
        m = _RX['library'].match(s)
        if m:
            lib, cur, kind = m.group(1), None, None
            continue
        m = _RX['covers'].match(s)
        if m:
            covers, cur, kind = m.group(1), None, None
            continue
        m = _RX['fact'].match(s)
        if m:
            if m.group(1) in facts:
                bad('duplicate fact name')
            cur, kind = {'name': m.group(1), 'line': ln}, 'fact'
            facts[m.group(1)] = cur
            continue
        m = _RX['case'].match(s)
        if m:
            cur, kind = {'display': m.group(1), 'id': None, 'subject': None, 'facts': [], 'result': None, 'line': ln}, 'case'
            cases.append(cur)
            continue
        if cur is None or not s.startswith('- '):
            bad()
        if kind == 'fact':
            if (m := _RX['name'].match(s)):
                cur['label'] = m.group(1)
            elif (m := _RX['birth'].match(s)):
                cur['birthDate'] = m.group(1)
            elif (m := _RX['date'].match(s)):
                cur['date'] = m.group(1)
            elif (m := _RX['value'].match(s)):
                try:
                    cur['value'] = parse_value(m.group(1))
                except ValueError:
                    bad('unsupported value')
            elif (m := _RX['defrequest'].match(s)):
                if 'resourceType' in cur:
                    bad('duplicate request type')
                cur['resourceType'] = m.group(1)
            elif (m := _RX['requestcode'].match(s)):
                if 'requestCode' in cur:
                    bad('duplicate request code')
                parts = m.group(1).split('|')
                if len(parts) != 2 or not all(parts):
                    bad('request code needs system|code')
                cur['requestCode'] = {'system': parts[0], 'code': parts[1]}
            elif _RX['defpat'].match(s):
                cur['patient'] = True
            elif (m := _RX['defcon'].match(s)):
                cur['library'], cur['concept'] = m.group(1), m.group(2)
            else:
                bad()
        else:
            if (m := _RX['id'].match(s)):
                cur['id'] = m.group(1)
            elif (m := _RX['subject'].match(s)):
                cur['subject'] = m.group(1)
            elif (m := _RX['factref'].match(s)):
                cur['facts'].append(m.group(1))
            elif (m := _RX['result'].match(s)):
                cur['result'] = {'decision': m.group(1), 'value': 'pause' if m.group(3) else m.group(2)}
            else:
                bad()
    ids = set()
    for c in cases:
        where = f'{path}:{c["line"]}'
        if not c['id']:
            raise KeAuditError(f'{where}: case has no "- id is" line')
        if c['id'] in ids:
            raise KeAuditError(f'{where}: duplicate case id {c["id"]!r}')
        ids.add(c['id'])
        if c['subject'] is not None and not facts.get(c['subject'], {}).get('patient'):
            raise KeAuditError(f'{where}: subject {c["subject"]!r} is not a Patient fact')
        for f in c['facts']:
            if f not in facts or facts[f].get('patient'):
                raise KeAuditError(f'{where}: fact {f!r} is undefined or a Patient fact')
    for f in facts.values():
        if 'resourceType' in f or 'requestCode' in f:
            if 'resourceType' not in f or 'requestCode' not in f or any(k in f for k in ('patient', 'concept', 'library', 'value', 'birthDate', 'label')):
                raise KeAuditError(f'{path}:{f["line"]}: malformed request fact')
            continue
        if not f.get('patient') and not ('concept' in f and 'value' in f):
            raise KeAuditError(f'{path}:{f["line"]}: fact {f["name"]!r} lacks value or defined-by concept')
    return {'library': lib, 'covers': covers, 'facts': facts, 'cases': cases, 'path': str(path)}


def case_facts(parsed, case):
    """Masked, typed fact view of one case: no display name, no result, no fact labels."""
    subj = parsed['facts'].get(case['subject']) if case['subject'] else None
    rows, requests = [], []
    for fname in case['facts']:
        f = parsed['facts'][fname]
        if 'resourceType' in f:
            requests.append({k: f.get(k) for k in ('resourceType', 'requestCode', 'date')})
            continue
        rows.append({'concept': f['concept'], 'library': f['library'], 'value': f['value'], 'date': f.get('date')})
    rows.sort(key=lambda r: (r['concept'], repr(sorted(r['value'].items())), r['date'] or ''))
    result = {'subjectBirthDate': subj.get('birthDate') if subj else None, 'facts': rows}
    if requests:
        requests.sort(key=lambda r: (r['resourceType'], r['requestCode']['system'], r['requestCode']['code'], r['date'] or ''))
        result['requests'] = requests
    return result
