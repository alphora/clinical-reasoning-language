import type {
  CRL,
  Decision,
  BlockMember,
  BranchBlock,
  BlockQualifier,
  Location,
} from "../ast/types";
import type { SourceContext } from "../imports/scopes";
import type { DecisionShapeError, DecisionShapeRule, ValidationError } from "./validator";

/** Source attribution for a diagnostic (multi-file mode). */
interface Attribution {
  libraryName: string;
  filePath: string;
}

/**
 * Decision-shape structural validation — the `first` / `any` / `all` / `otherwise`
 * legality rules from the converged language design (see docs/decision-shapes.md).
 *
 * The grammar already enforces homogeneity (a block is all branches XOR all
 * actions) and the `end` closer. This validator enforces the *semantic* rules
 * the grammar deliberately leaves permissive, so authors get precise diagnostics
 * rather than parse failures:
 *
 *   - qualifier-required        — a >1-member block must declare a qualifier
 *   - qualifier-on-single-member— a single-member block must not
 *   - any-over-branches         — `any:` is illegal over when-branches
 *   - first-over-actions        — `first:` is illegal over actions
 *   - otherwise-misplaced       — `otherwise` outside a `first:` block, or not last
 *   - otherwise-required        — a top-level `first:` decision must end with `otherwise`
 *   - otherwise-only            — a branch block of only `otherwise` (no `when`)
 *
 * These are never demoted under `soft` mode — a malformed decision shape is a
 * structural defect, not incomplete authoring state.
 */
export class DecisionShapeValidator {
  public validate(ast: CRL, sources?: SourceContext[]): ValidationError[] {
    const errors: ValidationError[] = [];
    if (sources) {
      // Multi-file mode: walk each statement with its owning scope so shape
      // diagnostics carry libraryName/filePath like the other validators.
      for (const { stmt, scope } of sources) {
        if (stmt.type === "Decision") {
          this.validateDecision(
            stmt,
            { libraryName: scope.currentLibrary, filePath: scope.filePath },
            errors,
          );
        }
      }
    } else {
      for (const stmt of ast.statements) {
        if (stmt.type === "Decision") this.validateDecision(stmt, undefined, errors);
      }
    }
    return errors;
  }

  private validateDecision(
    decision: Decision,
    attrib: Attribution | undefined,
    errors: ValidationError[],
  ): void {
    this.validateBlock(
      decision.body.qualifier,
      decision.body.statements,
      true,
      decision.body.location,
      attrib,
      errors,
    );
  }

  /**
   * Validate one block (the decision body or a nested `then:` body) and recurse
   * into branch bodies. `isTopLevel` is true only for the decision body itself.
   */
  private validateBlock(
    qualifier: BlockQualifier | undefined,
    members: ReadonlyArray<BlockMember>,
    isTopLevel: boolean,
    location: Location,
    attrib: Attribution | undefined,
    errors: ValidationError[],
  ): void {
    // Homogeneity is grammar-enforced; any branch member ⇒ a branch block.
    const isBranchBlock = members.some(
      (m) => m.type === "WhenBlock" || m.type === "OtherwiseBlock",
    );
    const unit = isBranchBlock ? "branch" : "action";
    const allowed = isBranchBlock ? "first: or all:" : "any: or all:";

    // 1. Qualifier cardinality.
    if (members.length > 1 && !qualifier) {
      this.push(
        errors,
        "qualifier-required",
        `A block with more than one ${unit} must declare a qualifier (${allowed}).`,
        location,
        attrib,
      );
    }
    if (members.length === 1 && qualifier) {
      this.push(
        errors,
        "qualifier-on-single-member",
        `A single-${unit} block must not declare a qualifier ('${qualifier}:' is vacuous).`,
        location,
        attrib,
      );
    }

    // 2. Qualifier legality by context.
    if (isBranchBlock && qualifier === "any") {
      this.push(
        errors,
        "any-over-branches",
        `'any:' is not allowed over when-branches (it would nondeterministically pick one of several matching branches). Use 'first:' for ordered precedence or 'all:' for every matching branch.`,
        location,
        attrib,
      );
    }
    if (!isBranchBlock && qualifier === "first") {
      this.push(
        errors,
        "first-over-actions",
        `'first:' is not allowed over actions (actions carry no condition to order on). Use 'any:' to offer one or 'all:' to do all.`,
        location,
        attrib,
      );
    }

    // 3. `otherwise` rules (branch blocks only).
    if (isBranchBlock) {
      const branches = members as ReadonlyArray<BranchBlock>;
      const otherwiseIdxs: number[] = [];
      let whenCount = 0;
      branches.forEach((m, i) => {
        if (m.type === "OtherwiseBlock") otherwiseIdxs.push(i);
        else whenCount++;
      });

      for (const idx of otherwiseIdxs) {
        const ob = branches[idx]!;
        if (idx !== branches.length - 1) {
          this.push(
            errors,
            "otherwise-misplaced",
            `'otherwise' must be the last branch; a branch after it is unreachable.`,
            ob.location,
            attrib,
          );
        } else if (qualifier !== undefined && qualifier !== "first") {
          // A missing qualifier is already reported as qualifier-required; only
          // flag misplacement when the author chose a non-`first:` qualifier.
          this.push(
            errors,
            "otherwise-misplaced",
            `'otherwise' is only allowed in a 'first:' block.`,
            ob.location,
            attrib,
          );
        }
      }

      if (otherwiseIdxs.length > 0 && whenCount === 0) {
        this.push(
          errors,
          "otherwise-only",
          `A decision cannot consist only of 'otherwise' — that is unconditional. Model it as an activity, or add 'when' branches.`,
          location,
          attrib,
        );
      }

      // Top-level `first:` decision must end with `otherwise` (every case
      // reaches a disposition). Nested `first:` blocks may omit it.
      if (isTopLevel && qualifier === "first") {
        const last = branches[branches.length - 1];
        if (!last || last.type !== "OtherwiseBlock") {
          this.push(
            errors,
            "otherwise-required",
            `A top-level 'first:' decision must end with an 'otherwise' branch so every case has a disposition.`,
            location,
            attrib,
          );
        }
      }

      // Recurse into nested `then:` bodies.
      for (const m of branches) {
        if (m.body.type === "BlockBody") {
          this.validateBlock(
            m.body.qualifier,
            m.body.statements,
            false,
            m.body.location,
            attrib,
            errors,
          );
        }
      }
    }
  }

  private push(
    errors: ValidationError[],
    rule: DecisionShapeRule,
    message: string,
    location: Location,
    attrib: Attribution | undefined,
  ): void {
    const e: DecisionShapeError = {
      kind: "decision-shape",
      rule,
      message,
      location,
      severity: "error",
      ...(attrib ? { libraryName: attrib.libraryName, filePath: attrib.filePath } : {}),
    };
    errors.push(e);
  }
}
