# Area maintenance — group filter persistence

**Date:** 2026-06-18
**Area:** `core/area_maintenance`
**Status:** Design approved, pending implementation plan

## Summary

Persist the user's last-selected group chip (`maintenance_chip`) in the maintenance
area so it is restored on the next visit or page reload. Selection currently lives only
in a transient closure variable (`active_category`) and resets to "All" on every load.

Only the group selection persists. The search term and all other state are unchanged.

## Goal

- Selecting a non-"All" group chip is remembered across reloads.
- On load the remembered group is re-applied (chip highlighted, cards filtered).
- Behavior degrades silently to today's behavior if persistence is unavailable.

## Non-goals (YAGNI)

- Persisting the search-box text.
- Persisting widget collapse state (already handled separately at
  `render_area_maintenance.js:386`).
- Any server-side storage or user-profile sync. This is local to the browser.

## Mechanism

Reuse Dedalo's established local-persistence convention — IndexedDB via `data_manager`
— already imported and used in this same file for widget collapse tracking.

- API: `data_manager.get_local_db_data(id, table, use_cache)`,
  `data_manager.set_local_db_data(data, table)`,
  `data_manager.delete_local_db_data(id, table)`.
- Table: `'status'` (same table as the widget-collapse tracking).
- Key: `'maintenance_active_category_' + (self.tipo || 'area_maintenance')`
  — stable and namespaced to the area instance.
- Stored value shape: `{ id: <key>, value: <category_string> }`, matching the
  existing `{ id, value }` convention.

### Return-value contract (already implemented by `data_manager`)

- Record found → `{ id, value }`.
- No record → `undefined`.
- IndexedDB blocked/unavailable → `false` (a `console.warn` is emitted by the API).

## Scope of changes

All changes are confined to `core/area_maintenance/js/render_area_maintenance.js`,
inside `get_content_data(self)`. No new files, no server changes, no new dependencies.

### 1. Storage key

Compute once near the existing filter-state declarations (`render_area_maintenance.js:124`):

```js
const persist_key = 'maintenance_active_category_' + (self.tipo || 'area_maintenance')
```

### 2. Persist on select (`make_chip` click handler, ~line 169)

After the existing `active_category = key`, class toggle, and `apply_filters()`:

- if `key === ''` (the "All" default) → `delete_local_db_data(persist_key, 'status')`
  (do not store the default — mirrors `ui.collapse_toggle_track`'s delete-on-default
  behavior so a default selection leaves no record).
- else → `set_local_db_data({ id: persist_key, value: key }, 'status')`.

The call is fire-and-forget and guarded (`try/catch` or `.catch`) so a `false` return
or a throw from a blocked IndexedDB never interrupts chip selection.

### 3. Restore on load (after the chip/group build loop, ~line 262)

A guarded async restore step (`get_content_data` returns `content_data` synchronously;
the restore runs after build and all closures — `chips`, `active_category`,
`apply_filters` — remain in scope):

1. `const saved = await get_local_db_data(persist_key, 'status', true)`.
2. Bail if `saved` is falsy/`undefined` or `saved.value === ''` — this single guard
   also covers the IndexedDB-unavailable case (returns `false`), leaving "All" active.
3. **Stale-value guard:** locate the chip whose `dataset.category === saved.value`.
   If none exists (that category no longer has any widgets), ignore the saved value and
   stay on "All".
4. If valid: set `active_category = saved.value`, toggle `.active` onto the matching
   chip (and off the "All" chip), then call `apply_filters()`.

## Error handling

Every persistence call is guarded and degrades silently. Chip filtering works
identically whether or not IndexedDB is available, because `data_manager` returns
`false` (never throws) when storage is blocked.

## Edge cases

| Case | Behavior |
|------|----------|
| No saved record (first visit) | Default "All" active. |
| Saved value is `''` | Treated as default; "All" active. |
| Saved category no longer rendered | Ignored; falls back to "All". |
| IndexedDB blocked | `get` returns `false`, restore bails; `set`/`delete` no-op. |
| User selects "All" | Existing record deleted (no stored default). |

## Testing

Manual verification via the project's client test setup (serve via NGINX, bypass login
with cookie injection — see `run-client-test-suite` memory):

1. Select a non-"All" group → reload → that chip is active and cards are filtered to it.
2. Select "All" → reload → defaults to "All"; confirm no `'status'` record for the key.
3. Simulate a stale saved category (value not among rendered chips) → reload → "All".
4. (Optional) Confirm graceful behavior when IndexedDB is unavailable — selection and
   filtering still work, no errors.
