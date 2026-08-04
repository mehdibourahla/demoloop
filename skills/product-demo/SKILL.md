---
name: product-demo
description: Use when creating, updating, or evaluating evidence-backed product demo videos from a software repository and running web application, including full, feature, actor, release, montage, mobile, localized, silent, music, or voiceover outputs.
---

# Product Demo

Create a coherent product story from evidence, then compile it into a deterministic final take. Let the agent choose the story, camera, pacing, cursor timing, and audio treatment during planning; never let it improvise actions while recording.

For production setup, install Watch with `npx skills add bradautomates/claude-video -g` and verify `watch` appears in `npx skills list -g`.

## Workflow

1. Read `references/contracts.md`. If setup is incomplete, read `references/installation.md`. For voiceover or browser adapters, read `references/adapters.md`.
2. Confirm repository, app URL, output type, audience, device, locale, duration, audio policy, and brand. Never infer production access.
3. Run `product-demo discover`. It reads `app-model.json` from the repository root when present and confirms it against the running app; without that file you get route candidates only, and planning will return `needs-authoring` until you author it (see `fixtures/neutral/handoff/app-model.json`). Treat routes as candidate proof surfaces, not a story. Every actor, capability, journey, transition, outcome, and safe action needs evidence.
4. Run `product-demo plan`. If it returns `needs-authoring`, report the known facts, unresolved decisions, scene briefs, and missing runtime evidence; do not invent a route slideshow. For full mode, preserve the master, journey clips, coverage, and omissions.
5. Write voiceover `narration` as complete spoken sentences, one per scene beat — fragments trimmed to fit a short scene sound clipped whichever engine speaks them, and the runtime paces capture to the narration rather than the reverse. For interfaces whose wording or length varies per run, declare intent instead of exact copy: `choose` with `prefer`/`avoid`, `repeat` with `until`, `branch` with `when`, and `waitFor` for streamed responses. Domain judgement belongs in those declared constraints, never in the runtime.
6. Review scene purposes and causal continuity. Lock semantic actions and natural timing before capture. Use 350–700 ms cursor travel, 140–240 ms settling, 55–80 ms keystrokes, 700–1,000 ms ordinary dwell, and 1,100–1,800 ms after meaningful state changes as starting ranges, then adjust to the interface.
7. Run `product-demo rehearse <scenario>` until the exact digest passes twice. Repair only between runs. For voiced output the runtime measures each scene's narration first and paces capture to it, so do not pad `pauseAfterMs` by hand to make narration fit.
8. Run `product-demo record <scenario>`. Do not edit the scenario or choose new actions during the final take.
9. Run `product-demo render <scenario>` and `product-demo evaluate <scenario>`. Preserve raw media. A deterministic pass is not final acceptance.
11. Run Watch against the actual absolute MP4: `/watch <absolute-video-path>`. Use balanced detail by default. Add `--resolution 1024` when interface text must be evaluated. Use `--no-whisper` only when the video is intentionally silent or has no audio stream. Run focused timestamp ranges when the first scan exposes a questionable section.
12. Inspect every extracted frame. Write `editorial-review.json` matching `schemas/editorial-review.schema.json`, including `videoSha256` from `shasum -a 256 <absolute-video-path>`, then run `product-demo finalize <scenario> --video <absolute-video-path> --review <absolute-review-json-path>`. Repair and repeat after rejection.

The review must contain:

- Score out of 10.
- The reviewed file's SHA-256 checksum.
- Visually distinct versus discarded frame count.
- Hook assessment.
- Narrative continuity.
- Static or repetitive sections.
- Readability.
- Cursor and attention guidance.
- Overlay obstruction.
- Transition quality.
- Audio treatment.
- Outcome and closing quality.
- Timestamped defects.
- Final accept or reject verdict.

A public-facing video below 7/10 must be rejected and returned to planning or editing. A technical pass cannot override an editorial rejection. The agent must not claim an editorial review occurred when Watch was not run; a missing review remains `pending-agent-review`. A voiced video cannot pass when transcription was required but unavailable.

## Output choices

| Request | Output |
|---|---|
| Full | Short public master, journey clips, coverage, omissions |
| Actor or journey | One causally complete journey |
| Feature | Preconditions, interaction, observable result, proof |
| Release | Only evidence-backed changed behavior |
| Montage | Intentionally montage-shaped output; never a fallback |

Use one caption mechanism: a lower-third caption or burned subtitles, never both. Soft subtitle modes (`sidecar`, `embedded`) are safe alongside captions. Keep the product viewport dominant, preserve small type, show a cursor without click circles or action labels, and ensure overlays avoid the region of interest. Make silence, local music, voiceover, or voiceover-plus-music explicit.

## Safety and completion

- Use synthetic data and non-production hosts by default.
- Reset and seed before each pass when commands exist.
- Keep artifacts local unless the user names an upload destination.
- Reject assertion failures, console errors, failed requests, stale receipts, privacy findings, missing media, invalid encoding, obstructed UI, repeated static sections, incomplete outcome, or failed Watch review.
- Report output paths, coverage, omissions, device, locale, duration, audio policy, deterministic status, Watch score, defects, and verdict.

For a checkout without a global CLI, run `npm run product-demo -- <command>` or `node skills/product-demo/scripts/product-demo.mjs <command>`.
