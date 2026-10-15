---
title: A Production instance can be installed by hand again, step by step, exactly as the installer does it.
type: added
audience: admin
date: 2026-10-12
---
[Install by hand](./install/manual_install.md) is the Production route without the installer: one section per host step, in the installer's order, with the commands that step runs and the full text of every file it writes (the systemd drop-ins, the nginx or Apache site, the media map, the host registry entry). The engine part — the database seed, the ontologies, the thesauri, the `root` password — runs through the installer itself, as the service user, with `--engine-only`. A host built this way has the same layout, units, site and backups as one the installer built, and later installer runs on the same host see it. Each section of [Production install](./install/production.md) links its hand version and back. *A host set up by hand* now points to this page; hosts already running the single `deploy/dedalo-ts.service` unit set keep their instructions in its last section.
