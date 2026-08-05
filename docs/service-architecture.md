# Demoloop service architecture

The end-state architecture for the hosted product. `docs/architecture.md` covers the engine;
this covers the service that wraps it. `docs/saas-prd.md` is the authority on scope.

No phases and no versioned architecture: everything here is designed to be true from the
first migration.

---

## 1. The service boundary

The line is **capture versus post-production**, not Python versus TypeScript. It follows from
what each engine entry point needs access to.

Needs the customer's environment — their app URL, repository, session state, reset and seed
commands, redaction values:

| Entry point | Why it is customer-side |
|---|---|
| `discoverProduct` | walks the repository and drives a browser at the app URL |
| `verifyTargets` | browser plus reset/seed commands in the repository root |
| `executeScenario('rehearse')` | two passes, browser contexts, stored sessions, redactions |
| `executeScenario('record')` | one pass with screencast |

Needs only artifacts and our own vendor credentials:

| Entry point | Why it is cloud-side |
|---|---|
| `planDemo` | pure function, zero I/O |
| `renderDemo` | raw clips, ffmpeg, Remotion, speech synthesis |
| `evaluateDemo` | the rendered file, timeline, ffprobe |
| `finalizeQuality` | quality report, editorial review, file digest |

Both sides run the identical `demoloop` package in Node containers. They differ only in which
subcommands they may run and which credentials they hold. Render is the heaviest stage but it
never touches the customer, so it stays in our fleet: pushing it outward would export our
speech-synthesis credentials and Remotion bundle across the trust boundary, and would make
re-cuts depend on a customer's runner being online.

Three consequences.

**Python orchestrates and never calls the engine.** `planDemo` is pure and therefore tempting
to port, but it is the Product Map to scenario compiler, which is the moat. It runs as a job on
a cloud Node worker like every other stage. The CLI and the studio therefore execute the same
code, and the Python side holds no engine logic.

**The runner's unit of work is one atomic capture job.** `canRecord` admits a recording only
against a rehearsal receipt with the matching scenario digest and enough consecutive passes. If
rehearse and record were separate jobs, that receipt would cross a trust boundary where a
self-hosted runner could forge it. Rehearse twice plus record once is one job, which is also the
three runs the data policy in §7 has to account for.

**Each side scans what it produces.** Capture scans its own artifacts, timeline and report
before anything leaves the runner; evaluation scans only the cloud-authored scenario. This is
implemented.

Two adaptations at the boundary, neither needing a schema change:

- `ExecutionReport.artifacts` is a string map of local paths. The runner uploads and rewrites
  the values to object keys; the render worker materialises them into scratch. Convention only.
- The runner never holds our speech-synthesis key. The cloud synthesises first — already
  content-digest cached and seeded — and the capture job carries only `narrationSeconds` per
  scene, which is all `executeScenario` consumes.

`DemoConfig` splits along the same line: `app`, `repository` and `privacy` are runner-only;
`editorial`, `narration` and `output` are cloud-only; `runtime` and `devices` are shared.

---

## 2. Deployables

| Deployable | Contents | Hosting |
|---|---|---|
| Studio | authenticated SPA, 26 screens, four audiences | Cloud Run, static origin behind Cloud CDN |
| Public surface | player, embeds, published receipts | separate origin, cacheable, no session |
| Backend | API, agents, orchestration, job ledger, billing hooks | Cloud Run |
| Admin | operator console | Cloud Run, internal ingress and IAP |
| Cloud workers | plan, render, evaluate, finalize | Cloud Run, pull workers |
| Cloud runner fleet | capture and verify against reachable environments | Cloud Run, Chromium image, concurrency 1 |
| Self-hosted runner | the same runner image, customer-operated | customer's network |

The studio and the public surface are split because they have different cache, auth and SEO
characteristics: a published receipt and an embedded player must render for an anonymous
visitor and be cacheable at the edge, while the studio is a session-bound application.

---

## 3. Decision register

| # | Decision | Choice |
|---|---|---|
| 1 | Service boundary | capture in the runner, post-production in our fleet (§1) |
| 2 | Schema consumption | generated Pydantic, two-stage drift gate, Node owns validity (§4) |
| 3 | Job transport | one Postgres job ledger, HTTP lease protocol for every worker (§5) |
| 4 | Tenancy | `workspace_id` on every row, enforced by Postgres RLS (§6) |
| 5 | Auth, orgs, roles | WorkOS for identity and SCIM; product roles in our database (§8) |
| 6 | Object storage | GCS, lifecycle by plan, signed URLs only (§9) |
| 7 | Metering | Stripe, credits reserved at lease time with a hard ceiling (§10) |
| 8 | Frontend | React 19, Vite, TypeScript, the handoff's own CSS (§11) |
| 9 | Admin | SQLAdmin over the existing models, plus a few operational pages (§12) |
| 10 | Observability | OpenTelemetry across both languages, Sentry for errors (§13) |
| 11 | Hosting | GCP throughout (§2, §14) |

Google ADK is adopted with the rest of the reference foundation. The agent layer — narrow
roles, tools, sessions, evals — is commodity by the standard this project sets, and it already
exists next door in the shape we need.

---

## 4. The cross-language contract

`schemas/*.schema.json` is the boundary. TypeScript owns it; Python and the frontend consume it.

**The contract is lossy, and this is the load-bearing fact.** Four Zod cross-field refinements
do not survive `z.toJSONSchema`: a scene's actor must be declared, burned subtitles cannot share
a frame with a lower-third caption, a music policy requires a music asset, and a region of
interest must fit the viewport. None appear in the generated files, structurally or otherwise.

That matters because the director agent edits scenarios by chat. A Python-authored edit that
drops an actor is schema-valid and engine-invalid, and would fail only when Node parses it —
after the job is queued and the customer's credits are committed.

The rule that follows: **generated models carry shape, Node owns validity.**

- `datamodel-code-generator` produces Pydantic v2 models into a committed `demoloop-contracts`
  package. Generated code is committed so it is reviewable in diffs.
- The frontend generates TypeScript types the same way for API envelopes, and imports engine
  types directly from the `demoloop` package where the payload is engine-shaped.
- Porting the four lost rules into Python is forbidden. Duplicated validation is exactly how
  two sides drift.
- A `demoloop validate` subcommand parses with the real Zod schema and returns the digest. The
  API calls it when a scenario is saved and when it is approved. Approval already had to call
  Node, because `scenarioDigest` is a hash over stable-key-sorted JSON that Python must not
  recompute — any difference in key order or number formatting silently invalidates every
  receipt that scenario ever produces.

**The drift gate is two-stage**, because drift has two entry points. On any pull request
touching either side: run `npm run schemas` and fail on a dirty `schemas/`, then regenerate the
Pydantic package and fail on a dirty diff. The first stage is the one that is easy to omit —
editing `src/schemas.ts` without regenerating.

Two changes to the TypeScript side make the generated Python usable: register the recursive
`ActionSchema` in the Zod registry so it emits as `Action` rather than `__schema0`, and register
`ScenarioSchema` so it is referenced rather than inlined into every schema that embeds it.

Sensitive-data patterns are not schema and cannot live in Zod. They move to a shared
configuration file both languages read, under the same drift gate, which also makes them
tunable per workspace instead of hard-coded.

---

## 5. Job transport

Every unit of work is a row in one Postgres job ledger, leased over HTTP. The same protocol
serves cloud workers and self-hosted runners.

```
POST /v1/jobs/lease        long-poll up to 30s; returns job, lease token, TTL, upload URLs
POST /v1/jobs/{id}/beat    extends the lease, reports progress, may return "abort"
POST /v1/jobs/{id}/finish  signed report and upload receipts
```

The self-hosted runner must be one container with no inbound ports, so the backend cannot dial
in. That forces a pull protocol. Plain outbound HTTPS is chosen over a message broker because a
broker would mean issuing broker credentials into the customer's network and requiring their
firewall to reach it — a much larger blast radius and a support burden — while HTTPS traverses
any corporate proxy and is trivially debuggable.

A second broker for cloud-side work would buy nothing and double the failure modes. The lease
edge has to exist for runners regardless; cloud workers use it too. Claiming is
`SELECT ... FOR UPDATE SKIP LOCKED`.

Leases are at-least-once: an expired lease requeues the job, so every job is idempotent on
`(production_id, attempt)`. Capture heartbeats every 15 seconds against a 60-second TTL, which
is also the kill switch — a workspace that runs out of credit mid-run gets `abort` on the next
beat rather than a silent overrun.

Artifacts upload directly to object storage with pre-signed URLs issued alongside the job, so
recordings never transit the API.

Trace context rides in the job payload, which is how a Node runner's spans join a Python trace.

---

## 6. Tenancy

`workspace_id` on every tenant-scoped row, enforced by Postgres row-level security. The
application sets the workspace per transaction; the database denies by default.

Application-level scoping is one forgotten filter away from a cross-tenant leak, and what leaks
here is a map derived from a customer's source code plus recordings of their private
application. RLS makes the failure mode a denied query rather than a disclosure.

There are three database roles, and the distinction is load-bearing.

| Role | Sees | Why |
|---|---|---|
| `demoloop_app` | one workspace per transaction | the application; neither superuser nor `BYPASSRLS` |
| `demoloop_dispatch` | every row of `job`, nothing else | claiming crosses workspaces by nature |
| owner | everything | migrations only |

The dispatch role holds a permissive policy on `job` alone rather than `BYPASSRLS`, which would
have exposed every tenant table to the claim path. It is refused `product` at the grant level,
not merely filtered to zero rows, and that refusal is asserted by test.

A superuser bypasses row-level security even under `FORCE`, so the application role must not be
the owner. Enforcing this is what makes the isolation real rather than decorative.

The admin console will connect as a fourth role that bypasses RLS. Every such connection is
audited and every mutation through it writes to the audit log; that is a hard requirement, not a
nicety.

---

## 7. Environments and data policy

A demo that demonstrates will write records, and production runs the scenario three times. The
run state machine owns environment provisioning; the runner receives an already-provisioned URL.

| Policy | When | Mechanics |
|---|---|---|
| Ephemeral database branch | provider supports it | branch per production, discarded after |
| Reset hook | universal fallback | command run before each pass |
| Seeded demo tenant | recurring demos | dedicated tenant inside the customer's product |
| Read-only | anything else | non-mutating capabilities only, labelled partial |

Ephemeral branching is the default where available. It does not fit the engine's precondition
model — `resetCommand` and `seedCommand` are shell strings — because a branch has a lifecycle
that outlives the three passes and must be destroyed afterwards. It is therefore an
orchestration step wrapping the capture job, not a scenario field.

State-changing production against a production-flagged environment requires an explicit
acknowledgement per run, on top of the engine's own refusal to target production-like hosts.

---

## 8. Identity and roles

WorkOS provides authentication, organisations and SCIM directory sync. It is chosen over
alternatives because SSO and SCIM are required to be designed in rather than migrated to later,
and that is precisely the category it removes. Self-hosting an identity provider would be
operating a commodity.

The backend verifies JWTs by JWKS, which drops into the `AuthProvider` seam the reference
foundation already defines — a development stub locally, real verification everywhere else,
failing closed in production-like environments.

The four product roles — owner, editor, reviewer, viewer — live in our database keyed by
workspace and user. "A reviewer may comment and approve but may not produce" is a product rule
tied to credit consumption, not an identity-provider concern.

---

## 9. Storage and retention

GCS, with objects keyed `workspace/{id}/product/{id}/production/{id}/…` and reached only
through short-lived signed URLs. Delivery is Cloud CDN over the same bucket.

Raw recordings are retained as assets, because every re-cut, re-narration and translation is a
render from them rather than a re-record. Retention runs by plan; receipts and quality reports
are retained indefinitely, being small and being the trust artifact. Screenshots live as long as
the Product Map version that cites them as evidence.

Renditions are produced by our own render pipeline rather than a hosted video platform. Encoding
is a category we already own — the engine normalises H.264 and burns or embeds subtitles today —
so buying it would duplicate the moat rather than remove a commodity.

---

## 10. Metering and billing

Stripe for subscriptions and metered usage. Reconnaissance, the Product Map and storyboards are
free; production minutes and seats are charged.

The ceiling has to bind before work happens, so credits are **reserved at lease time** against
the storyboard's estimate — the same estimate already shown above the approve button — and the
API refuses to lease when the balance net of reservations is short. Reconciling after completion
would mean billing for work we meant to refuse. Actuals replace the reservation at finish, and
an exhausted balance mid-run aborts at the next heartbeat.

---

## 11. Frontend

React 19, Vite, TypeScript, matching the reference foundation. The design handoff ships
`tokens.css` and `app.css` to be taken as-is, so those are the styling foundation rather than a
utility framework re-expressing a design system that already exists.

The canvas changes by phase — reconnaissance stream, scenario cards, storyboard, production
progress, player — which is the generative-UI pattern the reference foundation already
implements: the agent emits a surface spec, the client renders real components, and live data
updates re-render in place. Reconnaissance and production progress consume the typed SSE
contract unchanged.

The public player and receipt pages are a separate deployable, since they must render for
anonymous visitors and cache at the edge.

---

## 12. Admin

SQLAdmin over the existing SQLAlchemy models covers tenant inspection and CRUD for free. The
operational surfaces that are not CRUD — runner fleet health, credit and quota adjustment,
support tooling — are a small number of custom pages.

This is the clearest case in the product for adopting rather than designing: the 26 designed
screens are entirely customer-facing, and an internal console does not earn bespoke design.

---

## 13. Observability

OpenTelemetry in both languages, with trace context propagated through the job payload so a
capture running in a customer's network appears in the same trace as the API call that
scheduled it. Traces, metrics and logs to one OTLP backend; Sentry for exceptions, which trace
backends aggregate poorly.

The redaction guarantee is structural, not procedural. Credentials are referenced by identifier
and never by value anywhere in a job payload, and a span processor and logging filter run the
shared sensitive-data patterns over attributes and log bodies before export. The engine already
proves the same property for artifacts.

---

## 14. Hosting

GCP throughout, for one IAM and audit surface across services, workers and the runner fleet.

Render and capture need long-running containers with a real filesystem, a browser and ffmpeg, so
edge and serverless runtimes are excluded from those paths. Workers are Cloud Run services in
pull mode rather than request-driven, which also means no request timeout binds a long render.

**Capture instances run one job at a time with reserved CPU.** Determinism is the product claim,
and CPU contention changes timing between passes; a shared instance would make two runs of the
same scenario produce different videos. This is a correctness constraint, not a performance
preference.

Postgres is Cloud SQL, chosen plain because row-level security is doing the tenancy work.

The self-hosted runner ships as a published container image, configured with a workspace token
and the API URL, requiring one outbound HTTPS destination and no inbound ports.

---

## 15. Sensitive findings: severity

Capture reports findings; what happens next depends on kind.

- **Secret-kind findings abort the capture job.** Nothing uploads. A credential in a page dump
  is an incident, and the artifacts must not exist in our storage.
- **Personal-data findings surface to the owner before publish.** They do not block capture.

A blanket gate would be wrong with these patterns: the email and phone patterns match any CRM,
support tool or healthcare application — exactly the products people want to demo. Refusing to
record them would break the product in the name of protecting data the customer is deliberately
asking us to film. The judgement belongs to the owner at publish time; the incident does not.

---

## 16. What this changes in the engine

The service design forces a small number of engine changes. They are engine work, not service
work, and they belong to the TypeScript side.

| Change | Status | Why |
|---|---|---|
| Scan artifacts during capture, not evaluation | done | findings must not cross unexamined, and evaluation cannot read artifacts once they are object keys |
| Findings carry kind, source and count | done | the literal match was being copied into a customer-facing report |
| Register `Action` and `Scenario` in the Zod registry | done | generated Python is otherwise anonymous and duplicated |
| `demoloop validate` subcommand | done | the API needs one authoritative validity and digest call |
| Report capture provenance | done | the published receipt claims a commit; only the runner observes it |
| Split sensitive findings by severity | done | see below |
| Sensitive patterns move to shared configuration | deferred | it has one consumer until the Python side exists; building it now would be a config file with a single reader |

The severity split was not optional. The quality gate failed on *any* sensitive finding, so a
single visible email address rejected the video — and the email and phone patterns match every
CRM, support tool and healthcare application the product targets. Credentials now fail the
technical check; personal data becomes an editorial warning the owner confirms before
publishing. The security property is unchanged and the runner still refuses to upload a capture
that caught a credential.

Provenance records the commit, the target URL, and whether the working tree was dirty. The last
matters because a receipt claiming a demo was recorded from a given commit is false if
uncommitted changes were on disk at capture time. Absence of a commit is represented as absence,
never as a default, so a receipt can say the commit is unknown rather than assert a wrong one.
