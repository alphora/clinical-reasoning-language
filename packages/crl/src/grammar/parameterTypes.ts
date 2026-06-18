import parameterTypesJson from "./generated/types/parameterTypes.json";

// Union allowlist of types valid in a `parameter "X": - param type is Y.`
// slot. Conceptually the union of `conceptTypes` (FHIR resource types) and
// `conceptValueTypes` (FHIR data types). Generated from the
// `PARAMETER_TYPE` rule in src/grammar/CRLLexer.g4 via
// `scripts/extractParameterTypes.js`, which also fails the build if this
// set drifts below `conceptTypes ∪ conceptValueTypes`.
export const parameterTypes = parameterTypesJson as string[];

// At runtime the wrapper is a `string` alias (matching the
// conceptTypes / conceptValueTypes shape); for documentation the
// conceptual TS type is `ConceptType | ConceptValueType`.
export type ParameterType = (typeof parameterTypes)[number];
