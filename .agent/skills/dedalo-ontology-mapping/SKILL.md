---
name: dedalo-ontology-mapping
description: Navigating and interpreting Dédalo's ontology-driven configuration system.
---

# Dédalo Ontology Mapping Skill

Dédalo uses a massive `ontology.json` to define almost all application behavior. Understanding how to navigate this mapping is crucial for AI agents.

## Key Ontology Elements

### 1. `tipo` and `model`
- **`tipo`**: The unique identifier for every ontology node (e.g., `dd15`, `rsc329`).
- **`model`**: The functional role of the node (e.g., `section`, `component_text_area`, `tool_time_machine`).

### 2. Relationships
Components are linked to sections and portals via relations.
- **`parent`**: The immediate container `tipo`.
- **`relations`**: Array of linked `tipo` nodes (child components, tools, buttons).

### 3. `properties`
The `properties` object controls specific component behavior:
- `show_interface`: Visibility of tools/buttons.
- `source`: Configuration for portals and external links, often containing `request_config`.
- `config_relation`: Logic for indexing and tags.

## Search Strategies

### Finding a Component Definition
To find where a component is configured:
```bash
grep -C 5 "\"tipo\": \"dd578\"" core/ontology/ontology.json
```

### Tracing Hierarchy
If a UI element is missing a button/tool, trace UP to its parent and DOWN to its sibling tools:
1. Find the element's `parent` in the ontology.
2. Search for other nodes with that same `parent`.
3. Check their `model` types for discrepancies.

## Implementation Guide

### Adding Columns to Portals
When a portal appears empty but has data, check its `columns_map`.
If the `columns_map` is not defined in the ontology, the system attempts to build it from the `ddo_map` inside `request_config`.

### Changing Component Modes
If you need a component to behave differently in a specific context (like Time Machine):
1. Locate the component's DDO in the `request_config`.
2. Add or modify the `mode` property.
3. Verify that the server correctly inherits this mode during resolution.

## Common Terms
- **DDO (Dedalo Data Object)**: A runtime representation of an ontology node.
- **Locator**: A pointer to a specific record (contains `section_tipo` and `section_id`).
- **Section List**: A specialized child of a section node that defines visibility in list views.
