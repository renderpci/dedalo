# Unify area_maintenance widget data loading

**Date:** 2026-06-15
**Status:** Approved design — ready for implementation plan
**Scope:** `core/area_maintenance/widgets/*` and their host `core/area_maintenance/js/render_area_maintenance.js`, plus `core/widgets/widget_common/js/widget_common.js`.

## Problem

The maintenance dashboard renders ~29 widgets. The host `render_widget()`
(`core/area_maintenance/js/render_area_maintenance.js`) runs
`widget.build(autoload)` → `widget.render()` on **initial dashboard render for
every widget**, even though every widget body starts collapsed
(`widget_body hide`, `collapse_toggle_track` with `default_state:'closed'`).

The collapse toggle persists open/closed state in the local DB (`status` table,
key `collapsed_<id>`) but does **not** gate data loading. As a result each widget
invents its own loading strategy:

- **Eager-on-render** — fetch `get_value()` immediately while collapsed:
  `make_backup`, `check_config`, `build_database_version`, `update_ontology`,
  `update_code`, `counters_status`, `database_info`, `dataframe_control`,
  `add_hierarchy`, `export_hierarchy`, `update_data_version`.
  This is the source of server overload: opening the dashboard fires many
  expensive `get_widget_value` API calls at once for widgets nobody has opened.
- **Viewport-triggered** — `when_in_viewport()`: `php_info`,
  `dedalo_api_test_environment`, `sqo_test_environment`.
- **setTimeout background** — `system_info` (`setTimeout(load_data, 1500)`,
  an intentional background status check).
- **Static / inline value** — server provides `item.value`; no client fetch:
  `move_tld`, `move_locator`, `move_to_portal`, `move_to_table`, `move_lang`,
  `environment`, `lock_components`, `php_user`, `publication_api`,
  `sequences_status`, `unit_test`. These already comply.
- **User-triggered** — `register_tools` fetches on form submit only.

## Goal

One rule, enforced in one place:

> A widget fetches its server value only when it is **open** (expanded). While
> collapsed it issues no request — except for an explicit, named set of
> background-status widgets.

This reduces server load on dashboard open and makes every widget load its data
"the same way and criteria".

## Non-goals

- No change to the server-side `dd_area_maintenance_api / get_widget_value`
  contract or to `class.area_maintenance.php` widget value computation. (The
  server already inlines only cheap static values; expensive values are
  client-fetched.) The single optional server touch is declaring the two
  background widgets — see "Load policy".
- No redesign of widget visuals, categories, search/filter, or the
  collapse/expand toggle itself.
- `register_tools` on-submit behaviour is unchanged (that is an action, not
  value display).
- Static widgets (inline `item.value`) are untouched.

## Design

### Load policy (`load_mode`)

Each widget resolves to one of three modes. The host derives the mode; the server
may override it for the background case.

- **`static`** — `item.value` is present inline. Render immediately from that
  value, never fetch. (move_*, environment, lock_components, php_user,
  publication_api, sequences_status, unit_test.)
- **`lazy`** — *default* for any widget without inline value. Fetch **only on
  open**. (All current eager-on-render and viewport-triggered widgets.)
- **`background`** — `system_info` and `update_data_version` **only**. Fetch at
  low priority even while collapsed, to compute the status indicator; the fetched
  value is **cached and reused** when the widget is opened (no second request).

Resolution rule in the host:

1. If the widget is declared background (see below) → `background`.
2. Else if `item.value` is present → `static`.
3. Else → `lazy`.

The background set is declared explicitly so it is data-driven, not hardcoded in
control flow. Preferred: a server-side flag on the widget item in
`class.area_maintenance.php::get_ar_widgets()` (e.g. `$item->background = true`
for `system_info` and `update_data_version`), surfaced as `item.background`. If a
server change is undesirable during implementation, the fallback is a small
constant array of widget ids in `render_area_maintenance.js`. Either way the list
lives in exactly one place.

### Mechanism

**Host (`render_area_maintenance.js::render_widget`):**

- Stop calling `build(autoload=true)`. Always build shell-only (no fetch) so the
  collapsed shell renders instantly.
- After `render()`, wire the existing collapse hooks:
  - `expose_callback` → `await widget.load()` (in addition to the current
    `label.classList.add('up')`).
  - `collapse_callback` → unchanged (no fetch).
- Because `collapse_toggle_track` invokes `expose_callback` on init for a
  widget whose persisted state is open, a widget the user left open auto-loads
  on reload — identical to a manual open. (Confirmed by the design decision:
  load on open, including restored-open state.)
- For `load_mode === 'background'`, additionally schedule `widget.load()` at low
  priority after render (idle callback / timeout), regardless of collapse state.
  Since `load()` is guarded, a later open reuses the cached value.

**`widget_common.prototype.load()` (new, shared by all widgets):**

```
load():
  if _load_state is 'loading' or 'loaded': return        // guard: fetch once
  if no get_value on this instance: return               // static/no-op widgets
  _load_state = 'loading'
  show spinner in body content
  self.value = await self.get_value()
  _load_state = 'loaded'
  // repaint: re-render content and swap it into the wrapper
  const new_content = await self.render({ render_level: 'content' })
  self.node.content_data.replaceWith(new_content)
  self.node.content_data = new_content
```

- Uses the existing shared `area_maintenance.prototype.get_value()` (the unified
  `get_widget_value` API call) — already assigned on every fetching widget.
- Uses the `render_level:'content'` contract, which **all** `render_<name>.js`
  files already support (verified), so the repaint path is uniform.
- The `content_data` pointer is already set on the wrapper by
  `ui.widget.build_wrapper_edit()`.
- Guard prevents duplicate fetches across expose + background + manual re-open.

**Per-widget migration:** remove each widget's ad-hoc trigger and rely on the
unified `load()`:

- Eager widgets: delete the custom `build()` that calls `get_value()` (or the
  `autoload` fetch branch); let `build()` be shell-only. Their `render()` must
  tolerate an unloaded `self.value` for the initial (hidden) shell — most already
  read `self.value || {}`; add a lightweight placeholder where needed.
- Viewport widgets (`php_info`, `dedalo_api_test_environment`,
  `sqo_test_environment`): replace `when_in_viewport()` with the unified
  load-on-open. Open is stricter than viewport and further cuts load.
- `system_info`: remove the bespoke `setTimeout(load_data, 1500)`; it becomes a
  `background` widget loaded by the host's low-priority schedule. Its status
  indicator (label color via `set_widget_label_style`) is computed from the
  loaded value as today.
- `update_data_version`: drop the `autoload` fetch in its custom `build()`;
  becomes a `background` widget. Keep its `update_code_done` subscription that
  refreshes after a code update.
- `register_tools`: unchanged (on-submit fetch).
- Static widgets: unchanged.

### Data flow (lazy widget, typical)

1. Dashboard `get_data` returns widget list; expensive widgets have no inline
   value.
2. Host builds shell + collapsed (hidden) body; **no** `get_value` call.
3. User clicks the label → `expose_callback` → `widget.load()` → one
   `get_widget_value` request → repaint body content.
4. Collapse → no request. Re-open → `load()` guard short-circuits (value cached).

### Background widget flow

1. Host renders shell collapsed, then schedules low-priority `widget.load()`.
2. `load()` fetches once, caches value, computes status indicator.
3. User opens later → `load()` guard short-circuits; cached content shown
   instantly, no second request.

## Error handling

- `load()` wraps the fetch; on error it stores `self.error`, logs to console,
  resets `_load_state` so a manual re-open can retry, and leaves the existing
  body content/placeholder in place (no crash, consistent with current
  per-widget try/catch).
- A widget without `get_value` assigned (static) makes `load()` a no-op, so the
  host can wire `expose_callback → load()` uniformly without special-casing.

## Testing

These are client JS UI modules. Per project note, serve via NGINX (not
`php -S`) and bypass login with cookie injection.

Manual / browser verification (DevTools network panel, filter `get_widget_value`):

1. **Cold dashboard load:** zero `get_widget_value` requests while all widgets
   collapsed — **except** exactly the two background widgets, which each issue
   one low-priority request.
2. **Open a lazy widget:** exactly one `get_widget_value` request; content
   repaints; spinner shown during fetch.
3. **Collapse then re-open** the same widget: no new request.
4. **Open a background widget** that already loaded in the background: no new
   request; cached content shown.
5. **Reload with a widget left open:** that widget auto-loads (one request);
   others stay silent.
6. **Static widgets:** render instantly, never issue a request.

Regression: existing server-side area_maintenance API tests
(`test/server/api/dd_area_maintenance_api_Test.php`) must still pass — the
server contract is unchanged.

## Risks / open points

- Each eager widget's `render()` must render cleanly with `self.value`
  unloaded for the initial shell. Audit each during implementation; add a
  minimal placeholder where a render currently assumes a populated value.
- `update_data_version` references `event_manager` without an import in its
  current `init()`; if that is a latent bug it surfaces during this work — fix
  the import as part of the migration (low risk, in-scope cleanup).
- Background scheduling must stay genuinely low-priority (idle callback /
  timeout) so the two background fetches never compete with first paint.
