---
title: The install database is compiled from the repository and proven by a fresh install before it ships.
type: fixed
audience: admin
date: 2026-10-09
---
Maintenance → *Build database version* → *Build install version* refused with "not
runnable on this engine", pointing at a maintenance dashboard that no longer exists. It
now compiles `install/db/dedalo_install.pgsql.gz` — the database every fresh install
starts from — from files in the repository only (the schema and its migrations, the
core ontology release packages, the languages and hierarchy registry files, the default
accounts), never from an installation's database, so it cannot carry one
installation's data or mistakes into every new install. Before the file is replaced
the result installs itself in a scratch database and is checked; the same command is
`bun run seed:build`. The seed ships with a manifest that records what it was built
from. See [the seed](./development/ts_install_internals.md#the-install-seed).
