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

	public $use_cache;
	public $use_cache_manager = false;

	#protected static $db_connection;

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
			$this->ID 				= $id;
		}
		$this->arModifiedRelations	= array();

		$this->use_cache = true;
	}



	# GET_DATO : GET DATO UNIFICADO (JSON)
	public function get_dato() {

		if($this->blIsLoaded!==true) $this->Load();

		if (!isset($this->dato)) {
			#error_log("Callin get dato from ".get_called_class().''.print_r(debug_backtrace(),true) );
			return null;
		}

		return $this->dato;
	}



	# SET_DATO : SET DATO UNIFICADO (JSON)
	public function set_dato($dato, $raw=false) {

		# Always set dato as modified
		$this->arModifiedRelations['dato'] = 1;
		
		$this->dato = $dato;
	}



	# LOAD
	public function Load() {

		# DEBUG INFO SHOWED IN FOOTER
		if(SHOW_DEBUG===true) $start_time = start_time();


		# No do load if $this->ID is not set
		if(!isset($this->ID) || $this->ID===false) return;		

		# SQL QUERY
		$strQuery = 'SELECT ';
		foreach($this->arRelationMap as $key => $value) {
			$strQuery .= '"'.$key.'",';
		}
		$strQuery 	 = substr($strQuery,0,strlen($strQuery)-1);
		if (is_int($this->ID)) {
			$strQuery	.= ' FROM "'. $this->strTableName .'" WHERE "'.$this->strPrimaryKeyName.'"='. $this->ID ;
		}else{
			$strQuery	.= ' FROM "'. $this->strTableName .'" WHERE "'.$this->strPrimaryKeyName.'"='. "'$this->ID'" ;
		}


		# SI SE LE PASA UN QUERY QUE YA HA SIDO RECIBIDO, NO SE CONECTA CON LA DB Y SE LE DEVUELVE EL RESULTADO DEL QUERY IDÉNTICO YA CALCULADO
		# QUE SE GUARDA EN UN ARRAY ESTÁTICO
		static $ar_RecordDataObject_load_query_cache;

		#dump($this->use_cache,'$this->use_cache ID:'.$this->ID." - tipo:$this->tipo");

		# CACHE_MANAGER
		if( $this->use_cache_manager===true && $this->use_cache===true && DEDALO_CACHE_MANAGER===true) { //  && cache::exists($strQuery) 

			#$arRow	= json_handler::decode(cache::get($strQuery));
			$arRow	= unserialize(cache::get($strQuery));

		}else if($this->use_cache===true && isset($ar_RecordDataObject_load_query_cache[$strQuery])) {

			$arRow	= (array)$ar_RecordDataObject_load_query_cache[$strQuery];
				#dump($ar_RecordDataObject_load_query_cache2,'$ar_RecordDataObject_load_query_cache2');

			# DEBUG
			if(SHOW_DEBUG===true) {
				#$totaltime = exec_time($start_time);
				#$_SESSION['debug_content'][__METHOD__.' cache'][] = "<em> --". str_replace("\n",'',$strQuery) . "</em> [$totaltime ms]";
			}

		}else{

			# Clean current connection
			#pg_get_result(DBi::_getConnection()) ;

			$result = pg_query(DBi::_getConnection(), $strQuery) ;//or die("Cannot (2) execute query: $strQuery <br>\n". pg_last_error());
			
			if ($result===false) {
				trigger_error("Error Processing Request Load");
				if(SHOW_DEBUG===true) {
					throw new Exception("Error Processing Request Load: (".DEDALO_DATABASE_CONN.") ".pg_last_error()." <hr>$strQuery", 1);
				}
			}

			$arRow = pg_fetch_assoc($result);
				#dump($arRow,"arRow");			

			if($arRow===false)	{
				if(SHOW_DEBUG===true) {
					#dump($this,"WARNING: No result on Load arRow : strQuery:".$strQuery);
					#throw new Exception("Error Processing Request (".DEDALO_DATABASE_CONN.") strQuery:$strQuery", 1);					
				}
				return(false);
			}


			# CACHE
			#if($this->use_cache===true)
			$ar_RecordDataObject_load_query_cache[$strQuery] = $arRow;
			# CACHE_MANAGER
			if( $this->use_cache_manager===true && $this->use_cache===true && DEDALO_CACHE_MANAGER===true && strpos($strQuery, '_dd')!==false ) {
				#cache::set($strQuery, json_handler::encode($arRow));
				cache::set($strQuery, serialize($arRow));
			}

			# DEBUG
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


		if(is_array($arRow)) foreach($arRow as $key => $value) {

			#try {
				$strMember = $this->arRelationMap[$key];
			#}catch(Exception $e){ echo $e->getMessage(); }

			if(property_exists($this, $strMember) || $key==='texto' ) {

				# special case texto substring
				if($key==='texto' && !$strMember) $strMember = 'texto';
					#echo " +property_exists: $strMember - $value <br>";
				
				$this->$strMember = $value ;			
			}
		}

		# Fix loaded state
		$this->blIsLoaded = true;
		
		/*
		if(SHOW_DEBUG===true) {
			global $contador_destruct;
			if(!isset($contador_destruct)) $contador_destruct=0;		
			$contador_destruct++;
			error_log("Loaded: id:".$this->ID ." - contador:".$contador_destruct ." - $strQuery - ".exec_time_unit($start_time,'ms'));
		}
		*/
		# DEBUG
		if(SHOW_DEBUG===true) {
			#$totaltime = exec_time_unit($start_time,'ms');
			#debug_log(__METHOD__." Total: $totaltime - $strQuery ".to_string(), logger::DEBUG);
		}		
	}//end load



	# SAVE . UPDATE CURRENT RECORD
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

					if(is_int($current_val)) {		 // changed  from is_numeric to is_int (06-06-2016)
						$strQuery_set .= "\"$key\" = $current_val, ";
					}else{						
						#$strQuery_set .= "\"$key\" = '".pg_escape_string($current_val)."', ";	# Escape the text data
						$strQuery_set .= "\"$key\" = " . pg_escape_literal($current_val) . ", ";
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
				return $this->ID;
			}

			$strQuery	.= substr($strQuery_set,0,-2);
			if (is_int($this->ID)) {
				$strQuery	.= ' WHERE "'. $this->strPrimaryKeyName .'" = ' . $this->ID ;
			}else{
				$strQuery	.= ' WHERE "'. $this->strPrimaryKeyName .'" = ' . "'$this->ID'" ;
			}
			#dump($strQuery,"strQuery");

			$result = pg_query(DBi::_getConnection(), $strQuery);
			if($result===false) {
				echo "Error: sorry an error ocurred on UPDATE record '$this->ID'. Data is not saved";
				if(SHOW_DEBUG===true) {
					dump($strQuery,"strQuery");
					dump(pg_last_error(),"pg_last_error()");
					throw new Exception("Error Processing Request", 1);;
				}
			}
			return $this->ID;

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
							#$actualVal 	     = DBi::_getConnection()->real_escape_string($actualVal);
							$strValueList	.= "'".pg_escape_string($actualVal)."', "; # Escape the text data
						}
					}
				}
			}
			$strQuery 	 = substr($strQuery,0,strlen($strQuery)-2);
			$strValueList= substr($strValueList,0,strlen($strValueList)-2);
			$strQuery	.= ') VALUES (';
			$strQuery	.= $strValueList ;
			$strQuery	.= ') RETURNING "'.$this->strPrimaryKeyName.'" ';

			#dump($strQuery,"strQuery");#die();
			$result 	= pg_query(DBi::_getConnection(), $strQuery);

			if($result===false) {
				if(SHOW_DEBUG===true) {
					dump($strQuery,"strQuery");
					throw new Exception("Error Processing Save Insert Request ". pg_last_error(), 1);
				}
				return "Error: sorry an error ocurred on INSERT record. Data is not saved";
			}

			$id = pg_fetch_result($result,0,'"'.$this->strPrimaryKeyName.'"');
			if ($id===false) {
				if(SHOW_DEBUG===true) {
					dump($strQuery,"strQuery");
					throw new Exception("Error Processing Request: ".pg_last_error(), 1);
				}
			}
			# Fix new received id
			$this->ID = $id;

			return $this->ID;
		}
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

				if($property_name !== 'ID') $ar_editable_fields[] = $field_name ;
			}
			return $ar_editable_fields ;
		}
		return false;
	}//end get_ar_editable_fields



	# SEARCH
	# Buscador genérico . Necesita array key-value con campo,valor
	# TIPO $arguments['parent'] = 14 ...
	public function search($ar_arguments=NULL, $matrix_table=NULL) {

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
		$strQuery_limit 	= '';
		$strQuery_offset 	= '';
		$SQL_CACHE 			= false;
	

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
									$strQuery .= "AND $campo ILIKE '%{$value}%' ";
									break;
				# NOT_LIKE
				case (strpos($key,':not_like')!==false):
									$campo = substr($key, 0, strpos($key,':not_like'));
									$strQuery .= "AND $campo NOT LIKE '{$value}' ";
									break;

				# NOT
				case (strpos($key,':!=')!==false):
									$campo = substr($key, 0, strpos($key,':!='));
									$strQuery .= "AND $campo != '{$value}' ";
									break;

				# IS NOT NULL
				case (strpos($key,':not_null')!==false):
									$campo = substr($key, 0, strpos($key,':not_null'));
									$strQuery .= "AND $campo IS NOT NULL ";
									break;

				# OR (foramto lan:or= array('DEDALO_DATA_LANG',DEDALO_DATA_NOLAN))
				case (strpos($key,':or')!==false):
									$campo = substr($key, 0, strpos($key,':or'));
									$strQuery_temp ='';
									foreach ($value as $value_string) {										
										$strQuery_temp .= "$campo = '$value_string' OR ";
									}
									$strQuery .= 'AND ('. substr($strQuery_temp, 0,-4) .') ';
									break;

				case (strpos($key,':unaccent_begins_or')!==false):
									$campo = substr($key, 0, strpos($key,':unaccent_begins_or'));
									$strQuery_temp ='';
									if(is_array($value)) foreach ($value as $value_string) {
										$strQuery_temp .= "unaccent($campo) ILIKE unaccent('{$value_string}%') OR ";
									}
									$strQuery .= 'AND ('. substr($strQuery_temp, 0,-4) .') ';
									break;

				# begins_or (foramto begins_or:or= array('DEDALO_DATA_LANG',DEDALO_DATA_NOLAN))
				case (strpos($key,':begins_or')!==false):
									$campo = substr($key, 0, strpos($key,':begins_or'));
									$strQuery_temp ='';
									if(is_array($value)) foreach ($value as $value_string) {
										$strQuery_temp .= "$campo ILIKE '{$value_string}%' OR ";
									}
									$strQuery .= 'AND ('. substr($strQuery_temp, 0,-4) .') ';
									break;				
				# LIMIT
				case ($key==='sql_limit'):
									$strQuery_limit = ' LIMIT '.(int)$value;
									break;
				# OFFSET
				case ($key==='offset'):
									$strQuery_offset = ' OFFSET '.(int)$value;
									break;

				# SI $key ES 'group_by', INTERPRETAMOS $value COMO SQL en formato "GROUP BY $value"
				case ($key==='group_by'):
									$strQuery .= "GROUP BY $value ";
									break;

				# SI $key ES 'group_by', INTERPRETAMOS $value COMO SQL en formato "ORDER BY $value ASC"
				case ($key==='order_by_asc'):
									$strQuery .= "ORDER BY $value ASC ";
									break;

				# SI $key ES 'group_by', INTERPRETAMOS $value COMO SQL en formato "ORDER BY $value DESC"
				case ($key==='order_by_desc'):
									$strQuery .= "ORDER BY $value DESC ";
									break;

				# BEGINS
				case (strpos($key,':begins')!==false):
									$campo = substr($key, 0, strpos($key,':begins'));
									$strQuery .= "AND $campo ILIKE '{$value}%' ";
									break;

				# JSON BEGINS
				case (strpos($key,':json_exact')!==false):
									$campo = substr($key, 0, strpos($key,':json_exact'));
									$strQuery .= "AND $campo = '\"{$value}\"' ";
									break;

				# JSON OR (foramto lan:or= array('DEDALO_DATA_LANG',DEDALO_DATA_NOLAN))
				case (strpos($key,':json_or')!==false):
									$campo = substr($key, 0, strpos($key,':json_or'));
									$strQuery_temp ='';
									foreach ($value as $value_string) {										
										$strQuery_temp .= "$campo ILIKE '%\"{$value_string}\"%' OR ";
									}
									$strQuery .= 'AND ('. substr($strQuery_temp, 0,-4) .') ';
									#dump ($strQuery,'strQuery');
									break;

				# JSON BEGINS
				case (strpos($key,':json_begins')!==false):
									$campo = substr($key, 0, strpos($key,':json_begins'));
									$strQuery .= "AND $campo ILIKE '\"{$value}%' ";
									break;

				# JSON_ELEMENT
				# Example: locator inside array like '{"section_top_tipo":"oh1","section_top_id_matrix":"47","section_id_matrix":"63","component_tipo":"rsc36","tag_id":"2"}'
				case (strpos($key,':json_element')!==false):
									$campo = substr($key, 0, strpos($key,':json_element'));
									$strQuery .= "AND $campo LIKE '%$value%' ";
									#$strQuery .= "AND match($campo) against('%\"{$value}\"%' IN BOOLEAN MODE) ";
									#dump($strQuery,'$strQuery');
									break;
				# JSON
				case (strpos($key,':json')!==false):
									$campo = substr($key, 0, strpos($key,':json'));
									$strQuery .= "AND $campo ILIKE '%\"{$value}\"%' ";
									#$strQuery .= "AND match($campo) against('%\"{$value}\"%' IN BOOLEAN MODE) ";
									#dump($strQuery,'$strQuery');
									break;				


				# SQL_CACHE
									/*
				case ($key=='sql_cache'):
									if(!$SQL_CACHE && $value) $SQL_CACHE = 'SQL_CACHE ';
									break;
									*/

				# KEY-JSON ( format like "created_by_userID":"114" )
				case (strpos($key,':key-json')!==false):
									$campo = substr($key, 0, strpos($key,':key-json'));
									if (strpos($value, ':')!==false) {
										$ar = explode(':', $value);
										if(isset($ar[0]) && isset($ar[1])) {
											$ar_key 	= $ar[0];
											$ar_value 	= $ar[1];
											#if (is_int($ar_value)) {
											#	$strQuery  .= "AND $campo LIKE '%\"{$ar_key}\":{$ar_value}%' ";
											#}else{
												$strQuery  .= "AND $campo LIKE '%\"{$ar_key}\":\"{$ar_value}\"%' ";
											#}
										}
									}
									break;

				# DEFAULT . CASO GENERAL: USAREMOS EL KEY COMO CAMPO Y EL VALUE COMO VALOR TIPO 'campo = valor'
				default :
									if(is_int($value) && strpos($key, 'dato')===false) {
										$strQuery 	.= "AND \"$key\" = $value ";
									}else{
										$strQuery 	.= "AND \"$key\" = '$value' ";
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
		#$strQuery = trim('SELECT '. $SQL_CACHE .$strPrimaryKeyName. ' FROM '.DEDALO_DATABASE_CONN.'.'.$this->strTableName.' WHERE '. $strQuery .' '. $strQuery_limit) ;	#$strQuery .= 'SQL_CACHE ';
		$strQuery = trim('SELECT '. $SQL_CACHE .'"'.$strPrimaryKeyName. '" FROM "'.$this->strTableName.'" WHERE '. $strQuery . $strQuery_limit . $strQuery_offset) ;	#$strQuery .= 'SQL_CACHE ';
			#debug_log(__METHOD__." strQuery ".to_string($strQuery), logger::DEBUG);


		# CACHE : Static var
		# SI SE LE PASA UN QUERY QUE YA HA SIDO RECIBIDO, NO SE CONECTARÁ CON LA DB Y SE LE DEVUELVE EL RESULTADO DEL QUERY IDÉNTICO YA CALCULADO
		# QUE SE GUARDA EN UN ARRAY ESTÁTICO
		static $ar_RecordDataObject_query_search_cache;

	#$this->use_cache=false;

		# CACHE_MANAGER
		# USING EXTERNAL CACHE MANAGER (LIKE REDIS)
		if( $this->use_cache===true && $this->use_cache_manager===true && DEDALO_CACHE_MANAGER===true) { // && cache::exists($strQuery) 
			
			$ar_records	= unserialize(cache::get($strQuery));
			#$ar_records	= json_handler::decode(cache::get($strQuery));

		# USING INTERNAL STATIC VAR CACHE
		}else if ($this->use_cache===true && isset($ar_RecordDataObject_query_search_cache[$strQuery])) {

			$ar_records	= $ar_RecordDataObject_query_search_cache[$strQuery];
				#dump($ar_records, ' ar_records');

			# DEBUG
			if(SHOW_DEBUG===true) {
				$total_time_ms = exec_time($start_time,'ms');
				#$_SESSION['debug_content'][__METHOD__.' cache'][] = "<em> --". str_replace("\n",'',$strQuery) ."</em> [$totaltime ms]";
				#error_log("Search RDBO - Loaded: $total_time_ms ms  - $strQuery");
			}

		# DATA IS NOT IN CACHE . Searching real data in DB
		}else{

			# WITHOUT STATEMENT : Direct call
			/*
			$result = DBi::_getConnection()->query($strQuery);
			if(!$result) {
				if(SHOW_DEBUG===true) {
					$msg = __METHOD__ . " Failed Search: $strQuery,'strQuery' Error (table '$this->strTableName' exists?) " . DBi::_getConnection()->error ;
				}else{
					$msg = "Failed Search (RDBO). Data is not found. Please contact with your admin (2) " ;
				}
				throw new Exception($msg, 1);
			}
			*/
			/*
			# Sin buffer . Create array with all records founded
			if(($result->num_rows)>0) while ($rows = $result->fetch_array(MYSQLI_ASSOC) ) {
				#$id			 = $rows[$strPrimaryKeyName];
				$ar_records[]= $rows[$strPrimaryKeyName];
			}
			*/
			/*
			# Con buffer . Create array with all records founded
			#$result->data_seek(0);
			while ($rows = $result->fetch_assoc()) {
					$ar_records[]=$rows[$strPrimaryKeyName];
			}
			*/
		
			$result = pg_query(DBi::_getConnection(), $strQuery);
			
			#$result = pg_prepare(DBi::_getConnection(), "", $strQuery);		
			#$result = pg_execute(DBi::_getConnection(), "",array());
				#dump($result, " result ".to_string($strQuery));	
			if ($result===false) {
				if(SHOW_DEBUG===true) {
					throw new Exception("Error Processing Request . ".pg_last_error(), 1);
				}else{
					trigger_error("Error on DB query");
				}							
			}

			while ($rows = pg_fetch_assoc($result)) {
				$ar_records[] = $rows[$strPrimaryKeyName];
			}		

			# CACHE
			# SI SE LE PASA UN QUERY QUE YA HA SIDO RECIBIDO, NO SE CONECTA CON LA DB Y SE LE DEVUELVE EL RESULTADO DEL QUERY IDÉNTICO YA CALCULADO
			# QUE SE GUARDA EN UN ARRAY ESTÁTICO
			# IMPORTANT Only store in cache positive results, NOT EMPTY RESULTS
			# (Store empty results is problematic for example with component_common::get_id_by_tipo_parent($tipo, $parent, $lang) when matrix relation record is created and more than 1 call is made,
			# the nexts results are 0 and duplicate records are builded in matrix)
			# Nota: en algunos casos interesa forzar el refresco de los datos (como por ejemplo en counter). Es esos caso NO guardaremos el resultado en caché
			if($this->use_cache===true && count($ar_records)>0 ) {

				$ar_RecordDataObject_query_search_cache[$strQuery] = $ar_records;

				# CACHE_MANAGER
				if( $this->use_cache_manager===true && $this->use_cache===true && DEDALO_CACHE_MANAGER===true && strpos($strQuery, '_dd')!==false ) {
					#cache::set($strQuery, json_handler::encode($ar_records));
					cache::set($strQuery, serialize($ar_records));
				}
			}

			# DEBUG
			if(SHOW_DEBUG===true) {
				$total_time_ms = exec_time_unit($start_time,'ms');
				#$_SESSION['debug_content'][__METHOD__][] = " ". str_replace("\n",'',$strQuery) ." count:".count($ar_records)." [$total_time_ms ms]";				
				if($total_time_ms>SLOW_QUERY_MS) error_log($total_time_ms."ms. SEARCH_SLOW_QUERY: $strQuery - records:".count($ar_records));				
			}

		}
		#pg_close(DBi::_getConnection());

		return $ar_records;
	}#end search



	# DESTRUCT
	public function __destruct() {

		if( isset($this->ID) ) {

			if($this->blForDeletion === true) {				

				if (is_int($this->ID)) {
					$strQuery 	= "DELETE FROM \"$this->strTableName\" WHERE \"$this->strPrimaryKeyName\" = $this->ID";
				}else{
					$strQuery 	= "DELETE FROM \"$this->strTableName\" WHERE \"$this->strPrimaryKeyName\" = '$this->ID' ";
				}				

				#$result 		= mysql_query($strQuery, DBi::_getConnection());
				#$result 		= DBi::_getConnection()->query($strQuery);
				$result		= JSON_RecordObj_matrix::search_free($strQuery);

				if($result===false) {
					if(SHOW_DEBUG===true) {
						$msg = __METHOD__." Failed Delete record (RDBO) from {$this->strPrimaryKeyName}: $this->ID \n" . DBi::_getConnection()->error ;
					}else{
						$msg = "Failed Delete record (RDBO). Record $this->ID is not deleted. Please contact with your admin" ;
					}
					trigger_error($msg);
					throw new Exception($msg, 1);
				}
			}
		}
		# close connection
		#DBi::_getConnection()->close();
		#DBi::_getConnection()->commit();		
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

			}elseif(is_int($strNewValue)) {
				#eval(' $this->' . $strMember .'=' . $strNewValue . ';');
				$this->$strMember = $strNewValue;

			}elseif(is_string($strNewValue)) {
				# stripslashes and addslashes text values
				/*
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



}//end class
?>