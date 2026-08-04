# SanoX Full-Scope Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a smooth, privacy-safe, full-scope English SanoX master demo without voice-over.

**Architecture:** Extend the deterministic recorder with two presentation controls: preload a leading route before screencast capture, and apply environment-backed text redactions before page content renders. Build an evidence-backed multi-role scenario over the real QA runtime, then rehearse, record, render, evaluate, and visually inspect it.

**Tech Stack:** TypeScript, Vitest, Playwright, Remotion, FFmpeg, Next.js, FastAPI.

## Global Constraints

- Use the real SanoX frontend and backend; never use `fixtures/sanox`.
- Do not mutate production or staging data.
- Do not store QA credentials or patient identity in tracked files.
- Generate no voice-over audio.
- Require two successful rehearsals for the exact scenario digest.
- Keep all outputs local; no push, PR, deployment, or upload.

---

### Task 1: Evidence-backed full-scope model

**Files:**
- Create: `product-demo.sanox-discovery.yaml`
- Generate: `artifacts/sanox-full-scope-en/product-model.json`

**Interfaces:**
- Consumes: selected SanoX source pages and runtime screenshots from authenticated QA roles.
- Produces: product roles, routes, features, journeys, source evidence, and runtime evidence used to review coverage.

- [ ] Run `product-demo discover` against a curated source manifest.
- [ ] Attach observed runtime evidence and mark only inspected features demo-ready.
- [ ] Run `product-demo plan --mode full` and inspect the generated coverage before authoring the deterministic scenario.

### Task 2: Smooth scene starts

**Files:**
- Modify: `src/runner.ts`
- Test: `tests/runner-scene-phases.test.ts`

**Interfaces:**
- Consumes: scenario mode and ordered scene actions.
- Produces: a preload phase containing only the leading `goto` during recording and a captured phase containing the remaining actions.

- [ ] Write a failing test proving only record mode preloads a leading `goto`.
- [ ] Run the focused test and confirm the missing behavior fails.
- [ ] Implement the minimal action partition and use it in scene execution.
- [ ] Re-run the focused test and typecheck.

### Task 3: Environment-backed privacy redaction

**Files:**
- Modify: `src/schemas.ts`
- Modify: `src/runner.ts`
- Test: `tests/runner-redaction.integration.test.ts`

**Interfaces:**
- Consumes: `privacy.redactions[]` entries containing `sourceEnv` and `replacement`.
- Produces: an init script that replaces matching DOM text before capture and continues redacting later DOM mutations.

- [ ] Write a failing browser integration test that renders a source term and asserts only the replacement is visible.
- [ ] Run the focused test and confirm the missing configuration or behavior fails.
- [ ] Implement schema validation, environment resolution, and the deterministic init script.
- [ ] Re-run the focused test, existing contracts tests, and typecheck.

### Task 4: Full multi-role scenario

**Files:**
- Create: `product-demo.sanox-full.yaml`
- Create: `scenarios/sanox-full-scope-en.yaml`

**Interfaces:**
- Consumes: public app plus patient, doctor, admin, and medical-team storage states.
- Produces: a 90–180 second caption-led master scenario with exact semantic locators and timing.

- [ ] Author the scene sequence from the approved design with `narration: captions`.
- [ ] Keep all patient identity out of source files and configure the redaction environment variable.
- [ ] Validate every route and semantic target against the live app.

### Task 5: Capture, edit, and verify

**Files:**
- Generate: `artifacts/sanox-full-scope-en/desktop/*`

**Interfaces:**
- Consumes: exact scenario digest, authenticated QA states, and live local SanoX runtime.
- Produces: rehearsal receipt, raw clips, trace, MP4, execution report, quality report, and contact sheet.

- [ ] Rehearse until two consecutive passes succeed.
- [ ] Record only from the valid receipt and render without a voice provider.
- [ ] Evaluate all automated quality gates.
- [ ] Inspect a contact sheet, decode the full MP4, verify there is no voice-over stream, and make one edit pass if loading or dead time remains.
