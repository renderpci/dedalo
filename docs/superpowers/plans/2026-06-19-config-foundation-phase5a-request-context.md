# Phase 5a — RequestContext (worker-safe request/user-scoped accessor)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a worker-safe accessor (`request_context`) that resolves the request/user-scoped values the legacy boot froze as process constants — computed live per call so a long-lived worker can't leak per-request/per-user state across requests.

**Architecture:** One class `core/base/config/class.request_context.php`. Pure, hermetically-testable resolvers (`resolve_cascade`, `user_id`, `developer_flag`, `is_superuser`, `level_for`) that take explicit `$request`/`$session` arrays, plus thin live accessors (`application_lang`, `data_lang`, `show_debug`, `show_developer`, `logger_level`) over `$_REQUEST`/`$_SESSION`. The cascade mirrors v6 `fix_cascade_config_var` semantics (request > session > default) but is read-only and never written to a process constant.

**Tech Stack:** PHP 8.1+, PHPUnit 13 hermetic harness. No dependencies on legacy `core_functions` (the cascade is reimplemented, decoupled).

## Global Constraints

- **Worker-correctness only; FPM is already safe.** This is the spec's deferred Phase 5 (RoadRunner not yet a production target). Nothing here changes the current boot — the request-state cutover phase keeps `define()`-ing the constants for back-compat during the incremental read-site migration. This plan adds the accessor; the ~300 read-site conversion is incremental follow-on work, NOT this plan.
- **Live per call, never frozen.** Every accessor computes from `$_REQUEST`/`$_SESSION` on each call — never caches into a static or a process constant. That is the cross-request-leak fix.
- **Read-only.** The accessor does NOT write back to `$_SESSION` (v6 `fix_cascade` persisted a request lang into the session). That persistence stays with the request-state phase's `fix_cascade_config_var` during migration; revisit when that phase is dropped (noted carry-over).
- **Cascade semantics (v6-faithful):** request value wins when `!empty($request[$var]) && !is_array(...)` (trimmed + tag-stripped, mirroring `trim(safe_xss(...))`); else the session value at `$session['dedalo']['config'][$var]` when non-empty; else the default.
- **Auth source:** `user_id` from `$session['dedalo']['auth']['user_id']`; `is_developer` from `$session['dedalo']['auth']['is_developer'] === true`. `show_debug` = the logged user id equals `DEDALO_SUPERUSER` (the dd_tipos sentinel, `-1`).
- **Graceful constant fallbacks:** live accessors that read config constants (`DEDALO_APPLICATION_LANGS_DEFAULT`, `DEDALO_DATA_LANG_DEFAULT`, `DEDALO_SUPERUSER`) fall back (`''`, `''`, `-1`) when the constant is undefined, so the accessor is unit-testable without booting the full config.
- **Hermetic harness conventions:** `test/server/unit/*_Test.php`, `declare(strict_types=1)`, `extends PHPUnit\Framework\TestCase`, deps via `require_once dirname(__DIR__, 3) . '/...'`. Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml`.

## File Structure
- Create `core/base/config/class.request_context.php` — the accessor (pure resolvers + live accessors).
- Test: `test/server/unit/request_context_Test.php`.

---

### Task 1: `request_context`

**Files:**
- Create: `core/base/config/class.request_context.php`
- Test: `test/server/unit/request_context_Test.php`

**Interfaces:**
- Consumes: nothing (decoupled from legacy `core_functions`); live accessors read `$_REQUEST`/`$_SESSION` superglobals and the constants `DEDALO_APPLICATION_LANGS_DEFAULT`/`DEDALO_DATA_LANG_DEFAULT`/`DEDALO_SUPERUSER` (with fallbacks), and `logger::DEBUG`/`logger::ERROR` for `logger_level()`.
- Produces:
  - Pure: `request_context::resolve_cascade(string $var_name, mixed $default, array $request, array $session) : mixed`; `::user_id(array $session) : ?int`; `::developer_flag(array $session) : bool`; `::is_superuser(?int $user_id, int $superuser_id) : bool`; `::level_for(bool $verbose, int $debug_level, int $error_level) : int`.
  - Live: `::application_lang() : string`; `::data_lang() : string`; `::show_debug() : bool`; `::show_developer() : bool`; `::logger_level() : int`.

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/request_context_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.request_context.php';

final class request_context_Test extends TestCase {

	private array $req_backup;
	private array $sess_backup;

	protected function setUp() : void {
		parent::setUp();
		$this->req_backup  = $_REQUEST;
		$this->sess_backup = $_SESSION ?? [];
		$_REQUEST = [];
		$_SESSION = [];
	}
	protected function tearDown() : void {
		$_REQUEST = $this->req_backup;
		$_SESSION = $this->sess_backup;
	}

	// --- pure resolvers ---

	public function test_resolve_cascade_request_wins_and_is_sanitized() : void {
		$v = request_context::resolve_cascade('lang', 'lg-eng', ['lang' => "  lg-<b>cat</b>  "], []);
		$this->assertSame('lg-cat', $v); // trimmed + tag-stripped
	}

	public function test_resolve_cascade_falls_back_to_session_then_default() : void {
		$this->assertSame('lg-spa', request_context::resolve_cascade('lang', 'lg-eng', [], ['dedalo' => ['config' => ['lang' => 'lg-spa']]]));
		$this->assertSame('lg-eng', request_context::resolve_cascade('lang', 'lg-eng', [], []));
		// empty request value does not win
		$this->assertSame('lg-eng', request_context::resolve_cascade('lang', 'lg-eng', ['lang' => ''], []));
	}

	public function test_user_id_and_developer_flag_from_session() : void {
		$session = ['dedalo' => ['auth' => ['user_id' => '42', 'is_developer' => true]]];
		$this->assertSame(42, request_context::user_id($session));
		$this->assertTrue(request_context::developer_flag($session));
		$this->assertNull(request_context::user_id([]));
		$this->assertFalse(request_context::developer_flag([]));
	}

	public function test_is_superuser_and_level_for() : void {
		$this->assertTrue(request_context::is_superuser(-1, -1));
		$this->assertFalse(request_context::is_superuser(7, -1));
		$this->assertFalse(request_context::is_superuser(null, -1));
		$this->assertSame(100, request_context::level_for(true, 100, 10));
		$this->assertSame(10, request_context::level_for(false, 100, 10));
	}

	// --- live accessors (superglobals; constant fallbacks) ---

	public function test_application_lang_reads_request_live() : void {
		$_REQUEST['dedalo_application_lang'] = 'lg-cat';
		$this->assertSame('lg-cat', request_context::application_lang());
	}

	public function test_application_lang_default_fallback_when_nothing_set() : void {
		// no $_REQUEST/$_SESSION, constant may be undefined -> '' fallback
		$this->assertSame(defined('DEDALO_APPLICATION_LANGS_DEFAULT') ? (string) DEDALO_APPLICATION_LANGS_DEFAULT : '', request_context::application_lang());
	}

	public function test_show_debug_true_when_session_user_is_superuser_fallback() : void {
		// DEDALO_SUPERUSER fallback is -1; a session user_id of -1 => superuser
		$_SESSION['dedalo']['auth']['user_id'] = -1;
		$this->assertTrue(request_context::show_debug());
		$_SESSION['dedalo']['auth']['user_id'] = 5;
		$this->assertFalse(request_context::show_debug());
	}

	public function test_show_developer_reads_session_live() : void {
		$_SESSION['dedalo']['auth']['is_developer'] = true;
		$this->assertTrue(request_context::show_developer());
		$_SESSION['dedalo']['auth']['is_developer'] = false;
		$this->assertFalse(request_context::show_developer());
	}
}
```

- [ ] **Step 2: Run it — expect FAIL** (`--filter request_context_Test`): class not found.

- [ ] **Step 3: Implement**

Create `core/base/config/class.request_context.php`:

```php
<?php declare(strict_types=1);

/**
* REQUEST_CONTEXT
* Worker-safe accessor for the request/user-scoped values the legacy boot froze as process
* constants (DEDALO_APPLICATION_LANG / DEDALO_DATA_LANG / SHOW_DEBUG / SHOW_DEVELOPER /
* LOGGER_LEVEL). Every accessor computes LIVE from $_REQUEST/$_SESSION on each call — never
* cached into a static or a process constant — so a long-lived worker cannot leak one
* request's (or user's) state into the next. The pure resolvers take explicit request/
* session arrays (decoupled from legacy core_functions, hermetically testable); the live
* accessors are thin wrappers over the superglobals with graceful constant fallbacks.
*
* Read-only: unlike v6 fix_cascade_config_var, it does NOT persist a request value back to
* the session. During the incremental read-site migration the request-state boot phase
* keeps define()-ing the constants (with the v6 persistence) for back-compat.
*/
final class request_context {

	// --- pure resolvers (no superglobals) ---

	/** v6 cascade: request value (sanitized) > session['dedalo']['config'][var] > default. */
	public static function resolve_cascade(string $var_name, mixed $default, array $request, array $session) : mixed {
		if (!empty($request[$var_name]) && !is_array($request[$var_name])) {
			return trim(strip_tags((string) $request[$var_name])); // mirrors v6 trim(safe_xss(...))
		}
		$sess = $session['dedalo']['config'][$var_name] ?? null;
		if (!empty($sess)) {
			return $sess;
		}
		return $default;
	}//end resolve_cascade

	public static function user_id(array $session) : ?int {
		$id = $session['dedalo']['auth']['user_id'] ?? null;
		return $id === null ? null : (int) $id;
	}//end user_id

	public static function developer_flag(array $session) : bool {
		return (($session['dedalo']['auth']['is_developer'] ?? false) === true);
	}//end developer_flag

	public static function is_superuser(?int $user_id, int $superuser_id) : bool {
		return $user_id !== null && $user_id === $superuser_id;
	}//end is_superuser

	public static function level_for(bool $verbose, int $debug_level, int $error_level) : int {
		return $verbose ? $debug_level : $error_level;
	}//end level_for

	// --- live accessors (worker-safe: computed per call) ---

	public static function application_lang() : string {
		$default = defined('DEDALO_APPLICATION_LANGS_DEFAULT') ? (string) DEDALO_APPLICATION_LANGS_DEFAULT : '';
		return (string) self::resolve_cascade('dedalo_application_lang', $default, $_REQUEST, $_SESSION ?? []);
	}//end application_lang

	public static function data_lang() : string {
		$default = defined('DEDALO_DATA_LANG_DEFAULT') ? (string) DEDALO_DATA_LANG_DEFAULT : '';
		return (string) self::resolve_cascade('dedalo_data_lang', $default, $_REQUEST, $_SESSION ?? []);
	}//end data_lang

	public static function show_debug() : bool {
		$superuser = defined('DEDALO_SUPERUSER') ? (int) DEDALO_SUPERUSER : -1;
		return self::is_superuser(self::user_id($_SESSION ?? []), $superuser);
	}//end show_debug

	public static function show_developer() : bool {
		return self::developer_flag($_SESSION ?? []);
	}//end show_developer

	/** Thin live wrapper; logger::DEBUG/ERROR exist once the logger is loaded at boot. */
	public static function logger_level() : int {
		return self::level_for(self::show_debug() || self::show_developer(), logger::DEBUG, logger::ERROR);
	}//end logger_level
}
```

- [ ] **Step 4: Run it — expect PASS** (`--filter request_context_Test`, 8 tests).

- [ ] **Step 5: Run the full hermetic suite** (`vendor/bin/phpunit -c test/server/phpunit.unit.xml`): all green; report totals (was 245 tests / 2406 assertions; expect +8 tests).

- [ ] **Step 6: Commit**

```bash
git add core/base/config/class.request_context.php test/server/unit/request_context_Test.php
git commit -m "feat(config): request_context — worker-safe request/user-scoped accessor"
```

---

## Self-Review

**Spec coverage (§5.5 / §9 Phase 5 / Risk #1):** `request_context` is the accessor for the REQUEST/USER-scoped values (lang, debug, developer, logger level) that the shim never emits — resolved live per call, eliminating the long-lived-worker cross-request/cross-user leak. The cascade mirrors v6 `fix_cascade_config_var`; the debug/developer flags mirror `logged_user_id()==DEDALO_SUPERUSER` / `logged_user_is_developer()`. The ~300 read-site migration is explicitly deferred to incremental follow-on work.

**Placeholder scan:** complete code/commands. The pure resolvers are fully tested; the live accessors are tested via superglobal manipulation + constant fallbacks (no real-constant pollution). `logger_level()` is the one thin live wrapper not unit-tested directly (it needs `logger::DEBUG`/`ERROR`); its pure core `level_for` IS tested.

**Type consistency:** the live accessors call the pure resolvers with matching signatures; `application_lang`/`data_lang` return `string`, `show_debug`/`show_developer` return `bool`, `logger_level` returns `int` — matching the legacy constants' types.

**Carry-overs (the incremental migration, follow-on):** convert the ~300 read-sites (`DEDALO_APPLICATION_LANG`/`DEDALO_DATA_LANG`/`SHOW_DEBUG`/`SHOW_DEVELOPER`/`LOGGER_LEVEL` reads) to `request_context::*()` in batches; once all are migrated AND RoadRunner is a target, drop the request-state phase's `define()`s and add the session write-back (lang persistence) to `request_context` (or a dedicated persist method). Until then, both the constants (FPM-safe) and the accessor coexist; they return identical values.
