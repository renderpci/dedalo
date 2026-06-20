<?php declare(strict_types=1);

/**
* CLASS INSTALL_ONTOLOGY_MANAGER
* Manages ontology-level database operations used during install packaging and
* disaster recovery.
*
* Responsibilities:
* - Strip dd_ontology (and the optional matrix_descriptors_dd table) of every
*   row whose top-level-domain (TLD) is not on the preservation whitelist
*   (`install_config_manager::get_config()->to_preserve_tld`).  This produces
*   the lean "install edition" ontology that ships with new Dédalo instances.
* - Export the preserved core/resources ontology rows to a compressed pg_dump
*   file (dd_ontology_recovery.sql.gz) via a temp table so the live table is
*   never altered.
* - Re-import that same file into the running database as a recovery operation.
* - Produce the full install-database SQL dump (dedalo7_install.pgsql.gz) that
*   bootstraps new instances.
*
* All methods return a stdClass response following the Dédalo install response
* contract:
*   (object){ result: bool, msg: string }
* Callers must check `$response->result === true` before proceeding.
*
* Relationships:
* - Depends on `install_config_manager::get_config()` for the TLD whitelist,
*   resolved file paths, and connection parameters (never hardcodes them).
* - Depends on `install_config_manager::get_db_install_conn()` for a
*   `PgSql\Connection` pointing at the install target database.
* - Uses `DBi::_getConnection()` (shared production connection) for operations
*   on the live database.
* - Called exclusively through `class.install.php`, which exposes a thin
*   delegation facade for each method.
* - Calls `diffusion_utils::delete_section_map_cache_file()` after ontology
*   cleanup to keep the diffusion section-map cache coherent.
*
* Security note (SEC-041): every value interpolated into shell commands passes
* through `escapeshellarg()`.  Connection constants come from
* `config/config.php` (deployer-controlled, not HTTP-reachable), so quoting is
* defence-in-depth.
*
* @package Dédalo
* @subpackage Install
*/
final class install_ontology_manager {

	/**
	* CONSTRUCTOR
	* Static-only utility: instantiation is disallowed.
	*/
	private function __construct() {}


	/**
	* CLEAN_ONTOLOGY
	* Removes non-preserved rows from dd_ontology and (if it exists)
	* matrix_descriptors_dd, then REINDEXes both tables.
	*
	* Preservation is controlled by `install_config_manager::get_config()->to_preserve_tld`
	* (e.g. 'dd', 'rsc', 'lg', 'hierarchy', 'ontology', 'ontologytype').  Any
	* row whose `tld` column is not in that list is deleted from dd_ontology.
	* For matrix_descriptors_dd the check is on the `parent` column using a
	* regex that matches '^<tld>[0-9]+'; rows that match NONE of the preserved
	* TLD patterns are deleted.
	*
	* After the DELETE statements the tables are REINDEXed so the planner sees
	* accurate index statistics for the now-lean tables.
	*
	* Side-effect: if DEDALO_ENTITY and diffusion_utils are available,
	* `diffusion_utils::delete_section_map_cache_file()` is called to invalidate
	* the on-disk diffusion section-map cache derived from dd_ontology.
	*
	* @return object $response - { result: bool, msg: string }
	*/
	public static function clean_ontology() : object {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config				= install_config_manager::get_config();
			$db_install_conn	= install_config_manager::get_db_install_conn();
			$exec				= true;

		// clean dd_ontology
		// Build a quoted IN-list from the TLD whitelist (e.g. 'dd','rsc','lg',…)
		// and delete every row whose tld falls outside that list.
			$items	= array_map(function($el){
					return '\''.$el.'\'';
				}, $config->to_preserve_tld);
			$line	= implode(',', $items);
			$sql	='
				DELETE
				FROM "dd_ontology"
				WHERE
				tld NOT IN('.$line.');
			';
			debug_log(__METHOD__
				. " Executing DB query " .PHP_EOL
				. $sql
				, logger::WARNING
			);
			if ($exec) {
				$result = pg_query($db_install_conn, $sql);
				if (!$result) {
					$msg = " Error on db execution (dd_ontology): ".pg_last_error($db_install_conn);
					debug_log(__METHOD__.$msg, logger::ERROR);
					$response->msg = $msg;
					return $response;
				}
			}

		// clean matrix_descriptors_dd
		// matrix_descriptors_dd is an optional table; skip silently if it does
		// not exist (early installs or stripped databases may omit it).
		// The parent column stores values like 'dd1234', 'rsc567'; the regex
		// '^<tld>[0-9]+' matches preserved TLD prefixes.  A row is kept only
		// if it matches at least one of the preserved patterns (AND-joining the
		// negated conditions means delete rows that match NONE of them).
			if (DBi::check_table_exists('matrix_descriptors_dd')) {
				$items	= array_map(function($el){
					return 'parent !~ \'^'.$el.'[0-9]+\'';
				}, $config->to_preserve_tld);
				$line	= implode(' AND ', $items);
				$sql = '
					DELETE
					FROM "matrix_descriptors_dd"
					WHERE
					'.$line.';
				';
				debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
				if ($exec) {
					$result   = pg_query($db_install_conn, $sql);
					if (!$result) {
						$msg = " Error on db execution (matrix_descriptors_dd): ".pg_last_error($db_install_conn);
						debug_log(__METHOD__.$msg, logger::ERROR);
						$response->msg = $msg;
						return $response;
					}
				}
			}

		// re-index ontology tables
		// REINDEX rebuilds the B-tree and GIN indexes after the bulk DELETE so
		// the planner uses correct statistics and index bloat is reclaimed.
			$sql = '
					REINDEX TABLE "dd_ontology";
			';
			if (DBi::check_table_exists('matrix_descriptors_dd')) {
				$sql .= '
					REINDEX TABLE "matrix_descriptors_dd";
				';
			}
			debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
			if ($exec) {
				$result   = pg_query($db_install_conn, $sql);
				if (!$result) {
					debug_log(__METHOD__." Error on db execution (re-index ontology tables): ".pg_last_error($db_install_conn), logger::ERROR);
					return $response;
				}
			}

		// dd_ontology was wiped down to the preserved TLDs: invalidate the
		// ontology-derived "sections with diffusion" map (defensive — guard the
		// boot context where the entity/cache path may not be resolvable yet).
			if (defined('DEDALO_ENTITY') && class_exists('diffusion_utils')) {
				diffusion_utils::delete_section_map_cache_file();
			}

		$response->result 	= true;
		$response->msg 		= 'OK. Request done';

		return $response;
	}//end clean_ontology

	/**
	* BUILD_RECOVERY_VERSION_FILE
	* Exports the preserved core ontology rows to a gzip-compressed SQL file
	* (install/db/dd_ontology_recovery.sql.gz) for disaster recovery.
	*
	* Workflow:
	* 1. Create a temporary table `dd_ontology_recovery` (LIKE dd_ontology INCLUDING ALL)
	*    and populate it with the rows whose `tld` is in the hard-coded recovery
	*    whitelist ('dd', 'rsc', 'lg', 'hierarchy', 'ontology', 'ontologytype').
	*    Note: this whitelist is narrower than `to_preserve_tld` from config and
	*    is defined locally inside this method.
	* 2. Run `pg_dump -t dd_ontology_recovery | gzip > dd_ontology_recovery.sql.gz`
	*    to export only that temporary table to the destination file.
	* 3. Drop the temporary table regardless of the dump result.
	*
	* The destination file path is:
	*   DEDALO_ROOT_PATH . '/install/db/dd_ontology_recovery.sql.gz'
	*
	* On success the response object carries an additional `file_size` (string,
	* bytes) property so callers can confirm the file was written.
	*
	* @return object $response - { result: bool, msg: string, errors: array, [file_size: string] }
	*/
	public static function build_recovery_version_file() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// preserve_tld list
		// (!) This local list is intentionally narrower than to_preserve_tld in
		// get_config(); it captures only the absolute core TLDs that must be
		// restorable in an emergency and is not driven by the install config.
			$preserve_tld = [
				'dd',
				'rsc',
				'lg',
				'hierarchy',
				'ontology',
				'ontologytype'
			];
			$preserve_tld_string = "'".implode("','", $preserve_tld)."'";

		// clone dd_ontology table to dd_ontology_recovery
		// LIKE … INCLUDING ALL copies all constraints, indexes, and defaults so
		// pg_dump produces a self-contained, re-importable table definition.
			$sql = '
				DROP TABLE IF EXISTS "dd_ontology_recovery" CASCADE;
				CREATE TABLE "dd_ontology_recovery" ( LIKE "dd_ontology" INCLUDING ALL );
				INSERT INTO "dd_ontology_recovery" SELECT * FROM "dd_ontology" WHERE tld IN ('.$preserve_tld_string.');
			';
			$result	= pg_query(DBi::_getConnection(), $sql);
			if (!$result) {
				$msg = " Error on db execution (clone table dd_ontology): ".pg_last_error(DBi::_getConnection());
				debug_log(__METHOD__
					. $msg . PHP_EOL
					. $sql
					, logger::ERROR
				);
				$response->msg = $msg;
				$response->errors[] = 'failed creating dd_ontology_recovery table';

				return $response; // return error here !
			}

		// export to file
			// terminal command pg_dump
			$config		= install_config_manager::get_config();
			$sql_file	= DEDALO_ROOT_PATH . '/install/db/dd_ontology_recovery.sql.gz';
			// SEC-041 defence-in-depth.
			// Dump only the temp table (-t dd_ontology_recovery) and pipe directly
			// through gzip; the destination path is derived from DEDALO_ROOT_PATH
			// (server-controlled) but quoted for safety.
			$command	= system::get_pg_bin_path() . 'pg_dump -d '.escapeshellarg(DEDALO_DATABASE_CONN).' '.$config->host_line.' '.$config->port_line
						  .' -U '.escapeshellarg(DEDALO_USERNAME_CONN).' -t dd_ontology_recovery | gzip > '.escapeshellarg($sql_file);

			debug_log(__METHOD__
				." Executing terminal DB command " . PHP_EOL
				.to_string($command) . PHP_EOL
				, logger::WARNING
			);

			// pg_shell_exec authenticates via PGPASSWORD (no ~/.pgpass), so the DB may be remote.
			$command_res = install_config_manager::pg_shell_exec($command);
			debug_log(__METHOD__." Exec response (shell_exec) ".to_string($command_res), logger::DEBUG);

		// delete temp table
		// Always clean up the temp table even if the dump returned no output;
		// shell_exec returns null on success (no stdout from gzip redirect).
			$sql = '
				DROP TABLE IF EXISTS "dd_ontology_recovery" CASCADE;
			';
			$result	= pg_query(DBi::_getConnection(), $sql);
			if (!$result) {
				$msg = " Error on db execution (delete table dd_ontology_recovery): ".pg_last_error(DBi::_getConnection());
				debug_log(__METHOD__
					. $msg . PHP_EOL
					. $sql
					, logger::ERROR
				);
				$response->msg = $msg;
				$response->errors[] = 'failed deleting dd_ontology_recovery table';

				return $response; // return error here !
			}

		// response OK
			$response->result		= true;
			$response->msg			= 'OK. Request done successfully';
			$response->file_size	= filesize($sql_file) . ' Bytes';

		return $response;
	}//end build_recovery_version_file

	/**
	* RESTORE_DD_ONTOLOGY_RECOVERY_FROM_FILE
	* Imports the gzip-compressed recovery file back into the running database
	* via a `gunzip | psql` pipeline.
	*
	* Source file: DEDALO_ROOT_PATH . '/install/db/dd_ontology_recovery.sql.gz'
	* This file must have been created by `build_recovery_version_file()`.
	*
	* The pipeline recreates the `dd_ontology_recovery` table (with its data)
	* inside the current database.  It does not modify the live `dd_ontology`
	* table — a separate step is required to merge or swap the tables if a full
	* ontology restore is needed.
	*
	* The method returns early with an error if the source .sql.gz file does not
	* exist.  No pre-flight schema checks are performed; psql errors are logged
	* but not inspected (shell_exec captures stdout, not stderr).
	*
	* @return object $response - { result: bool, msg: string, errors: array }
	*/
	public static function restore_dd_ontology_recovery_from_file() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// config
			$config = install_config_manager::get_config();

		// sql_file: dd_ontology_recovery.sql
			$sql_file = DEDALO_ROOT_PATH . '/install/db/dd_ontology_recovery.sql.gz';
			if (!file_exists($sql_file)) {
				$msg = " Error on table restore. File do not exists";
				debug_log(__METHOD__
					. $msg . PHP_EOL
					. 'sql_file: ' . $sql_file
					, logger::ERROR
				);
				$response->msg = $msg;
				$response->errors[] = 'source sql_file do not exists';

				return $response; // return error here !
			}

		// command
			// SEC-041 defence-in-depth.
			// Decompress on-the-fly with gunzip -c (write to stdout, keep the .gz)
			// and feed directly into psql.  The database and user values are
			// shell-quoted even though they originate from server-controlled constants.
			$command = 'gunzip -c ' . escapeshellarg($sql_file) . ' | '
					  . system::get_pg_bin_path() . 'psql -d '.escapeshellarg(DEDALO_DATABASE_CONN).' '.$config->host_line.' '.$config->port_line. ' -U '.escapeshellarg(DEDALO_USERNAME_CONN);

			debug_log(__METHOD__
				." Executing terminal DB command " . PHP_EOL
				.to_string($command) . PHP_EOL
				, logger::WARNING
			);

			// exec command (PGPASSWORD auth via pg_shell_exec; DB may be remote)
			$command_res = install_config_manager::pg_shell_exec($command);

			debug_log(__METHOD__
				." Exec response (shell_exec) " . PHP_EOL
				.to_string($command_res) . PHP_EOL
				, logger::WARNING
			);

		$response->result	= true;
		$response->msg		= 'OK. Request done successfully';

		return $response;
	}//end restore_dd_ontology_recovery_from_file

	/**
	* BUILD_INSTALL_DB_FILE
	* Exports the install database (dedalo7_install) to a gzip-compressed plain
	* SQL dump file that is bundled with new Dédalo instances.
	*
	* The target file path is resolved from
	* `install_config_manager::get_config()->target_file_path_compress`
	* (typically DEDALO_ROOT_PATH/install/db/dedalo7_install.pgsql.gz).
	*
	* If the target file already exists it is renamed to a timestamped archive
	* (e.g. …_1718000000.gz) before the new dump is written, so the previous
	* version is not silently overwritten.
	*
	* Flags passed to pg_dump:
	*   -F p  — plain (text) format, suitable for psql replay
	*   -b    — include large objects
	*   -v    — verbose output (logged at DEBUG level)
	*   --no-owner / --no-privileges — roles are re-applied on import
	*   --role — set the role for the dump session
	*
	* The method verifies that the install database connection is reachable before
	* running the dump; an unreachable database returns an error immediately.
	*
	* @return object $response - { result: bool, msg: string }
	*/
	public static function build_install_db_file() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__.' ';

		// short vars
			$config						= install_config_manager::get_config();
			$exec						= true;
			$target_file_path			= $config->target_file_path;
			$target_file_path_compress	= $config->target_file_path_compress;
			$db_install_name			= $config->db_install_name;
			$db_install_conn			= install_config_manager::get_db_install_conn();
			// check target install database exists and connection is reliable
			if ($db_install_conn===false) {
				$msg = ' Error. DDBB connection error. Verify database "'.$db_install_name.'" exists and is accessible';
				debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
				$response->msg .= $msg;
				return $response;
			}

		// rename old version if exists
		// Preserve the previous dump as a timestamped archive so it can be
		// recovered if the new dump is incomplete or corrupt.
			if (file_exists($target_file_path_compress)) {
				$target_file_path_archive = str_replace('.gz', '_'.time().'.gz', $target_file_path_compress);
				rename($target_file_path_compress, $target_file_path_archive);
			}

		// terminal command pg_dump
			// SEC-041 defence-in-depth: shell-quote user, role, db name, output path.
			$command  = system::get_pg_bin_path() . 'pg_dump '.$config->host_line.' '.$config->port_line.' -U '.escapeshellarg(DEDALO_USERNAME_CONN).' -F p -b -v --no-owner --no-privileges --role='.escapeshellarg(DEDALO_USERNAME_CONN).' '.escapeshellarg($db_install_name);
			$command .=' | gzip > '.escapeshellarg($target_file_path_compress);

			debug_log(__METHOD__." Executing terminal DB command ".to_string($command), logger::WARNING);
			if ($exec) {
				// pg_shell_exec authenticates via PGPASSWORD (no ~/.pgpass), so the DB may be remote.
				$command_res = install_config_manager::pg_shell_exec($command);
				debug_log(__METHOD__." Exec response (shell_exec) ".to_string($command_res), logger::DEBUG);
			}

		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;

		return $response;
	}//end build_install_db_file

}//end class install_ontology_manager
