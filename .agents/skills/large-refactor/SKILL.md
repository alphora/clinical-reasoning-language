---
name: large-refactor
description: "Invoke at the START of any large refactor — where a body of existing code is deliberately being changed from a known-wrong model to a target model (an emit flip, a representation redesign, a hack removal). It exists to stop the single most expensive failure of refactor work: anchoring on the code being fixed as if it were authority. Use it when the work spans many files and the point is that the current behavior is wrong until you finish."
---

Read and follow the [canonical large-refactor protocol](../../../.claude/skills/large-refactor/SKILL.md)
in full before performing this workflow. It is the workspace file
`.claude/skills/large-refactor/SKILL.md`; resolve its helper scripts from that canonical
directory, not from this entry point.

The name and description above are verbatim copies of the canonical frontmatter.
Keep them identical when the canonical trigger changes; the canonical source wins.
The workflow body stays in one place. Apply the Codex runtime adaptation in the
workspace `AGENTS.md` to Claude-specific tool names, hooks, and invocation syntax.
User instructions and existing session authorization take precedence.
