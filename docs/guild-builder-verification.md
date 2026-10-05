# Forever Guild Builder — verification status

Good Job has been migrated successfully into its private Horde guild. Private
guild storage, signed-in browser flows, and the live Redis protections below are
verified. Public guild creation remains disabled because Turnstile credentials
were explicitly deferred; no bot-protection bypass was introduced.

## Completed checks

- 37 isolated Node checks cover tenant-bound repositories, hostile guild IDs,
  credential hashing, session signing/revocation, creation and login throttling,
  write/read limits, capacity, settings, rotation, recovery, deletion, faction
  validation, expiry, stale-write rejection and idempotent migration.
- Readable-slug checks cover collision rejection, alias lookup and expiry,
  deletion of aliases, and preservation of credentials and records during URL changes.
- All `/g/` responses include `X-Robots-Tag: noindex` and guild HTML includes
  a server-rendered robots meta tag. HTTP checks cover aliases, nested paths,
  encoded paths, errors and HEAD responses; public pages remain indexable.
  Crawling is allowed in robots.txt so crawlers can see the noindex directives.
- These tests simulate the Redis REST boundary. They do **not** validate Lua
  execution against a real Redis server or Cloudflare's live verification.
- Existing split API regressions pass for their original isolated local,
  simulated Redis and missing-storage cases. The private app itself never uses
  the legacy local fallback.
- OpenAPI generation and the workspace typecheck pass.
- Both managed Node workflows start cleanly.
- Public landing and mobile privacy screenshots render successfully.
- The live Redis REST connection returns HTTP 200 and `PONG`. Read-only checks
  found 21 original member records, no original split setups, and no migration marker.
- Both services were restarted with the new Upstash settings. The running
  configuration reports storage and sessions configured, public creation disabled,
  and a healthy server. No original data was changed by these connection checks.
- The live migration copied all 21 member records byte-for-byte, copied the empty
  split collection, and left both original Redis hashes unchanged. A repeat import
  resolves the same permanent migration marker without importing again.
- The generated guild key and recovery code validate against their scrypt hashes.
  Guild metadata contains no plaintext credential fields.
- Workspace Playwright verified Good Job sign-in, 21-member loading, desktop and
  mobile roster rendering, CSV download, composition, splits, reload persistence,
  and logout. No page errors or CSP failures were observed.
- Temporary Horde and Alliance guilds exercised real Redis Lua for member
  create/edit/delete, empty arrays, stale writes, faction validation, settings,
  donation dismissal, split persistence, capacity, key rotation and recovery.
- Separate browser sessions verified isolation and the Alliance theme, Skyborne
  Mage signup, professions, inline rename, and persistence after reload.
- Temporary guilds were deleted through the protected API using their current
  keys and exact names. Their data and capacity-index entries were confirmed
  absent; test-owned abuse counters were also cleaned up.
- Good Job's canonical login is now `good-job`. Its existing ID, key/recovery
  hashes, key version, all 21 members, and split collection were preserved during
  the atomic URL update. The migration marker now resolves the readable slug.
  The old suffixed URL is retained as an alias; compatibility and canonical
  navigation work in the updated app after republishing.
- Workspace Playwright verified home-page entry using `good-job`, existing-key
  login, all 21 members, reload, and both signed-in and signed-out old-link
  canonicalization. Live published HTTP login and roster loading also succeed
  with `good-job` and the unchanged key.

## Acceptance results

| Requirement | Isolated/server evidence | Live status |
| --- | --- | --- |
| Two guilds in separate browser sessions cannot access each other's data | Session-bound tenant isolation and hostile-ID checks pass | **Pass:** separate contexts; forged query/body IDs cannot read, edit, or delete another tenant's records |
| Wrong keys throttle | Fixture checks pass | **Pass:** five wrong keys return 401; the sixth returns 429 using real Redis counters |
| Rotation revokes sessions; recovery issues a working replacement key | Fixture checks pass | **Pass:** old sessions fail after rotation and recovery; replacement-key login works |
| Real Turnstile succeeds | Verification boundary checks pass with controlled responses | **Blocked:** real site/secret credentials deferred; public creation still returns 503 |
| Creation/IP limit rejects the fourth attempt | Fixture checks pass | **Pass at the live Redis limiter boundary:** first three allowed, fourth returns 429, counter expires; full public creation remains blocked on Turnstile |
| Wrong Origin/content type and oversized JSON are rejected | HTTP boundary checks pass | **Pass:** live HTTP responses are 403, 415 and 413 respectively |
| Member 101 is rejected while edits/deletes remain available | Atomic capacity fixture checks pass | **Pass:** both API and atomic repository reject excess members; existing edits/deletes work at capacity |
| Global guild capacity pauses only creation | Fixture checks pass | **Pass:** capped administrative creation rejects; existing member edits remain available |
| Inactive guild data expires after 180 days; writes refresh expiry | Fixture checks pass | **Pass:** live member and metadata TTLs are refreshed to the 180-day window |
| Alliance/Horde and Skyborne combinations are enforced | Exact supplied tables and rejected saves pass | **Pass:** Horde Skyborne Shaman and Alliance Skyborne Mage work; opposite combinations and Alliance Orc are rejected |
| Settings, faction warnings, and donation dismissal persist | Fixture checks pass | **Pass:** rename, persisted dismissal, and invalid-race warnings on faction change |
| Guild deletion requires the current key and exact name | Fixture checks pass | **Pass:** incorrect key/name rejected; correct deletion removes storage/index entries and invalidates access |
| Empty arrays and stale-write protection survive real Lua | Fixture checks pass | **Pass:** empty alternate/split arrays remain arrays; stale revisions return 409 |
| Existing inline edits, composition, CSV and mobile roster remain usable per guild | Legacy controllers and isolated split API regressions pass | **Pass:** signed-in browser checks; no mobile page overflow |
| Saved split persistence is tenant-bound | Existing split API regressions pass | **Pass:** real tenant repository split save/read/delete; migrated guild's splits UI renders |
| Session cookies have required flags and 30-day expiry | Signing/revocation fixture checks pass | **Pass at the direct app boundary:** HttpOnly, Secure, SameSite=Lax, Max-Age=2592000; shared development preview presents SameSite=None |
| CSP and protected pages have no JavaScript failures | HTTP header checks and public page checks pass | **Pass:** no page errors or CSP failures in the signed-in browser checks |
| Good Job has all original live records after migration | Source preservation, seed fallback and repeat-import fixtures pass | **Pass:** 21 exact member copies, zero original saved splits, originals unchanged, repeat import idempotent |

## Deferred setup and repeatability

The existing database is connected using `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` through workspace secrets. Migration credentials are
provided only in the private one-time handoff, not stored in this document.

Turnstile and a custom domain can be configured later. Turnstile remains required
to enable public guild creation; a purchased domain is not required for testing.
Real Cloudflare success, expired/failed challenges, and the complete public
creation flow still need verification once those credentials are configured.

The signed-in checks above used workspace Playwright because the testing
subagent kind was unavailable. The legacy `test:roster` browser script still
assumes an unauthenticated roster at the root; it is not evidence for the private
app. Porting these private-guild checks into a repeatable script is a follow-up,
not a claimed passing legacy browser workflow.