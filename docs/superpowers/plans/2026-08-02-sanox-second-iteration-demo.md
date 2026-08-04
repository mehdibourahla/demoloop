# SanoX Second-Iteration Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce and self-approve an 80–95 second silent English public master from the real local SanoX application.

**Architecture:** The updated product-demo Agent Skill owns evidence reconciliation, story and presentation choices, then compiles a versioned scenario. The CLI rehearses, records, renders, and evaluates deterministically; Watch supplies the final frame-by-frame editorial review and `finalize` enforces acceptance.

**Tech Stack:** SanoX Next.js/FastAPI application, product-demo CLI, Playwright Screencast, Remotion, FFmpeg/ffprobe, Claude Video Watch.

## Global Constraints

- Use the real local SanoX application, never the product-demo fixture.
- English, desktop 1440×900, explicit `silent` audio policy.
- Target 80–95 seconds and Watch score at least 8/10.
- Preserve unrelated untracked files and existing authentication artifacts.
- No commit, push, deploy, production access, or product behavior changes.

---

### Task 1: Verify the production environment

**Files:**
- Read: `product-demo.sanox-full.yaml`
- Read: `skills/product-demo/references/contracts.md`
- Create: `artifacts/sanox-second-iteration-en/`

**Interfaces:**
- Consumes: local SanoX source checkout and non-production environment configuration.
- Produces: healthy frontend/backend endpoints and verified product-demo build.

- [ ] Run `npm test`, `npm run typecheck`, and `npm run build` in product-demo.
- [ ] Start the real SanoX backend and frontend using their existing local commands.
- [ ] Verify `http://127.0.0.1:8001/health/ready` and `http://localhost:3005/en`.
- [ ] Confirm existing actor storage states remain usable or refresh them through the local login flow.

### Task 2: Rediscover and author the causal master

**Files:**
- Create: `artifacts/sanox-second-iteration-en/product-model.json`
- Create: `scenarios/sanox-second-iteration-en.yaml`
- Create: full-mode coverage and journey scenarios under `artifacts/sanox-second-iteration-en/`.

**Interfaces:**
- Consumes: healthy real application, source/runtime evidence, approved design.
- Produces: schema-valid scenario with hook, interaction, handoff, clinician control, proof, and close.

- [ ] Run discovery against the real repository and application.
- [ ] Run full planning and inspect `planned` versus `needs-authoring` status.
- [ ] Author unresolved semantic actions from runtime evidence; never substitute a route slideshow.
- [ ] Set explicit scene purposes, actor contexts, causal links, presentation regions, camera treatments, loading policy, timings, and silent audio policy.
- [ ] Validate the scenario and confirm the master excludes unrelated breadth while coverage remains in journey clips.

### Task 3: Rehearse and record the real workflow

**Files:**
- Create: `artifacts/sanox-second-iteration-en/desktop/rehearsal/`
- Create: `artifacts/sanox-second-iteration-en/desktop/recording/`

**Interfaces:**
- Consumes: exact scenario digest and actor storage states.
- Produces: two-pass rehearsal receipt, raw WebMs, timeline, traces, and screenshots.

- [ ] Rehearse until two consecutive passes succeed for the exact digest.
- [ ] Repair semantic locators, actor state, timing, or evidence only between runs.
- [ ] Record the approved digest without agent decisions during capture.
- [ ] Inspect raw clips for loading, empty, or unreadable segments before rendering.

### Task 4: Render and deterministically evaluate

**Files:**
- Create: `artifacts/sanox-second-iteration-en/desktop/render/`
- Create: `artifacts/sanox-second-iteration-en/desktop/quality-report.json`

**Interfaces:**
- Consumes: recorded raw clips and presentation settings.
- Produces: final H.264 MP4 and deterministic technical/editorial report.

- [ ] Render the master with one caption system and camera treatments.
- [ ] Evaluate encoding, privacy, audio policy, frame variation, static spans, hook, close, product dominance, obstruction, and montage ratio.
- [ ] Verify the MP4 is 1440×900 H.264/yuv420p, 80–95 seconds, and has no audio stream.
- [ ] If deterministic evaluation rejects, repair the scenario or edit and repeat Tasks 3–4.

### Task 5: Watch review and finalization

**Files:**
- Create: `artifacts/sanox-second-iteration-en/watch-review/`
- Create: `artifacts/sanox-second-iteration-en/editorial-review.json`
- Create: `artifacts/sanox-second-iteration-en/final-report.json`

**Interfaces:**
- Consumes: actual absolute final MP4.
- Produces: frame-complete editorial evidence and final accept verdict.

- [ ] Run Watch at balanced detail, 1024px resolution, and `--no-whisper` because the video is intentionally silent.
- [ ] Inspect every extracted frame in chronological order.
- [ ] Score hook, continuity, product value, pacing, readability, cursor, overlays, transitions, outcome, silence, and close with timestamped defects.
- [ ] Reject and repeat the necessary production tasks when the score is below 8/10 or a material defect remains.
- [ ] Write the schema-valid editorial review and run `product-demo finalize` against the exact MP4.
- [ ] Verify the final report says accepted and hand off the absolute video path.

