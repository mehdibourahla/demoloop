# Product Requirements — Demo Studio

Working name for the hosted product built on the `product-demo` runtime. Draft 1, 2026-08-04.

## 1. The problem

Every software team needs product videos — launch, sales, onboarding, docs, investor updates — and almost nobody has them. The ones that exist are stale within a release or two.

The three existing options all fail:

- **Record it yourself.** Thirty to ninety minutes per take, redone after every UI change. The reason demos rot.
- **Hire an agency.** Expensive, slow, and they need a walkthrough before they can start.
- **Generate it with AI.** Fast and plausible, and it shows a product that does not exist. Fabricated UI in a sales asset is a liability, not a shortcut.

There is no option that produces a video of **the real product, actually working**, cheaply enough to redo on every release.

## 2. What we are building

Connect a repository and a URL. An agent reads the codebase, explores the running application, and comes back with a map of what the product does and a ranked list of demos worth making. You pick one, review a storyboard built from real screenshots of your own app, adjust it in chat, and approve. We drive a real browser through the real product and produce a narrated, subtitled video with a receipt proving what it recorded.

**Every frame is the real product.** Nothing is generated, mocked, or imagined. That is the entire premise, and it is what the underlying runtime already enforces.

### 2.1 Where this sits

| | What it produces | Real product? | Effort per release |
|---|---|---|---|
| Loom / manual screen capture | Video | Yes | Full re-record |
| Arcade, Supademo | Clickable HTML walkthrough | Screenshots of it | Re-capture each step |
| AI video generators | Video | **No** — synthesised UI | Re-prompt |
| **Demo Studio** | Video | Yes, driven live | One click, or automatic |

Arcade is the nearest neighbour and a good product; it makes interactive walkthroughs from captured screens. We make **video of the software running**, which is what launch, sales, docs, and social actually consume — and we regenerate it from the source of truth rather than from a stale capture.

## 3. Who it is for

**Primary: the founder, PM, or DevRel lead at a technical startup.** They can connect a repository and describe what matters about their product. They will not write YAML or CSS selectors. They need a video this week, and another one after the next release.

Secondary, later: the engineer who wants demos versioned in the repo and regenerated in CI. Same engine, different surface.

Explicitly not v1: non-technical marketing users with no repository access. They cannot complete the connect step, and the reconnaissance results would need a different vocabulary.

## 4. Principles

These come from building and debugging the runtime, not from theory. Each one was learned by getting it wrong first.

**The final take is deterministic.** A model decides *what* to demonstrate. It never improvises *during* recording. The scenario is locked by digest, rehearsed twice identically, then recorded. This is why the output can be trusted, and it is the hardest thing for a competitor to retrofit.

**Nothing ships that was not watched.** Deterministic checks — encoding, viewport, dead time, static sections, cut seams — are necessary and not sufficient. A reviewing agent watches the actual rendered file before it can be marked accepted. A video that passed every mechanical check while being a pure slideshow is the specific failure this exists to prevent.

**Showing is not demonstrating.** Navigating to a page proves nothing. The product reports which capabilities were *exercised* versus merely *displayed*, and says so in the UI before the user shares the video.

**Fail loudly, never quietly degrade.** A missing element, an expired session, an unreachable app — each produces a specific, actionable message naming the scene and the target. Silence and best-effort guessing are how demos become subtly wrong.

**The user's data is theirs.** Capture runs where the user chooses. Credentials are scoped, encrypted, and never written into artifacts — including into trace and debug files, which is a real leak we found and closed.

## 5. The workflow

### 5.1 Connect

Two inputs, either or both:

- **GitHub** (App install, read-only, per-repository). Gives the code: routes, components, roles, capabilities, domain vocabulary.
- **A URL** with optional access: a login the runner performs, an uploaded storage state, or a bearer/header set. Gives the running product.

Code alone yields a map with no proof. A URL alone yields a working demo with weak naming and no idea what matters. Both together is materially better, and the UI says so rather than treating them as equivalent.

**Where the browser runs** — chosen per connection:

| Mode | When | How |
|---|---|---|
| **Cloud runner** | Publicly reachable staging or production-like URL | Zero setup. We host the browser. Two-minute path to a first video. |
| **Self-hosted runner** | `localhost`, VPN, private staging, strict data rules | `docker run demostudio/runner --token …`. Pulls jobs, captures locally, uploads artifacts. Credentials never leave their network. |

The runner is one binary with no inbound ports. Onboarding shows a live "runner connected" indicator, the way CI providers do. This mode is not optional polish: the app we validated the runtime against runs only on localhost against a local database.

### 5.2 Reconnaissance

The moment that has to feel like magic, and the moment that earns trust. Streamed live, not a spinner:

```
Reading repository …            142 files, 9 routes, 3 roles
Signing in as manager …         session established
Exploring /dashboard …          KPI panels, period filters
Exploring /contacts …           list, saved filters, kanban
Exploring /contacts/:id …       activity feed, orders, visits
Found 6 audiences · 10 capabilities · 4 journeys
```

Output is a **Product Map**: audiences, actors and their sessions, capabilities, journeys, states and transitions, proof surfaces, and safe actions — every claim carrying evidence, either a source reference or a screenshot and accessibility snapshot from the live app.

The Product Map is a durable, versioned asset, not scaffolding. It powers every future demo, drift detection, and re-cuts. It is also the thing that gets better the longer a customer stays.

Reconnaissance is free and unlimited. It is the demo of the product.

### 5.3 Choose what to make

The agent proposes demos ranked by what the evidence supports, each shown as a card:

> **Close the loop on a prospect** · 6 scenes · ~90s
> Create a prospect, log a field visit, record an order, see it land in the numbers.
> Exercises 8 capabilities · covers the core value story
> *Strongest: this is the journey the product is built around.*

> **Territory coverage** · 4 scenes · ~50s
> Map, zones, per-status filters.
> Exercises 3 capabilities · read-only

Plus **Full scope** — every capability with evidence, in one longer journey, generated as chapters so it can be cut down later.

When evidence is missing the agent says so instead of inventing: *"I can see an approvals screen but no data to demonstrate it. Seed an approval, or I'll skip it."* This is the existing `needs-authoring` result, surfaced as a conversation rather than an error.

### 5.4 Storyboard — the confirmation gate

Nothing is produced until this is approved. Because reconnaissance already visited every page, we own real screenshots and can show the demo before recording it.

Per scene: the real screenshot, the action in plain language, the narration, an estimated duration, and which capability it exercises.

```
Scene 3 · Log the field visit                              ~14s
[screenshot of the interaction dialog]
Opens the interaction form, picks Visit and Interested,
types a note, saves.
"After the visit, the rep logs what happened …"
Exercises: log-field-visit ✓ demonstrated
```

Everything is editable in chat: *"make the narration shorter"*, *"drop the map scene"*, *"add the CSV import"*, *"use a French voice"*, *"start on the pipeline instead"*. The agent edits the storyboard; the canvas updates in place.

Two honesty signals sit above the approve button:

- **Demonstrated 8 of 10 capabilities · 2 shown only** — with the two named.
- **Estimated 1 min 50 s · 12 credits**

Approving locks the scenario, records a digest, and starts production.

### 5.5 Production

Rehearse twice identically → record → render → deterministic checks → agent review. Progress is per scene with real thumbnails appearing as they complete, so the user watches the demo assemble.

Failures are specific and offer a next step:

> Scene 4 could not find **Enregistrer** — two buttons match, one in the dialog and one on the page.
> [Use the dialog one] [Show me] [Skip this scene]

Behind that message is a locator resolver that runs before any recording and reports every unresolved or ambiguous target at once. In the CLI this is a command the author runs; here it is invisible infrastructure that only speaks when it needs a human decision.

### 5.6 Review, share, iterate

A hosted player with chapters, subtitles, and downloads (MP4, SRT, and the vertical or GIF cutdowns).

Every video carries a **receipt**, optionally public:

> Recorded from `atlas@8f2c1a` against staging · 4 Aug 2026, 14:03
> 10 of 10 scenes verified · reviewed by agent · 8.4/10
> Every frame captured from the running application.

In a market filling with generated product videos, provable authenticity is a real differentiator — and we already emit the receipt internally.

The conversation stays open forever. *"Re-record now that the dashboard changed"*, *"make a 30-second cut for LinkedIn"*, *"add Arabic narration"*. Re-cuts and re-narrations reuse the existing recording and are near-instant; only re-recording needs the app again.

## 6. Interface

The layout is not invented here. Every pattern below is in production in a shipped product, checked against Mobbin rather than asserted.

### 6.1 Shell — chat left, canvas right

One continuous conversation on the left owns the whole lifecycle; the canvas on the right shows the current artifact and changes by phase. This is the settled convention for agent products — [Mistral Le Chat](https://mobbin.com/screens/76e16697-0e20-4bfc-8162-e93d6f1fc8ff), [v0](https://mobbin.com/screens/a18ebbf1-2b4a-4673-9df0-8f87fe3b827e), [Gemini Canvas](https://mobbin.com/screens/7245c1f5-8c31-4c14-979e-3ec03bc53af2), [Google AI Studio](https://mobbin.com/screens/7efb79f8-3dca-4618-b560-ea1413823008) — and it makes "change anything by asking" literal.

Two borrowings sharpen it:

- **Select-to-ask.** Le Chat lets you select text in the artifact and ask about it. Selecting a scene in the storyboard and asking *"why this screen?"* or *"shorten this"* is the same gesture, and it beats describing which scene you mean.
- **Versions live in the conversation.** v0 pins *"Version 2 · Latest · Viewing"* inline in the chat. Demo iterations are versions: v1 silent, v2 with narration, v3 shorter. Restoring is one click and the history is the transcript.

### 6.2 Reconnaissance — a structured activity stream

Not a spinner and not raw logs. [ChatGPT's activity panel](https://mobbin.com/screens/b045e2cd-4f54-424a-97f6-4c5954f0c1e1) and [AI Studio's action history](https://mobbin.com/screens/7efb79f8-3dca-4618-b560-ea1413823008) — a checkmarked list of what the agent did, in the agent's own words — are the right shape. Each line is inspectable: clicking *"Explored /contacts"* opens the screenshot and the accessibility snapshot it captured. This is where trust is won, because the user sees us actually opening their product.

### 6.3 Storyboard — the heart of the product

[Arcade](https://mobbin.com/screens/0c404e18-4813-4d29-b655-d23bba460066) is the closest existing analogue and its anatomy is right:

- **Left: a numbered vertical scene rail** with thumbnails. Reorder by drag, delete, insert. The whole demo is graspable at a glance — better than a long scrolling page.
- **Centre: the scene** — the real screenshot from reconnaissance, with the target element highlighted.
- **Right: script and voice.** The narration text, the voice picker with per-voice preview, and language. Arcade shows French selected, which is exactly our Atlas case.

From [Descript](https://mobbin.com/screens/fc728eff-a8ab-4039-b6e5-38795f3333ee), the deeper idea: **the script is the editor.** Editing narration text re-times the scene, because the runtime already paces capture to measured narration. Shorten a sentence and the scene gets shorter. That mapping is real in our engine, not a metaphor.

Above the approve button, the two honesty signals from §5.4 — demonstrated versus displayed, and estimated cost.

### 6.4 Publishing and afterlife

- **Access levels on share**, as in [Descript](https://mobbin.com/screens/42ba392a-7ed9-4897-a3f6-4d1b8cfaeee2): public, anyone with the link, or workspace-only.
- **Format selector** for cutdowns — 16:9, 9:16, GIF (v1.1) — as in [VEED](https://mobbin.com/screens/ffb1ac25-4fc4-4157-a322-6b3c42fec805), which also puts brand colours and subtitles in the project rail.
- **An Insights tab** on every published demo (v1.1). Arcade ships one; demand for "who watched, where they dropped" is established, and it is the natural home for our receipt.

### 6.5 Tone

Neutral surface, one accent colour, real product screenshots as the only visual interest — nothing competing with the customer's own UI. Dark and light. `⌘K` for everything. A library of demos with status (fresh, drifted, failed), the Product Map, connections, and brand settings.

Connecting a repository follows the standard [GitHub App install](https://mobbin.com/flows/904ad53e-7e4e-4199-8ee3-226a64cf875e): marketplace listing → choose repositories → redirect back. No custom OAuth invention.

## 7. Architecture

```
Web app ── Orchestrator API ── Job queue ──┬── Cloud runners (browser pool)
   │            │                          └── Self-hosted runners (outbound poll)
   │            ├── Recon agent      (code + runtime → Product Map)
   │            ├── Director agent   (chat → scenarios, storyboard edits)
   │            ├── Review agent     (watches the rendered file)
   │            └── Deterministic runtime  ← no model, ever
   └── Object storage (recordings, renders, screenshots, subtitles)
```

The **deterministic runtime** is today's `product-demo` core: locked scenario, rehearse-twice receipt, semantic locators with container scoping, adaptive control flow resolved by fixed rules, narration-paced capture, trimming, subtitles, and the quality gate. It runs identically in a cloud runner and a self-hosted one. Everything model-driven happens strictly before or after it.

**Agents** are separate roles with narrow contracts, not one large prompt: recon produces a map, the director produces and edits scenarios, the reviewer watches and scores. Each is independently testable and independently swappable.

### 7.1 What already exists

The engine is not speculative. It has been built and validated end to end against a real multi-tenant Next.js application (Atlas: Supabase, Google Maps, French UI, authenticated manager role), producing a 110-second narrated, subtitled demo in which the agent creates a prospect, logs a field visit, records an order, and follows that record through the pipeline, map, alerts and finance views — every deterministic check passing, verified against the database.

Working today: reconnaissance with evidence, planning to scenarios, rehearse-twice digest receipts, semantic locators with container scoping, adaptive control flow (`choose` / `repeat` / `branch`) resolved without a model, narration-paced capture, static-span trimming with an edit decision list, subtitles, loudness normalisation, privacy scanning, cut-seam checks, a contact-sheet review artifact, and a target verifier.

What the SaaS adds is not the hard part of the engine — it is orchestration, multi-tenancy, the runner fleet, and the interface. **The riskiest technical work is already behind us**, and the residual risks in §12 are the ones we hit in practice, not imagined ones.

## 8. Data model

- **Workspace** — team, billing, members
- **Connection** — repo install and/or URL, credentials (encrypted), runner binding
- **ProductMap** — versioned; capabilities, journeys, surfaces, safe actions, evidence
- **Scenario** — locked plan with digest; derived from the map, editable via chat
- **Production** — run of a scenario: receipt, artifacts, checks, agent review, EDL, subtitles
- **Video** — published output, share links, embeds, analytics
- **DemoHealth** — per demo: locator resolution status, drift, last verified commit

## 9. The data problem

A demo that actually demonstrates will create records, and it runs three times per production (two rehearsals plus the take). This is unavoidable and needs a first-class answer:

1. **Reset hook** (v1) — a command we run before each pass. Simple, works everywhere, requires the customer to write it.
2. **Ephemeral database branch** (v1.1) — for Supabase/Neon/PlanetScale, branch per production and discard. Zero customer effort where supported.
3. **Read-only mode** — demo only non-mutating capabilities. Always available, and honestly labelled as a partial demo.

The UI must never let a user produce a state-changing demo against production data without an explicit, deliberate acknowledgement.

## 10. Scope

The core loop, chat-based editing, a multi-scenario library with full-scope mode, and CI-driven regeneration are all in the near-term plan. They are not equally ready, so:

**v1.0 — the core loop**
Connect (GitHub + URL, both runner modes) · reconnaissance and Product Map · scenario proposals including full scope · storyboard confirmation · production · hosted player with subtitles and share links · continuous chat editing and re-cuts · reset hook.

**v1.1 — keeping demos alive**
GitHub App drift detection: on merge, re-resolve every demo's locators against the new build, flag what broke, offer one-click regeneration, comment on the PR. This is deliberately *after* v1.0 because it depends on locator health and the Product Map being stable in production. Shipping it early would produce false alarms, which would destroy trust in the signal.

Also v1.1: database branching, vertical and GIF cutdowns, multi-language narration, embeddable player with analytics.

**Not now:** template marketplace, editing timeline UI, live screen-share recording, mobile app.

## 11. Pricing

Reconnaissance and storyboards are free — that is the demo, and it costs us little. Charge for production minutes, which map to real cost (browser time, TTS, render, storage).

Free: 1 connection, 2 videos/month, watermarked. Team: seats plus a monthly minute allowance, no watermark, share links (embeds from v1.1). Business: self-hosted runners, SSO, drift detection in CI, private receipts.

Re-cuts and re-narrations from an existing recording are cheap and should be priced as such — it encourages the iteration loop that makes the product sticky.

## 12. Risks

**Locator fragility is the core engineering risk.** Every failure in validation was a locator problem: a currency string using a narrow no-break space, a label appearing twice, a button inside a dialog. Mitigation: verify before every production, container scoping, evidence-backed re-resolution from the map, and asking the user only when genuinely ambiguous.

**Auth and session expiry.** Long productions outlive tokens. Mitigation: per-actor preflight that reports *"the session for this actor expired"* instead of *"element not found"*, plus optional refresh hooks.

**Cost per video.** Browser minutes, TTS, and rendering are real. Mitigation: reuse recordings for re-cuts, cache narration by content hash, cap free-tier length.

**Cloud runner security.** We hold customer credentials. Mitigation: encryption, short-lived scoped tokens, self-hosted runners for anyone who wants them, and a hard guarantee that secrets never reach artifacts — a leak we found and fixed in the runtime, and must regression-test forever.

**The skim problem.** A demo can pass every mechanical check and still show nothing. Mitigation: the demonstrated-versus-displayed signal shown before sharing, plus the mandatory agent review.

## 13. Success metrics

- **Time to first accepted video** — target under 15 minutes from signup, including reconnaissance.
- **Storyboard approval rate without edits** — measures how well the agent reads a codebase.
- **Videos accepted without re-production** — measures whether the confirmation gate works.
- **Demos regenerated after a product change** — the retention engine; a customer who regenerates is a customer who stays.
- **Capability demonstration ratio** across produced videos — our own quality bar, tracked as a product metric.

## 14. Open questions

1. Do we support multi-actor demos in v1 (two roles, one story), or defer? The runtime supports it; the storyboard UI gets meaningfully harder.
2. Does the public receipt page become a growth surface ("Verified real demo") or stay private by default?
3. For full-scope demos, is one long video right, or should it always produce a chaptered master plus per-capability clips?
4. How much of the Product Map do we expose? It is the most valuable artifact we hold and arguably worth its own view — possibly its own product.
