<?php declare(strict_types=1);
/**
* RecordDataBoundObject
* Connect with Ontology tables in PostgreSQL:
* Note that, for speed, all DB
* 	jer_dd
* 		id	integer Auto Increment [nextval('jer_dd_id_seq')]
*		terminoID	character varying(32) NULL
*		parent	character varying(32) NULL
*		modelo	character varying(8) NULL
*		esmodelo	sino NULL
*		esdescriptor	sino NULL
*		visible	sino NULL
*		norden	numeric(4,0) NULL
*		tld	character varying(32) NULL
*		traducible	sino NULL
*		relaciones	text NULL
*		propiedades	text NULL
*		properties	jsonb NULL
* 		term jsonb NULL
*
*	main_dd
* 		id	integer Auto Increment [nextval('main_dd_id_seq')]
*		tld	character varying(32) NULL
*		counter	integer NULL
*		name	character varying(255) NULL
*
*/
abstract class RecordDataBoundObject {

	protected $ID;
	protected $strTableName;
	protected $arRelationMap;
	protected $strPrimaryKeyName ;	# usually id
	protected $blForDeletion;
	public $blIsLoaded;
	public $arModifiedRelations;

	public $use_cache = true; // default is true (for structure only)
	public $use_cache_manager = false;

	public $dato;

	#protected static $db_connection;

	#protected static $ar_RecordDataObject_query;
	#protected static $ar_RecordDataObject_query_search_cache;
	protected $force_insert_on_save = false;

	abstract protected function defineTableName();
	abstract protected function defineRelationMap();
	abstract protected function definePrimaryKeyName();



	/**
	* __CONSTRUCT
	* @param string|null $id
	*	Like 'dd73'
	* @return void
	*/
	public function __construct( ?string $id=null ) {

		$this->strTableName			= $this->defineTableName();
		$this->strPrimaryKeyName	= $this->definePrimaryKeyName();
		$this->arRelationMap		= $this->defineRelationMap();

		$this->blIsLoaded			= false;
		if(isset($id)) {
			$this->ID 				= $id;
		}
		$this->arModifiedRelations	= array();
	}//end __construct



	/**
	* GET_CONNECTION
	* Use this connector in this class to allow discriminate
	* Ontology tables (they are treated differently)
	* @return PgSql\Connection|bool $connection
	*/
	private function get_connection() : PgSql\Connection|bool {

		$connection = DBi::_getConnection(
			DEDALO_HOSTNAME_CONN, // string host
			DEDALO_USERNAME_CONN, // string user
			DEDALO_PASSWORD_CONN, // string password
			DEDALO_DATABASE_CONN, // string database
			DEDALO_DB_PORT_CONN, // ?string port
			DEDALO_SOCKET_CONN // ?string socket
		);
		// check valid connection
		if ($connection===false) {
			debug_log(__METHOD__
				." Invalid DDBB connection. Unable to connect (52-1)"
				, logger::ERROR
			);
		}


		return $connection;
	}//end get_connection



	/**
	* GET_DATO
	* Get dato unified method (JSON)
	* Force lo load all DBB data
	* and return the 'dato' column / property
	*/
	public function get_dato() {

		if($this->blIsLoaded!==true) {
			$this->Load();
		}

		$dato = $this->dato ?? null;

		return $dato;
	}//end get_dato



	/**
	* SET_DATO :
	* Set dato unified method (JSON)
	* @param mixed $dato
	*/
	public function set_dato( mixed $dato ) : void {

		// Always set dato as modified
		$this->arModifiedRelations['dato'] = 1;

		$this->dato = $dato;
	}//end set_dato



	/**
	* LOAD
	* Get one row from database based on current section_tipo and section_id
	* @return bool
	*/
	public function Load() : bool {

		// debug
			if(SHOW_DEBUG===true) {
				$start_time = start_time();

				// metrics
				metrics::$ontology_total_calls++;
			}

		// Prevent load if $this->ID is not set
			if(!isset($this->ID) || $this->ID===false) {
				return false;
			}

		// query
			$ar_query = [];

		// select
			$ar_query_select = array_map(function($el){
				return '"'.$el.'"';
			}, $this->arRelationMap);
			$select_fields	= implode(',', $ar_query_select);
			// $select_fields	= '*';
			$ar_query[]	= 'SELECT '.$select_fields;

		// from
			$ar_query[] = 'FROM "'.$this->strTableName.'"';

		// where
			$column_key		= $this->strPrimaryKeyName; // terminoID
			$column_value	= '\''. $this->ID .'\''; // e.g. 'dd15'
			$ar_query[] = 'WHERE "'.$column_key.'"='.$column_value;

		// $strQuery
			$strQuery = implode(' ', $ar_query);

		// CACHE_MANAGER
		// If a query is passed to it that has already been received, it does not connect to the db and it returns
 		// the result of the identical query already calculated and stored in a static array.
		// This is reliable because the Ontology does not change at runtime.
		static $ar_RecordDataObject_load_query_cache = [];
		$use_cache = $this->use_cache;
		// if ($use_cache===true && isset($ar_RecordDataObject_load_query_cache[$strQuery])) {
		if ($use_cache===true && array_key_exists($strQuery, $ar_RecordDataObject_load_query_cache)) {

			// from cache data case

			$row = $ar_RecordDataObject_load_query_cache[$strQuery];

			if(SHOW_DEBUG===true) {
				// metrics
				metrics::$ontology_total_calls_cached++;
			}

		}else{

			// from DB request case

			// connection
				$conn = $this->get_connection();
				if ($conn===false) {
					debug_log(__METHOD__
						." Connection error. get_connection return false "
						, logger::ERROR
					);
					return false;
				}

			// exec query
				// Direct
				// $result = pg_query($conn, $strQuery);

				// With prepared statement
				$stmt_name = __METHOD__ . '_' . $this->strTableName;
				if (!isset(DBi::$prepared_statements[$stmt_name])) {
					pg_prepare(
						$conn,
						$stmt_name,
						'SELECT '.$select_fields.' FROM "'.$this->strTableName.'" WHERE "'.$this->strPrimaryKeyName.'" = $1'
					);
					// Set the statement as existing.
					DBi::$prepared_statements[$stmt_name] = true;
				}
				$result = pg_execute(
					$conn,
					$stmt_name,
					[$this->ID]
				);

			// check result
				if ($result===false) {
					debug_log(__METHOD__
						. " Error: DDBB query error ". PHP_EOL
						. ' error: ' .pg_last_error(DBi::_getConnection()) .PHP_EOL
						. ' strQuery: '.to_string($strQuery)
						, logger::ERROR
					);
					return false;
				}

			// rows. pg_fetch_assoc: false is returned if row exceeds the number of rows in the set, there are no more rows, or on any other error.
				$row = pg_fetch_assoc($result); // assoc array|false
					// sample row assoc array:
					// {
					//     "terminoID": "test24",
					//     "parent": "dd627",
					//     "modelo": "dd626",
					//     "esmodelo": "no",
					//     "esdescriptor": "si",
					//     "visible": "si",
					//     "norden": "18",
					//     "tld": "test",
					//     "traducible": "no",
					//     "relaciones": null,
					//     "propiedades": "{\r\n  \"inverse_relations\": false\r\n}",
					//     "properties": "{\"inverse_relations\": false}"
					// }
				if ($row===false) {
					// if(SHOW_DEBUG===true) {
					// 	// dump($this,"WARNING: No result on Load arRow : strQuery:".$strQuery);
					// 	// throw new Exception("Error Processing Request (".DEDALO_DATABASE_CONN.") strQuery:$strQuery", 1);
					// 	dump($row, ' strQuery +++++++++++++++++++++++++++++++++++ '.DEDALO_DATABASE_CONN.PHP_EOL.to_string($strQuery)).PHP_EOL;
					// 	$bt = debug_backtrace();
					// 	dump($bt, ' Load pg_fetch_assoc bt +++++++++++++++++++++ '.to_string($this->ID));
					// }
					// // trigger_error('WARNING: No result on Load arRow. $strQuery: ' .PHP_EOL. $strQuery);
					debug_log(__METHOD__
						." 'WARNING: No result found on Load arRow" .PHP_EOL
						. ' last_error: ' .pg_last_error(DBi::_getConnection()) .PHP_EOL
						. ' strQuery: '.to_string($strQuery)
						, logger::WARNING
					);

					return false;
				}

			// cache
				if ($use_cache===true) {
					// store value
					$ar_RecordDataObject_load_query_cache[$strQuery] = $row;
				}
		}

		// arRelationMap assign values
			if(isset($row) && is_array($row)) {
				foreach($row as $key => $value) {
					if ($key==='id') { continue; } // Ignore column id
					$strMember = $this->arRelationMap[$key] ?? null;
					if (!$strMember) {
						debug_log(__METHOD__
							. " WARNING: Ignored column. Property '$key' do not exists in " . get_called_class()
							, logger::WARNING
						);
						continue;
					}
					if(property_exists($this, $strMember)) {
						$this->{$strMember} = $value;
					}
				}
			}

		// Fix loaded state
			$this->blIsLoaded = true;

		// debug
			if(SHOW_DEBUG===true) {
				$total_time_ms = exec_time_unit($start_time,'ms');
				if($total_time_ms>SLOW_QUERY_MS) {
					debug_log(__METHOD__
						." 'WARNING: LOAD_SLOW_QUERY IN RECORDDATABOUNCEOBJECT !" .PHP_EOL
						. ' total_time_ms: ' .$total_time_ms . PHP_EOL
						. ' strQuery: '.to_string($strQuery)
						, logger::WARNING
					);
				}

				// metrics
				metrics::$ontology_total_time += $total_time_ms;
			}


		return true;
	}//end load



	/**
	* SAVE
	* Update current record
	* @return mixed $this->ID
	* 	string|false
	*/
	public function Save() {

		if(isset($this->ID) && strlen($this->ID)>0 && $this->force_insert_on_save!==true) {

			//
			// SAVE UPDATE. The record already exists and will be modified.
			//

			// query
			$ar_query = [];

			// update
			$ar_query[] = 'UPDATE "'.$this->strTableName.'" SET';

			// values
			$sentences = [];
			$values = [];
			$counter = 1;
			foreach($this->arRelationMap as $key => $value) {

				$actualVal = & $this->$value;

				if(array_key_exists($value, $this->arModifiedRelations)) {

					$current_val = $actualVal;#json_handler::encode($actualVal);

					if (is_object($current_val) || is_array($current_val)) {
						$current_val = json_handler::encode($current_val);
					}

					$safe_value = is_string($current_val)
							? str_replace(['\\u0000','\u0000'], ' ', $current_val) // prevent null encoded errors
							: $current_val;

					$values[] = $safe_value;
					// build sentences with placeholders. E.g. "state" = $1
					$sentences[] = '"' . $key . '" = $' . $counter++;
				}
			}

			// pair sentences
			$ar_query[] = implode(',', $sentences);

			// where
			$ar_query[] = 'WHERE "' . $this->strPrimaryKeyName .'" = $' . $counter++;

			// final strQuery string
			$strQuery = implode(' ', $ar_query);

			// Empty set elements values case
			if (empty($values)) {
				$msg = "Failed Save query (RDBO). Data is not saved because no vars are set to save. Elements to save: ".count( (array)$this->arRelationMap ) ;
				if(SHOW_DEBUG===true) {
					dump($strQuery, ' strQuery');
				}
				trigger_error($msg);

				// Because is not an error, only a impossible save query, notify and return normally
				return $this->ID;
			}

			// add $this->ID as last param
			$values[] = $this->ID;

			// exec query
				// $result = pg_query($this->get_connection(), $strQuery);
				$result = pg_query_params(
					$this->get_connection(),
					$strQuery,
					$values
				);
				if($result===false) {
					debug_log(__METHOD__
						. " Error: sorry an error occurred on UPDATE record ID: '$this->ID'. Data is not saved " .PHP_EOL
						. ' strQuery: ' . $strQuery . PHP_EOL
						. ' last_error: ' .pg_last_error(DBi::_getConnection())
						, logger::ERROR
					);
					if(SHOW_DEBUG===true) {
						dump($strQuery, "strQuery");
						throw new Exception("Error Processing Request", 1);
					}
				}
		}else{

			//
			// SAVE INSERT. The record does not exist and a new one will be created.
			//

			// query
			$ar_query = [];

			// insert
			$ar_query[] = 'INSERT INTO "'.$this->strTableName.'"';

			$columns = [];
			$values = [];
			foreach($this->arRelationMap as $key => $value) {

				$actualVal = & $this->$value;

				if(isset($actualVal)) {
					if(array_key_exists($value, $this->arModifiedRelations)) {

						$columns[] = $key;

						if (is_object($actualVal) || is_array($actualVal)) {
							$actualVal = json_handler::encode($actualVal);
						}

						$safe_value = is_string($actualVal)
							? str_replace(['\\u0000','\u0000'], ' ', $actualVal) // prevent null encoded errors
							: $actualVal;

						$values[] = $safe_value;
					}
				}
			}

			// columns
			$ar_query[] = '("' . implode('","', $columns) . '")';

			// values
			// placeholders as $1,$2,$3 to use pg_params
			$placeholders = array_map(function($key) {
			    return '$' . ($key + 1);
			}, array_keys($values));
			$ar_query[] = 'VALUES (' . implode(',', $placeholders) . ')';

			// returning id
			$ar_query[] = 'RETURNING "'.$this->strPrimaryKeyName.'"';

			// final strQuery string
			$strQuery = implode(' ', $ar_query);

			// exec query
				// $result = pg_query($this->get_connection(), $strQuery);
				$result = pg_query_params(
					$this->get_connection(),
					$strQuery,
					$values
				);
				if ($result===false) {
					debug_log(__METHOD__
						." Error: DDBB query error. INSERT record. Data is not saved ". PHP_EOL
						. pg_last_error(DBi::_getConnection()) .PHP_EOL
						. to_string($strQuery)
						, logger::ERROR
					);
					if(SHOW_DEBUG===true) {
						throw new Exception("Error Processing Save Insert Request (1). error: ". pg_last_error(DBi::_getConnection()), 1);
					}
					return false;
				}

			$id = pg_fetch_result($result, 0, '"'.$this->strPrimaryKeyName.'"');
			if ($id===false) {
				debug_log(__METHOD__
					. " Error Processing Request (1-b) ". PHP_EOL
					. ' last_error: '. pg_last_error(DBi::_getConnection()) .PHP_EOL
					. ' strQuery: ' . to_string($strQuery)
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					dump($strQuery,"strQuery");
					throw new Exception("Error Processing Request (1-b): ". pg_last_error(DBi::_getConnection()), 1);
				}
			}
			// Fix new received id
			$this->ID = $id;
		}


		return $this->ID;
	}//end Save



	# DELETE
	public function MarkForDeletion() : void {
		$this->blForDeletion = true;
	}
	# ALIAS OF MarkForDeletion
	public function Delete() : void {
		$this->MarkForDeletion();
	}


	# ARRAY EDITABLE FIELDS
	public function get_ar_editable_fields() : array {

		// cache
			static $ar_editable_fields;
			if(isset($ar_editable_fields)) {
				return $ar_editable_fields;
			}

		// arRelationMap values
			if(is_array($this->arRelationMap)) {

				foreach($this->arRelationMap as $field_name => $property_name) {

					if($property_name!=='ID') {
						$ar_editable_fields[] = $field_name;
					}
				}

				return $ar_editable_fields ;
			}


		return [];
	}//end get_ar_editable_fields



	/**
	* SEARCH
	* Generic search. Needs array key-value as field => value
	* TIPO $arguments['parent'] = 14 ...
	* @param array $ar_arguments
	* @param string|null $matrix_table = null
	* @return array $ar_records
	*/
	public function search( array $ar_arguments, ?string $matrix_table=null ) : array {
		if(SHOW_DEBUG===true) $start_time = start_time();

		// default value
			$ar_records = [];

		// matrix_table. Optionally change table temporally for search
			if (!empty($matrix_table)) {
				$this->strTableName = $matrix_table;
			}else{
				// forces to recalculate the table name
				// Note that in recovery_mode changes on the fly
				$this->strTableName = $this->defineTableName();
			}

		$strPrimaryKeyName	= $this->strPrimaryKeyName;
		$strQuery			= '';
		$strQuery_limit		= '';
		$strQuery_offset	= '';
		$SQL_CACHE			= false;

		if(is_array($ar_arguments)) foreach($ar_arguments as $key => $value) {

			switch(true) {	#"AND dato LIKE  '%\"{$area_tipo}\"%' ";

				# SI $key ES 'strPrimaryKeyName', LO USAREMOS COMO strPrimaryKeyName A BUSCAR
				case ($key==='strPrimaryKeyName'):
					$strPrimaryKeyName = $value;
					break;

				# SI $key ES 'sql_code', INTERPRETAMOS $value LITERALMENTE, COMO SQL
				case ($key==='sql_code'):
					$strQuery .= $value.' ';
					break;

				# LIKE_%
				case (strpos($key,':%like%')!==false):
					$campo = substr($key, 0, strpos($key,':%like%'));
					$strQuery .= 'AND "'.$campo.'" ILIKE \'%'.$value.'%\' ';
					break;
				# NOT_LIKE
				case (strpos($key,':not_like')!==false):
					$campo = substr($key, 0, strpos($key,':not_like'));
					$strQuery .= 'AND "'.$campo.'" NOT LIKE \''.$value.'\' ';
					break;

				# NOT
				case (strpos($key,':!=')!==false):
					$campo = substr($key, 0, strpos($key,':!='));
					$strQuery .= 'AND "'.$campo.'" != \''.$value.'\' ';
					break;

				# IS NOT NULL
				case (strpos($key,':not_null')!==false):
					$campo = substr($key, 0, strpos($key,':not_null'));
					$strQuery .= 'AND "'.$campo.'" IS NOT NULL ';
					break;

				# OR (format lan:or= array('DEDALO_DATA_LANG',DEDALO_DATA_NOLAN))
				case (strpos($key,':or')!==false):
					$campo = substr($key, 0, strpos($key,':or'));
					$strQuery_temp ='';
					foreach ($value as $value_string) {
						$strQuery_temp .= '"'.$campo.'" = \''.$value_string.'\' OR ';
					}
					$strQuery .= 'AND ('. substr($strQuery_temp, 0,-4) .') ';
					break;

				case (strpos($key,':unaccent_begins_or')!==false):
					$campo = substr($key, 0, strpos($key,':unaccent_begins_or'));
					$strQuery_temp ='';
					if(is_array($value)) foreach ($value as $value_string) {
						$strQuery_temp .= 'unaccent("'.$campo.'") ILIKE unaccent(\''.$value_string.'%\') OR ';
					}
					$strQuery .= 'AND ('. substr($strQuery_temp, 0,-4) .') ';
					break;

				# begins_or (format begins_or:or= array('DEDALO_DATA_LANG',DEDALO_DATA_NOLAN))
				case (strpos($key,':begins_or')!==false):
					$campo = substr($key, 0, strpos($key,':begins_or'));
					$strQuery_temp ='';
					if(is_array($value)) foreach ($value as $value_string) {
						$strQuery_temp .= '"'.$campo.'" ILIKE \''.$value_string.'%\' OR ';
					}
					$strQuery .= 'AND ('. substr($strQuery_temp, 0,-4) .') ';
					break;
				# LIMIT
				case ($key==='sql_limit'):
					$strQuery_limit = ' LIMIT '.(int)$value.' ';
					break;
				# OFFSET
				case ($key==='offset'):
					$strQuery_offset = ' OFFSET '.(int)$value.' ';
					break;

				# SI $key ES 'group_by', INTERPRETAMOS $value COMO SQL en formato "GROUP BY $value"
				case ($key==='group_by'):
					$strQuery .= 'GROUP BY '.$value.' ';
					break;

				# SI $key ES 'group_by', INTERPRETAMOS $value COMO SQL en formato "ORDER BY $value ASC"
				case ($key==='order_by_asc'):
					$strQuery .= 'ORDER BY '.$value.' ASC ';
					break;

				# SI $key ES 'group_by', INTERPRETAMOS $value COMO SQL en formato "ORDER BY $value DESC"
				case ($key==='order_by_desc'):
					$strQuery .= 'ORDER BY '.$value.' DESC ';
					break;

				# BEGINS
				case (strpos($key,':begins')!==false):
					$campo = substr($key, 0, strpos($key,':begins'));
					$strQuery .= 'AND "'.$campo.'" ILIKE \''.$value.'%\' ';
					break;

				# JSON BEGINS
				case (strpos($key,':json_exact')!==false):
					$campo = substr($key, 0, strpos($key,':json_exact'));
					$strQuery .= 'AND "'.$campo.'" = \''.$value.'\' ';
					break;

				# JSON OR (format lan:or= array('DEDALO_DATA_LANG',DEDALO_DATA_NOLAN))
				case (strpos($key,':json_or')!==false):
					$campo = substr($key, 0, strpos($key,':json_or'));
					$strQuery_temp ='';
					foreach ($value as $value_string) {
						$strQuery_temp .= '"'.$campo.'" ILIKE \'%'.$value_string.'%\' OR ';
					}
					$strQuery .= 'AND ('. substr($strQuery_temp, 0,-4) .') ';
					#dump ($strQuery,'strQuery');
					break;

				# JSON BEGINS
				case (strpos($key,':json_begins')!==false):
					$campo = substr($key, 0, strpos($key,':json_begins'));
					$strQuery .= 'AND "'.$campo.'" ILIKE \''.$value.'%\' ';
					break;

				# JSON_ELEMENT
				# Example: locator inside array like '{"section_top_tipo":"oh1","section_top_id_matrix":"47","section_id_matrix":"63","component_tipo":"rsc36","tag_id":"2"}'
				case (strpos($key,':json_element')!==false):
					$campo = substr($key, 0, strpos($key,':json_element'));
					$strQuery .= 'AND "'.$campo.'" LIKE \'%'.$value.'%\' ';
					#$strQuery .= "AND match($campo) against('%\"{$value}\"%' IN BOOLEAN MODE) ";
					break;
				# JSON
				case (strpos($key,':json')!==false):
					$campo = substr($key, 0, strpos($key,':json'));
					$strQuery .= 'AND "'.$campo.'" ILIKE \'%'.$value.'%\' ';
					#$strQuery .= "AND match($campo) against('%\"{$value}\"%' IN BOOLEAN MODE) ";
					#dump($strQuery,'$strQuery');
					break;

				# SQL_CACHE
					// case ($key=='sql_cache'):
					// 	if(!$SQL_CACHE && $value) $SQL_CACHE = 'SQL_CACHE ';
					// 	break;

				# KEY-JSON ( format like "created_by_userID":"114" )
				case (strpos($key,':key-json')!==false):
					$campo = substr($key, 0, strpos($key,':key-json'));
					if (strpos($value, ':')!==false) {
						$ar = explode(':', $value);
						if(isset($ar[0]) && isset($ar[1])) {
							$ar_key		= $ar[0];
							$ar_value	= $ar[1];
							#if (is_int($ar_value)) {
							#	$strQuery  .= "AND $campo LIKE '%\"{$ar_key}\":{$ar_value}%' ";
							#}else{
								$strQuery  .= 'AND "'.$campo.'" LIKE \'%'.$ar_key.':'.$ar_value.'%\' ';
							#}
						}
					}
					break;

				# DEFAULT . CASO GENERAL: USAREMOS EL KEY COMO CAMPO Y EL VALUE COMO VALOR TIPO 'campo = valor'
				default :
					$strQuery .= (is_int($value) && strpos($key, 'dato')===false)
						? 'AND "'.$key.'"='.$value.' '
						: 'AND "'.$key.'"=\''.$value.'\' ';
					break;

			}#end switch(true)
		}#end foreach($ar_arguments as $key => $value)

		# Seguridad
		#if(strpos(strtolower($strQuery), 'update')!=='false' || strpos(strtolower($strQuery), 'delete')!=='false') die("SQL Security Error ". strtolower($strQuery) );

		// Verify query format
			if(strpos($strQuery, 'AND')===0) {
				$strQuery = substr($strQuery, 4);
			}else if(strpos($strQuery, ' AND')===0) {
				$strQuery = substr($strQuery, 5);
			}

		// strQuery
		$strQuery = trim('SELECT '. $SQL_CACHE .'"'.$strPrimaryKeyName. '" FROM "'.$this->strTableName.'" WHERE '. $strQuery . $strQuery_limit . $strQuery_offset);
		// error_log('------ strQuery >>>> '.$strQuery);

		# CACHE : Static var
		# SI SE LE PASA UN QUERY QUE YA HA SIDO RECIBIDO, NO SE CONECTARÁ CON LA DB Y SE LE DEVUELVE EL RESULTADO DEL QUERY IDÉNTICO YA CALCULADO
		# QUE SE GUARDA EN UN ARRAY ESTÁTICO
		static $ar_RecordDataObject_query_search_cache;

		# CACHE
		$use_cache = $this->use_cache;
		if($use_cache===true && isset($ar_RecordDataObject_query_search_cache[$strQuery])) {

			# DATA IS IN CACHE . Return value form memory

			$ar_records	= $ar_RecordDataObject_query_search_cache[$strQuery];
			// error_log('CACHE-search-'.$strQuery);

		}else{

			# DATA IS NOT IN CACHE . Searching real data in DB

			$connection = $this->get_connection();
			if ($connection===false) {
				debug_log(__METHOD__." Connection error. Return empty array ".to_string(), logger::ERROR);
				return [];
			}
			$result = pg_query($this->get_connection(), $strQuery);
			if ($result===false) {
				debug_log(__METHOD__
					. " Error on DB query " . PHP_EOL
					. ' last_error: ' . pg_last_error(DBi::_getConnection()) . PHP_EOL
					. ' strQuery: ' . $strQuery
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					// throw new Exception("Error Processing Request . ".pg_last_error(DBi::_getConnection()), 1);
					// }else{
					// trigger_error("Error on DB query");
				}
				return [];
			}
			while ($rows = pg_fetch_assoc($result)) {
				$ar_records[] = $rows[$strPrimaryKeyName];
			}

			# CACHE
			# SI SE LE PASA UN QUERY QUE YA HA SIDO RECIBIDO, NO SE CONECTA CON LA DB Y SE LE DEVUELVE EL RESULTADO DEL QUERY IDÉNTICO YA CALCULADO
			# QUE SE GUARDA EN UN ARRAY ESTÁTICO
			# IMPORTANT Only store in cache positive results, NOT EMPTY RESULTS
			# (Store empty results is problematic for example with component_common::get_id_by_tipo_parent($tipo, $parent, $lang) when matrix relation record is created and more than 1 call is made,
			# the next results are 0 and duplicate records are built in matrix)
			# Nota: en algunos casos interesa forzar el refresco de los datos (como por ejemplo en counter). Es esos caso NO guardaremos el resultado en caché
			$n_records = is_countable($ar_records) ? sizeof($ar_records) : 0;
			if($use_cache===true && $n_records>0) {
				// store value
				$ar_RecordDataObject_query_search_cache[$strQuery] = $ar_records;
			}

			// debug
				if(SHOW_DEBUG===true) {
					$total_time_ms = exec_time_unit($start_time,'ms');
					if($total_time_ms>SLOW_QUERY_MS) {
						debug_log(__METHOD__
							." 'WARNING: LOAD_SLOW_QUERY IN RECORDDATABOUNCEOBJECT !" .PHP_EOL
							. ' total_time_ms: ' .$total_time_ms . PHP_EOL
							. ' strQuery: ' . $strQuery
							, logger::WARNING
						);
					}
				}
		}


		return $ar_records;
	}//end search



	# DESTRUCT
	public function __destruct() {

		if( isset($this->ID) ) {

			if($this->blForDeletion===true) {

				$strQuery = "DELETE FROM \"$this->strTableName\" WHERE \"$this->strPrimaryKeyName\" = $1";

				// $result = JSON_RecordObj_matrix::search_free($strQuery);
				$result = pg_query_params(
					$this->get_connection(),
					$strQuery,
					[$this->ID]
				);
				if($result===false) {
					if(SHOW_DEBUG===true) {
						$msg = __METHOD__." Failed Delete record (RDBO) from {$this->strPrimaryKeyName}: $this->ID";
					}else{
						$msg = "Failed Delete record (RDBO). Record $this->ID is not deleted. Please contact with your admin" ;
					}
					trigger_error($msg);
					debug_log(__METHOD__
						. ' ' . $msg .PHP_EOL
						. 'strQuery: ' . to_string($strQuery)
						, logger::ERROR
					);
					throw new Exception($msg, 1);
				}
			}
		}
		# close connection
		#$this->get_connection()->close();
		#$this->get_connection()->commit();
	}//end __destruct



	# ACCESSORS CALL
	final public function __call(string $strFunction, array $arArguments) {

		$strMethodType 		= substr($strFunction, 0, 4); # like set or get_
		$strMethodMember 	= substr($strFunction, 4);
		switch($strMethodType) {
			case 'set_' : return($this->SetAccessor($strMethodMember, $arArguments[0]));	break;
			case 'get_' : return($this->GetAccessor($strMethodMember));						break;
		}
		return false;
	}
	# ACCESSORS SET
	private function SetAccessor(string $strMember, $strNewValue) {

		if(property_exists($this, $strMember)) {

			// fix property value
			$this->$strMember = $strNewValue;

			$this->arModifiedRelations[$strMember] = 1;

			return true;
		}else{
			return false;
		}
	}
	# ACCESSORS GET
	private function GetAccessor(string $strMember) {

		if($this->blIsLoaded != true) {
			$this->Load();
		}

		return property_exists($this, $strMember)
			? $this->$strMember
			: false;
	}//end GetAccessor



}//end RecordDataBoundObject class
