---
title: A CSV import that carries the modification date and user keeps them on records whose cells embed dataframe frames.
type: fixed
audience: user
date: 2026-09-27
---
When a CSV row carried the record's *modified date* / *modified by* columns and
also a cell with embedded dataframe frames (a `{"data":…,"dataframe":…}` value
from a raw export), saving those frames re-stamped the record as modified
"now, by the importer", overwriting the imported values. The frames are now
saved without touching the stamp, so the record keeps the date and user from
the file — as it already did for every other column.
