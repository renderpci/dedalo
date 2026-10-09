# WC-2026-10-09-install-domain-ontologies — the install chooses its domain ontologies: a catalog in the wizard context, three new steps, ACTIVE_ONTOLOGY_TLDS written

- **Date:** 2026-10-09 (installer unification, items A4 + A5 install side + A6).
- **Decision:** installer unification plan A4 (the domain ontologies are an install
  ANSWER, `oh` by default, from the one vendored file; any other TLD from the
  configured ontology server's manifest or a local source), A5 (the DECLARED
  dependencies of the chosen TLDs are installed with them — server side in
  WC-2026-10-09-ontology-manifest-dependencies) and A6 (`--ontology-source` for a
  fully offline install). Builds on WC-2026-10-08-install-plan-update-servers-core-lg:
  the plan (`src/core/install/install_plan.ts`) stays the one answers → `.env` →
  steps mapping for the CLI, the wizard and `install.sh`.

## Shape before (TS)

- **`get_install_context` → `properties`:** no ontology choice. The seed carried
  `oh` (and the `test` TLD) for every install.
- **Router actions (`dd_utils_api` `install`):** no ontology step; the plan's steps
  were `test_db_connection, [test_diffusion_connection], [test_mailer_connection],
  persist_config, check_directories, install_db_from_default_file, set_root_pw,
  install_hierarchies, [register_tools], install_finish`.
- **`persist_config`:** no ontology answer; `.env` carried no `ACTIVE_ONTOLOGY_TLDS`
  (the update panel then fell back to the catalog default). Answer extension keys:
  `msg`, `generated`.
- **CLI:** no ontology flags; `--plan` printed
  `{env_keys, steps, hierarchies, notes, errors}`.

## Shape after (TS)

- **`get_install_context` → `properties.ontologies`** (NEW, synchronous, no network):
  `{ default: ['oh'], core: CORE_ONTOLOGY_TLDS, offline: <OntologyCatalogView> }`,
  where an `OntologyCatalogView` (`describeOntologyCatalog`, ontology_choice.ts — the
  ONE view the CLI's `--list-ontologies` prints too) is
  `{ source: {kind:'none'} | {kind:'local', path} | {kind:'server', server:{name,url}},
     default: string[], core: string[],
     entries: [{ tld, name, typology_id, typology_name, origin: 'vendored'|'local'|'server',
                 is_default, note_key: string|null, dependencies: string[]|null,
                 also_installs: string[] }],
     warnings: string[] }`.
  Entries exclude the core TLDs, `matrix_dd` and the engine-owned `ddengine`; sorted
  default first, then `typology_name`, then `tld`. `note_key` is a label key
  (`installation_ontology_note_oh` / `installation_ontology_note_tch`).
  `dependencies: null` = the source does NOT declare them (an older server). The
  server's access code is never sent.
- **NEW router actions** (pre-login, no session — Gate 1b unsealed + IP-allowed
  applies as for every install step):
  - `get_ontology_catalog` `{update_servers: boolean}` — a PROBE. `data`: `false`
    only when a remote catalog was needed and could not be read. Extension keys:
    `msg`, `catalog` (an `OntologyCatalogView`; the built-in one on failure, so `oh`
    stays installable), `warnings`. `update_servers: false` → the built-in view, no
    network (`msg: 'Air-gapped: only the built-in ontologies are offered'`). `true`
    → the manifest of the server the install will configure (a preserved custom
    `ONTOLOGY_SERVERS` list's first entry, else the official master), fetched
    server-side through `ontology_manifest.ts` (engineering/OUTBOUND_SPEC.md §2).
  - `stage_ontologies` (no options) — an ACTION. The request comes from the WRITTEN
    configuration (`ACTIVE_ONTOLOGY_TLDS` + `ONTOLOGY_SERVERS`), never from the
    client. Fetches/copies every file (deps first, + the source's `matrix_dd`
    when one ships with an item of that origin), gunzips and COPY-checks it into
    `<private>/install/ontology_staging/` with a `staged.json` (sha256 per file) —
    the database is NOT touched. `data: true`; extension keys `msg`
    (`Staged ontology files: <tlds>[ + matrix_dd] — verified, nothing installed
    yet`), `staged: [{tld, origin, bytes}]`, `warnings`. Refusals:
    `install.state_conflict` (`ACTIVE_ONTOLOGY_TLDS was not written — save the
    configuration first`), `install.invalid_input` (the written list is not the
    closure of its own domain ontologies), `install.step_failed` (unreachable
    source, unreadable / corrupt file — `… — nothing was installed`).
  - `install_ontologies` (no options) — an ACTION, after
    `install_db_from_default_file`. Re-verifies every staged file (sha256), imports
    them through the update panel's shared lower layer
    (`importStagedOntologyFiles`) under the one import latch, re-derives once for a
    model resolved late, verifies references, removes the staging dir. `data:
    true`; extension keys `msg` (`Installed ontologies: <tlds> — references
    verified[ (<n> warnings)]`), `installed: [{tld, records}]`, `warnings`
    (undeclared-dependency warnings + one line per (from, to) TLD pair of
    dangling dependency-class references, naming the remedy). Refusals:
    `install.state_conflict` (`No staged ontology files — run stage_ontologies
    first`; `The staged file <f> changed since it was verified — run
    stage_ontologies again`; another ontology import running),
    `install.step_failed` (`Ontology import failed: … — the install is not sealed;
    recreate the database and run the installer again`).
- **The plan's steps** (`INSTALL_STEP_IDS`, every id a router action):
  `test_db_connection, [test_diffusion_connection], [test_mailer_connection],
  persist_config, check_directories, stage_ontologies,
  install_db_from_default_file, install_ontologies, set_root_pw,
  install_hierarchies, [register_tools], install_finish`.
- **`persist_config`:**
  - NEW option `ontologies: string[]` (absent / `'default'` → `['oh']`; a core TLD
    dropped with a note; `[]` / `'none'` refused `install.invalid_input`: `at least
    one domain ontology is required (the default is oh)`; an air-gapped
    non-vendored TLD refused: `unknown ontology '<tld>' — not offered by the
    built-in set (air-gapped: only oh is available offline)`).
  - When the choice needs a catalog (a non-vendored TLD) the step reads the
    configured server's manifest BEFORE writing; an unreadable server refuses
    `install.step_failed` (`ontology server '<name>': <reason>`).
  - The `.env` gains the OWNED section
    `# --- Ontologies (core + this installation's domains + their declared dependencies; the update panel refreshes exactly these) ---`
    with `ACTIVE_ONTOLOGY_TLDS=<raw compact JSON>` = core + the install order
    (deps first), e.g. `["dd","rsc","ontology","ontologytype","hierarchy","lg","oh"]`;
    rewritten on every save (a prior value is replaced, never "Preserved").
  - NEW answer extension keys: `ontology_install: string[]` (the TLDs that will be
    staged, deps first), `active_ontology_tlds: string[]`, `warnings: string[]`.
  - **`ontology_source` is NOT a wizard option.** It names a path on the server's
    filesystem, so it is the CLI's `--ontology-source` only (scripts/install.ts
    calls `persistConfig` itself, never through the router). A `persist_config`
    post carrying any `ontology_source` other than absent / `''` is refused
    `install.invalid_input` BEFORE anything reads the path, with ONE fixed text
    whatever the path is: `ontology_source is a command-line answer
    (--ontology-source) — the wizard installs from the configured ontology server
    or the built-in ontologies`. (The pre-auth door used to stat/read/extract the
    posted path — a file-existence/type oracle — and wrote an
    `ACTIVE_ONTOLOGY_TLDS` that `stage_ontologies`, which re-resolves from the
    configured servers only, could not stage.)
- **`install_db_from_default_file` → `msg`** (implemented by the seed package, same
  run — quoted here so the wizard contract is in one place):
  - default connection: ``Database installed from seed (core ontologies: dd, rsc, ontology, ontologytype, hierarchy, lg) + derived search stores + engine ontology (<n> records) + core hierarchies activated (<tlds>) — OK``;
  - explicit connection: `Database installed from seed — OK (explicit connection: derived search stores, engine ontology and core hierarchies are not completed here)`.
- **CLI (`scripts/install.ts`)** — not a wire, documented here because it is the
  same plan:
  - NEW flags `--ontologies <tld,…|default>`, `--ontology-source <dir|archive>`
    (a directory in the server export layout — `ontology.json` + `<tld>.copy.gz`
    [+ `matrix_dd.copy.gz`] — or a `.tar`/`.tar.gz`/`.tgz` of one; its
    `ontology.json` version must be this engine's major.minor), `--list-ontologies`
    (prints ONE JSON line: the `OntologyCatalogView` of the selected source +
    `errors`; exit 0/1; needs no other answer; wins over `--plan`).
  - `--plan` prints `{env_keys, steps, hierarchies, ontologies, ontology_source,
    ontology_install, active_ontology_tlds, notes, warnings, errors}`.
  - The CLI reads the prior `.env` of its private dir (prior_env.ts) like
    persist_config does, so a printed plan honours a preserved custom server list.

## Reason

Every fresh install used to receive one domain ontology (`oh`) and the test
fixtures baked into the seed, whatever the institution catalogues. The operator
now chooses the domain models at install time (`tch` for a general inventory,
`oh` for oral history, anything the configured master serves), the dependencies
the master DECLARES come with them, and the update panel afterwards refreshes
exactly what the install wrote into `ACTIVE_ONTOLOGY_TLDS`. Fetching and checking
every file before the seed restore keeps an unreachable server or a corrupt
package from leaving a half-installed database; the import reuses the update
panel's own routine so there is one way ontology files enter a database.

## Gate reconciliation

- `test/unit/install_plan_parity_tripwire.test.ts` — CLI ≡ wizard over the new
  answers (default, explicit, core dropped, `none`, air-gapped), a local fixture
  source (spawned `--plan` ≡ in-process plan; `--list-ontologies` ≡
  `describeOntologyCatalog`; the persisted `ACTIVE_ONTOLOGY_TLDS` maps back to the
  CLI's request), every step routable and ordered stage → restore → install.
- `test/unit/install_step_router_native.test.ts` — the three actions routable
  without a session; the probe's offline view; both actions' state refusals; a
  wizard `persist_config` carrying `ontology_source` refused with one text for a
  missing path, a directory and a file (no oracle).
- `test/unit/install_ontology_archive.test.ts` (hermetic) — the archive form of a
  REAL export: the vendored version directory archived by the system tar
  resolves to the same catalog as the directory; ignored entries (directories,
  pax headers, a `recovery/` subtree) count against no limit; the file cap
  (4096 extracted files) still refuses.
- `test/unit/install_persist_config.test.ts` — the owned key, the extension keys,
  the `none` refusal.
- `test/unit/install_ontology_choice.test.ts` (hermetic) — the closure, precedence,
  the one view, ACTIVE round trip.
- `test/unit/install_ontology_door_native.test.ts` (DB) — the door end to end over
  zz TLDs: remote stand-in, undeclared dependencies, local dir ≡ archive, unsafe
  archive entries, preflight refusals with the database untouched, tampered
  staging, matrix_dd.
- `test/unit/vendored_ontology_closure_tripwire.test.ts` (hermetic) — the vendored
  `oh.copy.gz` stays installable alone over the core.
- No parity fixture is affected: the install surface is TS-only (no frozen PHP
  harvest covers these actions); no re-harvest is involved.
