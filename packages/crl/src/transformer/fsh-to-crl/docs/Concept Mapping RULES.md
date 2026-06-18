# Concept Mapping RULES

- concept < plandef-condition
- concept.identifier < plandef-condition-expression
- concept.type < Observation
- concept.type.comment < "TODO: confirm"
- concept.valueType < boolean
- concept.valueType.comment < "TODO: confirm"
//create a new terminology and reference it
- concept.coded-by < concept.identifier
- concept.coded-by.comment < "//TODO: build out"
- create(terminology)
  - new-terminology.identifier < concept.identifier
  - new-terminology.system < "http://sdh.com/cqis/kalm"
  - new-terminology.code < concept.identifier.toCode()
/*
Note: `terminology` must be unique across the file, by `identifier`.
Like `when` clauses, when a terminology is encountered that has the same `identifier` as a previous terminology, but the `body` of the terminology clauses differ, then the identifier of the new terminology should be suffixed with  `_<count>`.  If the `identifier` and the `body` are the same, then do skip.
*/
