---
name: dedalo-server-debugging
description: Debugging and extending Dédalo's PHP core and API handlers.
---

# Dédalo Server Debugging Skill

This skill provides patterns for investigating Dédalo's server-side logic in its PHP 8.3 codebase.

## Essential Debugging Functions

Dédalo includes several utilities for inspecting state without breaking JSON API responses (when configured correctly):

### 1. `dump()`
Standard inspection tool. Use it to view objects and arrays.
```php
dump($data, "Debugging data at line " . __LINE__);
```

### 2. `to_string()`
Converts complex objects to a readable string format, useful for logs.

### 3. `debug_log()`
Writes to the system log.
```php
debug_log("Method " . __METHOD__ . " called with tipo: " . $tipo, logger::DEBUG);
```

## Core Classes to Investigate

### 1. `class.common.php`
The base for almost everything.
- **`get_structure_context()`**: Controls how metadata is resolved.
- **`get_subdatum()`**: Recursively resolves linked portal data.
- **`get_columns_map()`**: Determines visibility in lists.

### 2. `class.section_record.php`
Handles individual record logic.
- **`get_component_data()`**: The bridge between the database blob and component instances.
- **`get_created_by_user_id()`**: Key for permission-based identity checks.

## Common Core Patterns

### Mode Propagation
When extending components, ensure that the `$mode` is correctly inherited from callers.
```php
// Correct inheritance pattern in class.common.php
if (!isset($current_ddo->mode)) {
    $current_ddo->mode = ($mode === 'tm') ? 'tm' : 'list';
}
```

### Locator Resolution
Always verify if a component uses a **Locator** to find its data.
The locator must contain:
- `section_tipo`: The table/type identifier.
- `section_id`: The record identifier.

## API Workflow
1. Request arrives at `core/api/get_json.php`.
2. Controller identifies the model and section.
3. Model-specific JSON controller is included (e.g., `core/component_portal/component_portal_json.php`).
4. Output is aggregated via `common::build_element_json_output()`.

## Security & Performance
- **Permissions**: Always check `$this->get_component_permissions()` before returning data.
- **Strict Typing**: Use type hints for all parameters and return values to catch errors early.
- **Prepared Statements**: Use the database abstraction layer properly to avoid SQL injection.
