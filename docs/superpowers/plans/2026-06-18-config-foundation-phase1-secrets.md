# Config Foundation — Phase 1: Secrets Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the zero-dependency secret-handling foundation for Dédalo v7 — a `.env` loader, an evolved fail-closed secret sentinel, and a PHP↔Bun `.env` drift check — without touching the live boot path.

**Architecture:** Three new dependency-free classes under `core/base/boot/` (`env_loader`, `secret_sentinels`, `env_sync`), each with a pure/testable core. The existing `dedalo_assert_secrets_initialised()` in `shared/core_functions.php` is rewired to delegate to `secret_sentinels` and to fail closed (HTTP 503) in production by default. A hermetic PHPUnit harness (`phpunit.unit.xml` + `bootstrap.unit.php`) lets these foundation classes be unit-tested with no database.

**Tech Stack:** PHP 8.1+, PHPUnit ^13 (`vendor/bin/phpunit`), no Composer runtime dependency for the classes themselves.

## Global Constraints

- **PHP 8.1+**; **no Composer runtime dependency** for core boot; **keep Dédalo's own autoloader**. (Boot classes under `core/base/boot/` are `require`d explicitly, NOT autoloaded.)
- **Secrets come from environment / a git-ignored `.env`**; non-secret config is PHP returning typed arrays (later phases).
- **`env_loader` hard rules:** (1) **real process env wins** over the `.env` file; (2) **NEVER** write `$_ENV` / `$_SERVER` / call `putenv()` — values live in a private static array only; (3) **refuse** a group/world-**writable** `.env` file; (4) **no `${VAR}` interpolation**.
- **Salt preserved verbatim** — never regenerate `DEDALO_SALT_STRING`.
- **Production = `!(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER === true)`** (no `IS_PRODUCTION` constant exists in this codebase).
- **Test command (hermetic, no DB):** `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter <name>` run from the repo root.
- Foundation unit tests `require_once` their class-under-test directly and extend `PHPUnit\Framework\TestCase` (NOT `BaseTestCase`, which needs the DB).

---

## File Structure

- `core/base/boot/class.env_loader.php` — **new.** `.env` parser + loader + typed accessors. Pure `parse()`; `load()` does guarded file I/O.
- `core/base/boot/class.secret_sentinels.php` — **new.** Pure evaluation of secret values vs. sample defaults + the fail-closed decision. No constants, no I/O.
- `core/base/boot/class.env_sync.php` — **new.** Pure comparison of the shared PHP↔Bun `.env` key set (the name map from the design spec, Appendix B).
- `install/check_env_sync.php` — **new.** Thin CLI wrapping `env_sync::compare()` + `env_loader::parse()`; exit 0 synced / 1 drift.
- `config/sample.env` — **new.** Tracked template of the secret keys an install must set in `../private/.env`.
- `test/server/bootstrap.unit.php` — **new.** Minimal hermetic bootstrap (defines `IS_UNIT_TEST`, no config, no DB).
- `test/server/phpunit.unit.xml` — **new.** PHPUnit config for the hermetic `unit` suite.
- `test/server/unit/env_loader_Test.php`, `secret_sentinels_Test.php`, `env_sync_Test.php` — **new.** Hermetic unit tests.
- `shared/core_functions.php` — **modify** `dedalo_assert_secrets_initialised()` (lines ~1183–1237) to delegate to `secret_sentinels` and fail closed in production.
- `.gitignore` — **modify** to un-ignore `config/sample.env`.

---

### Task 1: Hermetic unit-test harness

Creates a DB-free PHPUnit config so the Phase-1 foundation classes can be tested fast and in isolation. Verified by a trivial sanity test.

**Files:**
- Create: `test/server/bootstrap.unit.php`
- Create: `test/server/phpunit.unit.xml`
- Create: `test/server/unit/harness_Test.php`

**Interfaces:**
- Consumes: nothing.
- Produces: the run command `vendor/bin/phpunit -c test/server/phpunit.unit.xml`; the `test/server/unit/` suite directory where Tasks 2–4 add tests; the `IS_UNIT_TEST` constant set to `true` during unit runs.

- [ ] **Step 1: Write the minimal bootstrap**

Create `test/server/bootstrap.unit.php`:

```php
<?php declare(strict_types=1);

// Hermetic unit bootstrap for the Dédalo v7 config-foundation classes.
// NO config, NO database, NO session — foundation tests require their
// class-under-test directly. This is the `TEST` boot profile from the
// config+bootstrap design spec, in its smallest form.
define('IS_UNIT_TEST', true);

error_reporting(E_ALL & ~E_DEPRECATED);
```

- [ ] **Step 2: Write the PHPUnit config for the unit suite**

Create `test/server/phpunit.unit.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="https://schema.phpunit.de/13.0/phpunit.xsd"
         executionOrder="default"
         cacheResult="false"
         bootstrap="bootstrap.unit.php"
         colors="true">
    <php>
        <ini name="error_reporting" value="E_ALL &amp; ~E_DEPRECATED"/>
    </php>
    <testsuites>
        <testsuite name="unit">
            <directory>unit</directory>
        </testsuite>
    </testsuites>
</phpunit>
```

- [ ] **Step 3: Write a sanity test**

Create `test/server/unit/harness_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class harness_Test extends TestCase {

	public function test_unit_harness_boots_without_database() : void {
		$this->assertTrue(defined('IS_UNIT_TEST'));
		$this->assertTrue(IS_UNIT_TEST);
	}
}
```

- [ ] **Step 4: Run the sanity test (verify the harness works)**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter test_unit_harness_boots_without_database`
Expected: PASS, 1 test, 2 assertions. (Confirms PHPUnit loads `bootstrap.unit.php` and runs with no DB connection.)

- [ ] **Step 5: Commit**

```bash
git add test/server/bootstrap.unit.php test/server/phpunit.unit.xml test/server/unit/harness_Test.php
git commit -m "test(config): hermetic DB-free unit harness for config foundation"
```

---

### Task 2: `env_loader::parse()` — the pure `.env` parser

The dependency-free parser. No I/O. This is where the quoting/comment/key-validation rules live.

**Files:**
- Create: `core/base/boot/class.env_loader.php`
- Create: `test/server/unit/env_loader_Test.php`

**Interfaces:**
- Consumes: nothing.
- Produces: `env_loader::parse(string $content): array` returning `array<string,string>` (KEY ⇒ value). Consumed by `load()` (Task 3), by `env_sync` (Task 6), and by the CLI.

- [ ] **Step 1: Write the failing tests**

Create `test/server/unit/env_loader_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.env_loader.php';

final class env_loader_Test extends TestCase {

	protected function tearDown() : void {
		env_loader::reset();
	}

	public function test_parse_basic_key_value() : void {
		$out = env_loader::parse("FOO=bar\nBAZ=qux");
		$this->assertSame(['FOO' => 'bar', 'BAZ' => 'qux'], $out);
	}

	public function test_parse_skips_comments_and_blank_lines() : void {
		$out = env_loader::parse("# a comment\n\nFOO=bar\n   # indented comment\n");
		$this->assertSame(['FOO' => 'bar'], $out);
	}

	public function test_parse_single_quotes_are_literal() : void {
		// single quotes preserve $ and # verbatim, no interpolation
		$out = env_loader::parse("PW='p\$a#ss word'");
		$this->assertSame('p$a#ss word', $out['PW']);
	}

	public function test_parse_double_quotes_process_escapes() : void {
		$out = env_loader::parse('MSG="line1\nline2"');
		$this->assertSame("line1\nline2", $out['MSG']);
	}

	public function test_parse_unquoted_strips_trailing_inline_comment() : void {
		$out = env_loader::parse("HOST=localhost # the db host");
		$this->assertSame('localhost', $out['HOST']);
	}

	public function test_parse_rejects_invalid_keys() : void {
		$out = env_loader::parse("bad-key=1\nlower=2\n9NUM=3\nGOOD_KEY=4");
		$this->assertSame(['GOOD_KEY' => '4'], $out);
	}

	public function test_parse_strips_optional_export_prefix() : void {
		$out = env_loader::parse("export FOO=bar");
		$this->assertSame(['FOO' => 'bar'], $out);
	}

	public function test_parse_no_variable_interpolation() : void {
		// ${OTHER} must NOT be expanded
		$out = env_loader::parse('URL=http://host/${OTHER}/x');
		$this->assertSame('http://host/${OTHER}/x', $out['URL']);
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter env_loader_Test`
Expected: FAIL/ERROR — `Failed opening required '.../class.env_loader.php'` (file not created yet).

- [ ] **Step 3: Write the class with `parse()` (and the `reset()` seam used by tests)**

Create `core/base/boot/class.env_loader.php`:

```php
<?php declare(strict_types=1);

/**
* ENV_LOADER
* Zero-dependency .env reader for the Dédalo v7 boot. Never uses Composer.
* Hard rules (config+bootstrap design spec §5.8):
*  - real process env ALWAYS wins over the .env file (see get());
*  - NEVER writes $_ENV / $_SERVER / putenv() — values live in a private
*    static array only, so phpinfo() and proc_open children cannot leak them;
*  - refuses a group/world-WRITABLE .env file;
*  - no ${VAR} interpolation.
*/
final class env_loader {

	/** @var array<string,string> parsed values from the .env file(s) */
	private static array $values = [];
	private static bool $loaded = false;

	/**
	* PARSE
	* Pure: turns .env text into a KEY=>string map. No I/O, no side effects.
	* @param string $content
	* @return array<string,string>
	*/
	public static function parse(string $content) : array {

		$out   = [];
		$lines = preg_split('/\r\n|\r|\n/', $content);
		foreach ($lines as $raw) {
			$line = ltrim($raw);
			if ($line === '' || $line[0] === '#') {
				continue;
			}
			// optional leading `export `
			$line = preg_replace('/^export\s+/', '', $line);
			$eq = strpos($line, '=');
			if ($eq === false) {
				continue;
			}
			$key = rtrim(substr($line, 0, $eq));
			if (preg_match('/^[A-Z_][A-Z0-9_]*$/', $key) !== 1) {
				continue; // reject non-conforming keys
			}
			$out[$key] = self::parse_value(substr($line, $eq + 1));
		}

		return $out;
	}//end parse

	/**
	* PARSE_VALUE
	* Quoting/comment rules for a single value (no interpolation).
	* @param string $val
	* @return string
	*/
	private static function parse_value(string $val) : string {

		$val = trim($val);
		if ($val === '') {
			return '';
		}

		$q = $val[0];
		if ($q === '"' || $q === "'") {
			$last = strrpos($val, $q);
			if ($last !== false && $last > 0) {
				$inner = substr($val, 1, $last - 1);
				if ($q === "'") {
					return $inner; // literal, no escapes
				}
				// double quote: limited escapes only
				return strtr($inner, [
					'\\\\' => "\\",
					'\\n'  => "\n",
					'\\t'  => "\t",
					'\\r'  => "\r",
					'\\"'  => '"',
				]);
			}
		}

		// unquoted: a whitespace-prefixed # starts an inline comment
		if (preg_match('/\s#/', $val) === 1) {
			$val = rtrim(preg_split('/\s+#/', $val, 2)[0]);
		}

		return $val;
	}//end parse_value

	/**
	* RESET
	* Test-only seam: clears the private store.
	* @return void
	*/
	public static function reset() : void {
		self::$values = [];
		self::$loaded = false;
	}//end reset
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter env_loader_Test`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add core/base/boot/class.env_loader.php test/server/unit/env_loader_Test.php
git commit -m "feat(config): zero-dependency .env parser (env_loader::parse)"
```

---

### Task 3: `env_loader` file loading, precedence, perms guard, typed accessors

Adds `load()` (guarded file I/O, real-env-wins merge), `get()/get_int()/get_bool()/get_json()/has()`.

**Files:**
- Modify: `core/base/boot/class.env_loader.php`
- Modify: `test/server/unit/env_loader_Test.php`

**Interfaces:**
- Consumes: `env_loader::parse()` (Task 2).
- Produces:
  - `env_loader::load(string $path, bool $require = false): void`
  - `env_loader::get(string $key, ?string $default = null): ?string`
  - `env_loader::get_int(string $key, ?int $default = null): ?int`
  - `env_loader::get_bool(string $key, ?bool $default = null): ?bool`
  - `env_loader::get_json(string $key, mixed $default = null): mixed`
  - `env_loader::has(string $key): bool`

- [ ] **Step 1: Write the failing tests**

Append these methods inside `env_loader_Test` in `test/server/unit/env_loader_Test.php` (before the closing `}`):

```php
	private function write_env(string $content, int $perms = 0600) : string {
		$path = sys_get_temp_dir() . '/dedalo_envtest_' . getmypid() . '_' . uniqid() . '.env';
		file_put_contents($path, $content);
		chmod($path, $perms);
		return $path;
	}

	public function test_load_then_get_returns_value() : void {
		$path = $this->write_env("DB_HOST=db.internal\nDB_PORT=5432");
		env_loader::load($path);
		$this->assertSame('db.internal', env_loader::get('DB_HOST'));
		$this->assertSame(5432, env_loader::get_int('DB_PORT'));
		unlink($path);
	}

	public function test_get_returns_default_when_absent() : void {
		$this->assertSame('fallback', env_loader::get('NOT_SET', 'fallback'));
		$this->assertNull(env_loader::get('NOT_SET'));
		$this->assertFalse(env_loader::has('NOT_SET'));
	}

	public function test_real_process_env_wins_over_file() : void {
		putenv('DEDALO_ENVTEST_WIN=from_real_env');
		$path = $this->write_env('DEDALO_ENVTEST_WIN=from_file');
		env_loader::load($path);
		$this->assertSame('from_real_env', env_loader::get('DEDALO_ENVTEST_WIN'));
		putenv('DEDALO_ENVTEST_WIN'); // unset
		unlink($path);
	}

	public function test_load_refuses_group_or_world_writable_file() : void {
		$path = $this->write_env('SECRET=should_not_load', 0666);
		env_loader::load($path);
		$this->assertNull(env_loader::get('SECRET')); // refused, nothing loaded
		unlink($path);
	}

	public function test_load_missing_file_is_noop_unless_required() : void {
		$missing = sys_get_temp_dir() . '/dedalo_envtest_missing_' . uniqid() . '.env';
		env_loader::load($missing); // no throw
		$this->assertNull(env_loader::get('ANYTHING'));
		$this->expectException(\RuntimeException::class);
		env_loader::load($missing, true); // required => throws
	}

	public function test_get_bool_coercion() : void {
		$path = $this->write_env("FLAG_ON=true\nFLAG_OFF=no");
		env_loader::load($path);
		$this->assertTrue(env_loader::get_bool('FLAG_ON'));
		$this->assertFalse(env_loader::get_bool('FLAG_OFF'));
		$this->assertNull(env_loader::get_bool('FLAG_MISSING'));
		unlink($path);
	}

	public function test_get_json_decodes_or_defaults() : void {
		$path = $this->write_env('LIST=\'["a","b"]\'' . "\nBADJSON='{not json'");
		env_loader::load($path);
		$this->assertSame(['a', 'b'], env_loader::get_json('LIST'));
		$this->assertSame([], env_loader::get_json('BADJSON', []));
		unlink($path);
	}
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter env_loader_Test`
Expected: FAIL/ERROR — `Call to undefined method env_loader::load()`.

- [ ] **Step 3: Add `load()` and the accessors to the class**

In `core/base/boot/class.env_loader.php`, insert these methods after `parse_value()` (before `reset()`):

```php
	/**
	* LOAD
	* Loads a .env file into the private store, merged UNDER real process env.
	* Refuses a group/world-writable file. Idempotent across keys.
	* @param string $path absolute path to the .env file
	* @param bool $require when true, a missing/unreadable/over-permissive file throws
	* @return void
	*/
	public static function load(string $path, bool $require = false) : void {

		if (is_file($path) === false || is_readable($path) === false) {
			if ($require === true) {
				throw new \RuntimeException('env_loader: required env file not readable: ' . $path);
			}
			return;
		}

		// refuse group/other WRITABLE files (0o022). 640/600 are fine.
		if ((fileperms($path) & 0o022) !== 0) {
			@error_log('env_loader: refusing writable-by-group/other env file: ' . $path);
			if ($require === true) {
				throw new \RuntimeException('env_loader: env file permissions too open: ' . $path);
			}
			return;
		}

		$content = file_get_contents($path);
		if ($content === false) {
			if ($require === true) {
				throw new \RuntimeException('env_loader: failed reading env file: ' . $path);
			}
			return;
		}

		foreach (self::parse($content) as $k => $v) {
			// real process env wins: never store over a real env value
			if (getenv($k) !== false) {
				continue;
			}
			self::$values[$k] = $v;
		}
		self::$loaded = true;
	}//end load

	/**
	* GET
	* Real process env wins, then the loaded .env store, then $default.
	* @param string $key
	* @param string|null $default
	* @return string|null
	*/
	public static function get(string $key, ?string $default = null) : ?string {
		$env = getenv($key);
		if ($env !== false) {
			return $env;
		}
		return self::$values[$key] ?? $default;
	}//end get

	public static function has(string $key) : bool {
		return getenv($key) !== false || array_key_exists($key, self::$values);
	}//end has

	public static function get_int(string $key, ?int $default = null) : ?int {
		$v = self::get($key);
		return $v === null ? $default : (int)$v;
	}//end get_int

	public static function get_bool(string $key, ?bool $default = null) : ?bool {
		$v = self::get($key);
		if ($v === null) {
			return $default;
		}
		return in_array(strtolower(trim($v)), ['1', 'true', 'yes', 'on'], true);
	}//end get_bool

	public static function get_json(string $key, mixed $default = null) : mixed {
		$v = self::get($key);
		if ($v === null) {
			return $default;
		}
		try {
			return json_decode($v, true, 64, JSON_THROW_ON_ERROR);
		} catch (\JsonException $e) {
			@error_log('env_loader: invalid JSON for ' . $key);
			return $default;
		}
	}//end get_json
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter env_loader_Test`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add core/base/boot/class.env_loader.php test/server/unit/env_loader_Test.php
git commit -m "feat(config): env_loader file load, real-env precedence, perms guard, typed accessors"
```

---

### Task 4: `secret_sentinels` — pure evaluator + fail-closed decision

Extracts the SEC-094 logic into a pure, testable class: sample-default detection, cross-constraint checks, and the production fail-closed decision.

**Files:**
- Create: `core/base/boot/class.secret_sentinels.php`
- Create: `test/server/unit/secret_sentinels_Test.php`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `secret_sentinels::evaluate(array $values): array` — names of values still matching a sample default / weak salt.
  - `secret_sentinels::evaluate_context(array $values, bool $is_production): array` — cross-key violations (`DEDALO_INFO_KEY` == `DEDALO_ENTITY`; empty diffusion token in prod).
  - `secret_sentinels::should_enforce(array $violations, bool $is_production, bool $is_installing, ?bool $explicit): bool` — the fail-closed decision (used by Task 5's wrapper).

- [ ] **Step 1: Write the failing tests**

Create `test/server/unit/secret_sentinels_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.secret_sentinels.php';

final class secret_sentinels_Test extends TestCase {

	public function test_evaluate_flags_sample_defaults() : void {
		$v = secret_sentinels::evaluate([
			'DEDALO_PASSWORD_CONN' => 'mypassword',
			'DEDALO_SALT_STRING'   => 'dedalo_six',
			'DEDALO_USERNAME_CONN' => 'realuser',
		]);
		sort($v);
		$this->assertSame(['DEDALO_PASSWORD_CONN', 'DEDALO_SALT_STRING'], $v);
	}

	public function test_evaluate_flags_short_salt() : void {
		$v = secret_sentinels::evaluate(['DEDALO_SALT_STRING' => 'short']);
		$this->assertSame(['DEDALO_SALT_STRING'], $v);
	}

	public function test_evaluate_passes_strong_values() : void {
		$v = secret_sentinels::evaluate([
			'DEDALO_PASSWORD_CONN' => 'a-strong-passphrase',
			'DEDALO_SALT_STRING'   => 'a-32-char-or-longer-random-salt!!',
		]);
		$this->assertSame([], $v);
	}

	public function test_evaluate_context_info_key_equals_entity() : void {
		$v = secret_sentinels::evaluate_context([
			'DEDALO_INFO_KEY' => 'my_entity',
			'DEDALO_ENTITY'   => 'my_entity',
		], true);
		$this->assertSame(['DEDALO_INFO_KEY'], $v);
	}

	public function test_evaluate_context_empty_diffusion_token_only_in_prod() : void {
		$prod = secret_sentinels::evaluate_context(['DEDALO_DIFFUSION_INTERNAL_TOKEN' => ''], true);
		$dev  = secret_sentinels::evaluate_context(['DEDALO_DIFFUSION_INTERNAL_TOKEN' => ''], false);
		$this->assertSame(['DEDALO_DIFFUSION_INTERNAL_TOKEN'], $prod);
		$this->assertSame([], $dev);
	}

	public function test_should_enforce_production_default_fails_closed() : void {
		$this->assertTrue(secret_sentinels::should_enforce(['X'], true, false, null));
	}

	public function test_should_enforce_dev_only_warns() : void {
		$this->assertFalse(secret_sentinels::should_enforce(['X'], false, false, null));
	}

	public function test_should_enforce_install_carveout() : void {
		$this->assertFalse(secret_sentinels::should_enforce(['X'], true, true, null));
	}

	public function test_should_enforce_explicit_override() : void {
		$this->assertTrue(secret_sentinels::should_enforce(['X'], false, false, true));   // force even in dev
		$this->assertFalse(secret_sentinels::should_enforce(['X'], true, false, false));  // disable even in prod
	}

	public function test_should_enforce_no_violations_never_enforces() : void {
		$this->assertFalse(secret_sentinels::should_enforce([], true, false, true));
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter secret_sentinels_Test`
Expected: FAIL/ERROR — `Failed opening required '.../class.secret_sentinels.php'`.

- [ ] **Step 3: Write the class**

Create `core/base/boot/class.secret_sentinels.php`:

```php
<?php declare(strict_types=1);

/**
* SECRET_SENTINELS
* SEC-094 (v7): pure, dependency-free evaluation of configuration secrets.
* No constants, no I/O — the caller passes the current values in and acts on
* the result. This is the testable core extracted from
* dedalo_assert_secrets_initialised().
*/
final class secret_sentinels {

	/**
	* EVALUATE
	* Flags values that still equal a sample default (or a too-weak salt).
	* The caller passes only the values that are actually set.
	* @param array<string,string> $values
	* @return string[] names of offending values
	*/
	public static function evaluate(array $values) : array {

		$rules = [
			'DEDALO_INFORMATION'			=> static fn(string $v) : bool => $v === 'Dédalo install version',
			'DEDALO_USERNAME_CONN'			=> static fn(string $v) : bool => $v === 'myusername',
			'DEDALO_PASSWORD_CONN'			=> static fn(string $v) : bool => $v === 'mypassword',
			'DEDALO_SALT_STRING'			=> static fn(string $v) : bool => $v === 'dedalo_six' || strlen($v) < 16,
			'API_WEB_USER_CODE'				=> static fn(string $v) : bool => preg_match('/^X{10,}$/', $v) === 1,
			'MYSQL_DEDALO_PASSWORD_CONN'	=> static fn(string $v) : bool => preg_match('/^X+\.\.$/', $v) === 1,
		];

		$violations = [];
		foreach ($rules as $name => $is_bad) {
			if (array_key_exists($name, $values) && $is_bad((string)$values[$name]) === true) {
				$violations[] = $name;
			}
		}

		return $violations;
	}//end evaluate

	/**
	* EVALUATE_CONTEXT
	* Cross-key checks that need more than one value.
	* @param array<string,string> $values
	* @param bool $is_production
	* @return string[]
	*/
	public static function evaluate_context(array $values, bool $is_production) : array {

		$violations = [];

		if (isset($values['DEDALO_INFO_KEY'], $values['DEDALO_ENTITY'])
			&& $values['DEDALO_INFO_KEY'] === $values['DEDALO_ENTITY']) {
			$violations[] = 'DEDALO_INFO_KEY';
		}

		if ($is_production === true
			&& array_key_exists('DEDALO_DIFFUSION_INTERNAL_TOKEN', $values)
			&& trim((string)$values['DEDALO_DIFFUSION_INTERNAL_TOKEN']) === '') {
			$violations[] = 'DEDALO_DIFFUSION_INTERNAL_TOKEN';
		}

		return $violations;
	}//end evaluate_context

	/**
	* SHOULD_ENFORCE
	* The fail-closed decision. Production fails closed by default; dev warns;
	* the install carve-out suppresses; an explicit opt-in/out overrides both.
	* @param string[] $violations
	* @param bool $is_production
	* @param bool $is_installing
	* @param bool|null $explicit  value of DEDALO_ENFORCE_SECRET_SENTINELS if defined, else null
	* @return bool
	*/
	public static function should_enforce(array $violations, bool $is_production, bool $is_installing, ?bool $explicit) : bool {

		if (empty($violations)) {
			return false;
		}
		if ($explicit === true) {
			return true;  // force even in dev
		}
		if ($explicit === false) {
			return false; // explicit escape hatch, even in prod (supervised migration)
		}
		return $is_production === true && $is_installing === false;
	}//end should_enforce
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter secret_sentinels_Test`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add core/base/boot/class.secret_sentinels.php test/server/unit/secret_sentinels_Test.php
git commit -m "feat(config): pure SEC-094 secret_sentinels evaluator + fail-closed decision"
```

---

### Task 5: Rewire `dedalo_assert_secrets_initialised()` to delegate + fail closed in prod

Replaces the inline sentinel logic in `shared/core_functions.php` with a delegation to `secret_sentinels`, adds the new sentinels (diffusion token, info-key==entity, weak salt) and the production fail-closed default. Behavior is preserved under `IS_UNIT_TEST` and `DEDALO_ENFORCE_SECRET_SENTINELS`.

**Files:**
- Modify: `shared/core_functions.php` (function `dedalo_assert_secrets_initialised()`, currently lines ~1183–1237)

**Interfaces:**
- Consumes: `secret_sentinels::evaluate()`, `::evaluate_context()`, `::should_enforce()` (Task 4).
- Produces: same function name/signature `dedalo_assert_secrets_initialised(): array` (returns the violations array; on enforced violation it sends a 503 and `die()`s, as the v6 opt-in path did).

- [ ] **Step 1: Read the current function to anchor the edit**

Run: `grep -n "function dedalo_assert_secrets_initialised" shared/core_functions.php`
Expected: prints the line (~1183). Open that region to confirm the body still matches the block replaced below.

- [ ] **Step 2: Replace the function body**

In `shared/core_functions.php`, replace the entire function (from `function dedalo_assert_secrets_initialised() : array {` through its closing `}//end dedalo_assert_secrets_initialised`) with:

```php
function dedalo_assert_secrets_initialised() : array {

	if (defined('IS_UNIT_TEST') && IS_UNIT_TEST === true) {
		return [];
	}

	// pure evaluator (zero-dependency boot class, require'd not autoloaded)
	require_once (defined('DEDALO_CORE_PATH') ? DEDALO_CORE_PATH : dirname(__DIR__) . '/core')
		. '/base/boot/class.secret_sentinels.php';

	// production = NOT an explicit development server
	$is_production = !(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER === true);
	// install carve-out: the installer legitimately runs before secrets exist
	$is_installing = defined('DEDALO_INSTALL_STATUS') && DEDALO_INSTALL_STATUS === false;

	// collect the values the sentinels care about (only those that are defined)
	$names = [
		'DEDALO_INFORMATION', 'DEDALO_USERNAME_CONN', 'DEDALO_PASSWORD_CONN',
		'DEDALO_SALT_STRING', 'API_WEB_USER_CODE', 'MYSQL_DEDALO_PASSWORD_CONN',
		'DEDALO_INFO_KEY', 'DEDALO_ENTITY', 'DEDALO_DIFFUSION_INTERNAL_TOKEN',
	];
	$values = [];
	foreach ($names as $n) {
		if (defined($n)) {
			$values[$n] = (string)constant($n);
		}
	}

	$violations = array_merge(
		secret_sentinels::evaluate($values),
		secret_sentinels::evaluate_context($values, $is_production)
	);

	if (empty($violations)) {
		return [];
	}

	$msg = 'SEC-094: configuration secrets still match sample defaults or are weak: '
		. implode(', ', $violations)
		. '. Set strong unique values in your .env / config before serving production.';

	@error_log($msg);
	if (function_exists('debug_log') && class_exists('logger')) {
		debug_log(__FUNCTION__ . ' ' . $msg, logger::ERROR);
	}

	$explicit = defined('DEDALO_ENFORCE_SECRET_SENTINELS')
		? (bool)DEDALO_ENFORCE_SECRET_SENTINELS
		: null;

	if (secret_sentinels::should_enforce($violations, $is_production, $is_installing, $explicit) === true) {
		http_response_code(503);
		header('Content-Type: text/plain; charset=utf-8');
		die('Service unavailable: insecure default secrets detected (SEC-094). See server log.');
	}

	return $violations;
}//end dedalo_assert_secrets_initialised
```

- [ ] **Step 3: Lint the modified file**

Run: `php -l shared/core_functions.php`
Expected: `No syntax errors detected in shared/core_functions.php`.

- [ ] **Step 4: Run PHPStan on the changed file (existing project gate)**

Run: `composer phpstan -- --no-progress shared/core_functions.php 2>&1 | tail -20`
Expected: no NEW errors attributable to this function (the `secret_sentinels::` calls resolve; the project may have a pre-existing baseline — confirm no new entries reference `dedalo_assert_secrets_initialised`). If PHPStan can't be scoped to one file in this project layout, run `composer phpstan 2>&1 | tail -30` and confirm the count did not increase versus a clean checkout.

- [ ] **Step 5: Commit**

```bash
git add shared/core_functions.php
git commit -m "feat(config): SEC-094 sentinel delegates to secret_sentinels, fails closed in production

Adds diffusion-token, info-key==entity, and weak-salt checks; production fails
closed by default (DEVELOPMENT_SERVER!==true), with install + explicit
DEDALO_ENFORCE_SECRET_SENTINELS carve-outs. IS_UNIT_TEST still short-circuits."
```

---

### Task 6: `env_sync` drift check (PHP ↔ Bun `.env`) + CLI + `.env` template

The PHP↔Bun single-source guard: a pure comparator over the shared key map, a thin CLI, and the tracked secret-template file.

**Files:**
- Create: `core/base/boot/class.env_sync.php`
- Create: `install/check_env_sync.php`
- Create: `config/sample.env`
- Modify: `.gitignore`
- Create: `test/server/unit/env_sync_Test.php`

**Interfaces:**
- Consumes: `env_loader::parse()` (Task 2).
- Produces: `env_sync::MAP` (PHP key ⇒ Bun key); `env_sync::compare(array $php, array $bun): array` (list of drift records `['php_key'=>, 'bun_key'=>, 'php_val'=>, 'bun_val'=>]`).

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/env_sync_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.env_sync.php';

final class env_sync_Test extends TestCase {

	public function test_compare_reports_no_drift_when_mapped_keys_match() : void {
		$php = ['MYSQL_DEDALO_PASSWORD_CONN' => 'secret', 'DEDALO_DIFFUSION_INTERNAL_TOKEN' => 'tok'];
		$bun = ['DB_PASSWORD' => 'secret', 'DIFFUSION_INTERNAL_TOKEN' => 'tok'];
		$this->assertSame([], env_sync::compare($php, $bun));
	}

	public function test_compare_reports_drift_on_mismatch() : void {
		$php = ['MYSQL_DEDALO_PASSWORD_CONN' => 'secret'];
		$bun = ['DB_PASSWORD' => 'WRONG'];
		$drift = env_sync::compare($php, $bun);
		$this->assertCount(1, $drift);
		$this->assertSame('MYSQL_DEDALO_PASSWORD_CONN', $drift[0]['php_key']);
		$this->assertSame('DB_PASSWORD', $drift[0]['bun_key']);
	}

	public function test_compare_ignores_keys_set_on_neither_side() : void {
		$this->assertSame([], env_sync::compare([], []));
	}

	public function test_compare_flags_one_sided_value() : void {
		$drift = env_sync::compare(['DEDALO_MEDIA_PATH' => '/srv/media'], []);
		$this->assertCount(1, $drift);
		$this->assertNull($drift[0]['bun_val']);
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter env_sync_Test`
Expected: FAIL/ERROR — `Failed opening required '.../class.env_sync.php'`.

- [ ] **Step 3: Write the comparator class**

Create `core/base/boot/class.env_sync.php`:

```php
<?php declare(strict_types=1);

/**
* ENV_SYNC
* Single-source guard for the values shared between the PHP `.env` and the
* Bun diffusion engine `.env` (diffusion/api/v1/.env). Pure comparator over
* the canonical name map (design spec, Appendix B).
*/
final class env_sync {

	/** PHP/.env key => Bun/.env key */
	public const MAP = [
		'MYSQL_DEDALO_HOSTNAME_CONN'		=> 'DB_HOST',
		'MYSQL_DEDALO_DB_PORT_CONN'			=> 'DB_PORT',
		'MYSQL_DEDALO_USERNAME_CONN'		=> 'DB_USER',
		'MYSQL_DEDALO_PASSWORD_CONN'		=> 'DB_PASSWORD',
		'MYSQL_DEDALO_DATABASE_CONN'		=> 'DB_NAME',
		'DEDALO_DIFFUSION_SOCKET_PATH'		=> 'SOCKET_PATH',
		'DEDALO_DIFFUSION_INTERNAL_TOKEN'	=> 'DIFFUSION_INTERNAL_TOKEN',
		'DEDALO_API_URL'					=> 'DEDALO_API_URL',
		'DEDALO_MEDIA_PATH'					=> 'DEDALO_MEDIA_PATH',
	];

	/**
	* COMPARE
	* @param array<string,string> $php parsed PHP-side .env
	* @param array<string,string> $bun parsed Bun-side .env
	* @return array<int,array{php_key:string,bun_key:string,php_val:?string,bun_val:?string}>
	*/
	public static function compare(array $php, array $bun) : array {

		$drift = [];
		foreach (self::MAP as $php_key => $bun_key) {
			$pv = $php[$php_key] ?? null;
			$bv = $bun[$bun_key] ?? null;
			if ($pv === null && $bv === null) {
				continue; // neither side sets it: not drift
			}
			if ($pv !== $bv) {
				$drift[] = [
					'php_key' => $php_key,
					'bun_key' => $bun_key,
					'php_val' => $pv,
					'bun_val' => $bv,
				];
			}
		}

		return $drift;
	}//end compare
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter env_sync_Test`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the CLI wrapper**

Create `install/check_env_sync.php`:

```php
<?php declare(strict_types=1);

/**
* CHECK_ENV_SYNC (CLI)
* Reports drift between the PHP `.env` and the Bun diffusion `.env`.
* Usage: php install/check_env_sync.php [path/to/php.env] [path/to/bun.env]
* Exit 0 = in sync, 1 = drift, 2 = usage/read error.
* Prints only KEY NAMES — never secret values.
*/
if (php_sapi_name() !== 'cli') {
	http_response_code(404);
	exit;
}

require_once dirname(__DIR__) . '/core/base/boot/class.env_loader.php';
require_once dirname(__DIR__) . '/core/base/boot/class.env_sync.php';

$php_env = $argv[1] ?? (dirname(__DIR__, 2) . '/private/.env');
$bun_env = $argv[2] ?? (dirname(__DIR__) . '/diffusion/api/v1/.env');

foreach ([$php_env, $bun_env] as $p) {
	if (!is_file($p) || !is_readable($p)) {
		fwrite(STDERR, "check_env_sync: cannot read env file: $p\n");
		exit(2);
	}
}

$drift = env_sync::compare(
	env_loader::parse(file_get_contents($php_env)),
	env_loader::parse(file_get_contents($bun_env))
);

if (empty($drift)) {
	fwrite(STDOUT, "env sync OK: PHP and Bun shared keys match.\n");
	exit(0);
}

fwrite(STDERR, "env DRIFT detected (values hidden):\n");
foreach ($drift as $d) {
	$state = $d['php_val'] === null ? 'missing in PHP'
		: ($d['bun_val'] === null ? 'missing in Bun' : 'values differ');
	fwrite(STDERR, "  - {$d['php_key']} <-> {$d['bun_key']}: {$state}\n");
}
exit(1);
```

- [ ] **Step 6: Write the tracked secret template**

Create `config/sample.env`:

```bash
# Dédalo v7 secrets — copy to ../private/.env (OUTSIDE the web root) and chmod 600.
# Real process environment variables override these. Never commit your real .env.

# --- PostgreSQL (private data) ---
DEDALO_USERNAME_CONN=
DEDALO_PASSWORD_CONN=

# --- MariaDB (public/publication data) ---
MYSQL_DEDALO_USERNAME_CONN=
MYSQL_DEDALO_PASSWORD_CONN=

# --- Crypto salt (encrypts stored passwords). PRESERVE the existing value on
#     upgrade — changing it BREAKS all stored ciphertext. Min 16 chars. ---
DEDALO_SALT_STRING=

# --- Install fingerprints (set once at install; do not change after) ---
DEDALO_INFORMATION=
DEDALO_INFO_KEY=

# --- Diffusion engine server-to-server token (must match Bun .env
#     DIFFUSION_INTERNAL_TOKEN). Required in production. ---
DEDALO_DIFFUSION_INTERNAL_TOKEN=
```

- [ ] **Step 7: Un-ignore the template in git**

Edit `.gitignore`: after the line `!config/sample.config_core.php`, add:

```
!config/sample.env
```

- [ ] **Step 8: Verify the CLI runs and the template is trackable**

Run:
```bash
php -l install/check_env_sync.php
git check-ignore -v config/sample.env || echo "sample.env is trackable"
php install/check_env_sync.php config/sample.env config/sample.env; echo "exit=$?"
```
Expected: `No syntax errors detected`; `sample.env is trackable`; the CLI compares the template to itself → `env sync OK`, `exit=0`.

- [ ] **Step 9: Commit**

```bash
git add core/base/boot/class.env_sync.php install/check_env_sync.php config/sample.env .gitignore test/server/unit/env_sync_Test.php
git commit -m "feat(config): PHP<->Bun .env drift check (env_sync) + CLI + sample.env template"
```

---

## Final verification (after all tasks)

- [ ] Run the whole hermetic unit suite:

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml`
Expected: PASS — 4 files, 30 tests (harness 1 + env_loader 15 + secret_sentinels 10 + env_sync 4), 0 failures, 0 errors. No database connection attempted.

- [ ] Confirm no `$_ENV`/`putenv` leakage was introduced in `env_loader`:

Run: `grep -nE "putenv|\\\$_ENV|\\\$_SERVER\[" core/base/boot/class.env_loader.php`
Expected: no matches (the loader never populates superglobals or process env).

- [ ] Confirm the new boot classes carry no Composer/autoload dependency:

Run: `grep -rnE "require .*vendor/autoload|use [A-Z]" core/base/boot/`
Expected: no `vendor/autoload` requires; no external namespace `use` imports.

---

## Self-review notes (coverage vs. spec §5.8 / Phase 1)

- env_loader (parser, real-env-wins, perms guard, no-superglobal-leak, typed accessors, JSON cap 64): Tasks 2–3. ✓
- Evolved SEC-094 (new sentinels, fail-closed in prod, install carve-out, IS_UNIT_TEST skip): Tasks 4–5. ✓
- Salt: weak/short check added; template documents PRESERVE-verbatim. ✓
- Bun single-source: drift comparator + CLI + name map (Appendix B). ✓
- Secret template (`.env`) tracked sample: Task 6. ✓
- Wiring env_loader INTO the live boot path is intentionally deferred to Phase 3 (bootstrap) / Phase 4 (migration) — Phase 1 ships building blocks + the safe-to-evolve sentinel only.
