# component_dataframe — Evaluation, Architecture & Roadmap

> **Implementation status (2026-06)**: all roadmap phases are implemented.
> The reserved relation-type term is **`dd490`** (`DEDALO_RELATION_TYPE_DATAFRAME`,
> relabel pending in the master ontology). The data migration ships as the
> `7.0.1` update block (`dataframe_v7_migration` class, dry-run capable) and
> the integrity tooling as the `dataframe_control` maintenance widget.
> Key code: `trait.dataframe_common.php` (PHP authority),
> `core/common/class.dataframe_caller.php` (typed caller DTO),
> `core/component_common/js/dataframe.js` (JS authority),
> `section_record::allocate_component_ids` (atomic id allocator).
> Diffusion opt-in: ddo `fn: "get_diffusion_data_with_dataframe"` on the main
> component, or a `component_dataframe` ddo with `parent` scoping.
> Export/import: `{"dedalo_data": {"dato": ..., "dataframe": [...]}}` envelope.
>
> **Literal components wired** (controller `build_dataframe_subdatum` + JS
> `attach_item_dataframe` in default_edit / line_edit / default_list / mini
> views): component_input_text, component_text_area, component_date,
> component_number, component_email, component_iri (own line views).
> To enable frames on an instance: ontology `properties->has_dataframe: true`
> plus a `component_dataframe` ddo in its request_config `show.ddo_map`
> (same contract for every literal component).

`component_dataframe` is an auxiliary relation component that extends the data of a main component with **data frames**: uncertainty, qualifiers, or contextual information about individual values of the main data (in the spirit of Wikidata qualifiers/references). Frame content lives in separate sections defined by the ontology; the pairing between a main value and its frame record is stored as locators in the main section record.

Today the mechanism works for relation components. `component_iri` was the v6.8 test-bed for attaching frames to a **literal** component (per-row labels) and has real-world data. This document evaluates the current implementation, defines the unified target architecture that makes data frames a solid foundation for all literal components (`component_input_text`, `component_date`, …), and lays out the implementation roadmap.

---

## 1. Evaluation of the current implementation

### 1.1 What is structurally sound (kept)

1. **Frame content as real section records** (e.g. IRI labels in `dd1706`/`dd1715`). This is the Dédalo way: frames are ontology-defined sections, their internals are ordinary components — searchable, Time Machine covered, and in principle diffusable.
2. **Forward pairing locators stored in the main section record's relation column.** `component_dataframe` extends `component_portal`; frame links live where every other edge in the system lives — the relations container that powers search, inverse-reference resolution and section-level cascade. Discovering "which values of this record have frames" is a same-row read.
3. **Per-item counter `id`.** `component_common::set_data()` already stamps a counter-based `id` on *every* data item — literal values *and* relation locators. A universal stable value identity already exists in the data model; the system just doesn't use it consistently.

### 1.2 What is an accident of v6.8 evolution (fixed by this architecture)

1. **Split-brain identity model.** `section_id_key` means the *target record's* `section_id` for relation mains (`component_common::remove_dataframe_data()`), but the *item counter `id`* for literal mains (`component_iri::resolve_title()`). These are semantically different. Keying on the target breaks when the same target is linked twice and silently detaches the frame when a locator is re-pointed. The literal path is the correct one: a frame qualifies the *statement* ("this value"), not the target.
2. **Frontend index/id confusion is live.** `render_edit_component_input_text.js` and `view_default_edit_input_text.js` pass the **array index** as `section_id_key`, while `component_iri` correctly passes `current_value.id`. Same trait, two incompatible identities — input_text frames break on reorder/delete by construction.
3. **Shape-based detection.** Dataframe locators are recognized by heuristics (`isset($el->section_id_key)`, `property_exists($el,'iri')`, model-name lists) in the Time Machine filtering of `component_common::get_data()`. Every new literal main is one special case away from corrupting TM previews; there is no positive marker.
4. **Dual delete writers.** The server cascade (`remove_dataframe_data()` inside `update_data_value('remove')`) and the client (`delete_dataframe()` in JS) both write — race-prone, and the client path is where the index bug lives.
5. **Client-side id minting.** `render_edit_component_iri.js` does `current_value.id = self.data.counter + 1` in the browser, combined with a non-atomic read-increment-write counter — two tabs or two users can mint the same id and cross-wire frames.
6. **`caller_dataframe` as an untyped positional argument** of `component_common::get_instance()`, hand-rolled as `stdClass` in at least six call sites. No type, no validation, silent shape drift.
7. **Dual encoding of the same fact**: the deprecated literal `title` property of `component_iri` vs the frame label, reconciled at read time by a fallback chain with no migration path.
8. **Lifecycle gaps**: soft-deleted frame target records accumulate with no garbage collection; frames are not published by diffusion; import/export support is partial (the iri `label_id` mechanism is bespoke).

### 1.3 Alternatives considered and rejected

| Alternative | Verdict |
|---|---|
| Pairing embedded on the main value (`value.dataframe = [...]`) | Frame edges leave the relations container → standard relation search, inverse resolution and cascade stop seeing them; translatable literals would duplicate refs per language. Clean on paper, breaks the relations architecture. |
| Inverted: frame record carries a back-reference to the main value | Needs a value-identity key anyway (the problem just moves), requires an inverse search per row per frame on render, and splits statement history across two Time Machine streams. |
| Composite flat key `ref_key = "section_tipo_id"` | Re-embeds redundant information (the tipo part always equals the host record's own `section_tipo`) into the *match key*, making correctness depend on string construction. Dédalo's flat `tipo_id` idiom identifies records; here the second half is an item id — reusing the idiom invites misreading. |

**Conclusion:** keep the storage model (forward frame locators in the relations container) and generalize the identity model of the literal/iri path (item `id`) to all components.

---

## 2. Target architecture

### 2.1 Pairing contract

A **frame locator**, stored in the main section record's relation column (lang-agnostic):

```json
{
    "type"                : "<DEDALO_RELATION_TYPE_DATAFRAME tipo>",
    "section_tipo"        : "<frame section tipo>",
    "section_id"          : "<frame record section_id>",
    "from_component_tipo" : "<component_dataframe tipo>",
    "main_component_tipo" : "<main component tipo>",
    "id_key"              : 1
}
```

- `type` — a reserved ontology relation-type term (`DEDALO_RELATION_TYPE_DATAFRAME`), the **positive marker** that an entry is a frame locator. All filtering (Time Machine, `get_data()`, search, export) switches to it; shape-sniffing remains only as a read fallback for pre-migration data, gated on the absence of `type`.
- `id_key` — **always the counter `id` of the main data item**, for relation and literal components alike. Renamed from `section_id_key` because the value is an item id, not a section_id. Integer.
- `section_tipo_key` is **dropped**: once keying is item-id based it carries no discriminating information (it always equaled the host record's own `section_tipo`). Time Machine saves main + frame data in the same TM row, so the connection is never lost in detached contexts.

**Match predicate:** `(type, from_component_tipo, main_component_tipo, id_key)`.

Legacy readers accept `section_id_key`/`section_tipo_key` as fallback only until the data migration (§4) has run.

### 2.2 Lifecycle invariants

- **I1 — server-minted ids.** Item ids are assigned server-side only (`set_data_item_counter`, atomic allocator §3.4). Immutable, never reused, shared across languages for translatable items (one logical entry = one id in all languages).
- **I2 — no index addressing.** Clients identify rows exclusively by item `id`; an array index is forbidden in any dataframe key.
- **I3 — save-then-attach.** A frame can only be attached to a persisted main item: the client saves the main value, reads the assigned `id` from the save response, then attaches the frame. No client `counter+1` minting.
- **I4 — server-authoritative cascade.** Deleting a main item removes its frame locators server-side in `update_data_value('remove')`; the client never duplicates the cascade. Frame *target records* are left in place (Time Machine needs them) and reclaimed by the orphan GC (§3.6).
- **I5 — reorder is a no-op; re-pointing keeps the frame.** Identity travels with the item id. Re-pointing a relation locator to a different target keeps its frame — intended qualifier semantics, and a documented behavior change versus the old target-keyed model.
- **I6 — single TM row per statement.** Frames are merged into the main component's Time Machine row (`get_time_machine_data_to_save()`), deduplicated by the match predicate before merge. Frame saves triggered by the cascade run with `tm_record::$save_tm = false`.
- **I7 — translatable cascade.** Frames are per-item-id and lang-agnostic; the cascade fires only when the id no longer exists in *any* language.

### 2.3 Shared abstraction layer — one code path for relation and literal mains

**PHP**

- `DEDALO_RELATION_TYPE_DATAFRAME` constant + ontology term reservation, alongside the existing relation-type terms.
- `core/common/class.dataframe_caller.php` — typed DTO `{section_tipo, section_id, main_component_tipo, id_key:int}` with `validate()`. `component_common::get_instance()` keeps its caller parameter; `stdClass` is accepted transitionally (normalized + deprecation log).
- `core/component_common/trait.dataframe_common.php` rewritten as the **single pairing authority**:
    - `has_dataframe()` / `get_dataframe_tipo()` — read `properties->dataframe->component_tipo` from the ontology only (no runtime injection).
    - `build_dataframe_caller(int $item_id): dataframe_caller`
    - `get_dataframe_instance(int $item_id, string $mode='list')` — replaces every hand-rolled `get_instance()` call site (component_iri, section_record, component_relation_common, tests).
    - `get_item_dataframe_data(int $item_id)` / `remove_dataframe_data(int $item_id)` — item-id signatures.
    - `static is_dataframe_entry(object $el): bool` — type-first predicate with legacy shape fallback; replaces the model-name/shape ladder in the TM branch of `component_common::get_data()` and the filter in `component_dataframe::get_data()`.
- `component_dataframe` shrinks: its filter, `get_main_component_tipo()` relation-vs-literal special casing, and `test_equal_properties` consume the trait/DTO.

**JavaScript**

- New module `core/component_common/js/dataframe.js` (extracted and hardened from `component_common.js` `get_dataframe`/`delete_dataframe`):
    - `get_dataframe_keys(self, item)` → `{id_key: item.id, main_component_tipo: self.tipo}`; **throws if `item.id` is undefined** — no index fallback.
    - `attach_dataframe_node(...)` — the render glue currently copy-pasted across iri, input_text and portal views.
    - Datum matching compares `type` first; `console.error` on missing keys.
    - Remove flows no longer call `delete_dataframe` (server cascade owns it); the function remains only for explicit user "unlink frame" actions.

### 2.4 How a literal component opts in

Reference implementations: `component_input_text` and `component_date`.

1. **Ontology**: declare `properties->dataframe->component_tipo` on the main component instance; the `component_dataframe` node's portal request_config points at the frame target section; a ddo for the dataframe appears in `show.ddo_map` (what `get_dataframe_ddo()` discovers). Optional `properties->dataframe->delete_policy: 'unlink' | 'delete_target'` for frame-private sections (e.g. iri labels) where an unlinked record is meaningless.
2. **PHP**: nothing per-component — `component_input_text_json.php` is the canonical controller pattern (subdatum resolution, id-keyed locators); `component_date_json.php` mirrors it.
3. **JS**: edit views render via `attach_dataframe_node(...)` with `get_dataframe_keys(self, current_value)`; remove handlers do nothing dataframe-specific (I4).
4. **component_iri** migrates onto the shared surface (not grandfathered): the runtime ddo injection in `get_properties()` is replaced by an ontology declaration (code fallback kept one release); `resolve_title()` delegates to `get_item_dataframe_data()` keeping the deprecated-`title` fallback until the data migration runs; `get_grid_value()` stops persisting `title` back into data items.

---

## 3. Concrete fixes

| # | Defect | Fix |
|---|---|---|
| 1 | Index-as-key on delete (`render_edit_component_input_text.js`) | Remove the client `delete_dataframe` call from the remove flow (server cascade, I4); explicit-unlink paths use the item `id`. |
| 2 | Index-as-key on render (`view_default_edit_input_text.js`) | `section_id_key: i` → `id_key: current_value.id`; add the missing `main_component_tipo`. |
| 3 | Client id minting (`render_edit_component_iri.js`) | Remove `counter+1`; frame UI enabled only after the item is persisted (save response carries the id) — I3. |
| 4 | Counter race | `section_record::allocate_component_ids(tipo, count)` under `pg_advisory_xact_lock(hashtext(section_tipo||section_id||component_tipo))`; `set_data` rejects/reassigns client-provided ids above the allocator. |
| 5 | Cross-language sync | Clients always send `id` in changed_data; the positional `get_id_from_key` heuristic is demoted to a logged fallback; the translatable remove branch routes its cascade through the trait (I7). |
| 6 | TM merge duplication | Dedup by match predicate in both `get_time_machine_data_to_save()` implementations before merge (I6). |
| 7 | iri title duality | Migration materializes `title` → frame record + locator (reusing the `import_save` label machinery), then strips `title`; the read fallback stays until the migration is run. |

---

## 4. Data migration (v6.8/early-v7 → unified contract)

Implemented in the standard update pipeline (`core/base/update/updates.php` + `component_dataframe::update_data_version`). Idempotent, with a dry-run/report mode, run after the standard DB backup.

1. **Matrix data** — for every section record containing dataframe locators:
    - *Relation mains*: resolve the old `(section_id_key = target section_id, section_tipo_key = target section_tipo)` against the main component's data, find the locator item pointing at that target, write `id_key = item->id`. Items lacking `id` (very old rows) get the counter-stamping save first. Ambiguity (same target linked twice — the old model could not distinguish them): attach to the first match and emit a report row.
    - *Literal mains (iri)*: the value is already the item id — property rename only.
    - *All*: stamp `type = DEDALO_RELATION_TYPE_DATAFRAME`; remove `section_id_key` and `section_tipo_key`.
2. **Time Machine** (`matrix_time_machine`) — TM rows of main components contain the merged main + frame data, so the information needed to resolve the pairing is *in the same row*: re-key frame locators inside each TM `datos` using that row's own main data. Unresolvable rows are left untouched and reported; readers keep the legacy-shape fallback gated on the absence of `type`.
3. **Activity log** (`matrix_activity`) — rewrite dataframe locators inside stored changed_data payloads where resolvable against the record's current/TM data; report the rest.
4. Once the migration has run on an install, the legacy dual-read branches can be removed (roadmap Phase 8).

---

## 5. Export / import / diffusion

- **Export** — `tool_export` `dedalo_raw` officially emits `{"dedalo_data": {"dato": ..., "dataframe": ...}}`: frame locators plus frame record payloads keyed by item id.
- **Import** — generalize the iri `label_id` path into a per-component dataframe contract in `conform_import_data`; when ids are allocated at import time, remap `id_key` (a single integer) and write locators through the trait.
- **Diffusion** — opt-in per diffusion ddo (`include_dataframe` or a sub-ddo map into the frame section): the chain processor follows `type === DATAFRAME` locators of the addressed items and publishes frame fields joined by the parent item id. Follows the v7 parser-based property format.

---

## 6. Roadmap

| Phase | Scope | Depends on |
|---|---|---|
| **0 — Stop the bleeding** | JS index→id fixes; remove client id minting; contract tests pinning pairing-key === item.id for literals. No schema change, legacy key names untouched. | — |
| **1 — Contract layer** | Constant + ontology term; `dataframe_caller` DTO; trait rewrite; `is_dataframe_entry`; JS `dataframe.js`; stamp `type` on all *new* locators; dual-read (type-first, shape fallback). All existing dataframe tests stay green. | — |
| **2 — Single-writer lifecycle** | Server-authoritative delete; save-then-attach frame creation; generalized cross-language cascade. | 1 |
| **3 — Atomic id allocation** | Advisory-lock allocator + `set_data` id validation. | 1 |
| **4 — Data migration** | The re-keying update script (matrix + Time Machine + activity log) with dry-run report. Afterwards relation and literal mains share an identical data shape. | 1 |
| **5 — Reference literals + iri consolidation** | `component_input_text` and `component_date` as reference implementations (date needs JS wiring); iri onto the shared surface; title-materialization migration. | 1, 2 |
| **6 — Export/import round-trip** | `dedalo_data` wrapper with frames; generic import contract. | 1, 3 |
| **7 — Diffusion** | `include_dataframe` resolution in the chain processor. | 1, 4 |
| **8 — Hygiene** | Integrity-check + orphan-GC maintenance widgets (`area_maintenance`); `delete_policy`; remove deprecated trait context-helpers and legacy dual-read branches. | 4 |

### Risks

- **TM reinterpretation** — guarded by the never-rewrite-unresolvable rule and the type-gated dual read.
- **Behavior change on re-pointing** (frame follows the statement, not the target) — intended qualifier semantics; must be stated in the release notes.
- **Migration ambiguity** (duplicate targets) — reported, never guessed silently; idempotent + dry-run first.
- **UX latency on attach** (frame button active only after save) — matches existing portal behavior.

---

## 7. Verification

- **Extend**: `test/server/components/component_input_text_dataframe_Test.php`, `component_date_dataframe_Test.php`, `component_text_area_dataframe_Test.php`, `component_dataframe_Test.php`, `dataframe_common_Test.php`, `component_iri_Test.php` (and `component_iri_Search_Test.php` unchanged-green as regression).
- **New tests**: counter concurrency (parallel allocations, no duplicate ids); TM dedup + save/restore round-trip (no duplicated locators, type-based filtering, legacy-shape TM rows still render); migration fixture (old-shape relation dataframes in → unified shape out, TM/activity re-keyed, ambiguity report emitted); export→import round-trip preserving pairing with remapped ids; diffusion snapshot with `include_dataframe`; orphan GC + integrity check.
- **Frontend manual matrix**: add / edit / reorder / delete × translatable / non-translatable × input_text / date / iri. Reorder-then-delete is the regression that exposes the index bug.
