-- 0014 — matrix_activity_diffusion (dd1758): drop the dead / redundant indexes
-- (2026-10-14).
--
-- WHY. `matrix_activity_diffusion` is the DIFFUSION PUBLICATION LEDGER — one row
-- per record per publish run, append-only, and its retention default is 0 (keep
-- everything), so it grows linearly with how often a catalogue is published. The
-- asset layer provisions the FULL generic index family on every matrix table,
-- but the engine emits only FOUR shapes against this one (traced call sites in
-- src/core/diffusion_bridge/diffusion_delete.ts, src/diffusion/targets/mariadb/
-- public_tier_reconcile.ts, src/core/area_maintenance/widgets/diffusion_server_control.ts):
--   - pending-unpublish reads — WHOLE-COLUMN containment `relation @> <probe>`
--     (the debt count, the retry queue, the admin widget count);
--   - the retention prune — `"timestamp" < cutoff AND NOT <pending>`;
--   - the flip/stamp UPDATE — `(section_tipo = 'dd1758', section_id = the row)`.
-- Every index below is either on a column dd1758 NEVER writes, or an alias of an
-- index that is kept, and every one is maintained on EVERY published record.
--
-- EVIDENCE. On the reference install the section's children are dd1760-67:
-- section_id / date / relation / number / string / select — there is NO geo, iri,
-- media or relation_search component, and the ledger writer INSERTs only
-- relation/string/date/number/misc, so those four GINs index an ALWAYS-NULL
-- column (measured: 0 non-null of 100%). `misc` is read only as an EXPRESSION
-- (misc->'dd1758_retry'->>terminal / ->>last_attempt), which a jsonb_path_ops GIN
-- cannot serve. section_tipo holds ONE value ('dd1758'), so the bare
-- section_tipo and section_id btrees are covered by the kept
-- (section_tipo, section_id DESC) list/UPDATE index, and id DESC is covered by
-- the (id) PK's backward scan.
--
-- DEFINITIONS + SEED IN THE SAME CHANGE. src/core/db/db_pg_definitions.json no
-- longer scopes these onto matrix_activity_diffusion (so recreateDbAssets is
-- idempotent and cannot recreate them), the shipped seed no longer creates them,
-- and src/core/db/matrix_index_policy.ts carries the reviewed dispositions (the
-- site of record for KEEP vs PRUNE). Wired by
-- test/unit/matrix_index_asset_policy_agreement.test.ts.
--
-- DROP INDEX IF EXISTS, not CONCURRENTLY: migrations run inside a transaction
-- (install/db/migrate.ts — the DDL and its version record land together) and
-- CONCURRENTLY cannot run in one. A plain DROP takes a brief ACCESS EXCLUSIVE
-- lock, which is correct here because migrations run AT BOOT, BEFORE the server
-- serves. IF NOT EXISTS throughout: an install already cleaned by the
-- Database-info widget's "Optimize tables" must be a no-op here, not an error.

DROP INDEX IF EXISTS matrix_activity_diffusion_geo_gin_idx;
DROP INDEX IF EXISTS matrix_activity_diffusion_iri_gin_idx;
DROP INDEX IF EXISTS matrix_activity_diffusion_media_gin_idx;
DROP INDEX IF EXISTS matrix_activity_diffusion_relation_search_gin_idx;
DROP INDEX IF EXISTS matrix_activity_diffusion_misc_gin_idx;
DROP INDEX IF EXISTS matrix_activity_diffusion_section_tipo_idx;
DROP INDEX IF EXISTS matrix_activity_diffusion_section_id_idx;
DROP INDEX IF EXISTS matrix_activity_diffusion_section_id_desc_idx;
DROP INDEX IF EXISTS matrix_activity_diffusion_id_desc_idx;
