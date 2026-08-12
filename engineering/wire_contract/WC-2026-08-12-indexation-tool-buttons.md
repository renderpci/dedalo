# WC-2026-08-12-indexation-tool-buttons — the indexation grid's tool buttons emit a SERVABLE tool_common path, and carry the clicked tag through `caller_options`

- **Date:** 2026-08-12.
- **Surface:** `src/core/section/indexation_grid.ts` — the `av` format_columns
  branch of `textAreaIndexationCell` (the `tag_id`, `button_indexation` and
  `button_transcription` action descriptors).
- **Gate:** `test/unit/indexation_grid_av_native.test.ts` +
  `test/unit/fixtures/indexation_grid_native/av_grid.golden.json` — the golden
  is EDITED here (deliberate contract edit; a re-harvest is impossible, the
  WC-001 pattern).

## Divergence 1 — `module_path` moves from the tools tree to core

PHP emitted `../../../tools/tool_common/js/tool_common.js`, which the PHP
engine served from its own `tools/tool_common/` package directory. The TS
engine does **not** have that package: `tool_common` is CORE
(`src/core/tools/client/`) and is served at `/dedalo/core/tools_common/`;
`src/core/tools/serving.ts` excludes it from `/dedalo/tools/` by name.

The client resolves this path with a bare `import()` relative to
`client/dedalo/core/dd_grid/js/`, so the PHP form resolved to
`/dedalo/tools/tool_common/js/tool_common.js` — a **404 on every install**.
All three tool buttons (open indexation at a tag, open indexation, open
transcription) therefore did nothing when clicked, silently: the listener is
`async`, so the import rejection surfaced only as an unhandled rejection.

Emitted now: `../../../core/tools_common/js/tool_common.js` — the path every
other client importer of tool_common already uses, and the one the client's own
`get_button_column` doc-block documented throughout.

This is a divergence the frozen oracle can never agree with: the PHP value is
unservable by definition in an engine where tool_common is core. There is no
expand/contract window and nothing to reconcile later.

## Divergence 2 — `button_transcription` gains `caller_options.tag_id`

PHP carried the clicked fragment's `tag_id` INSIDE the transcription button's
`caller` object. That value never reached the tool: `tool_common.js`
`view_window` serialises the caller into a **fixed-key `caller_ddo`**
(`id_variant, tipo, section_tipo, section_id, section_id_selected, mode, model,
lang, label`) before compressing it into the new window's URL, and `tag_id` is
not one of those keys — it was dropped at the door.

`caller_options` is the channel designed for exactly this (arbitrary,
tool-specific extra data; serialised verbatim into the same payload and
surfaced as `self.caller_options`), and the `tag_id` button already used it.
The transcription button now sends it too:

```
options.caller_options = { tag_id: <tagId> }
```

`caller.tag_id` is **kept unchanged** — the caller shape is not touched, so the
addition is purely additive. Widening the client's `caller_ddo` whitelist was
the alternative and was rejected: that whitelist feeds `get_instance()` to
rebuild a live caller, and it should describe a record address, not carry
per-click payload.

## Client half (same change, not gated by parity)

- `component_text_area.prototype.select_tag(tag_id)`
  (`client/dedalo/core/component_text_area/js/component_text_area.js`) —
  resolves the tag's full attribute set from the CKEditor view
  (`get_view_tag_attributes`, type `indexIn`) and republishes the ordinary
  `click_tag_index_<id_base>` event, so selection, scroll and every subscribed
  tool panel behave exactly as on a user click. Self-defers on
  `editor_ready_<id>` (the editor is never ready when a tool has just
  rendered).
- `tool_indexation` / `tool_transcription` render-edit tails consume
  `self.caller_options.tag_id` through that method.
- `get_button_column` (`client/dedalo/core/dd_grid/js/view_indexation_dd_grid.js`)
  now guards the whole dynamic-import dispatch: an unservable `module_path` or
  a module without the named export marks the button `.error` with the reason
  in its title instead of failing invisibly. `module.default[...]` also became
  optional-chained — it threw a `TypeError` for any module with no default
  export, before the fallback chain could be evaluated.
- `tool_common.js` `view_modal` forwarded `caller_options` into neither the
  instance options nor `self`, so the channel worked ONLY on the window path.
  Both tools here register `open_as: 'window'`, so nothing was broken in
  practice — but a modal-configured install would have lost the tag silently.
  `view_modal` now passes it through and `tool_common.prototype.init` seeds
  `self.caller_options` on the direct path too.
- `validate_mode` (`client/dedalo/core/section/js/section.js`) accepts
  `indexation_list`. It is a real engine mode — `indexation_grid.ts` both emits
  it on the caller descriptor and keys media-quality behaviour off it — but the
  client's whitelist did not list it, so rebuilding the caller section in the
  tool window logged an "Invalid mode" error on every open, and in dev mode
  (`SHOW_DEBUG`) raised a BLOCKING `alert()` that froze the tool window.

## Verified

Live, against the real `aa1`/208 term (2026-08-12, chrome + a minted session):
all four action buttons dispatch with no page errors and open their correct
target — `tool_indexation`, `tool_transcription`, and the AV viewer at
`tc_in=90.071`. Opening from the tag button lands `tool_indexation` on tag 2
with the fragment selected in the editor and the tag panel populated.
