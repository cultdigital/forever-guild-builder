# Forever Guild Builder — verification status

The code is prepared, but live service acceptance and the Good Job migration are
not complete. Missing KV configuration and Turnstile credentials are explicit
blockers, not bypassed with an application fallback.

## Completed checks

- 33 isolated Node checks cover tenant-bound repositories, hostile guild IDs,
  credential hashing, session signing/revocation, creation and login throttling,
  write/read limits, capacity, settings, rotation, recovery, deletion, faction
  validation, expiry, stale-write rejection and idempotent migration.
- These tests simulate the Redis REST boundary. They do **not** validate Lua
  execution against a real Redis server or Cloudflare's live verification.
- Existing split API regressions pass for their original isolated local,
  simulated Redis and missing-storage cases. The private app itself never uses
  the legacy local fallback.
- OpenAPI generation and the workspace typecheck pass.
- Both managed Node workflows start cleanly.
- Public landing and mobile privacy screenshots render successfully.
- The running configuration reports storage unavailable, sessions configured
  and public creation disabled. A same-origin JSON write reaches the setup
  error (503), rather than an origin error or a silent local save.

## Required acceptance checks still pending

| Requirement | Isolated/server evidence | Live status |
| --- | --- | --- |
| Two guilds in separate browser sessions cannot access each other's data | Session-bound tenant isolation and hostile-ID checks pass | Pending KV connection and browser pass |
| Wrong keys throttle; rotation revokes all sessions | Fixture checks pass | Pending signed-in browser pass |
| Real Turnstile succeeds; creation/IP limit rejects the fourth attempt | Boundary checks cover successful, failed, wrong-host and wrong-action verification and the fourth attempt | Pending Turnstile configuration |
| Oversize JSON and member 101 are rejected without blocking edits/deletes | HTTP 8 KB and atomic capacity fixture checks pass | Pending real Redis Lua execution |
| Alliance/Horde and Skyborne combinations are enforced | Exact supplied tables and rejected saves pass | Pending signed-in UI pass |
| Existing inline edits, composition, CSV and mobile roster remain usable per guild | Legacy controllers are preserved; tenant adapters and split regressions pass | Pending signed-in browser pass |
| CSP and browser console are clean | HTTP header checks and public page checks pass | Private-page console still pending |
| Good Job has all original live records after migration | Source preservation, seed fallback and repeat-import fixtures pass | **Not run against live KV** |

## Next prerequisite

Connect the existing Vercel KV database using `KV_REST_API_URL` and
`KV_REST_API_TOKEN` through workspace secrets. Do not paste credentials into chat.
The documented manual Good Job importer can then be run with the user's
confirmation, saving its one-time credentials privately.

Turnstile and a custom domain can be configured later. Turnstile remains required
to enable public guild creation; a purchased domain is not required for testing.