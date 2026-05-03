---
name: Diffusion Ontology Migration
description: Guidelines and scripts for migrating Dédalo Diffusion Ontology properties from legacy v6 format (process_dato) to the new v7 parser-based structure.
---

# Diffusion Ontology Migration (v6 to v7)

This skill documents the process of migrating Dédalo diffusion ontology nodes from the legacy property structure to the new `process` configuration.

## Overview

The migration transforms legacy properties like `process_dato`, `data_to_be_used`, and nested `process_dato_arguments` into a standardized `process` object containing `parser` definitions and a `ddo_map`.

### Legacy Structure (v6)
- **`process_dato`**: Defines a static method (e.g., `diffusion_sql::resolve_value`).
- **`process_dato_arguments`**: Contains `target_component_tipo` and recursive `custom_arguments`.
- **`data_to_be_used`**: Simple string (e.g., "dato").
- **`divisor`**: Separator string.
- **`add_parents`**: Boolean for hierarchical terms.

### New Structure (v7)
- **`process`**: Main container.
    - **`ddo_map`**: Array of DDO objects defining the resolution path.
        - **Rule**: Must always start with the **relation term** defined in the ontology node's relations, if present.
    - **`parser`**: Array of parser functions to apply to the resolved data.
        - `parser_text::join`, `parser_locator::get_section_id`, etc.
        - **Options**: `fields_separator`, `format`, `key`.
    - **`php_formula`**: Optional formula for complex logic (e.g., combining multiple paths).

## Migration Rules

1.  **Relation Term Priority**:
    - If the ontology node has a `relation` (e.g., `dmm1530`), the first item in `ddo_map` MUST be this relation term with `section_tipo: "self"`.
    - The legacy `target_component_tipo` becomes the *second* item in the map, pointing to the relation term as parent.

2.  **Flattening Chains**:
    - Legacy recursive `custom_arguments` are flattened into the `ddo_map` array.
    - Path: `Relation (self) -> Target Component -> Custom Argument Component`.

3.  **Property Mapping**:
    - `divisor` -> `parser[].options.fields_separator`.
    - `add_parents` -> `ddo_map[].add_parents`.
    - `resolve_multiple` -> Create multiple map paths (`id: "a"`, `id: "b"`) and add a `parser` with `implode`.

4.  **Generic Data**:
    - `data_to_be_used: "dato"` -> `parser: [{ fn: "parser_locator::get_section_id" }]`, `ddo_map: [{ tipo: "self" }]`.

## Scripts

1.  **Migration**: `core/diffusion/migration/migrate_diffusion_properties.php`
    -   Reads `diffusion_ontology_migration.json` for explicit rules.
    -   Applies generic logic for `data_to_be_used: "dato"` and `process_dato: "resolve_value"`.

2.  **Verification**: `core/diffusion/migration/verify_migration.php`
    -   Verifies that the database matches the "to" state defined in the JSON file for specific nodes.
