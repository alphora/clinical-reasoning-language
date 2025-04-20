
## Rules

- decision < plandef-instance.exists()
- decision.identifier < plandef-description
- decision.comment < plandef-instance
- decision.comment < plandef-title
- decision.comment < plandef-citation
- decision.when < plandef-action
- decision.when.identifier < plandef-condition-expression 


- plandef-canonical > decision.when.use


- activitydef > activity
- activitydef-description > decision.when.do
- activitydef-description > activity.identifier
- activitydef-kind > activity.perform
- activitydef-code-display > activity.perform.of
- plandef-rationale > activity.because
- activitydef-code-display > terminology.identifier
- activitydef-code > terminology.code

- plandef-condition > concept
- plandef-condition-expression > concept.identifier
