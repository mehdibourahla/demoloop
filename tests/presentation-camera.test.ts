import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

describe('presentation camera', () => {
  test('uses settled static crops instead of continuous camera drift', () => {
    const source = readFileSync(resolve('remotion/index.tsx'), 'utf8');

    expect(source).not.toMatch(/useCurrentFrame|interpolate/);
    expect(source).toMatch(/const cameraScale =/);
    expect(source).toMatch(/scale: cameraScale/);
  });
});
