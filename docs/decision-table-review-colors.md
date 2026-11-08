# Decision Table review colors

A repeated interior route node has the same review color in every applicable
row, including copies to the left of the pin. Review contributions come from
current test cases throughout the policy, including cases outside the visible
page or pin scope. Nodes are matched by their structure identity, not their label.

The existing review precedence applies:

- A passing reviewed path keeps a shared interior node green, even when another
  path through it has a failing or pending verdict.
- With no passing path, a failing reviewed path paints that interior node red.
- Pending contributes its color when no decided verdict reaches the node.
- Unreviewed cases do not contribute a color; clearing verdicts removes their paint.
- Execution errors retain their error overlay instead of a green pass fill.

Terminal nodes retain their own row's case verdicts and all-pass badge rules.
An approved terminal in one row does not approve a different row that happens
to end at the same modeled node. An uncovered row keeps its coverage error;
shared ancestors may have review colors without making that row covered or approved.

Criterion encoding judgments and complete definition-body approval remain
separate. The shared route paint does not change their approval conditions,
stored verdicts, clinical evaluation, case data, or test coverage.
