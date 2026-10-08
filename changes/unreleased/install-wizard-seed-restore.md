---
title: The browser install wizard no longer fails at the database step with `function "f_unaccent" already exists`.
type: fixed
audience: admin
date: 2026-10-08
---
After *Save config*, the restarted engine ran its schema upgrades on the still-empty database, and the seed restore then collided with them, leaving a half-built database. This affected every browser-wizard install, on every platform. Those upgrades now wait until the install is sealed, as on the command-line installer. *Finish* restarts the engine once more, so the sealed instance starts with all of them applied; the page reloads by itself a few seconds later.
