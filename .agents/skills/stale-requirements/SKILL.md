---
name: stale-requirements
description: "Invoke whenever a RULE is about to change, or a rule is being used to block work — a charter clause, a memory, a doctrine comment, a kit rule, an operator escalation. It exists to stop two failures: a stale requirement vetoing a fix that was just agreed, and a correction that leaves stale copies alive elsewhere. Use it before correcting any rule, and the moment a reviewer (or you) cites a requirement as a reason NOT to do something."
---

Read and follow the [canonical stale-requirements protocol](../../../.claude/skills/stale-requirements/SKILL.md)
in full before performing this workflow. It is the workspace file
`.claude/skills/stale-requirements/SKILL.md`; resolve its helper scripts from that canonical
directory, not from this entry point.

The name and description above are verbatim copies of the canonical frontmatter.
Keep them identical when the canonical trigger changes; the canonical source wins.
The workflow body stays in one place. Apply the Codex runtime adaptation in the
workspace `AGENTS.md` to Claude-specific tool names, hooks, and invocation syntax.
User instructions and existing session authorization take precedence.
