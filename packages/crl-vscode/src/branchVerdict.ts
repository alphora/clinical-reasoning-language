import type { PersistedReviewState, ReviewState } from './medicalValidationStore';

/** Worst group judgment: Fail, then unreviewed, then Pending; Pass requires every case to pass. */
export function summarizeBranchVerdict(caseIds: readonly string[], verdicts: Record<string, PersistedReviewState>) {
  const states = new Set<ReviewState>(caseIds.map(id => verdicts[id] ?? 'unreviewed'));
  const state: ReviewState = states.has('fail') ? 'fail' : !states.size || states.has('unreviewed') ? 'unreviewed' : states.has('pending') ? 'pending' : 'pass';
  return { state, count: caseIds.length };
}

export const VERDICT_ICON_STYLE = `
.review-verdict-icon{cursor:pointer;pointer-events:auto}
.review-verdict-icon>circle{fill:var(--vscode-descriptionForeground,#8c8c8c);stroke:var(--vscode-editorWidget-background,#252526);stroke-width:1.2}
.review-verdict-icon[data-verdict=pass]>circle{fill:var(--vscode-testing-iconPassed,#3fb950)}
.review-verdict-icon[data-verdict=fail]>circle{fill:var(--vscode-testing-iconFailed,#f14c4c)}
.review-verdict-icon[data-verdict=pending]>circle{fill:var(--vscode-charts-orange,#d18616)}
.review-verdict-icon>path{fill:none;stroke:#fff;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.review-verdict-icon:focus-visible{outline:1px solid var(--flow-focus-color,#fff);outline-offset:3px}
`;
