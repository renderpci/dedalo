<?php
# COMMON (ABSTRACT CLASS)
# MÉTODOS COMPARTIDOS POR TODOS LOS COMPONENTES Y ZONAS
# DECLARAR LOS MÉTODOS PUBLIC
require_once(DEDALO_LIB_BASE_PATH . '/common/class.Accessors.php');
require_once(DEDALO_LIB_BASE_PATH . '/component_common/class.locator.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_matrix.php');



abstract class common extends Accessors {
	
	public $permissions;
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
	public static function get_permissions( $tipo=null ) {
		
		if(!login::is_logged()) {
			return false;
		}

		if( empty($tipo) ) {
			if(SHOW_DEBUG) {
				dump($tipo,tipo);
				throw new Exception("Error Processing Request. get_permissions: tipo is empty", 1);
			}			
			die("Error Processing Request. get_permissions: tipo is empty");
		}
		$security 		= new security();
		$permissions 	= (int)$security->get_security_permissions($tipo);
		if(SHOW_DEBUG) {
			#dump($permissions, 'permissions for '.$tipo, array());
		}			
						
		return $permissions;
	}
	public function set_permissions( $number ) {
		$this->permissions	= (int)$number;
	}
	
	
	
	/**
	* LOAD STRUCTURE DATA
	* Get data once from structure (tipo, modelo, norden, estraducible, etc.) 
	*/
	protected function load_structure_data() {
		
		if( empty($this->tipo) ) {
			#dump($this,"");
			throw new Exception("Error (3): tipo is mandatory!", 1);
		}


		
		if( !$this->bl_loaded_structure_data) {

			/*
			# DEDALO_CACHE_MANAGER : var
			$cache_var='get_load_structure_data_'.$this->tipo;
			if(DEDALO_CACHE_MANAGER && cache::exists($cache_var)) {
				#dump($cache_var,"COMPONENT SHOW FROM CACHE");
				$this->RecordObj_dd = unserialize(cache::get($cache_var));
				#error_log("Readed cache: $cache_var ");
			}else{
				# Creamos un nuevo objeto de estructura (tesauro)
				$this->RecordObj_dd	= new RecordObj_dd($this->tipo);

				# DEDALO_CACHE_MANAGER : Lo metemos en cache
				if(DEDALO_CACHE_MANAGER) {
					cache::set($cache_var, serialize($this->RecordObj_dd));
					#error_log("Added cache: $cache_var ");					
				}
			}			
			*/
			$this->RecordObj_dd	= new RecordObj_dd($this->tipo);		

			# Fix vars
			$this->modelo		= $this->RecordObj_dd->get_modelo();
			$this->norden		= $this->RecordObj_dd->get_norden();
			$this->required		= $this->RecordObj_dd->get_usableIndex();

			/*
			# DEDALO_CACHE_MANAGER : var
			$cache_var='get_load_structure_data_label_'.$this->tipo;
			if(DEDALO_CACHE_MANAGER && cache::exists($cache_var)) {
				#dump($cache_var,"COMPONENT SHOW FROM CACHE");
				$this->label		= cache::get($cache_var);
				#error_log("Readed cache: $cache_var ");
			}else{
				$this->label		= RecordObj_dd::get_termino_by_tipo($this->tipo, DEDALO_APPLICATION_LANG);		#echo 'DEDALO_APPLICATION_LANG: '.DEDALO_APPLICATION_LANG ;#var_dump($this->label);	#die();

				# DEDALO_CACHE_MANAGER : Lo metemos en cache
				if(DEDALO_CACHE_MANAGER) {
					cache::set($cache_var, $this->label);
					#error_log("Added cache: $cache_var ");
				}
			}
			*/
			$this->label		= RecordObj_dd::get_termino_by_tipo($this->tipo,DEDALO_APPLICATION_LANG,true);		#echo 'DEDALO_APPLICATION_LANG: '.DEDALO_APPLICATION_LANG ;#var_dump($this->label);	#die();
			

			# TRADUCIBLE
			$this->traducible	= $this->RecordObj_dd->get_traducible();
			# Si el elemento no es traducible, fijamos su 'lang' en 'lg-nolan' (DEDALO_DATA_NOLAN)
			if ($this->traducible=='no') {
				$this->fix_language_nolan();
			}

			# PROPIEDADES : Always JSON decoded
			#dump($this->RecordObj_dd->get_propiedades()," ");
			$this->propiedades =  json_handler::decode($this->RecordObj_dd->get_propiedades());
			


			# MATRIX_TABLE
			#if(!isset($this->matrix_table))
			#$this->matrix_table = self::get_matrix_table_from_tipo($this->tipo);

			
			# NOTIFY : Notificamos la carga del elemento a common			
			common::notify_load_lib_element_tipo($this->modelo, get_called_class(), $this->modo);		
			


			$this->bl_loaded_structure_data = true;
		}
	}

	/**
	* LOAD MATRIX DATA
	* Get data once from matrix about parent, dato, lang
	*//*
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
	*/

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

		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo( $tipo, true );		
		if ($modelo_name=='section') {

			# SECTION CASE
			switch (true) {
				case ($tipo==DEDALO_SECTION_PROJECTS_TIPO):
					$matrix_table = 'matrix_projects';
					#error_log("Error. Table for section projects tipo is not defined. Unsing default table: '$matrix_table'");
					break;
				case ($tipo==DEDALO_SECTION_USERS_TIPO):
					$matrix_table = 'matrix_users';
					#error_log("Error. Table for section users tipo is not defined. Unsing default table: '$matrix_table'");
					break;			
				default:
					# SECTION : If section have TR of model name 'matrix_table' takes its matrix_table value
					$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($tipo, $cache=true, $simple=true);					
					if ( isset($ar_terminos_relacionados[0]) ) {
						// REAL OR VIRTUAL SECTION 
						$modelo_name_tr = RecordObj_dd::get_modelo_name_by_tipo( $ar_terminos_relacionados[0], true );
						if($modelo_name_tr == 'matrix_table') {
							# Set custom matrix table
							$matrix_table = RecordObj_dd::get_termino_by_tipo($ar_terminos_relacionados[0],null,true);
								#if (SHOW_DEBUG) dump($matrix_table,"INFO: Switched table to: $matrix_table for tipo:$tipo ");
							$table_is_resolved = 1;
						} 
					}
					// CASE VIRTUAL SECTION
					if (!isset($table_is_resolved)) {
						$tipo = section::get_section_real_tipo_static($tipo);
						$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($tipo, $cache=true, $simple=true);
						if ( isset($ar_terminos_relacionados[0]) ) {
							// REAL SECTION
							$modelo_name_tr = RecordObj_dd::get_modelo_name_by_tipo( $ar_terminos_relacionados[0], true );
							if($modelo_name_tr == 'matrix_table') {
								# Set custom matrix table
								$matrix_table = RecordObj_dd::get_termino_by_tipo($ar_terminos_relacionados[0],null,true);
									#if (SHOW_DEBUG) dump($matrix_table,"INFO: Switched table to: $matrix_table for tipo:$tipo ");
								$table_is_resolved = 1;
							} 
						}
					}
					
			}#end switch
			
			
		}else{

			# COMPONENT CASE
			# Heredamos la tabla de la sección parent (si la hay)
			$ar_parent_section = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($tipo, $modelo_name='section', $relation_type='parent');
			if (isset($ar_parent_section[0])) {
				$parent_section_tipo = $ar_parent_section[0];	#dump($parent_section_tipo,'$parent_section_tipo');
				$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($parent_section_tipo, $cache=true, $simple=true);
				if ( isset($ar_terminos_relacionados[0]) ) {
					$modelo_name_tr = RecordObj_dd::get_modelo_name_by_tipo( $ar_terminos_relacionados[0], true );
					if($modelo_name_tr == 'matrix_table') {
						# Set custom matrix table
						$matrix_table = RecordObj_dd::get_termino_by_tipo($ar_terminos_relacionados[0],null,true);
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
		
		
		# DEPRECATED FUNCTION WARNING
		throw new Exception("Error Processing Request. DEPRECATED FUNCTION!!", 1);



		
		if(SHOW_DEBUG) {
			trigger_error("NOTA : Sería aconsejable NO utilizar esta función y despejar el tipo de la sección a partir de estructura, en lugar de desde matrix, cuando sea posible");
			dump(debug_backtrace());
			throw new Exception("Error Processing Request. DEPRECATED!!!!!", 1);			
		}		

		if(intval($id)<1) {
			throw new Exception("Error Processing Request get_tipo_by_id. id empty", 1);
		}
		
		if(empty($current_matrix_table)) {
			throw new Exception("Error Processing Request get_tipo_by_id. current_matrix_table is empty", 1);			
		}

		$arguments=array();
		$arguments['strPrimaryKeyName']	= "datos->>'section_tipo'";
		#$arguments['strPrimaryKeyName']	= "datos#>>'{section_tipo}'";
		$arguments["id"] 				= $id;
		#$arguments["datos->'section_tipo'->'components'->'$tipo'->'dato'->>'".DEDALO_DATA_LANG_DEFAULT."':!="] = 'null';
		$matrix_table			= $current_matrix_table;
		$JSON_RecordObj_matrix	= new JSON_RecordObj_matrix($matrix_table, NULL, null);
		$ar_records				= $JSON_RecordObj_matrix->search($arguments);
			#dump($ar_records,"ar_records id:$id - current_matrix_table:$current_matrix_table ".print_r($arguments,true)); #die();

		/* OLD WORLD
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'tipo';
		$arguments['id']				= $id;
		$matrix_table 					= $current_matrix_table;
		$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
		$ar_records						= $RecordObj_matrix->search($arguments);
			#dump($ar_records," ".print_r($arguments,true));
		*/
		if (!empty($ar_records[0])) {
			return $ar_records[0];
		}

		if(SHOW_DEBUG) {
			#dump(" id:$id, current_matrix_table:$current_matrix_table");
		}
		trigger_error("Error: record not found [id:$id] $current_matrix_table (get_tipo_by_id)");
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

		if (isset($this->identificador_unico)) return $this->identificador_unico;

		$permissions=null;
		if(!empty($this->tipo)) {
			$permissions = common::get_permissions($this->tipo);
		}

		$this->identificador_unico = self::get_id().'_'.self::get_tipo().'_'.self::get_parent().'_'.self::get_lang().'_'.self::get_modo().'_'.self::get_variant().'_'.$permissions.'_'.self::get_section_tipo();	# .'_'.mt_rand(1,999); #dump($identificador_unico);
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
	public static function notify_load_lib_element_tipo($tipo, $modelo_name, $modo) {
			
		if (empty($tipo) || in_array($tipo, common::$ar_loaded_modelos)) {
			return;
		}
		if(SHOW_DEBUG) {
			#dump($tipo, "modelo_name:$modelo_name - modo:$modo");
		}

		# Only different modo to 'list' notify. Except buttons
		if ($modo!='list' || strpos($modelo_name, 'button_')!==false) {
			if(SHOW_DEBUG) {
				#dump($tipo, "modelo_name:$modelo_name - modo:$modo");
			}
			common::$ar_loaded_modelos[] = $tipo;
			if(empty($modelo_name)) {
				if(SHOW_DEBUG) {
					dump($modelo_name,'modelo_name is empty for tipo: '.$tipo);
				}			
			}
			common::$ar_loaded_modelos_name[] 	= $modelo_name;
		}
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
			$modelo = RecordObj_dd::get_termino_by_tipo($modeloID,null,true);
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
	* @see RecordObj_dd::get_termino_by_tipo($tipo)
	* @return $tipo_name
	*	String like 'Proyectos'
	*/
	public function get_tipo_name() {
		$tipo 	 	= $this->get_tipo();
		$tipo_name 	= RecordObj_dd::get_termino_by_tipo($tipo,null,true);
		return $tipo_name;
	}
	
	
	
	
	# GET ARRAY CSS
	protected function get_ar_css() {
		if (isset($this->RecordObj_dd)) {
			return css::get_ar_css($this->RecordObj_dd);
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
		
		if(isset($$name))
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
			#$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' ', "html");
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
		
		#$section_obj = section::get_instance($caller_id);
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

		if(isset($_SESSION['dedalo4']['config']['ar_all_langs'][$idu])) return $_SESSION['dedalo4']['config']['ar_all_langs'][$idu];

		$ar_all_langs = array();

		# PROJECTS : Get all projects id from matrix
		# Search username
		$arguments=array();
		#$arguments['strPrimaryKeyName']		= "datos->'section_dato'->'components'->'".DEDALO_COMPONENT_PROJECT_LANGS_TIPO."'->'dato'->>'lg-nolan'";
		#$arguments["datos#>>'{section_tipo}'"]	= DEDALO_SECTION_PROJECTS_TIPO;
		$arguments["section_tipo"]				= DEDALO_SECTION_PROJECTS_TIPO;
		$matrix_table 							= common::get_matrix_table_from_tipo(DEDALO_SECTION_PROJECTS_TIPO);
		$JSON_RecordObj_matrix					= new JSON_RecordObj_matrix($matrix_table,NULL,DEDALO_SECTION_PROJECTS_TIPO);
		$ar_result								= (array)$JSON_RecordObj_matrix->search($arguments);
			#dump($arguments, ' ar_result ');

		# Case 0 projects (clean intalled version)
		if (empty($ar_result)) {
			$ar_all_langs = unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);			
		}else{
			foreach ($ar_result as $current_section_id) {
				#dump(DEDALO_SECTION_PROJECTS_TIPO," DEDALO_SECTION_PROJECTS_TIPO");dd267
				#$component_project_langs = new component_project_langs(DEDALO_COMPONENT_PROJECT_LANGS_TIPO,$current_section_id);
				$component_project_langs = component_common::get_instance('component_project_langs', DEDALO_COMPONENT_PROJECT_LANGS_TIPO, $current_section_id, 'edit', DEDALO_DATA_NOLAN, DEDALO_SECTION_PROJECTS_TIPO);
				$dato 					 = (array)$component_project_langs->get_dato();
					#dump($dato,"dato - $current_section_id - ".DEDALO_COMPONENT_PROJECT_LANGS_TIPO);
				foreach ($dato as $current_lang) {
					if(!in_array($current_lang, $ar_all_langs)) $ar_all_langs[] = $current_lang;
				}
			}
		}
		

		# TERMINO : on true resolve name
		if ($resolve_termino===true) {
			foreach ($ar_all_langs as $current_lang_tipo) {
				$ar_all_langs_final[$current_lang_tipo] = RecordObj_ts::get_termino_by_tipo($current_lang_tipo,null,true);
			}
			# Overwrite var 
			$ar_all_langs = $ar_all_langs_final;
		}
		#dump($ar_all_langs,'$ar_all_langs');

		if(SHOW_DEBUG) {
			#$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $ar_all_langs);
			#dump( exec_time($start_time, __METHOD__, $ar_all_langs) , 'exec_time');
			#error_log(exec_time($start_time, __METHOD__, $ar_all_langs));
		}

		$_SESSION['dedalo4']['config']['ar_all_langs'][$idu] = $ar_all_langs;
	
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

	# GET_PROPIEDADES : Alias of $this->RecordObj_dd->get_propiedades() but json decoded
	public function get_propiedades() {
		$propiedades = $this->RecordObj_dd->get_propiedades();
		if (!is_string($propiedades)) {
			#dump($this," ");
		}else{
			return json_handler::decode($propiedades);
		}		
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
	* GET_RELACIONES : Obtiene las relaciones del tipo del componente actual decodificandop el json de '$this->RecordObj_dd->get_relaciones()'
	*/
	public function get_relaciones() {
		$relaciones = $this->RecordObj_dd->get_relaciones();
		
		if(SHOW_DEBUG && strpos(DEDALO_HOST, 'localhost')!==false) {
			error_log("Common get relaciones usado. Fijar esto ASAP porque sólo devuelve la primera");;
		}
		
		return (array)$relaciones[0];
	}



	/**
	* GET_REFERENCES
	* Return all references to current dato (usually rel_locator or section_id)
	* @param object $new_options
	* @return array $ar_references
	*
	* NOTA : Se buscan (to_find) 'section_id' pero el resultado devuelto es organizado por id_matrix !!!
	*/
	public static function get_references( stdClass $new_options ) {
		$ar_references=array();

		if(SHOW_DEBUG) {
			$star_time = microtime(1);
			global$TIMER;$TIMER[__METHOD__.'_IN_'.microtime(1)]=microtime(1);
		}

		$options = new stdClass();
			$options->to_find 				= false;
			$options->matrix_table 			= 'matrix';
			$options->filter_by_modelo_name = false;
			$options->tipo 					= false;		

		# NEW_OPTIONS : overwrite options defaults
		foreach ((object)$new_options as $key => $value) {
			# Si la propiedad recibida en el array new_options existe en options, la sobreescribimos			
			if (property_exists($options, $key)) {
				$options->$key = $value;
				#dump($value, "key: $key changed from ", array());
			}
		}
		#dump($options,"options"); dump($new_options,"new_options");die();

		# TO_FIND : madatory		
		if (!$options->to_find) {
			trigger_error("Error: get_references property 'to_find' is mandatory");
			if(SHOW_DEBUG) {
				#throw new Exception("Error: get_references property 'to_find' is mandatory", 1);				
			}
			return $ar_references;
		}
		
		# TIPO : mandatory
		if (!$options->tipo) {
			trigger_error("Error: get_references property 'tipo' is mandatory");
			if(SHOW_DEBUG) {
				#throw new Exception("Error: get_references property 'tipo' is mandatory", 1);				
			}
			return $ar_references;
		}
		/*
		$matrix_table = common::get_matrix_table_from_tipo($options->tipo);
		*/
		#$matrix_table = $options->matrix_table;
		

			#
			# REFERENCES 
			switch ($options->filter_by_modelo_name) {
				case 'component_portal':
					#$ar_portales 	 = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name('component_portal');
					$ar_portals_map = component_portal::get_ar_portals_map();
					$result 		= (array)array_keys($ar_portals_map,$options->tipo);
						#dump($ar_portals_map,"ar_portals_map ");dump($result,"result ");die();

					$ar_search_tipos = $result;
					break;

				case 'component_relation';
					$ar_relaciones 	 = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name('component_relation');
					$ar_search_tipos = $ar_relaciones;
					break;

				default:
					if(SHOW_DEBUG) {
						error_log("Warning: No usar este modo!!!!!");
					}
					$ar_portales 	 = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name('component_portal');
					$ar_relaciones 	 = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name('component_relation');
					$ar_search_tipos = (array)array_merge($ar_portales,$ar_relaciones);
					break;
			}
			#dump($ar_search_tipos,"ar_search_tipos [".$options->filter_by_modelo_name."] total: ".round(microtime(1)-$star_time,3));die();
			#dump($options->to_find, '$options->to_find', array());die();

			if (empty($ar_search_tipos)) {
				return array();
			}

			# QUERY SQL
			$indexes_code='';
			#$strQuery='-- '.__METHOD__."\nSELECT id, datos#>>'{section_tipo}' as section_tipo \nFROM matrix WHERE \n";
			$strQuery='-- '.__METHOD__."\nSELECT id, section_tipo \nFROM matrix WHERE \n";
			foreach ($ar_search_tipos as $current_tipo) {
				
				$strQuery.= "datos@>'{\"components\":{\"$current_tipo\":{\"dato\":{\"lg-nolan\":[{\"section_id\":\"{$options->to_find}\"}]}}}}'::jsonb ";

				if($current_tipo!=end($ar_search_tipos)) $strQuery.= "OR \n"; else $strQuery.= "\n";

				/*
				$indexes_code .= "
				CREATE INDEX matrix_dedalo_portal_{$current_tipo}_2
				  ON matrix						  
				  ((datos #>> '{components, $current_tipo,dato,lg-nolan}'));
				  ";				
				 $indexes_code .= "
				--drop INDEX matrix_dedalo_portal_{$current_tipo}_2 ; ";
				*/
			}
			if(SHOW_DEBUG) {
				#dump($options->to_find,"strQuery total: total ".round(microtime(1)-$star_time,3).print_r($strQuery,true));	
				#dump(null,"indexes_code ".print_r($indexes_code,true));
				#dump($strQuery,"strQuery ".print_r($strQuery,true));die();	
			}			
			$result	= JSON_RecordObj_matrix::search_free($strQuery);
		
			$ar_id=array();
			while ($rows = pg_fetch_assoc($result)) {

				# AR_REFERENCES
				$id 			= $rows['id'];
				$section_tipo	= $rows['section_tipo'];
				
				$ar_references[$id] = $section_tipo;

			}#end while
			#dump($ar_references,"ar_references total: ".round(microtime(1)-$star_time,3));
		
		if(SHOW_DEBUG) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.microtime(1)]=microtime(1);
		}
		
		return (array)$ar_references;
		
	}#end get_references
		


}#end class
?>