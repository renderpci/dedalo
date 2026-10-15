---
title: "`provision init` reports the sealed pairing package as stale once the work host has used it, and removes it on request."
type: added
audience: admin
date: 2026-10-09
---
The sealed pairing package init writes on a two-machine install holds the agent's token and the work system's TLS key. Once the publication host's agent has recorded a command from the work host after the package was written, every later init run (and `--dry-run`) reports the package as stale and offers to remove it — the default on a terminal, `--decide pair.package=remove` without one, which also removes it earlier. Init removes only the file it wrote and records the removal in its journal; a later run reports the package as gone. See [Publication host agent](./install/publication_host.md#guided-install).
