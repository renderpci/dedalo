<?php declare(strict_types=1);
/**
* ontology_utils
* Complementary utilities used to get multiple records of the dd_ontology table.
* Manages the active and functional ontology records,
* ontology utils is using to interpreted data, schemas, behaviors, etc. in execution time.
* It makes resolutions of multiples active nodes.
* It uses `dd_ontology` table in DDBB.
* It's a read only object.
*
* Note: As ontology nodes are not editable nodes.
* For doing changes into ontology use ../core/ontology/class.ontology.php
*/
class ontology_utils {


	/**
	* get_ar_tipo_by_model
	* Resolves all terms matching the given model
	* @param string $model_name
	* @return array $ar_result
	*/
	public static function get_ar_tipo_by_model( string $model_name ) : array {

		// static cache
		static $ar_tipo_by_model_name;
		$cache_uid = $model_name;
		if(isset($ar_tipo_by_model_name[$cache_uid])) {
			return $ar_tipo_by_model_name[$cache_uid];
		}

		// search terms with given model
		$result = dd_ontology_manager::search([
			'model' => $model_name
		]);

		$ar_result = ( $result===false ) ? [] : $result;

		// static cache
		$ar_tipo_by_model_name[$cache_uid] = $ar_result;

		return $ar_result;
	}//end get_ar_tipo_by_model



	/**
	* GET_AR_ALL_MODELS
	* It is used in the edit thesaurus selector to assign model
	* @return array $all_models
	* 	Array of all models tipo as ["dd3","dd1226","dd1259",..]
	*/
	public static function get_ar_all_models() : array {

		// search
		$result = dd_ontology_manager::search([
			'is_model' => true
		]);

		$all_models = ( $result===false ) ? [] : $result;

		return $all_models;
	}//end get_ar_all_models



	/**
	* GET_AR_ALL_TIPO_OF_MODEL_TIPO
	* Resolves all term id of given model tipo, like
	* dd6 => ["oh1","dd917",..]
	* @param string $modelo_tipo
	* @return array $ar_all_tipo
	* 	Array of all term_id as ["oh1","dd917",..]
	*/
	public static function get_ar_all_tipo_of_model_tipo( string $model_tipo ) : array {

		// search
		$result = dd_ontology_manager::search([
			'model_tipo' => $model_tipo
		]);

		$ar_all_tipo = ( $result===false ) ? [] : $result;

		return $ar_all_tipo;
	}//end model_tipo



	/**
	* CHECK_TIPO_IS_VALID
	* Checks if given tipo is usable trying to resolve model from tipo
	* If model is empty, the tipo is not available because dd_ontology is
	* damaged or the TLD is not installed.
	* It is also used to validate old data pointing to a non active TLD.
	* @param string $tipo
	* 	Could be a component tipo or a section / area tipo.
	* @return bool
	*/
	public static function check_tipo_is_valid( string $tipo ) : bool {

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
	* Get from dd_ontology table all active/installed tlds.
	* Used to check if the tipo has a valid definition in the ontology.
	* If the tipo is not installed is not possible to resolve it
	* The callers will decide if is necessary remove the tipo from definition, as remove from sqo, show error, or ...
	* @return array $active_tlds
	*/
	public static function get_active_tlds() : array {

		// Cache
		static $active_tlds_cache;
		if(isset($active_tlds_cache)){
			return $active_tlds_cache;
		}

		$table	= ontology_node::$table; // dd_ontology | dd_ontology_backup
		$sql_query	= "SELECT tld FROM \"$table\" GROUP BY tld";
		$result	= pg_query(DBi::_getConnection(), $sql_query);

		$active_tlds = [];
		while($row = pg_fetch_assoc($result)) {
			$active_tlds[] = $row['tld'];
		}

		$active_tlds_cache = $active_tlds;


		return $active_tlds;
	}//end get_active_tlds



	/**
	* CHECK_ACTIVE_TLD
	* Checks if the tipo tld is available and installed in the Ontology looking for the dd_ontology
	* @param string $tipo
	* @return bool
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
	* Removes all tld nodes (records) in dd_ontology
	* @param string $tld
	* @return bool
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
		$sql_query = '
			DELETE FROM "'.$table.'" WHERE "tld" = \''.$safe_tld.'\';
		';
		$delete_result = pg_query(DBi::_getConnection(), $sql_query);
		if (!$delete_result) {
			debug_log(__METHOD__
				. " Error deleting tld from table dd_ontology" . PHP_EOL
				. ' tld: ' . to_string($tld)
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end delete_tld_nodes



	/**
	* CREATE_BK_TABLE
	* Backup table is a copy of the given tlds
	* Used to ensure that the dd_ontology can be restore in process as regenerate it.
	* @param array $tld
	* @return bool
	*/
	public static function create_bk_table( array $tld ) : bool {

		$where = implode('\' OR tld = \'', $tld);

		$sql_query = '
			DROP TABLE IF EXISTS "dd_ontology_bk" CASCADE;
			CREATE TABLE IF NOT EXISTS dd_ontology_bk AS
			SELECT * FROM dd_ontology WHERE tld = \''.$where.'\';
		';

		$result = pg_query(DBi::_getConnection(), $sql_query);

		if($result===false) {
			debug_log(__METHOD__
				. ' Failed consolidate_table dd_ontology' .PHP_EOL
				. 'query: ' . to_string($sql_query)
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end create_bk_table



	/**
	* DELETE_BK_TABLE
	* Remove the backup table of dd_ontology with clone rows
	* @return bool
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
	* Delete the given tlds from `dd_ontology` table
	* Use `dd_ontology_bk` table to insert his rows into `dd_ontology`
	* Note: `dd_ontology_bk` is not a full backup of `dd_ontology`, it's a selection tlds
	* Do not use as full backup!
	* @param array $tld
	* @return bool
	*/
	public static function restore_from_bk_table( array $tld ) : bool {

		// delete the original nodes in dd_ontology
		foreach ($tld as $current_tld) {
			ontology_utils::delete_tld_nodes( $current_tld );
		}

		// restore all tld into dd_ontology_bk
		$where = implode('\' OR tld = \'', $tld);

		$sql_query = '
			INSERT INTO dd_ontology
			SELECT * FROM "dd_ontology_bk" WHERE tld = \''.$where.'\';
		';

		$result = pg_query(DBi::_getConnection(), $sql_query);

		if($result===false) {
			debug_log(__METHOD__
				. ' Failed restore_from_bk_table dd_ontology_bk' .PHP_EOL
				. 'query: ' . to_string($sql_query)
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end restore_from_bk_table




}//end class ontology_utils
