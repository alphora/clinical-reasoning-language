# Activity Mapping Rules

- decision.when.do:
if action.definitionCanonical references a ActivityDefinition in any of the fsh files then
  // create a activity from the ActivityDefinition
  // set do reference to the activity's identifier
  - decision.when.do < activitydef-description
  //create a activity
  - activity.identifier < activitydef-description
  - activity.perform < activitydef-kind
  - activity.perform.of < activitydef-code-display
  if activity_def-donotperform = true
    - activity.perform.doNot()
  //create a terminology.  terminology can be duplicated in references, but must be unique in the cpgl file
  - create(terminology)
    - new-terminology.identifier < activitydef-code-display
    - terminology.code < activitydef.code
else
  // create a CPGCommunicationRequest Activity
  // set do reference to the current action's condition expression
  - decision.when.do < plandef-condition-expression
  //create a activity
  - activity.identifier < plandef-condition-expression
  - activity.perform < CPGCommunicationRequest
    // only add a message to CPGCommunicationRequest
  - activity.perform.of < plandef-action-description
// create an optional rationale
- activity.because < plandef-rationale
