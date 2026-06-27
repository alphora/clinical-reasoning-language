/**
 * #175 todo-0 — the chain fixture (≥3-boundary same-library `use decision` closure), mirroring SUR716.011's shape.
 *
 * Topology (BARE same-lib delegation only, no qualifiers):
 *   Main  --otherwise--> use decision "Sub1"
 *   Sub1  --when Indic--> use decision "Sub2"
 *   Sub2  --when Indic--> use decision "Sub3"
 *   Sub3  --when Indic--> recommend activity "Final"
 *
 * A case that satisfies `Indic` walks Main → Sub1 → Sub2 → Sub3 and produces "Final" at the DEEPEST sub. The CRE
 * recurses each bare same-lib `use decision` in place (viewModel.ts:407-432), so the produced action's nodeId is the
 * deep, caller-local INLINED form:
 *
 *   otherwise/action[0]/when[0]/action[0]/when[0]/action[0]/when[0]/action[0]
 *
 * (Main.otherwise → use-Sub1 action → Sub1.when[0] → use-Sub2 action → Sub2.when[0] → use-Sub3 action → Sub3.when[0]
 *  → the Final recommend action.) This single string carries NO boundary markers — `action[0]` is byte-identical for a
 * use-decision delegation and an inline recommend — which is exactly why todo-1's decomposer is a FRAME-STACK VM WALK,
 * not string arithmetic.
 *
 * Shared so todo-1's unit tests and todo-2's gate-wiring tests reuse ONE fixture. Importable as a const (no file I/O).
 */

/** The covered policy: a 3-boundary same-library delegation chain. Covered decision = "Main", lib = "CHAIN". */
export const CHAIN_CRL = `# CHAIN
library "CHAIN".
concept "Indic":
- type is Condition.
- code is \`indic\`.
activity "Final":
- request CPGCommunicationRequest.
- with \`f\`.
decision "Sub3":
- when "Indic" then recommend activity "Final".
decision "Sub2":
- when "Indic" then:
  - use decision "Sub3".
  end.
decision "Sub1":
- when "Indic" then:
  - use decision "Sub2".
  end.
decision "Main":
first:
- otherwise then:
  - use decision "Sub1".
  end.`;

/** The CEL: one frozen case ("deep") that satisfies Indic → walks the full chain → produces "Final" at Sub3. */
export const CHAIN_CEL = `# CHAINC
library "CHAINC".
covers "CHAIN".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
case "deep":
- id is "case-deep".
- subject is "Pat".
- fact is "fIndic".
- result is "Main" is "Final".`;

/** The covered decision's identity (the root frame for the decomposer). */
export const CHAIN_ROOT = { lib: "CHAIN", decision: "Main" } as const;

/** The deep, caller-local INLINED nodeId of the produced "Final" action — the run-path id that today's standalone
 *  `idToKey` cannot ground (→ `unmapped-runtime-node`). Asserted in todo-0; re-rooted by todo-1's decomposer. */
export const CHAIN_DEEP_NODEID =
  "otherwise/action[0]/when[0]/action[0]/when[0]/action[0]/when[0]/action[0]";

/** The frozen case id (so the case is revealable through the provenance gate). */
export const CHAIN_CASE_ID = "case-deep";
