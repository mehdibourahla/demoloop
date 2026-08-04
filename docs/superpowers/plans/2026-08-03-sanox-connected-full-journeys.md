# SanoX Connected Full Journeys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an accepted 85–95 second SanoX demo covering connected routine-care, urgent-care, and governance journeys.

**Architecture:** Verify the real application first with refreshed role sessions and stable semantic locators. Encode only verified actions in one product-specific scenario; keep the existing product-agnostic capture and Remotion runtime unchanged unless a verified scenario requirement exposes a reusable runtime defect.

**Tech Stack:** Playwright, TypeScript, YAML, Remotion, FFmpeg, Vitest, Watch.

## Global Constraints

- Real local SanoX application only.
- Synthetic data and capture-time privacy redaction.
- Silent output with no camera scale above 1.00.
- Four chapter captions maximum.
- No commits, pushes, deployments, or database mutations beyond the existing local deterministic seed.

---

### Task 1: Verify full-journey capabilities

**Files:**
- Create: `artifacts/sanox-connected-full-journeys/runtime-verification.json`

**Interfaces:**
- Consumes: refreshed patient, doctor, and medical-team storage states.
- Produces: verified routes, visible labels, stable locators, and explicit omissions for the scenario.

- [ ] Refresh all local synthetic role sessions.
- [ ] Inspect patient intake completion and resulting outcome surfaces.
- [ ] Inspect doctor verdict, consultation-note insertion, save, critical acknowledgement, and resolution actions.
- [ ] Inspect medical-team audit row actions and report details.
- [ ] Record each usable action and omission in the runtime-verification artifact.

### Task 2: Author and validate the connected scenario

**Files:**
- Create: `scenarios/sanox-connected-full-journeys-en.yaml`
- Create: `product-demo.sanox-connected-full-journeys.yaml`

**Interfaces:**
- Consumes: verified actions from Task 1 and existing synthetic seed data.
- Produces: one version 2 public-master scenario with routine, urgent, and governance chapters.

- [ ] Encode a continuous patient journey using the real intake actions available.
- [ ] Encode a continuous doctor journey for the same routine case.
- [ ] Encode the urgent queue, critical brief, and supported acknowledgement action for one urgent case.
- [ ] Encode medical-team oversight with supported audit actions.
- [ ] Validate four chapter captions, `camera: none`, privacy policy, and requested duration.

### Task 3: Produce and repair the master

**Files:**
- Create: `artifacts/sanox-connected-full-journeys/run/`

**Interfaces:**
- Consumes: scenario and config from Task 2.
- Produces: real-app MP4, reports, Watch review, and verified temporary preview.

- [ ] Rehearse twice and repair any failed semantic action.
- [ ] Record from the fresh receipt and inspect raw clips before rendering.
- [ ] Render, evaluate, and inspect technical and privacy reports.
- [ ] Run Watch at balanced detail with readable frames, then run focused 2 fps checks around scrolling and role transitions.
- [ ] Repair and repeat until the narrative, motion, and privacy acceptance criteria pass.
- [ ] Run the full tests, typecheck, build, encoding probe, and final quality report check.
- [ ] Upload only the accepted master and verify its temporary preview returns HTTP 200.

