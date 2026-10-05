---
name: Safe Redis verification
description: Comparing Redis records without order-dependent false alarms or exposing private data.
---

Canonicalize Redis hash key/value pairs before comparing snapshots, and report
only equality booleans or counts.

**Why:** Redis HGETALL ordering changed between reads during guild provisioning,
causing a false mutation alarm. Raw assertion diffs also exposed credential-bearing
metadata and member records in diagnostic output.

**How to apply:** Sort hash entries and JSON object keys while preserving ordered
arrays, then compare digests. Use generic assertion messages rather than comparing
raw private snapshots with assertions that print both values.
