<?php
/**
* RecordDataBoundObject
*
*
*/
abstract class RecordDataBoundObject {

	protected $ID;
	protected $strTableName;
	public $arRelationMap;
	protected $strPrimaryKeyName ;	# usually id
	protected $blForDeletion;
	protected $blIsLoaded;
	public $arModifiedRelations;

	public $use_cache = true; // default is true (for structure only)
	public $use_cache_manager = false;

	#protected static $db_connection;

	#protected static $ar_RecordDataObject_query;
	#protected static $ar_RecordDataObject_query_search_cache;
	protected $force_insert_on_save = false;

	abstract protected function defineTableName();
	abstract protected function defineRelationMap();
	abstract protected function definePrimaryKeyName();



	/**
	* __CONSTRUCT
	* @param string $id
	*	Like 'dd73'
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

		return true;
	}//end __construct



	/**
	* GET_CONNECTION
	* @return resource|object pg database connection
	*/
	private function get_connection() {

		$ontology_tables = [
			'jer_dd',
			'matrix_descriptors_dd',
			'main_dd'
		];

		if (defined('ONTOLOGY_DB') && true===in_array($this->strTableName, $ontology_tables)) {

			static $ontology_pg_conn;

			if(isset($ontology_pg_conn)) {
				return($ontology_pg_conn);
			}

			$ontology_pg_conn = DBi::_getNewConnection(
				$host=ONTOLOGY_DB['DEDALO_HOSTNAME_CONN'],
				$user=ONTOLOGY_DB['DEDALO_USERNAME_CONN'],
				$password=ONTOLOGY_DB['DEDALO_PASSWORD_CONN'],
				$database=ONTOLOGY_DB['DEDALO_DATABASE_CONN'],
				$port=ONTOLOGY_DB['DEDALO_DB_PORT_CONN'],
				$socket=ONTOLOGY_DB['DEDALO_SOCKET_CONN']
			);
			if($ontology_pg_conn===false){
				throw new Exception("Error. Could not connect to database (52-2)", 1);
			}
			return $ontology_pg_conn;
		}

		return DBi::_getConnection(
			$host=DEDALO_HOSTNAME_CONN,
			$user=DEDALO_USERNAME_CONN,
			$password=DEDALO_PASSWORD_CONN,
			$database=DEDALO_DATABASE_CONN,
			$port=DEDALO_DB_PORT_CONN,
			$socket=DEDALO_SOCKET_CONN
		);
	}//end get_connection



	# GET_DATO : GET DATO UNIFICADO (JSON)
	public function get_dato() {

		if($this->blIsLoaded!==true) {
			$this->Load();
		}

		if (!isset($this->dato)) {
			#error_log("Calling get dato from ".get_called_class().''.print_r(debug_backtrace(),true) );
			return null;
		}

		return $this->dato;
	}//end get_dato



	# SET_DATO : SET DATO UNIFICADO (JSON)
	public function set_dato(string $dato, bool $raw=false) {

		# Always set dato as modified
		$this->arModifiedRelations['dato'] = 1;

		$this->dato = $dato;
	}//end set_dato



	/**
	* LOAD
	* Get one row from database based on current section_tipo and section_id
	* @return bool true
	*/
	public function Load() : bool {
		if(SHOW_DEBUG===true) $start_time = start_time();

		// Prevent load if $this->ID is not set
			if(!isset($this->ID) || $this->ID===false) {
				return false;
			}

		// sql query
			// $strQuery = 'SELECT ';
			// foreach($this->arRelationMap as $key => $value) {
			// 	$strQuery .= '"'.$key.'",';
			// }
			// $strQuery 	 = substr($strQuery,0,strlen($strQuery)-1);
			// if (is_int($this->ID)) {
			// 	$strQuery	.= ' FROM "'. $this->strTableName .'" WHERE "'.$this->strPrimaryKeyName.'"='. $this->ID ;
			// }else{
			// 	$strQuery	.= ' FROM "'. $this->strTableName .'" WHERE "'.$this->strPrimaryKeyName.'"='. "'$this->ID'" ;
			// }

		// query
			$ar_query = [];

		// select
			$ar_query_select = [];
			foreach($this->arRelationMap as $key => $value) {
				$ar_query_select[] = '"'.$key.'"';
			}
			$ar_query[] = 'SELECT '.implode(',', $ar_query_select);

		// from
			$ar_query[] = 'FROM "'.$this->strTableName.'" WHERE "'.$this->strPrimaryKeyName.'"='.(is_int($this->ID) ? $this->ID : '\''.$this->ID.'\'');
				// dump($ar_query, ' ar_query ++ '.to_string($ar_query));

		// $strQuery
			$strQuery = implode(' ', $ar_query);

		# CACHE_MANAGER
		# SI SE LE PASA UN QUERY QUE YA HA SIDO RECIBIDO, NO SE CONECTA CON LA DB Y SE LE DEVUELVE EL RESULTADO DEL QUERY IDÉNTICO YA CALCULADO
		# QUE SE GUARDA EN UN ARRAY ESTÁTICO
		static $ar_RecordDataObject_load_query_cache;
		$use_cache = $this->use_cache;
		if ($use_cache===true && isset($ar_RecordDataObject_load_query_cache[$strQuery])) {

			$arRow = $ar_RecordDataObject_load_query_cache[$strQuery];
			// error_log('CACHE-load- '.$strQuery);

		}else{

			# Clean current connection
			#pg_get_result($this->get_connection()) ;

			// pg_query
				$result = pg_query($this->get_connection(), $strQuery) ;//or die("Cannot (2) execute query: $strQuery <br>\n". pg_last_error(DBi::_getConnection()));
				if ($result===false) {
					trigger_error("Error Processing Request Load");
					if(SHOW_DEBUG===true) {
						throw new Exception("Error Processing Request Load: (".DEDALO_DATABASE_CONN.") ".pg_last_error(DBi::_getConnection())." <hr>$strQuery", 1);
					}
				}

			// With prepared statement
				// $stmtname  = ''; //md5($strQuery); //'search_free_stmt';
				// $statement = pg_prepare($this->get_connection(), $stmtname, $strQuery);
				// if ($statement===false) {
				// 	trigger_error(__METHOD__.' Error: Error when pg_prepare statemnt for strQuery');
				// 	if(SHOW_DEBUG===true) {
				// 		debug_log(__METHOD__." Error when pg_prepare statemnt for strQuery: ".to_string($strQuery), logger::ERROR);
				// 	}
				// 	return false;
				// }
				// $result = pg_execute($this->get_connection(), $stmtname, array());
				// if ($result===false) {
				// 	if(SHOW_DEBUG===true) {
				// 		// throw new Exception("Error Processing Request Load: ".pg_last_error(DBi::_getConnection())." <hr>$strQuery", 1);
				// 		trigger_error("Error Processing Request Load: ".pg_last_error(DBi::_getConnection())." <hr>$strQuery");
				// 	}else{
				// 		trigger_error("Error Processing Request Load");
				// 	}
				// 	return false;
				// }

			// pg_fetch_assoc: false is returned if row exceeds the number of rows in the set, there are no more rows, or on any other error.
			$arRow = pg_fetch_assoc($result); // array|false
			if($arRow===false)	{
				if(SHOW_DEBUG===true) {
					// dump($this,"WARNING: No result on Load arRow : strQuery:".$strQuery);
					// throw new Exception("Error Processing Request (".DEDALO_DATABASE_CONN.") strQuery:$strQuery", 1);
					dump($arRow, ' strQuery +++++++++++++++++++++++++++++++++++ '.PHP_EOL.to_string($strQuery)).PHP_EOL;
					$bt = debug_backtrace();
					dump($bt, ' Load pg_fetch_assoc bt +++++++++++++++++++++ '.to_string($this->ID));
				}
				// trigger_error('WARNING: No result on Load arRow. $strQuery: ' .PHP_EOL. $strQuery);
				debug_log(__METHOD__." 'WARNING: No result on Load arRow: ".to_string($arRow), logger::WARNING);
				return false;
			}

			// cache
				if ($use_cache===true) {
					// store value
					$ar_RecordDataObject_load_query_cache[$strQuery] = $arRow;
				}

			// debug
				if(SHOW_DEBUG===true) {
					$total_time_ms = exec_time_unit($start_time,'ms');
					#$_SESSION['debug_content'][__METHOD__][] = "". str_replace("\n",'',$strQuery) ." [$total_time_ms ms]";
					if($total_time_ms>SLOW_QUERY_MS) error_log($total_time_ms." - LOAD_SLOW_QUERY: $strQuery - records:".count($arRow));

					#if(strpos($strQuery, 'dd294')) {
					#	trigger_error($strQuery. '$strQuery '.$total_time_ms);
					#}
					#error_log("Load RDBO - Loaded: $total_time_ms ms  - $strQuery");
				}
		}

		// old
			// if(is_array($arRow)) foreach($arRow as $key => $value) {

			// 	#try {
			// 		$strMember = $this->arRelationMap[$key];
			// 	#}catch(Exception $e){ echo $e->getMessage(); }

			// 	if(property_exists($this, $strMember) || $key==='texto' ) {

			// 		# special case texto substring
			// 		if($key==='texto' && !$strMember) $strMember = 'texto';
			// 			#echo " +property_exists: $strMember - $value <br>";

			// 		$this->$strMember = $value ;
			// 	}
			// }

		// arRelationMap assign values
			if(isset($arRow) && is_array($arRow)) {
				foreach($arRow as $key => $value) {
					$strMember = $this->arRelationMap[$key];
					if(property_exists($this, $strMember)) {
						$this->{$strMember} = $value;
					}
				}
			}

		# Fix loaded state
		$this->blIsLoaded = true;


		// debug
			// if(SHOW_DEBUG===true) {
				// $totaltime = exec_time_unit($start_time,'ms');
				// static $totaltime_static;
				// $totaltime_static = $totaltime_static + $totaltime;
				// debug_log(__METHOD__." Total: $totaltime ms - $strQuery - sum time ms: ".to_string($totaltime_static), logger::DEBUG);
			// }


		return true;
	}//end load



	/**
	* SAVE
	* Update current record
	* @return int|null $this->ID
	*/
	public function Save() {

		# SAVE UPDATE
		#if(isset($this->ID) && $this->ID>0 && $this->force_insert_on_save!=true) {
		if(isset($this->ID) && strlen($this->ID)>0 && $this->force_insert_on_save!==true) {

			$strQuery		= ' UPDATE "'.$this->strTableName.'" SET ' ;
			$strQuery_set	= '';

			foreach($this->arRelationMap as $key => $value) {

				$actualVal = & $this->$value ;

				if(array_key_exists($value, $this->arModifiedRelations)) {

					$current_val = $actualVal;#json_handler::encode($actualVal);

					if (is_object($current_val) || is_array($current_val)) {
						$current_val = json_handler::encode($current_val);
					}

					if(is_null($current_val)) {
						$strQuery_set .= "\"$key\" = null, ";
					}else if(is_int($current_val)) { // changed  from is_numeric to is_int (06-06-2016)
						$strQuery_set .= "\"$key\" = $current_val, ";
					}else{
						#$strQuery_set .= "\"$key\" = '".pg_escape_string($current_val)."', ";	# Escape the text data
						$strQuery_set .= "\"$key\" = " . pg_escape_literal($this->get_connection(), $current_val) . ", ";
						#$strQuery_set .= "\"$key\" = '".$current_val."', ";	# Escape the text data
							#dump($strQuery_set, ' strQuery_set ++ '.to_string());
					}
				}
			}

			#
			# EMPTY SET ELEMENTS CASE
			if(strlen($strQuery_set)===0) {
				$msg = "Failed Save query (RDBO). Data is not saved because no vars ar set to save. Elements to save: ".count( (array)$this->arRelationMap ) ;
				if(SHOW_DEBUG===true) {
					dump($strQuery, ' strQuery');
				}
				trigger_error($msg);
				#throw new Exception($msg, 1); #die($msg);

				// Because is not an error, only a impossible save query, notify and return normally
				return (int)$this->ID;
			}

			// prevent null encoded errors
				$strQuery_set = str_replace(['\\u0000','\u0000'], ' ', $strQuery_set);

			// remove last 2 chars
				$strQuery .= substr($strQuery_set,0,-2);

			// where sentence
				$strQuery .= (is_int($this->ID))
					? ' WHERE "'. $this->strPrimaryKeyName .'" = ' . $this->ID
					: ' WHERE "'. $this->strPrimaryKeyName .'" = ' . "'$this->ID'";

			$result = pg_query($this->get_connection(), $strQuery);
			if($result===false) {
				echo "Error: sorry an error ocurred on UPDATE record '$this->ID'. Data is not saved";
				if(SHOW_DEBUG===true) {
					dump($strQuery,"strQuery");
					dump(pg_last_error(DBi::_getConnection()),"pg_last_error(DBi::_getConnection())");
					throw new Exception("Error Processing Request", 1);;
				}
			}

		#
		# SAVE INSERT . RECORD NOT EXISTS AND CREATE ONE
		}else{

			$strValueList	= '';
			$strQuery 		= ' INSERT INTO "'.$this->strTableName.'" (';

			foreach($this->arRelationMap as $key => $value) {

				$actualVal = & $this->$value ;

				if(isset($actualVal)) {
					if(array_key_exists($value, $this->arModifiedRelations)) {
						$strQuery		.= "\"$key\", ";

						if (is_object($actualVal) || is_array($actualVal)) {
							$actualVal = json_handler::encode($actualVal);
						}

						if(is_int($actualVal) && $this->strTableName !== 'matrix_time_machine') {
							$strValueList	.= "$actualVal, ";
						}else{
							#$actualVal 	     = $this->get_connection()->real_escape_string($actualVal);
							$strValueList	.= "'".pg_escape_string($this->get_connection(), $actualVal)."', "; # Escape the text data
						}
					}
				}
			}

			// prevent null encoded errors
				$strValueList = str_replace(['\\u0000','\u0000'], ' ', $strValueList);

			$strQuery 	 = substr($strQuery,0,strlen($strQuery)-2);
			$strValueList= substr($strValueList,0,strlen($strValueList)-2);
			$strQuery	.= ') VALUES (';
			$strQuery	.= $strValueList;
			$strQuery	.= ') RETURNING "'.$this->strPrimaryKeyName.'" ';


			$result = pg_query($this->get_connection(), $strQuery);
			if($result===false) {
				if(SHOW_DEBUG===true) {
					dump($strQuery,"strQuery");
					throw new Exception("Error Processing Save Insert Request (1). error: ". pg_last_error(DBi::_getConnection()), 1);
				}
				// return "Error: sorry an error ocurred on INSERT record. Data is not saved";
				debug_log(__METHOD__." Error: sorry an error ocurred on INSERT record. Data is not saved ", logger::ERROR);
				return null;
			}

			$id = pg_fetch_result($result, 0, '"'.$this->strPrimaryKeyName.'"');
			if ($id===false) {
				if(SHOW_DEBUG===true) {
					dump($strQuery,"strQuery");
					throw new Exception("Error Processing Request (1-b): ".pg_last_error(DBi::_getConnection()), 1);
				}
			}
			# Fix new received id
			$this->ID = $id;
		}


		return (int)$this->ID;
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

		static $ar_editable_fields;

		if(isset($ar_editable_fields)) {
			return($ar_editable_fields);
		}

		if(is_array($this->arRelationMap)) {

			foreach($this->arRelationMap as $field_name => $property_name) {

				if($property_name !== 'ID') $ar_editable_fields[] = $field_name ;
			}
			return $ar_editable_fields ;
		}

		return [];
	}//end get_ar_editable_fields



	/**
	* SEARCH
	* Generic search. Needs array key-value as field => value
	* TIPO $arguments['parent'] = 14 ...
	* @return array $ar_records
	*/
	public function search(array $ar_arguments=null, string $matrix_table=null) : array {

		# DEBUG INFO SHOWED IN FOOTER
		if(SHOW_DEBUG===true) $start_time = start_time();

		$ar_records = array();

		# TABLE . Optionally change table temporally for search
		if (!empty($matrix_table)) {
			$this->strTableName = $matrix_table;
		}
		#dump($ar_arguments, " ar_arguments ".to_string());

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

				# OR (foramto lan:or= array('DEDALO_DATA_LANG',DEDALO_DATA_NOLAN))
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

				# begins_or (foramto begins_or:or= array('DEDALO_DATA_LANG',DEDALO_DATA_NOLAN))
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

				# JSON OR (foramto lan:or= array('DEDALO_DATA_LANG',DEDALO_DATA_NOLAN))
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
		$strQuery = trim('SELECT '. $SQL_CACHE .'"'.$strPrimaryKeyName. '" FROM "'.$this->strTableName.'" WHERE '. $strQuery . $strQuery_limit . $strQuery_offset) ;	#$strQuery .= 'SQL_CACHE ';
		// error_log('------ '.$strQuery);

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

			$result = pg_query($this->get_connection(), $strQuery);
			if ($result===false) {
				if(SHOW_DEBUG===true) {
					throw new Exception("Error Processing Request . ".pg_last_error(DBi::_getConnection()), 1);
				}else{
					trigger_error("Error on DB query");
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
			# the nexts results are 0 and duplicate records are built in matrix)
			# Nota: en algunos casos interesa forzar el refresco de los datos (como por ejemplo en counter). Es esos caso NO guardaremos el resultado en caché
			$n_records = is_countable($ar_records) ? sizeof($ar_records) : 0;
			if($use_cache===true && $n_records>0) {
				// store value
				$ar_RecordDataObject_query_search_cache[$strQuery] = $ar_records;
			}

			// debug
				if(SHOW_DEBUG===true) {
					$total_time_ms = exec_time_unit($start_time,'ms');
					#$_SESSION['debug_content'][__METHOD__][] = " ". str_replace("\n",'',$strQuery) ." count:".count($ar_records)." [$total_time_ms ms]";
					if($total_time_ms>SLOW_QUERY_MS) error_log($total_time_ms."ms. SEARCH_SLOW_QUERY: $strQuery - records:".count($ar_records));
				}
		}


		return $ar_records;
	}//end search



	# DESTRUCT
	public function __destruct() {

		if( isset($this->ID) ) {

			if($this->blForDeletion===true) {

				if (is_int($this->ID)) {
					$strQuery 	= "DELETE FROM \"$this->strTableName\" WHERE \"$this->strPrimaryKeyName\" = $this->ID";
				}else{
					$strQuery 	= "DELETE FROM \"$this->strTableName\" WHERE \"$this->strPrimaryKeyName\" = '$this->ID' ";
				}

				#$result 		= mysql_query($strQuery, $this->get_connection());
				#$result 		= $this->get_connection()->query($strQuery);
				$result		= JSON_RecordObj_matrix::search_free($strQuery);

				if($result===false) {
					if(SHOW_DEBUG===true) {
						$msg = __METHOD__." Failed Delete record (RDBO) from {$this->strPrimaryKeyName}: $this->ID \n" . $this->get_connection()->error ;
					}else{
						$msg = "Failed Delete record (RDBO). Record $this->ID is not deleted. Please contact with your admin" ;
					}
					trigger_error($msg);
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
