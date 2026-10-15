---
title: The developer information bar is shown to developers and root again, on any server.
type: fixed
audience: admin
date: 2026-09-26
---
The information strip at the top of the interface — engine version, build, database and runtime — is a developer surface. It had become tied to `DEDALO_DEV_MODE`, so on an installation that did not set that key it was hidden even from a logged-in developer, and setting it in `private/.env` did nothing because the container environment takes precedence. That is what a Docker installation saw: no developer bar, whatever the `.env` said.

The bar now follows the logged-in user, as the application itself did before the TypeScript rewrite: a user flagged as a developer in their record sees it, and root (superuser) always counts as a developer. `DEDALO_DEV_MODE` keeps its own meaning as the server posture — it selects the no-cache boot, the readable client libraries and the dev-only libraries the browser test harness needs — but it no longer decides who sees developer surfaces.

Debug-only surfaces (`SHOW_DEBUG`) are now shown to root alone, as before the rewrite; other developers keep the developer surfaces but not the debug ones, and non-developers see neither, even on a development server.

The main navigation bar is unchanged; only the extra information strip and the developer-only shortcuts are affected.

