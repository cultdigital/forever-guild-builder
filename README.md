# <Good Job> Raid Roster · WoW: Forever

A class/role sign-up for the guild. Members choose a main (class, spec, Horde race) plus up to three ranked
alternates, each marked **Keen / Happy / If needed**. The Composition tab shows tank/healer/DPS against 10, 20
or 40-man targets, which classes and specs have no one, which are overstacked, and who could flex to fill a gap.

- No build step: static files in `public/` and one serverless function in `api/roster.js`.
- Data is stored in Upstash Redis on Vercel, or in `.data/roster.json` when you run it locally.
- The Roster tab shows everyone as raid-frame nameplates. Each field (name, class & spec, race, professions, raid assignment,
  alternates) has a small pencil icon; saving updates the composition straight away. Raid assignments are Main Tank,
  Off Tank, Flex (Tank / DPS), Healing Lead and Raid Leader.
- Editing is open: anyone with the link can edit or remove any entry. There are no logins and nothing is stored in
  the browser.
- The 20 survey responses are seeded once.
- Icons are WoW: Forever assets saved in `public/icons/`.

## Run locally

```bash
node dev-server.js
```

Then open http://localhost:3000.

## Deploy to Vercel

1. `npx vercel login`
2. From this folder, run `npx vercel --prod` and accept the defaults. This gives you the shareable URL. Until
   step 3 is done the site is read-only and shows the survey data.
3. In the Vercel dashboard, open the project and go to **Storage → Create Database → Upstash (Redis)** (the free
   plan is fine), then **Connect** it to this project. That adds the `KV_REST_API_URL` and `KV_REST_API_TOKEN`
   env vars.
4. Run `npx vercel --prod` again so the new env vars take effect.

## Tweaks

- Guild name, raid-size targets, specs, professions and race/class rules: `public/data.js`
- Survey seed: `lib/seed.js`. It is only applied the first time; after that the database is the source of truth.
