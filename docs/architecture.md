# Product Demo architecture

## Goal

`product-demo` turns a repository, a running web application, and a demo request into versioned evidence, a rehearsed executable scenario, raw browser capture, polished MP4s, and machine-readable reports. The final take never calls an LLM.

## Evidence reviewed (2026-08-01)

- [Codex developer documentation](https://developers.openai.com/) treats skills as portable instruction bundles and plugins as a later container for skills, MCP servers, and UI. The first release therefore ships a standards-shaped `SKILL.md` plus local CLI, with no plugin dependency.
- [Anthropic Claude Code documentation](https://docs.anthropic.com/en/docs/claude-code/) and the cross-runtime [Agent Skills specification](https://agentskills.io/specification) support directory-based skills. Installation uses a copy or symlink into `.claude/skills`, `.codex/skills`, or `.agents/skills`.
- [Playwright Screencast](https://playwright.dev/docs/api/class-screencast) provides explicit start/stop capture and frame callbacks. This project pins 1.62.1 and injects its own text-free SVG cursor so the final video never shows action labels or click circles.
- [Playwright devices](https://playwright.dev/docs/emulation), [ARIA snapshots](https://playwright.dev/docs/api/class-locator#locator-aria-snapshot), [tracing](https://playwright.dev/docs/trace-viewer), screenshots, semantic locators, and web-first assertions cover deterministic execution and evidence collection. Playwright MCP is useful during agent exploration, but its ephemeral element refs are not compiled into final scripts.
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) exposes console, network, runtime, performance, and Lighthouse evidence for optional exploration. Direct Playwright event listeners remain the local-first baseline.
- [Remotion](https://www.remotion.dev/docs/) renders parameterized React compositions locally. Its official [Agent Skill](https://github.com/remotion-dev/skills) recommends frame checks, parameter schemas, deterministic timing, and FFmpeg for media-specific inspection. This project pins Remotion 4.0.503.
- [FFmpeg](https://ffmpeg.org/ffmpeg.html) and `ffprobe` provide local H.264/AAC normalization and encoding facts without uploading application data.
- [demo-machine](https://github.com/45ck/demo-machine) validates the demo-as-code shape: YAML specs, structured targets, capture timelines, raw preservation, per-run outputs, and quality gates. We reuse ideas, not its implementation.
- [ProductVideoCreator](https://github.com/MatrixReligio/ProductVideoCreator) and [claude-code-video-toolkit](https://github.com/digitalsamba/claude-code-video-toolkit) demonstrate Playwright/Remotion composition, brand profiles, and optional narration. Their agent-driven production flows do not satisfy this project's final-take determinism by themselves.
- [Rhetor](https://arxiv.org/abs/2606.30294) motivates source/runtime reconciliation, semantic locator repair, repeated rehearsal, and explicit degradation. This project diverges by compiling the converged scenario and forbidding live narration/action improvisation during capture.

## Architecture

```text
Agent skill (reasoning allowed)
  discover repository -> explore runtime -> reconcile evidence -> plan scenario
                                      |
                                      v
                         versioned scenario YAML
                                      |
                           validate + compile
                                      v
Deterministic runtime (no LLM)
  reset/seed -> rehearse x2 -> capture -> timeline -> Remotion -> FFmpeg -> evaluate
```

### Agent plane

The skill interprets the request, selects audience and scope, inspects code, optionally uses Playwright MCP or Chrome DevTools MCP, and invokes CLI commands. It may repair a source scenario after a failed rehearsal. It cannot inject commands into an active final capture.

### Deterministic plane

The CLI validates configuration and scenario manifests with Zod, resolves only declared locator strategies, runs declared seed/reset commands, and executes actions in order. A compiled scenario records its source digest. Recording refuses a missing or stale two-pass rehearsal receipt.

### Core modules

- `discovery`: scans routes, screens, components, tests, fixtures, auth, localization, flags, schemas, and assets; attaches source path/line evidence; optionally captures reachable runtime evidence.
- `planner`: converts a discovered journey or the SanoX fixture into a versioned scenario. Full mode emits a master plan, journey list, and coverage report.
- `runner`: owns contexts, actors, semantic locators, assertions, console/network evidence, privacy refusal, timing, screenshots, traces, and timeline events.
- `recorder`: captures a custom animated cursor with no action labels or click markers and preserves `raw.webm` before post-production.
- `renderer`: a parameterized Remotion composition adds brand framing, titles, captions/callouts, and renders MP4; FFmpeg normalizes pixel format and fast-start metadata.
- `evaluator`: combines run evidence, timeline heuristics, privacy scans, and `ffprobe` facts. Failures and omitted scenes remain explicit.

## Data contracts

JSON Schemas live in `schemas/`; TypeScript schemas live in `src/schemas.ts`. Product features contain both static evidence and runtime evidence. Scenarios contain preconditions, actors, scenes, actions, assertions, annotations, narration, and timing. Timeline entries include monotonic timestamps, labels, locator data, bounding boxes, and state. Reports are JSON and validate against their schemas.

## Safety and privacy

- URLs whose host or configuration identifies production are refused unless the explicit `allowProduction` escape hatch is set.
- Synthetic fixture data is the default. Reset and seed commands are explicit and fail loudly.
- Environment values and produced text artifacts are scanned for common secret, email, phone, and health-identifier patterns. Findings fail the quality gate; nothing uploads automatically.
- Capture and post-production are separate. A render failure cannot delete the raw recording.

## Deliberate milestone limits

- Narration is optional. Silent and captioned demos require no provider; voiceover uses the built-in ElevenLabs adapter with measured audio duration and content-addressed local caching.
- Agent exploration adapters are documented integration points; the vertical slice uses direct Playwright so fresh checkouts need no MCP server.
- Generic discovery is evidence-oriented, not a universal static analyzer. Unknown frameworks remain candidates until runtime-confirmed or user-confirmed.

## Acceptance criteria

A fresh checkout must install pinned dependencies, install Playwright Chromium, start the SanoX fixture, discover source and runtime evidence, generate its scenario, pass two consecutive rehearsals, capture a visible text-free cursor without click markers, render desktop and mobile H.264 MP4s, retain raw WebM files, and emit schema-valid execution and quality reports with no skipped failure.
