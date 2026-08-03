import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { resolveAudioPolicy } from '../src/audio.js';

describe('audio policy', () => {
  test('silent means no audio sources', async () => {
    await expect(resolveAudioPolicy({ policy: 'silent' })).resolves.toEqual({ voiceover: false });
  });

  test('music must be a real local asset', async () => {
    await expect(resolveAudioPolicy({ policy: 'music', music: { path: 'https://example.com/song.mp3', level: 0.2, fadeInMs: 500, fadeOutMs: 500 } })).rejects.toThrow(/local/i);
    const directory = await mkdtemp(join(tmpdir(), 'demo-music-'));
    const path = join(directory, 'licensed.wav');
    await writeFile(path, 'fixture');
    await expect(resolveAudioPolicy({ policy: 'voiceover-and-music', music: { path, level: 0.18, fadeInMs: 400, fadeOutMs: 700 } })).resolves.toEqual(expect.objectContaining({ voiceover: true, musicPath: path, musicLevel: 0.18 }));
  });
});
