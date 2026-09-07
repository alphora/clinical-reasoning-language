# Imported publication test inputs

Synthetic arithmetic and ownership fixture for #320. It is not a clinical policy.
Weight and Height deliberately both declare `Measurement`; BMI consumes those
selected publications, and Policy compares the resulting BMI. Each vocabulary
has a distinct name so its emitted ValueSet has a distinct identity.

`publicationImports.test.ts` copies these files and tests local siblings, explicit
includes, installed packages, shadowed owners, and invalid references. `cases.cel` contains eight successful expectations.
`invalid.cel` is an isolated negative fixture: invalid Weight beside missing
Height must produce an error and no activity. Its deliberately forbidden Deny
result only invokes the decision; the test independently requires the typed error
because CEL has no expected-error assertion yet. It is not an authoring example.

The unchanged four-library fixture also has separate original CQFramework 4.7
measurements: five activity outcomes, three null-condition/no-activity outcomes,
and one explicit invalid-input error. Those calls consume the same CEL-emitted
FHIR resources as CRE. They do not test QuestionnaireResponse resubmission.

The package/include mutations test CRE resolution only. They are not native
acceptance fixtures: the emitter's separate include-domain collision and package
closure restrictions can reject them. CRE does not perform the complete artifact
preflight, so its pass must not be treated as successful CQL/FHIR emission.
