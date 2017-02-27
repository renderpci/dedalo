<?php
/**
* RecordObj_dd
*
*
*/
class RecordObj_dd extends RecordDataBoundObject {
	
	# FIELDS
	protected $terminoID;
	protected $parent;
	protected $modelo;
	protected $esmodelo;
	protected $esdescriptor;
	protected $visible ;
	protected $norden ;
	protected $tld ;
	protected $traducible ;
	protected $relaciones ;
	protected $propiedades ;
	
	protected $prefijo ;
	
	# FIELDS EXTERNAL
	protected $filtroTerminos ;
	
	# OPTIONAL ESPECIFIC LOADS	
	#protected $ar_recursive_childrens_of_this 	= array();
	#protected $ar_parents_cache 				= array();
	#protected $ar_reels_of_this 				= array();
	

	/**
	* __CONSTRUCT
	*/
	function __construct($terminoID=null, $prefijo=false) {
		
		if( !empty($terminoID) ) {
			# CASO GENERAL

			$this->set_terminoID($terminoID);
			$this->set_prefijo( self::get_prefix_from_tipo($terminoID) );

			#$prefix = dd::terminoID2prefix($terminoID);
			#$prefix = self::get_prefix_from_tipo($terminoID);
			#$id 	= self::get_id_from_tipo($terminoID);			
			#$this->set_ID(intval($id));			
		
		}else if(strlen($prefijo)>=2) {
			
			$terminoID = null;
			$this->set_prefijo($prefijo);	
		
		}else{			
			
			$msg = "This record dd not exists ! [terminoID:$terminoID, prefijo:$prefijo]"; if(isset($_REQUEST['terminoID'])) $msg .= " - ".$_REQUEST['terminoID']; 

			if(SHOW_DEBUG===true) {
				 # LOGGER
        		logger::$obj['error']->log_message("$msg", logger::ERROR, __METHOD__); 
        		throw new Exception("Error Processing Request $msg", 1);
			} 
			#exit($msg);
			trigger_error($msg);
		}
		
		# PREFIX TEST
		/*
		if(!$this->prefijo) {

			$msg = " Element not defined with prefijo: $prefijo ";
			if(SHOW_DEBUG===true) {
				 # LOGGER
        		logger::$obj['error']->log_message("$msg", logger::ERROR, __METHOD__); 
        		throw new Exception("Error Processing Request $msg", 1); 
			}
			exit($msg);
		}*/
		
		parent::__construct($terminoID);		
	}//end __construct


	
	# DEFINETABLENAME : define current table (tr for this obj)
	protected function defineTableName() {		
		return ('jer_dd');	#echo ' jer_'.$this->current_table.' ';
	}	
	# DEFINEPRIMARYKEYNAME : define PrimaryKeyName (id)
	protected function definePrimaryKeyName() {
		return ('terminoID');	
	}	
	# DEFINERELATIONMAP : array of pairs db field name, obj property name like fieldName => propertyName
	protected function defineRelationMap() {		
		return (array(
			# db fieldn ame					# property name
			//"id" 							=> "ID",
			"terminoID"						=> "terminoID",
			"parent" 						=> "parent",
			"modelo" 						=> "modelo",
			"esmodelo" 						=> "esmodelo",
			"esdescriptor" 					=> "esdescriptor",
			"visible" 						=> "visible",
			"norden" 						=> "norden",
			"tld" 							=> "tld",
			"traducible" 					=> "traducible",
			"relaciones" 					=> "relaciones",
			"propiedades" 					=> "propiedades",
			));
	}//end defineRelationMap



	/**
	* GET_PREFIX_FROM_TIPO
	* @return string Like 'dd' or 'murapa'
	*/
	public static function get_prefix_from_tipo($tipo) {
		preg_match("/\D+/", $tipo, $output_array);
		if (empty($output_array[0])) {
			if(SHOW_DEBUG===true) {
				#throw new Exception("Error Processing Request from tipo:'$tipo' ", 1);	
				#dump($tipo,"tipo received ");	
				dump(debug_backtrace()[0]," debug_backtrace Invalid tipo received ". json_encode($tipo));	
			}
			error_log(__METHOD__." Error: Invalid tipo received. Impossible get_prefix_from_tipo this tipo : ". json_encode($tipo)." " );
			return false;
		}
		return (string)$output_array[0];
	}//end get_prefix_from_tipo



	/**
	* PREFIX_COMPARE
	* Verify 2 received terms have the same prefix
	*/
	public static function prefix_compare($terminoID, $terminoID2) {		
		$prefijo	= RecordObj_dd::get_prefix_from_tipo($terminoID);
		$prefijo2	= RecordObj_dd::get_prefix_from_tipo($terminoID2);
		if (empty($prefijo) || empty($prefijo2)) {
			trigger_error("Error: prefix_compare received empty term! I can't compare this case");
			if(SHOW_DEBUG===true) {
				throw new Exception("Error Processing Request", 1);				
			}
			return false;
		}	
		if ($prefijo===$prefijo2) {
			return true;
		}else{
			return false;
		}		
	}//end prefix_compare



	/**
	* GET_PROPIEDADES
	* Return the value of property 'propiedades', stored as plain text in table column 'propiedades'
	* Values expected in 'propiedaes' are always JSON. Yo can obtain raw value (default) or JSON decoded (called with argument 'true')
	* @param bool $json_decode
	* @return object / string parent::$propiedades
	*/
	public function get_propiedades($json_decode=false) {
		if ($json_decode===true) {
			return json_decode(parent::get_propiedades());
		}
		return parent::get_propiedades();
	}//end get_propiedades



	/**
	* SAVE_TERM_AND_DESCRIPTOR
	* Used to save elements in class hierarchy
	* @see class.hierarchy.php
	*/
	public function save_term_and_descriptor( $descriptor_dato=null ) {

		if (empty($this->parent)) {
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Error on save 'RecordObj_dd_edit'. Parent is empty. Nothing is saved! ".to_string(), logger::DEBUG);
			}
			return false;
		}

		$terminoID = $this->terminoID;		

		#
		# INSERT
		# TERMINO ID NOT CREATED : BUILD NEW AND INSERT	
		# Creamos el terminoID a partir del prefijo y el contador contador para el prefijo actual
		$counter_dato   = self::get_counter_value($this->prefijo);
		#$terminoID		= (string)$this->prefijo . (int)($counter_dato+1);
			#dump($terminoID," terminoID - prefijo:$this->prefijo");die();		
		
		# Set defaults
		if(empty($this->norden)) $this->set_norden( (int)1 );
					
		$result = parent::Save();
			#dump($result, ' result ++ counter_dato:'.to_string($counter_dato)); #die();

		#
		# DESCRIPTORS
		if ($result!==false) {
			
			$counter_dato_updated  = self::update_counter($this->prefijo, $counter_dato);		

			#
			# DESCRIPTORS : finally we create one record in descriptors with this main info	
			$lang = 'lg-spa';//DEDALO_DATA_LANG;			
			$RecordObj_descriptors_dd = new RecordObj_descriptors_dd(RecordObj_descriptors_dd::$descriptors_matrix_table, NULL, $terminoID, $lang);
			$RecordObj_descriptors_dd->set_tipo('termino');
			$RecordObj_descriptors_dd->set_parent($terminoID);
			$RecordObj_descriptors_dd->set_lang($lang);
			$RecordObj_descriptors_dd->set_dato($descriptor_dato);
			$created_id_descriptors	= $RecordObj_descriptors_dd->Save();
		}		

		return $terminoID;
	}//end Save



	/**
	* UPDATE_COUNTER
	* @param (string)$tld, (int)$current_value=false
	* @return int
	* Actualiza el contador para el tld dado (ej. 'dd').
	* El 'current_value' es opcional. Si no se recibe se calcula
	*/
	protected static function update_counter($tld, $current_value=false) {

		if ($current_value===false) {
			$current_value = self::get_counter_value($tld);
		}
		$counter_dato_updated = intval($current_value+1) ;

		$strQuery 	= "UPDATE \"main_dd\" SET counter = $1 WHERE tld = $2";
		$result 	= pg_query_params(DBi::_getConnection(), $strQuery, array( $counter_dato_updated, $tld));
		if ($result===false) {
			if(SHOW_DEBUG===true) {
				trigger_error("Error on update_counter 'RecordObj_dd_edit'. Nothing is saved! : $strQuery");
			}
			return false;
		}

		return (int)$counter_dato_updated;
	}//end update_counter



	/**
	* GET_COUNTER_VALUE
	*/
	protected static function get_counter_value($tld) {
		$strQuery 		= "SELECT counter FROM main_dd WHERE tld = '$tld' LIMIT 1";
		$result			= JSON_RecordDataBoundObject::search_free($strQuery);
		$counter_value 	= pg_fetch_assoc($result)['counter'];

		if ($counter_value===false || is_null($counter_value)) {
			if(SHOW_DEBUG===true) {				
				//debug_log(__METHOD__." Error on get_counter_value 'RecordObj_dd_edit'. counter for tld not found. ".to_string(), logger::WARNING);
			}
			return (int)0;
		}

		return (int)$counter_value;
	}//end get_counter_value


	
	/**
	* GET_DESCRIPTOR_DATO_BY_TIPO
	* GET TERMINO DATO BY TIPO ('termino','def','obs') STATIC VERSION
	*/
	public static function get_descriptor_dato_by_tipo($terminoID, $lang, $tipo, $fallback=false) {		

		# Verify : En casos como por ejemplo, al resolver el modelo de un término relacionado que no tiene modelo asignado, el terminoID estará vacío.
		# Esto no es un error pero debemos evitar resolverlo. 
		if(empty($terminoID)) {
			return null;
		}
		
		# STATIC CACHE
		static $descriptor_dato_by_tipo_stat_data;
		$uid = $terminoID.'-'.$lang.'-'.$tipo.'-'.intval($fallback);	#dump($uid,'$uid');	
		if(isset($descriptor_dato_by_tipo_stat_data[$uid])) {
			#error_log("Returned data from cache get_descriptor_dato_by_tipo uid:$uid");		
			return $descriptor_dato_by_tipo_stat_data[$uid];
		}
		#dump(""," from terminoID:$terminoID, lang:$lang, tipo:$tipo, fallback:$fallback");
		
		$matrix_table				= RecordObj_descriptors_dd::$descriptors_matrix_table;
		$RecordObj_descriptors_dd	= new RecordObj_descriptors_dd($matrix_table, NULL, $terminoID, $lang, $tipo, $fallback);		
		$dato						= (string)$RecordObj_descriptors_dd->get_dato();
			#dump($dato," terminoID:$terminoID, lang:$lang, tipo:$tipo, fallback$fallback");		
		
		# STATIC CACHE
		$descriptor_dato_by_tipo_stat_data[$uid] = $dato;
			
		return $dato;
	}
	# GET_TERMINO_BY_TIPO STATIC VERSION
	public static function get_termino_by_tipo($terminoID, $lang=NULL, $from_cache=false, $fallback=true) {
		#$from_cache=false;
		
		$cache_uid = $terminoID.'_'.$lang;
		if ($from_cache===true && isset($_SESSION['dedalo4']['config']['termino_by_tipo'][$cache_uid])) {
			#error_log("From cache $cache_uid");
			return $_SESSION['dedalo4']['config']['termino_by_tipo'][$cache_uid];
		}
		$tipo 	= 'termino';
		$result = self::get_descriptor_dato_by_tipo($terminoID, $lang, $tipo, $fallback);

		if($from_cache===true)
			$_SESSION['dedalo4']['config']['termino_by_tipo'][$cache_uid] = $result;

		return $result;
	}	
	# GET DEF STATIC VERSION
	public static function get_def_by_tipo($terminoID, $lang=false) {		
		return self::get_descriptor_dato_by_tipo($terminoID, $lang, 'def');
	}	
	# GET OBS STATIC VERSION
	public static function get_obs_by_tipo($terminoID, $lang=false) {
		return self::get_descriptor_dato_by_tipo($terminoID, $lang, 'obs');
	}

	/**
	* GET MODELO NAME (CURRENT OBJ)
	* Alias of $this->get_termino_by_tipo($modelo_tipo)
	*/
	public function get_modelo_name() {
		return $this->get_termino_by_tipo($this->get_modelo(),'lg-spa',true,false);
	}

	# GET MODELO NAME BY TIPO (STATIC)
	public static function get_modelo_name_by_tipo($tipo, $from_cache=false) {
		#$from_cache=false;
		if ($from_cache===true && isset($_SESSION['dedalo4']['config']['modelo_name_by_tipo'][$tipo])) {
			#error_log("From cache $tipo");
			return $_SESSION['dedalo4']['config']['modelo_name_by_tipo'][$tipo];
		}
		$RecordObj_dd	= new RecordObj_dd($tipo);
		$modelo_name 	= (string)$RecordObj_dd->get_modelo_name();

		if($from_cache===true)
			$_SESSION['dedalo4']['config']['modelo_name_by_tipo'][$tipo] = $modelo_name;

		return $modelo_name;
	}
	
	# GET LANG BY TIPO (STATIC)
	public static function get_lang_by_tipo($tipo, $from_cache=false) {
		$RecordObj_dd = new RecordObj_dd($tipo);
		$lang 		  = $RecordObj_dd->get_traducible()==='si' ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
		return $lang;
	}

	# GET AR TERMINO ID BY MODELO NAME (STATIC)
	public static function get_ar_terminoID_by_modelo_name($modelo_name, $prefijo='dd') {
	
		if(SHOW_DEBUG===true) {
			$start_time = start_time();
		}

		# STATIC CACHE
		static $ar_terminoID_by_modelo_name;
		$unic_string = $modelo_name.'-'.$prefijo;		
		if(isset($ar_terminoID_by_modelo_name[$unic_string])) return $ar_terminoID_by_modelo_name[$unic_string];
		/*
		global $client;
		$retval = $client->get('ar_terminoID_by_modelo_name_cache');
			#dump($retval,'$retval');
		$client_ar_var = unserialize($retval);
			#dump($var,'$var');
		if( array_key_exists($unic_string, $client_ar_var) ) {
			#dump($unic_string,'Returned from redis');
			return $client_ar_var[$unic_string];		
		}			
		*/

		#if(SHOW_DEBUG===true) $start_time = start_time();

		# 1 Despejamos el terminoID del modelo (ejemplo : 'area_root') que es el parent en matrix_descriptors
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'parent';
		$arguments['dato']				= (string)$modelo_name;
		$arguments['tipo']				= 'termino';			
		$matrix_table					= RecordObj_descriptors_dd::$descriptors_matrix_table;	# 'matrix_descriptors_'.$prefijo;#
		$RecordObj_descriptors_dd		= new RecordObj_descriptors_dd($matrix_table, NULL, $prefijo);	#dump($arguments,"$modelo_name -$matrix_table");		
		$ar_result						= $RecordObj_descriptors_dd->search($arguments);		#dump($ar_result,'modelo_terminoID',"terminoID_by_modelo_name de: $modelo_name");
			
		/**
		* ARREGLO 2-2-2013
		*/
		# Recorremos los resultados para verificar que son modelo
		# Así obtenemos exclusivamente los téminos que SI son modelo
		if (!empty($ar_result)) {
		
			$ar_modelo_terminoID = array();
			foreach ($ar_result as $terminoID) {
				
				$RecordObj_dd	= new RecordObj_dd($terminoID);
				$esmodelo		= $RecordObj_dd->get_esmodelo($arguments);
				# Excluimos a los propios modelos del array
				if ($esmodelo==='si') {
					# Verfificado
					$ar_modelo_terminoID[] = $terminoID;
				}
			}
			foreach ($ar_modelo_terminoID as $modelo_terminoID) {
				
				$arguments=array();
				$arguments['strPrimaryKeyName']	= 'terminoID';
				$arguments['modelo']			= $modelo_terminoID;
				$RecordObj_dd					= new RecordObj_dd(NULL,$prefijo);
				$ar_result						= $RecordObj_dd->search($arguments);
			}
		}

		# STATIC CACHE
		$ar_terminoID_by_modelo_name[$unic_string] = $ar_result;
			#dump($ar_result,'$ar_result');
		
		if(SHOW_DEBUG===true) {
			#$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $ar_result );
		}

		return $ar_result;
	}//end get_ar_terminoID_by_modelo_name


	
	# MODELOS ARRAY
	# Se usa en  el selector de tesauro edit para asignar modelo
	public function get_ar_all_modelos() {
		
		# STATIC CACHE
		static $ar_all_modelos_data;		
		if(isset($this->terminoID) && isset($ar_all_modelos_data[$this->terminoID])) return $ar_all_modelos_data[$this->terminoID];
				
		$ar_all_modelos = array();		#echo " this->terminoID:".$this->get_terminoID() ." - ".$this->terminoID()."<hr>";			
		
		# SEARCH		
		$arguments=array();
		$arguments['esmodelo']	= 'si';
		$RecordObj_dd			= new RecordObj_dd(NULL,$this->prefijo);
		$ar_id					= (array)$RecordObj_dd->search($arguments);
			#dump($ar_id," ");
		
		foreach($ar_id as $terminoID) {
			$ar_all_modelos[] = $terminoID ;
		}		
				
		# STORE CACHE DATA
		$ar_all_modelos_data[$this->terminoID]	= $ar_all_modelos;
		
		return $ar_all_modelos ;
	}//end get_ar_all_modelos



	public static function get_ar_all_terminoID_of_modelo_tipo($modelo_tipo) {
		# SEARCH		
		$arguments=array();
		$arguments['modelo']	= $modelo_tipo;
		$RecordObj_dd			= new RecordObj_dd(NULL,'dd');
		$ar_id					= (array)$RecordObj_dd->search($arguments);
			#dump($ar_id," ar_id");
		
		$ar_all_terminoID=array();
		foreach($ar_id as $terminoID) {
			$ar_all_terminoID[] = $terminoID ;
		}
		return $ar_all_terminoID;
	}
	
	
	/**
	* GET_AR_CHILDRENS_OF_THIS
	* Get array of terms (terminoID) with parent = $this->terminoID
	* @return array 
	*/
	public function get_ar_childrens_of_this($esdescriptor='si', $esmodelo=null, $order_by='norden') {
			
		# COMPROBACIÓN
		if(empty($this->terminoID))	return false;
		#if(empty($this->prefijo)) 	return false;

		# STATIC CACHE
		static $ar_childrens_of_this_stat_data;
		$key = $this->terminoID.'_'.$esdescriptor.'_'.$esmodelo.'_'.$order_by;
		if(isset($ar_childrens_of_this_stat_data[$key])) {
			#error_log("Returned from cache get_ar_childrens_of_this - $key");
			return $ar_childrens_of_this_stat_data[$key];
		}			
		
		# SEARCH
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'terminoID';
		$arguments['parent']			= $this->terminoID;
		
		if( !empty($esdescriptor) && ($esdescriptor==='si' || $esdescriptor==='no') )
			$arguments['esdescriptor']	= $esdescriptor;
		
		if( !empty($esmodelo) && ($esmodelo==='si' || $esmodelo==='no') )
			$arguments['esmodelo']		= $esmodelo;
		
		if (!empty($order_by)) {
			$arguments['order_by_asc']	= $order_by;
		}		
				
		$ar_childrens_of_this = (array)$this->search($arguments);
		if(SHOW_DEBUG===true) {
			#dump($ar_childrens_of_this," arguments:".print_r($arguments,true));
		}			
				
		# STORE CACHE DATA
		$ar_childrens_of_this_stat_data[$key] = $ar_childrens_of_this;
		
		return $ar_childrens_of_this ;
	}//end get_ar_childrens_of_this



	/**
	* GET_AR_CHILDRENS
	*/
	public static function get_ar_childrens($tipo, $order_by='norden') {
		
		# STATIC CACHE
		static $get_ar_childrens_data;	
		$key = $tipo.'_'.$order_by;
		if(isset($get_ar_childrens_data[$key])) {
			if(SHOW_DEBUG===true) {
				#error_log("Returned cache value for get_ar_childrens $key");
			}			
			return $get_ar_childrens_data[$key];
		}
		
		$ar_childrens = array();	
		
		# SEARCH
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'terminoID';
		$arguments['parent']			= $tipo;
		if(!empty($order_by))
		$arguments['order_by_asc']		= $order_by;
		$RecordObj_dd					= new RecordObj_dd($tipo);
		$ar_childrens					= $RecordObj_dd->search($arguments);
			#dump($arguments,"get_ar_childrens $tipo");
			
		# STORE CACHE DATA
		$get_ar_childrens_data[$key] = $ar_childrens;
		
		return $ar_childrens ;
	}//end get_ar_childrens



	# CHILDRENS RECURSIVE ARRAY
	# SACA TODOS LOS HIJOS DEL TERMINO ACTUAL RECURSIVAMENTE
	public function get_ar_recursive_childrens_of_this( $terminoID, $is_recursion=0 ) {
		
		# IMPORTANTE: NO HACER CACHE DE ESTE MÉTODO (AFECTA A COMPONENT_FILTER_MASTER)
				
		# creamos una instancia independiente de RecordObj_dd y sacamos los hijos directos		
		$ar_childrens_of_this 	= array();	# reset value every cycle
		$RecordObj_dd 			= new RecordObj_dd($terminoID);
		$ar_childrens_of_this 	= (array)$RecordObj_dd->get_ar_childrens_of_this(null, null, null);	# $esdescriptor='si', $esmodelo=NULL, $order_by='norden'
				
		foreach($ar_childrens_of_this as $children_terminoID) {
			
			# Add current element		
			$this->ar_recursive_childrens_of_this[] = $children_terminoID;			

			# Recursion
			$this->get_ar_recursive_childrens_of_this($children_terminoID,1);
		}

		if(isset($this->ar_recursive_childrens_of_this)) return $this->ar_recursive_childrens_of_this ;		
	}
	/**
	* GET_AR_RECURSIVE_CHILDRENS : Static version
	* No hay aumento de velocidad apreciable entre la versión estática y dinámica. Sólo una reducción de unos 140 KB en el consumo de memoria
	*/
	public static function get_ar_recursive_childrens($terminoID, $is_recursion=false, $ar_exclude_models=false) {

		$ar_resolved=array();
		
		if($is_recursion===true) {
			#array_push($ar_resolved, $terminoID);
			$ar_resolved[] = $terminoID;
		}

		$RecordObj_dd = new RecordObj_dd($terminoID);
		$ar_childrens = (array)$RecordObj_dd->get_ar_childrens_of_this('si',null,null);

		foreach($ar_childrens as $current_terminoID) {

			# Exclude models optional
			if ($ar_exclude_models!==false) {
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_terminoID,true);
				if (in_array($modelo_name, $ar_exclude_models)) {
					debug_log(__METHOD__." Skiped model '$modelo_name' ".to_string($current_terminoID), logger::DEBUG);
					continue;	// Skip current modelo and childrens 
				}				
			}

			# Recursion
			$ar_resolved = array_merge( $ar_resolved, (array)RecordObj_dd::get_ar_recursive_childrens($current_terminoID, true, $ar_exclude_models) );
		}
		
		return $ar_resolved;
	}
	/**
	* GET_AR_RECURSIVE_CHILDRENS : Static version
	* No hay aumento de velocidad apreciable entre la versión estática y dinámica. Sólo una reducción de unos 140 KB en el consumo de memoria
	*/
	public static function get_ar_recursive_childrens_with_exclude($terminoID, $is_recursion=false, $ar_exclude=array()) {

		$ar_resolved=array();
		/*
		static $ar_resolved;
		if (!isset($ar_resolved)) {
			$ar_resolved=array();
		}
		*/
		
		if($is_recursion===true) {
			#array_push($ar_resolved, $terminoID);
			$ar_resolved[] = $terminoID;
		}

		#$ar_childrens  = (array)RecordObj_dd::get_ar_childrens($terminoID);
		$RecordObj_dd 	= new RecordObj_dd($terminoID);
		$ar_childrens 	= (array)$RecordObj_dd->get_ar_childrens_of_this('si',null,null);

		foreach($ar_childrens as $current_terminoID) {

			if (in_array($current_terminoID, $ar_exclude)) {
				continue; # Skip this term and childrens
			}

			# Recursion
			$ar_resolved = 	array_merge( $ar_resolved, (array)RecordObj_dd::get_ar_recursive_childrens( $current_terminoID, true ) );
		}
		
		return $ar_resolved;
	}//end get_ar_recursive_childrens_with_exclude

	
	
	# GET PARENTS ARRAY
	public function get_ar_parents_of_this($ksort=true) {
		
		# STATIC CACHE
		static $ar_parents_of_this_data;		
		if(isset($this->terminoID) && isset($ar_parents_of_this_data[$this->terminoID])) {
			return $ar_parents_of_this_data[$this->terminoID];
		}
		
		$ar_parents_of_this = array();	
		$parent				= $this->get_parent();
		if(empty($parent)) {
			return $ar_parents_of_this;
		}
		$parent_inicial		= $parent;
		$parent_zero		= 'dd0';

		do {			
			if( strpos($parent, $parent_zero)===false  ) { // $parent != $parent_zero
				$ar_parents_of_this[] = $parent;				
			}			
			
			$RecordObj_dd = new RecordObj_dd($parent);
			$parent 	  = $RecordObj_dd->get_parent();

			#$esdescriptor = $RecordObj_dd->get_esdescriptor(); #if($esdescriptor!='si' && $parent!=$parent_zero) die( __METHOD__ ."<span class='error'> Error. this parent is not descriptor ! (parent:$parent, esdescriptor:$esdescriptor) </span>");				
		
		} while ( !empty($parent) && ($parent !== $parent_zero) && $parent !== $parent_inicial );
		
		
		# ordenamos a la inversa los padres
		#echo " ksort:";dump($ksort);
		if($ksort===true) krsort($ar_parents_of_this);
		
		# STORE CACHE DATA
		$ar_parents_of_this_data[$this->terminoID] = $ar_parents_of_this;
		
		return $ar_parents_of_this ;
	}//end get_ar_parents_of_this

	
	
	# GET SIBLINGS ARRAY [HERMANOS]
	public function get_ar_siblings_of_this() {
		
		# STATIC CACHE
		static $ar_siblings_of_this_data;		
		if(isset($this->terminoID) && isset($ar_siblings_of_this_data[$this->terminoID])) {
			return $ar_siblings_of_this_data[$this->terminoID];
		}
		
		$ar_siblings_of_this		= array();
		
		$arguments["parent"]		= $this->get_parent();
		$arguments["esdescriptor"]	= 'si';		
		$ar_id						= $this->search($arguments);		
		
		foreach($ar_id as $id) {			
			$ar_siblings_of_this[]	= $this->get_prefijo() . $id;
		}
		
		# STORE CACHE DATA
		$ar_siblings_of_this_data[$this->terminoID] = $ar_siblings_of_this;
		
		return $ar_siblings_of_this ;
	}
	
	
	# NUMERO DE HIJOS DESCRIPTORES
	function get_n_hijos_descriptores() {	
		
		# STATIC CACHE
		static $get_n_hijos_descriptores_data;		
		if(isset($this->terminoID) && isset($get_n_hijos_descriptores_data[$this->terminoID])) {
			return $get_n_hijos_descriptores_data[$this->terminoID];
		}
		
		$arguments["parent"]		= $this->terminoID;
		$arguments["esdescriptor"]	= 'si';		
		$ar_id						= $this->search($arguments);		
		
		$n_hijos_descriptores		= count($ar_id);		#echo $n_hijos_descriptores ."<hr>";
		
		# STORE CACHE DATA
		$get_n_hijos_descriptores_data[$this->terminoID] = $n_hijos_descriptores;	
		
		return $n_hijos_descriptores;
	}
	
	# NUMERO DE HIJOS
	function get_n_hijos() {	
				
		# STATIC CACHE
		static $get_n_hijos_data;		
		if(isset($this->terminoID) && isset($get_n_hijos_data[$this->terminoID])) return $get_n_hijos_data[$this->terminoID];
		
		$arguments["parent"]	= $this->terminoID;	
		$ar_id					= $this->search($arguments);		
		
		$n_hijos				= count($ar_id);
		
		# STORE CACHE DATA
		$get_n_hijos_data[$this->terminoID] = $n_hijos;	
		
		return $n_hijos;
	}//end get_n_hijos	
	

	
	# GET RELACIONES AS ARRAY (FROM JSON)
	# Devuelve array en formato:
	#	[0] => Array
	#    (
	#       [dd9] => dd296
	#   )
	public function get_relaciones($modo=false) {

		#$dato = $this->relaciones;
		$dato = parent::get_relaciones();

		if (empty($dato)) {
			return null;
		}
	
		$relaciones = json_decode($dato, true);		
	
		/*
		if ($modo==='simple') {
			#$termonioID_related = array_values($relacionados[0]);
			#$RecordObjt_dd 		= new RecordObj_dd($termonioID_related);
		}
		*/

		return $relaciones;	
	}//end get_relaciones

	

	/**
	* SET_RELACIONES
	* Set relaciones as JSON (MODELO: $ar_relaciones[$terminoID_source][] = array($modelo => $terminoID_rel))
	*/
	public function set_relaciones($ar_relaciones) {
		return parent::set_relaciones(json_encode($ar_relaciones));
	}



	/**
	* REMOVE_ELEMENT_FROM_AR_TERMINOS_RELACIONADOS
	* @param string $terminoID_to_unlink
	*/
	public function remove_element_from_ar_terminos_relacionados($terminoID_to_unlink) {
		
		# Recorremos los elementos en terminos relacionados para este objeto
		$ar_relaciones = $this->get_relaciones();
		
		# eliminamos del array el valor recibido
		$ar_final = null;
		if(is_array($ar_relaciones)) foreach($ar_relaciones as $key => $ar_values) {
			
			foreach($ar_values as $modeloID => $terminoID) {
				
				if($terminoID != $terminoID_to_unlink) $ar_final[] =  array($modeloID => $terminoID);
			}
		}
		
		# guardamos el resultado
		$this->set_relaciones($ar_final);
		
		return true;
	}//end remove_element_from_ar_terminos_relacionados



	/**
	* GET_AR_TERMINOS_RELACIONADOS
	* @param string $terminoID
	* @param bool $cache
	* @param bool $simple
	* @return array $ar_relaciones
	* JSON_VERSION
	* En modo 'simple' devuelve sólo un array de 'terminoID'
	*/
	public static function get_ar_terminos_relacionados($terminoID, $cache=false, $simple=false) {

		#if(SHOW_DEBUG===true) $start_time = start_time();
		# NO HACER CACHE EN ESTE MÉTODO	
				
		$ar_terminos_relacionados 	= array();
		
		$RecordObj_dd				= new RecordObj_dd($terminoID);
		$ar_relaciones				= $RecordObj_dd->get_relaciones();
		
		# SIMPLE . SOLO DEVUELVE EL ARRAY LIMPIO CON EL LISTADO DE terminoID
		if($simple===true) {
			
			if(is_array($ar_relaciones)) foreach($ar_relaciones as $key => $ar_value) {
				
				foreach($ar_value as $modeloID => $terminoID) {
					$ar_terminos_relacionados[]	= $terminoID;	
				}					
			}
			$ar_relaciones = $ar_terminos_relacionados;
		}
		#if(SHOW_DEBUG===true) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $ar_relaciones);
		
		return (array)$ar_relaciones;
	}//end get_ar_terminos_relacionados



	/* DESACTIVA PORQUE NO SE EXPERIMENTA INCREMENTO DE VELOCIDAD... 
	public static function get_ar_recursive_childrens_of_this_static($terminoID) {

		#static $ar_recursive_childrens_of_this_static;
		#if(isset($ar_recursive_childrens_of_this_static[$terminoID])) return $ar_recursive_childrens_of_this_static ;

		$RecordObj_dd 					= new RecordObj_dd($terminoID);
		$ar_recursive_childrens_of_this = $RecordObj_dd->get_ar_recursive_childrens_of_this($terminoID);

		# Store in cache
		#$ar_recursive_childrens_of_this_static = $ar_recursive_childrens_of_this;

		return $ar_recursive_childrens_of_this;
	}
	*/	



	/**
	* GET_AR_TERMINOID_BY_MODELO_NAME_AND_RELATION
	* Devuelve el terminoID del termino relacionado (especificar relacion) de modelo name dado
	* ej. para saber los términos relacionados de modelo 'filter'
	* @param string $tipo like 'dd20'
	* @param string $modelo_name like 'component_input_text'
	* @param string $relation_type like 'termino_relacionado'
	* @return array $result 
	*/
	public static function get_ar_terminoID_by_modelo_name_and_relation($tipo, $modelo_name, $relation_type, $search_exact=false) {
		
		$result	= array();
		
		if(empty($tipo)) return $result;

		# TIPO : Acepta también arrays como entrada de tipo aunque sólo usa el primero. Evitar esto..
		if(is_array($tipo) && isset($tipo[0])) {
			$tipo = $tipo[0];
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Used function 'get_ar_terminoID_by_modelo_name_and_relation' received one array instead a espected string. Used first value as tipo: ".to_string($tipo), logger::DEBUG);
				throw new Exception("Error Processing Request", 1);				
			}
		}
		
		# STATIC CACHE		
		static $get_ar_terminoID_by_modelo_name_and_relation_data;
		$name = $tipo.'_'.$modelo_name.'_'.$relation_type.'_'.(int)$search_exact;
		if(isset($get_ar_terminoID_by_modelo_name_and_relation_data[$name])) {
			return $get_ar_terminoID_by_modelo_name_and_relation_data[$name];
		}

		#if(SHOW_DEBUG===true) $start_time = start_time();		
		#dump($tipo);	#dump(debug_backtrace());
		
		switch($relation_type) {
			
			case 'children' :
				
					# Obtenemos los hijos
					$RecordObj_dd	= new RecordObj_dd($tipo);
					$ar_childrens	= $RecordObj_dd->get_ar_childrens_of_this();
					
					# los recorremos para filtrar por modelo
					if(is_array($ar_childrens)) foreach($ar_childrens as $terminoID) {
						
						$RecordObj_dd			= new RecordObj_dd($terminoID);
						$modelo					= $RecordObj_dd->get_modelo();

						if(empty($modelo)) {
							$name = RecordObj_dd::get_termino_by_tipo($terminoID);
							trigger_error("Error Processing Request. Modelo is empty. Please define modelo for this component $terminoID ($name)");
							return array();
							#throw new Exception("Error Processing Request. Modelo is empty. Please define modelo for this component $terminoID ($name)", 1);							
						}
						$current_modelo_name	= $RecordObj_dd->get_termino_by_tipo($modelo);	#dump($modelo_name);
						
						if($search_exact===true) {
							if ($current_modelo_name===$modelo_name) {
								$result[] = $terminoID;
							}
						}else{
							if(strpos($current_modelo_name, $modelo_name) !== false) {
								$result[] = $terminoID;							
							}
						}						
					}
					break;

			case 'children_recursive' :
				
					# Obtenemos los hijos recursivamente
					$RecordObj_dd	= new RecordObj_dd($tipo);
					$ar_childrens	= $RecordObj_dd->get_ar_recursive_childrens_of_this($tipo);		#dump($ar_childrens);
					
					# los recorremos para filtrar por modelo
					if(is_array($ar_childrens)) foreach($ar_childrens as $terminoID) {
						
						$RecordObj_dd			= new RecordObj_dd($terminoID);
						$modelo					= $RecordObj_dd->get_modelo();

						if(empty($modelo)) {
							$name = RecordObj_dd::get_termino_by_tipo($terminoID);
							trigger_error("Error Processing Request. Modelo is empty. Please define modelo for this component $terminoID ($name)");
							return array();
							#throw new Exception("Error Processing Request. Modelo is empty. Please define modelo for this component $terminoID ($name)", 1);							
						}
						$current_modelo_name	= $RecordObj_dd->get_termino_by_tipo($modelo);	#dump($modelo_name);
						
						if($search_exact===true) {
							if ($current_modelo_name===$modelo_name) {
								$result[] = $terminoID;
							}
						}else{
							if(strpos($current_modelo_name, $modelo_name) !== false) {
								 $result[] = $terminoID;
							}
						}
					}
					break;
					
			case 'termino_relacionado' :
				
					# Obtenemos los tr
					$RecordObj_dd				= new RecordObj_dd($tipo);
					$ar_terminos_relacionados	= $RecordObj_dd->get_ar_terminos_relacionados($tipo, $cache=true, $simple=true);	#dump($ar_terminos_relacionados);
					
					# los recorremos para filtrar por modelo
					if(is_array($ar_terminos_relacionados)) foreach($ar_terminos_relacionados as $terminoID) {
						
						$RecordObj_dd			= new RecordObj_dd($terminoID);
						$modelo					= $RecordObj_dd->get_modelo();

						if(empty($modelo)) {
							$name = RecordObj_dd::get_termino_by_tipo($terminoID);
							trigger_error("Error Processing Request. Modelo is empty. Please define modelo for this component $terminoID ($name)");
							return array();
							#throw new Exception("Error Processing Request. Modelo is empty. Please define modelo for this terminoID: $terminoID (name: $name)", 1);							
						}
						$current_modelo_name	= $RecordObj_dd->get_termino_by_tipo($modelo);
						
						if($search_exact===true) {
							if ($current_modelo_name===$modelo_name) {
								$result[] = $terminoID;
							}
						}else{
							if(strpos($current_modelo_name, $modelo_name) !== false) {
								 $result[] = $terminoID;
							}
						}
					}
					break;

			case 'parent' :
				
					# Obtenemos los padres
					$RecordObj_dd	= new RecordObj_dd($tipo);
					$ar_parents		= $RecordObj_dd->get_ar_parents_of_this();	#dump($ar_parents,'ar_parents');die();
					
					# los recorremos para filtrar por modelo
					if(is_array($ar_parents)) foreach($ar_parents as $terminoID) {
						
						$RecordObj_dd			= new RecordObj_dd($terminoID);
						$modelo					= $RecordObj_dd->get_modelo();

						if(empty($modelo)) {
							$name = RecordObj_dd::get_termino_by_tipo($terminoID);
							trigger_error("Error Processing Request. Modelo is empty. Please define modelo for this component $terminoID ($name)");
							return array();
							#throw new Exception("Error Processing Request. Modelo is empty. Please define modelo for this component $terminoID ($name)", 1);							
						}
						$current_modelo_name	= $RecordObj_dd->get_termino_by_tipo($modelo);		#dump($modelo_name);
						
						if($search_exact===true) {
							if ($current_modelo_name===$modelo_name) {
								$result[] = $terminoID;
							}
						}else{							
							if($current_modelo_name===$modelo_name) {
								 $result[] = $terminoID;
							}
						}
					}
					break;
					
			default : 
					throw new Exception("relation_type [$relation_type] not defined!", 1);
					break;
		}		
		
		# STORE CACHE DATA
		$get_ar_terminoID_by_modelo_name_and_relation_data[$name] = $result ;

		#if(SHOW_DEBUG===true) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $result );
		
		return (array)$result;
	}//end get_ar_terminoID_by_modelo_name_and_relation

	
	
}//end RecordObj_dd
?>