---
name: product-demo
description: Use when creating, updating, or evaluating evidence-backed product demos from a software repository and running web application, including full sweeps, feature clips, role journeys, release demos, mobile recordings, and localized videos.
---

# Product Demo

Create demos as versioned executable scenarios. Permit agent reasoning during discovery, planning, rehearsal, and repair. Never permit agent reasoning to choose actions during the final take.

## Required workflow

1. Read `references/contracts.md`. Read `references/installation.md` only when setup is incomplete. Read `references/adapters.md` only when voiceover, remote browsers, Playwright MCP, or Chrome DevTools MCP is requested.
2. Confirm the repository root, application URL, requested mode, audience, device, locale, duration, narration, and brand. Infer missing presentation options conservatively; never infer permission to access production.
3. Run `product-demo discover`. Inspect `product-model.json`. Require source evidence for every feature and runtime evidence or explicit user confirmation before setting `demoReady`.
4. Run `product-demo plan` with the requested mode. Review the YAML manifest, source evidence, scene coverage, synthetic data, and actor boundaries. Keep semantic locators only: role, label, test ID, then text. Choose presentation timing before rehearsal and lock exact values into each action's `timing` object. Optimize for comprehension rather than minimum duration: use narration length, pointer distance, action meaning, and transition weight. Typical ranges are 350–700 ms cursor travel, 140–240 ms settling, 55–80 ms per typed character, 700–1,000 ms ordinary dwell, and 1,100–1,800 ms after meaningful state changes.
5. Run `product-demo rehearse <scenario>`. On failure, use trace, ARIA snapshot, screenshot, console, request, and report evidence to repair the manifest or application. Rerun until two consecutive passes produce a receipt for the exact scenario digest.
6. Run `product-demo record <scenario>`. Do not edit the scenario, inject actions, or use an LLM while recording. Any edit invalidates the receipt and requires rehearsal again.
7. Run `product-demo render <scenario>` and `product-demo evaluate <scenario>`. Preserve raw WebM files even when rendering fails. Inspect the MP4 and report; repair and repeat if any gate fails.
8. Report output paths, omitted scenes, failures, sensitive findings, device, locale, duration, encoding, and coverage. Never describe a partial result as complete.

Use `product-demo run <scenario>` only after the manifest exists; it performs steps 5–7 without an agent-controlled final take.

## Modes

- Full sweep: plan a short master narrative plus individual journey clips and a coverage report. Do not create one long undifferentiated recording.
- Named scenario or role journey: select a discovered journey and all required actors.
- Feature: include only the feature's preconditions, action, result, and proof.
- Release diff: compare version control evidence, then demonstrate only runtime-confirmed changed behavior.

## Safety gates

- Refuse production-looking hosts by default. Require explicit `allowProduction` configuration and user authority to override.
- Prefer detected seeds, fixtures, and demo accounts. Use synthetic people and health data by default.
- Run reset and seed commands before each rehearsal and recording pass.
- Keep all files local. Never upload source, traces, screenshots, audio, or video unless the user explicitly requests a named destination.
- Fail on assertions, console errors, failed requests, stale receipts, privacy findings, missing raw media, or invalid encoding. Record omitted scenes and reasons.

## Command examples

```bash
product-demo discover
product-demo plan --mode full --audience investor --duration 5m
product-demo rehearse patient-to-physician
product-demo record patient-to-physician --device mobile --locale fr
product-demo render patient-to-physician --device mobile
product-demo evaluate patient-to-physician --device mobile
product-demo run patient-to-physician --device mobile --locale fr --narration captions
product-demo run patient-to-physician --device desktop --narration voiceover
```

For a repository checkout where the CLI is not installed globally, use `npm run product-demo -- <command>` or `node skills/product-demo/scripts/product-demo.mjs <command>`.
