# SanoX Second-Iteration Demo Design

## Goal

Produce a polished English public master from the real SanoX application that demonstrates the causal path from patient intake to clinician action, human oversight, and operational proof.

## Constraints

- Use the real local SanoX frontend and backend, never the bundled fixture.
- Desktop 1440×900, English, 80–95 seconds.
- Explicit `silent` audio policy; the final MP4 has no audio stream.
- Use synthetic demonstration data and existing non-production accounts.
- Cut or accelerate loading states during editing.
- Use one caption system, no capture-time chapter overlays, and no action labels or click circles.
- Keep the product viewport dominant and all clinically relevant text readable.
- Do not modify SanoX product behavior, production data, deployments, or external systems.

## Narrative

1. **Hook (0–4s):** “From patient story to doctor-ready brief.”
2. **Real intake (4–28s):** A patient enters a complaint and answers representative adaptive questions in the real application.
3. **Clinical handoff (28–52s):** The doctor opens the resulting or evidence-equivalent brief. Camera focus reveals the summary, urgency, differential, evidence gaps, and suggested workup.
4. **Clinician control (52–68s):** The doctor performs a meaningful review or consultation action.
5. **Trust proof (68–79s):** The medical-team surface demonstrates human review and provenance.
6. **Operational proof (79–87s):** One concise outcome surface demonstrates time saved or quality calibration.
7. **Close (87–92s):** “Structured before the visit. Reviewed by the clinician. Accountable by design.”

## Presentation

- Opening and closing treatments last no more than four seconds each.
- No unexplained static hold exceeds 2.5 seconds.
- Cursor movement always leads attention to the next meaningful target.
- Use camera focus or smooth push-in treatments for dense clinical evidence.
- Loading, empty, pricing, availability, clinic-roster, and unrelated administrative screens are excluded from the master.
- Separate full-mode journey clips may preserve broader coverage without weakening the master.

## Acceptance

- Rehearsal passes twice for the exact scenario digest.
- Recording, render, and deterministic evaluation pass with no privacy findings.
- The MP4 is H.264/yuv420p at 1440×900 and has no audio stream.
- Watch runs on the actual absolute MP4 with balanced detail and 1024px frames.
- Every Watch frame is inspected.
- The editorial review scores at least 8/10 and returns `accept`.
- Any lower score or material timestamped defect triggers another edit/review cycle.

