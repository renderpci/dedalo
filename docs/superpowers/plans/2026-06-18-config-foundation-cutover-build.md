# Cutover build — WEB functioning phases + assembler + thin shim (no flip)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build (additively, without flipping `config.php`) the remaining WEB-only boot phases, the `boot_paths` proxy/HTTPS hardening, and a full WEB-profile assembler + a thin-shim FILE — so the only remaining step is the gated swap once the migration has run.

**Architecture:** A `boot_web_phases` factory for the logic-bearing functioning phases (logger registration, session start, request-state defines), `boot_paths` hardened for reverse proxies, and a `boot_web_profile::phases()` assembler that composes the full P0–P14 list (reusing the surface phases from 3b-1b/3b-3/4c-2 + `boot_subsystem_phases::include_phase` for the bare includes). The thin shim is written as `config/config.shim.php` (NOT `config.php`) so nothing live changes. These phases execute real v6 subsystem code (autoloader, logger, session, core_functions), so they are transcribed v6-faithfully and **structure-tested**; their functional correctness is proven only by the gated live boot at flip-time.

**Tech Stack:** PHP 8.1+, PHPUnit 13 hermetic harness (structural phase tests). Reuses `boot`/`boot_phase`/`entrypoint_profile`, `boot_subsystem_phases::include_phase`, `boot_runtime_phases`, `boot_config_phases`, `boot_paths`, `boot_secret_state_phases`, `compat_shim`, and the real subsystems (`class.Error.php`, `core_functions.php`, `class.logger.php`, `dd_tipos.php`, `class.loader.php`).

## Global Constraints

- **No flip.** `config.php` is NOT modified. The shim is a NEW file `config/config.shim.php`. The `if(!defined('DEDALO_ROOT_PATH')) include config/config.php` call-site conversions are part of the deferred flip, NOT this build.
- **Non-hermetic phases are structure-tested only.** logger/session/request-state/error/autoloader phases run real subsystem code that needs the full environment; their unit tests assert the phase's NAME + skip_in (not the closure's runtime effect). Functional proof = the gated live boot at flip-time. Do NOT write tests that execute these closures in the hermetic harness (they would fatal).
- **REQUEST/USER stay FPM-`define()`d.** The request-state phase `define()`s `DEDALO_APPLICATION_LANG`/`DEDALO_DATA_LANG`/`SHOW_DEBUG`/`SHOW_DEVELOPER`/`LOGGER_LEVEL` exactly as v6 did (the ~300 read-sites still depend on them; the worker-safe accessor conversion is the deferred Phase 5). The compat_shim still never emits these — they come from this phase.
- **Preserve the security side effect.** Including `core_functions.php` unregisters the `phar://` stream wrapper (SEC-046) — the core_functions phase MUST include it (don't skip it).
- **`DEDALO_SESSION_SAVE_PATH` is computed by the session phase** (it's one of the 6 catalog drops — handler-conditional), not emitted by the shim.
- **WEB-only phases** (session, request-state) carry `skip_in: ['cli','cron','worker_init','test']`; session also keeps the runtime guard `session_status()!==PHP_SESSION_ACTIVE && !defined('DEDALO_RR_WORKER')`.
- **Phase order (the assembler, spec §5.7):** error_handlers → env_load → config_build (catalog + [paths_override, local_config_override]) → compat_shim → secret_state_emit → core_functions → logger → dd_tipos → autoloader → apply_locale → session → request_state. (The warn-only secret-gate, P5, is a deferred polish — noted, not built here.)
- **Hermetic harness conventions:** `test/server/unit/*_Test.php`, `declare(strict_types=1)`, `extends PHPUnit\Framework\TestCase`, deps via `require_once dirname(__DIR__, 3) . '/...'`. Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml`.

## File Structure
- Modify: `core/base/boot/class.boot_paths.php` (Task 1) — HTTPS via X-Forwarded-Proto.
- Create: `core/base/boot/class.boot_web_phases.php` (Task 2) — logger/session/request-state phase factories.
- Create: `core/base/boot/class.boot_web_profile.php` (Task 3) — the full WEB phase assembler.
- Create: `config/config.shim.php` (Task 3) — the thin shim FILE (inert; not included anywhere yet).
- Tests: `boot_paths_proxy_Test.php` (T1), `boot_web_phases_Test.php` (T2), `boot_web_profile_Test.php` (T3).

---

### Task 1: `boot_paths` HTTPS/proxy hardening

**Files:**
- Modify: `core/base/boot/class.boot_paths.php` (the `$protocol` line)
- Test: `test/server/unit/boot_paths_proxy_Test.php`

**Interfaces:**
- Consumes/Produces: unchanged `boot_paths::resolve(string $config_dir, array $server, string $sapi) : array`; `paths.protocol` now also honors `HTTP_X_FORWARDED_PROTO === 'https'`.

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/boot_paths_proxy_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_paths.php';

final class boot_paths_proxy_Test extends TestCase {

	public function test_https_via_direct_server_flag() : void {
		$p = boot_paths::resolve('/srv/dedalo/config', ['HTTPS' => 'on', 'HTTP_HOST' => 'x', 'REQUEST_URI' => '/dedalo/x'], 'fpm-fcgi');
		$this->assertSame('https://', $p['paths.protocol']);
	}

	public function test_https_via_forwarded_proto_behind_proxy() : void {
		$p = boot_paths::resolve('/srv/dedalo/config', ['HTTP_X_FORWARDED_PROTO' => 'https', 'HTTP_HOST' => 'x', 'REQUEST_URI' => '/dedalo/x'], 'fpm-fcgi');
		$this->assertSame('https://', $p['paths.protocol']);
	}

	public function test_plain_http_when_neither_present() : void {
		$p = boot_paths::resolve('/srv/dedalo/config', ['HTTP_HOST' => 'x', 'REQUEST_URI' => '/dedalo/x'], 'fpm-fcgi');
		$this->assertSame('http://', $p['paths.protocol']);
	}
}
```

- [ ] **Step 2: Run it — expect FAIL** (`--filter boot_paths_proxy_Test`): the forwarded-proto test fails (`http://` returned).

- [ ] **Step 3: Implement** — in `core/base/boot/class.boot_paths.php`, replace the `$protocol` assignment:

```php
		$protocol = (isset($server['HTTPS']) && $server['HTTPS'] === 'on') ? 'https://' : 'http://';
```

with:

```php
		// Honor a reverse proxy's X-Forwarded-Proto in addition to the direct HTTPS flag.
		$protocol = (
			(isset($server['HTTPS']) && $server['HTTPS'] === 'on')
			|| (isset($server['HTTP_X_FORWARDED_PROTO']) && strtolower((string) $server['HTTP_X_FORWARDED_PROTO']) === 'https')
		) ? 'https://' : 'http://';
```

- [ ] **Step 4: Run it — expect PASS** (`--filter boot_paths_proxy_Test`, 3 tests). Also re-run the existing `boot_paths` tests: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter boot_paths` — all still green.

- [ ] **Step 5: Commit**

```bash
git add core/base/boot/class.boot_paths.php test/server/unit/boot_paths_proxy_Test.php
git commit -m "feat(boot): boot_paths honors X-Forwarded-Proto for HTTPS behind a proxy"
```

---

### Task 2: `boot_web_phases` (logger / session / request-state)

**Files:**
- Create: `core/base/boot/class.boot_web_phases.php`
- Test: `test/server/unit/boot_web_phases_Test.php`

**Interfaces:**
- Consumes: `boot_phase`, `entrypoint_profile`. The closures call real subsystem code (`logger::register`, `session_start_manager`, `fix_cascade_config_var`, `logged_user_id`, `logged_user_is_developer`) and constants (`DEDALO_*`) available only after the surface + include phases — so the closures are exercised at the live boot, NOT in unit tests.
- Produces:
  - `boot_web_phases::logger_phase(string $logger_file) : boot_phase` (name `logger`) — require_once the logger + `logger::register('activity', ...)` + `logger::$obj['activity'] = logger::get_instance('activity')`.
  - `boot_web_phases::session_phase() : boot_phase` (name `session_start`, skip_in `['cli','cron','worker_init','test']`) — handler-conditional save path + guarded `session_start_manager(...)`.
  - `boot_web_phases::request_state_phase() : boot_phase` (name `request_state`, same skip_in) — FPM `define()`s of the REQUEST/USER constants.

- [ ] **Step 1: Write the failing test** (structural — names + skip_in; the closures are NOT executed here)

Create `test/server/unit/boot_web_phases_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.entrypoint_profile.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_phase.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_web_phases.php';

final class boot_web_phases_Test extends TestCase {

	public function test_logger_phase_shape() : void {
		$p = boot_web_phases::logger_phase('/some/class.logger.php');
		$this->assertSame('logger', $p->name);
		$this->assertTrue($p->should_run(entrypoint_profile::WEB));
		$this->assertTrue($p->should_run(entrypoint_profile::CLI)); // logger runs everywhere
	}

	public function test_session_phase_is_web_only() : void {
		$p = boot_web_phases::session_phase();
		$this->assertSame('session_start', $p->name);
		$this->assertTrue($p->should_run(entrypoint_profile::WEB));
		$this->assertFalse($p->should_run(entrypoint_profile::CLI));
		$this->assertFalse($p->should_run(entrypoint_profile::CRON));
		$this->assertFalse($p->should_run(entrypoint_profile::WORKER_INIT));
		$this->assertFalse($p->should_run(entrypoint_profile::TEST));
	}

	public function test_request_state_phase_is_web_only() : void {
		$p = boot_web_phases::request_state_phase();
		$this->assertSame('request_state', $p->name);
		$this->assertTrue($p->should_run(entrypoint_profile::WEB));
		$this->assertFalse($p->should_run(entrypoint_profile::CLI));
		$this->assertFalse($p->should_run(entrypoint_profile::TEST));
	}
}
```

- [ ] **Step 2: Run it — expect FAIL** (`--filter boot_web_phases_Test`): class not found.

- [ ] **Step 3: Implement**

Create `core/base/boot/class.boot_web_phases.php`:

```php
<?php declare(strict_types=1);

require_once __DIR__ . '/class.boot_phase.php';

/**
* BOOT_WEB_PHASES
* The logic-bearing functioning phases of the WEB boot (beyond the constant surface):
* logger registration, session start, and the request/user-scoped define()s. These run
* real v6 subsystem code and constants that exist only after the surface + include phases,
* so the closures are exercised at the live boot (flip-time), not in the hermetic harness;
* the unit tests assert phase NAME + skip_in only.
*
* The request-state phase keeps define()-ing DEDALO_APPLICATION_LANG / DEDALO_DATA_LANG /
* SHOW_DEBUG / SHOW_DEVELOPER / LOGGER_LEVEL the FPM-safe way — the ~300 read-sites still
* depend on the constants; the worker-safe accessor conversion is the deferred Phase 5.
* (compat_shim still never emits these; they come from here.) Transcribed verbatim from
* config/sample.config.php (session lines 182–235; request-state lines 251–339).
*/
final class boot_web_phases {

	/** P8 — include the logger and register the lazy 'activity' backend (no DB connect yet). */
	public static function logger_phase(string $logger_file) : boot_phase {
		return new boot_phase('logger', static function () use ($logger_file) : void {
			require_once $logger_file;
			logger::register('activity', 'activity://auto:auto@auto:5432/log_data?table=matrix_activity');
			logger::$obj['activity'] = logger::get_instance('activity');
		});
	}//end logger_phase

	/** P13 — start the PHP session (WEB only). Handler-conditional save path; v6 guard preserved. */
	public static function session_phase() : boot_phase {
		return new boot_phase('session_start', static function () : void {
			if (session_status() === PHP_SESSION_ACTIVE || defined('DEDALO_RR_WORKER')) {
				return;
			}
			$handler   = defined('DEDALO_SESSION_HANDLER') ? DEDALO_SESSION_HANDLER : 'files';
			$save_path = match ($handler) {
				'redis'     => 'tcp://127.0.0.1:6379',
				'memcached' => '127.0.0.1:11211',
				default     => DEDALO_SESSIONS_PATH,
			};
			session_start_manager([
				'save_handler'         => $handler,
				'timeout_seconds'      => 8 * 3600,
				'save_path'            => $save_path,
				'prevent_session_lock' => defined('PREVENT_SESSION_LOCK') ? PREVENT_SESSION_LOCK : false,
				'session_name'         => 'dedalo_' . DEDALO_ENTITY,
				'cookie_secure'        => (DEDALO_PROTOCOL === 'https://'),
				'cookie_samesite'      => (defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER === true) ? 'Lax' : 'Strict',
			]);
		}, ['cli', 'cron', 'worker_init', 'test']);
	}//end session_phase

	/** P14 — request/user-scoped define()s (WEB only). FPM-safe; needs session + core_functions + dd_tipos. */
	public static function request_state_phase() : boot_phase {
		return new boot_phase('request_state', static function () : void {
			if (!defined('SHOW_DEBUG')) {
				define('SHOW_DEBUG', (logged_user_id() == DEDALO_SUPERUSER));
			}
			if (!defined('SHOW_DEVELOPER')) {
				define('SHOW_DEVELOPER', (logged_user_is_developer() === true));
			}
			if (!defined('LOGGER_LEVEL')) {
				define('LOGGER_LEVEL', (SHOW_DEBUG === true || SHOW_DEVELOPER === true) ? logger::DEBUG : logger::ERROR);
			}
			if (!defined('DEDALO_APPLICATION_LANG')) {
				define('DEDALO_APPLICATION_LANG', fix_cascade_config_var('dedalo_application_lang', DEDALO_APPLICATION_LANGS_DEFAULT));
			}
			if (!defined('DEDALO_DATA_LANG')) {
				define('DEDALO_DATA_LANG', fix_cascade_config_var('dedalo_data_lang', DEDALO_DATA_LANG_DEFAULT));
			}
		}, ['cli', 'cron', 'worker_init', 'test']);
	}//end request_state_phase
}
```

- [ ] **Step 4: Run it — expect PASS** (`--filter boot_web_phases_Test`, 3 tests).

- [ ] **Step 5: Commit**

```bash
git add core/base/boot/class.boot_web_phases.php test/server/unit/boot_web_phases_Test.php
git commit -m "feat(boot): WEB functioning phases — logger register, session start, request-state defines"
```

---

### Task 3: `boot_web_profile` assembler + thin-shim file

**Files:**
- Create: `core/base/boot/class.boot_web_profile.php`
- Create: `config/config.shim.php` (inert; not included by anything yet)
- Test: `test/server/unit/boot_web_profile_Test.php`

**Interfaces:**
- Consumes: `boot_config_phases::phases`, `boot_runtime_phases::env_load_phase`/`apply_locale_phase`, `boot_paths::resolve`, `boot_secret_state_phases::emit_phase`, `boot_subsystem_phases::include_phase`, `boot_web_phases::*` (Task 2).
- Produces: `boot_web_profile::phases(array $catalog, array $base_overrides, ?string $env_path, array $local_override, ?string $state_file, string $repo, array $server, string $sapi, ?callable $definer = null) : boot_phase[]` — the full ordered WEB phase list (P0–P14, secret-gate deferred). The thin shim `config/config.shim.php` calls `boot::run(entrypoint_profile::WEB, boot_web_profile::phases(...))` with the real catalog + real paths.

- [ ] **Step 1: Write the failing test** (composition — ordered names + the WEB-only skip_in; closures NOT run)

Create `test/server/unit/boot_web_profile_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_compiler.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.compat_shim.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.entrypoint_profile.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_state.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_phase.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_config_phases.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_runtime_phases.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_paths.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_subsystem_phases.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_secret_state_phases.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_web_phases.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_web_profile.php';

final class boot_web_profile_Test extends TestCase {

	private function catalog() : array {
		return [ new config_key('db.host', 'DD_WP_HOST', 'string', 'localhost', config_scope::STATIC) ];
	}

	public function test_assembles_full_ordered_phase_list() : void {
		$phases = boot_web_profile::phases(
			$this->catalog(), [], '/no/such/.env', [], '/no/such/state.php',
			'/srv/dedalo', ['HTTP_HOST' => 'x', 'REQUEST_URI' => '/d/x'], 'fpm-fcgi'
		);
		$names = array_map(static fn(boot_phase $p) : string => $p->name, $phases);
		$this->assertSame([
			'error_handlers', 'env_load', 'config_build', 'compat_shim', 'secret_state_emit',
			'core_functions', 'logger', 'dd_tipos', 'autoloader', 'apply_locale',
			'session_start', 'request_state',
		], $names);
	}

	public function test_web_only_phases_carry_skip_in() : void {
		$phases = boot_web_profile::phases(
			$this->catalog(), [], null, [], null,
			'/srv/dedalo', ['HTTP_HOST' => 'x', 'REQUEST_URI' => '/d/x'], 'fpm-fcgi'
		);
		$by = [];
		foreach ($phases as $p) { $by[$p->name] = $p; }
		$this->assertFalse($by['session_start']->should_run(entrypoint_profile::CLI));
		$this->assertFalse($by['request_state']->should_run(entrypoint_profile::CLI));
		$this->assertTrue($by['compat_shim']->should_run(entrypoint_profile::CLI)); // surface phases run everywhere
	}

	public function test_env_load_omitted_when_no_env_path() : void {
		$phases = boot_web_profile::phases(
			$this->catalog(), [], null, [], null,
			'/srv/dedalo', ['HTTP_HOST' => 'x', 'REQUEST_URI' => '/d/x'], 'fpm-fcgi'
		);
		$names = array_map(static fn(boot_phase $p) : string => $p->name, $phases);
		$this->assertNotContains('env_load', $names); // null env_path => no env_load phase
	}
}
```

- [ ] **Step 2: Run it — expect FAIL** (`--filter boot_web_profile_Test`): class not found.

- [ ] **Step 3: Implement the assembler**

Create `core/base/boot/class.boot_web_profile.php`:

```php
<?php declare(strict_types=1);

require_once __DIR__ . '/class.boot_phase.php';
require_once __DIR__ . '/class.boot_config_phases.php';
require_once __DIR__ . '/class.boot_runtime_phases.php';
require_once __DIR__ . '/class.boot_paths.php';
require_once __DIR__ . '/class.boot_subsystem_phases.php';
require_once __DIR__ . '/class.boot_secret_state_phases.php';
require_once __DIR__ . '/class.boot_web_phases.php';

/**
* BOOT_WEB_PROFILE
* Assembles the full WEB boot phase list (spec §5.7 P0–P14), composing the surface phases
* (config_build/compat_shim, secret/state emit, subsystem includes, apply_locale) with the
* functioning phases (error handlers, core_functions, logger, autoloader, session,
* request-state). The thin shim config/config.shim.php calls boot::run(WEB, phases(...)).
* The warn-only secret-gate (P5) is a deferred polish (not assembled here).
*/
final class boot_web_profile {

	/**
	* @param config_key[] $catalog
	* @param array<int,array<string,mixed>> $base_overrides extra low-precedence layers
	* @param ?string $env_path the .env to load (null = skip env_load)
	* @param array<string,mixed> $local_override per-install config override layer (highest)
	* @param ?string $state_file state.php for STATE emission
	* @param string $repo absolute repo root (for subsystem file paths)
	* @param array $server $_SERVER-like map (for paths)
	* @param string $sapi php_sapi_name()
	* @return boot_phase[]
	*/
	public static function phases(array $catalog, array $base_overrides, ?string $env_path, array $local_override, ?string $state_file, string $repo, array $server, string $sapi, ?callable $definer = null) : array {
		$paths_override = boot_paths::resolve($repo . '/config', $server, $sapi);
		$layers = $base_overrides;
		$layers[] = $paths_override;
		$layers[] = $local_override;

		$phases = [];
		// P0/P1 error + shutdown handlers (class.Error.php auto-initializes on include)
		$phases[] = boot_subsystem_phases::include_phase('error_handlers', $repo . '/core/base/class.Error.php');
		// P3 secrets
		if ($env_path !== null) {
			$phases[] = boot_runtime_phases::env_load_phase($env_path);
		}
		// P4 config-build + P6 compat-shim (paths + local override as layers)
		foreach (boot_config_phases::phases($catalog, $layers, $definer) as $p) {
			$phases[] = $p;
		}
		// P6.5 SECRET/STATE live emission
		$phases[] = boot_secret_state_phases::emit_phase($catalog, $state_file, $definer);
		// P7–P10 subsystem includes
		$phases[] = boot_subsystem_phases::include_phase('core_functions', $repo . '/shared/core_functions.php');
		$phases[] = boot_web_phases::logger_phase($repo . '/core/logger/class.logger.php');
		$phases[] = boot_subsystem_phases::include_phase('dd_tipos', $repo . '/core/base/dd_tipos.php');
		$phases[] = boot_subsystem_phases::include_phase('autoloader', $repo . '/core/base/class.loader.php');
		// P11/P12 encoding + locale + timezone
		$phases[] = boot_runtime_phases::apply_locale_phase();
		// P13/P14 WEB-only
		$phases[] = boot_web_phases::session_phase();
		$phases[] = boot_web_phases::request_state_phase();

		return $phases;
	}//end phases
}
```

- [ ] **Step 4: Run it — expect PASS** (`--filter boot_web_profile_Test`, 3 tests). Note: the `dd_tipos`/subsystem phases appear in the list but their closures are NOT executed by these structural tests (the test only reads `->name`/`->should_run`).

- [ ] **Step 5: Create the inert thin-shim file**

Create `config/config.shim.php`:

```php
<?php declare(strict_types=1);

/**
* CONFIG.SHIM.PHP — the v7 thin shim that REPLACES config.php at cutover (spec §5.1).
* INERT until the flip: nothing includes this file yet. At flip-time it is moved to
* config.php (after the migration has populated ../private/.env + config/local/config.php
* + config/state.php, with a backup) so existing `include config/config.php` sites boot
* the v7 pipeline. Do NOT enable without: a faithful validate_migration run, the migration
* committed, a backup, and a live verify.
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
require_once $repo . '/core/base/boot/class.boot_web_profile.php';

$catalog = require $repo . '/core/base/config/catalog/catalog.php';

$env_path     = $repo . '/../private/.env';
$local_cfg    = $repo . '/config/local/config.php';
$state_file   = $repo . '/config/state.php';
$local_override = is_file($local_cfg) ? (require $local_cfg) : [];
if (!is_array($local_override)) { $local_override = []; }

boot::run(entrypoint_profile::WEB, boot_web_profile::phases(
	$catalog,
	[],
	is_file($env_path) ? $env_path : null,
	$local_override,
	is_file($state_file) ? $state_file : null,
	$repo,
	$_SERVER,
	php_sapi_name()
));
```

- [ ] **Step 6: Verify the shim parses** (do NOT run it — it boots the full pipeline / would need the migrated env): `php -l config/config.shim.php` → "No syntax errors".

- [ ] **Step 7: Full hermetic suite** (`vendor/bin/phpunit -c test/server/phpunit.unit.xml`): all green; report totals (was 236 tests / 2385 assertions; expect +9 tests from Tasks 1–3).

- [ ] **Step 8: Commit**

```bash
git add core/base/boot/class.boot_web_profile.php config/config.shim.php test/server/unit/boot_web_profile_Test.php
git commit -m "feat(boot): WEB-profile assembler + inert thin-shim file (config.shim.php; no flip)"
```

---

## Self-Review

**Spec coverage (§5.7 P0–P14):** error/shutdown (P0/P1, `class.Error.php` auto-init), paths (P2, hardened for proxies — Task 1), env-load (P3), config-build (P4), compat-shim (P6), SECRET/STATE emit (P6.5), core_functions (P7, phar side effect preserved), logger (P8, lazy register), dd_tipos (P9), autoloader (P10), encoding+locale+tz (P11/P12, `apply_locale`), session (P13, WEB-only), request-state (P14, WEB-only, FPM `define()`s). Assembled by `boot_web_profile::phases` in that order; the inert shim wires it. Deferred/flagged: the warn-only secret-gate (P5); the FLIP itself (swap `config.php`, convert `include config/config.php` sites); the `class.loader.php` `include_once`-logger cleanup (harmless — logger is pre-included). Phase 5 (worker accessors) remains separate.

**Placeholder scan:** complete code/commands throughout. The non-hermetic phases are transcribed v6-faithfully (citing sample.config.php lines) and explicitly structure-tested only; their functional proof is the gated live boot.

**Type consistency:** `boot_web_phases::{logger_phase(string),session_phase(),request_state_phase()}` (T2) are consumed by `boot_web_profile::phases(...)` (T3) and the shim; the assembler reuses verified signatures (`boot_config_phases::phases(catalog, layers, ?definer)`, `boot_runtime_phases::env_load_phase(path)`/`apply_locale_phase()`, `boot_paths::resolve(config_dir, server, sapi)`, `boot_secret_state_phases::emit_phase(catalog, ?state_file, ?definer)`, `boot_subsystem_phases::include_phase(name, path)`). The phase-name list in the test matches the assembler exactly.

**Carry-overs (the FLIP, gated):** after the migration has run (validate → dry-run → backup → `--yes`), at the flip: `mv config/config.shim.php config/config.php` (with a backup of the original), convert the `if(!defined('DEDALO_ROOT_PATH')) include config/config.php` sites (e.g. `core/api/v1/json/index.php`), reconcile the `class.loader.php` logger `include_once`, wire the warn-only secret-gate, and run a live `verify`/`run` on a WEB request — all behind explicit sign-off. The integration risks only a live boot reveals (autoloader eager-include vs the P0 `require_once class.Error.php` redeclare; phase ordering vs real subsystem deps) are resolved there. Then Phase 5 (worker-safe RequestContext accessors + the ~300 read-site migration).
