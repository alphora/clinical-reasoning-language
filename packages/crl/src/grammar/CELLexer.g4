lexer grammar CELLexer;

// ============================================================
// CEL (Case Example Language) lexer
//
// Sibling DSL to CRL — covers the instance / scenario side of Clinical
// Quality content. See discussion 046 (feature pitch) and 048 (Todo 2
// grammar+AST plan) for design context.
// ============================================================

// === Multi-word phrase tokens (ordered before bare IS for longest-match) ===
LIBRARY             : 'library';
INCLUDE             : 'include';
AS                  : 'as';
COVERS              : 'covers';
FACT                : 'fact';
CASE                : 'case';

NAME_IS             : 'name is';
BIRTH_DATE_IS       : 'birth date is';
CODE_IS             : 'code is';
DATE_IS             : 'date is';
VALUE_IS            : 'value is';
STAGE_IS            : 'stage is' -> mode(STAGE_MODE);
DESCRIPTION_IS      : 'description is';
ID_IS               : 'id is';
DEFINED_BY          : 'defined by';
SUBJECT_IS          : 'subject is';
ENCOUNTER_IS        : 'encounter is';
ANCHOR_IS           : 'anchor is';
RESULT_IS           : 'result is';
FACT_IS             : 'fact is';
AT_ANCHOR           : 'at anchor';

ABSENT_INTENT       : 'absent intent';
NEGATIVE_INTENT     : 'negative intent';
BASED_ON            : 'based on';
PART_OF             : 'part of';
DURING_ENCOUNTER    : 'during encounter';
REQUESTED_BY        : 'requested by';
PERFORMED_BY        : 'performed by';
NOT_DONE_BECAUSE    : 'not done because';
WITH                : 'with';
BECAUSE             : 'because';

// === Single-word keywords (ordered AFTER multi-word `* IS` tokens) ===
ANCHOR              : 'anchor';
AT                  : 'at';
ON                  : 'on';
NOW                 : 'now';
IS                  : 'is';
TRUE                : 'true';
FALSE               : 'false';

// TIME_UNIT — full parity with CRLLexer.g4 (closed allowlist, eligible for the drift-guard).
TIME_UNIT
    : 'years' | 'year' | 'months' | 'month' | 'weeks' | 'week'
    | 'days' | 'day' | 'hours' | 'hour' | 'minutes' | 'minute'
    | 'seconds' | 'second' | 'milliseconds' | 'millisecond'
    ;

// === Literals ===
fragment DIGIT      : [0-9];

// DATE_LITERAL must come BEFORE NUMBER so `2026-01-15` doesn't lex as NUMBER DASH NUMBER DASH NUMBER.
DATE_LITERAL        : DIGIT DIGIT DIGIT DIGIT '-' DIGIT DIGIT '-' DIGIT DIGIT;

NUMBER              : DIGIT+ ('.' DIGIT+)?;

// QUOTED_STRING — matches CRL's valid-input alternative byte-for-byte (drift-guard).
// CEL omits the unterminated-string error alternative; ANTLR's default lexer-error
// listener catches malformed strings.
QUOTED_STRING       : '"' (~["\\\r\n])* '"';

// BACKTICK_STRING — matches CRL's valid-input alternative byte-for-byte.
// Backslash-escapes are recognized by the lexer but preserved verbatim in the AST
// (see src/cel/ast/types.ts for the contract).
BACKTICK_STRING     : '`' ( ~[`\\] | '\\' . )* '`';

// HEADER — matches CRL exactly (no trailing-newline match; WS consumes the newline).
HEADER              : '#' ~[\r\n]* ;

// === Punctuation ===
DOT                 : '.';
COLON               : ':';
DASH                : '-';
PLUS                : '+';

// === Comments and Whitespace ===
fragment BLOCK_COMMENT_FRAG
    : '/*' .*? '*/'
    ;

WS
    : [ \t\r\n]+ -> skip
    ;

COMMENT
    : '//' ~[\r\n]* -> skip
    ;

COMMENT_BLOCK
    : BLOCK_COMMENT_FRAG -> skip
    ;

// === STAGE_MODE — bare-word stage values ===
// Quoted forms (`stage is "ordered".`) are NOT supported in v1; the `"` exclusion
// forces fall-through to DEFAULT_MODE's QUOTED_STRING and the parser rejects.
// Validator (Todo 4) may widen later.
mode STAGE_MODE;

STAGE_VALUE         : ~[ \t\r\n."]+ -> mode(DEFAULT_MODE);
STAGE_WS            : [ \t]+ -> skip;
