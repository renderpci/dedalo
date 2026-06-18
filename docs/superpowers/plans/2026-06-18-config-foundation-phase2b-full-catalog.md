# Config Foundation — Phase 2b: Full Catalog (config settings) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the catalog with every genuine v6 config *setting* (~120 keys) as classified `config_key` entries across `core/base/config/catalog/domains/*.php`, aggregate them in `catalog.php`, and gate it with a coverage + scope-consistency test.

**Architecture:** One `domains/<domain>.php` file per concern, each returning `config_key[]`. `catalog/catalog.php` `require`s and merges all domain files (replacing the Phase-2 7-key representative slice, which is preserved as a strict subset). Defaults are transcribed verbatim from the v6 sample files (`config/sample.config*.php`); the **scope classification** (STATIC / DERIVED / REQUEST / USER / SECRET / STATE) is given per key in each task and is the load-bearing correctness work.

**Tech Stack:** PHP 8.1+, PHPUnit ^13 (hermetic harness: `vendor/bin/phpunit -c test/server/phpunit.unit.xml`), no Composer runtime dependency.

## Global Constraints

- **PHP 8.1+**, no Composer runtime dependency. Domain files are pure data (`config_key[]`), `require_once` the config classes relatively.
- **Source of truth for DEFAULT VALUES:** the v6 sample files — `config/sample.config.php`, `config/sample.config_db.php`, `config/sample.config_areas.php`, `config/sample.config_core.php`. Transcribe each default verbatim by constant name. (These are the SAMPLE files — the allowed reference.)
- **Scope classification (given per key in each task) is binding** — the spec §5.3 contract. In particular: `DEDALO_APPLICATION_LANG`/`DEDALO_DATA_LANG` are **REQUEST**; `SHOW_DEBUG`/`SHOW_DEVELOPER`/`LOGGER_LEVEL` are **USER**; `DEDALO_SALT_STRING`/`DEDALO_PASSWORD_CONN`/`MYSQL_DEDALO_PASSWORD_CONN`/`DEDALO_DIFFUSION_INTERNAL_TOKEN`/the `code` leaves of `API_WEB_USER_CODE_MULTIPLE`/`ONTOLOGY_SERVERS`/`CODE_SERVERS` are **SECRET**; `DEDALO_INSTALL_STATUS`/`DEDALO_MAINTENANCE_MODE`/`DEDALO_INFORMATION`/`DEDALO_INFO_KEY` are **STATE**; values built from other constants (`DEDALO_ENTITY_LABEL`, `DEDALO_DIFFUSION_LANGS`, `DEDALO_FILTER_SECTION_TIPO_DEFAULT`) are **DERIVED**.
- **Continuity (MUST hold):** the Phase-2 representative slice keys keep their EXACT `path`, `const`, `type`, `scope`, `default` — `paths.core_url`(STATIC,`DEDALO_CORE_URL`,'/dedalo/core'), `media.image.thumb_width`(STATIC,222), `media.image.extensions_supported`(STATIC,REPLACE), `media.magick_config`(STATIC,DEEP), `media.image.file_url`(DERIVED), `lang.application_lang`(REQUEST), `db.password`(SECRET). The existing 91-test suite MUST stay green.
- **Path family DEFERRED to Phase 3b:** do NOT add the install-root-derived structural paths (`DEDALO_*_PATH`/`*_URL`, `HOST`, `PROTOCOL`, `ROOT_WEB`, `MEDIA_PATH`, `SESSIONS_PATH`, `BACKUP_PATH*`, `*_FOLDER_PATH`, etc.). Sysadmin-set EXTERNAL paths (binary paths like `DEDALO_AV_FFMPEG_PATH`, `MAGICK_PATH`, `DEDALO_DIFFUSION_SOCKET_PATH`) ARE config and ARE included (scope STATIC).
- **Deferred (not this phase):** readonly domain DTOs + backed enums (a later pass); the migration tool (Phase 4).
- **Commented-out optional `define()`s** in the sample (e.g. `DEDALO_CORS`, `DEDALO_MCP_PROXY_URL`, `GEONAMES_ACCOUNT_USERNAME`, `PDF_OCR_ENGINE`) are OPTIONAL — include only the ones named in a task; the rest go on the coverage test's explicit "optional/excluded" list, not the catalog.
- **Test command:** `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter <name>` from repo root.

---

## File Structure

- `core/base/config/catalog/domains/identity.php` — **new.** crypto salt, entity, locale/timezone, dev flag, encryption mode (Task 1).
- `core/base/config/catalog/domains/runtime.php` — **new.** sessions, cache, debug/developer, logging, backups (Task 2).
- `core/base/config/catalog/domains/lang.php` — **new.** language settings + `application_lang`/`data_lang` (Task 3).
- `core/base/config/catalog/domains/defaults.php` — **new.** ontology/app defaults (Task 3).
- `core/base/config/catalog/domains/media_image.php` — **new.** image + media-common + magick (Task 4).
- `core/base/config/catalog/domains/media_av.php` — **new.** audiovisual (Task 5).
- `core/base/config/catalog/domains/media_docs.php` — **new.** pdf + 3d + svg + html_files (Task 6).
- `core/base/config/catalog/domains/features.php` — **new.** upload, geo, media-access, toggles, search, IP_API, maintenance (Task 7).
- `core/base/config/catalog/domains/diffusion.php` — **new.** diffusion + remote/code servers (Task 7).
- `core/base/config/catalog/domains/db.php` — **new.** PG + MariaDB connection params + secrets (Task 7).
- `core/base/config/catalog/domains/areas.php` — **new.** menu area deny/allow (Task 7).
- `core/base/config/catalog/domains/state.php` — **new.** install status, maintenance, install fingerprints (Task 7).
- `core/base/config/catalog/catalog.php` — **modify.** aggregate all domain files (Task 8).
- Tests (`test/server/unit/`): one `catalog_<domain>_Test.php` per domain task + `catalog_coverage_Test.php` (Task 8).

**Code template** (every domain entry follows this; `default:` transcribed from the sample by const name):
```php
new config_key(path: '<dot.path>', const: '<DEDALO_CONST>', type: '<int|bool|string|list|map>', default: <sample value>, scope: config_scope::<SCOPE>, merge: config_merge::<REPLACE|DEEP>, doc: '<short>'),
```
`scope` defaults to STATIC and `merge` to REPLACE — omit them when STATIC/REPLACE. SECRET/STATE/REQUEST/USER keys: omit `default:` (no compiled default) unless the sample ships a non-secret placeholder you explicitly want as a dev default.

---

### Task 1: `identity` domain — crypto, entity, locale, dev flag

**Files:**
- Create: `core/base/config/catalog/domains/identity.php`
- Test: `test/server/unit/catalog_identity_Test.php`

**Interfaces:**
- Consumes: `config_key`, `config_scope`, `config_merge` (Phase 2).
- Produces: `domains/identity.php` returns `config_key[]` for the keys below.

**Classification (defaults from `config/sample.config.php` by const name):**

| const | path | type | scope | notes |
|---|---|---|---|---|
| DEDALO_SALT_STRING | identity.salt_string | string | SECRET | no default (env) |
| DEDALO_TIMEZONE | identity.timezone | string | STATIC | 'Europe/Madrid' |
| DEDALO_LOCALE | identity.locale | string | STATIC | 'es-ES' |
| DEDALO_DATE_ORDER | identity.date_order | string | STATIC | 'dmy' |
| DEDALO_ENTITY | identity.entity | string | STATIC | 'my_entity_name' |
| DEDALO_ENTITY_LABEL | identity.entity_label | string | DERIVED | = entity (closure `fn($r)=>$r['identity.entity']`) |
| DEDALO_ENTITY_ID | identity.entity_id | int | STATIC | 0 |
| DEVELOPMENT_SERVER | identity.development_server | bool | STATIC | false |
| ENCRYPTION_MODE | identity.encryption_mode | string | STATIC | 'openssl' |

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/catalog_identity_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';

final class catalog_identity_Test extends TestCase {

	/** @return array<string,config_key> by path */
	private function load() : array {
		$by = [];
		foreach (require dirname(__DIR__, 3) . '/core/base/config/catalog/domains/identity.php' as $k) {
			$by[$k->path] = $k;
		}
		return $by;
	}

	public function test_keys_present_with_correct_scope() : void {
		$by = $this->load();
		$expect = [
			'identity.salt_string'        => [config_scope::SECRET,  'DEDALO_SALT_STRING'],
			'identity.timezone'           => [config_scope::STATIC,  'DEDALO_TIMEZONE'],
			'identity.locale'             => [config_scope::STATIC,  'DEDALO_LOCALE'],
			'identity.date_order'         => [config_scope::STATIC,  'DEDALO_DATE_ORDER'],
			'identity.entity'             => [config_scope::STATIC,  'DEDALO_ENTITY'],
			'identity.entity_label'       => [config_scope::DERIVED, 'DEDALO_ENTITY_LABEL'],
			'identity.entity_id'          => [config_scope::STATIC,  'DEDALO_ENTITY_ID'],
			'identity.development_server' => [config_scope::STATIC,  'DEVELOPMENT_SERVER'],
			'identity.encryption_mode'    => [config_scope::STATIC,  'ENCRYPTION_MODE'],
		];
		foreach ($expect as $path => [$scope, $const]) {
			$this->assertArrayHasKey($path, $by, "missing $path");
			$this->assertSame($scope, $by[$path]->scope, "scope of $path");
			$this->assertSame($const, $by[$path]->const, "const of $path");
		}
	}

	public function test_spot_check_defaults_match_sample() : void {
		$by = $this->load();
		$this->assertSame('Europe/Madrid', $by['identity.timezone']->default);
		$this->assertSame('dmy', $by['identity.date_order']->default);
		$this->assertFalse($by['identity.development_server']->default);
		$this->assertSame(0, $by['identity.entity_id']->default);
	}

	public function test_entity_label_derives_from_entity() : void {
		$by = $this->load();
		$fn = $by['identity.entity_label']->derived;
		$this->assertSame('museo_x', $fn(['identity.entity' => 'museo_x']));
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter catalog_identity_Test`
Expected: FAIL/ERROR — `Failed to open stream .../domains/identity.php`.

- [ ] **Step 3: Create the domain file**

Create `core/base/config/catalog/domains/identity.php`. `require_once` the three config classes relatively (`__DIR__ . '/../../class.config_scope.php'`, `class.config_merge.php`, `class.config_key.php`), then `return [...]`. Transcribe each default from `config/sample.config.php` by const name. Example (complete this for all 9 keys):

```php
<?php declare(strict_types=1);

require_once __DIR__ . '/../../class.config_scope.php';
require_once __DIR__ . '/../../class.config_merge.php';
require_once __DIR__ . '/../../class.config_key.php';

return [
	new config_key(path: 'identity.salt_string', const: 'DEDALO_SALT_STRING', type: 'string', scope: config_scope::SECRET, doc: 'Crypto salt (env-only; never compiled).'),
	new config_key(path: 'identity.timezone', const: 'DEDALO_TIMEZONE', type: 'string', default: 'Europe/Madrid', doc: 'Default timezone.'),
	new config_key(path: 'identity.locale', const: 'DEDALO_LOCALE', type: 'string', default: 'es-ES', doc: 'Locale.'),
	new config_key(path: 'identity.date_order', const: 'DEDALO_DATE_ORDER', type: 'string', default: 'dmy', doc: 'Date order dmy|mdy|ymd.'),
	new config_key(path: 'identity.entity', const: 'DEDALO_ENTITY', type: 'string', default: 'my_entity_name', doc: 'Entity name.'),
	new config_key(path: 'identity.entity_label', const: 'DEDALO_ENTITY_LABEL', type: 'string', scope: config_scope::DERIVED, derived: static fn(array $r) : string => (string) $r['identity.entity'], doc: 'Entity label (defaults to entity name).'),
	new config_key(path: 'identity.entity_id', const: 'DEDALO_ENTITY_ID', type: 'int', default: 0, doc: 'Entity id from the Dédalo registry.'),
	new config_key(path: 'identity.development_server', const: 'DEVELOPMENT_SERVER', type: 'bool', default: false, doc: 'Development server flag.'),
	new config_key(path: 'identity.encryption_mode', const: 'ENCRYPTION_MODE', type: 'string', default: 'openssl', doc: 'Encryption mode.'),
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter catalog_identity_Test`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add core/base/config/catalog/domains/identity.php test/server/unit/catalog_identity_Test.php
git commit -m "feat(config): catalog identity domain (salt/entity/locale/dev/encryption)"
```

---

### Task 2: `runtime` domain — sessions, cache, debug, logging, backups

**Files:**
- Create: `core/base/config/catalog/domains/runtime.php`
- Test: `test/server/unit/catalog_runtime_Test.php`

**Interfaces:**
- Consumes: `config_key` etc.
- Produces: `domains/runtime.php` returns `config_key[]`.

**Classification (defaults from `config/sample.config.php`; `SLOW_QUERY_MS` from `config/sample.config_db.php`):**

| const | path | type | scope | notes |
|---|---|---|---|---|
| DEDALO_SESSION_HANDLER | runtime.session_handler | string | STATIC | 'files' |
| DEDALO_CACHE_MANAGER | runtime.cache_manager | map | STATIC | merge DEEP; `files_path` resolved at boot (3b) |
| SHOW_DEBUG | runtime.show_debug | bool | USER | no default (per-user at boot) |
| SHOW_DEVELOPER | runtime.show_developer | bool | USER | no default |
| LOGGER_LEVEL | runtime.logger_level | int | USER | no default (depends on debug/developer) |
| DEDALO_BACKUP_ON_LOGIN | runtime.backup_on_login | bool | STATIC | true |
| DEDALO_BACKUP_TIME_RANGE | runtime.backup_time_range | int | STATIC | 8 |

(`DEDALO_SESSION_SAVE_PATH`, `DEDALO_SESSIONS_PATH`, `DEDALO_BACKUP_PATH*`, `UPDATE_LOG_FILE` are install-derived paths → deferred to Phase 3b.)

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/catalog_runtime_Test.php` (mirror Task 1's structure):

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';

final class catalog_runtime_Test extends TestCase {

	/** @return array<string,config_key> */
	private function load() : array {
		$by = [];
		foreach (require dirname(__DIR__, 3) . '/core/base/config/catalog/domains/runtime.php' as $k) { $by[$k->path] = $k; }
		return $by;
	}

	public function test_keys_present_with_correct_scope() : void {
		$by = $this->load();
		$expect = [
			'runtime.session_handler'  => [config_scope::STATIC, 'DEDALO_SESSION_HANDLER'],
			'runtime.cache_manager'    => [config_scope::STATIC, 'DEDALO_CACHE_MANAGER'],
			'runtime.show_debug'       => [config_scope::USER,   'SHOW_DEBUG'],
			'runtime.show_developer'   => [config_scope::USER,   'SHOW_DEVELOPER'],
			'runtime.logger_level'     => [config_scope::USER,   'LOGGER_LEVEL'],
			'runtime.backup_on_login'  => [config_scope::STATIC, 'DEDALO_BACKUP_ON_LOGIN'],
			'runtime.backup_time_range'=> [config_scope::STATIC, 'DEDALO_BACKUP_TIME_RANGE'],
		];
		foreach ($expect as $path => [$scope, $const]) {
			$this->assertArrayHasKey($path, $by, "missing $path");
			$this->assertSame($scope, $by[$path]->scope, "scope of $path");
			$this->assertSame($const, $by[$path]->const, "const of $path");
		}
	}

	public function test_cache_manager_is_deep_merge_map() : void {
		$by = $this->load();
		$this->assertSame(config_merge::DEEP, $by['runtime.cache_manager']->merge);
		$this->assertIsArray($by['runtime.cache_manager']->default);
	}

	public function test_backup_defaults() : void {
		$by = $this->load();
		$this->assertTrue($by['runtime.backup_on_login']->default);
		$this->assertSame(8, $by['runtime.backup_time_range']->default);
		$this->assertSame('files', $by['runtime.session_handler']->default);
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter catalog_runtime_Test`
Expected: FAIL — domain file missing.

- [ ] **Step 3: Create the domain file**

Create `core/base/config/catalog/domains/runtime.php` (same require_once header as Task 1). USER-scoped keys (`show_debug`, `show_developer`, `logger_level`) get NO `default:`. `cache_manager` default is the sample's `['manager' => 'files', 'files_path' => '...']` — transcribe with `files_path` as a placeholder string `''` (the real path is filled at boot in 3b); merge DEEP. Full code:

```php
<?php declare(strict_types=1);

require_once __DIR__ . '/../../class.config_scope.php';
require_once __DIR__ . '/../../class.config_merge.php';
require_once __DIR__ . '/../../class.config_key.php';

return [
	new config_key(path: 'runtime.session_handler', const: 'DEDALO_SESSION_HANDLER', type: 'string', default: 'files', doc: 'Session save handler: files|redis|memcached|postgresql|user.'),
	new config_key(path: 'runtime.cache_manager', const: 'DEDALO_CACHE_MANAGER', type: 'map', default: ['manager' => 'files', 'files_path' => ''], merge: config_merge::DEEP, doc: 'Cache manager (files_path resolved at boot).'),
	new config_key(path: 'runtime.show_debug', const: 'SHOW_DEBUG', type: 'bool', scope: config_scope::USER, doc: 'Debug output (per logged user; resolved at boot).'),
	new config_key(path: 'runtime.show_developer', const: 'SHOW_DEVELOPER', type: 'bool', scope: config_scope::USER, doc: 'Developer mode (per logged user).'),
	new config_key(path: 'runtime.logger_level', const: 'LOGGER_LEVEL', type: 'int', scope: config_scope::USER, doc: 'Logger verbosity (depends on debug/developer).'),
	new config_key(path: 'runtime.backup_on_login', const: 'DEDALO_BACKUP_ON_LOGIN', type: 'bool', default: true, doc: 'Run backups on login.'),
	new config_key(path: 'runtime.backup_time_range', const: 'DEDALO_BACKUP_TIME_RANGE', type: 'int', default: 8, doc: 'Min hours between backups.'),
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter catalog_runtime_Test`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add core/base/config/catalog/domains/runtime.php test/server/unit/catalog_runtime_Test.php
git commit -m "feat(config): catalog runtime domain (sessions/cache/debug/logging/backups)"
```

---

### Task 3: `lang` + `defaults` domains

**Files:**
- Create: `core/base/config/catalog/domains/lang.php`, `core/base/config/catalog/domains/defaults.php`
- Test: `test/server/unit/catalog_lang_defaults_Test.php`

**Interfaces:** Consumes `config_key` etc. Produces both domain files.

**`lang` classification (defaults from `config/sample.config.php`):**

| const | path | type | scope | notes |
|---|---|---|---|---|
| DEDALO_STRUCTURE_LANG | lang.structure_lang | string | STATIC | 'lg-spa' |
| DEDALO_APPLICATION_LANGS | lang.application_langs | map | STATIC | the lg-* => label map |
| DEDALO_APPLICATION_LANGS_DEFAULT | lang.application_langs_default | string | STATIC | 'lg-eng' |
| DEDALO_APPLICATION_LANG | lang.application_lang | string | REQUEST | no default (preserve existing slice key) |
| DEDALO_DATA_LANG_DEFAULT | lang.data_lang_default | string | STATIC | 'lg-eng' |
| DEDALO_DATA_LANG | lang.data_lang | string | REQUEST | no default |
| DEDALO_DATA_LANG_SELECTOR | lang.data_lang_selector | bool | STATIC | true |
| DEDALO_DATA_LANG_SYNC | lang.data_lang_sync | bool | STATIC | false |
| DEDALO_DATA_NOLAN | lang.data_nolan | string | STATIC | 'lg-nolan' |
| DEDALO_PROJECTS_DEFAULT_LANGS | lang.projects_default_langs | list | STATIC | ['lg-spa','lg-cat','lg-eng','lg-fra'] |
| DEDALO_DIFFUSION_LANGS | lang.diffusion_langs | list | DERIVED | = projects_default_langs |

**`defaults` classification:**

| const | path | type | scope | notes |
|---|---|---|---|---|
| DEDALO_PREFIX_TIPOS | defaults.prefix_tipos | list | STATIC | the prefix tipos list |
| MAIN_FALLBACK_SECTION | defaults.main_fallback_section | string | STATIC | 'oh1' |
| NUMERICAL_MATRIX_VALUE_YES | defaults.numerical_matrix_value_yes | int | STATIC | 1 |
| NUMERICAL_MATRIX_VALUE_NO | defaults.numerical_matrix_value_no | int | STATIC | 2 |
| DEDALO_MAX_ROWS_PER_PAGE | defaults.max_rows_per_page | int | STATIC | 10 |
| DEDALO_PROFILE_DEFAULT | defaults.profile_default | int | STATIC | 2 |
| DEDALO_DEFAULT_PROJECT | defaults.default_project | int | STATIC | 1 |
| DEDALO_FILTER_SECTION_TIPO_DEFAULT | defaults.filter_section_tipo | string | DERIVED | `derived` closure `static fn(array $r): string => defined('DEDALO_SECTION_PROJECTS_TIPO') ? DEDALO_SECTION_PROJECTS_TIPO : 'dd153'` — at compile (hermetic) the constant is undefined → 'dd153'; at boot (3b) dd_tipos is loaded first → the real tipo. Scope DERIVED so the compiler computes it. |

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/catalog_lang_defaults_Test.php` asserting, for each domain file, the keys/scopes above, the REQUEST scope of `lang.application_lang`/`lang.data_lang`, the DERIVED scope of `lang.diffusion_langs`, and spot-check defaults (`structure_lang==='lg-spa'`, `max_rows_per_page===10`, `numerical_matrix_value_yes===1`, `application_langs` is a non-empty map). Follow Task 1's test structure (a `load($file)` helper per domain). Run it (RED — files missing).

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter catalog_lang_defaults_Test`
Expected: FAIL — domain files missing.

- [ ] **Step 3: Create both domain files**

Create `core/base/config/catalog/domains/lang.php` and `core/base/config/catalog/domains/defaults.php` (require_once header as Task 1). Transcribe defaults verbatim from `config/sample.config.php` (the `DEDALO_APPLICATION_LANGS` map and `DEDALO_PREFIX_TIPOS` list verbatim). `lang.application_lang`/`lang.data_lang` are REQUEST (no default). `lang.diffusion_langs` DERIVED: `static fn(array $r): array => $r['lang.projects_default_langs']`. `defaults.filter_section_tipo` DERIVED: `static fn(array $r): string => defined('DEDALO_SECTION_PROJECTS_TIPO') ? DEDALO_SECTION_PROJECTS_TIPO : 'dd153'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter catalog_lang_defaults_Test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/base/config/catalog/domains/lang.php core/base/config/catalog/domains/defaults.php test/server/unit/catalog_lang_defaults_Test.php
git commit -m "feat(config): catalog lang + defaults domains"
```

---

### Task 4: `media_image` domain (image + media-common + magick)

**Files:**
- Create: `core/base/config/catalog/domains/media_image.php`
- Test: `test/server/unit/catalog_media_image_Test.php`

**Interfaces:** Produces `domains/media_image.php`. **Preserves the slice keys** `media.image.thumb_width`, `media.image.extensions_supported`, `media.magick_config`, `media.image.file_url` with their exact scope/default/merge.

**Classification (defaults from `config/sample.config.php`; all STATIC unless noted):**

| const | path | type | notes |
|---|---|---|---|
| DEDALO_THUMB_EXTENSION | media.thumb_extension | string | 'jpg' |
| DEDALO_QUALITY_THUMB | media.quality_thumb | string | 'thumb' |
| DEDALO_IMAGE_THUMB_WIDTH | media.image.thumb_width | int | 222 (slice) |
| DEDALO_IMAGE_THUMB_HEIGHT | media.image.thumb_height | int | 148 |
| DEDALO_IMAGE_FOLDER | media.image.folder | string | '/image' |
| DEDALO_IMAGE_EXTENSION | media.image.extension | string | 'jpg' |
| DEDALO_IMAGE_MIME_TYPE | media.image.mime_type | string | 'image/jpeg' |
| DEDALO_IMAGE_TYPE | media.image.type | string | 'jpeg' |
| DEDALO_IMAGE_EXTENSIONS_SUPPORTED | media.image.extensions_supported | list | slice; REPLACE |
| DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS | media.image.alternative_extensions | list | [] |
| DEDALO_IMAGE_QUALITY_ORIGINAL | media.image.quality_original | string | 'original' |
| DEDALO_IMAGE_QUALITY_RETOUCHED | media.image.quality_retouched | string | 'modified' |
| DEDALO_IMAGE_QUALITY_DEFAULT | media.image.quality_default | string | '1.5MB' |
| DEDALO_IMAGE_AR_QUALITY | media.image.ar_quality | list | the quality ladder; REPLACE |
| DEDALO_IMAGE_PRINT_DPI | media.image.print_dpi | int | 150 |
| DEDALO_IMAGE_FILE_URL | media.image.file_url | string | DERIVED (slice): `fn($r)=>$r['paths.core_url'].'/media_engine/img.php'` |
| DEDALO_IMAGE_WEB_FOLDER | media.image.web_folder | string | '/web' |
| MAGICK_CONFIG | media.magick_config | map | slice; DEEP; `['remove_layer_0'=>false,'is_opaque'=>null]` |
| MAGICK_PATH | media.magick_path | string | '/usr/bin/' (sysadmin binary path — STATIC) |

(`COLOR_PROFILES_PATH` is CORE_PATH-derived → deferred to 3b.)

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/catalog_media_image_Test.php`: assert all keys present (paths + consts), `media.image.thumb_width` STATIC default 222, `media.image.extensions_supported` REPLACE list, `media.magick_config` DEEP map with `remove_layer_0`/`is_opaque` keys, `media.image.file_url` DERIVED computing `'/dedalo/core/media_engine/img.php'` from `['paths.core_url'=>'/dedalo/core']`, and spot-check `media.image.print_dpi===150`, `media.image.quality_default==='1.5MB'`. Run (RED).

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter catalog_media_image_Test`
Expected: FAIL — domain file missing.

- [ ] **Step 3: Create the domain file**

Create `core/base/config/catalog/domains/media_image.php` (require_once header). Transcribe all defaults verbatim from `config/sample.config.php`. The DERIVED `media.image.file_url` closure and the DEEP `media.magick_config` MUST match the existing slice exactly (so the Phase-2/3a tests stay green).

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter catalog_media_image_Test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/base/config/catalog/domains/media_image.php test/server/unit/catalog_media_image_Test.php
git commit -m "feat(config): catalog media_image domain (image + magick + media-common)"
```

---

### Task 5: `media_av` domain

**Files:**
- Create: `core/base/config/catalog/domains/media_av.php`
- Test: `test/server/unit/catalog_media_av_Test.php`

**Interfaces:** Produces `domains/media_av.php`.

**Classification (defaults from `config/sample.config.php`; all STATIC):** transcribe these consts verbatim — `DEDALO_AV_FOLDER` ('/av'), `DEDALO_AV_EXTENSION` ('mp4'), `DEDALO_AV_EXTENSIONS_SUPPORTED` (list), `DEDALO_AV_MIME_TYPE`, `DEDALO_AV_TYPE`, `DEDALO_AV_QUALITY_ORIGINAL`, `DEDALO_AV_QUALITY_DEFAULT` ('404'), `DEDALO_AV_AR_QUALITY` (list; REPLACE), `DEDALO_AV_POSTERFRAME_EXTENSION`, `DEDALO_AV_FFMPEG_PATH` ('/usr/bin/ffmpeg'), `DEDALO_AV_FASTSTART_PATH`, `DEDALO_AV_FFPROBE_PATH`, `DEDALO_AV_STREAMER` (null), `DEDALO_SUBTITLES_FOLDER` ('/subtitles'), `DEDALO_AV_SUBTITLES_EXTENSION` ('vtt'), `DEDALO_AV_RECOMPRESS_ALL` (int 1). Paths under `media.av.*` (e.g. `media.av.folder`, `media.av.ffmpeg_path`). (`DEDALO_AV_WATERMARK_FILE` and `DEDALO_AV_FFMPEG_SETTINGS` are MEDIA_PATH/CORE_PATH-derived → deferred to 3b.)

- [ ] **Step 1: Write the failing test** — `test/server/unit/catalog_media_av_Test.php`: assert each `media.av.*` key present with const + STATIC scope; `media.av.ar_quality` is a REPLACE list; spot-check `media.av.extension==='mp4'`, `media.av.quality_default==='404'`, `media.av.recompress_all===1`, `media.av.streamer===null`. Run (RED).
- [ ] **Step 2: Run** `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter catalog_media_av_Test` → FAIL.
- [ ] **Step 3: Create** `core/base/config/catalog/domains/media_av.php` (require_once header), transcribing every AV default verbatim from `config/sample.config.php`.
- [ ] **Step 4: Run** the filter → PASS.
- [ ] **Step 5: Commit**

```bash
git add core/base/config/catalog/domains/media_av.php test/server/unit/catalog_media_av_Test.php
git commit -m "feat(config): catalog media_av domain"
```

---

### Task 6: `media_docs` domain (pdf + 3d + svg + html_files)

**Files:**
- Create: `core/base/config/catalog/domains/media_docs.php`
- Test: `test/server/unit/catalog_media_docs_Test.php`

**Interfaces:** Produces `domains/media_docs.php`.

**Classification (all STATIC; defaults from `config/sample.config.php`; AR_QUALITY lists are REPLACE):**
- PDF: `DEDALO_PDF_FOLDER`, `DEDALO_PDF_EXTENSION`, `DEDALO_PDF_EXTENSIONS_SUPPORTED` (list), `DEDALO_PDF_ALTERNATIVE_EXTENSIONS` (list), `DEDALO_PDF_MIME_TYPE`, `DEDALO_PDF_TYPE`, `DEDALO_PDF_QUALITY_ORIGINAL`, `DEDALO_PDF_QUALITY_DEFAULT`, `DEDALO_PDF_AR_QUALITY` (list), `PDF_AUTOMATIC_TRANSCRIPTION_ENGINE` ('/usr/bin/pdftotext', binary path STATIC). Paths `media.pdf.*` (engine → `media.pdf.transcription_engine`).
- 3D: `DEDALO_3D_FOLDER`, `DEDALO_3D_EXTENSION`, `DEDALO_3D_EXTENSIONS_SUPPORTED` (list), `DEDALO_3D_MIME_TYPE`, `DEDALO_3D_QUALITY_ORIGINAL`, `DEDALO_3D_QUALITY_DEFAULT`, `DEDALO_3D_THUMB_DEFAULT`, `DEDALO_3D_AR_QUALITY` (list), `DEDALO_3D_GLTFPACK_PATH`, `DEDALO_3D_FBX2GLTF_PATH`, `DEDALO_3D_COLLADA2GLTF_PATH` (binary paths). Paths `media.3d.*`.
- SVG: `DEDALO_SVG_FOLDER`, `DEDALO_SVG_EXTENSION`, `DEDALO_SVG_EXTENSIONS_SUPPORTED` (list), `DEDALO_SVG_MIME_TYPE`, `DEDALO_SVG_QUALITY_ORIGINAL`, `DEDALO_SVG_QUALITY_DEFAULT`, `DEDALO_SVG_AR_QUALITY` (list). Paths `media.svg.*`.
- HTML: `DEDALO_HTML_FILES_FOLDER`, `DEDALO_HTML_FILES_EXTENSION`. Paths `media.html_files.*`.

- [ ] **Step 1: Write the failing test** — `test/server/unit/catalog_media_docs_Test.php`: assert all pdf/3d/svg/html keys present (const + STATIC); the three `*_AR_QUALITY` are REPLACE lists; spot-check `media.pdf.extension==='pdf'`, `media.3d.extension==='glb'`, `media.svg.mime_type==='image/svg+xml'`, `media.html_files.extension==='html'`. Run (RED).
- [ ] **Step 2: Run** `--filter catalog_media_docs_Test` → FAIL.
- [ ] **Step 3: Create** `core/base/config/catalog/domains/media_docs.php`, transcribing every pdf/3d/svg/html default verbatim from `config/sample.config.php`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit**

```bash
git add core/base/config/catalog/domains/media_docs.php test/server/unit/catalog_media_docs_Test.php
git commit -m "feat(config): catalog media_docs domain (pdf/3d/svg/html)"
```

---

### Task 7: `features` + `diffusion` + `db` + `areas` + `state` domains

The remaining settings. Five small domain files in one task (each is short; they share a reviewer gate).

**Files:**
- Create: `core/base/config/catalog/domains/features.php`, `diffusion.php`, `db.php`, `areas.php`, `state.php`
- Test: `test/server/unit/catalog_features_misc_Test.php`

**Interfaces:** Produces the five domain files.

**`features` (defaults from `config/sample.config.php`; STATIC unless noted):**
`DEDALO_UPLOAD_SERVICE_CHUNK_FILES` (int 4) → features.upload.chunk_files; `DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT` (int 50) → features.upload.max_concurrent; `DEDALO_GEO_PROVIDER` ('VARIOUS') → features.geo_provider; `DEDALO_ENTITY_MEDIA_AREA_TIPO` ('') → features.entity_media_area_tipo; `DEDALO_ENTITY_MENU_SKIP_TIPOS` (list []) → features.entity_menu_skip_tipos; `DEDALO_TEST_INSTALL` (bool true) → features.test_install; `DEDALO_LOCK_COMPONENTS` (bool true) → features.lock_components; `DEDALO_MEDIA_ACCESS_MODE` (false) → features.media_access_mode; `DEDALO_PROTECT_MEDIA_FILES` (bool false; `alias_of` semantics — set `const` only, no special handling this phase) → features.protect_media_files; `DEDALO_NOTIFICATIONS` (bool false) → features.notifications; `DEDALO_AR_EXCLUDE_COMPONENTS` (list []) → features.ar_exclude_components; `DEDALO_FILTER_USER_RECORDS_BY_ID` (bool false) → features.filter_user_records_by_id; `DEDALO_SEARCH_CLIENT_MAX_LIMIT` (int 1000) → features.search_client_max_limit; `IP_API` (map) → features.ip_api.

**`diffusion`:** `DEDALO_DIFFUSION_SOCKET_PATH` (string '/tmp/diffusion.sock', STATIC) → diffusion.socket_path; `DEDALO_DIFFUSION_SERVICE_CMD` (string '') → diffusion.service_cmd; `DEDALO_DIFFUSION_INTERNAL_TOKEN` (SECRET) → diffusion.internal_token; `DEDALO_DIFFUSION_DOMAIN` ('default') → diffusion.domain; `DEDALO_DIFFUSION_RESOLVE_LEVELS` (int 2) → diffusion.resolve_levels; `DEDALO_PUBLICATION_CLEAN_URL` (bool false) → diffusion.publication_clean_url; `DEDALO_DIFFUSION_CUSTOM` (bool false) → diffusion.custom; `API_WEB_USER_CODE_MULTIPLE` (list of maps; the `code` leaf is secret — for THIS phase classify the whole key SECRET, no default) → diffusion.api_web_user_code_multiple; `STRUCTURE_FROM_SERVER` (bool true) → diffusion.structure_from_server; `IS_AN_ONTOLOGY_SERVER` (bool false) → diffusion.is_an_ontology_server; `ONTOLOGY_SERVERS` (SECRET — contains codes) → diffusion.ontology_servers; `IS_A_CODE_SERVER` (bool false) → diffusion.is_a_code_server; `CODE_SERVERS` (SECRET) → diffusion.code_servers.

**`db` (defaults from `config/sample.config_db.php`):** `DEDALO_DB_TYPE` ('postgresql') → db.type; `DEDALO_HOSTNAME_CONN` ('localhost') → db.hostname; `DEDALO_DB_PORT_CONN` ('5432') → db.port; `DEDALO_SOCKET_CONN` (null) → db.socket; `DEDALO_DATABASE_CONN` → db.database; `DEDALO_USERNAME_CONN` → db.username; `DEDALO_PASSWORD_CONN` (SECRET) → db.password (PRESERVE existing slice key: path `db.password`, const `DEDALO_PASSWORD_CONN`, SECRET); `SLOW_QUERY_MS` (int 6000) → db.slow_query_ms; `DEDALO_DB_MANAGEMENT` (bool true) → db.management; `DB_BIN_PATH` ('/usr/bin/') → db.bin_path; `PHP_BIN_PATH` → db.php_bin_path; MariaDB: `MYSQL_DEDALO_HOSTNAME_CONN` → db.mysql.hostname; `MYSQL_DEDALO_USERNAME_CONN` → db.mysql.username; `MYSQL_DEDALO_PASSWORD_CONN` (SECRET) → db.mysql.password; `MYSQL_DEDALO_DATABASE_CONN` → db.mysql.database; `MYSQL_DEDALO_DB_PORT_CONN` (int 3306) → db.mysql.port; `MYSQL_DEDALO_SOCKET_CONN` (null) → db.mysql.socket; `MYSQL_DB_BIN_PATH` → db.mysql.bin_path.

**`areas` (from `config/sample.config_areas.php`):** `areas.deny` (list, const null, default `['dd137','rsc1','hierarchy20']`); `areas.allow` (list, const null, default `[]`).

**`state` (STATE scope; from `config/sample.config_core.php` + sample.config.php):** `DEDALO_INSTALL_STATUS` (STATE, no compiled default) → state.install_status; `DEDALO_MAINTENANCE_MODE` (STATE) → state.maintenance_mode; `DEDALO_INFORMATION` (STATE/secret-ish, no default) → state.information; `DEDALO_INFO_KEY` (STATE, no default) → state.info_key.

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/catalog_features_misc_Test.php` with a `load($file)` helper, asserting per domain file: every listed key present (path + const), the SECRET keys (`diffusion.internal_token`, `diffusion.api_web_user_code_multiple`, `diffusion.ontology_servers`, `diffusion.code_servers`, `db.password`, `db.mysql.password`) have scope SECRET, the STATE keys (`state.install_status`, `state.maintenance_mode`, `state.information`, `state.info_key`) have scope STATE, `areas.deny`/`areas.allow` have const null, and spot-check defaults (`features.search_client_max_limit===1000`, `features.geo_provider==='VARIOUS'`, `db.type==='postgresql'`, `db.slow_query_ms===6000`, `areas.deny` contains 'dd137'). Run (RED).

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter catalog_features_misc_Test`
Expected: FAIL — domain files missing.

- [ ] **Step 3: Create the five domain files**

Create each of `features.php`, `diffusion.php`, `db.php`, `areas.php`, `state.php` under `core/base/config/catalog/domains/` (require_once header each). Transcribe defaults verbatim from the respective sample file. SECRET/STATE keys get NO `default:`. `db.password` MUST keep the exact identity the Phase-2 slice used (path `db.password`, const `DEDALO_PASSWORD_CONN`, scope SECRET).

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter catalog_features_misc_Test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/base/config/catalog/domains/features.php core/base/config/catalog/domains/diffusion.php core/base/config/catalog/domains/db.php core/base/config/catalog/domains/areas.php core/base/config/catalog/domains/state.php test/server/unit/catalog_features_misc_Test.php
git commit -m "feat(config): catalog features/diffusion/db/areas/state domains"
```

---

### Task 8: Aggregate `catalog.php` + coverage/consistency gate

Replace the 7-key representative slice with the merge of all domain files, and add the coverage + consistency + scope test. The existing 91-test suite must stay green (the slice keys are subsumed).

**Files:**
- Modify: `core/base/config/catalog/catalog.php`
- Create: `test/server/unit/catalog_coverage_Test.php`

**Interfaces:**
- Consumes: all `domains/*.php` (Tasks 1–7).
- Produces: `catalog.php` returns the merged `config_key[]` from all domains.

- [ ] **Step 1: Write the failing coverage/consistency test**

Create `test/server/unit/catalog_coverage_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';

final class catalog_coverage_Test extends TestCase {

	/** @return config_key[] */
	private function catalog() : array {
		return require dirname(__DIR__, 3) . '/core/base/config/catalog/catalog.php';
	}

	public function test_no_duplicate_paths_or_consts() : void {
		$paths = $consts = [];
		foreach ($this->catalog() as $k) {
			$this->assertArrayNotHasKey($k->path, $paths, "duplicate path {$k->path}");
			$paths[$k->path] = true;
			if ($k->const !== null) {
				$this->assertArrayNotHasKey($k->const, $consts, "duplicate const {$k->const}");
				$consts[$k->const] = true;
			}
		}
	}

	public function test_all_types_are_known() : void {
		$ok = ['int', 'bool', 'string', 'list', 'map'];
		foreach ($this->catalog() as $k) {
			$this->assertContains($k->type, $ok, "bad type '{$k->type}' for {$k->path}");
		}
	}

	public function test_request_user_secret_state_sets_exact() : void {
		$byScope = ['request' => [], 'user' => [], 'secret' => [], 'state' => []];
		foreach ($this->catalog() as $k) {
			$s = $k->scope->value;
			if (isset($byScope[$s])) { $byScope[$s][] = $k->const ?? $k->path; sort($byScope[$s]); }
		}
		$expectRequest = ['DEDALO_APPLICATION_LANG', 'DEDALO_DATA_LANG']; sort($expectRequest);
		$expectUser    = ['LOGGER_LEVEL', 'SHOW_DEBUG', 'SHOW_DEVELOPER']; sort($expectUser);
		$expectSecret  = ['API_WEB_USER_CODE_MULTIPLE', 'CODE_SERVERS', 'DEDALO_DIFFUSION_INTERNAL_TOKEN', 'DEDALO_PASSWORD_CONN', 'DEDALO_SALT_STRING', 'MYSQL_DEDALO_PASSWORD_CONN', 'ONTOLOGY_SERVERS']; sort($expectSecret);
		$expectState   = ['DEDALO_INFORMATION', 'DEDALO_INFO_KEY', 'DEDALO_INSTALL_STATUS', 'DEDALO_MAINTENANCE_MODE']; sort($expectState);
		$this->assertSame($expectRequest, $byScope['request'], 'REQUEST set drift');
		$this->assertSame($expectUser, $byScope['user'], 'USER set drift');
		$this->assertSame($expectSecret, $byScope['secret'], 'SECRET set drift');
		$this->assertSame($expectState, $byScope['state'], 'STATE set drift');
	}

	public function test_secret_and_state_keys_have_no_compiled_default() : void {
		foreach ($this->catalog() as $k) {
			if (in_array($k->scope, [config_scope::SECRET, config_scope::STATE], true)) {
				$this->assertNull($k->default, "{$k->path} (".$k->scope->value.") must not ship a compiled default");
			}
		}
	}

	public function test_minimum_catalog_size() : void {
		// full config-settings catalog (paths deferred to 3b) — sanity floor
		$this->assertGreaterThanOrEqual(110, count($this->catalog()), 'catalog smaller than expected');
	}

	public function test_slice_continuity_preserved() : void {
		$by = [];
		foreach ($this->catalog() as $k) { $by[$k->path] = $k; }
		$this->assertSame(222, $by['media.image.thumb_width']->default);
		$this->assertSame('DEDALO_IMAGE_THUMB_WIDTH', $by['media.image.thumb_width']->const);
		$this->assertSame(config_scope::REQUEST, $by['lang.application_lang']->scope);
		$this->assertSame(config_scope::SECRET, $by['db.password']->scope);
		$this->assertSame(config_scope::DERIVED, $by['media.image.file_url']->scope);
		$this->assertSame('/dedalo/core', $by['paths.core_url']->default);
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter catalog_coverage_Test`
Expected: FAIL — `catalog.php` still returns only the 7-key slice (size floor + scope-set assertions fail).

- [ ] **Step 3: Rewrite `catalog.php` to aggregate all domains**

Replace `core/base/config/catalog/catalog.php` so it merges every domain file plus the preserved `paths.core_url` slice key (the only path kept this phase; the rest of the path family is Phase 3b):

```php
<?php declare(strict_types=1);

// Dédalo v7 config catalog — aggregates all domain files into one config_key[].
// The install-root-derived path family is intentionally deferred to Phase 3b;
// paths.core_url is retained here for continuity with the config-core machinery.

require_once __DIR__ . '/../class.config_scope.php';
require_once __DIR__ . '/../class.config_merge.php';
require_once __DIR__ . '/../class.config_key.php';

$keys = [
	// retained path slice key (full path family lands in Phase 3b)
	new config_key(path: 'paths.core_url', const: 'DEDALO_CORE_URL', type: 'string', default: '/dedalo/core', doc: 'Web URL of the core directory.'),
];

foreach ([
	'identity', 'runtime', 'lang', 'defaults',
	'media_image', 'media_av', 'media_docs',
	'features', 'diffusion', 'db', 'areas', 'state',
] as $domain) {
	foreach (require __DIR__ . '/domains/' . $domain . '.php' as $key) {
		$keys[] = $key;
	}
}

return $keys;
```

- [ ] **Step 4: Run the coverage test, then the FULL suite**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter catalog_coverage_Test`
Expected: PASS (6 tests).

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml`
Expected: PASS — the full hermetic suite, including the pre-existing 91 tests (config_compiler/config/compat_shim/boot tests still green because the slice keys are preserved) + all new catalog-domain tests. Report the total.

- [ ] **Step 5: Commit**

```bash
git add core/base/config/catalog/catalog.php test/server/unit/catalog_coverage_Test.php
git commit -m "feat(config): aggregate full catalog + coverage/scope-consistency gate"
```

---

## Final verification (after all tasks)

- [ ] `vendor/bin/phpunit -c test/server/phpunit.unit.xml` — full suite green (prior 91 + the new catalog-domain + coverage tests).
- [ ] Confirm the existing config-core/boot tests still pass unchanged (slice continuity): `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter "config_compiler_Test|config_Test|compat_shim_Test|boot_config_phases_Test"` — all green.
- [ ] `grep -rnE "vendor/autoload|^use [A-Z]" core/base/config/catalog/` — no matches.

## Self-review notes (coverage vs the v6 sample inventory)

- Every genuine config SETTING from `sample.config.php` / `sample.config_db.php` / `sample.config_areas.php` / `sample.config_core.php` is assigned to a domain task (identity, runtime, lang, defaults, media_image, media_av, media_docs, features, diffusion, db, areas, state). ✓
- Scope classification fixed by the coverage test's exact REQUEST/USER/SECRET/STATE sets. ✓
- Slice continuity (Phase-2/3a tests stay green) asserted by `test_slice_continuity_preserved` + the full-suite run. ✓
- **Deferred to Phase 3b:** the install-root-derived path family (`DEDALO_*_PATH`/`*_URL`, `HOST`, `PROTOCOL`, `ROOT_WEB`, `MEDIA_PATH`, `SESSIONS_PATH`, `BACKUP_PATH*`, `*_FOLDER_PATH`, `COLOR_PROFILES_PATH`, `AV_WATERMARK_FILE`, `AV_FFMPEG_SETTINGS`, `UPLOAD_TMP_DIR/URL`, `UPDATE_LOG_FILE`, `SOURCE_VERSION_LOCAL_DIR`, the structural `DEDALO_CONFIG/CORE/SHARED/TOOLS/LIB` names + their paths/urls, `WIDGETS/EXTRAS/INSTALL` paths, `API_URL`, `DIFFUSION_PATH/API_URL`, `TOOL_*_FOLDER_PATH/URL`, `ONTOLOGY_DATA_IO_*`).
- **Optional/commented-out** sample defines (`DEDALO_CORS`, `DEDALO_MCP_PROXY_URL`, `GEONAMES_ACCOUNT_USERNAME`, `PDF_OCR_ENGINE`, `DEDALO_ADDITIONAL_TOOLS`, `TOOLS_REQUIRE_API_ACTIONS`, `EXCLUDE_DIFFUSION_ELEMENTS`, etc.) are intentionally NOT cataloged this phase (add when a consumer needs them).
- **Deferred (later pass):** readonly domain DTOs + backed enums (`GeoProvider`, `SessionHandler`, `MediaAccessMode`, `LogLevel`, `DateOrder`) and the `constant_map` alias/deprecation columns.
