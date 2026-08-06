# WC-2026-08-06-external-client-render — external values render as TEXT, and the `entries_kind` field that says when they may not

- **Date:** 2026-08-06 (client half of WC-2026-08-05-external-source-status and
  WC-2026-08-05-external-entry-normalisation).
- **Decision:** — (DEC-12 gates: `test/unit/external_client_render_tripwire.test.ts`,
  behaviour in `client/dedalo/test/client/js/test_component_external.js`).

## 1. The rendering divergence (client contract)

### Shape before

All four `component_external` views injected the remote value as **parsed
HTML** — `view_default_edit` and `view_text_list` through
`ui.create_dom_element({inner_html})`, `view_mini_list` through
`insertAdjacentHTML`, `view_default_list` through `build_wrapper_list`'s
`value_string` option (which is `inner_html` one level down). The contract was
stated in the source, at `view_default_edit_component_external.js`:

> the server-side fields_map transformation may produce structured markup …
> The server is responsible for sanitising the value before delivery.

**The server did none.** PHP's `component_external` mapped remote fields
straight onto the wire. So the delegation named a step that did not exist, and
every value a catalogued third-party service returned — every title, author
list and physical description — was executed as markup in a curator's
authenticated session. The attacker set is "whoever operates a catalogued
service, plus anyone who can edit a record in it": for `zenon1` that is an
external institution's catalogue.

### Shape after

Entries render with `textContent`. The delegation is now REAL and NARROW:

```json
"entries":      ["Meyer, P.", "<i>Ostraka</i>"],
"entries_kind": ["text", "markup"]
```

- `entries_kind` is **parallel to `entries`** and OPTIONAL. Absent means "all
  text", which is every live read today: no registered adapter formats markup
  (`src/external/services/zenon.ts` returns `kind:'text'` from every format), so
  the field never appears and the emission stays byte-identical to what it was
  before the key existed.
- `'markup'` is emitted only for a value `src/external/fields_map.ts`
  `sanitizeMarkup` produced: a re-emitter, not a stripper, allowing bare `<b>`,
  `<i>`, `<em>`, `<strong>`, `<sub>`, `<sup>`, `<br>`, `<p>`, `<ul>`, `<ol>`,
  `<li>` with **no attributes at all** — so there is no `href`/`src`/`style`/
  `on*` surface left to reason about.
- The client fails CLOSED: anything that is not exactly the string `'markup'`
  is text. The field can only ever WIDEN rendering.

**This is an intentional behaviour change against a documented contract.** A
value that carried structured markup and was never declared as such now renders
as the characters it contains. That is the correct answer: the markup was never
vetted, and a curator seeing `<i>` in a title learns something true about the
remote record. The path to rendering it is to declare a `format` that returns
`kind:'markup'`, which routes it through the sanitizer.

## 2. The degradation marker (client contract)

`WC-2026-08-05-external-source-status` put `source_status` on the wire. Nothing
rendered it — which left the server's no-silent-blanks posture dying at the last
inch, since a view that draws `entries: []` and drops the status shows exactly
the empty box the field exists to abolish.

All four views and the search renderer now append

```html
<span class="external_source_status state_stale" title="zenon · 05/08/2026 10:14">…</span>
```

with the text taken from `get_label[source_status.label_key]` (the server emits
a catalog KEY, never prose — it does not know the reader's application language)
and a `title` carrying the service, the fetch time when stale, and the drop
counters. `component_external.less` gives every state of the closed set its own
look, and `stale` differs from `unavailable` in **border style as well as
colour** — "data shown, possibly out of date" versus "no data at all" is the
distinction a cataloguer acts on, and it has to survive monochrome and
colour-blindness.

## 3. Two client defects fixed alongside

- `render_search_component_external.js` read `data.entries[0]` unguarded.
  `entries` is absent on a freshly added filter and on any degraded component,
  and the TypeError took the whole search inspector's render down: one dead
  remote service made the search bar unusable.
- `component_portal.js` `edit_record_handler` read
  `engine_request_config.api_config.ui_base_url` unguarded. Since
  WC-2026-08-05-external-api-config-publication a REFUSED binding is dropped
  from the published config, so the read would throw inside a click handler; it
  now warns and returns. The concatenation itself is unchanged and still
  correct — the value it receives is scheme-validated, credential-stripped and
  host-allowlisted by `publishApiConfig`, and the comment at the site says so.

## Reason

A client that parses third-party strings is a stored-XSS sink no server-side
posture can compensate for, and a client that hides a degraded source undoes
the server's entire degradation design. Both were prose contracts pointing at
each other; this entry makes one of them true and mechanical, and deletes the
other.

## Gate reconciliation

`external_client_render_tripwire` (comment-stripped, credless) asserts: zero
HTML sinks in every module of the component except the ONE conditional branch
in `external_render.js`; the branch's exact `=== 'markup'` test; no view
re-joining entries into a string; every view AND the search renderer appending
the marker; the guarded entries read; totality of the `.state_*` rules against
the state set imported from `value.ts`; no two states rendering identically;
`stale` ≠ `unavailable` in border style; and exactly one client consumer of
`ui_base_url`, guarded, with the vetting named. Behaviour — a `<script>` entry
rendering as characters, a declared-markup entry rendering as an element, and a
marker per state — is in the browser gate
`client/dedalo/test/client/js/test_component_external.js` (`bun run test:client`).

`external_fields_map_native` covers `normalizeEntries` carrying the kind through
both emission ceilings (index alignment survives a refusal AND a cut) and the
presence rule — emitted only when some entry is markup, absent otherwise.
`external_emit_native` pins the LIVE path: no emission this installation can
currently produce carries `entries_kind` at all.

**No parity fixture is affected**: no fixture in the frozen oracle-harvest store
holds a data item for any `component_external` tipo, and `entries_kind` is
absent from every emission the installation can currently produce.
**Re-harvest: NO — impossible by definition.**
