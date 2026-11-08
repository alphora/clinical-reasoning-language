# Decision Table review colors

A repeated interior route node shares review color only with copies that take
the same outgoing branch, including copies to the left of the pin. A reviewed
left-taking copy does not color an unreviewed right-taking copy. Different
continuations within the same outgoing branch can still share that node's color.
Review contributions come from
current test cases throughout the policy, including cases outside the visible
page or pin scope. Conditional nodes are matched by structure identity and the
connector's Yes/No direction, not by labels, terminal outcomes or which side of
the screen currently contains a node. Nonconditional nodes retain identity-based
sharing. An incomplete or ambiguous conditional path cannot supply a shared vote.

The existing review precedence applies:

- A passing reviewed path keeps a shared interior node green, even when another
  path through the same outgoing branch has a failing or pending verdict.
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
