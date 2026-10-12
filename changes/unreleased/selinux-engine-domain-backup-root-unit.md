---
title: SELinux lets the web server reach the Dédalo engine only, and no backup or rollback step runs as root on files the service user can change.
type: security
audience: admin
date: 2026-10-12
breaking: true
---
On RHEL-family hosts the installer's SELinux module now gives the engine a domain of
its own (`dedalo_engine_t`, entered when systemd starts the pinned runtime, which is
labelled `dedalo_engine_exec_t`). The web server may connect to that domain only.
Before, the rule named the generic service domain, so the web server could also
connect to the sockets of every other service started from `/opt` or `/usr/local`.
The engine keeps the rights it had. The installer relabels the runtime after loading
the module, checks the label, and refuses a first boot whose engine runs in any other
domain.

The single-instance reference units in `deploy/` no longer run anything as root that
the service user can change. The site-builder store (store 5) has moved out of
`dedalo-backup.service` into its own root unit, `dedalo-backup-site-builder.service`.
That unit reads no `.env` file, runs its scripts from the root-owned `/opt/dedalo/bin/`,
and writes to `/var/backups/dedalo-site-builder`. The backup failure alarm now runs as
the service user, also from `/opt/dedalo/bin/`. The code-update rollback unit,
`dedalo-ts-rollback.service`, now moves the code trees as the service user and runs only
its restart as root, as the installer's per-instance unit already did; it and the
watchdog unit name the code-update backup root (`--backup-root /opt/dedalo/backups/code`)
instead of reading it from `.env`. If you installed these units by hand, copy the three
backup scripts to `/opt/dedalo/bin/`, install the new backup unit, replace the rollback
and watchdog units (adjust `--backup-root` if your backups live elsewhere), and make sure
`/opt/dedalo` itself is owned by root ([A host set up by hand](./install/manual_host.md)).
