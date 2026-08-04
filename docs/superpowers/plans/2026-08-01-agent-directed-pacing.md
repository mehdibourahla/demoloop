# Agent-Directed Pacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the planning agent lock natural per-action pacing into a scenario and make Playwright execute it smoothly and deterministically.

**Architecture:** Extend the action contract with optional exact timing values. Convert cursor duration into a timed curved motion schedule in `src/timing.ts`; the runner executes that schedule and action-specific dwell/typing values. The skill documents how an LLM selects values, while the runtime remains provider-independent.

**Tech Stack:** TypeScript 5.9, Zod 4, Playwright 1.62, Vitest 4, YAML.

## Global Constraints

- Preserve compatibility with manifests using legacy `pauseAfterMs`.
- Never show action labels or click circles.
- Never alter ElevenLabs playback speed.
- Keep API keys environment-only.
- Do not commit, push, or open a pull request without fresh authorization.

---

### Task 1: Timing Contract and Motion Schedule

**Files:**
- Modify: `src/schemas.ts`
- Modify: `src/timing.ts`
- Modify: `tests/timing.test.ts`
- Modify: `tests/contracts.test.ts`

**Interfaces:**
- Produces: `ActionTimingSchema` and `cursorMotion(from, to, durationMs, frameMs?)`.
- `cursorMotion` returns ordered `{ point, waitAfterMs }` entries whose waits total `durationMs`.

- [ ] Write failing tests that parse all four timing fields and assert a 600 ms motion schedule totals 600 ms with exact endpoints.
- [ ] Run `npm test -- --reporter=dot tests/timing.test.ts tests/contracts.test.ts` and confirm the new assertions fail.
- [ ] Add the optional timing object to `ActionBase` and implement `cursorMotion` using `cursorPath` with 20 ms target intervals.
- [ ] Rerun the focused tests and confirm they pass.

### Task 2: Deterministic Runner Pacing

**Files:**
- Modify: `src/runner.ts`
- Modify: `tests/runner.integration.test.ts`

**Interfaces:**
- Consumes: action `timing` and `cursorMotion`.
- Produces: recordings whose cursor movement, settling, typing, and post-action dwell match the manifest.

- [ ] Extend the integration assertion to require a recorded duration of at least 24 seconds for the paced SanoX scenario.
- [ ] Run the runner integration test and confirm it fails under the old instantaneous cursor execution.
- [ ] Execute every motion point with its wait, use `settleBeforeMs`, pass `keystrokeDelayMs` to `pressSequentially`, and resolve post-action delay as `timing.pauseAfterMs`, legacy `pauseAfterMs`, then default.
- [ ] Rerun the runner integration test and confirm it passes.

### Task 3: Agent-Selected SanoX Timing and Skill Guidance

**Files:**
- Modify: `src/planner.ts`
- Modify: `scenarios/patient-to-physician.yaml`
- Modify: `skills/product-demo/SKILL.md`
- Modify: `skills/product-demo/references/contracts.md`
- Regenerate: `schemas/*.schema.json`

**Interfaces:**
- Produces: a scenario with locked timing and agent guidance for future scenarios.

- [ ] Add exact natural timing to every SanoX action in the planner and checked-in scenario.
- [ ] Document the timing rubric and deterministic-lock requirement in the skill.
- [ ] Run `npm run schemas`, validate the skill, and confirm generated schemas expose the timing object.

### Task 4: End-to-End Voiceover Recapture

**Files:**
- Regenerate ignored artifacts under `artifacts/patient-to-physician/{desktop,mobile}`.

**Interfaces:**
- Consumes: locked scenario timing and cached ElevenLabs MP3 files.
- Produces: refreshed desktop/mobile H.264 videos with audible AAC narration.

- [ ] Rehearse the changed scenario twice to create a matching receipt.
- [ ] Record, render, and evaluate desktop and mobile outputs without making additional ElevenLabs calls when cache keys match.
- [ ] Inspect representative frames and durations; require visible outlined cursor, no labels/circles, 24–40 seconds total, and passing quality reports.
- [ ] Run `npm test -- --reporter=dot`, `npm run typecheck`, `npm run build`, skill validation, and `git diff --check`.
