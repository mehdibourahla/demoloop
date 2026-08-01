#!/usr/bin/env node
import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bundled = fileURLToPath(new URL('../../../dist/src/cli.js', import.meta.url));
let executable = process.env.PRODUCT_DEMO_CLI;
if (!executable) {
  try { await access(bundled); executable = bundled; } catch {}
}
const child = executable
  ? spawn(process.execPath, [executable, ...process.argv.slice(2)], { stdio: 'inherit' })
  : spawn('product-demo', process.argv.slice(2), { stdio: 'inherit' });
child.on('error', (error) => { console.error(`Unable to start product-demo: ${error.message}`); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
