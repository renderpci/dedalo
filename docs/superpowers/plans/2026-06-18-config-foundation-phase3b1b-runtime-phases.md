# Config Foundation — Phase 3b-1b: Runtime Boot Phases (hermetic) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the hermetic runtime boot phases — env-load, the locale/encoding/timezone side-effects (driven by config), and a `boot_runtime_phases::for()` assembly that wires env-load + config-build-with-paths + compat-shim + locale into one ordered pipeline, proven end-to-end through `boot::run` — all additive (nothing wired to the live `config/config.php`).

**Architecture:** A `boot_runtime_phases` factory composes the existing `boot_config_phases` (config-build + compat-shim, sharing one resolved flat map) with two new side-effect phases: `env_load` (calls `env_loader::load`) before it, and `apply_locale` (reads the booted config and applies `mb_internal_encoding`/`date_default_timezone_set`/`setlocale`) after it. The config-build phase already accepts a layer-override argument, so passing the `boot_paths::resolve()` base map makes the full path family resolve to real install values during the run.

**Tech Stack:** PHP 8.1+, PHPUnit ^13 (hermetic harness: `vendor/bin/phpunit -c test/server/phpunit.unit.xml`), no Composer runtime dependency.

## Global Constraints

- **PHP 8.1+**, no Composer dependency; dependency-free, `require`able directly. **Additive** — does NOT modify `config/config.php` or any live include site.
- **Reuse, don't duplicate:** `boot_runtime_phases::for()` composes `boot_config_phases::phases()` (from Phase 3a) — it does NOT re-implement config-build/shim.
- **`apply_locale` reproduces v6 side-effects verbatim:** `mb_internal_encoding('UTF-8')` (literal), `date_default_timezone_set(config('identity.timezone'))`, `setlocale(LC_ALL, config('identity.locale'))`. It runs AFTER config is booted (so `config('identity.*')` resolves).
- **Test reliability:** assert `date_default_timezone_get()` and `mb_internal_encoding()` (deterministic, OS-independent). Do NOT assert `setlocale`'s return value (depends on which locales the OS has installed) — only that the phase runs without error.
- **Scope — DEFERRED to the cutover unit (3b-3), NOT here** (they define process-global constants / require the full app / need the live-DB env, so they can't be unit-tested in isolation): the `require`-wrapper phases for `shared/core_functions.php`, the logger registration, `core/base/dd_tipos.php`, `core/base/class.loader.php`; `session_start_manager` (P13); and the request-state phase (P14, defines `DEDALO_APPLICATION_LANG`/`SHOW_DEBUG` for the FPM profile). These are validated by the boot-diff gate (3b-2) + a live `verify`/`run`.
- **Test command:** `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter <name>` from repo root.

---

## File Structure

- `core/base/boot/class.boot_runtime_phases.php` — **new.** `apply_locale_phase()`, `env_load_phase(string)`, and the `for(...)` assembly. `require_once`s `boot_phase`, `boot_config_phases`, `env_loader`, `config`.
- `test/server/unit/boot_runtime_phases_Test.php` — **new.** Covers all three across the three tasks.

---

### Task 1: `apply_locale_phase`

A boot phase that applies the v6 process-global locale/encoding/timezone side-effects from the booted config.

**Files:**
- Create: `core/base/boot/class.boot_runtime_phases.php`
- Test: `test/server/unit/boot_runtime_phases_Test.php`

**Interfaces:**
- Consumes: `boot_phase` (Phase 3a); `config`/`config()` (Phase 2).
- Produces: `boot_runtime_phases::apply_locale_phase(): boot_phase` — a phase named `'apply_locale'` whose closure runs `mb_internal_encoding('UTF-8')`, `date_default_timezone_set(config('identity.timezone'))`, `setlocale(LC_ALL, config('identity.locale'))`.

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/boot_runtime_phases_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_runtime_phases.php';

final class boot_runtime_phases_Test extends TestCase {

	protected function setUp() : void { parent::setUp(); config::reset(); }
	protected function tearDown() : void { config::reset(); }

	public function test_apply_locale_phase_sets_timezone_and_encoding_from_config() : void {
		config::boot(['identity.timezone' => 'Europe/Madrid', 'identity.locale' => 'es-ES']);
		$phase = boot_runtime_phases::apply_locale_phase();
		$this->assertSame('apply_locale', $phase->name);
		($phase->run)();
		$this->assertSame('Europe/Madrid', date_default_timezone_get());
		$this->assertSame('UTF-8', mb_internal_encoding());
	}

	public function test_apply_locale_phase_reads_a_different_timezone() : void {
		config::boot(['identity.timezone' => 'UTC', 'identity.locale' => 'en-EN']);
		(boot_runtime_phases::apply_locale_phase()->run)();
		$this->assertSame('UTC', date_default_timezone_get());
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter boot_runtime_phases_Test`
Expected: FAIL/ERROR — `Failed opening required '.../class.boot_runtime_phases.php'`.

- [ ] **Step 3: Create the class with `apply_locale_phase`**

Create `core/base/boot/class.boot_runtime_phases.php`:

```php
<?php declare(strict_types=1);

require_once __DIR__ . '/class.boot_phase.php';
require_once __DIR__ . '/class.boot_config_phases.php';
require_once __DIR__ . '/class.env_loader.php';
require_once __DIR__ . '/../config/class.config.php';

/**
* BOOT_RUNTIME_PHASES
* The hermetic runtime boot phases — env load, and the v6 process-global
* locale/encoding/timezone side-effects driven by the booted config — composed
* with boot_config_phases (config-build + compat-shim) into the boot pipeline.
* The subsystem-include / session / request-state phases are added by the
* cutover unit (they need the full app and are validated by the boot-diff gate).
*/
final class boot_runtime_phases {

	/**
	* APPLY_LOCALE_PHASE
	* Reproduces v6's mb_internal_encoding('UTF-8'), date_default_timezone_set,
	* and setlocale. Runs AFTER config is booted (reads config('identity.*')).
	*/
	public static function apply_locale_phase() : boot_phase {
		return new boot_phase('apply_locale', static function () : void {
			mb_internal_encoding('UTF-8');
			date_default_timezone_set(config('identity.timezone'));
			setlocale(LC_ALL, config('identity.locale'));
		});
	}//end apply_locale_phase
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter boot_runtime_phases_Test`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add core/base/boot/class.boot_runtime_phases.php test/server/unit/boot_runtime_phases_Test.php
git commit -m "feat(boot): apply_locale boot phase (encoding/timezone/locale from config)"
```

---

### Task 2: `env_load_phase`

A boot phase that loads the `.env` via `env_loader`.

**Files:**
- Modify: `core/base/boot/class.boot_runtime_phases.php`
- Modify: `test/server/unit/boot_runtime_phases_Test.php`

**Interfaces:**
- Consumes: `boot_phase`, `env_loader` (Phase 1: `env_loader::load(string $path, bool $require=false): void`, `env_loader::get`, `env_loader::reset`).
- Produces: `boot_runtime_phases::env_load_phase(string $env_path): boot_phase` — a phase named `'env_load'` whose closure runs `env_loader::load($env_path)`.

- [ ] **Step 1: Write the failing test**

Append to `boot_runtime_phases_Test` (and add `env_loader::reset()` to setUp/tearDown):

```php
	public function test_env_load_phase_populates_env_loader() : void {
		env_loader::reset();
		$path = sys_get_temp_dir() . '/dedalo_rt_' . getmypid() . '_' . uniqid() . '.env';
		file_put_contents($path, "DEDALO_RT_TEST=loaded\n");
		chmod($path, 0600);

		$phase = boot_runtime_phases::env_load_phase($path);
		$this->assertSame('env_load', $phase->name);
		($phase->run)();
		$this->assertSame('loaded', env_loader::get('DEDALO_RT_TEST'));

		unlink($path);
		env_loader::reset();
	}
```
(Update `setUp`/`tearDown` to also call `env_loader::reset();` — `require_once .../class.env_loader.php` at the top of the test file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter boot_runtime_phases_Test`
Expected: FAIL — `Call to undefined method boot_runtime_phases::env_load_phase()`.

- [ ] **Step 3: Add `env_load_phase`**

In `core/base/config/.../class.boot_runtime_phases.php`, add after `apply_locale_phase()`:

```php
	/**
	* ENV_LOAD_PHASE
	* Loads the .env file (secrets) via the zero-dependency env_loader.
	* @param string $env_path absolute path to the .env file
	*/
	public static function env_load_phase(string $env_path) : boot_phase {
		return new boot_phase('env_load', static function () use ($env_path) : void {
			env_loader::load($env_path);
		});
	}//end env_load_phase
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter boot_runtime_phases_Test`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add core/base/boot/class.boot_runtime_phases.php test/server/unit/boot_runtime_phases_Test.php
git commit -m "feat(boot): env_load boot phase (env_loader::load)"
```

---

### Task 3: `for()` assembly + end-to-end pipeline test

Compose env-load + config-build-with-paths + compat-shim + apply-locale into one ordered phase list, proven end-to-end through `boot::run`.

**Files:**
- Modify: `core/base/boot/class.boot_runtime_phases.php`
- Modify: `test/server/unit/boot_runtime_phases_Test.php`

**Interfaces:**
- Consumes: `boot_config_phases::phases(array $catalog, array $layer_overrides, ?callable $definer): boot_phase[]` (Phase 3a); `boot::run` (Phase 3a); `boot_paths::resolve` (Phase 3b-1a).
- Produces: `boot_runtime_phases::for(array $catalog, array $base_overrides = [], ?string $env_path = null, ?callable $definer = null): boot_phase[]` — the ordered list: `[env_load (only if $env_path !== null), config_build, compat_shim, apply_locale]`. `$base_overrides` is passed as the layer-override to `boot_config_phases::phases` (so a `boot_paths::resolve()` map resolves the path family).

- [ ] **Step 1: Write the failing tests**

Append to `boot_runtime_phases_Test` (add `boot::reset()` to setUp/tearDown; `require_once` the boot, entrypoint_profile, boot_state, config_compiler, compat_shim, config_key, and the catalog as needed — mirror `boot_config_phases_Test`):

```php
	/** @return config_key[] */
	private function catalog() : array {
		return require dirname(__DIR__, 3) . '/core/base/config/catalog/catalog.php';
	}

	public function test_for_assembly_order_without_env() : void {
		$phases = boot_runtime_phases::for($this->catalog(), [], null, null);
		$names = array_map(static fn(boot_phase $p) : string => $p->name, $phases);
		$this->assertSame(['config_build', 'compat_shim', 'apply_locale'], $names);
	}

	public function test_for_assembly_includes_env_when_path_given() : void {
		$phases = boot_runtime_phases::for($this->catalog(), [], '/tmp/x.env', null);
		$names = array_map(static fn(boot_phase $p) : string => $p->name, $phases);
		$this->assertSame(['env_load', 'config_build', 'compat_shim', 'apply_locale'], $names);
	}

	public function test_end_to_end_pipeline_through_boot_run() : void {
		boot::reset();
		$recorded = [];
		$spy = static function (string $n, mixed $v) use (&$recorded) : void { $recorded[$n] = $v; };
		$bases = [['paths.root' => '/srv/dedalo', 'paths.root_web' => '/dedalo']];

		boot::run(entrypoint_profile::TEST, boot_runtime_phases::for($this->catalog(), $bases, null, $spy));

		$this->assertSame(boot_state::READY, boot::state());
		// config booted with the path family resolved to real values
		$this->assertSame('/srv/dedalo/core', config('paths.core_path'));
		$this->assertSame('/dedalo/core', config('paths.core_url'));
		// compat shim emitted the resolved path constants
		$this->assertSame('/srv/dedalo/core', $recorded['DEDALO_CORE_PATH']);
		// apply_locale ran (timezone from config default 'Europe/Madrid', encoding UTF-8)
		$this->assertSame('Europe/Madrid', date_default_timezone_get());
		$this->assertSame('UTF-8', mb_internal_encoding());
		boot::reset();
	}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter boot_runtime_phases_Test`
Expected: FAIL — `Call to undefined method boot_runtime_phases::for()`.

- [ ] **Step 3: Add the `for()` assembly**

In `class.boot_runtime_phases.php`, add the requires for the boot orchestrator pieces at the top (`require_once __DIR__ . '/class.boot.php';` etc. are NOT needed here — `for()` only builds the list; the caller runs `boot::run`). Add:

```php
	/**
	* FOR
	* The ordered hermetic runtime pipeline:
	* [env_load? -> config_build -> compat_shim -> apply_locale].
	* $base_overrides (e.g. boot_paths::resolve()) is the compiler layer override
	* that resolves the path family to real install values.
	* @param config_key[] $catalog
	* @param array<int,array<string,mixed>> $base_overrides
	* @param string|null $env_path  if given, env_load runs first
	* @param callable|null $definer  passed to compat_shim
	* @return boot_phase[]
	*/
	public static function for(array $catalog, array $base_overrides = [], ?string $env_path = null, ?callable $definer = null) : array {

		$phases = [];
		if ($env_path !== null) {
			$phases[] = self::env_load_phase($env_path);
		}
		foreach (boot_config_phases::phases($catalog, $base_overrides, $definer) as $phase) {
			$phases[] = $phase;
		}
		$phases[] = self::apply_locale_phase();

		return $phases;
	}//end for
}
```
(Place this inside the class, before its closing `}`. Note `for` is a valid PHP method name even though it is a reserved keyword — method names may be reserved words; if the toolchain rejects it, rename to `pipeline` and update the tests. Verify with the RED run.)

- [ ] **Step 4: Run the test, then the FULL suite**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter boot_runtime_phases_Test`
Expected: PASS (5 tests).

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml`
Expected: FULL hermetic suite green. Report the total.

- [ ] **Step 5: Commit**

```bash
git add core/base/boot/class.boot_runtime_phases.php test/server/unit/boot_runtime_phases_Test.php
git commit -m "feat(boot): boot_runtime_phases::for assembly + end-to-end pipeline test"
```

---

## Final verification (after all tasks)

- [ ] `vendor/bin/phpunit -c test/server/phpunit.unit.xml` — full suite green.
- [ ] Confirm the pipeline composes (does not duplicate) `boot_config_phases`: `grep -n "boot_config_phases::phases" core/base/boot/class.boot_runtime_phases.php` returns the call in `for()`.
- [ ] `grep -rnE "vendor/autoload|^use [A-Z]|config/config.php" core/base/boot/class.boot_runtime_phases.php` — no matches (no Composer, no live-boot wiring).

## Self-review notes

- The hermetic runtime phases (env-load, apply-locale) + the config-build-with-paths integration are built and proven end-to-end through `boot::run`. ✓
- Reuses `boot_config_phases` (no duplication). ✓
- Additive: nothing touches `config/config.php`. ✓
- **Deferred to the cutover unit (3b-3):** the `require`-wrapper phases (core_functions/logger/dd_tipos/autoloader), `session_start_manager` (P13, skippable), and request-state (P14, defines the REQUEST/USER constants for FPM) — validated by the boot-diff gate (3b-2) + live verify/run, since they define process-global constants / need the full app.
- **Carry-overs still open** (from prior phases, logged in `.git/sdd/progress.md`): boot-diff gate must assert emitted set == legacy surface minus REQUEST/USER + secrets-from-live-env; `boot_paths` HTTPS/proxy handling at cutover; install/state writer must seed INFO_KEY/INFORMATION.
