---
title: The projects picker follows a user's project assignments at once.
type: fixed
audience: user
date: 2026-10-11
---
When an administrator changed the projects a user belongs to, that user's *Projects* picker (and the project names shown in lists) kept offering the old set — a revoked project stayed selectable and a newly granted one stayed hidden — until an unrelated change cleared the server's memory. The picker is now keyed by the user's current projects, so the next read shows exactly the new set.
