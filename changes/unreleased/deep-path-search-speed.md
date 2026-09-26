---
title: Searching through a related record (e.g. a coin's type → its mint → the mint's name) is much faster.
type: fixed
audience: user
date: 2026-09-26
---
A filter on a field of a linked record used to scan every record of the section being searched, whatever the filter selected. On a 184,000-coin collection, searching coins by the name of their type's mint took about 3 seconds per paint (up to 9 with a cold cache). The search now starts from the few linked records that match and walks the links back, so the same search answers in a few tens of milliseconds.

The results are the same: the faster route is used only where it provably returns exactly the same records, and every other search (for example "is empty") keeps the previous route.
