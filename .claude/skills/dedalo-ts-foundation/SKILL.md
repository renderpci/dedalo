---
name: dedalo-ts-foundation
description: Master orientation for the Dédalo v7 TypeScript/Bun rewrite — READ THIS FIRST before any src/ work. Covers what v7 TS is (a from-scratch Bun/TS rewrite of the PHP monolith, which is a READ-ONLY oracle on the SAME Postgres), the codebase's load-bearing law ("tripwire or delete"), the 11 tripwires and what each guards, the subsystem/dependency map, the post-WS-C home rule (dispatch.ts = registry+gates+envelope only → api/handlers/<class>.ts; read routing in section/read_facade.ts), where the audit lives, and the map to every sibling skill. Use when starting any src/ TS work, asking "where does X live", "how is the TS server structured", architecture/layering/boundary questions, "is there an invariant about…", checking a flagged path before touching it, or onboarding. Live state: rewrite/LEDGER.md. Spec: engineering/REWRITE_SPEC.md.
---

# Dédalo v7 foundation (TypeScript/Bun rewrite)

**Read this first for any `src/` work.** Dédalo v7 TS is a from-scratch rewrite of the PHP monolith (`v7/master_dedalo`) on Bun 1.3.9 + strict TypeScript. During coexistence the **PHP server is a READ-ONLY oracle running on the SAME Postgres** — every TS behavior is verified differentially against it, and PHP can re-parse any row TS writes. Authoritative overview: `engineering/REWRITE_SPEC.md`. **Live measured state (where we are right now): `rewrite/LEDGER.md`.** Historical narrative (how we got here): `rewrite/STATUS.md`.

Do not read this skill as a spec copy — it POINTS. Specs and the ledger hold the content; this teaches how to work without breaking the rails.

## THE LOAD-BEARING LAW: "tripwire or delete"

The 2026-07 foundation audit (`audits/2026-07_foundation/`) reached one central, empirical finding: **every invariant enforced only by docs or memory was violated in practice; every TRIPWIRED boundary held.** A documented-but-untripwired rule WILL rot — someone (human or agent) will unknowingly break it and no gate catches them.

So the rule for all new work: **if you add an invariant, add its tripwire in the same change. If a rule has no tripwire, treat it as already-rotting and either tripwire it or delete it.** Never rely on "the docs say don't do X."

### The 11 tripwires (the enforcement backbone)

Live list with current status: `rewrite/LEDGER.md` "Tripwire index". What each guards:

| Tripwire (in `test/`) | Guards | What breaks without it |
| --- | --- | --- |
| `unit/sql_confinement_tripwire.test.ts` | Tiered SQL confinement T1–T4 (DEC-09) | Raw SQL leaks out of the db kernel; injection/coupling surface everywhere |
| `unit/config_env_tripwire.test.ts` | No `process.env` outside `src/config/` | Config reads scatter, untyped, unauditable |
| `unit/module_state_tripwire.test.ts` | No cross-request module-level mutable state (lifecycle-justified allowlist) | One request's principal/lang/tx bleeds into another |
| `unit/diffusion_boundaries.test.ts` | diffusion→core direction only; MariaDB confined to `targets/mariadb/` | Diffusion couples back into core; MariaDB dialect leaks into the kernel |
| `unit/boundary_seam_tripwire.test.ts` | core→diffusion seam stays facade-only (S3-02) | The seam widens into a deep coupling instead of a thin bridge |
| `unit/coex_tag_tripwire.test.ts` | Every COEX tag cites its DEC + has a `COEXISTENCE.md` row (DEC-19) | PHP/TS shared-DB compromises go undocumented and silently drift |
| `unit/descriptor_completeness_tripwire.test.ts` | Component descriptors declare required facets (S2-26) | A model half-registers; a facet silently no-ops in one flow |
| `unit/import_scc_tripwire.test.ts` | No static value-import strongly-connected-component >1 (S2-20; allowlist empty) | Import cycles create load-order bugs / TDZ crashes at boot |
| `unit/ws_a_tripwires.test.ts` | `json_codec` used at jsonb binds; no inline locator compares | The `::text::jsonb` bind trap corrupts data; ad-hoc locator compares diverge from PHP |
| `unit/client_serving.test.ts` | `client/` stays byte-identical to the PHP source | The copied vanilla-JS client silently breaks against a subtly-changed asset |
| `parity/oracle_canary.test.ts` | Oracle absence is LOUD, never a silent green | Parity gates pass with no oracle actually compared — false confidence |

## PHP is the oracle — never silently narrow scope

When a code path can't yet handle a case, **throw loudly and record the gap in `rewrite/LEDGER.md` "Known-open gaps"** — never return a plausible-but-narrowed result. A silent narrowing looks green and diverges from PHP forever; a loud throw is a visible, ledgered TODO. This is why unregistered models THROW, unsupported search faces THROW, and `oracle_canary` refuses a silent pass. Verification harness: the `dedalo-parity-debugging` skill.

## Subsystem map & dependency direction

Current homes and their state: **`rewrite/LEDGER.md` "Subsystem state"** (do not trust a hardcoded list here — it goes stale). The durable *shape*:

- **Kernel:** `src/core/db/` (Postgres/Bun.sql, transactions, jsonb codec, matrix writes) + `src/core/concepts/` (locators, subdatum, ddo/rqo). Everything depends inward on these; they depend on nothing above.
- **Layers above:** ontology, resolve, section, components, search, relations, security — each imports the kernel and lower layers, never sideways into a peer's internals.
- **Diffusion is self-contained** behind the `src/core/diffusion_bridge/` seam (a DIRECTORY: `diffusion_delete.ts`, `diffusion_map.ts`). Core reaches diffusion ONLY through that facade; diffusion never imports core upward. MariaDB dialect lives only in `src/diffusion/targets/mariadb/`. Both directions are tripwired.
- **AI/** runs on separate pools (own DB connections), not the request kernel.

### The post-WS-C home rule (know this before adding a handler or read sub-action)

After the WS-C re-homing, the dispatch layer is a THIN registry:

- `src/core/api/dispatch.ts` (~230 lines) is **registry + gates + envelope ONLY.** Do NOT add per-action business logic here.
- Per-api-class handlers live in **`src/core/api/handlers/<class>.ts`** (e.g. `dd_core_api.ts`, `dd_ts_api.ts`, `dd_diffusion_api.ts`, `dd_area_maintenance_api.ts`). Add a class's actions there.
- Section read sub-action routing lives in **`src/core/section/read_facade.ts`** (the shared `emitDdoData` and read engine live in `src/core/section/read.ts`).
- Other clusters: `src/core/area_maintenance/` (maintenance widgets), `src/core/components/component_info/` (info widgets), and `hierarchy_provision.ts` + `ontology_delete.ts` in `src/core/ontology/`.

## Extension: components are descriptor-routed

A component model is added by writing a descriptor (`src/core/components/component_*/descriptor.ts`) and registering it — NOT by scattering `if model === …` across the engine. Required facets (search/searchBuilder, import, flat-value family, relation face, emitHook) must be DECLARED; `descriptor_completeness_tripwire` fails a half-declared model. The registry↔resolver cycle is inverted by boot-time registration: `src/core/components/registry.ts` calls `registerComponentModelFieldsLookup` (from `src/core/ontology/resolver.ts`) so the resolver never static-imports the registry. Deeper guidance: **`dedalo-ts-extension`**.

## Config: one env reader

`readEnv` (`src/config/env.ts`) is the ONLY thing that reads the environment; the typed catalog is `src/config/config.ts` (`config.ops` holds pool/observability keys). **No direct `process.env` outside `src/config/`** — tripwired (`config_env_tripwire`). Deeper: **`dedalo-ts-ops-config`**; operating the server: `engineering/PRODUCTION.md`, `engineering/STAGING_VALIDATION.md`.

## Where the audit lives & what it means for new work

`audits/2026-07_foundation/general/` (REPORT, FINDINGS, DECISIONS, REMEDIATION, DISSENT, COVERAGE) and `.../security/` (the security audit — per the project rule, security analysis runs on Opus sub-agents).

- **DECISIONS.md** = settled DECs (e.g. DEC-09 SQL tiers, DEC-12 tripwire mandate, DEC-19 COEX tags). Do NOT re-litigate a decided DEC; build on it.
- **FINDINGS.md** = flagged paths. **Before touching a flagged path, read its finding** — you may be about to reintroduce a fixed bug.
- **REMEDIATION.md** = the ordered fix plan; Tier-1 remediation gates new feature work.

## Sibling skills — the foundation family

Reach for the specialist when you cross into its area:

- **`dedalo-ts-write-path`** — jsonb writes & the `::text::jsonb` bind trap (`encodeForJsonb` in `src/core/db/json_codec.ts`), `withTransaction` (`src/core/db/postgres.ts`), `insertMatrixRecordWithCounter` (`src/core/db/matrix_write.ts`), `compareLocators` (`src/core/concepts/locator.ts`), `dbTimestamp` (`src/core/db/db_timestamp.ts`), PHP-oracle-on-same-Postgres write parity.
- **`dedalo-ts-isolation-caching`** — the 3 AsyncLocalStorage stores (transaction ALS in `postgres.ts`; request-lang ALS `runWithRequestLangs`/`currentApplicationLang`/`currentDataLang` in `src/core/resolve/request_lang.ts`; request-context ALS `currentPrincipal` in `src/core/security/request_context.ts`) and the cache factories `createOntologyCache`/`createDataCache` (`src/core/ontology/cache_factory.ts`). Model: `engineering/REQUEST_ISOLATION.md`.
- **`dedalo-ts-testing`** — differential gates, `hasPhpCredentials` (`test/parity/php_client.ts`), `ORACLE_MODE=fixtures` (`test/parity/oracle_fixtures.ts`), scratch-write hygiene. Fixture mode: `engineering/ORACLE_HARVEST.md`.
- **`dedalo-ts-extension`** — adding component models / descriptors / facets.
- **`dedalo-ts-ops-config`** — env/config catalog, pool/observability, running & supervising the server.

## Subsystem skills (the deep dives)

`dedalo-relations-ts` (relation family), `dedalo-section-family-ts` (section reads + client render contract), `dedalo-ontology-ts` (ontology definition/provisioning), `dedalo-tree-ts` (thesaurus tree + shared tx/lock primitives), `dedalo-parity-debugging` (the oracle-diff workflow used by all of the above).

## Cross-cutting docs (point, don't duplicate)

`engineering/CONVENTIONS.md` (error handling §1, dynamic imports §2) · `engineering/WIRE_CONTRACT.md` (deliberate wire divergences, e.g. WC-001 unified `entries:[]`) · `rewrite/COEXISTENCE.md` (PHP↔TS shared-DB rules, DEC-19) · the per-subsystem specs `RELATIONS_SPEC.md` / `SECTION_SPEC.md` / `DIFFUSION_SPEC.md` / `MEDIA_SPEC.md` / `TOOLS_SPEC.md` / `AREA_SPEC.md`.
