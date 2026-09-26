---
title: The active-tools registry was re-queried once per rendered row.
type: fixed
audience: admin
date: 2026-08-03
---
The lookup
takes no arguments — it is the same query every time — and a media-icon widget
runs it per row, so a ten-row page ran it ten times for 43 ms. It is now read
once and cleared whenever the tools registry (`dd1324`), the install config or
a user profile is written, through the existing tool-cache invalidation.

!!! note "Out-of-band registry edits need a cache clear"
    Activating or deactivating a tool through the interface invalidates the
    cache immediately. Editing `matrix_tools` directly in the database does
    not — use the maintenance area's cache-clear action, or restart.
