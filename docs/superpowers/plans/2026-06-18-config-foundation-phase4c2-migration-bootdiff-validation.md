# Phase 4c-2 — Migration pre-commit boot-diff validation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove a migration is faithful before committing it — boot a pipeline that CONSUMES the migrated artifacts (`.env`/local-config/`state.php`/passthrough) and confirm it reproduces the legacy config's constant surface (with real values now), minus the intentionally-excluded REQUEST/USER accessor-only set.

**Architecture:** This builds the cutover's *surface-boot* (consuming migrated config + emitting SECRET/STATE), proven via boot-diff, WITHOUT flipping `config.php` or building the WEB-only functioning phases. Three units under `install/`: a `boot_secret_state_phases::emit_phase` (define()s SECRET from the loaded `.env` and STATE from `state.php` — the gap `compat_shim` leaves), `boot_diff_migrated_surface.php` (assembles the migrated-config-consuming pipeline against a staging dir and prints its surface), and `migration_validator` + `validate_migration.php` (the diff/verdict + the controller's gated live run). Catalog and subsystem files are explicit args so the hermetic tests use fixtures and the live run uses the real catalog + `version.inc`/`dd_tipos.php`.

**Tech Stack:** PHP 8.1+ (subprocess via `PHP_BINARY`, `get_defined_constants`), PHPUnit 13 hermetic harness. Reuses `env_loader`, `boot`/`boot_paths`/`boot_config_phases`/`boot_runtime_phases`/`boot_subsystem_phases`, `compat_shim`, `boot_diff`, `migration_runner`/`migration_committer`, `config_scope`/`config_key`.

## Global Constraints

- **Read values, never alter them.** The migrated `.env`/state/config are read to emit constants; the salt and all values pass through byte-for-byte.
- **Never flip `config.php`; never build WEB-only phases here.** Session, request-state, and error/shutdown handlers (and the actual shim swap) are the cutover's job. 4c-2 builds only the surface-relevant phases + the validation.
- **SECRET/STATE emission gap:** `compat_shim` emits STATIC/DERIVED only (from the compiled `$flat`). The migrated pipeline must additionally emit SECRET (from the loaded `.env`, keyed by constant name) and STATE (from `state.php`, keyed by catalog dot-path), interleaved AFTER `compat_shim`.
- **Phase order (assembled directly, interleaved):** env_load → config_build (catalog + [paths_override, local_config_override]) → compat_shim → secret_state_emit → version include → dd_tipos include → passthrough include.
- **The faithful-migration check:** every constant in the OLD surface must appear in the MIGRATED surface with an identical value — EXCEPT catalog scope REQUEST/USER (accessor-only; legitimately absent from the new surface). DERIVED_REQUEST (host/web-root/protocol) may still differ in CLI (the known `boot_paths` web-root reconciliation — a cutover carry-over, reported, not failing the salt/secret/config checks).
- **Hermetic tests use fixtures; the live run is gated.** Every test runs against fixture configs/catalogs + temp staging dirs and writes nothing real. The real validation (boots the real `config.php`, needs the DB) is the controller's one-shot, run before any migration commit — never by tests/implementers.
- **Catalog + subsystem files are explicit args** to the capture script and validator (default to the real `catalog.php` + `version.inc`/`dd_tipos.php` in the live runner; fixtures in tests).
- **Hermetic harness conventions:** `test/server/unit/*_Test.php`, `declare(strict_types=1)`, `extends PHPUnit\Framework\TestCase`, deps via `require_once dirname(__DIR__, 3) . '/...'`. Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml`.

## File Structure
- Create `core/base/boot/class.boot_secret_state_phases.php` (Task 1) — SECRET/STATE emission phase.
- Create `install/boot_diff_migrated_surface.php` (Task 2) — migrated-config-consuming surface capture.
- Create `install/class.migration_validator.php` + `install/validate_migration.php` (Task 3) — diff/verdict + gated live runner.
- Tests: `boot_secret_state_phases_Test.php`, `boot_diff_migrated_surface_Test.php`, `migration_validator_Test.php`.

---

### Task 1: `boot_secret_state_phases::emit_phase`

**Files:**
- Create: `core/base/boot/class.boot_secret_state_phases.php`
- Test: `test/server/unit/boot_secret_state_phases_Test.php`

**Interfaces:**
- Consumes: `boot_phase`, `config_scope`, `config_key[]` catalog, `env_loader::get` (SECRET values), `require` of a `state.php` returning `[dot.path=>value]`.
- Produces: `boot_secret_state_phases::emit_phase(array $catalog, ?string $state_file = null, ?callable $definer = null) : boot_phase` — a phase named `secret_state_emit` that, for each catalog key with a const: if SECRET, `define(const, env_loader::get(const))` when the env value is non-null; if STATE, `define(const, $state[path])` when the state file has that path. The `$definer` is injectable (defaults to a guarded `define()`), so tests capture via a spy without polluting real constants. Requires `env_loader` to have been loaded already (an env_load phase runs earlier).

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/boot_secret_state_phases_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.env_loader.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.entrypoint_profile.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_state.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_phase.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_secret_state_phases.php';

final class boot_secret_state_phases_Test extends TestCase {

	private string $dir;

	protected function setUp() : void {
		parent::setUp();
		boot::reset();
		env_loader::reset();
		$this->dir = dirname(__FILE__) . '/fixtures';
		if (!is_dir($this->dir)) { mkdir($this->dir, 0755, true); }
	}
	protected function tearDown() : void { boot::reset(); env_loader::reset(); }

	private function catalog() : array {
		return [
			new config_key('db.password', 'DD_T1_SECRET', 'string', null, config_scope::SECRET),
			new config_key('state.info',  'DD_T1_STATE',  'string', null, config_scope::STATE),
			new config_key('db.host',     'DD_T1_STATIC', 'string', 'localhost', config_scope::STATIC),
		];
	}

	public function test_emits_secret_from_env_and_state_from_state_file() : void {
		$env = $this->dir . '/ss_env.env';
		file_put_contents($env, "DD_T1_SECRET=topsecret\n");
		chmod($env, 0600);
		env_loader::load($env);

		$state = $this->dir . '/ss_state.php';
		file_put_contents($state, "<?php return ['state.info' => 'fingerprint-x'];\n");

		$recorded = [];
		$spy = static function (string $name, mixed $value) use (&$recorded) : void { $recorded[$name] = $value; };

		boot::run(entrypoint_profile::CLI, [boot_secret_state_phases::emit_phase($this->catalog(), $state, $spy)]);

		$this->assertSame(boot_state::READY, boot::state());
		$this->assertSame('topsecret', $recorded['DD_T1_SECRET']);     // SECRET from .env (key == const name)
		$this->assertSame('fingerprint-x', $recorded['DD_T1_STATE']);  // STATE from state.php (by dot-path)
		$this->assertArrayNotHasKey('DD_T1_STATIC', $recorded);        // STATIC is compat_shim's job, not this phase
	}

	public function test_skips_secret_absent_from_env_and_state_absent_from_file() : void {
		$recorded = [];
		$spy = static function (string $name, mixed $value) use (&$recorded) : void { $recorded[$name] = $value; };
		// no env loaded, no state file
		boot::run(entrypoint_profile::CLI, [boot_secret_state_phases::emit_phase($this->catalog(), null, $spy)]);
		$this->assertSame([], $recorded);
	}
}
```

- [ ] **Step 2: Run it — expect FAIL** (`--filter boot_secret_state_phases_Test`): class not found.

- [ ] **Step 3: Implement**

Create `core/base/boot/class.boot_secret_state_phases.php`:

```php
<?php declare(strict_types=1);

require_once __DIR__ . '/class.boot_phase.php';
require_once __DIR__ . '/class.env_loader.php';
require_once __DIR__ . '/../config/class.config_scope.php';

/**
* BOOT_SECRET_STATE_PHASES
* compat_shim emits STATIC/DERIVED (the compiled $flat) only. The migrated/cutover boot
* must ALSO emit SECRET constants — sourced LIVE from the loaded .env (env_loader),
* keyed by the constant name — and STATE constants — sourced from state.php, keyed by the
* catalog dot-path. This phase fills that gap; it runs AFTER env_load + compat_shim. The
* $definer is injectable so it is unit-testable without polluting real process constants.
*/
final class boot_secret_state_phases {

	/**
	* @param config_key[] $catalog
	* @param ?string $state_file absolute path to a state.php returning [dot.path => value]
	* @param ?callable $definer fn(string $name, mixed $value): void (default: guarded define)
	*/
	public static function emit_phase(array $catalog, ?string $state_file = null, ?callable $definer = null) : boot_phase {
		return new boot_phase('secret_state_emit', static function () use ($catalog, $state_file, $definer) : void {
			$definer ??= static function (string $name, mixed $value) : void {
				if (!defined($name)) {
					define($name, $value);
				}
			};
			$state = ($state_file !== null && is_file($state_file)) ? (require $state_file) : [];
			if (!is_array($state)) {
				$state = [];
			}
			foreach ($catalog as $key) {
				if ($key->const === null) {
					continue;
				}
				if ($key->scope === config_scope::SECRET) {
					$v = env_loader::get($key->const); // .env key == constant name (env_writer convention)
					if ($v !== null) {
						$definer($key->const, $v);
					}
				} elseif ($key->scope === config_scope::STATE) {
					if (array_key_exists($key->path, $state)) {
						$definer($key->const, $state[$key->path]);
					}
				}
			}
		});
	}//end emit_phase
}
```

- [ ] **Step 4: Run it — expect PASS** (`--filter boot_secret_state_phases_Test`, 2 tests).

- [ ] **Step 5: Commit**

```bash
git add core/base/boot/class.boot_secret_state_phases.php test/server/unit/boot_secret_state_phases_Test.php
git commit -m "feat(boot): secret/state emission phase (SECRET from .env, STATE from state.php)"
```

---

### Task 2: `boot_diff_migrated_surface.php` (migrated-config-consuming capture)

**Files:**
- Create: `install/boot_diff_migrated_surface.php`
- Test: `test/server/unit/boot_diff_migrated_surface_Test.php`

**Interfaces:**
- Consumes: `boot`, `boot_config_phases::phases`, `boot_runtime_phases::env_load_phase`, `boot_paths::resolve`, `boot_secret_state_phases::emit_phase` (Task 1), `boot_subsystem_phases::include_phase`, `compat_shim`; a catalog file (returns `config_key[]`) and the staging artifacts.
- Produces: a CLI capture script. Args: `--staging=DIR` (the migrated artifacts root), `--catalog=FILE` (returns `config_key[]`), `--subsystem=FILE` (repeatable; PHP files to include for extra constants — real run passes `version.inc` + `dd_tipos.php`). Prints `json_encode(get_defined_constants(true)['user'])`. Consumes from the staging dir: `private/.env`, `config/local/config.php`, `config/state.php`, `config/local/passthrough.php` (each optional).

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/boot_diff_migrated_surface_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class boot_diff_migrated_surface_Test extends TestCase {

	private string $sb;
	private string $script;

	protected function setUp() : void {
		parent::setUp();
		$this->script = dirname(__DIR__, 3) . '/install/boot_diff_migrated_surface.php';
		$this->sb = sys_get_temp_dir() . '/bdms_' . getmypid() . '_' . substr(md5(uniqid('', true)), 0, 6);
		@mkdir($this->sb . '/private', 0755, true);
		@mkdir($this->sb . '/config/local', 0755, true);

		// migrated artifacts
		file_put_contents($this->sb . '/private/.env', "DD_M_SECRET=migpw\n");
		file_put_contents($this->sb . '/config/local/config.php', "<?php declare(strict_types=1);\nreturn array ( 'db.host' => 'pg.mig.org' );\n");
		file_put_contents($this->sb . '/config/state.php', "<?php declare(strict_types=1);\nreturn array ( 'state.info' => 'mig-fingerprint' );\n");
		file_put_contents($this->sb . '/config/local/passthrough.php', "<?php declare(strict_types=1);\nif (!defined('DD_M_PATATA')) { define('DD_M_PATATA', 'potato'); }\n");

		// a fixture catalog
		file_put_contents($this->sb . '/catalog.php', <<<'PHP'
		<?php declare(strict_types=1);
		$root = dirname(__DIR__, 1);
		require_once dirname(__FILE__, 4) . '/master_dedalo/core/base/config/class.config_scope.php';
		// NOTE: resolved at runtime by the script's own requires; this file only returns keys.
		return [
			new config_key('db.host',     'DD_M_HOST',   'string', 'localhost', config_scope::STATIC),
			new config_key('db.password', 'DD_M_SECRET', 'string', null, config_scope::SECRET),
			new config_key('state.info',  'DD_M_STATE',  'string', null, config_scope::STATE),
		];
		PHP);
		// a fixture subsystem file (stands in for version.inc/dd_tipos)
		file_put_contents($this->sb . '/subsys.php', "<?php if (!defined('DD_M_TIPO')) define('DD_M_TIPO', 'dd1');\n");
	}

	protected function tearDown() : void {
		if (is_dir($this->sb)) {
			$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($this->sb, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
			foreach ($it as $f) { $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname()); }
			@rmdir($this->sb);
		}
	}

	public function test_migrated_surface_reflects_env_state_override_and_passthrough() : void {
		$cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($this->script)
			. ' ' . escapeshellarg('--staging=' . $this->sb)
			. ' ' . escapeshellarg('--catalog=' . $this->sb . '/catalog.php')
			. ' ' . escapeshellarg('--subsystem=' . $this->sb . '/subsys.php')
			. ' 2>&1';
		$surface = json_decode((string) shell_exec($cmd), true);

		$this->assertIsArray($surface, 'script must print a JSON surface');
		$this->assertSame('migpw', $surface['DD_M_SECRET']);       // SECRET from migrated .env
		$this->assertSame('pg.mig.org', $surface['DD_M_HOST']);    // STATIC override from migrated local config
		$this->assertSame('mig-fingerprint', $surface['DD_M_STATE']); // STATE from migrated state.php
		$this->assertSame('potato', $surface['DD_M_PATATA']);      // passthrough preserved
		$this->assertSame('dd1', $surface['DD_M_TIPO']);           // subsystem include
	}
}
```

(Note: the fixture catalog's `config_key`/`config_scope` symbols resolve because the SCRIPT require_once's those classes before `require`-ing the catalog file. The catalog file itself only constructs and returns the array.)

- [ ] **Step 2: Run it — expect FAIL** (`--filter boot_diff_migrated_surface_Test`): script missing.

- [ ] **Step 3: Implement**

Create `install/boot_diff_migrated_surface.php`:

```php
<?php declare(strict_types=1);

/**
* BOOT_DIFF_MIGRATED_SURFACE
* Boots the migrated-config-CONSUMING pipeline against a staging dir and prints its
* user-constant surface as JSON. The cutover's surface-boot, minus the flip: it loads the
* migrated .env (secrets), applies the migrated local config override (a compiler layer),
* emits STATIC/DERIVED (compat_shim) + SECRET/STATE (boot_secret_state_phases), includes
* the subsystem constant files (version.inc/dd_tipos), and includes the migrated
* passthrough. Catalog + subsystem files are explicit args (fixtures in tests; real ones
* in the live validator). No DB; reads only the staging dir.
*
* Usage: php install/boot_diff_migrated_surface.php --staging=DIR --catalog=FILE [--subsystem=FILE ...]
*/

$repo = dirname(__DIR__);

require_once $repo . '/core/base/config/class.config_scope.php';
require_once $repo . '/core/base/config/class.config_merge.php';
require_once $repo . '/core/base/config/class.config_key.php';
require_once $repo . '/core/base/config/class.config.php';
require_once $repo . '/core/base/config/class.config_compiler.php';
require_once $repo . '/core/base/config/class.compat_shim.php';
require_once $repo . '/core/base/boot/class.entrypoint_profile.php';
require_once $repo . '/core/base/boot/class.boot_state.php';
require_once $repo . '/core/base/boot/class.boot_phase.php';
require_once $repo . '/core/base/boot/class.boot.php';
require_once $repo . '/core/base/boot/class.boot_config_phases.php';
require_once $repo . '/core/base/boot/class.boot_paths.php';
require_once $repo . '/core/base/boot/class.boot_runtime_phases.php';
require_once $repo . '/core/base/boot/class.boot_subsystem_phases.php';
require_once $repo . '/core/base/boot/class.boot_secret_state_phases.php';

$staging = null; $catalog_file = null; $subsystems = [];
foreach (array_slice($argv, 1) as $arg) {
	if (preg_match('/^--staging=(.*)$/', $arg, $m))   { $staging = $m[1]; continue; }
	if (preg_match('/^--catalog=(.*)$/', $arg, $m))   { $catalog_file = $m[1]; continue; }
	if (preg_match('/^--subsystem=(.*)$/', $arg, $m)) { $subsystems[] = $m[1]; continue; }
}
if ($staging === null || $catalog_file === null || !is_file($catalog_file)) {
	fwrite(STDERR, "boot_diff_migrated_surface: need --staging=DIR and --catalog=FILE\n");
	exit(2);
}

$catalog = require $catalog_file;

$phases = [];
$env = $staging . '/private/.env';
if (is_file($env)) {
	$phases[] = boot_runtime_phases::env_load_phase($env);
}
$paths_override = boot_paths::resolve($staging . '/config', $_SERVER, php_sapi_name());
$local_cfg = $staging . '/config/local/config.php';
$local_override = is_file($local_cfg) ? (require $local_cfg) : [];
if (!is_array($local_override)) {
	$local_override = [];
}
foreach (boot_config_phases::phases($catalog, [$paths_override, $local_override]) as $p) {
	$phases[] = $p;
}
$phases[] = boot_secret_state_phases::emit_phase($catalog, $staging . '/config/state.php');
foreach ($subsystems as $i => $file) {
	$phases[] = boot_subsystem_phases::include_phase('subsystem_' . $i, $file);
}
$passthrough = $staging . '/config/local/passthrough.php';
if (is_file($passthrough)) {
	$phases[] = boot_subsystem_phases::include_phase('passthrough', $passthrough);
}

boot::run(entrypoint_profile::CLI, $phases);

echo json_encode(get_defined_constants(true)['user']);
```

- [ ] **Step 4: Run it — expect PASS** (`--filter boot_diff_migrated_surface_Test`, 1 test). If a migrated value is missing, the phase wiring/order is wrong — fix the SCRIPT, not the test.

- [ ] **Step 5: Commit**

```bash
git add install/boot_diff_migrated_surface.php test/server/unit/boot_diff_migrated_surface_Test.php
git commit -m "feat(install): boot_diff_migrated_surface — migrated-config-consuming surface capture"
```

---

### Task 3: `migration_validator` + `validate_migration.php` (gated live runner)

**Files:**
- Create: `install/class.migration_validator.php`
- Create: `install/validate_migration.php`
- Test: `test/server/unit/migration_validator_Test.php`

**Interfaces:**
- Consumes: `config_key[]` catalog (`const→scope`), `config_scope`; two surface maps (old + migrated, `name=>value`).
- Produces: `migration_validator::validate(array $old, array $migrated, array $catalog) : array` → `['faithful'=>bool, 'missing'=>string[], 'value_mismatches'=>string[], 'excluded_absent_ok'=>string[], 'derived_request_diffs'=>string[]]`. Rule: for every constant in `$old`, if its catalog scope is REQUEST/USER it MAY be absent from `$migrated` (recorded in `excluded_absent_ok`); if DERIVED_REQUEST its value difference is recorded in `derived_request_diffs` (reported, non-fatal — the CLI web-root reconciliation); otherwise it MUST be present in `$migrated` with an identical value, else it goes to `missing`/`value_mismatches`. `faithful` = `missing` and `value_mismatches` both empty.
- The live runner `validate_migration.php` (controller, gated): boots the real `config.php` (old surface, subprocess — needs DB), runs `migration_runner::plan` on the real config, writes artifacts to a TEMP staging dir, boots `boot_diff_migrated_surface.php` against staging (with the real catalog + `version.inc`/`dd_tipos.php` subsystems), then `migration_validator::validate` + prints a redacted verdict. Writes only to temp staging; never commits.

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/migration_validator_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/install/class.migration_validator.php';

final class migration_validator_Test extends TestCase {

	private function catalog() : array {
		return [
			new config_key('db.host',     'DD_V_HOST',    'string', 'localhost', config_scope::STATIC),
			new config_key('db.password', 'DD_V_SECRET',  'string', null, config_scope::SECRET),
			new config_key('lang.app',    'DD_V_LANG',    'string', null, config_scope::REQUEST),
			new config_key('paths.host',  'DD_V_WEBHOST', 'string', '', config_scope::DERIVED_REQUEST),
		];
	}

	public function test_faithful_when_migrated_reproduces_old_minus_request_user() : void {
		$old = ['DD_V_HOST' => 'h', 'DD_V_SECRET' => 's', 'DD_V_LANG' => 'lg-eng', 'DD_PATATA' => 'potato'];
		$migrated = ['DD_V_HOST' => 'h', 'DD_V_SECRET' => 's', 'DD_PATATA' => 'potato']; // DD_V_LANG legitimately absent
		$r = migration_validator::validate($old, $migrated, $this->catalog());
		$this->assertTrue($r['faithful']);
		$this->assertSame([], $r['missing']);
		$this->assertSame([], $r['value_mismatches']);
		$this->assertSame(['DD_V_LANG'], $r['excluded_absent_ok']);
	}

	public function test_missing_non_excluded_constant_is_unfaithful() : void {
		$old = ['DD_V_HOST' => 'h', 'DD_PATATA' => 'potato'];
		$migrated = ['DD_V_HOST' => 'h']; // DD_PATATA (passthrough, not REQUEST/USER) dropped
		$r = migration_validator::validate($old, $migrated, $this->catalog());
		$this->assertFalse($r['faithful']);
		$this->assertSame(['DD_PATATA'], $r['missing']);
	}

	public function test_value_mismatch_is_unfaithful_but_derived_request_is_reported_not_fatal() : void {
		$old = ['DD_V_HOST' => 'h', 'DD_V_SECRET' => 's', 'DD_V_WEBHOST' => 'real-web'];
		$migrated = ['DD_V_HOST' => 'h', 'DD_V_SECRET' => 'WRONG', 'DD_V_WEBHOST' => 'localhost'];
		$r = migration_validator::validate($old, $migrated, $this->catalog());
		$this->assertFalse($r['faithful']);                       // secret value differs
		$this->assertSame(['DD_V_SECRET'], $r['value_mismatches']);
		$this->assertSame(['DD_V_WEBHOST'], $r['derived_request_diffs']); // reported, non-fatal
	}
}
```

- [ ] **Step 2: Run it — expect FAIL** (`--filter migration_validator_Test`): class not found.

- [ ] **Step 3: Implement the validator**

Create `install/class.migration_validator.php`:

```php
<?php declare(strict_types=1);

require_once dirname(__DIR__) . '/core/base/config/class.config_scope.php';

/**
* MIGRATION_VALIDATOR
* Faithful-migration check: every OLD constant must reappear in the MIGRATED surface with
* an identical value, EXCEPT REQUEST/USER scope (accessor-only — legitimately absent) and
* DERIVED_REQUEST (host/web-root/protocol — CLI-dependent; differences reported, not fatal,
* pending the boot_paths web-root reconciliation at cutover). Pure; the surfaces come from
* booting the old config and the migrated pipeline in subprocesses.
*/
final class migration_validator {

	/**
	* @param array<string,mixed> $old constants from the legacy config.php boot
	* @param array<string,mixed> $migrated constants from the migrated pipeline boot
	* @param config_key[] $catalog
	* @return array{faithful:bool,missing:string[],value_mismatches:string[],excluded_absent_ok:string[],derived_request_diffs:string[]}
	*/
	public static function validate(array $old, array $migrated, array $catalog) : array {
		$scope_of = [];
		foreach ($catalog as $key) {
			if ($key->const !== null) {
				$scope_of[$key->const] = $key->scope;
			}
		}

		$missing = $mismatch = $excluded = $derived_req = [];
		foreach ($old as $name => $old_value) {
			$scope = $scope_of[$name] ?? null;
			if ($scope === config_scope::REQUEST || $scope === config_scope::USER) {
				if (!array_key_exists($name, $migrated)) {
					$excluded[] = $name; // legitimately absent
				}
				continue; // either way, never a faithfulness failure
			}
			if (!array_key_exists($name, $migrated)) {
				$missing[] = $name;
				continue;
			}
			if ($migrated[$name] !== $old_value) {
				if ($scope === config_scope::DERIVED_REQUEST) {
					$derived_req[] = $name; // reported, non-fatal
				} else {
					$mismatch[] = $name;
				}
			}
		}

		sort($missing); sort($mismatch); sort($excluded); sort($derived_req);
		return [
			'faithful'              => ($missing === [] && $mismatch === []),
			'missing'               => $missing,
			'value_mismatches'      => $mismatch,
			'excluded_absent_ok'    => $excluded,
			'derived_request_diffs' => $derived_req,
		];
	}//end validate
}
```

- [ ] **Step 4: Run it — expect PASS** (`--filter migration_validator_Test`, 3 tests).

- [ ] **Step 5: Implement the gated live runner**

Create `install/validate_migration.php`:

```php
<?php declare(strict_types=1);

/**
* VALIDATE_MIGRATION (CLI) — CONTROLLER one-shot, gated.
* Proves a real migration is faithful BEFORE committing it: boots the real config.php (old
* surface; needs the live DB), runs the migration plan, writes artifacts to a TEMP staging
* dir, boots the migrated-config-consuming pipeline against staging, and diffs. Writes only
* to temp staging; commits NOTHING. Prints a redacted verdict (names + counts; values only
* for non-secret mismatches). Run this ONCE on the install box before migrate_config_v7 --yes.
*
* Usage: php install/validate_migration.php [--config-dir=DIR]
* Exit:  0 faithful, 1 unfaithful, 2 usage/read/capture error.
*/
if (php_sapi_name() !== 'cli') { http_response_code(404); exit(2); }

$repo = dirname(__DIR__);
require_once $repo . '/core/base/config/class.config_scope.php';
require_once $repo . '/core/base/config/class.config_merge.php';
require_once $repo . '/core/base/config/class.config_key.php';
require_once $repo . '/install/class.migration_runner.php';
require_once $repo . '/install/class.migration_committer.php';
require_once $repo . '/install/class.migration_validator.php';

$config_dir = $repo . '/config';
foreach (array_slice($argv, 1) as $arg) {
	if (preg_match('/^--config-dir=(.*)$/', $arg, $m)) { $config_dir = $m[1]; }
}

$sources = [];
foreach (['config.php', 'config_db.php', 'config_areas.php', 'config_core.php'] as $n) {
	if (is_file($config_dir . '/' . $n)) { $sources[] = $config_dir . '/' . $n; }
}
if ($sources === []) { fwrite(STDERR, "validate_migration: no legacy config in {$config_dir}\n"); exit(2); }

// OLD surface — boot the real config in a subprocess (never read as source)
$old_cmd = escapeshellarg(PHP_BINARY) . ' -d error_reporting=0 -d display_errors=0 -r '
	. escapeshellarg('include ' . var_export($config_dir . '/config.php', true) . '; echo json_encode(get_defined_constants(true)["user"], JSON_INVALID_UTF8_SUBSTITUTE);') . ' 2>/dev/null';
$old = json_decode((string) shell_exec($old_cmd), true);
if (!is_array($old)) { fwrite(STDERR, "validate_migration: legacy boot capture failed\n"); exit(2); }

// migrate to a TEMP staging dir
$catalog = require $repo . '/core/base/config/catalog/catalog.php';
$plan = migration_runner::plan($sources, $catalog);
$staging = sys_get_temp_dir() . '/dedalo_migrate_staging_' . getmypid();
$targets = [
	'env_php'     => $staging . '/private/.env',
	'config'      => $staging . '/config/local/config.php',
	'state'       => $staging . '/config/state.php',
	'passthrough' => $staging . '/config/local/passthrough.php',
];
migration_committer::commit($plan['artifacts'], $targets, $staging . '/backup');

// MIGRATED surface — boot the migrated-config-consuming pipeline against staging
$mig_cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($repo . '/install/boot_diff_migrated_surface.php')
	. ' ' . escapeshellarg('--staging=' . $staging)
	. ' ' . escapeshellarg('--catalog=' . $repo . '/core/base/config/catalog/catalog.php')
	. ' ' . escapeshellarg('--subsystem=' . $repo . '/core/base/version.inc')
	. ' ' . escapeshellarg('--subsystem=' . $repo . '/core/base/dd_tipos.php') . ' 2>/dev/null';
$migrated = json_decode((string) shell_exec($mig_cmd), true);
if (!is_array($migrated)) { fwrite(STDERR, "validate_migration: migrated boot capture failed\n"); exit(2); }

$r = migration_validator::validate($old, $migrated, $catalog);

fwrite(STDOUT, "=== migration validation ===\n");
fwrite(STDOUT, 'faithful: ' . ($r['faithful'] ? 'YES' : 'NO') . "\n");
fwrite(STDOUT, 'missing in migrated (' . count($r['missing']) . '): ' . implode(', ', $r['missing']) . "\n");
fwrite(STDOUT, 'value mismatches (' . count($r['value_mismatches']) . '): ' . implode(', ', $r['value_mismatches']) . "\n");
fwrite(STDOUT, 'excluded REQUEST/USER absent (ok) (' . count($r['excluded_absent_ok']) . ')\n");
fwrite(STDOUT, 'derived-request diffs (non-fatal; boot_paths web-root) (' . count($r['derived_request_diffs']) . '): ' . implode(', ', $r['derived_request_diffs']) . "\n");
fwrite(STDOUT, "staging (temp, inspect then delete): {$staging}\n");
exit($r['faithful'] ? 0 : 1);
```

- [ ] **Step 6: Syntax-check the live runner** (do NOT execute it — it boots the real config / needs the DB; that's the controller's gated step): `php -l install/validate_migration.php` → "No syntax errors".

- [ ] **Step 7: Full hermetic suite** (`vendor/bin/phpunit -c test/server/phpunit.unit.xml`): all green; report totals (was 230 tests / 2365 assertions; expect +6 tests from Tasks 1–3).

- [ ] **Step 8: Commit**

```bash
git add install/class.migration_validator.php install/validate_migration.php test/server/unit/migration_validator_Test.php
git commit -m "feat(install): migration_validator + gated validate_migration.php live runner"
```

---

## Self-Review

**Spec coverage:** the migrated-config-consuming boot (env-load → config_build w/ local override → compat_shim → secret_state_emit → subsystem includes → passthrough) realizes the cutover surface-boot (Task 2 + Task 1); the validator proves old↔migrated faithfulness minus REQUEST/USER (Task 3); the gated live runner is the real proof. SECRET/STATE emission gap filled (Task 1). Deferred/flagged: the `config.php` flip, WEB-only functioning phases, and the `boot_paths` CLI web-root reconciliation (DERIVED_REQUEST diffs are reported non-fatal).

**Placeholder scan:** complete code/commands throughout. The fixture catalog inline note explains the symbol resolution. The live runner is `php -l`-only by design (never executed by tests/implementers).

**Type consistency:** `boot_secret_state_phases::emit_phase(catalog, ?state_file, ?definer)` (T1) is consumed by the migrated-surface script (T2); the script's args (`--staging/--catalog/--subsystem`) match the live runner's invocation (T3); `migration_validator::validate(old, migrated, catalog)` (T3) consumes `config_key->const`/`->scope`. Reuses verified signatures: `boot_config_phases::phases(catalog, layers)`, `boot_paths::resolve(config_dir, server, sapi)`, `boot_runtime_phases::env_load_phase(path)`, `boot_subsystem_phases::include_phase(name, path)`, `env_loader::get/load`, `migration_runner::plan`, `migration_committer::commit`.

**Carry-overs:** the actual cutover (flip `config.php`→shim + the WEB functioning phases) is the only remaining unit; `boot_paths` web-root/HTTPS-proxy reconciliation (so DERIVED_REQUEST values match a real WEB boot); the live `validate_migration.php` run is the controller's gated step before `migrate_config_v7 --yes`; consider the migrate CLI calling the validator automatically before commit (wire-in) once 4c-2 lands.
