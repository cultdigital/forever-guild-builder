# Good Job · Raid Roster

World of Warcraft: Forever Horde raid sign-up, roster editing, and composition planning.

## Run and test

- Start managed workflows `artifacts/raid-roster: web` and `artifacts/api-server: API Server`.
- `pnpm --filter @workspace/scripts test:roster` runs browser regression tests against the shared proxy.
- `pnpm --filter @workspace/api-spec run codegen` regenerates the roster API contracts.
- `pnpm run typecheck` checks the workspace.

## Structure

- `artifacts/raid-roster`: React + Vite host preserving the imported HTML, CSS, icons, and JavaScript interactions.
- `artifacts/api-server`: Express endpoint at `/api/roster`, plus `/api/healthz`.
- `lib/roster`: shared character definitions, imported roster validation, survey seed, and storage.
- `.migration-backup`: untouched imported source, retained for parity comparisons.

## Storage and publishing

The original Redis storage is retained; no database migration was performed.
Configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` through Replit Secrets
to connect the original store. The legacy aliases `KV_REST_API_URL` and
`KV_REST_API_TOKEN` are also accepted. Never expose the token to the browser.
Development without Redis uses `artifacts/api-server/.data/roster.json`.
Published instances without Redis deliberately show a read-only survey roster,
rather than saving changes to ephemeral files. Local development changes do not
automatically transfer to Redis.

## Preserved behavior

- Hash routes `#signup`, `#comp`, and `#roster`.
- Open editing: anyone with the link can edit or delete entries; there is no login.
- Twenty survey members seed once; deletions do not trigger reseeding.
- Main class/spec/Horde race, three ranked alternates, professions, notes, and raid assignments.
- Composition targets for 10, 20, or 40 raiders, name/role/class filters, and CSV export.