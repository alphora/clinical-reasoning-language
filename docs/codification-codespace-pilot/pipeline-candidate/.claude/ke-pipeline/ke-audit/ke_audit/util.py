"""Shared helpers: canonical JSON, atomic writes, hashing, strict JSON loading, path normalization, lstat tree walks."""
import hashlib
import json
import os
import stat
import tempfile
from pathlib import Path

VERSION = 'ke-audit-initial-implementation/1.0.5'
EXPECTATIONS_SCHEMA = 'ke-audit-initial-expectations/1'
VIEW_SCHEMA = 'ke-audit-initial-view/2'
LEGACY_VIEW_SCHEMA = 'ke-audit-initial-view/1'
MANIFEST_SCHEMA = 'ke-audit-manifest/1'
FREEZE_SCHEMA = 'ke-audit-freeze/1'
RELEASE_SCHEMA = 'ke-audit-release/1'
GEN = ('src/cql/', 'src/fhir/', 'tests/data/fhir/', 'tests/results/')
# capture.cjs sha256 the native-exchange parser was qualified against (DESIGN §5 gate 5). A different capture.cjs
# means re-qualification (private qualification controls + back-tests), then updating this constant.
CAPTURE_CJS_SHA256 = '5fc18b7d300936c7d648fee8ff002a01c06cd23585bdbf90a063d60db441046f'
_binding = json.loads((Path(__file__).resolve().parents[2] / 'customer-binding.json').read_text(encoding='utf-8'))
if _binding.get('schemaVersion') != 1 or not isinstance(_binding.get('outcomes'), dict) or not _binding['outcomes']:
    raise ValueError('invalid customer-binding.json outcomes')
OUTCOMES = _binding['outcomes']
X12_BY_ACTIVITY = _binding.get('x12ByActivity', {})
if not isinstance(X12_BY_ACTIVITY, dict):
    raise ValueError('invalid customer-binding.json x12ByActivity')
DETERMINATION_RESOURCE_TYPE = _binding.get('determinationResourceType')
if DETERMINATION_RESOURCE_TYPE not in ('Task', 'CommunicationRequest'):
    raise ValueError('invalid customer-binding.json determinationResourceType')


class KeAuditError(Exception):
    """Usage / schema / integrity error: exit 2."""


def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def sha_bytes(b):
    return hashlib.sha256(b).hexdigest()


def sha_file(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def _no_dupes(pairs):
    d = {}
    for k, v in pairs:
        if k in d:
            raise KeAuditError(f'duplicate JSON key {k!r}')
        d[k] = v
    return d


def read_json(p, strict=True):
    text = Path(p).read_text(encoding='utf-8-sig')
    try:
        return json.loads(text, object_pairs_hook=_no_dupes) if strict else json.loads(text)
    except json.JSONDecodeError as e:
        raise KeAuditError(f'malformed JSON {p}: {e}') from e


def write_atomic(p, data):
    """Write str/bytes atomically (temp file in the same directory, then replace)."""
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    b = data.encode('utf-8') if isinstance(data, str) else data
    fd, tmp = tempfile.mkstemp(dir=p.parent, prefix='.' + p.name + '.', suffix='.tmp')
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(b)
        os.replace(tmp, p)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def write_json(p, obj, canonical_form=False):
    write_atomic(p, (canonical(obj) if canonical_form else json.dumps(obj, indent=1, ensure_ascii=False, sort_keys=False)) + '\n')


def norm(p):
    """Normalized comparable path: absolute, forward slashes, case-folded (Windows)."""
    if p is None:
        return None
    return os.path.normpath(os.path.abspath(str(p))).replace('\\', '/').casefold()


def rel_posix(p, root):
    return os.path.relpath(os.path.abspath(p), os.path.abspath(root)).replace('\\', '/')


def is_link(entry_or_path):
    """True for symlinks and Windows junctions / reparse points."""
    if isinstance(entry_or_path, os.DirEntry):
        if entry_or_path.is_symlink() or (hasattr(entry_or_path, 'is_junction') and entry_or_path.is_junction()):
            return True
        st = entry_or_path.stat(follow_symlinks=False)
    else:
        st = os.lstat(entry_or_path)
    if stat.S_ISLNK(st.st_mode):
        return True
    attrs = getattr(st, 'st_file_attributes', 0)
    return bool(attrs & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0x400))


def walk_files(root, exclude=('.git',), reject_links=True):
    """{posix relpath: sha256} for every regular file under root; links fail closed (KeAuditError)."""
    root = Path(root)
    out, links = {}, []
    if root.exists() and is_link(root):
        raise KeAuditError(f'{root} is itself a symlink/junction')

    def rec(d):
        with os.scandir(d) as it:
            for e in it:
                if e.name in exclude:
                    continue
                if is_link(e):
                    links.append(e.path)
                    continue
                if e.is_dir(follow_symlinks=False):
                    rec(e.path)
                elif e.is_file(follow_symlinks=False):
                    out[rel_posix(e.path, root)] = sha_file(e.path)
    if root.is_file():
        return {root.name: sha_file(root)}
    if root.exists():
        rec(root)
    if links and reject_links:
        raise KeAuditError(f'symlink/junction under {root}: {links[:5]}')
    return out


def tree_hash(files):
    """ke-audit's own tree hash (DESIGN D7): sha256 of sorted '<path>:<sha>\\n' lines."""
    return sha_bytes(''.join(f'{p}:{files[p]}\n' for p in sorted(files)).encode('utf-8'))


def mcp_body(p):
    """(envelope-dict, decoded body or None) for a saved MCP tool response."""
    env = read_json(p)
    text = next((b.get('text') for b in env.get('content', []) or [] if b.get('type') == 'text'), None)
    body = None
    if text is not None:
        try:
            body = json.loads(text)
        except json.JSONDecodeError:
            body = None
    return env, body


def walk_resources(x):
    """Every dict carrying a resourceType, depth-first."""
    if isinstance(x, dict):
        if 'resourceType' in x:
            yield x
        for v in x.values():
            yield from walk_resources(v)
    elif isinstance(x, list):
        for v in x:
            yield from walk_resources(v)


def flat_items(items, parents=()):
    for it in items or []:
        yield it, parents
        yield from flat_items(it.get('item'), parents + (it,))


def slug(activity_key):
    return activity_key.lower().replace('.', '-')


class Result:
    """Per-check result. status: pass | fail | needs-lead (derived)."""

    def __init__(self, name):
        self.name, self.failures, self.needs_lead, self.lead_resolved, self.limitations, self.data = name, [], [], [], [], {}
        self.flagged = []  # handed to humans as KE review flags (medical validation); not a failure, not a pass

    def fail(self, *item):
        self.failures.append(list(item))

    def limit(self, *item):
        self.limitations.append(list(item))

    @property
    def status(self):
        if self.failures:
            return 'fail'
        if self.needs_lead:
            return 'needs-lead'
        if self.flagged:
            return 'pass-with-flags'
        if self.lead_resolved:
            return 'pass-with-lead-resolutions'
        return 'pass'

    def to_json(self):
        return {'check': self.name, 'status': self.status, 'failures': self.failures, 'needsLead': self.needs_lead,
                'leadResolved': self.lead_resolved, 'flagged': self.flagged, 'limitations': self.limitations, **self.data}
