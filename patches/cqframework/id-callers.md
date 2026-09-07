# Generated ID caller audit

Scope: Java production sources in both checked-out CQFramework baselines plus this patch. Raw search results are retained locally in tmp/320-engine-evidence/id-callers.txt. No guarantee is made about unexamined downstream applications recomputing generated IDs.

| Caller | Classification and disposition |
|---|---|
| ExtractRequest.getExtractId | Raw composition input (extract- plus supplied QR logical ID), retained for composing child IDs before normalization. Does not promise the final Bundle/resource ID. |
| ExtractProcessor.createBundle | Write: normalizes the complete raw extract prefix into the Bundle ID. No reference to this Bundle is recomputed by another caller. |
| ProcessDefinitionItem.processResource | Write: appends link/repetition components before normalizing the complete resource ID. Subsequent processing uses the resource itself. |
| R4/R5 ObservationResolver.resolveObservation | Write: appends linkId then normalizes. derivedFrom is built with new Reference(questionnaireResponse), using the actual supplied/generated QR. Subject and linkId extensions are preserved. |
| IOperationRequest.resolveOperationOutcome | Write: composes operation name and actual target resource logical ID, normalizes contained outcome ID; message fragment reads the outcome's final getIdElement().getIdPart(). |
| PopulateRequest.createQuestionnaireResponse | Write: composes actual Questionnaire logical ID and subject logical ID, normalizes at final QR creation. Canonical and subject independently retain their identities. |
| PopulateProcessor.populate | Returns actual QR object and attaches outcome to it; does not reconstruct QR ID. |
| ApplyProcessor.extractQuestionnaireResponse | Passes actual QR to extract; merges resulting entries into request data. getId() use is diagnostic in exception text only. |
| ResponseBundle.createBundleR4/R5 | Old alternate helpers accepting caller-supplied extractId, no Java production call sites found. Outside changed path; no reconstruction of any changed resource's ID. |

Repository-wide getExtractId search finds exactly four production call sites per branch: Bundle, definition resource, R4 Observation, R5 Observation. All four are final-generation sites above. No raw getExtractId-derived reference consumer was found.

The known transaction Bundle defect remains: POST request.url is missing, not computed from the raw prefix. It requires a separate transaction contract fix; shortening IDs alone does not make this Bundle persistable. Future reference/URL construction must use each resource's final ID.

Changing a composite-generated ID is intentional for illegal/overlong inputs. External callers must use returned resource identities. Legal composite IDs are retained. Generated IDs are deterministic; their short digest is not a guarantee of collision freedom.

An id-less resource's existing operation-outcome composite ends in null. That pre-existing behavior remains; contained IDs are scoped per containing resource. It is not represented as an ID-allocation fix.
