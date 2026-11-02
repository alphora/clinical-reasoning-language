// REFACTOR:grounded: synthetic kit source and real CRE routes drive the browser bridge; not native execution.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCelSuite, buildSuiteExecutionModel, nodeKey, conceptDeclRef, getAuthoringKit } from '@smile-digital-health/crl';
import { UNCERTAINTY_REFERENCE_CRL, UNCERTAINTY_REFERENCE_CEL } from '../../crl/src/authoring-kit/uncertaintyExample';
import { renderFlowPane, FLOW_STYLE } from '../src/flowPaneHtml';
import { projectFlowStructure, conditionTruthKeys } from '../src/flowProjection';
import { uncertaintyGuardCandidates, forcedUncertaintyVisibility } from '../src/uncertaintyGuardDisplay';
import { executionRoutes } from '../src/executionRoutes';
import { buildRuntimeRefIndex } from '../src/failedCriterionPeek';
import { resolveThisNode } from '../src/thisNodeMarker';
export { COCKPIT_WEBVIEW_SCRIPT } from '../src/correspondenceCockpit';
export { renderFlowSnapshotDocument } from '../src/flowSnapshotHtml';
export { screenCapturedDom } from '../src/snapshotCapture';
export { FLOW_STYLE };

export function fixture(directory: string) {
  mkdirSync(join(directory, 'src/crl'), { recursive: true }); mkdirSync(join(directory, 'src/cel/mv'), { recursive: true });
  const config = getAuthoringKit().referenceArtifacts.find(a => a.name === 'uncertainty-reference.crl')!.requires.crl;
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'uncertainty-display', version: '1.0.0', crl: config }));
  writeFileSync(join(directory, 'src/crl/main.crl'), UNCERTAINTY_REFERENCE_CRL);
  let ordinal = 0;
  writeFileSync(join(directory, 'src/cel/mv/cases.cel'), UNCERTAINTY_REFERENCE_CEL.replace(/case "([^"]+)":/g, match => match + `\n- id is "uncertainty-${++ordinal}".`));
  const suite = resolveCelSuite(directory); if (!suite.ok) throw Error(JSON.stringify(suite.diagnostics));
  const model = buildSuiteExecutionModel(suite.suite)!;
  if (model.scenarios.scenarios.length !== 18 || model.scenarios.scenarios.some(s => s.status !== 'pass')) throw Error('Synthetic source did not execute its 18 CRE expectations');
  const runtime = buildRuntimeRefIndex(model.crlStructure);
  const candidates = uncertaintyGuardCandidates(projectFlowStructure(model.crlStructure));
  if (candidates.size !== 2) throw Error('Expected two independently marked guard occurrences');
  const scenarios = new Map(model.scenarios.scenarios.map(s => [s.case.name, s]));
  const resolver = (sv: typeof model.scenarios.scenarios[number]) => (id: string) => resolveThisNode(id,
    { lib: sv.decision?.libraryName ?? '', decision: sv.decision?.name ?? '' }, sv.tree, runtime, undefined).nodeKey;
  const routes = (name: string) => executionRoutes(scenarios.get(name)!, model.crlStructure);
  return { guardKeys: [...candidates.keys()], cases: [...scenarios.keys()], render(state: { gen: number; expanded?: string[]; selected?: string; pin?: string; flag?: string; modelVersion: number; focus?: string }) {
    const name = state.pin || state.selected, sv = name ? scenarios.get(name) : undefined;
    const route = state.pin ? routes(state.pin).find(r => r.terminalKind === 'produced') : undefined;
    const forced = new Map<string, 'case' | 'evidence' | 'flag'>(forcedUncertaintyVisibility(candidates, sv ? {
      tree: sv.tree, status: sv.status, resolve: resolver(sv), ...(route ? { routeNodeIds: new Set(route.nodeIds) } : {}),
    } : undefined));
    if (state.flag && candidates.has(state.flag)) forced.set(state.flag, 'flag');
    const rendered = renderFlowPane(model.crlStructure, { traversalNavigation: true, revealPrefix: `g${state.gen}_`, concepts: model.conceptLayer,
      guardOutlines: model.guardOutlines, defExpr: (lib, name) => model.defExpr.get(nodeKey(conceptDeclRef(lib, name))),
      uncertaintyDisplay: { expanded: new Set(state.expanded ?? []), forced } });
    const conditions = sv ? conditionTruthKeys(sv.tree, id => !route || route.nodeIds.includes(id) ? resolver(sv)(id) : undefined)
      .map(mark => ({ ids: rendered.anchors[mark.key]?.segmentIds ?? [], result: mark.result })) : [];
    const pinned = route ? { type: 'routeCards', gen: state.gen, token: 'pin:' + state.pin, pinKey: route.nodeKeys.at(-1),
      label: state.pin, routeKeys: route.nodeKeys, pathNodeKeys: route.nodeKeys, pathGroupKeys: [], pathGroupOutcomes: [],
      cards: [], showQuestions: false, verdict: { state: 'unreviewed', label: 'To do', count: 1 } } : undefined;
    return { render: { type: 'render', html: rendered.html, gen: state.gen, indexVersion: state.modelVersion,
      mode: 'medical-validation', preserveViewport: true, uncertaintyDisclosures: rendered.uncertaintyDisclosures,
      uncertaintyFocusKey: state.focus }, pinned,
      marks: { type: 'markLeaves', gen: state.gen, yesIds: [], noIds: [], conditions, routeKeys: route?.nodeKeys ?? [],
        routeLabel: name ?? '', routeCaseId: name ?? '', routeId: route?.terminalId ?? '', ...(pinned ? { pinnedMarks: { yesIds: [], noIds: [], conditions } } : {}) },
      candidateKeys: [...candidates.keys()], forced: [...forced], pinKey: pinned?.pinKey,
      alternate: route ? candidates.get(route.nodeKeys.find(key => candidates.has(key)) ?? '')?.subtreeKeys.filter(key => !route.nodeKeys.includes(key)) ?? [] : [] };
  } };
}
