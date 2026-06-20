<?php declare(strict_types=1);

/**
* MIGRATION_COMMITTER
* The migration's only filesystem mutation. WHOLE-MIGRATION ATOMIC (G1): every non-empty
* artifact is first STAGED to a temp file in its target dir; only once ALL stage successfully
* are the existing targets backed up (each backup timestamped, so a later commit never overwrites
* an earlier commit's backup of the same file) and the temps renamed into
* place. A failure during staging discards every temp and touches no target — so a crash / disk-
* full / permission error never leaves ../private half-written (which would boot as a broken-but-
* alive box). .env targets get chmod 0600. Artifacts with no real content (empty / header-only)
* are skipped, so an install with no passthrough/overrides does not get stray files. The caller
* writes the completion sentinel AFTER this returns, so "sentinel absent" always means "re-run me".
* Returns a per-target status report.
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
		$staged = []; // key => ['tmp'=>..., 'path'=>...]  (everything renamed only after all stage)

		// --- phase 1: stage every non-empty artifact to a temp file; rename NOTHING yet ---
		try {
			foreach ($targets as $key => $path) {
				$content = $artifacts[$key] ?? '';
				if (self::is_empty_artifact($content)) {
					$report[$key] = 'skipped-empty';
					continue;
				}
				$dir = dirname($path);
				if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
					throw new \RuntimeException("migration_committer: cannot create target dir {$dir}");
				}
				$tmp = $dir . '/.' . basename($path) . '.tmp.' . getmypid();
				if (file_put_contents($tmp, $content) === false) {
					@unlink($tmp);
					throw new \RuntimeException("migration_committer: cannot stage {$path}");
				}
				$staged[$key] = ['tmp' => $tmp, 'path' => $path];
			}
		} catch (\Throwable $e) {
			foreach ($staged as $s) { @unlink($s['tmp']); } // nothing renamed → targets untouched
			throw $e;
		}

		// --- phase 2: all staged OK → back up existing targets, then rename temps into place ---
		// Timestamp shared by every backup in THIS commit but distinct across commits, so a later
		// commit (e.g. set_install_status re-writing state.php after persist_config) never clobbers
		// an earlier backup. hrtime() suffix guarantees uniqueness even within the same second.
		$backup_stamp = date('Ymd_His') . '_' . substr((string) hrtime(true), -6);
		foreach ($staged as $key => $s) {
			$backed_up = false;
			if (is_file($s['path'])) {
				if (!is_dir($backup_dir) && !mkdir($backup_dir, 0700, true) && !is_dir($backup_dir)) {
					throw new \RuntimeException("migration_committer: cannot create backup dir {$backup_dir}");
				}
				if (!copy($s['path'], $backup_dir . '/' . basename($s['path']) . '.' . $backup_stamp . '.bak')) {
					throw new \RuntimeException("migration_committer: backup failed for {$s['path']}");
				}
				$backed_up = true;
			}
			if (!rename($s['tmp'], $s['path'])) {
				@unlink($s['tmp']);
				throw new \RuntimeException("migration_committer: atomic write failed for {$s['path']}");
			}
			if (in_array($key, $env_keys, true)) {
				@chmod($s['path'], 0600);
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
					// Empty ONLY when the returned array has no entries. Handle BOTH var_export
					// long-array `array ( )` (what state_writer emits) and short `[ ]`.
					// Anything with entries (either syntax) is non-empty and must be written.
					return (bool) preg_match('/return\s*(?:array\s*\(\s*\)|\[\s*\])\s*;/', $content);
				}
				return false; // any other real token (e.g. T_IF for a define guard) => non-empty
			}
		}
		return true; // only header/comment tokens
	}//end is_empty_artifact
}
