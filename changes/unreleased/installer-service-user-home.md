---
title: The installer no longer leaves Bun's cache in an existing hosting account's home.
type: fixed
audience: admin
date: 2026-10-12
---
On the Production route, the commands the installer runs with Bun as the service user (the dependency install, the engine steps, the migration check) now set `HOME` to the install folder on their command line (`runuser … -- /usr/bin/env HOME=<install folder> …`). `runuser` resets `HOME` to the account's own home, so with an existing hosting account whose home is not the install folder, Bun's caches were written there. The Review screen shows the new form, and [Install by hand](./install/manual_install.md) uses the same commands.
