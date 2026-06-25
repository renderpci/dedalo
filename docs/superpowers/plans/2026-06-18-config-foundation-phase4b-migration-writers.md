# Phase 4b — Migration tool: output writers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the 4a classification map into the four output artifacts of the v6→v7 migration (spec §5.10) — the secrets `.env` (+ the Bun engine `.env`), the typed local config overrides, `state.php`, and the verbatim passthrough defines — as pure content generators with no disk mutation.

**Architecture:** Four pure, hermetic writer classes under `install/`, each consuming the `migration_classifier::classify()` output and returning a file-content STRING (4c's orchestrator does the atomic writes + backup). `env_writer` renders `../private/.env` and, reusing `env_sync::MAP` (Appendix B), the Bun `diffusion/api/v1/.env`. `config_writer` emits a compiler layer-override file (`dot.path => value`) for CONFIG values that DIFFER from the catalog default. `state_writer` emits `state.php`. `passthrough_writer` reproduces unknown custom defines verbatim from their `raw` source.

**Tech Stack:** PHP 8.1+ (`var_export` for PHP-array files), PHPUnit 13 hermetic harness. Reuses `env_sync::MAP` + `env_loader::parse` (Phase 1), the catalog (`const→path/default`), `migration_destination`/`config_scope` (4a). No disk writes; tests assert returned strings (and round-trip the `.env` through `env_loader::parse`).

## Global Constraints

- **No disk mutation.** Every writer returns a content STRING. Atomic write, target paths, timestamped backup, and the `--dry-run` gate are 4c's job. Tests assert strings only.
- **Preserve the salt verbatim.** `DEDALO_SALT_STRING` (SECRET→ENV) is emitted with its value byte-for-byte; never transformed or regenerated.
- **`.env` must round-trip.** `env_loader::parse(env_writer::render_php($classification))` must return the original ENV values exactly (the writer's quoting is verified against the real Phase-1 parser, not assumed).
- **Bun `.env` reuses the single-source map.** The Bun output uses `env_sync::MAP` (PHP key → Bun key, spec Appendix B) — never a second hand-maintained list. Only MAP keys with a resolved literal value are emitted; runtime/derived MAP values (e.g. `DEDALO_API_URL`, `DEDALO_MEDIA_PATH`) are computed at boot, not at migration, and are skipped (noted).
- **Config writer emits only real overrides.** A CONFIG constant is written only when its migrated literal value DIFFERS from the catalog default (most match — the 3b-3 boot-diff confirmed 0 STATIC divergences on a clean install; the dev box's differ). Output is a compiler layer-override file: `<?php return ['dot.path' => value, ...];`.
- **Passthrough preserved verbatim.** PASSTHROUGH constants are reproduced as guarded `if (!defined('NAME')) define('NAME', <raw>);` using the extractor's verbatim `raw` source text — never re-serialized, never dropped.
- **Catalog scope discrepancy to honor:** `DEDALO_INFORMATION`/`DEDALO_INFO_KEY` are STATE (→ `state.php`) per the catalog + spec Appendix A, even though Phase-1's `config/sample.env` lists them under `.env`. The writers follow the catalog (classifier routes them STATE). Reconciling `sample.env` is out of scope here (noted for a follow-up).
- **Never read/execute the live `config.php`.** Writers consume the already-extracted classification; tests use synthetic classification maps.
- **Hermetic harness conventions:** `test/server/unit/*_Test.php`, `declare(strict_types=1)`, `extends PHPUnit\Framework\TestCase`, deps via `require_once dirname(__DIR__, 3) . '/...'`. Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml`.
- **Classification record shape (from 4a):** `name => ['destination'=>migration_destination, 'record'=>['value'=>mixed, 'raw'=>string, 'kind'=>'literal'|'runtime', 'file'=>string, 'line'=>int], 'scope'=>?config_scope]`.

## File Structure
- Create `install/class.env_writer.php` (Task 1) — `.env` + Bun `.env` content.
- Create `install/class.config_writer.php` (Task 2) — local override content.
- Create `install/class.state_writer.php` (Task 3) — `state.php` content.
- Create `install/class.passthrough_writer.php` (Task 4) — verbatim defines content.
- Tests: `test/server/unit/env_writer_Test.php`, `config_writer_Test.php`, `state_writer_Test.php`, `passthrough_writer_Test.php`.

Target paths (documented for 4c; writers are path-agnostic): `.env`→`<repo>/../private/.env`; Bun→`<repo>/diffusion/api/v1/.env`; local config→`<repo>/config/local/config.php`; state→`<repo>/config/state.php`; passthrough→`<repo>/config/local/passthrough.php`.

---

### Task 1: `env_writer` (`.env` + Bun `.env`)

**Files:**
- Create: `install/class.env_writer.php`
- Test: `test/server/unit/env_writer_Test.php`

**Interfaces:**
- Consumes: classification map (4a); `env_sync::MAP` (`core/base/boot/class.env_sync.php`); `migration_destination`; `env_loader::parse` (test round-trip).
- Produces: `env_writer::render_php(array $classification) : string` (the `../private/.env` content — ENV-destination constants with literal values, `KEY=value`, safe quoting); `env_writer::render_bun(array $classification) : string` (the Bun `.env` content — for each `env_sync::MAP` php-key present in the classification with a literal value, a `bun_key=value` line).

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/env_writer_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.env_loader.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.env_sync.php';
require_once dirname(__DIR__, 3) . '/install/class.migration_destination.php';
require_once dirname(__DIR__, 3) . '/install/class.env_writer.php';

final class env_writer_Test extends TestCase {

	private function entry(migration_destination $d, mixed $value, string $kind = 'literal') : array {
		return ['destination' => $d, 'record' => ['value' => $value, 'raw' => (string) $value, 'kind' => $kind, 'file' => 'f', 'line' => 1], 'scope' => null];
	}

	public function test_env_round_trips_through_env_loader_including_salt_and_specials() : void {
		$classification = [
			'DEDALO_SALT_STRING'   => $this->entry(migration_destination::ENV, 'S0me$alt-with #hash and space'),
			'DEDALO_PASSWORD_CONN' => $this->entry(migration_destination::ENV, 'p@ss"w0rd'),
			'DEDALO_USERNAME_CONN' => $this->entry(migration_destination::ENV, 'simpleuser'),
			'DD_NOT_SECRET'        => $this->entry(migration_destination::CONFIG, 'ignored'),
		];
		$content = env_writer::render_php($classification);
		$parsed = env_loader::parse($content);

		$this->assertSame('S0me$alt-with #hash and space', $parsed['DEDALO_SALT_STRING']);
		$this->assertSame('p@ss"w0rd', $parsed['DEDALO_PASSWORD_CONN']);
		$this->assertSame('simpleuser', $parsed['DEDALO_USERNAME_CONN']);
		// only ENV-destination constants are written
		$this->assertArrayNotHasKey('DD_NOT_SECRET', $parsed);
	}

	public function test_bun_env_uses_the_appendix_b_map() : void {
		$classification = [
			// DB password is SECRET→ENV; username/host are CONFIG; all are env_sync::MAP php-keys
			'MYSQL_DEDALO_PASSWORD_CONN' => $this->entry(migration_destination::ENV, 'mysqlpw'),
			'MYSQL_DEDALO_USERNAME_CONN' => $this->entry(migration_destination::CONFIG, 'web_dedalo'),
			'DEDALO_DIFFUSION_INTERNAL_TOKEN' => $this->entry(migration_destination::ENV, 'tok123'),
			// a MAP key whose value is runtime/derived must be skipped
			'DEDALO_API_URL' => $this->entry(migration_destination::CONFIG, null, 'runtime'),
		];
		$bun = env_loader::parse(env_writer::render_bun($classification));

		$this->assertSame('mysqlpw', $bun['DB_PASSWORD']);        // MYSQL_DEDALO_PASSWORD_CONN -> DB_PASSWORD
		$this->assertSame('web_dedalo', $bun['DB_USER']);          // MYSQL_DEDALO_USERNAME_CONN -> DB_USER
		$this->assertSame('tok123', $bun['DIFFUSION_INTERNAL_TOKEN']);
		$this->assertArrayNotHasKey('DEDALO_API_URL', $bun);       // runtime value skipped
	}

	public function test_runtime_secret_is_skipped_not_emitted_empty() : void {
		$classification = ['WEIRD_SECRET' => $this->entry(migration_destination::ENV, null, 'runtime')];
		$parsed = env_loader::parse(env_writer::render_php($classification));
		$this->assertArrayNotHasKey('WEIRD_SECRET', $parsed);
	}
}
```

- [ ] **Step 2: Run it — expect FAIL** (`--filter env_writer_Test`): class not found.

- [ ] **Step 3: Implement**

Create `install/class.env_writer.php`:

```php
<?php declare(strict_types=1);

require_once __DIR__ . '/class.migration_destination.php';
require_once dirname(__DIR__) . '/core/base/boot/class.env_sync.php';

/**
* ENV_WRITER
* Renders the migration's two .env artifacts from the 4a classification, as content
* strings (no disk writes). render_php() → the PHP-side ../private/.env (ENV-destination
* constants with literal values; the salt verbatim). render_bun() → the Bun diffusion
* engine .env, reusing env_sync::MAP (spec Appendix B) so the name map has ONE source.
* Quoting is chosen to round-trip through env_loader::parse (verified by the test).
*/
final class env_writer {

	/** @param array<string,array> $classification migration_classifier::classify() output */
	public static function render_php(array $classification) : string {
		$lines = ['# Dédalo v7 secrets — generated by the migration. chmod 600. Never commit.'];
		foreach ($classification as $name => $info) {
			if ($info['destination'] !== migration_destination::ENV) {
				continue;
			}
			if (($info['record']['kind'] ?? null) !== 'literal') {
				continue; // a secret must have a resolved literal value
			}
			$lines[] = $name . '=' . self::quote((string) self::stringify($info['record']['value']));
		}
		return implode("\n", $lines) . "\n";
	}//end render_php

	/** @param array<string,array> $classification */
	public static function render_bun(array $classification) : string {
		$lines = ['# Dédalo diffusion (Bun) .env — generated by the migration; keys mapped via env_sync::MAP.'];
		foreach (env_sync::MAP as $php_key => $bun_key) {
			if (!isset($classification[$php_key])) {
				continue;
			}
			$record = $classification[$php_key]['record'];
			if (($record['kind'] ?? null) !== 'literal') {
				continue; // runtime/derived (e.g. DEDALO_API_URL) is computed at boot, not migration
			}
			$lines[] = $bun_key . '=' . self::quote((string) self::stringify($record['value']));
		}
		return implode("\n", $lines) . "\n";
	}//end render_bun

	/** scalar → string for an env value (bools become 1/'' ; null handled by caller skip) */
	private static function stringify(mixed $value) : string {
		if (is_bool($value)) {
			return $value ? '1' : '';
		}
		return (string) $value;
	}//end stringify

	/**
	* Quote an env value so env_loader::parse reads it back identically. Unquoted when the
	* value is "plain"; otherwise double-quoted with backslash + double-quote escaped.
	*/
	private static function quote(string $value) : string {
		if ($value !== '' && preg_match('/^[A-Za-z0-9_\/.:@+-]+$/', $value) === 1) {
			return $value;
		}
		return '"' . str_replace(['\\', '"'], ['\\\\', '\\"'], $value) . '"';
	}//end quote
}
```

- [ ] **Step 4: Run it — expect PASS** (`--filter env_writer_Test`, 3 tests). If the round-trip test fails, the `quote()` rule disagrees with `env_loader::parse` — fix `quote()` to match the parser, do not change the assertion.

- [ ] **Step 5: Commit**

```bash
git add install/class.env_writer.php test/server/unit/env_writer_Test.php
git commit -m "feat(install): env_writer — .env + Bun .env content from migration classification"
```

---

### Task 2: `config_writer` (typed local overrides)

**Files:**
- Create: `install/class.config_writer.php`
- Test: `test/server/unit/config_writer_Test.php`

**Interfaces:**
- Consumes: classification map (4a); `config_key[]` catalog (`const→path`, `default`); `migration_destination`; `config_scope`.
- Produces: `config_writer::render(array $classification, array $catalog) : string` — a PHP file `<?php return ['dot.path' => value, ...];` containing each CONFIG-destination constant whose migrated literal value differs from the catalog default. Empty overrides → `<?php return [];`.

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/config_writer_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/install/class.migration_destination.php';
require_once dirname(__DIR__, 3) . '/install/class.config_writer.php';

final class config_writer_Test extends TestCase {

	private function catalog() : array {
		return [
			new config_key('db.host', 'DB_HOST_C', 'string', 'localhost', config_scope::STATIC),
			new config_key('img.w',   'IMG_W_C',   'int',    222,        config_scope::STATIC),
		];
	}

	private function entry(mixed $value) : array {
		return ['destination' => migration_destination::CONFIG, 'record' => ['value' => $value, 'raw' => (string) $value, 'kind' => 'literal', 'file' => 'f', 'line' => 1], 'scope' => config_scope::STATIC];
	}

	public function test_emits_only_values_differing_from_catalog_default() : void {
		$classification = [
			'DB_HOST_C' => $this->entry('pg.example.org'), // differs from 'localhost' -> override
			'IMG_W_C'   => $this->entry(222),              // equals default -> skipped
		];
		$content = config_writer::render($classification, $this->catalog());
		$overrides = eval('?>' . $content);
		$this->assertSame(['db.host' => 'pg.example.org'], $overrides);
	}

	public function test_empty_when_all_match_defaults() : void {
		$classification = ['IMG_W_C' => $this->entry(222)];
		$overrides = eval('?>' . config_writer::render($classification, $this->catalog()));
		$this->assertSame([], $overrides);
	}

	public function test_ignores_non_config_and_runtime_values() : void {
		$classification = [
			'DB_HOST_C'   => ['destination' => migration_destination::ENV, 'record' => ['value' => 'x', 'raw' => 'x', 'kind' => 'literal', 'file' => 'f', 'line' => 1], 'scope' => config_scope::SECRET],
			'IMG_W_C'     => ['destination' => migration_destination::CONFIG, 'record' => ['value' => null, 'raw' => 'f()', 'kind' => 'runtime', 'file' => 'f', 'line' => 1], 'scope' => config_scope::STATIC],
		];
		$overrides = eval('?>' . config_writer::render($classification, $this->catalog()));
		$this->assertSame([], $overrides); // ENV ignored; runtime CONFIG not baked
	}
}
```

- [ ] **Step 2: Run it — expect FAIL** (`--filter config_writer_Test`): class not found.

- [ ] **Step 3: Implement**

Create `install/class.config_writer.php`:

```php
<?php declare(strict_types=1);

require_once __DIR__ . '/class.migration_destination.php';

/**
* CONFIG_WRITER
* Renders the per-install config override file (a compiler layer override) from the 4a
* classification: each CONFIG-destination constant whose migrated LITERAL value differs
* from the catalog default, keyed by the catalog dot-path. Returns the PHP file content
* `<?php return ['dot.path' => value, ...];`. Values that equal the default, runtime
* values, and non-CONFIG destinations are omitted (the compiler already seeds defaults).
*/
final class config_writer {

	/**
	* @param array<string,array> $classification migration_classifier::classify() output
	* @param config_key[] $catalog
	*/
	public static function render(array $classification, array $catalog) : string {
		$path_of    = [];
		$default_of = [];
		foreach ($catalog as $key) {
			if ($key->const !== null) {
				$path_of[$key->const]    = $key->path;
				$default_of[$key->const] = $key->default;
			}
		}

		$overrides = [];
		foreach ($classification as $name => $info) {
			if ($info['destination'] !== migration_destination::CONFIG) {
				continue;
			}
			if (($info['record']['kind'] ?? null) !== 'literal') {
				continue; // do not bake runtime values
			}
			if (!isset($path_of[$name])) {
				continue; // CONFIG implies a catalog key; defensive
			}
			$value = $info['record']['value'];
			if ($value === ($default_of[$name] ?? null)) {
				continue; // matches the shipped default — no override needed
			}
			$overrides[$path_of[$name]] = $value;
		}

		ksort($overrides);
		return "<?php declare(strict_types=1);\n\n// Per-install config overrides — generated by the migration.\nreturn " . var_export($overrides, true) . ";\n";
	}//end render
}
```

- [ ] **Step 4: Run it — expect PASS** (`--filter config_writer_Test`, 3 tests).

- [ ] **Step 5: Commit**

```bash
git add install/class.config_writer.php test/server/unit/config_writer_Test.php
git commit -m "feat(install): config_writer — local override file (only values differing from defaults)"
```

---

### Task 3: `state_writer` (`state.php`)

**Files:**
- Create: `install/class.state_writer.php`
- Test: `test/server/unit/state_writer_Test.php`

**Interfaces:**
- Consumes: classification map (4a); `config_key[]` catalog (`const→path`); `migration_destination`; `config_scope`.
- Produces: `state_writer::render(array $classification, array $catalog) : string` — `<?php return ['dot.path' => value, ...];` for every STATE-destination constant with a literal value (incl. `INFO_KEY`/`INFORMATION`), keyed by catalog dot-path.

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/state_writer_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/install/class.migration_destination.php';
require_once dirname(__DIR__, 3) . '/install/class.state_writer.php';

final class state_writer_Test extends TestCase {

	private function catalog() : array {
		return [
			new config_key('state.info_key',     'DEDALO_INFO_KEY',     'string', null, config_scope::STATE),
			new config_key('state.information',   'DEDALO_INFORMATION',  'string', null, config_scope::STATE),
			new config_key('state.install_status','DEDALO_INSTALL_STATUS','string', null, config_scope::STATE),
		];
	}

	private function entry(mixed $value) : array {
		return ['destination' => migration_destination::STATE, 'record' => ['value' => $value, 'raw' => (string) $value, 'kind' => 'literal', 'file' => 'f', 'line' => 1], 'scope' => config_scope::STATE];
	}

	public function test_emits_state_constants_keyed_by_dot_path() : void {
		$classification = [
			'DEDALO_INFO_KEY'     => $this->entry('my_inst'),
			'DEDALO_INFORMATION'  => $this->entry('Dédalo install 7.x'),
			'DEDALO_INSTALL_STATUS' => $this->entry('installed'),
		];
		$state = eval('?>' . state_writer::render($classification, $this->catalog()));
		$this->assertSame('my_inst', $state['state.info_key']);
		$this->assertSame('Dédalo install 7.x', $state['state.information']);
		$this->assertSame('installed', $state['state.install_status']);
	}

	public function test_ignores_non_state_destinations() : void {
		$classification = [
			'DEDALO_INFO_KEY' => $this->entry('k'),
			'OTHER'           => ['destination' => migration_destination::CONFIG, 'record' => ['value' => 'v', 'raw' => 'v', 'kind' => 'literal', 'file' => 'f', 'line' => 1], 'scope' => config_scope::STATIC],
		];
		$state = eval('?>' . state_writer::render($classification, $this->catalog()));
		$this->assertSame(['state.info_key' => 'k'], $state);
	}
}
```

- [ ] **Step 2: Run it — expect FAIL** (`--filter state_writer_Test`): class not found.

- [ ] **Step 3: Implement**

Create `install/class.state_writer.php`:

```php
<?php declare(strict_types=1);

require_once __DIR__ . '/class.migration_destination.php';

/**
* STATE_WRITER
* Renders state.php (machine-written install state) from the 4a classification: every
* STATE-destination constant with a literal value (install fingerprints INFO_KEY /
* INFORMATION, install status, maintenance), keyed by the catalog dot-path. Returns the
* PHP file content `<?php return ['dot.path' => value, ...];`. Non-STATE destinations and
* runtime values are omitted.
*/
final class state_writer {

	/**
	* @param array<string,array> $classification migration_classifier::classify() output
	* @param config_key[] $catalog
	*/
	public static function render(array $classification, array $catalog) : string {
		$path_of = [];
		foreach ($catalog as $key) {
			if ($key->const !== null) {
				$path_of[$key->const] = $key->path;
			}
		}

		$state = [];
		foreach ($classification as $name => $info) {
			if ($info['destination'] !== migration_destination::STATE) {
				continue;
			}
			if (($info['record']['kind'] ?? null) !== 'literal' || !isset($path_of[$name])) {
				continue;
			}
			$state[$path_of[$name]] = $info['record']['value'];
		}

		ksort($state);
		return "<?php declare(strict_types=1);\n\n// Machine-written install state — generated/updated by the migration. Do not hand-edit.\nreturn " . var_export($state, true) . ";\n";
	}//end render
}
```

- [ ] **Step 4: Run it — expect PASS** (`--filter state_writer_Test`, 2 tests).

- [ ] **Step 5: Commit**

```bash
git add install/class.state_writer.php test/server/unit/state_writer_Test.php
git commit -m "feat(install): state_writer — state.php from STATE-scoped constants"
```

---

### Task 4: `passthrough_writer` (verbatim custom defines)

**Files:**
- Create: `install/class.passthrough_writer.php`
- Test: `test/server/unit/passthrough_writer_Test.php`

**Interfaces:**
- Consumes: classification map (4a); `migration_destination`.
- Produces: `passthrough_writer::render(array $classification) : string` — a PHP file that reproduces each PASSTHROUGH-destination constant verbatim as `if (!defined('NAME')) { define('NAME', <raw>); }`, using the extractor's `raw` source text (preserving runtime expressions exactly). Names are emitted in stable (sorted) order.

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/passthrough_writer_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/install/class.migration_destination.php';
require_once dirname(__DIR__, 3) . '/install/class.passthrough_writer.php';

final class passthrough_writer_Test extends TestCase {

	private function pt(string $raw, string $kind = 'literal') : array {
		return ['destination' => migration_destination::PASSTHROUGH, 'record' => ['value' => null, 'raw' => $raw, 'kind' => $kind, 'file' => 'f', 'line' => 1], 'scope' => null];
	}

	public function test_reproduces_passthrough_defines_verbatim_and_guarded() : void {
		$classification = [
			'DEDALO_PATATA' => $this->pt("'potato'"),
			'DEDALO_CORS'   => $this->pt("'*'"),
			'CUSTOM_DIR'    => $this->pt('dirname(__FILE__) . "/x"', 'runtime'), // runtime expr preserved verbatim
		];
		$content = passthrough_writer::render($classification);

		$this->assertStringContainsString("if (!defined('DEDALO_PATATA')) { define('DEDALO_PATATA', 'potato'); }", $content);
		$this->assertStringContainsString("if (!defined('CUSTOM_DIR')) { define('CUSTOM_DIR', dirname(__FILE__) . \"/x\"); }", $content);

		// the produced file is valid PHP and actually defines the literal ones when included
		$tmp = tempnam(sys_get_temp_dir(), 'pt_') . '.php';
		file_put_contents($tmp, $content);
		require $tmp;
		$this->assertSame('potato', DEDALO_PATATA);
		$this->assertSame('*', DEDALO_CORS);
		unlink($tmp);
	}

	public function test_ignores_non_passthrough_destinations() : void {
		$classification = ['X' => ['destination' => migration_destination::ENV, 'record' => ['value' => 's', 'raw' => "'s'", 'kind' => 'literal', 'file' => 'f', 'line' => 1], 'scope' => null]];
		$content = passthrough_writer::render($classification);
		$this->assertStringNotContainsString("define('X'", $content);
	}
}
```

- [ ] **Step 2: Run it — expect FAIL** (`--filter passthrough_writer_Test`): class not found.

- [ ] **Step 3: Implement**

Create `install/class.passthrough_writer.php`:

```php
<?php declare(strict_types=1);

require_once __DIR__ . '/class.migration_destination.php';

/**
* PASSTHROUGH_WRITER
* Reproduces unknown custom defines verbatim (spec §5.10 "preserved verbatim"). For each
* PASSTHROUGH-destination constant it emits a guarded define using the extractor's raw
* source text, so a literal stays a literal and a runtime expression (dirname(...), etc.)
* is preserved exactly. Guarded with !defined() so re-running / double-include is safe.
* Returns the PHP file content (no disk write).
*/
final class passthrough_writer {

	/** @param array<string,array> $classification migration_classifier::classify() output */
	public static function render(array $classification) : string {
		$names = [];
		foreach ($classification as $name => $info) {
			if ($info['destination'] === migration_destination::PASSTHROUGH) {
				$names[$name] = $info['record']['raw'];
			}
		}
		ksort($names);

		$lines = ['<?php declare(strict_types=1);', '', '// Preserved custom defines (unknown to the catalog) — generated verbatim by the migration.'];
		foreach ($names as $name => $raw) {
			$lines[] = "if (!defined('{$name}')) { define('{$name}', {$raw}); }";
		}
		return implode("\n", $lines) . "\n";
	}//end render
}
```

- [ ] **Step 4: Run it — expect PASS** (`--filter passthrough_writer_Test`, 2 tests).

- [ ] **Step 5: Run the full hermetic suite** (`vendor/bin/phpunit -c test/server/phpunit.unit.xml`): all green; report totals (was 211 tests / 2308 assertions; expect +10 tests from Tasks 1–4).

- [ ] **Step 6: Commit**

```bash
git add install/class.passthrough_writer.php test/server/unit/passthrough_writer_Test.php
git commit -m "feat(install): passthrough_writer — preserve unknown custom defines verbatim"
```

---

## Self-Review

**Spec coverage (§5.10 writers):** secret→`.env` (Task 1, salt verbatim, round-trip-verified); Bun `.env` sync via the single-source Appendix B map (Task 1, `env_sync::MAP`); config→typed file as a compiler override, only real diffs (Task 2); state→`state.php` incl. INFO_KEY/INFORMATION (Task 3); unknown→passthrough preserved verbatim (Task 4). Derived/request/user destinations are DROP (4a) — no writer, correct. No disk mutation; atomic commit/backup/dry-run deferred to 4c.

**Placeholder scan:** every step has complete code or an exact command + expected output. Quoting/round-trip are pinned by the `env_loader::parse` test, not assumed.

**Type consistency:** all four writers consume the 4a record shape `['destination'=>migration_destination, 'record'=>['value','raw','kind',...], 'scope'=>?config_scope]` identically (test helpers mirror it). `env_sync::MAP` is `php_key=>bun_key` (verified). `config_writer`/`state_writer` use `config_key->const`/`->path`/`->default`. `var_export` round-trips via `eval('?>' . $content)` in tests.

**Carry-overs to 4c:** target paths (above); atomic write + `chmod 600` on `.env`; timestamped backup of any file overwritten; `--dry-run` printing the per-destination plan (names only, values redacted) — the human review that catches any secret the manifest missed; subprocess boot-diff validation (reuse 3b-3 `boot_diff`) of the assembled new config vs the pre-migration surface; idempotency + schema-versioning; gitignore entries for `config/local/*`, `config/state.php`, `../private/.env`; reconcile Phase-1 `sample.env` (it lists INFO_KEY/INFORMATION, now STATE→`state.php`). The destructive dev-box run stays gated (dry-run + backup + sign-off).
