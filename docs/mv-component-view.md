# Criterion components in Medical Validation

The criterion boundary represents a reusable component, not another clinical
question or condition to assess. Its authored name is technical identity and is
hidden from the normal canvas, available through the component tooltip and
existing technical review details.

An expanded component encloses its visible logic and attached question cards in
a subdued neutral boundary. Its compact Component tab carries the disclosure and
review controls. Collapsed components retain the tab, hidden-question indicator,
review status and applicable flag rollup. ALL OF, ANY OF and NOT retain their
authored meaning inside the component; the boundary implies no Boolean operator.

Root criteria retain their decision-route occurrence and selection behavior.
Nested criteria retain their criterion review identity. Neither flags nor review
verdicts are reassigned to a child. Existing source mappings remain unchanged.

Pinned containers enclose only visible component contents. Detached questionnaire
cards remain outside the container. Nested components retain separate identities
and boundaries, including single-child components. Disclosure actions preserve
the clicked control and viewport position.

Authority: operator-approved reusable-component design, September 12, 2026;
UX discussion 704. This changes rendering only, not CRL/CEL evaluation.
