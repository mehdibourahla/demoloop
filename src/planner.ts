import { ScenarioSchema, type ProductModel, type Scenario } from './schemas.js';

interface PlanOptions { mode?: 'full' | 'scenario' | 'feature' | 'role' | 'journey' | 'release-diff'; journey?: string; feature?: string; role?: string; releaseFeatures?: string[]; locale?: string; audience?: string; narration?: 'none' | 'captions' | 'voiceover'; duration?: string; baseUrl?: string }

export function planScenario(model: ProductModel, options: PlanOptions): Scenario {
  const journey = model.journeys.find((candidate) => candidate.id === (options.journey ?? 'patient-to-physician'));
  if (!journey) throw new Error(`Journey ${options.journey} was not discovered`);
  const sanoxJourney = journey.features.includes('adaptive-intake') && journey.features.includes('physician-brief');
  if (!sanoxJourney) {
    let featureIds = journey.features;
    if (options.mode === 'feature') {
      if (!options.feature) throw new Error('Feature mode requires a feature id');
      featureIds = [options.feature];
    }
    if (options.mode === 'release-diff') {
      if (!options.releaseFeatures?.length) throw new Error('Release-diff mode requires changed feature ids');
      featureIds = options.releaseFeatures;
    }
    const selectedFeatures = featureIds.map((id) => model.features.find((feature) => feature.id === id)).filter((feature): feature is ProductModel['features'][number] => Boolean(feature));
    if (selectedFeatures.length !== featureIds.length || selectedFeatures.some((feature) => !feature.demoReady && !feature.userConfirmed)) throw new Error('Generic plans require demo-ready or user-confirmed features');
    const actorIds = options.mode === 'role' && options.role ? [options.role] : journey.actors;
    const actors = model.roles.filter((role) => actorIds.includes(role.id)).map((role) => ({ id: role.id, role: role.id }));
    if (actors.length === 0) throw new Error('No declared actors match the requested plan');
    const scenes = selectedFeatures.map((feature, index) => {
      const observedUrl = feature.runtimeEvidence[0]?.url;
      const route = observedUrl ? `${new URL(observedUrl).pathname}${new URL(observedUrl).search}` : model.routes[index]?.path ?? '/';
      return { id: feature.id, title: feature.name, actor: actors[index % actors.length].id, actions: [{ type: 'goto' as const, path: route, title: `Open ${feature.name}` }, { type: 'screenshot' as const, name: feature.id, title: `Capture ${feature.name}` }] };
    });
    return ScenarioSchema.parse({ version: 1, id: options.mode === 'feature' ? featureIds[0] : options.mode === 'release-diff' ? 'release-diff' : journey.id, title: journey.name, audience: options.audience ?? 'general', locale: options.locale ?? 'en', duration: options.duration, narration: options.narration ?? 'none', branding: { name: model.product, primary: '#2563eb', background: '#08111f' }, preconditions: {}, actors, scenes });
  }
  const scenario = {
    version: 1 as const, id: journey.id, title: journey.name, audience: options.audience ?? 'general', locale: options.locale ?? 'en', duration: options.duration,
    narration: options.narration ?? 'none', branding: { name: model.product, primary: '#116b5a', background: '#081b18' },
    preconditions: { resetCommand: `curl -fsS -X POST ${new URL('/api/reset', options.baseUrl ?? 'http://127.0.0.1:4173').toString()}` }, actors: journey.actors.map((id) => ({ id, role: id })),
    scenes: [
      { id: 'adaptive-intake', title: 'Un intake qui s’adapte', description: 'La patiente décrit ses symptômes en quelques réponses guidées.', actor: 'patient', actions: [
        { type: 'goto' as const, path: '/?role=patient&locale=fr', title: 'Ouvrir le parcours patient', timing: { pauseAfterMs: 900 } },
        { type: 'fill' as const, target: { by: 'label' as const, value: 'Nom complet' }, text: 'Camille Martin', title: 'Identifier la patiente', timing: { cursorDurationMs: 650, settleBeforeMs: 180, keystrokeDelayMs: 65, pauseAfterMs: 900 } },
        { type: 'select' as const, target: { by: 'label' as const, value: 'Symptôme principal' }, value: 'headache', title: 'Choisir le symptôme principal', timing: { cursorDurationMs: 500, settleBeforeMs: 160, pauseAfterMs: 900 } },
        { type: 'click' as const, target: { by: 'role' as const, role: 'button' as const, value: 'Commencer' }, title: 'Démarrer l’intake', timing: { cursorDurationMs: 450, settleBeforeMs: 190, pauseAfterMs: 1_200 } },
        { type: 'click' as const, target: { by: 'role' as const, role: 'radio' as const, value: 'Trois jours' }, title: 'Préciser la durée', timing: { cursorDurationMs: 500, settleBeforeMs: 180, pauseAfterMs: 900 } },
        { type: 'click' as const, target: { by: 'role' as const, role: 'button' as const, value: 'Continuer' }, title: 'Continuer', timing: { cursorDurationMs: 480, settleBeforeMs: 180, pauseAfterMs: 1_200 } },
        { type: 'click' as const, target: { by: 'role' as const, role: 'radio' as const, value: 'Modérée' }, title: 'Préciser l’intensité', timing: { cursorDurationMs: 500, settleBeforeMs: 180, pauseAfterMs: 900 } },
        { type: 'click' as const, target: { by: 'role' as const, role: 'button' as const, value: 'Envoyer au médecin' }, title: 'Transmettre au médecin', timing: { cursorDurationMs: 550, settleBeforeMs: 220, pauseAfterMs: 1_600 } },
        { type: 'assert' as const, target: { by: 'text' as const, value: 'Intake transmis' }, state: 'visible' as const, title: 'Confirmer la transmission', timing: { pauseAfterMs: 900 } }
      ] },
      { id: 'physician-brief', title: 'Du questionnaire au brief clinique', description: 'Le médecin retrouve une synthèse prête à revoir.', actor: 'physician', actions: [
        { type: 'goto' as const, path: '/?role=physician&locale=fr', title: 'Ouvrir l’espace clinique', timing: { pauseAfterMs: 1_000 } },
        { type: 'click' as const, target: { by: 'role' as const, role: 'button' as const, value: 'Actualiser le dossier' }, title: 'Charger le nouveau brief', timing: { cursorDurationMs: 650, settleBeforeMs: 220, pauseAfterMs: 1_800 } },
        { type: 'assert' as const, target: { by: 'text' as const, value: 'Camille Martin' }, state: 'visible' as const, title: 'Retrouver la patiente', timing: { pauseAfterMs: 900 } },
        { type: 'assert' as const, target: { by: 'text' as const, value: 'Céphalée probablement bénigne' }, state: 'visible' as const, title: 'Vérifier la synthèse clinique', timing: { pauseAfterMs: 900 } }
      ] }
    ]
  };
  const mode = options.mode ?? 'journey';
  let selectedScenes = scenario.scenes;
  let id = scenario.id;
  let title = scenario.title;
  if (mode === 'feature') {
    if (!options.feature) throw new Error('Feature mode requires a feature id');
    selectedScenes = scenario.scenes.filter((scene) => scene.id === options.feature);
    id = options.feature;
    title = model.features.find((feature) => feature.id === options.feature)?.name ?? options.feature;
  }
  if (mode === 'role') {
    if (!options.role) throw new Error('Role mode requires a role id');
    selectedScenes = scenario.scenes.filter((scene) => scene.actor === options.role);
    id = `${options.role}-journey`;
    title = `${options.role} journey`;
  }
  if (mode === 'release-diff') {
    if (!options.releaseFeatures?.length) throw new Error('Release-diff mode requires changed feature ids');
    selectedScenes = scenario.scenes.filter((scene) => options.releaseFeatures!.includes(scene.id));
    id = 'release-diff';
    title = 'Release changes';
  }
  if (selectedScenes.length === 0) throw new Error(`No demo-ready scenes match ${mode}`);
  const selectedActors = new Set(selectedScenes.map((scene) => scene.actor));
  const physicianNeedsSeed = selectedActors.has('physician') && !selectedActors.has('patient');
  const seedUrl = new URL('/api/intake', options.baseUrl ?? 'http://127.0.0.1:4173').toString();
  return ScenarioSchema.parse({ ...scenario, id, title, scenes: selectedScenes, actors: scenario.actors.filter((actor) => selectedActors.has(actor.id)), preconditions: { ...scenario.preconditions, seedCommand: physicianNeedsSeed ? `curl -fsS -X POST -H 'content-type: application/json' --data '{"name":"Camille Martin","symptom":"headache","duration":"3","severity":"moderate"}' ${seedUrl}` : undefined } });
}
