# Phase 3b-2 — Boot-diff Gate (sample-anchored, hermetic) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove, in a hermetic test, that the new boot pipeline emits exactly the legacy `DEDALO_*` constant surface declared by the canonical sample config files — minus the intentionally-excluded REQUEST/USER set and the live-sourced SECRET/STATE set (spec §5.9).

**Architecture:** A static analyzer (`legacy_surface`) tokenizes the four `sample.config*.php` files with `token_get_all` (never `include`s them — they would open the logger/DB/session, spec §5.10) to recover every top-level `define()` name and its scalar-literal value. A new gate test boots the real 192-key catalog hermetically through `boot_config_phases::phases(...)` with a spy definer, then asserts a clean partition: every legacy constant is either a catalog key or one of 6 justified dead-constant drops; the emitted set is exactly the STATIC∪DERIVED consts; REQUEST/USER are never emitted; SECRET/STATE/DERIVED_REQUEST are absent from the hermetic compile; and every STATIC scalar value matches the sample verbatim.

**Tech Stack:** PHP 8.1+ (`token_get_all`), PHPUnit 13 hermetic unit harness (`test/server/phpunit.unit.xml`). No new runtime/production code paths — purely additive (one analysis tool class + two test files). Zero changes to the live boot path.

## Global Constraints

- **Sample files only.** Read/tokenize ONLY `config/sample.config.php`, `config/sample.config_db.php`, `config/sample.config_areas.php`, `config/sample.config_core.php`. NEVER read, `include`, `cat`, or `grep` the live `config/config.php`, `config/config_db.php`, `config/config_areas.php`, `config/config_core.php` — they contain private dev hacks and are not a canonical reference.
- **Tokenize, never execute.** The sample files pull in the logger, autoloader, and `core_functions`, and call `logged_user_id()` / `setlocale()` — they cannot run standalone (spec §5.10). The surface MUST be recovered statically via `token_get_all`. No `include`/`require`/`eval` of config files anywhere in this phase.
- **Scope contract (spec §5.3 / §5.9):** REQUEST + USER = accessor-only, NEVER emitted as constants. SECRET + STATE + DERIVED_REQUEST = emitted live at boot (env/state/`$_SERVER`), absent from the compiled `$flat`. STATIC + DERIVED = compiled + emitted.
- **Secrets are never value-asserted.** SECRET keys hold placeholder values in samples (`'mypassword'`, salt `'dedalo_six'`); the gate only ever checks SECRET/STATE constant *names*, never values. The salt must not be touched.
- **Verified reconciliation (the source of truth for the allowlists):** 196 active sample `define()`s = **190 catalog consts** + **6 justified drops**; **0** catalog-only; **0** value divergences (all 133 STATIC scalar literals match the catalog defaults exactly). Matched-by-scope: STATIC 133, DERIVED 41, SECRET 7, STATE 4, USER 3, REQUEST 2, DERIVED_REQUEST 0, PASSTHROUGH 0.
- **The 6 drops are dead constants (verified 0 consumers in `core/`, `install/`, `shared/`, `tools/`):** `DEDALO_CONFIG`, `DEDALO_CORE`, `DEDALO_SHARED`, `DEDALO_TOOLS`, `DEDALO_LIB` (v6 path segments inlined into the v7 DERIVED path closures), and `DEDALO_SESSION_SAVE_PATH` (handler-conditional; becomes the session boot phase's job at cutover, P13).
- **Hermetic harness conventions:** test files `test/server/unit/*_Test.php`, `declare(strict_types=1)`, `extends PHPUnit\Framework\TestCase`, global namespace, dependencies loaded by explicit `require_once dirname(__DIR__, 3) . '/...'`, `setUp`/`tearDown` reset `boot::reset()` + `config::reset()`. Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml`.
- **Escalation rule:** if the gate surfaces a legacy constant that is neither a catalog key nor an allowlisted drop, that is a coverage finding — STOP and report it to the controller (add a catalog key or justify a new drop). NEVER silently widen `LEGACY_DROP_ALLOWLIST`.

---

### Task 1: `legacy_surface` static analyzer

A pure tokenizer that extracts the `define()` constant surface from PHP source files without executing them. First consumer: the boot-diff gate (Task 2). Future consumer: the Phase-4 migration tool (`install/migrate_config_v7.php`, spec §5.10), which tokenizes the old config the same way — hence the placement under `install/`.

**Files:**
- Create: `install/class.legacy_surface.php`
- Test: `test/server/unit/legacy_surface_Test.php`
- Test fixtures: written to `test/server/unit/fixtures/` at test time (created on demand, mirrors `process_runner_Test` convention)

**Interfaces:**
- Consumes: nothing (pure PHP `token_get_all`).
- Produces: `legacy_surface::extract(array $files) : array` returning `name => ['kind' => 'literal'|'runtime', 'value' => mixed|null, 'file' => string]`. First definition of a name wins across files (matches PHP's "first `define()` wins" runtime semantics).

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/legacy_surface_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/install/class.legacy_surface.php';

final class legacy_surface_Test extends TestCase {

	private string $dir;

	protected function setUp() : void {
		parent::setUp();
		$this->dir = dirname(__FILE__) . '/fixtures';
		if (!is_dir($this->dir)) {
			mkdir($this->dir, 0755, true);
		}
	}

	private function write(string $name, string $php) : string {
		$path = $this->dir . '/' . $name;
		file_put_contents($path, $php);
		return $path;
	}

	public function test_extracts_scalar_literals_with_values() : void {
		$f = $this->write('ls_literals.php', <<<'PHP'
		<?php
		define('LIT_INT', 222);
		define('LIT_NEG', -5);
		define('LIT_FLOAT', 1.5);
		define('LIT_STR', 'hello');
		define('LIT_BOOL_T', true);
		define('LIT_BOOL_F', false);
		define('LIT_NULL', null);
		PHP);

		$out = legacy_surface::extract([$f]);

		$this->assertSame('literal', $out['LIT_INT']['kind']);
		$this->assertSame(222, $out['LIT_INT']['value']);
		$this->assertSame(-5, $out['LIT_NEG']['value']);
		$this->assertSame(1.5, $out['LIT_FLOAT']['value']);
		$this->assertSame('hello', $out['LIT_STR']['value']);
		$this->assertSame(true, $out['LIT_BOOL_T']['value']);
		$this->assertSame(false, $out['LIT_BOOL_F']['value']);
		$this->assertNull($out['LIT_NULL']['value']);
		$this->assertSame('literal', $out['LIT_NULL']['kind']);
	}

	public function test_classifies_non_literals_as_runtime() : void {
		$f = $this->write('ls_runtime.php', <<<'PHP'
		<?php
		define('LIT_STR', 'x');
		define('RT_CONCAT', 'a' . 'b');
		define('RT_FUNC', strtolower('X'));
		define('RT_CONST_REF', LIT_STR);
		define('RT_ARRAY', ['x', 'y']);
		define('RT_TERNARY', true ? 1 : 2);
		PHP);

		$out = legacy_surface::extract([$f]);

		foreach (['RT_CONCAT', 'RT_FUNC', 'RT_CONST_REF', 'RT_ARRAY', 'RT_TERNARY'] as $name) {
			$this->assertSame('runtime', $out[$name]['kind'], "$name should be runtime");
			$this->assertNull($out[$name]['value'], "$name runtime value must be null");
		}
	}

	public function test_ignores_comments_and_method_calls() : void {
		$f = $this->write('ls_ignore.php', <<<'PHP'
		<?php
		define('REAL', 1);
		// define('COMMENT_LINE', 2);
		# define('COMMENT_HASH', 3);
		/* define('COMMENT_BLOCK', 4); */
		$o = new stdClass();
		$o->define('METHOD_CALL', 5);
		PHP);

		$out = legacy_surface::extract([$f]);

		$this->assertArrayHasKey('REAL', $out);
		$this->assertArrayNotHasKey('COMMENT_LINE', $out);
		$this->assertArrayNotHasKey('COMMENT_HASH', $out);
		$this->assertArrayNotHasKey('COMMENT_BLOCK', $out);
		$this->assertArrayNotHasKey('METHOD_CALL', $out);
	}

	public function test_first_definition_wins_across_files() : void {
		$a = $this->write('ls_a.php', "<?php\ndefine('DUP', 'from_a');\n");
		$b = $this->write('ls_b.php', "<?php\ndefine('DUP', 'from_b');\n");

		$out = legacy_surface::extract([$a, $b]);

		$this->assertSame('from_a', $out['DUP']['value']);
		$this->assertSame($a, $out['DUP']['file']);
	}

	public function test_records_source_file() : void {
		$f = $this->write('ls_file.php', "<?php\ndefine('ONLY', 7);\n");
		$out = legacy_surface::extract([$f]);
		$this->assertSame($f, $out['ONLY']['file']);
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter legacy_surface_Test`
Expected: FAIL — `Failed opening required '.../install/class.legacy_surface.php'` (class does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `install/class.legacy_surface.php`:

```php
<?php declare(strict_types=1);

/**
* LEGACY_SURFACE
* Static analyzer that recovers the top-level define() constant surface of a set of
* PHP files WITHOUT executing them. The v6 config files — and even the
* sample.config*.php templates — cannot be include()d in isolation: they pull in the
* logger, the autoloader and core_functions, start a session and call setlocale
* (spec §5.10). Tokenizing with token_get_all is the only safe way to read their
* constant surface, and it is the same technique the Phase-4 migration tool
* (install/migrate_config_v7.php) will use.
*
* First consumer: the boot-diff gate (test/server/unit/boot_diff_gate_Test.php).
*/
final class legacy_surface {

	/**
	* EXTRACT
	* @param string[] $files absolute paths to PHP files to scan
	* @return array<string,array{kind:string,value:mixed,file:string}>
	*         name => ['kind'=>'literal'|'runtime', 'value'=>mixed|null, 'file'=>string].
	*         A name's FIRST definition wins (matches PHP's first-define()-wins runtime).
	*/
	public static function extract(array $files) : array {
		$out = [];
		foreach ($files as $file) {
			$src = file_get_contents($file);
			if ($src === false) {
				throw new \RuntimeException("legacy_surface: cannot read {$file}");
			}
			foreach (self::scan($src, $file) as $name => $info) {
				if (!array_key_exists($name, $out)) {
					$out[$name] = $info; // first definition wins
				}
			}
		}
		return $out;
	}//end extract

	/**
	* SCAN one file's source for top-level define('NAME', VALUE) calls.
	* @return array<string,array{kind:string,value:mixed,file:string}>
	*/
	private static function scan(string $src, string $file) : array {
		$tokens = token_get_all($src);
		$n = count($tokens);
		$found = [];

		for ($i = 0; $i < $n; $i++) {
			$t = $tokens[$i];
			if (!is_array($t) || $t[0] !== T_STRING || strtolower($t[1]) !== 'define') {
				continue;
			}
			// reject method/static calls and function declarations: $o->define(), C::define(), function define()
			$prev = self::prev_meaningful($tokens, $i);
			if (is_array($prev) && in_array($prev[0], [
				T_OBJECT_OPERATOR, T_DOUBLE_COLON, T_NULLSAFE_OBJECT_OPERATOR, T_FUNCTION,
			], true)) {
				continue;
			}
			$open = self::next_meaningful_index($tokens, $i);
			if ($open === null || $tokens[$open] !== '(') {
				continue;
			}
			$name_idx = self::next_meaningful_index($tokens, $open);
			if ($name_idx === null
				|| !is_array($tokens[$name_idx])
				|| $tokens[$name_idx][0] !== T_CONSTANT_ENCAPSED_STRING) {
				continue; // dynamic define name — not part of the static surface
			}
			$name = self::unquote($tokens[$name_idx][1]);
			$comma = self::next_meaningful_index($tokens, $name_idx);
			if ($comma === null || $tokens[$comma] !== ',') {
				continue;
			}
			[$value_tokens, $end] = self::collect_value($tokens, $comma + 1);
			$found[$name] = self::classify($value_tokens) + ['file' => $file];
			$i = $end; // resume after this define()'s closing paren
		}
		return $found;
	}//end scan

	/**
	* COLLECT_VALUE — gather the tokens of the value argument up to define()'s closing ')'.
	* @return array{0:array<int,array|string>,1:int} [value tokens, index of closing paren]
	*/
	private static function collect_value(array $tokens, int $start) : array {
		$depth = 1; // already inside define( ... )
		$collected = [];
		$n = count($tokens);
		for ($i = $start; $i < $n; $i++) {
			$t = $tokens[$i];
			if (!is_array($t)) {
				if ($t === '(' || $t === '[') {
					$depth++;
				} elseif ($t === ')' || $t === ']') {
					$depth--;
					if ($depth === 0) {
						return [$collected, $i];
					}
				}
			}
			$collected[] = $t;
		}
		return [$collected, $n - 1]; // unbalanced — defensive
	}//end collect_value

	/**
	* CLASSIFY — a single scalar literal (with an optional leading +/- on a number)
	* is a 'literal' with its parsed value; anything else is 'runtime'.
	* @return array{kind:string,value:mixed}
	*/
	private static function classify(array $value_tokens) : array {
		$meaningful = array_values(array_filter($value_tokens, static function ($t) : bool {
			if (is_array($t)) {
				return !in_array($t[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true);
			}
			return true;
		}));

		// optional single leading +/- before a numeric literal
		if (count($meaningful) === 2
			&& !is_array($meaningful[0])
			&& ($meaningful[0] === '-' || $meaningful[0] === '+')
			&& is_array($meaningful[1])
			&& in_array($meaningful[1][0], [T_LNUMBER, T_DNUMBER], true)) {
			$num = $meaningful[1][0] === T_LNUMBER ? (int) $meaningful[1][1] : (float) $meaningful[1][1];
			return ['kind' => 'literal', 'value' => $meaningful[0] === '-' ? -$num : $num];
		}

		if (count($meaningful) === 1 && is_array($meaningful[0])) {
			$tok = $meaningful[0];
			switch ($tok[0]) {
				case T_CONSTANT_ENCAPSED_STRING:
					return ['kind' => 'literal', 'value' => self::unquote($tok[1])];
				case T_LNUMBER:
					return ['kind' => 'literal', 'value' => (int) $tok[1]];
				case T_DNUMBER:
					return ['kind' => 'literal', 'value' => (float) $tok[1]];
				case T_STRING:
					$low = strtolower($tok[1]);
					if ($low === 'true')  { return ['kind' => 'literal', 'value' => true]; }
					if ($low === 'false') { return ['kind' => 'literal', 'value' => false]; }
					if ($low === 'null')  { return ['kind' => 'literal', 'value' => null]; }
					break; // bare constant ref → runtime
			}
		}
		return ['kind' => 'runtime', 'value' => null];
	}//end classify

	/** UNQUOTE a T_CONSTANT_ENCAPSED_STRING literal to its PHP string value. */
	private static function unquote(string $raw) : string {
		$quote = $raw[0];
		$inner = substr($raw, 1, -1);
		if ($quote === "'") {
			return str_replace(['\\\\', "\\'"], ['\\', "'"], $inner);
		}
		return stripcslashes($inner); // double-quoted: \n \t \\ \" etc.
	}//end unquote

	private static function next_meaningful_index(array $tokens, int $from) : ?int {
		$n = count($tokens);
		for ($i = $from + 1; $i < $n; $i++) {
			$t = $tokens[$i];
			if (is_array($t) && in_array($t[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
				continue;
			}
			return $i;
		}
		return null;
	}//end next_meaningful_index

	/** @return array|string|null the previous non-whitespace, non-comment token */
	private static function prev_meaningful(array $tokens, int $from) {
		for ($i = $from - 1; $i >= 0; $i--) {
			$t = $tokens[$i];
			if (is_array($t) && in_array($t[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
				continue;
			}
			return $t;
		}
		return null;
	}//end prev_meaningful
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter legacy_surface_Test`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add install/class.legacy_surface.php test/server/unit/legacy_surface_Test.php
git commit -m "feat(config): legacy_surface tokenizer — static define() surface extractor"
```

---

### Task 2: The boot-diff gate

The keystone. Boots the real catalog hermetically and asserts the new pipeline's emitted constant surface is exactly the legacy sample surface, minus the documented exclusions. No production code changes — this task adds only the gate test.

**Files:**
- Create: `test/server/unit/boot_diff_gate_Test.php`

**Interfaces:**
- Consumes: `legacy_surface::extract(string[]) : array` (Task 1); the real catalog via `require '.../core/base/config/catalog/catalog.php'` → `config_key[]`; `boot_config_phases::phases(array $catalog, array $overrides, ?callable $definer) : boot_phase[]`; `compat_shim::emit` (indirectly, via the spy definer it calls as `fn(string $name, mixed $value): void`); `config_scope` enum cases; `boot::run(entrypoint_profile, boot_phase[])`, `boot::state()`, `boot::reset()`, `config::reset()`.
- Produces: nothing consumed downstream — it is a permanent CI gate.

- [ ] **Step 1: Write the gate test (it fails until all assertions hold)**

Create `test/server/unit/boot_diff_gate_Test.php`:

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
require_once dirname(__DIR__, 3) . '/install/class.legacy_surface.php';

/**
* BOOT-DIFF GATE (spec §5.9)
* Proves the new boot pipeline emits exactly the legacy DEDALO_* surface declared by
* the canonical sample config files, minus the intentionally-excluded REQUEST/USER
* accessor-only set and the live-sourced SECRET/STATE/DERIVED_REQUEST set.
*/
final class boot_diff_gate_Test extends TestCase {

	/** the four canonical legacy reference files — templates, never the live config */
	private const SAMPLE_FILES = [
		'config/sample.config.php',
		'config/sample.config_db.php',
		'config/sample.config_areas.php',
		'config/sample.config_core.php',
	];

	/**
	* Legacy define()s v7 intentionally does NOT reproduce as constants. Each is dead
	* (0 consumers in core/install/shared/tools — verified). If a NEW unmatched legacy
	* constant appears, test_every_legacy_constant_is_classified fails by design:
	* classify it (add a catalog key or justify a drop), never silently widen this list.
	*/
	private const LEGACY_DROP_ALLOWLIST = [
		'DEDALO_CONFIG' => 'v6 path segment "config" — inlined into paths.* DERIVED closures; 0 consumers',
		'DEDALO_CORE'   => 'v6 path segment "core" — inlined into paths.* DERIVED closures; 0 consumers',
		'DEDALO_SHARED' => 'v6 path segment "shared" — inlined into paths.* DERIVED closures; 0 consumers',
		'DEDALO_TOOLS'  => 'v6 path segment "tools" — inlined into paths.* DERIVED closures; 0 consumers',
		'DEDALO_LIB'    => 'v6 path segment "lib" — inlined into paths.* DERIVED closures; 0 consumers',
		'DEDALO_SESSION_SAVE_PATH' => 'handler-conditional; applied by the session boot phase at cutover (P13); 0 consumers',
	];

	/**
	* Catalog consts present in v7 but absent from the legacy sample surface. Empty
	* today (reconciliation: 0 catalog-only). A genuinely new v7 setting would be listed
	* here with a justification; until then the gate asserts this stays empty.
	*/
	private const CATALOG_ONLY_ALLOWLIST = [];

	protected function setUp() : void { parent::setUp(); boot::reset(); config::reset(); }
	protected function tearDown() : void { boot::reset(); config::reset(); }

	private function repo_root() : string { return dirname(__DIR__, 3); }

	/** @return config_key[] the real 192-key catalog */
	private function catalog() : array {
		return require $this->repo_root() . '/core/base/config/catalog/catalog.php';
	}

	/** @return array<string,array{kind:string,value:mixed,file:string}> */
	private function legacy_surface() : array {
		$files = array_map(fn(string $f) : string => $this->repo_root() . '/' . $f, self::SAMPLE_FILES);
		return legacy_surface::extract($files);
	}

	/** @return array<string,mixed> emitted constant name => value, from one hermetic boot */
	private function emitted() : array {
		$recorded = [];
		$spy = static function (string $name, mixed $value) use (&$recorded) : void {
			$recorded[$name] = $value;
		};
		boot::run(entrypoint_profile::TEST, boot_config_phases::phases($this->catalog(), [], $spy));
		$this->assertSame(boot_state::READY, boot::state(), 'hermetic boot must reach READY');
		return $recorded;
	}

	/** @return array<string,config_scope> const name => scope, for every key with a const */
	private function const_scopes() : array {
		$map = [];
		foreach ($this->catalog() as $key) {
			if ($key->const !== null) {
				$map[$key->const] = $key->scope;
			}
		}
		return $map;
	}

	public function test_legacy_surface_is_substantial() : void {
		$this->assertGreaterThan(180, count($this->legacy_surface()),
			'expected ~196 legacy defines; a much smaller count means the tokenizer or sample files broke');
	}

	public function test_every_legacy_constant_is_classified() : void {
		$surface = array_keys($this->legacy_surface());
		$cat     = array_keys($this->const_scopes());
		$allow   = array_keys(self::LEGACY_DROP_ALLOWLIST);

		$unclassified = array_values(array_diff($surface, $cat, $allow));
		$this->assertSame([], $unclassified,
			'legacy constants with no catalog key and not in the drop allowlist: '
			. implode(', ', $unclassified)
			. ' — add a catalog key or justify a drop; never leave a legacy constant unaccounted for');
	}

	public function test_no_catalog_const_absent_from_legacy_surface() : void {
		$surface = array_keys($this->legacy_surface());
		$cat     = array_keys($this->const_scopes());
		$allow   = array_keys(self::CATALOG_ONLY_ALLOWLIST);

		$catalog_only = array_values(array_diff($cat, $surface, $allow));
		$this->assertSame([], $catalog_only,
			'catalog consts not present in the legacy sample surface: ' . implode(', ', $catalog_only)
			. ' — regenerate the samples or add to CATALOG_ONLY_ALLOWLIST with justification');
	}

	public function test_drop_allowlist_entries_all_exist_in_legacy_surface() : void {
		$surface = array_keys($this->legacy_surface());
		foreach (array_keys(self::LEGACY_DROP_ALLOWLIST) as $dropped) {
			$this->assertContains($dropped, $surface,
				"drop-allowlisted '{$dropped}' is no longer defined in the samples — remove the stale allowlist entry");
		}
	}

	public function test_emitted_surface_is_exactly_static_and_derived_consts() : void {
		$expected = [];
		foreach ($this->const_scopes() as $const => $scope) {
			if ($scope === config_scope::STATIC || $scope === config_scope::DERIVED) {
				$expected[] = $const;
			}
		}
		$emitted = array_keys($this->emitted());
		sort($expected);
		sort($emitted);
		$this->assertSame($expected, $emitted,
			'the hermetic compat-shim must emit exactly the STATIC+DERIVED legacy constants — no more, no less');
	}

	public function test_request_and_user_scoped_constants_are_never_emitted() : void {
		$scopes  = $this->const_scopes();
		$emitted = $this->emitted();
		foreach ($scopes as $const => $scope) {
			if ($scope === config_scope::REQUEST || $scope === config_scope::USER) {
				$this->assertArrayNotHasKey($const, $emitted,
					"{$const} is accessor-only (REQUEST/USER) and must never be a process constant (worker cross-user leak)");
			}
		}
	}

	public function test_secret_state_and_derived_request_constants_are_not_in_the_hermetic_compile() : void {
		$scopes  = $this->const_scopes();
		$emitted = $this->emitted();
		foreach ($scopes as $const => $scope) {
			if ($scope === config_scope::SECRET
				|| $scope === config_scope::STATE
				|| $scope === config_scope::DERIVED_REQUEST) {
				$this->assertArrayNotHasKey($const, $emitted,
					"{$const} is live-sourced ({$scope->value}); it must come from env/state/\$_SERVER at cutover, never the compiled artifact");
			}
		}
	}

	public function test_static_constant_values_match_the_canonical_samples() : void {
		$surface = $this->legacy_surface();
		$scopes  = $this->const_scopes();
		$emitted = $this->emitted();

		$checked = 0;
		foreach ($scopes as $const => $scope) {
			if ($scope !== config_scope::STATIC) {
				continue;
			}
			if (!isset($surface[$const]) || $surface[$const]['kind'] !== 'literal') {
				continue; // list/map/derived defaults are not single scalar literals
			}
			$this->assertArrayHasKey($const, $emitted, "{$const} (STATIC) must be emitted");
			$this->assertSame($surface[$const]['value'], $emitted[$const],
				"emitted {$const} must equal its canonical sample value");
			$checked++;
		}
		$this->assertGreaterThan(100, $checked,
			'expected ~133 STATIC scalar literals cross-checked against the samples');
	}
}
```

- [ ] **Step 2: Run the gate**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter boot_diff_gate_Test`
Expected: PASS (8 tests). If `test_every_legacy_constant_is_classified` or `test_no_catalog_const_absent_from_legacy_surface` fails, the failure message names the offending constant(s) — STOP and report to the controller (this is a real coverage finding: add a catalog key or justify a drop). Do NOT widen the allowlists to make the test green without controller sign-off.

- [ ] **Step 3: Run the full hermetic suite (no regressions)**

Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml`
Expected: all green. Report the new totals (was 177 tests / 1946 assertions; expect +13 tests from Tasks 1–2).

- [ ] **Step 4: Commit**

```bash
git add test/server/unit/boot_diff_gate_Test.php
git commit -m "test(config): boot-diff gate — new pipeline emits exactly the legacy sample surface (spec §5.9)"
```

---

## Self-Review

**Spec coverage (§5.9):** the gate proves the shim emits exactly the legacy surface minus the excluded request/user set — realized by `test_emitted_surface_is_exactly_static_and_derived_consts` (parity), `test_request_and_user_scoped_constants_are_never_emitted` (exclusions), and `test_secret_state_and_derived_request_constants_are_not_in_the_hermetic_compile` (live-sourced absence). The "diff against the old surface" is realized by tokenizing the samples (spec §5.10 technique) rather than booting them, because the samples cannot run standalone — documented in Global Constraints. The permanent full-install boot-diff (booting a provisioned v6 install with a DB in CI) remains a cutover/CI-infra carry-over; this hermetic, sample-anchored gate is its DB-free proxy and the one buildable now.

**Placeholder scan:** every step has complete code or an exact command + expected output. No TBDs. The two allowlists are concrete (6 named drops with justifications; catalog-only empty by design).

**Type consistency:** `legacy_surface::extract()` shape (`['kind','value','file']`) is produced in Task 1 and consumed identically in Task 2. `config_scope` cases (`STATIC`, `DERIVED`, `DERIVED_REQUEST`, `REQUEST`, `USER`, `SECRET`, `STATE`) match the enum. `boot_config_phases::phases(catalog, overrides, definer)` and the spy signature `fn(string,mixed):void` match `compat_shim::emit`'s definer contract. Catalog loads via `require` returning `config_key[]`; `$key->const` / `$key->scope` are the real readonly fields.

**Carry-overs recorded for the cutover (3b-3):** (1) the full boot-diff against a real installed v6 config (with DB) is CI-infra, deferred; (2) `DEDALO_SESSION_SAVE_PATH`'s handler switch must be reproduced by the session boot phase (P13); (3) the 5 path-segment drops are safe only while unconsumed — the gate enforces this permanently.
