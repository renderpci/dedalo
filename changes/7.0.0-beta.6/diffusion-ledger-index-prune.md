---
title: The diffusion publication ledger drops the indexes it never used.
type: changed
audience: admin
date: 2026-10-14
---

The publication ledger (`matrix_activity_diffusion`, the `dd1758` section) records one row per
record per publication run, and it had accumulated indexes the engine never reads:

- four on columns no component of the section ever writes (`geo`, `iri`, `media`,
  `relation_search) — the section's fields are id, date, relations, number, text and a select,
  so those columns are always empty;
- one on `misc`, whose only use is the retry stamp, read as an expression a GIN index cannot
  serve;
- four that merely duplicate an index already kept, on a table whose `section_tipo` holds a
  single value (`section_id`, `section_tipo`, `section_id DESC`, and a second `id` index
  alongside the primary key).

Every one of them was maintained on **every published record** — a permanent tax on publishing,
paid for indexes that were never chosen. On update the useless GINs are dropped at boot and the
redundant btrees removed. The indexes that matter stay: the one that answers the pending-unpublish
checks, the one that answers the ledger's own record lookups, and the one the retention window
uses. Publishing gets slightly cheaper and the database slightly smaller; no search behaviour
changes. If you have already run **Maintenance → Database info → Optimize tables** on an older
version, these drops are a no-op.
