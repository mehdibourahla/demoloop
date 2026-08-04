# Product Demo implementation plan

1. Initialize the portable `skills/product-demo` bundle and TypeScript package. Add only runtime resources referenced by `SKILL.md`.
2. Write failing schema, safety, discovery, timing, and receipt tests. Implement Zod contracts and JSON Schema export, then make each test green.
3. Add the deterministic SanoX fixture and failing discovery/planning integration tests. Implement the local server, source evidence scanner, runtime probe, and scenario writer.
4. Add failing runner tests for semantic locators, two actors, assertions, console/request collection, and two-pass rehearsal. Implement the runner and receipt digest.
5. Add failing capture tests. Implement Playwright Screencast recording, action pointer/annotations, chapters, custom overlays, trace, screenshots, timing, and timeline output.
6. Add failing render/evaluation tests. Implement the Remotion composition, local renderer, FFmpeg normalization, privacy scan, `ffprobe` checks, and machine-readable reports.
7. Exercise the real CLI from a clean artifact directory: discover, plan, rehearse twice, record/render/evaluate desktop and mobile. Inspect frames and reports, fix defects, and rerun.
8. Validate the skill, schemas, types, unit/integration/E2E tests, package contents, and documented fresh-checkout commands.
