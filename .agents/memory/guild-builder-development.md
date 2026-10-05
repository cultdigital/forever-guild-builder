---
name: Guild Builder scope ordering
description: Guild Builder scope, raid-split access, Classic role nomenclature, and the designated admin test guild.
---

Preserve the completed raid-split feature during the multi-guild conversion.

**Why:** The user explicitly corrected the ordering to finish splits before the multi-guild work. Older plan language saying splits are paused is superseded.

**How to apply:** Treat splits as part of the existing product when migrating tenancy and verifying the roster, not as deferred scope.

Keep the raid-building workspace visibly accessible from Composition, not only a separate tab.

**Why:** The user could not find the feature and requested that it be a function
within Composition or visibly linked in the app.

**How to apply:** Preserve a clearly labelled Composition entry point and ensure
navigation does not hide raid-split access on narrow screens.

Raid planning uses a **Build Raid** workspace, not only split runs. It must support laying out
the main raid composition and its party groupings, alongside multi-raid plans.

**Why:** The user said “raid split should be raid setup” so they can set their
main raid composition and lay out party groupings.

**How to apply:** Preserve the main-raid and party-planning workflow when
extending this feature; do not reduce it to parallel raids or role columns only.

Keep the builder compact: edit roles through a pencil dialog, not inline
Tank/Healer/DPS selectors or move/unassign dropdowns. Do not bring back an
on-page Saved setups section.

**Why:** The user requested a proper UX cleanup because the app felt busy and
AI-built, with consistent switches, spacing, and styling across the app.
They then requested the same UX flavour pass on all pages, not just Build Raid.

**How to apply:** Prioritize one workspace with 10/20/40 size controls and a
bottom Add new composition action. Preserve old saved records through a discreet
chooser; collapse secondary analysis rather than showing repeated warning cards.
Keep keyboard and touch movement usable when removing dropdown alternatives.
Carry the same hierarchy through Sign Up, Composition, Roster, Settings, and
guild entry pages. Secondary content can be disclosed on demand, but required
fields and populated optional data must remain easy to find while editing.

New builds start everyone unassigned; players are assigned by dragging into a
raid. Multiple compositions can have the same size, including repeated 40s.

**Why:** The user explicitly requested this starting state and repeated sizes.

**How to apply:** Do not auto-distribute members or restrict total planned slots
to the roster's 100-player limit. Keep actual roster and party capacity safeguards.

Use Classic WoW (Vanilla/Forever) nomenclature throughout the app: Tank, Healer,
and DPS, not Warden, Mender, or Striker.

**Why:** The user explicitly requested Classic/Forever nomenclature after seeing
the non-Classic names in the signup-page demo.

**How to apply:** Apply these names consistently to role headings and demo
examples. Do not rename real members' character names as part of terminology
cleanup, or remove intentional Forever-specific classes/races/raid content.
The user also requested simple position-selector labels: Tank, Healer and DPS,
without a “Roster” prefix or parenthesised role.

Keep raid role choices specific to a setup, separate from the member's main
signed-up class/spec.

**Why:** The user said some people flex into different positions depending on
the raid. A planning choice for one raid should not change every other raid or
rewrite their main character.

**How to apply:** Saved team composition should respect planned role choices;
the whole-roster view and other setups should still use the signed-up role
unless they have their own choice.

Split composition checks should follow each team's size and current draft,
including unsaved player moves and role choices.

**Why:** The user requested a composition check in the split tab so they can
check raid composition while planning, without switching tabs.

**How to apply:** Keep the check rules consistent with Composition, but do not
reuse its selected guild/saved-team scope or global raid-size selection for an
unsaved split preview.

Good Job is the designated admin test guild.

**Why:** The user stated that Good Job will be used as the admin test guild.

**How to apply:** Keep its existing migrated entry available; do not recreate it
or treat it as a disposable fixture during automated cleanup. Never store its
key or recovery code in documentation or memory.

Do not use Good Job as the example guild in public copy or placeholder content.

**Why:** The user explicitly requested removing it as the example guild.

**How to apply:** Use generic examples without changing the real Good Job guild.

The header must show the guild's actual name, and Alliance guilds must have an
Alliance theme.

**Why:** The user explicitly requested guild-specific names and faction theming.

**How to apply:** Keep identity and faction presentation tied to current guild
metadata, including after changes; do not leave Horde branding on Alliance guilds.

Settings faction choices preview the corresponding colours and crest immediately,
but only Save changes persists the faction. Outside Settings, use the saved theme.

**Why:** The user requested appropriate colours when switching faction in Settings;
previewing should not silently change guild character eligibility.

**How to apply:** Keep preview state separate from saved guild identity. Preserve
the preview during Settings refreshes, and use the server's faction after saving.

Use the WoW: Forever logo as the app favicon.

**Why:** The user explicitly requested the game logo instead of the generic icon.

**How to apply:** Retain the real logo when updating browser icons; do not replace
it with an invented guild crest.

Guild-key inputs must allow users to view what they entered.

**Why:** The user requested a visible input or an optional input viewer.

**How to apply:** Keep Show/Hide key controls available at login and wherever
the app asks for the current guild key. Mask by default without changing or
persisting the input value when visibility is toggled.

Invite key viewing may reuse a key entered during sign-in, but only in volatile
page memory. After a full reload, the user must enter it again.

**Why:** The user reported the Invite Show/Hide control as broken when its field
was empty. The server stores hashes and cannot recover a plaintext key.

**How to apply:** Preserve entered keys across same-page settings refreshes,
scope them to the signed-in guild, and never put them in browser storage or cookies.

Retry only idempotent guild-details saves after network interruptions, and check
actual server state rather than treating a lost response as a rejected write.

**Why:** The user reported faction saves failing to fetch. A response can be lost
after the write succeeds; duplicate credential rotation or deletion is not safe.

**How to apply:** Keep credential operations out of automatic retries, bind saves
to the intended guild, and explicitly report when the saved outcome is unconfirmed.

Use plain guild-name slugs without a mandatory random suffix; Good Job's login
must be `good-job`.

**Why:** The user wants a friendly tool for testing raid configurations and
planning, considers name sniping unlikely, and explicitly requested `good-job`.

**How to apply:** Prefer readable name-based URLs. Reject an occupied slug with
a clear request for a different name instead of silently appending a hash.
Preserve old invite links as aliases when changing an existing guild URL.

Everything under `/g/` must be non-indexable.

**Why:** The user explicitly requested this for all guild URLs, not only Good Job.

**How to apply:** Preserve this requirement for login pages, guild pages, aliases,
and any future pages or resources added under `/g/`; keep public pages outside
that section separate.

Keep guild support only as the bottom-of-page link; do not show a donation banner
after login.

**Why:** The user explicitly requested removing the logged-in donation banner
while retaining the footer link.

**How to apply:** Do not reintroduce donation prompts based on roster size or
login state.

Use role/class grouping for raid-split player lists rather than name-only order.

**Why:** The user requested sorting the unassigned players by role/class.

**How to apply:** Preserve this grouping when moving players into or out of
teams and when changing the split editor layout.

Do not infer application indexing rules from preview-domain robots headers alone.

**Why:** Preview-domain responses contained extra site-wide `noindex` directives,
including on `/`, while direct application checks and the published homepage
did not. Those extra headers can obscure whether the app's own rule is scoped.

**How to apply:** Use isolated HTTP checks or direct application responses to
verify public-page exclusions, and the published domain to confirm deployment.