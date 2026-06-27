/**
 * Shared cross-library `(lib, name)` decision resolver (#172).
 *
 * Builds ONE global decision map keyed `idOf(lib, decisionName)` over EVERY library in the resolved CRL graph (the
 * package registry, the local registry, and the covered target itself), then exposes a single `resolveDecision` the
 * CRE / arms / spine / view-model / CEL-validator surfaces share so they bind a `use decision` target identically (the
 * nodeId-parity invariant + the validate_cel↔run_decision agreement). A BARE ref resolves against the CALLER's library;
 * a QUALIFIED ref against its explicit library.
 *
 * Lives in ast/ (it depends only on ast/ types + imports/types) so BOTH the cel-layer validator AND the cre-layer
 * run/viewModel can import it without a layering cycle (cre → cel, so the builder must sit at or below cel).
 *
 * Precedence on a same-name collision is registry-native LOCAL-FIRST (`byNameLocal ?? byNamePackage`), MATCHING the
 * provenance indexer (indexer.ts:11-13) — all surfaces MUST agree on which cross-library decision a qualified ref binds,
 * or run_decision / validate_cel / provenance diverge (re-deriving #166 at the library level).
 */
import type { Registry } from "../imports/types";

import { idOf, type LibAwareDecisionResolver, type ResolvedDecisionRef } from "./decisionSpine";
import type { Decision, Statement } from "./types";
import { getRefLibrary, getRefName } from "./types";

/**
 * A resolved decision plus the library + source file it belongs to (the file a cross-lib sub's spans must point at).
 * Single-sourced as `ResolvedDecisionRef` in decisionSpine so all surfaces share ONE resolver type.
 */
export type ResolvedDecision = ResolvedDecisionRef;

export interface DecisionResolverGraphInput {
  /** The CRL registry from the resolved graph (absent on the inline-graph path). */
  crlRegistry?: Registry;
  /** The covered target's library name + file + AST (always present once `covers` resolved). */
  coveredLib: string;
  coveredFilePath: string;
  coveredStatements: Decision[];
}

/**
 * Build the global `idOf(lib, name) → ResolvedDecision` map over all libraries in the graph. Insertion order encodes
 * precedence: PACKAGE first, then LOCAL (a local lib's decision overwrites a package lib's same `(lib,name)` — the
 * `byNameLocal ?? byNamePackage` LOCAL-FIRST rule), then the covered target LAST (the covered library's own decisions
 * always win for its own name, covering the inline-graph path where the registry is absent).
 */
export function buildGlobalDecisionMap(
  input: DecisionResolverGraphInput,
): Map<string, ResolvedDecision> {
  const map = new Map<string, ResolvedDecision>();
  const addLib = (lib: string, filePath: string, statements: readonly Statement[]): void => {
    for (const s of statements) {
      // Sound narrowing on the discriminant — `s.type === "Decision"` IS the Decision type-guard, no cast needed.
      if (s.type === "Decision") {
        map.set(idOf(lib, s.name), { decision: s, lib, filePath });
      }
    }
  };
  if (input.crlRegistry) {
    // Package first, then local — so a local lib's same-named decision overwrites the package one (LOCAL-FIRST).
    for (const e of input.crlRegistry.byNamePackage.values())
      if (e.name) addLib(e.name, e.filePath, e.ast.statements);
    for (const e of input.crlRegistry.byNameLocal.values())
      if (e.name) addLib(e.name, e.filePath, e.ast.statements);
  }
  // The covered target last — its own decisions are authoritative for its name (and the only source on the inline path).
  addLib(input.coveredLib, input.coveredFilePath, input.coveredStatements);
  return map;
}

/**
 * The ONE resolver all surfaces use. A BARE ref (`getRefLibrary` null) resolves against `callerLib`; a QUALIFIED ref
 * against its explicit library. Returns `undefined` when the target library/name is not in the graph.
 */
export function makeResolveDecision(
  globalMap: Map<string, ResolvedDecision>,
): LibAwareDecisionResolver {
  return (callerLib, ref) => {
    const targetLib = getRefLibrary(ref) ?? callerLib;
    return globalMap.get(idOf(targetLib, getRefName(ref)));
  };
}
