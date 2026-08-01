# Product Demo

Turn a software repository and a running web app into a polished, evidence-backed product video.

`product-demo` gives an LLM agent room to discover the product, choose the story, and set natural pacing. It then locks that plan into YAML and executes the final take deterministically with Playwright, Remotion, and FFmpeg. The result has a smooth visible cursor, no click circles or action labels, optional ElevenLabs voiceover, and machine-readable quality evidence.

## What it does

1. **Discovers** routes, roles, features, tests, fixtures, and runtime evidence.
2. **Plans** a versioned scenario with semantic locators and exact cursor, typing, and pause timing selected by the agent.
3. **Rehearses** the scenario twice and issues a receipt tied to its content digest.
4. **Records** the approved scenario without LLM decisions during the final take.
5. **Renders** branded desktop or mobile H.264 video, with captions or ElevenLabs narration.
6. **Evaluates** assertions, browser errors, privacy findings, cursor visibility, audio, duration, viewport, and encoding.

The repository includes a small SanoX Care fixture so you can run the complete pipeline without another application.

## Requirements

- Node.js 22 or newer
- FFmpeg and `ffprobe` on `PATH`
- Chromium installed through Playwright

On macOS, FFmpeg can be installed with `brew install ffmpeg`.

## Quick start (no API key)

```bash
git clone https://github.com/mehdibourahla/product-demo.git
cd product-demo
npm ci
npm run install:browsers
npm run product-demo -- run patient-to-physician \
  --device desktop \
  --narration captions
```

This starts the included fixture, rehearses it twice, records the journey, renders the MP4, and writes a quality report. Outputs are created under:

```text
artifacts/patient-to-physician/desktop/
├── rehearsal/execution-report.json
├── recording/raw.webm
├── recording/timeline.json
├── render/patient-to-physician-desktop.mp4
└── quality-report.json
```

Try the mobile layout by changing `--device desktop` to `--device mobile`.

## Add ElevenLabs voiceover

Keep the API key in your environment—never put it in YAML or commit it:

```bash
export ELEVENLABS_API_KEY='your-api-key'
npm run product-demo -- run patient-to-physician \
  --device desktop \
  --narration voiceover
```

The included configuration selects ElevenLabs' multilingual model and a sample voice ID. Change `narration.elevenlabs.voiceId` in `product-demo.config.yaml` to use another voice. Audio is cached by provider, voice, model, format, locale, and text under `artifacts/.narration-cache`, so identical reruns do not consume credits again.

Only scene narration text is sent to ElevenLabs. Source code, screenshots, traces, and video remain local.

## Use it with your app

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
  syntheticData: true
  allowProduction: false
runtime:
  rehearsalPasses: 2
  headless: true
narration:
  provider: none
upload:
  enabled: false
```

Then discover the application and create a scenario:

```bash
npm run product-demo -- discover
npm run product-demo -- plan --mode full \
  --audience customer \
  --duration 2m \
  --narration captions
```

Review the generated YAML before recording. Targets use durable semantic locators (`role`, `label`, `testId`, or `text`), and the agent can set exact timing per action:

```yaml
- title: Submit the intake
  type: click
  target:
    by: role
    role: button
    value: Submit
  timing:
    cursorDurationMs: 550
    settleBeforeMs: 200
    pauseAfterMs: 1400
```

The final recording follows those values exactly. If the scenario changes, its rehearsal receipt becomes invalid and it must be rehearsed again.

## Commands

| Command | Purpose |
| --- | --- |
| `discover` | Build an evidence-backed product model |
| `plan --mode full` | Generate a scenario and coverage report |
| `rehearse <scenario>` | Require two consecutive deterministic passes |
| `record <scenario>` | Capture a scenario with a valid rehearsal receipt |
| `render <scenario>` | Compose and normalize an MP4 |
| `evaluate <scenario>` | Produce the quality report |
| `run <scenario>` | Rehearse, record, render, and evaluate in one command |

Run `npm run product-demo -- help` for all options.

## Install as an Agent Skill

The portable skill is in `skills/product-demo`. Symlink it into any supported skill directory:

```bash
# Cross-agent installation
mkdir -p ~/.agents/skills
ln -s "$PWD/skills/product-demo" ~/.agents/skills/product-demo

# Or install for Codex only
mkdir -p ~/.codex/skills
ln -s "$PWD/skills/product-demo" ~/.codex/skills/product-demo

# Or install for Claude Code only
mkdir -p ~/.claude/skills
ln -s "$PWD/skills/product-demo" ~/.claude/skills/product-demo
```

Build the runtime with `npm run build`. When the skill and runtime checkout are in different locations, set `PRODUCT_DEMO_CLI` to the absolute path of `dist/src/cli.js`.

## Safety and reproducibility

- Production-looking hosts are refused unless `allowProduction` is explicitly enabled.
- Synthetic data is the default, and reset/seed commands run before every pass.
- Common secret and personal-data patterns are scanned before a demo passes evaluation.
- Raw recordings are preserved if rendering fails.
- Uploading is disabled; nothing is published automatically.
- LLM reasoning is allowed while planning and repairing, never during the final take.

## Development

```bash
npm run typecheck
npm test
npm run build
npm run schemas
```

For contracts and internals, see [the architecture](docs/architecture.md) and [skill references](skills/product-demo/references/contracts.md).

## License

MIT
