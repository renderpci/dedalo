# Dédalo Diffusion API Documentation

This document describes the Request and Response formats for the Dédalo Diffusion API (`diffusion_api::diffuse`).

## 1. API Request Format

The Dédalo Diffusion API accepts a standard JSON Request Query Object (RQO).

### Endpoint
The API is typically accessed via the main Dédalo JSON endpoint:
`POST /core/api/get_json.php`

### Request Body (RQO)

```json
{
  "dd_api": "diffusion_api",
  "action": "diffuse",
  "source": {
    "diffusion_node_tipo": "rsc264"

  },
  "sqo": {
    "section_tipo": ["rsc170"],

    "limit": 10,
    "offset": 0,
    "filter": { ... }
  },
  "options": {
    "include_debug": false,
    "include_empty": false,
    "levels": 2
  }
}
```

### Parameters

#### 1. `dd_api` (String, Required)
Must be set to `"diffusion_api"`.

#### 2. `action` (String, Required)
The operation to perform.
| Value | Description |
|-------|-------------|
| `"diffuse"` | Standard data retrieval. Resolves the diffusion chain and returns data. |
| `"validate"` | Validates the diffusion and DDO map configuration. |
| `"get_ontology_map"` | Retrieves the raw DDO map and ontology properties for the node. |

#### 3. `source` (Object, Required)
Contains metadata about the context of the request.
- **`diffusion_node_tipo`** (String, Required): The ID of the Diffusion Node (e.g., [`rsc264`](https://dedalo.dev/ontology/rsc264)) configuration to use. This determines the output format (DDO map) and resolution logic.

- **`lang`** (String, Optional): The preferred language for the response (e.g., `lg-eng`).

#### 4. `sqo` (Object, Required)
A standard Dédalo **Search Query Object** defining which records to fetch.
See [Search Query Object Documentation](../core/sqo.md).
- **`section_tipo`** (Array<String>, Required): Array of section types to search (e.g., `["rsc170"]`).

- **`limit`** (Integer, Optional): Maximum number of records to return. Default: System default.
- **`offset`** (Integer, Optional): Number of records to skip for pagination.
- **`filter`** (Object, Optional): Advanced search criteria using Dédalo's filter syntax (similar to MongoDB).
- **`filter_by_locators`** (Array<Object>, Optional): Retrieve specific records by section type and section id.
  - Structure: `[{"section_tipo": "rsc170", "section_id": "123"}]`



#### 5. `options` (Object, Optional)
Configuration flags for the resolution process.
- **`include_debug`** (Boolean, Default: `false`): If `true`, includes a `debug` property in the response with resolution chain traces. Useful for simple debugging.
- **`include_empty`** (Boolean, Default: `false`): If `true`, fields with no values are included in the `entries` object (as `[]` or `null`). By default, empty keys are omitted to reduce payload size.
- **`levels`** (Integer, Default: `2`): Overrides the maximum recursion depth for cross-section resolution. Note that a hard limit (usually 5) may be enforced by the server.

---

## 2. API Response Format

The response is a standardized JSON object containing metadata, hierarchy information, and the resolved data.

```json
{
  "result": true,
  "msg": "OK. Request done",
  "langs": [
    {
      "lg-spa": "Español",
      "lg-eng": "English",
      "lg-cat": "Català"
    }
  ],
  "main": [ ... hierarchy ... ],
  "datum": [ ... data resolution groups ... ]
}
```

### Properties:
| Property | Type | Description |
|----------|------|-------------|
| `result` | boolean | Indicates if the request was successful. |
| `msg` | string | Status or error message. |
| `langs` | array | Map of language codes to human-readable names available for diffusion. |
| `main` | array | The hierarchical path from the Diffusion Domain down to the requested Diffusion Node. |
| `datum` | array | A list of resolved data groups, typically one per "section-level" diffusion node. |

---

## 3. The `main` Hierarchy

The `main` array contains the breadcrumbs of the diffusion ontology.

```json
{
  "diffusion_node": "rsc264",
  "term": "Public Inventory",
  "model": "diffusion_node",
  "parent": "rsc123",
  "properties": { ... }
}
```

- **`rsc264`**: [Public Inventory](https://dedalo.dev/ontology/rsc264)
- **`rsc123`**: [Diffusion Domain](https://dedalo.dev/ontology/rsc123)

- **`diffusion_node`**: The ontology `tipo`.
- **`term`**: The public-facing name of the node (from Diffusion Ontology).
- **`model`**: The model of the ontology node (e.g., `diffusion_domain`, `diffusion_element`, `diffusion_node`).
- **`properties`**: Extra configuration (only present for `diffusion_element`).

---

## 4. The `datum` Object

Each item in the `datum` array represents a resolution set for a specific section and its records.

### Metadata
- **`diffusion_node`**: The technical ID of the node being resolved.

- **`section_tipo`**: The Dédalo section type (e.g., [`rsc170`](https://dedalo.dev/ontology/rsc170) image).

- **`term`**: The label of this node.
- **`model`**: The model type.
- **`context`**: Array of column/field definitions.

### Context (Field Definitions)
The `context` provides metadata for each field (`entry`) in the records. Context is defined by the specific diffusion ontology used to generate the response. It is a flat list of all components that are present in the records.

```json
  "context": [
  {
    "term": "Project Name",
    "tipo": "rsc927",
    "model": "field_text",
    "parent": "rsc264",
    "parser": { ... },
    "pre_parser": { ... }
  }
]
```

- **`rsc927`**: [Project Name](https://dedalo.dev/ontology/rsc927)
- **`rsc264`**: [Public Inventory](https://dedalo.dev/ontology/rsc264)

- **`term`**: Human-readable label for the column.
- **`tipo`**: The diffusion node ID that acts as a key in the record entries.
- **`model`**: The data model of the field.
- **`parser`/`pre_parser`**: Configuration for external formatting tools.

### Data (Records)
The `data` array contains the actual records resolved.

```json
"data": [
  {
    "section_id": "123",
    "entries": [
      {
        "rsc927": [
          {
            "tipo" : "rsc29",
            "lang" : null,
            "value": "/dedalo/media/image/1.5MB/0/rsc29_rsc170_1.jpg",
            "id"   : null
          }
        ],
        "rsc441": [
          {"tipo": "rsc23", "lang": "lg-spa", "value": "Título 1", "id": null},
          {"tipo": "rsc23", "lang": "lg-eng", "value": "Title 1",  "id": null}
        ],
        "rsc906": [
          {
              "id": 1,
              "type": "dd151",
              "section_id": "5",
              "section_tipo": "dd889",
              "from_component_tipo": "rsc732"
          }
        ]      
      }
    ]
  }
]
```

**Ontology Nodes in this example**:
- **`rsc927`**: [Project Name](https://dedalo.dev/ontology/rsc927) - The root diffusion node for this entry.
- **`rsc29`**: [Image File](https://dedalo.dev/ontology/rsc29) - The component type of the value.
- **`rsc441`**: [Title](https://dedalo.dev/ontology/rsc441) - Another field in the record.
- **`rsc23`**: [Title Text](https://dedalo.dev/ontology/rsc23) - The specific text component.
- **`rsc906`**: [Related Data](https://dedalo.dev/ontology/rsc906) - A relation field.
- **`dd889`**: [Target Section](https://dedalo.dev/ontology/dd889) - The section type of the related record.
- **`rsc732`**: [Relation Source](https://dedalo.dev/ontology/rsc732) - The component source of the relation.

- **`section_id`**: The unique identifier of the record in the Dédalo Matrix.
- **`entries`**: An object keyed by the `tipo` found in the `context`.
- **Values**: Each entry value is an **array of strings or raw objects**.

---

## 5. Flattening and Resolution Logic

The Diffusion API performs a deep resolution of relations and cross-sections but returns a **flattened** output:

1.  **Direct Fields**: Resolved directly from the component.
2.  **Relations (Portals/Relations)**:
    - If the DDO map defines children for a relation, the API recurses into those sections.
    - It extracts the `value` from the child components and **merges** them into a single array for the parent field.
    - **Nested DDO wrappers are removed**; only the raw values are preserved in the final `entries`.
3.  **Empty Values**: By default, empty fields are omitted from the `entries` object to reduce payload size.

---

## 6. Metadata Sourcing Rules

To ensure consistency between Dédalo's internal structure and the public diffusion output:

- **`label`**: Sourced from the **Component's Term** in the Data Language (`DEDALO_DATA_LANG`).
- **`term`**: Sourced from the **Diffusion Node's Term** in the Structure Language (`DEDALO_STRUCTURE_LANG`).
- **`model`**: Sourced from the **Diffusion Node's Model**.


This allows Dédalo administrators to name a component "Project ID" internally while diffusing it as "Research Project" for the public.

---

## 7. Additional Actions

The API supports other actions beyond `diffuse` for configuration and validation.

### `validate`

Validates the diffusion configuration for a specific node to identify broken chains or missing properties.

- **Request**:
  ```json
  {
      "dd_api": "diffusion_api",
      "action": "validate",
      "source": { "diffusion_node_tipo": "rsc264" }
  }
  ```

- **Response**:
  ```json
  {
    "result": true,
    "msg": "Validation results",
    "errors": [] 
  }
  ```

### `get_ontology_map`

Retrieves the raw ontology mapping and parser definitions for a diffusion node without processing any record data.

- **Request**:
  ```json
  {
      "dd_api": "diffusion_api",
      "action": "get_ontology_map",
      "source": { "diffusion_node_tipo": "rsc264" }
  }
  ```

- **Response**:
  ```json
  {
    "result": true,
    "data": {
       "process": {
           "ddo_map": [ ... ],
           "parser": { ... },
           "pre_parser": { ... }
       }
    }
  }
  ```

