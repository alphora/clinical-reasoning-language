# Smile assisted-codification pilot package

This directory contains a **candidate** reusable narrative-policy create-new pipeline for the source-only auto-bleph pilot. It is not an authored bleph artifact and it has not run in a Nautilus Codespace. The [project flow](WORKFLOW.md) defines stages and filters; the [workflow contract](CONTRACT.md) identifies owners and integration gates. The [Nautilus orchestrator skill](nautilus-orchestrator/SKILL.md) is a separate batch-preparation integration candidate; testing this pipeline does not certify that skill.

The package payload is [pipeline-candidate](pipeline-candidate): root .claude/ and .vibe-tools/ directories to install on the prepared `<artifact branch>-nautilus` branch. [pipeline-package-manifest.json](pipeline-package-manifest.json) lists every file and SHA-256. After any payload edit, run:

```text
python docs/codification-codespace-pilot/create-package-manifest.py write
python docs/codification-codespace-pilot/create-package-manifest.py verify
```

Nautilus should install those exact files at the prepared-branch checkout root, reject a dirty or mismatched installed copy, and record the manifest hash in the assignment revision. The source lives in the canonical artifact's src/source and authorized src/refined-source, not in this payload. A source-specific correspondence exception belongs with that artifact. KELP Add enters **Ready to codify**, the preparation queue. Nautilus batch completion may enter **Nautilus staged**, the execution queue, only after complete source intake, the approved Smile binding, two image identities, the prepared branch and the launch provider are verified. Neither status alone proves authoring readiness.

The package pins CRL 6.4.41 / kit 2.35 but leaves machine paths unbound. In the authoring Codespace, bind the installed binaries with .claude/ke-pipeline/bind-runtime.py and verify the kit cache with kit-cache.mjs verify. The [kit reassessment](pipeline-candidate/.claude/ke-pipeline/kit-235-reassessment.md) records the narrow change from the shared method's older map. An approved Smile customer binding must replace the deliberate placeholder before scaffold/preflight can pass. It needs approved canonical base, outcome activity keys/labels, determination resource, answer-domain rules and scoped customer decisions; do not borrow IEHP/HCSC values.

Local checks so far: the source HTML and text hashes match the committed L34194 snapshot; anchor-text.py reproduced the exact text SHA and matched 77 substantive body lines, while reporting two extraction-metadata exceptions, seven headings and four short lines for manual readback. A fresh, synthetic installation with hash-matched CRL 6.4.41 binaries passed scaffold and preflight (19 file identities); the unapproved production placeholder correctly refused scaffold. The kit cache passed its declared structure check. These are package/tool checks, not a live Codespace, KELP or clinical-policy qualification. A native implementation reviewer assessed the package; the external review arm was unavailable.
