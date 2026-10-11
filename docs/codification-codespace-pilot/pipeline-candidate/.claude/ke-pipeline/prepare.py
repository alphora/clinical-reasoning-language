"""Neutral initial-run scaffold, author preflight and review packet preparation; no agent is launched."""
import argparse
import datetime
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def active_pins():
    accepted = read(ROOT / 'pins.json')
    local = ROOT.parents[1] / 'tmp/runtime/pins.local.json'
    if not local.exists():
        return accepted
    bound = read(local)
    for key in ('crlVersion', 'kitSchema', 'kitHash'):
        if bound.get(key) != accepted.get(key):
            raise ValueError('local runtime identity mismatch: ' + key)
    for key in ('server', 'driver', 'engine'):
        if bound.get(key, {}).get('sha256') != accepted.get(key, {}).get('sha256'):
            raise ValueError('local runtime identity mismatch: ' + key + '.sha256')
    return bound


def pin_identity(pins):
    return {key: pins[key] for key in ('crlVersion', 'kitSchema', 'kitHash')} | {
        key: {'sha256': pins[key]['sha256']} for key in ('server', 'driver', 'engine')
    }


REQUIRED_GUIDANCE = (
    'ke-method.binding.json',
    '.claude/ke-pipeline/customer-binding.json',
    '.claude/ke-pipeline/kit-235-reassessment.md',
    '.claude/skills/crl-initial-implementation-ke/SKILL.md',
    '.vibe-tools/protocols/ke-review-process.md',
)
NARRATIVE_GUIDANCE = (
    '.claude/skills/crl-initial-implementation-ke/references/source-decomposition-and-qualifiers.md',
    '.claude/skills/crl-initial-implementation-ke/references/initial-interview.md',
    '.claude/skills/crl-initial-implementation-ke/references/policy-document-structure.md',
    '.claude/skills/crl-initial-implementation-ke/references/answerability-and-scope.md',
    '.claude/skills/crl-initial-implementation-ke/references/completion-and-identity.md',
    '.claude/skills/crl-initial-implementation-ke/references/review-evidence-lessons.md',
)
SOURCE_TYPES = ('narrative-policy',)
PLACEHOLDER = re.compile(r'\{\{[^}\n]+\}\}|<(?:guidance(?: root)?|workspace|tooling|policy[_ -]?id|ws)>', re.I)
PACKET_PLACEHOLDER = re.compile(PLACEHOLDER.pattern + r'|<(?:policy|r)>', re.I)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def approved_customer(path=None):
    """Reject incomplete or ambiguous customer output and answer-domain contracts."""
    customer = read(path or ROOT / 'customer-binding.json')
    if customer.get('status') != 'approved':
        raise ValueError('customer binding is not approved')
    if not isinstance(customer.get('customer'), str) or not customer['customer'].strip():
        raise ValueError('customer binding needs a customer identity')
    base = customer.get('canonicalBase')
    if not isinstance(base, str) or not re.fullmatch(r'https?://[^/\s]+(?:/[^\s]*)?', base):
        raise ValueError('customer canonicalBase must be an approved absolute HTTP(S) base')
    outcomes = customer.get('outcomes')
    if not isinstance(outcomes, dict) or not outcomes:
        raise ValueError('customer outcomes must be an approved nonempty mapping')
    activities = []
    for label, activity in outcomes.items():
        if not isinstance(label, str) or not label.strip() or not isinstance(activity, str) or not re.fullmatch(r'[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', activity):
            raise ValueError('invalid outcome label or activity key: ' + str(label))
        activities.append(activity)
    if len(set(activities)) != len(activities):
        raise ValueError('two outcome labels map to one activity key')
    if customer.get('dispositionMode') not in ('standalone', 'embedded'):
        raise ValueError('customer dispositionMode must be standalone or embedded')
    if customer.get('determinationResourceType') not in ('Task', 'CommunicationRequest'):
        raise ValueError('customer determinationResourceType must be Task or CommunicationRequest')
    domain = customer.get('answerDomain')
    if not isinstance(domain, dict) or set(domain) != {'defaultBinaryChoices', 'uncertainty'}:
        raise ValueError('customer answerDomain needs defaultBinaryChoices and uncertainty')
    binary = domain['defaultBinaryChoices']
    if binary is not None and (not isinstance(binary, list) or len(binary) != 2 or
                               any(not isinstance(x, str) or not x.strip() for x in binary) or
                               len(set(binary)) != 2):
        raise ValueError('customer defaultBinaryChoices must be null or two distinct labels')
    uncertainty = domain['uncertainty']
    if not isinstance(uncertainty, dict) or set(uncertainty) != {'mode', 'choices'}:
        raise ValueError('customer answerDomain.uncertainty needs mode and choices')
    mode, choices = uncertainty['mode'], uncertainty['choices']
    if mode not in ('none', 'source-defined', 'customer-defined') or not isinstance(choices, list) or any(
        not isinstance(x, str) or not x.strip() for x in choices
    ) or len(set(choices)) != len(choices) or (mode == 'customer-defined') != bool(choices):
        raise ValueError('invalid customer uncertainty mode/choices')
    if not isinstance(customer.get('authority'), list) or any(not isinstance(x, str) for x in customer['authority']):
        raise ValueError('customer authority must be an explicit path list')
    return customer


def check_request_fixtures(artifact):
    """Check the interactive client's required starting fixtures; never mutate the project."""
    art = Path(artifact).resolve()
    if not art.is_dir():
        raise ValueError('artifact must be an existing directory')
    root = art / 'tests/interactive-questionnaire'
    fields = {'ServiceRequest': 'subject', 'NutritionOrder': 'patient',
              'MedicationRequest': 'subject', 'CommunicationRequest': 'subject', 'Task': 'for'}
    coded_request_fields = {'ServiceRequest': 'code', 'MedicationRequest': 'medicationCodeableConcept'}

    def inside(path):
        if not path.resolve().is_relative_to(art):
            raise ValueError('fixture path escapes artifact: ' + str(path))

    def non_json(value):
        raise ValueError('non-JSON constant: ' + value)

    inside(root)
    if not root.is_dir():
        raise ValueError('required fixture: tests/interactive-questionnaire/request-1/request-bundle.json')
    folders = sorted((p for p in root.iterdir() if re.fullmatch(r'request-[1-9][0-9]*', p.name)),
                     key=lambda p: int(p.name[8:]))
    if not any(p.name == 'request-1' for p in folders):
        raise ValueError('required fixture: tests/interactive-questionnaire/request-1/request-bundle.json')
    results = []
    for folder in folders:
        file = folder / 'request-bundle.json'
        relative = file.relative_to(art).as_posix()
        try:
            inside(folder)
            if folder.is_symlink() or getattr(folder, 'is_junction', lambda: False)() or not folder.is_dir():
                raise ValueError('expected a regular request directory')
            inside(file)
            if file.is_symlink() or not file.is_file():
                raise ValueError('required regular file request-bundle.json (bundle.json is not discovered)')
            if file.stat().st_size > 16 * 1024 * 1024:
                raise ValueError('request-bundle.json exceeds 16 MiB')
            raw = file.read_bytes()
            # Match the client's JSON.parse(UTF-8 text), not BOM-tolerant manifest reads.
            bundle = json.loads(raw.decode('utf-8'), parse_constant=non_json)
            if not isinstance(bundle, dict) or bundle.get('resourceType') != 'Bundle' or bundle.get('type') != 'collection' or not isinstance(bundle.get('entry'), list):
                raise ValueError('expected a collection Bundle with resource entries')
            resources = [e.get('resource') if isinstance(e, dict) else None for e in bundle['entry']]
            if any(not isinstance(r, dict) or not isinstance(r.get('resourceType'), str) or not r['resourceType'] for r in resources):
                raise ValueError('every Bundle entry must contain a resource')
            patients = [r for r in resources if r['resourceType'] == 'Patient']
            if len(patients) != 1 or not isinstance(patients[0].get('id'), str) or not re.fullmatch(r'[A-Za-z0-9.-]{1,64}', patients[0]['id']):
                raise ValueError('supply exactly one Patient with a FHIR id')
            subject = 'Patient/' + patients[0]['id']
            requests = [r for r in resources if r['resourceType'] in fields]
            if not requests:
                raise ValueError('supply at least one supported request: ' + ', '.join(fields))
            identities = set()
            for resource in resources:
                if resource['resourceType'] in ('Observation', 'Condition', 'Questionnaire', 'QuestionnaireResponse'):
                    raise ValueError('initial fixtures must not contain clinical answers or Q/QR')
                if resource.get('id'):
                    if not isinstance(resource['id'], str):
                        raise ValueError('resource id must be a string')
                    identity = (resource['resourceType'], resource['id'])
                    if identity in identities:
                        raise ValueError('duplicate resource identity: ' + '/'.join(identity))
                    identities.add(identity)
            request_codings = []
            for request in requests:
                field = fields[request['resourceType']]
                reference = request.get(field)
                if not isinstance(reference, dict) or reference.get('reference') != subject:
                    raise ValueError(request['resourceType'] + '.' + field + ' must reference ' + subject)
                code_field = coded_request_fields.get(request['resourceType'])
                if code_field:
                    concept = request.get(code_field)
                    codings = concept.get('coding') if isinstance(concept, dict) else None
                    if not isinstance(codings, list) or not codings or any(
                        not isinstance(c, dict) or not isinstance(c.get('system'), str) or not c['system']
                        or not isinstance(c.get('code'), str) or not c['code'] for c in codings
                    ):
                        raise ValueError(request['resourceType'] + '.' + code_field +
                                         ' must contain a system/code coding (external or policy-local)')
                    request_codings.append({'resourceType': request['resourceType'], 'id': request.get('id'),
                                            'codings': [{'system': c['system'], 'code': c['code']} for c in codings]})
            results.append({'path': relative, 'sha256': hashlib.sha256(raw).hexdigest(),
                            'subject': subject, 'requestTypes': [r['resourceType'] for r in requests],
                            'requestCodings': request_codings})
        except (ValueError, OSError) as e:
            raise ValueError(relative + ': ' + str(e)) from e
    return {'status': 'pass', 'artifact': art.as_posix(), 'fixtures': results,
            'scope': 'interactive starting-fixture discovery, structure and nonempty system/code for ServiceRequest/MedicationRequest only; source code selection, FHIR conformance, emission and native/client behavior require their existing checks'}


def scoped(root, relative):
    path = Path(relative)
    if path.is_absolute() or '..' in path.parts:
        raise ValueError('expected a workspace-relative path: ' + str(relative))
    target = (root / path).resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError('path escapes workspace: ' + str(relative))
    return target


def scaffold(workspace, policy_id, policy_date):
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', policy_id):
        raise ValueError('id must be a lowercase package identifier, e.g. synthetic-policy')
    datetime.date.fromisoformat(policy_date)
    art = Path(workspace) / 'artifact'
    if art.exists() and any(art.iterdir()):
        raise ValueError('artifact must be absent or empty; never overwrite an existing candidate')
    customer = approved_customer()
    options = {}
    for label, activity in customer['outcomes'].items():
        category, name = activity.split('.', 1)
        options.setdefault(category, {})[name] = {'label': label}
    pkg = {
        'name': policy_id, 'version': '0.0.0', 'private': True,
        'crl': {
            'canonicalBase': customer['canonicalBase'],
            'status': 'draft', 'experimental': True, 'date': policy_date + 'T00:00:00.000Z',
            'libraries': ['src/crl/' + policy_id + '-medical-policy.crl'],
            'dispositions': {'mode': customer['dispositionMode'], 'options': options},
            'fhirDependencies': {'hl7.fhir.uv.cpg': '2.0.0', 'hl7.fhir.uv.crmi': '2.0.0-ballot'},
            'results': {'enabled': True}}}
    for name in ('src/source','src/refined-source','src/anchor-source','src/crl','src/cel/mv',
                 'src/cel/regression','src/provenance','tests/interactive-questionnaire/request-1'):
        (art / name).mkdir(parents=True, exist_ok=True)
    (art / 'package.json').write_text(json.dumps(pkg, indent=2) + '\n', encoding='utf-8')
    return pkg


def preflight(workspace, brief):
    """Check a source-first packet against explicit project and customer bindings."""
    ws = Path(workspace).resolve()
    manifest = read(ws / 'inputs/author-inputs.json')
    if manifest.get('schema') != 'ke-author-inputs/1' or manifest.get('taskKind') != 'initial-implementation':
        raise ValueError('expected initial-implementation ke-author-inputs/1 manifest')
    if manifest.get('sourceType') not in SOURCE_TYPES:
        raise ValueError('manifest sourceType must be narrative-policy')
    if Path(manifest['workspace']).resolve() != ws:
        raise ValueError('manifest workspace differs from launch workspace')
    listed = {}
    for key in ('sourceAllowlist', 'guidanceAllowlist', 'artifactSeed'):
        rows = manifest.get(key)
        if not isinstance(rows, list) or not rows:
            raise ValueError('missing ' + key)
        for row in rows:
            path = scoped(ws, row['path'])
            if path in listed or not path.is_file() or digest(path) != row['sha256']:
                raise ValueError('missing, duplicate or changed allowlist file: ' + str(path))
            listed[path] = row['sha256']
            is_source = key == 'artifactSeed' and (path.is_relative_to(ws / 'artifact/src/source') or
                                                 path.is_relative_to(ws / 'artifact/src/refined-source'))
            if not is_source and path.suffix in ('.md', '.json') and PLACEHOLDER.search(path.read_text(encoding='utf-8-sig')):
                raise ValueError('unresolved placeholder: ' + str(path))
    for folder, key in (('inputs/source-only', 'sourceAllowlist'),
                        ('guidance', 'guidanceAllowlist'), ('artifact', 'artifactSeed')):
        actual = {p.resolve() for p in (ws / folder).rglob('*') if p.is_file()}
        declared = {scoped(ws, row['path']) for row in manifest[key]}
        if actual != declared:
            raise ValueError('allowlist does not equal complete ' + folder + ' file inventory')
    assignment = Path(manifest['runAssignment']).resolve()
    if {scoped(ws, row['path']) for row in manifest['sourceAllowlist']} != {assignment}:
        raise ValueError('source-only packet must contain only the run assignment')
    guidance = ws / 'guidance'
    for name in REQUIRED_GUIDANCE + NARRATIVE_GUIDANCE:
        if (guidance / name).resolve() not in listed:
            raise ValueError('missing required staged guidance: ' + name)
    binding = read(guidance / 'ke-method.binding.json')
    if digest(guidance / 'ke-method.binding.json') != digest(ROOT / 'ke-method.binding.json'):
        raise ValueError('staged method binding differs from tooling binding')
    accepted = binding['acceptedMethod']
    method = scoped(guidance, accepted['location'])
    mp = method / 'manifest.json'
    if mp.resolve() not in listed or digest(mp) != accepted['manifestSha256']:
        raise ValueError('accepted method manifest changed or missing')
    for name, sha in read(mp)['files'].items():
        path = scoped(method, name)
        if path.resolve() not in listed or digest(path) != sha:
            raise ValueError('immutable accepted method file mismatch: ' + name)
    for profile in binding['profiles']:
        if scoped(guidance, profile['path']) not in listed:
            raise ValueError('unlisted staged profile: ' + profile['path'])
    customer = approved_customer()
    customer_path = '.claude/ke-pipeline/customer-binding.json'
    if digest(guidance / customer_path) != digest(ROOT / 'customer-binding.json'):
        raise ValueError('staged customer binding differs from tooling binding')
    if binding.get('project') != manifest.get('project') or customer.get('customer') != manifest.get('customer'):
        raise ValueError('project or customer binding differs from assignment')
    selected = manifest.get('customerDecisions')
    if not isinstance(selected, list):
        raise ValueError('customerDecisions must be an explicit list')
    selected_paths = set()
    selected_ids = set()
    for row in selected:
        if not isinstance(row, dict) or set(row) != {'path', 'sha256', 'idRevision'}:
            raise ValueError('invalid selected customer decision entry')
        rel = row['path']
        if not isinstance(rel, str) or not rel.startswith('.claude/ke-pipeline/customer-decisions/'):
            raise ValueError('invalid selected customer decision path')
        candidate = scoped(guidance, rel)
        if candidate in selected_paths or candidate not in listed or row['sha256'] != digest(candidate):
            raise ValueError('selected customer decision missing, duplicated or changed: ' + rel)
        if digest(ROOT.parents[1] / rel) != row['sha256']:
            raise ValueError('selected customer decision differs from tooling registry: ' + rel)
        decision = read(candidate)
        identity = str(decision.get('id')) + '@' + str(decision.get('revision'))
        if decision.get('id') in selected_ids or decision.get('status') != 'approved' or row['idRevision'] != identity:
            raise ValueError('duplicate, unapproved or unpinned customer decision: ' + rel)
        if decision.get('scope', {}).get('policyIds') != ['*']:
            raise ValueError('policy-specific decision belongs in prepared source: ' + rel)
        selected_ids.add(decision['id'])
        selected_paths.add(candidate)
    declared_authority = {scoped(guidance, rel) for rel in customer.get('authority', [])}
    if declared_authority != selected_paths:
        raise ValueError('customer authority differs from selected decisions')
    staged_decisions = {p.resolve() for p in (guidance / '.claude/ke-pipeline/customer-decisions').glob('*.json')}
    if staged_decisions != selected_paths:
        raise ValueError('staged customer decisions differ from explicit selection')
    if manifest.get('tooling', {}).get('customerBindingSha256') != digest(ROOT / 'customer-binding.json'):
        raise ValueError('launch manifest customer binding differs from pipeline')
    pins = active_pins()
    if manifest.get('tooling', {}).get('pins') != pin_identity(pins):
        raise ValueError('launch manifest pin identities differ from accepted pins')
    for key in ('server', 'driver', 'engine'):
        path = pins[key].get('path')
        if not path or path == 'BIND_LOCAL_RUNTIME':
            raise ValueError('CRL runtime is unbound; run bind-runtime.py first')
        resolved = Path(path)
        if not resolved.is_absolute():
            resolved = ROOT.parents[1] / resolved
        if digest(resolved) != pins[key]['sha256']:
            raise ValueError('runtime pin mismatch: ' + key)
    brief = Path(brief).resolve()
    if not brief.is_relative_to(ws) or not brief.is_file():
        raise ValueError('rendered author brief must exist within workspace')
    text = brief.read_text(encoding='utf-8-sig')
    if PACKET_PLACEHOLDER.search(text):
        raise ValueError('unresolved placeholder in rendered author brief')
    normalized = text.replace('\\', '/').casefold()
    for path in (ws, guidance, ROOT):
        if path.as_posix().casefold() not in normalized:
            raise ValueError('rendered author brief omits concrete path: ' + str(path))
    for row in manifest['artifactSeed']:
        rel = scoped(ws, row['path']).relative_to(ws / 'artifact').as_posix()
        if rel != 'package.json' and not rel.startswith(('src/source/', 'src/refined-source/')):
            raise ValueError('pre-existing candidate work in artifact seed: ' + rel)
    if (ws / 'author/FROZEN').exists():
        raise ValueError('author already ran; use a fresh workspace')
    pkg = read(ws / 'artifact/package.json')
    name = pkg['name']
    if pkg.get('crl', {}).get('libraries') != ['src/crl/' + name + '-medical-policy.crl']:
        raise ValueError('package entrypoint must name the authored CRL path')
    if pkg.get('crl', {}).get('canonicalBase') != customer['canonicalBase']:
        raise ValueError('package canonical differs from customer binding')
    expected_options = {}
    for label, activity in customer['outcomes'].items():
        category, name = activity.split('.', 1)
        expected_options.setdefault(category, {})[name] = {'label': label}
    if pkg.get('crl', {}).get('dispositions') != {'mode': customer['dispositionMode'],
                                                 'options': expected_options}:
        raise ValueError('package dispositions differ from customer binding')
    return {'status': 'pass', 'manifestSha256': digest(ws / 'inputs/author-inputs.json'),
            'briefSha256': digest(brief), 'filesVerified': len(listed),
            'scope': 'file identity, staged bindings, runtime pins and fresh seed; source interpretation and actual role access require lead inspection'}

def review_packet(workspace_root, policy_id, kind, revision, values_path):
    """Render one versioned packet inside the exact review root, without inventing evidence."""
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', policy_id):
        raise ValueError('id must be a lowercase package identifier')
    if kind not in ('decision', 'questionnaire'):
        raise ValueError('kind must be decision or questionnaire')
    if type(revision) is not int or revision < 1:
        raise ValueError('revision must be a positive integer')
    root = Path(workspace_root).resolve()
    if not root.is_dir():
        raise ValueError('review workspace_root must already exist')
    values = read(values_path)
    if not isinstance(values, dict) or any(not isinstance(k, str) or not isinstance(v, str) for k, v in values.items()):
        raise ValueError('packet values must be a JSON object of strings')
    if values.get('SOURCE_TYPE') not in SOURCE_TYPES:
        raise ValueError('packet values need SOURCE_TYPE: narrative-policy')
    bound = {'POLICY_ID': policy_id, 'WORKSPACE': root.as_posix(), 'REVIEW_ROOT': root.as_posix(),
             'REVIEW_REVISION': str(revision)}
    for key, value in bound.items():
        if key in values and values[key] != value:
            raise ValueError('packet value conflicts with bound ' + key)
    values.update(bound)
    if not values.get('GUIDANCE'):
        raise ValueError('packet values need GUIDANCE inside the review root')
    guidance = Path(values['GUIDANCE'])
    guidance = (guidance if guidance.is_absolute() else root / guidance).resolve()
    if not guidance.is_relative_to(root) or not guidance.is_dir():
        raise ValueError('GUIDANCE must be an existing directory inside the review root')
    selected_profile = NARRATIVE_GUIDANCE[0]
    if not (guidance / selected_profile).is_file():
        raise ValueError('selected source profile is missing from review guidance: ' + selected_profile)
    values['GUIDANCE'] = guidance.as_posix()
    template = 'judge-packet.md' if kind == 'decision' else 'questionnaire-packet.md'
    body = (ROOT / 'briefs' / template).read_text(encoding='utf-8')
    names = set(re.findall(r'\{\{([A-Z_]+)\}\}', body))
    missing = sorted(name for name in names if not values.get(name, '').strip())
    if missing:
        raise ValueError('missing packet values: ' + ', '.join(missing))
    if 'ROUND' in names and not re.fullmatch(r'[1-9][0-9]*', values['ROUND']):
        raise ValueError('ROUND must name a positive executor round')
    body = re.sub(r'\{\{([A-Z_]+)\}\}', lambda m: values[m[1]], body)
    if PACKET_PLACEHOLDER.search(body):
        raise ValueError('unresolved placeholder in review packet')
    suffix = 'judge-packet' if kind == 'decision' else 'lens2-input'
    relative = f'tmp/judge-packets/{policy_id}-r{revision}-{suffix}.md'
    target = scoped(root, relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    encoded = body.encode('utf-8')
    try:
        with target.open('xb') as stream:
            stream.write(encoded)
    except FileExistsError:
        if target.read_bytes() != encoded:
            raise ValueError('packet revision already exists with different bytes; use a new --revision')
    return {'status': 'prepared', 'workspace_root': root.as_posix(), 'packet': target.as_posix(),
            'sha256': digest(target), 'reference': relative,
            'reviewMessage': 'Read the complete review assignment in ' + relative + '.',
            'scope': 'template substitution and root-local packet identity; source fidelity, evidence completeness and role access require lead review'}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest='command', required=True)
    p = sub.add_parser('scaffold')
    p.add_argument('--workspace', required=True); p.add_argument('--id', required=True)
    p.add_argument('--policy-date', required=True)
    p = sub.add_parser('preflight')
    p.add_argument('--workspace', required=True); p.add_argument('--author-brief', required=True)
    p = sub.add_parser('check-request-fixtures')
    p.add_argument('--artifact', required=True)
    p = sub.add_parser('review-packet')
    p.add_argument('--workspace-root', required=True); p.add_argument('--id', required=True)
    p.add_argument('--kind', choices=('decision', 'questionnaire'), required=True)
    p.add_argument('--revision', type=int, required=True); p.add_argument('--values', required=True)
    args = ap.parse_args()
    try:
        if args.command == 'scaffold':
            result = scaffold(args.workspace, args.id, args.policy_date)
        elif args.command == 'preflight':
            result = preflight(args.workspace, args.author_brief)
        elif args.command == 'check-request-fixtures':
            result = check_request_fixtures(args.artifact)
        else:
            result = review_packet(args.workspace_root, args.id, args.kind, args.revision, args.values)
    except (ValueError, KeyError, OSError, TypeError) as e:
        ap.exit(2, 'preparation failed: ' + str(e) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
