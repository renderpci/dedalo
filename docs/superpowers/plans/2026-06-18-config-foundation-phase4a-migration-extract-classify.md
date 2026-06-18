# Phase 4a — Migration tool: extraction + classification core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation of the v6→v7 config migration (spec §5.10): a tokenizer-based extractor that statically recovers the active `define()`s of an old config (resolving literal/concat/cross-ref values, marking runtime values, preserving verbatim source) and a classifier that routes each constant to a destination (`.env` / `state.php` / typed config / drop / passthrough) using the catalog scopes plus a secret manifest.

**Architecture:** Three pure, hermetic units under `install/`: `migration_extractor` (token_get_all, never executes the old files), a `migration_destination` enum + `constant_map` secret manifest, and `migration_classifier` (catalog-scope-driven routing with a manifest fallback). All tested against *fixture* configs — never the live `config/config.php`. No writers and no CLI here (those are Phases 4b/4c); this phase only produces in-memory classification.

**Tech Stack:** PHP 8.1+ (`token_get_all`), PHPUnit 13 hermetic harness. Reuses the catalog (`config_key[]` via `require`) and `config_scope`. Independent of `legacy_surface` (different semantics — value resolution, raw-text capture — so a focused standalone extractor, not a refactor of the gate's tokenizer).

## Global Constraints

- **Never read or execute `config/config.php` (or `config_db/areas/core.php`).** The extractor tokenizes files given to it; tests use fixture configs only. The old files must never be `include`d (they open sessions / the `activity://` logger / setlocale — spec §5.10).
- **Preserve the salt verbatim.** `DEDALO_SALT_STRING` is classified SECRET → `.env`; its value is carried as an opaque string, never transformed, never regenerated.
- **Preserve all unknown custom defines.** A constant not in the catalog and not a known secret is routed to `PASSTHROUGH` and carries its verbatim source `raw` text — never dropped, never altered.
- **Secrets never leak to a tracked file.** Classification is safe-by-default: a non-catalog constant whose name matches the secret manifest OR a credential pattern routes to `.env` (`ENV`), not `PASSTHROUGH`. Over-classifying to ENV is acceptable; under-classifying is not.
- **Do not bake runtime values.** Values derived from `$_SERVER`, `dirname()`, function calls (`fix_cascade_config_var`, etc.), or unresolved constant refs are marked `kind = 'runtime'` (value `null`); only the verbatim `raw` text is retained.
- **Scope boundary (deliberate):** 4a captures ACTIVE defines only. Commented-out defines are NOT parsed (the migration's timestamped backup preserves the original file). Writers, `.env`/`state.php`/config emission, the CLI, `--dry-run`, boot-diff validation, atomic commit + backup, Bun sync, idempotency, and schema-versioning are Phases 4b/4c.
- **Catalog-driven classification:** known constants (`config_key->const`) route by `config_scope`: SECRET→ENV, STATE→STATE, STATIC→CONFIG, DERIVED/DERIVED_REQUEST/REQUEST/USER→DROP, PASSTHROUGH→PASSTHROUGH.
- **Hermetic harness conventions:** `test/server/unit/*_Test.php`, `declare(strict_types=1)`, `extends PHPUnit\Framework\TestCase`, global namespace, deps via `require_once dirname(__DIR__, 3) . '/...'`. Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml`.
- **Real-install reference (from the 3b-3 live boot-diff):** the dev box's unknown defines include genuine secrets — `GEONAMES_ACCOUNT_USERNAME`, `DEDALO_RECOVERY_KEY`, `MAILER_CONFIG`, `SAML_CONFIG`, `SOCRATA_CONFIG` — which must route to ENV. Spec Appendix A secrets: `DEDALO_PASSWORD_CONN`, `MYSQL_DEDALO_PASSWORD_CONN`, `DEDALO_SALT_STRING`, `DEDALO_DIFFUSION_INTERNAL_TOKEN`, `API_WEB_USER_CODE_MULTIPLE`, `ONTOLOGY_SERVERS`, `CODE_SERVERS`, `GEONAMES_ACCOUNT_USERNAME`, SAML keys (the catalog already scopes the first seven as SECRET; the rest are unknowns handled by the manifest).

## File Structure
- Create `install/class.migration_extractor.php` — the tokenizer/value-resolver (Task 1).
- Create `install/class.migration_destination.php` — the destination enum (Task 2).
- Create `install/class.constant_map.php` — the secret manifest for non-catalog constants (Task 2).
- Create `install/class.migration_classifier.php` — the router (Task 3).
- Tests: `test/server/unit/migration_extractor_Test.php` (T1), `test/server/unit/migration_classifier_Test.php` (T3, also covers the enum + manifest).

---

### Task 1: `migration_extractor`

**Files:**
- Create: `install/class.migration_extractor.php`
- Test: `test/server/unit/migration_extractor_Test.php` (writes fixtures into `test/server/unit/fixtures/`)

**Interfaces:**
- Consumes: nothing (pure `token_get_all`).
- Produces: `migration_extractor::extract(array $files) : array` → `name => ['value'=>scalar|null, 'raw'=>string, 'kind'=>'literal'|'runtime', 'file'=>string, 'line'=>int]`. Files are processed in order; a literal-valued symbol table persists across them so a later define can reference an earlier literal const. First ACTIVE definition of a name wins.

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/migration_extractor_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/install/class.migration_extractor.php';

final class migration_extractor_Test extends TestCase {

	private string $dir;

	protected function setUp() : void {
		parent::setUp();
		$this->dir = dirname(__FILE__) . '/fixtures';
		if (!is_dir($this->dir)) { mkdir($this->dir, 0755, true); }
	}

	private function write(string $name, string $php) : string {
		$path = $this->dir . '/' . $name;
		file_put_contents($path, $php);
		return $path;
	}

	public function test_resolves_scalar_literals() : void {
		$f = $this->write('me_lit.php', <<<'PHP'
		<?php
		define('M_INT', 5);
		define('M_NEG', -3);
		define('M_STR', 'hello');
		define('M_BOOL', true);
		define('M_NULL', null);
		PHP);
		$out = migration_extractor::extract([$f]);
		$this->assertSame('literal', $out['M_INT']['kind']);
		$this->assertSame(5, $out['M_INT']['value']);
		$this->assertSame(-3, $out['M_NEG']['value']);
		$this->assertSame('hello', $out['M_STR']['value']);
		$this->assertSame(true, $out['M_BOOL']['value']);
		$this->assertNull($out['M_NULL']['value']);
		$this->assertSame('literal', $out['M_NULL']['kind']);
	}

	public function test_folds_literal_concatenation() : void {
		$f = $this->write('me_concat.php', "<?php\ndefine('M_PATH', 'a' . '/' . 'b');\n");
		$out = migration_extractor::extract([$f]);
		$this->assertSame('literal', $out['M_PATH']['kind']);
		$this->assertSame('a/b', $out['M_PATH']['value']);
	}

	public function test_resolves_cross_reference_to_earlier_literal() : void {
		// INFO_KEY = ENTITY pattern (string ref to a previously defined literal const)
		$f = $this->write('me_ref.php', "<?php\ndefine('M_ENTITY', 'my_inst');\ndefine('M_INFO_KEY', M_ENTITY);\n");
		$out = migration_extractor::extract([$f]);
		$this->assertSame('literal', $out['M_INFO_KEY']['kind']);
		$this->assertSame('my_inst', $out['M_INFO_KEY']['value']);
	}

	public function test_marks_runtime_values_and_keeps_raw() : void {
		$f = $this->write('me_rt.php', <<<'PHP'
		<?php
		define('M_HOST', $_SERVER['HTTP_HOST']);
		define('M_ROOT', dirname(__FILE__, 2));
		define('M_LANG', fix_cascade_config_var('x', 'lg-eng'));
		define('M_ARR', ['a', 'b']);
		define('M_UNRESOLVED', SOME_UNKNOWN_CONST);
		PHP);
		$out = migration_extractor::extract([$f]);
		foreach (['M_HOST', 'M_ROOT', 'M_LANG', 'M_ARR', 'M_UNRESOLVED'] as $name) {
			$this->assertSame('runtime', $out[$name]['kind'], "$name should be runtime");
			$this->assertNull($out[$name]['value'], "$name value must be null");
		}
		// verbatim source preserved for passthrough
		$this->assertSame("['a', 'b']", $out['M_ARR']['raw']);
		$this->assertSame('dirname(__FILE__, 2)', $out['M_ROOT']['raw']);
	}

	public function test_first_active_definition_wins_and_records_line_and_file() : void {
		$f = $this->write('me_dup.php', "<?php\ndefine('M_DUP', 'first');\ndefine('M_DUP', 'second');\n");
		$out = migration_extractor::extract([$f]);
		$this->assertSame('first', $out['M_DUP']['value']);
		$this->assertSame($f, $out['M_DUP']['file']);
		$this->assertSame(2, $out['M_DUP']['line']);
	}

	public function test_ignores_commented_and_method_call_defines() : void {
		$f = $this->write('me_ignore.php', <<<'PHP'
		<?php
		define('M_REAL', 1);
		// define('M_LINE', 2);
		/* define('M_BLOCK', 3); */
		$o = new stdClass();
		$o->define('M_METHOD', 4);
		PHP);
		$out = migration_extractor::extract([$f]);
		$this->assertArrayHasKey('M_REAL', $out);
		$this->assertArrayNotHasKey('M_LINE', $out);
		$this->assertArrayNotHasKey('M_BLOCK', $out);
		$this->assertArrayNotHasKey('M_METHOD', $out);
	}

	public function test_symbol_table_persists_across_files_in_order() : void {
		$a = $this->write('me_a.php', "<?php\ndefine('M_BASE', '/srv');\n");
		$b = $this->write('me_b.php', "<?php\ndefine('M_SUB', M_BASE . '/data');\n");
		$out = migration_extractor::extract([$a, $b]);
		$this->assertSame('literal', $out['M_SUB']['kind']);
		$this->assertSame('/srv/data', $out['M_SUB']['value']);
	}
}
```

- [ ] **Step 2: Run it — expect FAIL** (`vendor/bin/phpunit -c test/server/phpunit.unit.xml --filter migration_extractor_Test`): class not found.

- [ ] **Step 3: Implement**

Create `install/class.migration_extractor.php`:

```php
<?php declare(strict_types=1);

/**
* MIGRATION_EXTRACTOR
* Tokenizer-based static extractor for the v6→v7 config migration (spec §5.10). Recovers
* every ACTIVE top-level define('NAME', <value>) in the given files WITHOUT executing them.
* Per constant it records: a resolved scalar value when the value is a literal (or a
* concatenation / cross-reference that folds to one); the verbatim source text of the
* value expression (for verbatim PASSTHROUGH preservation); and 'kind' = 'runtime' for
* values built from $_SERVER / dirname() / function calls / unresolved refs (value null —
* must not be baked). A running symbol table of literal values lets a later define reuse an
* earlier literal const (e.g. INFO_KEY = ENTITY). First ACTIVE definition of a name wins.
*
* Commented-out defines are intentionally NOT captured (the migration keeps a timestamped
* backup of the original file). Standalone from legacy_surface — different semantics.
*/
final class migration_extractor {

	/**
	* @param string[] $files absolute paths, processed in order (symbol table persists across them)
	* @return array<string,array{value:mixed,raw:string,kind:string,file:string,line:int}>
	*/
	public static function extract(array $files) : array {
		$out = [];
		$symbols = []; // const name => resolved scalar value (literals only)
		foreach ($files as $file) {
			$src = file_get_contents($file);
			if ($src === false) {
				throw new \RuntimeException("migration_extractor: cannot read {$file}");
			}
			self::scan($src, $file, $out, $symbols);
		}
		return $out;
	}//end extract

	private static function scan(string $src, string $file, array &$out, array &$symbols) : void {
		$tokens = token_get_all($src);
		$n = count($tokens);
		for ($i = 0; $i < $n; $i++) {
			$t = $tokens[$i];
			if (!is_array($t) || !self::is_define($t)) {
				continue;
			}
			$prev = self::prev_meaningful($tokens, $i);
			if (is_array($prev) && in_array($prev[0], [T_OBJECT_OPERATOR, T_DOUBLE_COLON, T_NULLSAFE_OBJECT_OPERATOR, T_FUNCTION], true)) {
				continue;
			}
			$open = self::next_meaningful($tokens, $i);
			if ($open === null || $tokens[$open] !== '(') {
				continue;
			}
			$name_idx = self::next_meaningful($tokens, $open);
			if ($name_idx === null || !is_array($tokens[$name_idx]) || $tokens[$name_idx][0] !== T_CONSTANT_ENCAPSED_STRING) {
				continue;
			}
			$name = self::unquote($tokens[$name_idx][1]);
			$line = $tokens[$name_idx][2];
			$comma = self::next_meaningful($tokens, $name_idx);
			if ($comma === null || $tokens[$comma] !== ',') {
				continue;
			}
			[$value_tokens, $end] = self::collect_value($tokens, $comma + 1);
			$i = $end;
			if (array_key_exists($name, $out)) {
				continue; // first active definition wins
			}
			[$kind, $value] = self::resolve($value_tokens, $symbols);
			$out[$name] = [
				'value' => $value,
				'raw'   => trim(self::raw_text($value_tokens)),
				'kind'  => $kind,
				'file'  => $file,
				'line'  => $line,
			];
			if ($kind === 'literal') {
				$symbols[$name] = $value;
			}
		}
	}//end scan

	/** @return array{0:string,1:mixed} [kind, value] */
	private static function resolve(array $value_tokens, array $symbols) : array {
		$mean = array_values(array_filter($value_tokens, static function ($t) : bool {
			return !(is_array($t) && in_array($t[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true));
		}));
		if ($mean === []) {
			return ['runtime', null];
		}
		// optional leading +/- on a numeric literal
		if (count($mean) === 2 && !is_array($mean[0]) && ($mean[0] === '-' || $mean[0] === '+')
			&& is_array($mean[1]) && in_array($mean[1][0], [T_LNUMBER, T_DNUMBER], true)) {
			$num = $mean[1][0] === T_LNUMBER ? (int) $mean[1][1] : (float) $mean[1][1];
			return ['literal', $mean[0] === '-' ? -$num : $num];
		}
		if (count($mean) === 1) {
			return self::scalar_token($mean[0], $symbols);
		}
		// concatenation: operand ('.' operand)*  — operands at even indices, '.' at odd
		$parts = [];
		foreach ($mean as $idx => $tok) {
			if ($idx % 2 === 1) {
				if ($tok === '.') {
					continue;
				}
				return ['runtime', null];
			}
			[$k, $v] = self::scalar_token($tok, $symbols);
			if ($k !== 'literal' || is_bool($v) || $v === null || !is_scalar($v)) {
				return ['runtime', null];
			}
			$parts[] = (string) $v;
		}
		return ['literal', implode('', $parts)];
	}//end resolve

	/** @return array{0:string,1:mixed} a single value token → [kind, value] */
	private static function scalar_token($tok, array $symbols) : array {
		if (!is_array($tok)) {
			return ['runtime', null];
		}
		switch ($tok[0]) {
			case T_CONSTANT_ENCAPSED_STRING:
				return ['literal', self::unquote($tok[1])];
			case T_LNUMBER:
				return ['literal', (int) $tok[1]];
			case T_DNUMBER:
				return ['literal', (float) $tok[1]];
			case T_STRING:
				$low = strtolower($tok[1]);
				if ($low === 'true')  { return ['literal', true]; }
				if ($low === 'false') { return ['literal', false]; }
				if ($low === 'null')  { return ['literal', null]; }
				if (array_key_exists($tok[1], $symbols)) {
					return ['literal', $symbols[$tok[1]]]; // cross-ref to an earlier literal const
				}
				return ['runtime', null];
		}
		return ['runtime', null];
	}//end scalar_token

	private static function raw_text(array $value_tokens) : string {
		$s = '';
		foreach ($value_tokens as $t) {
			$s .= is_array($t) ? $t[1] : $t;
		}
		return $s;
	}//end raw_text

	private static function is_define(array $token) : bool {
		if ($token[0] === T_STRING) {
			return strtolower($token[1]) === 'define';
		}
		if ($token[0] === T_NAME_FULLY_QUALIFIED) {
			return strtolower($token[1]) === '\\define';
		}
		return false;
	}//end is_define

	/** @return array{0:array<int,array|string>,1:int} [value tokens, index of define()'s closing paren] */
	private static function collect_value(array $tokens, int $start) : array {
		$depth = 1;
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
		return [$collected, $n - 1];
	}//end collect_value

	private static function unquote(string $raw) : string {
		$quote = $raw[0];
		$inner = substr($raw, 1, -1);
		if ($quote === "'") {
			return str_replace(['\\\\', "\\'"], ['\\', "'"], $inner);
		}
		return stripcslashes($inner);
	}//end unquote

	private static function next_meaningful(array $tokens, int $from) : ?int {
		$n = count($tokens);
		for ($i = $from + 1; $i < $n; $i++) {
			$t = $tokens[$i];
			if (is_array($t) && in_array($t[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
				continue;
			}
			return $i;
		}
		return null;
	}//end next_meaningful

	/** @return array|string|null */
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

- [ ] **Step 4: Run it — expect PASS** (`--filter migration_extractor_Test`, 7 tests).

- [ ] **Step 5: Commit**

```bash
git add install/class.migration_extractor.php test/server/unit/migration_extractor_Test.php
git commit -m "feat(install): migration_extractor — tokenizer value resolver for config migration"
```

---

### Task 2: `migration_destination` enum + `constant_map` secret manifest

**Files:**
- Create: `install/class.migration_destination.php`
- Create: `install/class.constant_map.php`

**Interfaces:**
- Produces:
  - `enum migration_destination : string { case ENV='env'; case STATE='state'; case CONFIG='config'; case DROP='drop'; case PASSTHROUGH='passthrough'; }`
  - `constant_map::is_secret_unknown(string $name) : bool` — true when a NON-catalog constant must still route to `.env` (explicit manifest names from Appendix A + the dev-box findings, plus conservative credential substrings).

- [ ] **Step 1: Implement the enum**

Create `install/class.migration_destination.php`:

```php
<?php declare(strict_types=1);

/**
* MIGRATION_DESTINATION
* Where the migrator routes a legacy constant:
*   ENV         → ../private/.env (secrets; redacted, never tracked)
*   STATE       → state.php (machine-written install state / fingerprints)
*   CONFIG      → typed config value file (overridable settings)
*   DROP        → not migrated (derived at boot, or request/user accessor-only)
*   PASSTHROUGH → preserved verbatim (unknown custom defines)
*/
enum migration_destination : string {
	case ENV         = 'env';
	case STATE       = 'state';
	case CONFIG      = 'config';
	case DROP        = 'drop';
	case PASSTHROUGH = 'passthrough';
}
```

- [ ] **Step 2: Implement the manifest**

Create `install/class.constant_map.php`:

```php
<?php declare(strict_types=1);

/**
* CONSTANT_MAP
* The migrator's manifest for constants NOT covered by the catalog (the catalog's
* config_scope already classifies every known key). It answers one question: is a given
* UNKNOWN constant actually a secret that must go to .env rather than be preserved as a
* (potentially tracked) passthrough define? Safe-by-default: explicit names (spec
* Appendix A + the dev-box live boot-diff findings) PLUS conservative credential
* substrings. Over-routing to .env is acceptable; leaking a secret into a tracked file is not.
*/
final class constant_map {

	/** Explicit non-catalog secret constant names. */
	private const SECRET_NAMES = [
		'GEONAMES_ACCOUNT_USERNAME',
		'DEDALO_RECOVERY_KEY',
		'MAILER_CONFIG',
		'SAML_CONFIG',
		'SOCRATA_CONFIG',
	];

	/** Conservative credential substrings (uppercased name match). */
	private const SECRET_SUBSTRINGS = ['PASSWORD', 'PASSWD', 'SALT', 'SECRET', 'TOKEN', 'PRIVATE_KEY', 'RECOVERY_KEY', 'API_KEY'];

	public static function is_secret_unknown(string $name) : bool {
		if (in_array($name, self::SECRET_NAMES, true)) {
			return true;
		}
		$upper = strtoupper($name);
		foreach (self::SECRET_SUBSTRINGS as $needle) {
			if (str_contains($upper, $needle)) {
				return true;
			}
		}
		return false;
	}//end is_secret_unknown
}
```

- [ ] **Step 3: Commit** (no separate test file — exercised by Task 3's classifier tests)

```bash
git add install/class.migration_destination.php install/class.constant_map.php
git commit -m "feat(install): migration_destination enum + constant_map secret manifest"
```

---

### Task 3: `migration_classifier`

**Files:**
- Create: `install/class.migration_classifier.php`
- Test: `test/server/unit/migration_classifier_Test.php`

**Interfaces:**
- Consumes: extractor records (`name => [...]`, Task 1); `config_key[]` catalog (`->const`, `->scope`); `migration_destination` (Task 2); `constant_map::is_secret_unknown()` (Task 2); `config_scope`.
- Produces: `migration_classifier::classify(array $records, array $catalog) : array` → `name => ['destination'=>migration_destination, 'record'=>array, 'scope'=>?config_scope]`.

Routing: a known constant (catalog `->const`) routes by `config_scope` — SECRET→ENV, STATE→STATE, STATIC→CONFIG, DERIVED|DERIVED_REQUEST|REQUEST|USER→DROP, PASSTHROUGH→PASSTHROUGH. A non-catalog constant routes ENV if `constant_map::is_secret_unknown()`, else PASSTHROUGH.

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/migration_classifier_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/install/class.migration_destination.php';
require_once dirname(__DIR__, 3) . '/install/class.constant_map.php';
require_once dirname(__DIR__, 3) . '/install/class.migration_classifier.php';

final class migration_classifier_Test extends TestCase {

	private function catalog() : array {
		return [
			new config_key('a.secret',  'DD_SECRET',  'string', null, config_scope::SECRET),
			new config_key('a.state',   'DD_STATE',   'string', null, config_scope::STATE),
			new config_key('a.static',  'DD_STATIC',  'int',    1,    config_scope::STATIC),
			new config_key('a.derived', 'DD_DERIVED', 'string', null, config_scope::DERIVED,
				config_merge::REPLACE, static fn(array $r) : string => 'd'),
			new config_key('a.request', 'DD_REQUEST', 'string', null, config_scope::REQUEST),
		];
	}

	private function rec(mixed $value = 'x', string $kind = 'literal') : array {
		return ['value' => $value, 'raw' => (string) $value, 'kind' => $kind, 'file' => 'f', 'line' => 1];
	}

	public function test_routes_known_constants_by_catalog_scope() : void {
		$records = [
			'DD_SECRET'  => $this->rec('s'),
			'DD_STATE'   => $this->rec('st'),
			'DD_STATIC'  => $this->rec(7),
			'DD_DERIVED' => $this->rec('d', 'runtime'),
			'DD_REQUEST' => $this->rec('lg', 'runtime'),
		];
		$out = migration_classifier::classify($records, $this->catalog());
		$this->assertSame(migration_destination::ENV,    $out['DD_SECRET']['destination']);
		$this->assertSame(migration_destination::STATE,  $out['DD_STATE']['destination']);
		$this->assertSame(migration_destination::CONFIG, $out['DD_STATIC']['destination']);
		$this->assertSame(migration_destination::DROP,   $out['DD_DERIVED']['destination']);
		$this->assertSame(migration_destination::DROP,   $out['DD_REQUEST']['destination']);
	}

	public function test_unknown_secret_goes_to_env() : void {
		$records = [
			'GEONAMES_ACCOUNT_USERNAME' => $this->rec('joe'),
			'DEDALO_RECOVERY_KEY'       => $this->rec('abc'),
			'MY_API_TOKEN'              => $this->rec('t'),       // substring match
			'CUSTOM_PASSWORD_X'         => $this->rec('p'),       // substring match
		];
		$out = migration_classifier::classify($records, $this->catalog());
		foreach (array_keys($records) as $name) {
			$this->assertSame(migration_destination::ENV, $out[$name]['destination'], "$name must route to ENV");
		}
	}

	public function test_unknown_non_secret_is_passthrough_and_keeps_record() : void {
		$records = ['DEDALO_PATATA' => $this->rec('potato'), 'DEDALO_CORS' => $this->rec('*')];
		$out = migration_classifier::classify($records, $this->catalog());
		$this->assertSame(migration_destination::PASSTHROUGH, $out['DEDALO_PATATA']['destination']);
		$this->assertSame(migration_destination::PASSTHROUGH, $out['DEDALO_CORS']['destination']);
		$this->assertSame('potato', $out['DEDALO_PATATA']['record']['value']);
	}

	public function test_scope_is_reported_for_known_and_null_for_unknown() : void {
		$records = ['DD_SECRET' => $this->rec('s'), 'DEDALO_PATATA' => $this->rec('p')];
		$out = migration_classifier::classify($records, $this->catalog());
		$this->assertSame(config_scope::SECRET, $out['DD_SECRET']['scope']);
		$this->assertNull($out['DEDALO_PATATA']['scope']);
	}
}
```

- [ ] **Step 2: Run it — expect FAIL** (`--filter migration_classifier_Test`): class not found.

- [ ] **Step 3: Implement**

Create `install/class.migration_classifier.php`:

```php
<?php declare(strict_types=1);

require_once __DIR__ . '/class.migration_destination.php';
require_once __DIR__ . '/class.constant_map.php';

/**
* MIGRATION_CLASSIFIER
* Routes each extracted constant to a migration_destination. Known constants (present in
* the catalog as a config_key->const) route by their config_scope; non-catalog constants
* route to ENV when constant_map flags them secret, else to PASSTHROUGH (preserved
* verbatim). The original extractor record is carried through unchanged so writers can use
* the resolved value (or the verbatim raw text for passthrough).
*/
final class migration_classifier {

	/**
	* @param array<string,array> $records  migration_extractor::extract() output
	* @param config_key[] $catalog
	* @return array<string,array{destination:migration_destination,record:array,scope:?config_scope}>
	*/
	public static function classify(array $records, array $catalog) : array {
		$scope_of = [];
		foreach ($catalog as $key) {
			if ($key->const !== null) {
				$scope_of[$key->const] = $key->scope;
			}
		}

		$out = [];
		foreach ($records as $name => $record) {
			$scope = $scope_of[$name] ?? null;
			$out[$name] = [
				'destination' => self::route($name, $scope),
				'record'      => $record,
				'scope'       => $scope,
			];
		}
		return $out;
	}//end classify

	private static function route(string $name, ?config_scope $scope) : migration_destination {
		if ($scope !== null) {
			return match ($scope) {
				config_scope::SECRET      => migration_destination::ENV,
				config_scope::STATE       => migration_destination::STATE,
				config_scope::STATIC      => migration_destination::CONFIG,
				config_scope::PASSTHROUGH => migration_destination::PASSTHROUGH,
				config_scope::DERIVED, config_scope::DERIVED_REQUEST,
				config_scope::REQUEST, config_scope::USER => migration_destination::DROP,
			};
		}
		// unknown (not in catalog): secrets to .env, everything else preserved verbatim
		return constant_map::is_secret_unknown($name)
			? migration_destination::ENV
			: migration_destination::PASSTHROUGH;
	}//end route
}
```

- [ ] **Step 4: Run it — expect PASS** (`--filter migration_classifier_Test`, 4 tests).

- [ ] **Step 5: Run the full hermetic suite** (`vendor/bin/phpunit -c test/server/phpunit.unit.xml`): all green; report totals (was 200 tests / 2262 assertions; expect +11 tests from Tasks 1 & 3).

- [ ] **Step 6: Commit**

```bash
git add install/class.migration_classifier.php test/server/unit/migration_classifier_Test.php
git commit -m "feat(install): migration_classifier — route constants by catalog scope + secret manifest"
```

---

## Self-Review

**Spec coverage (§5.10 extract + classify):** tokenizer static parse (Task 1, never includes the old files); value resolution folding literals/concats and marking `$_SERVER`/`dirname`/`fix_cascade`/cross-refs as runtime (Task 1 `resolve`/`scalar_token`); a symbol table for cross-file constant refs (Task 1 `$symbols`); classification secret→`.env` / config→typed / state→`state.php` / derived→drop / unknown→PASSTHROUGH preserved verbatim (Task 3 + the manifest); salt preserved verbatim (SECRET→ENV, value carried opaque); unknown custom defines preserved (PASSTHROUGH + `raw`). Deferred to 4b/4c and noted: commented-out defines (backup preserves them), the actual writers, the CLI, dry-run, boot-diff validation, atomic commit + backup, Bun sync, idempotency, schema-versioning.

**Placeholder scan:** every step has complete code or an exact command + expected output. The manifest names/substrings are concrete (Appendix A + the live boot-diff findings).

**Type consistency:** `migration_extractor::extract` returns `name => {value,raw,kind,file,line}`, consumed unchanged as `record` by `migration_classifier::classify` (Task 3 `rec()` helper mirrors the shape). `migration_destination` cases and `constant_map::is_secret_unknown()` (Task 2) are consumed by `migration_classifier` (Task 3). `config_key->const`/`->scope` and the 8 `config_scope` cases match the real enum; the `match` is exhaustive over all 8.

**Carry-overs to 4b/4c:** writers consume the classification map — ENV writer preserves the salt verbatim + Bun name-map sync; CONFIG writer should only emit values that DIFFER from the catalog default (the boot-diff showed most STATIC match); array-valued STATIC/PASSTHROUGH constants surface as `kind='runtime'` with `raw` only (4b decides whether to parse `raw` for arrays or preserve verbatim); STATE writer seeds INFO_KEY/INFORMATION. The CLI (4c) adds discover/lock, `--dry-run` (surfaces PASSTHROUGH + ENV routing for human review — the safety net for any secret the manifest missed), subprocess boot-diff validation (reuse Phase 3b-3's `boot_diff`), atomic commit + timestamped backup, idempotency, schema-versioning, `--yes`. The destructive run on the dev box stays gated (dry-run + backup + sign-off).
