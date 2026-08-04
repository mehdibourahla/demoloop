# Optional adapters

- Playwright MCP: use for agent-led semantic exploration and screenshots. Convert findings to stable role, label, test-ID, or text locators before rehearsal; never compile ephemeral MCP refs.
- Chrome DevTools MCP: use for deeper console, network, runtime, performance, accessibility, or Lighthouse investigation. It is evidence collection, not a final-take dependency.
- Narration: the built-in ElevenLabs provider uses `ELEVENLABS_API_KEY`, a configured voice ID, measured MP3 durations, and a content-addressed local cache. Other providers can implement `NarrationProvider` from `src/adapters.ts`. Providers must return a local audio path and measured duration. Never silently send scripts or application data to a provider.

Voiceover fails loudly when the ElevenLabs provider, API key, or voice ID is missing.
