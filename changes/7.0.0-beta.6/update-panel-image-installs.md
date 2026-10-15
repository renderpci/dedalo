---
title: On Docker installations, the Update code panel now shows how to install each release, and can hand the update to an optional host updater.
type: added
audience: admin
date: 2026-10-09
wc: WC-2026-10-09-update-code-image-channel
---
On a Docker installation the code lives inside the image, so the panel cannot replace it in place. Until now it only said *Update blocked*. It now shows an **Image updates** block: where this installation's image comes from (pulled from a registry, and whether that registry is one of Dédalo's, or built on the host), and, for the release you select, the exact command to run on the Docker host, `./deploy/dedalo-image-update.sh --version <version>`. The in-container readiness checks are still listed, folded, because they describe the in-place update this installation does not use.

You can also install the optional **host updater** on the Docker host (`sudo ./deploy/dedalo-image-updater.sh install-units`). It is off by default. With it installed, the panel offers **Request this update**: the host updater picks the request up within about a minute, runs the same command with its backup, health check and rollback, and the panel shows the outcome. A request needs the superuser and maintenance mode, and can only name a release on the normal upgrade path. The registry, pull or build, and the signature check are decided on the host, from `.dedalo.env`. The engine is never given control of Docker. See [the host updater](./install/docker.md#the-host-updater-optional).
