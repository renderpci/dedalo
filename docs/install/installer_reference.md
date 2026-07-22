# Installer reference

> See also: [Production install](production.md) · [Dev quickstart](dev_quickstart.md) · [Troubleshooting](troubleshooting.md) · [Install internals](../development/ts_install_internals.md)

The reference for the installer itself: every flag, every step, what the seed
contains, and — the part that surprises people — exactly which keys the installer
writes into `../private/.env` and which it does not.

Two front ends drive one engine (`src/core/install/`):

| Front end | Command | Use it when |
| --- | --- | --- |
| **Headless CLI** | `bun run scripts/install.ts <flags>` | servers, containers, CI. No restart, no pre-auth window. |
| **Browser wizard** | start the server with no `.env`, open `/dedalo/core/page/` | a workstation, or when you want the diagnostics panel |

!!! note "`dedalo:install`, not `install`"
    The same script is exposed as the npm task **`dedalo:install`**
    (`bun run dedalo:install -- <flags>`). It is not called `install` because
    that name is a reserved package-manager lifecycle hook. Prefer the direct
    `bun run scripts/install.ts` form — it is unambiguous.

## Prerequisites the installer checks for you

The pre-flight step (`src/core/install/init_test.ts`) is a hard gate — in the
wizard it is what unlocks the *Next* button. It checks exactly four things:

| Check | Failure message |
| --- | --- |
| The Bun runtime is at least 1.3 | `Bun x.y.z is older than the required 1.3.0` |
| The seed dump is present in the repo | `Install seed dump missing at …` |
| The private directory is creatable and writable | `Private config directory is not creatable/writable: …` |
| A `psql` client can be resolved | `PostgreSQL client (psql) not found — install the postgresql client tools` |

It does **not** check the media toolchain, the database contents or the reverse
proxy. Those fail later, and louder.

!!! warning "`psql` must not be older than the server"
    An older client refuses to connect to a newer server. The resolver checks
    `DEDALO_PG_BIN_PATH` first, then a small set of version-suffixed install
    locations, then `$PATH`. On a machine with several major versions, pin it:

    ```dotenv
    DEDALO_PG_BIN_PATH=/usr/lib/postgresql/18/bin
    ```

## Command-line flags

```shell
bun run scripts/install.ts \
  --db-name dedalo_main --db-user dedalo_user --entity mib \
  [--db-password '…'] [--db-host localhost] [--db-port 5432] [--db-socket /tmp] \
  [--entity-label 'My Institution'] [--locale es-ES] [--timezone Europe/Madrid] \
  [--langs lg-spa,lg-eng] [--app-lang lg-spa] [--data-lang lg-spa] \
  [--hierarchies es,lg] \
  [--media-path /srv/dedalo/media] [--socket /run/dedalo/dedalo_ts.sock] [--media-access-mode publication] \
  [--diffusion --mysql-name web_dedalo --mysql-user d --mysql-password '…'] \
  [--mailer --smtp-host smtp.example.org --smtp-user dedalo@example.org --smtp-password '…'] \
  [--skip-tools]
```

| Flag | Required | Default | Notes |
| --- | --- | --- | --- |
| `--db-name` | **yes** | — | the **empty** database you created |
| `--db-user` | **yes** | — | the role that owns it |
| `--entity` | **yes** | — | this instance's identifier, e.g. `mib` |
| root password | **yes** | — | `DEDALO_INSTALL_ROOT_PASSWORD` in the environment, or `--root-password` |
| `--db-password` | no | *(empty)* | empty means peer/trust auth over a local socket |
| `--db-host` | no | `/tmp` | a hostname, **or a unix-socket directory** when it starts with `/` |
| `--db-port` | no | `5432` | |
| `--db-socket` | no | — | an explicit socket directory |
| `--entity-label` | no | the entity name | shown on the login form |
| `--locale` | no | `es-ES` | |
| `--timezone` | no | `Europe/Madrid` | every database timestamp is stamped in it |
| `--langs` | no | the whole curated catalogue | comma list, e.g. `lg-spa,lg-eng` |
| `--app-lang` | no | first of `--langs` | the default interface language |
| `--data-lang` | no | first of `--langs` | the default data language |
| `--hierarchies` | no | none | comma list of hierarchy codes, e.g. `es,lg,ts` |
| `--media-path` | no | *(unset)* | the media root; write-probed during install **and persisted** to `.env` as `MEDIA_PATH` (replaces the old `MEDIA_PATH=…` env prefix) |
| `--socket` | no | `/tmp/dedalo_ts.sock` | persisted as `SERVER_UNIX_SOCKET`; set `/run/dedalo/dedalo_ts.sock` for a systemd + reverse-proxy deploy (the default does not match that layout) |
| `--media-access-mode` | no | *(unset = world-readable)* | persisted as `DEDALO_MEDIA_ACCESS_MODE` — `private` or `publication` |
| `--diffusion` | no | off | writes the MariaDB keys; pair with `--mysql-host/-port/-socket/-name/-user/-password` |
| `--mailer` | no | off | writes the outbound-email (SMTP) keys, enabling [password recovery](../management/password_recovery.md); requires `--smtp-host`, pair with `--smtp-port` (587), `--smtp-secure` (`tls`\|`ssl`\|`none`), `--smtp-user`, `--smtp-password`, `--smtp-from`, `--smtp-from-name`. The relay is probed (connection + auth, no email sent); a failure warns but does not stop the install |
| `--skip-tools` | no | off | skips tool registration (register them later from the Development Area) |
| `--information`, `--info-key` | no | `ts-install`, `ts` | free-text install provenance, recorded in the state file |

!!! danger "The root password never belongs on the command line"
    `--root-password` works, but an argv is visible in `ps` and lands in your
    shell history. Use the environment variable.

!!! warning "Languages are mandatory, and the defaults must be members of the set"
    The server refuses to boot without its language configuration. The CLI
    derives it up front and **refuses the install** if `--app-lang` or
    `--data-lang` is not one of `--langs` — better a clear refusal than an `.env`
    that crash-loops the server on the very next boot.

## What the installer does, in order

1. **Pre-flight checks** — the four gates above.
2. **Database connection** — the database must already exist. If it does not,
   the installer stops: it never creates a database.
3. **Write `../private/.env`** — see the next section. Any previous `.env` is
   renamed to `.env.bak.<timestamp>`.
4. **Directories** — creates and write-probes the private directory, the session
   store, the backups directory, and the media root (only if `MEDIA_PATH` is
   set). Writability is proven by writing and deleting a probe file, not by
   reading permission bits — a network mount can lie about the bits.
5. **Restore the database from the seed** — refused unless the database is empty.
6. **Set the root password** — hashed with Argon2id.
7. **Import and activate hierarchies** (if any were selected). Each selected TLD has its
   vendored term data copied in, **and is then activated**: the hierarchy is flagged active,
   its virtual ontology sections (`<tld>0`/`<tld>1`/`<tld>2`) are provisioned, and its
   thesaurus tree is rooted — so the hierarchies you ticked are browseable at the first
   login. Importing without activating leaves the terms in the database but unreachable
   (the section does not exist for the engine until its ontology does), so a TLD whose
   activation fails is reported as a **failed** hierarchy, not a successful import.
8. **Register tools** (unless `--skip-tools`).
9. **Seal the install** — refused unless a root user with a password actually
   exists. A forged *finish* can never seal a half-built instance.
10. **Verify the root login** — an actual login against the freshly installed
    database. This is the end-to-end proof, and it is why the CLI prints
    `✔ install complete — root login verified`.

## What the seed installs

Restoring the vendored seed (`install/db/dedalo_install.pgsql.gz`, about 2 MB
compressed) turns an empty database into a working Dédalo:

- the full **matrix / `dd_ontology` schema** — 31 tables, plus the functions and
  indexes;
- the **extensions** `btree_gin`, `pg_trgm` and `unaccent` (which is why the role
  needs the right to create them);
- the populated **core ontology** — about **3,700 `dd_ontology` rows**;
- the **`root` user** (with no password until step 6), the default project, and
  the *Admin* and *User* profiles.

!!! warning "A fresh install ships demo data"
    On the default path the installer also seeds the canonical **`test3`
    playground** — the sample section the test suite and the component reference
    pages use. It is harmless, but it is not your data. Remove its records from
    the section list when you no longer want it, or hide the section from the
    menu with `DEDALO_ENTITY_MENU_SKIP_TIPOS`.

The restore is all-or-nothing: the seed is fed to `psql` with
`ON_ERROR_STOP=1`, and a non-zero exit is a hard failure. There is no partial
success to clean up after.

## What `../private/.env` does — and does not — get

**The installer writes the file from scratch.** It contains exactly this:

| Section | Keys |
| --- | --- |
| Database | `DEDALO_DATABASE_CONN`, `DEDALO_USERNAME_CONN`, `DEDALO_PASSWORD_CONN`, `DEDALO_HOSTNAME_CONN`, `DEDALO_DB_PORT_CONN`, `DEDALO_SOCKET_CONN` |
| Entity / locale | `DEDALO_ENTITY`, `DEDALO_ENTITY_LABEL`, `DEDALO_TIMEZONE`, `DEDALO_LOCALE` |
| Languages | `DEDALO_APPLICATION_LANGS`, `DEDALO_PROJECTS_DEFAULT_LANGS`, `DEDALO_APPLICATION_LANGS_DEFAULT`, `DEDALO_DATA_LANG_DEFAULT`, `DEDALO_APPLICATION_LANG`, `DEDALO_DATA_LANG`, `DEDALO_STRUCTURE_LANG` |
| Secret | one generated secret, printed once |
| Serving / media *(only with `--media-path` / `--socket` / `--media-access-mode`)* | `MEDIA_PATH`, `SERVER_UNIX_SOCKET`, `DEDALO_MEDIA_ACCESS_MODE` |
| Diffusion *(only with `--diffusion`)* | `DEDALO_DIFFUSION_NATIVE`, `DEDALO_DIFFUSION_DB_*`, `DEDALO_DIFFUSION_INTERNAL_TOKEN` |
| Outbound email *(only with `--mailer`, or the wizard's optional step)* | `DEDALO_SMTP_HOST`, `DEDALO_SMTP_PORT`, `DEDALO_SMTP_SECURE`, `DEDALO_SMTP_USER`, `DEDALO_SMTP_PASS`, `DEDALO_SMTP_FROM`, `DEDALO_SMTP_FROM_NAME` |

!!! danger "The operational tuning is yours to append — afterwards"
    The **pool settings, the timeouts, the access log, and `ACTIVE_ONTOLOGY_TLDS`**
    are not written by the installer. Append them once the install has finished,
    then restart the server. (`MEDIA_PATH`, `SERVER_UNIX_SOCKET` and
    `DEDALO_MEDIA_ACCESS_MODE` **are** written — pass `--media-path`, `--socket` and
    `--media-access-mode`.)

    And the corollary that costs people an afternoon: **anything you hand-add to
    `.env` *before* running the installer is lost**, because the first, from-scratch
    write renames that file to `.env.bak.<timestamp>`. Configure *after*, never
    before. A *re-run* is different — it preserves every key it does not manage, so
    your appended tuning survives a later re-install.

The file is written through a two-phase commit (staged, then renamed into place)
at mode `0600`, inside a `0700` private directory.

??? tip "Relocating the private directory"
    Set **`DEDALO_PRIVATE_DIR`** to an absolute path and the whole private tree
    moves — `.env`, the session store, the state file, the backups. Both the
    configuration **read** side and the installer **write** side honour it, so
    the two never disagree. This is what makes a container image possible: an
    image has no writable parent directory above the repo. See
    [Docker](docker.md).

## The browser wizard

Start the server on a machine with **no `../private/.env`**. It logs
`INSTALL MODE`, skips every database-dependent boot step, and serves only the
wizard at `/dedalo/core/page/`.

Steps: **Diagnostics → Database → Entity → *(optional)* Diffusion →
*(optional)* Outbound email → Save config** … *(restart)* … **Verify →
Directories → Install database → Root password → log in → Hierarchies → Tools →
Finish**.

The **Entity** step also collects the working languages (a checkbox list, all
pre-checked) plus the default interface and data language.

The **Outbound email** step asks whether this installation will send email —
which is what enables the login screen's
[password recovery](../management/password_recovery.md). Enable it, enter the
SMTP relay settings (host, port, encryption, credentials, From address) and the
wizard verifies the connection and authentication against the relay (no email
is sent) before letting you continue. Skipping it is safe: the keys can be
appended to `../private/.env` at any later time.

!!! warning "The wizard restarts the server after *Save config*"
    Configuration is read **once**, at boot. So *Save config* writes `.env` and
    then **exits the process** — a supervisor must bring it back up with the real
    configuration:

    - in production, that is `Restart=always` in the systemd unit;
    - in a container, `restart: unless-stopped`;
    - on a laptop with neither, run the server under a restart loop, or (better)
      just use the CLI, which needs no restart at all:

      ```shell
      while true; do bun run src/server.ts; done
      ```

    The wizard survives the restart: the page stays open, the **Verify** button
    retries, and even a full reload resumes the wizard rather than dropping to
    the login form — until **Finish** seals the instance.

!!! danger "The install surface is pre-auth until it is sealed"
    A fresh instance has no users, so the install actions are reachable **without
    a login**. Before exposing an unsealed install to a network, restrict it by
    address:

    ```dotenv
    # comma list; the token `loopback` matches the local host
    DEDALO_INSTALL_ALLOWED_IPS=loopback,203.0.113.10
    ```

    The address is resolved from the trusted `X-Forwarded-For` hop, so **behind a
    proxy, `loopback` will not match** — name the real client address.

    Once **sealed**, the whole install surface answers `404` for good.

## The state file

`<private>/ts_state.json` records the install status: `configured` while the
wizard is mid-flight, then `sealed`. It is what makes a reload resume the wizard
instead of showing a login form, and what makes the sealed instance stay sealed
across restarts. It belongs in your backups (it is part of `../private/`).

## Further reading

The developer-facing view of the same machinery — the engine modules, the
install-mode boot, the restart mechanism, the gates — is
[the TS-native install engine](../development/ts_install_internals.md).
