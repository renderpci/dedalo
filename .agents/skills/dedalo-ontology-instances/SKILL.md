---
name: dedalo-ontology-instances
description: How to use the Dédalo ontology to create and manage instances of sections and components.
---

# Creating Instances from Ontology in Dédalo

This skill documents how Dédalo uses its ontology to create runtime instances of sections, components, and other structures. The ontology defines **what** can exist (schemas, behaviors, properties), while instances are the actual data records stored in the database.

## Core Concepts

### Ontology vs Data

| Concept | Storage | Purpose |
| :--- | :--- | :--- |
| **Ontology Node** | `dd_ontology` table | Defines structure, models, properties, and behaviors |
| **Section Record** | `matrix*` tables | Stores actual data records created from ontology definitions |
| **Component Instance** | In-memory (PHP/JS) | Runtime object that reads/writes data according to ontology rules |

### The `tipo` Identifier

Every ontology node is identified by a **tipo** (Typology of Indirect Programming Objects):
- Format: `{TLD}{number}` (e.g., `oh1`, `dd156`, `rsc85`)
- **TLD** (Top Level Domain) = namespace (e.g., `oh` = Oral History, `dd` = Dédalo core)

---

## Reading Ontology Definitions

Use [ontology_node](file:///Users/render/Desktop/trabajos/dedalo/v6/master_dedalo/core/ontology_engine/class.ontology_node.php) to read ontology information:

```php
// Get an ontology node instance
$node = ontology_node::get_instance('oh1');

// Read ontology properties
$model      = $node->get_model();         // e.g., "section", "component_portal"
$term       = $node->get_term('lg-eng');  // Human-readable label
$parent     = $node->get_parent();        // Parent tipo
$properties = $node->get_properties();    // Configuration object
$relations  = $node->get_relations();     // Array of related tipos
$tld        = $node->get_tld();           // e.g., "oh"
$model_tipo = $node->get_model_tipo();    // e.g., "dd6" for section model
```

### Static Helper Methods

```php
// Get model name from tipo
$model = ontology_node::get_model_by_tipo('oh25');  // "component_input_text"

// Get label/term from tipo
$label = ontology_node::get_term_by_tipo('oh1', 'lg-eng');  // "Oral History Interview"

// Get children of an ontology node
$children = ontology_node::get_ar_children('oh1');  // Array of child tipos

// Get recursive children
$all_descendants = ontology_node::get_ar_recursive_children('oh1');
```

---

## Creating Section Records

Sections are the primary data containers in Dédalo. Each section record corresponds to a row in a "matrix" table.

### Standard Creation via Section Class

```php
// 1. Get section instance (definition from ontology)
$section = section::get_instance('oh1');

// 2. Create a new record
$section_id = $section->create_record();

// 3. With initial values (optional)
$options = new stdClass();
$options->values = (object)[
    'string' => (object)[
        'oh25' => [
            (object)['id' => 1, 'lang' => 'lg-eng', 'value' => 'Initial title']
        ]
    ]
];
$section_id = $section->create_record($options);
```

### Direct Creation via Section Record

```php
// Create a new section record directly
$section_record = section_record::create(
    'oh1',      // section_tipo
    null,       // section_id (null = auto-assign from counter)
    null        // values (optional initial data)
);

$section_id = $section_record->section_id;
```

### Working with Existing Records

```php
// Get an existing section record
$section_record = section_record::get_instance('oh1', 123);

// Check if exists
if ($section_record->exists_in_the_database()) {
    // Read all data
    $data = $section_record->get_data();
    
    // Read component data
    $component_data = $section_record->get_component_data('oh25', 'string');
    
    // Modify component data
    $section_record->set_component_data('oh25', 'string', $new_data);
    
    // Save changes
    $section_record->save();
}
```

---

## Creating Component Instances

Components are created at runtime to read/write data. They use the ontology to determine behavior.

### Standard Instantiation

```php
// Get component instance using ontology model resolution
$component = component_common::get_instance(
    'component_input_text',  // model (from ontology or explicit)
    'oh25',                  // tipo (component's ontology identifier)
    123,                     // section_id
    'edit',                  // mode: 'edit', 'list', 'search'
    'lg-eng',                // lang
    'oh1'                    // section_tipo
);

// Or let Dédalo resolve the model automatically
$model = ontology_node::get_model_by_tipo('oh25');
$component = component_common::get_instance(
    $model,
    'oh25',
    123,
    'edit',
    DEDALO_DATA_LANG,
    'oh1'
);
```

### Working with Component Data

```php
// Get data (full array with all languages)
$data = $component->get_data();

// Get data for current language only
$data_lang = $component->get_data_lang();

// Set data
$component->set_data([
    (object)[
        'id'    => 1,
        'lang'  => 'lg-eng',
        'value' => 'New value'
    ]
]);

// Save to database
$component->save();
```

---

## Data Column Types

Components store data in different columns based on their type:

| Column | Component Types | Data Format |
| :--- | :--- | :--- |
| `string` | input_text, text_area, select, etc. | `[{id, lang, value}]` |
| `relation` | portal, autocomplete, section_id | `[{section_tipo, section_id, ...}]` |
| `number` | number, order | `[{id, value}]` |
| `date` | date, publication_date | `[{id, start, end}]` |
| `data` | Section record metadata | `{section_id, created_by, ...}` |
| `meta` | Component metadata | Per-component configuration |

---

## Duplicating Records

```php
// Get existing section record
$section_record = section_record::get_instance('oh1', 123);

// Duplicate (creates new record with same data)
$new_section_id = $section_record->duplicate();
```

This handles:
- Creating a new section with the next available counter
- Copying all component data (except section info)
- Duplicating media files for media components
- Creating Time Machine entries

---

## Ontology Properties Reference

Common properties that affect instance behavior:

```php
$properties = ontology_node::get_instance('oh25')->get_properties();
```

| Property | Purpose |
| :--- | :--- |
| `css` | Custom styling for the component |
| `source` | Data source configuration for portals |
| `target` | Target section for relation components |
| `widgets` | Associated widget configurations |
| `dato_default` | Default data value |
| `render` | Custom render options |
| `color` | UI color for areas/sections |

---

## Best Practices

1. **Always use ontology for model resolution**: Use `ontology_node::get_model_by_tipo()` rather than hardcoding models.

2. **Cache section_record instances**: Use `section_record::get_instance()` to benefit from singleton caching.

3. **Use appropriate data columns**: Match `set_component_data($tipo, $column, $data)` column to the component type.

4. **Validate tipos**: Use `safe_tipo()` before using user-provided tipos.

5. **Handle translatable components**: Check `ontology_node::get_translatable($tipo)` before setting language-specific data.

```php
// Example: Safe component instantiation
$tipo = 'oh25';
if (safe_tipo($tipo) === $tipo) {
    $model = ontology_node::get_model_by_tipo($tipo);
    if (!empty($model)) {
        $component = component_common::get_instance(
            $model,
            $tipo,
            $section_id,
            'edit',
            DEDALO_DATA_LANG,
            $section_tipo
        );
    }
}
```
