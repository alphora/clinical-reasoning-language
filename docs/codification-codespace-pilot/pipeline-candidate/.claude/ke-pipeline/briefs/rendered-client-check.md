# Rendered-client check

Complete this record after native checks and before handing the candidate to Medical Validation. Use the frozen candidate and a source-derived request fixture. Record client/runtime versions and hashes of the candidate and request Bundle. A native session result is evidence for native behavior, not for a rendered client.

| Check | Expected from source and model | Observed in rendered client | Status (pass/fail/not run) |
| --- | --- | --- | --- |
| Starting request control and supplied Request representation | | | |
| First relevant question, wording, choices and required cues | | | |
| Qualifying route and exact result | | | |
| Explicit disqualifying answer and exact result | | | |
| Clear or change an earlier answer; returned Q/QR and later questions | | | |
| Resubmit using only the returned Q/QR | | | |

If an agent cannot operate the rendered UI, fill the **Expected** column and give the operator the exact fixture path, candidate revision, actions and observations to record. Mark the checks **not run** until the operator completes them. Record client defects separately from CRL/CEL findings; do not add policy logic to compensate for a display defect. Native evidence and this record must remain distinguishable in the handback.
