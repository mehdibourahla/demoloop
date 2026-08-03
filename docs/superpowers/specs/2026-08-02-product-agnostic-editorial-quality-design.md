# Product-agnostic editorial quality design

## Objective

Version 0.2 replaces route-centric demo generation with evidence-backed editorial planning. The same pipeline must support stateful, multi-actor, read-only, operational, content, and mobile products without product-specific branches. A public video passes only when its execution is reliable, its deterministic editorial checks pass, and a post-render agent review accepts the actual MP4.

## Architecture

The system has four explicit planes:

1. **Evidence model:** discovery records audiences, actor contexts, capabilities, journeys, states, transitions, relationships, outcomes, proof surfaces, safe actions, session requirements, and asynchronous behavior. Every claim carries source, runtime, or user evidence.
2. **Editorial planning:** planning returns either a set of runnable outputs or a structured `needs-authoring` result. It never assigns an actor by position and never turns route inventory into a complete journey.
3. **Deterministic production:** the runner records a rehearsed scenario without LLM decisions. The renderer applies declared focus, caption, transition, loading, and audio policies.
4. **Quality and review:** local analysis reports technical and deterministic editorial quality separately. The Agent Skill then invokes `watch` on the final MP4 and records a chronological editorial review.

The CLI remains self-contained apart from its declared Node, browser, Remotion, and FFmpeg dependencies. Claude Video is an Agent Skill environment dependency, not an imported runtime package.

## Evidence model

All evidence uses a discriminated union:

- `source`: repository path, optional line, and detail.
- `runtime`: URL, observation time, and optional screenshot or accessibility snapshot.
- `user`: explicit confirmation, confirmation time, and detail.

Actor contexts have a discovered identifier, display name, evidence, and optional session requirements. Capability shape is one of `stateful`, `read-only`, `exploratory`, `operational`, or `content`; this classification selects valid editorial rules but never prescribes actions. Capabilities reference their outcomes, proof surfaces, safe actions, and important states.

Journeys connect capabilities through ordered steps. Each step has actor ownership whose status is `resolved` or `unresolved`. A resolved owner requires evidence. An unresolved owner remains unresolved in the product model and prevents creation of a runnable scene until an agent or user supplies evidence.

Transitions express causality between states and may cross actor contexts. Relationships make multi-actor continuity explicit. Loading and asynchronous behavior are discovered facts, not arbitrary waits.

## Planning results

Planning returns a discriminated `PlanResult`:

- `planned`: contains one or more scenarios, a capability coverage report, explicit omissions, and the evidence used for scene ownership.
- `needs-authoring`: contains known facts, unresolved actor ownership, missing runtime evidence, and scene briefs that require agent-authored semantic actions.

`full` mode produces one concise `public-master` plus separate journey or feature clips. Coverage maps every discovered capability to an output or omission. The master is not a coverage dump.

Narrative validation depends on output type:

- `public-master`: hook, context, one coherent value journey, result or proof, and close.
- `actor-journey`: one resolved actor objective through outcome.
- `feature-clip`: precondition, meaningful use, result, and proof.
- `release-demo`: runtime-confirmed changed behavior and outcome only.
- `montage`: explicitly classified, short, and subordinate to a main narrative.

Capability-aware rules accept revealed insights for read-only products, diagnostic output for operational products, and meaningful selection or discovery for content products. No interaction type is universally required.

Route-only plans, missing purposes, unresolved actors, missing results, dominant montage coverage, incompatible requested duration, and public masters without opening or close return `needs-authoring` or validation failure before recording.

## Scenario and presentation contract

Scenario version 2 adds `outputType`, `audio`, and editorial fields. Each scene declares:

- `purpose`.
- actor context and optional causal link to the preceding scene.
- maximum static hold.
- normalized region of interest.
- optional crop, pan, or zoom treatment.
- loading treatment: preserve, cut, or accelerate.
- transition weight.
- caption mode and safe area.
- opening, closing, or actor-context transition treatment where relevant.

Caption-free scenes are valid. A compact lower third may be used when it does not intersect the region of interest. Blocking chapter overlays and persistent duplicate captions are removed. The application viewport remains the dominant visual area.

Audio policy is independent of narration: `silent`, `music`, `voiceover`, or `voiceover-and-music`. Music accepts only a configured local asset plus level and fade durations. The renderer never downloads media. Policies requiring audio fail when the output lacks a usable audio stream.

All editorial fields contribute to the scenario digest, so a recording-affecting edit invalidates the rehearsal receipt.

## Deterministic visual analysis

The evaluator samples the rendered MP4 through FFmpeg into fixed-size grayscale frames. It calculates frame differences, unique-frame fingerprints, luminance mean and variance, and time spans between meaningful changes. This produces:

- visually distinct-frame ratio and kept/discarded counts.
- near-static spans and repeated unexplained static sections.
- scene-change frequency.
- black, blank, loading, or nearly empty frame findings.
- product viewport ratio.
- declared overlay/region-of-interest intersections.
- transition durations.
- audio-stream presence and measured volume.

Default distinct-frame thresholds warn below 50% and fail below 40%. An unexplained static span over three seconds warns; repeated spans fail. Threshold profiles are configurable by output type and duration.

The quality report contains `technical`, `editorial`, and `agentReview` sections plus an overall status. A technical pass cannot override an editorial failure. A public output with no agent review is `pending-agent-review` and is not accepted.

## Post-render agent review

The production environment installs `bradautomates/claude-video` globally and verifies that `watch` is discoverable. After every final render, the Agent Skill invokes `watch` with the absolute MP4 path, balanced detail by default, and `--resolution 1024` when interface text must be judged. `--no-whisper` is permitted only for intentionally silent output or a video with no audio stream. Questionable sections receive focused timestamp reruns.

The agent reads every extracted frame and writes `editorial-review.json` with score, kept/discarded frame counts, hook, continuity, repetition, readability, cursor guidance, obstruction, transitions, audio, outcome, close, timestamped defects, and verdict. Public output below 7/10 is rejected and returned to planning or editing. If `watch` was not run or transcription required by the audio policy was unavailable, the report cannot claim completion.

## Fixtures and testing

Canonical fixtures are small neutral applications covering:

- single-actor state change.
- multi-actor handoff.
- read-only analytics insight.
- developer/operations execution and diagnostics.
- mobile interaction.
- route-rich insufficient evidence.

SanoX remains optional manual regression material outside the canonical fixture and quality worldview. Its domain vocabulary does not enter generic code, schemas, thresholds, or canonical tests.

Contract and integration tests prove unresolved ownership, route-only refusal, capability-aware planning, full output bundles, receipt invalidation, audio policies, focus/overlay checks, static-video rejection, closing requirements, separate report sections, and mandatory agent-review state. End-to-end tests exercise structurally different fixtures through the same pipeline.

## Failure behavior

The system fails loudly on missing evidence, invalid ownership, missing local media, unavailable required audio, stale receipts, incomplete artifacts, and editorial review claims without evidence. Raw recordings remain preserved. No stage uploads artifacts or introduces LLM decisions during the final take.
