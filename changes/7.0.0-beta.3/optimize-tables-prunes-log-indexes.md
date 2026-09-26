---
title: *Optimize tables* prunes redundant indexes on the two logs.
type: changed
audience: admin
date: 2026-07-23
---
The *Optimize tables* action of the [Database-info maintenance
widget](./core/areas/area_maintenance.md) prunes dead/redundant indexes on
the two logs by a single-source-of-truth policy (never a constraint or a
proven-used index); ~7.9 GB reclaimed on the reference install.
