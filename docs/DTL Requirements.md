# Domain Specific Language Requirements

We have a domain specific language called Decision Tree Language (DTL).

The primary purpose of the language is to represent a FHIR PlanDefinition as a Decision Tree or Decision Graph using the Clinical Practice Guideline Implementation Guide (CPG IG).

## Goal

- assess whether there are gaps in the current DTL
- assess whether there are improvements that could be made in the current DTL
- create a Antlr grammar for the finalized DTL

## Description

The current language implementation includes a set of statements that describe the language to a AI assistant.  These need to be included in achieving the goal. To that end, the statements are included delimited between the "DTL Grammar Statements" tags.

There is a subset of the CPG IG definitions that we are targeting with the language.  These need to be included in achieving the goal.  To that end, the applicable CPG IG specs are found at  [Applicable CPG IG Specs](#dtl-grammar-statements).

## Considerations

There is an associated language, Case Feature Language (CFL), that is referenced by keywords in DTL, but at this maturity of the language those references are not validated.

## Elements

The elements of DTL are:

- root node

- leaf node

- edges

- decision nodes

## PlanDefinition Mappings

The following elements of FHIR PlanDefinition map to the described (Description) conceptual features of the DTL language:

- id
    Description: unique id

- action
    Description:
        The backbone of the graph
        With the first action of the top level PlanDefinition being the root

- action.condition
    Description:
        The decision nodes

- action.condition.expression
    Description:
        A reference to the associated CFL statement

- action.input
    Description:
        The arguments to the decision nodes

- action.definitionCanonical
    Description:
        The definitionalCanonical has two uses:
            - A reference to another (decision tree/decision graph) PlanDefinition used for composing subtrees/subgraphs
            - A reference to a leaf node

- action.action
    Description:
        The edges of the DecisionTree/DecisionGraph

### Out of Scope

The following are PlanDefinition elements that will be mapped in a subsequent version of the language:

action.relatedAction
action.relatedAction.actionId
action.relatedAction.relationship
action.relatedAction.offset

action.timing

action.selectionBehavior

## DTL Grammar Statements

The following is a description of a Decision Tree Language (DTL) tree. A DTL tree will take the following form:

``` dtl
IF <concept block> THEN
    <action block OR DTL tree>
ELSE IF <concept block> THEN
    <action block OR DTL tree>
ELSE
    <action block OR DTL tree>
```

There can be one or more ELSE IF sections, and the ELSE section is optional.

A concept block is a logical expression using logical operators AND, OR, and NOT involving concept objects of the following form:

``` dtl
CONCEPT{
    "description": "Example description",
    "expression": "Summary of concept"
}
```

An action block is a logical expression using logical operators AND, OR, and NOT involving action objects of the following form:

``` dtl
ACTION{
    "description": "Example description",
    "expression": "Summary of action"
}
```

Additionally, logical expressions can specify that a multiplicity of a sequence of OR-separated inputs be true. This can be specified via the following syntax:

``` dtl
SELECT[>=2](A OR B OR C)
```

The above example returns true if and only if at least 2 of A, B, or C are true.

To specify that exactly 2 should be true:

``` dtl
SELECT[2](A OR B OR C)
```

Strict inequality is also allowed. For example,

``` dtl
SELECT[<2](A OR B OR C)
```

returns true if and only if less than 2 of A, B, or C are true.

The SELECT keyword can also be used to specify that none of a sequence of OR-separated inputs be true. This can be specified via the following syntax:

``` dtl
SELECT[NONE](A OR B OR C)
```

The above example returns true if and only if none of A, B, or C are true.

The SELECT keyword can also be used to specify that all of a sequence of AND-separated inputs be true. This can be specified via the following syntax:

``` dtl
SELECT[ALL](A AND B AND C)
```

The above example returns true if and only if all of A, B, and C are true.

A DTL tree can also just be an action block if there are no concepts.

A DTL is not allowed to have any comments.
