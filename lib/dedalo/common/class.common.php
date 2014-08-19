<?php
# COMMON (ABSTRACT CLASS)
# MÉTODOS COMPARTIDOS POR TODOS LOS COMPONENTES Y ZONAS
# DECLARAR LOS MÉTODOS PUBLIC
require_once(DEDALO_LIB_BASE_PATH . '/common/class.Accessors.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_matrix.php');



abstract class common extends Accessors {
	
	static $permissions;
	static $ar_loaded_modelos = array();
	static $ar_loaded_modelos_name = array();
	
	public $identificador_unico;
	public $variant;

	protected $bl_loaded_structure_data;
	protected $bl_loaded_matrix_data;

	# TABLE  matrix_table
	#public $matrix_table ;

	public $context;

	
	# REQUIRED METHODS
	#abstract protected function define_id($id);
	#abstract protected function define_tipo();
	#abstract protected function define_lang();
	#abstract public function get_html();
		
	
	# PERMISSIONS
	public static function get_permissions($tipo=null) {
		
		if(!login::is_logged()) {
			return false;
		}
		/*
		if(!isset($_SESSION['auth4']['is_logged']) || $_SESSION['auth4']['is_logged']==0) {
			
			#throw new Exception("Error You are not logged (auth is not defined). Please login ", 1);
			header("Location: ../main/?t=".MAIN_FALLBACK_SECTION);
			exit();
			//die(__METHOD__ . " : auth is not defined!");
		}
		*/

		if(empty($tipo)) {
			if(SHOW_DEBUG) {
				dump($tipo,tipo);
			}			
			throw new Exception("Error Processing Request. get_permissions tipo is empty: ", 1);
		}
		
		#if(!isset(self::$permissions)) {
			#require_once(DEDALO_LIB_BASE_PATH . '/security/class.security.php');		
			$obj				= new security();							#dump($tipo);
			self::$permissions	= $obj->get_security_permissions($tipo);	#print_r(self::$permissions);	
		#}				
		return self::$permissions;
	}


	
	
	
	/**
	* LOAD STRUCTURE DATA
	* Get data once from structure (tipo, modelo, norden, estraducible, etc.) 
	*/
	protected function load_structure_data() {
		
		if( empty($this->tipo) ) {
			throw new Exception("Error: tipo is mandatory!", 1);
		}


		
		if( !$this->bl_loaded_structure_data) {

			/*
			# DEDALO_CACHE_MANAGER : var
			$cache_var='get_load_structure_data_'.$this->tipo;
			if(DEDALO_CACHE_MANAGER && cache::exists($cache_var)) {
				#dump($cache_var,"COMPONENT SHOW FROM CACHE");
				$this->RecordObj_ts = unserialize(cache::get($cache_var));
				#error_log("Readed cache: $cache_var ");
			}else{
				# Creamos un nuevo objeto de estructura (tesauro)
				$this->RecordObj_ts	= new RecordObj_ts($this->tipo);

				# DEDALO_CACHE_MANAGER : Lo metemos en cache
				if(DEDALO_CACHE_MANAGER) {
					cache::set($cache_var, serialize($this->RecordObj_ts));
					#error_log("Added cache: $cache_var ");					
				}
			}			
			*/
			$this->RecordObj_ts	= new RecordObj_ts($this->tipo);		

			# Fix vars
			$this->modelo		= $this->RecordObj_ts->get_modelo();
			$this->norden		= $this->RecordObj_ts->get_norden();
			$this->required		= $this->RecordObj_ts->get_usableIndex();

			/*
			# DEDALO_CACHE_MANAGER : var
			$cache_var='get_load_structure_data_label_'.$this->tipo;
			if(DEDALO_CACHE_MANAGER && cache::exists($cache_var)) {
				#dump($cache_var,"COMPONENT SHOW FROM CACHE");
				$this->label		= cache::get($cache_var);
				#error_log("Readed cache: $cache_var ");
			}else{
				$this->label		= RecordObj_ts::get_termino_by_tipo($this->tipo, DEDALO_APPLICATION_LANG);		#echo 'DEDALO_APPLICATION_LANG: '.DEDALO_APPLICATION_LANG ;#var_dump($this->label);	#die();

				# DEDALO_CACHE_MANAGER : Lo metemos en cache
				if(DEDALO_CACHE_MANAGER) {
					cache::set($cache_var, $this->label);
					#error_log("Added cache: $cache_var ");
				}
			}
			*/
			$this->label		= RecordObj_ts::get_termino_by_tipo($this->tipo, DEDALO_APPLICATION_LANG);		#echo 'DEDALO_APPLICATION_LANG: '.DEDALO_APPLICATION_LANG ;#var_dump($this->label);	#die();
			

			# TRADUCIBLE
			$this->traducible	= $this->RecordObj_ts->get_traducible();
			# Si el elemento no es traducible, fijamos su 'lang' en 'lg-nolan' (DEDALO_DATA_NOLAN)
			if ($this->traducible=='no') {
				$this->fix_language_nolan();
			}

			# PROPIEDADES : Allways JSON decoded
			$this->propiedades	= json_decode($this->RecordObj_ts->get_propiedades());


			# MATRIX_TABLE
			#if(!isset($this->matrix_table))
			#$this->matrix_table = self::get_matrix_table_from_tipo($this->tipo);

			
			# NOTIFY : Notificamos la carga del elemento a common
			common::notify_load_lib_element_tipo($this->modelo, get_called_class() );

			$this->bl_loaded_structure_data = true;
		}
	}

	/**
	* LOAD MATRIX DATA
	* Get data once from matrix about parent, dato, lang
	*/
	protected function load_matrix_data() {
		
		if( empty($this->id) || intval($this->id)<1 ) {

			# Experimental (devolvemos como que ya se ha intentado cargar, aunque sin id)
			#$this->bl_loaded_matrix_data = true;

			return NULL;
		}
		
		if( !$this->bl_loaded_matrix_data ) {
		# Experimental (si ya se ha intentado cargar pero con sin id, y ahora se hace con id, lo volvemos a intentar)
		#if( !$this->bl_loaded_matrix_data || ($this->bl_loaded_matrix_data && intval($this->id)<1) ) {
			
			$matrix_table 		= common::get_matrix_table_from_tipo($this->tipo);
			$RecordObj_matrix	= new RecordObj_matrix($matrix_table,$this->id);
						
			$this->parent 		= $RecordObj_matrix->get_parent();
			$this->dato 		= $RecordObj_matrix->get_dato();
			$this->lang 		= $RecordObj_matrix->get_lang();

			$this->bl_loaded_matrix_data = true;
		}
	}

	/**
	* GET MATRIX_TABLE FROM TIPO
	*/
	public static function get_matrix_table_from_tipo($tipo) {
		
		if (empty($tipo)) throw new Exception("Error Processing Request. tipo is empty", 1);
		if ($tipo=='matrix') throw new Exception("Error Processing Request. tipo is matrix", 1);

		static $matrix_table_from_tipo;
		
		if(isset($matrix_table_from_tipo[$tipo])) {
			return($matrix_table_from_tipo[$tipo]);
		}
		
		#if(SHOW_DEBUG) $start_time = start_time();
		

		# Default value:
		$matrix_table 	= 'matrix';

		$modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo( $tipo );		
		if ($modelo_name=='section') {
			
			# SECTION : If section have TR of model name 'matrix_table' takes its matrix_table value
			$ar_terminos_relacionados = RecordObj_ts::get_ar_terminos_relacionados($tipo, $cache=false, $simple=true);
			if ( isset($ar_terminos_relacionados[0]) ) {
				$modelo_name_tr = RecordObj_ts::get_modelo_name_by_tipo( $ar_terminos_relacionados[0] );
				if($modelo_name_tr == 'matrix_table') {
					# Set custom matrix table
					$matrix_table = RecordObj_ts::get_termino_by_tipo($ar_terminos_relacionados[0]);
						#if (SHOW_DEBUG) dump($matrix_table,"INFO: Switched table to: $matrix_table for tipo:$tipo ");
				} 
			}

		}else{

			# COMPONENT
			# Heredamos la tabla de la sección parent (si la hay)
			$ar_parent_section = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($tipo, $modelo_name='section', $relation_type='parent');
			if (isset($ar_parent_section[0])) {
				$parent_section_tipo = $ar_parent_section[0];	#dump($parent_section_tipo,'$parent_section_tipo');
				$ar_terminos_relacionados = RecordObj_ts::get_ar_terminos_relacionados($parent_section_tipo, $cache=false, $simple=true);
				if ( isset($ar_terminos_relacionados[0]) ) {
					$modelo_name_tr = RecordObj_ts::get_modelo_name_by_tipo( $ar_terminos_relacionados[0] );
					if($modelo_name_tr == 'matrix_table') {
						# Set custom matrix table
						$matrix_table = RecordObj_ts::get_termino_by_tipo($ar_terminos_relacionados[0]);
							#if (SHOW_DEBUG) dump($matrix_table,"INFO: Switched table to: $matrix_table for tipo:$tipo ");
					} 
				}
			}
		}
		#dump($matrix_table,'$matrix_table for tipo: '.$tipo);

		# Cache
		$matrix_table_from_tipo[$tipo] = $matrix_table;

		#if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, 'logger_backend_activity '.$tipo);

		return $matrix_table;
	}


	/**
	* GET TIPO BY ID
	* @param $id (int id_matrix)
	* @param $table (str default 'matrix')
	*/
	static public function get_tipo_by_id($id, $current_matrix_table=NULL) {

		if(intval($id)<1) {
			throw new Exception("Error Processing Request. id empty", 1);
		}
		
		if(empty($current_matrix_table)) {
			throw new Exception("Error Processing Request.", 1);			
		}

		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'tipo';
		$arguments['id']				= $id;
		$matrix_table 					= $current_matrix_table;
		$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
		$ar_records						= $RecordObj_matrix->search($arguments);
			#dump($ar_records," ".print_r($arguments,true));

		if (!empty($ar_records[0])) {
			return $ar_records[0];
		}

		if(SHOW_DEBUG) {
			#dump(" id:$id, current_matrix_table:$current_matrix_table");
		}
		trigger_error("Error: record not found [id:$id] (get_tipo_by_id)");
		return NULL;
	}

	



	protected function set_default_value() {

	}




	
	/**
	* GET IDENTIFICADOR UNICO
	* Se fija al hacer la primera llamada. 
	* Para sobreescribirlo, simplemente llamarlo inicialmente pasándo un string 
	*/
	public function get_identificador_unico() {

		if (isset($this->identificador_unico)) {
			return $this->identificador_unico;
		}

		$permissions=null;
		if(!empty($this->tipo)) {
			$permissions = common::get_permissions($this->tipo);
		}

		$this->identificador_unico = self::get_id().'_'.self::get_tipo().'_'.self::get_parent().'_'.self::get_lang().'_'.self::get_modo().'_'.self::get_variant().'_'.$permissions;	# .'_'.mt_rand(1,999); #dump($identificador_unico);
			#$identificador_unico = $this->get_tipo() . '_' . $this->get_id() . '_' . $this->get_lang() . '_' . $this->get_modo();	#dump($identificador_unico);
		
		#dump($this->identificador_unico,'$this->identificador_unico');	

		return $this->identificador_unico;
	}

	/**
	* SET IDENTIFICADOR UNICO
	* Se fija al hacer la primera llamada. 
	*/
	public function set_identificador_unico($string) {
		$this->identificador_unico = $string;
	}

	
	
	# LOADED OBJS
	
	# GET LOADED OBJS BY MODEL ID
	public static function get_ar_loaded_modelos() {		
		
		if(is_array(common::$ar_loaded_modelos))
			return array_unique(common::$ar_loaded_modelos);		#dump(common::$ar_loaded_modelos); echo "<hr>";
		else
			return common::$ar_loaded_modelos;
	}

	
	# NOTIFY LOAD LIB ELEMET TIPO
	public static function notify_load_lib_element_tipo($tipo,$modelo_name) {
		common::$ar_loaded_modelos[] 		= $tipo;
		if(empty($modelo_name)) {
			dump($modelo_name,'is empty for tipo: '.$tipo);
		}
		common::$ar_loaded_modelos_name[] 	= $modelo_name;	
	}	
	
	# GET_AR_ALL_LOADED_MODELOS
	#public static function get_ar_all_loaded_modelos() {		
	#	return common::$ar_loaded_modelos;
	#}

	# SHOW_LOADED_MODELOS
	public static function show_loaded_modelos() {
		
		$debug = '';
		#$ar_all_loaded_modelos = common::get_ar_all_loaded_modelos();
		$ar_all_loaded_modelos = common::$ar_loaded_modelos;

		$n = count($ar_all_loaded_modelos);
		
		foreach($ar_all_loaded_modelos as $modeloID) {
			$modelo = RecordObj_ts::get_termino_by_tipo($modeloID);
			$debug[]= " $modeloID - $modelo ";	
		}
		
		# DEBUG
		if(SHOW_DEBUG===true) {
			$_SESSION['debug_content'][__METHOD__] = $debug;
		}
		
		return $debug;	
	}
	
	
	/**
	* GET TIPO NAME OF CURRENT OBJECT
	* @see RecordObj_ts::get_termino_by_tipo($tipo)
	* @return $tipo_name
	*	String like 'Proyectos'
	*/
	public function get_tipo_name() {
		$tipo 	 	= $this->get_tipo();
		$tipo_name 	= RecordObj_ts::get_termino_by_tipo($tipo);
		return $tipo_name;
	}
	
	
	
	
	# GET ARRAY CSS
	protected function get_ar_css() {
		if (isset($this->RecordObj_ts)) {
			return css::get_ar_css($this->RecordObj_ts);
		}
	}
	
	
	# __TOSTRING
	public function __toString() {
        return 'Obj: '.get_called_class();
    }	
	
	
	
	
	
	# SETVAR
	public static function setVar($name, $default=false) {

		if($name=='name') throw new Exception("Error Processing Request: Name 'name' is invalid", 1);		
		
		$$name = $default; 
		if(isset($_REQUEST[$name])) $$name = $_REQUEST[$name];
		
		if($$name)
		return $$name ;
	}
	
	
	# PAGE QUERY . REMOVED ORDER CODE BY DEFAULT
	public static function get_page_query_string($remove_optional_vars=true) {
		
		$queryString = $_SERVER['QUERY_STRING']; # like max=10
		
		if($remove_optional_vars == false) return $queryString;
		
		$qs 				= false ;
		$ar_optional_vars	= array('order_by','order_dir','lang','accion','pageNum');
		
		$search  		= array('&&',	'&=',	'=&',	'??',	'==');
		$replace 		= array('&',	'&',	'&',	'?',	'=' );
		$queryString 	= str_replace($search, $replace, $queryString);
		
		$posAND 	= strpos($queryString, '&');
		$posEQUAL 	= strpos($queryString, '=');
		
		# Recorre y recompone el query sin incluir las variables opcionales
		if($posAND !== false){ # query tipo ?captacionID=1&informantID=6&list=0
			
			$ar_pares = explode('&', $queryString);		
			if(is_array($ar_pares)) foreach ($ar_pares as $key => $par){
				
				#echo " <br> $key - $par ";
				if(strpos($par,'=')!==false) {
							
					$troz		= explode('=',$par) ;
						
					$varName 	= false;	if(isset($troz[0])) $varName	= $troz[0];
					$varValue 	= false;	if(isset($troz[1])) $varValue	= $troz[1];
										
					if(!in_array($varName, $ar_optional_vars)) {
						$qs .= $varName . '=' . $varValue .'&';
					}					
				}
			}
			
		}else if($posAND === false && $posEQUAL !== false) { # query tipo ?captacionID=1
		
			$qs = $queryString ;						
		}
		
		$qs = str_replace($search, $replace, $qs);
		
		# if last char is & delete it
		if(substr($qs, -1)=='&') $qs = substr($qs, 0, -1);
		
		#dump( $qs , 'qs');

		return $qs ;
	}




	
	


	/**
	* GET HTML CODE . RETURN INCLUDE FILE __CLASS__.PHP
	* @return $html
	*	Get standar path file "DEDALO_LIB_BASE_PATH .'/'. $class_name .'/'. $class_name .'.php'" (ob_start)
	*	and return rendered html code
	*/
	public function get_html() {

		if(SHOW_DEBUG) $start_time = start_time();
		
		
			# Class name is called class (ex. component_input_text), not this class (common)	
			ob_start();
			include ( DEDALO_LIB_BASE_PATH .'/'. get_called_class() .'/'. get_called_class() .'.php' );
			$html = ob_get_clean();


		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' ', "html");
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}
		
		return $html;
	}

	/*
	public function get_caller_id() {
		if(!empty($_REQUEST['caller_id'])) return $_REQUEST['caller_id'];
		return NULL;
	}
	
	public function get_caller_tipo_____DEPRECATED() {
		$caller_id = common::get_caller_id();
		if(empty($caller_id)) return NULL;
		
		# calculate caller tipo (caller is id_matrix of a secion (ussually relation) )
		#throw new Exception("Review this method please (tipo is not set)", 1);
		return self::get_tipo_by_id($caller_id, $table='matrix');
		
		#$section_obj = new section($caller_id);
		#$caller_tipo = $section_obj->get_tipo();
		#return $caller_tipo;
		
	}
	*/


	/**
	* GET_CONTEXT
	*/
	public function get_context() {
		$context 				= $this->context;
		if (!empty($_REQUEST['context']) && empty($context)) {
			$context 			= $_REQUEST['context'];
		}
		if (empty($context)) {
			$context 			= 'default';
		}
		return $context;
	}



	/**
	* GET_AR_ALL_LANGS : Return array of all langs of all proyects in Dédalo
	* @see section->get_ar_all_project_langs() (for all langs of current project)
	* @return array like (lg-eng,lg-spa) or resolved (lg-eng => English, lg-spa => Spanish)
	*/
	public static function get_ar_all_langs($resolve_termino=true) {
		
		#return unserialize(DEDALO_APPLICATION_LANGS);
		if(SHOW_DEBUG) $start_time = start_time();

		if($resolve_termino) {
			$idu = 1;
		}else{
			$idu = 0;
		}

		if(isset($_SESSION['config4']['ar_all_langs'][$idu])) return $_SESSION['config4']['ar_all_langs'][$idu];

		$ar_all_langs = array();

		# PROJECTS : Get all projects id from matrix		
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'id';
		$arguments['parent']			= 0;
		$arguments['tipo']				= DEDALO_SECTION_PROJECTS_TIPO;
		$matrix_table 					= common::get_matrix_table_from_tipo(DEDALO_SECTION_PROJECTS_TIPO);
		$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
		$ar_records						= $RecordObj_matrix->search($arguments);
			#dump($ar_records,'ar_records');

		# LANGS : Get all langs of every project
		foreach ($ar_records as $current_section_id) {
			$section 				= new section($current_section_id,DEDALO_SECTION_PROJECTS_TIPO);
			$ar_all_project_langs 	= $section->get_ar_all_project_langs();
				#dump($ar_all_project_langs,'$ar_all_project_langs');
			
			$ar_all_langs = array_merge($ar_all_langs, $ar_all_project_langs);
		}

		# AR_LANGS : Remove duplicates
		$ar_all_langs = array_unique($ar_all_langs);
			#dump($ar_all_langs,'$ar_all_langs');

		# TERMINO : on true resolve name
		if ($resolve_termino===true) {
			foreach ($ar_all_langs as $current_lang_tipo) {
				$ar_all_langs_final[$current_lang_tipo] = RecordObj_ts::get_termino_by_tipo($current_lang_tipo);
			}
			# Overwrite var 
			$ar_all_langs = $ar_all_langs_final;
		}
		#dump($ar_all_langs,'$ar_all_langs');

		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $ar_all_langs);
			#dump( exec_time($start_time, __METHOD__, $ar_all_langs) , 'exec_time');
			error_log(exec_time($start_time, __METHOD__, $ar_all_langs));
		}

		$_SESSION['config4']['ar_all_langs'][$idu] = $ar_all_langs;

		return $ar_all_langs;
	}



	/**
	* GET_MAIN_SECTION_ID
	*/
	public static function get_main_section_id_XXX_DES( $parent ) {

		$RecordObj_matrix 	= new RecordObj_matrix($parent);
		$parent2 			= $RecordObj_matrix->get_parent();

		if($parent2==0) return $parent;

		return self::get_main_section_id( $parent2 );
	}

	# GET_PROPIEDADES : Alias of $this->RecordObj_ts->get_propiedades() but json decoded
	public function get_propiedades() {
		return json_handler::decode($this->RecordObj_ts->get_propiedades());
	}
	/**
	* GET_ELEMENT_ADITIONAL_CSS . En pruebas
	* Obtiene css específico desde el campo 'propiedades' del componente actual
	* en formato string separado pos espacios, como 'text-area-notacion notacion-libre '
	* Formato json en estructura:
	*	{
	*	"css":["text-area-notacion","notacion-libre"]
	*	}
	*/
	public function get_element_aditional_css() {

		$aditional_css=null;

		$propiedades = $this->get_propiedades();
			#dump($propiedades->css);
		if(isset($propiedades->css)) foreach ($propiedades->css as $current_css) {
			$aditional_css .= ' '.$current_css;
		}
		#dump($aditional_css,'aditional_css ');
		return $aditional_css;
	}

	/**
	* GET_RELACIONES : Obtiene las relaciones del tipo del componente actual decodificandop el json de '$this->RecordObj_ts->get_relaciones()'
	*/
	public function get_relaciones() {

		$relaciones = $this->RecordObj_ts->get_relaciones();
		return (array)$relaciones[0];
	}
		


}#end class
?>