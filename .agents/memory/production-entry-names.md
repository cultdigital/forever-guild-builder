---
name: Production entry naming
description: Publishing validation can reject development-labelled entry filenames even when the server is production-compatible.
---

Use clearly production-labelled entry commands for published services.

**Why:** Publishing was blocked at the security-scan stage because the Node
entry filename contained `dev`, despite the server using production settings
and not running Vite or another development server.

**How to apply:** Keep development-labelled filenames and commands out of
production run configuration. Verify startup under `NODE_ENV=production` and
both the web and API readiness routes before suggesting another publish attempt.