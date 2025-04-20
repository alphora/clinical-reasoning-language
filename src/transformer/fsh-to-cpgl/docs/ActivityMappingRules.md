
We should finish off activity.

Here are the rules:


Some of that is done but not all.

Investigate and report back.

Note, I thin we're creating a do even when the definitionCanonical doesn't reference an ActivityDefinition.  In that case we should traverse and create new decisions, not create a 


- decision.when.do:
if action.definitionCanonical references a ActivityDefinition in any of the fsh files then
    // create a activity from the ActivityDefinition
    // set do reference to the activity's identifier
    - decision.when.do < activitydef-description
    //create a activity
    - activity.identifier < activitydef-description
    - activity.perform < activitydef-kind
    - activity.perform.of < activitydef-code-display
    //create a terminology.  terminology can be duplicated in references, but must be unique in the cpgl file
    - terminology.identifier < activitydef-code-display
    - terminology.code < activitydef-code
else
    // create a CPGCommunicationRequest Activity
    // set do reference to the current action's condition expression
    - decision.when.do < plandef-condition-expression
      //create a activity
    - activity.identifier < plandef-condition-expression
    - activity.perform < CPGCommunicationRequest
    // only add a message to CPGCommunicationRequest
    - activity.perform.of < plandef-action-description
