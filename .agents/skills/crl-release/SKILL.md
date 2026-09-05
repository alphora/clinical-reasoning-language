---
name: crl-release
description: "Cut a CRL release. Invoke for ANY release, re-release, or \"let's ship this to the KE\" — including a hotfix. Encodes the artifact-execution gate that four consecutive releases failed."
---

Read and follow the [canonical crl-release protocol](../../../.claude/skills/crl-release/SKILL.md)
in full before performing this workflow. It is the workspace file
`.claude/skills/crl-release/SKILL.md`; resolve its helper scripts from that canonical
directory, not from this entry point.

The name and description above are verbatim copies of the canonical frontmatter.
Keep them identical when the canonical trigger changes; the canonical source wins.
The workflow body stays in one place. Apply the Codex runtime adaptation in the
workspace `AGENTS.md` to Claude-specific tool names, hooks, and invocation syntax.
User instructions and existing session authorization take precedence.
