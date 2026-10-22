library PresentationChoiceDemoLocalConcepts

using FHIR version '4.0.1'

include hl7.fhir.uv.cql.FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Presentation Choice Demo Local Codes": 'http://example.org/crl/presentation-choice-demo/CodeSystem/presentation-choice-demo-local'
code "Read a Book": 'read-book' from "Presentation Choice Demo Local Codes"
code "Take a Walk": 'take-walk' from "Presentation Choice Demo Local Codes"
code "Listen to Music": 'listen-music' from "Presentation Choice Demo Local Codes"
code "Draw a Picture": 'draw-picture' from "Presentation Choice Demo Local Codes"
code "Play a Game": 'play-game' from "Presentation Choice Demo Local Codes"
code "Watch a Film": 'watch-film' from "Presentation Choice Demo Local Codes"

context Patient
