---
name: Secrets confirmation
description: Distinguishing secure-form confirmation from successful runtime configuration.
---

A platform message that requested secrets were “added or confirmed” does not establish that their values changed or that the service can connect.

**Why:** Repeated secure-form confirmations left restarted services receiving literal setting names rather than usable credentials.

**How to apply:** Verify configuration with non-sensitive boolean diagnostics and a read-only connection check. Never print values or infer connection success from secret existence. If the secure form does not resolve the issue, explain the observed mismatch instead of repeatedly requesting the same inputs.

Vercel's sensitive/Secret environment-variable entries are write-only after saving. Their list shows names, not retrievable credential values.

**Why:** A user copying from that list could access only the names; repeatedly asking for values from the same page did not help. Vercel's official documentation confirms that saved Secret values remain hidden.

**How to apply:** Direct the user to the existing database resource's connection credentials or provider console. Do not suggest creating a replacement database or rotating working credentials merely to retrieve them. Keep credential transfer in the secure secrets flow.