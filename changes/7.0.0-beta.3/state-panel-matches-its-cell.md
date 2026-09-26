---
title: The state breakdown panel contradicted its own cell.
type: fixed
audience: user
date: 2026-08-02
---
A source record that
saved nothing contributes 0 to the average but emits no `detail` item, so a
record with two linked resources and one value showed a hover panel reading
`total : 50%` beside a cell reading `25%` — two numbers, both labelled total.
The panel now lists **one row per source record** (the empty ones included,
as explicit `0%`) under a single ruled-off total that always equals the cell.
It also dropped every row after the first on a non-translatable leaf, and
clipped long option names to one letter per line.
