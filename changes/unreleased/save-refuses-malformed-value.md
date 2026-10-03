---
title: A save whose value is not shaped like the field's data is now refused instead of stored.
type: fixed
audience: developer
date: 2026-10-03
wc: WC-2026-10-03-save-refuses-malformed-value-shape
---
The save API accepted a value in any shape and answered success: a bare text sent to a translatable text field was stored beside the other languages, and the next save in another language silently removed it; a number sent as text, an empty `null` item or a non-list replacement were stored or emptied the field the same way. Such a save is now refused with `request.invalid_data`, before anything is written. Each item must be an object — `{value: "…"}` for a text field, `{value: 12}` for a number, `{start: {…}}` for a date, `{iri: "…", title: "…"}` for a link — and a replacement (`set_data`) must be a list of them. The application's own editors already send these shapes. The CSV/JSON importer now converts numbers written as text in a number column (`"55"`) and numbers in a text column, and refuses a number cell it cannot read instead of storing it. Emptying a date field in the record editor now removes the stored date; before, it left an empty placeholder in the record. Records that still hold numbers stored as text by earlier versions keep working with the cache-update and propagate-data tools: those tools convert such numbers when they save the record again.
