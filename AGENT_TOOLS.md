# Dédalo Agent Architecture

LLM-facing API layer that exposes Dédalo data in human-label shapes so small
in-browser models can read, search, and write records without learning tipos,
RQO, SQO, or portal mechanics.

## Tier Model

| Tier | Audience | Stability | Examples |
|---|---|---|---|
| **Primitive** | Power users / scripts | Wide, may change | `dedalo_search_records`, `dedalo_set_field` |
| **Agent** | LLMs / assistants | Stable, versioned | `dedalo_describe_section`, `dedalo_get_record` |

Primitives expose the full power of Dédalo (raw SQO, tipos, locators).
Agent tools abstract that away: labels instead of tipos, flat maps instead of
nested RQO, expanded portals instead of raw locator arrays.

## Backend Classes

### `agent_view_builder` (`shared/agent/class.agent_view_builder.php`)

- `section_label_map($section_tipo, $lang)` — label↔tipo bidirectional map
- `section_to_view($section_tipo, $lang, $include_tipos)` — section schema
- `record_to_view($section_tipo, $section_id, $lang, $include_tipos)` — agent-view record
- `resolve_field($section_tipo, $lang, $field)` — label → `{ tipo, model, type, target? }`
- `normalize_link_value($value)` — converts agent-view refs to Dédalo locators
- `label_for_tipo($tipo, $lang)` — tipo → human label
- `available_fields($section_tipo, $lang)` — list of valid labels for a section

### `dd_agent_api` (`core/api/v1/common/class.dd_agent_api.php`)

| Action | Verb | Read/Write |
|---|---|---|
| `describe_section` | get schema | R |
| `read_record_view` | get one record | R |
| `search_records_view` | search + list | R |
| `count_records` | count | R |
| `set_field_by_label` | update field | W |

All actions are gated by the same Dédalo permission checks used by
`dd_core_api` (section-level + component-level).

## MCP Tools (`mcp/dedalo-work-mcp/src/tools/agent/`)

| Tool | Tier | Wraps |
|---|---|---|
| `dedalo_describe_section` | agent | `dd_agent_api::describe_section` |
| `dedalo_get_record` | agent | `dd_agent_api::read_record_view` |
| `dedalo_search_records_view` | agent | `dd_agent_api::search_records_view` |
| `dedalo_count_records_view` | agent | `dd_agent_api::count_records` |
| `dedalo_set_field` | agent | `dd_agent_api::set_field_by_label` |

## Agent View Shapes

### Section Name Resolution

All agent tools accept `section_tipo` as either a **tipo** (e.g. `"oh1"`, `"numisdata6"`)
or a **human name** (e.g. `"Cecas"`, `"Oral History"`). The server resolves names automatically:

1. If it looks like a tipo and IS a section → use directly.
2. Exact label match in the requested language.
3. Case/accent-insensitive label match (e.g. "cecas" → "Cecas").
4. Cross-language fallback (lg-eng, lg-nolan).
5. Fuzzy search via ontology DB.

If multiple sections match, the server returns an error with candidate names so the LLM can ask the user to disambiguate.

### Section Schema

```json
{
  "section_label": "Oral History",
  "section_tipo": "oh1",
  "lang": "lg-eng",
  "fields": [
    { "label": "Title", "type": "text" },
    { "label": "Informant", "type": "link", "target": "Person" }
  ],
  "_meta": { "field_tipos": { "Title": "oh14", "Informant": "oh24" } }
}
```

### Record View

```json
{
  "section_label": "Oral History",
  "section_tipo": "oh1",
  "section_id": 42,
  "lang": "lg-eng",
  "fields": {
    "Title": "Interview with Picasso",
    "Informant": [
      { "ref": "rsc197#7", "label": "Juan García", "section_tipo": "rsc197", "section_id": 7 }
    ],
    "Date": "2024-01-15"
  },
  "_meta": { "section_tipo": "oh1", "field_tipos": { "Title": "oh14", "Informant": "oh24" } }
}
```

Portals are expanded one hop: each locator becomes `{ ref, label, section_tipo, section_id }`.

### Search Result

```json
{
  "section_tipo": "oh1",
  "section_label": "Oral History",
  "lang": "lg-eng",
  "records": [ { ...record view... } ],
  "pagination": { "limit": 10, "offset": 0, "total": 42, "count": 10 }
}
```

## Search Filters

`search_records_view` accepts human-label filters:

```json
{
  "filter": {
    "operator": "AND",
    "rules": [
      { "field": "Title", "operator": "contains", "value": "Picasso" },
      { "field": "Date", "operator": "gte", "value": "2020-01-01" }
    ]
  }
}
```

The backend resolves `field` labels to component tipos and builds a Dédalo SQO
filter automatically. Supported operators: `eq`, `lt`, `lte`, `gt`, `gte`,
`contains`, `starts_with`, `ends_with`.

## Write Flow

`set_field_by_label` performs:

1. Resolve section name → tipo (e.g. "Cecas" → "numisdata6")
2. Resolve field label → tipo via `agent_view_builder::resolve_field`
3. Check section write permission (>=2)
4. Check component write permission (>=2)
5. `security::assert_record_in_user_scope`
6. For link/portal fields: normalise agent-view refs into Dédalo locators
7. Instantiate component → merge/set → `save`
   - **Default (`clean` omitted):** merges new locators with existing data,
     skipping duplicates (safe, non-destructive)
   - **`clean: true`:** replaces all locators entirely
8. Return updated record view

### Write behaviour by mode

| Component type | Default (`clean` omitted) | `clean: true` |
|---|---|---|
| Link / Portal | Append new locators, preserve existing | Replace all locators |
| Text / Scalar | Replace value (monovalue) | Replace value (same) |

## In-Browser Assistant

`tools/tool_assistant/js/ai_assistant.js` is rewired to:

- **Tag-driven tool selection** — reads `tool.annotations.tier === 'agent'` instead of a hardcoded whitelist.
- **System prompt** instructs the model to prefer agent tools.
- **Destructive confirmation** applied to `dedalo_delete_record` (only).
- **Few-shot** removed (saves ~400 tokens).
- **Conversation window** truncated to last 10 messages.
- **External API** support for server-side LLMs via `_generate_with_api`.
- **Link value normalisation** — `_normalize_tool_args` maps ISO language codes to Dédalo `lg-xxx` format.

## Future Verbs (Phase 2+)

- `create_record_view` — create + return agent view
- `delete_record` — delete by section_tipo + section_id
- `link_records` — add locators to a portal field
- `collect_field` — aggregate a field across search results

## Security

- `dd_manager` whitelists `dd_agent_api` via `$allowed_api_classes`
- `dd_agent_api::API_ACTIONS` is an explicit allowlist
- All writes require per-section (>=2) and per-component (>=2) permissions
- `security::assert_record_in_user_scope` on every write
- Link/portal values are normalised to prevent injection via ref objects