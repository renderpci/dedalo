---
name: dedalo-flow-analysis
description: Analyzing and debugging Dédalo's complex runtime data flows and component lifecycles.
---

# Dédalo Flow Analysis Skill

This skill provides guidance on how to trace data and context through the Dédalo framework, from the database and ontology to the client-side UI components.

## Core Concepts

### 1. Rendering Lifecycle
Every Dédalo component and section follows a strictly synchronous-to-asynchronous lifecycle:
- **`init(options)`**: Basic property assignment. Fast and synchronous.
- **`build(autoload)`**: The "heavy lifting". Fetches data and context from the API if `autoload` is true. Populates `self.data` and `self.context`.
- **`render(options)`**: Builds the DOM element based on the `build` results.

### 2. Request Query Object (rqo)
The `rqo` is the fundamental bridge between client and server.
- Key properties: `action`, `source`, `sqo`.
- `sqo` contains filters like `section_tipo`, `section_id`, and `filter_by_locators`.
- Always inspect the generated `rqo` in the browser console when data is missing.

### 3. Mode Inheritance Trap
A common bug in Dédalo is the failure of nested components (like portal children) to inherit the active `mode` (e.g., `tm`, `edit`, `list`).
- **Symptom**: Portal is visible but some columns or child data are empty.
- **Root Cause**: The portal's children are defined in the ontology in one mode (often `list`) but the server resolves them in another (like `tm` for Time Machine).
- **Solution**: Ensure the `mode` is propagated recursively in `request_config` or handled via fallback in matching logic.

## Debugging Workflow

### Stage 1: UI Identification
- Identify the `tipo` and `model` of the problematic element.
- Use browser DevTools to see the element's CSS classes (they usually contain the `tipo`).

### Stage 2: Client-Side Trace
- Set breakpoints in `core/common/js/common.js` in `get_columns_map`.
- Inspect `self.datum.context` and `self.datum.data` inside `section_record.js` during instances creation.
- Verify if `get_component_data` is finding a match. If it returns "No data found", check for mode or ID mismatches.

### Stage 3: API Request/Response
- Look for the `/core/api/get_json.php` call.
- Copy the response JSON and verify if the missing component's data/context is actually present.
- If it's NOT in the response, the issue is server-side (`class.common.php` or model specific `json.php`).
- If it IS in the response, the issue is client-side matching.

### Stage 4: Server-Side Trace
- Use `dump($var)` and `to_string($var)` for server-side logging.
- Check `get_structure_context` in `class.common.php` to see how ddo tags are resolved.
- For portals, check `get_subdatum` to see how links are followed.

## Essential Tools
- **JS**: `console.log('label', value)`, `clone(obj)` for safe logging.
- **PHP**: `dump($data)`, `ontology_node::get_term_by_tipo($tipo)`.
- **Ontology**: Refer to `core/ontology/ontology.json` to verify component relations.
