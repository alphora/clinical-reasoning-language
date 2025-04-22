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
