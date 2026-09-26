---
title: Activity (`dd542`) list survives 30M+ rows
type: changed
audience: admin
date: 2026-07-23
wc: WC-044, WC-046
---
On a
32.9M-row / 85 GB `matrix_activity` a header sort or a deep page used to
full-scan the whole table (>60 s at *every* page). Three wire-identical
internal rewrites (same rows, same order, same paginated envelope): the
structural sort key (`section_id` / `id`) is emitted index-aligned with no
`NULLS LAST`, so the default newest-first list is index-served (>60 s →
~11 ms); deep and last pages use a late-row-lookup + order-flip on the
flattened unique-key path (>5 s → ~64 ms); and the bare-browse total is
served from a save-event-invalidated cache. Ordered-search SQL is flattened
to an inline `ORDER BY … LIMIT` whenever the target table carries the full
unique `(section_id, section_tipo)` key.
