# mine-patterns — discovery report

Ran over **2344** statement records (`data/statements.jsonl`), walking **61,366** ELM nodes. Two analyses:

- **A. Function-call inventory** — every `FunctionRef` node ranked by `<libraryName>.<name>`. Each top hit is a named, explicit reusable shape; this is the de facto "pattern library" the corpus is already using.
- **B. Frequent-subtree signatures** at depths 2/3/4. Implicit recurring shapes that aren't wrapped in a function — the buried patterns we have to *discover*.

Full ranked lists are in `data/patterns/*.jsonl` (top 500 each, with up to 3 example call sites and a JSON-truncated subtree dump per example).

## A. Function-call inventory (top 30 by call count)

Top 30 of 237 unique entries.

| # | count | key |
|---:|---:|---|
| 1 | 3709 | `FHIRHelpers.ToValue` |
| 2 | 789 | `FHIRHelpers.ToConcept` |
| 3 | 787 | `FHIRHelpers.ToInterval` |
| 4 | 549 | `QICoreCommon.toInterval` |
| 5 | 245 | `QICoreCommon.earliest` |
| 6 | 150 | `QICoreCommon.prevalenceInterval` |
| 7 | 100 | `CQMCommon.hospitalizationWithObservation` |
| 8 | 89 | `TJC.calendarDayOfOrDayAfter` |
| 9 | 88 | `FHIRHelpers.ToQuantity` |
| 10 | 80 | `CMD.medicationRequestPeriod` |
| 11 | 62 | `Status.verified` |
| 12 | 61 | `FHIRHelpers.ToString` |
| 13 | 57 | `.latestGeneralAnesthesiaOrMAC` |
| 14 | 54 | `CQMCommon.isDiagnosisPresentOnAdmission` |
| 15 | 50 | `QICoreCommon.references` |
| 16 | 47 | `.isVerified` |
| 17 | 47 | `Status.isAssessmentPerformed` |
| 18 | 43 | `.firstAnesthesiaDuringHospitalization` |
| 19 | 38 | `CQMCommon.hospitalizationWithObservationAndOutpatientSurgeryService` |
| 20 | 36 | `.qualifies` |
| 21 | 34 | `Status.isEncounterPerformed` |
| 22 | 32 | `Status.isProcedurePerformed` |
| 23 | 27 | `FHIRHelpers.ToCode` |
| 24 | 25 | `QICoreCommon.latest` |
| 25 | 24 | `.fromDayOfStartOfHospitalizationToDayAfterAdmission` |
| 26 | 23 | `Status.isMedicationOrder` |
| 27 | 23 | `.moreThanOneOrder` |
| 28 | 20 | `.fromDayOfStartOfHospitalizationToDayAfterFirstICU` |
| 29 | 19 | `CQMCommon.encounterDiagnosis` |
| 30 | 18 | `CQMCommon.edVisit` |

<details><summary>Example call sites (first 5 entries)</summary>

**`FHIRHelpers.ToValue`** (count: 3709)
- `AHAOverall` :: `Moderate or Severe LVSD Findings` @ `operand.0.operand.where.operand.0.operand.0.operand`
  - call: `{"type":"FunctionRef","libraryName":"FHIRHelpers","name":"ToValue","operandCount":1}`
- `AHAOverall` :: `Heart Failure Outpatient Encounter with History of Moderate or Severe LVSD` @ `relationship.0.suchThat.operand.0.operand.operand.1.operand.0`
  - call: `{"type":"FunctionRef","libraryName":"FHIRHelpers","name":"ToValue","operandCount":1}`
- `AHAOverall` :: `Has Left Ventricular Assist Device` @ `operand.relationship.0.suchThat.operand.0.operand.operand.0.caseItem.0.when.operand`
  - call: `{"type":"FunctionRef","libraryName":"FHIRHelpers","name":"ToValue","operandCount":1}`
- `AHAOverall` :: `Has Left Ventricular Assist Device` @ `operand.relationship.0.suchThat.operand.0.operand.operand.0.caseItem.0.then.operand.operand`
  - call: `{"type":"FunctionRef","libraryName":"FHIRHelpers","name":"ToValue","operandCount":1}`
- `AHAOverall` :: `Has Left Ventricular Assist Device` @ `operand.relationship.0.suchThat.operand.0.operand.operand.0.caseItem.1.when.operand`
  - call: `{"type":"FunctionRef","libraryName":"FHIRHelpers","name":"ToValue","operandCount":1}`

**`FHIRHelpers.ToConcept`** (count: 789)
- `AHAOverall` :: `isVerified` @ `operand.0.operand.operand`
  - call: `{"type":"FunctionRef","libraryName":"FHIRHelpers","name":"ToConcept","operandCount":1}`
- `AHAOverall` :: `isVerified` @ `operand.1.operand.0.operand.0.operand.0.operand.0`
  - call: `{"type":"FunctionRef","libraryName":"FHIRHelpers","name":"ToConcept","operandCount":1}`
- `AHAOverall` :: `isVerified` @ `operand.1.operand.0.operand.0.operand.1.operand.0`
  - call: `{"type":"FunctionRef","libraryName":"FHIRHelpers","name":"ToConcept","operandCount":1}`
- `AHAOverall` :: `isVerified` @ `operand.1.operand.0.operand.1.operand.0`
  - call: `{"type":"FunctionRef","libraryName":"FHIRHelpers","name":"ToConcept","operandCount":1}`
- `AHAOverall` :: `isVerified` @ `operand.1.operand.1.operand.0`
  - call: `{"type":"FunctionRef","libraryName":"FHIRHelpers","name":"ToConcept","operandCount":1}`

**`FHIRHelpers.ToInterval`** (count: 787)
- `AHAOverall` :: `Heart Failure Outpatient Encounter` @ `relationship.0.suchThat.operand.0.operand.1`
  - call: `{"type":"FunctionRef","libraryName":"FHIRHelpers","name":"ToInterval","operandCount":1}`
- `AHAOverall` :: `Heart Failure Outpatient Encounter` @ `where.operand.0.operand.0`
  - call: `{"type":"FunctionRef","libraryName":"FHIRHelpers","name":"ToInterval","operandCount":1}`
- `AHAOverall` :: `Heart Failure Outpatient Encounter with History of Moderate or Severe LVSD` @ `relationship.0.suchThat.operand.1.operand`
  - call: `{"type":"FunctionRef","libraryName":"FHIRHelpers","name":"ToInterval","operandCount":1}`
- `AHAOverall` :: `Has Heart Transplant Complications` @ `operand.relationship.0.suchThat.operand.1.operand.operand`
  - call: `{"type":"FunctionRef","libraryName":"FHIRHelpers","name":"ToInterval","operandCount":1}`
- `AHAOverall` :: `Has Left Ventricular Assist Device` @ `operand.relationship.0.suchThat.operand.1.operand`
  - call: `{"type":"FunctionRef","libraryName":"FHIRHelpers","name":"ToInterval","operandCount":1}`

**`QICoreCommon.toInterval`** (count: 549)
- `AHAOverall` :: `Heart Failure Outpatient Encounter with History of Moderate or Severe LVSD` @ `relationship.0.suchThat.operand.0.operand.operand.1`
  - call: `{"type":"FunctionRef","libraryName":"QICoreCommon","name":"toInterval","operandCount":1}`
- `AHAOverall` :: `Has Left Ventricular Assist Device` @ `operand.relationship.0.suchThat.operand.0.operand`
  - call: `{"type":"FunctionRef","libraryName":"QICoreCommon","name":"toInterval","operandCount":1}`
- `AHAOverall` :: `Has Heart Transplant` @ `operand.relationship.0.suchThat.operand.0.operand`
  - call: `{"type":"FunctionRef","libraryName":"QICoreCommon","name":"toInterval","operandCount":1}`
- `AHAOverall` :: `overlapsAfterHeartFailureOutpatientEncounter` @ `operand.where.operand.0.operand.0`
  - call: `{"type":"FunctionRef","libraryName":"QICoreCommon","name":"toInterval","operandCount":1}`
- `AHAOverall` :: `overlapsAfterHeartFailureOutpatientEncounter` @ `operand.where.operand.0.operand.0.low.operand`
  - call: `{"type":"FunctionRef","libraryName":"QICoreCommon","name":"toInterval","operandCount":1}`

**`QICoreCommon.earliest`** (count: 245)
- `CMS0334FHIRPCCesareanBirth` :: `lastGravida` @ `operand.operand.0.source.source.where.operand.1.operand.0.operand.0`
  - call: `{"type":"FunctionRef","libraryName":"QICoreCommon","name":"earliest","operandCount":1}`
- `CMS0334FHIRPCCesareanBirth` :: `lastGravida` @ `operand.operand.0.source.source.sort.by.0.expression`
  - call: `{"type":"FunctionRef","libraryName":"QICoreCommon","name":"earliest","operandCount":1}`
- `CMS0334FHIRPCCesareanBirth` :: `lastParity` @ `operand.operand.0.source.source.where.operand.0.operand.0.operand.0.operand.0`
  - call: `{"type":"FunctionRef","libraryName":"QICoreCommon","name":"earliest","operandCount":1}`
- `CMS0334FHIRPCCesareanBirth` :: `lastParity` @ `operand.operand.0.source.source.sort.by.0.expression`
  - call: `{"type":"FunctionRef","libraryName":"QICoreCommon","name":"earliest","operandCount":1}`
- `CMS0334FHIRPCCesareanBirth` :: `lastHistoryPretermBirth` @ `operand.operand.0.source.source.where.operand.0.operand.0.operand.0.operand.0`
  - call: `{"type":"FunctionRef","libraryName":"QICoreCommon","name":"earliest","operandCount":1}`

</details>

## B. Subtree signatures — depth 2 (broad shapes)

Top 25 of 500 unique entries.

| # | count | key |
|---:|---:|---|
| 1 | 3709 | `FunctionRef:FHIRHelpers.ToValue(operand=[_])` |
| 2 | 2060 | `ExpressionRef(name=#s)` |
| 3 | 1995 | `Property:performed(scope=#s)` |
| 4 | 1545 | `Literal:{urn:hl7-org:elm-types:r1}String(value=#s)` |
| 5 | 1532 | `ValueSetRef(name=#s,preserve=#b)` |
| 6 | 1498 | `And(operand=[_,_])` |
| 7 | 1207 | `Union(operand=[_,_])` |
| 8 | 789 | `FunctionRef:FHIRHelpers.ToConcept(operand=[_])` |
| 9 | 787 | `FunctionRef:FHIRHelpers.ToInterval(operand=[_])` |
| 10 | 743 | `?(then=As(operand=_),when=Is(isType=#s,operand=_))` |
| 11 | 740 | `Is(isType=#s,operand=FunctionRef:FHIRHelpers.ToValue(operand=_))` |
| 12 | 689 | `Property:effective(scope=#s)` |
| 13 | 689 | `QueryLetRef(name=#s)` |
| 14 | 683 | `As(operand=FunctionRef:FHIRHelpers.ToValue(operand=_))` |
| 15 | 676 | `?(then=As(operand=_),when=Is(isTypeSpecifier=_,operand=_))` |
| 16 | 674 | `Is(isTypeSpecifier=<T>,operand=FunctionRef:FHIRHelpers.ToValue(operand=_))` |
| 17 | 671 | `Property:period(scope=#s)` |
| 18 | 647 | `As(operand=As(operand=_))` |
| 19 | 620 | `?(alias=#s,expression=ExpressionRef(name=#s))` |
| 20 | 616 | `In(operand=[_,_])` |
| 21 | 595 | `Or(operand=[_,_])` |
| 22 | 549 | `FunctionRef:QICoreCommon.toInterval(operand=[_])` |
| 23 | 535 | `Quantity(unit=#s,value=#n)` |
| 24 | 505 | `As:{urn:hl7-org:elm-types:r1}DateTime(operand=FunctionRef:FHIRHelpers.ToValue(operand=_))` |
| 25 | 494 | `As(operand=As:{urn:hl7-org:elm-types:r1}DateTime(operand=_))` |

<details><summary>Example call sites (first 5 entries)</summary>

**`FunctionRef:FHIRHelpers.ToValue(operand=[_])`** (count: 3709)
- `AHAOverall` :: `Moderate or Severe LVSD Findings` @ `operand.0.operand.where.operand.0.operand.0.operand`
  - subtree: `{"localId":"703","locator":"135:13-135:34","name":"ToValue","libraryName":"FHIRHelpers","type":"FunctionRef","resultTypeSpecifier":{"localId":"717","type":"ChoiceTypeSpecifier","choice":[{"localId":"718","name":"{urn:hl7-org:elm-types:r1}Quantity","type":"NamedTypeSpecifier"},{"localId":"719","name":"{urn:hl7-org:elm-types:r1}Concept","type":"NamedTypeSpecifier"},{"localId":"720","name":"{urn:hl7-org:elm-types:r1}String","type":"NamedTypeSpecifier"},{"localId":"721","name":"{urn:hl7-org:elm-types:r1}Boolean","type":"NamedTypeSpecifier"},{"localId":"722","name":"{urn:hl7-org:elm-types:r1}Integer","type":"NamedTypeSpecifier"},{"localId":"723","type":"IntervalTypeSpecifier","pointType":{"localI … (+604 chars)`
- `AHAOverall` :: `Heart Failure Outpatient Encounter with History of Moderate or Severe LVSD` @ `relationship.0.suchThat.operand.0.operand.operand.1.operand.0`
  - subtree: `{"localId":"980","locator":"126:61-126:82","name":"ToValue","libraryName":"FHIRHelpers","type":"FunctionRef","resultTypeSpecifier":{"localId":"987","type":"ChoiceTypeSpecifier","choice":[{"localId":"988","name":"{urn:hl7-org:elm-types:r1}DateTime","type":"NamedTypeSpecifier"},{"localId":"989","type":"IntervalTypeSpecifier","pointType":{"localId":"990","name":"{urn:hl7-org:elm-types:r1}DateTime","type":"NamedTypeSpecifier"}},{"localId":"991","name":"{http://hl7.org/fhir}Timing","type":"NamedTypeSpecifier"},{"localId":"992","name":"{urn:hl7-org:elm-types:r1}DateTime","type":"NamedTypeSpecifier"}]},"signature":[],"operand":[{"localId":"979","path":"effective","scope":"LVSDFindings","type":"Prop … (+8 chars)`
- `AHAOverall` :: `Has Left Ventricular Assist Device` @ `operand.relationship.0.suchThat.operand.0.operand.operand.0.caseItem.0.when.operand`
  - subtree: `{"localId":"1118","locator":"76:19-76:41","name":"ToValue","libraryName":"FHIRHelpers","type":"FunctionRef","resultTypeSpecifier":{"localId":"1127","type":"ChoiceTypeSpecifier","choice":[{"localId":"1128","name":"{urn:hl7-org:elm-types:r1}DateTime","type":"NamedTypeSpecifier"},{"localId":"1129","type":"IntervalTypeSpecifier","pointType":{"localId":"1130","name":"{urn:hl7-org:elm-types:r1}DateTime","type":"NamedTypeSpecifier"}},{"localId":"1131","name":"{urn:hl7-org:elm-types:r1}String","type":"NamedTypeSpecifier"},{"localId":"1132","name":"{urn:hl7-org:elm-types:r1}Quantity","type":"NamedTypeSpecifier"},{"localId":"1133","type":"IntervalTypeSpecifier","pointType":{"localId":"1134","name":"{u … (+173 chars)`

**`ExpressionRef(name=#s)`** (count: 2060)
- `AHAOverall` :: `Heart Failure Outpatient Encounter` @ `source.0.expression`
  - subtree: `{"localId":"364","locator":"42:3-42:24","name":"Outpatient Encounter","type":"ExpressionRef","resultTypeSpecifier":{"localId":"365","type":"ListTypeSpecifier","elementType":{"localId":"366","name":"{http://hl7.org/fhir}Encounter","type":"NamedTypeSpecifier"}}}`
- `AHAOverall` :: `Heart Failure Outpatient Encounter with History of Moderate or Severe LVSD` @ `source.0.expression`
  - subtree: `{"localId":"675","locator":"124:3-124:38","name":"Heart Failure Outpatient Encounter","type":"ExpressionRef","resultTypeSpecifier":{"localId":"676","type":"ListTypeSpecifier","elementType":{"localId":"677","name":"{http://hl7.org/fhir}Encounter","type":"NamedTypeSpecifier"}}}`
- `AHAOverall` :: `Heart Failure Outpatient Encounter with History of Moderate or Severe LVSD` @ `relationship.0.expression`
  - subtree: `{"localId":"946","locator":"125:10-125:43","name":"Moderate or Severe LVSD Findings","type":"ExpressionRef","resultTypeSpecifier":{"localId":"947","type":"ListTypeSpecifier","elementType":{"localId":"948","type":"ChoiceTypeSpecifier","choice":[{"localId":"949","name":"{http://hl7.org/fhir}Observation","type":"NamedTypeSpecifier"},{"localId":"950","name":"{http://hl7.org/fhir}Condition","type":"NamedTypeSpecifier"},{"localId":"951","name":"{http://hl7.org/fhir}Condition","type":"NamedTypeSpecifier"}]}}}`

**`Property:performed(scope=#s)`** (count: 1995)
- `AHAOverall` :: `Has Left Ventricular Assist Device` @ `operand.relationship.0.suchThat.operand.0.operand.operand.0.caseItem.0.when.operand.operand.0`
  - subtree: `{"localId":"1117","path":"performed","scope":"LVADPlacement","type":"Property"}`
- `AHAOverall` :: `Has Left Ventricular Assist Device` @ `operand.relationship.0.suchThat.operand.0.operand.operand.0.caseItem.0.then.operand.operand.operand.0`
  - subtree: `{"localId":"1117","path":"performed","scope":"LVADPlacement","type":"Property"}`
- `AHAOverall` :: `Has Left Ventricular Assist Device` @ `operand.relationship.0.suchThat.operand.0.operand.operand.0.caseItem.1.when.operand.operand.0`
  - subtree: `{"localId":"1117","path":"performed","scope":"LVADPlacement","type":"Property"}`

**`Literal:{urn:hl7-org:elm-types:r1}String(value=#s)`** (count: 1545)
- `AHAOverall` :: `isEncounterFinished` @ `operand.1`
  - subtree: `{"localId":"1757","locator":"177:22-177:31","resultTypeName":"{urn:hl7-org:elm-types:r1}String","valueType":"{urn:hl7-org:elm-types:r1}String","value":"finished","type":"Literal"}`
- `AHAOverall` :: `Moderate or Severe LVSD Findings` @ `operand.0.operand.where.operand.1.operand.1.element.0`
  - subtree: `{"localId":"738","locator":"136:42-136:48","resultTypeName":"{urn:hl7-org:elm-types:r1}String","valueType":"{urn:hl7-org:elm-types:r1}String","value":"final","type":"Literal"}`
- `AHAOverall` :: `Moderate or Severe LVSD Findings` @ `operand.0.operand.where.operand.1.operand.1.element.1`
  - subtree: `{"localId":"740","locator":"136:51-136:59","resultTypeName":"{urn:hl7-org:elm-types:r1}String","valueType":"{urn:hl7-org:elm-types:r1}String","value":"amended","type":"Literal"}`

**`ValueSetRef(name=#s,preserve=#b)`** (count: 1532)
- `AHAOverall` :: `Outpatient Encounter` @ `operand.0.operand.0.operand.0.codes`
  - subtree: `{"localId":"288","locator":"51:17-51:65","resultTypeName":"{urn:hl7-org:elm-types:r1}ValueSet","name":"Care Services in Long Term Residential Facility","preserve":true,"type":"ValueSetRef"}`
- `AHAOverall` :: `Outpatient Encounter` @ `operand.0.operand.0.operand.1.codes`
  - subtree: `{"localId":"296","locator":"52:25-52:50","resultTypeName":"{urn:hl7-org:elm-types:r1}ValueSet","name":"Home Healthcare Services","preserve":true,"type":"ValueSetRef"}`
- `AHAOverall` :: `Outpatient Encounter` @ `operand.0.operand.1.operand.0.codes`
  - subtree: `{"localId":"311","locator":"53:25-53:48","resultTypeName":"{urn:hl7-org:elm-types:r1}ValueSet","name":"Nursing Facility Visit","preserve":true,"type":"ValueSetRef"}`

</details>

## B. Subtree signatures — depth 3 (specific shapes)

Top 30 of 500 unique entries.

| # | count | key |
|---:|---:|---|
| 1 | 2060 | `ExpressionRef(name=#s)` |
| 2 | 1995 | `FunctionRef:FHIRHelpers.ToValue(operand=[Property:performed(scope=#s)])` |
| 3 | 1995 | `Property:performed(scope=#s)` |
| 4 | 1545 | `Literal:{urn:hl7-org:elm-types:r1}String(value=#s)` |
| 5 | 1532 | `ValueSetRef(name=#s,preserve=#b)` |
| 6 | 740 | `Is(isType=#s,operand=FunctionRef:FHIRHelpers.ToValue(operand=[_]))` |
| 7 | 689 | `Property:effective(scope=#s)` |
| 8 | 689 | `QueryLetRef(name=#s)` |
| 9 | 683 | `As(operand=FunctionRef:FHIRHelpers.ToValue(operand=[_]))` |
| 10 | 674 | `Is(isTypeSpecifier=<T>,operand=FunctionRef:FHIRHelpers.ToValue(operand=[_]))` |
| 11 | 671 | `FunctionRef:FHIRHelpers.ToInterval(operand=[Property:period(scope=#s)])` |
| 12 | 671 | `Property:period(scope=#s)` |
| 13 | 670 | `FunctionRef:FHIRHelpers.ToValue(operand=[Property:effective(scope=#s)])` |
| 14 | 644 | `?(then=As(operand=As(operand=_)),when=Is(isTypeSpecifier=<T>,operand=FunctionRef:FHIRHelpers.ToValue(operand=_)))` |
| 15 | 644 | `As(operand=As(operand=FunctionRef:FHIRHelpers.ToValue(operand=_)))` |
| 16 | 620 | `?(alias=#s,expression=ExpressionRef(name=#s))` |
| 17 | 535 | `Quantity(unit=#s,value=#n)` |
| 18 | 505 | `As:{urn:hl7-org:elm-types:r1}DateTime(operand=FunctionRef:FHIRHelpers.ToValue(operand=[_]))` |
| 19 | 492 | `As(operand=As:{urn:hl7-org:elm-types:r1}DateTime(operand=FunctionRef:FHIRHelpers.ToValue(operand=_)))` |
| 20 | 477 | `Null` |
| 21 | 474 | `Property:value(source=Property:status(scope=#s))` |
| 22 | 474 | `Property:status(scope=#s)` |
| 23 | 466 | `?(then=As(operand=As:{urn:hl7-org:elm-types:r1}DateTime(operand=_)),when=Is(isType=#s,operand=FunctionRef:FHIRHelpers.ToValue(operand=_)))` |
| 24 | 464 | `Retrieve:Condition(codeFilter=[],dateFilter=[],include=[],otherFilter=[],templateId=#s)` |
| 25 | 438 | `CodeRef(name=#s)` |
| 26 | 438 | `Literal:{urn:hl7-org:elm-types:r1}Integer(value=#s)` |
| 27 | 433 | `ExpressionRef(libraryName=#s,name=#s)` |
| 28 | 428 | `AliasRef:$this` |
| 29 | 387 | `Retrieve:Encounter(codeFilter=[],dateFilter=[],include=[],otherFilter=[],templateId=#s)` |
| 30 | 379 | `ParameterRef(name=#s)` |

<details><summary>Example call sites (first 5 entries)</summary>

**`ExpressionRef(name=#s)`** (count: 2060)
- `AHAOverall` :: `Heart Failure Outpatient Encounter` @ `source.0.expression`
  - subtree: `{"localId":"364","locator":"42:3-42:24","name":"Outpatient Encounter","type":"ExpressionRef","resultTypeSpecifier":{"localId":"365","type":"ListTypeSpecifier","elementType":{"localId":"366","name":"{http://hl7.org/fhir}Encounter","type":"NamedTypeSpecifier"}}}`
- `AHAOverall` :: `Heart Failure Outpatient Encounter with History of Moderate or Severe LVSD` @ `source.0.expression`
  - subtree: `{"localId":"675","locator":"124:3-124:38","name":"Heart Failure Outpatient Encounter","type":"ExpressionRef","resultTypeSpecifier":{"localId":"676","type":"ListTypeSpecifier","elementType":{"localId":"677","name":"{http://hl7.org/fhir}Encounter","type":"NamedTypeSpecifier"}}}`
- `AHAOverall` :: `Heart Failure Outpatient Encounter with History of Moderate or Severe LVSD` @ `relationship.0.expression`
  - subtree: `{"localId":"946","locator":"125:10-125:43","name":"Moderate or Severe LVSD Findings","type":"ExpressionRef","resultTypeSpecifier":{"localId":"947","type":"ListTypeSpecifier","elementType":{"localId":"948","type":"ChoiceTypeSpecifier","choice":[{"localId":"949","name":"{http://hl7.org/fhir}Observation","type":"NamedTypeSpecifier"},{"localId":"950","name":"{http://hl7.org/fhir}Condition","type":"NamedTypeSpecifier"},{"localId":"951","name":"{http://hl7.org/fhir}Condition","type":"NamedTypeSpecifier"}]}}}`

**`FunctionRef:FHIRHelpers.ToValue(operand=[Property:performed(scope=#s)])`** (count: 1995)
- `AHAOverall` :: `Has Left Ventricular Assist Device` @ `operand.relationship.0.suchThat.operand.0.operand.operand.0.caseItem.0.when.operand`
  - subtree: `{"localId":"1118","locator":"76:19-76:41","name":"ToValue","libraryName":"FHIRHelpers","type":"FunctionRef","resultTypeSpecifier":{"localId":"1127","type":"ChoiceTypeSpecifier","choice":[{"localId":"1128","name":"{urn:hl7-org:elm-types:r1}DateTime","type":"NamedTypeSpecifier"},{"localId":"1129","type":"IntervalTypeSpecifier","pointType":{"localId":"1130","name":"{urn:hl7-org:elm-types:r1}DateTime","type":"NamedTypeSpecifier"}},{"localId":"1131","name":"{urn:hl7-org:elm-types:r1}String","type":"NamedTypeSpecifier"},{"localId":"1132","name":"{urn:hl7-org:elm-types:r1}Quantity","type":"NamedTypeSpecifier"},{"localId":"1133","type":"IntervalTypeSpecifier","pointType":{"localId":"1134","name":"{u … (+173 chars)`
- `AHAOverall` :: `Has Left Ventricular Assist Device` @ `operand.relationship.0.suchThat.operand.0.operand.operand.0.caseItem.0.then.operand.operand`
  - subtree: `{"localId":"1118","locator":"76:19-76:41","name":"ToValue","libraryName":"FHIRHelpers","type":"FunctionRef","resultTypeSpecifier":{"localId":"1127","type":"ChoiceTypeSpecifier","choice":[{"localId":"1128","name":"{urn:hl7-org:elm-types:r1}DateTime","type":"NamedTypeSpecifier"},{"localId":"1129","type":"IntervalTypeSpecifier","pointType":{"localId":"1130","name":"{urn:hl7-org:elm-types:r1}DateTime","type":"NamedTypeSpecifier"}},{"localId":"1131","name":"{urn:hl7-org:elm-types:r1}String","type":"NamedTypeSpecifier"},{"localId":"1132","name":"{urn:hl7-org:elm-types:r1}Quantity","type":"NamedTypeSpecifier"},{"localId":"1133","type":"IntervalTypeSpecifier","pointType":{"localId":"1134","name":"{u … (+173 chars)`
- `AHAOverall` :: `Has Left Ventricular Assist Device` @ `operand.relationship.0.suchThat.operand.0.operand.operand.0.caseItem.1.when.operand`
  - subtree: `{"localId":"1118","locator":"76:19-76:41","name":"ToValue","libraryName":"FHIRHelpers","type":"FunctionRef","resultTypeSpecifier":{"localId":"1127","type":"ChoiceTypeSpecifier","choice":[{"localId":"1128","name":"{urn:hl7-org:elm-types:r1}DateTime","type":"NamedTypeSpecifier"},{"localId":"1129","type":"IntervalTypeSpecifier","pointType":{"localId":"1130","name":"{urn:hl7-org:elm-types:r1}DateTime","type":"NamedTypeSpecifier"}},{"localId":"1131","name":"{urn:hl7-org:elm-types:r1}String","type":"NamedTypeSpecifier"},{"localId":"1132","name":"{urn:hl7-org:elm-types:r1}Quantity","type":"NamedTypeSpecifier"},{"localId":"1133","type":"IntervalTypeSpecifier","pointType":{"localId":"1134","name":"{u … (+173 chars)`

**`Property:performed(scope=#s)`** (count: 1995)
- `AHAOverall` :: `Has Left Ventricular Assist Device` @ `operand.relationship.0.suchThat.operand.0.operand.operand.0.caseItem.0.when.operand.operand.0`
  - subtree: `{"localId":"1117","path":"performed","scope":"LVADPlacement","type":"Property"}`
- `AHAOverall` :: `Has Left Ventricular Assist Device` @ `operand.relationship.0.suchThat.operand.0.operand.operand.0.caseItem.0.then.operand.operand.operand.0`
  - subtree: `{"localId":"1117","path":"performed","scope":"LVADPlacement","type":"Property"}`
- `AHAOverall` :: `Has Left Ventricular Assist Device` @ `operand.relationship.0.suchThat.operand.0.operand.operand.0.caseItem.1.when.operand.operand.0`
  - subtree: `{"localId":"1117","path":"performed","scope":"LVADPlacement","type":"Property"}`

**`Literal:{urn:hl7-org:elm-types:r1}String(value=#s)`** (count: 1545)
- `AHAOverall` :: `isEncounterFinished` @ `operand.1`
  - subtree: `{"localId":"1757","locator":"177:22-177:31","resultTypeName":"{urn:hl7-org:elm-types:r1}String","valueType":"{urn:hl7-org:elm-types:r1}String","value":"finished","type":"Literal"}`
- `AHAOverall` :: `Moderate or Severe LVSD Findings` @ `operand.0.operand.where.operand.1.operand.1.element.0`
  - subtree: `{"localId":"738","locator":"136:42-136:48","resultTypeName":"{urn:hl7-org:elm-types:r1}String","valueType":"{urn:hl7-org:elm-types:r1}String","value":"final","type":"Literal"}`
- `AHAOverall` :: `Moderate or Severe LVSD Findings` @ `operand.0.operand.where.operand.1.operand.1.element.1`
  - subtree: `{"localId":"740","locator":"136:51-136:59","resultTypeName":"{urn:hl7-org:elm-types:r1}String","valueType":"{urn:hl7-org:elm-types:r1}String","value":"amended","type":"Literal"}`

**`ValueSetRef(name=#s,preserve=#b)`** (count: 1532)
- `AHAOverall` :: `Outpatient Encounter` @ `operand.0.operand.0.operand.0.codes`
  - subtree: `{"localId":"288","locator":"51:17-51:65","resultTypeName":"{urn:hl7-org:elm-types:r1}ValueSet","name":"Care Services in Long Term Residential Facility","preserve":true,"type":"ValueSetRef"}`
- `AHAOverall` :: `Outpatient Encounter` @ `operand.0.operand.0.operand.1.codes`
  - subtree: `{"localId":"296","locator":"52:25-52:50","resultTypeName":"{urn:hl7-org:elm-types:r1}ValueSet","name":"Home Healthcare Services","preserve":true,"type":"ValueSetRef"}`
- `AHAOverall` :: `Outpatient Encounter` @ `operand.0.operand.1.operand.0.codes`
  - subtree: `{"localId":"311","locator":"53:25-53:48","resultTypeName":"{urn:hl7-org:elm-types:r1}ValueSet","name":"Nursing Facility Visit","preserve":true,"type":"ValueSetRef"}`

</details>

## B. Subtree signatures — depth 4 (deep shapes)

Top 30 of 500 unique entries.

| # | count | key |
|---:|---:|---|
| 1 | 2060 | `ExpressionRef(name=#s)` |
| 2 | 1995 | `FunctionRef:FHIRHelpers.ToValue(operand=[Property:performed(scope=#s)])` |
| 3 | 1995 | `Property:performed(scope=#s)` |
| 4 | 1545 | `Literal:{urn:hl7-org:elm-types:r1}String(value=#s)` |
| 5 | 1532 | `ValueSetRef(name=#s,preserve=#b)` |
| 6 | 689 | `Property:effective(scope=#s)` |
| 7 | 689 | `QueryLetRef(name=#s)` |
| 8 | 671 | `FunctionRef:FHIRHelpers.ToInterval(operand=[Property:period(scope=#s)])` |
| 9 | 671 | `Property:period(scope=#s)` |
| 10 | 670 | `FunctionRef:FHIRHelpers.ToValue(operand=[Property:effective(scope=#s)])` |
| 11 | 644 | `?(then=As(operand=As(operand=FunctionRef:FHIRHelpers.ToValue(operand=_))),when=Is(isTypeSpecifier=<T>,operand=FunctionRef:FHIRHelpers.ToValue(operand=[_])))` |
| 12 | 644 | `As(operand=As(operand=FunctionRef:FHIRHelpers.ToValue(operand=[_])))` |
| 13 | 620 | `?(alias=#s,expression=ExpressionRef(name=#s))` |
| 14 | 535 | `Quantity(unit=#s,value=#n)` |
| 15 | 523 | `As(operand=FunctionRef:FHIRHelpers.ToValue(operand=[Property:performed(scope=#s)]))` |
| 16 | 492 | `As(operand=As:{urn:hl7-org:elm-types:r1}DateTime(operand=FunctionRef:FHIRHelpers.ToValue(operand=[_])))` |
| 17 | 490 | `Is(isType=#s,operand=FunctionRef:FHIRHelpers.ToValue(operand=[Property:performed(scope=#s)]))` |
| 18 | 490 | `Is(isTypeSpecifier=<T>,operand=FunctionRef:FHIRHelpers.ToValue(operand=[Property:performed(scope=#s)]))` |
| 19 | 477 | `Null` |
| 20 | 474 | `Property:value(source=Property:status(scope=#s))` |
| 21 | 474 | `Property:status(scope=#s)` |
| 22 | 466 | `?(then=As(operand=As:{urn:hl7-org:elm-types:r1}DateTime(operand=FunctionRef:FHIRHelpers.ToValue(operand=_))),when=Is(isType=#s,operand=FunctionRef:FHIRHelpers.ToValue(operand=[_])))` |
| 23 | 464 | `Retrieve:Condition(codeFilter=[],dateFilter=[],include=[],otherFilter=[],templateId=#s)` |
| 24 | 438 | `CodeRef(name=#s)` |
| 25 | 438 | `Literal:{urn:hl7-org:elm-types:r1}Integer(value=#s)` |
| 26 | 433 | `ExpressionRef(libraryName=#s,name=#s)` |
| 27 | 428 | `AliasRef:$this` |
| 28 | 387 | `Retrieve:Encounter(codeFilter=[],dateFilter=[],include=[],otherFilter=[],templateId=#s)` |
| 29 | 379 | `ParameterRef(name=#s)` |
| 30 | 368 | `As(operand=Retrieve:Condition(codeFilter=[],dateFilter=[],include=[],otherFilter=[],templateId=#s))` |

<details><summary>Example call sites (first 5 entries)</summary>

**`ExpressionRef(name=#s)`** (count: 2060)
- `AHAOverall` :: `Heart Failure Outpatient Encounter` @ `source.0.expression`
  - subtree: `{"localId":"364","locator":"42:3-42:24","name":"Outpatient Encounter","type":"ExpressionRef","resultTypeSpecifier":{"localId":"365","type":"ListTypeSpecifier","elementType":{"localId":"366","name":"{http://hl7.org/fhir}Encounter","type":"NamedTypeSpecifier"}}}`
- `AHAOverall` :: `Heart Failure Outpatient Encounter with History of Moderate or Severe LVSD` @ `source.0.expression`
  - subtree: `{"localId":"675","locator":"124:3-124:38","name":"Heart Failure Outpatient Encounter","type":"ExpressionRef","resultTypeSpecifier":{"localId":"676","type":"ListTypeSpecifier","elementType":{"localId":"677","name":"{http://hl7.org/fhir}Encounter","type":"NamedTypeSpecifier"}}}`
- `AHAOverall` :: `Heart Failure Outpatient Encounter with History of Moderate or Severe LVSD` @ `relationship.0.expression`
  - subtree: `{"localId":"946","locator":"125:10-125:43","name":"Moderate or Severe LVSD Findings","type":"ExpressionRef","resultTypeSpecifier":{"localId":"947","type":"ListTypeSpecifier","elementType":{"localId":"948","type":"ChoiceTypeSpecifier","choice":[{"localId":"949","name":"{http://hl7.org/fhir}Observation","type":"NamedTypeSpecifier"},{"localId":"950","name":"{http://hl7.org/fhir}Condition","type":"NamedTypeSpecifier"},{"localId":"951","name":"{http://hl7.org/fhir}Condition","type":"NamedTypeSpecifier"}]}}}`

**`FunctionRef:FHIRHelpers.ToValue(operand=[Property:performed(scope=#s)])`** (count: 1995)
- `AHAOverall` :: `Has Left Ventricular Assist Device` @ `operand.relationship.0.suchThat.operand.0.operand.operand.0.caseItem.0.when.operand`
  - subtree: `{"localId":"1118","locator":"76:19-76:41","name":"ToValue","libraryName":"FHIRHelpers","type":"FunctionRef","resultTypeSpecifier":{"localId":"1127","type":"ChoiceTypeSpecifier","choice":[{"localId":"1128","name":"{urn:hl7-org:elm-types:r1}DateTime","type":"NamedTypeSpecifier"},{"localId":"1129","type":"IntervalTypeSpecifier","pointType":{"localId":"1130","name":"{urn:hl7-org:elm-types:r1}DateTime","type":"NamedTypeSpecifier"}},{"localId":"1131","name":"{urn:hl7-org:elm-types:r1}String","type":"NamedTypeSpecifier"},{"localId":"1132","name":"{urn:hl7-org:elm-types:r1}Quantity","type":"NamedTypeSpecifier"},{"localId":"1133","type":"IntervalTypeSpecifier","pointType":{"localId":"1134","name":"{u … (+173 chars)`
- `AHAOverall` :: `Has Left Ventricular Assist Device` @ `operand.relationship.0.suchThat.operand.0.operand.operand.0.caseItem.0.then.operand.operand`
  - subtree: `{"localId":"1118","locator":"76:19-76:41","name":"ToValue","libraryName":"FHIRHelpers","type":"FunctionRef","resultTypeSpecifier":{"localId":"1127","type":"ChoiceTypeSpecifier","choice":[{"localId":"1128","name":"{urn:hl7-org:elm-types:r1}DateTime","type":"NamedTypeSpecifier"},{"localId":"1129","type":"IntervalTypeSpecifier","pointType":{"localId":"1130","name":"{urn:hl7-org:elm-types:r1}DateTime","type":"NamedTypeSpecifier"}},{"localId":"1131","name":"{urn:hl7-org:elm-types:r1}String","type":"NamedTypeSpecifier"},{"localId":"1132","name":"{urn:hl7-org:elm-types:r1}Quantity","type":"NamedTypeSpecifier"},{"localId":"1133","type":"IntervalTypeSpecifier","pointType":{"localId":"1134","name":"{u … (+173 chars)`
- `AHAOverall` :: `Has Left Ventricular Assist Device` @ `operand.relationship.0.suchThat.operand.0.operand.operand.0.caseItem.1.when.operand`
  - subtree: `{"localId":"1118","locator":"76:19-76:41","name":"ToValue","libraryName":"FHIRHelpers","type":"FunctionRef","resultTypeSpecifier":{"localId":"1127","type":"ChoiceTypeSpecifier","choice":[{"localId":"1128","name":"{urn:hl7-org:elm-types:r1}DateTime","type":"NamedTypeSpecifier"},{"localId":"1129","type":"IntervalTypeSpecifier","pointType":{"localId":"1130","name":"{urn:hl7-org:elm-types:r1}DateTime","type":"NamedTypeSpecifier"}},{"localId":"1131","name":"{urn:hl7-org:elm-types:r1}String","type":"NamedTypeSpecifier"},{"localId":"1132","name":"{urn:hl7-org:elm-types:r1}Quantity","type":"NamedTypeSpecifier"},{"localId":"1133","type":"IntervalTypeSpecifier","pointType":{"localId":"1134","name":"{u … (+173 chars)`

**`Property:performed(scope=#s)`** (count: 1995)
- `AHAOverall` :: `Has Left Ventricular Assist Device` @ `operand.relationship.0.suchThat.operand.0.operand.operand.0.caseItem.0.when.operand.operand.0`
  - subtree: `{"localId":"1117","path":"performed","scope":"LVADPlacement","type":"Property"}`
- `AHAOverall` :: `Has Left Ventricular Assist Device` @ `operand.relationship.0.suchThat.operand.0.operand.operand.0.caseItem.0.then.operand.operand.operand.0`
  - subtree: `{"localId":"1117","path":"performed","scope":"LVADPlacement","type":"Property"}`
- `AHAOverall` :: `Has Left Ventricular Assist Device` @ `operand.relationship.0.suchThat.operand.0.operand.operand.0.caseItem.1.when.operand.operand.0`
  - subtree: `{"localId":"1117","path":"performed","scope":"LVADPlacement","type":"Property"}`

**`Literal:{urn:hl7-org:elm-types:r1}String(value=#s)`** (count: 1545)
- `AHAOverall` :: `isEncounterFinished` @ `operand.1`
  - subtree: `{"localId":"1757","locator":"177:22-177:31","resultTypeName":"{urn:hl7-org:elm-types:r1}String","valueType":"{urn:hl7-org:elm-types:r1}String","value":"finished","type":"Literal"}`
- `AHAOverall` :: `Moderate or Severe LVSD Findings` @ `operand.0.operand.where.operand.1.operand.1.element.0`
  - subtree: `{"localId":"738","locator":"136:42-136:48","resultTypeName":"{urn:hl7-org:elm-types:r1}String","valueType":"{urn:hl7-org:elm-types:r1}String","value":"final","type":"Literal"}`
- `AHAOverall` :: `Moderate or Severe LVSD Findings` @ `operand.0.operand.where.operand.1.operand.1.element.1`
  - subtree: `{"localId":"740","locator":"136:51-136:59","resultTypeName":"{urn:hl7-org:elm-types:r1}String","valueType":"{urn:hl7-org:elm-types:r1}String","value":"amended","type":"Literal"}`

**`ValueSetRef(name=#s,preserve=#b)`** (count: 1532)
- `AHAOverall` :: `Outpatient Encounter` @ `operand.0.operand.0.operand.0.codes`
  - subtree: `{"localId":"288","locator":"51:17-51:65","resultTypeName":"{urn:hl7-org:elm-types:r1}ValueSet","name":"Care Services in Long Term Residential Facility","preserve":true,"type":"ValueSetRef"}`
- `AHAOverall` :: `Outpatient Encounter` @ `operand.0.operand.0.operand.1.codes`
  - subtree: `{"localId":"296","locator":"52:25-52:50","resultTypeName":"{urn:hl7-org:elm-types:r1}ValueSet","name":"Home Healthcare Services","preserve":true,"type":"ValueSetRef"}`
- `AHAOverall` :: `Outpatient Encounter` @ `operand.0.operand.1.operand.0.codes`
  - subtree: `{"localId":"311","locator":"53:25-53:48","resultTypeName":"{urn:hl7-org:elm-types:r1}ValueSet","name":"Nursing Facility Visit","preserve":true,"type":"ValueSetRef"}`

</details>
