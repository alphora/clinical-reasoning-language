# Activity Mapping Rules

- decision.when.do:
if action.definitionCanonical references a ActivityDefinition in any of the fsh files then
  // create a activity from the ActivityDefinition
  // set do reference to the activity's identifier
  - decision.when.do < activitydef-description
  // create a activity
  - activity.identifier < activitydef-description
  - activity.request < activitydef-kind
  - activity.request.of < activitydef-code-display
  if activity_def-donotperform = true
    - activity.request.doNot()
  if activitydef-code.exists() then
    // create a terminology.  terminology can be duplicated in references, but must be unique in the crl file
    - create(terminology)
      - new-terminology.identifier < activitydef-code-display
      - new-terminology.code < activitydef-code
/*
Note: `terminology` must be unique across the file, by `identifier`.
Like `when` clauses, when a terminology is encountered that has the same `identifier` as a previous terminology, but the `body` of the terminology clauses differ, then the identifier of the new terminology should be suffixed with  `_<count>`.  If the `identifier` and the `body` are the same, then do skip.
*/
else
  // create a CPGCommunicationRequest Activity
  // set do reference to the current action's condition expression
  - decision.when.do < plandef-condition-expression
  //create a activity
  - activity.identifier < plandef-condition-expression
  - activity.request < CPGCommunicationRequest
    // only add a message to CPGCommunicationRequest
  - activity.request.of < plandef-action-description
// create an optional rationale
- activity.because < plandef-rationale
