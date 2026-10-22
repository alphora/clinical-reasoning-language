library PresentationChoiceDemoLocalElements

using FHIR version '4.0.1'

include hl7.fhir.uv.cql.FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include PresentationChoiceDemoLocalConcepts

context Patient

define "Read a Book Records":
  [Observation: PresentationChoiceDemoLocalConcepts."Read a Book"]

define "Take a Walk Records":
  [Observation: PresentationChoiceDemoLocalConcepts."Take a Walk"]

define "Listen to Music Records":
  [Observation: PresentationChoiceDemoLocalConcepts."Listen to Music"]

define "Draw a Picture Records":
  [Observation: PresentationChoiceDemoLocalConcepts."Draw a Picture"]

define "Play a Game Records":
  [Observation: PresentationChoiceDemoLocalConcepts."Play a Game"]

define "Watch a Film Records":
  [Observation: PresentationChoiceDemoLocalConcepts."Watch a Film"]
