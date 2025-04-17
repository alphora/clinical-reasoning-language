# Rules

## Top Level Keywords

- concept
- decision
- activity
- terminology

### Concept

- 'concept' have 'type' (ex: Observation)
- 'concept' have 'valuetype' (ex: boolean)
- 'concept's have either a 'coded by' or a 'inferred by'
- if a concept is in a leaf node of a 'decision' then it gets a 'coded by'
    - 'coded by' are references to 'terminology' with:
        - a 'system' that is derived from the top level 'decision' name
        - a 'code' that is derived from the 'concept' that it 'coded by's
- if a 'concept' is not a leaf of a 'decision' it gets a 'inferred by'
    - 'inferred by' are an expression of 'concept's that are the children of the 'concept' (that infer or imply the 'concept')

### Decision

- 'PlanDefinition' in the FSH files are 'decisions'

### Activity

    - 'activity' have a name that is a summary of the comment (from the 'action.valueMarkdown' or the 'action.description') 
    - 'activity' have a 'perform' of 'CommunicationRequest'

### Terminology

    - 'terminology' have a name of the 'concept' they are a 'coded by' for
    - 'terminology' have a 'system' of the top level 'action's 'concept' name and a 'code' of the name of the 'concept' they are a 'coded by' for, all lowercase, with hyphens instead of spaces

### PlanDefinition

- FSH files may include 'PlanDefinition' FHIR resources
- Ensure all 'PlanDefinition's in all FSH files provided are processed
- Recursively traverse 'PlanDefinition'.action (internal to the PlanDefinition resource):
    
    - if you reach a 'PlanDefinition.action':
        - if the 'action' has at least one child create a 'when block'
        - else (the 'action' is a leaf) create a 'when statement'
        - use the 'action's 'condition.expression.expression' as the 'concept reference' of the 'when' and ensure there is a corresponding 'concept' (create if not exists)
    - if the 'action' has a 'definitionCanonical' create a 'use statement' and then traverse the 'definitionCanonical' to the target 'PlanDefinition' resource (external to the original PlanDefinition resource) and create a corresponding new 'decision'; continue traversing
    - if the 'action' is a leaf, create a 'activity statement' and ensure there is a corresponging 'activity' (create if not exists)
        - add a comment to the 'activity' that is either the 'action.valueMarkdown' or the 'action.description' if it doesn't have a 'valueMarkdown'
- Be wary of shallow 'decisions'.  It's likely an indicator of incomplete traversal
