# Dédalo Project Status

Information regarding project tasks and migration progress. NOT for agents.

## Tasks

### V6 to V7 Migration

1. **Installation**: Refactor for clean installation and v6 migration compatibility. It depends of the config refactor.
OK - 3. **Time Machine**:
    * Fix broken section (dd15) and search functionality.
    * Review component history inspector and fix (error: matrix_db_manager::read Invalid table. This table is not allowed to load matrix data.)
    * Permissions for non root users do not work in time machine. Profile do not display the time machine section to set permissions. Set temporally as 1 in core/security/class.security.php
    * Section list is not working properly. See `People` in mdcat for sample.
6. **Ontology Documentation**: Add Markdown output capability to allow AI tools to read the Ontology.
7. **Data Update (v7)**: Remove the `is_portal` property from activity data (dependent on `TOP_TIPO`).
8. **Database Optimization**: Implement PostgreSQL table partitioning for the Time Machine. [Reference](https://chat.deepseek.com/share/8i2lyrdx3m24pcbkz2)
9. **Search Enhancement**: Add an `order` option to sort by custom value sequences (e.g., specific `section_id` order).
    ```json
    {
        "path": [{}, {}],
        "values": [1, 8, 4, 2]
    }
    ```
10. **Activity Log**: Remove `component_filter` (project) from activity logging, the ontology, and `component_filter->save`.
11. **Activity Optimization**: Implement `matrix_activity` exceptions to minimize size (exclude counters, ID values, section data columns, projects, etc.).
12. **Publication Logger**: Consolidate into a single logger for the entire process. Avoid per-component logging to reduce noise and memory overhead during batch processing.
OK - 14. **Search with Children**: Fix "propagate and publish" logic where currently only the parent is affected.
15. **Naming Inconsistency**: Resolve structural naming differences between platforms:
    *   **Server-side (PHP)**: `data` -> `[data_elements]` -> `data_element` -> `{value, lang, ...}`
    *   **Client-side (JS)**: `datum` -> `data` -> `[entries]` -> `entry` -> `{value, lang, ...}`
16. **component_date**: Mode is wrong. Review the logic.
OK - 17. **component_input_text**: list mode fallback value is wrong for non translatable components. Review the logic. (rsc197 Name/Surname)
18. **search**: order do not works
OK - 19. Save CSV files on import, etc. a time machine like images
20. Unify `ddo_map` as `ddo_chain` in all Dédalo apperances.
OK - 21. Fix component portal issues with multiple sections. Case Collections of numisdata4.
22. **dataframe**: Universal dataframe for relations and literals
OK - 23. **components**: Overall stability and unit test server and client
24. **diffusion**: Diffusion log implemtation
25. **database**: Index revission (activity, time machine, etc.)
26. **global**: Stability: search, cache, section, etc.
27. **style**: Area maintenace restyling (dashboard as Enterprise)
28. **style**: Restyling menu? and dark mode.
OK - 29. Tool propagation: Do not load the current selected component data like v6

30 - Unify change handler
@component
Unify component change handler across views

31 - Components test:
@check-component.md
@component

OK - 32. **tool_indexation** access from Oral History list fails
OK - 33. **new record** add a mechanish what, on if the creation of new reord fails, check if is because counter is wrong, and if yes, fix it and try again. (MDCAT ISAD case)
34. **docker** solve root paths and enviromental config for easy implementation
35. **permissions**: check permissions issues. Admin user works but others don't.
OK - 36. ***tools** download registered tool fix
37. ***ontology output markdown** Add tool ontology output to generate comprehensible IA information in MD
38. **activity** Investigate connection with time machine to view users changes in each save action stored in activity
39. **update data v6 -> v7** Extract publication data (first and last publication date and user) from v6 section and create matrix_activity_diffusion records with the equivalence.
