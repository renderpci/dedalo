---
title: The selected field is fully tinted orange — its list surfaces included — and its label stays readable in both themes
type: fixed
audience: user
date: 2026-10-18
---
When you clicked a field, only its label turned orange: the tint behind the whole
component was `#fffaf5`, 1.02:1 on the light card — invisible, so an active field
looked much like an inactive one.

The active field now paints the palette's own orange field tint, on the whole
component (label and value), in light and dark, and follows the theme a
reader has chosen.

The label on that tint is the palette's deep orange — 5.0:1 in light, 5.6:1 in
dark. The bright Dédalo orange
it was painted with before is a *fill* colour: on the tint it measured 2.05:1,
which is why the header of a selected Date or Text field was hard to read.

Nothing paints a slab of its own over that tint any more. A portal's list draws a
card — white in light, near-black in dark — for its rows to sit on, and each row
carries a grey remove column; both sat as boxes in the middle of the lit field.
Inside a selected field those surfaces no longer paint, at every depth, so a
portal nested in a row behaves like the one holding it, and an empty portal reads
as the fields around it. The rows, their columns and every control keep their
place: only the paint goes, so nothing moves.
