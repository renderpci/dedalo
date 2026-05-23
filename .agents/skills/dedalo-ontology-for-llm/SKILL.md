# Dédalo Ontology — LLM Working Guide

This skill teaches you how to work with Dédalo's ontology-driven data model. Dédalo uses an abstraction layer where human-readable concepts (e.g. "Mint", "Oral History") map to opaque identifiers called **tipos** (e.g. `numisdata6`, `oh1`). You MUST resolve these tipos before using any data tool.

## Core Concepts

### What is a tipo?

A **tipo** is a short alphanumeric identifier that uniquely identifies any ontology node in Dédalo. Examples:
- `oh1` — Oral History section
- `numisdata6` — Mint section
- `oh24` — Informant component (a portal inside Oral History)
- `rsc85` — Name component (inside Person section)

Every section, component, thesaurus node, and relation type has a unique tipo.

### The Ontology Hierarchy

```
Section (e.g. oh1 = "Oral History")
├── Component (e.g. oh14 = "Title")           ← direct data field
├── Component (e.g. oh16 = "Description")     ← direct data field
├── Component (e.g. oh24 = "Informant")       ← PORTAL → links to another section
│   └── target_section_tipo: ["rsc197"]       ← points to "Person" section
│       ├── Component (e.g. rsc85 = "Name")   ← data in the linked section
│       └── Component (e.g. rsc86 = "Surname") ← data in the linked section
```

### Multilingual Terms

All ontology terms are stored in multiple languages:
```json
{ "lg-eng": "Mint", "lg-spa": "Ceca", "lg-fra": "Atelier monétaire" }
```

## The Golden Rule: ALWAYS Resolve First

**NEVER guess a tipo. NEVER hardcode a tipo. ALWAYS resolve from human-readable names first.**

### Workflow

```
Step 1: User says "Create a mint record"
Step 2: You call dedalo_ontology_glossary({ mode: "sections" })
        → Learn: "Mint" = numisdata6
Step 3: You call dedalo_create_record({ section_tipo: "numisdata6" })
        → Get: section_id = 42
Step 4: You respond: "Created mint record #42"
```

## Tool Reference

### Discovery Tools (use these FIRST)

| Tool | Purpose | When to use |
|------|---------|-------------|
| `dedalo_ontology_glossary` | Get name→tipo map with portal metadata | **Primary tool.** Call once at session start. |
| `dedalo_resolve_ontology` | Search ontology by text (fuzzy/exact) | When you need to find a section by partial name. |
| `dedalo_resolve_path` | Validate a relational path | Before cross-section search or navigation. |
| `dedalo_get_section_elements_context` | Full component context for a section | When you need detailed component config. |
| `dedalo_get_element_context` | Single element context | When you need one component's full metadata. |
| `dedalo_list_sections` | List all section tipos | Alternative to glossary (less metadata). |

### Glossary Modes

**mode="sections"** — Call once per session:
```json
{ "mode": "sections" }
```
Returns ALL sections with multilingual terms. Example response:
```json
{
  "result": [
    { "section_tipo": "oh1", "term": { "lg-eng": "Oral History", "lg-spa": "Historia Oral" }, "tld": "oh" },
    { "section_tipo": "numisdata6", "term": { "lg-eng": "Mint", "lg-spa": "Ceca" }, "tld": "numisdata" }
  ]
}
```

**mode="section"** — Drill into one section:
```json
{ "mode": "section", "section_tipo": "oh1" }
```
Returns component tree WITH portal metadata:
```json
{
  "result": {
    "section_tipo": "oh1",
    "term": { "lg-eng": "Oral History" },
    "components": [
      { "tipo": "oh14", "model": "component_input_text", "term": { "lg-eng": "Title" }, "is_portal": false },
      { "tipo": "oh24", "model": "component_portal", "term": { "lg-eng": "Informant" }, "is_portal": true,
        "target_section_tipo": ["rsc197"], "target_section_term": [{ "tipo": "rsc197", "term": { "lg-eng": "Person" } }] }
    ]
  }
}
```

**mode="path"** — Resolve a relational path:
```json
{ "mode": "path", "path": ["oh1", "oh24", "rsc197", "rsc85"] }
```

## Cross-Section Relationships (Portals)

### What is a Portal?

A **portal** is a component that links to records in another section. It stores a **locator** (section_tipo + section_id), not the actual data.

### The Path Concept

To navigate from a section to related data through a portal, you follow a **path**:

```
oh1 (Oral History) → oh24 (Informant portal) → rsc197 (Person) → rsc85 (Name)
   section              portal component         target section     leaf component
```

Each hop in the path:
- **Section hop** (e.g. `oh1`): A record type. Contains components.
- **Portal hop** (e.g. `oh24`): A link component. Has `target_section_tipo` pointing to another section.
- **Leaf hop** (e.g. `rsc85`): The actual data field you want to read or search.

### How to Discover Portal Paths

1. Call `dedalo_ontology_glossary({ mode: "section", section_tipo: "oh1" })`
2. Look for components with `is_portal: true`
3. Each portal has `target_section_tipo` showing where it links
4. Call glossary again on the target section to find its components

### Reading Through Portals

Portal data is stored as locators, not as the target record's data:

```
Step 1: dedalo_read_record({ section_tipo: "oh1", section_id: "3" })
        → oh24 data: [{ section_tipo: "rsc197", section_id: "7" }]

Step 2: dedalo_read_record({ section_tipo: "rsc197", section_id: "7" })
        → rsc85 value: "Pablo", rsc86 value: "Picasso"
```

### Saving Portal Data

To link a record through a portal, save a locator array:

```json
{
  "tipo": "oh24",
  "section_tipo": "oh1",
  "section_id": "3",
  "value": [{ "section_tipo": "rsc197", "section_id": "7" }]
}
```

### Searching Across Sections (Multi-Hop Filters)

To search records by data in a related section, use multi-hop filter paths in the canonical SQO format.
For single-section searches within the same section, use the simplified `filter` parameter on `dedalo_search_records`.
For cross-section (portal-traversing) searches, use the `raw_sqo` parameter with the canonical Dédalo filter format:

**Canonical SQO format — single section:**
```json
{
  "section_tipo": "oh1",
  "raw_sqo": {
    "filter": {
      "$and": [{
        "q": "mother",
        "path": [{ "section_tipo": "oh1", "component_tipo": "oh16" }]
      }]
    }
  }
}
```

**Canonical SQO format — cross-section (2-hop portal traversal):**
```json
{
  "section_tipo": "oh1",
  "raw_sqo": {
    "filter": {
      "$and": [{
        "q": "Picasso",
        "path": [
          { "section_tipo": "oh1", "component_tipo": "oh24" },
          { "section_tipo": "rsc197", "component_tipo": "rsc85" }
        ]
      }]
    }
  }
}
```

The `path` array defines the traversal: first hop is within the main section (through portal `oh24`), second hop reaches the target component (`rsc85`) in the related section (`rsc197`). The `q` value is tested against the LAST path element's data.

**Simplified MCP filter — single section only:**
```json
{
  "section_tipo": "oh1",
  "filter": {
    "operator": "AND",
    "rules": [{ "path": "oh16", "operator": "contains", "value": "mother" }]
  }
}
```
Note: The simplified `filter` parameter only supports single-`path` strings (component tipo within the main section). For multi-hop cross-section search, use `raw_sqo`.

## Complete Workflow Examples

### Example 1: "Create a mint record with number 123"

```
1. dedalo_ontology_glossary({ mode: "sections" })
   → Learn: "Mint" = numisdata6

2. dedalo_ontology_glossary({ mode: "section", section_tipo: "numisdata6" })
   → Learn: "Number" component = numisdata27

3. dedalo_create_record({ section_tipo: "numisdata6" })
   → Get: section_id = 42

4. dedalo_set_field({ section_tipo: "numisdata6", section_id: "42", field: "Number", value: "123" })
   → Saved (appends by default; use { clean: true } to replace locators fully)

5. Response: "Created mint record #42 with number 123"
```

### Example 2: "Get the name of the informant of interview #3"

```
1. dedalo_ontology_glossary({ mode: "section", section_tipo: "oh1" })
   → Learn: oh24 = Informant (portal → rsc197)

2. dedalo_read_record({ section_tipo: "oh1", section_id: "3" })
   → oh24 locator: [{ section_tipo: "rsc197", section_id: "7" }]

3. dedalo_read_record({ section_tipo: "rsc197", section_id: "7" })
   → rsc85 = "Pablo", rsc86 = "Picasso"

4. Response: "The informant of interview #3 is Pablo Picasso"
```

### Example 3: "Search interviews where informant name contains Picasso"

```
1. dedalo_ontology_glossary({ mode: "section", section_tipo: "oh1" })
   → Learn: oh24 = portal → rsc197

2. dedalo_ontology_glossary({ mode: "section", section_tipo: "rsc197" })
   → Learn: rsc85 = Name

3. dedalo_resolve_path({ path: ["oh1", "oh24", "rsc197", "rsc85"] })
   → Validate the path is correct

4. dedalo_search_records({
     section_tipo: "oh1",
     raw_sqo: {
       filter: {
         "$and": [{
           "q": "Picasso",
           "path": [
             { "section_tipo": "oh1", "component_tipo": "oh24" },
             { "section_tipo": "rsc197", "component_tipo": "rsc85" }
           ]
         }]
       }
     }
   })
   → Results: matching Oral History records
```

## Data Column Types

Each component model maps to a data column type in the database:

| Column Type | Component Models | Value Format |
|-------------|-----------------|--------------|
| `string` | component_input_text, component_text_area, component_email, component_password | Plain string |
| `relation` | component_portal, component_select, component_radio_button, component_check_box, component_dataframe, component_publication, component_external, component_filter, component_filter_master, component_relation_* | Locator array |
| `date` | component_date | Date string |
| `geo` | component_geolocation | GeoJSON |
| `number` | component_number | Number |
| `iri` | component_iri | IRI string |
| `media` | component_av, component_image, component_3d, component_pdf, component_svg | File reference |
| `section_id` | component_section_id | Section identifier |
| `misc` | component_filter_records, component_info, component_inverse, component_json, component_security_access | Varied |

Note: non-existent models like `component_rich_text`, `component_timestamp`, `component_geo`, `component_file`, `component_summation`, `component_relation`, `component_autocomplete` are not used.

## Important Notes

1. **NEVER guess tipos.** Always resolve from human-readable names.
2. **Portals store locators**, not the linked data. You must make a second read call to get the linked record.
3. **Terms are multilingual.** Always include `lang` parameter when available.
4. **Permissions are server-side.** You may get `permissions_denied` if the user lacks access.
5. **section_id is always a string** in API calls, even if it looks like a number.
6. **Cross-section search uses multi-hop paths** in the filter, not multiple API calls.
7. **Use `dedalo_resolve_path`** to validate complex paths before using them in search filters.
