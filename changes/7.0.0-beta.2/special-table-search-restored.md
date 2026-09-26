---
title: Special-table component search restored
type: fixed
audience: user
date: 2026-07-17
wc: WC-037
---
`component_json`
gained a search builder (Activity's *Data* `dd551` and every JSON component
were previously unsearchable), and the Time Machine table (`dd15`), which
stores each component in a flat physical column, gained a component conformer
so its clauses are honored instead of returning all rows. Text matching on
these paths is accent- and case-insensitive (a safe superset that never hides
a match).
