# Add a new component model

Create a brand-new component type (a new `model`) in Dédalo v7 — server class, JSON controller, client JS/CSS, the one column-map registration, and the ontology node — by copying an existing sibling and renaming.

## When do you need this?

Most "new fields" do **not** need code. A component **model** (`component_input_text`, `component_email`, `component_image`, …) is the *behaviour*; an ontology node with `model: "component_input_text"` is an *instance* of that behaviour wired into a section. You add a field by creating a node, not a class.

| You want… | Do this |
| --- | --- |
| A new field in a section (title, date, a picker, an image…) | **Ontology only** — create a node with an existing `model`. See [ontology instances](../../core/components/component_input_text.md#ontology-instantiation). No code. |
| Tweak how a field looks/validates on one section | **Ontology only** — set `properties` / `css` / `view` on the node. |
| A genuinely new *kind* of value or interaction that no existing model gives you (with its own validation, storage shape, render, search) | **New component model** — this guide. |

Before writing a class, confirm no existing model fits: scan the [components index](../../core/components/index.md) and the [base-class decision guide](../../core/components/base_classes.md#decision-guide-which-base-should-a-new-component-extend). New models are rare; a thin `properties` tweak on an existing model is almost always the answer.

The autoloader (`core/base/class.loader.php`) is **convention-based**: a model `component_X` resolves to `core/component_X/class.component_X.php` automatically, gated by a SEC-048 allowlist regex and a realpath-containment check. **There is no registration array to edit** — the directory name *is* the contract. The single exception is the typed-column map in step 4.

!!! note "Components do not use `API_ACTIONS`"
    `API_ACTIONS` is a **tools-only** allowlist (see [creating tools](../tools/creating_tools.md)). Components expose their server data through the `component_X_json.php` controller (step 3) and `common::build_element_json_output()`, not through `API_ACTIONS`. Do not add one to a component class.

---

## Worked example

Throughout, we add **`component_phone`**: a literal-direct phone-number string with its own server/client format normalisation, sitting alongside `component_email`. It owns its own value (it is not a locator and not media), so it extends **`component_string_common`** — the same base as [`component_email`](../../core/components/component_email.md) and [`component_input_text`](../../core/components/component_input_text.md). The fastest, most accurate path is to **copy `core/component_email/` and rename every `email`/`component_email` token**, then trim the e-mail-specific logic.

---

## 1. Choose the base class

Pick the parent for *what the component stores*. Work top-down, stop at the first match (full rationale in the [base-class decision guide](../../core/components/base_classes.md#decision-guide-which-base-should-a-new-component-extend)):

| If the value is… | Extend | Inherits |
| --- | --- | --- |
| A **locator** to another section/record (picker, select, portal, parent/children) | [`component_relation_common`](../../core/components/base_classes.md#component_relation_common-related-components) | locator normalize/validate, the global relations bag, directionality, dataframe cascade, relation search |
| A **file** on disk (image, audio/video, pdf, 3d, svg) | [`component_media_common`](../../core/components/base_classes.md#component_media_common-media-components) | media paths/URLs, quality model, upload binding, access control, grid/export/diffusion |
| A **single-/multi-line string** needing sanitisation, truncation, language fallback | [`component_string_common`](../../core/components/base_classes.md#component_string_common-literal-string-components) | `sanitize_text` (SEC-034), the fallback hierarchy, `is_empty`, truncation, string search |
| A **literal with its own format** (number, date, iri, json, geolocation, password, computed/info) | [`component_common`](../../core/components/base_classes.md#layer-2-component_common) directly | the generic datum lifecycle only |

!!! warning "Never `new` a component"
    Regardless of base, instances are always built through `component_common::get_instance()` so the ontology model, caching, defaults and translatability are applied. Direct construction bypasses `load_structure_data()` and the instance cache.

For our example, a phone number is its own literal string value → **`component_string_common`**.

---

## 2. Implement the server class

Create `core/component_phone/class.component_phone.php`. Keep it thin: extend the base and override **only** what differs. The autoloader finds it by directory name — no include edit anywhere.

``` php
<?php declare(strict_types=1);
/**
* COMPONENT_PHONE
* Literal-direct phone-number string. Extends component_string_common
* (alongside component_input_text, component_text_area, component_email).
*/
class component_phone extends component_string_common {

	// Phone numbers are language-neutral: pin to NOLAN like component_email does.
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, ?string $section_tipo=null, bool $cache=true ) {
		$this->lang = DEDALO_DATA_NOLAN;
		parent::__construct($tipo, $section_id, $mode, DEDALO_DATA_NOLAN, $section_tipo, $cache);
	}

	// Normalise/validate on the authoritative server side before saving.
	public function set_data( ?array $data ) : void {
		// clean each value (strip spaces, letters…) then delegate
		parent::set_data($data);
	}

	public function save() {
		// reject malformed numbers here (backstop to the client check), then:
		return parent::save();
	}
}
```

What to model on, by base:

- **string** — `component_email` overrides `__construct` (pin `DEDALO_DATA_NOLAN`), `set_data`, `save`, `conform_import_data`, plus static validators (`is_valid_email`, `clean_email`). Mirror that set.
- **media** — implement the `component_media_interface`: at minimum `get_ar_quality()`, `get_default_quality()`, `get_original_quality()`, `get_folder()`, allowed extensions, conversion specifics. The base handles paths/URLs/upload/access control.
- **relation** — set `$default_relation_type` (and `$relation_type_rel` if directional) in the constructor; override `get_locator_value()` if the displayed value isn't the default thesaurus term.

Do **not** re-implement datum load/save, permissions, request_config or search — if you are, you picked the wrong base ([keep concrete classes thin](../../core/components/base_classes.md#decision-guide-which-base-should-a-new-component-extend)).

---

## 3. Implement the JSON controller

Create `core/component_phone/component_phone_json.php`. This file is **`include`d by `common::get_json()` inside the component's object scope** — `$this` is the live `component_phone` instance (`common::get_json()` builds the path `core/<model>/<model>_json.php`). Copy `core/component_email/component_email_json.php` and adjust the value resolver.

The contract (verified against `component_email_json.php`):

1. **Open with the SEC-026 guard** — fail closed on direct HTTP access:

    ``` php
    <?php declare(strict_types=1);
    // SEC-026: this file is included inside the calling object scope; reaching
    // it via a URL means the web server config did not block the path. Fail closed.
    if (!isset($this)) { http_response_code(404); exit; }
    /** @var component_phone $this */
    ```

2. **Read config from `$this`** — `$permissions = $this->get_component_permissions();`, `$mode = $this->get_mode();`, `$properties = $this->get_properties();`, and `$has_dataframe = isset($properties->has_dataframe) && $properties->has_dataframe===true;`.

3. **Build the `context` envelope** honouring `$options->get_context` and `$options->context_type` (`'simple'` → `get_structure_context_simple($permissions, $has_dataframe)`; default → `get_structure_context($permissions, $has_dataframe)`). The `$has_dataframe` flag pushes the dataframe DDO into the client RQO.

4. **Build the `data` envelope** only when `$options->get_data===true && $permissions>0`. Route the value by mode (`list`/`tm` → `get_list_value()`; otherwise `get_data_lang()`), resolve the dataframe subdatum with `build_dataframe_subdatum($value, $mode)` and merge its context/data, then wrap with `get_data_item($value)` annotated with `parent_tipo` / `parent_section_id`.

5. **Return** the two-envelope output:

    ``` php
    return common::build_element_json_output($context, $data);
    ```

The permission gate (`$permissions>0`) and the `get_context` / `get_data` flags are mandatory — data is never emitted when `$permissions === 0`. See the *dedalo-context-data-layers* skill for the full layering and subdatum rules.

---

## 4. Register the typed column (the one non-convention step)

This is the **only** place that is not pure convention. Add an entry to the `$column_map` registry in `core/section_record/class.section_record_data.php` — it maps the model to the PostgreSQL JSONB matrix column its data lands in:

``` php
public static array $column_map = [
    // …
    'component_input_text'	=> 'string',
    'component_email'		=> 'string',
    'component_phone'		=> 'string',   // ← add yours
    // …
];
```

Pick the column that matches the base/typology:

| Column | Use for | Models already mapped |
| --- | --- | --- |
| `string` | literal string values | input_text, text_area, email, password |
| `relation` | locators | select, check_box, radio_button, portal, dataframe, the relation_* family |
| `media` | file pointers | 3d, av, image, pdf, svg |
| `number` | numeric | number |
| `date` | date | date |
| `geo` | geolocation | geolocation |
| `iri` | IRI | iri |
| `section_id` | record id | section_id |
| `misc` | bespoke direct objects | json, info, inverse, filter_records, security_access |

!!! danger "Forget this and DB reads/writes silently break"
    `section_record_data::get_column_name($model)` returns `$column_map[$model] ?? null`. If the model is missing it returns **`null`**; callers that don't guard will fail to persist or read the component's data. Our `component_phone` stores a string, so `'component_phone' => 'string'`.

---

## 5. Implement the client class

Create `core/component_phone/js/component_phone.js`. The model is dynamically imported by `core/common/js/instances.js` from `core/<model>/js/<model>.js` (the default branch; `service_*` and `tool_*` have their own branches). **The named export must match the model exactly.**

``` js
// imports
import {common}            from '../../common/js/common.js'
import {component_common}  from '../../component_common/js/component_common.js'
import {render_edit_component_phone}   from './render_edit_component_phone.js'
import {render_list_component_phone}   from './render_list_component_phone.js'
import {render_search_component_phone} from './render_search_component_phone.js'

// named export MUST equal the model
export const component_phone = function(){
	this.id           = null
	this.model        = null
	this.tipo         = null
	this.section_tipo = null
	this.section_id   = null
	// … declare the rest, mirroring component_email.js
}
```

Then assign the lifecycle prototypes from `component_common` / `common` (`init`, `build`, `render`, `save`, `change_value`, `destroy`) and the per-mode `edit` / `list` / `search` aliases, exactly as `component_email.js` does. The instance inherits the full `init → build → render → save → destroy` lifecycle from `component_common`.

---

## 6. Implement render dispatchers and views

Mirror the `component_email` set (file nomenclature: `render_<mode>_component_<name>.js` and `<view>_<mode>_<name>.js` — see the [components index nomenclature](../../core/components/index.md#nomenclature-of-files)):

- **Per-mode dispatchers** — `js/render_edit_component_phone.js`, `js/render_list_component_phone.js`, `js/render_search_component_phone.js`. Each imports and routes to the right view by `context.view`.
- **View builders** (the actual DOM) — copy email's set and rename: `js/view_default_edit_phone.js`, `js/view_line_edit_phone.js`, `js/view_mini_phone.js`, `js/view_default_list_phone.js`, `js/view_text_list_phone.js`.

Render only the views/modes the component supports (`edit`, `list`, `search`, `tm`; `tm` typically reuses the `list` renderer). Compare [`component_email` render views](../../core/components/component_email.md#render-views--modes) for a minimal set and [`component_input_text`](../../core/components/component_input_text.md#render-views--modes) for a richer one.

---

## 7. Add the CSS (LESS)

Create `core/component_phone/css/component_phone.less` (plus per-view LESS if needed). LESS is **not** compiled standalone — the final CSS is bundled into `page.css`. Follow the *dedalo-css-styling* design-system conventions; style hangs off the `.wrapper_component` stamped from the node's `css` property.

---

## 8. Create the ontology node(s)

The model now exists; instantiate it. Create an ontology node with `model: "component_phone"` whose `parent`/`section_tipo` wire it into a section (or a section grouper). The `lg-*` terms are the field label; translatability and `properties` come from the node.

``` json
{
    "tipo"         : "tch443",
    "model"        : "component_phone",
    "parent"       : "tch1",
    "section_tipo" : "tch1",
    "lg-eng"       : "Contact phone",
    "lg-spa"       : "Teléfono de contacto",
    "properties"   : { "mandatory": false }
}
```

`section_tipo` is **mandatory** at instantiation (auto-resolution was removed — an empty value returns `null`). Wiring the node as a child (directly or via a grouper) of the section is what makes the field appear in that section's edit form. See [`component_email` ontology instantiation](../../core/components/component_email.md#ontology-instantiation) for the full node/`properties` shape, and the *dedalo-ontology-instances* skill for creating nodes in the UI. Node-shape references live in `core/ontology/templates/`.

---

## 9. (Optional) samples and a test

- **Samples** — copy `core/component_email/samples/` (`context.json`, `data.json`, `api_data.json`) and adjust; these feed the docs and tests.
- **Test** — add `test/server/component_phone/component_phone_Test.php` modelled on the existing component tests, asserting the column-map entry, `set_data` normalisation, `save` validation and the `_json.php` envelope shape. Run with `cd test/server && ../../vendor/bin/phpunit component_phone/component_phone_Test.php`.

---

## Recap — files to create/edit

``` shell
core/component_phone/
├── class.component_phone.php          # step 2  (extends component_string_common)
├── component_phone_json.php           # step 3  (controller, SEC-026 guard)
├── css/
│   └── component_phone.less           # step 7
└── js/
    ├── component_phone.js             # step 5  (named export == model)
    ├── render_edit_component_phone.js     # step 6
    ├── render_list_component_phone.js     # step 6
    ├── render_search_component_phone.js   # step 6
    ├── view_default_edit_phone.js         # step 6
    ├── view_line_edit_phone.js            # step 6
    ├── view_mini_phone.js                 # step 6
    ├── view_default_list_phone.js         # step 6
    └── view_text_list_phone.js            # step 6

core/section_record/class.section_record_data.php   # step 4  ($column_map entry — the ONLY registry edit)

# + ontology node(s) with model:"component_phone"     # step 8
```

---

## Common pitfalls

- **Missing `$column_map` entry (step 4).** The single non-convention edit. Without it `get_column_name()` returns `null` and the component's data never persists/loads — silently. This is the most common omission.
- **JS export name ≠ model.** `instances.js` instantiates the module's named export *matching the model*. `export const component_phone = …` must equal the directory/model name, or instantiation fails.
- **Editing the autoloader or hunting for a registry.** There isn't one (except `$column_map`). The directory name `core/component_phone/` + class `component_phone` is the whole server contract; the SEC-048 allowlist + realpath check gate it.
- **Adding `API_ACTIONS` to a component.** That belongs to [tools](../tools/creating_tools.md), not components. Component server data flows through `component_phone_json.php` and `build_element_json_output()`.
- **Dropping the SEC-026 guard in the `_json.php`.** Without `if (!isset($this)) { http_response_code(404); exit; }` the controller is reachable as a direct URL — fail-closed is required.
- **Picking the wrong base.** If you find yourself re-implementing datum load/save, permissions, request_config or search, you extended the wrong base. Re-read the [decision guide](../../core/components/base_classes.md#decision-guide-which-base-should-a-new-component-extend).
- **Forcing translatability the component should not have.** `component_email`/`component_phone` pin `DEDALO_DATA_NOLAN` in the constructor; don't expect `tool_lang` or per-language variants on a language-neutral value.
- **No scaffolder.** Unlike tools (which have `tools/tool_dev_template/` and `tools/tool_common/cli/create_tool.php`), components have **no generator**. Copy an existing sibling directory, rename every token, and add the `$column_map` entry plus the ontology node.

---

## Related

- [Component base classes](../../core/components/base_classes.md) — the inheritance chain and the base-class decision guide.
- [Introduction to components](../../core/components/index.md) — file nomenclature, datum, context, data, permissions, observers.
- [`component_input_text`](../../core/components/component_input_text.md) — reference string component to copy (translatable variant).
- [`component_email`](../../core/components/component_email.md) — reference string component to copy (non-translatable, with validation).
- [Locators](../../core/locator.md) — the locator object, if you extend `component_relation_common`.
- [Creating new tools](../tools/creating_tools.md) — the companion guide for the tools extension surface (and where `API_ACTIONS` lives).
- Skills: *dedalo-context-data-layers* (the `_json.php` envelopes), *dedalo-ontology-instances* (creating nodes), *dedalo-css-styling*, *dedalo-search* (per-component search traits), *dedalo-dataframe* (`has_dataframe` wiring).
