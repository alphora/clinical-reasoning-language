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
import type { ResolvedDispositionConfig } from "../dispositions/types";
import type { SourceContext } from "../imports/scopes";

import type {
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
 *
 * The Validator is filesystem-free, so the resolved config is threaded in by the project-aware caller. Single-file /
 * inline mode passes no config → this validator does not run (today's behavior).
 */
export class DispositionValidator {
  public validate(
    ast: CRL,
    config: ResolvedDispositionConfig,
    sources?: SourceContext[],
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    if (!config.configured) return errors; // no explicit config → nothing enforced (closed set is opt-in via config)

    const validNames = buildValidNameSet(config);
    // A configured-but-empty vocabulary (e.g. `options: {}`) would flag EVERY recommend against an empty set —
    // unhelpful. The resolver already emits an `empty-vocabulary` warning (surfaced by the caller) as the real
    // signal, so don't pile closed-set errors on top.
    if (validNames.size === 0) return errors;

    if (sources) {
      // Multi-file mode: every library's statements (config is project-wide — one payer per project), each carrying
      // its owning scope for attribution.
      for (const { stmt, scope } of sources) {
        const attrib: Attribution = { libraryName: scope.currentLibrary, filePath: scope.filePath };
        if (stmt.type === "Decision") this.walkDecision(stmt, validNames, attrib, errors);
        else if (stmt.type === "Activity") this.checkActivity(stmt, validNames, attrib, errors);
      }
    } else {
      for (const stmt of ast.statements) {
        if (stmt.type === "Decision") this.walkDecision(stmt, validNames, undefined, errors);
        else if (stmt.type === "Activity") this.checkActivity(stmt, validNames, undefined, errors);
      }
    }
    return errors;
  }

  // -------------------------- decision walk (recommend sites) --------------------------

  private walkDecision(
    decision: Decision,
    valid: Set<string>,
    attrib: Attribution | undefined,
    errors: ValidationError[],
  ): void {
    for (const branch of decision.body.statements) this.walkBranch(branch, valid, attrib, errors);
  }

  private walkBranch(
    branch: BranchBlock,
    valid: Set<string>,
    attrib: Attribution | undefined,
    errors: ValidationError[],
  ): void {
    this.walkWhenBlockBody(branch.body, valid, attrib, errors);
  }

  private walkWhenBlockBody(
    body: WhenBlockBody,
    valid: Set<string>,
    attrib: Attribution | undefined,
    errors: ValidationError[],
  ): void {
    if (body.type === "BlockBody") this.walkBlockBody(body, valid, attrib, errors);
    else this.checkAction(body as ActionStatement, valid, attrib, errors);
  }

  private walkBlockBody(
    block: BlockBody,
    valid: Set<string>,
    attrib: Attribution | undefined,
    errors: ValidationError[],
  ): void {
    for (const stmt of block.statements) {
      if (stmt.type === "WhenBlock" || stmt.type === "OtherwiseBlock") this.walkBranch(stmt, valid, attrib, errors);
      else this.checkAction(stmt, valid, attrib, errors);
    }
  }

  private checkAction(
    stmt: ActionStatement,
    valid: Set<string>,
    attrib: Attribution | undefined,
    errors: ValidationError[],
  ): void {
    const action = stmt.action;
    if (action.type !== "RecommendActivity") return; // `use decision` delegation is not a recommend-activity site
    const name = getRefName(action.activityName); // the activity NAME (bare, or the name part of a qualified ref)
    if (!valid.has(name)) {
      const e: DispositionNotConfiguredError = {
        kind: "disposition-not-configured",
        activityName: name,
        message:
          `Recommended activity "${name}" is not in the configured disposition set. When a project configures ` +
          `\`crl.dispositions\`, only its determinations are valid — recommend one of: ${enumerate(valid)}.`,
        ...locate(action.location, attrib),
      };
      errors.push(e);
    }
  }

  // -------------------------- activity declarations (request type) --------------------------

  private checkActivity(
    activity: Activity,
    valid: Set<string>,
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
function enumerate(valid: Set<string>): string {
  const sorted = [...valid].sort();
  const CAP = 15;
  return sorted.length <= CAP
    ? sorted.join(", ")
    : `${sorted.slice(0, CAP).join(", ")}, and ${sorted.length - CAP} more`;
}

/** The closed set of valid determination NAMES: every `<category>.<key>`, plus a bare `<category>` for single-option categories. */
function buildValidNameSet(config: ResolvedDispositionConfig): Set<string> {
  const names = new Set<string>();
  const perCategory = new Map<string, number>();
  for (const leaf of config.options) {
    names.add(`${leaf.category}.${leaf.key}`);
    perCategory.set(leaf.category, (perCategory.get(leaf.category) ?? 0) + 1);
  }
  for (const [category, count] of perCategory) if (count === 1) names.add(category);
  return names;
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
