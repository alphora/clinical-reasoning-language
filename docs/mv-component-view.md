# Criterion components in Medical Validation

The criterion boundary represents a reusable component, not another clinical
question or condition to assess. Its authored name is technical identity and is
hidden from the normal canvas, available through the component tooltip and
existing technical review details.

An expanded component encloses its visible logic and attached question cards in
a subdued neutral boundary. Its compact Criterion tab carries the disclosure and
review controls. Collapsed components retain the tab, hidden-question indicator,
review status and applicable flag rollup. ALL OF, ANY OF and NOT retain their
authored meaning inside the component; the boundary implies no Boolean operator.

Root criteria retain their decision-route occurrence and selection behavior.
Nested criteria retain their criterion review identity. Neither flags nor review
verdicts are reassigned to a child. Existing source mappings remain unchanged.

Pinned containers enclose only visible component contents. The separate Result Questionnaire pane contains the pinned route’s questions; its cards remain outside tree containers. Nested components retain separate identities
and boundaries, including single-child components. Disclosure actions preserve
the clicked control and viewport position.

The Result Questionnaire shows each input once, even when several conditions
refer to it. Question identity is the library and concept, not its wording or
position in the route. Every tree occurrence retains its condition and criterion
path, and uses the same question number. Equivalent wording targets share their
draft. Distinct scoped wording remains available through a selector within the
one question card; editing still targets the selected wording's original owner.
Differing determinations across uses remain visible, including Unknown. This is
MV presentation behavior; it does not alter the generated FHIR Questionnaire or
clinical evaluation.

Operator-approved interactions (September 12, 2026): opening a tree disclosure
opens its available nested disclosures; closing it preserves descendant state.
Unknown or elided bodies remain bounded. Questions use Q numbers on the tree and
attached cards, and bare numbers in the Result Questionnaire. Mouse interaction
does not paint a selection/focus ring on disclosures or the questionnaire toggle;
keyboard focus remains visible. The toggle beside the pinned leaf opens or closes a separate Result Questionnaire pane. Closing that pane restores attached questions; unpinning, retargeting or closing the tree closes the Result Questionnaire. Draft wording is retained when switching between attached and separate views.

Resolved helper wrappers may disappear visually inside a Criterion when their
complete input/operator body remains available. Logical identities, qualification
truth and source mappings remain unchanged. Their flags display on the enclosing
Criterion while retaining their original targets. Answerable input leaves are
never suppressed. Opaque, unresolved and projected conditions remain visible.
A suppressed helper has no separate visible truth ring or clickable box; its
qualification is not transferred to the input question. Concept/source peeks
continue to identify the decision rows that the concept drives. The logical
helper occurrence remains available to evaluation and flag targeting.
Repeated inherited choices belong to the actual input question even outside a
Criterion; unresolved helpers retain available choices when no input is rendered.

With Questions off, answer choices use the dotted tree disclosure and mark the
selected answer. Tree and card disclosures retain their own independent expansion
state. Authored ALL OF/ANY OF groups have independent connector emphasis: ANY OF uses teal, ALL OF uses orange, independent of depth. Enabled connectors use a white line with a colored glow matching the condition connectors; inactive groups stay neutral. Turning a group off also clears
its descendants; turning it on leaves them unchanged. This emphasis is a reading
aid, not an evaluation result. Clicking a group changes connector emphasis. Synthetic wrappers do not create Boolean groups in the MV tree. The existing CRL Questionnaire and FHIR Questionnaire each have their own open/close toggle inside the tree pane. They remain separate views with their existing data and rendering behavior.

Authority: operator-approved refinement, UX discussions 704, 710, 714/715, 718/719, and 720/721. Machine
identifiers retain component terminology. CRL/CEL evaluation remains unchanged.

To flag a visually suppressed helper, right-click its expanded Criterion and choose the specific concept target. Each target retains its original identity; sharing a Criterion never implicitly selects the first helper. Static snapshots preserve group emphasis, but their group labels are inert.

Attached Questions use 320px condition nodes and cards; outcome leaves retain their original 168px width. Node labels fit the actual rendered width, using up to two lines and truncating only remaining overflow. Unpinning restores the original tree labels and geometry. The labeled Next control above the pinned leaf visits each distinct visual leaf once, selecting its first available case/route in authored enumeration order. Distinct leaves with the same outcome label remain separate stops. Navigation from an alternate route starts at its leaf; ends are disabled rather than wrapping. The existing route chooser still offers alternate routes. Traversal retains the pin and updates selection, questions and available source correspondence.

The navigation shows `n of c ← Next →`, using a one-based position and the total
number of navigable results. While the Result Questionnaire is open, node badges
keep Boolean answers inline (`Q6 Yes`); other populated answers use `Q6 …`.
The ellipsis indicates an abbreviated answer, not an action to open another pane.
Its tooltip points to the questionnaire and includes the full answer.

The unpinned MV tree shows one pin: the first leaf without a Pass checkmark, or the first leaf when all leaves have Pass. Holding Shift exposes every leaf pin; releasing Shift or leaving the window restores the single pin. This follows visible review status, including leaves without an authored CEL route; activating such a pin retains the existing no-route message. Clicking a result’s pin immediately opens the pinned Question–Result view using its first available route, even when another route was selected previously. Right-clicking a node in the main unpinned tree offers its route chooser and opens Question–Result after a route is chosen; cancellation leaves the view unchanged. Right-clicking a pin does nothing. Pinned-node and nested-criterion review menus retain their interactions. Fresh pinning turns Questions on. An async choice is ignored after another selection/pin intent, tree replacement, or policy change. Unpinning restores the single default pin.

The pinned result’s verdict icon shows the worst case verdict in its group: Fail,
To do, Pending, then Pass. Missing judgments are To do. The group contains the
same cases as the existing result-level Pass all action. Choosing a verdict
explicitly sets the entire group, including existing judgments, in one save.
Clicking a verdict icon focuses its owning item before opening the selector.
Pass is green, Fail red, Pending orange, and To do grey, using the same circle/check.

Criterion uses the same verdict labels and icon while retaining its shared
criterion identity, body-hash validation, and elision safeguards. Its menu has
one Criterion verdict entry; case-group verdict is provided on the result.

The plain flag icon represents MV flags only: grey adds a flag, yellow opens
active flags, and green opens resolved flags. The adjacent KE marker represents
only extraction (authoring) flags, yellow while active and green when resolved.
Each node control opens its own category; its counts and colors are independent.
The policy-wide flag summary and list include both categories. A rollup that
cannot create flags shows only KE when it contains KE flags and no MV flags.
Workflow category, rather than the human or AI creator, controls this distinction.

Open KE flags offer **Accept flag** and **Reject flag**. Accept transfers the existing
record to MV and keeps it open, preserving its ID, content, references, and target.
The KE marker disappears and the MV flag takes its place. Reject closes the KE flag
without creating an MV flag; the closed KE flag can be reopened. The drawer shows
current Workflow (KE or MV), rather than treating category as immutable origin.

KE content remains read-only until accepted. Accepted flags use the existing MV
actions; a retained authoring tag keeps its description-only edit form. Details,
issue links and Close remain available. The KE authoring tools retain their
existing write capabilities.

Disclosure updates preserve tree chrome and restore the clicked control inside
the same render transaction, before painting. Selection replay does not pan the
tree during these updates, pinning, or result navigation. The Result Questionnaire
toggle focuses its owning result and pans it into view after the pane update,
using a short resize-quiet delay. A later user interaction cancels that focus request.

Verdict icons sit at the top-right. Result icons are inset from the rounded edge;
expanded Criterion icons follow their container’s right edge. Question badges
leave space to the left of verdict controls. Repeated expansion/collapse restores
and recomputes control placement without changing its owner or action.

Mouse clicks add no temporary focus border. Existing node-focus halos remain, and active toggles retain blue borders. Keyboard focus remains visible. Verdict saves in Question–Result refresh the existing display without re-selecting the route or moving the viewport. Verdict and flag circles share a vertical centerline. The legend uses short labeled sections for Review, Condition, Navigation, Groups and Flags.
