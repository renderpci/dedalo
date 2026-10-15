---
title: A publication table too wide for MariaDB is refused by name before publishing starts.
type: fixed
audience: admin
date: 2026-10-06
---
MariaDB limits a table row to 65,535 bytes, and every `VARCHAR(n)` column
reserves 4 × n bytes of it whatever it holds. A table with many wide `varchar`
fields could not be created, and the publication stopped with "An unexpected
error stopped the diffusion run", for every table of the element and not just
the wide one. The element's plan now refuses such a table before anything is
published, naming the table, its width and its widest columns. To fix it,
change those fields to `field_text` (add `"index": "BTREE"` to keep the same
index) or reduce their `varchar`.
