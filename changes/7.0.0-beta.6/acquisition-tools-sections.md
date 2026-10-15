---
title: The auction-URL and journal-URL import tools now declare the sections they belong to.
type: fixed
audience: admin
date: 2026-10-07
---
The two import tools are registered for their own sections only (`numisdata4` for auction URLs; `rsc205` and `rsc3` for journal URLs), so the restriction no longer depends on their server code loading. Run *Register tools* after the update to apply it.
