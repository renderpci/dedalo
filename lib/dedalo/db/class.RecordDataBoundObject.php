<?php
#require_once(DEDALO_LIB_BASE_PATH . '/db/class.DBi.php');
#require_once(DEDALO_LIB_BASE_PATH . '/db/class.json_handler.php');



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


	#static $ar_RecordDataObject_query_search_cache;

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

		if($this->blIsLoaded != true) $this->Load();

		if (!isset($this->dato)) {
			#error_log("Callin get dato from ".get_called_class().''.print_r(debug_backtrace(),true) );
			return NULL;		
		}

		return $this->dato;
		/*
		if(!isset($this->dato)) return NULL;

		if ($raw) {
			return $this->dato;
		}

		$dato = $this->dato;
			#dump($dato,'dato pre json decode');

		# FORMATOS RECIBIDOS:
			# String:				María
			# String JSON:			"María"
			# Array secuencial:		["María","Begoña"] (Cualquier array cuyo key sea consecutivo y que comience en 0)
			# Array no secuencial	{"nombre":"María","apellidos":"Pérez"} (Arrays asociativos o cualquier array cuyo key sea no consecutivo o que no comience en 0)
		#
		# Test dato . Decode and convert in array if have various values ( format json_decode($dato,true) )
		# $dato_decoded = json_decode($dato,true);
		$dato_decoded = json_handler::decode($dato,true);
			#dump($dato,'dato post json decode');

		# Case IS JSON encoded
		if($dato_decoded != NULL) $dato = $dato_decoded;
			#dump($dato,'$dato');

		# "" is replaced by NULL . ("" es la representación json de null en DDBB)
		if($dato=='""') return NULL;

		# Case IS String apply htmlspecialchars formater
		#if(is_string($dato)) $dato = htmlspecialchars($dato);	DESHABILITADO (ALTERA EL DUPLICADO EN MATRIX TIME MACHINE)

		return $dato;	
		*/	
	}

	# SET_DATO : SET DATO UNIFICADO (JSON)
	public function set_dato($dato, $raw=false) {

		# Always set dato as modified
		$this->arModifiedRelations['dato'] = 1;
		
		$this->dato = $dato;
		/*
		if ($raw) {
			$this->dato = $dato;
			return ;
		}

		# JSON ENCODING
		# FORZAMOS SIEMPRE CODIFICAR EN JSON (IMPORTANTE : JSON_UNESCAPED_UNICODE !!)
		# FORMATOS:
			# String:				María
			# String JSON:			"María"
			# Array secuencial:		["María","Begoña"] (Cualquier array cuyo key sea consecutivo y que comience en 0)
			# Array no secuencial	{"nombre":"María","apellidos":"Pérez"} (Arrays asociativos o cualquier array cuyo key sea no consecutivo o que no comience en 0)

		# En php <5.4 no existe JSON_UNESCAPED_SLASHES (su valor es int 256)
		#if(!defined('JSON_UNESCAPED_UNICODE')) define('JSON_UNESCAPED_UNICODE', 256);
			#dump($dato,"set_dato pre json decode $dato",$raw);

		# Reemplazamos las comillas dobles por sencillas antes de pasar el dato a JSON
		if(is_string($dato)) {
			#$dato = stripslashes($dato);
			$dato = str_replace('"', "'", $dato);
		}

		#$dato = json_encode($dato, JSON_UNESCAPED_UNICODE);			#dump(JSON_UNESCAPED_UNICODE);
		$dato = json_handler::encode($dato);		# | JSON_NUMERIC_CHECK
			#dump($dato,'$dato');

		#if(is_numeric($dato)) {
		#	$this->dato = $dato;
		#}else{
			# stripslashes and addslashes text values
			# is important and mandatory for avoid duplicate slashes
			if(is_string($dato)) {
				$dato = stripslashes($dato);
				$dato = stripslashes($dato);
				//$dato = addslashes($dato);
			#}else if ($dato==NULL) {
			}else if (is_null($dato)) {
				#$dato = json_handler::encode(NULL);
				$dato = '';
			}
			$this->dato = $dato;
		#}
		#dump($dato,"set_dato post json decode $dato",$raw);
		*/
	}


	# LOAD
	public function Load() {

		# No do load if $this->ID is not set
		if(!isset($this->ID) || !$this->ID) return;

		# DEBUG INFO SHOWED IN FOOTER
		if(SHOW_DEBUG) $start_time = start_time();

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
		if( $this->use_cache_manager && $this->use_cache===true && DEDALO_CACHE_MANAGER && cache::exists($strQuery) ) {

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
			
			if (!$result) {
				trigger_error("Error Processing Request Load");
				if(SHOW_DEBUG) {
					throw new Exception("Error Processing Request Load: (".DEDALO_DATABASE_CONN.") ".pg_last_error()." <hr>$strQuery", 1);
				}
			}

			$arRow = pg_fetch_assoc($result);
				#dump($arRow,"arRow");
			

			if(!$arRow)	{
				if(SHOW_DEBUG) {
					#dump($this,"WARNING: No result on Load arRow : strQuery:".$strQuery);
					#throw new Exception("Error Processing Request (".DEDALO_DATABASE_CONN.") strQuery:$strQuery", 1);					
				}
				return(false);
			}


			# CACHE
			#if($this->use_cache===true)
			$ar_RecordDataObject_load_query_cache[$strQuery] = $arRow;
			# CACHE_MANAGER
			if( $this->use_cache_manager && $this->use_cache===true && DEDALO_CACHE_MANAGER && strpos($strQuery, '_dd')!==false ) {
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

			try {
				$strMember = $this->arRelationMap[$key];
			}catch(Exception $e){ echo $e->getMessage(); }

			if(property_exists($this, $strMember) || $key=='texto' ) {

				# special case texto substring
				if(!$strMember && $key=='texto') $strMember = 'texto';
					#echo " +property_exists: $strMember - $value <br>";
				
				$this->$strMember = $value ;			
			}
		}

		# Fix loaded state
		$this->blIsLoaded = true;
		
		/*
		if(SHOW_DEBUG) {
			global $contador_destruct;
			if(!isset($contador_destruct)) $contador_destruct=0;		
			$contador_destruct++;
			error_log("Loaded: id:".$this->ID ." - contador:".$contador_destruct ." - $strQuery - ".exec_time_unit($start_time,'ms'));
		}
		*/
		
	}#end load




	# SAVE . UPDATE CURRENT RECORD
	public function Save() {
		
		# SAVE UPDATE
		#if(isset($this->ID) && $this->ID>0 && $this->force_insert_on_save!=true) {
		if(isset($this->ID) && strlen($this->ID)>0 && $this->force_insert_on_save!=true) {

			$strQuery		= ' UPDATE "'.$this->strTableName.'" SET ' ;
			$strQuery_set	= '';

			foreach($this->arRelationMap as $key => $value) {					

				$actualVal = & $this->$value ;

				if(array_key_exists($value, $this->arModifiedRelations)) {

					$current_val = $actualVal;#json_handler::encode($actualVal);

					if (is_object($current_val) || is_array($current_val)) {
						$current_val = json_handler::encode($current_val);
					}

					if(is_numeric($current_val)) {						
						$strQuery_set .= "\"$key\" = $current_val, ";
					}else{
						#$strQuery_set .= "\"$key\" = '".pg_escape_string($current_val)."', ";	# Escape the text data
						$strQuery_set .= "\"$key\" = " . pg_escape_literal($current_val) . ", ";
						#$strQuery_set .= "\"$key\" = '".$current_val."', ";	# Escape the text data
					}
				}
			}
			if(strlen($strQuery_set)==0) {
				if(SHOW_DEBUG===true) {
					dump($strQuery, ' strQuery');
					$msg = __METHOD__ ." Failed Save query (Update): strQuery_set = $strQuery_set " .print_r($this->arModifiedRelations,true);
				}else{
					$msg = "Failed Save query (RDBO). Data is not saved. Please contact with your admin" ;
				}
				trigger_error($msg);
				throw new Exception($msg, 1);
				#die($msg);
			}
			$strQuery	.= substr($strQuery_set,0,-2);
			if (is_int($this->ID)) {
				$strQuery	.= ' WHERE "'. $this->strPrimaryKeyName .'" = ' . $this->ID ;
			}else{
				$strQuery	.= ' WHERE "'. $this->strPrimaryKeyName .'" = ' . "'$this->ID'" ;
			}
			#dump($strQuery,"strQuery");

			$result = pg_query(DBi::_getConnection(), $strQuery);
			if(!$result) {
				echo "Error: sorry an error ocurred on UPDATE record '$this->ID'. Data is not saved";
				if(SHOW_DEBUG) {
					dump($strQuery,"strQuery");
					dump(pg_last_error(),"pg_last_error()");
					throw new Exception("Error Processing Request", 1);;
				}
			}
			return($this->ID);

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

						if(is_numeric($actualVal) && $this->strTableName!= 'matrix_time_machine') {
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



			if(!$result) {
				if(SHOW_DEBUG) {
					dump($strQuery,"strQuery");
					throw new Exception("Error Processing Save Insert Request ". pg_last_error(), 1);
				}
				return "Error: sorry an error ocurred on INSERT record. Data is not saved";
			}

			$id = pg_fetch_result($result,0,'"'.$this->strPrimaryKeyName.'"');
			if (!$id) {
				if(SHOW_DEBUG) {
					dump($strQuery,"strQuery");
					throw new Exception("Error Processing Request: ".pg_last_error(), 1);
				}
			}
			# Fix new received id
			$this->ID = $id;

			return $this->ID;
		}
	}


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







	# SEARCH
	# Buscador genérico . Necesita array key-value con campo,valor
	# TIPO $arguments['parent'] = 14 ...
	public function search($ar_arguments=NULL, $matrix_table=NULL) {

		# DEBUG INFO SHOWED IN FOOTER
		if(SHOW_DEBUG) $start_time = start_time();

		$ar_records 		= array();
		# TABLE . Optionally change table temporally for search
		if (!empty($matrix_table)) {
			$this->strTableName = $matrix_table;
		}
		#dump($ar_arguments, " ar_arguments ".to_string());

		$strPrimaryKeyName	= $this->strPrimaryKeyName;
		$strQuery			= '';
		$strQuery_limit 	= '';
		$SQL_CACHE 			= false;
	

		if(is_array($ar_arguments)) foreach($ar_arguments as $key => $value) {

			switch(true) {	#"AND dato LIKE  '%\"{$area_tipo}\"%' ";

				# SI $key ES 'strPrimaryKeyName', LO USAREMOS COMO strPrimaryKeyName A BUSCAR
				case ($key=='strPrimaryKeyName'):
									$strPrimaryKeyName = $value;
									break;

				# SI $key ES 'sql_code', INTERPRETAMOS $value LITERALMENTE, COMO SQL
				case ($key=='sql_code'):
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

				# begins_or (foramto begins_or:or= array('DEDALO_DATA_LANG',DEDALO_DATA_NOLAN))
				case (strpos($key,':begins_or')!==false):
									$campo = substr($key, 0, strpos($key,':begins_or'));
									$strQuery_temp ='';
									if(is_array($value)) foreach ($value as $value_string) {
										$strQuery_temp .= "$campo LIKE '{$value_string}%' OR ";
									}
									$strQuery .= 'AND ('. substr($strQuery_temp, 0,-4) .') ';
									break;
				# LIMIT
				case ($key=='sql_limit'):
									$strQuery_limit = "LIMIT $value ";
									break;

				# SI $key ES 'group_by', INTERPRETAMOS $value COMO SQL en formato "GROUP BY $value"
				case ($key=='group_by'):
									$strQuery .= "GROUP BY $value ";
									break;

				# SI $key ES 'group_by', INTERPRETAMOS $value COMO SQL en formato "ORDER BY $value ASC"
				case ($key=='order_by_asc'):
									$strQuery .= "ORDER BY $value ASC ";
									break;

				# SI $key ES 'group_by', INTERPRETAMOS $value COMO SQL en formato "ORDER BY $value DESC"
				case ($key=='order_by_desc'):
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
									if(is_numeric($value) && strpos($key, 'dato')===false) {
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
		$strQuery = trim('SELECT '. $SQL_CACHE .'"'.$strPrimaryKeyName. '" FROM "'.$this->strTableName.'" WHERE '. $strQuery .' '. $strQuery_limit) ;	#$strQuery .= 'SQL_CACHE ';
			#dump( stripslashes( $strQuery ),'strQuery');


		# CACHE : Static var
		# SI SE LE PASA UN QUERY QUE YA HA SIDO RECIBIDO, NO SE CONECTARÁ CON LA DB Y SE LE DEVUELVE EL RESULTADO DEL QUERY IDÉNTICO YA CALCULADO
		# QUE SE GUARDA EN UN ARRAY ESTÁTICO
		static $ar_RecordDataObject_query_search_cache;

	#$this->use_cache=false;

		# CACHE_MANAGER
		# USING EXTERNAL CACHE MANAGER (LIKE REDIS)
		if( $this->use_cache===true && $this->use_cache_manager && DEDALO_CACHE_MANAGER && cache::exists($strQuery) ) {
			
			$ar_records	= unserialize(cache::get($strQuery));
			#$ar_records	= json_handler::decode(cache::get($strQuery));

		# USING INTERNAL STATIC VAR CACHE
		}else if ($this->use_cache===true && isset($ar_RecordDataObject_query_search_cache[$strQuery])) {

			$ar_records	= $ar_RecordDataObject_query_search_cache[$strQuery];
				#dump($ar_records, ' ar_records');

			# DEBUG
			if(SHOW_DEBUG) {
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
				if(SHOW_DEBUG) {
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
			#dump($strQuery);
		
			$result = pg_query(DBi::_getConnection(), $strQuery);	# or die("Cannot (1) execute query: $strQuery <br>\n". pg_last_error());
			#$result = pg_prepare(DBi::_getConnection(), "", $strQuery);		
			#$result = pg_execute(DBi::_getConnection(), "",array());
				#dump($result, " result ".to_string($strQuery));	
				if (!$result) {					
					if(SHOW_DEBUG) {
						throw new Exception("Error Processing Request . ".pg_last_error(), 1);
					}else{
						trigger_error("Error on DB query");
					}							
				}
			if (is_resource($result)) {			
				while ($rows = pg_fetch_assoc($result)) {
					$ar_records[] = $rows[$strPrimaryKeyName];
				}
			}
			#dump($ar_records, 'ar_records', array());	
		

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
				if( $this->use_cache_manager && $this->use_cache===true && DEDALO_CACHE_MANAGER && strpos($strQuery, '_dd')!==false ) {
					#cache::set($strQuery, json_handler::encode($ar_records));
					cache::set($strQuery, serialize($ar_records));
				}
			}

			# DEBUG
			if(SHOW_DEBUG) {
				$total_time_ms = exec_time_unit($start_time,'ms');
				#$_SESSION['debug_content'][__METHOD__][] = " ". str_replace("\n",'',$strQuery) ." count:".count($ar_records)." [$total_time_ms ms]";				
				if($total_time_ms>SLOW_QUERY_MS) error_log($total_time_ms."ms. SEARCH_SLOW_QUERY: $strQuery - records:".count($ar_records));
				#if(strpos($strQuery, 'dd294')) {
				#	trigger_error($strQuery. '$strQuery '.$total_time_ms);
				#}
				#global$TIMER;$TIMER[__METHOD__.'_'.$strQuery.'_TOTAL:'.count($ar_records).'_'.microtime(1)]=microtime(1);
				#error_log("Load RDBO - Search: $total_time_ms ms  - $strQuery");
			}

		}
		#pg_close(DBi::_getConnection());

		return $ar_records;

	}#end search








	/*
	# SEARCH2
	public function search2($ar_arguments=NULL, $matrix_table=NULL) {
	
		# DEBUG INFO SHOWED IN FOOTER
		if(SHOW_DEBUG) $start_time = start_time();


		$ar_records 		= array();
		$strPrimaryKeyName	= $this->strPrimaryKeyName;
		$strQuery			= '';
		$strQuery_limit 	= '';

		if(is_array($ar_arguments)) foreach($ar_arguments as $key => $value) {


			switch(true) {	#"AND dato LIKE  '%\"{$area_tipo}\"%' ";

				# SI $key ES 'strPrimaryKeyName', LO USAREMOS COMO strPrimaryKeyName A BUSCAR
				case ($key=='strPrimaryKeyName') :
											$strPrimaryKeyName = $value;
											break;

				# SI $key ES 'sql_code', INTERPRETAMOS $value LITERALMENTE, COMO SQL
				case ($key=='sql_code') : 	$strQuery .= $value.' ';
											break;

				# LIKE_%
				case (strpos($key,':%like%')!==false):
											$campo = substr($key, 0, strpos($key,':%like%'));
											$strQuery .= "AND $campo LIKE '%{$value}%' ";
											break;
				# NOT_LIKE
				case (strpos($key,':not_like')!==false):
											$campo = substr($key, 0, strpos($key,':not_like'));
											$strQuery .= "AND $campo NOT LIKE '{$value}' ";
											break;

				# OR (foramto lan:or= array('DEDALO_DATA_LANG',DEDALO_DATA_NOLAN))
				case (strpos($key,':or')!==false) :
											$campo = substr($key, 0, strpos($key,':or'));
											$strQuery_temp ='';
											foreach ($value as $value_string) {
												$strQuery_temp .= "$campo = '$value_string' OR ";
											}
											$strQuery .= 'AND ('. substr($strQuery_temp, 0,-4) .') ';
											break;

				# begins_or (foramto lan:begins_or= array('DEDALO_DATA_LANG',DEDALO_DATA_NOLAN))
				case (strpos($key,':begins_or')!==false) :
											$campo = substr($key, 0, strpos($key,':begins_or'));
											$strQuery_temp ='';
											foreach ($value as $value_string) {
												$strQuery_temp .= "$campo LIKE '{$value_string}%' OR ";
											}
											$strQuery .= 'AND ('. substr($strQuery_temp, 0,-4) .') ';
											break;
				# LIMIT
				case ($key=='sql_limit') : 	$strQuery_limit = "LIMIT $value ";
											break;

				# SI $key ES 'group_by', INTERPRETAMOS $value COMO SQL en formato "GROUP BY $value"
				case ($key=='group_by') : 	$strQuery .= "GROUP BY $value ";
											break;

				# SI $key ES 'group_by', INTERPRETAMOS $value COMO SQL en formato "ORDER BY $value ASC"
				case ($key=='order_by_asc'):$strQuery .= "ORDER BY $value ASC ";
											break;

				# SI $key ES 'group_by', INTERPRETAMOS $value COMO SQL en formato "ORDER BY $value DESC"
				case ($key=='order_by_desc'):
											$strQuery .= "ORDER BY $value DESC ";
											break;
				# BEGINS
				case (strpos($key,':begins')!==false):
											$campo = substr($key, 0, strpos($key,':begins'));
											$strQuery .= "AND $campo LIKE '{$value}%' ";
											break;
				# JSON BEGINS
				case (strpos($key,':json_begins')!==false):
											$campo = substr($key, 0, strpos($key,':json_begins'));
											$strQuery .= "AND $campo LIKE '\"{$value}%' ";
											break;
				# JSON
				case (strpos($key,':json')!==false):
											$campo = substr($key, 0, strpos($key,':json'));
											$strQuery .= "AND $campo LIKE '%\"{$value}\"%' ";
											#$strQuery .= "AND match($campo) against('%\"{$value}\"%' IN BOOLEAN MODE) ";	#dump($strQuery,'$strQuery');
											break;

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

				# CASO GENERAL: USAREMOS EL KEY COMO CAMPO Y EL VALUE COMO VALOR TIPO 'campo = valor'
				default : 					
											#if($key=='dato' ) {
											#	# JSON FORMAT
											#	$strQuery 	.= "AND $key LIKE '%\"{$value}\"%' ";
											#
											#}else{
											
												# NO JSON FORMAT
												if(is_numeric($value) && strpos($key, 'dato')===false) {
													$strQuery 	.= "AND $key = $value ";
												}else{
													$strQuery 	.= "AND $key = '$value' ";
												}
											#}

			}
		}

		# TABLE . Optionally change table for search
		if (!empty($matrix_table)) {
			$this->strTableName = $matrix_table;
		}
		if(strpos($strQuery, 'AND')===0) {
			$strQuery = substr($strQuery, 4);
		}else  if( strpos($strQuery, ' AND')===0 ) {
			$strQuery = substr($strQuery, 5);
		}
		$strQuery = trim('SELECT '.$strPrimaryKeyName. ' FROM '.$this->strTableName.' WHERE '. $strQuery .' '. $strQuery_limit) ;	#$strQuery .= 'SQL_CACHE ';
			dump($strQuery,'strQuery');	# SQL_CACHE
		
		$db_connection = DB::_getConnection();
		$res 		 = mysql_query($strQuery, $db_connection);
		if(!$res) 	 die(__METHOD__ ." <br>\nFailed Load (RDBO) : <pre>$strQuery</pre>  <br>\n".mysql_error() );
			
		$ar_records=array();
		
		while ($row = mysql_fetch_assoc($res)) {		   
			 $ar_records[]=$row[$strPrimaryKeyName];
		}
		
		
		#while ($row = mysql_fetch_array($res, MYSQL_ASSOC)) {
		#    $ar_records[]=$row[$strPrimaryKeyName]; 
		#}
		
		return $ar_records;
	}#end search2
	*/












	# DESTRUCT
	public function __destruct() {

		if( isset($this->ID) ) {

			if($this->blForDeletion == true) {				

				if (is_int($this->ID)) {
					$strQuery 	= "DELETE FROM \"$this->strTableName\" WHERE \"$this->strPrimaryKeyName\" = $this->ID";
				}else{
					$strQuery 	= "DELETE FROM \"$this->strTableName\" WHERE \"$this->strPrimaryKeyName\" = '$this->ID' ";
				}				

				#$result 		= mysql_query($strQuery, DBi::_getConnection());
				#$result 		= DBi::_getConnection()->query($strQuery);
				$result		= JSON_RecordObj_matrix::search_free($strQuery);

				if(!$result) {
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
