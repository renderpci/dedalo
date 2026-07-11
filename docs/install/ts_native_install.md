# Installing the TypeScript/Bun server (TS-native install)

> See also: [Installation (PHP)](index.md) · [Configuration](../config/index.md) · [Apache configuration](apache_configuration.md)

The Dédalo v7 **TypeScript/Bun** server installs itself. Unlike earlier notes in
this manual, it **no longer needs PHP** to be provisioned: you create an empty
PostgreSQL database and run the installer, which restores the schema and the
core ontology from a bundled seed, sets the `root` password, and seals the
instance. There is **no config file to edit** — the installer writes
`../private/.env` for you.

!!! note "Which server is this?"
    This page is for the **TS/Bun rewrite** (`src/server.ts`). If you are
    installing the classic **PHP** application, follow the
    [PHP installation guide](index.md) instead. The two servers never share a
    `private/` directory.

## 1. Prerequisites

- **Bun** — the version pinned in `.bun-version`.
- **PostgreSQL** with the client tools (`psql`) available, at a version **≥ the
  server**. A version-suffixed install (e.g. Homebrew `postgresql@18`) is
  detected automatically, newest-first; or set `DEDALO_PG_BIN_PATH` to the
  `bin/` directory of the matching client.
- An **empty database and a role** that can connect to it. The installer
  restores *into* this database and **refuses a non-empty one** — it never
  clobbers existing data, and it does not create the database itself.
- The directory **one level above** the repo must be writable by the server
  user: the installer creates `../private/` (`chmod 0700`) for `.env`, the
  session store, `ts_state.json`, and backups.

!!! tip "Relocating the private directory"
    Set **`DEDALO_PRIVATE_DIR`** (an absolute path) to put the private tree
    somewhere other than the default sibling `../private/` — useful for
    containers or non-standard layouts. Both the config **read** side and the
    installer **write** side honor it, so the whole tree moves together.

!!! tip "Create the empty database"
    ```sql
    CREATE USER dedalo_user PASSWORD 'My_super_Secret_pw';
    CREATE DATABASE dedalo_xxx WITH ENCODING='UTF8' OWNER=dedalo_user;
    ```
    Remote databases work the same way — the installer authenticates the client
    tools with `PGPASSWORD` and passes `-h/-p`, so no `~/.pgpass` is required.

## 2. Option A — headless CLI (recommended for servers and CI)

Run the installer non-interactively; it needs no restart and finishes by
**verifying an actual `root` login** against the freshly installed database:

```shell
bun run scripts/install.ts \
  --db-name dedalo_xxx --db-user dedalo_user --db-host /tmp --db-port 5432 \
  --entity mib --root-password '••••••••' \
  [--db-password '…'] \
  [--hierarchies es,fr,ts] \
  [--diffusion --mysql-name web_dedalo --mysql-user d --mysql-password '…'] \
  [--skip-tools]
```

The same script is exposed as the npm task **`dedalo:install`**
(`bun run dedalo:install -- <flags>`).

!!! note "Flags"
    Required: `--db-name`, `--db-user`, `--entity`, and a root password
    (`--root-password` or the `DEDALO_INSTALL_ROOT_PASSWORD` environment
    variable — never echoed). Optional: `--db-host` (default `/tmp` socket dir),
    `--db-port` (`5432`), `--db-socket` (explicit socket directory),
    `--db-password`, `--entity-label`, `--information`, `--info-key`,
    `--timezone`, `--locale`, `--hierarchies` (comma list), `--diffusion` with
    `--mysql-host/--mysql-port/--mysql-socket/--mysql-name/--mysql-user/--mysql-password`,
    and `--skip-tools`. **Languages:** `--langs lg-eng,lg-spa` (omit → the whole
    curated catalog), `--app-lang` (default interface language), `--data-lang`
    (default data language) — the two defaults must be members of `--langs`.

!!! warning "Languages are mandatory"
    The server refuses to boot without its language configuration. The installer
    always writes it: the CLI defaults to the full curated catalog unless you
    pass `--langs`, and the browser wizard collects it on the Entity step (below).
    A hand-rolled `.env` MUST set `DEDALO_APPLICATION_LANGS`,
    `DEDALO_PROJECTS_DEFAULT_LANGS`, `DEDALO_APPLICATION_LANGS_DEFAULT` and
    `DEDALO_DATA_LANG_DEFAULT`.

The CLI runs, in order: pre-flight checks → database connection →
write `../private/.env` → create directories → **restore the database from the
seed** → **set the Argon2id root password** → import hierarchies → register
tools → seal → **verify root login**. When it prints
`✔ install complete — root login verified`, start the server:

```shell
bun run start
```

## 3. Option B — browser wizard

1. Start the server on the fresh machine **with no `../private/.env`**:

    ```shell
    bun run src/server.ts
    ```

    It logs `INSTALL MODE`, skips all database-dependent boot steps, and serves
    only the install wizard.

2. Open **`/dedalo/core/page/`** in a browser — the wizard mounts automatically.

    !!! note "Reaching the wizard (socket-only server)"
        Production serving is **unix-socket-only**, so the browser reaches the
        wizard through the **reverse proxy** at your Dédalo URL
        (`https://your-domain/dedalo/core/page/`) — the same URL the app will use
        after install. For a **local/dev** install, enable the TCP dev listener
        instead: start with `DEDALO_DEV_MODE=true SERVER_TCP_PORT=3600` and open
        `http://localhost:3600/dedalo/core/page/`.

3. Walk the steps: **Diagnostics → Database → Entity → *(optional)* Diffusion →
   Save config**. The **Entity** step also collects the **working languages** (a
   checkbox list of the curated catalog, all pre-checked) plus the **default
   interface** and **default data** language — at least one language is required.
   Saving writes `../private/.env` and the process **restarts**
   to load the real configuration (see the admonition below). After it restarts,
   click **Verify**, then **Directories → Install database → Root password →
   log in → Hierarchies → Tools → Finish**. Finish seals the instance and the
   page reloads into the normal application login.

!!! warning "The wizard restarts the server after 'Save config'"
    The server reads its configuration once at startup, so after `Save config`
    writes `../private/.env` the process exits and a **supervisor restarts it**
    into configured mode. In production this is
    `deploy/dedalo-ts.service` (`Restart=always`). For local development without
    systemd, either prefer the **CLI** (§2, no restart), or run the server under
    a restart loop, e.g.:

    ```shell
    while true; do bun run src/server.ts; done
    ```

    The wizard survives the restart: it keeps the page open across the reconnect
    (the **Verify** button retries), and even a full page **reload** during the
    install resumes the wizard rather than dropping to the login form — until the
    final **Finish** seals the instance.

!!! danger "Lock down the pre-auth install window on a network"
    While the instance is not yet sealed, the install actions are reachable
    **without a login** (a fresh instance has no users). Before exposing an
    unsealed install to a network, restrict it by IP:

    ```dotenv
    # ../private/.env — comma list; the token `loopback` allows the local host
    DEDALO_INSTALL_ALLOWED_IPS=loopback,203.0.113.10
    ```

    Once the install is **sealed** the whole install surface returns `404` and
    the server behaves as a normal configured instance.

## 4. What the seed installs

Restoring the bundled seed (`install/db/dedalo_install.pgsql.gz`) provisions an
empty database with:

- the full matrix / `dd_ontology` schema, the `btree_gin`, `pg_trgm` and
  `unaccent` extensions, and the functions and indexes;
- the populated **core ontology** (~3,500 `dd_ontology` rows);
- the **`root` user** (empty password until you set it) and the default project
  plus the *Admin* and *User* profiles.

## 5. After installing

- Log in as `root`, go to the **Development Area**, and register the tools
  (already done for you unless you passed `--skip-tools`).
- Create an admin user, then create your users and projects.
- **Diffusion / RAG** are optional and off by default. The diffusion step writes
  the MariaDB keys (`DEDALO_DIFFUSION_*`) into the same `../private/.env`; see
  [the diffusion engine](../diffusion/native_engine.md#configuration). RAG is
  configured afterwards with the `DEDALO_RAG_*` keys.

## 6. Notes and differences from the PHP install

!!! note "Argon2id passwords"
    The `root` password is stored as an **Argon2id** hash (not the PHP
    reversible format). A database installed by the TS server is therefore
    **TS-login-only** until the password is also re-set on a coexisting PHP
    install.

!!! note "`.env` uses PHP key names"
    The installer writes PHP-style keys (`DEDALO_DATABASE_CONN`, `DEDALO_ENTITY`,
    …) that the TS config layer resolves, so a co-located PHP install could read
    the same values. `DEDALO_SALT_STRING` is written for that coexistence but has
    no TS reader (TS sessions use random tokens, not salt-derived ones).

!!! note "Hierarchy activation is a post-install step"
    Selecting hierarchies imports their term/model data and consolidates the
    counters. Making them **browsable thesaurus trees** (registering in the
    `hierarchy1` master and provisioning the virtual sections) is done afterwards
    through the thesaurus tools. The core install is complete without it, and
    selecting no hierarchies is valid — the seed already carries the core
    ontology.

The developer-facing reference for the same process (engine modules, the
install-mode boot, the restart mechanism, and the gates) is
[The TS-native install engine](../development/ts_install_internals.md).
