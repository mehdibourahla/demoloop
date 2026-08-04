# Product-agnostic Editorial Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace route-centric recording with a generic, evidence-backed editorial pipeline whose public videos require deterministic and agent editorial approval.

**Architecture:** Introduce version 2 product, plan, scenario, and report contracts; split discovery, planning validation, visual analysis, and agent-review finalization into focused modules. The deterministic CLI remains independent of third-party Agent Skills, while the product-demo skill invokes the installed `watch` skill after rendering.

**Tech Stack:** TypeScript 5.9, Zod 4, Playwright 1.62, Remotion 4, FFmpeg/ffprobe, Vitest 4.

## Global Constraints

- Preserve deterministic final recording, semantic locators, two-pass receipts, raw recordings, privacy scans, synthetic-data defaults, production-host protection, and local-first processing.
- Never assign actors by array position or invent ownership without evidence.
- Never turn route inventory into a complete public journey.
- Do not require state-changing interactions for read-only, operational, content, or exploratory products.
- Do not place SanoX vocabulary or behavior in generic source, canonical fixtures, tests, or thresholds.
- Do not invoke an LLM during the final take or automatically upload/download media.
- Public output below 7/10 agent review is rejected regardless of technical status.

---

### Task 1: Version 2 evidence and editorial contracts

**Files:**
- Replace: `src/schemas.ts`
- Modify: `src/receipt.ts`
- Generate: `schemas/*.schema.json`
- Test: `tests/contracts.test.ts`
- Test: `tests/receipt.test.ts`

**Interfaces:**
- Produces: `ProductModelSchema`, `PlanResultSchema`, `ScenarioSchema`, `QualityReportSchema`, `EditorialReviewSchema`, and inferred exported types.
- Consumes: no v1 compatibility aliases; all repository scenarios and callers migrate in this milestone.

- [ ] **Step 1: Write failing contract tests**

Add fixtures proving evidence discriminators, unresolved actor ownership, capability shapes, all scene purposes, presentation controls, independent audio policy, planned/needs-authoring results, split quality sections, and agent review fields.

```ts
expect(PlanResultSchema.parse({ version: 2, status: 'needs-authoring', known: [], unresolved: [], sceneBriefs: [], missingRuntimeEvidence: [] }).status).toBe('needs-authoring');
expect(() => ActorOwnershipSchema.parse({ status: 'resolved', actorId: 'operator', evidence: [] })).toThrow();
```

- [ ] **Step 2: Run the contract tests and confirm v1 rejects the new fields**

Run: `npm test -- tests/contracts.test.ts tests/receipt.test.ts`

- [ ] **Step 3: Implement focused Zod schemas**

Use a common `EvidenceSchema`; require evidence on claim-bearing model entities; make `PlanResult` discriminated by `status`; add `outputType`, `purpose`, `presentation`, and `audio` to scenarios; split report sections and model `pending-agent-review`.

- [ ] **Step 4: Prove editorial fields affect the digest**

Add a receipt test that changes only region of interest or caption mode and expects a different SHA-256 digest.

- [ ] **Step 5: Generate schemas and commit**

Run: `npm run schemas && npm test -- tests/contracts.test.ts tests/receipt.test.ts`

Commit: `Define generic editorial contracts`

### Task 2: Evidence-backed generic discovery

**Files:**
- Replace: `src/discovery.ts`
- Create: `src/evidence.ts`
- Create: `fixtures/neutral/*/app-model.json`
- Test: `tests/discovery.test.ts`

**Interfaces:**
- Produces: `discoverProduct(root, url?, outputDirectory?): Promise<ProductModel>`.
- Produces: `evidenceForClaim(...)` helpers that retain source/runtime/user provenance.
- Consumes: version 2 model contracts from Task 1.

- [ ] **Step 1: Write failing discovery tests**

Cover neutral stateful, handoff, analytics, operations, mobile, and route-only manifests. Assert discovered actor identifiers are preserved verbatim, every claim has evidence, async/session facts survive parsing, and route-only discovery has no invented actor or journey.

- [ ] **Step 2: Confirm current discovery fails through fixed role regex and invented `user`**

Run: `npm test -- tests/discovery.test.ts`

- [ ] **Step 3: Implement manifest-backed and conservative fallback discovery**

Fallback discovery may report routes, proof-surface candidates, and unresolved facts. It must not synthesize audiences, actors, capabilities, safe actions, or journeys from filenames alone.

- [ ] **Step 4: Add runtime evidence without promoting unsupported claims**

Runtime visits attach observations only to declared proof surfaces/capabilities. Readiness requires the evidence specified by the manifest, not page reachability alone.

- [ ] **Step 5: Run and commit**

Run: `npm test -- tests/discovery.test.ts && npm run typecheck`

Commit: `Make discovery evidence-backed and generic`

### Task 3: Capability-aware planning and full mode

**Files:**
- Replace: `src/planner.ts`
- Create: `src/editorial-validation.ts`
- Modify: `src/cli.ts`
- Test: `tests/planning.test.ts`
- Test: `tests/cli.test.ts`

**Interfaces:**
- Produces: `planDemo(model, options): PlanResult`.
- Produces: `validateScenarioEditorially(scenario, model): EditorialIssue[]`.
- Writes planned scenarios, `coverage-report.json`, and `omissions.json`, or one `needs-authoring.json`.

- [ ] **Step 1: Write failing semantic planning tests**

Prove no round-robin assignment, unresolved ownership remains unresolved, route-only evidence returns `needs-authoring`, stateful plans show outcome, analytics plans pass without writes, handoffs retain causal links, public masters require hook/close, montage cannot dominate, and release outputs use runtime-confirmed changes only.

- [ ] **Step 2: Confirm current planner fails the tests**

Run: `npm test -- tests/planning.test.ts`

- [ ] **Step 3: Implement scene briefs and plan refusal**

Select actions only from evidenced safe actions. Return structured missing facts when semantic actions, ownership, result, proof, or causal continuity are absent.

- [ ] **Step 4: Implement output-type narratives and full bundles**

`full` emits a concise master plus separate journey/feature clips. Coverage is capability-to-output/omission mapping, never a reason to expand the master.

- [ ] **Step 5: Integrate CLI serialization and commit**

Run: `npm test -- tests/planning.test.ts tests/cli.test.ts && npm run typecheck`

Commit: `Plan coherent demos from capability evidence`

### Task 4: Neutral canonical fixture suite

**Files:**
- Remove: `fixtures/sanox/*`
- Remove: `scenarios/patient-to-physician*`
- Create: `fixtures/neutral/server.ts`
- Create: `fixtures/neutral/{stateful,handoff,analytics,operations,mobile,route-only}/*`
- Create: `tests/fixtures.ts`
- Modify: `tests/e2e.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: isolated fixture URLs and manifests with neutral nouns only.
- Consumes: discovery/planning from Tasks 2–3.

- [ ] **Step 1: Create fixture assertions before fixture implementations**

Each fixture must prove a different product shape through the same contracts. The route-only fixture must be refused. No canonical assertion may contain healthcare or prior-customer vocabulary.

- [ ] **Step 2: Build minimal accessible HTML applications**

Use semantic labels/roles and synthetic data. Stateful and handoff fixtures expose reset endpoints; analytics exposes filter/drill-down insight; operations exposes execution/log/status; mobile uses a small viewport journey.

- [ ] **Step 3: Run discovery/planning integration tests**

Run: `npm test -- tests/discovery.test.ts tests/planning.test.ts tests/e2e.test.ts`

- [ ] **Step 4: Scan canonical source for prohibited vocabulary and commit**

Run: `rg -ni 'patient|physician|doctor|clinic|sanox|intake' src tests fixtures/neutral scenarios || true`

Commit: `Replace canonical fixture with neutral product shapes`

### Task 5: Deterministic production treatments and audio policy

**Files:**
- Modify: `src/runner.ts`
- Replace: `src/render.ts`
- Replace: `remotion/index.tsx`
- Create: `src/audio.ts`
- Test: `tests/render-presentation.integration.test.ts`
- Test: `tests/audio-policy.integration.test.ts`

**Interfaces:**
- Consumes: scene presentation and audio policy from Task 1.
- Produces: rendered MP4 plus renderer metadata describing viewport, overlays, focus, loading edits, transitions, and audio tracks.

- [ ] **Step 1: Write failing renderer tests**

Assert caption-free scenes, safe-area placement, ROI nonintersection, dominant product viewport, opening/closing treatments, actor transitions, local music mixing, fades/levels, and required audio streams.

- [ ] **Step 2: Implement scene preparation**

Cut or accelerate only declared loading spans; trim redundant terminal pauses; preserve meaningful results; move parked cursors outside the ROI.

- [ ] **Step 3: Implement Remotion focus and overlay composition**

Apply normalized crop/pan/zoom, brief nonblocking transitions, one caption mechanism at a time, and mobile-specific sizing.

- [ ] **Step 4: Implement explicit audio graph**

Map `silent`, `music`, `voiceover`, and `voiceover-and-music` to FFmpeg/Remotion inputs. Reject missing local music assets and never resolve URLs.

- [ ] **Step 5: Run and commit**

Run: `npm test -- tests/render-presentation.integration.test.ts tests/audio-policy.integration.test.ts tests/render-voiceover.integration.test.ts`

Commit: `Render focused scenes with explicit audio policy`

### Task 6: Deterministic visual and editorial evaluation

**Files:**
- Create: `src/visual-analysis.ts`
- Replace: `src/evaluate.ts`
- Test: `tests/visual-analysis.integration.test.ts`
- Test: `tests/editorial-quality.test.ts`

**Interfaces:**
- Produces: `analyzeVideo(path, options): Promise<VisualAnalysis>`.
- Produces: technical and editorial check groups plus overall status.
- Consumes: renderer metadata, timeline, scenario, execution report, and output threshold profile.

- [ ] **Step 1: Generate failing synthetic-video tests**

Create videos with FFmpeg test sources: static, varied, black/blank, missing audio, excessive transition, and obstructed ROI metadata. Assert fewer than 40% distinct frames fails, below 50% warns, repeated unexplained static spans fail, and audio policy is enforced.

- [ ] **Step 2: Implement local frame sampling**

Decode fixed-size grayscale frames through FFmpeg. Calculate consecutive mean absolute difference, compact fingerprints, luminance mean/variance, kept/discarded counts, and timestamped static spans.

- [ ] **Step 3: Implement separate report sections**

Technical checks cover execution, receipts, requests, privacy, artifacts, encoding, resolution, and audio mechanics. Editorial checks cover narrative, variation, readability, focus, obstruction, transitions, context, opening, outcome, and close.

- [ ] **Step 4: Enforce overall status and commit**

Public outputs with deterministic editorial failure are rejected; otherwise they remain `pending-agent-review` until Task 7 supplies review evidence.

Run: `npm test -- tests/visual-analysis.integration.test.ts tests/editorial-quality.test.ts && npm run typecheck`

Commit: `Separate technical and editorial quality gates`

### Task 7: Claude Video review evidence and finalization

**Files:**
- Create: `src/finalize.ts`
- Modify: `src/cli.ts`
- Modify: `skills/product-demo/SKILL.md`
- Modify: `skills/product-demo/references/installation.md`
- Modify: `skills/product-demo/references/contracts.md`
- Test: `tests/finalize.test.ts`
- Test: `tests/skill-contract.test.ts`

**Interfaces:**
- Produces: `finalizeQuality(quality, review): QualityReport`.
- Adds CLI `finalize <scenario> --review <absolute-json-path>`; it validates evidence but never invokes Agent Skills.
- Agent workflow writes `editorial-review.json` after `/watch <absolute-video-path>`.

- [ ] **Step 1: Write failing finalization tests**

Reject absent review, scores below 7, missing required fields, frame counts inconsistent with watch output, missing timestamped evidence for defects, and voiced reviews that admit transcript unavailability.

- [ ] **Step 2: Implement deterministic review validation**

An accepted review requires `watch` as tool, actual absolute video path, score at least 7, every requested category, chronological evidence, and `accept` verdict.

- [ ] **Step 3: Rewrite Agent Skill final-render workflow**

Require discoverability check, balanced detail, 1024 resolution for interface text, no-whisper only for intentionally silent/no-stream output, every-frame inspection, focused reruns, report writing, and return-to-planning on rejection. Never claim review when invocation or evidence is absent.

- [ ] **Step 4: Validate the skill and commit**

Run: skill validator, `npm test -- tests/finalize.test.ts tests/skill-contract.test.ts`, and `npm run typecheck`.

Commit: `Require watch review for public videos`

### Task 8: End-to-end output bundles and documentation

**Files:**
- Modify: `tests/e2e.test.ts`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `skills/product-demo/agents/openai.yaml`
- Regenerate: `schemas/*.schema.json`

**Interfaces:**
- Verifies all prior public interfaces together.
- Documents CLI-only operation separately from Agent Skill production review.

- [ ] **Step 1: Add cross-shape end-to-end tests**

Exercise one stateful, one read-only, one multi-actor, one operations, and one mobile planned output. Verify route-only refusal and full-mode master/clips/coverage artifacts.

- [ ] **Step 2: Update concise user and architecture documentation**

Document output types, `needs-authoring`, audio policy, report sections, watch setup, and truthful pending/rejected states. Remove v1 claims and SanoX examples.

- [ ] **Step 3: Run complete verification**

Run: `npm run typecheck`, `npm run build`, `npm run schemas`, `npm test -- --reporter=dot`, skill validation, `git diff --check`, secret scan, and prohibited-vocabulary scan.

- [ ] **Step 4: Run a real final render and watch review**

Invoke watch against the absolute MP4 with balanced detail and 1024 resolution when text is assessed. Read every extracted frame, rerun questionable ranges, write the editorial report, and finalize. If voiced transcription is unavailable, report the environment blocker instead of accepting.

- [ ] **Step 5: Lean diff review and commit**

Remove unused fields, duplicated tests, old v1 paths, and verbose prose before the milestone commit.

Commit: `Complete product-agnostic editorial quality`
