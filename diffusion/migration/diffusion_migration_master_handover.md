# Master Handover: Dédalo V6 to V7 Diffusion Migration

This document provides a comprehensive technical guide to the Dédalo Diffusion Migration process, detailing how version 6 legacy structures are transformed into version 7 configurations and how the new TypeScript-based diffusion engine processes data.

## 1. Core Architecture Comparison

| Feature | Dédalo V6 (Legacy) | Dédalo V7 (Modern) |
| :--- | :--- | :--- |
| **Logic Source** | PHP Component Classes ([get_diffusion_data](file:///Users/render/Desktop/trabajos/dedalo/v6/master_dedalo/core/component_common/class.component_common.php#2773-2866)) | TypeScript Parsers ([parser_locator.ts](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/diffusion/api/v1/lib/parsers/parser_locator.ts), etc.) |
| **Ontology Table** | `matrix_ontology` | [dd_ontology](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/core/db/class.dd_ontology_db_manager.php#15-660) |
| **Property Columns** | [propiedades](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/core/ontology_engine/class.ontology_node.php#678-691) (JSON) | [propiedades](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/core/ontology_engine/class.ontology_node.php#678-691) (V6 clone) & [properties](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/core/ontology_engine/class.ontology_node.php#421-438) (V7 logic) |
| **Runtime** | PHP (Server-side) | Bun / TypeScript (Service-oriented) |

### ⚠️ Critical Clarifications
- **Source of Truth**: The [diffusion_ontology_migration.json](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/diffusion/migration/diffusion_ontology_migration.json) file is **NOT** the source for properties; it is only a reference for understanding common changes.
- **Ontology Resolution**: Always use the ontology resolution in [dd_ontology](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/core/db/class.dd_ontology_db_manager.php#15-660) to obtain the actual [propiedades](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/core/ontology_engine/class.ontology_node.php#678-691) (V6) and [properties](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/core/ontology_engine/class.ontology_node.php#421-438) (V7).
- **Migration Engine**: All transformation logic is defined in [migrate_diffusion_properties.php](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/diffusion/migration/migrate_diffusion_properties.php).

---

## 2. Dédalo V6: Legacy Property Management

In V6, the [propiedades](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/core/ontology_engine/class.ontology_node.php#678-691) JSON object controlled data resolution via several key mechanisms:
- **`process_dato`**: Specified a static PHP method (e.g., `diffusion_sql::resolve_value`).
- **`process_dato_arguments`**: Arguments for the processor, including `target_component_tipo` and `component_method`.
- **`custom_arguments`**: Enabled recursive chained resolution (e.g., Source -> Relation -> Target).
- **`option_obj`**: Passed specific UI/Logic flags like [add_parents](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/core/component_relation_common/class.component_relation_common.php#1458-1527) or `divisor`.

For detailed V6 structure, refer to: [diffusion_ontology_v6.md](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/diffusion/migration/diffusion_ontology_v6.md).

---

## 3. The Migration Pipeline (V6 ➔ V7)

The script [migrate_diffusion_properties.php](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/diffusion/migration/migrate_diffusion_properties.php) automates the conversion. It reads the legacy [propiedades](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/core/ontology_engine/class.ontology_node.php#678-691) and generates the new V7 [properties](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/core/ontology_engine/class.ontology_node.php#421-438) JSON.

### Standard Transformation Rules
1.  **Component Date**: Maps to `parser_date::string_date`.
2.  **Enum Fields**: Maps to `parser_locator::get_section_id` + `parser_text::map_value`.
3.  **Hierarchy (Thesaurus/Locators)**:
    -   If `add_parents: true` or [map_locator_to_terminoID](file:///Users/render/Desktop/trabajos/dedalo/v6/master_dedalo/core/diffusion/class.diffusion_sql.php#3602-3770) is used, it maps to `parser_locator::flat_parents` or `parser_locator::get_parent_term_id`.
4.  **Chained Relations**: Maps to [add_parents](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/core/component_relation_common/class.component_relation_common.php#1458-1527) or [ds](file:///Users/render/Desktop/trabajos/dedalo/v6/master_dedalo/core/diffusion/class.diffusion_sql.php#725-783) (Double Step) logic in V7.

---

## 4. Dédalo V7: Parsing & Resolution

V7 utilizes a chain of TypeScript parsers. The result of one parser can be passed to the next (e.g., [get_section_id](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/diffusion/api/v1/lib/parsers/parser_locator.ts#18-53) -> [map_value](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/diffusion/api/v1/lib/parsers/parser_text.ts#203-260)).

### Key Parsers in [parser_locator.ts](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/diffusion/api/v1/lib/parsers/parser_locator.ts)
- **[add_parents](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/core/component_relation_common/class.component_relation_common.php#1458-1527)**: The fundamental wrapper for hierarchical resolution.
- **[flat_parents](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/diffusion/api/v1/lib/parsers/parser_locator.ts#471-532)**: A complex orchestrator that handles:
    -   `parent_end_by_term_id`: Clipping the hierarchy at a specific node.
    -   `parents_splice`: Slicing the parent chain.
    -   [resolve_value](file:///Users/render/Desktop/trabajos/dedalo/v6/master_dedalo/core/diffusion/class.diffusion_sql.php#4985-5314): Deciding whether to return the label (term) or the ID.
- **[get_parent_term_id](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/diffusion/api/v1/lib/parsers/parser_locator.ts#253-325)**: Extracts `{section_tipo}_{section_id}` identifiers.

### Handling JSON Arrays vs. Strings
A major refinement was made to support legacy database formats that required JSON arrays (e.g., `["es1_1257"]`) instead of joined strings.
- **The Challenge**: Parsers traditionally return strings for DB storage.
- **The Solution**: 
    -   Set `records_separator: false` in the parser options.
    -   The parser returns a raw JavaScript array.
    -   The [diffusion_processor.ts](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/diffusion/api/v1/lib/diffusion_processor.ts) detects the array and uses `JSON.stringify()` before saving to the MariaDB target.
    -   **Important**: Ensure `output_format: "json"` is set in the V7 property definition for these fields.

---

## 5. Lessons Learned & Error Handling

### PHP Migration Hurdles
- **Variable Scope**: When adding new rules to [migrate_diffusion_properties.php](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/diffusion/migration/migrate_diffusion_properties.php), ensure variables like `$parser_def` are properly assigned before use to avoid PHP unassigned variable errors.
- **Strict Typing**: V7 properties are strict. If the migration script misses a property (like `output_format`), the diffusion engine might default to an incorrect representation.

### TypeScript Linting
- **Option Types**: When adding new options (like [boolean](file:///Users/render/Desktop/trabajos/dedalo/v6/master_dedalo/core/diffusion/class.diffusion_sql.php#4663-4677) values for `records_separator`), update the [parser_options](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/diffusion/api/v1/lib/types.ts#89-98) interface in [types.ts](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/diffusion/api/v1/lib/types.ts) to prevent "Property XXX does not exist" errors.

---

## 6. Verification Workflow

To verify a migration:
1.  Sync legacy props from V6 to V7 `dd_ontology.propiedades` using a sync script.
2.  Run `php migrate_diffusion_properties.php`.
3.  Inspect `dd_ontology.properties` for the target [tipo](file:///Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/core/ontology_engine/class.ontology_node.php#175-184).
4.  Run the V7 diffusion process (e.g., `bun run_v7_processor.ts`).
5.  Check the target MariaDB table to confirm schema and data formats match V6 expectations.
