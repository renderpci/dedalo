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
					// Empty ONLY when the returned array has no entries. Handle BOTH var_export
					// long-array `array ( )` (what config_writer/state_writer emit) and short `[ ]`.
					// Anything with entries (either syntax) is non-empty and must be written.
					return (bool) preg_match('/return\s*(?:array\s*\(\s*\)|\[\s*\])\s*;/', $content);
				}
				return false; // any other real token (e.g. T_IF for a define guard) => non-empty
			}
		}
		return true; // only header/comment tokens
	}//end is_empty_artifact
}
