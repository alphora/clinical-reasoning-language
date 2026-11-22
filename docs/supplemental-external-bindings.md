# Independent supplemental definition assembly (unreleased)

This is a bounded SDK prototype on `codex/supplemental-external-bindings`, absent
from CRL 6.4.58. It assembles definitions from independently authored parent and
supplement packages in one process. It introduces no CRL syntax or CLI/MCP option.
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

The assembled result retains original entry canonicals. It does not implement
KELP's proposed simultaneous mapping of the parent entry to its link identity and
the supplemental entry to the public parent identity. KELP owns that package step;
Pipeline leads its integration. This API is neither a second packager nor an MV
canonical-terminal navigation implementation. Successful emission, native behavior,
KELP package qualification and deployed UI acceptance are separate checks.
