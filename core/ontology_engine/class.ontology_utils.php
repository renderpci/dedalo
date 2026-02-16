<?php declare(strict_types=1);
/**
 * ONTOLOGY_UTILS
 *
 * Complementary utilities used to get multiple records from the dd_ontology table.
 * Manages active and functional ontology records.
 * Used to interpret data, schemas, behaviors, etc., at runtime.
 * Resolves multiple active nodes and interfaces with the `dd_ontology` table.
 *
 * This is a read-only object for retrieval purposes.
 * Note: To modify ontology records, use core/ontology/class.ontology.php.
 */
class ontology_utils {



	// cache
	public static $ar_tipo_by_model_name_cache;
	public static $active_tlds_cache;



	/**
	 * GET_AR_TIPO_BY_MODEL
	 *
	 * Resolves all terms matching the given model name.
	 *
	 * @param string $model_name The model name to filter by (e.g., 'section', 'component_input_text').
	 * @return array List of found tipos.
	 */
	public static function get_ar_tipo_by_model( string $model_name ) : array {

		// static cache
		$cache_uid = $model_name;
		if(isset(self::$ar_tipo_by_model_name_cache[$cache_uid])) {
			return self::$ar_tipo_by_model_name_cache[$cache_uid];
		}

		// search terms with given model
		$result = dd_ontology_db_manager::search([
			'model' => $model_name
		]);

		$ar_result = ( $result===false ) ? [] : $result;

		// static cache
		self::$ar_tipo_by_model_name_cache[$cache_uid] = $ar_result;

		return $ar_result;
	}//end get_ar_tipo_by_model



	/**
	 * GET_AR_ALL_MODELS
	 *
	 * Retrieves all ontology records designated as models.
	 * Used in selectors to assign models to terms.
	 *
	 * @return array Array of model tipos, e.g., ["dd3", "dd1226", ...].
	 */
	public static function get_ar_all_models() : array {

		// search
		$result = dd_ontology_db_manager::search([
			'is_model' => true
		]);

		$all_models = ( $result===false ) ? [] : $result;

		return $all_models;
	}//end get_ar_all_models



	/**
	 * GET_AR_ALL_TIPO_OF_MODEL_TIPO
	 *
	 * Resolves all term IDs belonging to a specific model tipo.
	 * Example: dd6 => ["oh1", "dd917", ...]
	 *
	 * @param string $model_tipo The source model tipo (e.g., 'dd6' for sections).
	 * @return array Array of term IDs.
	 */
	public static function get_ar_all_tipo_of_model_tipo( string $model_tipo ) : array {

		// search
		$result = dd_ontology_db_manager::search([
			'model_tipo' => $model_tipo
		]);

		$ar_all_tipo = ( $result===false ) ? [] : $result;

		return $ar_all_tipo;
	}//end get_ar_all_tipo_of_model_tipo



	/**
	 * CHECK_TIPO_IS_VALID
	 *
	 * Checks if a given tipo is usable by attempting to resolve its model.
	 * If the model is empty, the tipo is considered invalid (ontology damage or missing TLD).
	 *
	 * @param string|null $tipo The tipo to validate (section, component, etc.).
	 * @return bool True if valid, false otherwise.
	 */
	public static function check_tipo_is_valid( ?string $tipo ) : bool {

		if($tipo===null) {
			return false;
		}

		// check tipo is safe. Exclude bad formed tipos
		if (!safe_tipo($tipo)) {
			return false;
		}

		// try to resolve model. If empty, the tipo do not exists in dd_ontology
		$model = ontology_node::get_model_by_tipo( $tipo, true );
		if (empty($model)) {
			return false;
		}

		return true;
	}//end check_tipo_is_valid



	/**
	 * GET_ACTIVE_TLDS
	 *
	 * Retrieves all active/installed TLDs from the `dd_ontology` table.
	 *
	 * @return array List of installed TLDs (e.g., ['dd', 'activity', 'oh']).
	 */
	public static function get_active_tlds() : array {

		// Cache
		if(isset(self::$active_tlds_cache)){
			return self::$active_tlds_cache;
		}

		$table      = ontology_node::$table;
		$sql_query  = "SELECT \"tld\" FROM \"{$table}\" GROUP BY \"tld\"";
		$result     = matrix_db_manager::exec_search($sql_query);

		$active_tlds = [];
		if ($result) {
			while($row = pg_fetch_assoc($result)) {
				$active_tlds[] = $row['tld'];
			}
		}

		self::$active_tlds_cache = $active_tlds;


		return $active_tlds;
	}//end get_active_tlds



	/**
	 * CHECK_ACTIVE_TLD
	 *
	 * Checks if the TLD of a given tipo is available and installed.
	 *
	 * @param string $tipo The tipo to check.
	 * @return bool True if the TLD is active.
	 */
	public static function check_active_tld( string $tipo ) : bool {

		// allow 'section_id' as valid tipo for SQO uses
		if ($tipo==='section_id') {
			return true;
		}

		$active_tlds = ontology_utils::get_active_tlds();
		$current_tld = get_tld_from_tipo($tipo);

		return in_array($current_tld, $active_tlds);
	}//end check_active_tld



	/**
	 * DELETE_TLD_NODES
	 *
	 * Removes all ontology records belonging to a specific TLD.
	 *
	 * @param string $tld The TLD identifier (e.g., 'oh').
	 * @return bool True on success, false on failure.
	 */
	public static function delete_tld_nodes( string $tld ) : bool {

		$table = ontology_node::$table; // dd_ontology | dd_ontology_backup

		// remove any other things than tld in the tld string
		$safe_tld = safe_tld($tld);
		if ($safe_tld!==$tld) {
			debug_log(__METHOD__
				. " Error deleting tld from table dd_ontology. tld is not safe" . PHP_EOL
				. ' tld: ' . to_string($tld) . PHP_EOL
				. ' safe_tld: ' . to_string($safe_tld)
				, logger::ERROR
			);
			return false;
		}

		// dd_ontology. delete terms (records)
		$sql_query = 'DELETE FROM "' . $table . '" WHERE "tld" = $1;';
		$result = matrix_db_manager::exec_search($sql_query, [$safe_tld]);

		if ($result === false) {
			debug_log(__METHOD__ . " Error deleting tld records. tld: {$tld}", logger::ERROR);
			return false;
		}

		return true;
	}//end delete_tld_nodes



	/**
	 * CREATE_BK_TABLE
	 *
	 * Creates a backup table `dd_ontology_bk` from selected TLDs.
	 * Used to protect records during major ontology operations.
	 *
	 * @param array $tlds Array of TLD identifiers.
	 * @return bool True on success.
	 */
	public static function create_bk_table( array $tlds ) : bool {

		$table = ontology_node::$table;
		$conn  = DBi::_getConnection();
		$where_clauses = [];
		foreach ($tlds as $tld) {
			$where_clauses[] = "tld = " . pg_escape_literal($conn, $tld);
		}
		$where_sql = implode(' OR ', $where_clauses);

		// 1. Drop existing backup table
		$sql_drop = 'DROP TABLE IF EXISTS "dd_ontology_bk" CASCADE;';
		pg_query($conn, $sql_drop);

		// 2. Create new backup table with selected records
		$sql_create = "CREATE TABLE dd_ontology_bk AS SELECT * FROM \"{$table}\" WHERE {$where_sql};";
		$result = pg_query($conn, $sql_create);

		if ($result === false) {
			debug_log(__METHOD__ . ' Failed to create backup table dd_ontology_bk', logger::ERROR);
			return false;
		}

		return true;
	}//end create_bk_table



	/**
	 * DELETE_BK_TABLE
	 *
	 * Removes the backup table `dd_ontology_bk`.
	 *
	 * @return bool True on success.
	 */
	public static function delete_bk_table() : bool {

		$sql_query = '
			DROP TABLE IF EXISTS "dd_ontology_bk" CASCADE;
		';

		$result = pg_query(DBi::_getConnection(), $sql_query);

		if($result===false) {
			debug_log(__METHOD__
				. ' Failed delete_bk_table dd_ontology_bk' .PHP_EOL
				. 'query: ' . to_string($sql_query)
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end delete_bk_table



	/**
	 * RESTORE_FROM_BK_TABLE
	 *
	 * Restores ontology records from the backup table for specific TLDs.
	 *
	 * @param array $tlds Array of TLD identifiers to restore.
	 * @return bool True on success.
	 */
	public static function restore_from_bk_table( array $tlds ) : bool {

		// delete original nodes in dd_ontology
		foreach ($tlds as $tld) {
			self::delete_tld_nodes($tld);
		}

		$table = ontology_node::$table;
		$params = [];
		$where_clauses = [];
		foreach ($tlds as $index => $tld) {
			$params[] = $tld;
			$where_clauses[] = "\"tld\" = $" . ($index + 1);
		}
		$where_sql = implode(' OR ', $where_clauses);

		$sql_query = "
			INSERT INTO \"{$table}\"
			SELECT * FROM \"dd_ontology_bk\" WHERE {$where_sql};
		";

		$result = matrix_db_manager::exec_search($sql_query, $params);

		if ($result === false) {
			debug_log(__METHOD__ . ' Failed to restore from backup table', logger::ERROR);
			return false;
		}

		return true;
	}//end restore_from_bk_table



}//end class ontology_utils
