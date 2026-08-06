import { describe, expect, test } from 'vitest';
import { formatSrt, subtitleCues } from '../src/subtitles.js';

describe('subtitle cues', () => {
  test('splits a scene line into sentence-sized cues timed across its narration', () => {
    const cues = subtitleCues([{ text: 'Atlas coordinates field teams. The dashboard opens on this month.', startSeconds: 0, durationSeconds: 6 }]);

    expect(cues.map((cue) => cue.text)).toEqual(['Atlas coordinates field teams.', 'The dashboard opens on this month.']);
    expect(cues[0].startSeconds).toBe(0);
    expect(cues[1].startSeconds).toBeCloseTo(cues[0].endSeconds, 6);
    expect(cues.at(-1)!.endSeconds).toBeCloseTo(6, 6);
  });

  test('gives each cue time in proportion to how much there is to read', () => {
    const [short, long] = subtitleCues([{ text: 'Short one. A considerably longer sentence to read aloud here.', startSeconds: 0, durationSeconds: 10 }]);

    expect(long.endSeconds - long.startSeconds).toBeGreaterThan(short.endSeconds - short.startSeconds);
  });

  test('breaks a long sentence at a clause rather than running past the line budget', () => {
    const cues = subtitleCues([{ text: 'When the prospect buys, the order goes on the same file, invoiced and cost, so the margin is computed for you.', startSeconds: 0, durationSeconds: 9 }]);

    expect(cues.length).toBeGreaterThan(1);
    for (const cue of cues) expect(cue.text.length).toBeLessThanOrEqual(84);
    expect(cues.map((cue) => cue.text).join(' ')).toBe('When the prospect buys, the order goes on the same file, invoiced and cost, so the margin is computed for you.');
  });

  test('offsets every scene onto the output timeline', () => {
    const cues = subtitleCues([
      { text: 'First scene.', startSeconds: 0, durationSeconds: 2 },
      { text: 'Second scene.', startSeconds: 7.5, durationSeconds: 3 }
    ]);

    expect(cues[0].startSeconds).toBe(0);
    expect(cues[1].startSeconds).toBe(7.5);
    expect(cues[1].endSeconds).toBeCloseTo(10.5, 6);
  });

  test('ignores scenes with no narration', () => {
    expect(subtitleCues([{ text: '', startSeconds: 0, durationSeconds: 4 }])).toEqual([]);
  });
});

describe('srt formatting', () => {
  test('writes standard numbered blocks with comma milliseconds', () => {
    const srt = formatSrt([
      { text: 'First line.', startSeconds: 0, endSeconds: 1.5 },
      { text: 'Second line.', startSeconds: 1.5, endSeconds: 3.25 }
    ]);

    expect(srt).toBe([
      '1',
      '00:00:00,000 --> 00:00:01,500',
      'First line.',
      '',
      '2',
      '00:00:01,500 --> 00:00:03,250',
      'Second line.',
      ''
    ].join('\n'));
  });

  test('carries hours for a long master', () => {
    expect(formatSrt([{ text: 'Late.', startSeconds: 3661.5, endSeconds: 3662 }])).toContain('01:01:01,500 --> 01:01:02,000');
  });
});
