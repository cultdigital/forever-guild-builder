---
name: Guild Builder scope ordering
description: Guild Builder scope, raid-split access, Classic role nomenclature, and the designated admin test guild.
---

Preserve the completed raid-split feature during the multi-guild conversion.

**Why:** The user explicitly corrected the ordering to finish splits before the multi-guild work. Older plan language saying splits are paused is superseded.

**How to apply:** Treat splits as part of the existing product when migrating tenancy and verifying the roster, not as deferred scope.

Keep raid splits visibly accessible from Composition, not only a separate tab.

**Why:** The user could not find the feature and requested that it be a function
within Composition or visibly linked in the app.

**How to apply:** Preserve a clearly labelled Composition entry point and ensure
navigation does not hide raid-split access on narrow screens.

Use Classic WoW (Vanilla/Forever) nomenclature throughout the app: Tank, Healer,
and DPS, not Warden, Mender, or Striker.

**Why:** The user explicitly requested Classic/Forever nomenclature after seeing
the non-Classic names in the signup-page demo.

**How to apply:** Apply these names consistently to role headings and demo
examples. Do not rename real members' character names as part of terminology
cleanup, or remove intentional Forever-specific classes/races/raid content.

Good Job is the designated admin test guild.

**Why:** The user stated that Good Job will be used as the admin test guild.

**How to apply:** Keep its existing migrated entry available; do not recreate it
or treat it as a disposable fixture during automated cleanup. Never store its
key or recovery code in documentation or memory.

Guild-key inputs must allow users to view what they entered.

**Why:** The user requested a visible input or an optional input viewer.

**How to apply:** Keep Show/Hide key controls available at login and wherever
the app asks for the current guild key. Mask by default without changing or
persisting the input value when visibility is toggled.

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

Do not infer application indexing rules from preview-domain robots headers alone.

**Why:** Preview-domain responses contained extra site-wide `noindex` directives,
including on `/`, while direct application checks and the published homepage
did not. Those extra headers can obscure whether the app's own rule is scoped.

**How to apply:** Use isolated HTTP checks or direct application responses to
verify public-page exclusions, and the published domain to confirm deployment.