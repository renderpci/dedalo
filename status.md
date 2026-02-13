# Dédalo Project Status

Information regarding project tasks and migration progress.

## Tasks

### V6 to V7 Migration

1. **Installation**: Refactor for clean installation and v6 migration compatibility.
2. **Ontology Update**: Export from version 6 and import into master v7.
3. **Time Machine**: Fix broken section (dd15) and search functionality.
    *   Review latest changes inspector and fix
    *   Review component history inspector and fix (error: matrix_db_manager::read Invalid table. This table is not allowed to load matrix data.)
4. **Data Migration**: Transform legacy Time Machine table data to the new model.
5. **Autocomplete**: Migrate functionality away from the legacy `relation` table.
6. **Ontology Documentation**: Add Markdown output capability to allow AI tools to read the Ontology.
7. **Refactor `ontology_node`**:
    *   Implement a static `create` method for instantiating new nodes.
8. **Data Update (v7)**: Remove the `is_portal` property from activity data (dependent on `TOP_TIPO`).
9. **Database Optimization**: Implement PostgreSQL table partitioning for the Time Machine. [Reference](https://chat.deepseek.com/share/8i2lyrdx3m24pcbkz2)
10. **Search Enhancement**: Add an `order` option to sort by custom value sequences (e.g., specific `section_id` order).
    ```json
    {
        "path": [{}, {}],
        "values": [1, 8, 4, 2]
    }
    ```
11. **Activity Log**: Remove `component_filter` (project) from activity logging, the ontology, and `component_filter->save`.
12. **Activity Optimization**: Implement `matrix_activity` exceptions to minimize size (exclude counters, ID values, section data columns, projects, etc.).
13. **Publication Logger**: Consolidate into a single logger for the entire process. Avoid per-component logging to reduce noise and memory overhead during batch processing.
14. **Portal Component**: Support linking multiple items from the chain within a portal (Contributed by Manuel).
15. **Search with Children**: Fix "propagate and publish" logic where currently only the parent is affected.
16. **Naming Inconsistency**: Resolve structural naming differences between platforms:
    *   **Server-side (PHP)**: `data` -> `[data_elements]` -> `data_element` -> `{value, lang, ...}`
    *   **Client-side (JS)**: `datum` -> `data` -> `[entries]` -> `entry` -> `{value, lang, ...}`
