import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { uploadArtifacts } from '../src/upload.js';

test('uploads every artifact and rewrites the map to object keys', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'demoloop-upload-'));
  const timeline = join(directory, 'timeline.json');
  await writeFile(timeline, '{"events":[]}');
  const sent: Array<{ url: string; bytes: number }> = [];

  const rewritten = await uploadArtifacts(
    { timeline, report: timeline },
    async (names) => ({
      urls: Object.fromEntries(names.map((name) => [name, `http://store/${name}`])),
      keys: Object.fromEntries(names.map((name) => [name, `workspace/w/production/j/${name}`]))
    }),
    async (url, body) => { sent.push({ url, bytes: body.byteLength }); }
  );

  expect(sent.map((entry) => entry.url).sort()).toEqual(['http://store/report', 'http://store/timeline']);
  expect(sent.every((entry) => entry.bytes > 0)).toBe(true);
  expect(rewritten).toEqual({ timeline: 'workspace/w/production/j/timeline', report: 'workspace/w/production/j/report' });
});
