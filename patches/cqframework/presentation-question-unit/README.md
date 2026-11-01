# Quantity question units, protocol 1 source candidate

Apply `units.patch` to upstream dcac972fc38bc9a29aae2c662dfb5c4917d27234
after security-20261002, presentation-choice-groups, normalized-library-cache,
and security-20261029 patches, in that order. This patch changes only form
presentation. The original Observation Quantity, CQL arithmetic and source
profiles remain unchanged.

The annotation canonical is
`http://clinicalreasoninglanguage.org/fhir/StructureDefinition/presentation-question-unit`.
It carries one UCUM Coding on a PlanDefinition action's DataRequirement. For
each profile, the processor recursively finds exactly one Quantity item with
definition `<unversioned-profile>#Observation.value[x]`. Groups may wrap that
leaf. Missing/ambiguous/wrong-type leaves and malformed/conflicting descriptors
fail the entire apply with `presentation-question-unit-invalid`; the error is
not swallowed. Repeated guard and retention inputs share the existing item.
Unannotated inputs are unaffected. This implementation supports FHIR R4 only.

For fresh entry, options are `[declared]`. The returned item retains the CRL
marker and standard `questionnaire-unitOption`. After population, a different
actual unit U is appended: `[declared,U]`; the matching QR answer selects U in
the shipped LForms client. A display-only source unit is preserved as a
display-only Coding; no UCUM code is invented. Unsupported measurements remain
arithmetic errors. Each apply rebuilds the annotated options from the authored default and current
populated answer; stale supplemental units are removed. Repeated identical applies
preserve option order and identity. A same-code source display is retained for the
visible option, with the authored label restored on clear. An
explicitly constrained unmarked option list conflicts instead of being widened.
Changing the visible unit is an explicit user measurement edit, without numeric
conversion. A normal clear removes the number; fresh entry uses the declared
unit; the prior alternate is no longer offered. This is not a claim that every SDC client implements a first-option default.

`rebuild.py` performs a bounded source rebuild against the checksum-verified
released engine 99079b9c and its actual 132 nested libraries, at Java release 17.
It replaces three source classes plus javac's ApplyProcessor switch helper.
Every other Boot entry and nested library remains byte-identical, including
the normalized CQL cache and Guava33.7.2. It refuses unexpected baseline/class
inventory or a non-stored Boot nested JAR. Its receipt records source hashes,
all dependency hashes and exact changed class entries. `candidate.json` names
local qualification bytes; it is not a published acquisition pin.

Run owning `questionUnit.test.ts` and opt-in
`packages/crl-vscode/src/questionUnit.native.test.mjs` using
CRL_QUESTION_UNIT_NATIVE=1, CRL_QUESTION_UNIT_ENGINE_PATH and
CRL_QUESTION_UNIT_ENGINE_SHA256. CRL_QUESTION_UNIT_EVIDENCE retains raw native
requests/results. The latter includes the real static result producer; direct
data alone cannot qualify a rendered Questionnaire. Before release, qualify
the shipped viewer and installed assets and apply the existing vulnerability
gate to the final JAR. This source task does not authorize release or change
the public engine acquisition pin.

For marker-bearing items the entire standard option list is derived state, so
client option deletion/reordering is repaired and stale extras are replaced.
Unmarked explicit lists remain independent author constraints and are refused.
Inputs require exactly one profile and cannot combine choice-group metadata.
Any generation failure in an action carrying this required presentation fails
the apply; an absent generated answer leaf cannot silently satisfy the contract.

Qualification uses the CRL CLI driver: every request reparses repository/data
JSON into fresh FHIR objects, constructs a new InMemoryFhirRepository and
PlanDefinitionProcessor, and retains only compiled CQL/model definitions. No
Questionnaire or repository instance survives a request. This does not qualify
a separate generic server repository that shares mutable FHIR instances.

All returned markers receive the same descriptor shape/system/lexical validation,
including retained questions not traversed again. Well-formed retained markers
remain presentation metadata; this helper is not a global declared-input or client
authorization validator. Current populated units are shown faithfully; arithmetic
still rejects unsupported input as before. Mixed old/new policy unit descriptors
are refused with a restart instruction. The MV interview freezes its definitions;
reopen/reset with fresh definitions after a policy change, never silently relabel
an answer during content migration. Normal nonadaptive intake returns no contained
Questionnaire copy; that bounded assertion is distinct from adaptive SDC support.
