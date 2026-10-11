"""agent-final.py <subagent transcript.jsonl> <out.md> — save a finished subagent's final assistant message to disk without printing it."""
import json, sys
src, out = sys.argv[1], sys.argv[2]; last = None
for line in open(src, encoding='utf-8', errors='replace'):
    try: o = json.loads(line)
    except Exception: continue
    m = o.get('message') or {}
    if o.get('type') == 'assistant' or m.get('role') == 'assistant':
        txt = ''.join(b.get('text', '') for b in (m.get('content') or []) if isinstance(b, dict) and b.get('type') == 'text')
        if txt.strip(): last = txt
open(out, 'w', encoding='utf-8', newline='\n').write(last or ''); print(json.dumps({'out': out, 'bytes': len((last or '').encode('utf-8'))}))
