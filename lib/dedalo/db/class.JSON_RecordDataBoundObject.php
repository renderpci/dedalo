<?php
#require_once(DEDALO_LIB_BASE_PATH . '/db/class.DBi.php');
#require_once(DEDALO_LIB_BASE_PATH . '/db/class.json_handler.php');

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

	#protected static $db_connection;
	#public $dato;

	#protected static $ar_RecordDataObject_query;
	#protected static $ar_RecordDataObject_query_search_cache;
	protected $force_insert_on_save = false;

	abstract protected function defineTableName();
	abstract protected function defineRelationMap();
	abstract protected function definePrimaryKeyName();


	#static $ar_RecordDataObject_query_search_cache;

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
	}


	# GET_DATO : GET DATO UNIFICADO (JSON)
	public function get_dato() {
		if($this->blIsLoaded !== true) {			
			$this->Load();
		}
		#if(!isset($this->dato)) return NULL;		
		return $this->dato;		
	}

	# SET_DATO : SET DATO UNIFICADO (JSON)
	public function set_dato($dato) {

		# Always set dato as modified
		$this->arModifiedRelations['dato'] = 1;

		$this->dato = $dato;	
	}


	#
	# LOAD
	public function Load() {
		
		# Verify section_tipo
		if( empty($this->section_tipo) ) {	
			throw new Exception(__METHOD__." Error Processing Request. section_tipo is mandatory to load data", 1);			
		}

		# Not load if $this->section_id is not set
		if( empty($this->section_id) ) {
			if(SHOW_DEBUG) {
				error_log(__METHOD__." WARNING: Try to load without section_id ($this->section_tipo)");
			}
			#return false;
		}

		# DEBUG INFO SHOWED IN FOOTER
		if(SHOW_DEBUG) $start_time = start_time();

		# SQL QUERY
		$strQuery = 'SELECT "datos" FROM "'. $this->strTableName .'" WHERE "section_id" = '. $this->section_id .' AND "section_tipo" = \''. $this->section_tipo .'\'';
		#$strQuery = "SELECT \"datos\" FROM \"$this->strTableName\" WHERE \"section_id\" = $1 AND \"section_tipo\" = $2";
			#dump($strQuery,'$strQuery');

		# SI SE LE PASA UN QUERY QUE YA HA SIDO RECIBIDO, NO SE CONECTA CON LA DB Y SE LE DEVUELVE EL RESULTADO DEL QUERY IDÉNTICO YA CALCULADO
		# QUE SE GUARDA EN UN ARRAY ESTÁTICO
		static $ar_JSON_RecordDataObject_load_query_cache;

		#dump($this->use_cache,'$this->use_cache ID:'.$this->ID." - tipo:$this->tipo");

		# CACHE_MANAGER /**/		
		if( $this->use_cache===true && $this->use_cache_manager && DEDALO_CACHE_MANAGER && cache::exists($strQuery) ) { // USING CACHE MANAGER

			#$arRow	= json_handler::decode(cache::get($strQuery));
			$dato	= unserialize(cache::get($strQuery));

		# CACHE RUN-IN
		}else if( $this->use_cache===true && isset($ar_JSON_RecordDataObject_load_query_cache[$strQuery]) ) {	// USING CACHE RUN-IN

			$dato	= $ar_JSON_RecordDataObject_load_query_cache[$strQuery];
				#dump($dato,'$dato desde cache');

			# DEBUG
			if(SHOW_DEBUG===true) {
				#$totaltime = exec_time($start_time);
				#$_SESSION['debug_content'][__METHOD__.' cache'][] = "<em> --". str_replace("\n",'',$strQuery) . "</em> [$totaltime ms]";
			}

		# WITHOUT QUERY CACHE
		}else{
			
			# Synchronous query 
			$result = pg_query(DBi::_getConnection(), $strQuery);	#or die("Cannot execute query: $strQuery\n". pg_last_error());
			#$result  = pg_query_params(DBi::_getConnection(), $strQuery, array( $this->section_id, $this->section_tipo ));
				if (!$result) {
					trigger_error("Error Processing Request Load");
					if(SHOW_DEBUG) {
						throw new Exception("Error Processing Request Load: ".pg_last_error()." <hr>$strQuery", 1);
					}
				}
		
			$arRow = pg_fetch_assoc($result);
				#dump($arRow,"arRow");

			$dato  = json_handler::decode($arRow['datos']);
				#dump($datos,"datos");			
			

			# CACHE RESULTS
			# Note: Avoid use cache in long imports (memory overloads)		
				if( $this->use_cache===true && $this->use_cache_manager && DEDALO_CACHE_MANAGER && strpos($strQuery, '_dd')!==false ) {
					# CACHE_MANAGER			
					cache::set($strQuery, serialize($dato));
				}else if( $this->use_cache===true ) {
					# CACHE RUN-IN
					$ar_JSON_RecordDataObject_load_query_cache[$strQuery] = $dato;
				}					
			

			# DEBUG
			if(SHOW_DEBUG===true) {
				$total_time_ms = exec_time_unit($start_time,'ms');	
				#$_SESSION['debug_content'][__METHOD__][] = "". str_replace("\n",'',$strQuery) ." [$total_time_ms ms]";							
				if($total_time_ms>SLOW_QUERY_MS) error_log($total_time_ms." - LOAD_SLOW_QUERY: $strQuery - records:".count($dato));
			}
		}

		# Set returned dato (decoded) to object
		$this->dato = $dato;

		# Fix loaded state
		$this->blIsLoaded = true;
		
	}#end load




	#
	# SAVE . UPDATE CURRENT RECORD
	public function Save( $save_options=null ) {

		#dump($this->ID,"this->ID");dump($this->datos,"this->datos");die();
		/*
		$save_options = new stdClass();
			$save_options->new_record = false;

		if (!is_null($new_save_options)) foreach ($save_options as $key => $value) {
			if (property_exists($save_options, $key)) {
				$save_options->$key = $value;
			}
		}
		*/
		

		# DATOS : JSON ENCODE ALWAYS !!!
		$datos = json_handler::encode($this->datos);
		
		#
		# SAVE UPDATE : Record already exists
		if( $save_options->new_record!==true && isset($this->section_id) && $this->section_id>0 && $this->force_insert_on_save!=true ) {

			# Si no se ha modificado nada, ignoramos la orden de salvar
			if(!isset($this->arRelationMap['datos'])) return false;
			
			$strQuery 	= "UPDATE $this->strTableName SET datos = $1 WHERE section_id = $2 AND section_tipo = $3";
			$result 	= pg_query_params(DBi::_getConnection(), $strQuery, array( $datos, $this->section_id, $this->section_tipo ));
			#dump($strQuery,"strQuery");
			if(!$result) {
				if(SHOW_DEBUG) {
					dump($datos,"strQuery $strQuery , section_id:$this->section_id, section_tipo:$this->section_tipo");
					throw new Exception("Error Processing Save Update Request ". pg_last_error(), 1);;
				}
				return "Error: sorry an error ocurred on UPDATE record '$this->ID'. Data is not saved";
			}
			/*
			$strQuery 	= "UPDATE $this->strTableName SET datos = '$datos' WHERE section_id = $this->section_id AND section_tipo = '$this->section_tipo'";
			if (!pg_connection_busy(DBi::_getConnection())) {
				pg_send_query(DBi::_getConnection(), $strQuery);
				$result = pg_get_result(DBi::_getConnection()); # RESULT (pg_get_result for pg_send_query is needed)
				if(!$result) {
					if(SHOW_DEBUG) {
						dump($strQuery,"strQuery");
						throw new Exception("Error Processing Save Update Request ". pg_last_error(), 1);;
					}
					return "Error: sorry an error ocurred on UPDATE record '$this->ID'. Data is not saved";
				}
			}
			error_log("query: $strQuery");
			*/
			
		#
		# SAVE INSERT : Record not exists and create one
		}else{

			switch($this->strTableName) {
				
				# MATRIX_ACTIVITY INSERT (async pg_send_query)
				case 'matrix_activity':
					$strQuery 	= "INSERT INTO $this->strTableName (datos) VALUES ('$datos')";
					# PG_SEND_QUERY is async query
					if (!pg_connection_busy(DBi::_getConnection())) {
						pg_send_query(DBi::_getConnection(), $strQuery);
						$result = pg_get_result(DBi::_getConnection()); # RESULT (pg_get_result for pg_send_query is needed)
					}
					break;
				
				# DEFAULT INSERT (sync pg_query_params)
				default:

					$section_id   = $this->section_id;
					$section_tipo = $this->section_tipo;
					if(empty($section_id) || empty($section_tipo)) {
						#throw new Exception("Error Processing Request. section_id and section_tipo", 1);	
						error_log("Error Processing Request. section_id:$section_id and section_tipo:$section_tipo,  table:$this->strTableName - $this->ID");
					}
					#dump($this," this");die();

					if ($this->force_insert_on_save===true) {
						# Insert record with defined id and datos
						$strQuery 	= "INSERT INTO $this->strTableName (section_id, section_tipo, datos) VALUES ($1, $2, $3) RETURNING id";
					}else{
						# Insert record datos and receive a new id
						$strQuery 	= "INSERT INTO $this->strTableName (section_id, section_tipo, datos) VALUES ($1, $2, $3) RETURNING id";
					}								
					$result = pg_query_params(DBi::_getConnection(), $strQuery, array( $section_id, $section_tipo, $datos ));

					if(!$result) {
						if(SHOW_DEBUG) {
							dump($strQuery,"strQuery section_id:$section_id, section_tipo:$section_tipo, datos:".to_string($datos));	
							throw new Exception("Error Processing Save Insert Request ". pg_last_error(), 1);;
						}
						return "Error: sorry an error ocurred on INSERT record. Data is not saved";
					}

					$id = pg_fetch_result($result,0,'id');
					if (!$id) {
						if(SHOW_DEBUG) {
							dump($strQuery,"strQuery");
							throw new Exception("Error Processing Request: ".pg_last_error(), 1);
						}
					}
					# Fix new received id (id matrix)
					$this->ID = $id;


					# Return always current existin or created id
					return (int)$this->ID;
					break;
			}
			#dump($strQuery,"strQuery INSERT");#die();			
			
		}//end switch($this->strTableName)

		
	}//end Save


	# DELETE
	public function MarkForDeletion() {
		$this->blForDeletion = true;
	}
	# ALIAS OF MarkForDeletion
	public function Delete() {
		$this->MarkForDeletion();
	}


	# ARRAY EDITABLE FIELDS
	public function get_ar_editable_fields() {

		static $ar_editable_fields;

		if(isset($ar_editable_fields)) {
			return($ar_editable_fields);
		}

		if(is_array($this->arRelationMap)) {

			foreach($this->arRelationMap as $field_name => $property_name) {

				if($property_name != 'ID') $ar_editable_fields[] = $field_name ;
			}
			return $ar_editable_fields ;
		}
		return false;
	}



	/**
	* SEARCH_FREE
	* Perform a simple free sql query and exec in db return result resource
	* @param string $strQuery Full SQL query like "SELECT id FROM table WHERE id>0"
	* @param bool $wait to set syc/async exec. Default us true
	* @return resource $result Database resource from exec query
	*/
	public static function search_free($strQuery, $wait=true) {

		#static $search_free_cache;
		#if (isset($search_free_cache) && in_array($strQuery, $search_free_cache)) {
			#return $search_free_cache[$strQuery];
		#}

		if(SHOW_DEBUG) {
			$start_time = start_time();
			if (isset(debug_backtrace()[1]['function'])) {
				$strQuery = '-- search_free : '.debug_backtrace()[1]['function']."\n".$strQuery;
			}
		}
		
		# $result = pg_query(DBi::_getConnection(), $strQuery);	
		# With prepared statement
		$result = pg_prepare(DBi::_getConnection(), "", $strQuery);
		if (!$wait) {
			$result = pg_send_execute(DBi::_getConnection(), "",array());
		}else{
			$result = pg_execute(DBi::_getConnection(), "",array());
		}
		#dump($result, " result ".to_string());
		if(!$result) {
			echo "Error: sorry an error ocurred on search record.";
			if(SHOW_DEBUG) {
				dump($strQuery,"strQuery");
				throw new Exception("Error Processing SEARCH_FREE Request ". pg_last_error(), 1);;
			}
		}
		#dump($result, 'result', array());
		#error_log(__METHOD__." --> Called search search_free: $strQuery");		
		
		/* Reference extract records
		while ($rows = pg_fetch_assoc($result)) {
			$ar_records[] = $rows['id'];
				dump($ar_records,"ar_records");
		}
		*/

		if(SHOW_DEBUG) {
			$total_time_ms = exec_time_unit($start_time,'ms');
			#$_SESSION['debug_content'][__METHOD__][] = " ". str_replace("\n",'',$strQuery) ." [$total_time_ms ms]";
			if($total_time_ms>SLOW_QUERY_MS) {
				#dump(debug_backtrace()[2],' DEBUG_BACKTRACE  ') ;
				error_log($total_time_ms."ms. SEARCH_SLOW_QUERY: $strQuery ");
			}
			#global$TIMER;$TIMER[__METHOD__.'_'.$strQuery.'_TOTAL:'.count($ar_records).'_'.microtime(1)]=microtime(1);
			#error_log("search_free - Loaded: $total_time_ms ms ");
		}

		#$search_free_cache[$strQuery] = $result;
			#dump( array_keys($search_free_cache), ' search_free_cache');

		return $result; # resource
	}



	#
	# SEARCH
	# Buscador genérico . Necesita array key-value con campo,valor
	# TIPO $arguments['parent'] = 14 ...
	public function search($ar_arguments=NULL, $matrix_table=NULL) {

		#$use_cache = $this->use_cache; # Default use class value
		$use_cache = false; # Experimental (cache true for search)


		# DEBUG INFO SHOWED IN FOOTER
		if(SHOW_DEBUG) $start_time = start_time();

		$ar_records 		= array();
		# TABLE . Optionally change table temporally for search
		if (!empty($matrix_table)) {
			$this->strTableName = $matrix_table;
		}

		$strPrimaryKeyName	= $this->strPrimaryKeyName;
		$strQuery			= '';
		$strQuery_limit 	= '';	

		if(is_array($ar_arguments)) foreach($ar_arguments as $key => $value) {

			switch(true) {	#"AND dato LIKE  '%\"{$area_tipo}\"%' ";

				# SI $key ES 'strPrimaryKeyName', LO USAREMOS COMO strPrimaryKeyName A BUSCAR
				case ($key=='strPrimaryKeyName'):
									# If is json selection, strPrimaryKeyName is literal as 'selection'
									if ( strpos($value, '->') ) {
										$strPrimaryKeyName = $value;
									}
									# Else (dedault) is a column key and we use '"column_name"'
									else{
										$strPrimaryKeyName = '"'.$value.'"';
									}									
									break;
				# LIMIT
				case ($key=='sql_limit'):
									$strQuery_limit = "LIMIT $value ";
									break;

				# NOT
				case (strpos($key,':!=')!==false):
									$campo = substr($key, 0, strpos($key,':!='));
									$strQuery .= "AND $campo != '{$value}' ";
									break;

				# SI $key ES 'sql_code', INTERPRETAMOS $value LITERALMENTE, COMO SQL
				case ($key=='sql_code'):
									$strQuery .= $value.' ';
									break;

				# OR (formato lang:or= array('DEDALO_DATA_LANG',DEDALO_DATA_NOLAN))
				case (strpos($key,':or')!==false):
									$campo = substr($key, 0, strpos($key,':or'));
									$strQuery_temp ='';
									foreach ($value as $value_string) {								
										$strQuery_temp .= "$campo = '$value_string' OR ";
									}
									$strQuery .= 'AND ('. substr($strQuery_temp, 0,-4) .') ';
									break;

				# DEFAULT . CASO GENERAL: USAREMOS EL KEY COMO CAMPO Y EL VALUE COMO VALOR TIPO 'campo = valor'
				default :					

						if(is_numeric($value) && strpos($key, 'datos')===false) {
							$strQuery 	.= "AND $key = $value ";
						}else{
							$value = pg_escape_string($value);
							$strQuery 	.= "AND $key = '$value' ";
						}
						break;

			}#end switch(true)
		}#end foreach($ar_arguments as $key => $value)

		# Seguridad
		#if(strpos(strtolower($strQuery), 'update')!=='false' || strpos(strtolower($strQuery), 'delete')!=='false') die("SQL Security Error ". strtolower($strQuery) );

		# Verify query format
		if(strpos($strQuery, 'AND')===0) {
			$strQuery = substr($strQuery, 4);
		}else  if( strpos($strQuery, ' AND')===0 ) {
			$strQuery = substr($strQuery, 5);
		}

		if(SHOW_DEBUG) {
			$strQuery = "\n-- search : ".debug_backtrace()[1]['function']."\n".$strQuery;
		}

		$strQuery = 'SELECT '.$strPrimaryKeyName. ' AS key FROM "'.$this->strTableName.'" WHERE '. $strQuery .' '. $strQuery_limit;
			#dump($strQuery,'strQuery');
			#error_log(__METHOD__." --> Called search query: $strQuery");


		# CACHE : Static var
		# SI SE LE PASA UN QUERY QUE YA HA SIDO RECIBIDO, NO SE CONECTARÁ CON LA DB Y SE LE DEVUELVE EL RESULTADO DEL QUERY IDÉNTICO YA CALCULADO
		# QUE SE GUARDA EN UN ARRAY ESTÁTICO
		static $ar_RecordDataObject_query_search_cache;


		# CACHE_MANAGER : Using external cache manager (like redis) 
		if( $use_cache===true && $this->use_cache_manager && DEDALO_CACHE_MANAGER && cache::exists($strQuery) ) {
			
			$ar_records	= unserialize(cache::get($strQuery));
			#$ar_records	= json_handler::decode(cache::get($strQuery));

		# CACHE RUN-IN
		}else if ( $use_cache===true && isset($ar_RecordDataObject_query_search_cache[$strQuery]) ) {

			$ar_records	= $ar_RecordDataObject_query_search_cache[$strQuery];

			# DEBUG
			if(SHOW_DEBUG) {
				#$totaltime = exec_time($start_time);
				#$_SESSION['debug_content'][__METHOD__.' cache'][] = "<em> --". str_replace("\n",'',$strQuery) ."</em> [$totaltime ms]";
				error_log(__METHOD__." --> Used cache run-in for query: $strQuery");
			}

		# DATA IS NOT IN CACHE . Searching real data in DB
		}else{			
		
			$result = pg_query(DBi::_getConnection(), $strQuery) or die("Cannot execute query: $strQuery\n". pg_last_error());
				#dump($result, 'result', array());
			
			while ($rows = pg_fetch_assoc($result)) {
				$ar_records[] = $rows['key'];
			}
			#dump($ar_records, 'ar_records', array('strQuery'=>$strQuery));	
		

			# CACHE
			# SI SE LE PASA UN QUERY QUE YA HA SIDO RECIBIDO, NO SE CONECTA CON LA DB Y SE LE DEVUELVE EL RESULTADO DEL QUERY IDÉNTICO YA CALCULADO
			# QUE SE GUARDA EN UN ARRAY ESTÁTICO
			# IMPORTANT Only store in cache positive results, NOT EMPTY RESULTS
			# (Store empty results is problematic for example with component_common::get_id_by_tipo_parent($tipo, $parent, $lang) when matrix relation record is created and more than 1 call is made,
			# the nexts results are 0 and duplicate records are builded in matrix)
			
			if( $use_cache===true && $this->use_cache_manager && DEDALO_CACHE_MANAGER && strpos($strQuery, '_dd')!==false && count($ar_records)>0) {
				# CACHE_MANAGER
				cache::set($strQuery, serialize($ar_records));
			}else if( $use_cache===true && count($ar_records)>0 ) {
				# CACHE RUN-IN
				$ar_RecordDataObject_query_search_cache[$strQuery] = $ar_records;
			}
			

			# DEBUG
			if(SHOW_DEBUG) {
				$total_time_ms = exec_time_unit($start_time,'ms');
				#$_SESSION['debug_content'][__METHOD__][] = " ". str_replace("\n",'',$strQuery) ." count:".count($ar_records)." [$total_time_ms ms]";				
				if($total_time_ms>SLOW_QUERY_MS) error_log($total_time_ms."ms. SEARCH_SLOW_QUERY: $strQuery - records:".count($ar_records));				
				#global$TIMER;$TIMER[__METHOD__.'_'.$strQuery.'_TOTAL:'.count($ar_records).'_'.microtime(1)]=microtime(1);
			}

		}
		#pg_close(DBi::_getConnection());

		return $ar_records;

	}#end search



	/**
	* BUILD_PG_FILTER 
	*/
	static function build_pg_filter($modo,$datos='datos',$tipo,$lang,$value) {
		switch ($modo) {
			case 'gin':
				# ref: datos @>'{"components":{"rsc24":{"dato":{"lg-nolan":"114"}}}}'
				return "$datos @>'{\"components\":{\"$tipo\":{\"dato\":{\"$lang\":\"$value\"}}}}'::jsonb ";
				break;
			
			case 'btree':
				$type = gettype($value);
				if(SHOW_DEBUG) {
					#dump($type," type for ".print_r($value,true));
				}				
				switch ($type ) {
					case 'array':
						foreach ($value as $key => $ar_value) {
							if(SHOW_DEBUG) {
								#dump($value," value"); dump($key," key"); dump($ar_value," ar_value");
							}							
							$ar_id_matrix[] = key($ar_value);
						}
						$ar_values_string='';
						foreach ($ar_id_matrix as $id_matrix){
							$ar_values_string .= "'{$id_matrix}'";
							if ($id_matrix != end($ar_id_matrix)) $ar_values_string .= ',';
						}
						return "$datos #>'{components,$tipo,dato,$lang}' ?| array[$ar_values_string] ";
						break;

					case 'object':					
						#$key = key($value);
						#$ar_values_string = "'$key'";
						$ar_values_string='';
						$keys = array_keys((array)$value);
						foreach ($keys as $current_value) {
							$ar_values_string .= "'$current_value'";
							if ($current_value != end($keys)) {
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
	}

	/**
	* BUILD_PG_SELECT
	*/
	static function build_pg_select($modo,$datos='datos',$tipo,$key='dato',$lang) {
		switch ($modo) {
			case 'gin':
				throw new Exception("Error Processing Request. Sorry not implemented...", 1);				
				break;
			case 'btree':
				# ref: datos#>>'{components, $terminoID_valor, dato, $lang}' as $terminoID_valor
				return "$datos #>>'{components,$tipo,$key,$lang}' AS $tipo";
				break;
		}		
	}



	# DESTRUCT
	public function __destruct() {

		#if( isset($this->ID) ) {
		if( isset($this->section_id) && isset($this->section_tipo)) {

			if($this->blForDeletion == true) {

				$strQuery 	= 'DELETE FROM "'. $this->strTableName .'" WHERE "section_id" = $1 AND "section_tipo" = $2';
				$result 	= pg_query_params( DBi::_getConnection(), $strQuery, array($this->section_id, $this->section_tipo) );

				if(!$result) {
					echo "Error: sorry an error ocurred on DELETE record (section_id:$this->section_id, section_tipo:$this->section_tipo). Data is not deleted";
					if(SHOW_DEBUG) {
						dump($strQuery,"Delete strQuery");
						throw new Exception("Error Processing Request (result==false): an error ocurred on DELETE record (section_id:$this->section_id, section_tipo:$this->section_tipo). Data is not deleted", 1);
					}
				}				
			}
		}
		#pg_get_result(DBi::_getConnection()) ;
		# close connection
		#DBi::_getConnection()->close();		
	}







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

			$this->arModifiedRelations[$strMember] = "1";

		}else{
			return(false);
		}
	}
	# ACCESSORS GET
	private function GetAccessor($strMember) {

		if($this->blIsLoaded != true) {
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
	}





};
?>
