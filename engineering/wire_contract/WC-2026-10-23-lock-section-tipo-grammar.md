# WC-2026-10-23-lock-section-tipo-grammar — lock handlers refuse a section_tipo that is not a tipo

- **Date:** 2026-10-23 (census lane closure; follows `WC-2026-10-23-own-lock-cleanup-ungated`,
  which made `delete_user_section_locks` the one lock action with no section read gate).
- **Decision:** DEC-12 (gated: `test/unit/lock_section_tipo_grammar_native.test.ts`).
- **Shape before (TS):** `dd_utils_api::update_lock_components_state` and `::get_lock_status`
  checked `options.section_tipo` for TRUTHINESS only. A present non-tipo value (an array, an
  object, a number, a boolean, a free or upper-case string) passed: for the gated actions it
  reached `getPermissions`, for the ungated `delete_user_section_locks` it was bound straight into
  `DELETE … WHERE section_tipo = $1`. Answers ranged from `200` (a string matching no row) to an
  untyped failure (`500 internal.unexpected` for a number/boolean bind).
- **Shape after (TS):** one validation runs before any branch, for every action of both handlers:
  absent / `null` / `''` → `400 request.invalid_options` (unchanged); present but not a string in
  the tipo grammar (`isValidTipo`: `^[a-z]+[0-9]+$`, 2–64 chars) → `400 request.invalid_tipo`,
  coordinates `{ where: '<action>.section_tipo' }`. Nothing is read, acquired or deleted. A valid
  tipo answers exactly as before.
- **Reason:** an ungated door must at least bind a value of the shape its statement expects; the
  client only ever sends a section tipo string here, so no real caller is affected.
- **Gate reconciliation:** TS-only (no oracle interaction posts a malformed `section_tipo`; no
  re-harvest). `security_fail_closed` L4 and `lock_cleanup_read_gate_native` unchanged and green.
