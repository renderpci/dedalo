# Config Foundation — Phase 2: Config Core (machinery + representative slice) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the catalog-driven config-core machinery end-to-end — `config_key` catalog → compiler (layer merge + derived + compiled artifact) → `config` repository + `config()` accessor → compat shim that emits `DEDALO_*` constants — proven on a representative key slice.

**Architecture:** A declarative catalog of `config_key` value objects is the single source of truth. `config_compiler` resolves layered overrides (precedence + per-key REPLACE/DEEP merge) and derived values into a flat dot-keyed array, written to an opcache-friendly artifact via atomic temp+rename, keyed by `{host}.{entity}`. `config` is a read-only singleton over that flat array with a `config('dot.path')` global. `compat_shim` turns the resolved map into legacy `DEDALO_*` `define()`s (STATIC/DERIVED only; REQUEST/USER excluded) through an injectable definer so it is unit-testable without polluting process constants.

**Tech Stack:** PHP 8.1+, PHPUnit ^13 (hermetic harness from Phase 1: `vendor/bin/phpunit -c test/server/phpunit.unit.xml`), no Composer runtime dependency.

## Global Constraints

- **PHP 8.1+**; **no Composer runtime dependency**; config-core classes are dependency-free and `require`able directly (boot wiring is Phase 3 — this phase does NOT touch the live boot path).
- **Format:** the compiled artifact is a PHP file returning a flat typed array (opcache-cacheable, no parser).
- **Compat:** the shim emits legacy `DEDALO_*` constants from the resolved config; **REQUEST/USER-scoped keys are NEVER emitted** (accessor-only); **SECRET/STATE values are not compiled into the artifact** (read live later). Use `if (!defined())` guards.
- **Merge:** default merge strategy is **REPLACE** (overriding a list/scalar replaces it wholesale, matching v6 `define()` semantics); **DEEP** is opt-in per key (for maps).
- **Layout refinement vs spec §5.1:** `.gitignore` ignores `config/*`, so SHIPPED code (catalog + config-core classes) lives under **`core/base/config/`** (tracked). Only per-install override files (`config/local/`, `config/env/`, `config/state.php`) belong under `config/` (git-ignored) — those arrive in Phase 3/4, not here.
- **Naming:** snake_case class names (codebase convention): `config`, `config_key`, `config_scope`, `config_merge`, `config_compiler`, `compat_shim`. The global reader is `config('dot.path', $default)` (PHP allows a `config` class and a `config()` function to coexist).
- **Scope of THIS plan:** the machinery + a representative key slice (paths/media/lang/db covering each scope). Populating the full ~150-key catalog is a deferred mechanical follow-on (Phase 2b).
- **Test command:** `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter <name>` from repo root. Unit tests `require_once` the class under test directly and extend `PHPUnit\Framework\TestCase`.

---

## File Structure

- `core/base/config/class.config_scope.php` — **new.** `enum config_scope: string` (the per-key scope contract).
- `core/base/config/class.config_merge.php` — **new.** `enum config_merge: string` (REPLACE | DEEP).
- `core/base/config/class.config_key.php` — **new.** `final class config_key` (one catalog entry: path, const, type, default, scope, merge, derived, doc).
- `core/base/config/catalog/catalog.php` — **new.** Returns `config_key[]` — the representative slice.
- `core/base/config/class.config_compiler.php` — **new.** Pure `resolve()` (merge + derived) + `signature()` + `cache_path()` + `write_compiled()` (atomic).
- `core/base/config/class.config.php` — **new.** `final class config` (read-only singleton) + global `config()` reader.
- `core/base/config/class.compat_shim.php` — **new.** `compat_shim::emit()` (catalog + resolved map → `DEDALO_*` defines via injectable definer).
- Tests (all **new**, under `test/server/unit/`): `config_key_Test.php`, `catalog_Test.php`, `config_compiler_Test.php`, `config_Test.php`, `compat_shim_Test.php`.

---

### Task 1: Scope/merge enums + `config_key` value object

The catalog vocabulary. Pure value types, no behavior beyond construction.

**Files:**
- Create: `core/base/config/class.config_scope.php`, `core/base/config/class.config_merge.php`, `core/base/config/class.config_key.php`
- Test: `test/server/unit/config_key_Test.php`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `enum config_scope: string { STATIC, DERIVED, DERIVED_REQUEST, REQUEST, USER, SECRET, STATE, PASSTHROUGH }` (string values = lowercase case name).
  - `enum config_merge: string { REPLACE='replace', DEEP='deep' }`.
  - `final class config_key` with readonly public props `string $path, ?string $const, string $type, mixed $default, config_scope $scope, config_merge $merge, ?\Closure $derived, string $doc` and a constructor with defaults `scope = config_scope::STATIC, merge = config_merge::REPLACE, derived = null, default = null, doc = ''`.

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/config_key_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';

final class config_key_Test extends TestCase {

	public function test_minimal_key_defaults() : void {
		$k = new config_key(path: 'media.image.thumb_width', const: 'DEDALO_IMAGE_THUMB_WIDTH', type: 'int', default: 222);
		$this->assertSame('media.image.thumb_width', $k->path);
		$this->assertSame('DEDALO_IMAGE_THUMB_WIDTH', $k->const);
		$this->assertSame('int', $k->type);
		$this->assertSame(222, $k->default);
		$this->assertSame(config_scope::STATIC, $k->scope);
		$this->assertSame(config_merge::REPLACE, $k->merge);
		$this->assertNull($k->derived);
		$this->assertSame('', $k->doc);
	}

	public function test_const_can_be_null_for_new_world_keys() : void {
		$k = new config_key(path: 'areas.deny', const: null, type: 'list', default: []);
		$this->assertNull($k->const);
	}

	public function test_scope_and_merge_overrides() : void {
		$k = new config_key(
			path: 'media.magick_config', const: 'MAGICK_CONFIG', type: 'map',
			default: ['a' => 1], scope: config_scope::STATIC, merge: config_merge::DEEP
		);
		$this->assertSame(config_merge::DEEP, $k->merge);
	}

	public function test_derived_closure_is_stored() : void {
		$fn = static fn(array $r) : string => $r['paths.core_url'] . '/x';
		$k = new config_key(path: 'media.image.file_url', const: 'DEDALO_IMAGE_FILE_URL', type: 'string', scope: config_scope::DERIVED, derived: $fn);
		$this->assertSame(config_scope::DERIVED, $k->scope);
		$this->assertInstanceOf(\Closure::class, $k->derived);
	}

	public function test_scope_enum_has_all_cases() : void {
		$names = array_map(static fn(config_scope $c) : string => $c->name, config_scope::cases());
		sort($names);
		$this->assertSame(
			['DERIVED', 'DERIVED_REQUEST', 'PASSTHROUGH', 'REQUEST', 'SECRET', 'STATE', 'STATIC', 'USER'],
			$names
		);
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter config_key_Test`
Expected: FAIL/ERROR — `Failed opening required '.../class.config_scope.php'`.

- [ ] **Step 3: Create the enums and value object**

Create `core/base/config/class.config_scope.php`:

```php
<?php declare(strict_types=1);

/**
* CONFIG_SCOPE
* Per-key contract that decides how a config key is materialized:
*  STATIC          - shipped/overridable value, compiled into the artifact, emitted as a constant
*  DERIVED         - computed at compile time from other resolved values; compiled + emitted
*  DERIVED_REQUEST - computed at boot from request state ($_SERVER); emitted, NOT compiled
*  REQUEST         - per-request value (lang); accessor-only, NEVER emitted as a constant
*  USER            - per-logged-user value (debug flags); accessor-only, NEVER emitted
*  SECRET          - from env/.env; emitted from live env, NOT compiled into the artifact
*  STATE           - machine-written runtime state; emitted from live state, NOT compiled
*  PASSTHROUGH     - migrated unknown custom define; emitted unvalidated, compiled
*/
enum config_scope : string {
	case STATIC          = 'static';
	case DERIVED         = 'derived';
	case DERIVED_REQUEST = 'derived_request';
	case REQUEST         = 'request';
	case USER            = 'user';
	case SECRET          = 'secret';
	case STATE           = 'state';
	case PASSTHROUGH     = 'passthrough';
}
```

Create `core/base/config/class.config_merge.php`:

```php
<?php declare(strict_types=1);

/**
* CONFIG_MERGE
* How a higher-precedence layer combines with a lower one for a given key.
*  REPLACE - higher layer wholly replaces the value (default; matches v6 define() semantics)
*  DEEP    - associative arrays are merged key-by-key (opt-in, for map-shaped values)
*/
enum config_merge : string {
	case REPLACE = 'replace';
	case DEEP    = 'deep';
}
```

Create `core/base/config/class.config_key.php`:

```php
<?php declare(strict_types=1);

/**
* CONFIG_KEY
* One catalog entry — the single declaration of a configuration setting.
* Everything (value, legacy constant, compilation, the shim, docs) derives
* from these fields.
*/
final class config_key {

	public function __construct(
		public readonly string       $path,                              // 'media.image.thumb_width'
		public readonly ?string      $const,                             // 'DEDALO_IMAGE_THUMB_WIDTH' | null
		public readonly string       $type,                              // 'int'|'bool'|'string'|'list'|'map'
		public readonly mixed        $default = null,
		public readonly config_scope $scope   = config_scope::STATIC,
		public readonly config_merge $merge   = config_merge::REPLACE,
		public readonly ?\Closure    $derived = null,                    // fn(array $resolved): mixed (DERIVED only)
		public readonly string       $doc     = '',
	) {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter config_key_Test`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add core/base/config/class.config_scope.php core/base/config/class.config_merge.php core/base/config/class.config_key.php test/server/unit/config_key_Test.php
git commit -m "feat(config): config_key value object + scope/merge enums (catalog vocabulary)"
```

---

### Task 2: Representative catalog slice

A small catalog exercising every scope path, used by all later tasks' tests.

**Files:**
- Create: `core/base/config/catalog/catalog.php`
- Test: `test/server/unit/catalog_Test.php`

**Interfaces:**
- Consumes: `config_key`, `config_scope`, `config_merge` (Task 1).
- Produces: `core/base/config/catalog/catalog.php` returns `config_key[]`. Keys present (path ⇒ const ⇒ scope):
  - `paths.core_url` ⇒ `DEDALO_CORE_URL` ⇒ STATIC (string, default `'/dedalo/core'`)
  - `media.image.thumb_width` ⇒ `DEDALO_IMAGE_THUMB_WIDTH` ⇒ STATIC (int, 222)
  - `media.image.extensions_supported` ⇒ `DEDALO_IMAGE_EXTENSIONS_SUPPORTED` ⇒ STATIC (list, REPLACE)
  - `media.magick_config` ⇒ `MAGICK_CONFIG` ⇒ STATIC (map, DEEP)
  - `media.image.file_url` ⇒ `DEDALO_IMAGE_FILE_URL` ⇒ DERIVED (`paths.core_url . '/media_engine/img.php'`)
  - `lang.application_lang` ⇒ `DEDALO_APPLICATION_LANG` ⇒ REQUEST (accessor-only)
  - `db.password` ⇒ `DEDALO_PASSWORD_CONN` ⇒ SECRET

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/catalog_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';

final class catalog_Test extends TestCase {

	/** @return config_key[] */
	private function load() : array {
		return require dirname(__DIR__, 3) . '/core/base/config/catalog/catalog.php';
	}

	public function test_catalog_returns_config_keys_indexed_by_path() : void {
		$catalog = $this->load();
		$this->assertNotEmpty($catalog);
		foreach ($catalog as $key) {
			$this->assertInstanceOf(config_key::class, $key);
		}
	}

	public function test_expected_keys_and_scopes_present() : void {
		$by_path = [];
		foreach ($this->load() as $k) {
			$by_path[$k->path] = $k;
		}
		$this->assertSame(config_scope::STATIC,  $by_path['media.image.thumb_width']->scope);
		$this->assertSame(config_scope::DERIVED, $by_path['media.image.file_url']->scope);
		$this->assertSame(config_scope::REQUEST, $by_path['lang.application_lang']->scope);
		$this->assertSame(config_scope::SECRET,  $by_path['db.password']->scope);
		$this->assertSame(config_merge::DEEP,    $by_path['media.magick_config']->merge);
		$this->assertSame('DEDALO_IMAGE_THUMB_WIDTH', $by_path['media.image.thumb_width']->const);
	}

	public function test_derived_key_computes_from_core_url() : void {
		$by_path = [];
		foreach ($this->load() as $k) {
			$by_path[$k->path] = $k;
		}
		$fn = $by_path['media.image.file_url']->derived;
		$this->assertSame('/x/core/media_engine/img.php', $fn(['paths.core_url' => '/x/core']));
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter catalog_Test`
Expected: FAIL/ERROR — `Failed to open stream .../catalog/catalog.php`.

- [ ] **Step 3: Create the catalog slice**

Create `core/base/config/catalog/catalog.php`:

```php
<?php declare(strict_types=1);

// Representative Dédalo v7 config catalog slice (Phase 2 machinery proof).
// The full ~150-key catalog is populated in a later mechanical pass (Phase 2b).
// Each entry is the single declaration of one setting.

require_once __DIR__ . '/../class.config_scope.php';
require_once __DIR__ . '/../class.config_merge.php';
require_once __DIR__ . '/../class.config_key.php';

return [
	new config_key(
		path: 'paths.core_url', const: 'DEDALO_CORE_URL', type: 'string',
		default: '/dedalo/core', doc: 'Web URL of the core directory.'
	),
	new config_key(
		path: 'media.image.thumb_width', const: 'DEDALO_IMAGE_THUMB_WIDTH', type: 'int',
		default: 222, doc: 'Thumbnail width in pixels.'
	),
	new config_key(
		path: 'media.image.extensions_supported', const: 'DEDALO_IMAGE_EXTENSIONS_SUPPORTED', type: 'list',
		default: ['jpg', 'jpeg', 'png', 'tif', 'tiff', 'webp', 'avif'],
		merge: config_merge::REPLACE, doc: 'Accepted image upload extensions.'
	),
	new config_key(
		path: 'media.magick_config', const: 'MAGICK_CONFIG', type: 'map',
		default: ['remove_layer_0' => false, 'is_opaque' => null],
		merge: config_merge::DEEP, doc: 'ImageMagick per-platform tweaks.'
	),
	new config_key(
		path: 'media.image.file_url', const: 'DEDALO_IMAGE_FILE_URL', type: 'string',
		scope: config_scope::DERIVED,
		derived: static fn(array $r) : string => $r['paths.core_url'] . '/media_engine/img.php',
		doc: 'Computed URL of the image proxy endpoint.'
	),
	new config_key(
		path: 'lang.application_lang', const: 'DEDALO_APPLICATION_LANG', type: 'string',
		scope: config_scope::REQUEST, doc: 'Current UI language (request-negotiated; accessor-only).'
	),
	new config_key(
		path: 'db.password', const: 'DEDALO_PASSWORD_CONN', type: 'string',
		scope: config_scope::SECRET, doc: 'PostgreSQL password (from .env; never compiled).'
	),
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter catalog_Test`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add core/base/config/catalog/catalog.php test/server/unit/catalog_Test.php
git commit -m "feat(config): representative catalog slice (paths/media/lang/db, all scopes)"
```

---

### Task 3: `config_compiler::resolve()` — layer merge + derived

The pure resolution core: seed defaults, apply ordered layer overrides with per-key REPLACE/DEEP, then compute DERIVED values. Excludes non-compilable scopes (REQUEST/USER/SECRET/STATE/DERIVED_REQUEST).

**Files:**
- Create: `core/base/config/class.config_compiler.php`
- Test: `test/server/unit/config_compiler_Test.php`

**Interfaces:**
- Consumes: `config_key`, `config_scope`, `config_merge` (Task 1); the catalog (Task 2).
- Produces: `config_compiler::resolve(array $catalog, array $layer_overrides): array` — `$catalog` is `config_key[]`; `$layer_overrides` is an ordered list (lowest→highest precedence) of `array<string,mixed>` dot-path⇒value maps; returns a flat `array<string,mixed>` of STATIC+DERIVED values only.

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/config_compiler_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_compiler.php';

final class config_compiler_Test extends TestCase {

	/** @return config_key[] */
	private function catalog() : array {
		return require dirname(__DIR__, 3) . '/core/base/config/catalog/catalog.php';
	}

	public function test_resolve_defaults_only() : void {
		$r = config_compiler::resolve($this->catalog(), []);
		$this->assertSame(222, $r['media.image.thumb_width']);
		$this->assertSame('/dedalo/core', $r['paths.core_url']);
		// derived computed from default core_url
		$this->assertSame('/dedalo/core/media_engine/img.php', $r['media.image.file_url']);
		// non-compilable scopes excluded
		$this->assertArrayNotHasKey('lang.application_lang', $r);  // REQUEST
		$this->assertArrayNotHasKey('db.password', $r);            // SECRET
	}

	public function test_scalar_override_replaces() : void {
		$r = config_compiler::resolve($this->catalog(), [['media.image.thumb_width' => 300]]);
		$this->assertSame(300, $r['media.image.thumb_width']);
	}

	public function test_list_override_replaces_not_appends() : void {
		$r = config_compiler::resolve($this->catalog(), [['media.image.extensions_supported' => ['jpg']]]);
		$this->assertSame(['jpg'], $r['media.image.extensions_supported']);
	}

	public function test_map_override_deep_merges() : void {
		$r = config_compiler::resolve($this->catalog(), [['media.magick_config' => ['is_opaque' => false]]]);
		// remove_layer_0 retained from default, is_opaque overridden
		$this->assertSame(['remove_layer_0' => false, 'is_opaque' => false], $r['media.magick_config']);
	}

	public function test_derived_recomputed_after_override() : void {
		$r = config_compiler::resolve($this->catalog(), [['paths.core_url' => '/srv/core']]);
		$this->assertSame('/srv/core/media_engine/img.php', $r['media.image.file_url']);
	}

	public function test_higher_layer_wins() : void {
		$r = config_compiler::resolve($this->catalog(), [
			['media.image.thumb_width' => 300],  // lower
			['media.image.thumb_width' => 400],  // higher
		]);
		$this->assertSame(400, $r['media.image.thumb_width']);
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter config_compiler_Test`
Expected: FAIL/ERROR — `Failed opening required '.../class.config_compiler.php'`.

- [ ] **Step 3: Create the compiler with `resolve()` + private `deep_merge()`**

Create `core/base/config/class.config_compiler.php`:

```php
<?php declare(strict_types=1);

require_once __DIR__ . '/class.config_scope.php';
require_once __DIR__ . '/class.config_merge.php';
require_once __DIR__ . '/class.config_key.php';

/**
* CONFIG_COMPILER
* Resolves the catalog + layered overrides into a flat, request-independent map
* (STATIC + DERIVED only), and persists it as an opcache-friendly PHP artifact.
* SECRET/STATE/REQUEST/USER/DERIVED_REQUEST scopes are deliberately excluded
* from the compiled artifact (read live at boot in later phases).
*/
final class config_compiler {

	/**
	* RESOLVE
	* @param config_key[] $catalog
	* @param array<int,array<string,mixed>> $layer_overrides ordered low->high precedence
	* @return array<string,mixed> flat dot-path => value (STATIC + DERIVED)
	*/
	public static function resolve(array $catalog, array $layer_overrides) : array {

		// index catalog by path
		$by_path = [];
		foreach ($catalog as $key) {
			$by_path[$key->path] = $key;
		}

		// 1. seed STATIC defaults
		$resolved = [];
		foreach ($catalog as $key) {
			if ($key->scope === config_scope::STATIC) {
				$resolved[$key->path] = $key->default;
			}
		}

		// 2. apply layer overrides (low -> high), per-key merge strategy
		foreach ($layer_overrides as $overrides) {
			foreach ($overrides as $path => $value) {
				$key = $by_path[$path] ?? null;
				if ($key === null || $key->scope !== config_scope::STATIC) {
					continue; // unknown or non-static-overridable key: ignored here
				}
				if ($key->merge === config_merge::DEEP
					&& is_array($resolved[$path] ?? null) && is_array($value)) {
					$resolved[$path] = self::deep_merge($resolved[$path], $value);
				} else {
					$resolved[$path] = $value; // REPLACE
				}
			}
		}

		// 3. compute DERIVED values from the resolved static map
		foreach ($catalog as $key) {
			if ($key->scope === config_scope::DERIVED && $key->derived !== null) {
				$resolved[$key->path] = ($key->derived)($resolved);
			}
		}

		return $resolved;
	}//end resolve

	/**
	* DEEP_MERGE
	* Recursive associative merge; $b wins on scalar collisions, assoc subarrays recurse.
	* @param array<mixed> $a
	* @param array<mixed> $b
	* @return array<mixed>
	*/
	private static function deep_merge(array $a, array $b) : array {
		foreach ($b as $k => $v) {
			if (is_array($v) && isset($a[$k]) && is_array($a[$k])) {
				$a[$k] = self::deep_merge($a[$k], $v);
			} else {
				$a[$k] = $v;
			}
		}
		return $a;
	}//end deep_merge
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter config_compiler_Test`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add core/base/config/class.config_compiler.php test/server/unit/config_compiler_Test.php
git commit -m "feat(config): config_compiler::resolve — layer merge (REPLACE/DEEP) + derived"
```

---

### Task 4: `config` repository + `config()` global reader

The read API over the resolved flat map.

**Files:**
- Create: `core/base/config/class.config.php`
- Test: `test/server/unit/config_Test.php`

**Interfaces:**
- Consumes: nothing (operates on a flat array).
- Produces:
  - `config::boot(array $flat): void` (idempotent; first call wins).
  - `config::i(): config` (throws `RuntimeException` if not booted).
  - `config::reset(): void` (test seam).
  - `config->get(string $key, mixed $default = config::UNSET): mixed` (missing key without default → `RuntimeException`).
  - `config->int/bool/str(string,$default=null)`, `config->list(string): array`, `config->has(string): bool`.
  - global `config(string $key, mixed $default = null): mixed`.

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/config_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config.php';

final class config_Test extends TestCase {

	protected function setUp() : void {
		parent::setUp();
		config::reset();
	}

	protected function tearDown() : void {
		config::reset();
	}

	public function test_boot_then_get() : void {
		config::boot(['media.image.thumb_width' => 222, 'paths.core_url' => '/dedalo/core']);
		$this->assertSame(222, config::i()->get('media.image.thumb_width'));
		$this->assertSame(222, config::i()->int('media.image.thumb_width'));
		$this->assertSame('/dedalo/core', config('paths.core_url'));
	}

	public function test_missing_key_without_default_throws() : void {
		config::boot([]);
		$this->expectException(\RuntimeException::class);
		config::i()->get('nope.missing');
	}

	public function test_missing_key_with_default_returns_default() : void {
		config::boot([]);
		$this->assertSame('fallback', config::i()->get('nope.missing', 'fallback'));
		$this->assertSame('fallback', config('nope.missing', 'fallback'));
		$this->assertFalse(config::i()->has('nope.missing'));
	}

	public function test_typed_accessors() : void {
		config::boot(['a.flag' => '1', 'a.list' => ['x', 'y'], 'a.name' => 'dedalo']);
		$this->assertTrue(config::i()->bool('a.flag'));
		$this->assertSame(['x', 'y'], config::i()->list('a.list'));
		$this->assertSame('dedalo', config::i()->str('a.name'));
	}

	public function test_i_throws_when_not_booted() : void {
		config::reset();
		$this->expectException(\RuntimeException::class);
		config::i();
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter config_Test`
Expected: FAIL/ERROR — `Failed opening required '.../class.config.php'`.

- [ ] **Step 3: Create the repository + global**

Create `core/base/config/class.config.php`:

```php
<?php declare(strict_types=1);

/**
* CONFIG
* Read-only singleton over the resolved flat config map (dot-path => value).
* New code reads via this or the config() global; legacy code keeps reading the
* DEDALO_* constants emitted by compat_shim.
*/
final class config {

	public const UNSET = "\0__config_unset__\0";

	private static ?config $instance = null;

	/** @param array<string,mixed> $values */
	private function __construct(private array $values) {}

	/** @param array<string,mixed> $flat */
	public static function boot(array $flat) : void {
		self::$instance ??= new self($flat);
	}

	public static function i() : config {
		if (self::$instance === null) {
			throw new \RuntimeException('config not booted: call config::boot() first');
		}
		return self::$instance;
	}

	/** test seam */
	public static function reset() : void {
		self::$instance = null;
	}

	public function get(string $key, mixed $default = self::UNSET) : mixed {
		if (array_key_exists($key, $this->values)) {
			return $this->values[$key];
		}
		if ($default === self::UNSET) {
			throw new \RuntimeException("config key not found: {$key}");
		}
		return $default;
	}

	public function has(string $key) : bool {
		return array_key_exists($key, $this->values);
	}

	public function int(string $key, ?int $default = null) : int {
		$v = $this->get($key, $default);
		return (int) $v;
	}

	public function bool(string $key, ?bool $default = null) : bool {
		$v = $this->get($key, $default);
		if (is_bool($v)) {
			return $v;
		}
		return in_array(strtolower(trim((string) $v)), ['1', 'true', 'yes', 'on'], true);
	}

	public function str(string $key, ?string $default = null) : string {
		return (string) $this->get($key, $default);
	}

	/** @return array<mixed> */
	public function list(string $key) : array {
		return (array) $this->get($key, []);
	}
}

if (!function_exists('config')) {
	/**
	* CONFIG (global reader)
	* Convenience accessor mirroring the house procedural style.
	* @param string $key dot-path
	* @param mixed $default returned when the key is absent
	* @return mixed
	*/
	function config(string $key, mixed $default = null) : mixed {
		return config::i()->get($key, $default);
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter config_Test`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add core/base/config/class.config.php test/server/unit/config_Test.php
git commit -m "feat(config): config read-only repository + config() global accessor"
```

---

### Task 5: `config_compiler` artifact — signature, atomic write, `{host}.{entity}` cache path

Persist the resolved map as an opcache-friendly PHP file, written atomically, keyed by host+entity, with a content signature for invalidation.

**Files:**
- Modify: `core/base/config/class.config_compiler.php`
- Modify: `test/server/unit/config_compiler_Test.php`

**Interfaces:**
- Consumes: `config_compiler::resolve()` (Task 3).
- Produces (added to `config_compiler`):
  - `config_compiler::signature(array $parts): string` — sha1 of a deterministic encoding of `$parts`.
  - `config_compiler::cache_path(string $base_dir, string $host, string $entity): string` — `"{$base_dir}/config.{$host}.{$entity}.php"`.
  - `config_compiler::write_compiled(string $path, array $flat): void` — atomic temp+`rename`; file is `<?php declare(strict_types=1);\nreturn <array>;\n`.

- [ ] **Step 1: Write the failing test**

Append these methods inside `config_compiler_Test` in `test/server/unit/config_compiler_Test.php` (before the closing `}`):

```php
	public function test_signature_is_deterministic_and_sensitive() : void {
		$a = config_compiler::signature(['v' => '7.0', 'env' => 'pro', 'hash' => 'abc']);
		$b = config_compiler::signature(['v' => '7.0', 'env' => 'pro', 'hash' => 'abc']);
		$c = config_compiler::signature(['v' => '7.0', 'env' => 'pro', 'hash' => 'XYZ']);
		$this->assertSame($a, $b);
		$this->assertNotSame($a, $c);
		$this->assertMatchesRegularExpression('/^[0-9a-f]{40}$/', $a);
	}

	public function test_cache_path_keyed_by_host_and_entity() : void {
		$this->assertSame(
			'/cache/config/config.example.org.museo_x.php',
			config_compiler::cache_path('/cache/config', 'example.org', 'museo_x')
		);
	}

	public function test_write_compiled_is_loadable_and_roundtrips() : void {
		$dir = sys_get_temp_dir() . '/dedalo_cc_' . getmypid() . '_' . uniqid();
		mkdir($dir, 0750, true);
		$path = $dir . '/config.host.entity.php';
		$flat = ['media.image.thumb_width' => 222, 'media.magick_config' => ['remove_layer_0' => false, 'is_opaque' => null], 'paths.core_url' => '/dedalo/core'];

		config_compiler::write_compiled($path, $flat);

		$this->assertFileExists($path);
		$loaded = require $path;          // opcache-friendly PHP array literal
		$this->assertSame($flat, $loaded);
		// no leftover temp files in the dir
		$this->assertSame([], glob($dir . '/*.tmp.*'));

		array_map('unlink', glob($dir . '/*'));
		rmdir($dir);
	}

	public function test_resolve_then_compile_end_to_end() : void {
		$dir = sys_get_temp_dir() . '/dedalo_cc_' . getmypid() . '_' . uniqid();
		mkdir($dir, 0750, true);
		$flat = config_compiler::resolve($this->catalog(), [['media.image.thumb_width' => 333]]);
		$path = config_compiler::cache_path($dir, 'h', 'e');
		config_compiler::write_compiled($path, $flat);
		$loaded = require $path;
		$this->assertSame(333, $loaded['media.image.thumb_width']);
		$this->assertSame('/dedalo/core/media_engine/img.php', $loaded['media.image.file_url']);

		array_map('unlink', glob($dir . '/*'));
		rmdir($dir);
	}
```

- [ ] **Step 2: Run test to verify the new ones fail**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter config_compiler_Test`
Expected: FAIL/ERROR — `Call to undefined method config_compiler::signature()`.

- [ ] **Step 3: Add the artifact methods to `config_compiler`**

In `core/base/config/class.config_compiler.php`, add these methods after `resolve()` (before `deep_merge()`):

```php
	/**
	* SIGNATURE
	* Deterministic content signature for cache invalidation. Pass the inputs
	* that should invalidate the compiled artifact (catalog mtimes, env/local
	* content hashes, DEDALO_VERSION, active env name) — NOT secrets.
	* @param array<string,mixed> $parts
	* @return string 40-char sha1
	*/
	public static function signature(array $parts) : string {
		return sha1(json_encode($parts, JSON_THROW_ON_ERROR));
	}//end signature

	/**
	* CACHE_PATH
	* Artifact path keyed by host AND entity (one physical checkout may serve
	* multiple entities; sharing a compiled file across entities would leak
	* per-entity values).
	*/
	public static function cache_path(string $base_dir, string $host, string $entity) : string {
		return rtrim($base_dir, '/') . '/config.' . $host . '.' . $entity . '.php';
	}//end cache_path

	/**
	* WRITE_COMPILED
	* Atomically writes the resolved flat map as a PHP array literal: write to a
	* unique temp file on the SAME directory, then rename() over the target
	* (atomic on local POSIX fs) so concurrent FPM workers never read a torn file.
	* @param string $path
	* @param array<string,mixed> $flat
	* @return void
	*/
	public static function write_compiled(string $path, array $flat) : void {
		$code = "<?php declare(strict_types=1);\nreturn " . var_export($flat, true) . ";\n";
		$tmp  = $path . '.tmp.' . getmypid() . '.' . bin2hex(random_bytes(4));
		if (file_put_contents($tmp, $code, LOCK_EX) === false) {
			throw new \RuntimeException('config_compiler: failed writing temp artifact: ' . $tmp);
		}
		if (rename($tmp, $path) === false) {
			@unlink($tmp);
			throw new \RuntimeException('config_compiler: failed renaming artifact into place: ' . $path);
		}
	}//end write_compiled
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter config_compiler_Test`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add core/base/config/class.config_compiler.php test/server/unit/config_compiler_Test.php
git commit -m "feat(config): compiled artifact — signature, host.entity cache path, atomic write"
```

---

### Task 6: `compat_shim::emit()` — resolved map → legacy `DEDALO_*` constants

The keystone: turn the catalog + resolved map into `define()`s, excluding REQUEST/USER scopes, via an injectable definer so it is unit-testable without polluting process constants.

**Files:**
- Create: `core/base/config/class.compat_shim.php`
- Test: `test/server/unit/compat_shim_Test.php`

**Interfaces:**
- Consumes: `config_key`, `config_scope` (Task 1); the catalog (Task 2); the resolved flat map (Task 3).
- Produces: `compat_shim::emit(array $flat, array $catalog, ?callable $definer = null): array` — for each catalog key with `const !== null` and scope NOT in {REQUEST, USER}, whose path exists in `$flat`, calls `$definer($const, $value)` and records `[$const => $value]`; returns the recorded map. Default `$definer` is `static fn($n,$v) => (!defined($n)) && define($n, $v)`.

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/compat_shim_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_compiler.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.compat_shim.php';

final class compat_shim_Test extends TestCase {

	/** @return config_key[] */
	private function catalog() : array {
		return require dirname(__DIR__, 3) . '/core/base/config/catalog/catalog.php';
	}

	public function test_emit_records_static_and_derived_constants() : void {
		$flat = config_compiler::resolve($this->catalog(), []);
		$recorded = [];
		$spy = static function (string $name, mixed $value) use (&$recorded) : void {
			$recorded[$name] = $value;
		};
		compat_shim::emit($flat, $this->catalog(), $spy);

		$this->assertSame(222, $recorded['DEDALO_IMAGE_THUMB_WIDTH']);                       // STATIC
		$this->assertSame('/dedalo/core/media_engine/img.php', $recorded['DEDALO_IMAGE_FILE_URL']); // DERIVED
	}

	public function test_emit_excludes_request_and_secret_constants() : void {
		// even if a request/secret value somehow appears in the flat map, the shim must not emit it
		$flat = config_compiler::resolve($this->catalog(), []);
		$flat['lang.application_lang'] = 'lg-eng'; // pretend it leaked into the map
		$recorded = [];
		$spy = static function (string $name, mixed $value) use (&$recorded) : void {
			$recorded[$name] = $value;
		};
		compat_shim::emit($flat, $this->catalog(), $spy);

		$this->assertArrayNotHasKey('DEDALO_APPLICATION_LANG', $recorded); // REQUEST scope excluded
		$this->assertArrayNotHasKey('DEDALO_PASSWORD_CONN', $recorded);    // SECRET not in resolved map
	}

	public function test_default_definer_guards_already_defined() : void {
		// use a unique throwaway constant so we never pollute real DEDALO_* names
		if (!defined('DD_SHIM_TEST_CONST')) {
			define('DD_SHIM_TEST_CONST', 'original');
		}
		$catalog = [new config_key(path: 'x.test', const: 'DD_SHIM_TEST_CONST', type: 'string')];
		$flat = ['x.test' => 'changed'];
		// default definer: must NOT redefine an already-defined constant (no error, value unchanged)
		compat_shim::emit($flat, $catalog);
		$this->assertSame('original', constant('DD_SHIM_TEST_CONST'));
	}

	public function test_emit_skips_keys_with_null_const() : void {
		$catalog = [new config_key(path: 'areas.deny', const: null, type: 'list', default: [])];
		$flat = ['areas.deny' => ['dd137']];
		$recorded = [];
		$spy = static function (string $name, mixed $value) use (&$recorded) : void {
			$recorded[$name] = $value;
		};
		compat_shim::emit($flat, $catalog, $spy);
		$this->assertSame([], $recorded);
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter compat_shim_Test`
Expected: FAIL/ERROR — `Failed opening required '.../class.compat_shim.php'`.

- [ ] **Step 3: Create the shim emitter**

Create `core/base/config/class.compat_shim.php`:

```php
<?php declare(strict_types=1);

require_once __DIR__ . '/class.config_scope.php';
require_once __DIR__ . '/class.config_key.php';

/**
* COMPAT_SHIM
* Generates the legacy DEDALO_* (and other) constants from the resolved config,
* so existing define()-based core code keeps working unchanged. REQUEST/USER
* scoped keys are NEVER emitted (they are accessor-only — emitting them as
* process-global constants would freeze per-request/per-user state in a
* long-lived worker). The definer is injectable so the emission is unit-testable
* without polluting real process constants.
*/
final class compat_shim {

	/**
	* EMIT
	* @param array<string,mixed> $flat resolved dot-path => value (STATIC + DERIVED)
	* @param config_key[] $catalog
	* @param callable|null $definer fn(string $name, mixed $value): void — defaults to
	*        a guarded define() that never redefines an existing constant
	* @return array<string,mixed> the name => value pairs that were emitted
	*/
	public static function emit(array $flat, array $catalog, ?callable $definer = null) : array {

		$definer ??= static function (string $name, mixed $value) : void {
			if (!defined($name)) {
				define($name, $value);
			}
		};

		$emitted = [];
		foreach ($catalog as $key) {
			if ($key->const === null) {
				continue; // new-world-only key, no legacy constant
			}
			if ($key->scope === config_scope::REQUEST || $key->scope === config_scope::USER) {
				continue; // accessor-only — never a process-global constant
			}
			if (!array_key_exists($key->path, $flat)) {
				continue; // value not in the resolved map (e.g. SECRET/STATE read elsewhere)
			}
			$definer($key->const, $flat[$key->path]);
			$emitted[$key->const] = $flat[$key->path];
		}

		return $emitted;
	}//end emit
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter compat_shim_Test`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add core/base/config/class.compat_shim.php test/server/unit/compat_shim_Test.php
git commit -m "feat(config): compat_shim emits DEDALO_* from resolved config (request/user excluded)"
```

---

## Final verification (after all tasks)

- [ ] Run the whole hermetic unit suite:

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml`
Expected: PASS — Phase-1 (36) + Phase-2 (config_key 5 + catalog 3 + config_compiler 10 + config 5 + compat_shim 4 = 27) = **63 tests**, 0 failures, 0 errors. No database connection attempted.

- [ ] Confirm the end-to-end pipeline (catalog → resolve → compile → config + shim) is exercised:

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter "test_resolve_then_compile_end_to_end|test_emit_records_static_and_derived_constants|test_boot_then_get"`
Expected: PASS — these three together prove catalog→compiler→artifact, catalog→shim→constants, and compiled-map→config() reads.

- [ ] Confirm no Composer/autoload dependency crept into the config-core classes:

Run: `grep -rnE "vendor/autoload|^use [A-Z]" core/base/config/`
Expected: no matches.

---

## Self-review notes (coverage vs spec §5.2–5.6, 5.9)

- §5.2 catalog / `config_key` single source of truth: Tasks 1–2. ✓
- §5.3 scope taxonomy (the contract): `config_scope` enum (Task 1); enforced by compiler (excludes non-compilable, Task 3) and shim (excludes REQUEST/USER, Task 6). ✓
- §5.4 layering + precedence + REPLACE-default/DEEP-opt-in merge: Task 3. ✓
- §5.5 accessor API (`config()` + repository; typed reads): Task 4. (Domain DTOs + enums for fixed sets are deferred to Phase 2b alongside bulk catalog population — noted.)
- §5.6 compiled cache (flat array artifact, signature, `{host}.{entity}` key, atomic write): Task 5. ✓
- §5.9 compat shim (generated `DEDALO_*`, request/user excluded, guarded define): Task 6. ✓
- **Deferred to Phase 2b (mechanical follow-on):** populate the full ~150-key catalog; readonly domain DTOs + backed enums; the `constant_map` deprecation/alias columns; the signature's concrete inputs wiring (catalog mtimes/env hashes) — that wiring belongs with Phase 3 boot integration.
- **Not in this phase (correctly):** wiring `config`/shim into the live boot path (Phase 3); SECRET/STATE live-read emission (needs env_loader + state store, Phase 3); the boot-diff CI gate (needs the live boot, Phase 3).
