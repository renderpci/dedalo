# WC-2026-10-12-ddengine-removed — the engine owns no ontology; the AI spend ledger and its limits live on master-defined tipos

- **Date:** 2026-10-12 (owner decisions 2026-10-12: the engine must NEVER own or ship an
  ontology definition; AGENTS.md "Ontology definitions belong to the MASTER ontology").
- **Decision:** none numbered — owner decision, recorded here and in AGENTS.md.
- **Supersedes:**
  `WC-2026-10-01-ai-spend-budget` (its ledger LOCATION — the engine-owned section
  `ddengine1` and its components, the `ddengine` TLD paragraph — and its budget SOURCE,
  the four `DEDALO_AI_USER_DAILY_*` keys; the doors, the reservation protocol, the
  refusal shapes, fail-closed and nobody-exempt stand);
  `WC-2026-10-10-ontology-dependencies-hierarchy60` (the `retired`-node mechanism: the
  boot-time pruning of `ddengine11`);
  `WC-2026-10-09-ontology-manifest-dependencies` (the engine-owned `ddengine11`
  component and the "`ddengine` ships with the code" premise — already superseded on
  the field by hierarchy60; this closes the TLD it lived in);
  `WC-2026-10-09-install-domain-ontologies` (the catalog sentence excluding the
  engine-owned `ddengine`: there is no such TLD to exclude).
  Superseded entries are left untouched; each carries a one-line forward Addendum.
- **Shape before (PHP):** PHP had no engine-owned TLD. The fossil is the TS engine's own
  2026-10-01 shape: a repo file `src/core/ontology/engine_ontology.json` defined TLD
  `ddengine` (`ddengine0` main, `ddengine1` "AI usage" section, counters
  `ddengine6`-`ddengine9`, a `retired` list), materialized by `ensureEngineOntology` at
  every boot, by the installer's `completeFreshInstall` and by the suite setup, shipped
  as `install/import/ontology/7.0/ddengine.copy.gz` and listed in the vendored
  `ontology.json` / `ontology_llm_map.json`. Budgets were env keys
  `DEDALO_AI_USER_DAILY_RUNS` (50), `_TOKENS` (1000000), `_EMBED_QUERIES` (2000),
  `_VISION` (50), one value for every user.
- **Shape after (TS):**
  - **No engine-owned TLD.** Nothing in the engine writes an ontology definition: no boot
    step, no installer step. An installation's `dd_ontology` holds exactly the core TLDs,
    the domain ontologies it installed from release files or an ontology server, and the
    thesauri it provisioned. `ensureEngineOntology`, the `retired` pruning and the
    vendored `ddengine.copy.gz` are deleted; `ddengine` is no longer a reserved name.
  - **The ledger** is the master section `dd660` "AI usage" (under Administration,
    `dd207`; stored in `matrix_stats`): one record per (user, UTC day) — user `dd663`
    (a dd128 locator), day `dd664` (component_date, a dd_date
    `[{id:1, start:{year,month,day,time}}]` as the engine's date components store it),
    counters `dd665` model runs / `dd666` model tokens / `dd667` query embeddings /
    `dd668` vision calls; list `dd669`.
  - **The limits are user / profile data**, edited in the *AI usage* group of each
    record: per USER (`dd128`, group `dd647`) `dd692` runs, `dd693` tokens, `dd694`
    embeddings, `dd695` vision; per PROFILE (`dd234`, group `dd649`) `dd696`-`dd699` in
    the same order. Each kind resolves on its own: the user's value when set (non-empty),
    else the value of the user's profile (`dd1725`), else 0. 0 refuses (an explicit 0
    too); there is no unlimited value. A set but non-numeric or negative value counts
    as 0 (refuses), never falls through to the profile; so does any stored value that
    is not a number or a numeric string (a boolean, an array, an object). Read per
    reservation, inside its transaction — no cross-request cache. Nobody is exempt (root
    and global admins included).
  - **Who may write the limits.** The per-user limits `dd692`-`dd695` join the dd128
    own-record self-elevation guard (`security/permissions.ts` `SELF_ELEVATION_GUARDED`,
    beyond PHP): on their OWN user record a non-global-admin reads them at level 1 at
    every record-addressed door, whatever the profile grants — the user value wins over
    the profile's, so writing it would lift one's own cap. On another user's record the
    profile's grant applies as for any component. A profile editor (write on `dd234`)
    who raises their own profile's `dd696`-`dd699` is NOT guarded: that grant already
    lets them raise their own permissions, so the limit adds no new power.
  - Fail closed: a ledger or limit node missing or of the wrong model → 503
    `ai.budget_unavailable`. The 429 `ai.budget_exhausted` details are unchanged
    (`budget_kind`, `limit`, `window_resets_at`), and its MEANING widens: `limit: 0` is
    now the common case — no limit set at either level (the default of every fresh
    install), or an explicit 0 — and no reset admits it; only an administrator setting a
    limit does. Unset and explicit 0 deliberately share one verdict (one code, as
    before); the hint and the `error_ai_budget_exhausted` label say so, and name the
    user's or profile's AI limits. `ai.budget_unavailable` also covers missing or
    wrongly-shaped LIMIT components (its label names the limits too).
  - The four `DEDALO_AI_USER_DAILY_*` keys are removed from the config catalog (a
    leftover `.env` line is ignored).
- **Upgrade note (beta):** no data migration. A database that ran the 2026-10-01 engine
  holds orphan `ddengine` rows and ledger rows the engine no longer reads: **a fresh
  database is required for this beta**. A fresh install starts with every limit empty,
  so every AI spend is refused until an administrator sets limits on the profiles (or
  users) that may spend.
- **Reason:** an ontology definition the engine ships is a second master: an ontology
  update cannot reach it, installs drift from the master, and the engine grows a private
  update lane (the `retired` list) to correct its own mistakes. Limits that differ per
  user and profile are data, not one machine-wide setting.
- **Gate reconciliation:** no parity fixture covers the AI doors or the installer; no
  re-harvest, no fixture change. Gates: `test/unit/install_tld_provenance_native.test.ts`
  (NEW — a real install's TLD set equals core ∪ release files ∪ provisioned thesauri,
  matrix_ontology counts equal the release files, boot changes neither ontology table;
  mutation-checked red for a TLD written by `completeFreshInstall` and a record written at
  boot), `test/unit/ai_spend_budget_native.test.ts` (rebuilt: master nodes, the
  user → profile → 0 resolution per kind, the fail-closed parse of a malformed or
  negative limit, per-reservation reads, fail closed via the zz seam, and the own-record
  guard — a level-2 user-manager refused on their own `dd693` through MCP `set_field` and
  the human save door, served on another user's), `test/unit/install_e2e.test.ts` (expected TLDs are core + default only).
  `test/unit/engine_ontology_retired_native.test.ts` is deleted with the mechanism it
  held.
