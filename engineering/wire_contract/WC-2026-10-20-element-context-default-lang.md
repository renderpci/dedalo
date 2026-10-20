# WC-2026-10-20-element-context-default-lang — get_element_context's omitted lang is the request data lang

- **Date:** 2026-10-20 (tool_hierarchy "Name" read in Spanish under an English session).
- **Decision:** none (PHP parity restored; closes the coverage-plan §4.4 D9 known-open).
- **Shape before (PHP):** `dd_core_api::get_element_context` — `$lang = $source->lang ?? DEDALO_DATA_LANG`,
  the session's data lang.
- **Shape before (TS, until now):** `source.lang ?? 'lg-spa'` — an install literal. A request
  without `source.lang` got a context whose `lang` was `lg-spa` for every translatable element,
  whatever the user's data lang.
- **Shape after (TS):** `source.lang ?? currentDataLang()` — the request data lang
  (session override, else `config.menu.dataLang`). An explicit `source.lang` still wins.
  Response shape unchanged; only the `lang` value of a defaulted entry moves.
- **Reason:** the client's `get_instance` (`client/dedalo/core/common/js/instances.js`) builds a
  model-less component by calling this action WITHOUT `lang` and then adopts `context.lang` as the
  instance lang. With the literal, every translatable component instantiated by tipo alone
  (e.g. the `tool_hierarchy` form fields: `hierarchy5` Name) read and wrote the `lg-spa` slice.
- **Gate reconciliation:** `test/unit/get_element_context_native.test.ts` ("source.lang defaults to
  the request data lang…") pins all three lanes: install default, session override, explicit lang.
  No parity gate replays a lang-less `get_element_context` from the fixture store; no re-harvest.
