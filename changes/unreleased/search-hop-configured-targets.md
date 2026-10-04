---
title: Searches through a related field only reach the sections that field links to, and that the user may read
type: security
audience: admin
date: 2026-10-01
wc: WC-2026-10-01-search-hop-configured-targets
---

A search that follows a related-record field (a portal or autocomplete column)
checked the user's permission on the section named in the search, then read
whichever section each stored link pointed to. Between sections that share a
table and a field — a section and its virtual twin — a user with access to one
could match values stored in the other.

A search now follows a related field only into the sections that field is
configured to link to, and only into those the user may read, each under its own
record restrictions. Links that point outside the field's configured sections —
left over from an earlier configuration or an import — no longer match in
searches, for administrators too; they already showed nothing on screen. The
data is untouched: adding the section back to the field's configuration makes
them searchable again.
