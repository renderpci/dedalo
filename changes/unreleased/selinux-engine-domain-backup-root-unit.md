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

The reference units in `deploy/` for a host set up by hand no longer run anything as
root that the service user can change, and they now describe the host by role rather
than by fixed paths. The service user owns an **instance directory** of your choosing,
for example `/home/my_domain.org/dedalo` or `/opt/dedalo/app`. It holds the code, the
private directory and the backups, and the directory above it can stay root-owned.
A **root-owned bin directory** outside it, such as `/opt/dedalo/bin` or
`/usr/local/lib/dedalo/my_domain.org/bin`, holds the pinned runtime and every script a
root-started unit runs. The units name the two directories and the service user through
the placeholders `INSTANCE_DIR`, `ROOT_BIN_DIR` and `DEDALO_USER`, so one set of files
serves any layout. The site-builder store (store 5) has moved out of
`dedalo-backup.service` into its own root unit, `dedalo-backup-site-builder.service`,
which reads no `.env` file and writes to `/var/backups/dedalo-site-builder`. The backup
failure alarm now runs as the service user. The code-update rollback unit moves the code
trees as the service user and runs only its restart as root, and it and the watchdog
name the code-update backup root (`--backup-root INSTANCE_DIR/backups/code`) instead of
reading it from `.env`.

In-app code updates work on such a host: the update renames the code only inside the
instance directory. When the service user cannot write that directory, the update is
now refused before anything is downloaded, with a message naming the directory. Before,
it downloaded and tested the release and then failed when it tried to move the code.
A host set up by hand with the earlier layout, whose code sits directly in a root-owned
`/opt/dedalo`, must move its code, private directory and backups into an instance
directory and render the units again
([Upgrading › A host set up by hand](./install/upgrading.md#a-host-set-up-by-hand)).
