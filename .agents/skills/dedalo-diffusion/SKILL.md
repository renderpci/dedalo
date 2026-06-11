---
name: dedalo-diffusion
description: Conventions and architecture for working on the Dédalo v7 diffusion system (publishing work data to SQL/RDF/XML targets). Use when modifying code under diffusion/, core/api/v1/common/class.dd_diffusion_api.php, or tools/tool_diffusion — covers the Bun-owns-MariaDB rule, v7 properties vs v6 propiedades, flat virtual tree ontology resolution, delete propagation, and the dd1758 activity log.
---

# Dédalo v7 diffusion conventions

Diffusion converts Dédalo work data into publication formats (SQL tables, RDF files, XML, Socrata) driven by the diffusion ontology. These are the non-negotiable rules and the architecture map for working on it.

## Hard rules (user-enforced, violating these gets corrected)

1. **MariaDB belongs to the Bun engine.** PHP NEVER connects to MariaDB — no `DBi::_getConnection_mysql`, no mysqli, ever. PHP is a client of the Bun diffusion API (`diffusion/api/v1`, unix socket `/tmp/diffusion.sock`). Every MariaDB operation is a Bun action: writes (`diffuse`), deletes (`delete_record`), existence checks (`check_database`), backups via mysqldump (`backup_database`). PHP calls them through `diffusion_api_client::call()` (diffusion/class.diffusion_api_client.php). Auth: forwarded session cookie OR `X-Diffusion-Internal-Token` matching `DIFFUSION_INTERNAL_TOKEN` in Bun `.env` = `DEDALO_DIFFUSION_INTERNAL_TOKEN` in PHP config.

2. **Only `properties` in v7.** `propiedades` / `get_propiedades()` is v6-ONLY. Always `ontology_node->get_properties(true)`. For alias nodes use `diffusion_utils::resolve_node_with_alias($tipo)->properties` (alias contract: alias wins, inherits from real). The only legitimate propiedades reader is `diffusion/migration/migrate_diffusion_properties.php` (it converts v6→v7).

3. **Ontology resolution = flat virtual tree.** Never build v6-style nested maps (`get_diffusion_element_tables_map` was removed). The common representation is a flat array of objects: `{"tipo":"oh88","model":"database","label":"web_default"}` — `model` says what the node is, `label` is the resolved alias-aware name. Entry points in `diffusion/class.diffusion_utils.php`:
   - `get_virtual_diffusion_tree()` — full flat tree (all nodes, alias-resolved, each with `parents` path)
   - `get_section_diffusion_nodes($section_tipo)` — nodes targeting a section (table node for SQL, owl:Class for RDF), with `parents` + `children`
   - `get_section_node_for_element($element_tipo, $section_tipo)`, `get_database_name_for_element($element_tipo)`, `get_table_tipo()`, `get_table_fields()` — helpers built on it. Match diffusion elements via the node's `parents` path (accept alias OR resolved real tipo).

4. **No bespoke database tables ("the Dédalo way").** Operational state lives in standard Dédalo sections/components in PostgreSQL matrix tables — extend an existing section with a new component (ontology change, done by the user on request) instead of creating tables. Example: the diffusion activity log is section dd1758 in `matrix_activity_diffusion`.

5. **`class diffusion` is dead.** The legacy v6 class was deleted. Everything lives in `diffusion_utils` (resolution, publication data, connection status) or format classes (`diffusion_rdf`, `diffusion_xml`, `diffusion_socrata` — standalone, no inheritance). Never reintroduce `diffusion::` calls or port v6 methods wholesale; check `diffusion_utils` for an existing v7 equivalent first.

## Architecture map

- **Publish (SQL)**: tool_diffusion JS → Bun `diffuse` (SSE, chunked) → Bun calls PHP `dd_diffusion_api::diffuse` (cookie+CSRF) → PHP returns datum (context = column defs from ontology, data = records; unpublishable records get `fields:'delete'`) → Bun `diffusion_processor` parses → `sql_generator` (CREATE/upsert/DELETE, key `(section_id, lang)`) → `db.ts` pools, atomic transaction per table. Table name = `datum.term` (alias-aware label).
- **Publish (RDF)**: PHP `diffusion_rdf::update_record` writes ONE deterministic file per record: `{rdf_name}_{section_tipo}_{section_id}.rdf` under `DEDALO_MEDIA_PATH/rdf/{service_name}/`, overwritten on re-publish. `get_record_file_path()` is the single source of truth for the path (publish + delete share it).
- **Delete propagation**: `section_record::delete()` → `diffusion_delete::delete_record()` (diffusion/class.diffusion_delete.php) — ontology walk resolves targets, SQL targets go in one Bun `delete_record` call, RDF unlinks the file. Hybrid model: per-element failures are logged to dd1758 with action=`unpublish_pending` and retried by `diffusion_delete::retry_pending()` (hook at start of `diffuse()` first chunk, CLI `diffusion/migration/helpers/retry_pending_deletions.php`, tool UI button). Diffusion failures must NEVER block the work-system delete.
- **Activity log = THE publication tracking**: section dd1758 (`matrix_activity_diffusion`, PostgreSQL), written via `diffusion_activity_logger::log($section_tipo, $section_id, $element_tipo, $action)`. Components: dd1762 user, dd1761 date, dd1763 locator, dd1764 section_id, dd1765 section_tipo, dd1766 diffusion element, **dd1767 action** (component_select → value-list section dd1774: 1=published, 2=unpublished, 3=unpublish_pending). Every publish (SQL via chain_processor, RDF/Socrata in their update_record) and every delete/unpublish logs here. Query pending rows with `matrix_db_manager::search` using JSONB `@>` on the `relation` column; flip rows in place with `update()`. The legacy per-record metadata writer `update_publication_data()` (dd271/dd1223/dd1224/dd1225 components) was REMOVED — never reintroduce it; the tipo statics remain on `diffusion_utils` only because component_common reads them.
- **Publication eligibility per record**: `component_publication` (yes/no), checked via `diffusion_utils::is_publishable($locator)`.

## Working practices

- Bun side: plain TS interfaces (no zod), manual validation; tolerate errno 1146 (table missing) and 1049 (db missing) as no-op success on deletes; tests in `diffusion/api/v1/test/` with bun:test (run `bun test` — `parsers.test.ts` has a known pre-existing failure, ignore it).
- New API actions: add to the action switch in `diffusion/api/v1/index.ts`; PHP-side actions go in `dd_diffusion_api::API_ACTIONS` allowlist (SEC-024) with explicit permission checks.
- New diffusion format delete handlers plug into the switch in `diffusion_delete::delete_record` (marked `// EXTENSION POINT`).
- Always `php -l` every touched PHP file; the codebase uses tabs and `snake_case`.
