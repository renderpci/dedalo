---
title: "Production and by-hand installs: one backup directory from the first run, another web server refused, and an abort that tells a started instance from one that never started."
type: fixed
audience: admin
date: 2026-10-14
---
- **`--engine-only --backup-dir`** (the by-hand host procedure) now checks and creates the backup directory it writes to `.env` (`DEDALO_BACKUP_DIR=<backup dir>/db`) from the first run. It used to create `<private>/backups/db` instead, and a `--resume` after an interruption then stopped at `check_directories`. When that check fails, it now names the directory.
- **Another web server is refused before any change.** The Production System check refuses a run whose ports (80 and 443, or yours) another program holds, such as another instance's nginx when Apache is chosen, and a run that would install a second web server beside the installed one. The Review's *To do* list names the program before you type `yes`.
- **An abort after an interruption inside `host_first_boot`, before the unit was started,** now removes the instance completely. It used to count the instance as served and keep its user, database and code for removal by hand.
- **An abort interrupted during `host_packages`** names only the packages and repositories the host really has as kept, never a package the run did not get to install.
- **A failed or interrupted `--engine-only` run** says to run the same command again with `--resume` or `--abort`, instead of printing a `bun run scripts/install.ts` command that would run as root with other answers.
- **A resume says what it did with each step already done:** checked again (`verified again: …`) or nothing to check, instead of "skipped".
- **The Review** marks a directory that already exists on its own `mkdir` line (*exists: not created*).
- **Install by hand ([manual_install.md](./install/manual_install.md)):** the host check reads `/etc/os-release` in a subshell, so it no longer overwrites the page's `$NAME` (the public address) with the distribution's name. The host record's `nginx_map_owner` is rendered from what `host_web_site` did. The site file's header names both the installer and the page. Both chain-trust failures that `openssl verify` prints are named. Its *One web server* check now says what the installer refuses: installing one web server beside the other, and any other program on the ports; a host with both already installed goes ahead.
- **[Removing an instance](./install/multi_instance.md#removing-an-instance):** take the backup before any `--abort` (a direct `pg_dump` is given for after one), clear the failed units, and remove the instance's web logs and timer stamps. The steps an abort already did are marked.
- **[Production](./install/production.md):** the `host_engine` Verify enters the `0750` install folder as the service user, so it no longer fails with *Permission denied*.
