<?php
/**
* COMMON (ABSTRACT CLASS)
* Métodos compartidos por todos los componentes y secciones
* declarar los métodos public
*/
abstract class common {
	
	# permissions. int value from 0 to 3
	public $permissions;

	# ar_loaded_modelos_name. List of all components/sections modelo name used in current page (without duplicates). Used to determine
	# the css and css files to load
	static $ar_loaded_modelos_name = array();
	
	# identificador_unico. UID used to set dom elements id unic bsen on section_tipo, section_id, lang, modo, etc.
	public $identificador_unico;
	# variant. Modifier of identificador_unico
	public $variant;

	# bl_loaded_structure_data. Set to true when element structure data is loaded. Avoid reload structure data again
	protected $bl_loaded_structure_data;
	#bl_loaded_matrix_data. Set to true when element matrix data is loaded. Avoid reconnect to db data again
	protected $bl_loaded_matrix_data;

	# TABLE  matrix_table
	#public $matrix_table;

	# context. Object with information about context of current element
	public $context;

	# public propiedades
	public $propiedades;
	
	# REQUIRED METHODS
	#abstract protected function define_id($id);
	#abstract protected function define_tipo();
	#abstract protected function define_lang();
	#abstract public function get_html();

	# ACCESSORS
	final public function __call($strFunction, $arArguments) {
		
		$strMethodType 		= substr($strFunction, 0, 4); # like set or get_
		$strMethodMember 	= substr($strFunction, 4);
		switch($strMethodType) {
			case 'set_' :
				if(!isset($arArguments[0])) return(false);	#throw new Exception("Error Processing Request: called $strFunction without arguments", 1);
				return($this->SetAccessor($strMethodMember, $arArguments[0]));
				break;
			case 'get_' :
				return($this->GetAccessor($strMethodMember));
				break;
		}
		return(false);
	}
	# SET
	final private function SetAccessor($strMember, $strNewValue) {
		
		if(property_exists($this, $strMember)) {
			$this->$strMember = $strNewValue;			
		}else{
			return(false);
		}
	}
	# GET
	final private function GetAccessor($strMember) {
		
		if(property_exists($this, $strMember)) {
			$strRetVal = $this->$strMember;
			# stripslashes text values
			#if(is_string($strRetVal)) $strRetVal = stripslashes($strRetVal);
			return($strRetVal);
		}else{
			return(false);
		}
	}	
	


	/**
	* GET_PERMISSIONS
	* @param string $tipo
	* @return int $permissions
	*/
	public static function get_permissions( $tipo=null, $sub_tipo=null ) {
		
		if(login::is_logged()!==true)
			return 0;

		if( empty($tipo) ) {
			if(SHOW_DEBUG===true) {
				dump($tipo,'tipo');
				throw new Exception("Error Processing Request. get_permissions: tipo is empty", 1);
			}			
			#die("Error Processing Request. get_permissions: tipo is empty");
			debug_log(__METHOD__." Error Processing Request. get_permissions: tipo is empty ".to_string(), logger::ERROR);
			return 0;
		}		
		if( empty($sub_tipo) ) {
			if(SHOW_DEBUG===true) {
				dump($sub_tipo,'sub_tipo');
				throw new Exception("Error Processing Request. get_permissions: sub_tipo is empty", 1);
			}			
			#die("Error Processing Request. get_permissions: sub_tipo is empty");
			debug_log(__METHOD__." Error Processing Request. get_permissions: sub_tipo is empty ".to_string(), logger::ERROR);
			return 0;
		}
		$permissions = security::get_security_permissions($tipo, $sub_tipo);
			
						
		return (int)$permissions;
	}//end get_permissions



	/**
	* SET_PERMISSIONS
	*/
	public function set_permissions( $number ) {
		$this->permissions = (int)$number;
	}
	
	
	
	/**
	* LOAD STRUCTURE DATA
	* Get data once from structure (tipo, modelo, norden, estraducible, etc.) 
	*/
	protected function load_structure_data() {
		
		if( empty($this->tipo) ) {
			dump($this,"");
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
			$this->modelo	= $this->RecordObj_dd->get_modelo();
			$this->norden	= $this->RecordObj_dd->get_norden();
			$this->required	= $this->RecordObj_dd->get_usableIndex();

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
			$this->label = RecordObj_dd::get_termino_by_tipo($this->tipo,DEDALO_APPLICATION_LANG,true);		#echo 'DEDALO_APPLICATION_LANG: '.DEDALO_APPLICATION_LANG ;#var_dump($this->label);	#die();
			

			# TRADUCIBLE
			$this->traducible = $this->RecordObj_dd->get_traducible();
			# Si el elemento no es traducible, fijamos su 'lang' en 'lg-nolan' (DEDALO_DATA_NOLAN)
			if ($this->traducible==='no') {
				$this->fix_language_nolan();
			}

			# PROPIEDADES : Always JSON decoded
			#dump($this->RecordObj_dd->get_propiedades()," ");
			$propiedades = $this->RecordObj_dd->get_propiedades();
			$this->propiedades = !empty($propiedades) ? json_handler::decode($propiedades) : false;

			# MATRIX_TABLE
			#if(!isset($this->matrix_table))
			#$this->matrix_table = self::get_matrix_table_from_tipo($this->tipo);
			
			# NOTIFY : Notificamos la carga del elemento a common
			$modelo_name = get_called_class();	
			common::notify_load_lib_element_tipo($modelo_name, $this->modo);
			
			# BL_LOADED_STRUCTURE_DATA
			$this->bl_loaded_structure_data = true;
		}
	}//end load_structure_data



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
			
			$matrix_table 		= common::get_matrix_table_from_tipo($this->section_tipo);
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
	* @param string $tipo
	* @return string $matrix_table
	*/
	public static function get_matrix_table_from_tipo($tipo) {
		
		if (empty($tipo)) {			
			trigger_error("Error Processing Request. tipo is empty");
			return false;
		}elseif ($tipo==='matrix') {
			trigger_error("Error Processing Request. tipo is invalid (tipo:$tipo)");
			return false;
		}

		static $matrix_table_from_tipo;
		
		if(isset($matrix_table_from_tipo[$tipo])) {
			return($matrix_table_from_tipo[$tipo]);
		}
		
		#if(SHOW_DEBUG===true) $start_time = start_time();		

		# Default value:
		$matrix_table = 'matrix';

		$modelo_name  = RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
			if (empty($modelo_name)) {
				debug_log(__METHOD__." Current tipo ($tipo) modelo name is empty. Default table 'matrix' was used.".to_string(), logger::DEBUG);
			}

		if ($modelo_name==='section') {

			# SECTION CASE
			switch (true) {
				case ($tipo===DEDALO_SECTION_PROJECTS_TIPO):
					$matrix_table = 'matrix_projects';
					#error_log("Error. Table for section projects tipo is not defined. Unsing default table: '$matrix_table'");
					break;
				case ($tipo===DEDALO_SECTION_USERS_TIPO):
					$matrix_table = 'matrix_users';
					#error_log("Error. Table for section users tipo is not defined. Unsing default table: '$matrix_table'");
					break;			
				default:

					$table_is_resolved = false;

					# SECTION : If section have TR of model name 'matrix_table' takes its matrix_table value
					$ar_related = common::get_ar_related_by_model('matrix_table', $tipo);
					if ( isset($ar_related[0]) ) {
						// REAL OR VIRTUAL SECTION						
						# Set custom matrix table
						$matrix_table = RecordObj_dd::get_termino_by_tipo($ar_related[0],null,true);
							#if (SHOW_DEBUG===true) dump($matrix_table,"INFO: Switched table to: $matrix_table for tipo:$tipo ");
						$table_is_resolved = true;				
					}
					// CASE VIRTUAL SECTION
					if ($table_is_resolved===false) {
						$tipo 		= section::get_section_real_tipo_static($tipo);
						$ar_related = common::get_ar_related_by_model('matrix_table', $tipo);
						if ( isset($ar_related[0]) ) {
							// REAL SECTION			
							# Set custom matrix table
							$matrix_table = RecordObj_dd::get_termino_by_tipo($ar_related[0],null,true);
								#if (SHOW_DEBUG===true) dump($matrix_table,"INFO: Switched table to: $matrix_table for tipo:$tipo ");
							$table_is_resolved = true;
						}
					}
			}//end switch
			
		}else{
			if(SHOW_DEBUG===true) {
				dump(debug_backtrace(), 'debug_backtrace() ++ '.to_string());;
			}
			throw new Exception("Error Processing Request. Not use component tipo ($tipo) to calculate matrix_table. Use always section_tipo", 1);
			
			/*
			# COMPONENT CASE
			# Heredamos la tabla de la sección parent (si la hay)
			$ar_parent_section = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($tipo, $modelo_name='section', $relation_type='parent');
			if (isset($ar_parent_section[0])) {
				$parent_section_tipo = $ar_parent_section[0];			
				$ar_related = common::get_ar_related_by_model('matrix_table', $parent_section_tipo);
				if ( isset($ar_related[0]) ) {
					# Set custom matrix table
					$matrix_table = RecordObj_dd::get_termino_by_tipo($ar_related[0],null,true);
				}
			}
			*/
		}
		#dump($matrix_table,'$matrix_table for tipo: '.$tipo);

		# Cache
		$matrix_table_from_tipo[$tipo] = $matrix_table;

		#if(SHOW_DEBUG===true) $GLOBALS['log_messages'][] = exec_time($start_time, __METHOD__, 'logger_backend_activity '.$tipo);

		return (string)$matrix_table;
	}//end get_matrix_table_from_tipo



	/**
	* GET_MATRIX_TABLES_WITH_RELATIONS
	* Note: Currently tables are static. make a connection to db to do dynamic ASAP
	* @return array $ar_tables
	*/
	public static function get_matrix_tables_with_relations() {

		static $ar_tables;

		if (isset($ar_tables)) {
			return $ar_tables;
		}

		$ar_tables = [];
		
		# Tables
		# define('DEDALO_TABLES_LIST_TIPO', 'dd627'); // Matrix tables box elements
		$ar_children_tables = RecordObj_dd::get_ar_childrens('dd627', 'norden');				
		foreach ($ar_children_tables as $table_tipo) {
			$RecordObj_dd = new RecordObj_dd( $table_tipo );
			$modelo_name  = RecordObj_dd::get_modelo_name_by_tipo($table_tipo,true);
			if ($modelo_name!=='matrix_table') {
				continue;
			}
			if( $propiedades = json_decode($RecordObj_dd->get_propiedades()) ) {
				if (property_exists($propiedades,'inverse_relations') && $propiedades->inverse_relations===true) {
					$ar_tables[] = RecordObj_dd::get_termino_by_tipo($table_tipo, DEDALO_STRUCTURE_LANG, true, false);
				}
			}			
		}
		
		if (empty($ar_tables)) {
			trigger_error("Error on read structure tables list. Old structure version < 26-01-2018 !");
			$ar_tables = [
				"matrix",
				"matrix_list",
				"matrix_activities",
				"matrix_hierarchy"
			];
		}
		#debug_log(__METHOD__." ar_tables ".json_encode($ar_tables), logger::DEBUG);
		
		
		return $ar_tables;
	}//end get_matrix_tables_with_relations



	/**
	* SET_DATO
	*/
	public function set_dato($dato){

		# UNSET previous calculated valor
		unset($this->valor);
		# UNSET previous calculated ar_list_of_values
		unset($this->ar_list_of_values);

		$this->dato = $dato;
	}//end set_dato



	/**
	* SET_LANG
	* When isset lang, valor and dato are cleaned
	* and $this->bl_loaded_matrix_data is reset to force load from database again
	*/
	public function set_lang($lang) {

		#if($lang!==DEDALO_DATA_LANG) {

			# FORCE reload dato from database when dato is requested again 
			$this->set_to_force_reload_dato();
		#}		

		$this->lang = $lang;
	}//end set_lang



	/**
	* SET_TO_FORCE_RELOAD_DATO
	*/
	public function set_to_force_reload_dato() {
		
		# UNSET previous calculated valor
		unset($this->valor);

		#$this->dato_resolved = false;
		#unset($this->dato);

		# FORCE reload dato from database when dato is requested again 
		$this->bl_loaded_matrix_data = false;
	}//end set_to_force_reload_dato


	/**
	* GET_MAIN_LANG
	* @return string $main_lang
	*/
	public static function get_main_lang( $section_tipo, $section_id=null ) {
		#dump($section_tipo, ' section_tipo ++ '.to_string());
		# Always fixed lang of languages as english
		if ($section_tipo==='lg1') {
			return 'lg-eng';
		}

		static $current_main_lang;
		$uid = $section_tipo.'_'.$section_id;
		if (isset($current_main_lang[$uid])) {
			return $current_main_lang[$uid];
		}

		# De momento, el main_lang default para todas las jerarquias será lg-spa porque es nuestra base de trabajo
		# Dado que cada section id puede tener un main_lang diferente, estudiar este caso..
		# DEDALO_HIERARCHY_SECTION_TIPO = hierarchy1
		if ($section_tipo===DEDALO_HIERARCHY_SECTION_TIPO) {

			$main_lang = 'lg-spa'; # Default for hierarchy

			if (!is_null($section_id)) {
				$section = section::get_instance($section_id, $section_tipo);
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_HIERARCHY_LANG_TIPO,true);
				$component 		= component_common::get_instance($modelo_name,
																 DEDALO_HIERARCHY_LANG_TIPO,
																 $section_id,
																 'list',
																 DEDALO_DATA_NOLAN,
																 $section_tipo);
				 $dato = $component->get_dato();
				 if (isset($dato[0])) {
				 	$lang_code = lang::get_code_from_locator($dato[0], $add_prefix=true);
				 	# dump($lang_code, ' lang_code ++ '.to_string());
				 	$main_lang = $lang_code;
				 }
			}			
		
		}else{

			#$matrix_table = common::get_matrix_table_from_tipo($section_tipo);
			#if ($matrix_table==='matrix_hierarchy') {
			#	$main_lang = hierarchy::get_main_lang( $section_tipo );
			#		dump($main_lang, ' main_lang ++ '.to_string());
			#}

			# If current section is virtual of DEDALO_THESAURUS_SECTION_TIPO, search main lang in self hierarchy
			$ar_related_section_tipo = common::get_ar_related_by_model('section', $section_tipo);
			
			switch (true) {
				
				# Thesaurus virtuals
				case (isset($ar_related_section_tipo[0]) && $ar_related_section_tipo[0]===DEDALO_THESAURUS_SECTION_TIPO):
					$main_lang = hierarchy::get_main_lang($section_tipo);
					if (empty($main_lang)) {
						debug_log(__METHOD__." Empty main_lang for section_tipo: $section_tipo using 'hierarchy::get_main_lang'. Default value fallback is used (DEDALO_DATA_LANG_DEFAULT): ".DEDALO_DATA_LANG_DEFAULT, logger::WARNING);
						#trigger_error("Empty main_lang for section_tipo: $section_tipo using 'hierarchy::get_main_lang'. Default value fallback is used (DEDALO_DATA_LANG_DEFAULT): ".DEDALO_DATA_LANG_DEFAULT);
						$main_lang = DEDALO_DATA_LANG_DEFAULT;
					}
					break;
				
				default:
					$main_lang = DEDALO_DATA_LANG_DEFAULT;
					break;
			}
		}
		#debug_log(__METHOD__." main_lang ".to_string($main_lang), logger::DEBUG);		

		$current_main_lang[$uid] = $main_lang;


		return (string)$main_lang;
	}//end get_main_lang



	/**
	* SET_DEFAULT_VALUE
	*/
	protected function set_default_value() {

	}//end set_default_value



	/**
	* GET IDENTIFICADOR UNICO
	* Se fija al hacer la primera llamada. 
	* Para sobreescribirlo, simplemente llamarlo inicialmente pasándo un string 
	*/
	public function get_identificador_unico() {

		# Nota: estaba desactivo ¿? en 25-11-2015. Cambiado portque tool_time_machine lo necesita activo (ver trigger.tool_time_machine )
		if (isset($this->identificador_unico) && $this->get_modo()==='tool_time_machine') {
		#if (isset($this->identificador_unico)) {
			return $this->identificador_unico;
		}

		#if(!empty($this->tipo)) {
		#	$permissions = common::get_permissions($this->tipo);
		#}

		$this->identificador_unico = $this->get_id().'_'.$this->get_tipo().'_'.$this->get_parent().'_'.$this->get_lang().'_'.$this->get_modo().'_'.$this->get_variant().'_'.$this->get_section_tipo();	# .'_'.mt_rand(1,999); #dump($identificador_unico);
			#$identificador_unico = $this->get_tipo() . '_' . $this->get_id() . '_' . $this->get_lang() . '_' . $this->get_modo();	#dump($identificador_unico);		
			#dump($this->identificador_unico,'$this->identificador_unico');	

		return (string)$this->identificador_unico;
	}//end get_identificador_unico



	/**
	* SET IDENTIFICADOR UNICO
	* Se fija al hacer la primera llamada. 
	*/
	public function set_identificador_unico($string) {
		$this->identificador_unico = $string;
	}

	
	
	/**
	* GET_AR_LOADED_MODELOS
	*//*
	public static function get_ar_loaded_modelos() {
		if(is_array(common::$ar_loaded_modelos)){
			#dump(common::$ar_loaded_modelos); echo "<hr>";
			return array_unique(common::$ar_loaded_modelos);
		}else{
			return common::$ar_loaded_modelos;
		}
	}//end get_ar_loaded_modelos
	*/



	/**
	* SHOW_LOADED_MODELOS
	* @return array $debug
	*//*
	public static function show_loaded_modelos() {
		
		$debug = array();
		#$ar_all_loaded_modelos = common::get_ar_all_loaded_modelos();
		$ar_all_loaded_modelos = common::$ar_loaded_modelos;		
		foreach((array)$ar_all_loaded_modelos as $modeloID) {
			$modelo_name = RecordObj_dd::get_termino_by_tipo($modeloID,null,true);
			$debug[] 	 = " $modeloID - $modelo_name ";
		}
		
		# DEBUG
		if(SHOW_DEBUG===true) {
			$_SESSION['debug_content'][__METHOD__] = to_string($debug);
		}
		
		return $debug;
	}//end show_loaded_modelos
	*/



	/**
	* NOTIFY_LOAD_LIB_ELEMENT_TIPO
	*/
	public static function notify_load_lib_element_tipo($modelo_name, $modo) {

		#if ($modo!=='edit') {
		#	return false;
		#}
			
		if (empty($modelo_name) || in_array($modelo_name, common::$ar_loaded_modelos_name)) {
			return false;
		}				
		common::$ar_loaded_modelos_name[] = $modelo_name;
		
		return true;
	}//end notify_load_lib_element_tipo
	


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
	
	
	
	# __TOSTRING
	public function __toString() {
        return 'Obj: '.get_called_class();
    }
	
	
	
	/**
	* SETVAR
	*/
	public static function setVar($name, $default=false) {

		if($name==='name') throw new Exception("Error Processing Request [setVar]: Name 'name' is invalid", 1);
		
		$$name = $default; 
		if(isset($_REQUEST[$name])) $$name = $_REQUEST[$name];
		
		if(isset($$name)) {
			
			$$name = safe_xss($$name);
						
			return $$name;
		}

		return false;
	}//end setVar



	/**
	* SETVARDATA
	* @param string $name
	* @param onject $data_obj
	*/
	public static function setVarData($name, $data_obj, $default=false) {

		if($name==='name') throw new Exception("Error Processing Request [setVarData]: Name 'name' is invalid", 1);
		
		$$name = $default; 
		if(isset($data_obj->{$name})) $$name = $data_obj->{$name};
		
		if(isset($$name)) {
			# Not sanitize here (can loose some transcriptions tags) !
			#$$name = safe_xss($$name);
						
			return $$name;
		}			

		return false;
	}//end setVar
	
	

	/**
	* GET_PAGE_QUERY_STRING . REMOVED ORDER CODE BY DEFAULT
	*/
	public static function get_page_query_string($remove_optional_vars=true) {
		
		$queryString = $_SERVER['QUERY_STRING']; # like max=10
		$queryString = safe_xss($queryString);
		
		if($remove_optional_vars === false) return $queryString;
		
		$qs 				= false ;
		$ar_optional_vars	= array('order_by','order_dir','lang','accion','pageNum');
		
		$search  		= array('&&',	'&=',	'=&',	'??',	'==');
		$replace 		= array('&',	'&',	'&',	'?',	'=' );
		$queryString 	= str_replace($search, $replace, $queryString);
		
		$posAND 	= strpos($queryString, '&');
		$posEQUAL 	= strpos($queryString, '=');
		
		# go through and rebuild the query without the optional variables
		if($posAND !== false){ # query tipo ?captacionID=1&informantID=6&list=0
			
			$ar_pares = explode('&', $queryString);		
			if(is_array($ar_pares)) foreach ($ar_pares as $key => $par){
				
				#echo " <br> $key - $par ";
				if(strpos($par,'=')!==false) {
							
					$troz		= explode('=',$par) ;
						
					$varName 	= false;	if(isset($troz[0])) $varName  = $troz[0];
					$varValue 	= false;	if(isset($troz[1])) $varValue = $troz[1];
										
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
		if(substr($qs, -1)==='&') $qs = substr($qs, 0, -1);		

		return $qs;
	}//end get_page_query_string
	


	/**
	* GET HTML CODE . RETURN INCLUDE FILE __CLASS__.PHP
	* @return string $html
	*	Get standar path file "DEDALO_LIB_BASE_PATH .'/'. $class_name .'/'. $class_name .'.php'" (ob_start)
	*	and return rendered html code
	*/
	public function get_html() {

		if(SHOW_DEBUG===true) $start_time = start_time();		
		
			# Class name is called class (ex. component_input_text), not this class (common)	
			ob_start();
			include ( DEDALO_LIB_BASE_PATH .'/'. get_called_class() .'/'. get_called_class() .'.php' );
			$html = ob_get_clean();

		if(SHOW_DEBUG===true) {
			#$GLOBALS['log_messages'][] = exec_time($start_time, __METHOD__. ' ', "html");
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}
		
		return (string)$html;
	}//end get_html



	/**
	* GET_CONTEXT
	* @return object $context
	*/
	public function get_context() {

		// Get from self object (fixed before)
		$context = $this->context;

		if (is_string($context) && empty($context)) {
			$context = $this->context = null;
		}

		// Check if is a invalid string (only objects are accepted)
		if (is_string($context)) {
			dump($context, ' context ++ '.to_string($context));
			throw new Exception("Error Processing Request. context must be an object or null (current is string)", 1);			
		}
		
		// When no is fixed in current object, search in request vars for one
		if (empty($context)) {
			
			if ($context_req = common::get_request_var('context')) {
				// Get context object from url get or input vars
				if (is_string($context_req)) {
					if(!$context = json_decode()){
						throw new Exception("Error Processing Request, Invalid context request", 1);						
					}
				}			
			}else{
				// Default context object
				$context = new stdClass();
					$context->context_name = 'default';
			}

		}//end if (empty($context))		


		return (object)$context;
	}//end get_context



	/**
	* SET_CONTEXT
	* @param mixed object | string $context
	* @return bool
	*/
	public function set_context($context) {
		if (is_string($context)) {
			$context = json_decode($context);
		}

		if (!is_object($context)) {
			$context = new stdClass();
		}

		if (!property_exists($context, 'context_name')) {
			$context->context_name = 'default';
		}

		$this->context = (object)$context;
	
		return true;
	}//end set_context



	/**
	* GET_AR_ALL_LANGS : Return array of all langs of all proyects in Dédalo
	* @return array $ar_all_langs
	*	like (lg-eng=>locator,lg-spa=>locator) or resolved (lg-eng => English, lg-spa => Spanish)
	*/
	public static function get_ar_all_langs() {

		$ar_all_langs = unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);		

		return (array)$ar_all_langs;		
	}//end get_ar_all_langs



	/**
	* GET_AR
	* @param string $lang
	*	Default DEDALO_DATA_LANG
	* @return array $ar_all_langs_resolved
	*/
	public static function get_ar_all_langs_resolved( $lang=DEDALO_DATA_LANG ) {
		
		$ar_all_langs = common::get_ar_all_langs();
	
		$ar_all_langs_resolved=array();
		foreach ((array)$ar_all_langs as $current_lang) {			
			
			$lang_name = lang::get_name_from_code( $current_lang, $lang );
			$ar_all_langs_resolved[$current_lang] = $lang_name;					
		}

		return $ar_all_langs_resolved;
	}//end get_ar_all_langs_resolved



	/**
	* GET_PROPIEDADES : Alias of $this->RecordObj_dd->get_propiedades() but json decoded
	*/
	public function get_propiedades() {

		if(isset($this->propiedades)) return $this->propiedades;

		# Read string from database str
		$propiedades = $this->RecordObj_dd->get_propiedades();

		$propiedades_obj = json_handler::decode($propiedades);

		return $propiedades_obj;
	}//end get_propiedades



	/**
	* SET_PROPIEDADES
	* @return bool
	*/
	public function set_propiedades($value) {
		if (is_string($value)) {
			$propiedades = json_decode($value);
		}else{
			$propiedades = $value;
		}

		# Fix propiedades obj
		$this->propiedades = (object)$propiedades;

		return true;
	}//end set_propiedades


	/**
	* GET_AR_RELATED_COMPONENT_TIPO
	* @return array $ar_related_component_tipo
	*/
	public function get_ar_related_component_tipo() {
		$ar_related_component_tipo=array();
		#dump($this, ' this ++ '.to_string());
		$relaciones = $this->RecordObj_dd->get_relaciones();
		if(is_array($relaciones )) {
			foreach ($relaciones as $key => $value) {
				$tipo = reset($value);
				$ar_related_component_tipo[] = $tipo;
			}
		}		

		return (array)$ar_related_component_tipo;
	}//end get_ar_related_component_tipo



	/**
	* GET_AR_RELATED_BY_MODEL
	* @return array $ar_related_by_model
	*/
	public static function get_ar_related_by_model($modelo_name, $tipo, $strict=true) {

		static $ar_related_by_model_data;
		$uid = $modelo_name.'_'.$tipo;
		if (isset($ar_related_by_model_data[$uid])) {
			return $ar_related_by_model_data[$uid];
		}

		$RecordObj_dd = new RecordObj_dd($tipo);
		$relaciones   = $RecordObj_dd->get_relaciones();

		$ar_related_by_model=array();
		foreach ((array)$relaciones as $relation) foreach ((array)$relation as $modelo_tipo => $current_tipo) {
			
			# Calcularlo desde el modelo_tipo no es seguro, ya que el modelo de un componente pude cambiar y esto no actualiza el modelo_tipo de la relación
			#$related_terms[$tipo] = RecordObj_dd::get_termino_by_tipo($modelo_tipo, DEDALO_STRUCTURE_LANG, true, false);	//$terminoID, $lang=NULL, $from_cache=false, $fallback=true
			# Calcular siempre el modelo por seguridad
			$current_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo, true);
			if ($strict===true) {
				// Default compare equal
				if ($current_modelo_name===$modelo_name) {
					$ar_related_by_model[] = $current_tipo;
				}
			}else{
				if (strpos($current_modelo_name, $modelo_name)!==false) {
					$ar_related_by_model[] = $current_tipo;
				}
			}
			
		}
		#debug_log(__METHOD__." ar_related_by_model - modelo_name:$modelo_name - tipo:$tipo - ar_related_by_model:".json_encode($ar_related_by_model), logger::DEBUG);

		$ar_related_by_model_data[$uid] = $ar_related_by_model;

		return $ar_related_by_model;
	}//end get_ar_related_by_model



	/**
	* GET_REFERENCES
	* Return all references to current dato (usually rel_locator or section_id)
	* @param object $new_options
	* @return array $ar_references
	*
	* NOTA : Se buscan (to_find) 'section_id' pero el resultado devuelto es organizado por id_matrix !!!
	*/
	public static function get_references__DEPRECATED( stdClass $new_options ) {
		$ar_references=array();

		if(SHOW_DEBUG===true) {
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
			if(SHOW_DEBUG===true) {
				#throw new Exception("Error: get_references property 'to_find' is mandatory", 1);
			}
			return $ar_references;
		}
		
		# TIPO : mandatory
		if (!$options->tipo) {
			trigger_error("Error: get_references property 'tipo' is mandatory");
			if(SHOW_DEBUG===true) {
				#throw new Exception("Error: get_references property 'tipo' is mandatory", 1);
			}
			return $ar_references;
		}
		/*
		$matrix_table = common::get_matrix_table_from_tipo($options->section_tipo);
		*/
		#$matrix_table = $options->matrix_table;
		

			#
			# REFERENCES 
			switch ($options->filter_by_modelo_name) {
				case 'component_portal':
					#$ar_portales 	 = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name('component_portal');
					$ar_portals_map = (array)component_portal::get_ar_portals_map();
					$result 		= (array)array_keys($ar_portals_map,$options->tipo);
						#dump($ar_portals_map,"ar_portals_map ");dump($result,"result ");die();

					$ar_search_tipos = $result;
					break;

				case 'component_relation';
					$ar_relaciones 	 = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name('component_relation');
					$ar_search_tipos = $ar_relaciones;
					break;

				default:
					if(SHOW_DEBUG===true) {
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
			if(SHOW_DEBUG===true) {
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
			}//end while
			
		
		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.microtime(1)]=microtime(1);
		}
		
		return (array)$ar_references;
	}//end get_references



	/**
	* GET_ALLOWED_RELATION_TYPES
	* Search in structure and return an array of tipos
	* @return array $allowed_relations
	*/
	public static function get_allowed_relation_types() {
		
		# For speed, we use constants now
		$ar_allowed = array(DEDALO_RELATION_TYPE_CHILDREN_TIPO,
							DEDALO_RELATION_TYPE_PARENT_TIPO,
							DEDALO_RELATION_TYPE_RELATED_TIPO,
							#DEDALO_RELATION_TYPE_EQUIVALENT_TIPO,
							DEDALO_RELATION_TYPE_INDEX_TIPO,
							DEDALO_RELATION_TYPE_STRUCT_TIPO,
							DEDALO_RELATION_TYPE_MODEL_TIPO,
							DEDALO_DATAFRAME_TYPE_UNCERTAINTY,
							DEDALO_DATAFRAME_TYPE_TIME,
							DEDALO_DATAFRAME_TYPE_SPACE,
							DEDALO_RELATION_TYPE_LINK,
							DEDALO_RELATION_TYPE_FILTER
							); // DEDALO_RELATION_TYPE_RECORD_TIPO
		/*
		$tipo 		  = 'dd427';
		$modelo_name  = 'relation_type';
		$relation_type= 'children';
		$ar_allowed   = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($tipo, $modelo_name, $relation_type, $search_exact=true);
		*/

		return (array)$ar_allowed;		
	}//end get_allowed_relation_types
	
	

	/**
	* TRIGGER_MANAGER
	* @param php://input
	* @return object $response
	*/
	public static function trigger_manager($request_options=false) {

		$options = new stdClass();
			$options->test_login = true;
			$options->source 	 = 'php://input';
			if($request_options!==false) {
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
			}			

		# Set JSON headers for all responses
		#header('Content-Type: application/json');
		header('Content-Type: application/json; charset=utf-8');

		# JSON_DATA
		# javascript common.get_json_data sends a stringify json object
		# this object is getted here and decoded with all ajax request vars
		if ($options->source==='GET') {
			#$str_json = json_encode($_GET);
			// Verify all get vars before json encode
			$get_obj = new stdClass();
			foreach ($_GET as $key => $value) {
				$get_obj->{$key} = safe_xss($value);
			}
			$str_json = json_encode($get_obj);
		}else{
			$str_json = file_get_contents('php://input');
		}
		if (!$json_data = json_decode($str_json)) {
			$response = new stdClass();
				$response->result 	= false;
				$response->msg 		= "Error on read php://input data";
			
			return false;
		}

		# DEDALO_MAINTENANCE_MODE
		$mode = $json_data->mode;
		if ($mode!=="Save" && $mode!=="Login") {
			if (DEDALO_MAINTENANCE_MODE===true && (isset($_SESSION['dedalo4']['auth']['user_id']) && $_SESSION['dedalo4']['auth']['user_id']!=DEDALO_SUPERUSER)) {
				debug_log(__METHOD__." Kick user ".to_string(), logger::DEBUG);
	
				# Unset user session login
				# Delete current Dédalo session
				unset($_SESSION['dedalo4']['auth']);

				# maintenance check		
				$response = new stdClass();
					$response->result 	= true;
					$response->msg 		= "Sorry, this site is under maintenace now";
				echo json_encode($response);
				#exit();
				return false;
			}
		}			
	

		# LOGGED USER CHECK. Can be disabled in options (login case)
		if($options->test_login===true && login::is_logged()!==true) {
			$response = new stdClass();
				$response->result 	= false;
				$response->msg 		= "Error. Auth error: please login [1]";
			echo json_encode($response);
			#exit();
			return false;
		}
		

		# MODE Verify
		if(empty($json_data->mode)) {
			$response = new stdClass();
				$response->result 	= false;
				$response->msg 		= "Error. mode is mandatory";
			echo json_encode($response);
			#exit();
			return false;
		}

		
		# CALL FUNCTION
		if ( function_exists($json_data->mode) ) {
			$response = (object)call_user_func($json_data->mode, $json_data);
			$json_params = null;
			if(SHOW_DEBUG===true) {
				$json_params = JSON_PRETTY_PRINT;
			}
			echo json_encode($response, $json_params);
		}else{
			$response = new stdClass();
				$response->result 	= false;
				$response->msg 		= 'Error. Request failed. json_data->mode not exists';
			echo json_encode($response);
		}

		return true;
	}//end trigger_manager



	/**
	* GET_REQUEST_VAR
	* Alias of core function get_request_var
	* @return mixed string | bool $var_value
	*/
	public static function get_request_var($var_name) {	

		return get_request_var($var_name);
	}//end get_request_var



}//end class
?>