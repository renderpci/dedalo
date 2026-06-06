<?php declare(strict_types=1);

/**
 * CLASS INSTALL_ONTOLOGY_MANAGER
 * Encapsulates ontology cleaning, recovery file operations,
 * and install database file export.
 *
 * @package Dedalo
 * @subpackage Install
 */
class install_ontology_manager {

	/**
	* CLEAN_ONTOLOGY
	* @return object $response
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

		$response->result 	= true;
		$response->msg 		= 'OK. Request done';

		return $response;
	}//end clean_ontology

	/**
	* BUILD_RECOVERY_VERSION_FILE
	* Creates the recovery file 'dd_ontology_recovery.sql' from current 'dd_ontology' table
	* @return object $response
	*/
	public static function build_recovery_version_file() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// preserve_tld list
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
			$command	= DB_BIN_PATH . 'pg_dump -d '.escapeshellarg(DEDALO_DATABASE_CONN).' '.$config->host_line.' '.$config->port_line
						  .' -U '.escapeshellarg(DEDALO_USERNAME_CONN).' -t dd_ontology_recovery | gzip > '.escapeshellarg($sql_file);

			debug_log(__METHOD__
				." Executing terminal DB command " . PHP_EOL
				.to_string($command) . PHP_EOL
				, logger::WARNING
			);

			$command_res = shell_exec($command);
			debug_log(__METHOD__." Exec response (shell_exec) ".to_string($command_res), logger::DEBUG);

		// delete temp table
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
	* Import the SQL file creating table 'dd_ontology_recovery'
	* Source file is a SQL string file located at /dedalo/install/db/dd_ontology_recovery.sql
	* @return object $response
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
			$command = 'gunzip -c ' . escapeshellarg($sql_file) . ' | '
					  . DB_BIN_PATH . 'psql -d '.escapeshellarg(DEDALO_DATABASE_CONN).' '.$config->host_line.' '.$config->port_line. ' -U '.escapeshellarg(DEDALO_USERNAME_CONN);

			debug_log(__METHOD__
				." Executing terminal DB command " . PHP_EOL
				.to_string($command) . PHP_EOL
				, logger::WARNING
			);

			// exec command
			$command_res = shell_exec($command);

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
	* @return object $response
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
			if (file_exists($target_file_path_compress)) {
				$target_file_path_archive = str_replace('.gz', '_'.time().'.gz', $target_file_path_compress);
				rename($target_file_path_compress, $target_file_path_archive);
			}

		// terminal command pg_dump
			// SEC-041 defence-in-depth: shell-quote user, role, db name, output path.
			$command  = DB_BIN_PATH . 'pg_dump '.$config->host_line.' '.$config->port_line.' -U '.escapeshellarg(DEDALO_USERNAME_CONN).' -F p -b -v --no-owner --no-privileges --role='.escapeshellarg(DEDALO_USERNAME_CONN).' '.escapeshellarg($db_install_name);
			$command .=' | gzip > '.escapeshellarg($target_file_path_compress);

			debug_log(__METHOD__." Executing terminal DB command ".to_string($command), logger::WARNING);
			if ($exec) {
				$command_res = shell_exec($command);
				debug_log(__METHOD__." Exec response (shell_exec) ".to_string($command_res), logger::DEBUG);
			}

		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;

		return $response;
	}//end build_install_db_file

}//end class install_ontology_manager
