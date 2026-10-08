# WC-2026-10-08-install-plan-update-servers-core-lg — one install plan: update servers by default, Languages always activated, one default thesaurus set

- **Date:** 2026-10-08 (installer unification, run A1 + A3 + C + A7).
- **Decision:** installer unification plan items A1 (one shared install-plan
  module, `src/core/install/install_plan.ts`, used by the CLI, the wizard and
  `install.sh`), A3 (installers always write `ONTOLOGY_SERVERS` + `CODE_SERVERS`,
  the official server by default, an explicit air-gapped opt-out) and A7 (`lg` is
  a CORE hierarchy: activated against `matrix_langs` with the seed, never
  copy-imported into `matrix_hierarchy`; CLI and wizard share one default for the
  optional thesauri). Item C (declared `DEDALO_SUPERVISED`) changes no wire shape.

## Shape before (TS)

- **`get_install_context` → `properties`:**
  - `install_checked_default: ['es', 'fr', 'lg']` — a hard-coded list in
    `context.ts` (`INSTALL_CHECKED_DEFAULT`, filtered by `effectiveDefaults` to the
    vendored TLDs), not shared with the CLI, whose default was *no* thesaurus.
  - no `update_servers`, no `core_hierarchies`.
- **`persist_config` options:** no update-server choice. The `.env` it wrote
  carried no `ONTOLOGY_SERVERS` / `CODE_SERVERS`, so a fresh install was offered
  no ontology or code update until an operator added the keys by hand.
- **`install_hierarchies`:** `lg` was an ordinary vendored TLD — `lg1.copy.gz`
  copied ~21,700 rows into `matrix_hierarchy`, duplicates of the terms the seed
  already ships in `matrix_langs` (the table `lg1`/`lg2` resolve to), then
  activated. An empty `hierarchies` list from the wizard was not a defined case.
- **`install_db_from_default_file` → `msg`:** named the seed restore and the
  engine ontology only; `lg` stayed inactive unless the operator ticked it.

## Shape after (TS)

- **`get_install_context` → `properties`:**
  - `install_checked_default: ['es']` — DATA-sourced:
    `defaultOptionalHierarchies()` = the `hierarchies.json` descriptors flagged
    `install_checked_default` (today `es` alone). The same list is the CLI's and
    `install.sh`'s default.
  - NEW `core_hierarchies: [{ tld: 'lg', label: 'Languages' }]` —
    `CORE_HIERARCHIES` projected to `{tld, label}`: always activated, never offered
    as a choice.
  - NEW `update_servers: { default: true, official: { ontology: { name, url },
    code: { name, url } } }` — from `OFFICIAL_ONTOLOGY_SERVER` /
    `OFFICIAL_CODE_SERVER`; the shared `code` is NOT sent to the pre-auth client.
- **`persist_config` options:** NEW `update_servers: boolean` — `true` (default)
  = the official master, `false` = air-gapped. The written `.env` gains the section
  `# --- Update servers … ---` with `ONTOLOGY_SERVERS` and `CODE_SERVERS` as raw
  JSON (`[<official entry>]`, or `[]`). With the official choice a key whose
  prior `.env` value is a non-empty list is preserved verbatim (mirrors survive a
  re-run); a prior `[]` or unparseable value is replaced by the official entry
  (an air-gapped install re-saved with the box ticked goes back online). Invalid
  answers refuse `install.invalid_input` before any write. The file never carries
  `DEDALO_SUPERVISED`.
- **`install_hierarchies`:**
  - the posted `hierarchies` list goes through the plan's thesaurus
    normalization (`normalizeHierarchyChoice`, the one the CLI's answer takes):
    lowercased, de-duplicated, a core TLD dropped (its note appended to `msg` in
    parentheses: `lg is a core hierarchy (always activated) — dropped from the
    list`), an unvendored TLD refused `install.invalid_input` before any import.
  - `hierarchies: []` (or a list holding only core TLDs) from the wizard →
    `ok: true`, `responses: []`, msg
    `No optional hierarchies selected — Languages (lg) is always active`.
  - the shared importer (`installHierarchies`, also behind the maintenance
    add-hierarchy widget) never imports a core TLD (`lg`): `replace: false` → activation only,
    `{tld: 'lg', ok: true, msg: 'core hierarchy — activated (its terms ship in the
    seed; never imported)'}`; `replace: true` → `{ok: false, msg: 'core hierarchy —
    cannot be reset (its terms ship in the seed)'}`.
- **`install_db_from_default_file` → `msg`:** appends
  ` + core hierarchies activated (lg)` — the step now runs
  `activateCoreHierarchies()` after the engine ontology, and a failed activation
  refuses `install.step_failed` (`Core hierarchy activation failed: …`).

Envelope otherwise unchanged: same actions, same session gates, same codes.

## Reason

Three front ends (CLI, wizard, `install.sh`) each carried their own defaults and
`.env` composition, and they had drifted: different default thesauri (none vs
`es,fr,lg`), a `/tmp` database host only the CLI assumed, and no update servers
anywhere — so every fresh install was silently cut off from ontology and code
updates. One plan module makes the answers → `.env` → steps mapping a single
function the client and the CLI both reach. `lg`'s import wrote only unread
duplicates: activation against `matrix_langs` is complete on its own (measured on
the suite database: activated with zero `matrix_hierarchy` rows, root term
resolved, `inspectHierarchy` usable).

## Gate reconciliation

- `install_plan_parity_tripwire` — CLI argv and the wizard record produce the same
  plan, keys and `.env` values (salt aside); a spawned `--plan` equals the
  in-process plan; the update-server defaults equal the catalog examples; every
  plan step is a router action; the plan never contains `DEDALO_SUPERVISED`.
- `install_core_hierarchy_native` — core activation with no import, the
  activation-only and refused-reset answers (suite database, rolled back).
- `install_step_router_native` — the wizard's `install_hierarchies` arm takes the
  plan normalization: an unvendored TLD refuses before any import, a core TLD is
  dropped with the note.
- `install_e2e` — the CLI on a scratch database ends with `lg` active, zero `lg`
  rows in `matrix_hierarchy`, `es` active (the shared default) and the official
  update servers in `.env`. RUNS wherever the role can create a database (the
  availability probe is decided at module top level: a flag set in `beforeAll`
  is read too late by `test.if`, and skipped both cases on every machine until
  2026-10-08); a role without CREATEDB reports a named SKIP.

No parity fixture covers the install surface (TS-native, WC-004), so the frozen
store is untouched and no re-harvest question arises.
