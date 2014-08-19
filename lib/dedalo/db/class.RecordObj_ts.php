<?php
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordDataBoundObject.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_descriptors.php');
require_once(DEDALO_LIB_BASE_PATH . '/ts/class.Tesauro.php');


class RecordObj_ts extends RecordDataBoundObject {
	
	# FIELDS
	protected $terminoID;
	protected $parent;
	protected $modelo;
	protected $esmodelo;
	protected $esdescriptor;
	protected $visible ;
	protected $norden ;
	protected $usableIndex ;
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
	
	
	function __construct($terminoID=NULL, $prefijo=false) {
		
		if( !empty($terminoID) ) {

			$prefix = Tesauro::terminoID2prefix($terminoID);
			
			if( is_int($prefix) ) {
				
				# CASO GENERAL	
				$id = substr($terminoID,2);
				$this->set_prefijo($prefix);
				$this->set_ID(intval($id));
							
			}else{
				
				# CASO LENGUAJES
				$id	= $this->terminoID2id($terminoID);
			}
			
			$this->set_terminoID($terminoID);
		
		}else if(strlen($prefijo)==2) {
			
			$id = NULL;
			$this->set_prefijo($prefijo);				
		
		}else{			
			
			$msg = "This record ts not exists ! [terminoID:$terminoID, prefijo:$prefijo] id:"; if(isset($_REQUEST['id'])) $msg .= $_REQUEST['id']; 

			 # LOGGER
        	logger::$obj['error']->log_message("$msg", logger::ERROR, __METHOD__); 
        	throw new Exception("Error Processing Request $msg", 1);        	  
 
			exit($msg);
			
			#throw new Exception(" This record ts not exists !", 1);			
			/*
			if(SHOW_DEBUG==true) {
			print( "<br>\n" .__METHOD__ . "<hr> Error: <span class='error'><b> 'terminoID' and 'prefijo' are null !, Please give me more info (terminoID:$terminoID , prefijo:$prefijo) </b></span> <hr>"  );
			$backtrace	= debug_backtrace();
			print "<pre>Debug Error backtrace:<br>" ;
			print_r($backtrace[0]);
			print "</pre>";
			}
			exit();
			*/
		}
		
		if(!$this->prefijo) {

			$msg = " Table not defined with prefijo:$prefijo ";

			 # LOGGER
        	logger::$obj['error']->log_message("$msg", logger::ERROR, __METHOD__);  

			exit($msg);
		}
		
		#echo " terminoID:$terminoID - id:$id \n";
		
		parent::__construct($id);				
	}	
	
	# define current table (tr for this obj)
	protected function defineTableName() {		
		return ('jer_'.$this->prefijo);	#echo ' jer_'.$this->current_table.' ';
	}	
	# define PrimaryKeyName (id)
	protected function definePrimaryKeyName() {
		return ('id');	
	}	
	# array of pairs db field name, obj property name like fieldName => propertyName
	protected function defineRelationMap() {		
		return (array(
			# db fieldn ame					# property name
			"id" 							=> "ID",
			"terminoID"						=> "terminoID",
			"parent" 						=> "parent",
			"modelo" 						=> "modelo",
			"esmodelo" 						=> "esmodelo",
			"esdescriptor" 					=> "esdescriptor",
			"visible" 						=> "visible",
			"norden" 						=> "norden",
			"usableIndex" 					=> "usableIndex",
			"traducible" 					=> "traducible",
			"relaciones" 					=> "relaciones",
			"propiedades" 					=> "propiedades",
			));
	}
	
	# resolve id from terminoID, lang
	protected function terminoID2id($terminoID) {
		
		# JER_LG : LANG
		if(strpos($terminoID,'-')!== false) {
			
			$ar_parts 		= explode('-',$terminoID);
			$this->prefijo	= $ar_parts[0];

			$arguments=array();
			$arguments['terminoID'] = $terminoID;
			$RecordObj_ts			= new RecordObj_ts(NULL, $this->prefijo);
			$ar_id					= $RecordObj_ts->search($arguments);
			
			if(isset($ar_id[0]))	return $ar_id[0];
			
		}else{
			
			$this->prefijo	= Tesauro::terminoID2prefix($terminoID);

			return intval(substr($terminoID, 2));
		}		
			
		return NULL ;
	}


	##
	# SAVE
	public function Save() {
		
		# Salva para crear el registro y obtener un id válido		
		$id = parent::Save();
		
		# SI ES UN REGISTRO NUEVO, NO TIENE CREADO EL 'terminoID'.
		# SE ASIGNA terminoID EN FUNCION DEL PREFIJO Y EL ID (autoincrement) CREADO		
		$terminoID = self::get_terminoID();
		if( empty($terminoID) && is_numeric($id) ) {
						
			# Lo componemos y volvemos a salvar
			$terminoID	= $this->get_prefijo() . $id ;
			self::set_terminoID($terminoID);
			self::set_norden(1);

			parent::Save();			
		}
		return $id;
	}
	

	
	# GET TERMINO DATO BY TIPO ('termino','def','obs') STATIC VERSION
	public static function get_descriptor_dato_by_tipo($terminoID, $lang, $tipo, $fallback=false) {

		# Verify : En casos como por ejemplo, al resolver el modelo de un término relacionado que no tiene modelo asignado, el terminoID estará vacío.
		# Esto no es un error pero debemos evitar resolverlo. 
		if(empty($terminoID)) {
			return null;
		}
/*
		#
		# DEDALO_CACHE_MANAGER : var
		$cache_var='get_descriptor_dato_by_tipo_'.$terminoID.'-'.$lang.'-'.$tipo.'-'.intval($fallback);
		if(DEDALO_CACHE_MANAGER && strpos($terminoID, 'dd')===0 && cache::exists($cache_var)) {
			#error_log("Readed cache: $cache_var ");
			return cache::get($cache_var);
		}
*/
		# STATIC CACHE
		static $descriptor_dato_by_tipo_stat_data;
		$unic_string = $terminoID.'-'.$lang.'-'.$tipo.'-'.intval($fallback);	#dump($unic_string,'$unic_string');	
		if(isset($descriptor_dato_by_tipo_stat_data[$unic_string])) {
			#dump('Usada cache',"para: $terminoID");
			return $descriptor_dato_by_tipo_stat_data[$unic_string];
		}
		#dump(""," from terminoID:$terminoID, lang:$lang, tipo:$tipo, fallback:$fallback");
		
		$matrix_table			= RecordObj_descriptors::get_matrix_table_from_tipo($terminoID);
		$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, NULL, $terminoID, $lang, $tipo, $fallback);		
		$dato					= $RecordObj_descriptors->get_dato();		
		
		# STATIC CACHE
		$descriptor_dato_by_tipo_stat_data[$unic_string] = $dato;

/*
		#
		# DEDALO_CACHE_MANAGER : Lo metemos en cache
		if(DEDALO_CACHE_MANAGER && strpos($terminoID, 'dd')===0) {
			cache::set($cache_var, $dato);
			#error_log("Added cache: $cache_var ");
		}
*/	
		return $dato;
	}
	# GET_TERMINO_BY_TIPO STATIC VERSION
	public static function get_termino_by_tipo($terminoID, $lang=NULL) {
		
		$tipo = 'termino';
		return self::get_descriptor_dato_by_tipo($terminoID, $lang, $tipo, $fallback=true);
	}	
	# GET DEF STATIC VERSION
	public static function get_def_by_tipo($terminoID, $lang=false) {
		
		$tipo = 'def';
		return self::get_descriptor_dato_by_tipo($terminoID, $lang, $tipo);
	}	
	# GET OBS STATIC VERSION
	public static function get_obs_by_tipo($terminoID, $lang=false) {
				
		$tipo = 'obs';
		return self::get_descriptor_dato_by_tipo($terminoID, $lang, $tipo);
	}

	# GET MODELO NAME (CURRENT OBJ)
	public function get_modelo_name() {
		return $this->get_termino_by_tipo($this->get_modelo());
	}

	# GET MODELO NAME BY TIPO (STATIC)
	public static function get_modelo_name_by_tipo($tipo) {
		$RecordObj_ts	= new RecordObj_ts($tipo);
		$modelo_name 	= $RecordObj_ts->get_modelo_name();

		return $modelo_name;
	}
	# GET AR TERMINO ID BY MODELO NAME (STATIC)
	public static function get_ar_terminoID_by_modelo_name($modelo_name, $prefijo='dd') {

		if(SHOW_DEBUG) $start_time = start_time();		

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

		#if(SHOW_DEBUG) $start_time = start_time();

		# 1 Despejamos el terminoID del modelo (ejemplo : 'area_root') que es el parent en matrix_descriptors
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'parent';
		$arguments['dato']				= $modelo_name;
		$arguments['tipo']				= 'termino';			
		$matrix_table					= RecordObj_descriptors::get_matrix_table_from_tipo($prefijo);	# 'matrix_descriptors_'.$prefijo;#
		$RecordObj_descriptors			= new RecordObj_descriptors($matrix_table, NULL);	#dump($arguments,"$modelo_name");		
		$ar_result						= $RecordObj_descriptors->search($arguments);		#dump($ar_result,'modelo_terminoID',"terminoID_by_modelo_name de: $modelo_name");
			
		/**
		* ARREGLO 2-2-2013
		*/
		# Recorremos los resultados para verificar que son modelo
		# Así obtenemos exclusivamente los téminos que SI son modelo
		if (!empty($ar_result)) {
		
			$ar_modelo_terminoID = array();
			foreach ($ar_result as $terminoID) {
				
				$RecordObj_ts	= new RecordObj_ts($terminoID);
				$esmodelo		= $RecordObj_ts->get_esmodelo($arguments);
				# Excluimos a los propios modelos del array
				if ($esmodelo=='si') {
					# Verfificado
					$ar_modelo_terminoID[] = $terminoID;
				}
			}		
			foreach ($ar_modelo_terminoID as $modelo_terminoID) {
				
				$arguments=array();
				$arguments['strPrimaryKeyName']	= 'terminoID';
				$arguments['modelo']			= $modelo_terminoID;
				$RecordObj_ts					= new RecordObj_ts(NULL,$prefijo);
				$ar_result						= $RecordObj_ts->search($arguments);
			}
		}

		# STATIC CACHE
		$ar_terminoID_by_modelo_name[$unic_string] = $ar_result;
			#dump($ar_result,'$ar_result');
		
		#$client->set('ar_terminoID_by_modelo_name_cache', serialize($ar_terminoID_by_modelo_name) );	

		if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $ar_result );

		return $ar_result;
	}


	






	
	
	
	
	# MODELOS ARRAY
	# Se usa en  el selector de tesauro edit para asignar modelo
	public function get_ar_all_modelos() {
		
		# STATIC CACHE
		static $ar_stat_data;		
		if(isset($this->terminoID) && isset($ar_stat_data[$this->terminoID])) return $ar_stat_data[$this->terminoID];
				
		$ar_all_modelos = array();		#echo " this->terminoID:".$this->get_terminoID() ." - ".$this->terminoID()."<hr>";			
		
		# SEARCH
		/*	
		$arguments['esmodelo']			= 'si';		
		$ar_id							= $this->search($arguments);
		*/
		
		$arguments=array();
		$arguments['esmodelo']			= 'si';
		$RecordObj_ts					= new RecordObj_ts(NULL,$this->prefijo);
		$ar_id							= $RecordObj_ts->search($arguments);
		
		
		foreach($ar_id as $id) {
			$ar_all_modelos[]		= $this->prefijo.$id ;
		}		
				
		# STORE CACHE DATA
		$ar_stat_data[$this->terminoID]	= $ar_all_modelos;
		
		return $ar_all_modelos ;
	}
	
	
	# GET CHILDRENS ARRAY
	public function get_ar_childrens_of_this($esdescriptor='si',$esmodelo=NULL) {
				
		# COMPROBACIÓN
		if(!$this->terminoID) 	return false;
		if(!$this->prefijo) 	return false;

		# STATIC CACHE
		static $ar_childrens_of_this_stat_data;		
		if(isset($ar_childrens_of_this_stat_data[$this->terminoID])) return $ar_childrens_of_this_stat_data[$this->terminoID];		
		
		
		$ar_childrens_of_this = array();	
		
		# SEARCH
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'terminoID';
		$arguments['parent']			= $this->terminoID;
		
		if( !empty($esdescriptor) && ($esdescriptor=='si' || $esdescriptor=='no') )
			$arguments['esdescriptor']		= $esdescriptor;							
		
		if( $esmodelo!==NULL && ($esmodelo=='si' || $esmodelo=='no') ) 	
			$arguments['esmodelo']			= $esmodelo;
		
		$arguments['order_by_asc']		= 'norden';
				
		$ar_id = $this->search($arguments);
			#dump($ar_id);
		
		foreach($ar_id as $terminoID) {			
			$ar_childrens_of_this[]	= $terminoID;			
		}		
				
		# STORE CACHE DATA
		$ar_childrens_of_this_stat_data[$this->terminoID] = $ar_childrens_of_this;						#dump($ar_childrens_of_this_stat_data);
		
		return $ar_childrens_of_this ;
	}

	/**
	* GET_AR_CHILDRENS
	*/
	public static function get_ar_childrens($tipo) {
		
		# STATIC CACHE
		static $ar_childrens_data;		
		if(isset($ar_childrens_data[$tipo])) return $ar_childrens_data[$tipo];		
		
		$ar_childrens = array();	
		
		# SEARCH
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'terminoID';
		$arguments['parent']			= $tipo;
		$arguments['order_by_asc']		= 'norden';
		$RecordObj_ts					= new RecordObj_ts($tipo);
		$ar_childrens					= $RecordObj_ts->search($arguments);
			
		# STORE CACHE DATA
		$ar_childrens_data[$tipo] = $ar_childrens;
		
		return $ar_childrens ;
	}
	
	
	# GET PARENTS ARRAY
	public function get_ar_parents_of_this($ksort=true) {
		
		# STATIC CACHE
		static $ar_stat_data;		
		if(isset($this->terminoID) && isset($ar_stat_data[$this->terminoID])) 	 return $ar_stat_data[$this->terminoID];
		
		$ar_parents_of_this = array();	
		$parent				= $this->get_parent();					if(!$parent) return $ar_parents_of_this;
		$parent_inicial		= $parent;	
		$parent_zero		= $this->get_prefijo().'0';		

		do {			
			if( $parent != $parent_zero )
			$ar_parents_of_this[]	= $parent;
			
			$RecordObj_ts			= new RecordObj_ts($parent);	
			$parent 				= $RecordObj_ts->get_parent();		#dump($parent); #die();	

			#$esdescriptor			= $RecordObj_ts->get_esdescriptor(); #if($esdescriptor!='si' && $parent!=$parent_zero) die( __METHOD__ ."<span class='error'> Error. this parent is not descriptor ! (parent:$parent, esdescriptor:$esdescriptor) </span>");				
		
		} while ( !empty($parent) && ($parent != $parent_zero) && $parent != $parent_inicial );
		
		
		# ordenamos a la inversa los padres
		#echo " ksort:";dump($ksort);
		if($ksort==true) krsort($ar_parents_of_this);
		
		# STORE CACHE DATA
		$ar_stat_data[$this->terminoID] = $ar_parents_of_this;
		
		return $ar_parents_of_this ;
	}	
	
	
	# GET SIBLINGS ARRAY [HERMANOS]
	public function get_ar_siblings_of_this() {
		
		# STATIC CACHE
		static $ar_stat_data;		
		if(isset($this->terminoID) && isset($ar_stat_data[$this->terminoID])) return $ar_stat_data[$this->terminoID];
		
		$ar_siblings_of_this		= array();
		
		$arguments["parent"]		= $this->get_parent();
		$arguments["esdescriptor"]	= 'si';		
		$ar_id						= $this->search($arguments);		
		
		foreach($ar_id as $id) {			
			$ar_siblings_of_this[]	= $this->get_prefijo() . $id;
		}
		
		# STORE CACHE DATA
		$ar_stat_data[$this->terminoID] = $ar_siblings_of_this;
		
		return $ar_siblings_of_this ;
	}
	
	
	# NUMERO DE HIJOS DESCRIPTORES
	function get_n_hijos_descriptores() {	
		
		# STATIC CACHE
		static $ar_stat_data;		
		if(isset($this->terminoID) && isset($ar_stat_data[$this->terminoID])) return $ar_stat_data[$this->terminoID];
		
		$arguments["parent"]		= $this->terminoID;
		$arguments["esdescriptor"]	= 'si';		
		$ar_id						= $this->search($arguments);		
		
		$n_hijos_descriptores		= count($ar_id);		#echo $n_hijos_descriptores ."<hr>";
		
		# STORE CACHE DATA
		$ar_stat_data[$this->terminoID] = $n_hijos_descriptores;	
		
		return $n_hijos_descriptores;
	}
	
	# NUMERO DE HIJOS
	function get_n_hijos() {	
				
		# STATIC CACHE
		static $ar_stat_data;		
		if(isset($this->terminoID) && isset($ar_stat_data[$this->terminoID])) return $ar_stat_data[$this->terminoID];
		
		$arguments["parent"]	= $this->terminoID;	
		$ar_id					= $this->search($arguments);		
		
		$n_hijos				= count($ar_id);
		
		# STORE CACHE DATA
		$ar_stat_data[$this->terminoID] = $n_hijos;	
		
		return $n_hijos;
	}
	
	
	# JERARQUIA TYPE	
	function get_jerarquia_type() {	
				
		# STATIC CACHE
		static $ar_stat_data;		
		if(isset($this->terminoID) && isset($ar_stat_data[$this->terminoID])) return $ar_stat_data[$this->terminoID];
		
		require_once(DEDALO_ROOT . '/jer/class.RecordObj_jer.php');
		
		$arguments["strPrimaryKeyName"]	= 'tipo';
		$arguments["alpha2"]			= $this->get_prefijo();	
		
		$RecordObj_jer					= new RecordObj_jer(NULL);
		$ar_id							= $RecordObj_jer->search($arguments);	
		
		$jerarquia_type					= $ar_id[0];
		
		# STORE CACHE DATA
		$ar_stat_data[$this->terminoID] = $jerarquia_type;
		
		return $jerarquia_type ;
	}	
	
	# PAIS 
	public function get_pais() {		
		return $this->get_prefijo() .'1';
	}	
	
	


	/**
	* GET_AR_TERMINOS_RELACIONADOS_REVERSE : Devuelve el array de términos (terminoID) que están relacionados con el pasado
	*/
	public static function get_ar_terminos_relacionados_reverse($tipo, $esmodelo='no') {
		
		$arguments["strPrimaryKeyName"]	= 'terminoID';
		$arguments["relaciones:json"]	= $tipo;
		$arguments["esmodelo"]			= $esmodelo;
		$RecordObj_ts					= new RecordObj_ts(NULL,substr($tipo, 0,2));
		$ar_result						= $RecordObj_ts->search($arguments);
			#dump($ar_result,'$ar_result');

		return $ar_result;
	}

	
	# GET RELACIONES AS ARRAY (FROM JSON)
	# Devuelve array en formato:
	#	[0] => Array
	#    (
	#       [dd9] => dd296
	#   )
	public function get_relaciones() {
		
		$relaciones = null;

		$dato = parent::get_relaciones();
		
		if (!empty($dato)) {
			#$relaciones = $dato; 	
			$relaciones = json_decode($dato, true);
		}
		#dump($dato,'dato en get_relaciones');

		return $relaciones;	
	}
	
	# SET RELACIONES AS JSON (MODELO: $ar_relaciones[$terminoID_source][] = array($modelo => $terminoID_rel))
	public function set_relaciones($ar_relaciones) {		
		return parent::set_relaciones(json_encode($ar_relaciones));
	}
	# REMOVE_ELEMENT_FROM_AR_TERMINOS_RELACIONADOS
	public function remove_element_from_ar_terminos_relacionados($terminoID_to_unlink) {
		
		# Recorremos los elementos en terminos relacionados para este objeto
		$ar_relaciones = $this->get_relaciones();
		
		# eliminamos del array el valor recibido
		$ar_final = NULL;
		if(is_array($ar_relaciones)) foreach($ar_relaciones as $key => $ar_values) {
			
			foreach($ar_values as $modeloID => $terminoID) {
				
				if($terminoID != $terminoID_to_unlink) $ar_final[] =  array($modeloID => $terminoID);	
			}			
		}
		
		# guardamos el resultado
		$this->set_relaciones($ar_final);					#dump($ar_relaciones); die();
		
		return true;
	}
	
	
	# AR_TERMINOS_RELACIONADOS JSON_VERSION
	# En modo 'simple' devuelve sólo un array de 'terminoID'
	public static function get_ar_terminos_relacionados($terminoID, $cache=false, $simple=false) {

		#if(SHOW_DEBUG) $start_time = start_time();
		# NO HACER CACHE EN ESTE MÉTODO		
				
		$ar_terminos_relacionados 	= array();
		
		$RecordObj_ts				= new RecordObj_ts($terminoID);
		$ar_relaciones				= $RecordObj_ts->get_relaciones();	#echo " - get_ar_terminos_relacionados($terminoID): "; dump($ar_relaciones); echo "<hr>";	
		
		# SIMPLE . SOLO DEVUELVE EL ARRAY LIMPIO CON EL LISTADO DE terminoID
		if($simple===true) {
			
			if(is_array($ar_relaciones)) foreach($ar_relaciones as $key => $ar_value) {
				
				foreach($ar_value as $modeloID => $terminoID) {
					$ar_terminos_relacionados[]	= $terminoID;	
				}					
			}
			$ar_relaciones	= $ar_terminos_relacionados;
		}
		#if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $ar_relaciones);
		
		return $ar_relaciones;	
	}

	/* DESACTIVA PORQUE NO SE EXPERIMENTA INCREMENTO DE VELOCIDAD... 
	public static function get_ar_recursive_childrens_of_this_static($terminoID) {

		#static $ar_recursive_childrens_of_this_static;
		#if(isset($ar_recursive_childrens_of_this_static[$terminoID])) return $ar_recursive_childrens_of_this_static ;

		$RecordObj_ts 					= new RecordObj_ts($terminoID);
		$ar_recursive_childrens_of_this = $RecordObj_ts->get_ar_recursive_childrens_of_this($terminoID);

		# Store in cache
		#$ar_recursive_childrens_of_this_static = $ar_recursive_childrens_of_this;

		return $ar_recursive_childrens_of_this;
	}
	*/	
	
	# CHILDRENS RECURSIVE ARRAY
	# SACA TODOS LOS HIJOS DEL TERMINO ACTUAL RECURSIVAMENTE
	public function get_ar_recursive_childrens_of_this($terminoID, $is_recursion=0) {
		
		# IMPORTANTE: NO HACER CACHE DE ESTE MÉTODO (AFECTA A COMPONENT_FILTER_MASTER)

		# $ar_recursive_childrens_of_this = array();
				
		# creamos una instancia independiente de RecordObj_ts y sacamos los hijos directos
		#unset($ar_childrens_of_this);
		$ar_childrens_of_this 	= array();	# reset value every cycle
		$RecordObj_ts 			= new RecordObj_ts($terminoID);
		$ar_childrens_of_this 	= $RecordObj_ts->get_ar_childrens_of_this();	#print_r($ar_childrens_of_this);
				
		if(is_array($ar_childrens_of_this) && count($ar_childrens_of_this)>0) foreach($ar_childrens_of_this as $children_terminoID) {
			
			# Add current element		
			$this->ar_recursive_childrens_of_this[] = $children_terminoID;			

			# Recursion
			$this->get_ar_recursive_childrens_of_this($children_terminoID,1);
		}

		if(isset($this->ar_recursive_childrens_of_this))
		return $this->ar_recursive_childrens_of_this ;		
	}
	/**
	* GET_AR_RECURSIVE_CHILDRENS : Static version
	* No hay aumento de velocidad apreciable entre la versión estática y dinámica. Sólo una reducción de unos 140 KB en el consumo de memoria
	*/
	public static function get_ar_recursive_childrens($terminoID, $is_recursion=false) {

		$ar_resolved=array();
		
		if($is_recursion) array_push($ar_resolved, $terminoID);

		$ar_childrens = (array)RecordObj_ts::get_ar_childrens($terminoID);
/*
		# SEARCH
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'terminoID';
		$arguments['parent']			= $terminoID;
		$arguments['esdescriptor']		= 'si';
		$arguments['esmodelo']			= 'no';
		$arguments['order_by_asc']		= 'norden';
		$RecordObj_ts 					= new RecordObj_ts($terminoID);
		$ar_childrens 					= $RecordObj_ts->search($arguments);
*/

		foreach($ar_childrens as $current_terminoID) {

			# Recursion
			$ar_resolved = 	array_merge($ar_resolved, (array)RecordObj_ts::get_ar_recursive_childrens($current_terminoID,true) );
		}
		
		return $ar_resolved;
	}



	
	# GET TERMINO ID BY MODELNAME
	# devuelve el terminoID del termino relacionado (especificar relacion) de modelo name dado
	# ej. para saber los términos relacionados de modelo 'filter'
	static public function get_ar_terminoID_by_modelo_name_and_relation($tipo, $modelo_name, $relation_type) {
		
		$result	= array();
		
		if(empty($tipo)) return $result;

		# acepta también arrays como entrada de tipo
		if(is_array($tipo) && isset($tipo[0])) $tipo = $tipo[0];	
		
		# STATIC CACHE		
		static $ar_stat_data;	
		$name	= $tipo.'_'.$modelo_name.'_'.$relation_type; 			#dump($name,"CACHE KEY $name");
		if(isset($ar_stat_data[$name])) return $ar_stat_data[$name];

		#if(SHOW_DEBUG) $start_time = start_time();
		
		#dump($tipo);	#dump(debug_backtrace());
		
		switch($relation_type) {
			
			case 'children' :
				
					# Obtenemos los hijos
					$RecordObj_ts	= new RecordObj_ts($tipo);
					$ar_childrens	= $RecordObj_ts->get_ar_childrens_of_this();		#dump($ar_childrens,$section);
					
					# los recorremos para filtrar por modelo
					if(is_array($ar_childrens)) foreach($ar_childrens as $terminoID) {
						
						$RecordObj_ts			= new RecordObj_ts($terminoID);
						$modelo					= $RecordObj_ts->get_modelo();

						if(empty($modelo)) {
							$name = RecordObj_ts::get_termino_by_tipo($terminoID);
							throw new Exception("Error Processing Request. Modelo is empty. Please define modelo for this component $terminoID ($name)", 1);							
						}
						$current_modelo_name	= $RecordObj_ts->get_termino_by_tipo($modelo);	#dump($modelo_name);
						
						if(strpos($current_modelo_name, $modelo_name) !== false) {
							 $result[] = $terminoID;
							 #break;
						}
					}
					break;

			case 'children_recursive' :
				
					# Obtenemos los hijos
					$RecordObj_ts	= new RecordObj_ts($tipo);
					$ar_childrens	= $RecordObj_ts->get_ar_recursive_childrens_of_this($tipo);		#dump($ar_childrens);
					
					# los recorremos para filtrar por modelo
					if(is_array($ar_childrens)) foreach($ar_childrens as $terminoID) {
						
						$RecordObj_ts			= new RecordObj_ts($terminoID);
						$modelo					= $RecordObj_ts->get_modelo();

						if(empty($modelo)) {
							$name = RecordObj_ts::get_termino_by_tipo($terminoID);
							throw new Exception("Error Processing Request. Modelo is empty. Please define modelo for this component $terminoID ($name)", 1);							
						}
						$current_modelo_name	= $RecordObj_ts->get_termino_by_tipo($modelo);	#dump($modelo_name);
						
						if(strpos($current_modelo_name, $modelo_name) !== false) {
							 $result[] = $terminoID;
							 #break;
						}
					}
					break;
					
			case 'termino_relacionado' :
				
					# Obtenemos los tr
					$RecordObj_ts				= new RecordObj_ts($tipo);
					$ar_terminos_relacionados	= $RecordObj_ts->get_ar_terminos_relacionados($tipo, $cache=true, $simple=true);	#dump($ar_terminos_relacionados);
					
					# los recorremos para filtrar por modelo
					if(is_array($ar_terminos_relacionados)) foreach($ar_terminos_relacionados as $terminoID) {
						
						$RecordObj_ts			= new RecordObj_ts($terminoID);
						$modelo					= $RecordObj_ts->get_modelo();

						if(empty($modelo)) {
							$name = RecordObj_ts::get_termino_by_tipo($terminoID);
							throw new Exception("Error Processing Request. Modelo is empty. Please define modelo for this component $terminoID ($name)", 1);							
						}
						$current_modelo_name	= $RecordObj_ts->get_termino_by_tipo($modelo);		#dump($modelo_name);
						
						if(strpos($current_modelo_name, $modelo_name) !== false) {
							 $result[] = $terminoID;
							 #break;
						}
					}
					break;

			case 'parent' :
				
					# Obtenemos los hijos
					$RecordObj_ts				= new RecordObj_ts($tipo);
					$ar_parents	= $RecordObj_ts->get_ar_parents_of_this();	#dump($ar_parents);
					
					# los recorremos para filtrar por modelo
					if(is_array($ar_parents)) foreach($ar_parents as $terminoID) {
						
						$RecordObj_ts			= new RecordObj_ts($terminoID);
						$modelo					= $RecordObj_ts->get_modelo();

						if(empty($modelo)) {
							$name = RecordObj_ts::get_termino_by_tipo($terminoID);
							throw new Exception("Error Processing Request. Modelo is empty. Please define modelo for this component $terminoID ($name)", 1);							
						}
						$current_modelo_name	= $RecordObj_ts->get_termino_by_tipo($modelo);		#dump($modelo_name);
						
						if($current_modelo_name == $modelo_name) {
							 $result[] = $terminoID;
							 #break;
						}
					}
					break;
					
			default : 
					throw new Exception("relation_type [$relation_type] not defined!", 1);
					break;
		}		
		
		# STORE CACHE DATA
		$ar_stat_data[$name] = $result ;

		#if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $result );
		
		return $result;
	}
	
	

	
	
	
	
	# CHILDRENS RECURSIVE ARRAY
	# SACA TODOS LOS HIJOS DEL TERMINO ACTUAL RECURSIVAMENTE
	public static function get_ar_recursive_childrens_DES($terminoID) {
		die("no acabada");
		# STATIC CACHE
		#static $ar_stat_data;		
		#if(isset($terminoID) && isset($ar_stat_data[$terminoID])) return $ar_stat_data[$terminoID];		
				
		$ar_recursive_childrens = array();		$ar_recursive_childrens2 = array();
				
		# creamos una instancia independiente de RecordObj_ts y sacamos los hijos directos
		#unset($ar_recursive_childrens);
		$ar_recursive_childrens=array();
		$obj 						= new RecordObj_ts($terminoID);
		$ar_childrens_of_this 		= $obj->get_ar_childrens_of_this();	#print_r($ar_childrens_of_this);		
				
		if(is_array($ar_childrens_of_this) && count($ar_childrens_of_this)>0) foreach($ar_childrens_of_this as $children_terminoID) {
						
			$ar_recursive_childrens[] = $children_terminoID;
										
			$ar_recursive_childrens2 = self::get_ar_recursive_childrens($children_terminoID);
			
			if(is_array($ar_recursive_childrens2) && count($ar_recursive_childrens2)>0) foreach($ar_recursive_childrens2 as $children_terminoIDa) {
				$ar_recursive_childrens[] = $children_terminoIDa;
			}
		}
		
		# STORE CACHE DATA
		#$ar_stat_data[$terminoID] = $ar_recursive_childrens_of_this;
				
		return $ar_recursive_childrens ;		
	}
	
	
	# TS CHILDRENS RECURSIVE . TS TREE FULL FROM PARENT 
	/*	
	public static function get_ar_ts_childrens_recursive($terminoID) {
		
		# STATIC CACHE
		static $ar_stat_data;
		$terminoID_source = $terminoID;		
		if(isset($terminoID_source) && isset($ar_stat_data[$terminoID_source])) return $ar_stat_data[$terminoID_source];	
		
		$ar_current[$terminoID] = array();
		$RecordObj_ts			= new RecordObj_ts($terminoID);				
		$ar_ts_childrens		= $RecordObj_ts->get_ar_childrens_of_this(); 
		
		if (count($ar_ts_childrens)>0) {
			
			foreach ($ar_ts_childrens as $children_terminoID) {				
				
				$RecordObj_ts			= new RecordObj_ts($children_terminoID);
				$modeloID				= $RecordObj_ts->get_modelo($children_terminoID);				
				$modelo					= RecordObj_ts::get_termino_by_tipo($modeloID);				#echo " $modelo - ";	#if ($modelo == 'section_list' || $modelo == 'Admin' ) return false;
								
				$ar_exclude_modelo		= array('section_list','Admin','filter');
				
				$matriz_fl 				= preg_grep("/^(\d+)?\.\d+$/", $matriz);
				
				if ( !in_array($modelo, $ar_exclude_modelo) ) {
			
					$ar_temp = self::get_ar_ts_childrens_recursive($children_terminoID);					
			
					#if(count($ar_ts_childrens)>0) 				
					$ar_current[$terminoID][$children_terminoID] = $ar_temp;		#echo " - $children_terminoID : " .count($ar_ts_childrens) ." $ar_temp <br>\n";					
				}				
			}			
			$ar_tesauro[$terminoID] = $ar_current[$terminoID];
			
			# STORE CACHE DATA
			$ar_stat_data[$terminoID_source] = $ar_tesauro[$terminoID];
		
			return $ar_tesauro[$terminoID];			
		}		
	}
	*/	
	
	# WALK TS CHILDRENS RECURSIVE . DEPLOY TS TREE FULL ARRAY
	/*
	PASADA A CLASS.COMPONENT_SECURITY_ACCESS
	public static function walk_ar_ts_childrens_recursive($ar_tesauro, $arguments=array()) {
	
		$html 		= '';			
		
		#echo "<hr>";
		#foreach($arguments as $key => $value ) echo " $key - " .htmlspecialchars($value) ."<br>";		
		#echo "<hr>";		
		extract($arguments);
					
			
		foreach($ar_tesauro as $tipo => $value) {
			
			$dato_current	= NULL;						
			if(isset($dato[$tipo]))
			$dato_current	= intval($dato[$tipo]);				
			
			$termino	 = RecordObj_ts::get_termino_by_tipo($tipo);			
			
				$html	.= $open_term;
				$html	.= "\n <a> ";
				$html	.= component_security_access::create_radio($dato_current,$terminoID,$tipo,$id);
				$html	.= "\n  $termino ";
				$html	.= "\n </a><h7>[$tipo]  $id - $dato_current </h7> ";	
				#$html	.= "\n  $termino \n </a> <h7>[$tipo]</h7>";				
				
				
				if(is_array($value)) {					
											
					$html .= $open_group ;			
					$html .= self::walk_ar_ts_childrens_recursive($value,$arguments);					
					$html .= $close_group;							
				}
			
				$html .= $close_term;		
		}		
		return $html;
	}
	*/
	
	
	
	
	
	
	
	
	
	# termino functions
	/*
	public function get_termino() {		
		return stripslashes(parent::get_termino());	
	}
	public function set_termino($string) {
		$string = stripslashes($string); 
		$string = addslashes($string);
		parent::set_termino($string);
	}
	public function get_def() {		
		return stripslashes(parent::get_def());	
	}
	public function set_def($string) {
		$string = stripslashes($string); 
		$string = addslashes($string);
		parent::set_def($string);
	}
	public function get_obs() {		
		return stripslashes(parent::get_obs());	
	}
	public function set_obs($string) {
		$string = stripslashes($string); 
		$string = addslashes($string);
		parent::set_obs($string);
	}
	*/
	/*
	function set_prefijo() {
		if(isset($this->terminoID))	$this->prefijo = substr($this->terminoID,0,2);
	}	
	function get_prefijo() {
		if(isset($this->prefijo)) return $this->prefijo;
		
		if(isset($this->terminoID))	$this->prefijo = substr($this->terminoID,0,2);
		return $this->prefijo;
	}
	*/
	



	/**
	* GET PROPIEDADES (JSON)
	*//*
	function get_propiedades($raw=false) {

		if ($raw) {
			return $this->propiedades;
		}
		
		if($this->blIsLoaded != true) $this->Load();

		if(!isset($this->propiedades)) return NULL;
				
		$propiedades = $this->propiedades;								#dump($propiedades,'propiedades pre json decode');

		# FORMATOS RECIBIDOS:
			# String:				María
			# String JSON:			"María"
			# Array secuencial:		["María","Begoña"] (Cualquier array cuyo key sea consecutivo y que comience en 0)
			# Array no secuencial	{"nombre":"María","apellidos":"Pérez"} (Arrays asociativos o cualquier array cuyo key sea no consecutivo o que no comience en 0)
		#
		# Test dato . Decode and convert in array if have various values ( format json_decode($dato,true) )		
		$propiedades_decoded = json_handler::decode($propiedades,true);
			#dump($propiedades_decoded,'propiedades post json decode');
		
		# Case IS JSON encoded
		if($propiedades_decoded != NULL) $propiedades = $propiedades_decoded;
			#dump($propiedades,'$propiedades');

		# "" is replaced by NULL . ("" es la representación json de null en DDBB)
		if($propiedades=='""') return NULL;
		
		# Case IS String apply htmlspecialchars formater
		#if(is_string($propiedades)) $propiedades = htmlspecialchars($propiedades);	DESHABILITADO (ALTERA EL DUPLICADO EN MATRIX TIME MACHINE)

		return $propiedades;	
	}
	*/

	/**
	* SET PROPIEDADES (JSON)
	*//*
	function set_propiedades($propiedades, $raw=false) {

		# Allways set dato as modified
		$this->arModifiedRelations['propiedades'] = "1";

		if ($raw) {
			$this->propiedades = $propiedades;			
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
		if(!defined('JSON_UNESCAPED_UNICODE')) define('JSON_UNESCAPED_UNICODE', 256);

			#dump($propiedades,"set_propiedades pre json decode $propiedades",$raw);

		# Reemplazamos las comillas dobles por sencillas antes de pasar el propiedades a JSON
		if(is_string($propiedades)) {
			#$propiedades = stripslashes($propiedades);				
			$propiedades = str_replace('"', '\'',	$propiedades);
		}
		#$propiedades = json_encode($propiedades, JSON_UNESCAPED_UNICODE);			#dump(JSON_UNESCAPED_UNICODE);
		$propiedades = json_handler::encode($propiedades,JSON_UNESCAPED_UNICODE);	# | JSON_NUMERIC_CHECK

		if(is_numeric($propiedades)) {
			$this->propiedades = $propiedades;
		}else{
			# stripslashes and addslashes text values
			# is important and manpropiedadesry for avoid duplicate slashes			
			if(is_string($propiedades)) {
				$propiedades = stripslashes($propiedades);
				$propiedades = stripslashes($propiedades);			
				$propiedades = addslashes($propiedades);
			}else if (is_null($propiedades)) {
				$propiedades = '';
			}
			$this->propiedades = $propiedades;
		}	
	}
	*/




	
	
	function __destruct() {
		
		/*
		// Place this part at the very end of your page 
		$time = microtime(); 
		$time = explode(" ", $time); 
		$time = $time[1] + $time[0]; 
		$finish = $time; 
		$totaltime = ($finish - $start); 
		printf ( "<br>". __METHOD__ . " took %f seconds to load.", $totaltime);
		*/	
		parent::__destruct();
	}
	
}
?>