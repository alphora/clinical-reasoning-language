parser grammar CRLParser;

options {
    tokenVocab=CRLLexer;
}

// ============================
// Quoting Conventions
// ============================
//
// Identifiers and references must be enclosed in double quotes (").
//   Example: "Colonoscopy", "BMI Valueset"
//   Used for: identifiers, references, concept names, etc.
//
// Free text, markdown, and evidence must be enclosed in backticks (`).
//   Example: `it's the right thing to do`, `Some *markdown* text`
//   Used for: evidence, markdown, system/code values, and non-identifier strings.
//
// Single quotes (') wrap UCUM units inside quantity literals
// (`30 'mm[Hg]'`).
//
// This ensures unambiguous parsing and user-friendly authoring.

// ============================
// Parser Rules
// ============================

crl
    : HEADER? libraryStatement includeStatement* statement* EOF
    ;

// ============================
// Library / Include (v2.1.0)
// ============================
//
// `library "Name".` — REQUIRED file-level identity declaration (v2.1.0
//   tightened from optional). Every CRL file must declare its library;
//   the "anonymous file" mode is gone. Exactly one per file.
//
// `include "Name".` — repeatable; declares a dependency on an EXTERNAL
//   library (one shipped in a node_modules package's `crl.libraries`).
//   Local sibling libraries in the same project auto-resolve via the
//   qualifier syntax `"Lib"."X"` — no `include` line needed for them.
//
// `include "Name" as "Alias".` — emergency aliasing. Only used when a
//   local library and an installed package both declare the same library
//   name; the `as` clause renames the package's library inside this file.
//
// #203 Todo 2: library-scope metadata rides trailing `- meta is `@tag: body`.` lines, immediately after the
// `library "Name".` declaration (before includes). Same carrier as concept/decision meta (KE flags need policy scope).
libraryStatement
    : LIBRARY identifier DOT metaLine*
    ;

includeStatement
    : INCLUDE identifier (AS identifier)? DOT
    ;

statement
    : decisionStatement
    | terminologyStatement
    | activityStatement
    | conceptStatement
    | parameterStatement
    | criterionStatement
    ;

// ============================
// Decision Statement
// ============================
//
// A reusable decision logic block.
// Consists of "when" conditions leading to "do" or "use" actions.
//
// Examples:
//   decision "Example Decision":
//     when "Concept" then do "Action".
//   done
//
decisionStatement
    : DECISION decisionIdentifier COLON decisionBody
    ;

// ============================
// Criterion Statement (#224 ii)
// ============================
//
// A named, reusable decision-guard sub-expression: `criterion "X": - when ( <cond> ).`
// The body reuses the SAME `branchCondition` rule as a `when` branch (monotone
// and/or over concept/criterion refs; no `not`). The parens are REQUIRED (unlike a
// bare `when` branch, which uses `THEN` as its right edge) so `RPAREN DOT` is a
// clean statement edge — `DOT` is also the qualified-ref separator, so an
// unparenthesized `... "Lib"."X".` tail would be ambiguous. The KE authoring house
// style parenthesizes regardless.
criterionStatement
    : CRITERION criterionIdentifier COLON DASH WHEN LPAREN branchCondition RPAREN DOT
    ;

// The top-level decision block: `when`/`otherwise` branches with an optional
// leading qualifier (`first:` / `all:`). The qualifier is grammatically optional
// — the validator requires it for a >1-branch block and rejects `any:` here. No
// closer: the block ends at the next top-level declaration (same boundary the
// former `whenBlock+` relied on).
decisionBody
    : (metaLine)* blockQualifier? branchItem+
    ;

// ============================
// Branches, Blocks, and Actions
// ============================
//
// A branchItem is a `when <concept> then ...` clause or the `otherwise` catch-all.
// `then <action>` is the inline single-action form (no closer); `then: <body>` is
// the block form, always closed by `end`.

blockQualifier
    : FIRST_BLOCK
    | ANY_BLOCK
    | ALL_BLOCK
    ;

branchItem
    : DASH WHEN branchCondition THEN blockBody              # WhenWithBody
    | DASH WHEN branchCondition THEN actionStatement DOT    # WhenSingleAction
    | DASH OTHERWISE THEN blockBody                         # OtherwiseWithBody
    | DASH OTHERWISE THEN actionStatement DOT               # OtherwiseSingleAction
    ;

// A decision branch guard (#224): a monotone boolean expression over concept
// refs. PERMISSIVE grammar — a homogeneous chain (`A and B and C`, `A or B or C`)
// or a single ref parses bare; a MIXED bare chain (`A and B or C`) also parses
// but the BUILDER rejects it with a "parenthesize mixed and/or" diagnostic
// (house precedent: `decisionBody`'s optional qualifier, validator-required).
// Mixing REQUIRES parentheses: `(A or B) and C`. `THEN` is the clean right edge
// (no ATN ambiguity; same common-prefix shape as `argGroup`).
//
// #224 iii.2: `not` is a PREFIX unary over an atom (`BcNot`), binding TIGHTER than
// `and`/`or` (`not A and B` = `(not A) and B`). It may wrap any atom incl. a
// parenthesized group (`not (A or B)`) — De Morgan normalizes it (see toNNF). Unlike
// the pre-iii.2 note, negation IS lowered: a single negated literal has a CQL carrier
// (`not Coalesce(...)`, iii.1) and any composition De Morgans/DNFs into arms of single
// signed literals FIRST — it never lowers to one compound CQL boolean.
branchCondition
    : bcAtom ( (AND | OR) bcAtom )*
    ;

bcAtom
    : conceptReference                  # BcRef
    | LPAREN branchCondition RPAREN      # BcGroup
    | NOT bcAtom                         # BcNot
    ;

// A nested `then:` block body. Homogeneous: branches XOR actions
// (grammar-enforced). ALWAYS closed by a dashless `end.` — the trailing period
// makes the line-ending model exceptionless (every CRL line ends in `.` or `:`,
// matching the period-prior authors and agents already follow), while the closer
// itself stays context-free: a bare `end` with nothing to mismatch (unlike the
// former `end when` / a hypothetical `end otherwise`).
// The mandatory closer is what keeps the sibling boundary in `decisionBody`'s
// `branchItem+` unambiguous; do NOT make it optional. `branchItem` starts
// `- when`/`- otherwise`, `actionItem` starts `- recommend`/`- use`, and the
// closer is `end` `.` — all LL-distinct (verified: no ATN ambiguity).
blockBody
    : COLON blockQualifier? ( branchItem+ | actionItem+ ) END DOT
    ;

// An action-block member. The terminating `.` lives here (not on the action
// statements) so that a per-action guard can sit before it. A guard is legal
// ONLY here — never on an inline `when … then <action>` or on `otherwise`,
// which keeps the catch-all unconditional and one condition slot per line.
actionItem
    : DASH actionStatement actionGuard? DOT
    ;

// Per-action guard: conditions a single menu item. `unless "C"` drops the item
// when C holds; `only when "C"` includes it only when C holds. These are
// applicability polarities lowered at emit time (unless -> not), NOT sem-*
// inference operators (which live only in `defined as`; they normalize one concept's
// representations into one fact — they do NOT compose decision criteria, which is the
// `when`/branch structure's job, #168). The guard reuses the
// same condition resolution path as a `when` branch.
actionGuard
    : UNLESS conceptReference
    | ONLY_WHEN conceptReference
    ;

actionStatement
    : recommendStatement
    | useStatement
    ;

recommendStatement
    : RECOMMEND_ACTIVITY activityReference
    ;

useStatement
    : USE_DECISION decisionReference
    ;

// ============================
// Terminology Statement
// ============================
//
// Defines a terminology reference.
// Terminologies can:
//   - Reference a valueset (exclusive with system/code)
//   - Reference a system/code pair
//
// Examples:
//   terminology "BMI Valueset":
//      - valueset is `BMI`.
//   terminology "Some Terminology":
//      - valueset is ``.
//   terminology "Colonoscopy":
//      - system is `http://snomed.info/sct`.
//      - code is `73761001`.
//
terminologyStatement
    : TERMINOLOGY terminologyIdentifier COLON terminologyBody
    ;

terminologyBody
    : terminologyLine+
    ;

terminologyLine
    : ( terminologyValueset | terminologySystemCode )
    ;

terminologyValueset
    : DASH VALUESET_IS backtickString DOT
    ;

terminologySystemCode
    : terminologySystem terminologyCode+
    ;

terminologySystem
    : DASH SYSTEM_IS backtickString DOT
    ;

terminologyCode
    : DASH CODE_IS backtickString DOT
    ;

// ============================
// Activity Statement
// ============================
//
// Defines an executable clinical activity.
// Can reference a terminology or a custom CQL string for dynamic configuration.
//
// Examples:
//   activity "Vaccinate":
//      - request Immunization.
//   activity "Indicate":
//      - request ProposeDiagnosis.
//      - with "Colonoscopy".
//   activity "Inform Clinician":
//      - request CPGCommunicationRequest.
//      - with `The message to send`.
//      - because `Clinician's should be messaged about these things.`.
//
doNotPerform
    : DO_NOT_PERFORM_DO DO_NOT_PERFORM_NOT DO_NOT_PERFORM_PERFORM
    ;

activityStatement
    : ACTIVITY activityIdentifier COLON activityBody
    ;

activityBody
    : activityRequest (activityWith)? (activityBecause)?
    ;

activityRequest
    : DASH REQUEST (doNotPerform)? ACTIVITY_TYPE DOT
    ;

activityWith
    : DASH WITH (terminologyReference | activityTypeValue) DOT
    ;

activityBecause
    : DASH BECAUSE rationale DOT
    ;

// ============================
// Concept Statement
// ============================
//
// Defines a reusable clinical concept.
// Must either be coded from a terminology or defined from other concepts.
// Evidence (metadata/provenance) is optional.
//
// v0.7: a concept has one of THREE body kinds (cardinality 1..1):
//   - asserted:    `coded from "Valueset"` (refs are valueset names)
//   - inference:   `defined as (...)` — sem-and/or/not over ONE concept's representations (refs are concept names)
//   - predicate:   `definition is <narrative>` (refs are concept names; body is a
//                                               narrative phrase per catalog templates)
//
// `type is X` is OPTIONAL for inference/predicate kinds (deduced from body
// refs if omitted); REQUIRED for asserted (valuesets don't carry FHIR-type info).
// `value type is X` is OPTIONAL and 0..* (lazily required when something
// depends on it; deduced from type's default).
//
// Examples:
//   concept "BMI Range as a Condition":
//     - type is Condition.
//     - value type is CodeableConcept.
//     - coded from "BMI Valueset".
//
//   concept "Qualifying Encounter":
//     - type is Encounter.
//     - defined as
//       (
//         "BMI Evaluation Encounter (not virtual) During MP"
//         sem-and
//         "BMI Evaluation Encounter (not virtual) Performed"
//       ).
//
//   concept "BMI Evaluation Encounter (not virtual) Performed":
//     - type is Encounter.
//     - definition is "BMI Evaluation Encounter (not virtual)" performed.
//
conceptStatement
    : CONCEPT conceptIdentifier COLON conceptBody
    ;

conceptBody
    : (typeLine)?
      (valueElementLine)?
      (valueTypeLine)*
      (metaLine)*
      (evidenceLine)?
      (codeIsLine)?
      (codedFromLine | definedAsBody | definitionIsBody)?
      sourceRepresentationLine*
    ;

// ============================
// Source Representation (ADR 0001 §3)
// ============================
//
// A `source representation:` (posrep) is an anonymous SELF-DESCRIBING representation
// of the same clinical concept from a NON-LOCAL (external) source shape. Per the
// converged model (design of record §"Shape rules"; representation-model.md
// refinement 5) a posrep is ALWAYS FULLY EXPLICIT — it does NOT inherit the enclosing
// concept's fields. The grammar stays PERMISSIVE (fields optional so a partial posrep
// still parses); Todo 2's validator REJECTS an incomplete posrep. (The concept's own
// LOCAL representation is its `code is`, whose `type`/`value element` default to
// Observation/`.value`; a posrep never defaults.) A posrep carries its own
// `type` + `value element` + `value type`, an optional `coded from`, and an optional
// `definition is` PROJECTOR (rep-level: projects the rep's datum to the canonical
// shape — distinct from the concept-level `definition is` calculation over concepts).
//
//   - source representation: - type is ImagingStudy. - value element is ImagingStudy.started. - value type is dateTime. - coded from "Mammogram VS".
// (The design-of-record's Patient/birthDate age posrep uses `value type is date`; the FHIR
// `date` primitive is NOT yet in the value-type vocabulary — it lands with the value-type +
// kit sync in Todo 4 alongside age-as-posrep, #257. Do not show it here until then.)
//
sourceRepresentationLine
    : DASH SOURCE_REPRESENTATION COLON representationBody
    ;

representationBody
    : (typeLine)? (valueElementLine)? (valueTypeLine)* (codedFromLine)? (definitionIsBody)?
    ;

// ============================
// Concept Property Lines
// ============================

typeLine
    : DASH TYPE_IS CONCEPT_TYPE DOT
    ;

// `value element is <path>.` — the FHIR model-info property path of this
// representation's datum (`Observation.value`, `Patient.birthDate`). Present on a
// posrep, and on the concept's LOCAL representation only when it deviates from the
// implicit-standard `.value` (the standard shape is unwritten but validator-checked).
// The path is one VALUE_ELEMENT_PATH token (dots internal); the trailing DOT
// terminates the line. The lexer is permissive on path shape — Todo 2 validates it
// against the declared `type`.
valueElementLine
    : DASH VALUE_ELEMENT_IS VALUE_ELEMENT_PATH DOT
    ;

valueTypeLine
    : DASH VALUE_TYPE_IS CONCEPT_VALUE_TYPE DOT
    ;

// ============================
// Parameter Statement
// ============================
//
// Runtime parameter declaration. Reference target for narrative
// patterns that need a value supplied by the measure-execution
// environment (e.g. "Measurement Period", "Patient"). Per v2.2.0:
//   - 0..* per library
//   - per-(library, kind) uniqueness on name (Todo 2 enforces)
//   - reference-resolution + ref-slot acceptance (Todo 2)
//   - CQL emit as `parameter "Name" Type` or as `context Patient` /
//     `context Practitioner` per CQL spec (Todo 3)
parameterStatement
    : PARAMETER parameterIdentifier COLON parameterBody
    ;

parameterIdentifier
    : QUOTED_STRING
    ;

parameterBody
    : parameterTypeLine
    ;

parameterTypeLine
    : DASH PARAM_TYPE_IS PARAMETER_TYPE DOT
    ;

metaLine
    : DASH META_IS backtickString DOT
    ;
    
evidenceLine
    : DASH EVIDENCE_IS backtickString DOT
    ;

// `coded from` binds to a NAMED terminology / value set — an external source
// (ADR 0001 §2). Used as a read-only base and inside possible representations.
codedFromLine
    : DASH CODED_FROM terminologyReference DOT
    ;

// `code is` declares the concept's OWN local code. The system is the package's
// local domain (implicit — not authored). Present => the concept is locally
// assertable; absent => read-only. External codings use named `coded from`.
codeIsLine
    : DASH CODE_IS backtickString DOT
    ;

// ============================
// Definition Is Body (v0.7)
// ============================
//
// `definition is <narrative>.` — body keyword for a predicate-kind concept
// whose value is determined by a narrative predicate matched against the
// catalog. The narrative phrase is a sequence of narrative elements
// (concept refs, narrative words, quantities, in-arg groups).
//
// Examples:
//   concept "BMI Evaluation Encounter (not virtual) Performed":
//   - type is Encounter.
//   - definition is "BMI Evaluation Encounter (not virtual)" performed.
//
//   concept "Aged 18+ at MP Start":
//   - type is Encounter.
//   - evidence is `USPSTF age guidance`.
//   - definition is age at start of "Measurement Period" at least 18 years.
//
definitionIsBody
    : DASH DEFINITION_IS narrative DOT
    ;

// ============================
// Defined As Body (v0.7)
// ============================
//
// A concept's `defined as` body is INFERENCE — it normalizes ONE concept's
// sub-representations into one fact; it does NOT compose decision criteria (that is the
// decision tree's `when`/branch structure, #168). Three shapes:
//   1. Bare reference to a named concept
//   2. Parenthesized sem-or / sem-and / sem-not over bare refs
//   3. `exists ("Concept")` — explicit existence over a single concept (present → true,
//      absent → false, closed-world). The operand is a CONCEPT (promote a source shape
//      to its own concept if you need to derive from it). `exists` is TOP-LEVEL ONLY —
//      it is deliberately NOT a composition atom (`(exists("A") sem-or "B")` does not
//      parse); the design of record says promote instead (see "Clinical Mammogram").
//
// The inference operates on bare refs only (no narrative inside). Narrative belongs in
// concept bodies with `definition is`.
//
// Examples:
//   - defined as "Underweight Active".
//   - defined as exists ( "Mammogram (ImagingStudy)" ).
//
//   - defined as
//   (
//      "BMI Evaluation Encounter During MP"
//      sem-and
//      "BMI Evaluation Encounter Performed"
//   ).
//
definedAsBody
    : DASH DEFINED_AS daBody DOT
    ;

daBody
    : conceptReference                                  # DefinedAsBareRef
    | EXISTS LPAREN conceptReference RPAREN              # DefinedAsExists
    | LPAREN compositionExpression RPAREN               # DefinedAsComposition
    ;

compositionExpression
    : semOr
    ;

semOr
    : semAnd (SEM_OR semAnd)*
    ;

semAnd
    : semNot (SEM_AND semNot)*
    ;

semNot
    : SEM_NOT semNot
    | compositionAtom
    ;

compositionAtom
    : conceptReference                                  # CompositionRef
    | LPAREN compositionExpression RPAREN               # CompositionGroup
    ;

// ============================
// Narrative (used by inferenceStatement)
// ============================
//
// A narrative phrase is a sequence of narrative elements: quoted concept
// references, narrative words (lowercase identifiers and the AND/OR/NOT/WITH
// keywords used as English words), quantity literals, and in-arg groups
// (parenthesized disjunctions/conjunctions of values).
//
narrative
    : narrativeElement+
    ;

narrativeElement
    : qualifiableReference                                                                       # NConceptRef
    | quantity                                                                                   # NQuantity
    | (AND | OR | NOT | WITH | LIBRARY | INCLUDE | AS | END | EXISTS | OTHERWISE | UNLESS | ONLY_WHEN | CRITERION | NARRATIVE_WORD | TIME_UNIT)  # NWord
    | argGroup                                                                                   # NArgGroupElement
    ;

quantity
    : NUMBER (SINGLE_QUOTED_STRING | TIME_UNIT)   // unit REQUIRED — design choice
    ;

// In-arg group: parenthesized disjunction/conjunction. Homogeneous per group
// (mixed connectors require nested parens). argValue restricted to refs,
// quantities, or nested groups — NO inner multi-token narrative.
argGroup
    : LPAREN argValue (OR argValue)+ RPAREN                  # ArgDisjunction
    | LPAREN argValue (AND argValue)+ RPAREN                 # ArgConjunction
    | LPAREN argValue RPAREN                                 # ArgSingleton
    ;

argValue
    : qualifiableReference                                   # AVConceptRef
    | quantity                                               # AVQuantity
    | argGroup                                               # AVNestedGroup
    ;

// ============================
// Identifier and Token Mappings
// ============================
//
// v2.1.0 split:
//   - `identifier` (bare `QUOTED_STRING`) is used at DECLARATION sites
//     (`concept "X":`, `decision "X":`, etc.) — declaration names are
//     always bare.
//   - `qualifiableReference` is used at REFERENCE sites (`defined as ...`,
//     `coded from ...`, narrative refs, etc.) — references may be bare
//     (same-file) or qualified (`"OtherLib"."Foo"`) for cross-library.
//

identifier
    : QUOTED_STRING
    ;

qualifiableReference
    : QUOTED_STRING (DOT QUOTED_STRING)?
    ;

decisionIdentifier
    : identifier
    ;

criterionIdentifier
    : identifier
    ;

decisionReference
    : qualifiableReference
    ;

terminologyIdentifier
    : identifier
    ;

terminologyReference
    : qualifiableReference
    ;

activityIdentifier
    : identifier
    ;

activityReference
    : qualifiableReference
    ;

conceptIdentifier
    : identifier
    ;

conceptReference
    : qualifiableReference
    ;

backtickString
    : BACKTICK_STRING
    ;

activityTypeValue
    : backtickString
    ;

rationale
    : backtickString
    ;
