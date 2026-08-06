# Optional adapters

## Editorial post-production (video-use)

`render` writes `edl.json` beside the master in the video-use schema: `sources` maps each scene id to its raw recording, `ranges` lists the kept source ranges with the scene `beat` and `note`, and `grade`, `subtitles`, and `overlays` start empty. Every deterministic trim decision is therefore visible and re-renderable from the originals.

When a demo needs treatment the deterministic pipeline does not provide — colour grading, burned subtitles, animated overlays, reordered beats — hand that EDL and the raw clips to [video-use](https://github.com/browser-use/video-use) (installed separately, like Watch):

```bash
python helpers/render.py <render-dir>/edl.json -o <render-dir>/final.mp4
```

Two rules make this safe:

- video-use may only cut, reorder, grade, or annotate footage that was actually recorded. It must never introduce product behaviour that no pass captured; the evidence chain is the EDL's `ranges` pointing at real sources.
- Its output is not accepted by inheritance. Re-run `demoloop evaluate --video <edited.mp4>`, run Watch against that file, and `finalize --video <edited.mp4>`. Acceptance binds to the checksum of the file that was reviewed, so the edited master must earn its own verdict.

- Playwright MCP: use for agent-led semantic exploration and screenshots. Convert findings to stable role, label, test-ID, or text locators before rehearsal; never compile ephemeral MCP refs.
- Chrome DevTools MCP: use for deeper console, network, runtime, performance, accessibility, or Lighthouse investigation. It is evidence collection, not a final-take dependency.
- Narration: the built-in ElevenLabs provider uses `ELEVENLABS_API_KEY`, a configured voice ID, measured MP3 durations, and a content-addressed local cache. It sends `voice_settings`, a fixed `seed`, and the neighbouring scenes' lines as `previous_text`/`next_text` so delivery stays continuous across scenes; all of those participate in the cache key. The `macos` provider is for offline development only — its delivery is robotic and is not representative. Other providers can implement `NarrationProvider` from `src/adapters.ts`. Providers must return a local audio path and measured duration. Never silently send scripts or application data to a provider.

Voiceover fails loudly when the ElevenLabs provider, API key, or voice ID is missing.
