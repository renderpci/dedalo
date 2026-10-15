---
title: The official Dédalo image carries Dédalo's own url, description and licence labels.
type: fixed
audience: admin
date: 2026-10-14
---
The published image set only its title, source, revision, version and creation date, so `docker inspect` showed the base image's url, description and licence, or none. It now carries the same `org.opencontainers.image.source`, `url`, `description` and `licenses` values as an image built locally by the installer, read from one shared definition.
