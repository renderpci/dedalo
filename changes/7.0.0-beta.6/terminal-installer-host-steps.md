---
title: The terminal installer sets up the whole host: production, Docker and trial install in one run.
type: added
audience: admin
date: 2026-10-12
breaking: true
---
A production install used to be a fifteen-step manual procedure. Now
`sudo sh install.sh --route production --instance <name>` (or the interactive
installer, choosing *Production*) does it as resumable steps: packages on the
newest Ubuntu, Debian and RHEL-family releases (an older one is refused with the
supported list), the instance user, PostgreSQL 18 with a password-less peer role,
ONE site file for the instance (nginx or Apache — never another site or the global
configuration), Let's Encrypt or your own certificate (checked against the address
and expiry), the systemd units, SELinux on RHEL, a first boot, the health watchdog
(armed only after the first boot) and a first backup verified store by store. Every
command is shown on the Review before it runs; `--resume` continues after a failure
or an interruption, `--abort` undoes only what the install created. The firewall
and the web server's modules are checked and told, never changed.

The Docker and trial routes now install from the terminal too — on Linux, or on a
Mac with Docker Desktop: the image is verified (cosign, and its version label),
`.dedalo.env` and `compose.override.yaml` are written, the engine steps run inside
the container with their secrets on standard input, and the stack is started and
probed.

nginx serves a root-owned, validated COPY of the media access rules the engine
generates (never the instance-writable file itself). After changing the media
access mode, refresh it with the command the installer prints at the end of the
install. `--abort` asks for `--confirm-database` before it undoes anything that
touches the database.

`install.sh` is now only the bootstrap — it verifies the release and the pinned Bun,
then starts the installer with your arguments. It no longer installs Docker, asks
questions or runs compose itself, and `--wizard` is retired. See
[Production host steps](./install/installer_reference.md#production-host-steps).
