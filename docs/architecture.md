# Product Demo architecture

## Boundary

The Agent Skill owns evidence interpretation, story selection, presentation choices, repair, and final editorial judgment. The CLI owns schema validation, deterministic execution, capture, rendering, measurement, and report finalization. The final recording never calls an LLM.

```text
Agent: discover -> reconcile evidence -> plan story -> review scenario
                                      |
                                      v
CLI:   rehearse twice -> record -> render -> deterministic evaluation
                                      |
                                      v
Agent: Watch actual MP4 -> inspect frames/transcript -> editorial review
                                      |
                                      v
CLI:   validate review -> accept or reject
```

Claude Video is an Agent Skill environment dependency. It is deliberately absent from the generic CLI dependency graph.

## Product model

The version 2 model represents audiences, actors and session contexts, capabilities, journeys, states, transitions, relationships, outcomes, proof surfaces, safe actions, and async behavior. Each claim carries source evidence, runtime observation, or explicit user confirmation. Unknown ownership remains unresolved.

Discovery loads `app-model.json` from the repository root when present and confirms its claims against the running application; otherwise it can only scrape candidate routes from source. Authoring that file is the agent's job and the point where evidence is committed.

Discovery can identify routes as candidate proof surfaces, but planning requires a meaningful action, actor ownership, observable outcome, and evidence. Missing facts produce `needs-authoring`; there is no route-slideshow fallback.

## Planning

The planner supports public masters, actor journeys, feature clips, release demos, and intentional montages. Full mode emits a short master, reusable journey clips, coverage, and omissions.

Every scene has a purpose: hook, context, interaction, exploration, state-change, handoff, result, proof, montage, or close. Cross-actor scenes carry a causal link instead of alternating contexts by convenience.

Presentation is compiled with the scenario: region of interest, camera treatment, loading policy, transition weight, caption safe area, cursor movement, settling, typing cadence, and dwell. Any presentation or audio edit invalidates the rehearsal receipt.

## Runtime and render

The runner uses isolated Playwright contexts, semantic locators, web-first waits, and a smooth text-free cursor.

Applications whose wording or step count varies between runs are handled by deterministic control flow rather than improvisation. `choose` resolves declared intent against the options present at that moment using ordered preferences and a hard avoid list; `repeat` and `branch` bound the shape of the journey; `waitFor` settles on element state. No model runs during rehearsal or the final take: the same scenario always follows the same rules, even when it does not follow the same path. The digest therefore pins the program, and `executedPath` in the execution report records the path that actually ran. It does not add click circles, action labels, chapter cards, or capture-time brand overlays.

Rendering trims each clip before composition: with `loading: cut`, static spans longer than the scene's `maxStaticHoldMs` are cut back to that hold, so the evaluated master is the edited master. Remotion composes the approved scene controls. The product viewport occupies at least 70% of the frame; captions are optional and checked against the region of interest. FFmpeg normalizes H.264/yuv420p output. Raw WebM files are preserved.

Audio policies are explicit: silent, local music, voiceover, or voiceover plus music. ElevenLabs and macOS narration implement the same provider interface. Music must be a real local file and includes level and fades. Silent output has no audio stream.

## Quality and acceptance

Technical checks cover execution, requests, console errors, locators, encoding, viewport, duration, dead time, privacy, and audio policy. Deterministic editorial checks sample real frames and report distinct/discarded counts, static spans with timestamps, hook and close presence, product dominance, overlay obstruction, and montage balance.

These checks do not substitute for editorial judgment. Before Watch, an otherwise passing output is `pending-agent-review`. The Agent Skill runs Watch on the actual absolute MP4, reads every extracted frame and transcript when required, and writes the schema-defined review. Finalization accepts only a video whose checksum matches the review, a score of at least 7, an accept verdict, deterministic passes, and an available transcript for voiced output.

## Safety

Production-looking hosts require explicit authorization. Synthetic data and local artifacts are the defaults. Reset and seed commands run before passes when configured. Sensitive findings reject the result. Uploading is outside the runtime and requires a separate explicit user request.
