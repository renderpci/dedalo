---
title: A publication host whose declaration drops the Publication API v1 now has its v1 pool, log rotation and v1 files removed by `provision apply`.
type: added
audience: admin
date: 2026-10-09
---
Re-declaring an existing v1+v2 publication host as v2-only used to leave its v1 FPM pool, the pool's log rotation, the v1 API releases and configuration (with its database credentials) and the pool's own directory behind. `provision apply` now keeps a record of what it provisioned (`provisioned.json` in the instance's configuration directory) and removes what the declaration no longer has: the pool through the FPM configtest and a reload (a pool that was the install's only one is put back and apply stops), the rotation, and both v1 trees, after the agent restarted. `provision check` lists each removal first. Only files that still carry the provisioner's own stamp for that instance, and trees exactly as it left them, are removed; anything edited, unstamped, foreign or with another owner stops the run and is named. The v1 SELinux rules go with them; the v1 account stays. A pool that moves to another FPM version is retired the same way. See [Publication host agent](./install/publication_host.md#guided-install).
