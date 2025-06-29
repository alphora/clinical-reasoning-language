library Inferred

using FHIR version '4.0.1'

include FHIRHelpers 
include FHIRCommon called FC
include CaseFeatureCommon called CFC
include DomainConcepts called DomainConcepts
include RecordElements called RecordElements
include DomainElements called DomainElements

context Patient

define "Most Recent Record Elements Height":
 CFC.MostRecent(RecordElements."Height")

define "Most Recent Record Elements Domain Height":
    CFC.CaseFeatureObservation(
        DomainConcepts."Most Recent Height Concept",
        "Most Recent Record Elements Height".value as FHIR.Quantity,
        'http://example.org/hcscsdh/demo/StructureDefinition/observable-clinicalhistory-generalcharacteristic-bodymeasure-most-recent-height-casefeature-definition',
        "Most Recent Record Elements Height",
        ''
    )

define "Most Recent Domain Height":
    CFC.MostRecent(DomainElements."Most Recent Height")

define "Most Recent Record Elements Weight":
    CFC.MostRecent(RecordElements."Weight")

define "Most Recent Record Elements Domain Weight":
    CFC.CaseFeatureObservation(
        DomainConcepts."Most Recent Weight Concept",
        "Most Recent Record Elements Weight".value as FHIR.Quantity,
        'http://example.org/hcscsdh/demo/StructureDefinition/observable-clinicalhistory-generalcharacteristic-bodymeasure-most-recent-weight-casefeature-definition',
        "Most Recent Record Elements Weight",
        ''
    )

define "Most Recent Domain Weight":
    CFC.MostRecent(DomainElements."Most Recent Weight")
