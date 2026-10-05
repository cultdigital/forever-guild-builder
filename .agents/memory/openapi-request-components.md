---
name: OpenAPI request component naming
description: Avoiding duplicate generated request-body exports with this workspace's Orval setup.
---

Use named component schemas for new request bodies rather than anonymous inline objects.

**Why:** This workspace re-exports both inferred Zod operation types and generated TypeScript types. Orval can give an anonymous body the same exported name in both outputs, causing a duplicate-export typecheck failure.

**How to apply:** Reference a distinctly named input component from each operation, regenerate both outputs and confirm the workspace typecheck. Do not edit generated files to hide the collision.