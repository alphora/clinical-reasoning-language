import concurrent.futures
import importlib.util
import os
import json
import contextlib
import io
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('lifecycle', Path(__file__).with_name('lifecycle.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


@unittest.skipUnless(os.name == 'nt', 'Windows lifecycle integration')
class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.memory = self.root / 'memory'
        self.memory.mkdir()
        self.history = self.root / 'history.git'
        self.git = shutil.which('git')
        self.config = dict(memoryRoot=str(self.memory), historyRoot=str(self.history), git=self.git)
        subprocess.run([self.git, 'init', '--bare', str(self.history)], check=True, capture_output=True)
        subprocess.run([self.git, 'init', str(self.memory)], check=True, capture_output=True)
        self.file = self.memory / 'note.md'
        self.file.write_bytes(b'before')
        subprocess.run([self.git, '-C', str(self.memory), 'add', '.'], check=True)
        self.index = (self.memory / '.git/index').read_bytes()

    def show(self, commit):
        return subprocess.check_output([self.git, '--git-dir', str(self.history), 'show', commit + ':note.md'])

    def test_versions_idempotence_and_source_index_untouched(self):
        before = module.snapshot(self.config, 'session')
        self.assertEqual(before, module.snapshot(self.config, 'session'))
        stamp = self.file.stat()
        self.file.write_bytes(b'AFTERS')
        os.utime(self.file, ns=(stamp.st_atime_ns, stamp.st_mtime_ns))
        after = module.snapshot(self.config, 'session')
        self.assertNotEqual(before, after)
        self.assertEqual(b'before', self.show(before))
        self.assertEqual(b'AFTERS', self.show(after))
        self.assertEqual(self.index, (self.memory / '.git/index').read_bytes())
        self.assertFalse((self.memory / '.git/refs/heads/master').exists())

    def test_concurrent_snapshot_sessions_and_same_session(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            refs = list(pool.map(lambda s: module.snapshot(self.config, s), ['a', 'b', 'a']))
        for ref in refs:
            self.assertEqual(b'before', self.show(ref))
        self.assertEqual(self.index, (self.memory / '.git/index').read_bytes())

    def test_missing_history_is_visible(self):
        self.config['historyRoot'] = str(self.root / 'missing')
        with self.assertRaises(ValueError):
            module.snapshot(self.config, 'session')

    def test_directory_read_failure_preserves_history(self):
        before = module.snapshot(self.config, 'session')
        def broken_walk(*args, **kwargs):
            kwargs['onerror'](PermissionError('unreadable subtree'))
            return iter(())
        with patch.object(module.os, 'walk', broken_walk):
            with self.assertRaises(PermissionError):
                module.snapshot(self.config, 'session')
        self.assertEqual(before, module.snapshot(self.config, 'session'))

    def test_existing_ref_lock_is_reported_without_removal(self):
        before = module.snapshot(self.config, 'session')
        key = module.hashlib.sha256(b'session').hexdigest()
        lock = self.history / ('refs/heads/sessions/' + key + '.lock')
        lock.write_text('fixture lock')
        self.file.write_bytes(b'changed')
        with self.assertRaisesRegex(RuntimeError, 'ref is locked'):
            module.snapshot(self.config, 'session')
        self.assertTrue(lock.exists())
        self.assertEqual(b'before', self.show(before))

    def test_setup_without_crl_env_is_byte_idempotent(self):
        setup_spec = importlib.util.spec_from_file_location('setup', Path(__file__).parents[1] / 'setup-lifecycle.py')
        setup = importlib.util.module_from_spec(setup_spec)
        setup_spec.loader.exec_module(setup)
        fixture = self.root / 'setup-fixture'
        (fixture / '.codex').mkdir(parents=True)
        (fixture / '.claude').mkdir()
        dummy = fixture / 'server.mjs'
        dummy.write_text('')
        (fixture / '.mcp.json').write_text(json.dumps({'mcpServers': {'crl': {'command': 'node', 'args': [str(dummy)]}}}))
        (fixture / '.codex/config.toml').write_text('[mcp_servers.vibe-mail]\ncommand="node"\nargs=[]\n')
        commands = [f'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/commit-memory.sh" "{self.memory.as_posix()}"',
                    f'node {dummy.as_posix()} renew --format hook']
        (fixture / '.claude/settings.local.json').write_text(json.dumps({'hooks': {'Stop': [{'hooks': [{'command': c} for c in commands]}]}}))
        with patch.object(setup, 'ROOT', fixture), patch.dict(os.environ, {'LOCALAPPDATA': str(self.root)}), contextlib.redirect_stdout(io.StringIO()):
            setup.main()
            paths = [fixture / '.codex/config.toml', fixture / '.codex/hooks.json']
            before = [p.read_bytes() for p in paths]
            setup.main()
            self.assertEqual(before, [p.read_bytes() for p in paths])

    def test_missing_identity_never_registers(self):
        result = subprocess.run([os.sys.executable, str(Path(__file__).with_name('lifecycle.py'))],
                                input=b'{"hook_event_name":"SessionStart"}', capture_output=True, check=True)
        self.assertIn(b'no mail identity was registered', result.stdout)

    def test_hung_mail_initialize_exits_and_reaps_child(self):
        fixture = self.root / 'fixture'
        hooks = fixture / '.codex/hooks'
        hooks.mkdir(parents=True)
        for name in ('lifecycle.py', 'mail.mjs'):
            shutil.copyfile(Path(__file__).with_name(name), hooks / name)
        package = fixture / 'packages/crl/package.json'
        package.parent.mkdir(parents=True)
        package.write_text('{}')
        pidfile = fixture / 'child.pid'
        server = fixture / 'hang.mjs'
        server.write_text("import fs from 'node:fs'; fs.writeFileSync(process.env.PID_FILE, String(process.pid)); setInterval(()=>{},1000);")
        config = {**self.config, 'node': shutil.which('node'),
                  'mail': {'command': shutil.which('node'), 'args': [str(server)],
                           'env': {}, 'env_vars': ['PID_FILE']}}
        (fixture / '.codex/lifecycle.local.json').write_text(json.dumps(config))
        env = {**os.environ, 'NODE_PATH': str(Path(__file__).resolve().parents[2] / 'node_modules'),
               'PID_FILE': str(pidfile)}
        result = subprocess.run([os.sys.executable, str(hooks / 'lifecycle.py')],
                                input=b'{"session_id":"isolated-test","hook_event_name":"UserPromptSubmit"}',
                                capture_output=True, env=env, timeout=12, check=True)
        self.assertIn(b'Mail hook failed', result.stdout)
        self.assertTrue(pidfile.exists(), 'configured env_vars must reach the child')
        pid = int(pidfile.read_text())
        status = subprocess.run(['powershell', '-NoProfile', '-Command',
                                 f'if (Get-Process -Id {pid} -ErrorAction SilentlyContinue) {{ exit 1 }}'],
                                capture_output=True)
        self.assertEqual(0, status.returncode, 'hung MCP child survived hook termination')

    def test_empty_inbox_outbound_answer_and_capped_reporting(self):
        fixture = self.root / 'mail-fixture'
        hooks = fixture / '.codex/hooks'
        hooks.mkdir(parents=True)
        shutil.copyfile(Path(__file__).with_name('mail.mjs'), hooks / 'mail.mjs')
        package = fixture / 'packages/crl/package.json'
        package.parent.mkdir(parents=True)
        package.write_text('{}')
        state = fixture / 'state.json'
        state.write_text(json.dumps({'status': 'waiting'}))
        server = fixture / 'fake.mjs'
        server.write_text('''import fs from 'node:fs'; import readline from 'node:readline';
readline.createInterface({input:process.stdin}).on('line', line=>{
 const r=JSON.parse(line); if(r.id===undefined)return; let result;
 if(r.method==='initialize')result={protocolVersion:r.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}};
 else {const n=r.params.name;let value={};
 if(n==='register')value={endpointId:r.params.arguments.endpoint_id};
 if(n==='inbox')value={inbox:[]};
 if(n==='sent')value={sent:Array.from({length:100},(_,i)=>({id:String(i),status:JSON.parse(fs.readFileSync(process.env.STATE)).status,subject:'s'.repeat(400)}))};
 if(n==='received')value={received:[]};
 result={content:[{type:'text',text:JSON.stringify(value)}]};}
 setTimeout(()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,result})+'\\n'),Number(process.env.DELAY)||0);
});''')
        noop = fixture / 'renew.mjs'
        noop.write_text('')
        config = {**self.config, 'node': shutil.which('node'), 'renew': str(noop),
                  'mail': {'command': shutil.which('node'), 'args': [str(server)],
                           'env': {'STATE': str(state), 'DELAY': '1200'}}}
        (fixture / '.codex/lifecycle.local.json').write_text(json.dumps(config))
        env = {**os.environ, 'NODE_PATH': str(Path(__file__).resolve().parents[2] / 'node_modules')}
        def tick():
            return subprocess.run([config['node'], str(hooks / 'mail.mjs')],
                                  input=b'{"session_id":"isolated-test","hook_event_name":"PostToolUse"}',
                                  capture_output=True, env=env, timeout=10, check=True).stdout
        self.assertIn(b'Retrieval is capped', tick())
        self.assertEqual(b'', tick())
        for cache in self.history.glob('mail-*.json'):
            old = json.loads(cache.read_text()); old['time'] = 0; cache.write_text(json.dumps(old))
        state.write_text(json.dumps({'status': 'answered'}))
        update = tick()
        self.assertIn(b'Mail state:', update)
        self.assertIn(b'older outstanding and expired', update)
        self.assertLess(len(update), 1000)


if __name__ == '__main__':
    unittest.main()
