# FHIRShorthand (FSH) to Clinical Practice Guideline Language (CPG-L) Mappings

## Mapping Rules

Mapping rules are expressed as `source > target`, where `source` is a [FSH Defined Term](#fsh-defined-terms) to be transformed and `target` is a [CPG-L Defined Term](#cpg-l-defined-terms) that is the result of the transformation.

If a `source` is null or an empty string ("") then a mapping will not be performed.  That is to say a `target` will not be generated from that application of the mapping rule.

### FSH Paths

"FSH path" refers to the hierarchical dot notation used to describe the structure of elements in a FHIR Shorthand (FSH) definition. Each segment in the path represents a named element within the FHIR data model. The path does not include specific indices for arrays; instead, it treats array elements as a collective object type. For example, Instance.action.code refers to the code field on the action element, regardless of how many action items there are.  That is FSH Paths are structural navigation not instance-specific indexed navigation.

For example:

`PlanDef.action.definitionCanonical` → the definitionCanonical field on each action object

`PlanDef.action.title` → the title field on each action object

`PlanDef.action.condition.expression.expression` → the expression field on the expression field on each condition object on each action object

### FSH Path Value

FSH Path Values are the value of a FSH Path.  Note, the relationship between Instance in the FSH file and PlanDef in the FSH Path is described in [FSH Term Definitions](#fsh-term-definitions).

FSH Path Values can optionally include formatting functions as described in [FSH Path Function](#fsh-path-functions).

For example, given:

```FSH
    Instance: IMMZDTImmunizationStrategy
    InstanceOf: http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition
    Title: "IMMZ.DT.Immunization Strategy"
    Description: "Provide vaccinations according to the recommended schedule"
    Usage: #definition
    * meta.profile[+] = "http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-shareableplandefinition"
    * meta.profile[+] = "http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-publishableplandefinition"

    * extension[+]
    * url = "http://hl7.org/fhir/StructureDefinition/cqf-knowledgeCapability"
    * valueCode = #computable
    * url = "http://smart.who.int/immunizations-measles/PlanDefinition/IMMZDTImmunizationStrategy"
    * name = "IMMZDTImmunizationStrategy"
    * status = #draft
    * experimental = true
    * publisher = "World Health Organization (WHO)"
    * relatedArtifact[+]
    * type = #citation
    * citation = "WHO recommendations for routine immunization - summary tables (March 2023)"
    * action[+]
    * title = "Check Immunizations"
    * description = "Check immunization plan definitions to see what is required."
    * code = http://hl7.org/fhir/uv/cpg/CodeSystem/cpg-common-process-cs#dispense-medications
    * selectionBehavior = #all
```

and given the FSH Path: `PlanDef.action.title`

then:

the FSH Path Value = `"Check Immunizations"`.

Also:

`PlanDef.action.description` = `"Check immunization plan definitions to see what is required."`.

### FSH Term Definitions

FSH Term Definitions are either a defined term or a FSH Path value.

#### FSH Defined Terms

- Instance: The term `Instance` means the value of the Instance element that is a sibling of InstanceOf element.

For example:

given:

```FSH
    Instance: IMMZD2DTMeaslesCIMR
    InstanceOf: http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-immunizationactivity
    Title: "IMMZ.D2.DT.Measles.Contraindication"
    Description: "Provide measles immunization"
    Usage: #definition
```

then:

`Instance` = `IMMZD2DTMeaslesCIMR`.

- Description: The term `Description` means the value of the Description element that is a sibling of InstanceOf element.

For example:

given:

```FSH
    Instance: IMMZD2DTMeaslesCIMR
    InstanceOf: http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-immunizationactivity
    Title: "IMMZ.D2.DT.Measles.Contraindication"
    Description: "Provide measles immunization"
    Usage: #definition
```

then:

`Description` = `"Provide measles immunization"`.

- PlanDefinition (PlanDef): In these mapping rules the term `PlanDef` means either:

  - `InstanceOf: http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition` in a FSH file
  - `InstanceOf: http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-recommendationdefinition` in a FSH file

- ActivityDefinition (ActivityDef): In these mapping rules the term `ActivityDef` means `InstanceOf: http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-actiondefinition` in a FSH file.

#### FSH Path Functions

FSH Path Functions are code-like hints that describe how to format the FSH Path Value when translating to CPG-L.

- `toIdentifier()`: ensure the CPG-L value meets the requirements of a CPG-L identifier:

```regex
'"' ( ~["\\\r\n] )* '"'
```

For example:

given:

```FSH
Instance: IMMZDTImmunizationStrategy
InstanceOf: http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition
Title: "IMMZ.DT.Immunization Strategy"
Description: "Provide vaccinations according to the\r\n recommended schedule"
```

and:

`Description.toIdentifier()`

the CPG-L value would be:

"Provide vaccinations according to the recommended schedule"

- `toString()`: ensure the value meets the requirements of a CPG-L string:

```regex
'"' ( '\\' . | ~["] )* '"'
```

For example:

given:

```FSH
Instance: IMMZDTImmunizationStrategy
InstanceOf: http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition
Title: "IMMZ.DT.Immunization Strategy"
Description: "Provide vaccinations according to the\n recommended schedule"
```

and:

`Description.toString()`

the CPG-L value would be:

"Provide vaccinations according to the\n recommended schedule"

- `remove(string)`: remove all instances of the `string` argument from the CPG-l value.

For example:

given:

```FSH
* kind = #MedicationRequest
```

and:

`ActivityDef.kind.remove('#')`

then:

the CPG-L value would be: MedicationRequest.

- `where(clause)`: only generate a CPG-L value if the clause arguments exists.

The `clause` argument has two arguments, separated by a `=`: `leftArg=rightArg`.

The `leftArg` is a FSH Path.

The `rightArg` is the value of the FSH Path.

The `where` FSH Path Function only generates a CPG-L value if both the `leftArg` exists (relative to the FSH Term the `where` is being invoked on) and it has a value of `rightArg`.

For example:

given:

```FSH
Instance: IMMZD2DTMeaslesEval
InstanceOf: http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-servicerequestactivity
* dynamicValue[+]
  * path = "code.coding"
  * expression
    * description = "Measles Code"
    * language = #text/cql
    * expression = "XM28X5"
```

and:

`ActivityDef.dynamicValue.expression.expression.where(ActivityDef.dynamicValue.path="code.coding")`

then:

the CPG-L value would be: "XM28X5".

However:

given:

```FSH
Instance: IMMZD2DTMeaslesEval
InstanceOf: http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-servicerequestactivity
* dynamicValue[+]
  * path = "code.coding"
  * expression
    * description = "Measles Code"
    * language = #text/cql
    * expression = "XM28X5"
```

and:

`ActivityDef.dynamicValue.expression.expression.where(ActivityDef.dynamicValue.path="code.coding")`

then:

the CPG-L value would not be generated (because the value would be "", an empty string).

- `extractCode()`: the CPG-L value is the result of executing the regex transform, where `input` is the FSH Path Value:

```regex
input.replace(/\$(\w+)#(\w+)\s+".*?"/, 'system "$1" code "$2"')
```

For example:

given:

```FSH
Instance: IMMZD2DTMeaslesCIMR
InstanceOf: http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-immunizationactivity
* productCodeableConcept = $ICD11#XM28X5 "Measles vaccines"
```

and:

`ActivityDef.productCodeableConcept.extractCode()`

then:

the CPG-L value would be: system "ICD11" code "XM28X5"

- `extractCodeDisplay()`: the CPG-L value is the result of executing the regex transform, where `input` is the FSH Path Value:

```regex
input.replace(/^.*?"(.*?)"$/, '"$1"')
```

For example:

given:

```FSH
Instance: IMMZD2DTMeaslesCIMR
InstanceOf: http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-immunizationactivity
* productCodeableConcept = $ICD11#XM28X5 "Measles vaccines"
```

and:

`ActivityDef.productCodeableConcept.extractCodeDisplay()`

then:

the CPG-L value would be: system "Measles vaccines"

- `extractCodeExpression()`: the CPG-L value is the result of executing the regex transform, where `input` is the FSH Path Value:

```regex
input.replace(/Code\s*{\s*system:\s*'([^']+)',\s*code:\s*'([^']+)'\s*}/, 'system "$1" code "$2"')
```

For example:

given:

```FSH
Instance: IMMZD2DTMeaslesEval
InstanceOf: http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-servicerequestactivity
* dynamicValue[+]
  * path = "code.coding"
  * expression
    * description = "Measles Code"
    * language = #text/cql
    * expression = "Code { system: 'http://id.who.int/icd/release/11/mms', code: 'XM28X5' }"
```

and:

`ActivityDef.dynamicValue.expression.expression.extractCodeExpression()`

then:

the CPG-L value would be: system "http://id.who.int/icd/release/11/mms" code "XM28X5"

- "": the quoted string is inserted literally into the resulting CPG-L value.

For example:

given:

```FSH
Instance: IMMZD2DTMeaslesEval
InstanceOf: http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-servicerequestactivity
Title: "IMMZ.D2.DT.Measles.Eval"
Description: "Provide measles immunization"
Usage: #definition
```

And the transformation rule:

description > decision.identifier":\n"

The resulting CPG-L value would be:

```CPG-L
"Provide measles immunization":

```

#### FSH Path Values

FSH Path Values are the value of a given FSH Path, as defined in this section.  

The expression `[*].action` in these mapping rules means an arbitrary nesting of `action` objects within the `action` hierarchy of a `PlanDef`.

<!-- TODO: dynamicValue -->

- `plandef` = Instance of PlanDef

- `plandef-description` = Description of PlanDef

- `plandef-citation` = `PlanDef.relatedArtifact.citation.toIdentifier()`

- `plandef-action` = `PlanDef.action` or `[*].action`

- `plandef-canonical` = `PlanDef.action.definitionCanonical` or `[*].action.definitionCanonical` Note, `plandef-canonical` is a navigation term as described in [Navigation](#navigation).  It does not get mapped to a CPG-L term.

- `plandef-condition` = `PlanDef.action.condition` or `[*].action.condition`

- `plandef-condition-expression` = `PlanDef.action.condition.expression.expression.toIdentifier()` or `[*].action.condition.expression.expression.toIdentifier()`

- `plandef-title` = `PlanDef.action.title.toIdentifier()` or `[*].action.title.toIdentifier()`

- `plandef-description` = `PlanDef.action.description.toIdentifier()` or `[*].action.description.toIdentifier()` (note, `plandef-description` is different than `Description`)

- `plandef-rationale` = `PlanDef.extension.valueMarkdown.toString()` or `[*].action.extension.valueMarkdown.toString()`

- `activitydef` = Instance of ActivityDef

- `activitydef-description` = Description of ActivityDef

- `activitydef-kind` = `ActivityDef.kind.remove('#')`

- `activitydef-code` = one of either:
  - `ActivityDef.productCodeableConcept.extractCode()`
  - `ActivityDef.dynamicValue.expression.expression.where(ActivityDef.dynamicValue.path="code.coding").extractCodeExpression()`

- `activitydef-code-display` = one of either:
  - `ActivityDef.productCodeableConcept.extractCodeDisplay()`
  - `ActivityDef.dynamicValue.expression.description.where(ActivityDef.dynamicValue.path="code.coding")`

## CPG-L Defined Terms

- `decision`: the CPG-L `decision` keyword.

For example:

given:

```FSH
Instance: IMMZD2DTMeaslesEval
InstanceOf: http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-servicerequestactivity
Title: "IMMZ.D2.DT.Measles.Eval"
Description: "Provide measles immunization"
Usage: #definition
```

and:

instance > decision

then:

CPG-L would be generated:

```CPG-L
decision
```

- `decision.identifier`: the CPG-L `decision` keyword's identifier value.

For example:

given:

```FSH
Instance: IMMZD2DTMeaslesEval
InstanceOf: http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-servicerequestactivity
Title: "IMMZ.D2.DT.Measles.Eval"
Description: "Provide measles immunization"
Usage: #definition
```

and:

description > decision.identifier

then:

CPG-L would be generated:

```CPG-L
decision "Provide measles immunization"
```

- `decision.comment`: a comment on the CPG-L `decision` keyword.

For example:

given:

```FSH
Instance: IMMZD2DTMeaslesEval
InstanceOf: http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-servicerequestactivity
Title: "IMMZ.D2.DT.Measles.Eval"
Description: "Provide measles immunization"
Usage: #definition
* relatedArtifact[+]
  * type = #citation
  * citation = "WHO recommendations for routine immunization - summary tables (March 2023)"
```

and:

- plandef > decision
- plandef-description > decision.identifier
- plandef-citation > decision.comment

then:

CPG-L would be generated:

```CPG-L
// WHO recommendations for routine immunization - summary tables (March 2023)
decision "Provide measles immunization"
```

## Navigation

File internal
File external

Navigation from one FSH FHIR resource to another FSH FHIR resource, whether in the same file or a separate file, is via definitionCanonical.  The argument of Canonical() is the Instance value of a FSH FHIR resource, either in the same file or another file.

For example:

given:

```FSH
Instance: IMMZDTImmunizationStrategy
InstanceOf: http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition
Description: "Provide vaccinations according to the recommended schedule"
* action[+]
  * title = "Check Immunizations"
  * description = "Check immunization plan definitions to see what is required."
  * action[+]
    * title = "Measles Dose 0"
    * description = "Consider measles dose 0 immunization"
    * definitionCanonical = Canonical(IMMZD2DTMeaslesDose0)
```

then:

```FSH
    * definitionCanonical = Canonical(IMMZD2DTMeaslesDose0)
```

is a reference from the IMMZDTImmunizationStrategy FSR FHIR resource to the following FSH FHIR resource:

```FSH
Instance: IMMZD2DTMeaslesDose0
```

## Rules

- plandef > decision
- plandef-description > decision.identifier
- plandef-citation > decision.comment
- plandef-action > decision.when
- plandef-canonical > decision.when.use
- plandef-condition.expression > decision.when.identifier
- plandef-title > decision.when.identifier
- activitydef-description > decision.when.do
- plandef-rationale > decision.rationale
- plandef-description > decision.comment
- activitydef > activity
- activitydef-description > activity.identifier
- activitydef-kind > activity.perform
- activitydef-code-display > activity.perform.of
- activitydef-code-display > terminology.identifier
- activitydef-code > terminology.code
- plandef-condition > concept
- plandef-condition-expression > concept.identifier
