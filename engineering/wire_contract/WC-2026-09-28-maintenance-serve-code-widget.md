# WC-2026-09-28-maintenance-serve-code-widget — `serve_code` split out of `update_code` (TS-only widget; the build action changes model)

- **Date:** 2026-09-28. Pairs with WC-2026-09-28-maintenance-serve-ontology-widget.
- **Shape before (TS):**
  - `update_code` `get_widget_value` answered `{ servers, is_a_code_server,
    consumer, code_server }` (`code_server` null off a code server).
  - `update_code.apiActions`: `update_code`, `restore_code`,
    `delete_restore_point`, `build_version_from_git_master`.
- **Shape after (TS):**
  - `update_code` panel: `code_server` is GONE; `servers`, `is_a_code_server`
    (a self-report, still asserted by `scripts/update_drill.ts`) and `consumer`
    unchanged. `apiActions`: `update_code`, `restore_code`,
    `delete_restore_point`.
  - new widget `id: 'serve_code'`, category `config`, label key `serve_code`,
    served right after `update_code` ONLY where it can act —
    `config.update.isCodeServer` or entity `development` (`servesCode()`,
    the error_reports conditional-catalog pattern). Elsewhere it is neither in
    the catalog nor reachable through `widget_request`.
    - panel: `{ is_a_code_server, code_server }` — `code_server` is the former
      half verbatim (codeServerStatus + the advertised-URL self-probe), null
      off a code server with no git spawn or directory walk.
    - `apiActions.build_version_from_git_master` — same handler, same option
      shape, ownership-gated under the NEW key
      `serve_code.build_version_from_git_master`.
  - **Wire change for callers:** (before → after) `widget_request` with
    `source.model: 'update_code', action: 'build_version_from_git_master'`
    now refuses (`tool.method_not_allowed`); the caller sends
    `model: 'serve_code'`. In-repo callers updated: the client builder,
    `scripts/update_drill.ts`.
- **Reason:** consumer (take a release, swap, restart) and provider (build from
  git, serve) are different roles; a code server found its primary concern under
  an update it never runs, and the development entity — which refuses to update
  itself — opened on the refused half.
- **Gate reconciliation:**
  - `test/parity/widgets_differential.test.ts` — `serve_code` joins
    `TS_ONLY_WIDGET_IDS`; `dedalo_files_differential` — its client tree joins
    `isTsOnlyEntry`.
  - `update_ownership_tripwire` — EXPECTED_GATED key renamed.
  - TS ground truth: `test/unit/serve_code_widget_native.test.ts` (build option
    mapping, moved; registration, gate key, catalog condition, null half),
    `test/unit/client_serve_code_render.test.ts` (build UI tests, moved; model
    `serve_code`, shared row helpers), `update_code_widget_native` +
    `client_update_code_render` pin the consumer-only panel.
- **Labels:** code-server-only `update_code_*` keys renamed `serve_code_*`
  (translations carried); `update_code_role_server_note` → `serve_code_note`;
  `update_code_role_consumer(_note)` / `update_code_role_server` removed with the
  role blocks. Keys the consumer readout also uses stay `update_code_*`, and so
  does every CHECK-ID-derived key (`update_code_check_<id>` / `update_code_note_<id>`,
  resolved at runtime by the shared `check_row`) — e.g.
  `update_code_note_release_ref_current`.
- **Fixture interaction (DEC-14b):** NO re-harvest; the frozen PHP fixtures
  never contained this id nor `code_server`.
