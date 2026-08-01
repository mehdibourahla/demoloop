# Runtime contracts

The pipeline is `repository + app + request -> product model -> scenario YAML -> two-pass receipt -> raw scenes + timeline -> MP4 -> reports`.

Artifacts:

- `product-model.json`: roles, routes, features, journeys, source evidence, runtime evidence, readiness.
- scenario YAML: preconditions, actors, scenes, semantic actions, assertions, annotations, narration, timing, branding.
- `execution-report.json`: digest, pass count, scene states, console/request failures, and artifact paths.
- `timeline.json`: action timestamps, labels, actors, targets, bounding boxes, and state.
- raw scene WebMs, Playwright traces, and final screenshots.
- normalized desktop/mobile MP4 and `quality-report.json`.

Recording accepts only a passing receipt with at least two consecutive rehearsals and the exact current scenario SHA-256 digest. The deterministic runner owns contexts, locators, waits, actions, capture, and evidence. The agent may only edit between executions.

The planning agent owns presentation pacing. It may set `timing.cursorDurationMs`, `timing.settleBeforeMs`, `timing.keystrokeDelayMs`, and `timing.pauseAfterMs` on each action after considering narration, cursor distance, action meaning, and UI transition weight. These values are immutable during the final take. Manifests without them use conservative runtime defaults; `pauseAfterMs` remains supported for compatibility.

Use multiple Playwright contexts for actors with separate sessions. Prefer semantic state waits and assertions; do not add arbitrary sleeps to repair timing. Human presentation pauses belong to action timing and only run during recording.

Quality gates cover scene/assertion success, console, failed requests, locator state, duration, viewport, animated cursor configuration, dead time, annotation placement, sensitive text, narration synchronization status, H.264, yuv420p, and omitted scenes.
