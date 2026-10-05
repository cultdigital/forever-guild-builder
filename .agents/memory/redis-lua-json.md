---
name: Redis Lua JSON array preservation
description: Why Redis Lua must not re-encode whole character or split records.
---

Preserve empty JSON arrays when using Redis Lua. Redis's cjson can re-encode an empty decoded array as an object, which is not equivalent to JavaScript's JSON round-trip.

**Why:** Character alternates and split member lists depend on array shape. JavaScript transport fixtures preserve that shape and can hide this Redis-specific risk.

**How to apply:** Pass already serialized record values through atomic scripts unchanged where possible. Avoid whole-record cjson re-encoding just to modify an internal scalar; verify array shape explicitly whenever introducing a Lua transformation.