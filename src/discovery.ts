import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';
import { chromium } from 'playwright';
import { ProductModelSchema, type ProductModel } from './schemas.js';
import { assertSafeTarget } from './safety.js';

interface FixtureManifest {
  product: string;
  roles: Array<{ id: string; name: string }>;
  routes: Array<{ path: string; role?: string }>;
  features: Array<{ id: string; name: string; route: string; source: string }>;
  journeys: Array<{ id: string; name: string; actors: string[]; features: string[] }>;
}

async function evidenceLine(path: string, token: string): Promise<number> {
  const lines = (await readFile(path, 'utf8')).split('\n');
  return Math.max(1, lines.findIndex((line) => line.includes(token)) + 1);
}

async function readableFiles(root: string): Promise<string[]> {
  const ignored = new Set(['node_modules', 'dist', 'artifacts', '.git', '.next', 'coverage']);
  const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte', '.html', '.md', '.json', '.sql', '.yaml', '.yml']);
  const files: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (extensions.has(extname(entry.name)) && (await stat(path)).size <= 1_000_000) files.push(path);
    }
  }
  await walk(root);
  return files;
}

function slug(value: string): string {
  return value.replace(/\.[^.]+$/, '').replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

async function fallbackModel(root: string): Promise<{ model: ProductModel; featureRoutes: Map<string, string> }> {
  const files = await readableFiles(root);
  const packagePath = join(root, 'package.json');
  let product = basename(root);
  try { product = (JSON.parse(await readFile(packagePath, 'utf8')) as { name?: string }).name ?? product; } catch {}
  const roles = new Map<string, { id: string; name: string; evidence: Array<{ path: string; line: number }> }>();
  const routes = new Map<string, { path: string; evidence: Array<{ path: string; line: number }>; runtimeEvidence: [] }>();
  const featureCandidates: Array<{ id: string; name: string; sourceEvidence: Array<{ path: string; line: number }>; demoReady: false; userConfirmed: false; runtimeEvidence: [] }> = [];
  const featureRoutes = new Map<string, string>();
  for (const path of files) {
    const relativePath = relative(root, path);
    const content = await readFile(path, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      for (const match of line.matchAll(/["'`]((?:\/[a-zA-Z0-9][a-zA-Z0-9_?=&/.-]*)|\/)['"`]/g)) {
        const route = match[1];
        if (!/\.(?:png|jpg|svg|css|js|ts)$/.test(route)) routes.set(route, routes.get(route) ?? { path: route, evidence: [{ path: relativePath, line: index + 1 }], runtimeEvidence: [] });
      }
      for (const match of line.matchAll(/\b(admin|patient|physician|doctor|clinician|customer|member|guest|user)\b/gi)) {
        const id = match[1].toLowerCase() === 'doctor' || match[1].toLowerCase() === 'clinician' ? 'physician' : match[1].toLowerCase();
        roles.set(id, roles.get(id) ?? { id, name: id[0].toUpperCase() + id.slice(1), evidence: [{ path: relativePath, line: index + 1 }] });
      }
    });
    if (/(?:components?|screens?|pages?|views?|routes?)[/\\]/i.test(relativePath) && /\.(?:tsx?|jsx?|vue|svelte|html)$/.test(relativePath)) {
      const name = basename(relativePath).replace(/\.[^.]+$/, '');
      if (!/^(index|routes?|app|main)$/i.test(name)) featureCandidates.push({ id: slug(name), name: name.replace(/([a-z])([A-Z])/g, '$1 $2'), sourceEvidence: [{ path: relativePath, line: 1 }], demoReady: false, userConfirmed: false, runtimeEvidence: [] });
    }
  }
  const uniqueFeatures = [...new Map(featureCandidates.map((feature) => [feature.id, feature])).values()];
  for (const feature of uniqueFeatures) featureRoutes.set(feature.id, [...routes.keys()].find((route) => slug(route).includes(feature.id)) ?? '/');
  const actorIds = roles.size ? [...roles.keys()] : ['user'];
  const features = uniqueFeatures.length ? uniqueFeatures : [...routes.values()].map((route) => ({ id: slug(route.path) || 'home', name: route.path, sourceEvidence: route.evidence, demoReady: false as const, userConfirmed: false as const, runtimeEvidence: [] as [] }));
  for (const feature of features) if (!featureRoutes.has(feature.id)) featureRoutes.set(feature.id, [...routes.keys()][0] ?? '/');
  const model = ProductModelSchema.parse({
    version: 1, product,
    roles: roles.size ? [...roles.values()] : [{ id: 'user', name: 'User', evidence: [] }],
    routes: [...routes.values()], features,
    journeys: features.map((feature) => ({ id: `${feature.id}-journey`, name: feature.name, actors: actorIds, features: [feature.id], demoReady: false }))
  });
  return { model, featureRoutes };
}

export async function discoverProduct(root: string, url?: string, outputDirectory = resolve('artifacts/discovery')): Promise<ProductModel> {
  const manifestPath = join(root, 'app-model.json');
  let manifest: FixtureManifest | undefined;
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as FixtureManifest; } catch {}
  let model: ProductModel;
  const featureRoutes = new Map<string, string>();
  if (manifest) {
    model = ProductModelSchema.parse({
      version: 1,
      product: manifest.product,
      roles: await Promise.all(manifest.roles.map(async (role) => ({ ...role, evidence: [{ path: relative(root, manifestPath), line: await evidenceLine(manifestPath, `"id": "${role.id}"`) }] }))),
      routes: manifest.routes.map((route) => ({ ...route, evidence: [{ path: relative(root, manifestPath) }], runtimeEvidence: [] })),
      features: await Promise.all(manifest.features.map(async (feature) => ({ id: feature.id, name: feature.name, demoReady: false, userConfirmed: false, sourceEvidence: [{ path: feature.source, line: await evidenceLine(join(root, feature.source), `data-feature="${feature.id}"`) }], runtimeEvidence: [] }))),
      journeys: manifest.journeys.map((journey) => ({ ...journey, demoReady: false }))
    });
    manifest.features.forEach((feature) => featureRoutes.set(feature.id, feature.route));
  } else {
    const fallback = await fallbackModel(root);
    model = fallback.model;
    fallback.featureRoutes.forEach((route, feature) => featureRoutes.set(feature, route));
  }
  if (!url) return model;

  assertSafeTarget(url);
  await mkdir(outputDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: 'fr-CA' });
    for (const feature of model.features) {
      const route = featureRoutes.get(feature.id) ?? '/';
      const targetUrl = new URL(route, url).toString();
      const response = await page.goto(targetUrl, { waitUntil: 'networkidle' });
      const marker = manifest ? page.locator(`[data-feature="${feature.id}"]`) : page.locator('main, body').first();
      if (response?.ok() && await marker.isVisible()) {
        const screenshot = join(outputDirectory, `${feature.id}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });
        const ariaSnapshot = await marker.ariaSnapshot();
        const ariaPath = join(outputDirectory, `${feature.id}.aria.yml`);
        await writeFile(ariaPath, ariaSnapshot);
        feature.runtimeEvidence.push({ url: targetUrl, screenshot, ariaSnapshot: ariaPath, observedAt: new Date().toISOString() });
        feature.demoReady = true;
      }
    }
  } finally { await browser.close(); }
  model.routes.forEach((route) => {
    const feature = model.features.find((candidate) => featureRoutes.get(candidate.id) === route.path);
    if (feature) route.runtimeEvidence = feature.runtimeEvidence;
  });
  model.journeys.forEach((journey) => { journey.demoReady = journey.features.every((id) => model.features.find((feature) => feature.id === id)?.demoReady); });
  return ProductModelSchema.parse(model);
}
