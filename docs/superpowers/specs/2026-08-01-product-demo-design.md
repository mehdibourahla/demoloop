# Product Demo milestone design

The attached contract is the approved product brief. This milestone implements one complete local-first SanoX vertical slice and keeps all public contracts generic enough for another repository.

The recommended design is a portable skill plus a TypeScript executable. The alternatives—an MCP-first service or an agent-written Playwright script per demo—add setup or allow reasoning into the final take. Both violate the core constraint. The CLI owns validation and execution; the skill owns judgment and repair between runs.

Inputs are `product-demo.config.yaml`, a repository path, an optional running URL, and a request. Discovery emits `product-model.json`. Planning emits YAML. Rehearsal emits a receipt only after two consecutive successful executions. Recording consumes that receipt and exact scenario digest. Rendering consumes only raw media plus the timeline. Evaluation reports every failed or omitted scene.

The sample app has patient and physician roles in separate browser contexts. A patient completes a French adaptive intake; the physician opens the generated brief. State is reset through a local fixture endpoint. Both desktop and mobile profiles use the same declarative scenario with profile overrides.

Failure policy is strict: production-looking targets are rejected, seed/reset failures abort, page/console/request failures enter the report, assertions abort the scene, recording never begins without a fresh two-pass receipt, and post-production failure preserves raw media. Privacy findings fail quality evaluation.

Tests cover schemas, discovery evidence, environment refusal, timing, locator execution, rehearsal receipts, reports, and an end-to-end real-video workflow. Golden checks compare deterministic metadata and selected frame hashes with tolerance where codec output is platform-sensitive.
