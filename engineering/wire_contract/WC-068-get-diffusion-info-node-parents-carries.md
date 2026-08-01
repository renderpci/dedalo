# WC-068 — `get_diffusion_info` node `parents[]` carries `label` (+ `type`) (2026-07-29)

- **Date:** 2026-07-29 (same-day sibling of WC-065: the accordion panel HEADER
  rendered empty).
- **Decision:** emit the oracle's full path item instead of a two-key stub.
- **Shape before (TS):** `src/diffusion/api/info.ts` mapped the path to
  `{tipo, model}` only. The client's panel header text IS
  `diffusion_element_parent.label` (`render_tool_diffusion.js:493`) and its
  group key IS `diffusion_group_parent.label` (`:462`), so both were
  `undefined`. `ui.create_dom_element` guards its text setter with
  `else if(options.text_content)` (`ui.js:1863`), so the header silently
  rendered EMPTY rather than the string "undefined" — the blank bar above the
  panel grid. `diffusion_element_parent.type` (`:484`, feeding the `:842`
  per-format switch) was likewise undefined.
- **Shape after (TS):** `{tipo, model, label}` plus `type` **only** on
  `diffusion_element` / `diffusion_element_alias` items — byte-for-byte the
  oracle's path item (`class.diffusion_utils.php:345-352`, emitted verbatim by
  `$item->parents = $vnode->parents` at `:265`). `virtual_tree.ts:482-491`
  already built exactly this, including PHP's `?? 'unknown'` type fallback;
  only the emit dropped it, so no builder change was needed.
- **Deliberate omission:** `VirtualPathItem.realTipo` is NOT emitted. It is a
  TS-only alias-resolution memo (it replaces PHP's on-demand
  `resolve_node_with_alias` call); the oracle never had it on the wire and the
  client has no use for it. Pinned negatively by the gate.
- **Gate reconciliation:** no fixture moves — `get_diffusion_info` has no
  frozen oracle fixture (see WC-065's reconciliation for why the only
  `connection_status` occurrences belong to the `get_diffusion_map` widget
  surface). Held mechanically by `test/unit/diffusion_info_parents.test.ts`:
  the pure `toWirePathItem` mapper's exact key sets for element vs non-element
  items, `realTipo` never present, a null label staying null, and the client
  welding pins on `:493`/`:462`/`:484`.
