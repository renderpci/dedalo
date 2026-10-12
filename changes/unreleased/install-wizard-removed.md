---
title: The browser installer is gone — install with the terminal installer; a server with no configuration now refuses to start.
type: removed
audience: admin
date: 2026-10-12
breaking: true
wc: WC-2026-10-12-install-surface-removed, WC-2026-10-08-install-ip-denied-names-address
---
Every installation route — production, Docker, trial, developer — now runs the terminal installer (`./install.sh`, or `bun run dedalo:install`). The browser wizard, its unauthenticated install API and the `DEDALO_INSTALL_ALLOWED_IPS` and `DEDALO_INSTALL_NO_RESTART` settings are removed; delete those lines from your `.env` and compose overrides. A server started without configuration no longer serves a setup page: it writes one line to its log ("not installed: … run the installer", or "restore .env from backup" on an installed instance whose `.env` is gone) and exits with code 78, which the shipped systemd units do not restart. An interrupted install, or an interrupted re-run on a live instance, keeps the server from starting until it is finished with the installer's `--resume`. Hosts installed with an earlier `dedalo-ts@.service` template keep it until it is replaced: update the template from the release so the unit stops on code 78. Adding thesauri after install is unchanged (Maintenance › Import hierarchies). See [Installer reference](./install/installer_reference.md#a-server-that-is-not-installed-refuses-to-start).
