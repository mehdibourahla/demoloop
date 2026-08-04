# Natural Product Walkthrough Design

## Goal

Produce a SanoX public demo that feels like a calm live walkthrough instead of an editor-led feature montage.

## Constraints

- Capture only the real local SanoX application with synthetic demo data.
- Keep the output silent; do not add voice-over.
- Keep the browser at 100% scale by default. A fixed scale above 1.03 is not permitted.
- Do not use animated zoom, pan, or reframing.
- Use no more than four chapters and two explanatory overlays: one opening promise and one closing takeaway.
- Remove route loading from captured footage.
- Related actions on the same surface must remain in one continuous recording.
- Scrolling must use deterministic eased increments and settle on meaningful content.
- Preserve privacy redaction and Watch review before upload.

## Editorial Structure

1. **Patient intake:** enter the complaint and reveal the short intake contract in one continuous interaction.
2. **Doctor workspace:** open the prepared brief, review unresolved evidence and clinical context, then continue naturally to the differential and advisory workup.
3. **Urgent operations:** show the urgency-ordered queue and open one critical brief without an intermediate caption.
4. **Human oversight:** show the medical-team audit surface, then end on the accountability takeaway.

The application provides the visual hierarchy. Intermediate chapter captions are disabled. The opening overlay states the outcome; the closing overlay states accountability.

## Interaction Motion

Cursor travel remains deterministic but uses the existing humanized path. Scrolling replaces five equal wheel jumps with a cubic ease-in-out sequence sampled at roughly 60 Hz. Scroll duration is derived from distance and clamped to 420–900 ms. Each scene declares a deliberate post-result hold of 1.2–1.8 seconds.

## Acceptance Criteria

- Final runtime is 38–48 seconds.
- All frames use scale 1.00–1.03.
- Scenario contains exactly four scenes.
- Only the first and last scenes render explanatory captions.
- Doctor workspace motion is continuous rather than split across multiple clips.
- No loading skeleton, authentication screen, real personal name, broken caption, or abrupt large wheel jump is visible.
- Rehearsal, recording, technical evaluation, full tests, typecheck, build, and Watch review pass.

