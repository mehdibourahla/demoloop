# Agent-Directed Demo Pacing

## Outcome

The planning agent chooses a natural pace for each action and records exact values in the scenario manifest. Capture then executes those values deterministically. The current SanoX journey should land near 28–32 seconds without accelerating or stretching the ElevenLabs audio.

## Contract

Each semantic action may contain a `timing` object:

- `cursorDurationMs`: duration of the curved pointer journey to an interactive target.
- `settleBeforeMs`: dwell after arrival and before interaction.
- `keystrokeDelayMs`: delay between typed characters.
- `pauseAfterMs`: dwell after the action so the resulting state can be understood.

The agent selects values using action meaning, target distance, narration duration, and UI transition weight. Exact values are stored in YAML. Existing manifests without timing remain valid and use conservative defaults.

## Runtime

Pointer movement follows the existing eased curved path, but each path point is emitted at a measured interval instead of using Playwright’s instantaneous multi-step move. Fill actions use the locked keystroke delay. All actions use the locked post-action pause when supplied. Legacy top-level `pauseAfterMs` remains supported.

No action titles, click circles, or speed changes are added. ElevenLabs files remain at their natural playback rate. A narration segment longer than its scene remains a render error.

## Agent Guidance

The skill asks the planning agent to optimize for comprehension, not minimum duration. Typical pointer journeys should take 350–700 ms, pre-click settling 140–240 ms, typing 55–80 ms per character, ordinary pauses 700–1,000 ms, and state-changing transitions 1,100–1,800 ms. The agent may depart from these ranges when the product state or narration requires it.

## Verification

Unit tests prove a scheduled cursor path has exact endpoints and the requested elapsed duration. Contract tests prove timing survives schema parsing. Integration tests prove a recorded journey is slower, retains a visible cursor, and remains deterministic. Both final videos must pass the existing encoding, viewport, cursor, privacy, and audible narration checks.
