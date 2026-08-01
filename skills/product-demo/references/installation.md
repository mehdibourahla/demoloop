# Installation

## Runtime

```bash
npm install
npm run install:browsers
npm run build
```

FFmpeg and `ffprobe` must be on `PATH`. Run `npm run product-demo -- help` from the checkout or link the package with `npm link` to expose `product-demo`.

## Codex

Symlink or copy `skills/product-demo` into `.codex/skills/product-demo`, `~/.codex/skills/product-demo`, or the cross-runtime `.agents/skills/product-demo` directory. Keep the runtime checkout available and set `PRODUCT_DEMO_CLI` to its built `dist/src/cli.js` when using a copied skill.

## Claude Code

Symlink or copy `skills/product-demo` into `.claude/skills/product-demo`, `~/.claude/skills/product-demo`, or `.agents/skills/product-demo`. Invoke it as `$product-demo` and run the same local CLI.

No MCP server, API key, paid service, remote browser, or narration provider is required for silent or captioned demos.

## ElevenLabs voiceover

Keep the API key out of YAML and source control:

```bash
export ELEVENLABS_API_KEY='...'
```

Set `narration.provider` to `elevenlabs`, add `narration.elevenlabs.voiceId`, and run with `--narration voiceover`. The runtime sends only the scene narration text to ElevenLabs, stores generated MP3 files in the artifact tree, and caches them by voice, model, format, locale, and text so repeat renders do not spend credits again.
