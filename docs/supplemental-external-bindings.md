# Independent supplemental definition assembly

CRL 6.4.59 adds a bounded SDK interface, absent from CRL 6.4.58. It assembles
definitions from independently authored parent and supplement packages in one
process. It introduces no CRL syntax or CLI/MCP option.
Source-side CRE/CEL evaluation with these bindings is unsupported.

The supplement owns a selected Boolean Observation publication that the parent
uses directly in a decision guard or a same-library Criterion. The supplement
delegates to the parent's existing decision. Each original package retains its
metadata, support resource identities, physical CQL names and code/profile domains.
Necessary consumer CQL, question inputs and answer-retention wiring use the actual
provider target. Original authoring files are never rewritten by these calls.

```ts
import {
  captureExternalSupport, captureExternalDecision,
  createExternalBindings, emitCrlTwoLane,
} from "@smile-digital-health/crl";

// Use original package entry paths and logical source declaration names.
const helper = captureExternalSupport(supplementEntry, {
  library: "Supplemental Inputs",
  concept: "Calculate Supplemental Uncertainty",
}, { date: "2026-11-22" });

const parent = captureExternalDecision(parentEntry, {
  library: "Parent", decision: "Parent assessment decision",
}, {
  date: "2026-11-22",
  externalBindings: createExternalBindings({ publications: [{
    consumerSource: parentEntry,
    reference: {
      library: "Supplemental Inputs",
      concept: "Calculate Supplemental Uncertainty",
    },
    provider: helper,
  }] }),
});

const assembled = emitCrlTwoLane(supplementEntry, {
  date: "2026-11-22",
  externalBindings: createExternalBindings({ decisions: [{
    consumerSource: supplementEntry,
    reference: { library: "Parent", decision: "Parent assessment decision" },
    provider: parent,
  }] }),
});
if (!assembled.success) throw new Error(JSON.stringify(assembled.hardErrors));
```

`consumerSource` is the actual source file containing the bound reference, which
need not be the package entry. An unused or ambiguous binding is refused. Captures
require original on-disk sources, valid owning metadata and ordinary import
admission. Snapshots are operation-local: retain the actual returned objects and
use them within the same process; JSON serialization does not create a reusable
snapshot. Changed source pins or captured content are refused. Capture uses
optimistic read/parse/rehash checks, not filesystem locking.

Helper capture emits only its closed support-source dependency set in the original
compilation context. An unrelated stub-backed route need not emit successfully.
The selected export must actually emit a public Record/Observation Boolean target.
Support sources containing Decisions or Activities are refused. A producer/private
envelope consumer of an external publication is unsupported, as is another consumed
declaration from a replaced compilation source without its own supported binding.
Package registry visibility alone does not grant import admission.

Question profiles follow the ordinary definition traversal. Authored presentation
groups add member profiles when the question traversal reaches the group.
Available-value membership retains its computational operands without requesting
them merely to complete capture. A helper with no authored question does not acquire
one. Complete CQL includes, Library attachments and owned definition references
must resolve in the captured inventory; unknown qualified dependencies are refused.

Identical borrowed artifacts coalesce with all origins retained. Conflicting paths,
resource identities, canonicals, CQL bytes or attachments fail before ordinary
closure invariants. There is no exemption for a foreign canonical base. Different
bases are not categorically forbidden, but actual catalog/resource collisions still
fail and neither side is rewritten to hide them.

For complete externally bound decision assemblies, the validated returned inventory
omits unused generated recommendation PlanDefinitions and their unreferenced
generated activities. Referenced support and CQL remain unchanged. Ordinary emission
without external bindings and support-only component inventories retain their
existing behavior. This does not qualify independently packaged source placeholders.

The assembled result retains original entry canonicals. Parent `<artifact-id>` and
supplemental `<artifact-id>-supp-<inc>` remain distinct authored artifacts, with
independent MV cases, verdicts, review order and potential production use. Linking
is optional at package time. KELP maps the parent entry to `<artifact-id>-link` and
the supplemental entry to `<artifact-id>`, using the actual canonical namespace
and version. Pipeline leads that integration. MV needs only ordinary canonical
reference terminal admission; it has no parent/supplemental discovery role.
Successful emission, native behavior, package qualification and deployed UI
acceptance remain separate checks.
