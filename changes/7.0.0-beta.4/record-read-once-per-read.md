---
title: A list page re-read the same record once per widget path.
type: fixed
audience: admin
date: 2026-08-03
---
The info widgets
ask for one component at a time, and each ask fetched a WHOLE matrix row — so a
`component_state` declaring eight paths over the same related record fetched
that record eight times, and a media-icon widget on the same page fetched it
again. On a ten-row page of an oral-history section that was **145 record reads
for 27 distinct records** — 81% pure repetition, and 328 ms of the 371 ms the
request spent in the database. The waste grew with both the page size and the
archive, which is why the page kept getting slower without anything changing.

A record is now fetched **once per read**, and the page-level batch loaders
hand their results to the same store, so a component asking for a record the
page already loaded costs no round trip. Same page: **3 record reads**, and
the count no longer grows with the page size. The list read went 421 ms →
66 ms, and an edit read of the same section 107 ms → 56 ms. Responses are
byte-for-byte identical — this is purely the number of round trips.
