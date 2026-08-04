# Runtime contracts

The pipeline is `repository + app + request -> product model -> plan result -> scenarios -> two-pass receipt -> raw scenes + timeline -> MP4 -> deterministic report -> Watch review -> final report`.

## Product and planning

- `discover` reads `<repository.root>/app-model.json` when it exists, validates it against `schemas/product-model.schema.json`, and enriches its proof surfaces with runtime screenshots and ARIA snapshots. Without that file, discovery can only scrape candidate routes from source, which never satisfies planning: authoring `app-model.json` is how a repository becomes demonstrable. `fixtures/neutral/handoff/app-model.json` is a complete minimal example.
- `product-model.json` is the discovery output: audiences, actors and sessions, capabilities, journeys, states, transitions, relationships, outcomes, proof surfaces, safe actions, async behavior, and evidence.
- Evidence is source, runtime observation, or explicit user confirmation. Never replace unresolved actor ownership or behavior with a guess.
- Planning returns `planned` or `needs-authoring`. Route-only discovery cannot become a public scenario.
- Full planning creates a short public master, actor journey clips, coverage, and explicit omissions.
- Scene purposes are hook, context, interaction, exploration, state-change, handoff, result, proof, montage, and close.

## Capture and presentation

- Recording accepts only a passing two-rehearsal receipt for the exact scenario digest. Presentation and audio changes invalidate the digest.
- The deterministic runner owns contexts, semantic locators, waits, actions, cursor motion, capture, and evidence. The agent edits only between runs.
- `timing` owns cursor travel, settling, keystroke delay, and post-action dwell. Presentation owns ROI, camera, transition weight, caption placement, and the loading treatment.
- `loading: cut` removes real inactive footage during render: any static span longer than `maxStaticHoldMs` is cut down to that hold. `loading: preserve` keeps the recording untouched. Removed footage is listed in `presentation-metadata.json`.
- Adaptive interfaces use deterministic actions, never model reasoning at capture time:
  - `choose` picks among the options visible right now using ordered `prefer` phrases and a hard `avoid` list. An option matching `avoid` is never clicked; when nothing is permitted the scene fails loudly. Set `requirePreferred` when only a preferred option is acceptable.
  - `repeat` runs its actions until `until` holds, bounded by `maxIterations`.
  - `branch` runs `then` or `otherwise` depending on whether `when` holds at that moment.
  - `waitFor` settles on `visible`, `hidden`, `enabled`, or `disabled` before continuing, which is how streamed replies and re-enabled inputs are awaited.
- The scenario digest pins the program, not the path. When control flow varies between runs, `executedPath` in the execution report records every choice and branch actually taken.
- Actors may declare a `preflight` target. A failed preflight reports an unusable actor session instead of a missing element.
- `runtime.ignoreRequestPatterns` and `runtime.ignoreConsolePatterns` allow capture-environment noise (headless WebGL warnings, third-party beacons) without hiding it: ignored items are listed in the execution report as `ignoredRequests` / `ignoredConsoleErrors`. Never use them to silence a real application defect.
- Use separate browser contexts for actors. Never round-robin actors or merge distinct sessions.
- Render one caption system only. Do not show action names, click circles, or capture-time chapter/brand overlays.

## Audio

- `silent`: no audio stream.
- `music`: validated local asset with explicit level and fades.
- `voiceover`: configured narration provider.
- `voiceover-and-music`: both, with music kept subordinate.

ElevenLabs reads its key from `ELEVENLABS_API_KEY`; never put secrets in scenarios or source control. Generated audio remains local and content-addressed.

Narration is measured before capture and constrains both the take and the edit:

- `rehearse` and `record` synthesize every scene's narration before launching the browser, then extend each scene's capture so the recorded footage covers its narration. The plan is recorded as `narrationSeconds` in the execution report and the wait is a `narration` timeline event, so it is never counted as dead time.
- Text-to-speech is a measurement, not a decision: the same scenario, voice, and model always produce the same durations, so pacing does not weaken the rehearsal receipt. Changing the configured voice between rehearsal and recording changes pacing without changing the digest — compare `narrationSeconds` across the two reports if that matters.
- Scene narration is the scripted action `narration` values joined in order, or the scene title and description when none are scripted. Capture and render derive it identically.

- Trimming keeps at least the narration's duration, giving inactive time back proportionally rather than cutting a scene shorter than its script.
- When narration still outruns the recording, the last frame is held to cover it and the hold is recorded in `presentation-metadata.json` and warned per scene. Holds are legitimate in small amounts and become a rejection through the distinct-frame and static-section checks when relied upon.
- Non-silent output is normalized to `loudnorm=I=-16:TP=-1.5:LRA=11` at the final mux.
- Narration is never cut mid-utterance: each scene's audio is a complete take played inside its own scene, so cuts never land inside speech.

## Editing

- `render` writes `edl.json` (video-use schema) and records every cut on the output timeline in `presentation-metadata.json` as `{outputSeconds, kind, sceneId}`, where `kind` is `trim` (footage removed inside a scene) or `scene` (a boundary between scenes).
- Trim cuts must be invisible: `evaluate` samples each one and fails `cut-seams` when the frames either side differ by more than `seamChangeMax`. Scene cuts are deliberate and are not held to that rule.
- `evaluate` writes a contact sheet tiling the opening, every cut, every static span, and the close, and records those timestamps under `review` in the quality report. Read that one image before deciding whether any moment needs a closer look.

## Quality

`quality-report.json` separates technical checks, deterministic editorial checks, and the Watch agent review. Deterministic analysis measures encoding, viewport, audio policy, sensitive information, distinct/discarded frames, static spans, hook, close, product dominance, ROI obstruction, and montage ratio.

Before Watch, status is `pending-agent-review` unless deterministic checks already reject the output. Watch writes a schema-valid `editorial-review.json`; `finalize` accepts only the actual absolute MP4 whose SHA-256 matches the review's `videoSha256`, an accept verdict, score at least 7, complete frame inspection, and a usable transcript for voiced output.
