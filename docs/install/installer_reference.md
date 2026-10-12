# Installer reference

> See also: [Production install](production.md) · [Dev quickstart](dev_quickstart.md) · [Troubleshooting](troubleshooting.md) · [Install internals](../development/ts_install_internals.md)

The reference for the installer itself: every flag, every step, what the seed
contains, how the domain ontologies are chosen and installed, and — the part that
surprises people — exactly which keys the installer writes into `../private/.env`
and which it does not.

Three front ends drive one engine (`src/core/install/`), and the guided container
script `install.sh` drives the headless CLI:

| Front end | Command | Use it when |
| --- | --- | --- |
| **Interactive terminal** | `bun run scripts/install.ts` (no answer flag) — `--plain` for the line mode | a person at a terminal: it asks, checks each answer as you go, and shows the whole plan before anything runs. See [Interactive mode](#interactive-mode) |
| **Headless CLI** | `bun run scripts/install.ts <flags>` | servers, containers, CI. No restart, no pre-auth window. |
| **Browser wizard** | start the server with no `.env`, open `/dedalo/core/page/` | a workstation, or when you want the diagnostics panel (it is being retired in favour of the interactive terminal) |

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
DEDALO_INSTALL_ROOT_PASSWORD='…' [DEDALO_INSTALL_DB_PASSWORD='…'] \
bun run scripts/install.ts \
  --db-name dedalo_main --db-user dedalo_user --entity myentity \
  [--answers answers.json] [--secrets-stdin] [--execute] \
  [--db-host localhost] [--db-port 5432] [--db-socket /var/run/postgresql] \
  [--entity-label 'My Institution'] [--locale es-ES] [--timezone Europe/Madrid] \
  [--langs lg-eng,lg-spa] [--app-lang lg-eng] [--data-lang lg-eng] \
  [--hierarchies default|none|es,fr] \
  [--ontologies default|oh,tch] [--ontology-source <dir|archive>] \
  [--decline-dependencies tchi,ts:hierarchy1] \
  [--media-path /srv/dedalo/media] [--socket /run/dedalo/dedalo_ts.sock] [--media-access-mode publication] \
  [--diffusion --mysql-name web_dedalo --mysql-user d] \
  [--mailer --smtp-host smtp.example.org --smtp-user dedalo@example.org] \
  [--no-update-servers] [--skip-tools] [--plan | --list-ontologies | --list-hierarchies]

bun run scripts/install.ts --resume                              # finish an interrupted install
bun run scripts/install.ts --abort --confirm-database dedalo_main # undo it
bun run scripts/install.ts                                       # interactive (a terminal), see below
bun run scripts/install.ts --plain                               # interactive, plain line mode
```

An **unknown flag is refused** (`unknown flag --x`) and so is a value flag with no
value after it (`--x needs a value`) — a typo never silently falls back to a
default. (`--yes` is gone: the CLI never asked anything, so it never had a
meaning.)

| Flag | Required | Default | Notes |
| --- | --- | --- | --- |
| `--route` | no | `developer` | how this Dédalo runs: `production` (native services, a named instance), `docker` (the compose stack), `trial` (Docker **without** media protection — evaluation only) or `developer` (a git checkout; the behaviour before routes). The route changes the [defaults below](#route-defaults), never what is installed. An unknown route is refused |
| `--instance` | with `--route production` | — | the instance name on a production host that can carry several: a lowercase letter, then `a-z`, `0-9` or `_`, 28 characters at most (it becomes the unix user `ded_<instance>`, the database and role `dedalo_<instance>`, a path segment and a systemd instance — see [Several instances on one host](multi_instance.md)). Refused on any other route |
| `--db-name` | **yes** (except `production` / `docker` / `trial`, which derive it) | see [Route defaults](#route-defaults) | the **empty** database you created |
| `--db-user` | **yes** (except `production` / `docker` / `trial`) | see [Route defaults](#route-defaults) | the role that owns it |
| `--entity` | **yes** | — | this instance's identifier, e.g. `myentity` |
| root password | **yes** | — | `DEDALO_INSTALL_ROOT_PASSWORD` in the environment, or `--secrets-stdin`; held to the password policy **before anything is written** (see [Secrets](#secrets)) |
| database password | no | *(empty)* | `DEDALO_INSTALL_DB_PASSWORD`, or `--secrets-stdin`; empty means peer/trust auth over a local socket. `--db-password` still works but warns |
| `--db-host` | no | `localhost` | a hostname, **or a unix-socket directory** when it starts with `/` (the default used to be `/tmp`; Debian/Ubuntu and RHEL do not put the PostgreSQL socket there) |
| `--db-port` | no | `5432` | |
| `--db-socket` | no | — | a PostgreSQL unix-socket directory, e.g. `/var/run/postgresql`; written as `DB_SOCKET`. When given it **wins** over `--db-host`: the connection test, the server and the backups all connect through it. Must be an absolute path |
| `--entity-label` | no | the entity name | shown on the login form |
| `--locale` | no | `es-ES` | |
| `--timezone` | no | `Europe/Madrid` | every database timestamp is stamped in it |
| `--langs` | no | `lg-eng,lg-spa` (the other catalogue languages are optional) | the installation's languages — interface **and** data — comma list, e.g. `lg-eng,lg-spa` |
| `--app-lang` | no | first of `--langs` | the default interface language |
| `--data-lang` | no | first of `--langs` | the default data language |
| `--hierarchies` | no | `default` | the **optional** thesauri: `default` (nothing beyond the thesauri the chosen ontologies declare), `none`, or a comma list of codes from the release's thesaurus manifest, e.g. `es,fr` (`--list-hierarchies` prints them). No thesaurus — and no country's toponymy — is ever pre-selected; a plan with no toponymy prints a suggestion to import your own country's. Languages (`lg`) is a **core** thesaurus, activated with the database on every install: naming it here is dropped with a note. A code the manifest does not list is refused. The thesauri the chosen ontologies **declare** are added to this list (even with `none`) unless `--decline-dependencies` names them — a mandatory one is strongly recommended, and declining it is a warning, never an error — see [Dependencies are declared, never guessed](#dependencies-are-declared-never-guessed) |
| `--ontologies` | no | `default` (= `oh`) | the **domain** ontologies, a comma list of TLDs — at least one. `default` is Oral history (`oh`), built into the release. Any other TLD comes from the ontology source, together with the ontologies it **declares** as dependencies. A core TLD is dropped with a note; `none` and an unknown TLD are refused. See [Domain ontologies](#domain-ontologies) |
| `--decline-dependencies` | no | *(none)* | the declared dependencies you do not want, a comma list. Each item is a TLD (declines it as an ontology and as a thesaurus) or `<tld>:ontology35` / `<tld>:hierarchy1` (declines only one of the two). Any **thesaurus** can be declined; declining a mandatory one prints a warning (strongly recommended, installable later). A mandatory **ontology** cannot be declined: naming one has no effect, and it is installed. A malformed item is refused |
| `--ontology-source` | no | *(unset)* | a local directory, or a `.tar` / `.tar.gz` / `.tgz` archive of one, in the ontology server's export layout. The non-built-in ontologies come from it instead of the update server — a fully [offline install](#offline-installs-ontology-source) |
| `--media-path` | no | *(unset)* | the media root; write-probed during install **and persisted** to `.env` as `MEDIA_PATH` (replaces the old `MEDIA_PATH=…` env prefix) |
| `--socket` | no | `/tmp/dedalo_ts.sock` | persisted as `SERVER_UNIX_SOCKET`; set `/run/dedalo/dedalo_ts.sock` for a systemd + reverse-proxy deploy (the default does not match that layout) |
| `--media-access-mode` | no | *(unset = `publication`, fail-closed)* | persisted as `DEDALO_MEDIA_ACCESS_MODE` — `private`, `publication`, or `false` to deliberately serve an open media tree |
| `--diffusion` | no | off | writes the MariaDB keys; pair with `--mysql-host/-port/-socket/-name/-user/-password`. `--mysql-user` is required; `--mysql-name` defaults to `web_dedalo` (`web_<instance>` on production). The MariaDB connection is probed; a failure warns but does not stop the install |
| `--mailer` | no | off | writes the outbound-email (SMTP) keys, enabling [password recovery](../management/password_recovery.md); requires `--smtp-host`, pair with `--smtp-port` (587), `--smtp-secure` (`tls`\|`ssl`\|`none`), `--smtp-user`, `--smtp-password`, `--smtp-from`, `--smtp-from-name`. The relay is probed (connection + auth, no email sent); a failure warns but does not stop the install |
| `--no-update-servers` | no | off | air-gapped install: writes `ONTOLOGY_SERVERS=[]` and `CODE_SERVERS=[]`, so no ontology or code update is ever offered. Without it, both name the official Dédalo master (see below) |
| `--skip-tools` | no | off | skips tool registration (register them later from the Development Area) |
| `--plan` | no | off | dry run: prints ONE JSON line — `env_keys`, `steps`, `hierarchies`, `hierarchy_dependencies`, `suggestions`, `ontologies`, `declined_dependencies`, `ontology_source`, `ontology_install`, `active_ontology_tlds`, `notes`, `warnings`, `errors` — and exits `0` (valid) or `1`. It touches no database and no file and needs no root password. A choice beyond `oh` reads the source's catalog (one request to the update server, or the `--ontology-source` files) |
| `--list-ontologies` | no | off | prints ONE JSON line — the ontology catalog of the selected source, exactly what the wizard's *Ontologies* step shows — and exits. It needs no other answer. See [Listing the catalog](#listing-the-catalog) |
| `--list-hierarchies` | no | off | prints ONE JSON line — the thesaurus offer of the release's manifest (`core`, `entries` of `{tld, name, typology_id, typology_name, has_data, dependencies}` — `dependencies` being the thesauri the entry declares, `{tld, mandatory}` each —, the toponymy `suggestion`, `errors`) — and exits. It needs no other answer. See [The thesaurus manifest](#the-thesaurus-manifest-hierarchyjson) |
| `--list-langs` | no | off | prints ONE JSON line — the languages the installer offers (`langs` of `{code, label}`, in presentation order) and the `default` set — and exits |
| `--information`, `--info-key` | no | `ts-install`, `ts` | the install's **fingerprint**, written once to the server state file (`ts_state.json`) and never changed afterwards. A fresh install hashes passwords with Argon2 and does not use them; they matter only to read passwords migrated from a v6 installation |
| `--answers <file>` | no | — | the answers as a file (the wizard's field names); see [The answers file](#the-answers-file-answers). A key set both there and by a flag is refused |
| `--secrets-stdin` | no | off | read the secrets as ONE JSON object from standard input; see [Secrets](#secrets) |
| `--execute` | no | off | explicitly unattended: the installer never asks anything and refuses a missing answer or secret; the flag is recorded on the run. Without it, a run whose standard input is a terminal **asks** for what is missing: the root password of a fresh install, or the secrets a `--resume` still needs — hidden, typed twice, the root password checked rule by rule. A run without a terminal (a pipe, a CI job) never asks |
| `--plain` | no | off | the interactive installer in [plain line mode](#plain-mode) — no full-screen drawing, no colour, one question per line. Takes no answer flag (`--resume` aside) |
| `--write-answers <file>` | no | — | also write the answers as an [answers file](#the-answers-file-answers) (`0600`, no secret in it): a headless run writes it once the plan is valid, before anything runs (`--plan` included); the interactive Review's `write` does the same. Refused when the path is inside the private directory, or when it exists and is not an answers file |
| `--resume` | no | off | finish the install recorded in `<private>/install/`; see [Resuming an install](#resuming-an-install-resume) |
| `--abort` | no | off | undo the install recorded in `<private>/install/`; needs `--confirm-database`. See [Undoing an install](#undoing-an-install-abort) |
| `--confirm-database <name>` | with `--abort` | — | must equal the install's database name before `--abort` resets it |

The run-control flags exclude each other where they cannot mean anything:
`--resume` with `--abort`, `--plan` or a `--list-*` flag with either,
`--confirm-database` without `--abort`, `--plain` with `--abort` or with any
answer source (`--plain --resume` is allowed: it asks the secrets a resume
needs), and `--write-answers` with `--resume`, `--abort` or a `--list-*` flag
are refused. A value that starts with `--` (or is empty) can be given as
`--flag=value`; the installer prints its own command lines in that form.

### Route defaults

A route changes the **defaults** of a few answers — what an answer you do not
give falls back to. It never changes the steps, and a flag you give always wins.

| Answer | `developer` | `production` (instance `<i>`) | `docker` / `trial` |
| --- | --- | --- | --- |
| database host | `localhost` | `localhost` | `postgres` (the compose service) |
| database name | — (required) | `dedalo_<i>` | `dedalo` |
| database role | — (required) | `dedalo_<i>` (the same name, as [multi_instance.md](multi_instance.md) creates it) | `dedalo` |
| media root (`MEDIA_PATH`) | not written | `/srv/dedalo/<i>/media` | `/srv/dedalo/media` |
| server socket (`SERVER_UNIX_SOCKET`) | not written | `/run/dedalo-<i>/dedalo_ts.sock` | `/run/dedalo/dedalo_ts.sock` |
| publication database (`--mysql-name`) | `web_dedalo` | `web_<i>` | `web_dedalo` |

`install.sh` passes `--route trial` and relies on these, so the stack's values
live in one place (`src/core/install/install_plan.ts`).

!!! danger "No password belongs on the command line"
    `--root-password`, `--db-password`, `--mysql-password` and `--smtp-password`
    still work, but each prints a warning: an argv is visible to every user in
    `ps` and lands in your shell history. Use the `DEDALO_INSTALL_*`
    environment variables or `--secrets-stdin` (see [Secrets](#secrets)).

!!! tip "Check the plan before you run it"
    `--plan` validates the answers exactly as the install would, without needing
    the database (a root password is checked against the policy when one is
    supplied, but not required):

    ```shell
    bun run scripts/install.ts --plan --db-name dedalo_main --db-user dedalo_user --entity myentity --hierarchies none
    ```

!!! warning "Languages are mandatory, and the defaults must be members of the set"
    The server refuses to boot without its language configuration. The CLI
    derives it up front and **refuses the install** if `--app-lang` or
    `--data-lang` is not one of `--langs` — better a clear refusal than an `.env`
    that crash-loops the server on the very next boot.

## What the installer does, in order

The CLI prints each plan step as `→ [<step id>] …`; the ids are the same action
names the wizard calls, which is how one plan drives both. The pre-flight before
the first step and the root-login check after the last are the CLI's own
affordances (the wizard has its *Verify* screen and in-wizard login instead).

1. **Validation** — every answer, and the root password, is checked by the plan
   (see [Validation before anything is written](#validation-before-anything-is-written)).
   A refusal here writes nothing.
2. **Pre-flight checks** — the four gates above, then the **target database**:
   it must exist and be **empty** — zero tables, views, sequences, functions,
   types or schemas of its own (members of an extension such as `plpgsql` do not
   count) — and no other install may be running against it (a server-side lock
   on the database decides this, so two installs from two private directories
   cannot both pass). A refusal here writes nothing either.
3. **The plan and state files** are written under `<private>/install/` — only
   now. From here on every step is recorded (see
   [The plan and state files](#the-plan-and-state-files)).
4. **`test_db_connection`** — the database must already exist, and be empty. If it
   does not exist, the installer stops: it never creates a database.
5. **`test_diffusion_connection`** *(only with `--diffusion`)* and
   **`test_mailer_connection`** *(only with `--mailer`)* — probes that **warn** on
   failure and let the install continue.
6. **`persist_config`** — writes `../private/.env`; see the next section. Any
   previous `.env` is first copied to `.env.bak.<timestamp>`, then the new file
   replaces it in one rename (the `.env` is never missing in between).
7. **`check_directories`** — creates and write-probes the private directory, the
   session store, the backups directory, and the media root: `--media-path` when
   given, otherwise the default `<private dir>/media` (a legacy in-tree
   `<repo>/media` that already holds files is kept instead). It then provisions
   the media tree under that root. Writability is proven by writing and deleting a probe file, not by
   reading permission bits — a network mount can lie about the bits.
8. **`stage_ontologies`** — fetches (update server) or copies (built-in `oh`,
   `--ontology-source`) every chosen domain ontology file, dependencies first,
   into the staging directory, and verifies each one (decompression and row
   format) **before the database is touched**. This is the install's only
   network phase: an unreachable server or a damaged file stops the install
   here, with the database still empty.
9. **`install_db_from_default_file`** — restores the database from the core-only
   seed (refused unless the database is empty) as **one transaction** — a restore
   that fails or is killed part-way leaves the database empty, never half-built —
   **then** builds the derived search
   indexes, writes the engine's own ontology nodes and **activates the core
   Languages thesaurus (`lg`)**. Its terms already ship in the seed, so activation
   is all it needs — there is no separate step for it, and nothing about it to
   choose.
10. **`install_ontologies`** — imports the staged domain ontologies through the
   same import routine the ontology update panel uses, then checks their
   references (see [Domain ontologies](#domain-ontologies)). An import failure
   **fails the install**.
11. **`set_root_pw`** — the root password, hashed with Argon2id.
12. **`install_hierarchies`** — imports and activates the **optional** thesauri you
   chose (`none`, or nothing chosen, adds none), plus the thesauri the installed
   ontologies declare, unless declined. A declined mandatory thesaurus is a
   warning, never a failure. Each selected TLD has its listed term files verified against their
   checksums and copied in (a thesaurus the manifest lists without files is
   created empty), **and is then activated**: the hierarchy is flagged active, its virtual ontology sections
   (`<tld>0`/`<tld>1`/`<tld>2`) are provisioned, and its thesaurus tree is rooted —
   so the hierarchies you selected are browseable at the first login. Importing
   without activating leaves the terms in the database but unreachable (the section
   does not exist for the engine until its ontology does), so a TLD whose activation
   fails is a **failed** hierarchy — and a failed hierarchy **fails the install**:
   nothing is sealed (the wizard cannot get past a failed step either).
13. **`register_tools`** (unless `--skip-tools`).
14. **`install_finish`** — seals the install, refused unless a root user with a
    password actually exists. A forged *finish* can never seal a half-built
    instance.
15. **Verify the root login** — an actual login against the freshly installed
    database. This is the end-to-end proof, and it is why the CLI prints
    `✔ install complete — root login verified`. The generated secret
    (`DEDALO_SALT_STRING`) is printed here, once — never mid-run.

!!! note "Only declared thesauri are pre-selected"
    The CLI's default, `install.sh`'s `default` answer and the wizard's
    pre-ticked boxes are the same set: the thesauri the chosen ontologies
    **declare**, all ticked (a mandatory one marked strongly recommended, but
    still editable). Nothing else is
    pre-selected — in particular **no country's toponymy**. When the install
    adds no toponymy thesaurus, the CLI prints a suggestion (and the wizard shows
    one) to import your own country's, e.g. `--hierarchies np` for an
    installation in Nepal.

### The thesaurus manifest (`hierarchy.json`)

The thesauri a release offers are listed in ONE file,
`install/import/hierarchy/hierarchy.json`, exported from the Dédalo master by
*Maintenance › Export hierarchy* (see
[Install new hierarchies](../management/install_new_hierarchies.md)). It has the
same envelope as the ontology catalog (`version`, `date`, `entity_id`, `entity`,
`entity_label`, `host`), a `typologies` list, and one `active_hierarchies` entry
per thesaurus: its `tld`, name, typology, default language, real section, scope
note, declared `dependencies` and `data_files` — each `{file, sha256}` of a
`<tld>1.copy.gz` / `<tld>2.copy.gz` beside it.

- **Every entry is offered**, with or without data files. An entry with no data
  files is installed as an **empty** thesaurus (activated, nothing imported).
- Before anything of a thesaurus is written, each listed file must exist and
  match its `sha256`. A missing or changed file refuses that thesaurus, and the
  install fails.
- The installer refuses a manifest it cannot read or that is malformed
  (`install.manifest_invalid`) rather than offering nothing.
- When a thesaurus is activated for the first time, its registry record is
  written from the entry: code, name, typology, default language (which must
  already exist in the Languages thesaurus — otherwise the activation is
  refused), real section, scope note and dependencies. An existing record is
  never overwritten.
- Languages (`lg`) is listed for reference only: it has no data files, its
  terms ship in the database seed, and it is never offered as a choice.

## What the seed installs

Restoring the vendored seed (`install/db/dedalo_install.pgsql.gz`, about 2 MB
compressed, 50 MB of SQL) turns an empty database into a working Dédalo core:

- the full **matrix / `dd_ontology` schema** — 33 tables, plus the functions,
  triggers and indexes;
- the **extensions** `btree_gin`, `pg_trgm` and `unaccent` (which is why the role
  needs the right to create them);
- the **core ontologies, and nothing else** — `dd`, `rsc`, `ontology`,
  `ontologytype`, `hierarchy` and `lg`, about **3,470 `dd_ontology` rows**;
- the terms of the **Languages** thesaurus (`lg`), which the restore activates;
- the **`root` user** (with no password until `set_root_pw`), the default project,
  and the *Admin* and *User* profiles.

The derived search indexes (`matrix_string_search`, `matrix_relation_index`)
ship **empty**: the restore step rebuilds them from the restored rows, the same
way a booting server repairs them.

!!! info "An installation carries no test data"
    The seed holds no domain ontology (each installation chooses its own — see
    below), no developers' `test` ontology and no *test3* playground records.
    Those belong to the developers' test database, which `bun run test:db:setup`
    builds through these same install steps and then adds its fixtures to (see
    [Testing](../development/testing.md)).

The restore is all-or-nothing: the seed is fed to `psql` with
`ON_ERROR_STOP=1`, and a non-zero exit is a hard failure. There is no partial
success to clean up after.

??? note "How the seed is built"
    The seed is a generated file, compiled from files in the repository only —
    never from an installation's database. `bun run seed:build` (the same
    compiler as Maintenance → *Build database version* → *Build install
    version*) applies the schema and its migrations, the CORE ontology release
    packages, the languages and hierarchy registry files and the default
    accounts into a scratch database, proves the result by installing it into a
    second scratch database, and only then replaces the seed. Next to the seed
    it writes `install/db/dedalo_install.manifest.json`: the seed's checksums,
    the row count of every table and a checksum of every source file. A gate
    (`install_seed_manifest_tripwire`) holds the committed seed to that file, so
    a hand-edited seed, or a source changed without a recompile, fails the
    build. [Install internals](../development/ts_install_internals.md#the-install-seed)
    has the details.

## Domain ontologies

The core ontologies describe Dédalo itself: users, projects, resources such as
people, images and publications, the thesaurus machinery, languages. What an
institution catalogues — interviews, objects, coins, intangible heritage — is
described by **domain ontologies**, and every installation chooses at least one.

| Answer | CLI | Wizard | `install.sh` |
| --- | --- | --- | --- |
| which domain ontologies | `--ontologies oh,tch` (default `oh`) | the *Ontologies* step, `oh` pre-ticked | *Domain ontologies to install* (`default` = `oh`) |
| where the others come from | the update server, or `--ontology-source` | the update server | the update server |

- **`oh` (Oral history) is the default, and it is built in.** The installer reads
  one file of the vendored ontology directory,
  `install/import/ontology/<major.minor>/oh.copy.gz` (and that ontology's entry
  in the directory's `ontology.json`), so an installation always
  has a usable domain ontology, even with no network. (The other files in that
  directory are there for an installation that serves the ontology to others;
  the installer does not read them.)
- **Every other ontology comes from the selected source**: the first server in
  `ONTOLOGY_SERVERS` — the official Dédalo master by default, or the first server
  of a list you set yourself on an earlier run — or the `--ontology-source`
  directory or archive. For example, `tch` (Tangible cultural heritage) is the
  general inventory model for objects and collections; it is described in the
  wizard but not pre-ticked. When one TLD is offered by several places, a
  `--ontology-source` file wins over the built-in `oh`, which wins over the
  server.
- **An air-gapped install (`--no-update-servers`) is offered only `oh`**, unless
  `--ontology-source` provides more. Asking for another TLD is refused before
  anything is written: `unknown ontology 'tch' — not offered by the built-in set
  (air-gapped: only oh is available offline)`.
- **The installer writes `ACTIVE_ONTOLOGY_TLDS`**: the core, then the installed
  domain ontologies in install order. It is rewritten on every run. The
  [ontology update panel](../management/updates/updating_ontology.md) refreshes
  exactly these.

### Dependencies are declared, never guessed

A domain ontology usually builds on others: its sections use components defined
in another ontology, or its fields point into another one's thesaurus. The
ontology server **declares** these dependencies for each ontology in its
catalog (an editor fills them in on the master — see
[Declaring what an ontology requires](../management/updates/updating_ontology.md#declaring-what-an-ontology-requires)).

Each declared dependency names a TLD and what is needed from it: its
**ontology** (`main: ontology35`) or its **thesaurus** (`main: hierarchy1`, the
hierarchy with its terms, installed and activated). A TLD may be declared under
both. Each one is **mandatory** or **optional**.

- The installer installs the chosen ontologies **plus the ontologies they
  declare**, transitively, each dependency before the ontology that needs it. It
  says so before it starts: `tch also installs: …`. Core ontologies in a
  declaration are already installed and are skipped.
- The declared **thesauri** are added to the
  [`install_hierarchies`](#what-the-installer-does-in-order) step. The core Languages
  thesaurus (`lg`) is never listed, because every install activates it.
- A **mandatory ontology** is always installed. It cannot be unticked in the
  wizard, and `--decline-dependencies` has no effect on it.
- An **optional** dependency is offered already ticked. Untick it in the wizard,
  or name it in `--decline-dependencies`, to leave it out:
  `the ontology 'x' (an optional dependency of 'y') is declined — not installed`.
- **A thesaurus dependency never blocks an install.** A **mandatory thesaurus**
  is a strong recommendation, not a requirement: you can work without it,
  keep a thesaurus of your own under another name, or install it any time
  later. It is offered ticked and marked *strongly recommended*; untick it in
  the wizard, or name it in `--decline-dependencies`, to leave it out. The
  install continues with a warning:
  `the thesaurus 'x' (declared mandatory by 'y') is declined — not installed; it is strongly recommended and can be installed later from Maintenance › Install hierarchies`.
- A mandatory ontology the source does not offer is refused before anything is
  written: `'x', declared as a dependency of 'y', is not offered by the ontology server '…'`.
  An optional one is skipped with a warning.
- A thesaurus is installed from the release's
  [thesaurus manifest](#the-thesaurus-manifest-hierarchyjson). A thesaurus with
  no entry there is skipped with a warning — mandatory or not, never an error:
  `the thesaurus 'x' (declared mandatory by 'y') has no entry in hierarchy.json — skipped; it is strongly recommended and can be installed later from Maintenance › Install hierarchies`.
  An entry without data files is not an error either: the thesaurus is created
  empty.
- **An older ontology server publishes no dependencies.** The installer then
  warns, names the ontology, and installs exactly what you chose — it never works
  out dependencies on its own:
  `the ontology source declares no dependencies for 'tch' (an older ontology server) — 'tch' is installed alone; anything it references in other ontologies stays unresolved`.
  Name the missing ontologies yourself (`--ontologies tch,crm,…`), or install
  them later from the update panel. The built-in `oh` of this release declares
  none yet either, so a default install warns
  `the built-in ontology.json declares no dependencies for 'oh' (a release that predates them) — …`
  and installs `oh` alone.

**After the import, the installer checks the references.** For every node of
the installed ontologies it follows the parent, the model and the related nodes.
A reference to an ontology the installation does not have is reported as a
warning — the install still completes — that names the ontology to add. For
example, `tch` installed alone from a server that declares nothing (its 15 model
references into `crm`, measured on the vendored `tch` package):

```text
⚠ 'tch' references 15 node(s) of 'crm' that is not installed (model: e.g. tch457→crm222) — install 'crm' too (--ontologies tch,crm) or ask the ontology server to declare it
```

Two kinds of reference are never reported, because a missing target is harmless
by design: a node placed *under* a node of another ontology (it simply does not
show there), and the field mappings of a publication (diffusion) definition into
another ontology. A reference into a **core** ontology that this release's seed
does not have yet means the master's core is newer than the seed; the warning
then says to run *Maintenance › Update ontology* after the install.

### Listing the catalog

`--list-ontologies` prints what the selected source offers, as the wizard
shows it — air-gapped here, so only the built-in `oh`:

```shell
bun run scripts/install.ts --list-ontologies --no-update-servers
```

```json
{"source":{"kind":"none"},"default":["oh"],"core":["dd","rsc","ontology","ontologytype","hierarchy","lg"],"entries":[{"tld":"oh","name":"Oral History | oh","typology_id":"8","typology_name":"Catalog","origin":"vendored","is_default":true,"note_key":"installation_ontology_note_oh","dependencies":null,"also_installs":[],"hierarchy_dependencies":[]}],"warnings":[],"errors":[]}
```

Each entry carries its `origin` (`vendored`, `local` or `server`), its declared
`dependencies` (a list of `{tld, main, mandatory}`, or `null` when the source
declares none), `also_installs` — the non-core ontologies a choice of it would
add — and `hierarchy_dependencies` — the thesauri it would add, each
`{tld, mandatory, dependants}`. Core ontologies are never listed:
they are not a choice. The source follows the other flags: `--ontology-source`,
`--no-update-servers`, or the configured server. `--plan` shows the outcome for a
given answer: `ontology_install` is the install order,
`active_ontology_tlds` what will be written, `hierarchy_dependencies` the
declared thesauri, `hierarchies` every thesaurus the install will add and
`suggestions` the toponymy hint when none of them is a toponymy.

`--list-hierarchies` does the same for the thesauri — the release's manifest,
core apart, each entry with `has_data` (false = it installs empty):

```shell
bun run scripts/install.ts --list-hierarchies
```

### Offline installs (`--ontology-source`)

To install more than `oh` without a network, copy an ontology server's export
to the machine and point the installer at it:

```shell
bun run scripts/install.ts … --ontologies oh,tch --ontology-source /srv/media/ontology_7.0.tgz
```

The source is one **version directory** of an ontology server's export (its
`ONTOLOGY_DATA_IO_DIR/<major.minor>/` — see
[the ontology directory](../config/config.md#ontology-inputoutput-exportimport-or-download-directory)),
or an archive of it:

- `ontology.json` — the catalog, with each ontology's metadata and declared
  dependencies. Its version must be this release's `major.minor`;
- one `<tld>.copy.gz` per ontology;
- optionally `matrix_dd.copy.gz`, the master's private value lists. It is
  installed when at least one chosen ontology comes from this source, and it
  **replaces** the installation's private lists.

An archive (`.tar`, `.tar.gz` or `.tgz`) may hold those files at its root or in
one top-level directory. Only regular files with those names are extracted;
anything else (directories, extended headers, a `recovery/` subfolder, other
names) is ignored and does not count against any limit. An archive with absolute
paths, `..` segments or links, more than 4096 ontology files, more than 50 000
entries in all, or more than 512 MB is refused.

### When something fails

The ontology files are fetched and verified by `stage_ontologies`, **before the
seed is restored**: a source that is unreachable, refuses the access code or
serves a damaged file stops the install with the database untouched. The
staged files wait in `../private/install/ontology_staging/` (with a
`staged.json` recording each file's checksum) and are deleted after a successful
import; after a failure they stay there for diagnosis, and the next run starts
from a clean staging directory.

An import failure in `install_ontologies` stops the install: the import routine
restores each ontology's tables from its snapshot, and **nothing is sealed**. As
for any failed step, the progress is saved: fix the cause and run
`bun run scripts/install.ts --resume` ([Resuming an install](#resuming-an-install-resume)),
or take the install back with `--abort --confirm-database <db>`
([Undoing an install](#undoing-an-install-abort)). There is no need to drop and
recreate the database.

## Interactive mode

Run the installer with **no answer flag** at a terminal and it asks:

```shell
bun run scripts/install.ts            # the interactive installer
bun run scripts/install.ts --plain    # the same questions, one per line
```

It walks one screen per step, in this order, and the route you pick first
decides which steps follow:

| Route | Steps |
| --- | --- |
| production | Install type → System check → Database → Identity → Web server & TLS → Services → Ontologies → Thesauri → Languages → Publication → Mail → Administrator → Review plan |
| developer | Install type → System check → Database → Identity → Ontologies → Thesauri → Languages → Publication → Mail → Administrator → Review plan |
| docker | Install type → System check → Image → TLS & address → Containers → Identity → Ontologies → Thesauri → Languages → Publication → Mail → Administrator → Review plan |
| trial | as docker, without TLS & address |

What the screens do for you:

- **Every default is the installer's own** — the same one a flag-less headless
  run takes (see the tables above). Accepting a default leaves the answer out,
  so a default that follows another answer keeps following it (the production
  database name follows the instance name). The time zone and locale offered
  are your machine's, when they are valid.
- **Every answer is checked as you give it**, with the same rules and the same
  refusal sentences as a headless run ([Validation](#validation-before-anything-is-written)):
  a refused answer is asked again, the refusal shown under it. An entity name
  that is not a valid code gets a suggested code next to the refusal.
- **Checks run where they help.** The System check (Bun, the seed, the private
  directory, `psql`, the machine's PostgreSQL, ImageMagick, FFmpeg — on docker
  and trial only the host's own rows) must pass. The database must exist, be
  reachable and be empty: retry, or go back and edit. The media directory
  (production) must be creatable by you. The MariaDB and SMTP connections must
  pass, or you type `yes` to keep them untested — the Review says which. The
  mail check can also send a real test message to an address you give (it is
  not kept).
- **Ontologies and thesauri** are offered from the update server's catalog (or
  your offline package when the install is air-gapped), grouped, with what each
  one declares pre-ticked; unticking a declared dependency declines it, exactly
  as `--decline-dependencies` does. A mandatory ontology dependency cannot be
  unticked; a thesaurus never is forced. When no country toponymy is selected
  the thesaurus step suggests typing your country's code (e.g. `np`).
- **Passwords** are never shown and are typed twice; the root password is
  checked rule by rule after the first entry. A password already given through
  `DEDALO_INSTALL_*` or `--secrets-stdin` is kept, not asked (the root password
  is still checked against the policy).
- **The Review** lists what the install will do — the database, the ontologies
  in install order, the thesauri, the languages, publication and mail (tested or
  not), the media root and socket, the steps, the `.env` key names (never a
  value), the host steps still done by hand on a production route, and the
  equivalent command line (without secrets). Then:
  `install` (typed `yes` to start; offered only when the plan has no error),
  `edit <n>` (go back to step `n`; later steps ask only what changed),
  `write <path>` (an [answers file](#the-answers-file-answers), no secret in it),
  `quit`.

The interactive installer hands its answers to **the same install** a headless
run makes: the plan is built again from your answers, the ontology catalog read
again, and the install refused — `the ontology catalog changed between review
and install — run again` — if it would now decide anything other than what you
reviewed.

On the **docker** and **trial** routes the interactive installer does not
install from the host yet: it asks the instance's own answers and writes them
(`write <path>`); `install.sh` brings the stack up and runs the installer inside
the container. The production host steps — the web server site, TLS, the
systemd units, backups — are still done by hand
([Production install](production.md), [Several instances on one host](multi_instance.md));
the Review lists them.

If an install was interrupted, the interactive installer says so first and
offers **resume**, **abort** or **quit** instead of asking anything. Abort asks
you to type the database name back (it resets that database to empty), and
asks the database password only when the reset needs it and neither the
environment nor the install's `.env` supplies it — the same rules as
[`--abort`](#undoing-an-install-abort).

### The full-screen installer

At a capable terminal the screens are drawn full-screen: a header with the
release and the route you picked, a left rail of the route's steps (`✓` done,
`›` current, `·` still to come), the current step in the middle, and the keys
it takes at the bottom. The Welcome and Done screens show the Dédalo logo when
the terminal has at least 30 rows.

It is used when standard input and standard output are both terminals, `TERM`
is set and not `dumb`, the terminal is at least 80×24, and you did not pass
`--plain`. Anything else gets the [plain mode](#plain-mode) — the same
questions, the same answers, the same install. Between 80×24 and roughly
104×30 the layout tightens (a compact rail of numbers, shorter descriptions);
if you shrink the window below 80×24 while it runs, the installer asks you to
enlarge it and keeps your place (no key answers a question you cannot see;
Ctrl-C still stops). `NO_COLOR` keeps the full screen, in your
terminal's own colours.

If the full-screen interface cannot start — the terminal library has no native
build for this machine — the installer prints one line and continues in plain
mode:

```text
full-screen UI unavailable (<reason>) — continuing in plain mode
```

On a musl-based Linux (Alpine) set `OPENTUI_LIBC=musl` before running the
installer so the musl build of the terminal library is chosen; without it the
glibc build is tried, fails, and you get the plain mode. Use `--plain` with a
screen reader.

| Where | Keys |
| --- | --- |
| Anywhere | **Ctrl-C** stops the installer (exit `130`); **Ctrl-Q** asks "Quit?" (exit `0`; an unfinished install is kept for `--resume`); **F1** help (or **?** where you are not typing); **Esc** back to the previous step |
| A text or password field | **Enter** or **Tab** continue; **Shift-Tab** the previous question of this step; ←→, Backspace, Ctrl-U (clear), Ctrl-W (delete a word) edit; **Ctrl-D** stops (exit `130`) |
| A choice | ↑↓, PgUp/PgDn, Home/End move; **Enter** chooses |
| A list (ontologies, thesauri, languages) | type to filter; ↑↓ move; **Space** ticks or unticks; **/** starts a new filter; **Esc** clears the filter, then goes back; **Enter** continues |
| A failed check | **r** retry, **e** edit the answers, **y** keep them untested (where allowed), **q** quit |
| The Review | **Enter** install (then type `yes`), **e** + a step number edit it, **w** + a path write an answers file, **Esc** edit the last step, **Ctrl-Q** quit |
| The install | **l** shows the full log; **Ctrl-C** stops — resume later |
| Done | **Enter** or **q** closes; Ctrl-C closes too, with the install's own exit code |

The screens are the steps listed above, plus:

- **Lists** show what each entry declares (`also installs …`, `needed by
  rsc`), `declined` for a dependency you unticked, and `Empty — you fill it`
  for a thesaurus that ships only its definition. A locked entry says why
  instead of unticking.
- **Passwords** are drawn as `•`, typed twice; the root password's policy rules
  turn from ✗ to ✓ as you type it — the password itself is never drawn.
- **Checks** show their result in place; a failed one offers retry / edit /
  keep untested / quit.
- **The Review** shows what will happen, any errors, and the equivalent command
  line (no secret in it). On the docker and trial routes ("Docker without
  media protection") Enter does not install — write the answers file instead.
- **Install** lists every step with its state (`◐` running, `✓` done, `↷`
  verified from an earlier run, `✗` failed) and its time. Ctrl-C here stops the
  running step at once and records it failed; `--resume` runs it again later.
- **Done** shows the outcome; on a fresh install, the generated
  `DEDALO_SALT_STRING` **once** — copy it then (the mouse is not captured, so
  your terminal's own selection works; the value is also kept in the private
  `.env`, mode 0600). Then what comes next: start the supervisor, then open the
  web interface. Thesauri, toponymies, restores and updates after the install
  are done in the browser (**Maintenance**), not here. The screen stays until
  you press a key.

Whatever way it ends — quit, Ctrl-C, an error, a signal — the installer gives
the terminal back as it found it and prints the closing message on your normal
screen. Exit codes: `0` installed or quit, `1` refused or failed, `130`
interrupted (Ctrl-C, Ctrl-D, SIGINT), `143` terminated (SIGTERM). On the Done
screen the install is already over: Ctrl-C or a signal only closes it, and the
exit code (and the closing message, with the resume hint of a failed run) is the
install's.

**Standard input must be a terminal.** An interactive run with a piped or
redirected standard input is refused before anything is read or written —
`stdin is not a terminal — give the answers with --answers <file> (and the
secrets via DEDALO_INSTALL_* or --secrets-stdin)`. A run that carries any
answer source — an answer flag, `--answers`, `--plan`, a `--list-*` flag,
`--resume`/`--abort`, `--secrets-stdin`, `--execute` — is headless and never
needs a terminal: `install.sh` and CI pipe `--secrets-stdin` that way.

## Plain mode

The plain line mode asks the same questions as the interactive installer, one
per line, with no screen drawing, no colour and no escape sequence of any kind —
for a screen reader, a serial console or a log. It is used when you pass
`--plain`, when `TERM` is unset or `dumb`, when standard output is not a
terminal (the questions then go to standard error, or to the terminal device),
or when the terminal is smaller than 80×24. `NO_COLOR` only turns colour off.

- Every question accepts `back` (the previous step) and `quit`; Ctrl-C and
  Ctrl-D quit too. A typed `quit` exits `0` (nothing installed), Ctrl-C /
  Ctrl-D exit `130`, and an answer refused too often (or a password whose two
  entries never matched) exits `1`. An **empty** answer takes the default shown in brackets;
  `-` empties an optional field.
- Yes/no switches show `[y/N]` or `[Y/n]`. An acknowledgement (the trial
  route's missing media protection, no thesaurus at all, a connection kept
  untested, starting the install) needs the word `yes` typed.
- **Lists** (ontologies, thesauri, languages) are numbered in their groups, 20
  lines a page. Type `3`, `3-7` or `3 5 9` to toggle by number, a code (`es`)
  to toggle it, `/word` to filter and `/` to clear, `more` for the next page,
  `list` for all of them, and Enter (or `next`) to finish. A locked entry says
  why instead of toggling. Ticking an entry also ticks what it declares, as the
  flags install it: untick an optional dependency to decline it; a mandatory
  one stays while the entry that needs it is ticked. The order you tick languages in is the order they
  are written.
- **Passwords** are hidden and typed twice (three mismatches stop); after the
  first entry of the root password each policy rule is printed as `ok` or
  `missing` — never the password.
- A check (System check, database, media directory, publication, mail) holds
  only for the answers it tested: when a later answer changes them — an
  instance name that re-derives the database, a different route — the check
  runs again before the Review offers `install`.
- Every mark is a word (`default`, `ships terms`, `definition, you fill it`,
  `needed by tch`), never a symbol.

## The answers file (`--answers`)

The answers can come from a file instead of (or beside) the flags — the shape a
provisioning tool writes. It is the wizard's answers inside a versioned
envelope:

```json
{
  "schema": "dedalo.install.answers/1",
  "answers": {
    "db_database": "dedalo_main",
    "db_username": "dedalo_user",
    "entity": "myentity",
    "langs": ["lg-spa", "lg-eng"],
    "app_lang_default": "lg-spa",
    "hierarchies": ["es"],
    "diffusion": false
  }
}
```

```shell
DEDALO_INSTALL_ROOT_PASSWORD='…' bun run scripts/install.ts --answers answers.json
```

The keys it accepts are exactly the plain answers: `route`, `instance`, `db_hostname`, `db_port`,
`db_socket`, `db_database`, `db_username`, `entity`, `entity_label`,
`information`, `info_key`, `timezone`, `locale`, `langs`, `app_lang_default`,
`data_lang_default`, `diffusion`, `mysql_hostname`, `mysql_port`,
`mysql_socket`, `mysql_database`, `mysql_username`, `mailer`, `smtp_host`,
`smtp_port`, `smtp_secure`, `smtp_user`, `smtp_from`, `smtp_from_name`,
`media_path`, `unix_socket`, `media_access_mode`, `update_servers`,
`hierarchies`, `register_tools`, `ontologies`, `declined_dependencies`,
`ontology_source`. Lists may be JSON arrays or comma strings, switches JSON
booleans — the same values the wizard posts. The file goes through the same
plan, so the same answers install the same instance whichever way they arrive.

It is refused, before anything is written, when:

- the envelope is wrong — `answers file: schema must be dedalo.install.answers/1`;
- a key is unknown — `answers file: unknown key 'x'` (a typo is never ignored);
- a key is a **secret** (`db_password`, `mysql_password`, `smtp_pass`) —
  `answers file: '<key>' is a secret and is not accepted in a file — use
  DEDALO_INSTALL_* or --secrets-stdin`. Answer files get copied, mailed and
  committed;
- a key is set both in the file and by a flag — `entity is set by both --answers
  and --entity`. Neither wins silently.

The interactive Review's `write <path>` and `--write-answers <path>` produce
this file from the reviewed answers; read back, it installs the same instance.

## Secrets

Four secrets can be supplied: the root password (always required), the
database password, the diffusion (MariaDB) password and the SMTP password.
Highest precedence first:

1. **`--secrets-stdin`** — one JSON object on standard input, with any of the
   keys `db_password`, `mysql_password`, `smtp_pass`, `root_password` (an unknown
   key is refused):

    ```shell
    printf '%s' '{"root_password":"…","db_password":"…"}' \
      | bun run scripts/install.ts --secrets-stdin --db-name dedalo_main --db-user dedalo_user --entity myentity
    ```

2. **The environment** — `DEDALO_INSTALL_ROOT_PASSWORD`,
   `DEDALO_INSTALL_DB_PASSWORD`, `DEDALO_INSTALL_MYSQL_PASSWORD`,
   `DEDALO_INSTALL_SMTP_PASSWORD`. The installer removes them from its own
   environment as soon as it has read them, so no program it starts inherits
   a `DEDALO_INSTALL_*` variable. The database password does reach the `psql`
   programs the installer starts (they need it to connect); the root, SMTP and
   diffusion passwords reach none.
3. **The command line** — `--root-password`, `--db-password`,
   `--mysql-password`, `--smtp-password`. Still accepted, each with the warning
   `⚠ <flag> on the command line is visible to other users (ps); use
   DEDALO_INSTALL_* or --secrets-stdin`.
4. **Typed at the prompt** — on a terminal, without `--execute`: the root
   password of a fresh install, the secrets a `--resume` still needs, and every
   password the [interactive installer](#interactive-mode) asks. Hidden, typed
   twice.

The interactive installer's connection checks run in a separate short-lived
process; the one password a check needs is handed to it on its standard input,
never on its command line or in its environment.

No secret is ever written to the plan or state files, and none is printed: every
line the installer prints and every message it records has the supplied secrets
replaced by `***`. The one secret the installer **generates**,
`DEDALO_SALT_STRING`, is written to `.env` and printed **once**, in the summary
at the end of the run that completes the install
(`generated DEDALO_SALT_STRING = …`). Keep it with your backups. The interactive
installer shows it only on a terminal: when its output is redirected to a file,
it says where the salt is stored instead (`<private>/.env`, `0600`) and does not
write it into the log.

## Validation before anything is written

Every refusal an answer can earn is raised by the plan, before the database is
touched and before any file is written — the same refusal whether the answers
come from flags, an answers file or the wizard:

| Answer | Rule | Refusal |
| --- | --- | --- |
| `db_database`, `db_username`, `entity` | present | `<key> is required` |
| `entity` | a letter, then letters, digits or `_` | `entity '<v>' must start with a letter and contain only letters, digits and _` |
| `db_port`; `mysql_port` (with `--diffusion`); `smtp_port` (with `--mailer`) | an integer 1–65535 | `db_port '<v>' must be an integer 1-65535` |
| database and MariaDB host, name, user | no leading `-`, no control character | `db_database: looks like a command-line option` |
| `db_socket` | an absolute directory | `db_socket: …` |
| `media_path`, `unix_socket`, `mysql_socket` (with `--diffusion`) | absolute, when given | `media_path must be an absolute path` |
| `smtp_host` (with `--mailer`) | present | `mailer requires smtp_host` |
| `smtp_secure` (with `--mailer`) | `tls`, `ssl` or `none` | `smtp_secure must be tls\|ssl\|none` |
| `mysql_username` (with `--diffusion`) | present (the publication database has a default: `web_dedalo`, `web_<instance>` on production) | `diffusion requires mysql_username` |
| `route` | `production`, `docker`, `trial` or `developer` | `route must be production\|docker\|trial\|developer` |
| `instance` | required on `production`, refused elsewhere; a lowercase letter, then `a-z`, `0-9`, `_` (28 at most) | `the production route requires instance (e.g. --instance prado)`, `instance is only meaningful on the production route (route is <r>)`, `instance '<v>' must start with a lowercase letter …` |
| `media_access_mode` | `private`, `publication`, `false` (or empty) | `media_access_mode must be private\|publication\|false (or empty)` |
| `timezone` | a time zone the runtime knows (IANA name) | `timezone '<v>' is not a valid IANA time zone` |
| `locale` | a well-formed language tag | `locale '<v>' is not a valid BCP 47 tag` |
| `langs`, `app_lang_default`, `data_lang_default` | at least one language; the defaults are members of the set | `languages: …` |
| `information`, `info_key` | no line break or NUL | `information contains an illegal control character` |
| root password | supplied (for an install), and passes the password policy | `root password is required (…)`, `root password does not meet the password policy (<rule>)` |

The thesaurus, ontology and declined-dependency refusals described above are
plan refusals too. Then the database is checked: it must exist
(`database '<db>' must exist first`), be empty
(`database '<db>' is not empty (<n> objects, e.g. …) — the installer only installs into an empty database`)
and be owned by the database user the install connects as
(`the install role does not own database '<db>' — create it with OWNER set to the install user …`):
the seed restore marks the database as this install's (its comment,
`dedalo_install_id:<id>`), which only the owner may write.

## The plan and state files

A run that passed validation and the database check records itself under
`<private>/install/` (a `0700` directory; every file in it `0600`):

| File | Written | What it holds |
| --- | --- | --- |
| `install.plan.json` | once, at the start | schema `dedalo.install.plan/1`: the plain answers, **which** secrets were supplied (true/false — never a value), the steps, the thesauri, the ontology request (each file's checksum, never a temporary path or an access code), the non-secret `.env` entries, the notes and warnings, the engine version, and a `plan_hash` over all of it |
| `install.state.json` | around every step | schema `dedalo.install.state/1`: each step's status (`pending`, `running`, `done`, `failed`), attempts, verification and redacted message; every run (fresh, resume, abort) and how it ended; what the pre-flight saw; and what the install **created** — the only things `--abort` may remove |
| `install.lock` | while a run is active | which process holds the install (released when it ends; a lock whose process is gone is taken over with a warning) |

Both files are **kept** after success, as the install's record. A fresh run
that finds them refuses — `an install record exists at … — resume it with
--resume, undo it with --abort --confirm-database <db>, or remove the install
directory if this private directory is being reused deliberately` — so an
install is never started over another one by accident.

## Resuming an install (`--resume`)

Any failure after the plan and state files exist ends with how to continue:

```
✖ install failed at step [install_ontologies]: <message>
  Progress saved: <private>/install/install.state.json (plan: install.plan.json)
  Fix the cause, then resume:  bun run scripts/install.ts --resume
    secrets needed again: root password (DEDALO_INSTALL_ROOT_PASSWORD or --secrets-stdin)
  Or undo this install:        bun run scripts/install.ts --abort --confirm-database <db>
```

`--resume` takes the **saved** plan: it needs no answers. Repeating the original
command line (or part of it) with `--resume` added works too — only the answers
given are compared, and those that differ from the saved ones are refused (`answers differ from the saved plan: entity — resume
takes the saved answers; drop the flags, or --abort and start again`). A resume
by another engine version, or of a modified plan file, is refused.

For every step, in order:

- a step recorded **done** is verified again — its work must still be there (the
  `.env` written as planned, the staged files, the seed of this engine version,
  every ontology imported, the root password set, the install sealed). A done
  step whose work has gone is refused as drift
  (`step <id> was recorded done but its outcome is missing … --abort and start again`);
  a done step with nothing to verify (a probe, the thesaurus import, tool
  registration) is not run again;
- a step left **running** or **failed** whose work verifiably landed (the
  process died after the work, before recording it) is recorded done without
  running again; otherwise it runs again. The seed restore is the exception: it
  always runs again, and decides from the database itself. The restore is one
  transaction that also marks the database as this install's, so a restore
  that was killed left the database empty and simply runs again, a committed
  one is completed, and a database that is neither empty nor marked by this
  install — a backup restored into it meanwhile, another install — is refused
  (`… is not empty (<n> objects) and was not seeded by this install — refusing to restore into it`).

Only the secrets a remaining step still needs are asked again: the database,
diffusion and SMTP passwords only while `persist_config` has not completed (after
that, the install's own `.env` holds them), the root password only while
`set_root_pw` has not. A resume that no longer has the root password says so
(`root login not re-verified …`) instead of checking the login. Resuming a
complete install verifies every step and prints
`install already complete — every step verified`.

Exit codes are unchanged: `0` done, `1` refused or failed, `130` interrupted
(Ctrl-C), `143` terminated.

## Undoing an install (`--abort`)

```shell
bun run scripts/install.ts --abort --confirm-database dedalo_main
```

`--abort` undoes, in reverse order, what the state file says the install
**created**: the database objects (the database goes back to empty — every
table, function, type, schema and extension the install added is dropped; the
extensions it already had stay), the ontology staging directory, the directories
it created (only while still empty), the `.env` (the previous one restored from
its backup, or removed when there was none) together with every backup and
`sample.env` the install wrote, and the install status. Then the plan and state
files and `<private>/install/` go.

It never drops the database itself, never touches objects that predate the
install (the install only ever started on an empty database), only resets a
database that carries this install's mark (an empty unmarked one has nothing to
reset), and refuses — before anything is touched:

- without `--confirm-database` naming the install's database, once the seed
  restore has started;
- a **sealed** install — a finished install is a live one;
- a database that is neither marked by this install nor empty
  (`database '<db>' is not stamped by this install … — refusing to reset it; nothing was undone`);
- while another install holds the database, or another installer session is
  still working on it.

Backups of `.env` that existed before the install (`.env.bak.*`) are never
removed — only the ones that appeared since the install started.

## What `../private/.env` does — and does not — get

**The installer rewrites the keys it owns** and keeps every other key already in
the file: those are carried over verbatim, in a section headed *Preserved from the
previous .env*. The previous file is kept as `.env.bak.<timestamp>`. The keys it
owns are these:

| Section | Keys |
| --- | --- |
| Database | `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_SOCKET` |
| Entity / locale | `ENTITY`, `DEDALO_ENTITY_LABEL`, `DEDALO_TIMEZONE`, `DEDALO_LOCALE` |
| Languages | `DEDALO_APPLICATION_LANGS`, `PROJECTS_DEFAULT_LANGS`, `DEDALO_APPLICATION_LANGS_DEFAULT`, `DEDALO_DATA_LANG_DEFAULT`, `APPLICATION_LANG`, `DATA_LANG`, `DEDALO_STRUCTURE_LANG` |
| Secret | one generated secret, printed once |
| Update servers | `ONTOLOGY_SERVERS`, `CODE_SERVERS` — the official master by default, `[]` with `--no-update-servers` |
| Ontologies | `ACTIVE_ONTOLOGY_TLDS` — the core, the chosen domain ontologies and the ontologies they declare (minus declined optional ones), in install order; rewritten on every run |
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
offered an update. To change your mind later, replace the `[]` values of
`ONTOLOGY_SERVERS` and `CODE_SERVERS` in `.env` (or re-run the installer answering
*yes*), then restart the server: the list, and the browser's `connect-src` that lets
the update panels reach a master, are built at boot.

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
    The **pool settings, the timeouts and the access log** are not written by the
    installer. Append them once the install has finished,
    then restart the server. (`MEDIA_PATH`, `SERVER_UNIX_SOCKET` and
    `DEDALO_MEDIA_ACCESS_MODE` **are** written — pass `--media-path`, `--socket` and
    `--media-access-mode`.)

    A key you add by hand survives the installer, before or after, as long as the
    installer does not own it: it is carried into the *Preserved* section. Every key
    is written in the configuration reference's own spelling (`DB_NAME`, `ENTITY`,
    …). The older fallback spellings the engine still accepts from a `.env` carried
    over from v6 or from an earlier installer (`DEDALO_DATABASE_CONN`,
    `DEDALO_ENTITY`, …) count as the same key: a re-run drops them and writes the
    value once, under the current name — `DEDALO_SOCKET_CONN` included, which is now
    the old spelling of `DB_SOCKET`.

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

Steps: **Diagnostics → Database → Entity → Ontologies → *(optional)* Diffusion →
*(optional)* Outbound email → Save config** … *(restart)* … **Verify →
Directories → Install database → Root password → log in → Hierarchies → Tools →
Finish**.

The **Entity** step also collects the languages (a checkbox list with
English and Spanish pre-checked; the others are optional) plus the default
interface and data language. Before *Save config*
the wizard also asks whether to use the official update server (yes by default;
no is the air-gapped install described above).

The **Ontologies** step lists the core ontologies as fixed rows and the domain
ontologies on offer, with `oh` pre-ticked. The built-in list shows at once. When
the update server is in use, the step also reads the server's catalog and adds
its ontologies, grouped by typology; without it (or when the server cannot be
reached) only the built-in `oh` is offered. A short note describes `oh` and
`tch`. Under each ticked ontology the step lists its declared dependencies, each
with a checkbox: a mandatory ontology is ticked and locked; everything else is
ticked and can be unticked. A mandatory thesaurus is marked *strongly
recommended*: unticking it shows a warning that it can be installed later from
Maintenance › Install hierarchies, and the install goes on without it. A dependency on a core ontology or thesaurus is always
installed, so it is shown ticked and locked as well. When the source declares nothing for it, the step warns
instead. At least one must be ticked.
The choice is saved with the configuration (`ACTIVE_ONTOLOGY_TLDS`), and after
the restart the **Install database** step runs three actions in a row:
`stage_ontologies`, `install_db_from_default_file` and `install_ontologies`, each
with its own status line. It stops at the first failure; reference warnings
are shown but do not block.

The **Hierarchies** step lists every thesaurus of the release's manifest,
grouped by typology; one without data files is marked *Empty*. Only the
thesauri the installed ontologies declare are ticked, and every one can be
unticked: a mandatory one is marked *strongly recommended by* the ontologies
that declare it, and unticking it shows the warning that it can be installed
later. Ticking a thesaurus also ticks the thesauri its own entry declares.
Nothing else is pre-ticked; the toponymy group shows a suggestion to import
your own country's. The server installs exactly what the page sends; a
mandatory thesaurus left out is reported as a warning, never refused. Languages is not
among them — it was activated with the database — and submitting the step with
nothing ticked is valid.

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
    - on a laptop with neither, start it with `bun run start:supervised` (or
      `bun run dev` while developing), or (better) just use the CLI, which needs
      no restart at all:

      ```shell
      bun run start:supervised
      ```

      Both declare `DEDALO_SUPERVISED=true` and restart the server only when it
      exits with code `75`, the planned restart; a crash still stops it, so you
      see it. Plain `bun run start` restarts nothing and is unsupervised, so the
      [code update panel](../management/updates/updating_code.md) refuses under it.

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

`<private>/ts_state.json` records the **server's** install status: `configured`
while the wizard is mid-flight, `terminal_installing` while a command-line
install is (from its `persist_config` on), then `sealed`. It is what makes a
reload resume the wizard instead of showing a login form, and what makes the
sealed instance stay sealed across restarts. A command-line install that stops
part-way leaves `terminal_installing`: the server does no database work over the
half-built database, and the browser wizard does **not** open — the install is
finished from the terminal (`--resume`), never by whoever reaches the port. It
belongs in your backups (it is part of `../private/`).

It is not the installer's own record: `<private>/install/install.state.json`
(see [The plan and state files](#the-plan-and-state-files)) tracks the steps of
one command-line install, for `--resume` and `--abort`.

## Further reading

The developer-facing view of the same machinery — the engine modules, the
install-mode boot, the restart mechanism, the gates — is
[the TS-native install engine](../development/ts_install_internals.md).
