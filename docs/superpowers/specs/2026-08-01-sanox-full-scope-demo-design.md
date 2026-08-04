# SanoX Full-Scope Demo Design

## Goal

Produce a polished English master demo from the real SanoX QA application for a broad public audience. The video has no voice-over, uses short on-screen chapter copy, removes slow route-loading footage, and exposes no QA patient identity.

## Narrative

The master cut is a sequence of focused scenes rather than one continuous screen recording:

1. SanoX positions itself as the clinical-operations layer before the consultation.
2. The public workflow explains structured intake and clinician-in-the-loop safety.
3. The patient sees a live clinic status without needing to call the front desk.
4. The doctor opens a daily cockpit with measurable time saved and AI calibration.
5. Past appointments show urgency and specialty routing.
6. A real appointment demonstrates the triage summary, differential, coverage gaps, and suggested workup.
7. Availability remains in the same workspace.
8. Platform oversight closes on pilot ROI and model-quality monitoring.
9. The medical team audit log proves human governance of generated reports.

Empty review pages, identifiable appointment tables, and inconsistent QA profile fields are excluded.

## Capture Design

Each scene starts from an exact route and uses deterministic semantic actions. In recording mode, a leading navigation action completes before the screencast starts, so route skeletons and long network waits are not part of the raw clip. The loaded application remains the source of every captured frame.

Privacy redactions are configured by environment-variable name. The runner installs a deterministic DOM text redactor before navigation, replacing the QA patient's name with `Demo Patient` without storing the source name in scenario or config files.

The final render uses the existing SanoX green presentation frame, concise scene titles, and explanatory descriptions. `narration: captions` means no spoken audio is generated.

## Acceptance Criteria

- The MP4 uses the real SanoX frontend and backend, not `fixtures/sanox`.
- Public, patient, doctor, admin, and medical-team surfaces appear.
- No QA patient name appears in captured frames, manifests, reports, or final video.
- Leading route loads do not appear in recorded clips.
- Two deterministic rehearsals pass for the exact scenario digest.
- Recording has zero console errors, failed requests, omitted scenes, or unstable locators.
- The final MP4 is H.264/yuv420p at 1440×900, between 90 and 180 seconds, and contains no voice-over track.
- Representative frames and the entire decoded video are inspected before delivery.
