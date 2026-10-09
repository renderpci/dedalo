---
title: The publication host's guided install is now proven on Ubuntu 26.04, including the agent's one root permission under its new sudo.
type: changed
audience: admin
date: 2026-10-09
---
The guided install of a publication host (`install.sh`, `provision init`) now passes its full drill on a real Ubuntu 26.04 machine with AppArmor enforcing: Apache and nginx, PHP 8.5, systemd 259 and polkit 127. Ubuntu 26.04 replaces `sudo` with sudo-rs; the drill now also checks, on every system, that the agent's single root permission (testing the web server configuration before a reload) works through the machine's own `sudo`, from the agent's own service, and allows nothing else. Ubuntu 26.04's sandboxed `apache2` service serves the site with its logs in `/var/log/apache2/<domain>`. No AppArmor profile confines the web servers, PHP-FPM, polkit or the agents, so no AppArmor change is needed. See [the publication host install guide](./install/publication_host.md).
