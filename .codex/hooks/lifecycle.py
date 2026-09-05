"""Bounded Codex hooks. Local memory history never touches the source Git index."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]


def run(args, *, data=None, env=None, timeout=10):
    return subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          env=env, timeout=timeout, check=True).stdout


def snapshot(config, session, budget=12):
    source, history = Path(config['memoryRoot']), Path(config['historyRoot'])
    if not source.is_dir() or not history.is_dir() or source.is_symlink() or source.is_junction():
        raise ValueError('Memory snapshot source or history is unavailable.')
    started = time.monotonic()
    def check_deadline():
        if time.monotonic() - started >= budget:
            raise TimeoutError('Memory snapshot exceeded its execution budget.')
    files = []
    digest = hashlib.sha256()
    def traversal_error(error):
        raise error
    for parent, dirs, names in os.walk(source, followlinks=False, onerror=traversal_error):
        check_deadline()
        dirs[:] = sorted(d for d in dirs if d != '.git')
        for name in dirs + names:
            if (Path(parent) / name).is_symlink() or (Path(parent) / name).is_junction():
                raise ValueError('Memory snapshot refuses symbolic links.')
        for name in sorted(n for n in names if n != '.git'):
            check_deadline()
            p = Path(parent) / name
            rel, data = p.relative_to(source).as_posix(), p.read_bytes()
            digest.update(rel.encode() + b'\0' + hashlib.sha256(data).digest())
            files.append((rel, data))
    key = hashlib.sha256(session.encode()).hexdigest()
    cache = history / ('snapshot-' + key + '.json')
    ref = 'refs/heads/sessions/' + key
    git = [config['git'], '--git-dir', str(history)]
    clean_env = {k: v for k, v in os.environ.items() if not k.upper().startswith('GIT_')}
    def g(*args, data=None, env=None):
        for attempt in range(5):
            remaining = budget - (time.monotonic() - started)
            if remaining <= 0:
                raise TimeoutError('Memory snapshot exceeded its execution budget.')
            try:
                return run(git + list(args), data=data, env=env or clean_env, timeout=remaining).strip()
            except subprocess.CalledProcessError:
                # Windows can briefly deny a concurrent write of the same object.
                if attempt == 4 or not any(a in args for a in ('hash-object', 'write-tree', 'commit-tree')):
                    raise
                time.sleep(min(0.05 * (2 ** attempt), 0.4))
    def head():
        try:
            return g('rev-parse', '--verify', ref).decode()
        except subprocess.CalledProcessError:
            return None
    old = head()
    signature = digest.hexdigest()
    try:
        saved = json.loads(cache.read_text())
    except (OSError, ValueError):
        saved = {}
    if old and saved.get('head') == old and saved.get('digest') == signature:
        return old
    # A private temporary index is only used for the separate history repository.
    with tempfile.TemporaryDirectory(dir=history, prefix='index-') as directory:
        env = {**clean_env, 'GIT_INDEX_FILE': str(Path(directory) / 'index')}
        g('read-tree', '--empty', env=env)
        entries = []
        for name, data in files:
            blob = g('hash-object', '-w', '--stdin', data=data)
            entries.append(b'100644 ' + blob + b'\t' + name.encode() + b'\0')
        g('update-index', '-z', '--index-info', data=b''.join(entries), env=env)
        tree = g('write-tree', env=env).decode()
    for attempt in range(3):
        if old and g('rev-parse', old + '^{tree}').decode() == tree:
            new = old
            break
        parent = ['-p', old] if old else []
        new = g('-c', 'user.name=Codex memory observation', '-c', 'user.email=codex-memory@localhost',
                'commit-tree', tree, *parent, data=f'Observed memory for session {session}\n'.encode()).decode()
        try:
            g('update-ref', ref, new, old or '0' * 40)
            break
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
            lock = history / (ref + '.lock')
            if lock.exists() and (attempt == 2 or isinstance(error, subprocess.TimeoutExpired)):
                age = max(0, int(time.time() - lock.stat().st_mtime))
                raise RuntimeError(f'Memory history ref is locked (age {age}s). Inspect the Git writer before manually clearing a stale lock; no lock was removed.')
            if isinstance(error, subprocess.TimeoutExpired):
                raise
            time.sleep(0.05)
            old = head()
    else:
        raise RuntimeError('Memory history changed concurrently; snapshot could not be recorded.')
    with tempfile.NamedTemporaryFile(dir=history, delete=False) as f:
        f.write(json.dumps({'head': new, 'digest': signature}).encode())
        temp = f.name
    os.replace(temp, cache)
    return new


def main():
    started = time.monotonic()
    event = None
    messages = []
    def remaining(maximum):
        total = 42 if event == 'SessionStart' else 22
        value = min(maximum, total - (time.monotonic() - started))
        if value <= 0:
            raise TimeoutError('Lifecycle execution budget exhausted.')
        return value
    try:
        payload = json.load(sys.stdin)
        event = payload.get('hook_event_name')
        session = payload.get('session_id')
        if not isinstance(session, str) or not session.strip():
            raise ValueError('Hook payload lacks a runtime session_id; no mail identity was registered.')
        if event not in ('SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'):
            raise ValueError('Unknown lifecycle event.')
        config = json.loads((ROOT / '.codex/lifecycle.local.json').read_text())
        if event != 'UserPromptSubmit':
            try:
                snapshot(config, session, budget=remaining(12))
            except Exception as error:
                detail = str(error) if isinstance(error, (ValueError, RuntimeError)) else type(error).__name__
                messages.append('Memory snapshot failed: ' + detail + '. Preserve evidence manually.')
        if event == 'SessionStart':
            try:
                summary = run([config['bash'], str(ROOT / '.claude/hooks/refactor-state.sh'), str(ROOT)], timeout=remaining(20)).decode('utf-8', errors='replace')
                messages.append(summary[:6500])
                messages.append('Read CLAUDE.md project rules and tmp/REFACTORS-IN-FORCE.md before substantive work.')
            except Exception as error:
                messages.append('Refactor startup check failed: ' + type(error).__name__)
        if event in ('SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop'):
            try:
                allowance = remaining(10)
                if allowance < 2:
                    raise TimeoutError('Insufficient lifecycle budget for mail cleanup.')
                env = {**os.environ, 'CRL_MAIL_DEADLINE_MS': str(int((allowance - 1) * 1000))}
                result = run([config['node'], str(ROOT / '.codex/hooks/mail.mjs')],
                             data=json.dumps(payload).encode(), timeout=allowance, env=env).decode('utf-8')
                if result.strip():
                    messages.append(result.strip())
            except Exception as error:
                messages.append('Mail hook failed: ' + type(error).__name__ + '. Poll MCP manually.')
    except Exception as error:
        messages.append('Codex lifecycle unavailable: ' + str(error)[:250])
    context = '\n'.join(m for m in messages if m)[:10000]
    if not context:
        print('{}')
    elif event in ('SessionStart', 'UserPromptSubmit'):
        print(json.dumps({'hookSpecificOutput': {'hookEventName': event, 'additionalContext': context}}))
    else:
        print(json.dumps({'systemMessage': context}))


if __name__ == '__main__':
    main()
