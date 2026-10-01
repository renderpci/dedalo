---
title: Searching or sorting by a field the user may not see no longer reveals its values.
type: security
audience: user
date: 2026-09-30
wc: WC-2026-09-30-search-root-step-acl
---
A search on a field of the section itself (not of a linked record) did not check the user's permission on that field, so repeated searches like "starts with A", "starts with B" could reveal a hidden field's value, and sorting by it revealed its order. A filter or a sort on a field the user's profile hides now matches nothing and sorts nothing, and the request carries the usual "some content was not shown" notice. Fields shown to the user through a portal or an autocomplete they are allowed to use remain searchable there, and the record information fields every user may search (created and modified date and user) stay searchable for everyone. Which section's permissions apply is decided by the records being searched, never by what the request says about them. A sort over several sections at once is applied only when the field is visible to the user in every one of them.
