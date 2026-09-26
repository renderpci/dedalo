---
title: A row with no data collapsed the layout.
type: fixed
audience: user
date: 2026-08-02
---
The cells of an empty
situation/state column were not rendered at all, so the next row's label was
auto-placed into the hole and the labels marched across the columns. Empty
cells are now drawn, and read `—`.
