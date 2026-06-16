# Unify `button_spinner` behavior across area_maintenance buttons

**Date:** 2026-06-16
**Status:** Approved (design)

## Problem

In `core/area_maintenance/widgets/`, buttons that trigger a server process the
user waits on each invented their own "please wait" treatment. Only
`build_database_version` uses the canonical `button_spinner` class; others use
ad-hoc `lock` / `loading` classes on the button, a parent, or `body`.

`button_spinner` (defined in `core/page/css/layout/buttons.less`, compiled to
`core/page/css/main.css:4580`) is the intended unified pattern: it sets
`pointer-events:none` on the button (locking it) and renders an animated spinner
via a `::before` pseudo-element.

Inconsistency today:

| Widget | Current waiting treatment |
|---|---|
| `build_database_version` | `button.classList.add/remove('button_spinner')` ✅ |
| `media_control` (apply / rebuild) | `parent.classList.add('lock')` |
| `make_backup` (submit) | `target_lock.classList.add('lock')` |
| `update_code` (update) | `e.target.classList.add('lock')` + `body.classList.add('loading')` |
| `update_ontology` (update) | `e.target.classList.add('lock')` |
| `database_info` | varies per action |
| `dataframe_control` | varies per action |
| `counters_status` | varies per action |

Secondary bug: `build_database_version` does `add('button_spinner')` → `await` →
`remove('button_spinner')` with **no `try/finally`**, so a thrown API call leaves
the button stuck spinning forever.

## Goal

Every area_maintenance **action button** (button → `await` a process → show the
result; the user waits on a single promise) uses the same `button_spinner`
behavior, applied through one shared, error-safe helper.

## Approach (approved)

- **Shared helper**, not inline repetition.
- **Action buttons only.** Background-process-with-polling buttons and
  full-panel refresh/`lock` overlays are out of scope.
- **Button-only spinner.** Widgets that currently lock the whole panel switch to
  spinning just the button; the full-panel `lock` overlays are dropped.

## Design

### 1. Shared helper — `core/common/js/ui.js`

Add a `run_with_spinner` method to the exported `ui` object:

```js
/**
* RUN_WITH_SPINNER
* Runs an async process while showing the canonical button spinner.
* Adds 'button_spinner' (locks the button via pointer-events:none and renders an
* animated spinner) before the call and removes it in finally{}, so the button is
* never left stuck spinning if the process throws.
* @param {HTMLButtonElement} button
* @param {Function} fn - async function performing the process; its result is returned
* @return {Promise<*>} the resolved value of fn()
*/
run_with_spinner : async (button, fn) => {
    button.classList.add('button_spinner')
    try {
        return await fn()
    } finally {
        button.classList.remove('button_spinner')
    }
},
```

Contract:
- **What it does:** wraps an async process with the spinner add/remove lifecycle,
  guaranteeing removal via `finally`.
- **How to use:** `const r = await ui.run_with_spinner(btn, () => self.do_thing())`.
- **Depends on:** the `button_spinner` CSS class only. No new dependencies.

### 2. Convert each in-scope action button

Replace the ad-hoc lock/loading add+remove around the awaited call with a single
`ui.run_with_spinner` call on the triggering button. Example:

```js
// before
button_process.classList.add('button_spinner')
const api_response = await self.build_install_version()
button_process.classList.remove('button_spinner')

// after
const api_response = await ui.run_with_spinner(
    button_process,
    () => self.build_install_version()
)
```

In-scope sites (the implementation plan enumerates exact line edits):

- `build_database_version` — build, recovery, restore (3 buttons; also removes the
  missing-`finally` bug)
- `media_control` — set_media_access_mode (apply), rebuild_media_index (rebuild);
  drop the `parent` `lock`
- `make_backup` — make_backup (submit); replace `target_lock` `lock`
- `update_code` — update_code; drop the `e.target` `lock` and `body` `loading`
- `update_ontology` — update_ontology; replace the `e.target` `lock`
- `database_info` — rebuild_db_indexes, optimize_tables, consolidate_tables,
  rebuild_user_stats
- `dataframe_control` — run_check, run_fix
- `counters_status` — modify_counter (two call sites)

For each site, the spinner target is the **button the user clicked** (the same
element whose handler triggers the process), matching the sample.

### 3. Out of scope

- Background-process-with-polling buttons (`unit_test` long process;
  `build_database_version`'s commented-out background path). Completion there is
  not a single awaited promise — the spinner lifecycle is driven by status
  polling, a separate concern.
- `refresh` read buttons and full-panel `content_data.classList.add('lock')`
  overlays.

## Behavior change to note

`media_control` and `update_code` currently lock their entire panel during the
process. After this change only the clicked button is locked
(`pointer-events:none`) and spins; other controls in those panels remain
interactive. This is the intended unified behavior (approved).

## Error handling

The helper's `finally` guarantees the spinner is removed whether the process
resolves or throws — fixing the existing stuck-spinner bug and applying the same
guarantee everywhere. Existing per-site result/error rendering (e.g. writing the
API response into `process_response`) is preserved unchanged; only the
spinner add/remove bookkeeping moves into the helper.

## Testing

- Manual: trigger each converted button; confirm the button spins and is
  non-interactive during the process and returns to normal on completion.
- Error path: force/observe a failing process and confirm the spinner clears
  (no stuck button).
- Client test suite per project convention (serve via NGINX, cookie-injected
  login) if any widget render has coverage.
