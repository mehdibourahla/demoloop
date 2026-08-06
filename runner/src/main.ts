import { runOnce } from './agent.js';
import { httpDeps } from './client.js';

const api = process.env.DEMOLOOP_API ?? 'http://127.0.0.1:8000';
const token = process.env.DEMOLOOP_RUNNER_TOKEN;
if (!token) throw new Error('DEMOLOOP_RUNNER_TOKEN is required');

const deps = httpDeps(api, token);
const once = process.argv.includes('--once');
const kinds = (process.env.DEMOLOOP_KINDS ?? 'capture').split(',').filter(Boolean);

do {
  const outcome = await runOnce(deps, 15_000, kinds);
  console.log(outcome);
  if (outcome === 'idle' && !once) await new Promise((wait) => setTimeout(wait, 2_000));
} while (!once);
