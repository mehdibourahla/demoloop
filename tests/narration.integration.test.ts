import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { ElevenLabsNarrationProvider } from '../src/narration.js';

const execFileAsync = promisify(execFile);
const servers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))));

async function recordingServer(bytes: Buffer) {
  const requests: Array<Record<string, unknown>> = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    response.writeHead(200, { 'content-type': 'audio/mpeg' });
    response.end(bytes);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server');
  return { requests, baseUrl: `http://127.0.0.1:${address.port}` };
}

describe('ElevenLabs delivery', () => {
  it('sends voice settings, a fixed seed, and the surrounding narration', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'demoloop-voice-'));
    const audio = join(directory, 'response.mp3');
    await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.35', '-c:a', 'libmp3lame', audio]);
    const { requests, baseUrl } = await recordingServer(await readFile(audio));
    const provider = new ElevenLabsNarrationProvider({
      apiKey: 'secret', voiceId: 'voice-123', cacheDirectory: join(directory, 'cache'), baseUrl,
      voiceSettings: { stability: 0.45, similarityBoost: 0.75, style: 0.1, useSpeakerBoost: true, speed: 1 }, seed: 7
    });

    await provider.synthesize({ id: 'two', text: 'The second line.', locale: 'en', outputPath: join(directory, 'two.mp3'), previousText: 'The first line.', nextText: 'The third line.' });

    expect(requests[0]).toEqual({
      text: 'The second line.', model_id: 'eleven_multilingual_v2', seed: 7,
      previous_text: 'The first line.', next_text: 'The third line.',
      voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true, speed: 1 }
    });
  });

  it('re-synthesizes when the voice settings change', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'demoloop-voice-cache-'));
    const audio = join(directory, 'response.mp3');
    await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.35', '-c:a', 'libmp3lame', audio]);
    const { requests, baseUrl } = await recordingServer(await readFile(audio));
    const cacheDirectory = join(directory, 'cache');
    const segment = { id: 'one', text: 'One line.', locale: 'en', outputPath: join(directory, 'one.mp3') };

    await new ElevenLabsNarrationProvider({ apiKey: 'k', voiceId: 'v', cacheDirectory, baseUrl, voiceSettings: { stability: 0.3 } }).synthesize(segment);
    await new ElevenLabsNarrationProvider({ apiKey: 'k', voiceId: 'v', cacheDirectory, baseUrl, voiceSettings: { stability: 0.9 } }).synthesize(segment);

    expect(requests).toHaveLength(2);
  });
});

describe('ElevenLabs narration', () => {
  it('authenticates, measures generated speech, and reuses the local cache', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'demoloop-narration-'));
    const audio = join(directory, 'response.mp3');
    await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.35', '-c:a', 'libmp3lame', audio]);
    const bytes = await readFile(audio);
    const requests: Array<{ authorization?: string; url?: string; body?: unknown }> = [];
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      requests.push({ authorization: request.headers['xi-api-key'] as string | undefined, url: request.url, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      response.writeHead(200, { 'content-type': 'audio/mpeg' });
      response.end(bytes);
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP server');
    const provider = new ElevenLabsNarrationProvider({ apiKey: 'secret', voiceId: 'voice-123', cacheDirectory: join(directory, 'cache'), baseUrl: `http://127.0.0.1:${address.port}` });
    const segment = { id: 'scene-1', text: 'A concise product demo narration.', locale: 'en', outputPath: join(directory, 'scene-1.mp3') };

    const first = await provider.synthesize(segment);
    const second = await provider.synthesize(segment);

    expect(first.durationSeconds).toBeGreaterThan(0.3);
    expect(second).toEqual(first);
    expect(requests).toEqual([{ authorization: 'secret', url: '/v1/text-to-speech/voice-123?output_format=mp3_44100_128', body: { text: segment.text, model_id: 'eleven_multilingual_v2' } }]);
    expect(await readFile(first.path)).toEqual(bytes);
  });
});
