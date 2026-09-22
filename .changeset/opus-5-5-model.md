---
"helmor": minor
---

Add Claude Opus 5.5 to the model picker.

- Opus 5.5 (`claude-opus-5-5[1m]`) joins the curated default model set and becomes the Claude fallback the app picks when Codex is unavailable. It has all five effort levels and supports fast mode.
- Opus 5 stays enabled by default beneath it, so you can still pick it when you want the older Opus.
- The bundled Claude Code CLI moves 2.1.219 -> 2.1.280 (the release that introduced Opus 5.5 support), with `@anthropic-ai/claude-agent-sdk` bumped to 0.3.280 in lockstep.
