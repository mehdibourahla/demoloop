import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

describe('product-demo Agent Skill', () => {
  test('requires the installed Watch skill and a truthful editorial review', async () => {
    const skill = await readFile('skills/product-demo/SKILL.md', 'utf8');
    expect(skill).toContain('npx skills add bradautomates/claude-video -g');
    expect(skill).toMatch(/\/watch <absolute-video-path>/);
    expect(skill).toContain('--resolution 1024');
    expect(skill).toContain('--no-whisper');
    for (const field of ['Score out of 10', 'Visually distinct versus discarded frame count', 'Hook assessment', 'Narrative continuity', 'Static or repetitive sections', 'Readability', 'Cursor and attention guidance', 'Overlay obstruction', 'Transition quality', 'Audio treatment', 'Outcome and closing quality', 'Timestamped defects', 'Final accept or reject verdict']) expect(skill).toContain(field);
    expect(skill).toMatch(/below 7\/10.*reject/i);
    expect(skill).toMatch(/must not claim.*editorial review.*not run/i);
  });
});
