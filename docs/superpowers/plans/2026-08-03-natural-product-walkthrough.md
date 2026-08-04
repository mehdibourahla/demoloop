# Natural Product Walkthrough Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the over-cropped, editor-led SanoX cut with a four-chapter, wide-framed, naturally scrolling walkthrough.

**Architecture:** Keep product-specific storytelling in a new scenario manifest. Improve scrolling once in the product-agnostic runner through a pure eased-step helper used by Playwright recording. Keep Remotion framing static and full-width.

**Tech Stack:** TypeScript, Vitest, Playwright, Remotion, FFmpeg, YAML, Watch.

## Global Constraints

- Real local SanoX application only.
- Silent output with no voice-over.
- Four scenes, two captions, and scale between 1.00 and 1.03.
- No animated camera movement.
- No commits, pushes, or deployments.

---

### Task 1: Deterministic eased scrolling

**Files:**
- Modify: `src/timing.ts`
- Modify: `src/runner.ts`
- Test: `tests/timing.test.ts`

**Interfaces:**
- Produces: `scrollMotion(deltaY: number, durationMs?: number, frameMs?: number): Array<{ deltaY: number; waitAfterMs: number }>`
- Consumes: `executeAction()` human recording branch.

- [ ] Write a failing test asserting that scroll increments sum to the requested distance, start and end smaller than the middle increments, and use at least twelve samples.
- [ ] Run `npm test -- tests/scroll-motion.test.ts` and confirm failure because `scrollMotion` is missing.
- [ ] Implement cubic ease-in-out cumulative positions, convert them to per-step deltas, and clamp duration to 420–900 ms.
- [ ] Replace the five fixed wheel jumps with the generated increments.
- [ ] Re-run the focused test and runner tests.

### Task 2: Four-chapter SanoX scenario

**Files:**
- Create: `scenarios/sanox-natural-walkthrough-en.yaml`

**Interfaces:**
- Consumes: existing patient, doctor, and medical-team storage states and seeded synthetic records.
- Produces: a version 2 public-master scenario with four deterministic scenes.

- [ ] Combine intake entry and contract reveal into one patient scene.
- [ ] Combine brief, unresolved evidence, verdict, context, differential, and workup into one doctor scene with natural sequential scrolls.
- [ ] Combine urgency queue and critical brief into one doctor scene using a click instead of a route jump when a stable locator exists; otherwise retain one preloaded route and one continuous captured surface.
- [ ] Keep audit review as the closing scene.
- [ ] Set every camera to `none`; enable lower-third captions only for the first and last scenes.
- [ ] Validate the scenario contract and requested duration.

### Task 3: Real-app production and review

**Files:**
- Create: `artifacts/sanox-natural-walkthrough-en/`

**Interfaces:**
- Consumes: scenario from Task 2 and refreshed local auth states.
- Produces: accepted H.264 MP4, execution report, quality report, Watch review, and temporary preview URL.

- [ ] Refresh local synthetic auth states and set the known-name redaction value.
- [ ] Rehearse twice, record from the fresh receipt, render, and evaluate.
- [ ] Run the complete test suite, typecheck, and build.
- [ ] Run Watch at balanced detail with 1024px frames and inspect every selected frame.
- [ ] Re-run focused motion checks around every scroll and actor transition.
- [ ] Repair and repeat until the video meets all acceptance criteria.
- [ ] Upload only the accepted master and verify the temporary link returns HTTP 200.
