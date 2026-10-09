# Upgrading

> See also: [Production install](production.md) · [Docker](docker.md) · [Troubleshooting](troubleshooting.md) · [Backup](../management/backup.md) · [Migrating a v6 install to v7](migrating_from_v6.md)

Upgrading Dédalo is a `git pull`, a dependency install and a restart. Everything
that has to happen to the database happens **inside the server at boot**. This
page is about the things that are not automatic: the runtime pin, the scripts
and units installed outside the code tree, retired configuration keys, and
rollback.

## The model

**The repo is the artifact.** There is no build output to ship: the engine runs
TypeScript directly. A deploy is therefore `fetch` + `checkout <ref>` on the
host, and the ref is your rollback identity.

```shell
sudo -u dedalo git -C /opt/dedalo/master_dedalo fetch --all --tags
sudo -u dedalo git -C /opt/dedalo/master_dedalo checkout <tag-or-sha>
sudo -u dedalo bash -c 'cd /opt/dedalo/master_dedalo && /opt/dedalo/.bun/bin/bun install --frozen-lockfile --production'
systemctl restart dedalo-ts
curl --fail --unix-socket /run/dedalo/dedalo_ts.sock http://localhost/health
```

`bun install` has no `-C`: the `bash -c 'cd … && …'` is what makes it run in
the clone, because `sudo -u` keeps the directory you are standing in.

`deploy/deploy.sh` in the repo is meant to automate this — fetch, checkout,
dependencies, restart, health check, and a rollback to the previous ref if health
comes back red. It is **parked**: it has never run against a real host. As it
stands it runs `git` and `bun` as the SSH login user rather than `dedalo` (so the
files it creates have the wrong owner), and it needs `--bun /opt/dedalo/.bun/bin/bun`
for this layout. Use the commands above until it has been proven on a staging
server.

## Before you start

Take the [backups of every store](production.md#13-backups). All of them. The matrix
database alone is not a backup, and an upgrade is precisely when you find that
out.

## 1. Has the runtime pin moved?

```shell
git diff HEAD..<target-ref> -- .bun-version package.json
```

If `.bun-version` changed, **install the new runtime before you check out the new
code**:

```shell
BUN_VERSION=<the new pin>
curl -fsSL https://bun.sh/install | BUN_INSTALL=/opt/dedalo/.bun bash -s "bun-v${BUN_VERSION}"
chown -R dedalo:dedalo /opt/dedalo/.bun   # the installer ran as root; the service user owns the runtime
/opt/dedalo/.bun/bin/bun --version
```

!!! danger "Never `bun upgrade` on a production box"
    Upgrading the runtime is a deliberate act, and the order matters: change the
    pin, run the full test suite, *then* deploy. The engine is coupled to
    version-specific runtime behaviour — JSONB parameter inference above all —
    and a silent drift there corrupts data rather than slowing things down.

    The server echoes its runtime at boot and warns loudly when it does not match
    the pin. Read that line after every restart:

    ```text
    Dédalo TS server starting on Bun 1.4.2 (pinned: 1.4.2)
    ```

Because `ExecStart` points at `/opt/dedalo/.bun/bin/bun` — an absolute path, not
a `bun` on `$PATH` — installing the new runtime into that location *is* the
upgrade. There is no unit file to edit.

## 2. Pull the code and the dependencies

```shell
sudo -u dedalo git -C /opt/dedalo/master_dedalo pull --ff-only
sudo -u dedalo bash -c 'cd /opt/dedalo/master_dedalo && /opt/dedalo/.bun/bin/bun install --frozen-lockfile --production'
```

`--frozen-lockfile` refuses to resolve a dependency tree different from the one
that was tested. If it errors, the lockfile and `package.json` disagree — fix
that upstream, do not paper over it by dropping the flag.

Then refresh the two scripts the watchdog and rollback units run from outside
the code tree ([production step 10](production.md#10-run-the-engine-under-systemd)).
A pull does not update them:

```shell
install -m 0755 /opt/dedalo/master_dedalo/deploy/dedalo-code-rollback.sh \
                /opt/dedalo/master_dedalo/deploy/dedalo-ts-watchdog.sh /opt/dedalo/bin/
```

## 3. Check that the unit declares supervision

The unit in `/etc/systemd/system/` is a copy, and neither a pull nor an in-app
code update changes it. Units installed before 2026-10-08 lack a line the engine
now requires: the [code update panel](../management/updates/updating_code.md)
replaces the code only when the process manager declares that it will restart
the server, and the engine no longer guesses this from systemd's own variables.
Without the line every panel update is refused with *No supervisor declared*.

```shell
systemctl cat dedalo-ts | grep -E 'DEDALO_SUPERVISED|SuccessExitStatus|^Restart='
```

You should see `Environment=DEDALO_SUPERVISED=true`, `SuccessExitStatus=75` and
`Restart=always`. If any is missing, add it with a drop-in:

```shell
systemctl edit dedalo-ts
```

```ini
[Service]
Environment=DEDALO_SUPERVISED=true
SuccessExitStatus=75
Restart=always
```

`systemctl edit` reloads systemd when you save; the restart in the next step
applies it. Never put `DEDALO_SUPERVISED` in `../private/.env`: that file is read
by every launch method, the unsupervised `bun run start` included, so the engine
ignores the key there.

## 4. Restart, and let the migrations run

```shell
systemctl restart dedalo-ts
journalctl -u dedalo-ts -n 50 -o cat
```

**Schema migrations are applied at boot.** Ordered SQL files under
`install/db/migrations/` are applied one transaction per file, tracked in a
version table, and are idempotent. You never run a migrate command, and you must
never edit a migration file that has already been applied anywhere.

**The seed is never re-applied.** The restore refuses a non-empty database, and
after the first install the database is not empty. An upgrade cannot silently
reinstall over your data.

!!! note "The boot log is the deploy log"
    Watch for four lines: the runtime pin echo, the core module graph warm-up,
    the migration run, and `listening on unix socket …`. A warm-up failure is a
    **hard boot failure** by design — a visible crash loop beats a silently
    degraded server.

## 5. Retired configuration keys

A **retired** key is not an alias. It configures nothing, and leaving it in place
would silently fall back to the new key's default — the exact silent narrowing
Dédalo refuses to do. So the server **refuses to boot**:

```text
Config key 'DEDALO_PREFIX_TIPOS' is RETIRED: rename that line to
'ACTIVE_ONTOLOGY_TLDS' in ../private/.env. See private/sample.env.
```

| Retired key | Replacement |
| --- | --- |
| `DEDALO_PREFIX_TIPOS` | `ACTIVE_ONTOLOGY_TLDS` |
| `DEDALO_MEDIA_BASE_URL` | `DEDALO_MEDIA_EXPORT_BASE` |

Rename the line. The error names the file and the key, and it is fatal on
purpose: a boot that refuses is a five-minute fix, and a boot that quietly
narrows your active ontologies is a bug report six months later.

!!! note "`../private/.env` is append-only"
    Add a line for a new key, change a value on its existing line, rename a
    retired key — and nothing else: never a second line for a key already there,
    never a deleted line (the [configuration reference](../config/index.md) lists
    the legitimate edits). Every documented key is listed in `install/sample.env` of
    the code you just pulled, and in the [configuration reference](../config/config.md).
    `../private/sample.env` is the copy taken at install time, so it lacks every key
    added since.

!!! warning "No `ACTIVE_ONTOLOGY_TLDS` in your `.env`? Check `utoponymy` and `nexus`"
    When the key is unset, the engine falls back to the core ontologies:
    `dd, rsc, ontology, ontologytype, hierarchy, lg`. Before the installer chose
    domain ontologies (2026-10), that fallback also carried `utoponymy` and
    `nexus`. Both are ordinary domain ontologies now. If your installation uses
    either and your `.env` has no `ACTIVE_ONTOLOGY_TLDS`, add the key with
    everything you carry, or the ontology update panel stops refreshing them:

    ```dotenv
    ACTIVE_ONTOLOGY_TLDS=["dd","rsc","ontology","ontologytype","hierarchy","lg","oh","utoponymy","nexus"]
    ```

## 6. One-time data update — `section_id` becomes an integer

Installs migrated from v6 **before** the unification step existed store locator
addresses as strings (`"section_id": "7"`); the engine now writes and serves
integers (`"section_id": 7`) and tolerates the old form only during a
transition window. The one-time repair converts the stock:

```shell
# 1. maintenance mode ON, then a fresh backup (the repair writes no undo of its own)

# 2. dry-run — read-only; review the report before anything changes
bun scripts/migrate_section_id_locators.ts --all --user <your dd128 user id>

# 3. apply — converts, re-verifies independently, re-backfills the relation
#    index, and records the section_id_int_normalize marker in matrix_updates
bun scripts/migrate_section_id_locators.ts --all --user <your dd128 user id> --apply

# 4. a repeated dry-run must now report 0 changed rows; maintenance mode OFF
```

What to expect in the dry-run report:

- The **conversion count** is the workload; on a large install it reaches
  millions of values. Convertible means strictly numeric with no leading zero —
  nothing else is ever cast.
- **Findings** are values left alone, by class: external-service remote ids
  (zero-padded or token-shaped — those strings *are* the value), `''` and
  `"null"` junk (deletable only via the explicit
  `--purge-class=empty,null-literal` flag, after you have read the identities),
  and configuration tokens such as `"self"`. Findings are normal; an apply run
  is refused as red only if *convertible* values remain afterwards.

Three deliberate properties of the apply run:

- **It does not touch curation metadata.** No modified-by / modified-date stamp
  moves, and no Time Machine rows are written: a mechanical normalization is
  not an edit, and stamping it would overwrite the real record of who last
  curated each record. Recovery is the backup you took, not an undo trail.
- **`--user` attributes the marker row only** — `matrix_updates` permanently
  records who authorized the sweep. It never appears on any record.
- **It is idempotent.** A re-run converts nothing and changes nothing, so an
  interrupted run is simply run again.

Installs migrated with the current `close_v6_prepare_v7` package need none of
this — the same conversion runs inside the migration itself.

## 7. Verify

```shell
curl --fail --unix-socket /run/dedalo/dedalo_ts.sock http://localhost/health
```

Then, in the browser: log in, open a record, upload an image, run a search. A
green health check proves the process and the database; it does not prove the
media toolchain or the proxy.

## Rollback

```shell
sudo -u dedalo git -C /opt/dedalo/master_dedalo checkout <previous-ref>
sudo -u dedalo bash -c 'cd /opt/dedalo/master_dedalo && /opt/dedalo/.bun/bin/bun install --frozen-lockfile --production'
systemctl restart dedalo-ts
curl --fail --unix-socket /run/dedalo/dedalo_ts.sock http://localhost/health
```

!!! danger "Migrations are forward-only"
    There are no down-migrations. Rolling the **code** back across a release that
    added a migration leaves the new schema in place. That is usually harmless
    (the old code ignores what it does not know about) — but if the migration
    *changed* something the old code reads, the only correct rollback is
    **restore the database backup** you took in step 0.

    This is the whole reason the backup comes first.

## Upgrading a container stack

A container installation updates by replacing its **image**; one script does the
whole update, from the stack directory (the one holding `.dedalo.env`):

```shell
git pull                                         # the compose files and deploy/ come from the checkout
./deploy/dedalo-image-update.sh --version <X.Y.Z>
```

It pulls or builds the image as `.dedalo.env` says, takes a verified database
backup first, re-pins `DEDALO_VERSION`, waits for the health check and rolls
back on its own if the new version does not come up healthy. A bare
`docker compose build` no longer updates anything: the stacks run the pinned
`DEDALO_IMAGE:DEDALO_VERSION` and have no build of their own. Same rules as
above: migrations run at boot, the seed is never re-applied. See
[Docker › Upgrading](docker.md#upgrading) and, to go back after a successful
update, [rolling back by hand](docker.md#rolling-back-by-hand).

## What this page is *not* about

Updating the **ontology** and updating the **code from a master installation**
are in-app operations run from the Maintenance area (*System administration ›
Maintenance*), not deploy-time steps. They have their own documentation under
[Updates](../management/updates/index.md).
