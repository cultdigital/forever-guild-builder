# Forever Guild Builder

Private Horde/Alliance guild rosters, composition planning and named raid split setups.

## Run and test

- Start managed workflows `artifacts/raid-roster: web` and `artifacts/api-server: API Server`.
- `npm start` runs the no-build Node server directly, using `PORT` (default 5000).
- `pnpm --filter @workspace/scripts test:guilds` runs isolated service tests without touching live data.
- The original `test:roster` browser regression targets the former open single-guild app; it must be adapted to a signed-in guild before use against this version.
- `pnpm --filter @workspace/api-spec run codegen` regenerates the roster API contracts.
- `pnpm run typecheck` checks the workspace.

## Structure

- `dev-server.js`: Node HTTP entry point, static assets and guild APIs; no framework or application build required.
- `artifacts/raid-roster`: vanilla shell around the preserved imported HTML, CSS, icons and imperative roster interactions.
- `artifacts/api-server`: managed `/api` service using the same Node entry point.
- `lib/roster`: shared character definitions, imported roster validation, survey seed, and storage.
- `.migration-backup`: untouched imported source, retained for parity comparisons.

## Storage and publishing

The original Redis storage is retained. Never automatically migrate or seed at web-server startup.
Configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` through Replit Secrets
to connect the original store. The legacy aliases `KV_REST_API_URL` and
`KV_REST_API_TOKEN` are also accepted. Never expose the token to the browser.
Multi-guild routes require Redis in both development and production; missing
configuration shows an explicit setup message. There is no local-data fallback
or Turnstile bypass. Original local preview files and legacy store modules remain
untouched, but are not used by the private guild routes.

`SESSION_SECRET` must be at least 32 bytes. `TURNSTILE_SITE_KEY` and
`TURNSTILE_SECRET_KEY` are required only for new public guild creation; existing
guild login and editing do not require Turnstile. Turnstile widgets/verification
use action `create-guild` and the current request's hostname. A custom domain is
not needed for development; invite links use the current site's origin.

Replit proxy traffic uses the appended/rightmost forwarding address and host.
Standalone servers ignore forwarding headers by default. `TRUST_PROXY=1` opts
in for a trusted, appending reverse proxy; `TRUST_PROXY=0` opts out. Never expose
an opted-in standalone server directly to untrusted traffic.

`MAX_GUILDS` defaults to 5000 and affects only creation. Inactive tenants expire
after 180 days without successful writes; reads never extend expiry. Counters
contain HMAC-derived IP identifiers, not plaintext addresses.

## Good Job migration

Connect the **existing** Vercel KV database before migration. Then run
`pnpm --filter @workspace/scripts migrate:good-job` in a private terminal and
save its one-time credentials. The administrative importer copies `roster:v1`
and `roster:v1:splits`, using the survey seed only if the source roster hash is
empty. It never modifies source hashes, never runs during server startup, and
never outputs credentials again after its permanent idempotency marker is set.
Do not repeat migration to recover a lost key; use the recovery code.
No live migration has been performed while KV configuration is missing.

## Preserved behavior

- Private `/g/<slug>` pages with `#signup`, `#comp`, `#roster`, `#splits`, and `#settings`.
- Shared guild keys allow every authenticated guild member to edit; there are no personal accounts or officer roles.
- Namespaced guild records never auto-seed; migration/creation are explicit.
- Faction-valid main class/spec/race, three ranked alternates, professions, notes, and raid assignments.
- Composition targets for 10, 20, or 40 raiders, name/role/class filters, and CSV export.
- CSP forbids inline scripts; safe generated colour/meter style attributes are explicitly allowed with `style-src-attr`. Production framing is prohibited.