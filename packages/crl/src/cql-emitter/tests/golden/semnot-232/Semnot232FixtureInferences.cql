library Semnot232FixtureInferences

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include Semnot232FixtureLocalPrimitives

context Patient

define "Not Alpha":
  ({ true } except (Semnot232FixtureLocalPrimitives."Alpha".asTruths()))

define "Beta Or Not Alpha":
  Semnot232FixtureLocalPrimitives."Beta".asTruths()
    union ({ true } except (Semnot232FixtureLocalPrimitives."Alpha".asTruths()))

define "Neither Alpha Nor Beta":
  ({ true } except (Semnot232FixtureLocalPrimitives."Alpha".asTruths()))
    intersect ({ true } except (Semnot232FixtureLocalPrimitives."Beta".asTruths()))

define "Beta And Not Alpha":
  Semnot232FixtureLocalPrimitives."Beta".asTruths()
    except Semnot232FixtureLocalPrimitives."Alpha".asTruths()

define "Beta And Grouped Not Alpha":
  Semnot232FixtureLocalPrimitives."Beta".asTruths()
    except Semnot232FixtureLocalPrimitives."Alpha".asTruths()
