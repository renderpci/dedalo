---
title: The developer install and its test suite work over a PostgreSQL socket, never prompt for a password, and keep the dev server on this machine.
type: fixed
audience: developer
date: 2026-10-13
---
- **The test suite connects the way `.env` says.** `bun test` and `bun run test:db:setup` use `DB_SOCKET` when it is set, as the engine does. Before, they used `DB_HOST` only: on a socket install the suite reported that an existing test database did not exist, and `test:db:setup` failed with `password authentication failed`.
- **No pg client prompts.** Every `psql`, `pg_dump` and `pg_restore` that the engine or the suite starts runs with `-w` and a connection timeout. A missing password now fails at once with `no password supplied`, instead of waiting at `Password for user …:`.
- **`test:db:setup` refuses a server without pgvector** before it creates anything, and names the package to install. If a vector build fails after that, it removes its own database, so the next run starts clean without `--force`.
- **The development listener binds `127.0.0.1`.** A new key, `SERVER_TCP_HOST`, sets another address on purpose (for example `0.0.0.0`). Before, `SERVER_TCP_PORT` listened on every address, with full error details on.
- **The time zone and locale defaults are this machine's** (`TZ`, `LC_ALL`, `LANG`), falling back to `UTC` and `en-US`. Before, they were `Europe/Madrid` and `es-ES` everywhere.
- **A production install writes `DEDALO_MEDIA_ACCESS_MODE=publication`**, through the host steps or `--engine-only`, so the first boot no longer reports an unconfigured media mode.
- **Quieter output.** A retired ontology property is reported once per property, naming the first node and the command that lists every node, instead of once per node. A development server no longer prints the nginx reload notice, and `.env` no longer carries a comment about the retired engine.
- **A test run leaves nothing in the temp directory.** The session store's scratch directory and the scratch directories of two test files are removed.
- **The developer quickstart** now covers Linux: creating your PostgreSQL role, the socket directory per system, a RHEL, Rocky and Alma column, `git`, `curl` and `unzip`, pgvector, MariaDB and an AVIF-capable ImageMagick for the suite, which parity gates are expected red, and the GeoIP download at first boot.
