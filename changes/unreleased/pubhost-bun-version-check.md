---
title: The Publication hosts panel now shows in red a publication server whose Bun differs from the version the work system pins.
type: added
audience: admin
date: 2026-10-07
wc: WC-2026-10-03-publication-hosts-widget
---
Each host in **Maintenance › Publication hosts** has a new **Bun version** row, with the expected version (this work system's `.bun-version`) and the version the host reports side by side. It is green only when they are exactly equal, red on any difference (for example `1.4.1 != 1.4.2`), and unknown when the host cannot be reached or proved. The install guide now gives each site on a publication server its own Bun, installed by root in `/home/<site>/.bun/` at the pinned version, so each site can be upgraded on its own, and suggests naming each instance after its site's domain (`my-hosts.org` → `my_hosts_org`). See [Publication host agent](./install/publication_host.md#2-declare-the-instance).
