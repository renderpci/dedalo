---
title: Container installs take their nightly backups again, and the full-stack install no longer stops at "directories".
type: fixed
audience: admin
date: 2026-10-08
---
Since 2026-08-30 the `backups` volume of both compose stacks came up owned by root while the engine and the `backup` service run as an unprivileged user. Two things followed. The documented command-line install of the full stack (`docker-compose.yml`) stopped with `install failed: /backups/db`. And the nightly `backup` service wrote nothing at all. Because it could not write its own failure marker either, `docker compose ps` still showed it as *healthy*.

The image now creates that directory with the right owner. **Rebuild the image** (`docker compose build`, then `docker compose up -d`, adding `-f docker-compose.simple.yml --env-file .dedalo.env` on the simple stack). An existing `backups` volume is still empty, so it takes the right owner by itself; no manual step is needed. The `backup` service now reports *unhealthy* whenever it cannot write to `/backups`. The simple stack also declares which stores each run must produce, so a store that never ran is reported as a failure, as on the full stack. After updating, check that `/backups/LAST_OK` appears the morning after. See [Docker backups](./install/docker.md#backups-from-a-container).
