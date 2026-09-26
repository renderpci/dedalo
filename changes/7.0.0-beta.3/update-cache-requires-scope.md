---
title: `tool_update_cache` now requires an explicit scope
type: changed
audience: admin
date: 2026-07-23
wc: WC-043
---
The silent
whole-section fallback is removed: a missing or malformed `sqo` fails closed
with `invalid_request`, and the client sends a deep clone of the caller
list's live `sqo`, so a run's scope is exactly the scope the list displays.
The confirm dialog carries the record and component counts; the media
regenerate path rebuilds only files that are missing (instead of re-encoding
everything), mints a `dd800` bulk-process record per run, and suppresses Time
Machine for the run's re-saves.
