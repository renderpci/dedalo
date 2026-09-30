---
title: Updating the ontology works from every configured master, not only the first
type: fixed
audience: admin
date: 2026-09-30
---

When `ONTOLOGY_SERVERS` listed several masters sharing the same access code,
choosing any of them except the first failed every file with
`Download failed … (origin mismatch: <chosen> != <first>)`. The engine now
identifies the chosen master by its address, so each listed server updates
from itself. A server address that is not in `ONTOLOGY_SERVERS` is still
refused before anything is downloaded.
