/**
 * The shared cross-library `(lib,name)` decision resolver (#172) was hoisted to `ast/decisionResolver.ts` (todo-2) so
 * the cel-layer validator can share it without a cre→cel→cre layering cycle. Re-exported here under the established CRE
 * import path so run.ts / viewModel.ts / the existing tests are unaffected.
 */
export {
  buildGlobalDecisionMap,
  makeResolveDecision,
  type ResolvedDecision,
  type DecisionResolverGraphInput,
} from "../ast/decisionResolver";
