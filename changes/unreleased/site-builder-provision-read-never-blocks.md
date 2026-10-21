---
title: Site builder: `provision remove` and `provision adopt` can no longer be hung by a pipe planted at a turn HOME's `.gitconfig` or a site's `site.json`
type: security
audience: admin
date: 2026-10-21
---
The site builder provisioner reads a few files that an agent or a site
identity can write — a turn HOME's `.gitconfig` when an instance is removed, a
site's `site.json` when a pre-instance install is adopted. A named pipe planted
at either name made the root command wait forever. Those reads now open
without waiting and read only a regular file; anything else is treated as
unreadable, which each command already reports. Regular files —
including an operator's symlinked password file — are read as before.
