---
name: dedalo-diffusion-field-standardization
description: Guidelines for ensuring V7 Diffusion output matches legacy V6 behavior, particularly for hierarchy resolution and multi-value fields.
---

# Dédalo Diffusion Field Standardization Skill

This skill outlines the process for refining V7 diffusion fields to ensure parity with legacy V6 behavior. This is critical when migrating projects where external systems expect specific string formats (e.g., concatenated geographic hierarchies).

## 1. Diagnostic Phase: V6 vs V7 Behavior

Before modifying code, identify the exact difference between versions:
- **V6 Reference**: Investigate how V6 generated the string. Often, components like `component_autocomplete_hi` or `component_relation` used internal join logic (e.g., `, `) or parent resolution.
- **V7 State**: Check the V7 `matrix` and `dd_ontology`. Determine if the field is a direct value, a relation, or handled via `ddo_map`.

## 2. Standardizing Parent Hierarchies

For geographic fields (like Birthplace or Location) that require a full path (e.g., "City, County, State"), use the `flat_parents` parser.

### Key Configuration in `ddo_map`:
```json
"parser": [
    {
        "fn": "parser_locator::flat_parents",
        "options": {
            "include_parents": true,
            "records_separator": ", ",
            "resolve_value": true
        }
    }
]
```

### Parser Coordination Guidelines:
- **`include_parents`**: Set to `true` to get the full hierarchical chain.
- **`records_separator`**: Ensure this matches the V6 separator (usually `, `).
- **Joining Multiple Items**: If a record has multiple related items (e.g., two birthplaces), the parser must join these sets using the same `records_separator` to maintain consistency.

## 3. Handling Multi-Value Items

When a component is mono-value in the UI but multi-value in the data (common in V6 to V7 migrations), ensure the diffusion system handles the array correctly:
- **String Fallback**: If no parser is present, `join_items_to_string` handles the join.
- **Parser Logic**: If using a custom parser chain, the final join in the `parser_locator` must respect the `records_separator` to avoid inconsistent delimiters (e.g., avoid mixing `; ` and `, `).

## 4. Environment & Connectivity Troubleshooting

Diffusion processing often happens in a hybrid environment (PHP for resolution, TypeScript for SQL generation).
- **Socket Connectivity**: In MariaDB/MySQL environments on Mac/Linux, use `socketPath` (e.g., `/tmp/mysql.sock`) in the Node/Bun environment if standard `host: 'localhost'` fails due to authentication restrictions on the `root` or `render` users.
- **Runtime Execution**: Use `bun` for faster TypeScript execution during the data parsing/SQL generation phase.

## 5. Verification Workflow

1. **PHP Resolution**: Run the PHP diffusion script (e.g., `run_v7_diffusion.php`) to generate the JSON dump.
2. **Inspect Dump**: Use `jq` to verify the `context` and `entries` for the target field.
3. **TS Processing**: Run the TypeScript processor (e.g., `run_v7_processor.ts`) to generate and insert SQL.
4. **Database Check**: Query the target MariaDB/MySQL database directly to confirm the final string format matches the required legacy pattern.
