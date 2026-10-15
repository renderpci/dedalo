---
title: The installer's System check no longer fails on a host without PostgreSQL
type: fixed
audience: admin
date: 2026-10-13
---
On a freshly installed server (no PostgreSQL client yet), the **System check** screen of `sh install.sh` failed with `the system probe failed unexpectedly (Error)` and still printed **System ready.** beside it. Now:

- **Production** shows the PostgreSQL client as `ok` when it is absent — the installer installs PostgreSQL 18 itself — and warns when a client of another major is present.
- **Docker** and **Trial** no longer check a host PostgreSQL at all; they show the **Docker**, **Compose** and **Disk** rows instead, with the same sentences the install's own check uses.
- **Developer** shows a failed row with the fix: this route installs into an existing PostgreSQL and needs its client.
- **System ready.** appears only when nothing failed. A check that could not run says so, with the error's class, its first line and the file holding the full text, to report.

See [The System check screen](./install/troubleshooting.md#the-system-check-screen).
