---
name: Secrets confirmation
description: Distinguishing secure-form confirmation from successful runtime configuration.
---

A platform message that requested secrets were “added or confirmed” does not establish that their values changed or that the service can connect.

**Why:** Repeated secure-form confirmations left restarted services receiving literal setting names rather than usable credentials.

**How to apply:** Verify configuration with non-sensitive boolean diagnostics and a read-only connection check. Never print values or infer connection success from secret existence. If the secure form does not resolve the issue, explain the observed mismatch instead of repeatedly requesting the same inputs.