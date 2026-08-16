# Updating code

> See also: [Updating ontology](updating_ontology.md) · [Updating data](updating_data.md) · [Updating code options](updating_code_options.md)

Dédalo is an active, rapidly developing software project. It is therefore important to keep it updated and in good condition for stability and security reasons.

There are two ways to update the server's code: the maintenance-panel **self-update** (below), driven by a configured code server, and a **manual** `git pull` (see [Updating manually](#updating-manually)). Both operate on this install's own tree — there is no separate install they delegate to.

The update process is based on the Dédalo cadence numbering. It is incremental and sometimes depends on the ontology version. Update the ontology before updating the Dédalo code, following [this guide](updating_ontology.md).

Updating the Dédalo code should be supervised by the IT team. Some changes — such as **new configuration settings** — must be applied manually in `../private/.env`, because neither update path touches your configuration.

!!! warning "Update pre-production system and test before update new versions into production system"
    Is highly recommended to test your new Dédalo installation before deploying the changes into the production environment. This will help ensure that the update will not have a negative impact on your catalogue.

## Panel self-update

The "Update code" maintenance panel (`update_code` widget,
`src/core/area_maintenance/widgets/update_code.ts`) downloads a release
archive from a configured code server, verifies its sha256 checksum,
pre-validates every archive entry, extracts it into a quarantine directory,
and only then swaps it onto the live tree — never over the live tree
directly.

!!! info "A release is installed only against a declared checksum"
    Every release the code server advertises carries the sha256 of its archive,
    and the update refuses outright if that checksum is missing, malformed, or
    does not match the bytes received. An archive that cannot be verified is
    never extracted.

It requires a process supervisor (systemd, Docker, pm2, …) so the
server can restart itself onto the new code: set `DEDALO_SUPERVISED=true`, or
run under a supervisor that sets `INVOCATION_ID`/`JOURNAL_STREAM`
(systemd does this for you). Without a detected supervisor the update
refuses rather than risk a self-exit with nothing to restart it.

1. Close access to the work system.

    Before updating the code, it is highly recommended to change the Dédalo status to maintenance. Follow [this guide](../maintenace_status.md) to change the Dédalo status and disable Dédalo access.

2. Enter the maintenance panel.

    Log in as root user and go to the Maintenance panel, located in:
    > System administration -> Maintenance

    **Optional**: make a backup of the database first. Follow [this guide](../backup.md#backup-the-work-system).

3. Locate the "Update code" control panel.

    Choose the server to obtain the code. By default, the panel shows the official Dédalo server, but you can configure other mirrors or providers via `CODE_SERVERS`, set in `../private/.env` (see the [Configuration Administrator Guide](../../config/administration.md)).

    Press "Update Dédalo code", choose the version you want, then select whether you want [Incremental or Clean](updating_code_options.md), and press `Update`.

    !!! warning "Re-login after update"
        After the update, log out and log in to Dédalo to safely refresh the browser's cache files.

4. Check for new settings.

    Some code updates add or change configuration settings; the "Check config" control panel flags these. Settings live in `../private/.env` — compare it against `../private/sample.env` and add any new key(s). See the [Configuration Administrator Guide](../../config/administration.md).

5. Follow the update instructions and update data.

    Locate the update code panel and check if it indicates further instructions. Some code updates require a data process; follow [update data](updating_data.md).

6. Open access to the work system.

    Revert the maintenance status to `false`.

7. Log out and re-login with a normal user.

## Running a code server

A Dédalo install can publish releases for other installs — the official server,
or an institution's own mirror. Set in `../private/.env` (see the
[Configuration Administrator Guide](../../config/administration.md)):

| Setting | Purpose |
|---|---|
| `IS_A_CODE_SERVER` | Answer release manifests at all. Without it every request is refused. |
| `DEDALO_CODE_FILES_DIR` | Where release archives are stored, `<major>/<major.minor>/<version>.zip`. |
| `DEDALO_CODE_SERVER_GIT_DIR` | A git checkout of the engine, only needed to BUILD releases. A pure mirror does not need it. |
| `CODE_SERVERS` | Must include this server's own entry: the `code` in it is the shared secret a caller has to present. |
| `DEDALO_CORS_ALLOWED_ORIGINS` | The origins allowed to read the manifest. Each client fetches it **from the browser**, so without this the update panel of every remote install fails with a network error. Use `*` for a public master. |

### Building a release

On a code server, the "Update code" panel shows two extra buttons, "Build
Dédalo code master branch" and "Build Dédalo code developer branch". Each
archives that branch of the configured git checkout at the engine's **current
version**, writing

```
<DEDALO_CODE_FILES_DIR>/<major>/<major.minor>/<version>.zip
<DEDALO_CODE_FILES_DIR>/<major>/<major.minor>/<version>.zip.sha256
```

The `.sha256` sidecar is what remote installs verify against — keep the two
files together; an archive without its sidecar cannot be installed. Both
buttons write the same filename for a given version, so a developer build
overwrites a master build of that version.

### Serving a release

The server publishes each archive at
`/dedalo/install/code/<version>/<version>.zip` (and its digest at the same URL
plus `.sha256`), mapping the request back to `DEDALO_CODE_FILES_DIR`. Only that
release's own files are reachable, and only while `IS_A_CODE_SERVER` is set —
so the storage directory does not have to sit in the web root, and should not.

!!! note "A built release is not automatically offered"
    A release is advertised only when the engine's update catalogue knows the
    target version, and only to callers for which it is the next step on the
    upgrade path. Building an archive publishes the file; it does not make every
    install eligible for it.

## Updating manually

For most installs, the simplest and most predictable update is manual:

```bash
git pull
bun install --frozen-lockfile
# restart the server (however your process supervisor does it), e.g.:
systemctl restart dedalo
```

Boot migrations (`install/db/migrations/`) run automatically at startup — there
is nothing extra to run for schema changes to `dedalo_ts_*` tables. Your
per-install configuration and secrets live in `../private/`, a sibling of the
install tree, so a `git pull` never touches it.

The Bun runtime itself is pinned per install (`.bun-version`); a code update
does not upgrade it. Upgrading Bun is a deliberate, separately-tested change.

1. Close access to the work system (maintenance mode, as above).
2. `git pull` (or check out the release tag you want) and
   `bun install --frozen-lockfile`.
3. Restart the server process.
4. Check for new settings: compare `../private/.env` against the shipped
   `../private/sample.env` and add any new key(s). See the
   [Configuration Administrator Guide](../../config/administration.md).
5. Follow any update instructions and [update data](updating_data.md) if the
   release requires it.
6. Open access to the work system again.
7. Log out and re-login with a normal user.

## Issues

Sometimes the update process asks you to log out and log in to set the correct files and refresh the browser cache. In some cases the update is left unfinished and some config variables are not assigned; the login may then show an alert as an error.

![Login error messages](assets/20250226_111925_login_errors.png)

Don't panic and press `continue` button. Navigate to the area maintenance and check the messages in the `Update data` or `Check config` panels about the errors.
