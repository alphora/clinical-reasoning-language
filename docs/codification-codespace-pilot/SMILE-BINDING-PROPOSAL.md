# Smile auto-bleph customer binding proposal

Status: proposed, not an approved pipeline binding. The active candidate at `pipeline-candidate/.claude/ke-pipeline/customer-binding.json` remains blocked and must not be marked approved from this note.

The operator selected a Smile demonstration using a source-first narrative pipeline. An earlier, separately bound Smile Horizon demonstration has an operator-approved answer-domain record: use source-authorized choices, otherwise Yes/No, with no added uncertainty choice or terminal uncertainty guard. That approval is evidence for this proposal, not automatic authority for auto-bleph. Its outcome contract uses the demo canonical base `http://example.org/smile-demo/fhir/`, embedded `certify.Met`, `not-certify.Unmet`, and `not-certify.EIU` activities, with each outcome used only where the new source supports it.

Proposed auto-bleph binding values:

| Field | Proposed value | Basis / decision still needed |
| --- | --- | --- |
| `customer` | `smile-demo` | This is the selected demo, not an IEHP or HCSC implementation. |
| `canonicalBase` | `http://example.org/smile-demo/fhir/` | Existing Smile demo contract; confirm it is appropriate for the new artifact. |
| `outcomes` | `Met → certify.Met`, `Unmet → not-certify.Unmet`, `EIU → not-certify.EIU` | Existing Smile demo vocabulary. The author may use EIU only if the auto-bleph source supports it. |
| `dispositionMode` | `embedded` | Existing Smile demo contract; confirm for this artifact. |
| `determinationResourceType` | `Task` | Proposed because current kit permits it and current KE packages use it; no Smile-specific approval found. |
| `answerDomain` | `defaultBinaryChoices: ["Yes", "No"]`; `uncertainty: {"mode":"none","choices":[]}` | Existing operator-approved Smile demo answer-domain record. Source-defined choices still govern when present. |
| `x12ByActivity` | `{}` pending explicit source/customer mapping | Do not import another customer's X12 mapping. |

Authority reviewed for this proposal: `smile-demo-horizon-ke` commit `ac195c5b263dd88cd26b363ba9b5fec97c4680d6`, files `docs/customer-guidance/smile-demo/{profile.json,contract.md,decisions/smile-demo-answer-domain-r1.json}`. Those files belong to the earlier Horizon demo. The new author must read only the auto-bleph artifact's source and approved local refinements for clinical policy meaning; the prior Horizon artifact is not an authoring example or policy input.

Before launch, select or correct the values above, create an auto-bleph-local approved binding with explicit authority paths, run its preflight, and freeze its hash in the prepared run record. The proposed values do not make the current prepared branch launch-eligible.
