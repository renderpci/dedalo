# How a code update works

> See also: [Updating code](updating_code.md) · [Updates](index.md)

The panel self-update (`update_code` widget, `src/core/update/code_update.ts`) always performs a **clean, rename-based swap**: the release is downloaded, verified and prepared in a quarantine directory, the current tree is moved aside as a backup, and the new tree becomes the live tree in one rename. There is no in-place "incremental" overlay any more — an overlay could not delete files a release removed, and left nothing to roll back to.

This page describes what actually happens, what the update refuses, and how rollback works — the operator-facing walkthrough is in [Updating code](updating_code.md).

## The phases

The panel shows a phase track while the update runs. The phases, in order:

| Phase | What happens |
|---|---|
| `download` | The release archive is fetched from the configured code server (TLS, size-capped, the URL must be on a configured server). |
| `verify` | The archive's sha256 is checked against the declared checksum, the file is confirmed to be a ZIP, and every archive entry is pre-validated — no absolute paths, no traversal, no symlink entries. |
| `extract` | The archive is extracted into a quarantine directory under the backup root — never over the live tree. |
| `deps` | The release's dependencies are installed **in the quarantine**, with the running Bun, against the release's own lockfile. |
| `preflight` | The quarantine tree is boot-tested once (a smoke boot): it must start, answer a health check, and shut down cleanly. A release that cannot even start never replaces a working one. |
| `swap` | The rollback sentinel is written, the live tree is renamed into the backup directory, and the quarantine tree is renamed into place. `.git` is carried over from the old tree. |
| `restart` | The server restarts itself so the supervisor boots the new code. |
| `health` | The **browser** polls the server's health endpoint until the new version answers (or reports a rollback / a server that did not come back). |

Nothing before the `swap` phase touches the live tree: dependencies are installed and the new tree is boot-tested in quarantine first, so any failure up to and including `preflight` leaves the installation exactly as it was.

!!! note "What the smoke boot does — and does not — prove"
    The pre-flight boot proves the new tree parses, starts, and answers one request. It deliberately does **not** run the release's database migrations (those run only when the new code boots for real, after the swap), and it says nothing about behaviour under load.

## Preconditions — the update refuses, it does not warn

Before anything is downloaded, the update **refuses** unless all of the following hold:

- the operator is the **superuser** (`root`);
- the server is in **maintenance mode** (see [maintenance status](../maintenace_status.md));
- a **recent database backup** exists (newer than the configured backup window).

The backup requirement can be waived only by an explicit `waive_backup: true` in the update request — there is no panel checkbox for it, and every waiver is logged loudly in the server log with the requesting user.

## What else makes the update refuse

Each of these refuses with a message naming the problem, and changes nothing:

- **Runtime data inside the code tree** — media, state or session files resolving under the install directory would be silently carried into the backup by the swap. The refusal names the offending path and, where one exists, the environment key that moves it (for example `MEDIA_PATH` or `DEDALO_ONTOLOGY_RECOVERY_PATH`).
- **The backup directory inside the code tree** — its own swap would move it. Point `DEDALO_BACKUP_PATH` outside the tree.
- **Unknown entries at the tree root** — any top-level file or directory that the release does not ship and the engine does not account for would vanish into the backup. Move it out (or delete it) first.
- **Secret-shaped files under shipped directories** — untracked certificates, keys or `.env*` files nested inside the tree (for example under `deploy/certs/`) refuse for the same reason.
- **A containerised (image) deployment** — when the code tree lives inside a container image, a swap lands in the container's writable layer and is discarded on the next recreation. Such installs update by replacing the image, not through this panel. A bind-mounted checkout inside a container is fine.
- **A Bun version mismatch** — the release's `.bun-version` pin must match the running runtime; install the pinned Bun first, then retry.
- **No process supervisor detected** — see [Updating code](updating_code.md#panel-self-update).
- **A failed dependency install or a failed smoke boot** of the quarantine tree.
- **A checksum mismatch, a malformed archive, or an unsafe archive entry.**

## What is backed up

The swap moves the whole previous tree into the code backup directory — `DEDALO_BACKUP_PATH` (default `../backups/code`) — as `dedalo_<previous version>_<timestamp>/`, including its `node_modules`, so the backed-up tree is bootable offline, with no network and no dependency install. The backup directory must be on the same filesystem as the install so the renames are atomic; the update refuses otherwise.

`../private/` — your configuration and secrets — lives outside the code tree entirely and is never touched.

## Rollback

Before the first rename, the update writes a **rollback sentinel** (`last_code_update.json` in the backup root) with status `pending`, naming the backup directory the swap is about to create. Once the new code boots and reaches the database, it flips the sentinel to `confirmed`.

- **With the shipped systemd units** (main service, watchdog and rollback units — see the files under `deploy/`), a new tree that fails to come up is rolled back **automatically**: the supervisor restores the previous tree from the backup directory and starts it again. This works because the backup keeps its own `node_modules`.
- **Under any other supervisor** (a plain restart loop, pm2, …), there is no automatic rollback. You still have the full previous tree in the backup directory; the manual procedure is to stop the server, move the backup directory back to the install path, and start the server again.

If the swap itself fails midway, the update restores the previous tree in place and reports that nothing changed; in the rare case where the restore also fails, both trees are preserved (the old one in the backup directory, the new one parked in staging) and the panel tells you operator recovery is required — see the server log.

## Confirming the update

After the restart, confirm success by **both** values in the panel's readout changing: the engine **version** and the **build stamp** (the release's commit date — a real per-release value, so an unchanged stamp means old code is still running). The panel then prompts for a reload: the browser still holds the previous client code, and only logging in again loads the new one. If you dismiss the prompt, a persistent "Reload required" note with its own button remains.
