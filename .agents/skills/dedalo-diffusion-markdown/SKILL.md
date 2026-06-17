---
name: dedalo-diffusion-markdown
description: The Dédalo v7 "markdown" diffusion output format — publishing section records as human/AI-readable .md files. Use when modifying diffusion/class.diffusion_markdown.php, the markdown paths in core/api/v1/common/class.dd_diffusion_api.php (diffuse dispatch / render_markdown_response / validate), the markdown case in diffusion/class.diffusion_delete.php, or the markdown branches in the Bun engine (diffusion/api/v1: index.ts dispatch, lib/types.ts, lib/status.ts). Covers the reuse-the-datum-path design, the file/link conventions, and the levels-based relation recursion.
---

# Dédalo v7 Markdown diffusion

`markdown` is a file-based diffusion output format (alongside `sql`, `rdf`, `xml`,
`socrata`). It publishes **one `.md` file per record** so AI agents can read
record data comfortably. It is driven by the diffusion ontology like every other
format, and reuses the standard datum machinery — read the umbrella
[[dedalo-diffusion]] skill first for the hard rules (Bun owns MariaDB, v7
`properties` only, flat virtual tree).

## The one design decision that explains everything

Markdown is **NOT an early dispatch** like `rdf`/`xml`. Those short-circuit
`diffuse()` before the datum builder. Markdown instead **flows through the normal
SQL-style datum path** (`process_datum()` + the breadth-first `$datum_unresolved`
drain) and is **post-processed** at the end of `diffuse()`:

```
diffuse(): … → process_datum(primary) → drain $datum_unresolved (levels)
          → if type==='markdown': return render_markdown_response(...)
          → else: return SQL datum response
```

Why: this reuses, for free, the curated `ddo_map` resolution, alias handling, the
publication gate, **levels-based cross-section recursion**, and relation
enqueuing. `render_markdown_response()` just walks the already-resolved
`self::$datum` and renders each record's grouped `fields` to a `.md` file. There
is no second resolution path to keep in sync.

Consequence: related records are published as their own `.md` because the levels
drain already added them to `self::$datum`; and a relation field-group carries the
related record's `section_tipo`/`section_id`, which is exactly what the renderer
needs to emit a link to `{section_tipo}_{section_id}.md`.

## Product behaviour (decided with the user — keep it)

1. **Curated via `ddo_map`** — markdown renders only the fields mapped in the
   diffusion ontology (same as rdf/xml), NOT a generic dump of every component.
2. **One `.md` per record**, deterministic name `{section_tipo}_{section_id}.md`
   under `DEDALO_MEDIA_PATH/markdown/{service_name}/`.
3. **Public files** (parity with rdf/xml) — only publishable records
   (`component_publication`) are written; no media-protection markers.
4. **Relations rendered BOTH ways** — the flattened value inline **and** a link to
   the related record's own `.md`; `levels` controls how deep related records are
   themselves published so the links resolve.
5. **Section name is the document header** (`# {section_name}`), with YAML
   frontmatter carrying `section_name`, `section_tipo`, `section_id`, `title`,
   `diffusion_element`.

## Touch points (where markdown lives)

PHP:
- `diffusion/class.diffusion_markdown.php` — the renderer + file IO class. Public
  surface mirrors `diffusion_xml`: static `get_record_file_path()` (single source
  of truth, `.md` under `/markdown/{service_name}/`), `delete_record_file()`,
  `reset_cache()`, plus `render_record()` / `save_record()`. **No parser loading,
  no chain resolution** — it consumes the resolved datum `context` + `fields`.
- `core/api/v1/common/class.dd_diffusion_api.php`:
  - `diffuse()` — markdown is left OUT of the rdf/xml early-dispatch and branches
    to `render_markdown_response()` after the drain loop.
  - `render_markdown_response()` — iterates `self::$datum`, renders + writes each
    record (or `delete_record_file()` when `record->fields === 'delete'`), builds
    the file-format datum.
  - `validate()` — `markdown` is in `$known_types` and runs the `service_name`
    check (shared with rdf/xml).
- `diffusion/class.diffusion_delete.php` — `markdown` in both switches +
  `delete_markdown()` helper → `diffusion_markdown::delete_record_file()`.

Bun (`diffusion/api/v1/`):
- `lib/types.ts` — `rqo_options.type` union includes `'markdown'`;
  `consolidated_files.merged_url` is optional (markdown has no merged document).
- `index.ts` — dispatch routes `markdown` to `handle_diffuse_rdf_stream`; the
  `'rdf'|'xml'` unions are widened to include `'markdown'`; post-processing skips
  the merge (`merged_content = null`), still ZIPs the per-record files, and sets
  `diffusion_class = 'diffusion_markdown'`, `type_label = 'md'`.
- `lib/status.ts` — `markdown` joins the PHP-session-only readiness branch.

## The datum shape markdown emits (must match Bun's reader)

Bun's file-stream extractor reads `record.fields?.[diffusion_tipo].entries[].file_url`.
So `render_markdown_response()` builds, per record:

```php
record.fields = { [diffusion_element_tipo]: [ { entries: [ { value: null, file_url } ] } ] }
```

- `diffusion_tipo` on the datum = the element tipo (the fields key matches it).
- `entry.value` is left **null** on purpose — a string value would be pushed to
  `raw_xml_parts` and corrupt the (skipped) merge step.

## Gotchas

- **Don't re-resolve.** If you find yourself calling `resolve_chain()` inside
  `diffusion_markdown`, stop — the data is already in `self::$datum`. The class is
  a pure renderer + file IO.
- **`reset_cache()` resets only the per-request cache** (section-name lookups),
  not `$saved_files` (per-process accumulation) — mirrors `diffusion_xml`.
- **Dangling links are a config issue, not a bug.** A relation link is emitted
  from the related record's identity even if that related section is not mapped
  under the element (so its `.md` is never produced). To make links resolve,
  configure the related sections under the same markdown element within `levels`.
- **`get_record_file_path()` returns null without `service_name`** — same contract
  as rdf/xml; run the `validate` API action to find unconfigured elements.
- **Relation field detection** uses `isset($group->section_tipo, $group->section_id)`
  on the field-group, independent of model. Media detection uses
  `ontology_node::get_model_by_tipo($group->tipo)`.

## Ontology config (the user does this, not code)

Canonical models: **`diffusion_section`** for the section node, **`diffusion_component`**
for the field nodes (NOT the SQL `table`/`field_*` models — their column-type
meaning is irrelevant to markdown). Both are structural ontology models with no
PHP class (like `field_text`); they need only ontology definition + structure
relations (`diffusion_section` under `diffusion_element`, `diffusion_component`
under `diffusion_section`). **No code is required** — `process_datum` /
`get_ddo_map` / the chain processor are model-agnostic; the only model-specific
code (`field_* → SQL column type`) lives in the SQL/Socrata path markdown never
enters.

```
diffusion_element     { diffusion: { type: 'markdown', service_name } }
└── diffusion_section  ──related──▶ section
    └── diffusion_component × N   { process: { ddo_map: [ … ] } }   → component / relation chain
```

The `ddo_map` is resolved by `get_ddo_map` + `resolve_chain` **identically** to
SQL/RDF/XML — same relation-chain resolution for pulling related-section data into
the main record, same `levels` recursion. Give related sections their own
`diffusion_section` (within `levels`) so relation links resolve. `service_name` is
required (no file path without it; `validate` reports it). No new constants; the
`/markdown/{service_name}/` directory is created on demand. Langs follow
`DEDALO_DIFFUSION_LANGS` (fallback `[DEDALO_DATA_LANG]`) like `build_langs()`.
Note: field `parser`/`output_format` are not applied by the renderer (they format
for SQL/XML) — only data *resolution* is shared.

## Tests

- PHP: `test/server/diffusion/diffusion_markdown_Test.php` (pure `render_record` +
  `sanitize_md_value`; guarded `get_record_file_path`/`delete_record_file` via
  `diffusion_test_helper::require_markdown_ontology()` — skip until a markdown
  element is seeded, same as rdf/xml). Run:
  `cd test/server && ../../vendor/bin/phpunit --testsuite "diffusion"`.
- Bun: `test/handler.test.ts` asserts `type:'markdown'` streams over SSE. Run:
  `cd diffusion/api/v1 && bunx tsc --noEmit && bun test`.

## Reference

Full architecture + rendering rules: `docs/diffusion/diffusion_markdown.md`.
