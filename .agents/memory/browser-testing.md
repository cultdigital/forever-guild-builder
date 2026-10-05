---
name: Browser testing fallback
description: Handling a runtime that documents testing subagents but does not register their kind.
---

When the testing callback reports `Unknown config kind: testing`, perform equivalent browser checks with workspace Playwright and the provided Chromium executable.

**Why:** The testing skill was available during this import, but its specialized subagent kind was not registered in the runtime. Screenshots alone cannot verify signup, edits, export, and deletion.

**How to apply:** Try the documented testing callback first when required. If it is unavailable, run browser tests through the shared proxy, clean up only test-created entries, and do not claim a testing subagent passed.