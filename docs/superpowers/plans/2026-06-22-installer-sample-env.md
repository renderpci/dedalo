# Write `../private/sample.env` During Install — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a fresh Dédalo v7 install write a documented `../private/sample.env` (every configurable constant, from the catalog) so the new `../private/` directory ships useful configuration reference for administrators.

**Architecture:** Extract the existing catalog→sample.env rendering (currently inline in the untracked `dev/gen_sample_env.php`) into one committed class, `sample_env_renderer`. Both the dev CLI and the installer's "Save configuration" step (`installer_setup_manager::persist_config`) call it. The installer writes `sample.env` into `../private/` inside the same atomic commit that writes `.env`/`state.php`, on every save.

**Tech Stack:** PHP 8.x (`declare(strict_types=1)`), Dédalo config catalog (`core/base/config/catalog/`), PHPUnit (config-free `phpunit.unit.xml` suite), `migration_committer` for atomic file writes.

## Global Constraints

- PHP files start with `<?php declare(strict_types=1);`. One class per file, `class.<name>.php`, flat snake_case names (Dédalo convention).
- No new third-party dependencies.
- `sample.env` is a **non-secret** reference (catalog defaults + `CHANGE_ME` placeholders): default file perms — it must **not** be added to the `migration_committer` 0600 list.
- Rendering must **never block an install**: a render failure in `persist_config` is logged and skipped; `.env`/`state.php` still commit.
- Single source of truth: rendering logic exists in exactly one place (`sample_env_renderer`). No duplicated renderer.
- The renderer is pure (returns a string; no file I/O, no `exit`/STDERR).

---

### Task 1: `sample_env_renderer` class + unit test

**Files:**
- Create: `core/base/config/class.sample_env_renderer.php`
- Test: `test/server/unit/sample_env_renderer_Test.php`

**Interfaces:**
- Produces: `sample_env_renderer::render(?string $catalog_dir = null, ?string $generated_date = null) : string`
  - `$catalog_dir` defaults to `__DIR__ . '/catalog/domains'`; `$generated_date` defaults to `date('Y-m-d')`.
- Consumes: `config_key` (`->const, ->type, ->default, ->scope, ->doc`), `config_scope` enum, `config_merge` enum (all in `core/base/config/`).

- [ ] **Step 1: Capture the current CLI output as a baseline for Task 2**

Run:
```bash
php dev/gen_sample_env.php --stdout > /tmp/sample_env_before.txt
wc -l /tmp/sample_env_before.txt
```
Expected: a multi-hundred-line file is written (the pre-refactor reference). Keep it for Task 2's parity check.

- [ ] **Step 2: Write the failing test**

Create `test/server/unit/sample_env_renderer_Test.php`:
```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.sample_env_renderer.php';

/**
* SAMPLE_ENV_RENDERER_TEST
* Verifies the catalog → sample.env reference renderer: every configurable constant
* appears, commented out at its default, grouped by domain and tagged by scope.
*/
final class sample_env_renderer_Test extends TestCase {

	private static function render() : string {
		return sample_env_renderer::render(null, '2026-01-01');
	}

	public function test_render_returns_non_empty_documented_text() : void {
		$out = self::render();
		$this->assertNotSame('', $out);
		$this->assertStringContainsString('DÉDALO v7 — sample.env', $out);
		$this->assertStringContainsString('Generated 2026-01-01 from the config catalog', $out);
	}

	public function test_render_contains_scope_tags_and_domain_titles() : void {
		$out = self::render();
		$this->assertStringContainsString('[secret', $out);
		$this->assertStringContainsString('[static', $out);
		$this->assertStringContainsString('DATABASE', $out);   // 'db' domain title, uppercased
		$this->assertStringContainsString('LANGUAGES', $out);  // 'lang' domain title, uppercased
	}

	public function test_render_includes_a_known_key_commented_at_default() : void {
		$out = self::render();
		$this->assertMatchesRegularExpression('/^#DEDALO_DATA_LANG=/m', $out);
	}

	public function test_render_includes_every_catalog_key_with_a_const() : void {
		$repo   = dirname(__DIR__, 3);
		$keys   = require $repo . '/core/base/config/catalog/catalog.php';
		$consts = array_values(array_filter(array_map(static fn($k) => $k->const, $keys)));
		$this->assertNotEmpty($consts);

		$out = self::render();
		foreach ($consts as $c) {
			$this->assertStringContainsString('#' . $c . '=', $out, "Missing catalog key in sample.env: $c");
		}
	}
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
cd test/server && ../../vendor/bin/phpunit -c phpunit.unit.xml --filter sample_env_renderer
```
Expected: FAIL — `Class "sample_env_renderer" not found` (or the file `require_once` errors).

- [ ] **Step 4: Create the renderer (port the logic, parameterized, new header)**

Create `core/base/config/class.sample_env_renderer.php`:
```php
<?php declare(strict_types=1);
/**
* SAMPLE_ENV_RENDERER
* Renders the documented ../private/sample.env reference from the config catalog
* (core/base/config/catalog/). Single source of truth shared by the installer
* (installer_setup_manager::persist_config) and the dev CLI (dev/gen_sample_env.php),
* so the two can never drift.
*
* Pure: returns the rendered text; performs NO file I/O. Every configurable constant
* Dédalo recognizes is listed, grouped by domain, commented out at its catalog default
* and tagged by scope, so an administrator can copy/uncomment what they need into .env.
*
* @package Dédalo
* @subpackage Config
*/

require_once __DIR__ . '/class.config_scope.php';
require_once __DIR__ . '/class.config_merge.php';
require_once __DIR__ . '/class.config_key.php';

final class sample_env_renderer {

	// Domain order == typology order (mirrors core/base/config/catalog/catalog.php).
	// [machine key] => [section title, one-line blurb]
	private const DOMAINS = [
		'paths'       => ['Paths & URLs',                  'Filesystem locations and public URLs. Most are auto-resolved at boot from the install path; set one only to relocate data/media/cache outside the default tree.'],
		'identity'    => ['Identity',                      'Who this install is: entity name/label, timezone, locale, encryption.'],
		'runtime'     => ['Runtime',                       'Environment mode, debug, sessions, cache, CORS.'],
		'lang'        => ['Languages',                     'Application (UI) languages and data (content) languages.'],
		'defaults'    => ['Editor & record defaults',      'Default behaviours of the data editor and records.'],
		'media_image' => ['Media · Image',                 'Image handler: formats, qualities, thumbnails, print DPI.'],
		'media_av'    => ['Media · Audio / Video',         'Audio/Video handler: ffmpeg binaries, formats, qualities, streaming, watermark.'],
		'media_docs'  => ['Media · Documents, 3D & others','Document, 3D and other media handlers: binaries, formats, folders.'],
		'features'    => ['Features',                      'Feature toggles and global behaviour switches.'],
		'diffusion'   => ['Diffusion (public API)',        'Public publication / diffusion engine.'],
		'db'          => ['Database',                      'PostgreSQL (primary) and MariaDB/MySQL (publication) connections.'],
		'rag'         => ['RAG / vector subsystem',        'Optional semantic search + grounded Q&A (core/rag/). Dormant unless DEDALO_RAG_ENABLED=true.'],
		'mailer'      => ['Mailer & password reset',       'SMTP relay (core/dd_mailer) and password-reset knobs. Disabled while DEDALO_SMTP_HOST is empty.'],
		'areas'       => ['Ontology areas',                'Ontology area tipos. Advanced — change only if you know the ontology.'],
		'state'       => ['Install state',                 'Machine-managed runtime state. Written by Dédalo; do NOT edit by hand.'],
	];

	/**
	* RENDER
	* @param string|null $catalog_dir   Directory with the catalog domain files (default: sibling catalog/domains).
	* @param string|null $generated_date YYYY-MM-DD header stamp (default: today; pin it for deterministic tests).
	* @return string The full sample.env text.
	*/
	public static function render(?string $catalog_dir = null, ?string $generated_date = null) : string {

		$catalog_dir = $catalog_dir ?? __DIR__ . '/catalog/domains';
		$now = $generated_date ?? date('Y-m-d');
		$bar = str_repeat('═', 78);

		$o  = "# " . $bar . "\n";
		$o .= "#  DÉDALO v7 — sample.env  ·  ALL configurable constants, grouped by typology\n";
		$o .= "# " . $bar . "\n";
		$o .= "#\n";
		$o .= self::wrap_comment("Reference of every configuration constant Dédalo recognizes, generated from the "
			. "config catalog (core/base/config/catalog/). This file is NOT loaded by Dédalo — copy the "
			. "lines you need into ../private/.env (or a host override ../private/.env.<host>) and "
			. "uncomment them.");
		$o .= "#\n";
		$o .= self::wrap_comment("FORMAT.  KEY=value, one per line (an optional leading `export ` is accepted). "
			. "No \${VAR} interpolation. Wrap any value containing spaces or a # in quotes. "
			. "list/map values are JSON — e.g. [\"lg-eng\",\"lg-spa\"] or {\"lg-eng\":\"English\"}. "
			. "bool accepts true/false/1/0/yes/no/on/off.");
		$o .= "#\n";
		$o .= self::wrap_comment("PRECEDENCE (low→high): catalog defaults → ../private/config.local.php → "
			. "../private/.env → ../private/.env.<host> → real process env. Every line below is COMMENTED "
			. "OUT and shows its DEFAULT value; uncomment and edit only what you need to change.");
		$o .= "#\n";
		$o .= self::wrap_comment("TAGS.  [static] freely settable  ·  [secret] sensitive, env-only, set a real "
			. "value (never committed)  ·  [computed] auto-derived, override only if its note says so  ·  "
			. "[state] machine-managed, do not edit  ·  [runtime]/[per-user] resolved per request/user.");
		$o .= "#\n";
		$o .= "#  Generated " . $now . " from the config catalog (core/base/config/catalog/).\n";
		$o .= "#  Regenerate with: php dev/gen_sample_env.php\n";
		$o .= "# " . $bar . "\n";

		$counts = [];
		foreach (self::DOMAINS as $domain => [$title, $blurb]) {
			$keys = require $catalog_dir . '/' . $domain . '.php';
			$keys = array_values(array_filter($keys, static fn(config_key $k) => $k->const !== null));
			if (!$keys) continue;

			$o .= "\n\n";
			$o .= "# " . $bar . "\n";
			$o .= "#  " . strtoupper($title) . "\n";
			$o .= self::wrap_comment($blurb);
			$o .= "# " . $bar . "\n";

			foreach ($keys as $k) {
				$tag = self::scope_tag($k->scope);
				$counts[$tag] = ($counts[$tag] ?? 0) + 1;

				$o .= "\n";
				if ($k->doc !== '') {
					$o .= self::wrap_comment($k->doc);
				}
				if ($k->scope === config_scope::SECRET) {
					$o .= "# [secret · " . $k->type . "]  set a real value; env-only, never committed\n";
					$o .= "#" . $k->const . "=" . self::secret_placeholder($k) . "\n";
				} else {
					$note = match ($tag) {
						'computed' => '  auto-derived; uncomment only to override',
						'state'    => '  machine-managed; do not set by hand',
						'runtime'  => '  per-request default',
						'per-user' => '  per-user default',
						default    => '',
					};
					$o .= "# [" . $tag . " · " . $k->type . "]" . $note . "\n";
					$o .= "#" . $k->const . "=" . self::render_default($k) . "\n";
				}
			}
		}

		$summary = [];
		foreach ($counts as $t => $n) { $summary[] = $n . ' ' . $t; }
		$o .= "\n# " . $bar . "\n";
		$o .= "#  " . array_sum($counts) . " keys total  (" . implode(', ', $summary) . ")\n";
		$o .= self::wrap_comment("Custom or legacy define()s that are NOT in the catalog can still be set via "
			. "../private/config.local.php (return an array of path=>value) — see "
			. "config/sample.config.local.php for that format.");
		$o .= "# " . $bar . "\n";

		return $o;
	}//end render

	private static function wrap_comment(string $text, string $prefix = '# ') : string {
		$out = '';
		foreach (explode("\n", wordwrap($text, 76, "\n", false)) as $l) {
			$out .= rtrim($prefix . $l) . "\n";
		}
		return $out;
	}

	private static function scope_tag(config_scope $s) : string {
		return match ($s) {
			config_scope::SECRET          => 'secret',
			config_scope::STATIC          => 'static',
			config_scope::DERIVED         => 'computed',
			config_scope::DERIVED_REQUEST => 'computed',
			config_scope::STATE           => 'state',
			config_scope::REQUEST         => 'runtime',
			config_scope::USER            => 'per-user',
			config_scope::PASSTHROUGH     => 'passthrough',
		};
	}

	private static function render_default(config_key $k) : string {
		$d = $k->default;
		if ($d === null) return '';
		switch ($k->type) {
			case 'bool': return $d ? 'true' : 'false';
			case 'int':  return (string) $d;
			case 'list':
			case 'map':  return json_encode($d, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
			default:
				$s = (string) $d;
				// quote when the raw value could be mis-parsed (whitespace, surrounding space, inline #)
				if ($s !== trim($s) || preg_match('/\s/', $s) === 1 || strpos($s, '#') !== false) {
					return '"' . str_replace('"', '\\"', $s) . '"';
				}
				return $s;
		}
	}

	private static function secret_placeholder(config_key $k) : string {
		return match ($k->type) {
			'list'   => '[]',
			'map'    => '{}',
			'int'    => '0',
			'bool'   => 'false',
			default  => 'CHANGE_ME',
		};
	}

}//end class sample_env_renderer
```

- [ ] **Step 5: Run the new test to verify it passes**

Run:
```bash
cd test/server && ../../vendor/bin/phpunit -c phpunit.unit.xml --filter sample_env_renderer
```
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full config-free unit suite (no regressions)**

Run:
```bash
cd test/server && ../../vendor/bin/phpunit -c phpunit.unit.xml
```
Expected: OK, all tests pass (renderer test count added to the prior total).

- [ ] **Step 7: Lint**

Run:
```bash
php -l core/base/config/class.sample_env_renderer.php
```
Expected: `No syntax errors detected`.

- [ ] **Step 8: Commit**

```bash
git add core/base/config/class.sample_env_renderer.php test/server/unit/sample_env_renderer_Test.php
git commit -m "feat(config): add sample_env_renderer (catalog → sample.env, shared)"
```

---

### Task 2: Refactor `dev/gen_sample_env.php` to delegate to the renderer

**Files:**
- Modify: `dev/gen_sample_env.php` (replace its entire body)

**Interfaces:**
- Consumes: `sample_env_renderer::render()` from Task 1.

- [ ] **Step 1: Replace the CLI with a thin wrapper**

Overwrite `dev/gen_sample_env.php` with:
```php
<?php declare(strict_types=1);
/**
* gen_sample_env.php
* CLI wrapper that renders ../private/sample.env — a documented REFERENCE of every
* configuration constant Dédalo v7 recognizes, grouped by typology.
*
* The rendering lives in sample_env_renderer (core/base/config/), shared with the
* installer (installer_setup_manager::persist_config) so the two can never drift.
*
*   php dev/gen_sample_env.php            # write ../private/sample.env
*   php dev/gen_sample_env.php --stdout   # print to stdout instead
*/

$repo = dirname(__DIR__);
require_once $repo . '/core/base/config/class.sample_env_renderer.php';

$content = sample_env_renderer::render();

if (in_array('--stdout', $argv, true)) {
	echo $content;
	exit(0);
}

$target = $repo . '/../private/sample.env';
$dir = dirname($target);
if (!is_dir($dir)) {
	fwrite(STDERR, "gen_sample_env: target dir does not exist: $dir\n");
	exit(1);
}
if (file_put_contents($target, $content) === false) {
	fwrite(STDERR, "gen_sample_env: could not write $target\n");
	exit(1);
}
fwrite(STDERR, "Wrote " . realpath($target) . "\n");
```

- [ ] **Step 2: Verify output parity against the Task 1 baseline**

Run:
```bash
php dev/gen_sample_env.php --stdout > /tmp/sample_env_after.txt
diff /tmp/sample_env_before.txt /tmp/sample_env_after.txt
```
Expected: the ONLY differences are the intended header-attribution lines — the old single line
`#  Generated <date> by dev/gen_sample_env.php — re-run to refresh.`
is replaced by
`#  Generated <date> from the config catalog (core/base/config/catalog/).`
`#  Regenerate with: php dev/gen_sample_env.php`.
Every `#DEDALO_…=` body line must be byte-identical. (If the run crosses midnight the date line will also differ — re-run both if so.)

- [ ] **Step 3: Lint**

Run:
```bash
php -l dev/gen_sample_env.php
```
Expected: `No syntax errors detected`.

- [ ] **Step 4: Do NOT commit**

`dev/gen_sample_env.php` is an untracked local dev tool; committing it is a separate, explicit decision (out of scope per the spec). Leave the refactor as a local working change. (If the user later asks to track it: `git add -f dev/gen_sample_env.php && git commit -m "refactor(dev): gen_sample_env delegates to sample_env_renderer"`.)

---

### Task 3: Write `../private/sample.env` from `installer_setup_manager::persist_config`

**Files:**
- Modify: `core/installer/class.installer_setup_manager.php` (inside `persist_config()`, between the `env_bun` block and the `try { migration_committer::commit(...) }` — around lines 402–408)

**Interfaces:**
- Consumes: `sample_env_renderer::render()` (Task 1), `$private` (the resolved `../private/` dir), `$artifact_map` / `$targets` (already built above), `debug_log`, `logger::WARNING`.

- [ ] **Step 1: Add the sample.env artifact to the atomic commit**

In `core/installer/class.installer_setup_manager.php`, find:
```php
		if ($artifacts->env_bun !== null) {
			$bun_path = DEDALO_ROOT_PATH . '/diffusion/api/v1/.env';
			$artifact_map['env_bun'] = $artifacts->env_bun;
			$targets['env_bun']      = $bun_path;
		}

		try {
			$report = migration_committer::commit(
```
Replace it with (insert the sample.env block between the two):
```php
		if ($artifacts->env_bun !== null) {
			$bun_path = DEDALO_ROOT_PATH . '/diffusion/api/v1/.env';
			$artifact_map['env_bun'] = $artifacts->env_bun;
			$targets['env_bun']      = $bun_path;
		}

		// sample.env — a documented reference of every configurable constant, regenerated
		// from the catalog on every save so ../private/ always ships current config help.
		// Non-secret (defaults + placeholders) → default perms (NOT in the 0600 list).
		// Never block the install: a render failure is logged and skipped; the critical
		// files (.env/state.php) still commit.
		require_once DEDALO_CORE_PATH . '/base/config/class.sample_env_renderer.php';
		try {
			$artifact_map['sample_env'] = sample_env_renderer::render();
			$targets['sample_env']      = $private . '/sample.env';
		} catch (\Throwable $e) {
			debug_log(__METHOD__ . ' sample.env render skipped: ' . $e->getMessage(), logger::WARNING);
		}

		try {
			$report = migration_committer::commit(
```
Leave the `migration_committer::commit(...)` 4th argument as `['env_php', 'env_bun']` — `sample_env` is intentionally absent so it gets default perms, not 0600.

- [ ] **Step 2: Lint**

Run:
```bash
php -l core/installer/class.installer_setup_manager.php
```
Expected: `No syntax errors detected`.

- [ ] **Step 3: Confirm the wiring is present and correctly scoped**

Run:
```bash
grep -n "sample_env_renderer\|sample_env'\]\|0600\|'env_php', 'env_bun'" core/installer/class.installer_setup_manager.php
```
Expected: `sample_env_renderer::render()` assigned to `$artifact_map['sample_env']`, `$targets['sample_env'] = $private . '/sample.env'`, and the commit chmod list still `['env_php', 'env_bun']` (sample_env NOT listed).

- [ ] **Step 4: Run the config-free unit suite (load/syntax regression gate)**

Run:
```bash
cd test/server && ../../vendor/bin/phpunit -c phpunit.unit.xml
```
Expected: OK, all pass.

- [ ] **Step 5: Functional confirmation (manual, on a real install/save)**

`persist_config` resolves a fixed `../private/` and cannot be safely redirected from a script (it would overwrite the live `.env`). Confirm functionally on a real "Save configuration" (fresh install, or a deliberate re-save in the install window): after it runs, `../private/sample.env` exists and its first lines show `DÉDALO v7 — sample.env` with today's date, and `.install_backups/` holds the prior copy. Do **not** trigger this against an in-use production `../private/`.

- [ ] **Step 6: Commit**

```bash
git add core/installer/class.installer_setup_manager.php
git commit -m "feat(installer): write ../private/sample.env on persist_config"
```

---

## Self-Review

**Spec coverage:**
- Spec §Components/1 (renderer class) → Task 1. ✓
- Spec §Components/2 (dev CLI refactor) → Task 2. ✓
- Spec §Components/3 (persist_config hook) → Task 3 (Step 1; default perms preserved via unchanged 0600 list). ✓
- Spec §Components/4 (error handling, never block install) → Task 3 Step 1 try/catch. ✓
- Spec §Components/5 (renderer unit test + CLI parity) → Task 1 Steps 2–6, Task 2 Step 2. ✓
- Spec constraint: renderer loads all three config enums → Task 1 Step 4 `require_once` of `config_scope` + `config_merge` + `config_key`. ✓
- Spec constraint: caller-neutral header → Task 1 Step 4 header lines. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command shows expected output. ✓

**Type consistency:** `sample_env_renderer::render(?string, ?string): string` is defined in Task 1 and consumed identically in Task 2 (`render()`) and Task 3 (`render()`). `config_key->const/type/default/scope/doc` and `config_scope` cases match the catalog classes. `logger::WARNING` exists. ✓
