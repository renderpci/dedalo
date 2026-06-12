---
name: dedalo-media-protection
description: Architecture and conventions of the Dédalo v7 media protection system (web-server-enforced media file access control). Use when modifying core/media_protection/, login::init_cookie_auth, diffusion/api/v1/lib/media_index.ts, the media markers hooks in the diffusion engine, the media_control area_maintenance widget, the generated media/.htaccess template or the nginx media block — covers the marker-store allowlist, the fixed-name auth cookie, the filename→record grammar, fail-closed semantics, the rebuild/reconcile paths and the three enforcement surfaces that must stay in lockstep.
---

# Dédalo v7 media protection conventions

One media tree serves two audiences at the same URLs with zero duplication: logged-in users read everything (rule A), anonymous users read only **published** records in the configured public quality folders (rule B). Authorization is performed by the web server itself with one `stat()` on a zero-byte marker file — no PHP, no DB, no app process in the file-serving path. User docs: `docs/config/media_protection.md`. These are the non-negotiable rules and the architecture map.

## Hard rules

1. **Never put an application process in the media-serving path.** No PHP proxying/streaming, no X-Sendfile/X-Accel for gated media: files are multi-GB and the request must reach the native handlers (Apache H.264 streaming module / nginx `mp4` module) so `?start=`/`?end=`/`?vbegin=` clipping and HTTP Range keep working. The gate never inspects the query string and its rewrite substitution is always `-`.

2. **Fail closed, 404 not 403.** Every failure mode (missing marker, missing store, engine down, non-grammar filename, malformed cookie) denies anonymous access; nothing ever falls open. Default deny answers **404** so the existence of unpublished media is not disclosed. Publication-side failures must never lock out editors: rule A markers are PHP-owned and independent of the engine.

3. **Three enforcement surfaces stay in lockstep.** The same key grammar and quality alternation is implemented in (a) the Apache template `media_protection::build_htaccess()`, (b) the nginx sample block in `config/nginx.conf.sample`, (c) the Bun key validation `KEY_REGEX` in `diffusion/api/v1/lib/media_index.ts`. Touch one → review all three. The filename grammar is LOAD-BEARING:
   ```
   .+_([a-z0-9]+)_([0-9]+)(?:_lg-[a-zA-Z0-9-]{2,12})?\.[A-Za-z0-9]+$   →  key = {section_tipo}_{section_id}
   ```
   Greedy prefix pins the LAST two underscore tokens (component tipo can't be mistaken for section tipo). It derives from `component_common::get_identifier()` / `component_media_common::get_id()` / `component_av::get_subtitles_path()` — changing media file naming in core breaks the gate. Files that don't parse (e.g. images renamed via `properties.image_id`/external_source) stay login-only by design: document, don't "fix" by loosening the regex.

4. **The auth cookie NAME is fixed** (`media_protection::COOKIE_NAME` = `dedalo_media_auth`); only the 128-hex sha512 VALUE rotates daily (today + yesterday valid, markers in `auth/`). Never reintroduce rotating cookie names: the fixed name is what makes the generated `.htaccess` static and nginx support reload-free. Cookie values and URL captures are validated against strict patterns (`[a-f0-9]{128}`, `KEY_REGEX`) before any filesystem use — keep it that way (path traversal).

5. **Ownership of the marker store is split and exclusive.** Under `DEDALO_MEDIA_PATH/.publication/`: PHP (login / media_protection) writes ONLY `auth/`; the Bun diffusion engine (`media_index.ts`) writes ONLY `pub/` and `dbs/{db}/{table}/`. `pub/{key}` is a pure DERIVED union: it exists ⇔ the key exists in at least one `dbs/<db>/<table>/` dir. Appliers **recompute the union from full dir state — never refcount** (idempotency under concurrent publish/unpublish); per-key mutations are serialized via the promise-chain `Map` in `media_index.ts`. The store path must always be web-blocked (Apache rule 0, nginx `^~ /media/.publication/` deny).

6. **Markers mirror committed DB state, never lead it.** Hooks run AFTER a successful SQL commit (`index.ts` step-5 loop after `insert_table_data`; `delete_handler.ts` after each successful target) and marker failures are logged/pushed to `errors` but NEVER fail the diffusion or the delete. Drift heals: boot `reconcile()` (pure FS diff, `import.meta.main` block), and full `rebuild` — PHP resolves targets from the ontology (`dd_diffusion_api::resolve_media_index_targets()`, Bun never interprets the ontology), Bun diff-syncs from `SELECT DISTINCT section_id` per target with NO wipe (no deny-everything window), tolerating errno 1146/1049 as empty. CLI: `diffusion/migration/helpers/rebuild_media_index.php`.

7. **Wire contract carries `section_tipo`.** `processed_table.section_tipo` is required; `delete_target.section_tipo` is optional (back-compat: targets without it still delete, just skip markers). Changing either side means updating BOTH plus the golden fixtures (`test/fixtures/contract/`) and `wire_contract_Test.php` in one commit (see dedalo-diffusion skill).

8. **`original`/`modified` qualities are never public.** `media_protection::get_public_qualities()` refuses them (and `..`/odd chars) even if configured — keep that filter when touching quality handling. Mode resolution priority in `get_mode()`: `DEDALO_MEDIA_ACCESS_MODE_CUSTOM` (config_core.php, `null` = no override) → `DEDALO_MEDIA_ACCESS_MODE` (config.php) → legacy `DEDALO_PROTECT_MEDIA_FILES===true` ⇒ `'private'`. Don't bypass `get_mode()` with direct constant reads (only exception: `media_control::resolve_config_file_mode()`, which intentionally ignores the override right after changing it — constants are immutable within the request).

9. **The generated `.htaccess` is config-hash guarded and must keep SEC-088.** `write_htaccess()` rewrites only when the embedded `# config-hash:` differs (mode + qualities + addons + media path + `TEMPLATE_VERSION`). **Bump `media_protection::TEMPLATE_VERSION` whenever the template changes** or existing installs never regenerate. The template always includes the SEC-088 script-execution hardening (the pre-v7 generator clobbered it — that was a regression, never repeat it). Mode `'off'` writes the hardening-only template (used when disabling from the widget so stale deny rules don't linger). Addons: `MEDIA_HTACCESS_ADDONS` (raw rewrite lines before the final deny) replaced `INIT_COOKIE_AUTH_ADDONS` — the `<RequireAny>` block no longer exists.

10. **Config edits from the UI follow the `*_CUSTOM` convention.** The media_control widget persists `DEDALO_MEDIA_ACCESS_MODE_CUSTOM` through `area_maintenance::set_config_core()` (allowlisted constant cases, root-user gated, writes `config_core.php` with LOCK_EX). Allowed values: `null` (no override) | `false` | `'private'` | `'publication'`. On change the widget applies immediately: `write_htaccess($new_mode)` with the EXPLICIT mode (constants are stale in-request) + `sync_auth_markers_from_cookie_file()` so logged users keep access. Don't use `dd_area_maintenance_api` `class_request` for new setters — its `area_maintenance::API_ACTIONS` allowlist doesn't even include `set_maintenance_mode` (pre-existing inconsistency); use the widget's own class via `widget_request` + per-widget `API_ACTIONS`.

## Architecture map

- **Marker store** (`DEDALO_MEDIA_PATH/.publication/`): `auth/{cookie_value}` (rule A), `pub/{section_tipo}_{section_id}` (rule B union — the only thing web servers stat), `dbs/{db}/{table}/{key}` (ground truth).
- **PHP** `core/media_protection/class.media_protection.php` — pure/static, session-free: `get_mode()`, `get_public_qualities()` / `get_default_public_qualities()`, `build_htaccess()` / `write_htaccess()` / `get_htaccess_status()`, `sync_auth_markers()` (+ `_from_cookie_file()`), `read_cookie_auth_file()` (strips the `<?php exit();` guard line; legacy raw-JSON files OK). Test hook: `media_protection::$media_path_override` (same convention as `diffusion_api_client::$endpoint_override`).
- **Login** `core/login/class.login.php::init_cookie_auth()` (gated on `get_mode()!==false`): recycles/rotates the cookie file (`core/extras/media_protection/cookie/cookie_auth.php`, written WITH the `<?php exit(); ?>` first line), syncs `auth/` markers EVERY login (self-heal after redeploy), `write_htaccess()` (usually a no-op), `setcookie(COOKIE_NAME, today_value)`. Logout clears the fixed-name cookie.
- **Bun** `diffusion/api/v1/lib/media_index.ts`: env `DEDALO_MEDIA_PATH` (unset ⇒ every function no-ops = feature off), `apply_table_state()`, `reconcile()`, `rebuild()`, `get_status()`. Actions in `index.ts`: `rebuild_media_index`, `media_index_status` (both `check_server_auth`); hooks in the step-5 insert loop and `delete_handler.ts`.
- **Engine status for UIs**: `media_index_status` is the read-only probe (`{enabled, base, pub_markers, auth_markers, databases}`) — never probe by calling `rebuild_media_index` (it mutates).
- **Widget** `core/area_maintenance/widgets/media_control/` — `get_value` (status incl. engine probe via `diffusion_api_client::call`, which never throws), `set_media_access_mode` (root), `rebuild_media_index` (delegates to `dd_diffusion_api`, global-admin gated there). Registered in `area_maintenance::get_ar_widgets()`; LESS imported in `area_maintenance.less`.
- **Web servers**: Apache = generated `media/.htaccess` (per-dir mod_rewrite; `%1` = cond capture for rule A, `$1_$2` = rule-pattern captures for rule B). Nginx = static block in `config/nginx.conf.sample`; the rule-A catch-all is a PLAIN prefix `location /media/` — adding `^~` would skip the rule-B regex location entirely (classic pitfall).

## Operational gotchas

- Unpublish takes effect next request **at the origin only**: nginx `open_file_cache` (keep off or `_valid` ≤2s), NFS attribute cache on web farms, and CDNs all delay it — CDN paths must be purged on unpublish (especially transcription `.vtt`).
- Enabling protection on a live install: users logged in BEFORE enabling have no cookie until re-login (the widget restores markers for existing cookie holders, not the cookies themselves). Existing publications need one `rebuild_media_index` run.
- The #1 misconfiguration is `DEDALO_MEDIA_PATH` missing in the engine `.env` → publishes succeed but anonymous access stays 404. The widget surfaces it via `media_index_status`.

## Test architecture (keep it green)

- **Bun**: `test/media_index.test.ts` (tmpdir via `DEDALO_MEDIA_PATH` env, save/restore in before/afterEach; union/idempotency/concurrency-storm/key-sanitization/no-op-when-unset), `test/integration/media_index.integration.test.ts` (real MariaDB, self-skipping; delete-with/without `section_tipo`, rebuild diff-sync, stale-dir removal), `handler.test.ts` (`rebuild_media_index` + `media_index_status` in the `server_actions` auth matrix). Run `bun test` + `bunx tsc --noEmit` in `diffusion/api/v1`.
- **PHP**: `test/server/login/media_protection_Test.php` (htaccess content both modes, marker rotation, hash idempotence — all under `$media_path_override`), `test/server/area/media_control_widget_Test.php`, widget listed in `area_maintenance_Test::test_widgets_value`. **TEST_USER_ID = DEDALO_SUPERUSER**: never exercise the VALID `set_media_access_mode` path in tests — it would write the real `config_core.php` and `media/.htaccess`; cover validation (no-write) paths and force the engine endpoint to a dead socket (`diffusion_api_client::$endpoint_override = '/tmp/no_such...sock'`) for graceful-failure assertions. Run `cd test/server && ../../vendor/bin/phpunit login/media_protection_Test.php area/media_control_widget_Test.php`.
- **End-to-end gate verification** (the method that caught real bugs — rule-B backreference `$1_$2` vs `%1_%2`, nginx `^~`): throwaway Apache with the ACTUALLY-generated `.htaccess`:
  ```bash
  # temp docroot with fixture media + markers, generate .htaccess via build_htaccess(),
  # minimal httpd.conf (homebrew modules, Listen 127.0.0.1:8199, AllowOverride All)
  httpd -f /tmp/.../httpd.conf -k start
  # curl matrix: {no cookie, valid, stale, malformed} × {published/unpublished × qualities,
  # vtt lang suffix, additional_path subdir, original, .publication/*, Range→206, ?start kept,
  # encoded traversal, non-grammar filename} ; then rm/touch a pub marker → instant 404/200 flip
  ```
- `php -l` every touched PHP file; phpstan on `core/media_protection` and the widget must stay at 0 errors (new constants go into `stub.php` for the phpstan bootstrap).
