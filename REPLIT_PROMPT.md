# Prompt for Replit Agent — Forever Guild Builder

> Paste everything below the line into Replit Agent. If you imported the existing code (recommended),
> keep the "Existing app" section; the agent should extend that code rather than start over.

---

## Context

I have a working single-guild raid roster app for **World of Warcraft: Forever** (Blizzard's new Classic-based
game, launched Nov 2026). It's live for my guild `<Good Job>`. I want to turn it into a **public multi-guild web app**
called **Forever Guild Builder** at **foreverguildbuilder.com**, usable by any Horde or Alliance guild.

The imported project is the current app. Extend it rather than rewriting it. Keep it lightweight: vanilla JS front end,
no framework, no build step, a few server routes, Upstash Redis (REST) as the only data store.

## Existing app (already built, in this repo)

**Stack**
- `public/` holds the static front end: `index.html`, `styles.css`, `app.js` (ES modules, no build), `data.js`
  (shared game data, imported by both the browser and the server), and `icons/` (WoW: Forever icons as 64×64 `.webp` files).
- `lib/handler.js` is a framework-agnostic API handler: `handle({ method, query, body }) → { status, json }`.
- `lib/store.js` stores data in Upstash Redis via its REST API using plain `fetch` (env `UPSTASH_REDIS_REST_URL` /
  `UPSTASH_REDIS_REST_TOKEN`, or `KV_REST_API_URL` / `KV_REST_API_TOKEN`). It falls back to a local `.data/roster.json`
  file when no Redis is configured, which is for development only.
- `lib/seed.js` holds the 20 survey members for `<Good Job>`, seeded once.
- `dev-server.js` is a Node HTTP server that serves `public/` and routes `/api/roster` to the handler. **Use this as the
  Replit server** (`npm start`). It reads `PORT` from env.
- `api/roster.js` + `vercel.json` are the Vercel adapter. They're no longer needed on Replit but are harmless.

**Features**
- **Sign Up tab**:
  - Character name.
  - Main pick: class (9 tiles), spec, and race. Races are filtered to the combos valid for the faction.
  - Up to 3 ranked alternates, each tagged **Keen / Happy / If needed**.
  - Optional professions: up to 2 primary plus any of the secondary ones.
  - Notes.
  - Duplicate names show an "Edit X" button instead of overwriting the existing entry.
- **Composition tab**:
  - Raid-size toggle: 10 (Barrow Deeps), 20 (Hyjal Summit), 40 (Onyxia). Targets: 10 = 2/3/5, 20 = 3/5/12, 40 = 4/10/26 (tank/heal/DPS).
  - Role cards showing short/on-target/bench status, and who could flex in from their alternates.
  - Role split bar compared against the target.
  - A "Gaps & pressure points" list:
    - classes with no mains, and the raid utility lost;
    - hybrid specs with no mains;
    - stacked classes (≥4 mains and >20% of the roster) and crowded specs (≥3 and >15%);
    - hybrids with no spec chosen;
    - how many members have no alternates listed.
  - Class & spec cards with pips for mains vs alternates.
  - Raid utility checklist.
  - Race breakdown.
  - Professions panel.
  - "Tank assignments" panel showing tank nameplates.
- **Roster tab**:
  - WoW raid-frame style nameplates: a glossy class-coloured bar with the name in white with a black outline, plus a role icon.
  - Players grouped as Tanks / Healers / Damage / Undecided.
  - Each field has a small **pencil icon** for inline editing: name, class, spec, race, raid assignment, professions, and
    alternates (which opens the full form). Saving immediately re-renders the composition.
  - Filters for search, role and class.
  - CSV export.
- **Raid assignments**: Main Tank (MT), Off Tank (OT), Flex (Tank/DPS), Healing Lead (HL), Raid Leader (RL). Shown as
  coloured badges on nameplates.
- **Editing is fully open.** There's no per-user ownership and nothing tracked in the browser. Edits send only the changed
  fields (a partial merge on the server), so concurrent edits to different fields don't overwrite each other.
- **Styling**:
  - Dark WoW Horde theme with red, gold and dark leather/stone colours.
  - Cinzel for headings, Alegreya Sans for body text, and Marcellus as the stand-in for WoW's Friz Quadrata (used for
    nameplates and the guild tag).
  - The guild name is shown as a WoW nameplate guild tag: `<Good Job>` in green `#40ff40` with a black outline.
  - Official class colours.
  - Responsive down to a 375px-wide phone screen.

## Build v1 of the public, multi-guild app

### Guilds and access (decided)
- **Create a guild**:
  - Inputs: guild name (2–24 characters) and faction (Horde or Alliance).
  - Protected by **Cloudflare Turnstile** (free bot check) plus a rate limit.
  - Returns a private guild URL with a random suffix (e.g. `/g/goodjob-x7k2`). Forever has no realms, so guild names
    would collide; the suffix stops name squatting.
  - Also returns a **single shared guild key** and a **recovery code**. Generate both server-side as random 4-word
    passphrases, e.g. `ember-totem-raptor-salt`. Show them once, with a clear "save these" step (copy buttons plus a
    download as `.txt`).
- **One shared key per guild for now.** Anyone with it can view, add, edit and delete roster entries and change guild
  settings. (Separate officer keys and Discord login for officers are planned for later. Structure the code so a second
  role can be added.)
- **Invite link**: "Copy invite link" produces `https://foreverguildbuilder.com/g/<slug>#k=<key>`. The key sits after the
  `#`, so it's never sent to the server or written to logs. The page reads it, logs in, then removes it from the address
  bar with `history.replaceState`.
- **Login**: `POST` the key and receive a **signed session cookie**:
  - HMAC-SHA256 with a server secret `SESSION_SECRET`.
  - The payload holds `guildId`, `keyVersion` and `exp` (30 days).
  - Cookie flags: `HttpOnly; Secure; SameSite=Lax; Path=/`.
- **Rotate key** (from guild settings): issues a new key and increments `keyVersion`, which logs everyone out. The
  rotation itself requires the current key or the recovery code.
- **Recovery code**: lets someone set a new guild key if the key is lost. Store it hashed. If both are lost, the guild is
  unrecoverable; say so clearly at creation.
- **Delete guild**: requires the current key and a typed confirmation.
- **No public guild directory or search.** Guilds are only reachable by private URL + key.

### Security requirements
- **Tenant isolation.** Every API route derives `guildId` **only from the verified session cookie**, never from the
  request body, query string or URL. Redis keys are namespaced: `guild:{id}:meta` and `guild:{id}:members`.
- **Hashing.** Hash the guild key and recovery code with Node's built-in `crypto.scrypt`, using a per-guild random salt.
  Compare with `timingSafeEqual`.
- **CSRF.** Rely on `SameSite=Lax`, and also reject writes whose `Origin` header doesn't match the site. Require
  `Content-Type: application/json`.
- **Security headers** on every response:
  - a strict Content-Security-Policy (`default-src 'self'`; scripts from self plus `challenges.cloudflare.com`; styles
    from self plus `fonts.googleapis.com`; fonts from `fonts.gstatic.com`; images from self);
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'`.
- **Validation and escaping.**
  - Keep the existing server-side validation (valid class/spec/race combos for the guild's faction, field lengths,
    max 3 alternates, max 2 primary professions, notes ≤200 characters).
  - Reject request bodies over 8 KB.
  - All user text must stay HTML-escaped when rendered (the existing `esc()` helper).
- **No personal data.** No emails, no IP addresses stored long-term (rate-limit counters expire). Add a short
  privacy page and a "Not affiliated with Blizzard Entertainment" line in the footer.

### Abuse and cost limits (protect the database)
Implement each limit as a Redis counter with `INCR` + `EXPIRE`. No extra libraries.

| Limit | Value |
|---|---|
| Guild creation | 3 per IP per 24h, plus Turnstile |
| Login / recovery attempts | 5 per minute and 20 per hour, per IP and per guild |
| Writes | 60 per minute per guild |
| Reads | 300 per minute per IP |
| Members per guild | 100 |
| Total guilds (global kill switch) | 5,000, configurable via env `MAX_GUILDS`. New guild creation pauses with a friendly message; existing guilds keep working |
| Inactive guilds | Expire after 180 days with no writes: set a Redis `EXPIRE` on the guild's keys and refresh it on every write |

- Rate-limited requests return HTTP 429 with a readable message.
- Keep page loads to about 2 Redis calls: one session check plus one `HGETALL` of the guild's members.

### Factions
Make race/class data faction-aware in `data.js`. The guild's faction decides which races appear and the colour theme:
- **Horde**: the current red/gold theme.
- **Alliance**: a blue/silver/gold theme.

Race → class combos in WoW: Forever:

| Faction | Race | Classes |
|---|---|---|
| Horde | Orc | Warrior, Hunter, Mage, Rogue, Warlock, Shaman |
| Horde | Tauren | Warrior, Hunter, Druid, Shaman |
| Horde | Troll | Warrior, Hunter, Mage, Rogue, Priest, Warlock, Shaman |
| Horde | Undead | Warrior, Mage, Rogue, Priest, Warlock, Paladin |
| Horde | Skyborne | Warrior, Hunter, Rogue, Druid, Shaman |
| Alliance | Human | Warrior, Hunter, Mage, Rogue, Priest, Warlock, Paladin |
| Alliance | Dwarf | Warrior, Hunter, Rogue, Priest, Paladin, Shaman |
| Alliance | Night Elf | Warrior, Hunter, Rogue, Priest, Druid |
| Alliance | Gnome | Warrior, Mage, Rogue, Priest, Warlock |
| Alliance | Skyborne | Warrior, Hunter, Rogue, Mage, Druid |

Skyborne is a new race available to both factions. Its 5th class depends on faction: Shaman for Horde, Mage for Alliance.
Alliance race icons will need sourcing in the same style as the Horde ones, which use racial-ability icons. Good
candidates: Human `spell_holy_holyprotection` or `inv_enchant_shardbrilliantsmall`, Dwarf `spell_shadow_unholystrength`,
Night Elf `ability_racial_shadowmeld`, Gnome `inv_gnometoy`. The Mobalytics CDN serves these as
`https://cdn.mobalytics.gg/assets/wow-forever/icons/spells/<name>.webp`. Download them into `public/icons/`; don't
hotlink.

### Pages and routes
- `/` is the landing page:
  - what the app does, with screenshots or a demo;
  - **Create a guild** and **Open my guild** (paste an invite link or slug, then enter the key);
  - a Ko-fi link.
- `/g/<slug>` is the guild app (the existing three tabs) plus a **Guild settings** panel:
  - rename the guild;
  - change faction (warn if existing races become invalid);
  - copy the invite link;
  - rotate the key;
  - use the recovery code;
  - export CSV;
  - delete the guild.
- API:

| Route | Purpose |
|---|---|
| `POST /api/guilds` | Create a guild |
| `POST /api/session` | Log in with a key |
| `DELETE /api/session` | Log out |
| `GET /api/roster` | Read the roster |
| `POST /api/roster` | Create or edit a roster entry |
| `DELETE /api/roster?id=` | Delete a roster entry |
| `PATCH /api/guild` | Change guild settings |
| `POST /api/guild/rotate` | Rotate the key |
| `POST /api/guild/recover` | Use the recovery code |
| `DELETE /api/guild` | Delete the guild |

### Donations
- Footer link on every page: "☕ Support Forever Guild Builder" → **https://ko-fi.com/cultdigital**
- One dismissible prompt inside the guild app after a guild passes 20 members. Remember the dismissal per guild, server-side
  in the guild meta, not in the browser.
- Never lock features behind donations.

### Migration
Create `<Good Job>` (Horde) as the first guild and import its current roster from the existing `roster:v1` Redis hash
(or from `lib/seed.js` if the hash is empty). Print its new key and recovery code to the server console once.

### Environment and secrets (Replit Secrets)
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`: copy these from Vercel → Storage → the Upstash database → `.env.local` tab.
  The live `<Good Job>` data is already in that database.
- `SESSION_SECRET`: a 32+ byte random string.
- `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`: from the Cloudflare dashboard → Turnstile.
- `MAX_GUILDS` (optional, default 5000).

### Acceptance checks
- Two guilds created in separate browsers can't read or edit each other's roster, even with a hand-crafted request
  that sends the other guild's id.
- A wrong key is rate-limited after 5 tries a minute. Rotating the key logs out other sessions.
- Guild creation without a valid Turnstile token fails, and the 4th creation from one IP in a day fails.
- Request bodies over 8 KB are rejected. The 101st member is rejected.
- An Alliance guild can't save a Tauren or an Orc, and a Horde guild can't save a Human.
- The existing features (inline pencil edits, composition updates, CSV export, mobile layout) work per guild.
- The Content-Security-Policy is present and the page runs with no console errors.
