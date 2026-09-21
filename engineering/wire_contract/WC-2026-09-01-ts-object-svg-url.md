# WC-2026-09-01-ts-object-svg-url — a thesaurus node's SVG element ships a URL, and its cache-buster is the file's mtime

- **Date:** 2026-09-01, adopted with the port of `ts_object::format_component_data`'s
  `component_svg` case (the last DEFERRED item in that file's coverage header).
- **Decision:** DEC-12 (the invariant lands with its gate:
  `test/unit/ts_object_svg_element_native.test.ts`).

## Shape before (TS through 2026-08-31): the stored array, not a URL

`ts_object.ts` listed "component_svg URL/file-exists resolution (needs media
machinery)" as deferred, so a tree node's `img` element carried the RAW stored
media items — `[]` on a node with no file, `[{id, files_info, …}]` on one with.

The client hands that value straight to its DOM builder as an `<img>` `src`
(`client/dedalo/core/ts_object/js/render_ts_line.js`, the `'img'` case). An empty
array is TRUTHY in JavaScript, so the element rendered, `ui.create_dom_element`
refused the non-URL (`[ui] refused a non-http(s) src:`, the XSS-04 scheme
allowlist doing its job), and every glyph illustration in the thesaurus panel was
missing — one console warning per node, no error, nothing red.

## Shape after (TS): the file's URL, or the empty string

`getComponentDataLang` resolves a `component_svg` element to a STRING:

- the file at the component's DEFAULT quality exists on disk →
  `{media web base}{relative path}?{mtime}`;
- it does not → `''`, and the client's own `if(current_element.value)` is the
  suppression, exactly as in PHP.

The path grammar is `buildMediaLocation`'s — the same one the writer, the
files_info scanner and every other media URL emitter use — resolved through the
RECORD-scoped `resolveMediaPathOptions(tipo, section_tipo, section_id)`. The
record-scoped form is the load-bearing part: only it answers
`properties.additional_path`, whose value is a SIBLING COMPONENT's value on THIS
record. Asked in the two-argument section-scoped form the property is left
undefined and the numeric `max_items_folder` bucket wins, so on an install that
names its buckets the thumbnail would be stat-ed at a path nothing was ever
written to and would disappear for good.

## The DELIBERATE divergence: the cache-buster

PHP appended the REQUEST's start time (`get_url() . '?' . start_time()`), a value
that changes on every read. A thesaurus paint issues one node read per node, so
every thumbnail of every paint was a cache miss for the browser — on a glyph
tree that is hundreds of images re-downloaded per expand.

TS appends the file's own `mtimeMs`. It busts exactly when the bytes change,
which is what a cache-buster is for, and the file is already `stat`-ed for the
existence check, so it costs nothing. The path before the `?` is byte-identical
to PHP's.

Two smaller notes, recorded so they are not mistaken for oversights:

- **The identifier's lang follows the NODE.** PHP's `get_id` suffixes the
  identifier when `ontology_node::get_translatable($tipo)` is true — the flag is
  on the dd_ontology NODE, not on the class, so "component_svg is not
  class-translatable" would NOT have made the branch unreachable. This resolves
  it the way the engine's own media-identity resolver does
  (`src/core/media/tool_support.ts`): translatable → `currentDataLang()`, else
  null. A node that carries the flag stores `<id>_<lang>.svg`, and reading the
  unsuffixed name would have made its thumbnail vanish silently.
- **Only the default quality is probed**, not the alternate-extension ladder.
  PHP's `get_media_filepath(DEDALO_SVG_QUALITY_DEFAULT)` does the same.

## Gate reconciliation

- New gate: `test/unit/ts_object_svg_element_native.test.ts` — a `test`-TLD node
  with an svg file on disk emits a URL under the media web base whose query is
  the file's mtime; the same node with the file removed emits `''`; the value is
  a string in both cases (never the stored array, which is what the client
  refuses); and the path is the one `buildMediaLocation` builds, not a second
  grammar.
- **No re-harvest is needed.** No harvested fixture holds a `get_node_data`
  response for a section whose tree elements include a component_svg with a file
  on disk — the frozen store's tree gates read `test`/`dd` nodes, which have
  none. The affected value was `[]` before and `''` now for every node in the
  store, and neither renders.
