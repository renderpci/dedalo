# Phase 3b-3 (prove-now) — Live Boot-Diff: prove the new pipeline reproduces the real constant surface

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove — via a one-shot live boot-diff of two isolated subprocesses — that the new boot pipeline emits exactly the legacy config-originated `DEDALO_*` constant surface (config catalog + `version.inc` + `dd_tipos.php`), reproducing every value, with every divergence classified — WITHOUT flipping `config.php` or touching the salt.

**Architecture:** Add the two constant-contributing subsystem-include phases (`version.inc`, `dd_tipos.php`) via a generic include-phase factory. A pure classifier (`boot_diff`) partitions an "old" surface (captured by booting the real `config.php` in a CLI subprocess) against a "new" surface (the new pipeline booted in a separate CLI subprocess), using the catalog scopes + the `legacy_surface` tokenizer (Phase 3b-2) to enumerate the version/tipos names. The new-pipeline capture script is hermetic (no DB); the live `config.php` boot is run exactly ONCE by the controller after the tasks land. Functioning-only phases (core_functions, logger, autoloader, session, request-state, error handlers) and the `config.php` flip are deferred to the gated cutover unit.

**Tech Stack:** PHP 8.1+ (`token_get_all`, `get_defined_constants`, subprocess via `PHP_BINARY`), PHPUnit 13 hermetic harness. Reuses `legacy_surface` (3b-2), `boot`/`boot_config_phases`/`boot_paths`/`compat_shim`/the catalog (all prior phases). Purely additive — no edits to existing runtime code; `config/config.php` is never modified or read as source.

## Global Constraints

- **Never modify or read `config/config.php` (or `config_db/areas/core.php`) as source.** The harness only *boots* `config.php` in a subprocess and captures its runtime `get_defined_constants()['user']` table — the single boot the user authorized. It never opens the source for inspection.
- **Tokenize, never execute, for name enumeration.** Version/tipos constant *names* are recovered with `legacy_surface::extract()` (`token_get_all`), never by including those files in the harness process.
- **One live boot only.** Booting the real `config.php` runs the full v6 chain (≈200 eager class includes; a likely single `matrix_activity` log row on shutdown) and needs the live DB. Task implementers do NOT run it — they build and hermetically test the pieces. The controller runs `boot_diff_run.php` exactly once, after the tasks, as the verification.
- **Redact secrets in all output.** The captured surfaces contain `DEDALO_SALT_STRING`, `DEDALO_PASSWORD_CONN`, etc. The classifier report prints constant NAMES and counts only — NEVER values.
- **Scope = surface-proof only.** Build only `version.inc` + `dd_tipos` include phases + the boot-diff harness/classifier. Do NOT build core_functions/logger/autoloader/session/request-state phases, and do NOT flip `config.php` — all deferred to the cutover unit.
- **Scope contract (spec §5.3/§5.9):** the new pipeline emits STATIC + DERIVED config consts (via `compat_shim`) + the `version.inc` + `dd_tipos.php` constants. REQUEST/USER are accessor-only (never emitted); SECRET/STATE/DERIVED_REQUEST are live-sourced (absent from the hermetic new surface). Those appear as OLD-only and are classified, not asserted.
- **Verified facts (drive the classifier):** the 6 dead-constant drops are `DEDALO_CONFIG`, `DEDALO_CORE`, `DEDALO_SHARED`, `DEDALO_TOOLS`, `DEDALO_LIB`, `DEDALO_SESSION_SAVE_PATH`. `version.inc` defines `DEDALO_VERSION/DEDALO_BUILD/DEDALO_MAJOR_VERSION`; `dd_tipos.php` defines ~200 `DEDALO_*_TIPO` (+ `DEDALO_SUPERUSER`, `OP_OR`, `OP_AND`) — pure declarative, no side effects, CLI-safe.
- **Hermetic harness conventions:** `test/server/unit/*_Test.php`, `declare(strict_types=1)`, `extends PHPUnit\Framework\TestCase`, global namespace, deps via `require_once dirname(__DIR__, 3) . '/...'`. Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml`.

## File Structure
- Create `core/base/boot/class.boot_subsystem_phases.php` — generic include-phase factory (Task 1).
- Create `install/class.boot_diff.php` — pure surface classifier + report renderer (Task 2).
- Create `install/boot_diff_new_surface.php` — boots the NEW pipeline in isolation, prints its surface as JSON (Task 3).
- Create `install/boot_diff_run.php` — orchestrates both subprocesses + classifier; the controller's one-shot live runner (Task 3).
- Tests: `test/server/unit/boot_subsystem_phases_Test.php` (T1), `test/server/unit/boot_diff_Test.php` (T2), `test/server/unit/boot_diff_new_surface_Test.php` (T3).

---

### Task 1: Generic subsystem include-phase factory

**Files:**
- Create: `core/base/boot/class.boot_subsystem_phases.php`
- Test: `test/server/unit/boot_subsystem_phases_Test.php`

**Interfaces:**
- Consumes: `boot_phase` (`class.boot_phase.php`), `boot`, `entrypoint_profile`, `boot_state`.
- Produces: `boot_subsystem_phases::include_phase(string $name, string $path, array $skip_in = []) : boot_phase` — a phase whose closure `require_once`s `$path` (throws if the file is missing).

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/boot_subsystem_phases_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.entrypoint_profile.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_state.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_phase.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_subsystem_phases.php';

final class boot_subsystem_phases_Test extends TestCase {

	private string $dir;

	protected function setUp() : void {
		parent::setUp();
		boot::reset();
		$this->dir = dirname(__FILE__) . '/fixtures';
		if (!is_dir($this->dir)) {
			mkdir($this->dir, 0755, true);
		}
	}
	protected function tearDown() : void { boot::reset(); }

	public function test_include_phase_requires_the_file_when_run() : void {
		// a unique constant name so we never collide with real constants
		$path = $this->dir . '/bsp_inc.php';
		file_put_contents($path, "<?php\ndefine('BSP_FIXTURE_MARKER', 4242);\n");

		$phase = boot_subsystem_phases::include_phase('marker', $path);
		$this->assertSame('marker', $phase->name);
		$this->assertFalse(defined('BSP_FIXTURE_MARKER'), 'not defined until the phase runs');

		boot::run(entrypoint_profile::CLI, [$phase]);

		$this->assertSame(boot_state::READY, boot::state());
		$this->assertTrue(defined('BSP_FIXTURE_MARKER'));
		$this->assertSame(4242, BSP_FIXTURE_MARKER);
	}

	public function test_include_phase_throws_on_missing_file() : void {
		$phase = boot_subsystem_phases::include_phase('absent', $this->dir . '/does_not_exist_zzz.php');
		boot::run(entrypoint_profile::CLI, [$phase]);
		// boot wraps the phase failure and lands FAILED with the phase recorded
		$this->assertSame(boot_state::FAILED, boot::state());
		$this->assertSame('absent', boot::failed_phase());
	}

	public function test_include_phase_honours_skip_in() : void {
		$phase = boot_subsystem_phases::include_phase('skipme', $this->dir . '/never.php', ['cli']);
		$this->assertFalse($phase->should_run(entrypoint_profile::CLI));
		$this->assertTrue($phase->should_run(entrypoint_profile::WEB));
	}
}
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter boot_subsystem_phases_Test`
Expected: FAIL — `Failed opening required '.../class.boot_subsystem_phases.php'`.

- [ ] **Step 3: Implement**

Create `core/base/boot/class.boot_subsystem_phases.php`:

```php
<?php declare(strict_types=1);

require_once __DIR__ . '/class.boot_phase.php';

/**
* BOOT_SUBSYSTEM_PHASES
* Factories for boot phases that include a legacy subsystem file by absolute path.
* In the prove-now scope only the CONSTANT-defining subsystems are wired:
*   - core/base/version.inc   → DEDALO_VERSION / DEDALO_BUILD / DEDALO_MAJOR_VERSION
*   - core/base/dd_tipos.php  → ~200 DEDALO_*_TIPO ontology constants
* Both are pure declarative define() files (no side effects, CLI-safe), so a phase is
* just a guarded require of the file. The remaining functioning-only subsystems
* (core_functions, logger, autoloader, session, request-state) are wired in the
* deferred cutover unit, where running the app verifies them.
*/
final class boot_subsystem_phases {

	/**
	* INCLUDE_PHASE — a boot_phase that require_once's a PHP file by absolute path.
	* @param string   $name    phase name (recorded by boot on failure)
	* @param string   $path    absolute path to the file to include
	* @param string[] $skip_in entrypoint_profile string values to skip in
	*/
	public static function include_phase(string $name, string $path, array $skip_in = []) : boot_phase {
		return new boot_phase($name, static function () use ($name, $path) : void {
			if (!is_file($path)) {
				throw new \RuntimeException("boot: {$name} phase: file not found: {$path}");
			}
			require_once $path;
		}, $skip_in);
	}
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter boot_subsystem_phases_Test`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add core/base/boot/class.boot_subsystem_phases.php test/server/unit/boot_subsystem_phases_Test.php
git commit -m "feat(boot): generic subsystem include-phase factory (version.inc/dd_tipos)"
```

---

### Task 2: `boot_diff` surface classifier

**Files:**
- Create: `install/class.boot_diff.php`
- Test: `test/server/unit/boot_diff_Test.php`

**Interfaces:**
- Consumes: `config_scope` enum; `config_key[]` (catalog); `legacy_surface::extract(string[]) : array` (Phase 3b-2, at `install/class.legacy_surface.php`).
- Produces:
  - `boot_diff::classify(array $old, array $new, array $catalog, array $subsystem_files) : array` returning `['parity'=>bool, 'new_count'=>int, 'old_count'=>int, 'missing'=>string[], 'new_extras'=>string[], 'value_mismatches'=>string[], 'buckets'=>['excluded'=>string[], 'live_secret_state'=>string[], 'dropped'=>string[], 'unexplained'=>string[]]]`.
  - `boot_diff::render(array $report) : string` — a names-and-counts-only report (NEVER prints values).

Classifier semantics:
- `$old`/`$new` are `constant_name => value` maps (from `get_defined_constants()['user']`).
- The new pipeline is expected to emit exactly: catalog consts with scope STATIC or DERIVED **plus** every constant defined in `$subsystem_files` (version + tipos).
- `missing` = expected consts absent from `$new`. `new_extras` = consts in `$new` outside the expected set. `value_mismatches` = consts in `$new` whose value differs from `$old`. `parity` = all three empty.
- OLD-only consts (in `$old`, not reproduced in `$new`) are bucketed: `excluded` (REQUEST/USER catalog scope), `live_secret_state` (SECRET/STATE/DERIVED_REQUEST/PASSTHROUGH catalog scope), `dropped` (the 6 known dead constants), `unexplained` (everything else — candidate Phase-4 passthrough/custom defines, possibly framework constants from eager class loading).

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/boot_diff_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/install/class.legacy_surface.php';
require_once dirname(__DIR__, 3) . '/install/class.boot_diff.php';

final class boot_diff_Test extends TestCase {

	private string $dir;

	protected function setUp() : void {
		parent::setUp();
		$this->dir = dirname(__FILE__) . '/fixtures';
		if (!is_dir($this->dir)) {
			mkdir($this->dir, 0755, true);
		}
	}

	/** a tiny catalog with one key per relevant scope */
	private function catalog() : array {
		return [
			new config_key('a.static',  'DD_STATIC',  'int',    1, config_scope::STATIC),
			new config_key('a.derived', 'DD_DERIVED', 'string', null, config_scope::DERIVED,
				config_merge::REPLACE, static fn(array $r) : string => 'd'),
			new config_key('a.request', 'DD_REQUEST', 'string', null, config_scope::REQUEST),
			new config_key('a.secret',  'DD_SECRET',  'string', null, config_scope::SECRET),
			new config_key('a.nullc',   null,         'string', 'x', config_scope::STATIC),
		];
	}

	private function subsystem_fixture() : array {
		$p = $this->dir . '/bd_subsystem.php';
		file_put_contents($p, "<?php\ndefine('DD_VERSION', '7.0');\ndefine('DD_TIPO_ROOT', 'dd1');\n");
		return [$p];
	}

	public function test_parity_when_new_reproduces_static_derived_and_subsystem() : void {
		$subsystem = $this->subsystem_fixture();
		// OLD: everything the real boot would emit
		$old = [
			'DD_STATIC' => 1, 'DD_DERIVED' => 'd',
			'DD_REQUEST' => 'lg-eng',        // excluded scope (old defines it, new must not)
			'DD_SECRET' => 'realsecret',     // live-sourced (old has it, new must not)
			'DEDALO_CORE' => 'core',         // a known drop
			'DD_VERSION' => '7.0', 'DD_TIPO_ROOT' => 'dd1',
			'CUSTOM_HACK' => 'whatever',     // unexplained (user define / framework)
		];
		// NEW: exactly the static+derived config consts + subsystem consts
		$new = [
			'DD_STATIC' => 1, 'DD_DERIVED' => 'd',
			'DD_VERSION' => '7.0', 'DD_TIPO_ROOT' => 'dd1',
		];

		$r = boot_diff::classify($old, $new, $this->catalog(), $subsystem);

		$this->assertTrue($r['parity'], 'expected parity');
		$this->assertSame([], $r['missing']);
		$this->assertSame([], $r['new_extras']);
		$this->assertSame([], $r['value_mismatches']);
		$this->assertSame(['DD_REQUEST'], $r['buckets']['excluded']);
		$this->assertSame(['DD_SECRET'], $r['buckets']['live_secret_state']);
		$this->assertSame(['DEDALO_CORE'], $r['buckets']['dropped']);
		$this->assertSame(['CUSTOM_HACK'], $r['buckets']['unexplained']);
	}

	public function test_missing_expected_const_breaks_parity() : void {
		$subsystem = $this->subsystem_fixture();
		$old = ['DD_STATIC' => 1, 'DD_DERIVED' => 'd', 'DD_VERSION' => '7.0', 'DD_TIPO_ROOT' => 'dd1'];
		$new = ['DD_STATIC' => 1, 'DD_DERIVED' => 'd', 'DD_VERSION' => '7.0']; // DD_TIPO_ROOT missing
		$r = boot_diff::classify($old, $new, $this->catalog(), $subsystem);
		$this->assertFalse($r['parity']);
		$this->assertSame(['DD_TIPO_ROOT'], $r['missing']);
	}

	public function test_value_mismatch_breaks_parity() : void {
		$subsystem = $this->subsystem_fixture();
		$old = ['DD_STATIC' => 1, 'DD_DERIVED' => 'd', 'DD_VERSION' => '7.0', 'DD_TIPO_ROOT' => 'dd1'];
		$new = ['DD_STATIC' => 999, 'DD_DERIVED' => 'd', 'DD_VERSION' => '7.0', 'DD_TIPO_ROOT' => 'dd1'];
		$r = boot_diff::classify($old, $new, $this->catalog(), $subsystem);
		$this->assertFalse($r['parity']);
		$this->assertSame(['DD_STATIC'], $r['value_mismatches']);
	}

	public function test_new_extra_breaks_parity() : void {
		$subsystem = $this->subsystem_fixture();
		$old = ['DD_STATIC' => 1, 'DD_DERIVED' => 'd', 'DD_VERSION' => '7.0', 'DD_TIPO_ROOT' => 'dd1', 'DD_EXTRA' => 5];
		$new = ['DD_STATIC' => 1, 'DD_DERIVED' => 'd', 'DD_VERSION' => '7.0', 'DD_TIPO_ROOT' => 'dd1', 'DD_EXTRA' => 5];
		$r = boot_diff::classify($old, $new, $this->catalog(), $subsystem);
		$this->assertFalse($r['parity']);
		$this->assertSame(['DD_EXTRA'], $r['new_extras']);
	}

	public function test_render_never_prints_values() : void {
		$subsystem = $this->subsystem_fixture();
		$old = ['DD_STATIC' => 1, 'DD_DERIVED' => 'd', 'DD_SECRET' => 'TOP_SECRET_SALT', 'DD_VERSION' => '7.0', 'DD_TIPO_ROOT' => 'dd1'];
		$new = ['DD_STATIC' => 1, 'DD_DERIVED' => 'd', 'DD_VERSION' => '7.0', 'DD_TIPO_ROOT' => 'dd1'];
		$out = boot_diff::render(boot_diff::classify($old, $new, $this->catalog(), $subsystem));
		$this->assertStringContainsString('DD_SECRET', $out);          // name appears
		$this->assertStringNotContainsString('TOP_SECRET_SALT', $out); // value never does
	}
}
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter boot_diff_Test`
Expected: FAIL — class `boot_diff` not found.

- [ ] **Step 3: Implement**

Create `install/class.boot_diff.php`:

```php
<?php declare(strict_types=1);

require_once __DIR__ . '/class.legacy_surface.php';

/**
* BOOT_DIFF (spec §5.9, prove-now)
* Pure classifier comparing two captured constant surfaces: $old (from booting the
* legacy config.php) vs $new (from booting the new pipeline). It proves the new
* pipeline reproduces exactly the config-originated surface (catalog STATIC/DERIVED +
* version.inc + dd_tipos.php) and classifies every old-only constant. Reports print
* NAMES and counts only — never values — because the surfaces hold secrets (salt, DB
* password) and unmigrated custom defines.
*/
final class boot_diff {

	/** v6 constants v7 intentionally drops (verified 0 consumers). */
	private const DROPS = ['DEDALO_CONFIG', 'DEDALO_CORE', 'DEDALO_SHARED', 'DEDALO_TOOLS', 'DEDALO_LIB', 'DEDALO_SESSION_SAVE_PATH'];

	/**
	* @param array<string,mixed> $old constants from the legacy config.php boot
	* @param array<string,mixed> $new constants from the new-pipeline boot
	* @param config_key[] $catalog
	* @param string[] $subsystem_files absolute paths whose define()s the new pipeline includes (version.inc, dd_tipos.php)
	* @return array{parity:bool,new_count:int,old_count:int,missing:string[],new_extras:string[],value_mismatches:string[],buckets:array<string,string[]>}
	*/
	public static function classify(array $old, array $new, array $catalog, array $subsystem_files) : array {

		$emit_expected = []; // STATIC + DERIVED config consts (new MUST emit)
		$excluded      = []; // REQUEST + USER (never emitted)
		$live          = []; // SECRET + STATE + DERIVED_REQUEST + PASSTHROUGH (live-sourced)
		foreach ($catalog as $key) {
			if ($key->const === null) {
				continue;
			}
			if ($key->scope === config_scope::STATIC || $key->scope === config_scope::DERIVED) {
				$emit_expected[$key->const] = true;
			} elseif ($key->scope === config_scope::REQUEST || $key->scope === config_scope::USER) {
				$excluded[$key->const] = true;
			} else {
				$live[$key->const] = true;
			}
		}

		// version + tipos constant NAMES, recovered by tokenizing (never including) the files
		$subsystem = [];
		foreach (legacy_surface::extract($subsystem_files) as $name => $info) {
			$subsystem[$name] = true;
		}

		$expected_new = $emit_expected + $subsystem; // union of keys

		$missing = [];
		foreach (array_keys($expected_new) as $const) {
			if (!array_key_exists($const, $new)) {
				$missing[] = $const;
			}
		}

		$new_extras = [];
		foreach (array_keys($new) as $const) {
			if (!isset($expected_new[$const])) {
				$new_extras[] = $const;
			}
		}

		$value_mismatches = [];
		foreach ($new as $const => $value) {
			if (array_key_exists($const, $old) && $old[$const] !== $value) {
				$value_mismatches[] = $const;
			}
		}

		$buckets = ['excluded' => [], 'live_secret_state' => [], 'dropped' => [], 'unexplained' => []];
		foreach (array_keys($old) as $const) {
			if (array_key_exists($const, $new)) {
				continue; // reproduced — not an old-only extra
			}
			if (isset($excluded[$const])) {
				$buckets['excluded'][] = $const;
			} elseif (isset($live[$const])) {
				$buckets['live_secret_state'][] = $const;
			} elseif (in_array($const, self::DROPS, true)) {
				$buckets['dropped'][] = $const;
			} else {
				$buckets['unexplained'][] = $const;
			}
		}

		sort($missing); sort($new_extras); sort($value_mismatches);
		foreach ($buckets as &$b) { sort($b); } unset($b);

		return [
			'parity'           => ($missing === [] && $new_extras === [] && $value_mismatches === []),
			'new_count'        => count($new),
			'old_count'        => count($old),
			'missing'          => $missing,
			'new_extras'       => $new_extras,
			'value_mismatches' => $value_mismatches,
			'buckets'          => $buckets,
		];
	}//end classify

	/** Render a names-and-counts-only report. NEVER prints constant values. */
	public static function render(array $r) : string {
		$lines = [];
		$lines[] = '=== boot-diff (prove-now) ===';
		$lines[] = 'parity: ' . ($r['parity'] ? 'YES — new pipeline reproduces the config surface' : 'NO — see below');
		$lines[] = "surface sizes: old={$r['old_count']} new={$r['new_count']}";
		$lines[] = '';
		$lines[] = '-- parity failures (must be empty) --';
		$lines[] = 'missing from new (' . count($r['missing']) . '): ' . implode(', ', $r['missing']);
		$lines[] = 'unexpected in new (' . count($r['new_extras']) . '): ' . implode(', ', $r['new_extras']);
		$lines[] = 'value mismatches (' . count($r['value_mismatches']) . '): ' . implode(', ', $r['value_mismatches']);
		$lines[] = '';
		$lines[] = '-- old-only constants, classified (names only; values redacted) --';
		$lines[] = 'excluded REQUEST/USER (' . count($r['buckets']['excluded']) . '): ' . implode(', ', $r['buckets']['excluded']);
		$lines[] = 'live SECRET/STATE/DERIVED_REQUEST (' . count($r['buckets']['live_secret_state']) . '): ' . implode(', ', $r['buckets']['live_secret_state']);
		$lines[] = 'intentional drops (' . count($r['buckets']['dropped']) . '): ' . implode(', ', $r['buckets']['dropped']);
		$lines[] = 'UNEXPLAINED — review for Phase-4 passthrough or framework consts (' . count($r['buckets']['unexplained']) . '): ' . implode(', ', $r['buckets']['unexplained']);
		return implode("\n", $lines);
	}//end render
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter boot_diff_Test`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add install/class.boot_diff.php test/server/unit/boot_diff_Test.php
git commit -m "feat(config): boot_diff surface classifier (parity + redacted classification)"
```

---

### Task 3: New-pipeline capture script + live runner

**Files:**
- Create: `install/boot_diff_new_surface.php` — boots the NEW pipeline (surface scope) and prints its surface as JSON.
- Create: `install/boot_diff_run.php` — the controller's one-shot live runner (spawns both subprocesses, classifies, prints redacted report, exit code = parity).
- Test: `test/server/unit/boot_diff_new_surface_Test.php` — runs the new-surface script as a subprocess (hermetic; NO DB) and asserts its surface.

**Interfaces:**
- Consumes: `boot`, `boot_config_phases::phases(catalog, overrides, ?definer)`, `boot_paths::resolve(config_dir, server, sapi)`, `boot_subsystem_phases::include_phase(name, path)` (Task 1), the catalog, `boot_diff::classify/render` (Task 2), `legacy_surface` (3b-2).
- Produces: `boot_diff_new_surface.php` prints `json_encode(get_defined_constants(true)['user'])` after booting; `boot_diff_run.php` is an executable verification entrypoint.

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/boot_diff_new_surface_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class boot_diff_new_surface_Test extends TestCase {

	public function test_new_surface_script_emits_config_version_and_tipos() : void {
		$root   = dirname(__DIR__, 3);
		$script = $root . '/install/boot_diff_new_surface.php';
		$this->assertFileExists($script);

		$cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($script) . ' 2>/dev/null';
		$json = shell_exec($cmd);
		$surface = json_decode((string) $json, true);

		$this->assertIsArray($surface, 'new-surface script must print a JSON object of user constants');

		// a STATIC config constant (from the catalog via compat_shim)
		$this->assertArrayHasKey('DEDALO_IMAGE_THUMB_WIDTH', $surface);
		$this->assertSame(222, $surface['DEDALO_IMAGE_THUMB_WIDTH']);
		// a DERIVED path constant
		$this->assertArrayHasKey('DEDALO_CORE_PATH', $surface);
		// version.inc constant
		$this->assertArrayHasKey('DEDALO_VERSION', $surface);
		// a dd_tipos constant
		$this->assertArrayHasKey('DEDALO_ROOT_TIPO', $surface);
		// SECRET/STATE are NOT emitted by the hermetic new pipeline
		$this->assertArrayNotHasKey('DEDALO_PASSWORD_CONN', $surface);
		// REQUEST/USER accessor-only are NOT emitted
		$this->assertArrayNotHasKey('SHOW_DEBUG', $surface);
	}
}
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter boot_diff_new_surface_Test`
Expected: FAIL — `assertFileExists` fails (script not created yet).

- [ ] **Step 3: Implement the new-surface capture script**

Create `install/boot_diff_new_surface.php`:

```php
<?php declare(strict_types=1);

/**
* BOOT_DIFF_NEW_SURFACE
* Boots the NEW config pipeline (prove-now surface scope) in isolation and prints its
* emitted user-constant surface as JSON on stdout. Used by boot_diff_run.php as the
* "new" subprocess, and exercised hermetically by boot_diff_new_surface_Test.
*
* Surface scope = config catalog (STATIC/DERIVED via compat_shim) + version.inc +
* dd_tipos.php. NO database, session, autoloader, or logger — none affect the constant
* surface. SECRET/STATE are absent (live-sourced); REQUEST/USER are accessor-only.
*/

$root = dirname(__DIR__); // install/ -> repo root

require_once $root . '/core/base/config/class.config_scope.php';
require_once $root . '/core/base/config/class.config_merge.php';
require_once $root . '/core/base/config/class.config_key.php';
require_once $root . '/core/base/config/class.config.php';
require_once $root . '/core/base/config/class.config_compiler.php';
require_once $root . '/core/base/config/class.compat_shim.php';
require_once $root . '/core/base/boot/class.entrypoint_profile.php';
require_once $root . '/core/base/boot/class.boot_state.php';
require_once $root . '/core/base/boot/class.boot_phase.php';
require_once $root . '/core/base/boot/class.boot.php';
require_once $root . '/core/base/boot/class.boot_config_phases.php';
require_once $root . '/core/base/boot/class.boot_paths.php';
require_once $root . '/core/base/boot/class.boot_subsystem_phases.php';

$catalog = require $root . '/core/base/config/catalog/catalog.php';

// runtime-derived path bases (root/root_web/host/protocol) as a compiler layer override
$paths_override = boot_paths::resolve($root . '/config', $_SERVER, php_sapi_name());

// config_build + compat_shim (default definer = real guarded define())
$phases = boot_config_phases::phases($catalog, [$paths_override]);
// + the two constant-defining subsystem includes
$phases[] = boot_subsystem_phases::include_phase('version', $root . '/core/base/version.inc');
$phases[] = boot_subsystem_phases::include_phase('dd_tipos', $root . '/core/base/dd_tipos.php');

boot::run(entrypoint_profile::CLI, $phases);

echo json_encode(get_defined_constants(true)['user']);
```

- [ ] **Step 4: Run it — expect PASS**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter boot_diff_new_surface_Test`
Expected: PASS (1 test). If `DEDALO_ROOT_TIPO` or `DEDALO_VERSION` is absent, the include paths are wrong — fix the paths, do not delete the assertion.

- [ ] **Step 5: Implement the live runner**

Create `install/boot_diff_run.php`:

```php
<?php declare(strict_types=1);

/**
* BOOT_DIFF_RUN (spec §5.9, prove-now) — CONTROLLER one-shot verification.
* Boots the OLD config.php and the NEW pipeline in ISOLATED subprocesses, captures each
* emitted user-constant surface, and prints a redacted classification.
*
* Booting config.php runs the full v6 chain and needs the live DB — run this ONCE on the
* install box. It NEVER reads config.php source; it only captures the runtime constant
* table the boot produces. Values are never printed (see boot_diff::render).
*
* Usage:  php install/boot_diff_run.php
* Exit:   0 = parity, 1 = parity failure, 2 = a surface capture failed.
*/

$root = dirname(__DIR__);

require_once $root . '/core/base/config/class.config_scope.php';
require_once $root . '/core/base/config/class.config_merge.php';
require_once $root . '/core/base/config/class.config_key.php';
require_once $root . '/install/class.legacy_surface.php';
require_once $root . '/install/class.boot_diff.php';

// --- subprocess: NEW pipeline surface (hermetic, no DB) ---
$new_cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($root . '/install/boot_diff_new_surface.php') . ' 2>/dev/null';
$new = json_decode((string) shell_exec($new_cmd), true);
if (!is_array($new)) {
	fwrite(STDERR, "boot_diff: new-pipeline surface capture failed\n");
	exit(2);
}

// --- subprocess: OLD config.php surface (runs the full v6 chain; needs the live DB) ---
$old_php = 'include ' . var_export($root . '/config/config.php', true) . '; echo json_encode(get_defined_constants(true)["user"]);';
$old_cmd = escapeshellarg(PHP_BINARY) . ' -d error_reporting=0 -d display_errors=0 -r ' . escapeshellarg($old_php) . ' 2>/dev/null';
$old = json_decode((string) shell_exec($old_cmd), true);
if (!is_array($old)) {
	fwrite(STDERR, "boot_diff: legacy config.php surface capture failed (CLI boot did not complete)\n");
	exit(2);
}

$catalog         = require $root . '/core/base/config/catalog/catalog.php';
$subsystem_files = [$root . '/core/base/version.inc', $root . '/core/base/dd_tipos.php'];

$report = boot_diff::classify($old, $new, $catalog, $subsystem_files);
echo boot_diff::render($report) . "\n";
exit($report['parity'] ? 0 : 1);
```

- [ ] **Step 6: Commit**

```bash
git add install/boot_diff_new_surface.php install/boot_diff_run.php test/server/unit/boot_diff_new_surface_Test.php
git commit -m "feat(config): boot-diff harness — new-surface capture + one-shot live runner"
```

- [ ] **Step 7: Full hermetic suite (no regressions)**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml`
Expected: all green; report the new totals (was 191 tests / 2228 assertions; expect +9 tests from Tasks 1–3).

---

## Controller verification (NOT an implementer task — run once, after all tasks land)

After Tasks 1–3 are reviewed and green, the controller runs the live boot-diff exactly once on the install box and reports the result to the user:

```bash
php install/boot_diff_run.php; echo "exit=$?"
```

Expected: `parity: YES`, with the old-only constants falling entirely into `excluded` (REQUEST/USER), `live_secret_state` (SECRET/STATE), and `dropped` (the 6). The `unexplained` bucket is the headline deliverable — the dev box's custom defines (Phase-4 passthrough candidates) plus any framework constants from eager class loading. A non-empty `missing`/`new_extras`/`value_mismatches` is a real finding to surface, not to paper over. (If the legacy CLI boot cannot complete and exits 2, that itself is a finding — report it; do not retry-loop the live boot.)

---

## Self-Review

**Spec coverage (§5.9 prove-now):** the boot-diff boots old vs new in isolated subprocesses and diffs `get_defined_constants()['user']` (Task 3 runner), proving the new pipeline reproduces the legacy surface minus the excluded/live sets (Task 2 classifier). The version/tipos surface beyond config is covered by the Task-1 include phases + the new-surface script. The full-install boot-diff against a real running install with a DB is realized by the controller's one-shot run; the flip is explicitly deferred.

**Placeholder scan:** every step has complete code or an exact command + expected output. The classifier's buckets and the 6 drops are concrete. No TBDs.

**Type consistency:** `boot_subsystem_phases::include_phase(name, path, skip_in)` (T1) is consumed identically in the new-surface script (T3). `boot_diff::classify(old, new, catalog, subsystem_files)` / `render(report)` (T2) are consumed identically in the runner (T3). `legacy_surface::extract(string[])` returns `name => [...]` (3b-2) and is iterated by key in `classify`. `boot_config_phases::phases(catalog, overrides, ?definer)`, `boot_paths::resolve(config_dir, server, sapi)`, and the `require`-returns-`config_key[]` catalog all match the real signatures.

**Redaction:** `render` and every test assert names/counts only; `test_render_never_prints_values` pins that secrets never reach output.

**Carry-overs to the cutover (flip) unit:** functioning-only phases (core_functions, logger registration + lazy DSN, autoloader [drop the `include_once` logger workaround], session [WEB-only], request-state [WEB-only], error/shutdown handlers P0); HTTPS/proxy handling in `boot_paths`; the `config.php` → thin-shim flip (gated on Phase-4 migration of the dev box's real values + salt, a timestamped backup, and explicit sign-off). The live boot-diff's `unexplained` bucket feeds Phase-4's passthrough preservation.
