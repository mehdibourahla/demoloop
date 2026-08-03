import type { ProductModel, Scenario } from './schemas.js';

export interface EditorialIssue {
  code: string;
  message: string;
  sceneId?: string;
}

export function validateScenarioEditorially(scenario: Scenario, model: ProductModel): EditorialIssue[] {
  const issues: EditorialIssue[] = [];
  const purposes = scenario.scenes.map((scene) => scene.purpose);
  if (scenario.outputType === 'public-master') {
    if (purposes[0] !== 'hook') issues.push({ code: 'missing-hook', message: 'Public master must open with a hook' });
    if (!purposes.includes('context')) issues.push({ code: 'missing-context', message: 'Public master must establish usage context' });
    if (purposes.at(-1) !== 'close') issues.push({ code: 'missing-close', message: 'Public master must end deliberately' });
  }
  if (!purposes.some((purpose) => purpose === 'result' || purpose === 'proof')) issues.push({ code: 'missing-proof', message: 'Output must show a result or proof' });
  const montageRatio = purposes.filter((purpose) => purpose === 'montage').length / purposes.length;
  if (scenario.outputType !== 'montage' && montageRatio > 0.25) issues.push({ code: 'montage-dominates', message: 'Montage cannot dominate the narrative' });
  const meaningful = scenario.scenes.flatMap((scene) => scene.actions).some((action) => ['click', 'fill', 'select'].includes(action.type));
  if (scenario.outputType !== 'montage' && !meaningful) issues.push({ code: 'route-only', message: 'Navigation and assertions alone are not a complete demonstration' });
  scenario.scenes.forEach((scene, index) => {
    if (!model.actors.some((actor) => actor.id === scene.actor)) issues.push({ code: 'unsupported-actor', message: `Actor ${scene.actor} lacks model evidence`, sceneId: scene.id });
    const previous = scenario.scenes[index - 1];
    if (previous && previous.actor !== scene.actor && !scene.causalLink) issues.push({ code: 'missing-actor-relationship', message: 'Actor context changed without a causal link', sceneId: scene.id });
  });
  return issues;
}
