---
"helmor": minor
---

Slim Helmor down to the tools we actually use and make it noticeably faster:
- Remove the OpenCode, Cursor, and Kimi agent integrations and their bundled binaries, cutting the installed app by roughly 60%.
- Remove GitLab support, the upstream feedback button, the agent proxy setting, the auto-updater, Windows support, and the Chinese translation — this fork is macOS-only, GitHub-only, and English-only.
- Make streaming replies smoother by batching engine updates and cutting redundant re-renders, disk writes, and refetch storms during live sessions.
- Load the settings screen, onboarding, and file icons on demand for a faster start.
- Speed up the development loop with incremental Rust builds, a leaner library target, faster test runners, and parallel checks.
