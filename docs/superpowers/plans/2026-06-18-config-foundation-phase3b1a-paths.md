# Config Foundation — Phase 3b-1a: Paths (boot path resolution) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the install-derived path family (deferred from Phase 2b) by modeling it as DERIVED catalog keys computed from four boot-resolved base keys, plus a `boot_paths` resolver that computes those bases from the runtime — all hermetically tested and additive (NOT wired to the live boot).

**Architecture:** Four base keys (`paths.root`, `paths.root_web`, `paths.host`, `paths.protocol`) are STATIC with dev defaults; at boot (a later 3b unit) `boot_paths` computes the real values and feeds them to the compiler as the highest-precedence override layer. Every `DEDALO_*_PATH`/`*_URL` becomes a DERIVED key whose closure builds its value from the resolved bases (and, where v6 did, from other resolved keys like `media.av.folder` or `identity.entity`). The compiler already seeds STATIC first then runs DERIVED closures in catalog order, so ordering base-then-derived within the file makes intra-catalog dependencies resolve.

**Tech Stack:** PHP 8.1+, PHPUnit ^13 (hermetic harness: `vendor/bin/phpunit -c test/server/phpunit.unit.xml`), no Composer runtime dependency.

## Global Constraints

- **PHP 8.1+**, no Composer dependency. New code is dependency-free and `require`able directly. **Additive** — this unit does NOT modify `config/config.php` or any live boot path (the cutover is a later, gated 3b unit).
- **Source of truth for derivations:** `config/sample.config.php` (path section lines 26-112 + scattered: SESSIONS_PATH L183, BACKUP_PATH L283-286, UPDATE_LOG_FILE L313, MEDIA_PATH/URL L408-409, AV_FFMPEG_SETTINGS L444, AV_WATERMARK_FILE L452, IMAGE_FILE_URL L486, COLOR_PROFILES_PATH L502, UPLOAD_TMP L587-588, TOOL_EXPORT/IMPORT L629-632, ONTOLOGY_DATA_IO L809-810, SOURCE_VERSION_LOCAL_DIR L860).
- **Base resolution (v6 semantics):** `paths.root` = `dirname(<config dir>, 1)` i.e. the install root that contains `config/`, `core/`, etc.; `paths.root_web` = `/` + first REQUEST_URI segment (web) or `/dedalo` (CLI); `paths.host` = `$_SERVER['HTTP_HOST']` (web) or `localhost` (CLI); `paths.protocol` = `https://` if `$_SERVER['HTTPS']==='on'` else `http://`.
- **Continuity (MUST hold):** `paths.core_url` changes from STATIC (the Phase-2 slice key) to DERIVED. The two existing tests that assumed STATIC must be migrated so the suite stays green AND `config('paths.core_url')` still resolves to `/dedalo/core` under default bases: (1) `config_compiler_Test::test_derived_recomputed_after_override` (override `paths.root_web` instead of `paths.core_url`); (2) `catalog_coverage_Test::test_slice_continuity_preserved` (assert `paths.core_url` scope DERIVED + its resolved value, not `->default`). `media.image.file_url` (DERIVED from `paths.core_url`) stays in the `media_image` domain unchanged.
- **Scope:** the four bases are STATIC (boot overrides them); all path keys are DERIVED. (The DERIVED_REQUEST recompute-per-request nuance for `host`/`root_web` under the long-lived worker is a Phase-5 concern; under FPM, STATIC-base-with-boot-override is correct and emits the same constants v6 did.)
- **Test command:** `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter <name>` from repo root.

---

## File Structure

- `core/base/boot/class.boot_paths.php` — **new.** `boot_paths::resolve(string $config_dir, array $server, string $sapi): array` — pure; returns the base override map `['paths.root'=>…, 'paths.root_web'=>…, 'paths.host'=>…, 'paths.protocol'=>…]`.
- `core/base/config/catalog/domains/paths.php` — **new.** The four STATIC base keys + ~35 DERIVED path keys.
- `core/base/config/catalog/catalog.php` — **modify.** Remove the inline `paths.core_url` seed; add `'paths'` to the domain list.
- Tests: `test/server/unit/boot_paths_Test.php` (new), `test/server/unit/catalog_paths_Test.php` (new); **modify** `test/server/unit/config_compiler_Test.php` and `test/server/unit/catalog_coverage_Test.php` (continuity migration).

**Path family (DERIVED; closures read the resolved map; LIST IN THIS ORDER so first-level resolves before second-level):**

| key (path) | const | derives from |
|---|---|---|
| paths.config_path | DEDALO_CONFIG_PATH | root.'/config' |
| paths.core_path | DEDALO_CORE_PATH | root.'/core' |
| paths.core_url | DEDALO_CORE_URL | root_web.'/core' |
| paths.shared_path | DEDALO_SHARED_PATH | root.'/shared' |
| paths.shared_url | DEDALO_SHARED_URL | root_web.'/shared' |
| paths.tools_path | DEDALO_TOOLS_PATH | root.'/tools' |
| paths.tools_url | DEDALO_TOOLS_URL | root_web.'/tools' |
| paths.lib_path | DEDALO_LIB_PATH | root.'/lib' |
| paths.lib_url | DEDALO_LIB_URL | root_web.'/lib' |
| paths.install_path | DEDALO_INSTALL_PATH | root.'/install' |
| paths.install_url | DEDALO_INSTALL_URL | root_web.'/install' |
| paths.diffusion_path | DEDALO_DIFFUSION_PATH | root.'/diffusion' |
| paths.diffusion_api_url | DEDALO_DIFFUSION_API_URL | root_web.'/diffusion/api/v1/' |
| paths.media_path | DEDALO_MEDIA_PATH | root.'/media' |
| paths.media_url | DEDALO_MEDIA_URL | root_web.'/media' |
| paths.sessions_path | DEDALO_SESSIONS_PATH | dirname(root,2).'/sessions' |
| paths.backup_path | DEDALO_BACKUP_PATH | dirname(root,2).'/backups' |
| paths.widgets_path | DEDALO_WIDGETS_PATH | core_path.'/widgets' |
| paths.widgets_url | DEDALO_WIDGETS_URL | core_url.'/widgets' |
| paths.extras_path | DEDALO_EXTRAS_PATH | core_path.'/extras' |
| paths.extras_url | DEDALO_EXTRAS_URL | core_url.'/extras' |
| paths.api_url | DEDALO_API_URL | core_url.'/api/v1/json/' |
| paths.update_log_file | UPDATE_LOG_FILE | config_path.'/update.log' |
| paths.color_profiles_path | COLOR_PROFILES_PATH | core_path.'/media_engine/lib/color_profiles_icc/' |
| paths.av_ffmpeg_settings | DEDALO_AV_FFMPEG_SETTINGS | core_path.'/media_engine/lib/ffmpeg_settings' |
| paths.backup_path_temp | DEDALO_BACKUP_PATH_TEMP | backup_path.'/temp' |
| paths.backup_path_db | DEDALO_BACKUP_PATH_DB | backup_path.'/db' |
| paths.backup_path_ontology | DEDALO_BACKUP_PATH_ONTOLOGY | backup_path.'/ontology' |
| paths.av_watermark_file | DEDALO_AV_WATERMARK_FILE | media_path.'/'.media.av.folder.'/watermark/watermark.png' |
| paths.upload_tmp_dir | DEDALO_UPLOAD_TMP_DIR | media_path.'/upload/service_upload/tmp' |
| paths.upload_tmp_url | DEDALO_UPLOAD_TMP_URL | media_url.'/upload/service_upload/tmp' |
| paths.tool_export_folder_path | DEDALO_TOOL_EXPORT_FOLDER_PATH | media_path.'/export/files' |
| paths.tool_export_folder_url | DEDALO_TOOL_EXPORT_FOLDER_URL | media_url.'/export/files' |
| paths.tool_import_csv_path | DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH | media_path.'/import/files' |
| paths.ontology_data_io_dir | ONTOLOGY_DATA_IO_DIR | install_path.'/import/ontology' |
| paths.ontology_data_io_url | ONTOLOGY_DATA_IO_URL | install_url.'/import/ontology' |
| paths.source_version_local_dir | DEDALO_SOURCE_VERSION_LOCAL_DIR | '/tmp/'.identity.entity |

Base keys (STATIC, dev defaults — boot overrides): `paths.root` (DEDALO_ROOT_PATH, default `''`), `paths.root_web` (DEDALO_ROOT_WEB, default `'/dedalo'`), `paths.host` (DEDALO_HOST, default `'localhost'`), `paths.protocol` (DEDALO_PROTOCOL, default `'http://'`).

---

### Task 1: `boot_paths` resolver

Pure computation of the four base values from the runtime, returned as a compiler override-layer map.

**Files:**
- Create: `core/base/boot/class.boot_paths.php`
- Test: `test/server/unit/boot_paths_Test.php`

**Interfaces:**
- Consumes: nothing.
- Produces: `boot_paths::resolve(string $config_dir, array $server, string $sapi): array` — `$config_dir` is the absolute path of the Dédalo `config/` directory (the live boot will pass `__DIR__`); `$server` is a `$_SERVER`-like array; `$sapi` is the PHP SAPI name. Returns `['paths.root'=>string, 'paths.root_web'=>string, 'paths.host'=>string, 'paths.protocol'=>string]`.

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/boot_paths_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_paths.php';

final class boot_paths_Test extends TestCase {

	public function test_web_resolution() : void {
		$r = boot_paths::resolve(
			'/srv/dedalo/config',
			['HTTP_HOST' => 'example.org', 'HTTPS' => 'on', 'REQUEST_URI' => '/dedalo/core/api/v1/json/'],
			'fpm-fcgi'
		);
		$this->assertSame('/srv/dedalo', $r['paths.root']);        // dirname(config_dir)
		$this->assertSame('/dedalo', $r['paths.root_web']);        // '/' . first REQUEST_URI segment
		$this->assertSame('example.org', $r['paths.host']);
		$this->assertSame('https://', $r['paths.protocol']);
	}

	public function test_cli_resolution() : void {
		$r = boot_paths::resolve('/srv/dedalo/config', [], 'cli');
		$this->assertSame('/srv/dedalo', $r['paths.root']);
		$this->assertSame('/dedalo', $r['paths.root_web']);        // CLI default
		$this->assertSame('localhost', $r['paths.host']);          // CLI default
		$this->assertSame('http://', $r['paths.protocol']);        // no HTTPS
	}

	public function test_http_when_https_absent_or_off() : void {
		$off = boot_paths::resolve('/x/config', ['HTTP_HOST' => 'h', 'HTTPS' => 'off', 'REQUEST_URI' => '/d/x'], 'fpm-fcgi');
		$this->assertSame('http://', $off['paths.protocol']);
		$this->assertSame('/d', $off['paths.root_web']);
	}

	public function test_missing_host_is_empty_string_on_web() : void {
		$r = boot_paths::resolve('/x/config', ['REQUEST_URI' => '/d/x'], 'fpm-fcgi');
		$this->assertSame('', $r['paths.host']);  // $_SERVER['HTTP_HOST'] ?? '' (v6 line 33)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter boot_paths_Test`
Expected: FAIL/ERROR — `Failed opening required '.../class.boot_paths.php'`.

- [ ] **Step 3: Create the resolver**

Create `core/base/boot/class.boot_paths.php`:

```php
<?php declare(strict_types=1);

/**
* BOOT_PATHS
* Resolves the four base path values from the runtime (the install location and
* the request), returned as a compiler override-layer map. The DERIVED path
* catalog keys (paths.*_path / *_url) compute everything else from these bases.
* Pure: inputs are passed in (the live boot passes __DIR__, $_SERVER, php_sapi_name()).
*/
final class boot_paths {

	/**
	* @param string $config_dir absolute path of the Dédalo config/ directory
	* @param array<string,mixed> $server a $_SERVER-like array
	* @param string $sapi php_sapi_name()
	* @return array<string,string> base override map for paths.root/root_web/host/protocol
	*/
	public static function resolve(string $config_dir, array $server, string $sapi) : array {

		$is_cli = ($sapi === 'cli');

		$root = dirname($config_dir); // the install root that contains config/, core/, ...

		if ($is_cli) {
			$root_web = '/dedalo';
			$host     = 'localhost';
		} else {
			$uri      = (string)($server['REQUEST_URI'] ?? '');
			$segments = explode('/', $uri);
			$root_web = '/' . ($segments[1] ?? '');
			$host     = (string)($server['HTTP_HOST'] ?? '');
		}

		$protocol = (isset($server['HTTPS']) && $server['HTTPS'] === 'on') ? 'https://' : 'http://';

		return [
			'paths.root'      => $root,
			'paths.root_web'  => $root_web,
			'paths.host'      => $host,
			'paths.protocol'  => $protocol,
		];
	}//end resolve
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter boot_paths_Test`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add core/base/boot/class.boot_paths.php test/server/unit/boot_paths_Test.php
git commit -m "feat(boot): boot_paths resolver (root/root_web/host/protocol from runtime)"
```

---

### Task 2: `paths` catalog domain

The four STATIC base keys + the ~35 DERIVED path keys.

**Files:**
- Create: `core/base/config/catalog/domains/paths.php`
- Test: `test/server/unit/catalog_paths_Test.php`

**Interfaces:**
- Consumes: `config_key`, `config_scope`; the path-family table above.
- Produces: `domains/paths.php` returns `config_key[]` — 4 STATIC base keys (defaults: root `''`, root_web `'/dedalo'`, host `'localhost'`, protocol `'http://'`) + the ~35 DERIVED keys listed in the File Structure table, **ordered so each derived key's dependencies appear earlier** (bases first; then config_path/core_path/core_url/…/media_path/media_url/install_path/install_url/backup_path; then second-level widgets_*/extras_*/api_url/update_log_file/color_profiles_path/av_ffmpeg_settings/backup_path_temp|db|ontology/upload_*/tool_*/ontology_data_io_*; av_watermark_file after media_path).

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/catalog_paths_Test.php`. Use a `load()` helper returning keys-by-path. Assert: the 4 base keys are STATIC with the exact dev defaults; every path key in the table is present, scope DERIVED, with the exact const; and — the core check — **resolve the derived values via the closures** against a base map and assert the v6-equivalent results:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_compiler.php';

final class catalog_paths_Test extends TestCase {

	/** @return array<string,config_key> */
	private function load() : array {
		$by = [];
		foreach (require dirname(__DIR__, 3) . '/core/base/config/catalog/domains/paths.php' as $k) { $by[$k->path] = $k; }
		return $by;
	}

	public function test_base_keys_static_with_dev_defaults() : void {
		$by = $this->load();
		$this->assertSame(config_scope::STATIC, $by['paths.root']->scope);
		$this->assertSame('', $by['paths.root']->default);
		$this->assertSame('/dedalo', $by['paths.root_web']->default);
		$this->assertSame('localhost', $by['paths.host']->default);
		$this->assertSame('http://', $by['paths.protocol']->default);
		$this->assertSame('DEDALO_ROOT_PATH', $by['paths.root']->const);
		$this->assertSame('DEDALO_ROOT_WEB', $by['paths.root_web']->const);
	}

	public function test_path_keys_are_derived_with_correct_const() : void {
		$by = $this->load();
		$expect = [
			'paths.core_path' => 'DEDALO_CORE_PATH', 'paths.core_url' => 'DEDALO_CORE_URL',
			'paths.media_path' => 'DEDALO_MEDIA_PATH', 'paths.sessions_path' => 'DEDALO_SESSIONS_PATH',
			'paths.api_url' => 'DEDALO_API_URL', 'paths.av_watermark_file' => 'DEDALO_AV_WATERMARK_FILE',
		];
		foreach ($expect as $path => $const) {
			$this->assertArrayHasKey($path, $by, "missing $path");
			$this->assertSame(config_scope::DERIVED, $by[$path]->scope, "$path scope");
			$this->assertSame($const, $by[$path]->const, "$path const");
			$this->assertInstanceOf(\Closure::class, $by[$path]->derived, "$path closure");
		}
	}

	public function test_derived_values_resolve_v6_equivalent() : void {
		// resolve the whole catalog with boot base overrides + assert path family values
		$catalog = require dirname(__DIR__, 3) . '/core/base/config/catalog/catalog.php';
		$bases = [['paths.root' => '/srv/dedalo', 'paths.root_web' => '/dedalo']];
		$r = config_compiler::resolve($catalog, $bases);
		$this->assertSame('/srv/dedalo/core', $r['paths.core_path']);
		$this->assertSame('/dedalo/core', $r['paths.core_url']);
		$this->assertSame('/srv/dedalo/media', $r['paths.media_path']);
		$this->assertSame('/srv/sessions', $r['paths.sessions_path']);           // dirname(root,2).'/sessions'
		$this->assertSame('/dedalo/core/api/v1/json/', $r['paths.api_url']);      // core_url.'/api/v1/json/'
		$this->assertSame('/srv/dedalo/core/widgets', $r['paths.widgets_path']);  // core_path.'/widgets'
		$this->assertSame('/srv/dedalo/media//av/watermark/watermark.png', $r['paths.av_watermark_file']); // media_path.'/'.av.folder.'/watermark/watermark.png' (av.folder='/av')
	}
}
```
(NOTE: `paths.av_watermark_file` value reproduces v6's `DEDALO_MEDIA_PATH .'/'. DEDALO_AV_FOLDER . '/watermark/watermark.png'` where `DEDALO_AV_FOLDER` is `'/av'` — the double slash `media//av` is the v6 literal; reproduce it verbatim.)

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter catalog_paths_Test`
Expected: FAIL — `domains/paths.php` missing (and `test_derived_values_resolve_v6_equivalent` also needs Task 3's catalog wiring; it will pass once Task 3 lands — run it again there).

- [ ] **Step 3: Create the domain file**

Create `core/base/config/catalog/domains/paths.php` (require_once the config classes). Define the 4 STATIC base keys, then the DERIVED keys IN DEPENDENCY ORDER, each a `static fn(array $r): string` building from `$r['paths.root']` / `$r['paths.root_web']` / earlier-resolved keys / `$r['media.av.folder']` / `$r['identity.entity']`, reproducing the v6 expressions verbatim. Example entries:

```php
	new config_key(path: 'paths.root', const: 'DEDALO_ROOT_PATH', type: 'string', default: '', doc: 'Install root (boot-resolved).'),
	new config_key(path: 'paths.root_web', const: 'DEDALO_ROOT_WEB', type: 'string', default: '/dedalo', doc: 'Web root (boot-resolved).'),
	new config_key(path: 'paths.host', const: 'DEDALO_HOST', type: 'string', default: 'localhost', doc: 'HTTP host (boot-resolved).'),
	new config_key(path: 'paths.protocol', const: 'DEDALO_PROTOCOL', type: 'string', default: 'http://', doc: 'Protocol (boot-resolved).'),
	new config_key(path: 'paths.core_path', const: 'DEDALO_CORE_PATH', type: 'string', scope: config_scope::DERIVED, derived: static fn(array $r): string => $r['paths.root'] . '/core', doc: 'core dir.'),
	new config_key(path: 'paths.core_url', const: 'DEDALO_CORE_URL', type: 'string', scope: config_scope::DERIVED, derived: static fn(array $r): string => $r['paths.root_web'] . '/core', doc: 'core URL.'),
	new config_key(path: 'paths.sessions_path', const: 'DEDALO_SESSIONS_PATH', type: 'string', scope: config_scope::DERIVED, derived: static fn(array $r): string => dirname($r['paths.root'], 2) . '/sessions', doc: 'sessions dir.'),
	new config_key(path: 'paths.av_watermark_file', const: 'DEDALO_AV_WATERMARK_FILE', type: 'string', scope: config_scope::DERIVED, derived: static fn(array $r): string => $r['paths.media_path'] . '/' . $r['media.av.folder'] . '/watermark/watermark.png', doc: 'AV watermark file.'),
	// ... all remaining path keys from the table, in dependency order ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter catalog_paths_Test`
Expected: the base + derived-scope tests PASS; `test_derived_values_resolve_v6_equivalent` may still fail until Task 3 wires the domain into `catalog.php` — that's expected; it goes green in Task 3.

- [ ] **Step 5: Commit**

```bash
git add core/base/config/catalog/domains/paths.php test/server/unit/catalog_paths_Test.php
git commit -m "feat(config): catalog paths domain (base keys + derived path family)"
```

---

### Task 3: Aggregate paths + migrate the two continuity tests

Wire `paths` into the catalog (replacing the inline `paths.core_url` seed), and migrate the two existing tests that assumed `paths.core_url` was STATIC. The full suite must end green.

**Files:**
- Modify: `core/base/config/catalog/catalog.php`
- Modify: `test/server/unit/config_compiler_Test.php`
- Modify: `test/server/unit/catalog_coverage_Test.php`

**Interfaces:**
- Consumes: `domains/paths.php` (Task 2).
- Produces: `catalog.php` returns the merged catalog including the `paths` domain; `paths.core_url` is now sourced (DERIVED) from the `paths` domain, not the inline seed.

- [ ] **Step 1: Update `catalog.php`**

In `core/base/config/catalog/catalog.php`: REMOVE the inline `paths.core_url` `config_key` from the `$keys` seed (it now comes from the `paths` domain), and ADD `'paths'` to the FRONT of the domain-name array (so base keys resolve before media's `file_url` etc.). The seed becomes empty `$keys = [];` and the domain list starts with `'paths'`, then `'identity'`, `'runtime'`, … :

```php
$keys = [];

foreach ([
	'paths',
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

- [ ] **Step 2: Migrate `config_compiler_Test::test_derived_recomputed_after_override`**

This test currently overrides `paths.core_url` directly (now DERIVED → overrides are ignored for non-STATIC keys). It also predates the `paths` domain and used a tiny inline catalog in some cases. Update it to override the STATIC base `paths.root_web` and assert the derived `paths.core_url` + `media.image.file_url` recompute. Replace the method body so it loads the real catalog and overrides the base:

```php
	public function test_derived_recomputed_after_override() : void {
		$catalog = require dirname(__DIR__, 3) . '/core/base/config/catalog/catalog.php';
		$r = config_compiler::resolve($catalog, [['paths.root_web' => '/srv/core-root']]);
		$this->assertSame('/srv/core-root/core', $r['paths.core_url']);
		$this->assertSame('/srv/core-root/core/media_engine/img.php', $r['media.image.file_url']);
	}
```
(If the existing test used a small inline catalog with a `paths.core_url` STATIC key, replace that fixture usage with the real catalog as above. Verify the other config_compiler_Test methods that referenced `paths.core_url` as STATIC — `test_resolve_defaults_only` asserts `$r['paths.core_url'] === '/dedalo/core'`, which STILL holds because the base default `paths.root_web` is `/dedalo` → core_url `/dedalo/core`. Leave that assertion; it remains correct.)

- [ ] **Step 3: Migrate `catalog_coverage_Test::test_slice_continuity_preserved`**

`paths.core_url` is no longer STATIC-with-default. Update the slice-continuity assertion to reflect DERIVED + assert the RESOLVED value instead of `->default`:

Replace the `paths.core_url` line in that test:
```php
		$this->assertSame('/dedalo/core', $by['paths.core_url']->default);
```
with scope + resolved-value checks:
```php
		$this->assertSame(config_scope::DERIVED, $by['paths.core_url']->scope);
		$resolved = config_compiler::resolve($this->catalog(), []);
		$this->assertSame('/dedalo/core', $resolved['paths.core_url']);  // default bases → v6-equivalent
```
(Add `require_once .../class.config_compiler.php` at the top of the test if not already present.)

- [ ] **Step 4: Run the affected suites, then the FULL suite**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter "catalog_paths_Test|config_compiler_Test|catalog_coverage_Test"`
Expected: PASS (incl. `catalog_paths_Test::test_derived_values_resolve_v6_equivalent` now green with the aggregated catalog).

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml`
Expected: FULL hermetic suite green (the pre-existing config/compat_shim/boot tests still pass — `config('paths.core_url')`-equivalent resolves to `/dedalo/core`). Report the total + new catalog key count (152 + ~39 paths ≈ 191).

- [ ] **Step 5: Commit**

```bash
git add core/base/config/catalog/catalog.php test/server/unit/config_compiler_Test.php test/server/unit/catalog_coverage_Test.php
git commit -m "feat(config): aggregate paths domain; migrate core_url continuity tests to DERIVED"
```

---

## Final verification (after all tasks)

- [ ] `vendor/bin/phpunit -c test/server/phpunit.unit.xml` — full suite green.
- [ ] Confirm the boot-time integration shape: `boot_paths::resolve(...)` returns a base map whose keys (`paths.root`/`root_web`/`host`/`protocol`) are exactly the STATIC base keys the `paths` domain defines — so a future boot phase passes `[boot_paths::resolve(__DIR__, $_SERVER, php_sapi_name())]` as the compiler's override layer and the whole path family resolves to real values. (No test wires this to the live boot — that's the cutover unit.)
- [ ] `grep -rnE "vendor/autoload|^use [A-Z]" core/base/config/catalog/domains/paths.php core/base/boot/class.boot_paths.php` — no matches.

## Self-review notes

- The path family deferred in Phase 2b is now complete as DERIVED catalog keys; `boot_paths` is the resolver the cutover unit will call. ✓
- Continuity: `paths.core_url` migrated STATIC→DERIVED with both dependent tests updated; `config('paths.core_url')` still resolves to `/dedalo/core` under default bases; `media.image.file_url` unchanged. ✓
- Still additive: nothing touches `config/config.php` or the live include sites. ✓
- **Deferred to later 3b units:** the env-load / secret-gate / core_functions / logger / dd_tipos / autoloader / locale / session / request-state phases; the boot-diff gate; the `config.php`→thin-shim cutover; the worker. **Phase 5:** DERIVED_REQUEST recompute-per-request for host/root_web under the long-lived worker.
- The coverage gate's `test_minimum_catalog_size` floor (145) still holds (catalog grows to ~191); optionally bump after confirming the exact count.
