---
title: Append-only logs restrict sort and search dimensions
type: changed
audience: user
date: 2026-07-23
wc: WC-044, WC-045
---
Arbitrary component sorts on the append-only log are disallowed: every
`dd542` column is `sortable:false` except *When* (`dd547`), whose order maps
to the direct `section_id` column (append-only ⇒ insertion order). The
edit-mode search *FIELDS* panel now omits the shared section-info group
(`dd196`) for Activity (`dd542`) and Time Machine (`dd15`), where that
editorial metadata is meaningless as a search dimension.
