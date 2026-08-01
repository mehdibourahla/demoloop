import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { discoverProduct } from '../src/discovery.js';
import { planScenario } from '../src/planner.js';
import { ProductModelSchema, ScenarioSchema } from '../src/schemas.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, '../fixtures/sanox');

describe('repository discovery and planning', () => {
  test('discovers SanoX roles, features, routes and source evidence', async () => {
    const model = ProductModelSchema.parse(await discoverProduct(fixtureRoot));
    expect(model.roles.map((role) => role.id)).toEqual(['patient', 'physician']);
    expect(model.features.map((feature) => feature.id)).toEqual(expect.arrayContaining(['adaptive-intake', 'physician-brief']));
    expect(model.features.every((feature) => feature.sourceEvidence[0]?.path.includes('app.html'))).toBe(true);
    expect(model.features.every((feature) => feature.demoReady === false)).toBe(true);
  });

  test('plans a two-actor French patient-to-physician scenario', async () => {
    const model = ProductModelSchema.parse(await discoverProduct(fixtureRoot));
    const scenario = ScenarioSchema.parse(planScenario(model, { mode: 'journey', journey: 'patient-to-physician', locale: 'fr', audience: 'clinic-partner', narration: 'captions' }));
    expect(scenario.actors.map((actor) => actor.id)).toEqual(['patient', 'physician']);
    expect(scenario.locale).toBe('fr');
    expect(scenario.scenes).toHaveLength(2);
    expect(scenario.scenes[1].actions.some((action) => action.type === 'assert' && action.target.value === 'Camille Martin')).toBe(true);
  });

  test('filters feature, role and release-diff plans to approved scenes and actors', async () => {
    const model = ProductModelSchema.parse(await discoverProduct(fixtureRoot));
    const feature = ScenarioSchema.parse(planScenario(model, { mode: 'feature', feature: 'physician-brief', locale: 'fr' }));
    expect(feature.id).toBe('physician-brief');
    expect(feature.scenes.map((scene) => scene.id)).toEqual(['physician-brief']);
    expect(feature.actors.map((actor) => actor.id)).toEqual(['physician']);
    const role = ScenarioSchema.parse(planScenario(model, { mode: 'role', role: 'patient', locale: 'fr' }));
    expect(role.scenes.map((scene) => scene.actor)).toEqual(['patient']);
    const release = ScenarioSchema.parse(planScenario(model, { mode: 'release-diff', releaseFeatures: ['physician-brief'], locale: 'fr' }));
    expect(release.scenes.map((scene) => scene.id)).toEqual(['physician-brief']);
  });

  test('falls back to repository evidence when no product manifest exists', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'product-demo-discovery-'));
    await mkdir(resolve(root, 'src/components'), { recursive: true });
    await writeFile(resolve(root, 'package.json'), JSON.stringify({ name: 'clinic-portal' }));
    await writeFile(resolve(root, 'src/routes.ts'), "export const routes = ['/dashboard', '/reports']; export const role = 'admin';");
    await writeFile(resolve(root, 'src/components/Reports.tsx'), "export const Reports = () => <main><h1>Clinical Reports</h1></main>;");
    const model = ProductModelSchema.parse(await discoverProduct(root));
    expect(model.product).toBe('clinic-portal');
    expect(model.roles.map((role) => role.id)).toContain('admin');
    expect(model.routes.map((route) => route.path)).toEqual(expect.arrayContaining(['/dashboard', '/reports']));
    expect(model.features.some((feature) => feature.sourceEvidence[0].path.includes('Reports.tsx'))).toBe(true);
    expect(model.features.every((feature) => !feature.demoReady)).toBe(true);
    model.features.forEach((feature) => { feature.userConfirmed = true; feature.demoReady = true; });
    model.journeys[0].demoReady = true;
    const generic = ScenarioSchema.parse(planScenario(model, { mode: 'journey', journey: model.journeys[0].id }));
    expect(generic.scenes).toHaveLength(1);
    expect(generic.scenes[0].actions.map((action) => action.type)).toEqual(['goto', 'screenshot']);
    expect(generic.scenes.some((scene) => scene.id === 'adaptive-intake')).toBe(false);
  });
});
