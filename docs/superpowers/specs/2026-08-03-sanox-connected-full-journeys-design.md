# SanoX Connected Full Journeys Design

## Goal

Produce an English public demo that proves three connected SanoX journeys: routine care, urgent care, and clinical governance.

## Central Promise

A patient tells their story once. SanoX prepares the consultation, helps the doctor act, prioritizes emergencies, and preserves human accountability.

## Journeys

### Routine care

The same synthetic headache case moves from patient intake to the doctor workspace. The patient enters the complaint and completes the intake. The doctor opens the resulting case, reviews the brief, unresolved evidence and clinical context, examines the differential and advisory workup, records a clinical verdict, uses the consultation-note workflow, and saves only if the real application exposes a safe deterministic save path.

### Urgent care

The same synthetic chest-pain case moves from an urgent intake or walk-in proof surface to the doctor queue. The queue visibly prioritizes the case, the doctor opens it from the queue, reviews red flags and immediate focus, and acknowledges or resolves it only if the real application supports that action safely.

### Governance

The medical-team audit shows both routine and urgent cases with urgency and review status. A report is opened only if a stable real action exists. No relationship is implied between unrelated records.

## Direction

- Target 85–95 seconds.
- Silent master; no voice-over.
- Browser scale remains 100%; no camera animation or cropping.
- Use four brief chapter labels only: patient, doctor, urgency, oversight.
- Keep each role on a continuous surface whenever possible.
- Use the existing deterministic eased scrolling, no more than 70% of the viewport per movement.
- Remove loading waits while preserving the action that caused each result.
- Use synthetic data and replace any configured personal name with `Demo Patient`.
- Omit any promised action that the live product cannot prove.

## Acceptance Criteria

- Routine case continuity is visible from patient input through doctor action.
- Urgent case continuity is visible from queue through critical brief and acknowledgement where supported.
- Governance shows actual urgency and review state.
- No unrelated seeded case is presented as the direct result of a captured action without an explicit transition.
- No authentication screen, loading skeleton, private name, broken frame, excessive zoom, or large mechanical scroll appears.
- Rehearsal, recording, rendering, evaluation, complete tests, typecheck, build, and Watch review pass.

