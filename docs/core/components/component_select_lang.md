# component_select_lang

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal"            : false,
    "is_related"            : true,
    "is_media"              : false,
    "modes"                 : ["edit","list","tm","search"],
    "default_tools" : [
        "tool_propagate_component_data",
        "tool_time_machine"
    ],
    "render_views" :[
        {
            "view" : "default | line | print",
            "mode" : "edit"
        },
        {
            "view" : "default | mini | text",
            "mode" : "list | tm"
        }
    ],
    "data"        : "array of locators (single entry)",
    "sample_data" : [
        {
            "id"                  : 1,
            "type"                : "dd151",
            "section_id"          : "17344",
            "section_tipo"        : "lg1",
            "from_component_tipo" : "oh20"
        }
    ],
    "value"        : "array of locators (single entry)",
    "sample_value" : [
        {
            "id"                  : 1,
            "type"                : "dd151",
            "section_id"          : "17344",
            "section_tipo"        : "lg1",
            "from_component_tipo" : "oh20"
        }
    ]
}
```

!!! note "Typology"
    `component_select_lang` is a **related** component and a thin, language-specialised subclass of [`component_select`](component_select.md). It extends the abstract base `component_relation_common` (`core/component_relation_common/class.component_relation_common.php`), which in turn extends `component_common`. It does not own literal data: instead of storing a language *code* it stores a single [locator](../locator.md) pointing at a record of the **languages section** (`lg1`), and the displayed value is the resolved language name. It is **not translatable** (`lg-nolan`): the relation that names a language is itself language-independent.

!!! info "About `default_tools`"
    The toolbar is assembled from the model + ontology, not hardcoded in the component class. The verified sample (`core/component_select_lang/samples/context.json`) carries `tool_propagate_component_data` and `tool_time_machine`. Because the component is non-translatable, `tool_lang` / `tool_lang_multi` are not added. Tools are read-only context.

!!! info "TS server implementation"
    The descriptor `src/core/components/component_select_lang/descriptor.ts` registers `resolveData: selectFamilyResolver` (`src/core/relations/models/select_family.ts`), the same resolver shared by `component_select` / `component_radio_button` / `component_check_box` / `component_publication` / `component_relation_model`. The resolver detects `model === 'component_select_lang'` and overrides the option source with `src/core/relations/select_lang.ts` (`getSelectLangDatalist` / `getSelectLangListValue`): the project's default languages (`config.menu.projectsDefaultLangs`, resolved against the `lg1` languages section), sorted by `strcmp`, with the `get_missing_lang` `*` fallback for a stored language outside the project set. See the *dedalo-relations-ts* skill.

## Definition

`component_select_lang` is the **language picker** of Dédalo. It renders a single drop-down (a `<select>`) whose options are the project's configured languages, and lets the cataloguer choose exactly one. The selection is stored as a single locator that points at the corresponding record in the Dédalo languages section (`lg1`), and the resolver knows how to turn that locator back into a language **code** (e.g. `lg-eng`, `lg-spa`) and a display **name** (e.g. *English*, *Spanish*).

Unlike a generic [`component_select`](component_select.md), its option list does **not** come from a `request_config` search over a target section. The subclass overrides `get_list_of_values()` to build the datalist directly from the project's configured languages (`DEDALO_PROJECTS_DEFAULT_LANGS`, resolved via `lang::resolve_multiple()`), so the available options are always the languages the installation actually uses, sorted alphabetically by name.

**Why it exists.** Cultural-heritage records frequently need to declare *which language a piece of content is in* — independently of the application UI language and independently of Dédalo's per-component translation slots. A transcription, an oral-history audio track, an inscription, a manuscript, or a free-text note may be *in* Italian even when the catalogue is being edited in Spanish. `component_select_lang` records that fact as a real, queryable relation to the languages section rather than as a free string, so the language is consistent, sortable and usable by diffusion/export. It is the component that pairs with [`component_text_area`](component_text_area.md) (and with media components) to tag the language of their content.

**When to use it.**

- Declaring the language of a body of content that is *not* one of Dédalo's translation versions: the *Original language* of a work, the *Language of a transcription*, the spoken language of an [audio/video](component_av.md) track, the language of an inscription or legend.
- Any place you want a single, controlled language choice that resolves to a standard language code for downstream diffusion / export.

**When not to use it.**

- A generic single choice from an arbitrary list-of-values section (status, type, category) → use [`component_select`](component_select.md), whose options come from a `request_config`.
- Multiple simultaneous language selections → model it with [`component_check_box`](component_check_box.md) against the languages section, or a [`component_portal`](component_portal.md).
- The per-language translation of a field's own text → that is the standard translatable-component mechanism (`lg-*` slots on [`component_input_text`](component_input_text.md) / [`component_text_area`](component_text_area.md)), not a `component_select_lang`.

## Data model

**Data:** `array of locators` (a single entry — it behaves like a single-select). On the client the API data object also carries a `datalist` array (the resolved list of project languages) so the renderer can draw every `<option>`, plus `entries` (the currently selected locator).

**Value:** `array` of `locators` (one element), or `null`.

**Storage shape.** A component never touches the database; it reads and writes through its section. Like every related component, `component_select_lang` does **not** keep an isolated value column — its locator lives in the matrix `relation` column as part of the record-wide relations bag, and the component slices its own subset out of the section's global `relations` container by matching `from_component_tipo` (its own `tipo`) and `section_tipo`. The canonical locator shape is `{type, section_tipo, section_id, from_component_tipo}` plus the per-entry `id`:

```json
{
    "relations": [
        {
            "id"                  : 1,
            "type"                : "dd151",
            "section_id"          : "17344",
            "section_tipo"        : "lg1",
            "from_component_tipo" : "oh20"
        }
    ]
}
```

- `type` is the relation-type tipo, defaulting to `dd151` (`DEDALO_RELATION_TYPE_LINK`, the generic link) from `$default_relation_type`.
- `section_tipo` is always the languages section `lg1` (`DEDALO_LANGS_SECTION_TIPO`); `section_id` points at the chosen language record (here `17344` = Spanish).
- `from_component_tipo` is forced by `validate_data_element()` to the owning component's own `tipo`; it is what lets one section-wide relations bag serve many distinct relation components.

Because it is non-translatable, the component is always instantiated with `lang = lg-nolan` and the locator carries no `lang`.

!!! note "Datum vs. client `entries` / `datalist`"
    The transmitted unit is a `{context, data}` datum. In `edit` mode the resolver returns the stored value under `data.entries` **and** attaches a `datalist` — the project languages resolved by `getSelectLangDatalist()` (`src/core/relations/select_lang.ts`). In `list` / `tm` mode it returns the resolved language name(s) via `getSelectLangListValue()` and no datalist (the render only needs the selected label). Each datalist item is `{value:{section_id,section_tipo}, label, section_id:"lg-xxx"}`; note that the item's `section_id` carries the **language code** (e.g. `lg-spa`), while the locator under `value` carries the numeric record id. Verified client sample:

    ```json
    {
        "section_id"          : 1,
        "section_tipo"        : "oh1",
        "tipo"                : "oh20",
        "lang"                : "lg-nolan",
        "from_component_tipo" : "oh20",
        "entries": [
            {"id":1,"type":"dd151","section_id":"17344","section_tipo":"lg1","from_component_tipo":"oh20"}
        ],
        "datalist": [
            {"label":"","value":null},
            {"value":{"section_id":"5101","section_tipo":"lg1"},"label":"English","section_id":"lg-eng"},
            {"value":{"section_id":"17344","section_tipo":"lg1"},"label":"Spanish","section_id":"lg-spa"}
        ]
    }
    ```

!!! warning "Missing / out-of-project languages"
    If a stored locator points at a language that is **not** in the current project's configured languages (e.g. a record imported with `lg-fra` in a project that no longer lists French), the value is not in the resolved option list. `get_missing_lang()` detects this and synthesises an extra datalist entry labelled with the language name plus a trailing ` *` (e.g. `French *`) so the existing value stays visible and selectable instead of silently disappearing. `get_list_value()` applies the same fallback when flattening the value to a label.

## Ontology instantiation

A `component_select_lang` is created as an ontology node whose `model` is `component_select_lang`. Its `parent` is the section (or grouper) it belongs to, `section_tipo` wires it into that section, and the standard `lg-*` term + `is_translatable` flags declare its label (translatability is `false` for this related component).

Node definition (shape):

```json
{
    "tipo"         : "rsc263",
    "model"        : "component_select_lang",
    "parent"       : "rsc302",
    "section_tipo" : "rsc302",
    "lg-eng"       : "Original language",
    "lg-spa"       : "Lengua original",
    "translatable" : false,
    "properties"   : { }
}
```

Realistic `properties` block (from the verified `samples/context.json` for *Original language* `rsc263`). The `source.request_config` targets the languages section `lg1` and names the term column to resolve as the option label:

```json
{
    "source": {
        "request_config": [
            {
                "type"       : "main",
                "api_engine" : "dedalo",
                "sqo": {
                    "section_tipo": [
                        { "value": "lg1", "source": "section" }
                    ]
                },
                "show": {
                    "ddo_map": [
                        {
                            "mode"         : "list",
                            "tipo"         : "hierarchy25",
                            "label"        : "Term",
                            "model"        : "component_input_text",
                            "parent"       : "self",
                            "section_tipo" : "lg1"
                        }
                    ]
                }
            }
        ]
    },
    "css": {
        ".wrapper_component": { "grid-column": "span 2" }
    }
}
```

!!! note "Option list is languages-driven, not RQO-driven"
    Although the node carries a `source.request_config` against `lg1` (kept for parity, target-section resolution and the *list* button), the **selectable options actually come from the project languages**: `get_list_of_values()` ignores the search and builds the datalist from `DEDALO_PROJECTS_DEFAULT_LANGS`. Editing which languages appear means editing the project's configured languages, not the RQO.

`section_tipo` / `parent` tell the section which slice of the global `relations` bag belongs to this component; on `save()` the locator is written through `section_record` against the section's relations column (the section is the single writer to the database). The base sets `$save_to_database_relations = true`, so the relation is also persisted to the relation table for cross-record querying. In `section_record_data` the persistence target for `component_select_lang` is the `relation` column.

## Properties & options

All properties are optional and live in the ontology node `properties` JSON. `component_select_lang` adds no bespoke property of its own; the names below are consumed via the shared base `component_relation_common`. Verified names:

### config_relation

- **Values:** object `{relation_type, relation_type_rel}`.
- **Effect:** sets the relation type written into the locator. In the `component_relation_common` constructor `relation_type` is taken from `properties->config_relation->relation_type`, falling back to the subclass default `dd151` (`DEDALO_RELATION_TYPE_LINK`) set in `$default_relation_type`. For a language link the default is almost always correct. Accepted relation-type tipos:

    | typology | tipo |
    |---|---|
    | Link (default) | `dd151` |
    | Indexation | `dd96` |
    | Children | `dd48` |
    | Parent | `dd47` |
    | Filter | `dd675` |
    | Ontology | `dd77` |

    ```json
    { "config_relation": { "relation_type": "dd151" } }
    ```

  `relation_type_rel` (locator `type_rel`) controls uni/bi/multidirectionality the same way as other related components; for a language tag it is normally left at the default.

### source / request_config

- **Values:** an object (`source`) carrying a `request_config` (RQO). `verify in ontology` for the exact shape per instance.
- **Effect:** declares the **target section** as the languages section (`lg1`) for target-section resolution (`get_ar_target_section_tipo()`, the *list* button, import disambiguation). It does **not** drive the selectable options for this subclass — see the note above. The `show.ddo_map` typically names the term component (`hierarchy25`, a `component_input_text`) so other resolution paths (grid/export) can render the language name.

### fields_separator

- **Values:** string (default `", "` in the text/mini list views).
- **Effect:** the character used **between the fields of the target record** when a locator is flattened to a label string (grid, list `text`/`mini` views, export, and when shown inside another component). A language record normally resolves to a single field (its name), so this rarely changes the output.

### records_separator

- **Values:** string.
- **Effect:** the character used **between records (locators)** when several values are flattened to one string for grid display / export. A language picker normally holds a single entry, so this rarely applies; it is inherited from the related base for parity with multi-value relation components.

### mandatory

- **Values:** `true` | `false` (default `false`).
- **Effect:** informs the user the field requires a value (UI signal). It is not a server-enforced save block.

!!! note "Standard context properties"
    Like every component, `component_select_lang` also honours the generic ontology context blocks carried into the datum `context`: `css` (style stamped on `.wrapper_component`), `request_config` (the RQO) and `view` (the render view to use). These are not component-specific options. Any other custom key seen in production should be verified in the ontology.

## Render views & modes

`component_select_lang` reuses the `component_select` client entirely — its JavaScript module (`core/component_select_lang/js/component_select_lang.js`) is a one-line alias: `export const component_select_lang = component_select`. Likewise its LESS (`css/component_select_lang.less`) only carries the `.component_select_lang` wrapper hook; the actual styles live in `component_select`. The view is read from `context.view` (default `default`) and dispatched per mode by the `component_select` render files. Verified from the source:

| View | edit | list / tm | search | Notes |
| --- | :---: | :---: | :---: | --- |
| `default` | yes | yes | (via search render) | edit: a single `<select>` built from `datalist`; the option matching the stored locator (`section_id` + `section_tipo`) is pre-selected. Read users (permission 1) see only the selected label as a read-only `content_value`. list: the selected language name. |
| `line` | yes | — | — | Same `<select>` content laid out inline (compact, no full label chrome). |
| `print` | yes | — | — | Reuses the `default` edit view but forces `permissions = 1` (read-only) and tags the wrapper `view_print`. |
| `mini` | — | yes | — | Minimal list rendering of the selected language name. |
| `text` | — | yes | — | Plain `<span>` with the selected language name. |

Search mode renders one `content_value` with a `q_operator` text input plus a `<select>` (with a leading empty option) built from `datalist`; choosing an option updates the instance data and publishes `change_search_element` to rebuild the SQO filter (it does not save).

Modes:

- **edit** — read/write a single selection. Every change runs through the shared `handle_select_change()` (in `component_select.js`): the option `value` is a JSON-encoded locator, which is parsed, re-tagged with `from_component_tipo`, given the current entry `id`, and force-saved via `change_value`. Choosing the empty option emits a `remove` action. A *list* button can open the languages section in a new window; `add_new_element()` (creating a brand-new target record) first removes any existing value, enforcing the single-selection contract.
- **list / tm** — read-only listing; `tm` (Time Machine) is aliased to the list render. `get_list_value()` resolves the stored locator to its language name via `get_list_of_values()`, applying the missing-language fallback (` *`).
- **search** — builds an SQO relation filter; saves are blocked.

DOM (edit / default): `wrapper_component component_select_lang <tipo> <mode> view_default` → `label`, `buttons_container`, `content_data` → `content_value` → `select.select`.

## Import / export model

**Import.** `conform_import_data()` is overridden in `component_select_lang` to accept **language codes** in addition to the generic related-component formats. Accepted forms:

1. A flat string of one or more language codes, comma-separated:

    ```text
    lg-spa
    lg-spa, lg-eng
    ```

2. A JSON array of language-code strings:

    ```json
    ["lg-spa","lg-eng"]
    ```

3. A JSON [locator](../locator.md) (array or single object), delegated to `component_relation_common`:

    ```json
    [{"section_tipo":"lg1","section_id":"17344"}]
    ```

4. A numeric `section_id` list (legacy related import), delegated to `component_relation_common`:

    ```text
    17344,5101
    ```

Language codes are validated against `^lg-[a-z0-9]+$` and resolved to a languages-section locator via `lang::get_section_id_from_code()`. A code that **cannot** be resolved produces a failed row (`IGNORED: invalid lang code ...`). A code that resolves but is **not** in the project's configured languages is still imported, but with a **WARNING** — the value is saved yet stays inaccessible until the project languages include it. An empty cell clears the existing value. See [importing data](../importing_data.md#related-data).

!!! warning "TS gap: language-code short form"
    The TS import engine (`src/core/tools/import_data.ts` + `import_csv.ts`) round-trips the generic locator JSON shape for every model (the raw-export round-trip), but this component's bespoke **language-code** short forms (a bare `lg-spa`, a comma list, or plain `section_id`s) are not yet implemented as a per-model override. Import a full locator array against `lg1` until this lands.

**Export.** Resolution is inherited from the base. `get_grid_value()` / `get_export_value()` iterate the stored locator(s) and, per the `ddo_map`, instantiate the named child component against `locator->section_id` / `section_tipo` to resolve the displayed language name. See [exporting data](../exporting_data.md).

**Diffusion.** Diffusion data is built by the inherited `component_relation_common::get_diffusion_data()`. In addition, `get_value_code()` returns the standardised language code (e.g. `lg-cat`) for the stored locator via `lang::get_code_from_locator()`; diffusion uses it, for example, to set the language of a published audio/video file, and `ontology::` resolves a record's main language through this method.

## Notes

- **Single selection.** Although the value is technically an array of locators, the component behaves as a single select: choosing a new language replaces the previous one, and the empty option clears it.
- **Option list (datalist).** Overridden in this subclass: options are the **project's configured languages** (`DEDALO_PROJECTS_DEFAULT_LANGS` via `lang::resolve_multiple()`), sorted by name, not the result of an RQO search. Out-of-project stored values are surfaced via `get_missing_lang()` with a ` *` marker. See the *dedalo-datalist-resolution* skill.
- **Pairing with `component_text_area` (and media).** `get_related_component_text_area()` finds the `component_text_area` related to this select in the ontology, so a text body can be tagged with its language; conversely `component_text_area::get_related_component_select_lang()` resolves the language picker paired with a text field. This pairing is declared as an ontology `related` relation, not as observer/observable wiring. `get_value_code()` exposes the chosen code for that paired content (text, audio, video).
- **Sortable.** `component_select_lang` overrides `get_sortable()` to return `true`, and `get_order_path()` builds the order path through the languages-section term (`hierarchy25` / `lg1`), so a language column can be used to order a list by language name.
- **Inherited relation behaviour.** Locator normalization/validation, `add_locator_to_data` / `remove_locator_from_data` (with dataframe cascade), grid/export/diffusion resolution, the relation-table persistence flag `$save_to_database_relations` (`true`), JSON diffusion output, parent-reference cleanup on delete, and the shared search traits (`search_component_relation_common` / `_tm`) all come from the base class.
- **Observers / observables.** Wiring, when needed, is configured in the ontology `properties` (`observe` / `observers`) like any other component; see the index page *Observers and observables* section.
- **Default tools.** A standard instance exposes `tool_propagate_component_data` and `tool_time_machine` in `context.tools`. Tools are read-only context, assembled from the model + ontology; the class does not hardcode them.
- **Permissions.** Resolved via `get_component_permissions()` (0 none / 1 read / 2 read+write / 3 admin). Read users (level 1) get the read-only label; selecting and saving require level >= 2. Saves are refused in `search` mode and short-circuited when `save_to_database === false`.
- **Related components:** [component_select](component_select.md) (the generic single-select parent it specialises), [component_text_area](component_text_area.md) (the paired content field whose language it declares), [component_av](component_av.md) (media whose language it can set), [component_check_box](component_check_box.md) and [component_radio_button](component_radio_button.md) (other closed-list relation pickers), [component_portal](component_portal.md), [component_dataframe](component_dataframe.md).
