---
title: A second Site Builder started by hand no longer stops the running service's agent runs.
type: fixed
audience: admin
date: 2026-10-01
breaking: false
---
When the Site Builder daemon was started a second time for an instance that was already running (for example, by hand as the service user while debugging), the second process stopped the running service's agent turns and marked its sessions interrupted. Only after that did it notice the instance was already served and exit.

The daemon now checks first. If the instance's socket or port already answers, or (with systemd confinement) systemd says another process is the service's main process, the second start exits with one line saying why. It stops nothing and writes nothing. Start the service with `systemctl`, not by hand.
