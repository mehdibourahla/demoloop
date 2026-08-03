# Installation

## Runtime

```bash
npm install
npm run install:browsers
npm run build
```

FFmpeg and `ffprobe` must be on `PATH`. Run `npm run product-demo -- help` from the checkout or link the package with `npm link` to expose `product-demo`.

The generic CLI has no dependency on globally installed third-party Agent Skills.

## Agent production environment

Install Claude Video and verify that `watch` is discoverable before declaring the Agent Skill setup complete:

```bash
npx skills add bradautomates/claude-video -g
npx skills list -g
```

The list must include `watch` for the active agent runtime. Configure a transcription provider for voiced reviews. This dependency belongs to the agent production environment, not the CLI runtime.

## Codex

Symlink or copy `skills/product-demo` into `.codex/skills/product-demo`, `~/.codex/skills/product-demo`, or the cross-runtime `.agents/skills/product-demo` directory. Keep the runtime checkout available and set `PRODUCT_DEMO_CLI` to its built `dist/src/cli.js` when using a copied skill.

## Claude Code

Symlink or copy `skills/product-demo` into `.claude/skills/product-demo`, `~/.claude/skills/product-demo`, or `.agents/skills/product-demo`. Invoke it as `$product-demo` and run the same local CLI.

No MCP server, paid service, remote browser, or narration provider is required for intentionally silent demos.

## ElevenLabs voiceover

Keep the API key out of YAML and source control:

```bash
export ELEVENLABS_API_KEY='...'
```

Set `narration.provider` to `elevenlabs`, add `narration.elevenlabs.voiceId`, and set the scenario audio policy to `voiceover` or `voiceover-and-music`. The runtime sends only scene narration text, stores generated MP3 files locally, and caches by voice, model, format, locale, and text.
