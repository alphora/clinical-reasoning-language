// #203 GAP 3 — occurrence-flag addressing. An OCCURRENCE flag targets one specific tree NODE (a disposition leaf =
// `recommend activity`, or a specific `when`-condition); it is stored as a DECISION-scope flag whose `; key` is
// `<nodeId>~<signature>`. The `nodeId` (the decision-local positional path, e.g. `when[1]/action[0]`) is the ADDRESS —
// unique within the decision, stable across a re-parse that doesn't RESTRUCTURE the decision (a reorder/insert IS a
// restructure and is meant to be detected). The `signature` (a readable `guard→activity` / `when concept`, library-
// qualified) is a FINGERPRINT: it verifies the node the `nodeId` resolves to hasn't been swapped (mis-home detection),
// AND labels the flag in the list. It is NOT the address, so it needn't be globally unique (the residual — two
// semantically-identical branches reordered — renders identically, low-harm; disc 231 round 2).
//
// Pure + vscode-free (tested in occurrenceKey.test.mjs). The transforms (createFlag/setFlagStatus) are untouched — the
// occurrence key is just the value of the `key` field they already carry.
import type { CrlDecisionStructure, CrlStructureNode } from "../provenance/crlStructure";

/** A resolved occurrence: the owning decision + the node's positional address + its readable signature. */
export interface OccurrenceRef {
  decision: string;
  lib: string;
  nodeId: string;
  signature: string;
  nodeKey: string; // the node's structural key → the renderer's `anchors[nodeKey]` → its gid
  isLeaf: boolean; // a recommend-activity leaf (vs a `when` condition) — for the menu wording, NOT inferred from the string
}

/** Only these node kinds carry an occurrence flag: a `recommend activity` LEAF (the recommendation site) or a `when`
 *  CONDITION. An `otherwise` interior node, a `use decision` action, and the decision root are not occurrence targets. */
export function isOccurrenceNode(node: CrlStructureNode): boolean {
  return (node.kind === "action" && node.actionKind === "recommend-activity") || node.kind === "when";
}

// A signature is stored in a `; key` field, so it must survive createFlag's field validation (no backtick/newline/`;`)
// AND the parser's trim — so forbidden chars collapse to a space and the whole thing is trimmed. Two names differing
// ONLY by a stripped char would collide — astronomically rare for clinical names (gpt55 impl review).
const sanitizeSig = (s: string): string => s.replace(/[`;\r\n]/g, " ").replace(/\s+/g, " ").trim();

/** A referenced concept/activity's LIBRARY-QUALIFIED name, parsed from its indexer refKey (`["lib","kind","name",null]`
 *  — the true lib of the REFERENCED node, which may differ from the decision's lib; the display label is lib-stripped so
 *  it CANNOT be used here, gpt55 [critical]). Falls back to the raw key if it isn't the expected JSON tuple. */
function refSig(refKey: string | undefined): string {
  if (!refKey) return "?";
  try {
    const t = JSON.parse(refKey) as unknown[];
    if (Array.isArray(t) && typeof t[0] === "string" && typeof t[2] === "string") return sanitizeSig(`${t[0]}:${t[2]}`);
  } catch {
    /* not a JSON tuple — fall through */
  }
  return sanitizeSig(refKey);
}

/** The library-qualified signature for a node, given its ANCESTOR guard chain (each enclosing `when`'s lib-qualified
 *  concept, or `otherwise`, outermost first). A condition → `<ancestors>/<concept>`; a leaf → `<ancestors>→<activity>`.
 *  The FULL chain (not just the nearest guard) so two nodes with the same nearest-guard+activity under DIFFERENT outer
 *  guards are distinguishable — closing a silent wrong-node an outer-branch reorder would otherwise cause (Claude). */
function signatureFor(node: CrlStructureNode, ancestors: readonly string[]): string {
  // #224: a `when` uses its canonical guard `sigLabel` (structural, lib-qualified;
  // single-ref = `lib:Name`, byte-identical to `refSig(refKeys[0])`). Compound
  // guards keep operator + operand structure that a flat `refKeys[0]` would drop.
  const own = node.kind === "when" ? (node.sigLabel ?? refSig(node.refKeys[0])) : refSig(node.refKeys[0]);
  if (node.kind === "when") return [...ancestors, own].join("/"); // a condition IS in its ancestor context
  return `${ancestors.length ? ancestors.join("/") : "(top)"}→${own}`; // a recommend-activity leaf: ancestors → activity
}

/** Every occurrence ref in one decision (leaves + conditions), walking the tree while ACCUMULATING the ancestor-guard
 *  chain (each enclosing `when`'s lib-qualified concept, or `otherwise`). */
export function occurrencesOf(dec: CrlDecisionStructure): OccurrenceRef[] {
  const out: OccurrenceRef[] = [];
  const walk = (node: CrlStructureNode, ancestors: readonly string[]): void => {
    if (isOccurrenceNode(node)) {
      out.push({ decision: dec.decision, lib: dec.lib, nodeId: node.nodeId, signature: signatureFor(node, ancestors), nodeKey: node.nodeKey, isLeaf: node.kind === "action" });
    }
    // a `when` appends its concept to the chain; an `otherwise` appends `otherwise`; anything else passes through.
    const childAncestors = node.kind === "when" ? [...ancestors, node.sigLabel ?? refSig(node.refKeys[0])] : node.kind === "otherwise" ? [...ancestors, "otherwise"] : ancestors;
    for (const c of node.children) walk(c, childAncestors);
  };
  for (const c of dec.children) walk(c, []);
  return out;
}

/** Does a `; key` value look like an OCCURRENCE key (a `<nodeId>~…` where nodeId is a decision-local path)? Guards against
 *  treating a pre-existing keyed decision flag (whose `key` is a re-add-guard source-hash) as an occurrence (gpt55). */
export function isOccurrenceKey(key: string): boolean {
  const nodeId = key.split("~", 1)[0];
  return /^(when\[\d+\]|otherwise|action\[\d+\])(\/(when\[\d+\]|otherwise|action\[\d+\]))*$/.test(nodeId);
}

/** The occurrence ref for one node (by nodeId) in a decision, or undefined if not found / not an occurrence node. */
export function occurrenceByNodeId(dec: CrlDecisionStructure, nodeId: string): OccurrenceRef | undefined {
  return occurrencesOf(dec).find((o) => o.nodeId === nodeId);
}

/** The occurrence ref for one node (by nodeKey) in a decision — used at create time from a click hit. */
export function occurrenceByNodeKey(dec: CrlDecisionStructure, nodeKey: string): OccurrenceRef | undefined {
  return occurrencesOf(dec).find((o) => o.nodeKey === nodeKey);
}

/** Build the stored `; key` value for an occurrence: `<nodeId>~<signature>`. */
export function occurrenceKeyValue(ref: OccurrenceRef): string {
  return `${ref.nodeId}~${ref.signature}`;
}

/** Split a stored occurrence key back into its address + fingerprint (split on the FIRST `~`; `nodeId` never contains
 *  `~` or a space, so this is unambiguous — a `~` inside a name only lands in the signature). */
export function parseOccurrenceKey(key: string): { nodeId: string; signature: string } {
  const i = key.indexOf("~");
  return i === -1 ? { nodeId: key, signature: "" } : { nodeId: key.slice(0, i), signature: key.slice(i + 1) };
}

/** Resolve a stored occurrence key against the CURRENT decision structure. Returns:
 *  - `{ placed, ref }` when the nodeId resolves AND its current signature matches the stored one (the happy path);
 *  - `{ placed:false, reason:"orphan" }` when the nodeId no longer resolves (a reorder/delete dropped it);
 *  - `{ placed:false, reason:"moved", ref }` when the nodeId resolves but the signature CHANGED (a different node
 *    shifted into that slot — a mis-home; never painted as if correct).
 *  The (lib, decision) scoping is the caller's — pass the ONE decision that owns the flag. */
export function resolveOccurrence(dec: CrlDecisionStructure, key: string): { placed: true; ref: OccurrenceRef } | { placed: false; reason: "orphan" | "moved"; ref?: OccurrenceRef } {
  const { nodeId, signature } = parseOccurrenceKey(key);
  const ref = occurrenceByNodeId(dec, nodeId);
  if (!ref) return { placed: false, reason: "orphan" };
  if (signature !== "" && ref.signature !== signature) return { placed: false, reason: "moved", ref };
  return { placed: true, ref };
}
