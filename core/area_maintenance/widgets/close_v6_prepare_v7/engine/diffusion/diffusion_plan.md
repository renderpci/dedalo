# Plan: New Diffusion Data Model with Enhanced DDO Map Chains

## Overview
This plan creates a **complete replacement** for the current diffusion architecture. The new system provides a **unified API that returns standardized resolved data** in JSON format. **External processors** are responsible for converting this data to final output formats (SQL, XML, RDF, etc.).

> [!IMPORTANT]
> **Key architectural decision**: The diffusion API returns standardized JSON data only. Format-specific classes (`class.diffusion_xml.php`, `class.diffusion_sql.php`, `class.diffusion_mysql.php`, `class.diffusion_rdf.php`, `class.diffusion_socrata.php`) will be **removed**. External tools/scripts handle format conversion.

> [!NOTE]
> Classes to **preserve and refactor**: `diffusion_data`, `diffusion_object`, `diffusion_data_object`. 
> Classes to **remove**: `diffusion`, `diffusion_xml`, `diffusion_sql`, `diffusion_mysql`, `diffusion_rdf`, `diffusion_socrata`.

---

## Existing Models to Build Upon

### Core Classes Analysis

The following classes contain patterns and structures that should be **preserved and enhanced** in the new architecture:

#### 1. `diffusion_object` (class.diffusion_object.php)
**Purpose**: Represents ontology diffusion nodes for publication output

```php
// Key properties to preserve:
class diffusion_object {
    public $typo = 'dfo';        // Type identifier
    public $tipo;                // string e.g. 'rsc636'
    public $parent;              // string e.g. 'rsc630'
    public $name;                // string e.g. 'mmo:mint' (column/node name)
    public $data;                // array of diffusion_data_object items
    public $process;             // object { ddo_map:[], parser:[] }
    public $model;               // string|null e.g. 'component_input_text'
}
```

**Key Pattern**: Hierarchical structure with `tipo`→`parent` relationships for building output trees (XML nodes, SQL columns, etc.)

---

#### 2. `diffusion_data_object` (class.diffusion_data_object.php)
**Purpose**: Normalized data carrier for resolved component values

```php
// Key properties to preserve:
class diffusion_data_object {
    public $tipo;        // string e.g. 'rsc636'
    public $lang;        // string e.g. 'lg-spa'
    public $value;       // mixed - the resolved data value
    public $id;          // string e.g. 'a' (tag_id)
    public $section_id;  // string|int - source record identifier
}
```

**Key Pattern**: Language-aware value storage with strict type enforcement via setter methods.

---

#### 3. `diffusion_data` (class.diffusion_data.php)
**Purpose**: DDO map resolution engine using recursive traversal

```php
// Key methods to preserve:
class diffusion_data {
    // Creates ddo_map from ontology properties or generates from related components
    public static function get_ddo_map(string $diffusion_tipo, string $section_tipo): array;
    
    // Recursive resolution: parent → children traversal
    public static function get_ddo_map_value(object $options): array;
    
    // Single DDO resolution with child recursion
    public static function get_ddo_value(object $ddo, array $ddo_map, string $section_tipo, string|int $section_id): array;
}
```

**Key Patterns**:
1. **Self resolution**: `section_tipo === 'self'` → replace with current section_tipo
2. **Recursive chain**: Parent DDO gets locators → iterate children with each locator's section
3. **Terminal detection**: DDO with no children → call `get_diffusion_data()`
4. **Key assignment**: Each value gets `key = section_tipo_section_id` for grouping

---

#### 4. `diffusion_xml` (class.diffusion_xml.php) - TO BE REMOVED
**Purpose**: Reference for pipeline stages (logic will be extracted, class will be removed)

**Pipeline Stages** (to extract into new unified processor):

```
1. update_record()           → Entry point with section_tipo/section_id   ✓ KEEP
       ↓
2. get_root_tipo()           → Find diffusion element linked to section   ✓ KEEP
       ↓
3. get_diffusion_objects()   → Build hierarchical diffusion_object tree   ✓ KEEP
       ↓
4. resolve_data()            → Call diffusion_data to resolve ddo_map     ✓ KEEP
       ↓
5. resolve_data_rows()       → Group multi-locator data into row groups   ✓ KEEP
       ↓
6. resolve_langs()           → Split translatable data by language        ✓ KEEP
       ↓
7. parse_diffusion_object()  → Apply parsers (pre_parser → parser chain)  ✓ KEEP
       ↓
8. RETURN STANDARDIZED JSON  → External processor handles final format    ✓ NEW
       ↓
[REMOVED] save()             → Format-specific output handled externally
```

---

## Phase 1: Unified Diffusion Data Model

### 1.1 Fresh Ontology Analysis Pass
**Objective**: Complete analysis of all diffusion `propiedades` in the ontology.

**Steps**:
1. Extract ALL `propiedades` with `diffusion` configuration under ontology node `dd1190` (excluding children of `dd7`)
2. Map each property to the new unified model structure
3. Consolidate definitions into `diffusion_models_reference.json`
4. Validate backward compatibility with existing `diffusion_data::get_ddo_map()` logic

### 1.2 Enhanced DDO Map Structure (New Ontology Properties Format)
**Objective**: Define unified `process` properties structure for diffusion nodes

The new format includes:
- **`ddo_map`**: Chain of components to resolve, with optional `id` for parser references
- **`parser`**: Final formatting with pattern templates referencing DDO `id` values
- **`pre_parser`**: Pre-processing for specific components before parser

```json
{
  "process": {
    "pre_parser": [
      {
        "fn": "parser_date::string_date",
        "tipo": "numisdata1468",
        "options": {
          "separator": " | "
        }
      }
    ],
    "ddo_map": [
      {
        "id": "a",
        "info": "Find date - component_date",
        "tipo": "numisdata1468",
        "parent": "self",
        "section_tipo": "self"
      },
      {
        "id": "b",
        "info": "Date remark - component_text_area",
        "tipo": "numisdata1470",
        "parent": "self",
        "section_tipo": "self"
      },
      {
        "info": "Find category - component_autocomplete_hi (link node, no id)",
        "tipo": "numisdata1452",
        "parent": "self",
        "section_tipo": "self"
      },
      {
        "id": "c",
        "info": "Term - component_input_text",
        "tipo": "hierarchy25",
        "parent": "numisdata1452",
        "section_tipo": "depositiontype1"
      },
      {
        "id": "d",
        "info": "Find category remark - component_text_area",
        "tipo": "numisdata1453",
        "parent": "self",
        "section_tipo": "self"
      },
      {
        "info": "Discovery method - component_autocomplete_hi (link node)",
        "tipo": "numisdata1476",
        "parent": "self",
        "section_tipo": "self"
      },
      {
        "id": "e",
        "info": "Discovery method term - component_input_text",
        "tipo": "numisdata243",
        "parent": "numisdata1476",
        "section_tipo": "numisdata241"
      },
      {
        "id": "f",
        "info": "Discovery method remark - component_text_area",
        "tipo": "numisdata1477",
        "parent": "self",
        "section_tipo": "self"
      }
    ],
    "parser": [
      {
        "fn": "parser_text::text_format",
        "options": {
          "pattern": "${a} - ${b}, ${c}, ${d}, ${e}, ${f}"
        }
      }
    ]
  }
}
```

### 1.3 DDO Map Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | No | Identifier for parser pattern references (e.g., `a`, `b`, `c`) |
| `info` | string | No | Human-readable description for documentation |
| `tipo` | string | Yes | Component tipo to resolve |
| `parent` | string | Yes | Parent DDO tipo or `"self"` for root level |
| `section_tipo` | string | Yes | Target section tipo or `"self"` for current section |

> [!NOTE]
> DDO items without `id` are **link nodes** that resolve locators for their children but don't produce direct output values. Items with `id` produce values referenced in the parser pattern.

### 1.4 Parser/Pre-parser Properties

| Property | Type | Description |
|----------|------|-------------|
| `fn` | string | Parser function in `class::method` format |
| `tipo` | string | (pre_parser only) Target component tipo |
| `options` | object | Function-specific options |
| `options.pattern` | string | (parser) Template with `${id}` placeholders |
| `options.separator` | string | Value separator |

### 1.3 Chain Action System
**Objective**: Formalize chain actions (currently implicit in `diffusion_data::get_ddo_value`)

The existing code uses implicit patterns:
- **Has children?** → Get locators, recurse into children
- **No children?** → Call `get_diffusion_data()` (terminal)

**New explicit `chain_action` values**:

| Action | Maps to Existing Pattern | Returns |
|--------|--------------------------|---------|
| `get_component_data` | DDO with children → get locators | Component data + locators |
| `resolve_locators` | Parent locators → child resolution | Resolved values per locator |
| `get_literal_value` | No children → `get_diffusion_data()` | Final resolved value |

---

## Phase 2: Unified Diffusion Processor

### 2.1 Core Processor Class (Refactored from diffusion_data)
**Objective**: Create format-agnostic processor based on existing patterns

```php
class diffusion_chain_processor {
    
    /**
     * Main entry point - generalizes diffusion_data::get_ddo_map_value()
     * @param object $options {
     *   section_tipo: string,
     *   section_id: int,
     *   ddo_map: array,
     * }
     * @return array<diffusion_data_object>
     */
    public function resolve_chain(object $options): array {
        
        $ddo_map        = $options->ddo_map;
        $section_tipo   = $options->section_tipo;
        $section_id     = $options->section_id;
        $parent         = $options->parent ?? $section_tipo;
        
        // Get direct children of parent (existing pattern from diffusion_data)
        $children = array_filter($ddo_map, fn($item) => $item->parent === $parent);
        
        $values_collection = [];
        foreach ($children as $ddo) {
            $ddo_value = $this->resolve_ddo($ddo, $ddo_map, $section_tipo, $section_id);
            $values_collection[] = $ddo_value;
        }
        
        // Flatten results
        return array_merge(...$values_collection);
    }
    
    /**
     * Single DDO resolution - refactored from diffusion_data::get_ddo_value()
     */
    private function resolve_ddo(
        object $ddo, 
        array $ddo_map, 
        string $section_tipo, 
        string|int $section_id
    ): array {
        
        $current_tipo = $ddo->tipo;
        $model_name = ontology_node::get_model_by_tipo($current_tipo);
        
        // Get element instance
        $element = $this->get_element_instance($model_name, $current_tipo, $section_id, $section_tipo);
        
        // Check for children (determines terminal vs recursive)
        $children = array_values(array_filter($ddo_map, fn($item) => $item->parent === $current_tipo));
        
        if (empty($children)) {
            // Terminal: get diffusion data (existing pattern)
            return $element->get_diffusion_data($ddo);
        }
        
        // Recursive: get locators and process children
        $ar_locators = $element->get_dato() ?? [];
        
        // Get valid section_tipos from children
        $valid_sections = array_map(fn($d) => $d->section_tipo, $children);
        
        $ar_values = [];
        foreach ($ar_locators as $locator) {
            if (!in_array($locator->section_tipo, $valid_sections)) {
                continue;
            }
            
            // Recurse with locator's section context
            $child_options = (object)[
                'ddo_map'      => $ddo_map,
                'parent'       => $current_tipo,
                'section_tipo' => $locator->section_tipo,
                'section_id'   => $locator->section_id
            ];
            
            $child_values = $this->resolve_chain($child_options);
            
            // Assign grouping key (existing pattern)
            foreach ($child_values as $value) {
                $value->key = $locator->section_tipo . '_' . $locator->section_id;
            }
            
            $ar_values = array_merge($ar_values, $child_values);
        }
        
        return $ar_values;
    }
}
```

### 2.2 Result Wrapper Class (Extends diffusion_object)
**Objective**: Enhanced diffusion_object with debug chain support

```php
class diffusion_result extends diffusion_object {
    
    // Inherited from diffusion_object:
    // $typo, $tipo, $parent, $name, $data, $process, $model
    
    // New properties for chain debugging:
    public ?string $debug_chain_string = null;
    public ?array $chain_entries = null;
    
    /**
     * Build human-readable debug chain
     */
    public function build_debug_chain(): string {
        if (empty($this->chain_entries)) {
            return '';
        }
        
        $parts = [];
        foreach ($this->chain_entries as $entry) {
            $parts[] = $entry->section_tipo . '_' . $entry->section_id;
            $parts[] = $entry->ddo_tipo;
        }
        
        return implode(' → ', $parts);
    }
}
```

---

## Phase 3: Standardized Output Data Structure

> [!IMPORTANT]
> **No format-specific renderers in the API**. The diffusion API returns a standardized JSON structure with **context** (parser definitions) and **data** (resolved values with id references). External processors use context to apply parsing.

### 3.1 Standardized Output Format
**Objective**: Define the JSON structure with context and data separation

```json
{
  "result": true,
  "msg": "OK. Request done",
  "total": 1,
  "context": {
    "pre_parser": [
      {
        "fn": "parser_date::string_date",
        "tipo": "numisdata1468",
        "options": {
          "separator": " | "
        }
      }
    ],
    "parser": [
      {
        "fn": "parser_text::text_format",
        "options": {
          "pattern": "${a} - ${b}, ${c}, ${d}, ${e}, ${f}"
        }
      }
    ],
    "ddo_map": [
      {"id": "a", "tipo": "numisdata1468", "parent": "self", "section_tipo": "self"},
      {"id": "b", "tipo": "numisdata1470", "parent": "self", "section_tipo": "self"},
      {"tipo": "numisdata1452", "parent": "self", "section_tipo": "self"},
      {"id": "c", "tipo": "hierarchy25", "parent": "numisdata1452", "section_tipo": "depositiontype1"},
      {"id": "d", "tipo": "numisdata1453", "parent": "self", "section_tipo": "self"},
      {"tipo": "numisdata1476", "parent": "self", "section_tipo": "self"},
      {"id": "e", "tipo": "numisdata243", "parent": "numisdata1476", "section_tipo": "numisdata241"},
      {"id": "f", "tipo": "numisdata1477", "parent": "self", "section_tipo": "self"}
    ]
  },
  "data": [
    {
      "section": {
        "tipo": "numisdata1",
        "section_id": 456
      },
      "entries": {
        "a": {"tipo": "numisdata1468", "lang": "lg-nolan", "value": ["2024-01-15"], "key": "numisdata1_456"},
        "b": {"tipo": "numisdata1470", "lang": "lg-eng", "value": ["Found during excavation"], "key": "numisdata1_456"},
        "c": {"tipo": "hierarchy25", "lang": "lg-eng", "value": ["Hoard Deposit"], "key": "depositiontype1_12"},
        "d": {"tipo": "numisdata1453", "lang": "lg-eng", "value": ["Primary context"], "key": "numisdata1_456"},
        "e": {"tipo": "numisdata243", "lang": "lg-eng", "value": ["Metal Detecting"], "key": "numisdata241_8"},
        "f": {"tipo": "numisdata1477", "lang": "lg-eng", "value": ["Authorized survey"], "key": "numisdata1_456"}
      },
      "debug": {
        "chain_string": "numisdata1_456 → numisdata1468(a) → numisdata1470(b) → numisdata1452 → hierarchy25(c) ..."
      }
    }
  ]
}
```

### 3.2 Context/Data Separation

| Section | Purpose | Consumer |
|---------|---------|----------|
| `context.pre_parser` | Pre-processing rules per tipo | External processor applies before pattern |
| `context.parser` | Final formatting pattern with `${id}` placeholders | External processor applies to build output |
| `context.ddo_map` | Full DDO chain definition | Reference for debugging/validation |
| `data[].section` | Source section info | Identify source record |
| `data[].entries` | Resolved values keyed by DDO `id` | Values to substitute in pattern |
| `data[].debug` | Optional chain trace | Debugging |

### 3.3 External Processor Workflow

External processors receive context and data, then:

1. **Apply pre_parser** to matching tipos in entries
2. **Substitute pattern** `${a}` → `entries.a.value[0]` etc.
3. **Format output** to target format (SQL, XML, etc.)

```javascript
// Example external processor logic
function processRecord(context, record) {
    // 1. Apply pre-parsers
    for (const pp of context.pre_parser) {
        const targetValue = record.entries[findIdByTipo(pp.tipo)];
        if (targetValue) {
            targetValue.value = applyParser(pp.fn, targetValue.value, pp.options);
        }
    }
    
    // 2. Apply parser pattern
    let result = context.parser[0].options.pattern;
    for (const [id, data] of Object.entries(record.entries)) {
        result = result.replace(`\${${id}}`, data.value.join(', '));
    }
    
    return result;
}
```

### 3.4 External Processor Responsibility

| Target Format | External Processor | Uses |
|---------------|-------------------|------|
| SQL | `tool_export_sql` or script | Pattern → SQL column value |
| XML | `tool_export_xml` or script | Pattern → XML node content |
| RDF | External script | Pattern → RDF literal |
| CSV | External script | Pattern → CSV cell |
| Custom | User-defined | Any format |

---

## Phase 4: New Diffusion API

### 4.1 Unified API Class
**Objective**: Single entry point returning standardized JSON data (no format rendering)

```php
class diffusion_api {
    
    private diffusion_chain_processor $processor;
    
    public function __construct() {
        $this->processor = new diffusion_chain_processor();
    }
    
    /**
     * DIFFUSE
     * Main diffusion method - returns standardized JSON data
     * External processors handle conversion to SQL/XML/etc.
     * 
     * @param object $rqo Request Query Object with sqo and options
     * @return object Standardized response with resolved data
     */
    public static function diffuse(object $rqo): object {
        
        $response = new stdClass();
            $response->result  = false;
            $response->msg     = 'Error. Request failed';
            $response->errors  = [];
        
        // Extract from rqo
        $source              = $rqo->source;
        $sqo                 = $rqo->sqo ?? null;
        $options             = $rqo->options ?? new stdClass();
        $diffusion_tipo = $source->diffusion_tipo;
        $include_debug       = $options->include_debug ?? false;
        
        // Validate
        if (empty($sqo)) {
            $response->errors[] = 'Missing sqo (Search Query Object)';
            return $response;
        }
        
        // Execute search using SQO to get target records
        $search    = search::get_instance(new search_query_object($sqo));
        $db_result = $search->search();
        
        // Create processor
        $processor = new diffusion_chain_processor();
        $data = [];
        
        foreach ($db_result as $row) {
            
            // Get ddo_map from ontology for this section
            $ddo_map = diffusion_data::get_ddo_map(
                $diffusion_tipo,
                $row->section_tipo
            );
            
            // Resolve chain - returns array of diffusion_data_object
            $resolved_data = $processor->resolve_chain((object)[
                'ddo_map'      => $ddo_map,
                'section_tipo' => $row->section_tipo,
                'section_id'   => $row->section_id,
                'parent'       => $row->section_tipo
            ]);
            
            // Build diffusion_objects for this record
            $diffusion_objects = $processor->build_diffusion_objects(
                $resolved_data,
                $ddo_map
            );
            
            // Create standardized record response
            $record = (object)[
                'section' => (object)[
                    'tipo'       => $row->section_tipo,
                    'section_id' => $row->section_id
                ],
                'diffusion_objects' => $diffusion_objects
            ];
            
            // Add debug chain if requested
            if ($include_debug) {
                $record->debug = $processor->get_debug_chain();
            }
            
            $data[] = $record;
        }
        
        // Response with standardized data
        $response->result = true;
        $response->total  = count($data);
        $response->data   = $data;
        $response->msg    = 'OK. Request done';
        
        return $response;
    }
}
```

### 4.2 API Interface (SQO-based)
**Objective**: JSON-based API following Dédalo's standard `dd_core_api` pattern using Search Query Object (SQO)

The diffusion API uses the standard Dédalo RQO (Request Query Object) pattern with:
- `action`: The API action to perform
- `source`: Metadata about the caller
- `sqo`: Search Query Object to select records for diffusion
- `options`: Diffusion-specific options

**Single Record Diffusion** (using `filter_by_locators`):
```json
// Request
{
  "action": "diffuse",
  "source": {
    "typo": "source",
    "model": "diffusion",
    "diffusion_tipo": "rsc630"
  },
  "sqo": {
    "section_tipo": ["oh1"],
    "filter_by_locators": [
      {
        "section_tipo": "oh1",
        "section_id": "123"
      }
    ],
    "limit": 1
  },
  "options": {
    "format": "json",
    "include_debug": true,
    "language_priority": ["lg-eng", "lg-spa"]
  }
}

// Response
{
  "result": true,
  "msg": "OK. Request done",
  "data": [
    {
      "section": { "tipo": "oh1", "id": 123 },
      "resolved_data": [...],
      "debug": {
        "chain_string": "oh1_123 → rsc197 → dd456_789 → rsc85"
      }
    }
  ]
}
```

**Search-based Diffusion** (using `filter`):
```json
// Request - diffuse all records matching a search
{
  "action": "diffuse",
  "source": {
    "typo": "source",
    "model": "diffusion",
    "diffusion_tipo": "rsc630"
  },
  "sqo": {
    "section_tipo": ["oh1"],
    "filter": {
      "$and": [
        {
          "q": "published",
          "path": [
            {
              "section_tipo": "oh1",
              "component_tipo": "oh32",
              "model": "component_publication"
            }
          ]
        }
      ]
    },
    "limit": 100,
    "offset": 0
  },
  "options": {
    "format": "json"
  }
}

// Response
{
  "result": true,
  "msg": "OK. Request done",
  "total": 47,
  "data": [
    { "section": { "tipo": "oh1", "id": 1 }, "resolved_data": [...] },
    { "section": { "tipo": "oh1", "id": 5 }, "resolved_data": [...] },
    ...
  ]
}
```

**Multi-Section Diffusion** (dynamic mode with multiple section_tipo):
```json
// Request
{
  "action": "diffuse",
  "source": {
    "typo": "source",
    "model": "diffusion",
    "diffusion_tipo": "rsc630"
  },
  "sqo": {
    "section_tipo": ["es1", "fr1", "de1"],
    "filter_by_locators": [
      { "section_tipo": "es1", "section_id": "123" },
      { "section_tipo": "fr1", "section_id": "123" },
      { "section_tipo": "de1", "section_id": "123" }
    ]
  },
  "options": {
    "format": "json",
    "group_by_section": true
  }
}

// Response
{
  "result": true,
  "data": {
    "es1": [{ "section": { "tipo": "es1", "id": 123 }, "resolved_data": [...] }],
    "fr1": [{ "section": { "tipo": "fr1", "id": 123 }, "resolved_data": [...] }],
    "de1": [{ "section": { "tipo": "de1", "id": 123 }, "resolved_data": [...] }]
  }
}
```

**Validate DDO Map**:
```json
// Request
{
  "action": "validate",
  "source": {
    "diffusion_tipo": "rsc630"
  }
}

// Response
{
  "result": true,
  "valid": true,
  "ddo_map": [...],
  "errors": []
}
```

**Get Ontology Map**:
```json
// Request
{
  "action": "get_ontology_map",
  "source": {
    "diffusion_tipo": "rsc630"
  }
}

// Response
{
  "result": true,
  "ddo_map": [...],
  "properties": {...}
}
```

### 4.3 PHP API Handler
**Objective**: Implement API handler following `dd_core_api` patterns

```php
class diffusion_api {
    
    /**
     * DIFFUSE
     * Main diffusion action - processes records selected by SQO
     * @param object $rqo Request Query Object with sqo and options
     * @return object $response
     */
    public static function diffuse(object $rqo): object {
        
        $response = new stdClass();
            $response->result  = false;
            $response->msg     = 'Error. Request failed';
            $response->errors  = [];
        
        // Extract from rqo
        $source             = $rqo->source;
        $sqo                = $rqo->sqo ?? null;
        $options            = $rqo->options ?? new stdClass();
        $diffusion_tipo = $source->diffusion_tipo;
        
        // Validate
        if (empty($sqo)) {
            $response->errors[] = 'Missing sqo (Search Query Object)';
            return $response;
        }
        
        // Execute search using SQO
        $search    = search::get_instance(new search_query_object($sqo));
        $db_result = $search->search();
        
        // Get ddo_map from ontology
        $section_tipo = $sqo->section_tipo[0] ?? null;
        $ddo_map = diffusion_data::get_ddo_map($diffusion_tipo, $section_tipo);
        
        // Process each record
        $processor = new diffusion_chain_processor();
        $data = [];
        
        foreach ($db_result as $row) {
            $chain_result = $processor->resolve_chain((object)[
                'ddo_map'      => $ddo_map,
                'section_tipo' => $row->section_tipo,
                'section_id'   => $row->section_id,
                'parent'       => $row->section_tipo
            ]);
            
            $data[] = (object)[
                'section' => (object)[
                    'tipo' => $row->section_tipo,
                    'id'   => $row->section_id
                ],
                'resolved_data' => $chain_result
            ];
        }
        
        // Group by section if requested
        if ($options->group_by_section ?? false) {
            $data = self::group_by_section($data);
        }
        
        $response->result = true;
        $response->data   = $data;
        $response->msg    = 'OK. Request done';
        
        return $response;
    }
}
```

---

## Phase 5: Testing & Migration

### 5.1 Test Strategy
**Objective**: Validate new system against existing behavior

**Comparison Tests**:
1. Same input (section_tipo, section_id, diffusion_tipo)
2. Run through old `diffusion_xml` and new `diffusion_api`
3. Compare resolved data structures
4. Verify identical output values

### 5.2 Migration Path
**Objective**: Gradual transition from old to new system

1. New classes coexist with old
2. Feature flag to switch between implementations
3. Validate output parity
4. Deprecate old classes
5. Remove old classes

---

## Key Design Principles

### 1. **Build on Proven Patterns**
The existing `diffusion_data::get_ddo_value()` recursive pattern is sound. The new system formalizes it with explicit `chain_action` values.

### 2. **Preserve Data Structures**
`diffusion_object` and `diffusion_data_object` structures are maintained. Extensions add capabilities without breaking compatibility.

### 3. **Format Agnostic Core**
Resolution logic is separated from rendering. Same resolved data can output to XML, JSON, SQL, etc.

### 4. **Backward Compatible Ontology**
Existing `process.ddo_map` structures work unchanged. New `chain_action` and `diffusion` properties are optional enhancements.

### 5. **Debug Transparency**
Optional debug chain provides human-readable resolution traces without impacting production performance.
