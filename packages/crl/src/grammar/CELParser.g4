parser grammar CELParser;

options {
    tokenVocab=CELLexer;
}

// ============================================================
// CEL (Case Example Language) parser
//
// Sibling DSL to CRL. See discussion 048 (Todo 2 grammar+AST plan v4).
//
// Quoting conventions:
//   "..."  → quoted identifier / name
//   `...`  → backtick narrative (description / because clause)
// ============================================================

cel
    : HEADER? libraryStatement coversStatement? includeStatement* statement* EOF
    ;

// ============================
// Library / Covers / Include
// ============================

libraryStatement
    : LIBRARY stringLiteral DOT
    ;

coversStatement
    : COVERS stringLiteral DOT
    ;

// `include "Name".` and `include "Name" as "Alias".` (alias is parse-only;
// alias-not-yet-supported diagnostic raised at validator level — Todo 4).
includeStatement
    : INCLUDE stringLiteral (AS stringLiteral)? DOT
    ;

stringLiteral
    : QUOTED_STRING
    ;

backtickLiteral
    : BACKTICK_STRING
    ;

// ============================
// Statements
// ============================

statement
    : factStatement
    | caseStatement
    ;

// ============================
// fact "<name>": - field. - field. ...
// ============================

factStatement
    : FACT stringLiteral COLON factBody+
    ;

factBody
    : DASH (
          nameField
        | birthDateField
        | codeField
        | dateField
        | valueField
        | stageField
        | definedByField
      ) DOT
    ;

nameField         : NAME_IS stringLiteral ;
birthDateField    : BIRTH_DATE_IS stringLiteral ;
codeField         : CODE_IS stringLiteral ;
dateField         : DATE_IS stringLiteral ;
// ⭐ `value is 90 'kg'.` — the unit is GRAMMATICALLY OPTIONAL and SEMANTICALLY REQUIRED for a
// Quantity-valued target. Grammar-permissive / validator-strict is this language's established division (the
// boolean `value is` rules work the same way): a grammar that needed the concept's declared value type to
// parse would be context-sensitive and unlike everything else in CEL.
//
// The rule the validator enforces is a value-type x literal-shape TABLE, not a unit rule on its own —
// a unit is REQUIRED for a Quantity target and FORBIDDEN for an integer/decimal one, because a dimensionless
// integer is a first-class shape (charter §3's own worked example declares `value type is integer`).
valueField        : VALUE_IS (NUMBER SINGLE_QUOTED_STRING? | stringLiteral | TRUE | FALSE) ;
stageField        : STAGE_IS STAGE_VALUE ;
definedByField    : DEFINED_BY reference ;

reference
    : stringLiteral DOT stringLiteral   # QualifiedRef
    | stringLiteral                     # BareRef
    ;

// ============================
// case "<name>": - field. - field. ...
// ============================

caseStatement
    : CASE stringLiteral COLON caseBody+
    ;

caseBody
    : DASH (
          idField
        | descriptionField
        | subjectField
        | encounterField
        | anchorField
        | factRefField
        | resultField
        | crossResourceField
      ) DOT
    ;

idField          : ID_IS stringLiteral ;
descriptionField : DESCRIPTION_IS backtickLiteral ;
subjectField     : SUBJECT_IS stringLiteral ;
encounterField   : ENCOUNTER_IS stringLiteral ;

// `anchor is <expr>.` (ambient) | `anchor "<name>" is <expr>.` (named)
anchorField
    : ANCHOR_IS anchorExpr                       # AmbientAnchor
    | ANCHOR stringLiteral IS anchorExpr         # NamedAnchor
    ;

anchorExpr
    : NOW ((PLUS | DASH) NUMBER TIME_UNIT)?      # NowAnchor
    | DATE_LITERAL                               # FixedDateAnchor
    ;

// `fact is "<name>" [at|on ...] [with absent|negative intent] [because `<text>`].`
factRefField
    : FACT_IS stringLiteral atClause? withIntent? becauseClause?
    ;

atClause
    : AT_ANCHOR ((PLUS | DASH) NUMBER TIME_UNIT)?            # AtAmbientAnchor
    | AT stringLiteral ((PLUS | DASH) NUMBER TIME_UNIT)?     # AtNamedAnchor
    | ON DATE_LITERAL                                        # AtAbsoluteDate
    ;

withIntent
    : WITH (ABSENT_INTENT | NEGATIVE_INTENT)
    ;

becauseClause
    : BECAUSE backtickLiteral
    ;

// `result is "<leaf>" is <value>.`
resultField
    : RESULT_IS stringLiteral IS resultValue
    ;

resultValue
    : TRUE                # TrueResult
    | FALSE               # FalseResult
    | stringLiteral       # BranchResult
    ;

// `<source> <relation> <target>.`
// LL(1)-decidable: only crossResourceField starts with QUOTED_STRING (every other
// caseBody alternative starts with a unique keyword token). The relation token
// determines which CrossResourceRelation the AST builder emits.
crossResourceField
    : stringLiteral crossResourceRelation stringLiteral
    ;

crossResourceRelation
    : BASED_ON
    | PART_OF
    | DURING_ENCOUNTER
    | REQUESTED_BY
    | PERFORMED_BY
    | NOT_DONE_BECAUSE
    ;
