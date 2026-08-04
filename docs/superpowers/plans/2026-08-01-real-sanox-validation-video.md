# Real SanoX Validation Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produce a short English video with audible narration from the real local SanoX application.

**Architecture:** Extend the deterministic runner to honor each actor's Playwright storage state and scenario locale. Add a macOS-local narration provider backed by `say`, then capture a read-only doctor journey against `http://127.0.0.1:3005` with synthetic QA-account data.

**Tech Stack:** TypeScript, Vitest, Playwright, Remotion, FFmpeg, macOS `say`.

## Global Constraints

- Use the real SanoX frontend and backend, never `fixtures/sanox`.
- Keep credentials out of YAML, source, logs, and artifacts.
- Use only the existing QA account and read-only UI actions.
- Keep all outputs local; no commit, push, deployment, or production/staging mutation.
- Require two successful rehearsals and a passing quality report before delivery.

---

### Task 1: Authenticated actor contexts

**Files:**
- Modify: `src/runner.ts`
- Test: `tests/runner-context.test.ts`

**Interfaces:**
- Consumes: `DemoConfig`, device name, actor `storageState`, scenario locale.
- Produces: `browserContextOptions(config, device, actor, locale)` for `chromium.newContext`.

- [ ] Write a failing test proving actor storage state and English locale reach browser context options.
- [ ] Run `npx vitest run tests/runner-context.test.ts` and confirm the missing export/behavior fails.
- [ ] Implement the minimal exported options builder and use it in `runPass`.
- [ ] Re-run the focused test and `npm run typecheck`.

### Task 2: Audible local narration

**Files:**
- Modify: `src/schemas.ts`
- Modify: `src/narration.ts`
- Modify: `src/cli.ts`
- Test: `tests/narration-local.integration.test.ts`

**Interfaces:**
- Consumes: scene text, locale, configured macOS voice.
- Produces: a measured local MP3 through the existing `NarrationProvider` interface.

- [ ] Write a failing integration test requesting local narration and asserting a non-silent MP3.
- [ ] Run `npx vitest run tests/narration-local.integration.test.ts` and confirm the missing provider fails.
- [ ] Implement `MacOSNarrationProvider`, add `macos` configuration, and select it in the CLI.
- [ ] Re-run the focused test and existing narration/render tests.

### Task 3: Real SanoX scenario and capture

**Files:**
- Create: `product-demo.sanox-local.yaml`
- Create: `scenarios/sanox-real-validation-en.yaml`
- Generate: `artifacts/sanox-real-validation-en/desktop/*`

**Interfaces:**
- Consumes: local SanoX at ports 3005 and 8000 plus an untracked Playwright storage state.
- Produces: rehearsed raw clips, narrated H.264 MP4, execution report, and quality report.

- [ ] Create the QA doctor storage state without printing or storing credentials in source.
- [ ] Explore the authenticated real UI and select stable semantic locators.
- [ ] Write the English, read-only scenario with exact timing and narration.
- [ ] Rehearse twice, record, render with audible narration, and evaluate.
- [ ] Inspect representative frames and verify encoding, audio level, scene coverage, privacy findings, and working-tree scope.
