---
title: The CSV importer recognises the common record columns again (created and modified by/date, and the rest of the record information).
type: fixed
audience: user
date: 2026-10-07
---
A CSV exported from Dédalo carries the record information every section shares — who created and last modified the record and when, and the other fields of the *Record information* group. On import, those columns came up unchecked and could not be chosen in the column mapper, and the preflight check reported them as "not a component of section", so a re-import could not restore a record's history. They are listed again after the section's own fields, matched automatically by their column name, and imported with the dates and users the file carries (the record's "modified" stamp is not overwritten by the import itself). As before, these columns are offered to global administrators only, can only replace a value (never append to it). Computed fields, which store nothing of their own (the group's inverse references, a thesaurus's children list, indexations, external-service fields), are no longer offered in the column mapper at all; a column map that names one anyway is refused with an explanation. The Activity and Time machine sections, which have no record information, do not list them.
