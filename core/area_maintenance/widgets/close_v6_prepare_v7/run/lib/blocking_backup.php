<?php declare(strict_types=1);
/**
* BLOCKING_BACKUP — synchronous full pg_dump used as the migration prelude.
*
* The engine's backup::init_backup_sequence() spawns pg_dump in the BACKGROUND
* (nohup … & echo $!) and returns a PID immediately. That is wrong for a
* migration prelude: the schema/data rewrite could start before the dump has
* finished. This helper instead runs pg_dump SYNCHRONOUSLY and reports the exit
* code, so the runner can ABORT the whole migration if the backup fails.
*
* It reuses the exact same command primitives as backup::init_backup_sequence
* (core/backup/class.backup.php): system::get_pg_bin_path() + DBi::get_connection_string()
* + `pg_dump -F c -b` (custom compressed, pg_restore-compatible, blobs). The
* password is provided via PGPASSWORD by DBi::pg_exec()/pg_env_set() and never
* interpolated into the command line.
*
* Must be loaded AFTER the bundled engine bootstrap (needs DBi, system and the
* DEDALO_*_CONN constants).
*
* @package Dédalo
* @subpackage close_v6_prepare_v7
*/
final class prepare_v7_backup {


	/**
	* RUN
	* Runs a blocking, full custom-format pg_dump of the connected database.
	*
	* @param string $out_dir - directory where the .backup file is written (created if absent)
	* @return object - { result: bool, file: string|null, msg: string, cmd: string }
	*/
	public static function run(string $out_dir) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->file		= null;
			$response->msg		= '';
			$response->cmd		= '';

		// DB management opt-out honoured (same guard as backup::init_backup_sequence)
		if (defined('DEDALO_DB_MANAGEMENT') && DEDALO_DB_MANAGEMENT===false) {
			$response->msg = 'DEDALO_DB_MANAGEMENT is false: automatic backup is disabled. '
				. 'Take a manual backup and re-run with --skip-backup.';
			return $response;
		}

		// output directory
		if (!is_dir($out_dir)) {
			if (!@mkdir($out_dir, 0775, true) && !is_dir($out_dir)) {
				$response->msg = "Could not create backup directory: $out_dir";
				return $response;
			}
		}
		if (!is_writable($out_dir)) {
			$response->msg = "Backup directory is not writable: $out_dir";
			return $response;
		}

		// file name: <date>.<db>.postgres_prepare_v7.backup (custom format)
		$db			= (string)DEDALO_DATABASE_CONN;
		$stamp		= date('Y-m-d_His');
		$file_name	= $stamp . '.' . $db . '.postgres_prepare_v7.backup';
		$file_path	= rtrim($out_dir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $file_name;

		// command (mirrors backup::init_backup_sequence, but foreground)
		// -F c : custom compressed (pg_restore compatible)   -b : include blobs
		$pg_bin	= system::get_pg_bin_path();
		$cmd	= $pg_bin . 'pg_dump ' . DBi::get_connection_string()
			. ' -F c -b '
			. escapeshellarg($db)
			. ' > ' . escapeshellarg($file_path)
			. ' 2> ' . escapeshellarg($file_path . '.log');
		$response->cmd = $cmd;

		// run SYNCHRONOUSLY, capture exit code (DBi::pg_exec handles PGPASSWORD)
		$output      = [];
		$result_code = 0;
		DBi::pg_exec($cmd, $output, $result_code);

		// verify: exit 0 AND a non-empty file on disk
		$size = is_file($file_path) ? (int)filesize($file_path) : 0;
		if ($result_code !== 0 || $size < 1) {
			$err_tail = is_file($file_path . '.log')
				? trim((string)@file_get_contents($file_path . '.log'))
				: '';
			$response->msg = "pg_dump failed (exit $result_code, size $size bytes). "
				. ($err_tail !== '' ? 'Last error: ' . substr($err_tail, -800) : '');
			return $response;
		}

		$response->result	= true;
		$response->file		= $file_path;
		$response->msg		= "Backup OK: $file_path (" . number_format($size) . ' bytes)';

		return $response;
	}//end run


}//end prepare_v7_backup
