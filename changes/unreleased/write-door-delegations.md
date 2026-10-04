---
title: Translation, imports, cache rebuilds, uploads and bulk reverts now check permissions on every record and field they write.
type: security
audience: admin
date: 2026-10-01
breaking: false
wc: WC-2026-10-01-write-door-delegations
---
Several tools checked a user's permission on a section and field but not on the specific record they then wrote, so the rule that keeps a user from changing parts of their own account (for example their own profile) did not apply there. Automatic translation, the poster-frame tool, the cache rebuild, file and CSV/MARC21/Zotero imports, the fields an upload fills in automatically, and the bulk revert of a process now check each record and field exactly as the edit form does. A field or row the user may not change is reported and left untouched; CSV imports now need permission on every imported column, including the creation and modification metadata columns.
