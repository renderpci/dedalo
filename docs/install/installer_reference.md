# Installer reference

> See also: [Production install](production.md) · [Dev quickstart](dev_quickstart.md) · [Troubleshooting](troubleshooting.md) · [Install internals](../development/ts_install_internals.md)

The reference for the installer itself: every flag, every step, what the seed
contains, and — the part that surprises people — exactly which keys the installer
writes into `../private/.env` and which it does not.

Two front ends drive one engine (`src/core/install/`), and the guided container
script `install.sh` drives the headless CLI:

| Front end | Command | Use it when |
| --- | --- | --- |
| **Headless CLI** | `bun run scripts/install.ts <flags>` | servers, containers, CI. No restart, no pre-auth window. |
| **Browser wizard** | start the server with no `.env`, open `/dedalo/core/page/` | a workstation, or when you want the diagnostics panel |

!!! info "One install plan, whichever front end you use"
    The CLI, the wizard and `install.sh` all build the **same install plan**
    (`src/core/install/install_plan.ts`): the same defaults, the same list of
    `.env` keys, the same ordered steps. A given set of answers produces the same
    `.env` (apart from the generated secret) through every front end — a gate
    (`install_plan_parity_tripwire`) holds them to it. The defaults below are
    therefore THE defaults, not the CLI's.

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
  --db-name dedalo_main --db-user dedalo_user --entity myentity \
  [--db-password '…'] [--db-host localhost] [--db-port 5432] [--db-socket /var/run/postgresql] \
  [--entity-label 'My Institution'] [--locale es-ES] [--timezone Europe/Madrid] \
  [--langs lg-spa,lg-eng] [--app-lang lg-spa] [--data-lang lg-spa] \
  [--hierarchies default|none|es,fr] \
  [--media-path /srv/dedalo/media] [--socket /run/dedalo/dedalo_ts.sock] [--media-access-mode publication] \
  [--diffusion --mysql-name web_dedalo --mysql-user d --mysql-password '…'] \
  [--mailer --smtp-host smtp.example.org --smtp-user dedalo@example.org --smtp-password '…'] \
  [--no-update-servers] [--skip-tools] [--plan]
```

An **unknown flag is refused** (`unknown flag --x`) and so is a value flag with no
value after it (`--x needs a value`) — a typo never silently falls back to a
default. (`--yes` is gone: the CLI never asked anything, so it never had a
meaning.)

| Flag | Required | Default | Notes |
| --- | --- | --- | --- |
| `--db-name` | **yes** | — | the **empty** database you created |
| `--db-user` | **yes** | — | the role that owns it |
| `--entity` | **yes** | — | this instance's identifier, e.g. `myentity` |
| root password | **yes** | — | `DEDALO_INSTALL_ROOT_PASSWORD` in the environment, or `--root-password` |
| `--db-password` | no | *(empty)* | empty means peer/trust auth over a local socket |
| `--db-host` | no | `localhost` | a hostname, **or a unix-socket directory** when it starts with `/` (the default used to be `/tmp`; Debian/Ubuntu and RHEL do not put the PostgreSQL socket there) |
| `--db-port` | no | `5432` | |
| `--db-socket` | no | — | an explicit socket directory, e.g. `/var/run/postgresql` |
| `--entity-label` | no | the entity name | shown on the login form |
| `--locale` | no | `es-ES` | |
| `--timezone` | no | `Europe/Madrid` | every database timestamp is stamped in it |
| `--langs` | no | `lg-eng,lg-spa` (the other catalogue languages are optional) | the **working (data) languages**, comma list, e.g. `lg-spa,lg-eng`. The interface languages are not chosen: every language the interface is translated into is enabled, so users can switch to any of them at any time |
| `--app-lang` | no | first of `--langs` | the default interface language — any catalogue language, picked in `--langs` or not |
| `--data-lang` | no | first of `--langs` | the default data language |
| `--hierarchies` | no | `default` | the **optional** thesauri: `default` (the shared default set — today `es`), `none`, or a comma list of vendored codes, e.g. `es,fr`. Languages (`lg`) is a **core** thesaurus, activated with the database on every install: naming it here is dropped with a note. An unknown (not vendored) code is refused |
| `--media-path` | no | *(unset)* | the media root; write-probed during install **and persisted** to `.env` as `MEDIA_PATH` (replaces the old `MEDIA_PATH=…` env prefix) |
| `--socket` | no | `/tmp/dedalo_ts.sock` | persisted as `SERVER_UNIX_SOCKET`; set `/run/dedalo/dedalo_ts.sock` for a systemd + reverse-proxy deploy (the default does not match that layout) |
| `--media-access-mode` | no | *(unset = `publication`, fail-closed)* | persisted as `DEDALO_MEDIA_ACCESS_MODE` — `private`, `publication`, or `false` to deliberately serve an open media tree |
| `--diffusion` | no | off | writes the MariaDB keys; pair with `--mysql-host/-port/-socket/-name/-user/-password`. The MariaDB connection is probed; a failure warns but does not stop the install |
| `--mailer` | no | off | writes the outbound-email (SMTP) keys, enabling [password recovery](../management/password_recovery.md); requires `--smtp-host`, pair with `--smtp-port` (587), `--smtp-secure` (`tls`\|`ssl`\|`none`), `--smtp-user`, `--smtp-password`, `--smtp-from`, `--smtp-from-name`. The relay is probed (connection + auth, no email sent); a failure warns but does not stop the install |
| `--no-update-servers` | no | off | air-gapped install: writes `ONTOLOGY_SERVERS=[]` and `CODE_SERVERS=[]`, so no ontology or code update is ever offered. Without it, both name the official Dédalo master (see below) |
| `--skip-tools` | no | off | skips tool registration (register them later from the Development Area) |
| `--plan` | no | off | dry run: prints ONE JSON line — `env_keys`, `steps`, `hierarchies`, `notes`, `errors` — and exits `0` (valid) or `1`, touching nothing: no database, no files, no root password needed |
| `--information`, `--info-key` | no | `ts-install`, `ts` | free-text install provenance, recorded in the state file |

!!! danger "The root password never belongs on the command line"
    `--root-password` works, but an argv is visible in `ps` and lands in your
    shell history. Use the environment variable.

!!! tip "Check the plan before you run it"
    `--plan` validates the answers exactly as the install would, without needing
    the database:

    ```shell
    bun run scripts/install.ts --plan --db-name dedalo_main --db-user dedalo_user --entity myentity --hierarchies none
    ```

!!! warning "Languages are mandatory, and the defaults must be members of the set"
    The server refuses to boot without its language configuration. The CLI
    derives it up front and **refuses the install** if `--data-lang` is not one
    of `--langs`, or `--app-lang` is not a catalogue language — better a clear refusal than an `.env`
    that crash-loops the server on the very next boot.

## What the installer does, in order

The CLI prints each plan step as `→ [<step id>] …`; the ids are the same action
names the wizard calls, which is how one plan drives both. The pre-flight before
the first step and the root-login check after the last are the CLI's own
affordances (the wizard has its *Verify* screen and in-wizard login instead).

1. **Pre-flight checks** — the four gates above.
2. **`test_db_connection`** — the database must already exist, and be empty. If it
   does not exist, the installer stops: it never creates a database.
3. **`test_diffusion_connection`** *(only with `--diffusion`)* and
   **`test_mailer_connection`** *(only with `--mailer`)* — probes that **warn** on
   failure and let the install continue.
4. **`persist_config`** — writes `../private/.env`; see the next section. Any
   previous `.env` is renamed to `.env.bak.<timestamp>`.
5. **`check_directories`** — creates and write-probes the private directory, the
   session store, the backups directory, and the media root (only if `MEDIA_PATH`
   is set). Writability is proven by writing and deleting a probe file, not by
   reading permission bits — a network mount can lie about the bits.
6. **`install_db_from_default_file`** — restores the database from the seed
   (refused unless the database is empty), **then activates the core Languages
   thesaurus (`lg`)**. Its terms already ship in the seed, so activation is all it
   needs — there is no separate step for it, and nothing about it to choose.
7. **`set_root_pw`** — the root password, hashed with Argon2id.
8. **`install_hierarchies`** — imports and activates the **optional** thesauri (the
   shared default set unless `--hierarchies` says otherwise; `none` makes it a
   no-op). Each selected TLD has its vendored term data copied in, **and is then
   activated**: the hierarchy is flagged active, its virtual ontology sections
   (`<tld>0`/`<tld>1`/`<tld>2`) are provisioned, and its thesaurus tree is rooted —
   so the hierarchies you selected are browseable at the first login. Importing
   without activating leaves the terms in the database but unreachable (the section
   does not exist for the engine until its ontology does), so a TLD whose activation
   fails is a **failed** hierarchy — and a failed hierarchy **fails the install**:
   nothing is sealed (the wizard cannot get past a failed step either).
9. **`register_tools`** (unless `--skip-tools`).
10. **`install_finish`** — seals the install, refused unless a root user with a
    password actually exists. A forged *finish* can never seal a half-built
    instance.
11. **Verify the root login** — an actual login against the freshly installed
    database. This is the end-to-end proof, and it is why the CLI prints
    `✔ install complete — root login verified`.

!!! note "One default thesaurus set"
    Which optional thesauri are pre-selected is data, not code: the vendored
    descriptors in `install/import/hierarchy/hierarchies.json` flagged
    `install_checked_default`. Today that is **Spain (`es`)** alone. The CLI's
    default, `install.sh`'s `default` answer and the wizard's pre-ticked boxes all
    read that one list.

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
| Update servers | `ONTOLOGY_SERVERS`, `CODE_SERVERS` — the official master by default, `[]` with `--no-update-servers` |
| Serving / media *(only with `--media-path` / `--socket` / `--media-access-mode`)* | `MEDIA_PATH`, `SERVER_UNIX_SOCKET`, `DEDALO_MEDIA_ACCESS_MODE` |
| Diffusion *(only with `--diffusion`)* | `DEDALO_DIFFUSION_NATIVE`, `DEDALO_DIFFUSION_DB_*` |
| Outbound email *(only with `--mailer`, or the wizard's optional step)* | `DEDALO_SMTP_HOST`, `DEDALO_SMTP_PORT`, `DEDALO_SMTP_SECURE`, `DEDALO_SMTP_USER`, `DEDALO_SMTP_PASS`, `DEDALO_SMTP_FROM`, `DEDALO_SMTP_FROM_NAME` |

### The update servers

By default both keys name the official Dédalo master:

```dotenv
ONTOLOGY_SERVERS=[{"name":"Official Dédalo Ontology server","url":"https://v7.master.dedalo.dev/dedalo/core/api/v1/json/","code":"x3a0B4Y020Eg9w"}]
CODE_SERVERS=[{"name":"Official Dédalo code server","url":"https://v7.master.dedalo.dev/dedalo/core/api/v1/json/","code":"x3a0B4Y020Eg9w"}]
```

`ONTOLOGY_SERVERS` is where ontology updates come from; `CODE_SERVERS` is where
the [code update panel](../management/updates/updating_code.md) looks for releases.
`--no-update-servers` (answering *no* to the update-server question in the
wizard or in `install.sh`) writes both as `[]` — an air-gapped install that is never
offered an update. Add the keys to `.env` later to change your mind.

A **re-run** that keeps the official default does not overwrite a key whose
value in `.env` is a non-empty list — mirrors you added survive. A key holding
`[]` (an earlier air-gapped answer) is replaced by the official server, so
answering *yes* on a re-run switches an air-gapped install back on. Choosing the
air-gapped option always writes `[]`.

!!! note "The installer never writes `DEDALO_SUPERVISED`"
    Whether the server runs under a supervisor is a property of how it is
    **launched**, so it is declared by the systemd unit, the compose stack or the
    `bun run` script — never in `.env`, where the engine ignores it. See
    [Updating the code](../management/updates/updating_code.md).

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

The **Entity** step also collects the working languages (a checkbox list with
English and Spanish pre-checked; the others are optional) plus the default
interface and data language. The interface dropdown offers every translated
language — all of them stay switchable after the install — while the data
dropdown offers only the checked working languages. Before *Save config*
the wizard also asks whether to use the official update server (yes by default;
no is the air-gapped install described above).

The **Hierarchies** step lists the optional thesauri with the shared default
pre-ticked. Languages is not among them — it was activated with the database —
and submitting the step with nothing ticked is valid.

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
    a login**. Unset, `DEDALO_INSTALL_ALLOWED_IPS` therefore admits **the local
    machine only** — installing from anywhere else means naming the address
    first:

    ```dotenv
    # comma list. Entries: `loopback` (the local host), a literal address,
    # a CIDR range, or `any` (every address — the only way to open it).
    DEDALO_INSTALL_ALLOWED_IPS=loopback,203.0.113.10,10.0.0.0/24
    ```

    The address is resolved from the trusted `X-Forwarded-For` hop, so **behind a
    proxy, `loopback` will not match** — name the real client address. A request
    that carries no such hop is treated as local, so an unsealed instance on a
    bare TCP port with no proxy in front must be closed at the firewall as well:
    the allowlist alone cannot see who is calling. The engine prints the list in
    force in its start-up log.

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
