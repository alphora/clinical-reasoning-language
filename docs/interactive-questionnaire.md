# Interactive FHIR Questionnaire in Medical Validation

Open **Interactive FHIR Questionnaire** from the MV tree toolbar. This opens a live session for the policy currently open in MV. The existing FHIR Questionnaire button continues to show saved case results.

Put each initial state in the policy's own project, alongside its `src` folder:

```text
tests/
  interactive-questionnaire/
    request-1/
      request-bundle.json
    request-2/
      request-bundle.json
```

Each `request-bundle.json` is one FHIR R4 collection Bundle containing exactly one Patient and one or more requests of any combination of these types: `ServiceRequest`, `NutritionOrder`, `MedicationRequest`, `CommunicationRequest`, and `Task`. Use these names in JSON `resourceType`, without the `FHIR.` prefix. Separate resource files are not loaded.

Every request must refer to the initial Patient: use `patient.reference` for NutritionOrder, `for.reference` for Task, and `subject.reference` for the other types. Use the relative reference `Patient/<id>`. UUID or absolute references are rejected before evaluation because the native Patient retrieve does not reliably resolve them. Referenced supporting resources, such as Practitioner, Medication, or Device, can accompany the requests. Initial states have no QuestionnaireResponses or clinical answers. The extension checks the Bundle structure and Patient association; neither this check nor a successful evaluation certifies FHIR/profile conformance. Author resources against the profiles required by your policy.

For example, a communication request can be supplied as:

```json
{
  "resourceType": "Bundle",
  "type": "collection",
  "entry": [
    { "resource": { "resourceType": "Patient", "id": "p1" } },
    { "resource": {
      "resourceType": "CommunicationRequest",
      "id": "request1",
      "status": "active",
      "subject": { "reference": "Patient/p1" }
    } }
  ]
}
```

The patient-field and code-field mappings follow the FHIR R4 definitions for [NutritionOrder](https://hl7.org/fhir/R4/nutritionorder.html), [ServiceRequest](https://hl7.org/fhir/R4/servicerequest.html), [MedicationRequest](https://hl7.org/fhir/R4/medicationrequest.html), [CommunicationRequest](https://hl7.org/fhir/R4/communicationrequest.html), and [Task](https://hl7.org/fhir/R4/task.html).

One state is selected automatically. Multiple states appear in a selector labelled with their request number and available request codes, references, or resource types. **Start** applies the policy to the selected state. Answer the form and select **Continue / Re-evaluate** to submit the current QuestionnaireResponse to `$apply`. Returned activities appear above the refreshed form. A form without activities is not automatically a final policy disposition.

Changing an earlier answer removes subsequent answers. Changing it back does not restore them. **Reset** or selecting another initial state discards the current form. Nothing is saved as answer history or written into `tests/results`. A failed evaluation leaves the current form available for correction or retry; **Cancel** stops the pending evaluation.

The native engine performs extraction internally as part of `$apply`. The extension submits the unchanged starting data and current QR, with the policy definitions and returned Questionnaire. It does not extract clinical resources or retain extracted data between requests. LForms supplies the response's authored time on export; the extension does not assign timestamps to individual answers.

The loader accepts the five request types above as input data. The compiler currently supports natural CodeableConcept source projections from ServiceRequest and MedicationRequest for active orders with inline system/code codings. Loading another request type does not establish support for every CRL projection from it; unsupported projections still report compiler errors.

The installed extension requires its normal hash-pinned native engine and Java 17 or newer. The form uses the extension's bundled LForms renderer. Unsupported form features are displayed and prevent submission, using the same feature checks as the saved FHIR Questionnaire pane. Each session currently supports one returned Questionnaire/QuestionnaireResponse pair, including multiple resulting activities; ambiguous multiple forms produce an explicit error. Reopen the panel after changing policy source or initial-state files to load those changes.

Developer validation: `interactiveQuestionnaire.test.mjs` tests discovery, pruning and request ownership. `test/interactiveQuestionnaire.browser.cjs` runs the shipped renderer in an isolated Chromium profile; set `BROWSER_EXE` for your installed browser and `CRL_IQ_NATIVE=1` to include the browser-to-native round trip using the synthetic fixture under `src/testdata/interactive-questionnaire`. Set TEMP/TMP to the desired scratch drive before running.

For source ownership, packaging and keeping the extension and agent-facing MCP server synchronized, see [the local development handoff](interactive-questionnaire-development.md).
