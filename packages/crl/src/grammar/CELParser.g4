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
valueField        : VALUE_IS (NUMBER | stringLiteral | TRUE | FALSE) ;
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
