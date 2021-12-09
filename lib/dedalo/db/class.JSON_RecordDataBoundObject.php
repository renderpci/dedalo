<?php
/**
* JSON_RecordDataBoundObject
*
*
*/
abstract class JSON_RecordDataBoundObject {

	protected $ID;		# id matrix of current table
	protected $datos;	# Field 'datos' in table matrix
	protected $strTableName;
	public $arRelationMap;
	protected $strPrimaryKeyName ;	# usually id
	protected $blForDeletion;
	protected $blIsLoaded;
	public $arModifiedRelations;

	public $use_cache;
	public $use_cache_manager = false;

	#protected static $ar_RecordDataObject_query;
	#protected static $ar_RecordDataObject_query_search_cache;
	protected $force_insert_on_save = false;

	abstract protected function defineTableName();
	abstract protected function defineRelationMap();
	abstract protected function definePrimaryKeyName();



	# __CONSTRUCT
	public function __construct($id=NULL) {

		$this->strTableName 		= $this->defineTableName();
		$this->strPrimaryKeyName	= $this->definePrimaryKeyName();
		$this->arRelationMap		= $this->defineRelationMap();

		$this->blIsLoaded			= false;
		if(isset($id)) {
			$this->ID 				= intval($id);
		}
		$this->arModifiedRelations	= array();

		$this->use_cache = false;
	}//end __construct



	# GET_DATO : GET DATO UNIFICADO (JSON)
	public function get_dato() {
		if($this->blIsLoaded!==true) {
			$this->Load();
		}
		#if(!isset($this->dato)) return NULL;
		return $this->dato;
	}//end get_dato



	# SET_DATO : SET DATO UNIFICADO (JSON)
	public function set_dato($dato) {

		# Always set dato as modified
		$this->arModifiedRelations['dato'] = 1;

		$this->dato = $dato;
	}//end set_dato



	/**
	* LOAD
	* Get the section whole data from DDBB based on current 'section_tipo' and 'section_id'
	* @return bool
	*/
	public function Load() {

		# DEBUG INFO SHOWED IN FOOTER
		if(SHOW_DEBUG===true) {
			$start_time=microtime(1);;
		}

		// section_tipo. Verify section_tipo
			if( empty($this->section_tipo) ) {
				debug_log(__METHOD__." Error Processing Load Request. section_tipo is mandatory ".to_string(), logger::ERROR);
				return false;
			}

		// Check valid section_tipo for safety
		// Safe tipo test
			if (!$section_tipo = safe_tipo($this->section_tipo)) {
				debug_log(__METHOD__." Error Processing Load Request. Bad tipo: ".to_string($this->section_tipo), logger::ERROR);
				return false;
			}

		// section_id. Not load if $this->section_id is not set
			if( empty($this->section_id) ) {
				debug_log(__METHOD__." Error Processing Load Request. Empty section_id: ".to_string($this->section_id), logger::ERROR);
				return false;
			}

		// Section_id is always int
			$section_id = intval($this->section_id);

		// SQL QUERY
			$strQuery = 'SELECT "datos" FROM "'. $this->strTableName .'" WHERE "section_id" = '. $section_id .' AND "section_tipo" = \''. $section_tipo .'\'';

		// cache. Si se le pasa un query que ya ha sido recibido, no se conecta con la db y se le devuelve el resultado del query idéntico ya calculado
		// que se guarda en un array estático
			static $ar_JSON_RecordDataObject_load_query_cache;

		# CACHE_MANAGER
		if( $this->use_cache===true && $this->use_cache_manager===true && DEDALO_CACHE_MANAGER===true) { // && cache::exists($strQuery)  // USING CACHE MANAGER

			$dato = unserialize(cache::get($strQuery));

		# CACHE RUN-IN
		}else if( $this->use_cache===true && isset($ar_JSON_RecordDataObject_load_query_cache[$strQuery]) ) {	// USING CACHE RUN-IN

			$dato = $ar_JSON_RecordDataObject_load_query_cache[$strQuery];

		# WITHOUT QUERY CACHE
		}else{

			// statement. With prepared statement
				$stmtname	= "";
				$statement	= pg_prepare(DBi::_getConnection(), $stmtname, $strQuery);
				if ($statement===false) {
					debug_log(__METHOD__." Error when pg_prepare statemnt for strQuery: ".to_string($strQuery), logger::ERROR);
					return false;
				}
			// exec
				$result = pg_execute(DBi::_getConnection(), $stmtname, array());
				if ($result===false) {
					$msg = "Error Processing Load Request. pg_last_error: ". pg_last_error();
					debug_log(__METHOD__." $msg ".to_string(PHP_EOL.$strQuery.PHP_EOL), logger::ERROR);
					return false;
				}

			// fetch_assoc. Get as associative array
				$arRow = pg_fetch_assoc($result);

			// dato
				$dato = isset($arRow['datos'])
					? json_handler::decode($arRow['datos'])
					: null;

			// CACHE RESULTS
			// Note: Avoid use cache in long imports (memory overloads)
				if( $this->use_cache===true && $this->use_cache_manager===true && DEDALO_CACHE_MANAGER===true ) {
					# CACHE_MANAGER
					cache::set($strQuery, serialize($dato));
				}else if( $this->use_cache===true ) {
					# CACHE RUN-IN
					$ar_JSON_RecordDataObject_load_query_cache[$strQuery] = $dato;
				}

			// debug
				if(SHOW_DEBUG===true) {
					$total_time_ms = exec_time_unit($start_time,'ms');
					if($total_time_ms>SLOW_QUERY_MS) {
						debug_log(__METHOD__." Total time: {$total_time_ms} ms. SEARCH_SLOW_QUERY: $strQuery ", logger::WARNING);
					}
				}
		}

		// Set returned dato (decoded) to object
			$this->dato = $dato;

		// Fix state as loaded
			$this->blIsLoaded = true;


		return true;
	}//end load



	/**
	* SAVE
	* Updates current record
	* @param object $save_options
	* @return int|bool
	*/
	public function Save( $save_options=null ) {

		// section_tipo. Check valid section_tipo for safety
			if (!$section_tipo = safe_tipo($this->section_tipo)) {
				$msg = " Error Processing Save Request. Invalid section_tipo ".to_string($this->section_tipo);
				debug_log(__METHOD__." $msg", logger::ERROR);
				throw new Exception($msg , 1); // launch exception here to prevent to continue
				return false;
			}

		// section_id. section_id is always int. Zero when empty
			$section_id = (empty($this->section_id))
				? 0
				: intval($this->section_id);

		// datos : JSON ENCODE ALWAYS !!!
			$datos = json_handler::encode($this->datos);

		#
		# SAVE UPDATE : Record already exists
		if( $save_options->new_record!==true && $section_id>0 && $this->force_insert_on_save!==true ) {

			# Si no se ha modificado nada, ignoramos la orden de salvar
			if(!isset($this->arRelationMap['datos'])) {
				return false;
			}

			$strQuery 	= "UPDATE $this->strTableName SET datos = $1 WHERE section_id = $2 AND section_tipo = $3";
			$result 	= pg_query_params(DBi::_getConnection(), $strQuery, array( $datos, $section_id, $section_tipo));
			if($result===false) {
				$msg = " Error Processing Save Request on UPDATE record. Data is not saved. id: ".to_string($this->ID)." pg_last_error: ".pg_last_error();
				debug_log(__METHOD__." $msg", logger::ERROR);
				if(SHOW_DEBUG===true) {
					dump($datos, "strQuery $strQuery , section_id:$section_id, section_tipo:$section_tipo");
				}
				throw new Exception("Error Processing Save UPDATE Request ". pg_last_error(), 1);
				return false;
			}

		#
		# SAVE INSERT : Record not exists and create one
		}else{

			switch($this->strTableName) {

				# MATRIX_ACTIVITY INSERT (async pg_send_query)
				case 'matrix_activity':
					$strQuery = 'INSERT INTO "'.$this->strTableName.'" (datos) VALUES (\''.$datos.'\') RETURNING section_id';
					# PG_SEND_QUERY is async query
					pg_send_query(DBi::_getConnection(), $strQuery);
					$result = pg_get_result(DBi::_getConnection()); # RESULT (pg_get_result for pg_send_query is needed)
					if($result===false) {
						$msg = " Error Processing Save Request on INSERT record. Data is not saved. ".to_string()." pg_last_error: ".pg_last_error();
						debug_log(__METHOD__." $msg", logger::ERROR);
						if(SHOW_DEBUG===true) {
							dump($datos, "strQuery $strQuery , section_id:$section_id, section_tipo:$section_tipo");
						}
						throw new Exception($msg, 1);
						return false;
					}

					// Return sequence auto created section_id
					$section_id = pg_fetch_result($result,0,'section_id');
					if ($section_id===false) {
						$msg = "Error Processing Save INSERT pg_fetch_result: ".pg_last_error();
						debug_log(__METHOD__." $msg", logger::ERROR);
						throw new Exception($msg, 1);
						return false;
					}
					return (int)$section_id;
					break;

				# DEFAULT INSERT (sync pg_query_params)
				default:

					if(empty($section_id) || empty($section_tipo)) {
						$msg = "Error Processing Request. section_id:$section_id and section_tipo:$section_tipo, table:$this->strTableName - $this->ID";
						debug_log(__METHOD__." $msg", logger::ERROR);
					}

					# Insert record datos and receive a new id
					$strQuery = 'INSERT INTO "'.$this->strTableName.'" (section_id, section_tipo, datos) VALUES ($1, $2, $3) RETURNING id';
					# pg_query_params query
					$result = pg_query_params(DBi::_getConnection(), $strQuery, array( $section_id, $section_tipo, $datos ));
					if($result===false) {
						$msg = " Error Processing Save Request on INSERT record. Data is not saved. ".to_string()." pg_last_error: ".pg_last_error();
						debug_log(__METHOD__." $msg", logger::ERROR);
						if(SHOW_DEBUG===true) {
							dump($datos, "strQuery $strQuery , section_id:$section_id, section_tipo:$section_tipo");
						}
						throw new Exception($msg, 1);
						return false;
					}

					$id = pg_fetch_result($result,0,'id');
					if ($id===false) {
						$msg = "Error Processing Save INSERT pg_fetch_result: ".pg_last_error();
						debug_log(__METHOD__." $msg", logger::ERROR);
						throw new Exception($msg, 1);
						return false;
					}
					# Fix new received id (id matrix)
					$this->ID = $id;

					# Return always current existing or created id
					return (int)$this->ID;
					break;
			}//end switch($this->strTableName)

		}//end if( $save_options->new_record!==true && $section_id>0 && $this->force_insert_on_save!==true )

		return false;
	}//end Save



	/**
	* MARKFORDELETION
	* Delete record on destruct
	*/
	public function MarkForDeletion() {
		$this->blForDeletion = true;
	}
	# DELETE. ALIAS OF MarkForDeletion
	public function Delete() {
		$this->MarkForDeletion();
	}



	/**
	* GET_AR_EDITABLE_FIELDS
	*/
	public function get_ar_editable_fields() {

		static $ar_editable_fields;

		if(isset($ar_editable_fields)) {
			return($ar_editable_fields);
		}

		if(is_array($this->arRelationMap)) {

			foreach($this->arRelationMap as $field_name => $property_name) {

				if($property_name!=='ID') $ar_editable_fields[] = $field_name ;
			}
			return $ar_editable_fields ;
		}

		return false;
	}//end get_ar_editable_fields



	/**
	* SEARCH_FREE
	* Perform a simple free sql query and exec in db returning result resource/object
	* @param string $strQuery
	* 	Full SQL query like "SELECT id FROM table WHERE id>0"
	* @param bool $wait
	* 	To set syc/async exec. Default us true
	*
	* @return resource/object $result
	* 	Database resource/object from exec query (resource PHP<8.1, object PHP>=8.1)
	*/
	public static function search_free($strQuery, $wait=true) {

		// debug
			if(SHOW_DEBUG===true) {
				$start_time = start_time();
				if (isset(debug_backtrace()[1]['function'])) {
					$strQuery = '-- search_free : '.debug_backtrace()[1]['function']."\n".$strQuery;
				}
			}

		// statement. With prepared statement
			$stmtname	= "";
			$statement	= pg_prepare(DBi::_getConnection(), $stmtname, $strQuery);
			if ($statement===false) {
				debug_log(__METHOD__." Error when pg_prepare statemnt for strQuery: ".to_string($strQuery), logger::ERROR);
				return false;
			}
		// exec
			if ($wait===false) {
				pg_send_execute(DBi::_getConnection(), $stmtname, array());
			}
			$result = ($wait===false)
				? pg_get_result(DBi::_getConnection())
				: pg_execute(DBi::_getConnection(), $stmtname, array());

			if($result===false) {
				$msg = "Error Processing SEARCH_FREE Request. pg_last_error: ". pg_last_error();
				// trigger_error($msg);
				debug_log(__METHOD__." $msg ".to_string(PHP_EOL.$strQuery.PHP_EOL), logger::ERROR);
			}

		// debug
			if(SHOW_DEBUG===true) {
				$total_time_ms = exec_time_unit($start_time,'ms');
				if($total_time_ms>SLOW_QUERY_MS) {
					debug_log(__METHOD__." Total time: {$total_time_ms} ms. SEARCH_SLOW_QUERY: $strQuery ", logger::WARNING);
				}
			}


		return $result; // is resource PHP<8.1, object PHP>=8.1
	}//end search_free



	/**
	* SEARCH
	* Buscador genérico . Necesita array key-value con campo,valor
	* TIPO $arguments['parent'] = 14 ...
	*/
	public function search($ar_arguments=NULL, $matrix_table=NULL) {

		// cache
			// $use_cache	= $this->use_cache; # Default use class value
			$use_cache		= false; # Experimental (cache true for search)

		// debug info showed in footer
			if(SHOW_DEBUG===true) {
				$start_time = start_time();
			}

		$ar_records = array();

		// table . Optionally changes temporally current table for search
			if (!empty($matrix_table)) {
				$this->strTableName = $matrix_table;
			}

		$strPrimaryKeyName	= $this->strPrimaryKeyName;
		$strQuery			= '';
		$strQuery_limit		= '';

		if(is_array($ar_arguments)) foreach($ar_arguments as $key => $value) {

			switch(true) {	# "AND dato LIKE '%\"{$area_tipo}\"%' ";

				// strPrimaryKeyName. Si $key es 'strPrimaryKeyName', lo usaremos como strPrimaryKeyName a buscar
				case ($key==='strPrimaryKeyName'):
						$strPrimaryKeyName = ( strpos($value, '->') )
							? $value // If is JSON selection, strPrimaryKeyName is literal as 'selection'
							: '"'.$value.'"'; // Else (default) is a column key and we use '"column_name"'
						break;

				// limit
				case ($key==='sql_limit'):
						$strQuery_limit = 'LIMIT '.$value.' ';
						break;

				// not
				case (strpos($key,':!=')!==false):
						$campo		 = substr($key, 0, strpos($key,':!='));
						$strQuery	.= "AND $campo != '{$value}' ";
						break;

				// sql_code. Si $key es 'sql_code', Interpretamos $value literalmente, como sql
				case ($key==='sql_code'):
						$strQuery .= $value.' ';
						break;

				// or (formato lang:or= array('DEDALO_DATA_LANG',DEDALO_DATA_NOLAN))
				case (strpos($key,':or')!==false):
						$campo	= substr($key, 0, strpos($key,':or'));
						$beats	= [];
						foreach ($value as $value_string) {
							$beats[] = "$campo = '$value_string'";
						}
						$strQuery .= 'AND ('. implode(' OR ', $beats) .') ';
						break;

				// default . Caso general: usaremos el key como campo y el value como valor tipo 'campo = valor'
				default :
						if(is_int($value) && strpos($key, 'datos')===false) {	// changed  from is_numeric to is_int (06-06-2016)
							$strQuery .= "AND $key = $value ";
						}else{
							if( !is_string($value) ) {
								debug_log(__METHOD__." Unexpected type: ".gettype($value).". Expected string ".to_string($value), logger::ERROR);
								$strQuery .= "AND $key = 'INVALID VALUE' ";
							}else{
								$value = pg_escape_string(DBi::_getConnection(), $value);
								$strQuery .= "AND $key = '$value' ";
							}
						}
						break;
			}//end switch(true)
		}//end foreach($ar_arguments as $key => $value)


		// Verify query format at beginning
			if(strpos($strQuery, 'AND')===0) {
				$strQuery = substr($strQuery, 4);
			}else if(strpos($strQuery, ' AND')===0) {
				$strQuery = substr($strQuery, 5);
			}

		// debug
			if(SHOW_DEBUG===true) {
				$strQuery = "\n-- search : ".debug_backtrace()[1]['function']."\n".$strQuery;
			}

		// query SQL
			$strQuery = 'SELECT '.$strPrimaryKeyName. ' AS key FROM "'.$this->strTableName.'" WHERE '. $strQuery .' '. $strQuery_limit;

		# CACHE : Static var
		# SI SE LE PASA UN QUERY QUE YA HA SIDO RECIBIDO, NO SE CONECTARÁ CON LA DB Y SE LE DEVUELVE EL RESULTADO DEL QUERY IDÉNTICO YA CALCULADO
		# QUE SE GUARDA EN UN ARRAY ESTÁTICO
		static $ar_RecordDataObject_query_search_cache;


		# CACHE_MANAGER : Using external cache manager (like REDIS)
		if( $use_cache===true && $this->use_cache_manager===true && DEDALO_CACHE_MANAGER===true ) { //  && cache::exists($strQuery)

			$ar_records = unserialize(cache::get($strQuery));

		# CACHE RUN-IN
		}else if ( $use_cache===true && isset($ar_RecordDataObject_query_search_cache[$strQuery]) ) {

			$ar_records	= $ar_RecordDataObject_query_search_cache[$strQuery];

			// DEBUG
				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__." --> Used cache run-in for query: ".to_string($strQuery), logger::DEBUG);
				}

		# DATA IS NOT IN CACHE . Searching real data in DB
		}else{

			$result = pg_query(DBi::_getConnection(), $strQuery);// or die("Cannot execute query: $strQuery\n". pg_last_error());
			if ($result===false) {
				$msg = "Error Processing search Request. pg_last_error: ". pg_last_error();
				// trigger_error($msg);
				debug_log(__METHOD__." $msg ".to_string(PHP_EOL.$strQuery.PHP_EOL), logger::ERROR);
				return [];
			}
			// fill ar_records array with the DDBB data
			while ($rows = pg_fetch_assoc($result)) {
				$ar_records[] = $rows['key'];
			}

			// CACHE
			// SI SE LE PASA UN QUERY QUE YA HA SIDO RECIBIDO, NO SE CONECTA CON LA DB Y SE LE DEVUELVE EL RESULTADO DEL QUERY IDÉNTICO YA CALCULADO
			// QUE SE GUARDA EN UN ARRAY ESTÁTICO
			// IMPORTANT Only store in cache positive results, NOT EMPTY RESULTS
			// (Store empty results is problematic for example with component_common::get_id_by_tipo_parent($tipo, $parent, $lang) when matrix relation record is created and more than 1 call is made,
			// the next results are 0 and duplicate records are built in matrix)
				$n_records = count($ar_records);
				if( $use_cache===true && $this->use_cache_manager===true && DEDALO_CACHE_MANAGER===true && $n_records>0 ) {
					# CACHE_MANAGER
					cache::set($strQuery, serialize($ar_records));
				}else if( $use_cache===true && $n_records>0 ) {
					# CACHE RUN-IN
					$ar_RecordDataObject_query_search_cache[$strQuery] = $ar_records;
				}


			// DEBUG
				if(SHOW_DEBUG===true) {
					$total_time_ms = exec_time_unit($start_time,'ms');
					if($total_time_ms>SLOW_QUERY_MS) {
						debug_log(__METHOD__."  ".$total_time_ms."ms. SEARCH_SLOW_QUERY: $strQuery - records:".count($ar_records).to_string(), logger::ERROR);
					}
				}
		}
		// pg_close(DBi::_getConnection());


		return $ar_records;
	}//end search



	/**
	* BUILD_PG_FILTER
	*/
	public static function build_pg_filter($modo, $datos, $tipo, $lang, $value) {

		if (empty($datos)) {
			$datos = 'datos';
		}

		switch ($modo) {
			case 'gin':
				# ref: datos @>'{"components":{"rsc24":{"dato":{"lg-nolan":"114"}}}}'
				$value = pg_escape_string(DBi::_getConnection(), stripslashes($value));
				#$value = pg_escape_literal(DBi::_getConnection(), stripslashes($value));
				return "$datos @>'{\"components\":{\"$tipo\":{\"dato\":{\"$lang\":\"$value\"}}}}'::jsonb ";
				break;

			case 'btree':
				$type = gettype($value);
				if(SHOW_DEBUG===true) {
					#dump($type," type for ".print_r($value,true));
				}
				switch ($type ) {
					case 'array':
						foreach ($value as $key => $ar_value) {
							if(SHOW_DEBUG===true) {
								#dump($value," value"); dump($key," key"); dump($ar_value," ar_value");
							}
							$ar_id_matrix[] = key($ar_value);
						}
						$ar_values_string='';
						$end_value = end($ar_id_matrix);
						foreach ($ar_id_matrix as $id_matrix){
							$ar_values_string .= "'{$id_matrix}'";
							if ($id_matrix !== $end_value) $ar_values_string .= ',';
						}
						return "$datos #>'{components,$tipo,dato,$lang}' ?| array[$ar_values_string] ";
						break;

					case 'object':
						#$key = key($value);
						#$ar_values_string = "'$key'";
						$ar_values_string='';
						$keys = array_keys((array)$value);
						$end_value = end($keys);
						foreach ($keys as $current_value) {
							$ar_values_string .= "'$current_value'";
							if ($current_value !== $end_value) {
								$ar_values_string .=',';
							}
						}
						#dump($ar_values_string, ' ar_values_string');
						return "$datos #>'{components,$tipo,dato,$lang}' ?| array[$ar_values_string] ";
						#$value = json_encode($value);
						#return  "$datos #>'{components,$tipo,dato,$lang}' @> '[$value]'::jsonb ";
						break;

					default:
						# ref: datos #>> '{components,rsc24,dato,lg-nolan}' = '114'
						return "$datos #>>'{components,$tipo,dato,$lang}'='$value'";
						break;
				}
				break;
		}
	}//end build_pg_filter



	/**
	* BUILD_PG_SELECT
	*/
	public static function build_pg_select($modo, $datos, $tipo, $key, $lang) {
		
		if(empty($datos)){
			$datos = 'datos';
		}

		if(empty($key)){
			$key = 'dato';
		} 

		switch ($modo) {
			case 'gin':
				throw new Exception("Error Processing Request. Sorry not implemented...", 1);
				break;
			case 'btree':
				# ref: datos#>>'{components, $terminoID_valor, dato, $lang}' as $terminoID_valor
				return "$datos #>>'{components,$tipo,$key,$lang}' AS $tipo";
				break;
		}
	}//end build_pg_select



	/**
	* __DESTRUCT
	*/
	public function __destruct() {

		if( isset($this->section_id) && isset($this->section_tipo)) {

			if($this->blForDeletion === true) {

				# Section_id is always int
				$section_id = intval($this->section_id);

				# Check valid section_tipo for safety
				# Safe tipo test
				if (!$section_tipo = safe_tipo($this->section_tipo)) {
					// die("Bad tipo ".htmlentities($this->section_tipo));
					$msg = " Error Processing __destruct DELETE. Invalid section_tipo ".to_string($this->section_tipo);
					debug_log(__METHOD__." $msg", logger::ERROR);
					throw new Exception($msg , 1); // launch exception here to prevent to continue
					return false;
				}

				$strQuery	= 'DELETE FROM "'. $this->strTableName .'" WHERE "section_id" = $1 AND "section_tipo" = $2';
				$result		= pg_query_params( DBi::_getConnection(), $strQuery, array($section_id, $section_tipo) );
				if($result===false) {
					if(SHOW_DEBUG===true) {
						dump($strQuery,"Delete strQuery");
					}
					$msg = " Error Processing __destruct DELETE. Data is not deleted ($this->section_tipo,$this->section_id)".to_string();
					debug_log(__METHOD__." $msg", logger::ERROR);
					throw new Exception($msg , 1); // launch exception here to prevent to continue
					return false;
				}
			}
		}
		#pg_get_result(DBi::_getConnection()) ;
		# close connection
		#DBi::_getConnection()->close();
	}//end __destruct



	# ACCESSORS CALL
	public function __call($strFunction, $arArguments) {
		#echo "call ok $strFunction - $arArguments";
		$strMethodType 		= substr($strFunction, 0, 4); # like set or get_
		$strMethodMember 	= substr($strFunction, 4);
		switch($strMethodType) {
			case 'set_' : return($this->SetAccessor($strMethodMember, $arArguments[0]));	break;
			case 'get_' : return($this->GetAccessor($strMethodMember));						break;
		}
		return(false);
	}
	# ACCESSORS SET
	private function SetAccessor($strMember, $strNewValue) {

		if(property_exists($this, $strMember)) {

			if(is_null($strNewValue)) {
				$this->$strMember = $strNewValue;

			}elseif(is_numeric($strNewValue)) {
				#eval(' $this->' . $strMember .'=' . $strNewValue . ';');
				$this->$strMember = $strNewValue;

			}elseif(is_string($strNewValue)) {
				/*
				# stripslashes and addslashes text values
				if(is_string($strNewValue)) {
					$strNewValue = stripslashes($strNewValue);
					$strNewValue = stripslashes($strNewValue);
					$strNewValue = addslashes($strNewValue);
				}
				*/
				#eval(' $this->' . $strMember .'="' . $strNewValue . '";');
				$this->$strMember = "$strNewValue";

			}else{
				$this->$strMember = $strNewValue;
			}

			$this->arModifiedRelations[$strMember] = 1;

		}else{
			return(false);
		}
	}//end SetAccessor
	# ACCESSORS GET
	private function GetAccessor($strMember) {

		if($this->blIsLoaded!==true) {
			$this->Load();
		}
		if(property_exists($this, $strMember)) {
			#eval(' $strRetVal = $this->' . $strMember .';');
			$strRetVal = $this->$strMember;

			#if(is_string($strRetVal)) $strRetVal = stripslashes($strRetVal);
			return($strRetVal);
		}else{
			return(false);
		}
	}//end GetAccessor



}//end class JSON_RecordDataBoundObject


