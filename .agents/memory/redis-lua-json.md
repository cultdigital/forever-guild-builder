---
name: Redis Lua JSON compatibility
description: Array preservation and null omission in the real Redis provider's Lua codec.
---

Preserve empty JSON arrays when using Redis Lua. Redis's cjson can re-encode an empty decoded array as an object, which is not equivalent to JavaScript's JSON round-trip.

**Why:** Character alternates and split member lists depend on array shape. JavaScript transport fixtures preserve that shape and can hide this Redis-specific risk.

**How to apply:** Pass already serialized record values through atomic scripts unchanged where possible. Avoid whole-record cjson re-encoding just to modify an internal scalar; verify array shape explicitly whenever introducing a Lua transformation.

Do not use null-valued JSON patch properties to clear stored credentials in Lua.

**Why:** The real provider's cjson.decode omitted all three null-valued patch
fields; a read-only probe counted zero keys and returned nil for a decoded null.
Invite revocation appeared successful in the JavaScript fixture but left the
real credential intact, allowing both redemption and existing sessions.

**How to apply:** Use explicit scalar reset values (such as empty strings) that
survive pairs iteration, or perform explicit Lua deletion outside the patch
loop. Verify credential revocation against the real store and validate the
server's returned state before showing a success message.