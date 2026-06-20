<?php declare(strict_types=1);

require_once __DIR__ . '/class.migration_runner.php';
require_once __DIR__ . '/class.migration_committer.php';

/**
* CONFIG_AUTO_MIGRATE
* One-time, boot-safe transparent migration of a *v7-pre-flip* install (DB already on the v7
* schema; only the config layout is still the legacy config/config.php + config_db.php +
* config_areas.php + config_core.php) onto the v7 ../private/ .env layout. Invoked from
* config/bootstrap.php BEFORE env is loaded so a plain `git pull` is all an admin needs — and
* reused by the migrate_config_v7 CLI so the manual and automatic paths produce the SAME end state.
*
* Detection is cheap and unambiguous: legacy config files (config_core.php / config_db.php) exist
* ONLY on a pre-flip box, never after the flip; the completion sentinel (../private/.migration.json)
* marks "done". A genuine fresh download has neither → it falls through to the installer wizard.
*
* DEDALO_INSTALL_STATUS='installed' rides through verbatim from the legacy config_core.php (the
* classifier routes the catalog STATE constant into ../private/state.php), so an already-installed
* box stays installed and the wizard does not fire. No DB schema migration happens here — that is a
* separate, login-gated script and is out of scope.
*
* Safety: single-writer flock (concurrent requests wait, then see the sentinel and skip); the
* commit is whole-migration atomic (migration_committer G1); the sentinel is written LAST, so any
* crash before it leaves "sentinel absent" → a clean re-run. A recoverable refusal (a secret with a
* dynamic value that cannot be migrated, or an unwritable ../private) throws config_migrate_blocked
* so the loader can render an instruction page instead of booting a broken-but-alive box.
*/
final class config_auto_migrate {

	public const SENTINEL = '.migration.json';

	/** Legacy markers that exist ONLY on a pre-flip box (never post-flip). */
	private const LEGACY_FINGERPRINT = ['config_core.php', 'config_db.php'];

	/** All legacy files to migrate + quarantine, in include order (matches the CLI source list). */
	private const LEGACY_SOURCES = ['config.php', 'config_db.php', 'config_areas.php', 'config_core.php'];

	/** Cheap guard: true when a pre-flip box has not yet been migrated. */
	public static function needed(string $config_dir, string $private_dir) : bool {
		if (is_file($private_dir . '/' . self::SENTINEL)) {
			return false; // already migrated
		}
		foreach (self::LEGACY_FINGERPRINT as $f) {
			if (is_file($config_dir . '/' . $f)) {
				return true;
			}
		}
		return false; // fresh download → installer wizard handles it
	}

	/**
	* Run the one-time migration (auto path). Idempotent and lock-guarded.
	* @return array<string,string> committer report (empty if another request already finished it)
	* @throws config_migrate_blocked on a recoverable refusal (dropped secrets / unwritable private)
	*/
	public static function run(string $repo, string $config_dir, string $private_dir, string $bun_env, string $backup_base) : array {
		$lockfile = sys_get_temp_dir() . '/dedalo_migrate_config_v7.lock';
		$lock = fopen($lockfile, 'c');
		if ($lock === false || !flock($lock, LOCK_EX)) {
			throw new config_migrate_blocked('cannot acquire the migration lock');
		}
		try {
			// A concurrent request may have completed the migration while we waited on the lock.
			if (is_file($private_dir . '/' . self::SENTINEL)) {
				return [];
			}
			self::assert_writable($private_dir);

			$sources = [];
			foreach (self::LEGACY_SOURCES as $name) {
				$p = $config_dir . '/' . $name;
				if (is_file($p)) { $sources[] = $p; }
			}
			$catalog = require $repo . '/core/base/config/catalog/catalog.php';
			$plan    = migration_runner::plan($sources, $catalog);

			$host   = gethostname() ?: 'host';
			$entity = $plan['entity'] ?? 'entity';
			$stamp  = date('Ymd_His');
			$backup_dir = $backup_base . '/' . $host . '.' . $entity . '/' . $stamp;

			self::finalize($plan, $sources, $config_dir, $private_dir, $bun_env, $backup_dir, $host, $entity, $stamp, 'auto');

			return $plan['report'] ?? [];
		} finally {
			flock($lock, LOCK_UN);
			fclose($lock);
		}
	}

	/**
	* Shared commit path for BOTH the auto loader and the CLI: refuse on dropped secrets (G2),
	* commit the artifacts whole-migration-atomically, quarantine the legacy secret files out of the
	* web root, drop the backward-compat shim, then write the completion sentinel LAST.
	* Mutates $plan['report'] with the committer status map.
	*/
	public static function finalize(array &$plan, array $sources, string $config_dir, string $private_dir, string $bun_env, string $backup_dir, string $host, string $entity, string $stamp, string $via) : void {
		// G2 — never ship a box with silently-empty secrets.
		if (!empty($plan['dropped_secrets'])) {
			throw new config_migrate_blocked(
				'these secrets use a dynamic value and cannot be migrated automatically: '
				. implode(', ', $plan['dropped_secrets'])
				. ' — set them by hand in ' . $private_dir . '/.env, then retry.'
			);
		}

		$targets = [
			'env_php'     => $private_dir . '/.env',
			'env_bun'     => $bun_env,
			'state'       => $private_dir . '/state.php',
			'passthrough' => $private_dir . '/passthrough.php',
		];

		$plan['report'] = migration_committer::commit($plan['artifacts'], $targets, $backup_dir);

		// Quarantine the legacy secret files OUT of the web root, then drop the shim. Done before the
		// sentinel so that if a crash happens here, the next boot (sentinel still absent) repeats.
		self::quarantine($sources, $backup_dir);
		self::write_shim($config_dir);

		// Sentinel LAST = the commit marker; its presence is what tells the loader "already migrated".
		self::write_sentinel($private_dir, $host, $entity, $stamp, $via);
	}

	/** Move the legacy secret-bearing config files into the backup dir, out of the web root. */
	public static function quarantine(array $sources, string $backup_dir) : void {
		if (!is_dir($backup_dir) && !mkdir($backup_dir, 0700, true) && !is_dir($backup_dir)) {
			throw new config_migrate_blocked("cannot create quarantine dir {$backup_dir}");
		}
		foreach ($sources as $p) {
			if (is_file($p)) {
				// Checked, NOT best-effort: a secret-bearing legacy file left in the web root is a
				// real exposure. Throw BEFORE the sentinel is written so the next boot retries the
				// migration rather than sealing a half-quarantined box behind a "done" sentinel.
				if (!rename($p, $backup_dir . '/' . basename($p) . '.legacy')) {
					throw new config_migrate_blocked(
						"cannot quarantine legacy config {$p} out of the web root — move it by hand, then retry"
					);
				}
			}
		}
	}

	/** Generated, UNtracked config/config.php shim so out-of-repo callers keep working. */
	public static function write_shim(string $config_dir) : void {
		@file_put_contents(
			$config_dir . '/config.php',
			"<?php // generated shim — backward compat for out-of-repo callers; the real loader is bootstrap.php\n"
			. "require __DIR__ . '/bootstrap.php';\n"
		);
	}

	public static function write_sentinel(string $private_dir, string $host, string $entity, string $stamp, string $via) : void {
		file_put_contents($private_dir . '/' . self::SENTINEL, json_encode([
			'schema_version' => migration_runner::SCHEMA_VERSION,
			'key'            => $host . '.' . $entity,
			'stamp'          => $stamp,
			'via'            => $via,
		], JSON_PRETTY_PRINT) . "\n");
	}

	private static function assert_writable(string $private_dir) : void {
		if (!is_dir($private_dir)) {
			if (!@mkdir($private_dir, 0700, true) && !is_dir($private_dir)) {
				throw new config_migrate_blocked("cannot create {$private_dir} (check filesystem permissions)");
			}
		}
		if (!is_writable($private_dir)) {
			throw new config_migrate_blocked("{$private_dir} is not writable by this user");
		}
	}
}

/** Recoverable migration refusal — the loader catches it to show an instruction page, not a fatal. */
class config_migrate_blocked extends \RuntimeException {}
