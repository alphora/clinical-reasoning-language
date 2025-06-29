library DerivedInferred

using FHIR version '4.0.1'

include FHIRHelpers 
include FHIRCommon called FC
include CaseFeatureCommon called CFC
include DomainConcepts called DomainConcepts
include RecordElements called RecordElements
include DomainElements called DomainElements
include Interface called Interface

context Patient


define "Most Recent Record Elements BMI":
    CFC.MostRecent(RecordElements."BMI")

define "Most Recent Record Elements Domain BMI":
    CFC.CaseFeatureObservation(
        DomainConcepts."Most Recent BMI Concept",
        "Most Recent Record Elements BMI".value as FHIR.Quantity,
        'http://example.org/hcscsdh/demo/StructureDefinition/observable-clinicalhistory-generalcharacteristic-bodymeasure-most-recent-bmi-casefeature-definition',
        "Most Recent Record Elements BMI",
        ''
    )

define CalculateBMI:
    if Interface."Most Recent Weight".value.value is null or Interface."Most Recent Height".value.value is null
    then null as FHIR.Quantity
    else
        CFC.ToFHIRQuantity(
            Interface."Most Recent Weight".value.value / (Interface."Most Recent Height".value.value ^ 2), 
            'kg/m2'
        )    

// Needs to use the date of the weight 
// Needs to have the provenance of the system
define "Most Recent Derived BMI":
    CFC.CaseFeatureObservation(
        DomainConcepts."Most Recent BMI Concept",
        CalculateBMI,
        'http://example.org/hcscsdh/demo/StructureDefinition/observable-clinicalhistory-generalcharacteristic-bodymeasure-most-recent-bmi-casefeature-definition',
        Interface."Most Recent Height",
        ''
    )
    