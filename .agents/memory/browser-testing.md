---
name: Browser testing fallback
description: Handling a runtime that documents testing subagents but does not register their kind.
---

When the testing callback reports `Unknown config kind: testing`, perform equivalent browser checks with workspace Playwright and the provided Chromium executable.

**Why:** The testing skill was available during this import, but its specialized subagent kind was not registered in the runtime. Screenshots alone cannot verify signup, edits, export, and deletion.

**How to apply:** Try the documented testing callback first when required. If it is unavailable, run browser tests through the shared proxy, clean up only test-created entries, and do not claim a testing subagent passed.

Check session-cookie policy at the direct application boundary as well as in
the proxied development browser.

**Why:** The direct guild server issued HttpOnly, Secure, SameSite=Lax cookies,
but the shared development preview presented the same session as SameSite=None.
The proxy observation alone incorrectly suggested the app violated its policy.

**How to apply:** Inspect flags without printing cookie values. Preserve the
application's intended cookie policy; do not weaken it merely to match the
development proxy's behavior.

Run workspace Playwright through the workspace shell, not child processes
spawned inside the CodeExecution impure sandbox.

**Why:** That sandbox did not provide a usable Node executable through
`process.execPath` or its command search path; the workspace shell did.

**How to apply:** Use the normal shell tool or its documented callback for
workspace browser scripts, keeping credentials out of script files and output.