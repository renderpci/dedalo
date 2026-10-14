---
title: The installer's System check edit, Review re-check and default-site note, salt hint and Docker abort messages now match what happens.
type: fixed
audience: admin
date: 2026-10-14
---
- **A failed System check**: the check asks no questions, so `edit` (`e` on the full screen, `edit` in `--plain`) now goes back to Install type, the screen whose answers it checked. Before, it only ran the check again. The prompt, the button and the key bar all say `edit (back to Install type)`.
- **A refused Review checked again**: the `checking again…` line disappears when the check ends. Before, it stayed frozen under the `yes` prompt or next to the result. When nothing is refused any more, the installer says `checked again — nothing is refused now: install is offered`.
- **The salt after a failure or a Ctrl-C**: once the engine steps have generated `DEDALO_SALT_STRING`, every ✖ block names the command that reads it back. The value itself is never printed there. Ctrl-C leaves the full screen, which was the only place that showed the salt. On docker and trial the command is now `docker compose … run --rm --no-deps dedalo grep ^DEDALO_SALT_STRING= /private/.env`, which works whether or not the stack is running. `docker.md`, `quickstart.md`, `production.md` and the installer reference describe this.
- **Docker / trial `--abort`**: the undo names only the containers that exist, measured with `compose ps --all`. An install stopped before the engine started now says `no container of dedalo, nginx, backup was ever created`. The kept-images hint and its `docker image rm` command list only images present on the machine, checked with `docker image inspect`. Before, it named `nginx:alpine` even when that image was never pulled, and the command failed.
- **Production, nginx installed by the run (Debian/Ubuntu)**: the Review's *To do* now says that the package's default site keeps port 80 (`port 80: the default site stays yours (/etc/nginx/sites-enabled/default, default_server) …`). Before, this note appeared only after the run, on the Done card.
