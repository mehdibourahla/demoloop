import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';
import { chromium } from 'playwright';
import { runtimeEvidence, sourceEvidence } from './evidence.js';
import { ProductModelSchema, type ProductModel } from './schemas.js';
import { assertSafeTarget } from './safety.js';

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
  return value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'root';
}

async function fallbackModel(root: string): Promise<ProductModel> {
  let product = basename(root);
  try { product = (JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { name?: string }).name ?? product; } catch {}
  const surfaces = new Map<string, ProductModel['proofSurfaces'][number]>();
  for (const path of await readableFiles(root)) {
    const content = await readFile(path, 'utf8');
    const relativePath = relative(root, path);
    for (const [index, line] of content.split('\n').entries()) {
      for (const match of line.matchAll(/["'`]((?:\/[a-zA-Z0-9][a-zA-Z0-9_?=&/.-]*)|\/)["'`]/g)) {
        const route = match[1];
        if (/\.(?:png|jpg|svg|css|js|ts)$/.test(route) || surfaces.has(route)) continue;
        surfaces.set(route, { id: `route-${slug(route)}`, name: `Route ${route}`, route, evidence: [sourceEvidence(relativePath, index + 1, 'Route candidate')] });
      }
    }
  }
  return ProductModelSchema.parse({ version: 2, product, proofSurfaces: [...surfaces.values()] });
}

async function loadModel(root: string): Promise<ProductModel> {
  try { return ProductModelSchema.parse(JSON.parse(await readFile(join(root, 'app-model.json'), 'utf8'))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return fallbackModel(root);
  }
}

export async function discoverProduct(root: string, url?: string, outputDirectory = resolve('artifacts/discovery')): Promise<ProductModel> {
  const model = await loadModel(root);
  if (!url) return model;
  assertSafeTarget(url);
  await mkdir(outputDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    for (const surface of model.proofSurfaces) {
      if (!surface.route && !surface.runtimeUrl) continue;
      const targetUrl = surface.runtimeUrl ?? new URL(surface.route!, url).toString();
      const response = await page.goto(targetUrl, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
      if (!response?.ok() || !await page.locator('body').isVisible()) continue;
      const screenshot = join(outputDirectory, `${surface.id}.png`);
      const ariaSnapshot = join(outputDirectory, `${surface.id}.aria.yml`);
      await page.screenshot({ path: screenshot, fullPage: true });
      await writeFile(ariaSnapshot, await page.locator('body').ariaSnapshot());
      surface.evidence.push(runtimeEvidence(targetUrl, new Date().toISOString(), { screenshot, ariaSnapshot }));
    }
  } finally { await browser.close(); }
  return ProductModelSchema.parse(model);
}
