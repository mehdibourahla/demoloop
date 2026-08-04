import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Browser, Page } from 'playwright';
import { verifyTargets } from '../src/verify.js';
import { ScenarioSchema } from '../src/schemas.js';
import { locatorFor } from '../src/runner.js';

function scenario(actions: unknown[]) {
  return ScenarioSchema.parse({
    version: 2, id: 'verify-proof', title: 'Verify proof', outputType: 'feature-clip', audience: 'operators',
    actors: [{ id: 'user', label: 'Operator' }],
    scenes: [{ id: 'only', title: 'Only', purpose: 'proof', actor: 'user', actions }]
  });
}

describe('scenario target verification', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    await page.setContent(`<main><button>Ouvrir</button><p>12 000,00 DA</p></main>
      <div role="dialog"><button>Enregistrer</button></div><button>Enregistrer</button>`);
  });
  afterAll(async () => { await browser.close(); });

  test('reports a target that resolves to exactly one element', async () => {
    const findings = await verifyTargets(page, scenario([{ type: 'click', target: { by: 'role', role: 'button', value: 'Ouvrir' } }]), 300);

    expect(findings).toEqual([{ sceneId: 'only', actionIndex: 0, label: 'Ouvrir', status: 'resolved', matches: 1 }]);
  });

  test('names a target that matches nothing', async () => {
    const findings = await verifyTargets(page, scenario([{ type: 'click', target: { by: 'role', role: 'button', value: 'Absent' } }]), 300);

    expect(findings[0]).toMatchObject({ status: 'missing', matches: 0, label: 'Absent' });
  });

  test('names a target that matches more than one element', async () => {
    const findings = await verifyTargets(page, scenario([{ type: 'click', target: { by: 'roleAny', role: 'button', values: ['Enregistrer', 'Sauver'] } }]), 300);

    expect(findings[0]).toMatchObject({ status: 'ambiguous', matches: 2 });
  });

  test('accepts the same target once the scenario scopes it', async () => {
    const findings = await verifyTargets(page, scenario([{ type: 'click', target: { by: 'roleAny', role: 'button', values: ['Enregistrer', 'Sauver'], within: { role: 'dialog' } } }]), 300);

    expect(findings[0]).toMatchObject({ status: 'resolved', matches: 1 });
  });

  test('reports every broken target instead of stopping at the first', async () => {
    const findings = await verifyTargets(page, scenario([
      { type: 'click', target: { by: 'role', role: 'button', value: 'Absent' } },
      { type: 'click', target: { by: 'role', role: 'button', value: 'Aussi absent' } },
      { type: 'click', target: { by: 'role', role: 'button', value: 'Ouvrir' } }
    ]), 300);

    expect(findings.map((finding) => finding.status)).toEqual(['missing', 'missing', 'resolved']);
  });

  test('checks later targets in the state the scenario will have reached', async () => {
    const staged = await browser.newPage();
    const markup = `<button id="open">Ouvrir</button><script>
      document.querySelector('#open').onclick = () => { const b = document.createElement('button'); b.textContent = 'Confirmer'; document.body.append(b); };
    </script>`;
    await staged.setContent(markup);

    const actions = [
      { type: 'click', target: { by: 'role', role: 'button', value: 'Ouvrir' } },
      { type: 'click', target: { by: 'role', role: 'button', value: 'Confirmer' } }
    ];
    const blind = await verifyTargets(staged, scenario(actions), 300);
    await staged.setContent(markup);
    const advancing = await verifyTargets(staged, scenario(actions), 300, async (action) => {
      if ('target' in action && action.target) await locatorFor(staged, action.target).click().catch(() => undefined);
    });

    expect(blind[1].status).toBe('missing');
    expect(advancing[1].status).toBe('resolved');
    await staged.close();
  }, 30_000);

  test('checks targets nested inside control flow', async () => {
    const findings = await verifyTargets(page, scenario([
      { type: 'branch', when: { target: { by: 'role', role: 'button', value: 'Ouvrir' } }, then: [{ type: 'click', target: { by: 'role', role: 'button', value: 'Absent' } }] }
    ]), 300);

    expect(findings.some((finding) => finding.status === 'missing' && finding.label === 'Absent')).toBe(true);
  });
});
