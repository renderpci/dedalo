# Close v6 / Prepare installation for v7

An **isolated, self-contained migration package** that rewrites a **Dédalo v6** PostgreSQL
database into the **v7 data model** — delivered as a v6 maintenance widget labelled
*"Prepare installation for v7"*. After it runs, the pure‑TypeScript v7 engine boots on the
same database with the schema and derived stores already in place.

## Why it is built this way

The migration logic (data reformat, schema restructure, dataframe/relation/string‑search
provisioning) is **v7‑aware**: it needs classes like the columnar `matrix_db_manager`, the
`dd_ontology`‑aware `ontology_node`, v7 component models, and `DEDALO_VALUE_TYPE_*` constants.
A live **v6** install ships its **own** classes with the **same names**, and two classes of
one name cannot coexist in a single PHP process.

**Isolation strategy:** the v6 widget does *not* load any of this code in‑process. It writes
the bundled engine's DB credentials and **spawns a separate PHP process** that boots a
**bundled full copy of the v7_php_frozen engine** (its own autoload root + `config/bootstrap.php`),
pointed at the **v6 database**. Separate process ⇒ zero class‑name collision, and the *tested*
migration code is reused verbatim instead of re‑derived.

## Package layout (after `build_package.sh`)

```
dist/prepare_v7/
├── engine/     full snapshot of the v7_php_frozen engine (isolated runtime)
├── run/        CLI runner
│   ├── run_prepare_v7.php          orchestrator (sequences the phases as child processes)
│   ├── phase1_backup_pre_update.php backup + pre_update (or --dry-run preflight)
│   ├── phase2_update.php            full update_version(all steps) incl. store backfills
│   ├── phase3_diffusion.php         diffusion ontology migration (isolated, LAST step)
│   └── lib/{engine_boot,blocking_backup,version_gate}.php
├── widget/prepare_v7/  v6-facing launcher (class.prepare_v7.php + js/prepare_v7.js)
├── private/    .env auto-migrated from the v6 config on first boot — created at runtime, never committed
├── var/        logs (prepare_v7.log) + backups — created at runtime
└── README.md
```

The source of truth lives in this repo under `close_v6_prepare_v7/` (runner + widget). The
`engine/` snapshot is materialised by `build_package.sh`, so git never carries a second copy.

## Prerequisites

- The v6 install must be at data version **6.9.1** (the migration descriptor's `update_from`;
  `force_update_mode = 'clean'`). The runner's preflight enforces this and refuses otherwise.
- PostgreSQL client tools (`pg_dump`) reachable at the engine's `DB_BIN_PATH` (mandatory backup).
- Superuser (`DEDALO_SUPERUSER`) + **maintenance mode** enabled (guards mirror the current
  update widget).
- PHP CLI available to the web/maintenance user.

## The package is already built

The full, self-contained package is materialised at **`close_v6_prepare_v7/dist/prepare_v7/`**
(engine bundled in — ~67 MB). **No build step is required to use it** — just copy that folder.

The bundled `engine/` is slimmed to what the migration actually runs. Stripped top-level dirs
(none on the migration execution path):
`media*`, `backups`, `node_modules`, `docs`, `mcp`, `mockup`, `security-audit`, `test`,
`tools`, `downloads`, `download`, `analysis`, `lib` (front-end/JS assets + wkhtmltopdf/xlsx),
`vendor` (composer: mailer/SAML/RDF/phpunit), `code`, `worker`, `dev`, `local`, `publication`,
all top-level hidden entries (`.git`, `.github`, …), and every per-install secret/config
(`.env*`, `config/config*.php`, `config/config_areas.php`). **Security:** quarantine backups
(`*.bak`, `*.pre-cutover*`, `*.cutover*`) and the dev boot-diff dir `config/bootstrap/`
(its `dev/snapshots/*.json` capture live config incl. real DB passwords) are excluded — they must
never ship. All unused **top-level files** are stripped too (docs, `composer.*`,
`phpstan*`, `mkdocs.yml`, `cliff.toml`, `config.codekit3`, `quick-lint-js`, `favicon.ico`,
`v7_dump.json`, `stub.php`, and the web front controller `index.php` — anchored, so
`core/**/index.php` stay). The engine top level is therefore ONLY the load-bearing dirs:
**`config`, `core`, `shared`, `install`, `diffusion`** (no top-level files).

Per-module client assets `core/*/css` and `core/*/js` are stripped too (no PHP reads them; the
CLI migration serves no UI), as are the UI modules `core/area*` and `core/button*` (not on the
migration path — reformat routes by model string and never instantiates them; the boot-loaded
`dd_area_maintenance_api` lives in `core/api/`, not here), and `core/rag` (the RAG vector
subsystem — a v7 feature dormant unless `DEDALO_RAG_ENABLED`; its `dd_rag_api` is in `core/api/`).

Further unused `core/` submodules are removed: `dd_mailer` (email; needs the stripped `vendor/`),
`extras` (project-specific ontology extras), `services` (UI services), `themes` (UI themes),
`dd_grid` and `widgets`. The last two are **boot-eager-included**, so `build_package.sh` also
neutralizes their now-dead `include` lines in the **copied** `core/base/class.loader.php`
(a post-copy `sed` — the frozen source loader is never modified). None are on the migration path.

`diffusion/` is reduced to **`diffusion/migration/`** (the v6→v7 diffusion-ontology update
scripts) **plus the top-level `diffusion/*.php` classes** — the latter can't be dropped because
the loader eager-includes ~10 of them and autoloads `diffusion_*` from there (boot dies without
them). The `api/`, `parser/`, `service/`, `acc/` subdirs are removed (`api/`'s weight was
`node_modules`, already excluded).

`install/` is reduced to **`install/db/*.sql` + `install/*.php`**. The store DDL twins
`matrix_string_search.sql`, `matrix_relation_index.sql` and `matrix_activity_diffusion.sql` are
read at runtime (`file_get_contents(DEDALO_ROOT_PATH.'/install/db/…')`) by the three
`v6_to_v7::create_*` steps; the `install/*.php` **config-migration classes** (`config_auto_migrate`
+ deps, ~120K) are kept so the engine can import the v6 config (see "Configuration" below). The
355 MB of `.gz` dumps + `import/` under `install/` is dropped. Other notes: `tools/`'s only caller `update::components_update()` is unused by the
single 6.9.1→7.0.0 descriptor; `vendor/autoload` is never required at boot; the AV
`core/media_engine/lib` (ffmpeg/color profiles) is under `core/`, not the stripped top-level
`lib/`, so it stays. **Verified:** the slimmed engine boots standalone and loads every
migration class.

`build_package.sh` exists only to *regenerate* the `engine/` snapshot from the current repo
(e.g. after engine changes); end users never run it:

```bash
close_v6_prepare_v7/build_package.sh          # regenerate → close_v6_prepare_v7/dist/prepare_v7
```

## Deploy into a v6 install

1. Copy the ready-made `dist/prepare_v7/` folder into the v6 server (anywhere readable/writable
   by the maintenance user).
2. Register the widget with v6's `area_maintenance`: make
   `widget/prepare_v7/class.prepare_v7.php` discoverable (copy/symlink into v6's
   `core/area_maintenance/widgets/prepare_v7/`, and add `prepare_v7` to the widget allow‑list).
   Wire the JS `api_request()` seam to v6's maintenance API (`window.dd_prepare_v7_api`).
3. If the widget class is not under `<package>/widget/prepare_v7/`, set
   `PREPARE_V7_PACKAGE_ROOT` so it can find the package.

## Run

### From the widget
- **Run preflight (safe):** spawns `--dry-run` — version gate, DB connectivity, `pg_dump`
  availability, and a data‑review pass (no writes). Read `var/prepare_v7.log`.
- **Prepare installation for v7 (migrate):** confirms, then spawns the real run. Requires
  superuser + maintenance mode.

### Headless (equivalent)
```bash
php dist/prepare_v7/run/run_prepare_v7.php --dry-run          # preflight, no writes
php dist/prepare_v7/run/run_prepare_v7.php --yes              # backup + migrate
php dist/prepare_v7/run/run_prepare_v7.php --yes --skip-backup   # only if you already backed up
php dist/prepare_v7/run/run_prepare_v7.php --help
```
`--yes` is required to write anything. For headless runs, first make the engine see the v6 config
(see **Configuration** below).

## Configuration — uses the v6 config

The bundled engine runs against the **v6 database using the v6 configuration**. v6 and the v7
engine share the same DB constant names (`DEDALO_HOSTNAME_CONN`, `DEDALO_DATABASE_CONN`, …), and
the engine imports the rest via Dédalo's own legacy‑config auto‑migration:

- **From the widget (automatic):** the widget runs inside v6, so it copies the v6 install's legacy
  config files (`config_core.php`, `config_db.php`, `config.php`, `config_areas.php` — whichever
  exist, from `DEDALO_CONFIG_PATH`) into `engine/config/`. On the next engine boot, `bootstrap.php`
  detects them and runs `config_auto_migrate`, generating a complete `../private/.env` + `state.php`
  (DB creds + langs + entity + install status). Path constants are scoped `DERIVED` and **dropped**,
  so v6 paths never override the bundled engine's own — verified.
- **Headless:** copy your v6 install's `config_core.php` + `config_db.php` into
  `dist/prepare_v7/engine/config/`, then run the runner. The first boot auto‑migrates them. (The
  legacy files are read *statically*, a tokenized `define()` scan — never executed.)

`config_auto_migrate` refuses if a secret looks non‑literal (a safety gate); a normal v6
`config_db.php` with a literal password migrates cleanly.

## What the migration does (all reused from the frozen engine)

1. **Phase 1** — blocking full `pg_dump -F c` (**aborts on failure** unless `--skip-backup`),
   then `update::pre_update_version()` → creates `dd_ontology` from `jer_dd`.
2. **Phase 2** (fresh process ⇒ clean ontology cache) — `update::update_version()` with every
   step enabled: schema DDL, `reformat_matrix_data`, time‑machine migration, dataframe/relation
   migration, drop legacy `datos`, and finally the derived stores
   `matrix_activity_diffusion`, `matrix_string_search` and `matrix_relation_index`
   (tables + sync triggers + **backfill**). On success the new version is recorded in
   `matrix_updates`.
3. **Phase 3 — diffusion ontology (LAST step, isolated).** Runs
   `diffusion/migration/migrate_diffusion_properties.php` as its own engine process. This is a
   **separate, still‑evolving** migration axis — NOT part of `update::update_version()` — that
   rewrites `dd_ontology.properties` (+ `matrix_ontology`) from the migrated v6 `propiedades`
   (populated in phase 1). It writes unconditionally, so it runs **only in the real run** (no
   dry‑run). It is **non‑fatal**: phases 1–2 are already version‑stamped, so a diffusion failure
   is reported (exit 7) with a re‑run hint rather than failing the DB migration. The `rdf`/`xml`
   filename migrators under `diffusion/migration/` are separate on‑disk‑file steps and are **not**
   auto‑run (each supports its own `--dry-run`).

Phases 1–2 are **idempotent** (`IF NOT EXISTS` / `OR REPLACE`, backfills are `TRUNCATE + INSERT`),
so a re‑run after a partial failure is safe.

## Verify

- Preflight exits 0 with no data errors.
- After a real run: a `.backup` file exists in `var/backup/`; `dd_ontology` is populated; the
  legacy `datos` column is gone; `SELECT count(*)` on `matrix_string_search` and
  `matrix_relation_index` is non‑empty and their `*_sync` triggers exist on content tables.
- Boot pure‑TS v7 on the migrated DB → it serves and relation/inverse search works, with the
  two stores already present (no boot‑time self‑heal backfill needed).

## Notes / limits

- Only **6.9.1 → 7.0.0** is supported (the single descriptor in `engine/core/base/update/updates.php`).
- In‑place testing against this repo instead of a built package: set `PREPARE_V7_ENGINE_ROOT`
  to an engine root that has its **own** `../private/.env`, so tests never touch a real install.
- The DB password reaches the engine only via the auto‑migrated `private/.env` (generated at
  runtime, gitignored) — never on a command line. The package itself ships **no** secrets:
  `build_package.sh` excludes `.env*`, `config/config*.php`, all `*.bak`/quarantine files, and the
  dev `config/bootstrap/` snapshots (which contained live DB passwords).
