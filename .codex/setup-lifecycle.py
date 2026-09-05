"""Install this checkout's local Codex lifecycle and CRL MCP configuration."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent


def atomic(path, content):
    if path.exists() and path.read_bytes() == content:
        return
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as f:
        f.write(content)
        temporary = f.name
    os.replace(temporary, path)


def main():
    if os.name != 'nt' or sys.version_info < (3, 12):
        raise ValueError('This local lifecycle installer requires Windows and Python 3.12 or newer.')
    import tomllib
    config_path = ROOT / '.codex/config.toml'
    original_bytes = config_path.read_bytes()
    original = original_bytes.decode('utf-8')
    config = tomllib.loads(original)
    crl = json.loads((ROOT / '.mcp.json').read_text())['mcpServers']['crl']
    desired = {k: crl[k] for k in ('command', 'args') if k in crl}
    desired['env'] = crl.get('env', {})
    desired['cwd'] = str(ROOT)
    existing = config.get('mcp_servers', {}).get('crl')
    if existing is not None and existing != desired:
        raise ValueError('Existing Codex CRL configuration differs; reconcile it explicitly.')
    if not Path(crl['args'][0]).is_file():
        raise ValueError('Installed CRL MCP entry point is missing.')
    mail = config['mcp_servers']['vibe-mail']
    settings_path = ROOT / '.claude/settings.local.json'
    if not settings_path.is_file():
        raise ValueError('Configure this checkout\'s .claude/settings.local.json hook paths before installation.')
    settings = json.loads(settings_path.read_text())
    commands = [h['command'] for groups in settings.get('hooks', {}).values()
                for group in groups for h in group.get('hooks', []) if 'command' in h]
    memory_matches = [re.search(r'commit-memory\.sh"\s+"([^"]+)"', c) for c in commands]
    memory = next((Path(m.group(1)).resolve() for m in memory_matches if m), None)
    renew_matches = [re.search(r'^node\s+(.+?)\s+renew\s', c) for c in commands]
    renew = next((Path(m.group(1).strip('"')).resolve() for m in renew_matches if m), None)
    if memory is None or renew is None:
        raise ValueError('Local Claude hooks must specify the project memory path and mail renewal helper.')
    git = shutil.which('git')
    node = shutil.which('node')
    if not git or not node or not memory.is_dir() or not renew.is_file():
        raise ValueError('Required Git, Node, memory store, or mail renewal helper is missing.')
    git_exec = subprocess.check_output([git, '--exec-path'], text=True).strip()
    bash = Path(git_exec).resolve().parents[2] / 'bin/bash.exe'
    if not bash.is_file():
        raise ValueError('Git Bash is missing; do not substitute WSL bash.')
    history = memory.parent / 'codex-memory-history.git'
    if history.exists():
        if subprocess.check_output([git, '--git-dir', str(history), 'rev-parse', '--is-bare-repository'], text=True).strip() != 'true':
            raise ValueError('Snapshot destination is not a bare Git repository.')
    else:
        subprocess.run([git, 'init', '--bare', str(history)], check=True, capture_output=True)
    local = dict(memoryRoot=str(memory), historyRoot=str(history), git=git, node=node,
                 bash=str(bash), mail={k: mail[k] for k in ('command', 'args', 'env', 'env_vars') if k in mail},
                 renew=str(renew))
    hook_command = f'"{sys.executable}" "{ROOT / ".codex/hooks/lifecycle.py"}"'
    hooks = {}
    for event in ('SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'):
        group = {'hooks': [{'type': 'command', 'command': hook_command, 'timeout': 45 if event == 'SessionStart' else 25}]}
        hooks[event] = [group]
    hooks_path = ROOT / '.codex/hooks.json'
    encoded_hooks = (json.dumps({'hooks': hooks}, indent=2) + '\n').encode()
    if hooks_path.exists() and hooks_path.read_bytes() != encoded_hooks:
        raise ValueError('Existing hooks.json differs; reconcile it explicitly before setup.')
    if existing is None:
        addition = '\n[mcp_servers.crl]\n' + ''.join(f'{k} = {json.dumps(v)}\n' for k, v in desired.items() if k != 'env')
        addition += '\n[mcp_servers.crl.env]\n' + ''.join(f'{json.dumps(k)} = {json.dumps(v)}\n' for k, v in desired.get('env', {}).items())
        candidate = original + addition
        tomllib.loads(candidate)
        if config_path.read_bytes() != original_bytes:
            raise ValueError('Codex configuration changed during setup; rerun against the new configuration.')
        backup = Path(os.environ['LOCALAPPDATA']) / 'crl-codex/config-backups'
        backup.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=backup, suffix='.toml', delete=False) as f:
            f.write(original_bytes)
        atomic(config_path, candidate.encode())
    atomic(ROOT / '.codex/lifecycle.local.json', (json.dumps(local, indent=2) + '\n').encode())
    atomic(hooks_path, encoded_hooks)
    print('Local lifecycle definitions and CRL MCP configured. Check /hooks trust and runtime activation.')


if __name__ == '__main__':
    main()
