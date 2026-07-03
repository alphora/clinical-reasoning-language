import type {
  CRL,
  Decision,
  BranchBlock,
  WhenBlockBody,
  BlockBody,
  ActionStatement,
  Activity,
  Location,
} from "../ast/types";
import { getRefName } from "../ast/types";
import type { ResolvedDispositionConfig, ResolvedOption } from "../dispositions/types";
import type { SourceContext } from "../imports/scopes";

import type {
  DispositionNonFinalLeafError,
  DispositionNotConfiguredError,
  DispositionRequestTypeError,
  ValidationError,
} from "./validator";

/** A PA determination is COMMUNICATED, never ordered — its activity must carry this request type. */
const REQUIRED_REQUEST_TYPE = "CPGCommunicationRequest";

/** Source attribution for a diagnostic (multi-file mode). */
interface Attribution {
  libraryName: string;
  filePath: string;
}

/**
 * Config-gated PA determination validation (feature: configurable PA leaves). The determination is a PLAIN
 * activity named `"<category>.<optionalkey>"` — no grammar change; this validator layers the PA meaning on top.
 *
 * It runs ONLY when the deployment EXPLICITLY configured `crl.dispositions.options` (`config.configured`). Then the
 * config set is a CLOSED whitelist:
 *   - `disposition-not-configured` — every `recommend activity "X"` must name a configured determination
 *     (`<category>.<key>`, or a bare `<category>` for a single-option category); anything else is invalid.
 *   - `disposition-request-type`  — every configured determination ACTIVITY must use `request CPGCommunicationRequest`.
 *   - `disposition-non-final-leaf` — under `standalone` mode (our tree IS the whole adjudication), a recommended
 *     determination must be FINAL; a non-final leaf (e.g. `pended`) is legitimate only in `embedded` mode.
 *
 * The Validator is filesystem-free, so the resolved config is threaded in by the project-aware caller. Single-file /
 * inline mode passes no config → this validator does not run (today's behavior). A determination MAY live in a
 * separate library (that is why the local activity block stays); a qualified cross-library ref resolves to the same
 * project-wide config set, so it is validated by NAME regardless of library.
 */
export class DispositionValidator {
  public validate(
    ast: CRL,
    config: ResolvedDispositionConfig,
    sources?: SourceContext[],
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    if (!config.configured) return errors; // no explicit config → nothing enforced (closed set is opt-in via config)

    const validLeaves = buildValidLeaves(config);
    // A configured-but-empty vocabulary (e.g. `options: {}`) would flag EVERY recommend against an empty set —
    // unhelpful. The resolver already emits an `empty-vocabulary` warning (surfaced by the caller) as the real
    // signal, so don't pile closed-set errors on top.
    if (validLeaves.size === 0) return errors;

    const standalone = config.mode === "standalone";

    if (sources) {
      // Multi-file mode: every library's statements (config is project-wide — one payer per project), each carrying
      // its owning scope for attribution.
      for (const { stmt, scope } of sources) {
        const attrib: Attribution = { libraryName: scope.currentLibrary, filePath: scope.filePath };
        if (stmt.type === "Decision") this.walkDecision(stmt, validLeaves, standalone, attrib, errors);
        else if (stmt.type === "Activity") this.checkActivity(stmt, validLeaves, attrib, errors);
      }
    } else {
      for (const stmt of ast.statements) {
        if (stmt.type === "Decision") this.walkDecision(stmt, validLeaves, standalone, undefined, errors);
        else if (stmt.type === "Activity") this.checkActivity(stmt, validLeaves, undefined, errors);
      }
    }
    return errors;
  }

  // -------------------------- decision walk (recommend sites) --------------------------

  private walkDecision(
    decision: Decision,
    valid: Map<string, ResolvedOption>,
    standalone: boolean,
    attrib: Attribution | undefined,
    errors: ValidationError[],
  ): void {
    for (const branch of decision.body.statements) this.walkBranch(branch, valid, standalone, attrib, errors);
  }

  private walkBranch(
    branch: BranchBlock,
    valid: Map<string, ResolvedOption>,
    standalone: boolean,
    attrib: Attribution | undefined,
    errors: ValidationError[],
  ): void {
    this.walkWhenBlockBody(branch.body, valid, standalone, attrib, errors);
  }

  private walkWhenBlockBody(
    body: WhenBlockBody,
    valid: Map<string, ResolvedOption>,
    standalone: boolean,
    attrib: Attribution | undefined,
    errors: ValidationError[],
  ): void {
    if (body.type === "BlockBody") this.walkBlockBody(body, valid, standalone, attrib, errors);
    else this.checkAction(body as ActionStatement, valid, standalone, attrib, errors);
  }

  private walkBlockBody(
    block: BlockBody,
    valid: Map<string, ResolvedOption>,
    standalone: boolean,
    attrib: Attribution | undefined,
    errors: ValidationError[],
  ): void {
    for (const stmt of block.statements) {
      if (stmt.type === "WhenBlock" || stmt.type === "OtherwiseBlock") this.walkBranch(stmt, valid, standalone, attrib, errors);
      else this.checkAction(stmt, valid, standalone, attrib, errors);
    }
  }

  private checkAction(
    stmt: ActionStatement,
    valid: Map<string, ResolvedOption>,
    standalone: boolean,
    attrib: Attribution | undefined,
    errors: ValidationError[],
  ): void {
    const action = stmt.action;
    if (action.type !== "RecommendActivity") return; // `use decision` delegation is not a recommend-activity site
    const name = getRefName(action.activityName); // the activity NAME (bare, or the name part of a qualified ref)
    const leaf = valid.get(name);
    if (!leaf) {
      const e: DispositionNotConfiguredError = {
        kind: "disposition-not-configured",
        activityName: name,
        message:
          `Recommended activity "${name}" is not in the configured disposition set. When a project configures ` +
          `\`crl.dispositions\`, only its determinations are valid — recommend one of: ${enumerate(valid)}.`,
        ...locate(action.location, attrib),
      };
      errors.push(e);
      return;
    }
    if (standalone && leaf.finality === "non-final") {
      const e: DispositionNonFinalLeafError = {
        kind: "disposition-non-final-leaf",
        activityName: name,
        message:
          `Determination "${name}" is NON-FINAL (category "${leaf.category}"), but the project's disposition mode ` +
          `is "standalone" — where our decision IS the whole adjudication and every leaf must be FINAL. A non-final ` +
          `(e.g. pended) leaf is legitimate only in "embedded" mode.`,
        ...locate(action.location, attrib),
      };
      errors.push(e);
    }
  }

  // -------------------------- activity declarations (request type) --------------------------

  private checkActivity(
    activity: Activity,
    valid: Map<string, ResolvedOption>,
    attrib: Attribution | undefined,
    errors: ValidationError[],
  ): void {
    if (!valid.has(activity.name)) return; // not a configured determination → the request-type rule doesn't apply
    const requestType = activity.body.request.activityType;
    if (requestType !== REQUIRED_REQUEST_TYPE) {
      const e: DispositionRequestTypeError = {
        kind: "disposition-request-type",
        activityName: activity.name,
        actualRequestType: requestType,
        message:
          `Determination activity "${activity.name}" must be \`request ${REQUIRED_REQUEST_TYPE}\` — a coverage ` +
          `determination is COMMUNICATED, not ordered — but is \`request ${requestType}\`.`,
        ...locate(activity.body.request.location, attrib),
      };
      errors.push(e);
    }
  }
}

/** Render the valid-name set for a diagnostic, capped so a large vocabulary doesn't produce a huge message. */
function enumerate(valid: Map<string, ResolvedOption>): string {
  const sorted = [...valid.keys()].sort();
  const CAP = 15;
  return sorted.length <= CAP
    ? sorted.join(", ")
    : `${sorted.slice(0, CAP).join(", ")}, and ${sorted.length - CAP} more`;
}

/**
 * The closed set of valid determination NAMES → their resolved leaf (for finality): every `<category>.<key>`, plus a
 * bare `<category>` for single-option categories (both mapping to the sole/keyed leaf so finality is available).
 */
function buildValidLeaves(config: ResolvedDispositionConfig): Map<string, ResolvedOption> {
  const leaves = new Map<string, ResolvedOption>();
  const perCategory = new Map<string, ResolvedOption[]>();
  for (const leaf of config.options) {
    leaves.set(`${leaf.category}.${leaf.key}`, leaf);
    const arr = perCategory.get(leaf.category);
    if (arr) arr.push(leaf);
    else perCategory.set(leaf.category, [leaf]);
  }
  for (const [category, opts] of perCategory) if (opts.length === 1) leaves.set(category, opts[0]);
  return leaves;
}

/** Build the location + optional source attribution common to every diagnostic. */
function locate(
  location: Location,
  attrib: Attribution | undefined,
): { location: { start: { line: number; column: number }; end: { line: number; column: number } }; severity: "error"; libraryName?: string; filePath?: string } {
  return {
    location: {
      start: { line: location.start.line, column: location.start.column },
      end: { line: location.end.line, column: location.end.column },
    },
    severity: "error",
    ...(attrib ? { libraryName: attrib.libraryName, filePath: attrib.filePath } : {}),
  };
}
