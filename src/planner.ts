import { PlanResultSchema, ScenarioSchema, type Action, type PlanResult, type ProductModel, type Scenario } from './schemas.js';
import { validateScenarioEditorially } from './editorial-validation.js';

export interface PlanOptions {
  mode: 'full' | 'journey' | 'feature' | 'actor' | 'release';
  journeyId?: string;
  capabilityId?: string;
  actorId?: string;
  releaseCapabilityIds?: string[];
  audience?: string;
  locale?: string;
  requestedDurationSeconds?: number;
  audio?: Scenario['audio'];
}

function title(value: string): string {
  return value.replace(/[-_]+/g, ' ').replace(/^./, (character) => character.toUpperCase());
}

function toAction(source: ProductModel['safeActions'][number]): Action | undefined {
  const common = { title: title(source.id) };
  if (source.type === 'goto' && source.path) return { ...common, type: 'goto', path: source.path };
  if (source.type === 'click' && source.target) return { ...common, type: 'click', target: source.target };
  if (source.type === 'fill' && source.target && source.text !== undefined) return { ...common, type: 'fill', target: source.target, text: source.text };
  if (source.type === 'select' && source.target && source.value !== undefined) return { ...common, type: 'select', target: source.target, value: source.value };
  if (source.type === 'scroll') return { ...common, type: 'scroll', target: source.target };
  if (source.type === 'assert' && source.target && source.state) return { ...common, type: 'assert', target: source.target, state: source.state, text: source.text };
  if (source.type === 'screenshot') return { ...common, type: 'screenshot', name: source.id };
  return undefined;
}

function needsAuthoring(model: ProductModel, unresolved: Array<{ kind: 'audience' | 'actor' | 'safe-actions' | 'outcome' | 'proof' | 'relationship' | 'runtime'; id: string; reason: string; evidence?: ProductModel['proofSurfaces'][number]['evidence'] }>, sceneBriefs: Array<{ id: string; purpose: Scenario['scenes'][number]['purpose']; actorId?: string; needs: string[] }> = []): PlanResult {
  const known = [
    ...model.proofSurfaces.map((surface) => ({ claim: `${surface.name}${surface.route ? ` at ${surface.route}` : ''}`, evidence: surface.evidence })),
    ...model.journeys.map((journey) => ({ claim: journey.name, evidence: journey.evidence }))
  ];
  return PlanResultSchema.parse({
    version: 2, status: 'needs-authoring', known: known.length ? known : [{ claim: model.product, evidence: [{ type: 'user', confirmedBy: 'repository', confirmedAt: new Date().toISOString(), detail: 'Repository selected for discovery' }] }],
    unresolved: unresolved.map((item) => ({ ...item, evidence: item.evidence ?? [] })), sceneBriefs,
    missingRuntimeEvidence: unresolved.filter((item) => item.kind === 'runtime' || item.kind === 'safe-actions' || item.kind === 'proof').map((item) => item.reason)
  });
}

function unresolvedForJourney(model: ProductModel, journey: ProductModel['journeys'][number]) {
  const unresolved: Array<{ kind: 'actor' | 'safe-actions' | 'outcome' | 'proof' | 'relationship' | 'runtime'; id: string; reason: string }> = [];
  for (const step of journey.steps) {
    if (step.ownership.status === 'unresolved') unresolved.push({ kind: 'actor', id: step.id, reason: step.ownership.reason });
    const actions = step.safeActionIds.map((id) => model.safeActions.find((action) => action.id === id)).filter(Boolean);
    if (!actions.length) unresolved.push({ kind: 'safe-actions', id: step.id, reason: 'No evidence-backed presentation action is available' });
  }
  if (!journey.outcomeIds.length) unresolved.push({ kind: 'outcome', id: journey.id, reason: 'The journey has no observable outcome' });
  const proof = journey.steps.some((step) => step.proofSurfaceId) || journey.capabilityIds.some((id) => model.capabilities.find((capability) => capability.id === id)?.proofSurfaces.length);
  if (!proof) unresolved.push({ kind: 'proof', id: journey.id, reason: 'The journey has no evidence-backed proof surface' });
  return unresolved;
}

function actorFor(model: ProductModel, actorId: string) {
  const actor = model.actors.find((candidate) => candidate.id === actorId);
  if (!actor) throw new Error(`Actor ${actorId} is not present in the product model`);
  return { id: actor.id, label: actor.name, storageState: actor.session?.storageState };
}

function scenarioForJourney(model: ProductModel, journey: ProductModel['journeys'][number], outputType: Scenario['outputType'], options: PlanOptions): Scenario {
  const resolved = journey.steps.map((step) => {
    if (step.ownership.status !== 'resolved') throw new Error(`Journey step ${step.id} has unresolved actor ownership`);
    const capability = model.capabilities.find((candidate) => candidate.id === step.capabilityId);
    if (!capability) throw new Error(`Capability ${step.capabilityId} is missing`);
    const actions = step.safeActionIds.map((id) => model.safeActions.find((candidate) => candidate.id === id)).filter((value): value is ProductModel['safeActions'][number] => Boolean(value)).map(toAction).filter((value): value is Action => Boolean(value));
    if (!actions.length) throw new Error(`Journey step ${step.id} has no executable actions`);
    return { step, capability, actorId: step.ownership.actorId, actions };
  });
  const actorIds = [...new Set(resolved.map((item) => item.actorId))];
  const scenes: Scenario['scenes'] = [];
  if (outputType === 'public-master') {
    const first = resolved[0];
    const goto = first.actions.find((action) => action.type === 'goto');
    scenes.push({ id: 'opening-hook', title: model.product, description: journey.name, purpose: 'hook', actor: first.actorId, presentation: { opening: 'product-promise', maxStaticHoldMs: 1_800, caption: { mode: 'none' } }, actions: goto ? [goto] : [{ type: 'screenshot', name: 'opening-hook' }] });
    scenes.push({ id: 'usage-context', title: journey.name, purpose: 'context', actor: first.actorId, presentation: { maxStaticHoldMs: 1_500, caption: { mode: 'lower-third', safeArea: 'bottom' } }, actions: [{ type: 'screenshot', name: 'usage-context' }] });
  }
  resolved.forEach((item, index) => {
    const previous = resolved[index - 1];
    const actorChanged = Boolean(previous && previous.actorId !== item.actorId);
    const proof = item.step.proofSurfaceId || item.actions.some((action) => action.type === 'assert');
    const purpose = proof ? 'proof' : actorChanged ? 'handoff' : item.capability.shape === 'stateful' ? 'state-change' : item.capability.shape === 'read-only' || item.capability.shape === 'content' ? 'exploration' : 'interaction';
    const relationship = actorChanged ? model.relationships.find((candidate) => candidate.fromActorId === previous.actorId && candidate.toActorId === item.actorId) : undefined;
    scenes.push({
      id: item.step.id, title: item.capability.name, purpose, capabilityId: item.capability.id, proofSurfaceId: item.step.proofSurfaceId,
      actor: item.actorId,
      causalLink: actorChanged ? { fromSceneId: previous.step.id, relationshipId: relationship?.id, transitionId: item.step.transitionId, evidence: relationship?.evidence ?? item.step.ownership.evidence } : undefined,
      presentation: { maxStaticHoldMs: 3_000, loading: 'cut', transitionWeight: actorChanged ? 'major' : purpose === 'proof' ? 'meaningful' : 'light', caption: { mode: 'none' }, actorTransition: actorChanged ? 'split-causality' : undefined },
      actions: outputType === 'public-master' ? item.actions.filter((action) => action.type !== 'goto') : item.actions
    });
  });
  if (outputType === 'public-master') {
    const last = resolved.at(-1)!;
    scenes.push({ id: 'deliberate-close', title: model.product, description: model.outcomes.find((outcome) => journey.outcomeIds.includes(outcome.id))?.name, purpose: 'close', actor: last.actorId, presentation: { closing: 'call-to-action', maxStaticHoldMs: 2_000, caption: { mode: 'lower-third', safeArea: 'bottom' } }, actions: [{ type: 'screenshot', name: 'deliberate-close' }] });
  }
  const scenario = ScenarioSchema.parse({
    version: 2, id: outputType === 'public-master' ? `${journey.id}-master` : journey.id, title: journey.name, outputType,
    audience: options.audience ?? journey.audienceIds[0] ?? model.audiences[0]?.id ?? 'general', locale: options.locale ?? 'en', requestedDurationSeconds: options.requestedDurationSeconds,
    audio: options.audio ?? { policy: 'silent' }, branding: { name: model.product, primary: '#2563eb', background: '#08111f' }, actors: actorIds.map((id) => actorFor(model, id)), scenes
  });
  const issues = validateScenarioEditorially(scenario, model);
  if (issues.length) throw new Error(`Editorial planning produced invalid scenario: ${issues.map((issue) => issue.code).join(', ')}`);
  return scenario;
}

export function planDemo(model: ProductModel, options: PlanOptions): PlanResult {
  if (!model.journeys.length) return needsAuthoring(model, [{ kind: 'safe-actions', id: 'product', reason: 'Routes alone do not establish a meaningful demonstration journey' }], [{ id: 'value-journey', purpose: 'interaction', needs: ['actor ownership', 'meaningful action', 'observable outcome', 'proof surface'] }]);
  let journeys = model.journeys;
  if (options.journeyId) journeys = journeys.filter((journey) => journey.id === options.journeyId);
  if (options.capabilityId) journeys = journeys.filter((journey) => journey.capabilityIds.includes(options.capabilityId!));
  if (options.actorId) journeys = journeys.filter((journey) => journey.steps.some((step) => step.ownership.status === 'resolved' && step.ownership.actorId === options.actorId));
  if (options.mode === 'release') journeys = journeys.filter((journey) => journey.capabilityIds.some((id) => options.releaseCapabilityIds?.includes(id)));
  if (!journeys.length) return needsAuthoring(model, [{ kind: 'runtime', id: 'selection', reason: 'No discovered journey matches the requested demo' }]);
  const unresolved = journeys.flatMap((journey) => unresolvedForJourney(model, journey));
  if (unresolved.length) return needsAuthoring(model, unresolved, unresolved.map((item) => ({ id: item.id, purpose: item.kind === 'proof' ? 'proof' : item.kind === 'outcome' ? 'result' : 'interaction', needs: [item.reason] })));
  const outputType = options.mode === 'feature' ? 'feature-clip' : options.mode === 'release' ? 'release-demo' : 'actor-journey';
  const outputs = options.mode === 'full'
    ? [scenarioForJourney(model, journeys[0], 'public-master', options), ...journeys.map((journey) => scenarioForJourney(model, journey, 'actor-journey', options))]
    : journeys.map((journey) => scenarioForJourney(model, journey, outputType, options));
  const coverage = model.capabilities.map((capability) => {
    const matching = outputs.filter((output) => output.scenes.some((scene) => scene.capabilityId === capability.id)).map((output) => output.id);
    return { capabilityId: capability.id, outputIds: matching, omissionReason: matching.length ? undefined : 'Not selected for this output set' };
  });
  return PlanResultSchema.parse({ version: 2, status: 'planned', outputs, coverage, omissions: coverage.filter((entry) => !entry.outputIds.length).map((entry) => ({ id: entry.capabilityId, reason: entry.omissionReason })) });
}
