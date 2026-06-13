# Dédalo v7 — Full Technical Audit

**Date:** 2026-06-13
**Scope:** Whole repository (1,113 PHP · 696 JS · 260 TS files) across 10 dimensions: bugs, security, performance, architecture, code quality, error handling, usability, dependencies, configuration, testing.
**Method:** 14 subsystem lanes audited in parallel; every finding independently re-read against the cited code by a skeptical verifier before inclusion. 108 findings adjudicated, **107 confirmed, 1 refuted**. Builds on (does not repeat) the prior security cycle `security-audit/SEC-001..105`.

---

## 1. Executive summary

Dédalo v7 is a mature, actively-hardened codebase. The earlier security-only cycle (SEC-001..105) closed the obvious injection/upload/SSRF surface, and that work holds. The issues that remain cluster into **five structural themes**, in priority order:

1. **Persistent-worker state bleed (the dominant risk).** The code was written for request-per-process (PHP-FPM): it freely uses process-global statics and caches and assumes a fresh process per request. The new `worker/` runtime reuses the process, so those assumptions now cause **cross-request and cross-user** defects — including a **critical security-gate bypass** (WORKER-01), header/cookie bleed (WORKER-02), a cross-tenant option-list leak (COMP-01), and an audit-history kill-switch that sticks (REL-01). This theme produced the only Critical finding and several Highs and is the single most important area to address.

2. **Unsanitized client filenames → path traversal (a whole family).** The prior cycle fixed `add_file` (SEC-063) but the same bug pattern survives in six other sinks: `dd_utils_api::upload` / `join_chunked_files_uploaded` and four `tool_import_*` methods. `basename()`/realpath confinement is missing repeatedly.

3. **The Bun/TypeScript layer doesn't mirror PHP's authorization.** Privileged diffusion actions (delete_record, backup_database) gate on *is-logged* only, not admin (DIFFTS-01), and `process_id` is client-controlled (IDOR, DIFFTS-02). The PHP side has the correct `is_global_admin` gates; the TS proxy in front of the same data does not.

4. **XML diffusion is wholly non-functional and fails unsafely.** Publish calls an undefined method (DIFFU-01), delete-propagation for XML is dead code leaving orphaned files (DIFFU-02), and the top-level `catch (Exception)` cannot catch the resulting `Error` (DIFFU-03) — a pattern repeated across the engine.

5. **CI gates exist but are largely no-ops.** PHPUnit runs 4 of 25 suites (security/login/search/tools never run, CONF-02); `php -l` lint always exits 0 (CONF-03); CodeQL omits PHP entirely (CONF-04); PHPStan runs at level 1 over 3 directories (CONF-05). Regressions in exactly the subsystems with the findings above would ship undetected.

**Severity counts:** 1 Critical · 15 High · 26 Medium · 65 Low/Info.

| Dimension | Confirmed |
|---|---:|
| Security | 29 |
| Bugs & correctness | 23 |
| Error handling & resilience | 14 |
| Code quality | 11 |
| Performance & scalability | 9 |
| Testing | 7 |
| Configuration & deployment | 5 |
| Usability & UX | 5 |
| Bottlenecks & architecture | 2 |
| Dependency & supply chain | 2 |

---

## 2. CRITICAL

### WORKER-01 — SSE stream path bypasses `sanitize_client_sqo` / `sanitize_client_ddo_map` security gates
**`worker/class.worker_loop.php:213-237` (`execute_api_for_stream`)** · security

The SQO/ddo_map sanitizers live **only** in `core/api/v1/json/index.php` (lines 182-199); they are **not** inside `dd_manager::manage_request`. The SSE path decodes `$GLOBALS['DEDALO_RAW_BODY']` and calls `new \dd_manager()->manage_request($rqo)` directly, never including `index.php`, so those gates are skipped. `is_stream_request` returns true for **any** action when `rqo->is_stream===true`, and the non-Generator fallback json-encodes the response back to the client — so any action is reachable through this door. The stripped fields include `sentence`, `params`, `column_sql`, `table`, `table_alias` (raw SQL the client should never set) **and** `skip_projects_filter` (the per-user ACL switch). This is a SQL-injection / ACL-bypass primitive reachable by setting one flag on the request.

**Fix:** Extract the gate block (`index.php:178-199`) into a shared `sanitize_client_rqo()` helper and call it from **both** `index.php` and `execute_api_for_stream()` before `manage_request`, so the two entry points cannot drift. This single refactor also closes the architectural root cause (two entry points, one gate).

---

## 3. HIGH (15)

### Path-traversal family (filenames not sanitized before filesystem sinks)

**API-01 — `dd_utils_api::upload` arbitrary write** · `core/api/v1/common/class.dd_utils_api.php` (~740/759/870/883) · security
Client `name` flows unmodified into `$target_path = $tmp_dir.'/'.$name` and `move_uploaded_file()`/PSR-7 `moveTo()`. The extension allowlist reads `pathinfo($name, PATHINFO_EXTENSION)`, so `../../../x/evil.jpg` passes. `sanitize_key_dir` is applied to `key_dir` only, never `name`. With empty `$tipo` the permission gate is skipped, so any authenticated user reaches the sink (constrained to allowed extensions + PHP-writable dirs).
*Fix:* `$name = sanitize_file_name(basename($file_name))` before building the target, in both the `move_uploaded_file` and PSR-7 branches; then realpath-confine the parent under `realpath($tmp_dir)`.

**API-02 — `dd_utils_api::join_chunked_files_uploaded` arbitrary read + delete** · same file `1012-1063` · security
`$chunk_filename` is concatenated raw into `file_get_contents()` (read) and `unlink()` (delete); `$file_data->name` into `file_put_contents()`. This loop runs **before** the SEC-066 extension/content check, so that protection does not apply. Login-only gate, no tipo/section check — *weaker* than API-01, and the unconditional `unlink()` makes it arguably more severe.
*Fix:* `basename()`+`sanitize_file_name()` every entry before any FS use; realpath-confine both paths under `realpath($file_path)`; move validation ahead of the read/unlink loop; consider a section-permission gate.

**TOOLS-01 — `tool_import_dedalo_csv::delete_csv_file`** · `tools/.../class.tool_import_dedalo_csv.php:328-364` · security
`$dir.'/'.$file_name` → `rename()` with no `basename`/realpath and **no permission assert** (list-form `API_ACTIONS` ⇒ no declarative gate).

**TOOLS-02 — `tool_import_dedalo_csv::get_csv_files`** · same file `124-281` · security
User-controlled `files_path` → arbitrary-directory CSV read, full contents returned in the response. No confinement, no assert.

**TOOLS-03 — `tool_import_dedalo_csv::process_uploaded_file`** · same file `1570-1613` · security
Attacker-supplied upload `name` → `rename()` write target outside the import dir; `basename()` is used only in an error string, not on the real target. No assert. (The import dir's deny-all `.htaccess` does not help — traversal escapes it.)

> *Related Medium:* **TOOLS-05** (`tool_import_files::import_files`, `rawurldecode(name)` then concatenated — this one **is** permission-gated, hence Medium).

*Common fix for the family:* one shared helper — reject any name containing a separator, `basename()`, then assert the resolved path `str_starts_with(realpath(base))` — applied at every upload/import sink, plus convert list-form `API_ACTIONS` to map-form so a write permission is required.

### Worker / state-bleed

**WORKER-02 — `header()` output leaks into the next request** · `worker/class.worker_loop.php:190-202` · bugs
`header_remove()` is called only in `response_builder::build()`, which the SSE branch never reaches. Any `header()`/`Set-Cookie` emitted during an SSE action stays in PHP's global header table; the **next** normal request snapshots `headers_list()` and copies it onto a *different user's* response.
*Fix:* call `header_remove()` at the start of every request (e.g. in `handle_request` after `cache->reset()`), not only in `build()`.

**COMP-01 — Datalist cache key omits user/project; cross-user option leak** · `core/component_common/class.component_common.php:2644-2660,2819` · security
The LOV cache `$uid` is `sections_tipo + lang + hash_id` with no `logged_user_id`/project identity, but the underlying SQO **is** project-filtered per requesting user. In the persistent worker, user A's project-filtered option list is cached and served to user B (both over- and under-exposure) for select/check_box/radio/relation pickers.
*Fix:* mix the logged-user id and/or project-filter signature into `$uid` (must be fixed with COMP-03).

**REL-01 — `tm_record::$save_tm` left disabled if a dataframe save throws** · `core/component_common/trait.dataframe_common.php:270-278` (+ `class.component_dataframe.php:209-213`, `trait.dataframe_common.php:525-528`) · error-handling
The static is set `false`, then `set_data()/save()`, then `true` — with **no try/finally**. A throw skips the re-enable, so Time Machine capture stays off process-wide until recycle: silent, request-wide audit-history loss.
*Fix:* `$prev = tm_record::$save_tm; try { … } finally { tm_record::$save_tm = $prev; }` at all three sites.

### Diffusion correctness

**DIFFU-01 — XML publish calls undefined `diffuse_xml()` → uncaught fatal** · `core/api/v1/common/class.dd_diffusion_api.php:166` · bugs
`validate()` accepts `'xml'`, `diffuse()` dispatches to `self::diffuse_xml()`, but only `diffuse_rdf()` exists. XML publishing is wholly non-functional and fatals (and the `catch (Exception)` can't catch the `Error` — see DIFFU-03).
*Fix:* implement `diffuse_xml()` symmetric to `diffuse_rdf()`, or remove `'xml'` from `$known_types` until ready so it fails gracefully.

**DIFFU-02 — Delete propagation never removes published XML (`delete_xml` is dead code)** · `diffusion/class.diffusion_delete.php:139-142,200-226,525-530` · bugs
In the execution switch `'xml'` hits `default: continue 2` and is skipped; `delete_xml()` is never referenced. Deleting a record never unlinks its published XML → orphaned/stale files, unbounded growth, and a data-protection concern.
*Fix:* add a `case 'xml'` mirroring the `rdf` case.

### Bun/TypeScript authorization

**DIFFTS-01 — Admin actions authorize any logged-in user** · `diffusion/api/v1/index.ts:1002-1093` · security
`delete_record`, `check_database`, `backup_database` gate only on `check_server_auth()`, which accepts a plain session cookie (`is_logged===true`) — no profile/admin check. The PHP equivalents gate on `security::is_global_admin()`. The Bun server is exposed via Apache `ProxyPass`, so any low-priv logged-in user can POST these directly and delete rows / dump / enumerate databases.
*Fix:* require admin on the Bun side — either restrict these to the internal-token path only, or verify global-admin from the PHP `get_environment` (`page_globals`) before dispatch.

### Database correctness

**DB-01 — `create()` `ON CONFLICT` hardcodes `matrix_counter`, breaking the `_dd` path** · `core/db/class.matrix_db_manager.php:200-208` · bugs
The CTE INSERTs into `$counter_table` (`matrix_counter_dd` for `_dd` tables) but `DO UPDATE SET value = matrix_counter.value + 1` references the wrong table → `missing FROM-clause entry for table "matrix_counter"` on the **second** record of any `matrix_dd`-backed section. The 23505 counter-fix recursion doesn't catch this error class.
*Fix:* use `$counter_table.value` dynamically; regression-test two consecutive creates so the second exercises `DO UPDATE`.

### Frontend correctness

**UIUX-01 — Remove-confirmation dialog is dead code** · `core/component_common/js/component_common.js:1006-1028` · bugs
`const action = changed_data[0]` compares a **frozen object** to the string `'remove'` — always false — so the entire accidental-delete `confirm()` guard never runs.
*Fix:* `const action = changed_data[0]?.action`.

### Dependency / config

**CONF-01 — `tool_import_rdf` loads EasyRdf from non-existent `lib/vendor`; dep is require-dev** · `tools/tool_import_rdf/class.tool_import_rdf.php:2,60-67` + `composer.json:10` · dependency
Line 2 `require_once …/lib/vendor/autoload.php` — that path doesn't exist (gitignored). And `sweetrdf/easyrdf` is under `require-dev`, so `composer install --no-dev` omits it. RDF import is broken in production two ways over (the `composer.json` SEC-101-followup note admits the second).
*Fix:* point the require at repo-root `vendor/autoload.php`; move `easyrdf` to `require`; add a smoke test.

**CONF-02 — CI runs only 4 of 25 PHPUnit suites** · `.github/workflows/phpunit.yml:64-78` vs `test/server/phpunit.xml` · testing
Only `components, API, contract, diffusion` run. **security, login, search, tools, section_record, ts_object, ontology, media_engine, hierarchy, tm_record** (21 suites) never run on push/PR — regressions in auth, SQO building and tool security gates ship undetected.
*Fix:* run all suites (single `phpunit` or a matrix), prioritizing security/login/search/tools.

---

## 4. MEDIUM (26)

**Worker / caching**
- **COMP-03** — Worker's `cache_manager` registers a **no-op** for `component_common` clearing; the LOV caches the class contract says are cleared are never cleared (`worker/class.cache_manager.php:88-92`). Pairs with COMP-01.
- **DB-02** — `invalidate_connection_cache()` nulls the connection but not `DBi::$prepared_statements`; after reconnect, `exec_search` reuses md5-keyed prepared handles bound to the dead connection (`class.DBi.php:179-182`).

**Path / upload**
- **TOOLS-05** — `tool_import_files::import_files` path traversal via `rawurldecode(name)` (gated, hence Medium).
- **MEDIA-01** — Upload MIME allowlist permits `text/html` / `application/xml` / `image/svg+xml`, served same-origin from the media tree (stored-XSS vector for the generic upload path).
- **MEDIA-02** — `add_file` SEC-063/064/065 hardening has tests that miss the actual attack vectors (only null/`fake_key_dir` cases).

**Search robustness**
- **SEARCH-01** — `component_date` search trait doesn't allowlist `q_operator`; a malformed operator silently empties the whole search.
- **SEARCH-02** — `component_number` search binds `q` without `is_numeric`, causing a cast failure → silent empty results.

**Diffusion**
- **DIFFU-03** — Top-level handlers `catch (Exception)` but the real faults are `Error`/`TypeError` (Throwable) — DIFFU-01/04 escape these catches (`class.dd_diffusion_api.php:229,565,624`).
- **DIFFU-04** — `get_diffusion_data(): array` can `return null` on fn failure → `TypeError` (`class.component_common.php:3128-3140`).
- **DIFFU-08** — `retry_pending()` flips a pending row to `unpublished` on the default `result=true` even when nothing was verified deleted (`diffusion/class.diffusion_delete.php:350-375`).
- **DIFFU-09** — Relation branch's no-children fallback **reassigns** `$relation_values`, clobbering accumulated items (`class.diffusion_chain_processor.php:281-315`).

**TS layer**
- **DIFFTS-02** — Client-controlled `process_id` → cross-user cancel + progress read (IDOR); `progress_store` has no owner field (`diffusion/api/v1/index.ts:309,601,957-978`).

**Component correctness**
- **COMP-02** — `update_data_value()` strict `===` id match can fall through to **append**, creating duplicate entries (`class.component_common.php:3894-3944`).

**Performance / N+1**
- **REL-02** — `get_children_recursive` uses a path-local `visited` set (by-value copy per frame) → re-walks shared subtrees and duplicates results on DAG hierarchies (`component_relation_children.php:643-660`).
- **REL-04** — `relation_list::get_ar_data` instantiates a component per relation-component per related record (N+1).

**Auth / resilience / config**
- **AUTH-01** — ACS endpoint `echo`es the raw OneLogin exception text to the client (`core/login/saml/acs.php:106`).
- **AUTH-02** — SAML subject identifier (DNI/PII) + client IP written to `error_log` unconditionally (`acs.php:14,61`).
- **AUTH** family carries 7 more Low items (see appendix).

**Frontend / UX**
- **FEJS-01** — Portal column-sort click fires an unawaited server round-trip with no loading/error UI and no double-click guard (`core/common/js/ui.js:2624-2630,2719-2727`).
- **UIUX-02** — Number input `clean_value()` can return null, then `.split('.')` runs **before** the null guard → `TypeError` on non-numeric input (`component_number.js:165-176`).
- **UIUX-03** — Invalid numeric input is silently discarded with no validation feedback (`render_edit_component_number.js:306-346`).
- **UIUX-04** — Multi-email validation reflects only the **last** email (`valid_email` reassigned each iteration); TLD regex too restrictive (`component_email.js:85-108`).
- **UIUX-05** — `ui.component.error` contract mismatch: some callers pass the input element, the code expects the wrapper → wrong element gets the error class/focus (`ui.js:896-912`).
- **UIUX-06** — Form inputs have no programmatic label association (no `id`/`for`/`aria-label`); the visible label is a sibling `div`.
- **UIUX-07** — Near-total absence of ARIA across `core/*/js` (3 attributes total, none in form/error paths); validation error state is visual-only (no `aria-invalid`/`role=alert`/`aria-live`).

**CI / testing**
- **CONF-03** — `php -l` lint step pipes through `grep … || true`, swallowing exit codes → parse errors can never fail the job (`.github/workflows/php-lint.yml:27-31`).

---

## 5. LOW / INFO (65) — appendix

Grouped; each is verified with a `file:line`. Full detail in the workflow output.

**Security (low):** API-03 (unauth version/build/entity disclosure via `get_environment`), AUTH-03 (JSONB containment param string-concatenated; SAML code skips `safe_xss`), AUTH-04 (worker REMOTE_ADDR → loopback), AUTH-05 (worker debug dumps full session incl. csrf/cookie), AUTH-07 (root password still legacy reversible AES, not Argon2id), SEARCH-04 (`build_filter_by_user_records` interpolates record ids into `IN(...)` without int-cast/param), COMP-06 (ontology export interpolates `section_tipo`/`file_path` into `psql -c` SQL + `TO PROGRAM` shell), REL-06 (`component_portal::remove_element` delete_all has no permission check on the target record), MEDIA-03 (auth markers world-readable; marker filename == valid cookie value), DIFFU-10 (diffuse() returns full element properties to client), DIFFTS-05/06/08/12 (backslash-escaping, name-regex, HTTPS-for-credentials, MCP HTTP transport has no client auth), DB-05/06 (`update_by_key`/`consolidate_table` interpolate column/table without the allowlist their siblings enforce).

**Bugs (low):** SEARCH-05 (legacy rqo path HTML-encodes SQL operators via `safe_xss_recursive`), REL-03 (dataframe dedup by `json_encode` is property-order fragile), MEDIA-04 (`get_media_url_dir` doesn't validate `$quality`), DIFFU-06 (unguarded `$ddo->diffusion_tipo`), DIFFTS-04 (operator-precedence → `undefined` db name), DIFFTS-07 (`parser_geo` always-truthy array check), WORKER-04 (HTTPS detection: `_ssl` suffix vs `cookie_secure` disagree), AUTH-09 (worker `inject_cookie` omits SameSite), DB-03 (update() UPDATE-then-INSERT TOCTOU vs UNIQUE constraint), DB-04 (`json_streaming_handler` emits invalid JSON for large assoc arrays — live API path), FEJS-02 (sort indicator not cleared on drag reorder), UIUX-10 (`e.key.length` unguarded).

**Performance (low):** SEARCH-03 (`get_placeholder` dedup O(n²)), COMP-05 (`model_by_tipo_cache` unbounded), DIFFU-07 (`is_publishable` doesn't cache the true result), DIFFTS-10/11 (rate-limiter evicts active buckets; progress purge leaks listeners), TOOLS-07 (`get_csv_files` returns full contents of every CSV), FEJS-04 (sort-header listeners re-attached every render).

**Error-handling (low):** API-05 (unchecked `source` sub-properties), AUTH-06 (RoadRunner session `read()` swallows storage errors), DIFFTS-03 (SSE leaks heartbeat/poll timer on disconnect), TOOLS-04 (RDF SQO filter built by raw string concat of remote literals), TOOLS-06 (`fopen` result unchecked before `fgetcsv`).

**Quality / architecture (low/info):** API-06 (every preflight logged as error), COMP-04 (`get_key_from_id` dead + latent strict-compare bug), REL-05/07 (dead `$lang` assign; large commented-out legacy blocks in portal), DIFFU-05 (`dispatch_class_method` dead/misleading), MEDIA-05 (SEC-065 quality regex allows `<` and bare `..`), WORKER-05/06 (double `session->close()`; dead cache clearers + unused `configure()`), DB-07/08 (`_getConnectionPDO` omits port; dead `??` after concat), FEJS-03 (client-only column-order permission gate, server doesn't enforce), AUTH-08 (brute-force throttle is filesystem-local — ineffective multi-node), UIUX-08/09 (global `outline:none` kills focus ring; hardcoded-English duplicate-warning bypasses i18n).

**Testing / config (low):** SEARCH-06 / DIFFU-11 / MEDIA-02 (missing regression tests for the hardened paths), CONF-04 (CodeQL omits PHP; security packs commented out), CONF-05 (PHPStan level 1, 3 dirs), CONF-06/07 (enforced CSP `object-src 'self'` contradicts its own comment; nginx CSP drifted from `.htaccess`), CONF-08 (`lib/` absent from `.htaccess` denylist; vendored tcpdf/Zend/Smalot still present — prior deps finding unfixed), CONF-09 (phpunit suppresses E_WARNING/E_DEPRECATED), CONF-10 (`setup-bun` pins no Bun version).

**Refuted (1):** TOOLS-08 (claimed `tool_dev_template` stubs ungated) — verifier found the gate present.

---

## 6. Cross-cutting themes & root causes

1. **PHP-FPM assumptions in a persistent worker.** The highest-impact finding (WORKER-01) and a cluster of Highs/Mediums (WORKER-02, COMP-01, COMP-03, REL-01, DB-02, AUTH-08) all stem from process-global statics/caches/headers that assume a fresh process per request. *Systemic fix:* audit every `static`/`self::$` cache and every `header()`/global mutation for a worker-lifecycle reset hook, and centralize per-request teardown so all three entry branches (normal/SSE/preflight) reset identically.

2. **One security gate, multiple entry points.** SQO/ddo_map sanitizing lives only in `index.php`; the worker SSE path and `dd_manager` don't share it. *Fix:* a single `sanitize_client_rqo()` used by every entry point (closes WORKER-01 and prevents future drift).

3. **Filename sanitization is per-callsite, not centralized.** SEC-063 fixed one sink; six more survive. *Fix:* one mandatory `safe_upload_target(base, name)` helper, used everywhere, plus map-form `API_ACTIONS` so tool methods can't ship un-gated.

4. **`catch (Exception)` vs `Throwable`.** Error/TypeError escape the engine's top-level handlers, converting recoverable failures into fatals (DIFFU-03, and the pattern recurs). *Fix:* catch `\Throwable` at API boundaries.

5. **PHP↔TS authorization asymmetry.** The Bun layer re-implements endpoints without the PHP `is_global_admin`/ownership checks (DIFFTS-01/02). *Fix:* the TS layer must consult the same authority (PHP `page_globals`) or be restricted to internal-token callers.

6. **CI gates that don't gate.** 4/25 test suites, lint that always passes, no PHP static analysis of the bulk of the tree, CodeQL without PHP. *Fix:* this is the cheapest high-leverage work — turning the existing gates on would have caught several findings here.

---

## 7. Prioritized remediation roadmap

**Tier 0 — this week (Critical + auth-bypass Highs)**
1. WORKER-01 — shared `sanitize_client_rqo()` on the SSE path.
2. DIFFTS-01 — admin gate on Bun privileged actions.
3. API-01/API-02 + TOOLS-01/02/03 — central filename-confinement helper across all upload/import sinks.
4. WORKER-02 — `header_remove()` per request.

**Tier 1 — this sprint (data-integrity + worker leaks)**
5. COMP-01 + COMP-03 — user/project in LOV cache key; real worker cache clear.
6. REL-01 — try/finally around `save_tm` toggles.
7. DB-01 — fix `matrix_counter_dd` `ON CONFLICT`.
8. DIFFU-01/02/03 — implement or fence XML diffusion; catch `Throwable`.
9. CONF-01 — fix EasyRdf require path + move to `require`.

**Tier 2 — within the release (CI + correctness + UX)**
10. CONF-02/03/04/05 — turn the CI gates on (run all suites; fail on lint; PHP in CodeQL; raise PHPStan scope).
11. SEARCH-01/02, COMP-02, DIFFU-04/08/09, DIFFTS-02 — search-operator allowlists, duplicate-append, diffusion correctness, process_id ownership.
12. UIUX-01/02/03/04/05 — restore the remove-confirm guard; fix number/email validation crashes and feedback.

**Tier 3 — backlog (hardening + a11y + cleanup)**
13. The accessibility track (UIUX-06/07/08) — labels, ARIA, focus ring; meaningful UX work, plan as its own initiative.
14. The Low/Info appendix — fold into normal maintenance; prioritize DB-04 (invalid JSON on live path), DB-05/06 (SQL interpolation), COMP-06 (export shell/SQL), AUTH-05/07 (session-dump logging, root password).

---

## 8. Relationship to the prior security audit

The SEC-001..105 cycle holds where it was applied. This audit surfaces what it did **not** cover: (a) the new worker runtime (entirely post-dates that cycle), (b) the TypeScript/Bun layer, (c) the six path-traversal sinks adjacent to the one it fixed, (d) all non-security dimensions. Two prior items appear **unfixed/regressed**: CONF-08 (`lib/` denylist + vendored dead libs — prior C-class) and the require-dev EasyRdf placement its own follow-up note flagged (CONF-01).
