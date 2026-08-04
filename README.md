# Product Demo

Turn a software repository and running web app into evidence-backed product videos with natural cursor movement, deliberate pacing, optional voiceover, and an editorial acceptance gate.

The LLM agent decides what story to tell and how to present it. The CLI locks that plan, rehearses it twice, and records the final take deterministically. Videos never show action labels, typing labels, click circles, or other automation diagnostics.

## What it produces

- A product model with evidence for audiences, actors, capabilities, journeys, state, relationships, outcomes, proof surfaces, and safe actions.
- Either a structured `needs-authoring` result or executable scenario manifests.
- A short public master plus actor journey clips, coverage, and omissions in full mode.
- Desktop or mobile H.264 MP4s with a smooth visible cursor and explicit silent, music, voiceover, or voiceover-plus-music treatment.
- Separate technical, deterministic editorial, and Watch agent-review reports.
- An edit decision list plus a contact sheet of the moments worth reviewing.

Routes alone are never converted into a slideshow. Unresolved actors and missing proof remain unresolved until evidence or the user settles them.

## Requirements

- Node.js 22+
- FFmpeg and `ffprobe`
- Playwright Chromium

```bash
npm ci
npm run install:browsers
npm run build
```

## Try the neutral fixture

The included fixtures cover stateful, cross-context handoff, analytics, operations, mobile, and route-only product shapes.

```bash
npm run fixture
# In another terminal:
npm run product-demo -- discover
npm run product-demo -- plan --mode journey --journey deliver-item
npm run product-demo -- run artifacts/plan/deliver-item.yaml --device desktop
```

`run` exits 3 after rendering because a final video is not accepted until the Agent Skill completes its Watch review. Exit codes are 0 accepted, 1 rejected, 2 `needs-authoring`, and 3 awaiting the Watch review. The output remains available under `artifacts/deliver-item/desktop/`.

## Use it with your application

Edit `product-demo.config.yaml`:

```yaml
app:
  url: http://127.0.0.1:3000
  healthcheck: http://127.0.0.1:3000/health
  startCommand: npm run dev
  commandCwd: .
repository:
  root: .
output:
  directory: artifacts
privacy:
  allowProduction: false
  scanArtifacts: true
runtime:
  rehearsalPasses: 2
  headless: true
  startTimeoutMs: 60000
  actionTimeoutMs: 10000
  ignoreRequestPatterns: []
narration:
  provider: none
```

Then discover and plan:

```bash
npm run product-demo -- discover
npm run product-demo -- plan --mode full --audience customer --duration-seconds 120 --audio silent
```

Planning modes are `full`, `journey`, `feature`, `actor`, and `release`. A planned scene declares its purpose, actor, semantic actions, presentation controls, and optional region of interest. Cursor and typing timing live in each action’s `timing` object and are part of the rehearsal digest.

## Audio

Audio is explicit and independent from captions:

| Policy | Behavior |
|---|---|
| `silent` | No audio stream |
| `music` | Validated local music asset with level and fades |
| `voiceover` | Narration from the configured provider |
| `voiceover-and-music` | Narration with subordinate local music |

Narration is measured before capture, not after. `rehearse`, `record`, and `run` synthesize every scene's narration first, then hold each scene open long enough to carry it, so the footage is paced to the script instead of the script being squeezed into whatever was recorded. The measured plan is stored in the execution report, and the pacing appears in the timeline as a `narration` event rather than as dead time. Synthesis happens before the browser opens, so nothing waits on a network call mid-take.

Narration is also synthesized before the clip is edited, so it drives the edit rather than being cut by it: trimming never removes footage a scene's narration still needs, and when narration outruns the recording the last frame is held to cover it. Every hold is listed in `presentation-metadata.json` and warned about by name in the quality report — a demo that leans on long holds becomes a slideshow and is rejected on distinct frames and static sections, which is the signal to shorten the narration or record a longer scene.

All non-silent output is loudness-normalized to -16 LUFS with a -1.5 dBTP ceiling, so ElevenLabs, macOS narration, and music land at a comparable level.

For ElevenLabs, keep the key in the environment and configure a voice ID:

```bash
export ELEVENLABS_API_KEY='your-key'
```

```yaml
narration:
  provider: elevenlabs
  elevenlabs:
    voiceId: your-voice-id
    modelId: eleven_multilingual_v2
    outputFormat: mp3_44100_128
    apiKeyEnv: ELEVENLABS_API_KEY
```

Only narration text is sent to ElevenLabs. Audio is cached locally by content and provider settings. Never put the key in YAML or source control.

## Commands

| Command | Purpose |
|---|---|
| `discover` | Build an evidence-backed product model |
| `plan` | Produce scenarios or `needs-authoring` |
| `rehearse` | Require two consecutive deterministic passes |
| `record` | Capture using an exact rehearsal receipt |
| `render` | Compose and normalize the MP4 |
| `evaluate` | Run technical and deterministic editorial checks |
| `finalize` | Apply a validated Watch editorial review, matched to the MP4 by checksum |
| `run` | Rehearse, record, render, and evaluate |

Run `npm run product-demo -- help` for flags.

## Post-production with video-use

`render` writes `edl.json` in the [video-use](https://github.com/browser-use/video-use) schema next to the master, naming each scene's raw recording and the ranges kept from it. For treatment this pipeline does not implement — colour grading, burned subtitles, animated overlays, reordered beats — hand that EDL to video-use, which is installed separately and never imported by this CLI.

An edited master is not accepted by inheritance. Run `evaluate --video`, Watch, and `finalize --video` against the edited file: acceptance binds to the checksum of the file that was actually reviewed.

## Agent Skill and mandatory video review

The portable skill lives at `skills/product-demo`. Symlink or copy it into `.agents/skills/product-demo`, `.codex/skills/product-demo`, or `.claude/skills/product-demo` and keep the built CLI checkout available through `PRODUCT_DEMO_CLI` when needed.

The production agent environment also requires Claude Video:

```bash
npx skills add bradautomates/claude-video -g
npx skills list -g
```

Verify that `watch` is discoverable. After every final render, the Agent Skill runs Watch on the actual absolute MP4, inspects every extracted frame, writes `editorial-review.json`, and finalizes the quality report. Public video below 7/10 is rejected. If Watch did not run, the truthful state is `pending-agent-review`.

The generic CLI does not import or require third-party Agent Skills. This separation keeps it usable in ordinary automation while the richer Agent Skill workflow enforces editorial review.

## Safety

- Production-looking hosts are refused unless explicitly allowed.
- Reset and seed commands run before passes when configured.
- Secrets and personal-data patterns fail evaluation: the text visible in every recorded scene is captured and scanned when `privacy.scanArtifacts` is on.
- Capture never persists Playwright traces, which would embed configured redaction values in plain text.
- Raw recordings survive render failures.
- Nothing uploads automatically.
- LLM reasoning is allowed during discovery, planning, and repair—never during the final take.

## Development

```bash
npm run typecheck
npm test
npm run build
npm run schemas
```

See [architecture](docs/architecture.md), [skill workflow](skills/product-demo/SKILL.md), and [runtime contracts](skills/product-demo/references/contracts.md).

## License

MIT
