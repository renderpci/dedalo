# Diffusion Ontology

## Overview
The Diffusion Ontology is grounded on the root node **`dd1190`** (Diffusion). It defines the structure and rules for publishing data from the Dédalo system to external formats (SQL, XML, RDF, etc.).

This logical tree maps Dédalo's internal components (sections, fields) to output structures (tables, columns, nodes).

## Structure
The hierarchy starts at `dd1190` and follows a defined organizational depth:

### 1. Diffusion Alias (`*_alias`)
Nodes ending in `_alias` (e.g., `numisdata695` is `database_alias`) are pointers used to reuse configurations.
- **Purpose**: They allow multiple diffusion elements to share the same underlying structure (e.g., database or table definitions) without duplicating the ontology nodes.
- **Mechanism**: The alias node points to a real definition node. When processed, the system resolves the alias to the target definition.
    - `diffusion_element_alias` → Reuse a complete `diffusion_element` configuration.
    - `database_alias` → Points to a `database` node.
    - `table_alias` → Points to a `table` node and the corresponding Dédalo **Section**.

### 2. Diffusion Domain (`diffusion_domain`)
- The global scope of the Dédalo instance.
- Defined in `config.php`.
- Every Dédalo instance can define one domain to encapsulate all its diffusion definitions.

### 3. Diffusion Group (`diffusion_group`)
- Acts as a grouper for organization (e.g., `dd44`, `dd35`).
- Allows structuring multiple diffusion elements into logical collections.

### 4. Diffusion Element (`diffusion_element`)
- Represents a specific diffusion schema or project, such as a front-end website or a virtual exhibition.
- It contains the specific configuration for an output format.
- Currently supports 4 primary ontology types, but can be extended in the future:
    - **sql** (e.g., `rsc630`, `dd751`)
    - **xml**
    - **rdf**
    - **socrata**

### 5. Mapping Nodes (Tables & Fields)
Inside a `diffusion_element`, the actual data mapping occurs:
- **Tables**: Nodes with model `table` representing output entities.
- **Fields**: Nodes with models like `field_text`, `field_int`, `field_enum` representing columns or attributes.

### 6. SQL Diffusion Structure
For elements of type **sql**, the ontology nodes map directly to relational database concepts:

- **Database**: The `diffusion_element` itself often defines the target database context.
- **Table**: Maps to Dédalo **Sections**. Each `table` node in the ontology determines which section (e.g., `oh1`) provides the records.
- **Fields**: Maps to Dédalo **Components**. Nodes with models like `field_varchar`, `field_int`, etc., correspond to specific components within that section.

Each node defines exactly how to retrieve its data from the source Dédalo objects (Section or Component) via the `propiedades` configuration.

### 7. SQL Properties Mechanisms
The `propiedades` JSON object defines specific behaviors for resolving data in SQL diffusion. Below are the supported mechanisms:

#### Data Source Control (`data_to_be_used`)
Determines the raw source of the data:
- **`dato`**: Uses the raw data from the component (e.g., locators, IDs).
    - *Enum Fields*: Automatically converts locator IDs to mapped values (e.g., `1` -> "si", `2` -> "no") using the `enum` property.
    - *Relations*: Returns a list of target section IDs.
- **`ds`** (Double Step): Resolves data through an intermediate relation.
    - Requires property `v6` -> `data_to_be_used` specifying the intermediate component tipo.
- **`dataframe`**: Iterates over locators and resolves their dataframe terms (concatenated with `|`).
- **`value`** (Default): Uses the resolved human-readable string from `get_diffusion_value()`.

#### Custom Processing (`process_dato`)
Executes a specific static method to resolve the value.
- **Syntax**: `"process_dato": "class_name::method_name"`
- **Common Methods**:
    - `diffusion_sql::resolve_value`: Standard resolution using component methods.
    - `diffusion_sql::map_locator_to_term_id`: Resolves a locator to its Term ID.
    - `diffusion_sql::get_publication_unix_timestamp`: Converts date components to timestamps.

#### Processing Arguments (`process_dato_arguments`)
Arguments passed to the `process_dato` method to control resolution:
- **`target_component_tipo`**: The specific component to fetch data from.
- **`component_method`**: The method to call on the component instance (e.g., `get_diffusion_value`).
- **`output`**: Format control (e.g., `"merged"` to join multiple values).
- **`split_string_value`**: Separator used when merging (e.g., `" | "`).
- **`is_publicable`**: specific override for privacy check.

#### Column Merging (`merge_columns`)
Combines values from multiple other columns into a single field.
- **`merge_columns`**: Array of column `tipos` to merge.
- **`separator`**: String to use between values (default: space).
- *Usage*: Useful for creating "Full Text Search" columns by aggregating title, description, and keywords.

#### Formatting Options (`option_obj`)
Passed directly to the component's diffusion method:
- **`divisor`**: Separator for multiple values.
- **`add_parents`**: Boolean to include parent terms (for thesaurus/hierarchy).
- **`divisor_parents`**: Separator for parent terms.

### 8. RDF Diffusion Structure
For elements of type **rdf** (e.g., `numisdata325`), the ontology maps Dédalo structures to RDF Triples (Subject-Predicate-Object) using classes and properties.

#### Root Node (`numisdata325` Example)
- **Model**: `rdf`
- **Role**: Serves as the container for the RDF schema definition.
- **Base URI**: Often defines the base URI for the entities (e.g., `http://nomisma.org/`).

#### Child Nodes (Classes & Properties)
The structure below the root RDF node defines the entities and their relationships:

1.  **Classes (`owl:Class`)**
    *   **Example**: `numisdata1309` (e.g., `nmo:Mint`)
    *   **Purpose**: Represents an RDF class or entity type.
    *   **Configuration**:
        *   `type`: `entity_publication_uri` (Defines how to construct the URI for this entity).
        *   `base_uri`: The prefix for the entity's URI (e.g., `http://nomisma.org/id/`).
        *   `var_uri`: Defines which data point provides the unique identifier suffix (e.g., `id` from `numisdata26`).

2.  **Object Properties (`owl:ObjectProperty`)**
    *   **Example**: `numisdata1278` (e.g., `skos:prefLabel`)
    *   **Purpose**: Maps a Dédalo component to an RDF property (predicate).
    *   **Key Configuration (`process`)**:
        *   `ddo_map`: A chain of objects defining how to retrieve the data.
            *   **Source**: `self` (current record) or a related component.
            *   **Target**: The component providing the value (e.g., `numisdata71`).
            *   **Methods**: `get_diffusion_value` to fetch the resolved string.
        *   `php_formula`: Advanced logic to combine or format values.
            *   *Example*: `${a} ? ${b} : ${c}` (Conditional formatting: if `a` exists, use `b`, else use `c`).

#### Example: `numisdata1309` (Mint Entity)
This node defines an RDF entity:
*   It serves as a **Subject**.
*   It has children like `numisdata1278` which act as **Predicates**.
*   The `ddo_map` in the children resolves the **Objects** (values) for the triples.

This hierarchical structure allows Dédalo to generate complex RDF graphs by mapping sections to Classes and components to Properties.

## Configuration Properties (`propiedades`)
The `propiedades` column (JSON) on each node controls the data resolution logic. It dictates *how* to fetch the value for that field from the Dédalo objects.

### Key Properties

#### `process_dato`
Defines the static method used to process or fetch the data.
- **Legacy Examples**: `diffusion_sql::resolve_value`, `diffusion_sql::map_locator_to_term_id`.
- **Function**: It tells the system which processor class and method to invoke.

#### `process_dato_arguments`
An object containing arguments passed to the `process_dato` method.
- **`target_component_tipo`**: The Dédalo component `tipo` (e.g., `rsc86`) acts as the source of truth for this field.
- **`component_method`**: The method to call on the component instance (e.g., `get_diffusion_value`, `get_diffusion_resolve_value`).
- **`is_publicable`**: Boolean flag to enforce privacy checks.
- **`output`**: Format instructions, e.g., "merged" to join multiple values.
- **`split_string_value`**: Separator used when merging values (e.g., " | ").

#### `custom_arguments` (Recursive Chains)
Used for complex resolutions where an intermediate component must be resolved before reaching the final value (Chained Resolution).
- It creates a **resolution path**: *Source Component* -> *Intermediate Relation* -> *Target Value*.
- Example structure:
  ```json
  "custom_arguments": [
      {
          "process_dato_arguments": {
              "target_component_tipo": "rsc85",
              "component_method": "get_diffusion_value"
          }
      }
  ]
  ```
  This tells the processor: "First resolve the current component, then use the result to find `rsc85` and get its value."

#### `data_to_be_used`
Specifies which part of the component's data to use.
- **`dato`**: The raw data (often a locator or ID).
- **`value`**: The resolved human-readable value.
- **`valor_list`**: Used for enumerations/lists.

## Example Configuration
Taking `rsc1048` as a complex example found in the ontology:

```json
{
    "process_dato": "diffusion_sql::resolve_value",
    "process_dato_arguments": {
        "is_publicable": true,
        "component_method": "get_diffusion_resolve_value",
        "target_component_tipo": "rsc391",
        "custom_arguments": [
            {
                "process_dato_arguments": {
                    "output": "merged",
                    "is_publicable": true,
                    "component_method": "get_diffusion_value",
                    "split_string_value": " | ",
                    "target_component_tipo": "rsc85"
                }
            }
        ]
    }
}
```

**Interpretation**:
1.  **Start**: The system looks at the current record.
2.  **Target 1**: It identifies the component `rsc391` (likely a relation or pointer).
3.  **Method**: It calls `get_diffusion_resolve_value` on `rsc391`.
4.  **Chain (`custom_arguments`)**: It passes instructions to look for `rsc85` *within* the context of `rsc391`'s target.
5.  **Final Value**: It fetches the value of `rsc85` from the related record, merges multiple values with " | ", and returns the result.

This ontology structure allows completely decoupling the internal Dédalo structure from the external publication format, enabling complex data reshaping via configuration.