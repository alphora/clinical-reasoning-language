library Semnot232FixtureInferred

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include Semnot232FixtureLocalSource

context Patient

define "Not Alpha":
  ({ true } except (Semnot232FixtureLocalSource."Alpha".asTruths()))

define "Beta Or Not Alpha":
  Semnot232FixtureLocalSource."Beta".asTruths()
    union ({ true } except (Semnot232FixtureLocalSource."Alpha".asTruths()))

define "Neither Alpha Nor Beta":
  ({ true } except (Semnot232FixtureLocalSource."Alpha".asTruths()))
    intersect ({ true } except (Semnot232FixtureLocalSource."Beta".asTruths()))

define "Beta And Not Alpha":
  Semnot232FixtureLocalSource."Beta".asTruths()
    except Semnot232FixtureLocalSource."Alpha".asTruths()

define "Beta And Grouped Not Alpha":
  Semnot232FixtureLocalSource."Beta".asTruths()
    except Semnot232FixtureLocalSource."Alpha".asTruths()
