# Config Foundation — Phase 3a: Boot Orchestrator (hermetic machinery) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `boot` state-machine orchestrator + entrypoint profiles + a phase pipeline that wires the config foundation (`config_compiler` → `config` → `compat_shim`) — all hermetically testable, WITHOUT touching the live boot path.

**Architecture:** `boot::run(entrypoint_profile, boot_phase[])` runs an ordered list of named phases through a `NOT_STARTED → IN_PROGRESS → READY/FAILED` state machine: idempotent `READY` short-circuit (safe for worker re-entry and multiple include sites), re-entrancy detection, fail-closed with the failing phase recorded, and per-profile phase skipping. The config-foundation phases (`config_build`, `compat_shim`) are produced by a factory that resolves the catalog ONCE and shares the flat map between booting `config` and emitting `DEDALO_*`.

**Tech Stack:** PHP 8.1+, PHPUnit ^13 (hermetic harness from Phase 1: `vendor/bin/phpunit -c test/server/phpunit.unit.xml`), no Composer runtime dependency.

## Global Constraints

- **PHP 8.1+**; **no Composer runtime dependency**; boot classes are dependency-free and `require`able directly (they run before the autoloader). This plan does NOT modify the live boot path (`config/config.php` cutover, include-site conversion, real logger/session/tipos/autoloader phases, SECRET/STATE live emission, and the boot-diff CI gate are **Phase 3b**).
- **State machine:** `READY` re-run is a no-op (idempotent); `IN_PROGRESS` re-entry throws `\RuntimeException`; a phase throwing sets `FAILED`, records the phase name, and rethrows wrapped.
- **Entrypoint matrix (spec §5.7):** only `WEB` starts a session and resolves per-request state; `CLI`/`CRON`/`WORKER_INIT`/`TEST` skip those.
- **Compat shim** keeps its injectable definer so Boot runs are unit-testable without polluting process constants.
- **snake_case** class/enum names: `boot`, `boot_state`, `entrypoint_profile`, `boot_phase`, `boot_config_phases`.
- **Test command:** `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter <name>` from repo root. Tests `require_once` the classes directly and extend `PHPUnit\Framework\TestCase`; use `reset()` seams in setUp/tearDown.

---

## File Structure

- `core/base/boot/class.entrypoint_profile.php` — **new.** `enum entrypoint_profile: string` (WEB|CLI|CRON|WORKER_INIT|TEST) + `starts_session()`/`resolves_request_state()`.
- `core/base/boot/class.boot_state.php` — **new.** `enum boot_state: string` (NOT_STARTED|IN_PROGRESS|READY|FAILED).
- `core/base/boot/class.boot_phase.php` — **new.** `final class boot_phase` (name, run closure, skip_in[], `should_run()`).
- `core/base/boot/class.boot.php` — **new.** `final class boot` — the orchestrator state machine.
- `core/base/boot/class.boot_config_phases.php` — **new.** Factory producing the config-foundation `boot_phase[]` (shared resolved flat map).
- Tests (all **new**, under `test/server/unit/`): `entrypoint_profile_Test.php`, `boot_phase_Test.php`, `boot_Test.php`, `boot_config_phases_Test.php`.

---

### Task 1: `entrypoint_profile` + `boot_state` enums

The profile vocabulary (what each entrypoint runs) and the boot lifecycle states.

**Files:**
- Create: `core/base/boot/class.entrypoint_profile.php`, `core/base/boot/class.boot_state.php`
- Test: `test/server/unit/entrypoint_profile_Test.php`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `enum entrypoint_profile: string { WEB='web', CLI='cli', CRON='cron', WORKER_INIT='worker_init', TEST='test' }` with `starts_session(): bool` (true only for WEB) and `resolves_request_state(): bool` (true only for WEB).
  - `enum boot_state: string { NOT_STARTED='not_started', IN_PROGRESS='in_progress', READY='ready', FAILED='failed' }`.

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/entrypoint_profile_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.entrypoint_profile.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_state.php';

final class entrypoint_profile_Test extends TestCase {

	public function test_profiles_exist() : void {
		$names = array_map(static fn(entrypoint_profile $p) : string => $p->name, entrypoint_profile::cases());
		sort($names);
		$this->assertSame(['CLI', 'CRON', 'TEST', 'WEB', 'WORKER_INIT'], $names);
	}

	public function test_only_web_starts_session() : void {
		$this->assertTrue(entrypoint_profile::WEB->starts_session());
		$this->assertFalse(entrypoint_profile::CLI->starts_session());
		$this->assertFalse(entrypoint_profile::CRON->starts_session());
		$this->assertFalse(entrypoint_profile::WORKER_INIT->starts_session());
		$this->assertFalse(entrypoint_profile::TEST->starts_session());
	}

	public function test_only_web_resolves_request_state() : void {
		$this->assertTrue(entrypoint_profile::WEB->resolves_request_state());
		$this->assertFalse(entrypoint_profile::CLI->resolves_request_state());
		$this->assertFalse(entrypoint_profile::WORKER_INIT->resolves_request_state());
	}

	public function test_boot_state_cases() : void {
		$names = array_map(static fn(boot_state $s) : string => $s->name, boot_state::cases());
		sort($names);
		$this->assertSame(['FAILED', 'IN_PROGRESS', 'NOT_STARTED', 'READY'], $names);
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter entrypoint_profile_Test`
Expected: FAIL/ERROR — `Failed opening required '.../class.entrypoint_profile.php'`.

- [ ] **Step 3: Create the enums**

Create `core/base/boot/class.entrypoint_profile.php`:

```php
<?php declare(strict_types=1);

/**
* ENTRYPOINT_PROFILE
* Which boot behaviors apply to each kind of entrypoint (spec §5.7 matrix).
* Only WEB runs the per-request side-effects (session start, request-state
* resolution); CLI/CRON/WORKER_INIT/TEST skip them.
*/
enum entrypoint_profile : string {
	case WEB         = 'web';
	case CLI         = 'cli';
	case CRON        = 'cron';
	case WORKER_INIT = 'worker_init';
	case TEST        = 'test';

	public function starts_session() : bool {
		return $this === self::WEB;
	}

	public function resolves_request_state() : bool {
		return $this === self::WEB;
	}
}
```

Create `core/base/boot/class.boot_state.php`:

```php
<?php declare(strict_types=1);

/**
* BOOT_STATE
* Lifecycle of the boot orchestrator. READY short-circuits re-runs (idempotent);
* IN_PROGRESS re-entry is a bug (throws); FAILED pins the failing phase.
*/
enum boot_state : string {
	case NOT_STARTED = 'not_started';
	case IN_PROGRESS = 'in_progress';
	case READY       = 'ready';
	case FAILED      = 'failed';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter entrypoint_profile_Test`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add core/base/boot/class.entrypoint_profile.php core/base/boot/class.boot_state.php test/server/unit/entrypoint_profile_Test.php
git commit -m "feat(boot): entrypoint_profile + boot_state enums"
```

---

### Task 2: `boot_phase` value object

One named, ordered, profile-aware phase.

**Files:**
- Create: `core/base/boot/class.boot_phase.php`
- Test: `test/server/unit/boot_phase_Test.php`

**Interfaces:**
- Consumes: `entrypoint_profile` (Task 1).
- Produces: `final class boot_phase` with readonly `string $name`, `\Closure $run` (signature `fn(): void`), `array $skip_in` (list of `entrypoint_profile` string values to skip); method `should_run(entrypoint_profile $profile): bool` returning `!in_array($profile->value, $this->skip_in, true)`.

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/boot_phase_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.entrypoint_profile.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_phase.php';

final class boot_phase_Test extends TestCase {

	public function test_phase_holds_name_and_closure() : void {
		$ran = false;
		$p = new boot_phase('demo', function () use (&$ran) : void { $ran = true; });
		$this->assertSame('demo', $p->name);
		($p->run)();
		$this->assertTrue($ran);
	}

	public function test_should_run_default_true_for_all_profiles() : void {
		$p = new boot_phase('always', static function () : void {});
		$this->assertTrue($p->should_run(entrypoint_profile::WEB));
		$this->assertTrue($p->should_run(entrypoint_profile::CLI));
	}

	public function test_skip_in_excludes_named_profiles() : void {
		$p = new boot_phase('session', static function () : void {}, skip_in: ['cli', 'cron', 'worker_init', 'test']);
		$this->assertTrue($p->should_run(entrypoint_profile::WEB));
		$this->assertFalse($p->should_run(entrypoint_profile::CLI));
		$this->assertFalse($p->should_run(entrypoint_profile::TEST));
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter boot_phase_Test`
Expected: FAIL/ERROR — `Failed opening required '.../class.boot_phase.php'`.

- [ ] **Step 3: Create the value object**

Create `core/base/boot/class.boot_phase.php`:

```php
<?php declare(strict_types=1);

require_once __DIR__ . '/class.entrypoint_profile.php';

/**
* BOOT_PHASE
* One ordered boot step: a name, a side-effecting closure (fn(): void), and the
* set of entrypoint profiles in which it is skipped (by profile string value).
*/
final class boot_phase {

	/** @param string[] $skip_in entrypoint_profile string values to skip */
	public function __construct(
		public readonly string   $name,
		public readonly \Closure $run,
		public readonly array    $skip_in = [],
	) {}

	public function should_run(entrypoint_profile $profile) : bool {
		return !in_array($profile->value, $this->skip_in, true);
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter boot_phase_Test`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add core/base/boot/class.boot_phase.php test/server/unit/boot_phase_Test.php
git commit -m "feat(boot): boot_phase value object (name, closure, per-profile skip)"
```

---

### Task 3: `boot` orchestrator state machine

The core: run ordered phases through the lifecycle with idempotency, re-entrancy detection, and fail-closed.

**Files:**
- Create: `core/base/boot/class.boot.php`
- Test: `test/server/unit/boot_Test.php`

**Interfaces:**
- Consumes: `entrypoint_profile`, `boot_state` (Task 1), `boot_phase` (Task 2).
- Produces:
  - `boot::run(entrypoint_profile $profile, array $phases): void` — `$phases` is `boot_phase[]` (ordered). Idempotent when `READY`; throws `\RuntimeException` on `IN_PROGRESS` re-entry or when previously `FAILED`; on a phase throwing, sets `FAILED`, records the phase, rethrows wrapped in `\RuntimeException`.
  - `boot::state(): boot_state`; `boot::failed_phase(): ?string`; `boot::reset(): void` (test seam).

- [ ] **Step 1: Write the failing tests**

Create `test/server/unit/boot_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.entrypoint_profile.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_state.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_phase.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot.php';

final class boot_Test extends TestCase {

	protected function setUp() : void { parent::setUp(); boot::reset(); }
	protected function tearDown() : void { boot::reset(); }

	public function test_runs_phases_in_order_and_reaches_ready() : void {
		$order = [];
		boot::run(entrypoint_profile::TEST, [
			new boot_phase('a', function () use (&$order) : void { $order[] = 'a'; }),
			new boot_phase('b', function () use (&$order) : void { $order[] = 'b'; }),
		]);
		$this->assertSame(['a', 'b'], $order);
		$this->assertSame(boot_state::READY, boot::state());
	}

	public function test_ready_rerun_is_idempotent_noop() : void {
		$count = 0;
		$phases = [new boot_phase('once', function () use (&$count) : void { $count++; })];
		boot::run(entrypoint_profile::TEST, $phases);
		boot::run(entrypoint_profile::TEST, $phases); // second run: no-op
		$this->assertSame(1, $count);
	}

	public function test_skipped_phase_does_not_run() : void {
		$ran = false;
		boot::run(entrypoint_profile::CLI, [
			new boot_phase('session', function () use (&$ran) : void { $ran = true; }, skip_in: ['cli']),
		]);
		$this->assertFalse($ran);
		$this->assertSame(boot_state::READY, boot::state());
	}

	public function test_phase_throw_sets_failed_and_records_phase() : void {
		try {
			boot::run(entrypoint_profile::TEST, [
				new boot_phase('ok', static function () : void {}),
				new boot_phase('boom', static function () : void { throw new \LogicException('kaboom'); }),
			]);
			$this->fail('expected RuntimeException');
		} catch (\RuntimeException $e) {
			$this->assertStringContainsString('boom', $e->getMessage());
		}
		$this->assertSame(boot_state::FAILED, boot::state());
		$this->assertSame('boom', boot::failed_phase());
	}

	public function test_rerun_after_failed_throws() : void {
		try {
			boot::run(entrypoint_profile::TEST, [new boot_phase('boom', static function () : void { throw new \LogicException('x'); })]);
		} catch (\RuntimeException $e) { /* expected */ }
		$this->expectException(\RuntimeException::class);
		boot::run(entrypoint_profile::TEST, []); // FAILED state rejects re-run
	}

	public function test_reentrancy_during_in_progress_throws() : void {
		$this->expectException(\RuntimeException::class);
		boot::run(entrypoint_profile::TEST, [
			new boot_phase('reenter', static function () : void {
				boot::run(entrypoint_profile::TEST, []); // re-enter while IN_PROGRESS
			}),
		]);
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter boot_Test`
Expected: FAIL/ERROR — `Failed opening required '.../class.boot.php'`.

- [ ] **Step 3: Create the orchestrator**

Create `core/base/boot/class.boot.php`:

```php
<?php declare(strict_types=1);

require_once __DIR__ . '/class.entrypoint_profile.php';
require_once __DIR__ . '/class.boot_state.php';
require_once __DIR__ . '/class.boot_phase.php';

/**
* BOOT
* Ordered-phase boot orchestrator with an explicit lifecycle. Replaces the v6
* `if (defined('DEDALO_ROOT_PATH')) throw` guard: a READY re-run is a safe no-op
* (so multiple front-controller includes and worker re-entry don't fatal), an
* IN_PROGRESS re-entry is a real bug (throws), and a phase failure pins the
* failing phase so the shutdown handler can report it.
*/
final class boot {

	private static boot_state $state = boot_state::NOT_STARTED;
	private static ?string $failed_phase = null;

	/**
	* @param entrypoint_profile $profile
	* @param boot_phase[] $phases ordered
	* @return void
	*/
	public static function run(entrypoint_profile $profile, array $phases) : void {

		if (self::$state === boot_state::READY) {
			return; // idempotent success
		}
		if (self::$state === boot_state::IN_PROGRESS) {
			throw new \RuntimeException('boot: re-entrancy detected while IN_PROGRESS (a class autoloaded during boot triggered boot again)');
		}
		if (self::$state === boot_state::FAILED) {
			throw new \RuntimeException('boot: previously FAILED at phase ' . (self::$failed_phase ?? '?') . '; refusing to continue a half-built process');
		}

		self::$state = boot_state::IN_PROGRESS;

		foreach ($phases as $phase) {
			if ($phase->should_run($profile) === false) {
				continue;
			}
			try {
				($phase->run)();
			} catch (\Throwable $e) {
				self::$state = boot_state::FAILED;
				self::$failed_phase = $phase->name;
				throw new \RuntimeException("boot: phase '{$phase->name}' failed: " . $e->getMessage(), 0, $e);
			}
		}

		self::$state = boot_state::READY;
	}//end run

	public static function state() : boot_state {
		return self::$state;
	}

	public static function failed_phase() : ?string {
		return self::$failed_phase;
	}

	/** test seam */
	public static function reset() : void {
		self::$state = boot_state::NOT_STARTED;
		self::$failed_phase = null;
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter boot_Test`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add core/base/boot/class.boot.php test/server/unit/boot_Test.php
git commit -m "feat(boot): boot orchestrator state machine (idempotent, re-entrancy guard, fail-closed)"
```

---

### Task 4: `boot_config_phases` factory + end-to-end integration

The config-foundation phases (resolve catalog once, boot `config`, emit `DEDALO_*`), assembled and proven through a real `boot::run()`.

**Files:**
- Create: `core/base/boot/class.boot_config_phases.php`
- Test: `test/server/unit/boot_config_phases_Test.php`

**Interfaces:**
- Consumes: `boot_phase` (Task 2), `boot`/`entrypoint_profile` (Tasks 1,3); Phase-2 `config_compiler::resolve()`, `config::boot()`/`config()`, `compat_shim::emit()`, `config_key`, the catalog.
- Produces: `boot_config_phases::phases(array $catalog, array $layer_overrides, ?callable $definer = null): array` — returns a `boot_phase[]` of exactly two phases (`config_build`, then `compat_shim`) that share one resolved flat map via closure capture: `config_build` runs `config_compiler::resolve()` then `config::boot()`; `compat_shim` runs `compat_shim::emit($flat, $catalog, $definer)`.

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/boot_config_phases_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.entrypoint_profile.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_state.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_phase.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_compiler.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.compat_shim.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_config_phases.php';

final class boot_config_phases_Test extends TestCase {

	protected function setUp() : void { parent::setUp(); boot::reset(); config::reset(); }
	protected function tearDown() : void { boot::reset(); config::reset(); }

	/** @return config_key[] */
	private function catalog() : array {
		return require dirname(__DIR__, 3) . '/core/base/config/catalog/catalog.php';
	}

	public function test_phases_returns_two_named_phases() : void {
		$phases = boot_config_phases::phases($this->catalog(), []);
		$this->assertCount(2, $phases);
		$this->assertSame('config_build', $phases[0]->name);
		$this->assertSame('compat_shim', $phases[1]->name);
	}

	public function test_end_to_end_boot_boots_config_and_emits_constants() : void {
		$recorded = [];
		$spy = static function (string $name, mixed $value) use (&$recorded) : void { $recorded[$name] = $value; };

		boot::run(entrypoint_profile::TEST, boot_config_phases::phases($this->catalog(), [], $spy));

		// config repository is booted and reads resolved values
		$this->assertSame(boot_state::READY, boot::state());
		$this->assertSame(222, config('media.image.thumb_width'));
		// compat shim emitted the static/derived constants (via the recorder, not real define())
		$this->assertSame(222, $recorded['DEDALO_IMAGE_THUMB_WIDTH']);
		$this->assertSame('/dedalo/core/media_engine/img.php', $recorded['DEDALO_IMAGE_FILE_URL']);
		// request-scoped key never emitted
		$this->assertArrayNotHasKey('DEDALO_APPLICATION_LANG', $recorded);
	}

	public function test_layer_override_flows_through_boot() : void {
		$recorded = [];
		$spy = static function (string $n, mixed $v) use (&$recorded) : void { $recorded[$n] = $v; };
		boot::run(entrypoint_profile::TEST, boot_config_phases::phases($this->catalog(), [['media.image.thumb_width' => 300]], $spy));
		$this->assertSame(300, config('media.image.thumb_width'));
		$this->assertSame(300, $recorded['DEDALO_IMAGE_THUMB_WIDTH']);
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter boot_config_phases_Test`
Expected: FAIL/ERROR — `Failed opening required '.../class.boot_config_phases.php'`.

- [ ] **Step 3: Create the factory**

Create `core/base/boot/class.boot_config_phases.php`:

```php
<?php declare(strict_types=1);

require_once __DIR__ . '/class.boot_phase.php';
require_once __DIR__ . '/../config/class.config_compiler.php';
require_once __DIR__ . '/../config/class.config.php';
require_once __DIR__ . '/../config/class.compat_shim.php';

/**
* BOOT_CONFIG_PHASES
* Produces the config-foundation boot phases. The catalog+overrides are resolved
* ONCE; the resulting flat map is shared (by closure reference) between booting
* the `config` repository and emitting the legacy `DEDALO_*` constants — so the
* two phases never re-resolve or drift.
*/
final class boot_config_phases {

	/**
	* @param config_key[] $catalog
	* @param array<int,array<string,mixed>> $layer_overrides ordered low->high
	* @param callable|null $definer passed to compat_shim::emit (default: guarded define)
	* @return boot_phase[] exactly: [config_build, compat_shim]
	*/
	public static function phases(array $catalog, array $layer_overrides, ?callable $definer = null) : array {

		$flat = [];

		$build = new boot_phase('config_build', function () use (&$flat, $catalog, $layer_overrides) : void {
			$flat = config_compiler::resolve($catalog, $layer_overrides);
			config::boot($flat);
		});

		$emit = new boot_phase('compat_shim', function () use (&$flat, $catalog, $definer) : void {
			compat_shim::emit($flat, $catalog, $definer);
		});

		return [$build, $emit];
	}//end phases
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter boot_config_phases_Test`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add core/base/boot/class.boot_config_phases.php test/server/unit/boot_config_phases_Test.php
git commit -m "feat(boot): boot_config_phases factory wiring compiler->config->compat_shim through boot::run"
```

---

## Final verification (after all tasks)

- [ ] Run the whole hermetic unit suite:

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml`
Expected: PASS — prior 74 + Phase-3a (entrypoint_profile 4 + boot_phase 3 + boot 6 + boot_config_phases 3 = 16) = **90 tests**, 0 failures, 0 errors. No database connection attempted.

- [ ] Confirm the boot classes carry no Composer/autoload dependency and don't touch the live boot path:

Run: `grep -rnE "vendor/autoload|session_start|config/config.php" core/base/boot/class.boot.php core/base/boot/class.boot_phase.php core/base/boot/class.boot_config_phases.php`
Expected: no matches (no live-boot wiring; session/real-config phases are Phase 3b).

---

## Self-review notes (coverage vs spec §5.7)

- §5.7 boot state machine (NOT_STARTED→IN_PROGRESS→READY→FAILED; idempotent READY; re-entrancy throw; FAILED pins phase): Task 3. ✓
- §5.7 entrypoint profiles (WEB|CLI|CRON|WORKER_INIT|TEST; only WEB session + request-state): Task 1. ✓
- §5.7 ordered phase pipeline with per-profile skipping: Tasks 2–3. ✓
- §5.7 config-foundation wiring (config build + compat shim) orchestrated by boot: Task 4. ✓
- **Deferred to Phase 3b (the live cutover — separate, verification-gated plan):** the real phases (P1 runtime floor + error/shutdown handlers, P2 paths from `__FILE__`, P3 real `.env` load, P7 core_functions, P8 logger, P9 dd_tipos, P10 autoloader, P11 mb_encoding, P12 locale/tz, P13 `session_start_manager`, P14 request-state via RequestContext); making `config/config.php` a thin shim that calls `boot::run(WEB, …)`; converting the `if (!defined('DEDALO_ROOT_PATH')) include config/config.php` sites; the worker `WORKER_INIT` wiring; SECRET/STATE live-read emission; and the boot-diff CI gate (needs the old config to boot + the full catalog from Phase 2b).
- **Not in scope (correctly):** Phase 2b bulk catalog/DTOs; Phase 4 migration; Phase 5 worker request-scoped accessors.
