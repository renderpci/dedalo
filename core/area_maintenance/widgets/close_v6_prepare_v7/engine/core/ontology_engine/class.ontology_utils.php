<?php declare(strict_types=1);
/**
* CLASS ONTOLOGY_UTILS
* Bulk read and maintenance utilities for the `dd_ontology` table.
*
* Responsibilities:
* - Query multiple ontology nodes at once (by model name, model tipo, is_model flag, or TLD).
* - Validate individual tipos against the live ontology (safe format + model resolution).
* - Manage the set of active TLDs (Top Level Domains / ontology namespaces) with a two-level
*   cache: an in-process static array and a persisted PHP file written by dd_cache.
* - Provide DBA-level helpers for atomic TLD replacement (backup → delete → insert → restore on
*   failure) used by `ontology::regenerate_records_in_dd_ontology()`.
*
* Relationships:
* - Delegates single-node lookups to `ontology_node` (class.ontology_node.php).
* - Delegates multi-node DB queries to `dd_ontology_db_manager` (class.dd_ontology_db_manager.php).
* - Issues raw PostgreSQL queries through `matrix_db_manager` and `DBi` for operations that need
*   DDL (CREATE TABLE / DROP TABLE) or bulk DELETE outside the ORM layer.
* - Called by `class.locator.php`, `class.common.php`, `trait.request_config_ddo.php`,
*   `class.component_relation_common.php`, and `class.ontology.php`.
*
* Read-only note: This class only reads ontology data or performs maintenance.
* To create, update, or structurally modify ontology records use `core/ontology/class.ontology.php`.
*
* @package Dédalo
* @subpackage Core
*/
class ontology_utils {



	/**
	* CLASS VARS
	*/

		/**
		 * In-process singleton cache: maps model name → array of matching tipos.
		 * Populated on first call to get_ar_tipo_by_model() for a given name and reused for the
		 * lifetime of the PHP process. Cleared by common::clear() on request boundaries.
		 * @var array $ar_tipo_by_model_name_cache
		 */
		public static array $ar_tipo_by_model_name_cache = [];

		/**
		 * In-process singleton cache for the list of installed TLDs.
		 * Null means "not yet loaded"; populated by get_active_tlds() and never evicted within a
		 * single request. The authoritative source is the disk cache written by dd_cache.
		 * @var ?array $active_tlds_cache
		 */
		public static ?array $active_tlds_cache = null;

		/**
		 * Filename used by dd_cache to persist the active TLD list across requests.
		 * The cache is invalidated externally (e.g., after a TLD import) by deleting this file.
		 * @var string $active_tlds_cache_file_name
		 */
		public static string $active_tlds_cache_file_name = 'cache_active_tlds.php';



	/**
	 * GET_AR_TIPO_BY_MODEL
	 * Returns all tipo identifiers whose `model` column matches the given model name.
	 *
	 * Results are memoised in `$ar_tipo_by_model_name_cache` so repeated calls within the same
	 * request are free. The cache key is the model name string itself.
	 *
	 * @param string $model_name - Ontology model name to filter by (e.g. 'section',
	 *                             'component_input_text'). Must be non-empty.
	 * @return array - List of tipo strings that carry this model. Empty array when none found or
	 *                 when the DB query fails.
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
	 * Returns all ontology records that are themselves model definitions (is_model = true).
	 *
	 * Used primarily in ontology-editor UIs to populate model selectors when assigning a model
	 * type to a new ontology node. Examples of model tipos: 'dd3' (section), 'dd6' (section_list),
	 * 'dd918' (component_input_text).
	 *
	 * @return array - Array of tipo strings flagged as models. Empty array when none found or on
	 *                 DB failure.
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
	 * Returns all tipo identifiers that belong to a specific model tipo.
	 *
	 * Inverse of get_ar_tipo_by_model(): where that method accepts a model name string,
	 * this method accepts a tipo identifier (e.g. 'dd6' for the section_list model).
	 * Used when enumerating all ontology nodes that share the same structural blueprint.
	 * Example: get_ar_all_tipo_of_model_tipo('dd6') → ['oh1', 'dd917', ...].
	 *
	 * @param string $model_tipo - The tipo of the model node (e.g. 'dd6' for sections).
	 * @return array - Array of tipo strings that reference this model tipo. Empty on failure.
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
	 * Determines whether a tipo is usable at runtime: well-formed, exists in the ontology, and
	 * has a resolvable model (or is itself a model node).
	 *
	 * Three-stage check:
	 * 1. Null guard — returns false immediately for null input.
	 * 2. Format guard via safe_tipo() — rejects strings that do not match /^[a-z]{2,}[0-9]+$/
	 *    (e.g. SQL injection payloads, empty strings, or malformed identifiers).
	 * 3. Ontology guard — the tipo must exist in dd_ontology with a non-empty model; model nodes
	 *    (is_model = true) bypass the model-resolution step because they are structural roots.
	 *
	 * Callers use this as a fast validation gate before building request configs or locators, to
	 * silently drop references to tipos from uninstalled TLDs or deleted records.
	 *
	 * @param string|null $tipo - The tipo identifier to validate (e.g. 'oh1', 'dd345').
	 * @return bool - True if the tipo is safe, exists, and has a valid model.
	 */
	public static function check_tipo_is_valid( ?string $tipo ) : bool {

		if($tipo===null) {
			return false;
		}

		// check tipo is safe. Exclude bad formed tipos
		if (!safe_tipo($tipo)) {
			return false;
		}

		// is model
		$ontology_node = ontology_node::get_instance($tipo);
		$is_model = $ontology_node->get_is_model();
		if ($is_model === true) {
			return true;
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
	 * Returns the list of TLD namespaces currently installed in the `dd_ontology` table.
	 *
	 * Lookup order (fastest to slowest):
	 * 1. In-process static array (`$active_tlds_cache`) — zero DB cost.
	 * 2. Disk cache file managed by dd_cache — single file read, avoids a DB query.
	 * 3. Direct SQL query: `SELECT "tld" FROM "dd_ontology" GROUP BY "tld"` — populates both
	 *    the disk cache and the static array for subsequent calls.
	 *
	 * The cache file is invalidated externally (e.g., by the ontology importer after a TLD
	 * install). Callers must not assume a particular TLD order in the returned array.
	 *
	 * @return array - Indexed array of TLD strings (e.g. ['dd', 'activity', 'oh']).
	 *                 Empty array when the table is empty or the query fails.
	 */
	public static function get_active_tlds() : array {

		// Cache
		if(isset(self::$active_tlds_cache)){
			return self::$active_tlds_cache;
		}

		// cache file read
		$cache_data	= dd_cache::cache_from_file((object)[
			'file_name' => self::$active_tlds_cache_file_name
		]);
		if (!empty($cache_data)) {

			// static cache
			self::$active_tlds_cache = $cache_data;

			return $cache_data;
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

		// static cache
		self::$active_tlds_cache = $active_tlds;

		// cache file write
		dd_cache::cache_to_file((object)[
			'file_name' => self::$active_tlds_cache_file_name,
			'data'      => $active_tlds
		]);

		return $active_tlds;
	}//end get_active_tlds



	/**
	 * CHECK_ACTIVE_TLD
	 * Returns true when the TLD of the given tipo is currently installed in the ontology.
	 *
	 * Used as a lightweight pre-filter in locator validation and request-config building to
	 * silently discard references to ontology namespaces that are not yet imported on this
	 * installation. Callers should treat false as "skip this tipo", not as a fatal error.
	 *
	 * Special case: 'section_id' is a virtual pseudo-tipo used in SQO filters; it has no real
	 * TLD and is always considered active to avoid false negatives in search pipelines.
	 *
	 * @param string $tipo - The tipo whose TLD membership to check (e.g. 'oh1', 'dd345').
	 * @return bool - True if the tipo's TLD appears in get_active_tlds(), or if tipo = 'section_id'.
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
	 * Permanently removes every ontology row whose `tld` column matches the given TLD.
	 *
	 * This is a destructive bulk-delete used as the first step in atomic TLD replacement
	 * (backup → delete → re-import → restore-on-failure). It must only be called after a
	 * successful create_bk_table() snapshot or after confirming a clean deletion is safe.
	 *
	 * The TLD string is validated with safe_tld() — which requires /^[a-z]{2,}$/ — before
	 * being interpolated into the query. A mismatched safe_tld produces an ERROR log entry
	 * and an early false return, leaving dd_ontology untouched.
	 *
	 * @param string $tld - The TLD namespace to purge (e.g. 'oh'). Must pass safe_tld() validation.
	 * @return bool - True when the DELETE executed without error; false on validation failure or
	 *                DB error.
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
	 * Snapshots the current dd_ontology rows for the given TLDs into a dedicated backup table
	 * `dd_ontology_bk`.
	 *
	 * Called as the first step of atomic TLD replacement inside ontology::regenerate_records_in_dd_ontology().
	 * The backup allows a rollback via restore_from_bk_table() if the subsequent delete + re-import
	 * pipeline fails at any point.
	 *
	 * Implementation notes:
	 * - Drops any pre-existing `dd_ontology_bk` with CASCADE before creating a fresh one.
	 * - Uses pg_escape_literal() for each TLD to prevent injection — NOT positional params,
	 *   because CREATE TABLE AS … WHERE … does not support them in PostgreSQL.
	 * - Operates on the same table identified by ontology_node::$table (normally 'dd_ontology').
	 *
	 * @param array $tlds - Indexed array of TLD strings to back up (e.g. ['oh', 'activity']).
	 *                      Must be non-empty; returns false immediately on empty input.
	 * @return bool - True when the backup table was created successfully; false on empty input
	 *                or DB failure.
	 */
	public static function create_bk_table( array $tlds ) : bool {

		if (empty($tlds)) {
			return false;
		}

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
	 * Drops the `dd_ontology_bk` backup table created by create_bk_table().
	 *
	 * Must be called after a successful ontology regeneration cycle (or after restore_from_bk_table()
	 * completes) to avoid leaving stale backup data on disk. Uses IF EXISTS so it is safe to call
	 * even when no backup exists.
	 *
	 * @return bool - True when the DROP executed without error; false on DB failure.
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
	 * Rolls back dd_ontology to the snapshot stored in `dd_ontology_bk` for the given TLDs.
	 *
	 * Called on error paths inside ontology::regenerate_records_in_dd_ontology() to undo a
	 * partially-completed TLD delete + re-import cycle. The process:
	 * 1. Deletes the current (potentially partial) dd_ontology rows for each requested TLD by
	 *    calling delete_tld_nodes() — uses positional params via matrix_db_manager.
	 * 2. Re-inserts all matching rows from dd_ontology_bk into dd_ontology via a single
	 *    INSERT … SELECT … WHERE tld = $1 OR tld = $2 … query.
	 *
	 * (!) The caller is responsible for calling delete_bk_table() afterwards. This method does
	 * not clean up the backup table itself.
	 *
	 * @param array $tlds - Indexed array of TLD strings to restore (e.g. ['oh', 'activity']).
	 *                      Must be non-empty; returns false immediately on empty input.
	 * @return bool - True when the INSERT completed without DB error; false on empty input or
	 *                DB failure.
	 */
	public static function restore_from_bk_table( array $tlds ) : bool {

		if (empty($tlds)) {
			return false;
		}

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
