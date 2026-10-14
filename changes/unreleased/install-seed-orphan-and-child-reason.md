---
title: An install interrupted during the database restore can be resumed or undone at once, and the host shows the engine's own refusal.
type: fixed
audience: admin
date: 2026-10-14
---
- **Ctrl-C during the seed restore (Docker route above all)**: the restore's database session could outlive the removed engine container on the PostgreSQL server for about two hours, and until then `--resume` and `--abort` refused with `a seed restore into '<db>' is still running`. Now a Ctrl-C ends the restore's session before the installer exits (on Docker the engine container is given time to stop itself before it is removed). A `--resume` or `--abort` that holds the database's install lock ends a restore this install left behind, says so (`⚠ ended the seed restore an interrupted run left on '<db>' …`) and goes on. A restore that belongs to another install is still refused and left alone. Every installer database session also asks the server to drop it within about a minute if its client disappears.
- **The engine's reason in the host's ✖ line**: on the docker, trial and production routes, a refused or failed engine child is now quoted (`the engine steps failed: <its reason> — …`, `the engine child refused its --abort: <its reason> — nothing before it was undone`). Before, the reason was lost, and the abort said "see above" with nothing above.
- **Docs**: [troubleshooting](./install/troubleshooting.md#resuming-and-undoing-an-install) lists both refusals; the [installer reference](./install/installer_reference.md#resuming-an-install-resume) explains how an installer's own leftover restore is ended.
