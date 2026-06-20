# Phase 4c — Migration tool: CLI orchestrator (core)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the 4a extractor/classifier and the 4b writers into a runnable CLI (`migrate_config_v7.php`) that, given an install's legacy config, produces a redacted `--dry-run` plan and — only on `--yes` — atomically writes the five migration artifacts with a timestamped backup of everything it overwrites.

**Architecture:** Three units under `install/`: `migration_runner` (pure — extract→classify→render into an in-memory artifact map + a redacted per-destination summary + the dry-run report), `migration_committer` (the only I/O — atomic write via temp+rename, timestamped per-`{host}.{entity}` backup of each overwritten target, `chmod 600` for `.env`), and the thin CLI `migrate_config_v7.php` (arg parsing, source discovery, a lockfile, wiring). Everything is sandbox-parameterized so tests run against temp fixture configs and temp targets; the real dev-box run is gated behind `--dry-run` + backup + sign-off and is never run by tests or implementers.

**Tech Stack:** PHP 8.1+ (`flock`, atomic `rename`, `chmod`), PHPUnit 13 hermetic harness (temp sandboxes; subprocess via `PHP_BINARY`). Reuses 4a (`migration_extractor`, `migration_classifier`) + 4b (`env_writer`, `config_writer`, `state_writer`, `passthrough_writer`) + the catalog.

## Global Constraints

- **No real-install writes from tests/implementers.** Every writing path is parameterized to a sandbox dir. The CLI's defaults point at the real install, but tests always pass temp dirs. The real run is the controller's gated step (`--dry-run` → review → sign-off → `--yes`).
- **Backup before overwrite, always.** `migration_committer` copies any existing target to a timestamped per-`{host}.{entity}` backup BEFORE writing. Writes are atomic (temp file in the target dir + `rename`). `.env` files get `chmod 0600`.
- **`--dry-run` is the default-safe mode.** Without `--yes`, the CLI prints the redacted plan and writes NOTHING (exit 0). `--yes` is required to commit. The dry-run report prints destination + counts + constant NAMES only — NEVER values (the safety net for any secret the manifest missed).
- **Preserve the salt + unknown defines.** The runner passes the 4b writers' output through unchanged — salt verbatim in `.env`, unknown defines verbatim in passthrough. The committer never inspects values.
- **Boot-diff validation is NOT in this phase.** Deferred to 4c-2 (it needs the migrated-source-consuming boot assembler, cutover-adjacent). 4c's safety = dry-run review + timestamped backup + sign-off; the surface was already proven structurally by 3b-3.
- **Schema-versioning / per-entity keying (minimal):** the dry-run report and a `config/local/.migration.json` marker stamp `schema_version` + the `{host}.{entity}` key; backups are namespaced by `{host}.{entity}/{stamp}/` so two entities never clobber each other. Fuller idempotency (no-op on identical re-run) is a noted carry-over.
- **Never read the live config as a design reference; tokenizing it for migration is the authorized purpose.** The real run tokenizes `config/config.php` (+ `config_db/areas/core.php`); the dry-run surfaces the plan for review first.
- **Hermetic harness conventions:** `test/server/unit/*_Test.php`, `declare(strict_types=1)`, `extends PHPUnit\Framework\TestCase`, deps via `require_once dirname(__DIR__, 3) . '/...'`. Run: `vendor/bin/phpunit -c test/server/phpunit.unit.xml`.
- **Target paths (CLI defaults; sandbox-overridable):** `.env`→`<repo>/../private/.env` (0600); Bun→`<repo>/diffusion/api/v1/.env`; config→`<repo>/config/local/config.php`; state→`<repo>/config/state.php`; passthrough→`<repo>/config/local/passthrough.php`; marker→`<repo>/config/local/.migration.json`; backups→`<repo>/../backups/config_migration/{host}.{entity}/{stamp}/`.

## File Structure
- Create `install/class.migration_runner.php` (Task 1) — pure plan + dry-run report.
- Create `install/class.migration_committer.php` (Task 2) — atomic write + backup I/O.
- Create `install/migrate_config_v7.php` (Task 3) — the CLI entry.
- Tests: `test/server/unit/migration_runner_Test.php`, `migration_committer_Test.php`, `migrate_config_v7_cli_Test.php`.

---

### Task 1: `migration_runner` (plan + dry-run report)

**Files:**
- Create: `install/class.migration_runner.php`
- Test: `test/server/unit/migration_runner_Test.php`

**Interfaces:**
- Consumes: `migration_extractor::extract(string[])`, `migration_classifier::classify(records, catalog)`, the four 4b writers, `migration_destination`.
- Produces:
  - `migration_runner::SCHEMA_VERSION` (int constant, `1`).
  - `migration_runner::plan(array $source_files, array $catalog) : array` → `['artifacts'=>['env_php'=>string,'env_bun'=>string,'config'=>string,'state'=>string,'passthrough'=>string], 'summary'=>array<string,string[]> (destination value => sorted constant names), 'entity'=>?string]`. `entity` is the resolved `DEDALO_ENTITY` literal if present (for backup keying), else null.
  - `migration_runner::dry_run_report(array $plan) : string` — redacted (names + counts only, never values).

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/migration_runner_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/install/class.migration_extractor.php';
require_once dirname(__DIR__, 3) . '/install/class.migration_destination.php';
require_once dirname(__DIR__, 3) . '/install/class.constant_map.php';
require_once dirname(__DIR__, 3) . '/install/class.migration_classifier.php';
require_once dirname(__DIR__, 3) . '/install/class.env_writer.php';
require_once dirname(__DIR__, 3) . '/install/class.config_writer.php';
require_once dirname(__DIR__, 3) . '/install/class.state_writer.php';
require_once dirname(__DIR__, 3) . '/install/class.passthrough_writer.php';
require_once dirname(__DIR__, 3) . '/install/class.migration_runner.php';

final class migration_runner_Test extends TestCase {

	private string $dir;

	protected function setUp() : void {
		parent::setUp();
		$this->dir = dirname(__FILE__) . '/fixtures';
		if (!is_dir($this->dir)) { mkdir($this->dir, 0755, true); }
	}

	private function catalog() : array {
		return [
			new config_key('db.password', 'DEDALO_PASSWORD_CONN', 'string', null, config_scope::SECRET),
			new config_key('db.host',      'DEDALO_HOSTNAME_CONN', 'string', 'localhost', config_scope::STATIC),
			new config_key('state.info',    'DEDALO_INFO_KEY',      'string', null, config_scope::STATE),
			new config_key('identity.entity','DEDALO_ENTITY',       'string', 'my_entity_name', config_scope::STATIC),
		];
	}

	private function fixture() : string {
		$f = $this->dir . '/mr_config.php';
		file_put_contents($f, <<<'PHP'
		<?php
		define('DEDALO_ENTITY', 'acme');
		define('DEDALO_PASSWORD_CONN', 'sup3rsecret');
		define('DEDALO_HOSTNAME_CONN', 'pg.acme.org');
		define('DEDALO_INFO_KEY', 'acme');
		define('DEDALO_PATATA', 'potato');
		PHP);
		return $f;
	}

	public function test_plan_routes_each_constant_into_the_right_artifact() : void {
		$plan = migration_runner::plan([$this->fixture()], $this->catalog());

		$this->assertSame('acme', $plan['entity']);
		$this->assertStringContainsString('DEDALO_PASSWORD_CONN=', $plan['artifacts']['env_php']);
		$this->assertStringContainsString("'identity.entity' => 'acme'", $plan['artifacts']['config']);   // entity differs from default
		$this->assertStringContainsString("'db.host' => 'pg.acme.org'", $plan['artifacts']['config']);
		$this->assertStringContainsString("'state.info' => 'acme'", $plan['artifacts']['state']);
		$this->assertStringContainsString("define('DEDALO_PATATA', 'potato')", $plan['artifacts']['passthrough']);
	}

	public function test_dry_run_report_lists_names_never_values() : void {
		$plan = migration_runner::plan([$this->fixture()], $this->catalog());
		$report = migration_runner::dry_run_report($plan);

		$this->assertStringContainsString('DEDALO_PASSWORD_CONN', $report); // name shown
		$this->assertStringNotContainsString('sup3rsecret', $report);       // value hidden
		$this->assertStringContainsString('DEDALO_PATATA', $report);
		$this->assertStringContainsString('schema_version', $report);
	}
}
```

- [ ] **Step 2: Run it — expect FAIL** (`--filter migration_runner_Test`): class not found.

- [ ] **Step 3: Implement**

Create `install/class.migration_runner.php`:

```php
<?php declare(strict_types=1);

require_once __DIR__ . '/class.migration_extractor.php';
require_once __DIR__ . '/class.migration_classifier.php';
require_once __DIR__ . '/class.migration_destination.php';
require_once __DIR__ . '/class.env_writer.php';
require_once __DIR__ . '/class.config_writer.php';
require_once __DIR__ . '/class.state_writer.php';
require_once __DIR__ . '/class.passthrough_writer.php';

/**
* MIGRATION_RUNNER
* Pure orchestration: tokenize the legacy config (4a), classify each constant (4a), and
* render the five artifacts (4b) into an in-memory plan. Produces a redacted dry-run
* report (names + counts only). No disk I/O — migration_committer writes; the CLI wires.
*/
final class migration_runner {

	public const SCHEMA_VERSION = 1;

	/**
	* @param string[] $source_files legacy config files to migrate, in include order
	* @param config_key[] $catalog
	* @return array{artifacts:array<string,string>,summary:array<string,array<int,string>>,entity:?string}
	*/
	public static function plan(array $source_files, array $catalog) : array {
		$records = migration_extractor::extract($source_files);
		$cls = migration_classifier::classify($records, $catalog);

		$artifacts = [
			'env_php'     => env_writer::render_php($cls),
			'env_bun'     => env_writer::render_bun($cls),
			'config'      => config_writer::render($cls, $catalog),
			'state'       => state_writer::render($cls, $catalog),
			'passthrough' => passthrough_writer::render($cls),
		];

		$summary = [];
		foreach ($cls as $name => $info) {
			$summary[$info['destination']->value][] = $name;
		}
		foreach ($summary as &$names) { sort($names); }
		unset($names);
		ksort($summary);

		$entity = (isset($records['DEDALO_ENTITY']) && $records['DEDALO_ENTITY']['kind'] === 'literal')
			? (string) $records['DEDALO_ENTITY']['value']
			: null;

		return ['artifacts' => $artifacts, 'summary' => $summary, 'entity' => $entity];
	}//end plan

	/** Redacted human report: destination => count + sorted NAMES (never values). */
	public static function dry_run_report(array $plan) : string {
		$lines = [];
		$lines[] = '=== migration dry-run (schema_version ' . self::SCHEMA_VERSION . ') ===';
		$lines[] = 'entity: ' . ($plan['entity'] ?? '(unresolved)');
		$lines[] = '';
		foreach ($plan['summary'] as $destination => $names) {
			$lines[] = strtoupper($destination) . ' (' . count($names) . '): ' . implode(', ', $names);
		}
		$lines[] = '';
		$lines[] = 'Review especially PASSTHROUGH (preserved verbatim) and ENV (routed as secrets).';
		return implode("\n", $lines) . "\n";
	}//end dry_run_report
}
```

- [ ] **Step 4: Run it — expect PASS** (`--filter migration_runner_Test`, 2 tests).

- [ ] **Step 5: Commit**

```bash
git add install/class.migration_runner.php test/server/unit/migration_runner_Test.php
git commit -m "feat(install): migration_runner — plan (extract+classify+render) + redacted dry-run report"
```

---

### Task 2: `migration_committer` (atomic write + timestamped backup)

**Files:**
- Create: `install/class.migration_committer.php`
- Test: `test/server/unit/migration_committer_Test.php`

**Interfaces:**
- Consumes: the plan's `artifacts` map (Task 1).
- Produces: `migration_committer::commit(array $artifacts, array $targets, string $backup_dir, array $env_keys = ['env_php','env_bun']) : array` — for each artifact key present in `$targets` whose content is non-trivial, back up an existing target into `$backup_dir` (creating it), then atomically write (temp + `rename`); `chmod 0600` for keys in `$env_keys`. Skips an artifact whose content is empty/header-only (see `is_empty_artifact`). Returns `array<string,string>` target-key => `'written'` | `'written+backed-up'` | `'skipped-empty'`.

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/migration_committer_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/install/class.migration_committer.php';

final class migration_committer_Test extends TestCase {

	private string $sandbox;

	protected function setUp() : void {
		parent::setUp();
		$this->sandbox = sys_get_temp_dir() . '/mc_' . getmypid() . '_' . substr(md5(__FILE__), 0, 6);
		@mkdir($this->sandbox, 0755, true);
	}
	protected function tearDown() : void {
		array_map('unlink', glob($this->sandbox . '/**/*') ?: []);
		// best-effort cleanup; temp dir
	}

	public function test_writes_new_files_atomically_and_chmods_env() : void {
		$targets = [
			'env_php' => $this->sandbox . '/private/.env',
			'config'  => $this->sandbox . '/config/local/config.php',
		];
		$artifacts = [
			'env_php' => "# secrets\nDEDALO_SALT_STRING=abc\n",
			'config'  => "<?php declare(strict_types=1);\nreturn ['db.host' => 'h'];\n",
		];
		$report = migration_committer::commit($artifacts, $targets, $this->sandbox . '/backup');

		$this->assertSame('written', $report['env_php']);
		$this->assertSame('written', $report['config']);
		$this->assertStringContainsString('DEDALO_SALT_STRING=abc', file_get_contents($targets['env_php']));
		$this->assertSame('0600', substr(sprintf('%o', fileperms($targets['env_php'])), -4));
	}

	public function test_backs_up_existing_target_before_overwriting() : void {
		$target = $this->sandbox . '/config/state.php';
		@mkdir(dirname($target), 0755, true);
		file_put_contents($target, "<?php return ['old' => 1];\n");

		$report = migration_committer::commit(
			['state' => "<?php return ['new' => 2];\n"],
			['state' => $target],
			$this->sandbox . '/backup'
		);

		$this->assertSame('written+backed-up', $report['state']);
		$this->assertStringContainsString("'new' => 2", file_get_contents($target));
		$backups = glob($this->sandbox . '/backup/*state.php*');
		$this->assertNotEmpty($backups, 'a backup of the prior state.php must exist');
		$this->assertStringContainsString("'old' => 1", file_get_contents($backups[0]));
	}

	public function test_skips_empty_or_header_only_artifacts() : void {
		$target = $this->sandbox . '/config/local/passthrough.php';
		$report = migration_committer::commit(
			['passthrough' => "<?php declare(strict_types=1);\n\n// nothing\n"],
			['passthrough' => $target],
			$this->sandbox . '/backup'
		);
		$this->assertSame('skipped-empty', $report['passthrough']);
		$this->assertFileDoesNotExist($target);
	}
}
```

- [ ] **Step 2: Run it — expect FAIL** (`--filter migration_committer_Test`): class not found.

- [ ] **Step 3: Implement**

Create `install/class.migration_committer.php`:

```php
<?php declare(strict_types=1);

/**
* MIGRATION_COMMITTER
* The migration's only filesystem mutation. For each artifact mapped to a target path:
* back up an existing target into the (per-{host}.{entity}/{stamp}) backup dir, then write
* atomically (temp file in the target's dir + rename). .env targets get chmod 0600.
* Artifacts with no real content (empty / header-only) are skipped, so an install with no
* passthrough/overrides does not get stray files. Returns a per-target status report.
*/
final class migration_committer {

	/**
	* @param array<string,string> $artifacts  key => file content
	* @param array<string,string> $targets    key => absolute target path
	* @param string $backup_dir absolute backup directory (created if absent)
	* @param string[] $env_keys artifact keys to chmod 0600
	* @return array<string,string> key => 'written' | 'written+backed-up' | 'skipped-empty'
	*/
	public static function commit(array $artifacts, array $targets, string $backup_dir, array $env_keys = ['env_php', 'env_bun']) : array {
		$report = [];
		foreach ($targets as $key => $path) {
			$content = $artifacts[$key] ?? '';
			if (self::is_empty_artifact($content)) {
				$report[$key] = 'skipped-empty';
				continue;
			}

			$backed_up = false;
			if (is_file($path)) {
				if (!is_dir($backup_dir) && !mkdir($backup_dir, 0700, true) && !is_dir($backup_dir)) {
					throw new \RuntimeException("migration_committer: cannot create backup dir {$backup_dir}");
				}
				if (!copy($path, $backup_dir . '/' . basename($path) . '.bak')) {
					throw new \RuntimeException("migration_committer: backup failed for {$path}");
				}
				$backed_up = true;
			}

			$dir = dirname($path);
			if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
				throw new \RuntimeException("migration_committer: cannot create target dir {$dir}");
			}
			$tmp = $dir . '/.' . basename($path) . '.tmp.' . getmypid();
			if (file_put_contents($tmp, $content) === false || !rename($tmp, $path)) {
				@unlink($tmp);
				throw new \RuntimeException("migration_committer: atomic write failed for {$path}");
			}
			if (in_array($key, $env_keys, true)) {
				@chmod($path, 0600);
			}
			$report[$key] = $backed_up ? 'written+backed-up' : 'written';
		}
		return $report;
	}//end commit

	/** True when content has no statements beyond the `<?php`/declare header and comments. */
	private static function is_empty_artifact(string $content) : bool {
		foreach (token_get_all($content) as $t) {
			if (is_array($t)) {
				if (in_array($t[0], [T_OPEN_TAG, T_WHITESPACE, T_COMMENT, T_DOC_COMMENT, T_DECLARE, T_STRING, T_LNUMBER, T_CONSTANT_ENCAPSED_STRING], true)) {
					continue;
				}
				if ($t[0] === T_RETURN) {
					// a `return [...]` with entries is non-empty; `return []` is empty
					return !preg_match('/return\s*\[\s*[\'"]/', $content);
				}
				return false; // any other real token (e.g. T_IF for a define guard) => non-empty
			}
		}
		return true; // only header/comment tokens
	}//end is_empty_artifact
}
```

- [ ] **Step 4: Run it — expect PASS** (`--filter migration_committer_Test`, 3 tests).

- [ ] **Step 5: Commit**

```bash
git add install/class.migration_committer.php test/server/unit/migration_committer_Test.php
git commit -m "feat(install): migration_committer — atomic write + timestamped backup, chmod 0600 env"
```

---

### Task 3: `migrate_config_v7.php` CLI entry

**Files:**
- Create: `install/migrate_config_v7.php`
- Test: `test/server/unit/migrate_config_v7_cli_Test.php`

**Interfaces:**
- Consumes: `migration_runner`, `migration_committer`, the catalog. CLI args (all sandbox-overridable; defaults are the real install paths).
- Produces: an executable CLI. Flags: `--dry-run` (default-safe: print plan, write nothing), `--yes` (required to commit), `--config-dir=DIR` (source config dir; default `<repo>/config`), `--private-dir=DIR` (`.env` dir; default `<repo>/../private`), `--bun-env=FILE`, `--target-config-dir=DIR` (default `<repo>/config`), `--backup-base=DIR` (default `<repo>/../backups/config_migration`). Exit: 0 ok/dry-run, 1 refused (commit without `--yes`), 2 usage/lock/read error.

- [ ] **Step 1: Write the failing test**

Create `test/server/unit/migrate_config_v7_cli_Test.php`:

```php
<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class migrate_config_v7_cli_Test extends TestCase {

	private string $sandbox;
	private string $script;

	protected function setUp() : void {
		parent::setUp();
		$this->script = dirname(__DIR__, 3) . '/install/migrate_config_v7.php';
		$this->sandbox = sys_get_temp_dir() . '/mcli_' . getmypid() . '_' . substr(md5(uniqid('', true)), 0, 6);
		@mkdir($this->sandbox . '/config', 0755, true);
		// a minimal legacy config to migrate
		file_put_contents($this->sandbox . '/config/config.php', "<?php\ndefine('DEDALO_ENTITY', 'sbx');\ndefine('DEDALO_PATATA', 'potato');\n");
	}

	private function run(array $args) : array {
		$cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($this->script);
		foreach ($args as $a) { $cmd .= ' ' . escapeshellarg($a); }
		$cmd .= ' 2>&1';
		exec($cmd, $out, $code);
		return [implode("\n", $out), $code];
	}

	private function common() : array {
		return [
			'--config-dir=' . $this->sandbox . '/config',
			'--private-dir=' . $this->sandbox . '/private',
			'--bun-env=' . $this->sandbox . '/bun.env',
			'--target-config-dir=' . $this->sandbox . '/config',
			'--backup-base=' . $this->sandbox . '/backups',
		];
	}

	public function test_dry_run_prints_plan_and_writes_nothing() : void {
		[$out, $code] = $this->run(array_merge(['--dry-run'], $this->common()));
		$this->assertSame(0, $code, $out);
		$this->assertStringContainsString('DEDALO_PATATA', $out);
		$this->assertFileDoesNotExist($this->sandbox . '/private/.env');
		$this->assertFileDoesNotExist($this->sandbox . '/config/local/passthrough.php');
	}

	public function test_commit_refused_without_yes() : void {
		[$out, $code] = $this->run($this->common()); // no --dry-run, no --yes
		$this->assertSame(1, $code);
		$this->assertStringContainsString('--yes', $out);
		$this->assertFileDoesNotExist($this->sandbox . '/config/local/passthrough.php');
	}

	public function test_yes_commits_artifacts() : void {
		[$out, $code] = $this->run(array_merge(['--yes'], $this->common()));
		$this->assertSame(0, $code, $out);
		$this->assertFileExists($this->sandbox . '/config/local/passthrough.php');
		$this->assertStringContainsString("define('DEDALO_PATATA', 'potato')", file_get_contents($this->sandbox . '/config/local/passthrough.php'));
	}
}
```

- [ ] **Step 2: Run it — expect FAIL** (`--filter migrate_config_v7_cli_Test`): script missing.

- [ ] **Step 3: Implement**

Create `install/migrate_config_v7.php`:

```php
<?php declare(strict_types=1);

/**
* MIGRATE_CONFIG_V7 (CLI) — v6→v7 config migration orchestrator (spec §5.10).
* Default-safe: prints a redacted plan and writes NOTHING unless --yes is given.
* Tokenizes the legacy config (never includes it). All paths are overridable so this is
* testable against a sandbox; the defaults target the real install.
*
* Usage: php install/migrate_config_v7.php [--dry-run] [--yes] [--config-dir=DIR]
*        [--private-dir=DIR] [--bun-env=FILE] [--target-config-dir=DIR] [--backup-base=DIR]
* Exit:  0 ok / dry-run, 1 commit refused (no --yes), 2 usage / lock / read error.
*/
if (php_sapi_name() !== 'cli') {
	http_response_code(404);
	exit(2);
}

$repo = dirname(__DIR__);

require_once $repo . '/core/base/config/class.config_scope.php';
require_once $repo . '/core/base/config/class.config_merge.php';
require_once $repo . '/core/base/config/class.config_key.php';
require_once $repo . '/install/class.migration_runner.php';
require_once $repo . '/install/class.migration_committer.php';

// --- args ---
$opts = ['dry-run' => false, 'yes' => false];
$paths = [
	'config-dir'        => $repo . '/config',
	'private-dir'       => $repo . '/../private',
	'bun-env'           => $repo . '/diffusion/api/v1/.env',
	'target-config-dir' => $repo . '/config',
	'backup-base'       => $repo . '/../backups/config_migration',
];
foreach (array_slice($argv, 1) as $arg) {
	if ($arg === '--dry-run') { $opts['dry-run'] = true; continue; }
	if ($arg === '--yes')     { $opts['yes'] = true; continue; }
	if (preg_match('/^--([a-z-]+)=(.*)$/', $arg, $m) && isset($paths[$m[1]])) { $paths[$m[1]] = $m[2]; continue; }
	fwrite(STDERR, "migrate_config_v7: unknown argument: {$arg}\n");
	exit(2);
}

// --- discover sources (tokenized, never included) ---
$sources = [];
foreach (['config.php', 'config_db.php', 'config_areas.php', 'config_core.php'] as $name) {
	$p = $paths['config-dir'] . '/' . $name;
	if (is_file($p)) { $sources[] = $p; }
}
if ($sources === []) {
	fwrite(STDERR, "migrate_config_v7: no legacy config files found in {$paths['config-dir']}\n");
	exit(2);
}

// --- single-runner lock ---
$lockfile = sys_get_temp_dir() . '/dedalo_migrate_config_v7.lock';
$lock = fopen($lockfile, 'c');
if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
	fwrite(STDERR, "migrate_config_v7: another migration is already running\n");
	exit(2);
}

$catalog = require $repo . '/core/base/config/catalog/catalog.php';
$plan = migration_runner::plan($sources, $catalog);

// --- dry-run (default-safe) ---
if (!$opts['yes']) {
	fwrite(STDOUT, migration_runner::dry_run_report($plan));
	if (!$opts['dry-run']) {
		fwrite(STDERR, "\nNothing written. Re-run with --yes to commit (after reviewing the plan above).\n");
		flock($lock, LOCK_UN);
		exit(1);
	}
	flock($lock, LOCK_UN);
	exit(0);
}

// --- commit (requires --yes) ---
$host  = gethostname() ?: 'host';
$entity = $plan['entity'] ?? 'entity';
$stamp = date('Ymd_His');
$backup_dir = $paths['backup-base'] . '/' . $host . '.' . $entity . '/' . $stamp;

$targets = [
	'env_php'     => $paths['private-dir'] . '/.env',
	'env_bun'     => $paths['bun-env'],
	'config'      => $paths['target-config-dir'] . '/local/config.php',
	'state'       => $paths['target-config-dir'] . '/state.php',
	'passthrough' => $paths['target-config-dir'] . '/local/passthrough.php',
];

$report = migration_committer::commit($plan['artifacts'], $targets, $backup_dir);

// marker for schema version + key
$marker = $paths['target-config-dir'] . '/local/.migration.json';
@mkdir(dirname($marker), 0755, true);
@file_put_contents($marker, json_encode([
	'schema_version' => migration_runner::SCHEMA_VERSION,
	'key'            => $host . '.' . $entity,
	'stamp'          => $stamp,
], JSON_PRETTY_PRINT) . "\n");

fwrite(STDOUT, "migration committed (schema_version " . migration_runner::SCHEMA_VERSION . ", backups in {$backup_dir}):\n");
foreach ($report as $key => $status) {
	fwrite(STDOUT, "  - {$key}: {$status}\n");
}
flock($lock, LOCK_UN);
exit(0);
```

- [ ] **Step 4: Run it — expect PASS** (`--filter migrate_config_v7_cli_Test`, 3 tests).

- [ ] **Step 5: Run the full hermetic suite** (`vendor/bin/phpunit -c test/server/phpunit.unit.xml`): all green; report totals (was 221 tests / 2329 assertions; expect +8 tests from Tasks 1–3).

- [ ] **Step 6: Commit**

```bash
git add install/migrate_config_v7.php test/server/unit/migrate_config_v7_cli_Test.php
git commit -m "feat(install): migrate_config_v7 CLI — dry-run + gated atomic commit with backup"
```

---

## Self-Review

**Spec coverage (§5.10 orchestration):** CLI `install/migrate_config_v7.php [--dry-run] [--yes]` (Task 3); tokenizer parse, never includes (uses 4a `migration_extractor`); discover/lock (Task 3 source discovery + `flock`); classify (4a) + build-in-memory (Task 1 `plan`); atomic commit with timestamped backup (Task 2); keyed per `{host}.{entity}`, never merges two entities (backup dir + marker namespaced by `{host}.{entity}`); schema-versioned (`SCHEMA_VERSION` + marker); salt + unknown defines preserved (writers pass through). Explicitly deferred: subprocess boot-diff validation (4c-2, cutover-coupled) and Bun `.env` is written but not re-synced/verified here; fuller idempotency (no-op on identical re-run).

**Placeholder scan:** every step has complete code or an exact command + expected output. Sandbox parameterization makes the CLI test write only to a temp dir.

**Type consistency:** `migration_runner::plan()` returns `{artifacts, summary, entity}`, consumed by `dry_run_report()` and the CLI; `migration_committer::commit(artifacts, targets, backup_dir, env_keys)` consumes the same `artifacts` map; the five artifact keys (`env_php`/`env_bun`/`config`/`state`/`passthrough`) are identical across runner, committer, and CLI `$targets`. Reuses the verified 4a/4b signatures (`extract`, `classify`, the four `render*`).

**Carry-overs:** 4c-2 = pre-commit boot-diff validation (migrated-source assembler + diff vs the freshly-extracted old surface — where the 3b-3 value-mismatches should resolve once real values are migrated). Also: gitignore `config/local/*`, `config/state.php`, `../private/.env`; reconcile Phase-1 `sample.env` (INFO_KEY/INFORMATION now STATE→state.php); the real dev-box run is the controller's gated step (dry-run → review the 36-passthrough + ENV routing → sign-off → `--yes` → verify). The cutover (config.php→shim) remains after the migration populates the dev box's real values.
