# FHIRShorthand (FSH) to Clinical Practice Guideline Language (CPG-L) Mappings

## Mapping Rules

Mapping rules are expressed as `source > target`, where `source` is a [FSH Defined Term](#fsh-defined-terms) to be transformed and `target` is a [CPG-L Defined Term](#cpg-l-defined-terms) that is the result of the transformation.

### FSH Paths

"FSH path" refers to the hierarchical dot notation used to describe the structure of elements in a FHIR Shorthand (FSH) definition. Each segment in the path represents a named element within the FHIR data model. The path does not include specific indices for arrays; instead, it treats array elements as a collective object type. For example, Instance.action.code refers to the code field on the action element, regardless of how many action items there are.  That is FSH Paths are structural navigation not instance-specific indexed navigation.

For example:

`PlanDef.action.definitionCanonical` → the definitionCanonical field on each action object

`PlanDef.action.title` → the title field on each action object

`PlanDef.action.condition.expression.expression` → the expression field on the expression field on each condition object on each action object

### FSH Path Value

FSH Path Values are the value of a FSH Path.  Note, the relationship between Instance in the FSH file and PlanDef in the FSH Path is descibed in [Term Definitions](#term-definitions).

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

`PlanDef.action.desciption` = `"Check immunization plan definitions to see what is required."`.

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

- Activity: In these mapping rules the term `Activity` means `InstanceOf: http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-actiondefinition` in a FSH file.

#### FSH Path Values

FSH Path Values are the value of a given FSH Path, as defined in this section.  

The expression `[*].action` in these mapping rules means an arbitraty nesting of `action` objects within the `action` hierarchy of a `PlanDef`.

- `plandef-canonical` = `PlanDef.action.definitionCanonical` or `[*].action.definitionCanonical`

- `plandef-condition` = `PlanDef.action.condition` or `[*].action.condition`

- `plandef-markdown` = `PlanDef.action.valueMarkdown` or `[*].action.valueMarkdown`

- `plandef-title` = `PlanDef.action.title` or `[*].action.title`

- `plandef-description` = `PlanDef.action.description` or `[*].action.description` (note, `plandef-description` is different than `Description`)

- `activity-kind` = `Activity.kind`

- `activity-code` = `Activity.productCodeableConcept`

## CPG-L Defined Terms

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
Instance: IMMZD2DTMeaslesDose0.
```

## Rules

- Instance > decision
- Description > decision.name

