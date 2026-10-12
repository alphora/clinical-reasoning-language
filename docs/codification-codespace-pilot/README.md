# Smile assisted-codification pilot package

This directory contains a **candidate** reusable narrative-policy create-new pipeline for the source-only auto-bleph pilot. It is not an authored bleph artifact and it has not run in a Nautilus Codespace. The [project flow](WORKFLOW.md) defines stages and filters; the [workflow contract](CONTRACT.md) identifies owners and integration gates. The [Nautilus orchestrator skill](nautilus-orchestrator/SKILL.md) is a separate batch-preparation integration candidate; testing this pipeline does not certify that skill.

The package payload is [pipeline-candidate](pipeline-candidate): root .claude/ and .vibe-tools/ directories to install on the prepared `<artifact branch>-nautilus` branch. [pipeline-package-manifest.json](pipeline-package-manifest.json) lists every file and SHA-256. After any payload edit, run:

```text
python docs/codification-codespace-pilot/create-package-manifest.py write
python docs/codification-codespace-pilot/create-package-manifest.py verify
```

Nautilus should install those exact files at the prepared-branch checkout root, reject a dirty or mismatched installed copy, and record the manifest hash in the assignment revision. The source lives in the canonical artifact's src/source and authorized src/refined-source, not in this payload. A source-specific correspondence exception belongs with that artifact. KELP Add enters **Ready to codify**, the preparation queue. Nautilus batch completion may enter **Nautilus staged**, the execution queue, only after complete source intake, the [selected IEHP pipeline binding](IEHP-PIPELINE-BINDING.md), two image identities, the prepared branch and the launch provider are verified. Neither status alone proves authoring readiness.

The package pins CRL 6.4.41 / kit 2.35 but leaves machine paths unbound. In the authoring Codespace, bind the installed binaries with .claude/ke-pipeline/bind-runtime.py and verify the kit cache with kit-cache.mjs verify. The [kit reassessment](pipeline-candidate/.claude/ke-pipeline/kit-235-reassessment.md) records the narrow change from the shared method's older map. The operator selected the approved IEHP initial customer/output decisions for this demonstration. The auto-bleph LCD remains the sole clinical source. The canonical artifact still needs matching `crl` package configuration through KELP before Codify delivery.

Local checks so far: the source HTML and text hashes match the committed L34194 snapshot; anchor-text.py reproduced the exact text SHA and matched 77 substantive body lines, while reporting two extraction-metadata exceptions, seven headings and four short lines for manual readback. A fresh synthetic installation with the selected IEHP binding and hash-matched CRL 6.4.41 binaries passed scaffold. The selected four IEHP decision records match the pinned seed byte-for-byte, and the kit cache passed its declared structure check. These are package/tool checks, not a live Codespace, KELP or clinical-policy qualification. A native implementation reviewer assessed the binding; the external review arm was unavailable.
