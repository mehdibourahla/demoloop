# Product Requirements — Demo Studio

The complete product. Hosted service built on the `product-demo` runtime.

---

## 1. The problem

Every software team needs product video — launch, sales, onboarding, documentation, investor updates, social — and almost nobody has enough of it. What exists is stale within two releases, because the cost of remaking it is measured in human hours.

The three available options each fail differently:

- **Record it yourself.** Thirty to ninety minutes per usable take, redone from scratch after every UI change. This is why demos rot.
- **Hire an agency.** Thousands of dollars and weeks of turnaround, and they need a walkthrough before they can begin.
- **Generate it with AI.** Fast, plausible, and it shows a product that does not exist. Fabricated interface in a sales asset is a liability, not a shortcut.

Nobody offers video of **the real product, actually working**, produced cheaply enough to redo on every release. That is the gap.

## 2. The product

Connect a repository and a URL. An agent reads the codebase, explores the running application, and returns a map of what the product does plus a ranked set of demos worth making. You choose one, review a storyboard built from real screenshots of your own application, adjust anything by asking, and approve. A real browser is then driven through the real product, producing a narrated, subtitled video with a receipt proving what it recorded and from which commit.

When the product changes, the demos that broke are detected, repaired, and regenerated.

**Every frame is the real product.** Nothing is generated, mocked, or imagined. The runtime enforces this structurally rather than by policy: a model decides what to demonstrate and never touches the recording itself.

### 2.1 Where this sits

| | Output | Real product? | Cost per release |
|---|---|---|---|
| Loom, manual capture | Video | Yes | Full re-record, human |
| Arcade, Supademo | Clickable walkthrough | Screenshots of it | Re-capture each step |
| AI video generators | Video | **No** — synthesised UI | Re-prompt, still fictional |
| **Demo Studio** | Video | Yes, driven live | Automatic |

Arcade is the nearest neighbour and a good product; it builds interactive walkthroughs from captured screens. We produce **video of software running** — the format launch, sales, docs and social actually consume — regenerated from the source of truth rather than from a stale capture.

## 3. Who uses it

**The demo owner** — founder, PM, or DevRel lead at a technical company. Connects the repository, decides what story matters, approves storyboards, ships the video. Technical enough to install a GitHub App, unwilling to write YAML or CSS selectors. The product is designed for this person.

**The engineer.** Wants demos versioned alongside the code, regenerated in CI, and a broken locator to surface as a failed check rather than a surprise. Uses the API, the CLI, and the PR integration. Rarely opens the studio.

**The reviewer** — marketing, design, or a founder signing off. Creates nothing. Watches, comments on a timestamp, approves or requests changes.

**The consumer** — prospects, new users, investors. Never logs in. Watches an embedded or shared video and, where published as such, can verify it was recorded from a real commit against a real environment.

## 4. Principles

Each was learned by getting it wrong while building the engine.

**The final take is deterministic.** A model chooses what to demonstrate. It never improvises during recording. The scenario is locked by content digest, rehearsed twice identically, then recorded. Two runs of the same demo produce the same video. This makes the output trustworthy and is the hardest property to retrofit onto a generative pipeline.

**Nothing publishes that was not watched.** Mechanical checks — encoding, viewport, dead time, static sections, cut seams, privacy — are necessary and insufficient. An agent watches the actual rendered file before it can be accepted. A video that passes every mechanical check while being a slideshow is the exact failure this exists to prevent.

**Showing is not demonstrating.** Navigating to a page proves nothing. The product distinguishes capabilities *exercised* from capabilities merely *displayed*, and says so before anyone shares the result.

**Fail loudly, never quietly degrade.** A missing element, an expired session, an unreachable environment: each produces a specific message naming the scene and the target, with a proposed fix. Best-effort guessing is how demos become subtly wrong, which is worse than failing.

**The customer's credentials are theirs.** Capture runs where they choose. Secrets are scoped, encrypted, and never written into artifacts — including trace and debug output, a real leak found and closed in the engine.

**Recordings are assets, not by-products.** Every raw take is retained and re-cuttable. A thirty-second social cut, another narration language, or a re-ordered story costs seconds and touches nothing.

---

## 5. The core loop

### 5.1 Connect

Two inputs, either or both:

- **Repository** — GitHub App install, read-only, per-repository. Yields routes, components, roles, capabilities, domain vocabulary. GitLab and Bitbucket follow the same shape.
- **Environment** — a URL plus how to get in: credentials the runner uses, an uploaded storage state, or headers. Several per product: production, staging, preview, local.

Code alone produces a map with no proof. A URL alone produces a working demo with weak naming and no sense of what matters. The interface says this rather than treating them as interchangeable.

**Where the browser runs**, chosen per environment:

| Mode | For | Mechanics |
|---|---|---|
| **Cloud runner** | Publicly reachable environments | Zero setup, hosted browser pool. Minutes from signup to a first video. |
| **Self-hosted runner** | `localhost`, VPN, private staging, strict data policies | One container, outbound-only, no inbound ports. Credentials never leave the customer's network. |

The self-hosted runner is not an enterprise afterthought. The application this engine was validated against runs only on localhost against a local database — an entirely ordinary situation.

### 5.2 Reconnaissance

The moment that earns trust, streamed live as a structured activity log rather than a spinner:

```
Reading repository …            142 files · 9 routes · 3 roles
Signing in as manager …         session established
Exploring /dashboard …          KPI panels, period filters
Exploring /contacts …           list, saved filters, kanban
Exploring /contacts/:id …       activity feed, orders, visits
Found 6 audiences · 10 capabilities · 4 journeys
```

Every line is inspectable — clicking one opens the screenshot and accessibility snapshot captured at that moment. The user watches us open their actual product.

Reconnaissance is free and unlimited. It is the product's own demo.

### 5.3 Choose what to make

The agent proposes demos ranked by what the evidence supports:

> **Close the loop on a prospect** · 6 scenes · ~90s
> Create a prospect, log a field visit, record an order, watch it land in the numbers.
> Exercises 8 capabilities · the core value story

> **Territory coverage** · 4 scenes · ~50s
> Map, zones, per-status filters. Read-only.

Plus **full scope**: every capability with supporting evidence, produced as one chaptered master that can be cut into per-capability clips without re-recording.

Where evidence is missing the agent says so instead of inventing. *"There is an approvals screen but no data to demonstrate it. Seed an approval, or I'll skip it."*

**Templates** shape the ask: launch video, feature announcement, onboarding walkthrough, sales demo, documentation clip, changelog cut. Each carries a target length, tone, and structural expectation — a launch video needs a hook and a close; a docs clip needs neither.

### 5.4 Storyboard — the confirmation gate

Nothing is produced until this is approved. Because reconnaissance already visited every page, the storyboard is built from real screenshots of the customer's own product.

Per scene: the screenshot, the action in plain language, the narration, an estimated duration, and the capability it exercises.

```
Scene 3 · Log the field visit                              ~14s
[real screenshot of the interaction dialog]
Opens the interaction form, picks Visit and Interested,
types a note, saves.
"After the visit, the rep logs what happened …"
Exercises: log-field-visit ✓ demonstrated
```

Everything is editable by asking: *shorter narration*, *drop the map scene*, *add the CSV import*, *French voice*, *start on the pipeline*. The agent edits the storyboard; the canvas updates in place.

Two honesty signals sit directly above the approve button:

- **Demonstrated 8 of 10 capabilities · 2 shown only**, with the two named.
- **Estimated 1 min 50 s · 12 credits**

Approving locks the scenario against a digest and starts production.

### 5.5 Production

Rehearse twice identically, record, render, run deterministic checks, then agent review. Progress is per scene with real thumbnails appearing as each completes, so the demo visibly assembles.

Before any recording, every target in the scenario is resolved against the live environment. Ambiguity and absence are reported together, not one failure at a time:

> Scene 4 cannot resolve **Enregistrer** — two buttons match, one in the dialog and one on the page.
> [Use the dialog one] [Show me] [Skip this scene]

### 5.6 Publish and distribute

A hosted player with chapters, subtitles, and downloads. Access is public, link-only, or workspace-only.

Every video carries a **receipt**, private by default and publishable:

> Recorded from `atlas@8f2c1a` against staging · 4 Aug 2026, 14:03
> 10 of 10 scenes verified · agent-reviewed 8.4/10
> Every frame captured from the running application.

Distribution: embeddable player, direct publish to YouTube and LinkedIn, a CDN URL for documentation sites, GIF for READMEs, vertical cuts for social. All derive from the same recording.

### 5.7 Keep it alive

Where the product stops being a tool and becomes infrastructure.

On every merge or preview deployment, each demo's locators are re-resolved against the new build. Three outcomes:

- **Unaffected** — nothing to do.
- **Repairable** — the element moved or was renamed but is unambiguously identifiable from the Product Map. The agent proposes the repair; regeneration is one click, or automatic if the workspace allows it.
- **Broken** — the capability changed materially. The demo is flagged stale with the specific scene, and the owner is asked what the new story should be.

A PR comment reports which demos a change affects before it merges. A preview deployment can be demoed automatically, so a reviewer watches the feature instead of reading about it.

---

## 6. The Product Map

The map is not scaffolding for video generation. It is the most valuable thing the product holds and it has its own surface.

It records, with evidence for every claim: audiences, actors and their session requirements, capabilities and their shapes, journeys, states and transitions, relationships between actors, observable outcomes, proof surfaces, and safe demonstration actions. Source evidence points at code; runtime evidence carries a screenshot and accessibility snapshot; user evidence records who confirmed what and when.

It is versioned. Diffing two versions answers "what changed in our product between these releases" in product language rather than commit messages — useful for changelogs, release notes, onboarding, and knowing which demos to remake.

Because it is evidence-backed, it is also the repair mechanism: when a locator breaks, the map is what makes re-resolution possible without asking a human.

---

## 7. Surfaces

**Studio** — the chat-and-canvas workspace where demos are created and edited.

**Library** — every demo across every product, with status: fresh, drifted, broken, draft, in review. Filter by product, capability, language, template.

**Product Map** — the browsable, versioned model of each connected product, with evidence.

**Health** — portfolio view of demo freshness: which broke, why, what changed, one-click repair. At forty demos this is where people live.

**Assets** — raw recordings, reusable for re-cuts in any format or language without touching the application.

**Brand** — voices with preview, brand colours, caption styling, intro and outro treatments, per-product overrides.

**Settings** — team and roles, environments and runners, integrations, API keys, billing, audit log.

---

## 8. Interface

Every pattern below is in production in a shipped product, verified against Mobbin rather than asserted.

### 8.1 Shell — chat left, canvas right

One continuous conversation owns the whole lifecycle; the canvas shows the current artifact and changes by phase: reconnaissance stream → scenario cards → storyboard → production progress → player. This is the settled convention for agent products — [Mistral Le Chat](https://mobbin.com/screens/76e16697-0e20-4bfc-8162-e93d6f1fc8ff), [v0](https://mobbin.com/screens/a18ebbf1-2b4a-4673-9df0-8f87fe3b827e), [Gemini Canvas](https://mobbin.com/screens/7245c1f5-8c31-4c14-979e-3ec03bc53af2), [Google AI Studio](https://mobbin.com/screens/7efb79f8-3dca-4618-b560-ea1413823008) — and it makes "change anything by asking" literal.

Two borrowings sharpen it:

- **Select-to-ask.** Le Chat lets you select text in the artifact and ask about it. Selecting a scene and asking *"why this screen?"* is the same gesture, and beats describing which scene you mean.
- **Versions live in the conversation.** v0 pins *"Version 2 · Latest · Viewing"* inline in the chat. Demo iterations are versions — silent draft, narrated, shortened — and restoring one is a click.

### 8.2 Reconnaissance — a structured activity stream

Neither a spinner nor raw logs. [ChatGPT's activity panel](https://mobbin.com/screens/b045e2cd-4f54-424a-97f6-4c5954f0c1e1) and [AI Studio's action history](https://mobbin.com/screens/7efb79f8-3dca-4618-b560-ea1413823008) — a checkmarked list of what the agent did, in its own words, each line expandable to the evidence.

### 8.3 Storyboard

[Arcade](https://mobbin.com/screens/0c404e18-4813-4d29-b655-d23bba460066) is the closest existing analogue and its anatomy is correct:

- **Left: a numbered vertical scene rail** with thumbnails. Drag to reorder, delete, insert. The whole demo graspable at once.
- **Centre: the scene** — the real screenshot, target element highlighted.
- **Right: script and voice** — narration text, voice picker with per-voice preview, language.

From [Descript](https://mobbin.com/screens/fc728eff-a8ab-4039-b6e5-38795f3333ee), the deeper idea: **the script is the editor.** Editing narration re-times the scene, because the runtime paces capture to measured narration. Shorten a sentence and the scene shortens. In our engine that is mechanically true, not a metaphor.

### 8.4 Player, publishing, insights

Access levels on share, as in [Descript](https://mobbin.com/screens/42ba392a-7ed9-4897-a3f6-4d1b8cfaeee2): public, link, or workspace. Format selection for cutdowns as in [VEED](https://mobbin.com/screens/ffb1ac25-4fc4-4157-a322-6b3c42fec805), which also keeps brand colours and subtitles in the project rail. An insights tab per demo — views, completion, drop-off, and which embed drove them; Arcade ships one, so the demand is established.

### 8.5 Tone

Neutral surface, a single accent colour, real product screenshots as the only visual interest — nothing competing with the customer's own interface. Dark and light. `⌘K` for everything. Connecting a repository follows the standard [GitHub App install](https://mobbin.com/flows/904ad53e-7e4e-4199-8ee3-226a64cf875e): listing, choose repositories, redirect back. No invented OAuth.

---

## 9. Architecture

```
Web app ── Orchestrator API ── Job queue ──┬── Cloud runner fleet
   │            │                          └── Self-hosted runners (outbound poll)
   │            ├── Recon agent        code + runtime → Product Map
   │            ├── Director agent     chat → scenarios, storyboard edits
   │            ├── Review agent       watches the rendered file
   │            ├── Maintainer agent   drift detection, locator repair
   │            └── Deterministic runtime   ← no model, ever
   └── Object storage (recordings, renders, screenshots, subtitles, receipts)
```

The **deterministic runtime** is the existing engine: locked scenario, rehearse-twice receipt, semantic locators with container scoping, adaptive control flow resolved by fixed rules, narration-paced capture, static-span trimming with an edit decision list, subtitles, loudness normalisation, privacy scanning, and the quality gate. Identical in cloud and self-hosted runners. Everything model-driven happens strictly before or after it.

**Agents are narrow roles with explicit contracts**, not one large prompt. Each independently testable and replaceable: reconnaissance produces a map, the director produces and edits scenarios, the reviewer watches and scores, the maintainer detects drift and proposes repairs.

**Re-cuts never touch the application.** The edit decision list names source recordings and kept ranges, so a new length, format, or language is a render, not a re-record. This makes iteration cheap enough to be habitual.

### 9.1 What already exists

The engine is not speculative. It has been built and validated end to end against a real multi-tenant Next.js application — Supabase, Google Maps, French interface, authenticated manager role — producing a 110-second narrated, subtitled demo in which the agent creates a prospect, logs a field visit, records an order, and follows that record through pipeline, map, alerts and finance views. Every deterministic check passed and the resulting records were verified in the database.

Working today: reconnaissance with evidence, planning, rehearse-twice digest receipts, container-scoped semantic locators, adaptive control flow, narration-paced capture, trimming with an EDL, subtitles in three delivery modes, privacy scanning, cut-seam checks, a contact-sheet review artifact, and a pre-flight target verifier.

The service adds orchestration, multi-tenancy, the runner fleet, collaboration, and the interface. The riskiest engine work is behind us, and the risks in §14 are the ones encountered in practice.

---

## 10. Data model

- **Workspace** — team, plan, billing, audit log
- **Product** — a connected application; a workspace may hold several
- **Connection** — repository install and/or environment, encrypted credentials, runner binding
- **Environment** — production, staging, preview, local; its own credentials and data policy
- **ProductMap** — versioned; capabilities, journeys, surfaces, safe actions, evidence
- **Scenario** — digest-locked plan derived from the map, editable by chat
- **Production** — a run: receipt, artifacts, checks, agent review, EDL, subtitles
- **Recording** — raw takes, retained and reusable
- **Video** — published output, formats, languages, share links, embeds, analytics
- **DemoHealth** — per demo: locator resolution, drift, last verified commit
- **Review** — comments anchored to timestamps, approval state

---

## 11. Data and environments

A demo that genuinely demonstrates will create records, and production runs it three times — two rehearsals and the take. This needs a real answer, not a warning label.

**Reset hooks** — a command run before each pass. Universal, requires the customer to write it.

**Ephemeral database branches** — for Supabase, Neon, PlanetScale and equivalents, branch per production and discard. Zero customer effort where supported, and the correct default there.

**Read-only mode** — demonstrate only non-mutating capabilities, labelled honestly as partial.

**Seeded demo tenants** — a dedicated workspace or tenant inside the customer's own product, populated with representative data. The best outcome for recurring demos and worth guiding customers toward.

Producing a state-changing demo against a production environment requires an explicit, deliberate acknowledgement every time.

---

## 12. Collaboration and governance

**Roles.** Owner, editor, reviewer, viewer. Reviewers comment and approve but cannot produce, which matters once production consumes credits.

**Review before publish.** Comments anchored to a timestamp or a scene. Approval gates the public share link. Optional, and essential above roughly ten people.

**Audit log.** Who connected which environment, who approved which video, who published what and when.

**SSO and SCIM**, data residency selection, and self-hosted runners for teams whose security review requires that nothing leaves their network.

---

## 13. Pricing

Reconnaissance, the Product Map, and storyboards are free. They cost little to serve and they are the product's own demo. Charge for production minutes, which map directly to real cost — browser time, speech synthesis, rendering, storage — and for the seats and governance teams need.

- **Free** — one product, watermarked videos, a small monthly allowance. Enough to produce something real and share it.
- **Pro** — one product, no watermark, a working allowance of production minutes, all formats and languages, share links and embeds.
- **Team** — several products, seats, review and approval, drift detection and CI regeneration, analytics, priority runners.
- **Enterprise** — self-hosted runners, SSO and SCIM, audit log, data residency, custom retention, SLA.

Re-cuts, re-narrations and translations from an existing recording are priced far below a fresh production, because they cost far less to serve and because they drive the habit that makes the product sticky.

The anchor is straightforward: one agency-produced product video costs several thousand dollars and is obsolete within a quarter. A plan that keeps a dozen demos permanently current is a different category of purchase.

---

## 14. Risks

**Locator fragility is the core engineering risk.** Every failure encountered during validation was a locator problem: a currency string using a narrow no-break space, a label appearing twice on one page, a button inside a dialog shadowed by one behind it. Mitigation: pre-flight verification of every target, container scoping, evidence-backed re-resolution from the Product Map, and asking a human only when genuinely ambiguous.

**Session expiry.** Long productions outlive tokens. Mitigation: per-actor preflight reporting *"the session for this actor expired"* rather than *"element not found"*, plus refresh hooks.

**Cost per video.** Browser minutes, speech synthesis and rendering are real costs. Mitigation: recordings reused for every re-cut, narration cached by content hash, allowances sized to actual usage.

**Credential handling.** We hold access to customer environments. Mitigation: encryption, short-lived scoped tokens, self-hosted runners for anyone who wants them, and a permanent regression test that secrets never reach artifacts — a leak found and closed in the engine.

**Demos that show nothing.** A demo can pass every mechanical check and still be a slideshow. Mitigation: the demonstrated-versus-displayed signal shown before publishing, and mandatory agent review.

**Drift false positives.** A repair system that cries wolf is worse than none. Mitigation: distinguish repairable from broken, never auto-publish a repaired demo without the workspace opting in, and always show what changed.

---

## 15. Success metrics

- **Time to first accepted video** — target under fifteen minutes from signup, reconnaissance included.
- **Storyboards approved without edits** — measures how well the agent reads a codebase.
- **Videos accepted without re-production** — measures whether the confirmation gate works.
- **Demos regenerated after a product change** — the retention engine. A customer who regenerates is a customer who stays.
- **Share of a workspace's demos that are fresh** — the health metric customers themselves care about.
- **Capability demonstration ratio** across all produced videos — our own quality bar, tracked as a product metric.

---

## 16. Boundaries

Deliberately not this product:

- **A video editor.** No timeline scrubbing, keyframes, or transitions library. The storyboard and the script are the editing surface. Anyone needing frame-level control exports the EDL and the source recordings.
- **A screen recorder.** No human-driven capture. If a person has to perform the demo, the core promise is gone.
- **Interactive walkthroughs.** Clickable product tours are a different medium, well served by others.
- **A generic AI video tool.** No stock footage, no avatars, no synthesised interface. The product records real software, and that constraint is the point.

---

## 17. Open questions

1. **Multi-actor demos.** The runtime supports two roles in one causal story, and a handoff between them is often the most compelling thing a product does. The storyboard interface for it is materially harder.
2. **The public receipt.** Does "verified real demo" become a growth surface with its own landing page, or stay a private trust artifact?
3. **Full-scope output shape.** One long chaptered master, or always a master plus per-capability clips?
4. **The Product Map as a product.** It is the most valuable artifact we hold. Changelog generation, onboarding material, and release notes are all downstream of it. That may be a second product, or the real one.
