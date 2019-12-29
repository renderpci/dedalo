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


	// temporal excluded/mapped models
		public static $ar_temp_map_models = [
			// map to => old model
			'component_autocomplete' =>'component_autocomplete_hi',
			'section_group' 		 =>'section_group_div'
		];
		public static $ar_temp_exclude_models = [
			'component_state',
			'component_info',
			'component_pdf',
			'component_password',
			'component_security_areas'
			//'component_filter_records'
		];



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
	public static function get_permissions( $parent_tipo=null, $tipo=null ) {

		if(login::is_logged()!==true)
			return 0;

		if( empty($parent_tipo) ) {
			if(SHOW_DEBUG===true) {
				dump($parent_tipo,'parent_tipo');
				throw new Exception("Error Processing Request. get_permissions: parent_tipo is empty", 1);
			}
			#die("Error Processing Request. get_permissions: tipo is empty");
			debug_log(__METHOD__." Error Processing Request. get_permissions: tipo is empty ".to_string(), logger::ERROR);
			return 0;
		}
		if( empty($tipo) ) {
			if(SHOW_DEBUG===true) {
				dump($tipo,'tipo');
				throw new Exception("Error Processing Request. get_permissions: tipo is empty", 1);
			}
			#die("Error Processing Request. get_permissions: tipo is empty");
			debug_log(__METHOD__." Error Processing Request. get_permissions: tipo is empty ".to_string(), logger::ERROR);
			return 0;
		}
		$permissions = security::get_security_permissions($parent_tipo, $tipo);


		return (int)$permissions;
	}//end get_permissions



	/**
	* SET_PERMISSIONS
	*/
	public function set_permissions( $number ) {
		$this->permissions = (int)$number;
	}//end set_permissions



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

			$this->RecordObj_dd	= new RecordObj_dd($this->tipo);

			# Fix vars
			$this->modelo	= $this->RecordObj_dd->get_modelo();
			$this->norden	= $this->RecordObj_dd->get_norden();
			$this->required	= $this->RecordObj_dd->get_usableIndex();


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

		# Nota: estaba desactivo ¿? en 25-11-2015. Cambiado porque tool_time_machine lo necesita activo (ver trigger.tool_time_machine )
		if (isset($this->identificador_unico) && $this->get_modo()==='tool_time_machine') {
			return $this->identificador_unico;
		}

		$id 			= $this->get_id();
		$tipo 			= $this->get_tipo();
		$parent 		= $this->get_parent();
		$lang 			= $this->get_lang();
		$modo 			= $this->get_modo();
		$variant 		= $this->get_variant();
		$section_tipo 	= $this->get_section_tipo();

		$this->identificador_unico = $id.'_'.$tipo.'_'.$parent.'_'.$lang.'_'.$modo.'_'.$variant.'_'.$section_tipo;

		// Allow show more than one component with same tipo in search mode creating unique uid for each one
		if ($modo==='search') {
			$time_suffix = microtime(false);
			$this->identificador_unico = $this->identificador_unico .'_'. str_replace(['.',' '], '', $time_suffix);
		}

		return (string)$this->identificador_unico;
	}//end get_identificador_unico



	/**
	* SET IDENTIFICADOR UNICO
	* Se fija al hacer la primera llamada.
	*/
	public function set_identificador_unico($string) {
		$this->identificador_unico = $string;
	}//end set_identificador_unico



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
	*	Get standar path file "DEDALO_CORE_PATH .'/'. $class_name .'/'. $class_name .'.php'" (ob_start)
	*	and return rendered html code
	*/
	public function get_html() {

		if(SHOW_DEBUG===true) $start_time = start_time();

			# Class name is called class (ex. component_input_text), not this class (common)
			ob_start();
			include ( DEDALO_CORE_PATH .'/'. get_called_class() .'/'. get_called_class() .'.php' );
			$html = ob_get_clean();

		if(SHOW_DEBUG===true) {
			#$GLOBALS['log_messages'][] = exec_time($start_time, __METHOD__. ' ', "html");
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		return (string)$html;
	}//end get_html


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
				$response->msg 		= 'Error. Request failed. json_data->mode not exists: '.to_string($json_data->mode);
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



	/**
	* GET_COOKIE_PROPERTIES
	* @return object $cookie_properties
	* Calculate safe cookie properties to use on set/delete http cookies
	*/
	public static function get_cookie_properties() {

		# Cookie properties
		$domain 	= $_SERVER['SERVER_NAME'];
		$secure 	= stripos( $_SERVER['SERVER_PROTOCOL'],'https') === true ? 'true' : 'false';
		$httponly 	= 'true'; # Not accessible for javascript, only for http/s requests

		$cookie_properties = new stdClass();
			$cookie_properties->domain 	 = $domain;
			$cookie_properties->secure 	 = $secure;
			$cookie_properties->httponly = $httponly;

		return $cookie_properties;
	}//end get_cookie_properties



	/**
	* GET_CLIENT_IP
	* @return string $ipaddress
	*/
	public static function get_client_ip() {

		$ipaddress = '';
		if (isset($_SERVER['HTTP_CLIENT_IP']))
			$ipaddress = $_SERVER['HTTP_CLIENT_IP'];
		else if(isset($_SERVER['HTTP_X_FORWARDED_FOR']))
			$ipaddress = $_SERVER['HTTP_X_FORWARDED_FOR'];
		else if(isset($_SERVER['HTTP_X_FORWARDED']))
			$ipaddress = $_SERVER['HTTP_X_FORWARDED'];
		else if(isset($_SERVER['HTTP_FORWARDED_FOR']))
			$ipaddress = $_SERVER['HTTP_FORWARDED_FOR'];
		else if(isset($_SERVER['HTTP_FORWARDED']))
			$ipaddress = $_SERVER['HTTP_FORWARDED'];
		else if(isset($_SERVER['REMOTE_ADDR']))
			$ipaddress = $_SERVER['REMOTE_ADDR'];
		else
			$ipaddress = 'UNKNOWN';

		return $ipaddress;
	}//end get_client_ip



	/**
	* TRUNCATE_TEXT
	* Multibyte truncate or trim text
	*/
	public static function truncate_text($string, $limit, $break=" ", $pad='...') {

		// returns with no change if string is shorter than $limit
			$str_len = mb_strlen($string, '8bit');
			if($str_len <= $limit) {
				return $string;
			}
		// substring multibyte
			$string_fragment = mb_substr($string, 0, $limit);

		// cut fragment by break char (if is possible)
			if(false !== ($breakpoint = mb_strrpos($string_fragment, $break))) {
				$final_string = mb_substr($string_fragment, 0, $breakpoint);
			}else{
				$final_string = $string_fragment;
			}

		return $final_string . $pad;
	}//end truncate_text



	/**
	* TRUNCATE_HTML
	* Thanks to Søren Løvborg (printTruncated)
	*/
	public static function truncate_html($maxLength, $html, $isUtf8=true) {
	    $printedLength = 0;
	    $position = 0;
	    $tags = array();

	    $full_text = '';

	    // For UTF-8, we need to count multibyte sequences as one character.
	    $re = $isUtf8
	        ? '{</?([a-z]+)[^>]*>|&#?[a-zA-Z0-9]+;|[\x80-\xFF][\x80-\xBF]*}'
	        : '{</?([a-z]+)[^>]*>|&#?[a-zA-Z0-9]+;}';

	    while ($printedLength < $maxLength && preg_match($re, $html, $match, PREG_OFFSET_CAPTURE, $position))
	    {
	        list($tag, $tagPosition) = $match[0];

	        // Print text leading up to the tag.
	        $str = substr($html, $position, $tagPosition - $position);
	        if ($printedLength + strlen($str) > $maxLength)
	        {
	            #print(substr($str, 0, $maxLength - $printedLength));
	            $full_text .= substr($str, 0, $maxLength - $printedLength);
	            $printedLength = $maxLength;
	            break;
	        }

	        #print($str);
	        $full_text .= $str;
	        $printedLength += strlen($str);
	        if ($printedLength >= $maxLength) break;

	        if ($tag[0] === '&' || ord($tag) >= 0x80)
	        {
	            // Pass the entity or UTF-8 multibyte sequence through unchanged.
	            #print($tag);
	            $full_text .= $tag;
	            $printedLength++;
	        }
	        else
	        {
	            // Handle the tag.
	            $tagName = $match[1][0];
	            if ($tag[1] === '/')
	            {
	                // This is a closing tag.

	                $openingTag = array_pop($tags);
					//assert($openingTag === $tagName); // check that tags are properly nested.

	                #print($tag);
	                $full_text .= $tag;
	            }
	            else if ($tag[strlen($tag) - 2] === '/')
	            {
	                // Self-closing tag.
	                #print($tag);
	                $full_text .= $tag;
	            }
	            else
	            {
	                // Opening tag.
	                #print($tag);
	                $full_text .= $tag;
	                $tags[] = $tagName;
	            }
	        }

	        // Continue after the tag.
	        $position = $tagPosition + strlen($tag);
	    }

	    // Print any remaining text.
	    if ($printedLength < $maxLength && $position < strlen($html))
	        #print(substr($html, $position, $maxLength - $printedLength));
	    	$full_text .= substr($html, $position, $maxLength - $printedLength);

	    // Close any open tags.
	    while (!empty($tags)) {
	        #printf('</%s>', array_pop($tags));
	        $full_text .= sprintf('</%s>', array_pop($tags));
	    }

	    return $full_text;
	}//end truncate_html



	/**
	* BUILD_ELEMENT_JSON_OUTPUT
	* Simply group context and data into a ¡n object and encode as JSON string
	* @param object $context
	* @param object $data
	* @return string $result
	*/
	public static function build_element_json_output($context, $data=[]) {

		$element = new stdClass();
			$element->context = $context;
			$element->data 	  = $data;

		#if(SHOW_DEBUG===true) {
		#	$result = json_encode($element, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
		#}else{
		#	$result = json_encode($element, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
		#}
		$result = $element;

		return $result;
	}//end build_element_json_output



	/**
	* GET_JSON
	* @param object $request_options
	* 	Optional. Default is false
	* @return array $json
	*	Array of objects with data and context (configurable)
	*/
	public function get_json($request_options=false) {

		// Debug
			if(SHOW_DEBUG===true) $start_time = start_time();

		// options parse
			$options = new stdClass();
				$options->get_context 		= true;
				$options->context_type 		= 'default';
				$options->get_data 			= true;
				$options->get_sqo_context 	= false;
				if($request_options!==false) foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$called_model = get_class($this); // get_called_class(); // static::class
			$called_tipo  = $this->get_tipo();

		// path. Class name is called class (ex. component_input_text), not this class (common)
			$path = DEDALO_CORE_PATH .'/'. $called_model .'/'. $called_model .'_json.php';

		// controller include
			$json = include( $path );

		// Debug
			if(SHOW_DEBUG===true) {
				$exec_time = exec_time_unit($start_time,'ms')." ms";
				#$element = json_decode($json);
				#	$element->debug = new stdClass();
				#	$element->debug->exec_time = $exec_time;
				#$json = json_encode($element, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
				$json->debug = new stdClass();
					$json->debug->exec_time = $exec_time;

					if (strpos($called_model, 'component_')!==false && $options->get_data===true && !empty($json->data)) { //

						$current = reset($json->data);
							$current->debug_time_json 	= $exec_time;
							$current->debug_model 		= $called_model;
							$current->debug_label 		= $this->get_label();
							$current->debug_mode 		= $this->get_modo();
						#$bt = debug_backtrace()[0];
						#	dump($json->data, ' json->data ++ '.to_string($bt));
					}
			}

		return $json;
	}//end get_json



	/**
	* GET_STRUCTURE_CONTEXT
	* @return object $dd_object
	*/
	public function get_structure_context($permissions=0, $sqo_object=false) {

		// class called (model name too like component_input_text)
			#$called_model = get_called_class();
			$called_model = get_class($this);

		// sort vars
			$tipo 		  = $this->get_tipo();
			$section_tipo = $this->get_section_tipo();
			$translatable = $this->RecordObj_dd->get_traducible()==='si' ? true : false;
			$mode 		  = $this->get_modo();
			$label 		  = $this->get_label();
			$lang		  = $this->get_lang();

		// properties
			$properties   = $this->get_propiedades();
			if (empty($properties)) {
				$properties = new stdClass();
			}

		// css
			$css = new stdClass();
			if (isset($properties->css)) {
				$css = $properties->css;
				// remove from propoerties object
				unset($properties->css);
			}

		// parent
			// 1 . From requested context
			if (isset(dd_core_api::$ar_dd_objects)) {

			 	$request_dd_object = array_reduce(dd_core_api::$ar_dd_objects, function($carry, $item) use($tipo, $section_tipo){
					if ($item->tipo===$tipo && $item->section_tipo===$section_tipo) {
						return $item;
					}
					return $carry;
				});
				if (!empty($request_dd_object->parent)) {
					// set
					$parent = $request_dd_object->parent;
				}
			}

			// 2 . From injected 'from_parent'
			if (!isset($parent) && isset($this->from_parent)) {
				// injected by the element
				$parent = $this->from_parent;
			}

			// 3 . From structure (fallback)
			if (!isset($parent)) {
				// default
				if($called_model === 'section'){
					$parent = $this->get_section_tipo();
				}else{
					$parent = $this->RecordObj_dd->get_parent();
				}

			}

		// tools
			$tools = array_map(function($item){

				$label = array_reduce($item->label, function($carry, $el){
					return ($el->lang===DEDALO_DATA_LANG) ? $el->value : $carry;
				}, null);
				//dump($label, ' label ++ '.to_string());

				$tool = new stdClass();
					$tool->section_id 	= $item->section_id;
					$tool->section_tipo = $item->section_tipo;
					$tool->name  		= $item->name;
					$tool->label 		= $label;
					$tool->icon 		= DEDALO_CORE_URL . '/tools/' . $item->name . '/img/icon.svg';
					$tool->show_in_inspector = $item->show_in_inspector;
					$tool->show_in_component = $item->show_in_component;

				return $tool;
			}, $this->get_tools());


		// sqo_context
			if($sqo_object===true){
			 	$sqo_context = $this->get_sqo_context();
				if ($sqo_context===false || is_null($sqo_context)) {
				 	$sqo_context = [];
				 }
			}else{
				$sqo_context = null;
			}

		// dd_object
			$dd_object = new dd_object((object)[
				'label' 		=> $label, // *
				'tipo' 			=> $tipo,
				'section_tipo' 	=> $section_tipo, // *
				'model' 		=> $called_model, // *
				'parent' 		=> $parent, // *
				'lang' 			=> $lang,
				'mode' 			=> $mode,
				'translatable' 	=> $translatable,
				'properties' 	=> $properties,
				'css'			=> $css,
				'permissions'	=> $permissions,
				'tools'			=> $tools,
				'sqo_context' 	=> $sqo_context,
			]);

		/*
		* OPTIONAL PROPERTIES
		*/

		// Filter_by_list
			if (isset($properties->source->filter_by_list)) {
				// Calculate ar elements to show in filter
				$filter_list= $properties->source->filter_by_list;
				$filter_by_list = component_relation_common::get_filter_list_data($filter_list);
				$dd_object->filter_by_list = $filter_by_list;
			}

		// search operators info (tool tips)
			if ($mode==='search') {
				$dd_object->search_operators_info 	= $this->search_operators_info();
				$dd_object->search_options_title 	= search::search_options_title($dd_object->search_operators_info);
			}


		return $dd_object;
	}//end get_structure_context



	/**
	* GET_STRUCTURE_CONTEXT_simple
	* @return object $dd_object
	*/
	public function get_structure_context_simple($permissions=0) {

		// class called (model name too like component_input_text)
			#$called_model = get_called_class();
			$called_model = get_class($this);

		// sort vars
			$tipo 		  = $this->get_tipo();
			$section_tipo = $this->get_section_tipo();
			$translatable = $this->RecordObj_dd->get_traducible()==='si' ? true : false;
			$mode 		  = $this->get_modo();
			$label 		  = $this->get_label();
			$lang		  = $this->get_lang();

		// parent
			// 1 . From requested context
			if (isset(dd_core_api::$ar_dd_objects)) {

			 	$request_dd_object = array_reduce(dd_core_api::$ar_dd_objects, function($carry, $item) use($tipo, $section_tipo){
					if ($item->tipo===$tipo && $item->section_tipo===$section_tipo) {
						return $item;
					}
					return $carry;
				});
				if (!empty($request_dd_object->parent)) {
					// set
					$parent = $request_dd_object->parent;
				}
			}

			// 2 . From injected 'from_parent'
			if (!isset($parent) && isset($this->from_parent)) {
				// injected by the element
				$parent = $this->from_parent;
			}

			// 3 . From structure (fallback)
			if (!isset($parent)) {
				// default
				$parent = $this->RecordObj_dd->get_parent();
			}

		// dd_object
			$dd_object = new dd_object((object)[
				'label' 		=> $label,
				'tipo' 			=> $tipo,
				'section_tipo' 	=> $section_tipo,
				'model' 		=> $called_model,
				'parent' 		=> $parent,
				'lang' 			=> $lang,
				'mode' 			=> $mode,
				'translatable' 	=> $translatable,
				'permissions'	=> $permissions
			]);


		return $dd_object;
	}//end get_structure_context_simple



	/**
	* GET_AR_SUBCONTEXT
	* @return array $ar_subcontext
	*/
	public function get_ar_subcontext() {

		$ar_subcontext = [];

		$tipo = $this->tipo;

		// subcontext from layout_map items
			$layout_map_options = new stdClass();
				$layout_map_options->section_tipo 			= $this->get_section_tipo();
				$layout_map_options->tipo 					= $this->get_tipo();
				$layout_map_options->modo 					= $this->get_modo();
				$layout_map_options->config_context_type 	= 'show';

			$layout_map = layout_map::get_layout_map($layout_map_options);

			if($layout_map) foreach($layout_map as $dd_object) {

				$dd_object 				= (object)$dd_object;
				$current_tipo 			= $dd_object->tipo;
				$current_section_tipo 	= $dd_object->section_tipo;
				$mode 					= $dd_object->mode ?? 'list';
				$model 					= $dd_object->model; //RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);


				// common temporal excluded/mapped models *******
					// $match_key = array_search($model, common::$ar_temp_map_models);
					// if (false!==$match_key) {
					// 	debug_log(__METHOD__." +++ Mapped model $model to $match_key from layout map ".to_string(), logger::WARNING);
					// 	$model = $match_key;
					// }else if (in_array($model, common::$ar_temp_exclude_models)) {
					// 	debug_log(__METHOD__." +++ Excluded model $model from layout map ".to_string(), logger::WARNING);
					// 	continue;
					// }


				switch (true) {
					// component case
					case (strpos($model, 'component_')===0):

						$current_lang 	 = $dd_object->lang ?? common::get_element_lang($current_tipo, DEDALO_DATA_LANG);
						$related_element = component_common::get_instance($model,
																		  $current_tipo,
																		  null,
																		  $mode,
																		  $current_lang,
																		  $current_section_tipo);
						break;

					// grouper case
					case (in_array($model, layout_map::$groupers)):

						$related_element = new $model($current_tipo, $current_section_tipo, $mode);
						break;

					// others case
					default:
						debug_log(__METHOD__ ." Ignored model '$model' - current_tipo: '$current_tipo' ".to_string(), logger::WARNING);
						break;
				}

				// add
					if (isset($related_element)) {

						// Inject this tipo as related element from_parent
							$related_element->from_parent = $tipo;

						// get the JSON context of the related component
							$item_options = new stdClass();
								$item_options->get_context 	 = true;
								$item_options->get_data 	 = false;
							$element_json = $related_element->get_json($item_options);

						// temp ar_subcontext
							$ar_subcontext = array_merge($ar_subcontext, $element_json->context);
				}

			}//end foreach ($layout_map as $section_tipo => $ar_list_tipos) foreach ($ar_list_tipos as $current_tipo)


		return $ar_subcontext;
	}//end get_ar_subcontext



	/**
	* GET_AR_SUBDATA
	* @return array $ar_subcontext
	*/
	public function get_ar_subdata($ar_locators) {

		$ar_subdata = [];

		$source_tipo 		= $this->get_tipo();
		$source_model 		= RecordObj_dd::get_modelo_name_by_tipo($source_tipo,true);
		$source_properties 	= $this->get_propiedades();

		// Iterate dd_object (layout_map) for colums
			$layout_map_options = new stdClass();
				$layout_map_options->section_tipo 			= $this->get_section_tipo();
				$layout_map_options->tipo 					= $this->get_tipo();
				$layout_map_options->modo 					= $this->get_modo();
				$layout_map_options->config_context_type 	= 'show';

			$layout_map = layout_map::get_layout_map($layout_map_options);

			if($layout_map) foreach($ar_locators as $current_locator) {

				// check locator format
					if (!is_object($current_locator)) {
						if(SHOW_DEBUG===true) {
							dump($current_locator, ' current_locator ++ '.to_string());
							dump($ar_locators, ' ar_locators ++ '.to_string());
							throw new Exception("Error Processing Request. current_locator is not an object", 1);
						}
						continue;
					}

				$section_id 	= $current_locator->section_id;
				$section_tipo 	= $current_locator->section_tipo;

				foreach ((array)$layout_map as $dd_object) {

					if ($dd_object->section_tipo!==$section_tipo) {
						continue; // prevents multisection duplicate items
					}

					$dd_object 		= (object)$dd_object;
					$current_tipo 	= $dd_object->tipo;
					$mode 			= $dd_object->mode ?? 'list';
					$model			= $dd_object->model; //RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
					$current_lang 	= $dd_object->lang ?? common::get_element_lang($current_tipo, DEDALO_DATA_LANG);

					switch (true) {

						// section case
						case ($model==='section'):

							$datos = isset($current_locator->datos) ? json_decode($current_locator->datos) : null;

							// section
								$section = section::get_instance($section_id, $section_tipo, $mode, $cache=true);
								if (!is_null($datos)) {
									$section->set_dato($datos);
									$section->set_bl_loaded_matrix_data(true);
								}

							// get component json
								$get_json_options = new stdClass();
									$get_json_options->get_context 	= false;
									$get_json_options->get_data 	= true;
								$element_json = $section->get_json($get_json_options);
							break;

						// components case
						case (strpos($model, 'component_')===0):
							// components
								$current_component  = component_common::get_instance($model,
																					 $current_tipo,
																					 $section_id,
																					 $mode,
																					 $current_lang,
																					 $section_tipo
																					);
							// properties
								if (isset($dd_object->properties)){
									$current_component->set_properties($dd_object->properties);
								}
							// Inject this tipo as related component from_component_tipo
								if (strpos($source_model, 'component_')===0){
									$current_component->from_component_tipo = $this->tipo;
									$current_component->from_section_tipo 	= $this->section_tipo;
								}

							// get component json
								$get_json_options = new stdClass();
									$get_json_options->get_context 	= false;
									$get_json_options->get_data 	= true;
								$element_json = $current_component->get_json($get_json_options);
							break;

						// grouper case
						case (in_array($model, layout_map::$groupers)):

							$related_element = new $model($current_tipo, $section_tipo, $mode);

							// inject section_id
								$related_element->section_id = $section_id;

							// get component json
								$get_json_options = new stdClass();
									$get_json_options->get_context 	= false;
									$get_json_options->get_data 	= true;
								$element_json = $related_element->get_json($get_json_options);
							break;

						// oters
						default:
							# not defined model from context / data
							debug_log(__METHOD__." Ignored model '$model' - current_tipo: '$current_tipo' ".to_string(), logger::WARNING);
							break;
					}

					if (isset($element_json)) {
						// data add
							$ar_subdata = array_merge($ar_subdata, $element_json->data);
						// data add
							#$ar_subdata[] = $element_json->data;
					}
				}//end iterate display_items


				// dd_info, additional information about row
					if (isset($source_properties->value_with_parents) && $source_properties->value_with_parents===true){

						$dd_info = common::get_ddinfo_parents($current_locator, $source_tipo);

						$ar_subdata[] = $dd_info;
					}// end $value_with_parent = true

			}//end foreach ($ar_locators as $current_locator)

		return $ar_subdata;
	}//end get_ar_subdata



	/**
	* GET_LAYOUT_MAP
	* Calculate common cases for layout_map
	* Use for shared. Overwrite or continue for custom needs
	*//*
	public function get_layout_map($view=null) {

		if (empty($this->layout_map)) {

			// calculate
				$section_tipo 	= $this->get_section_tipo();
				$tipo 			= $this->get_tipo();
				$user_id 		= navigator::get_user_id();
				$modo 			= $this->get_modo();

			$options = new stdClass();
				$options->section_tipo 	= $section_tipo;
				$options->tipo 			= $tipo;
				$options->modo 			= $modo;
				$options->user_id 		= $user_id;

				if(!empty($view)) {
					$options->view 		= $view;
				}


			$this->layout_map = layout_map::get_layout_map($options);
		}

		return $this->layout_map;
	}//end get_layout_map
	*/



	/**
	* GET_SQO_CONTEXT
	* Calculate the sqo for the components or section that need search by own (section, autocomplete, portal, ...)
	* The search_query_object_context (sqo_context) have at least:
	* one sqo, that define the search with filter, offest, limit, etc, the select option is not used (it will use the ddo)
	* one ddo for the searched section
	* one ddo for the component searched.
	* is possible create more than one ddo for different components.
	* @return object | json
	*/
	public function get_sqo_context() {

		if (isset($this->sqo_context)) {
			return $this->sqo_context;
		}

		$sqo_context = new stdClass();
		$search = [];
		$show	= [];


		$section_tipo 	= $this->get_section_tipo();
		$tipo			= $this->get_tipo();
		$lang 			= $this->get_lang();

		// SEARCH

			// typo SOURCE SEARCH
				$source_search = new stdClass();
					$source_search->typo 			= 'source';
					$source_search->action 			= 'search';
					$source_search->tipo 			= $tipo;
					$source_search->section_tipo 	= $section_tipo;
					$source_search->lang 			= $lang;
					$source_search->mode 			= 'list';

				// add source
				$search[] = $source_search;

				// service autocomplete options
					$ar_target_section_tipo = [$section_tipo];
				// search_sections . set and remove search sections duplicates
					$search_sections 		= $ar_target_section_tipo;


			// typo SEARCH
				$filter_custom = [];

				// filter custom
					if (isset($propiedades->source->filter_custom)) {
						$filter_custom = array_merge($filter_custom, $propiedades->source->filter_custom);
					}

				// search_query_object params
					# Limit
					$limit = isset($propiedades->limit) ? (int)$propiedades->limit : 10;
					# operator can be injected by api
					$operator = isset($propiedades->source->operator) ? '$'.$propiedades->source->operator : '$and';

				// search_query_object build
					$query_object_options = new stdClass();
						$query_object_options->q 	 				= null;
						$query_object_options->limit  				= $limit;
						$query_object_options->offset 				= 0;
						$query_object_options->section_tipo 		= $search_sections;
						$query_object_options->tipo 				= $tipo;
						$query_object_options->logical_operator 	= $operator;
						$query_object_options->add_select 			= false;
						$query_object_options->filter_custom 		= !empty($hierarchy_terms_filter) ? $hierarchy_terms_filter : null;
						$query_object_options->skip_projects_filter = false; // skip_projects_filter true on edit mode

					$sqo = common::build_search_query_object($query_object_options);

					// add sqo
					$search[] = $sqo;

			// typo DDO
				// build self ddo
					$ddo = $this->get_structure_context($this->get_component_permissions(), false);

				// add ddo
					$search[] = $ddo;

		// SHOW
			// Not used now


		$sqo_context->show 		= $show;
		$sqo_context->search 	= $search;


		// fix
		$this->sqo_context = $sqo_context;


		return $sqo_context;
	}//end get_sqo_context



	/**
	* GET_DDINFO_PARENTS
	* @return object $dd_info
	*/
	public static function get_ddinfo_parents($locator, $source_component_tipo) {

		$section_id 	= $locator->section_id;
		$section_tipo 	= $locator->section_tipo;

		$RecordObj_dd 	= new RecordObj_dd($source_component_tipo);
		$properties 	= $RecordObj_dd->get_propiedades(true);

		$divisor 		= $properties->source->divisor ?? ' | ';

		//$source_term_model  = section::get_section_model($locator);

		$dd_info_value = component_relation_common::get_locator_value($locator, DEDALO_DATA_LANG, $show_parents=true,false, $divisor, false);

		$dd_info = new stdClass();
			$dd_info->tipo 			= 'ddinfo';
			$dd_info->section_id 	= $section_id;
			$dd_info->section_tipo	= $section_tipo;
			$dd_info->value 		= [$dd_info_value];
			$dd_info->parent 		= $source_component_tipo;


		return $dd_info;
	}//end get_ddinfo_parents



	/**
	* BUILD_SEARCH_QUERY_OBJECT
	* Generic builder for search_query_object (override when need)
	* @return object $query_object
	*/
	public static function build_search_query_object( $request_options ) {

		$start_time=microtime(1);

		$options = new stdClass();
			$options->q 	 			= null;
			$options->q_operator		= null;
			$options->q_split			= null;
			$options->limit  			= 10;
			$options->offset 			= 0;
			$options->lang 				= 'all';
			$options->logical_operator 	= '$or';
			$options->id 				= 'temp';
			$options->tipo				= null;
			$options->section_tipo		= null; // use always array as value
			$options->add_filter		= true;
			$options->add_select		= true;
			$options->order_custom		= null;
			$options->full_count		= false;
			$options->filter_by_locator	= false;
			$options->filter_by_locators= false; // different of 'filter_by_locator' (!)
			$options->direct			= false; // true for section (!)
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$id 			  = $options->id;
		$logical_operator = $options->logical_operator;
		$tipo 			  = $options->tipo;

		# Default from options (always array)
		$section_tipo = is_array($options->section_tipo) ? $options->section_tipo : [$options->section_tipo];

		# Defaults
		$filter_group = null;
		$select_group = array();
		$total_locators = false;

		// filter_by_locator_builder
			$filter_by_locator_builder = function($filter_by_locator, $section_tipo) {

				if (is_array($section_tipo)) {
					$section_tipo = reset($section_tipo);
				}

				// Is an array of objects
					$ar_section_id = [];
					foreach ((array)$filter_by_locator as $key => $value_obj) {
						$current_section_id = (int)$value_obj->section_id;
						if (!in_array($current_section_id, $ar_section_id)) {
							$ar_section_id[] = $current_section_id;
						}
					}

				$filter_element = new stdClass();
					$filter_element->q 		= json_encode($ar_section_id);
					$filter_element->path 	= json_decode('[
						{
							"section_tipo": "'.$section_tipo.'",
							"component_tipo": "dummy",
							"modelo": "component_section_id",
							"name": "Searching"
						}
	                ]');

				$op = '$and';
				$filter_group = new stdClass();
					$filter_group->$op = [$filter_element];

				$total_locators = count($ar_section_id);

				return [
					'filter_group' 	 => $filter_group,
					'total_locators' => $total_locators
				];
			};

		if ($options->direct===true) {

			# FILTER
				if ($options->add_filter===true) {

					if ($options->filter_by_locators!==false) {

						// filter_by_locators case
						$filter_by_locators = $options->filter_by_locators;
						$filter_group 		= false;
						$total_locators 	= count($filter_by_locators);

					}elseif ($options->filter_by_locator!==false){

						// filter_by_locator case
						$filter_by_locator_data = $filter_by_locator_builder($options->filter_by_locator, $section_tipo);

						$filter_group 	= $filter_by_locator_data['filter_group'];
						$total_locators = $filter_by_locator_data['total_locators'];
					}

				}//end if ($options->add_filter===true)

		}else{

			$RecordObj_dd_component_tipo = new RecordObj_dd($tipo);
			$component_tipo_properties 	 = $RecordObj_dd_component_tipo->get_propiedades(true);

			// source search. If not defined, use fallback to legacy related terms and build one
				$config_context = component_common::get_config_context($tipo, $external=false, $section_tipo);

			// config_context iteration
				foreach ($config_context as $source_search_item) {

					foreach ($source_search_item->search as $current_tipo) {

						// check is real component
							$model = RecordObj_dd::get_modelo_name_by_tipo($current_tipo, true);
							if (strpos($model,'component')!==0) {
								debug_log(__METHOD__." IGNORED. Expected model is component, but '$model' is received for current_tipo: $current_tipo ".to_string(), logger::ERROR);
								continue;
							}

						$path = search::get_query_path($current_tipo, $source_search_item->section_tipo);

						# FILTER . filter_element (operator_group)
							if ($options->add_filter===true) {

								if ($options->filter_by_locator!==false) {

									// filter_by_locators case
									$filter_by_locators = $options->filter_by_locators;
									$filter_group 		= false;
									$total_locators 	= count((array)$filter_by_locators);

								}elseif ($options->filter_by_locators!==false) {

									// filter_by_locator case
									$filter_by_locator_data = $filter_by_locator_builder($options->filter_by_locator, $source_search_item->section_tipo);

									$filter_group 	= $filter_by_locator_data['filter_group'];
									$total_locators = $filter_by_locator_data['total_locators'];

								}else{//end if ($options->filter_by_locator!==false)

									$filter_element = new stdClass();
										$filter_element->q 		= $options->q;
										$filter_element->lang 	= $options->lang;
										$filter_element->path 	= $path;

									$filter_group = new stdClass();
										$filter_group->$logical_operator[] = $filter_element;
								}

							}//end if ($options->add_filter===true)


						# SELECT . Select_element (select_group)
							if($options->add_select===true){

								# Add options lang
								$end_path = end($path);
								$end_path->lang = $options->lang;

								$select_element = new stdClass();
									$select_element->path = $path;

								$select_group[] = $select_element;
							}

					}//end foreach ($source_search_item->components as $current_tipo)

				}//end foreach ($source_search as $source_search_item) {

		}//end if ($options->direct===true)


		// sqo
			$query_object = new stdClass();
				$query_object->typo  	   			= 'sqo';
				$query_object->id  	   				= $id;
				$query_object->section_tipo 		= $section_tipo;
				$query_object->filter  				= $filter_group;
				$query_object->filter_by_locators  	= $filter_by_locators ?? false;
				$query_object->select  				= $select_group;
				$query_object->order_custom 		= $options->order_custom;
				$query_object->limit   				= $options->limit;
				$query_object->offset  				= $options->offset;
				$query_object->full_count  			= $total_locators ?? $options->full_count;


		return (object)$query_object;
	}//end build_search_query_object



	/**
	* GET_DATA_ITEM
	* Only to maintain vars and format unified
	* @param mixed $value
	* @return object $item
	*/
	public function get_data_item($value) {

		$item = new stdClass();
			$item->section_id 			= $this->get_section_id();
			$item->section_tipo 		= $this->get_section_tipo();
			$item->tipo 				= $this->get_tipo();
			$item->pagination			= $this->get_pagination();
			$item->from_component_tipo 	= isset($this->from_component_tipo) ? $this->from_component_tipo : $item->tipo;
			$item->value 				= $value;

		return $item;
	}//end get_data_item



	/**
	* GET_ELEMENT_LANG
	* Used to resolve component lang before construct it
	* @return lang code like 'lg-spa'
	*/
	public static function get_element_lang($tipo, $data_lang=DEDALO_DATA_LANG) {

		$RecordObj_dd 	= new RecordObj_dd($tipo);
		$lang 			= ($RecordObj_dd->get_traducible()==='si') ? $data_lang : DEDALO_DATA_NOLAN;

		return $lang;
	}//end get_element_lang



	/**
	* GET_SECTION_ELEMENTS_CONTEXT
	* Get list of all components available for current section using get_context_simple
	* Used to build search presets in filter
	* @param array $request_options
	* @return array $context
	*/
	public static function get_section_elements_context($request_options) {
		$start_time=microtime(1);

		$options = new stdClass();
			$options->context_type 				= 'simple';
			$options->ar_section_tipo 			= null;
			$options->path 						= [];
			$options->ar_tipo_exclude_elements 	= [];
			$options->ar_components_exclude 	= [
				'component_password',
				'component_filter_records',
				'component_image',
				'component_av',
				'component_pdf',
				//'component_relation_children',
				//'component_relation_related',
				//'component_relation_model',
				//'component_relation_parent',
				//'component_relation_index',
				//'component_relation_struct',
				'component_geolocation',
				'component_info',
				'component_state',
				'section_tab',
			];
			$options->ar_include_elements 		= [
				'component',
				'section_group',
				'section_group_div',
				'section_tab'
			];
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}


		$ar_section_tipo 			= $options->ar_section_tipo;
		$path 						= $options->path;
		$ar_tipo_exclude_elements 	= $options->ar_tipo_exclude_elements;
		$ar_components_exclude 		= $options->ar_components_exclude;
		$ar_include_elements 		= $options->ar_include_elements;
		$context_type 				= $options->context_type;

		# Manage multiple sections
		# section_tipo can be an array of section_tipo. For avoid duplications, check and group similar sections (like es1, co1, ..)
		#$ar_section_tipo = (array)$section_tipo;

		$context = [];
		foreach ((array)$ar_section_tipo as $section_tipo) {

			$section_permisions = security::get_security_permissions($section_tipo, $section_tipo);
			$user_id_logged = navigator::get_user_id();

			if ( $section_tipo!==DEDALO_THESAURUS_SECTION_TIPO
				&& $user_id_logged!=DEDALO_SUPERUSER
				&& ((int)$section_permisions<1)) {
				// user don't have access to current section. skip section
				continue;
			}

			//create the section instance and get the context_simple
				$dd_section = section::get_instance(null, $section_tipo, $modo='list', $cache=true);

			// element json
				$get_json_options = new stdClass();
					$get_json_options->get_context 		= true;
					$get_json_options->context_type 	= $context_type;
					$get_json_options->get_data 		= false;
				$element_json = $dd_section->get_json($get_json_options);

			// item context simple
				$item_context = $element_json->context;

			$context = array_merge($context, $item_context);

			$ar_elements = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_include_elements, $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=false, $ar_tipo_exclude_elements);


			foreach ($ar_elements as $element_tipo) {

				if($element_tipo === DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO) continue; //'component_security_areas' removed in v6 but the component will stay in ontology, PROVISIONAL, only in the alpha state of V6 for compatibility of the ontology of V5.

				$model = RecordObj_dd::get_modelo_name_by_tipo($element_tipo,true);

				// common temporal excluded/mapped models *******
					$match_key = array_search($model, common::$ar_temp_map_models);
					if (false!==$match_key) {
						debug_log(__METHOD__." +++ Mapped model $model to $match_key from layout map ".to_string(), logger::WARNING);
						$model = $match_key;
					}else if (in_array($model, common::$ar_temp_exclude_models)) {
						debug_log(__METHOD__." +++ Excluded model $model from layout map ".to_string(), logger::WARNING);
						continue;
					}

				switch (true) {
					// component case
					case (strpos($model, 'component_')===0):

						$current_lang = DEDALO_DATA_LANG;
						$element  = component_common::get_instance(	$model,
																	$element_tipo,
																	null,
																	'list',
																	$current_lang,
																	$section_tipo);
						break;

					// grouper case
					case (in_array($model, layout_map::$groupers)):

						$element  = new $model($element_tipo, $section_tipo, 'list');
						break;

					// others case
					default:

						debug_log(__METHOD__ ." Ignored model '$model' - current_tipo: '$element_tipo' ".to_string(), logger::WARNING);
						break;
				}//end switch (true)

				// element json
					$get_json_options = new stdClass();
						$get_json_options->get_context 		= true;
						$get_json_options->context_type 	= $context_type;
						$get_json_options->get_data 		= false;
					$element_json = $element->get_json($get_json_options);

				// item context simple
					$item_context = $element_json->context;

				// target section tipo add
					if ($model==='component_portal' || $model==='component_autocomplete') {
						$ddo = reset($item_context);
						$target_section_tipo = $element->get_ar_target_section_tipo();
						// Check target section access here ?
						$n_sections = count($target_section_tipo);
						if ($n_sections===1) {
							$ddo->target_section_tipo = $target_section_tipo;
						}else{
							#$ddo->target_section_tipo = reset($target_section_tipo);
							debug_log(__METHOD__." Ignored $element_tipo - $model with section tipo: ".to_string($target_section_tipo).' only allowed 1 section_tipo' , logger::ERROR);
						}
					}

				// context add
					$context = array_merge($context, $item_context);

			}//end foreach ($ar_elements as $element_tipo)

		}//end foreach ((array)$ar_section_tipo as $section_tipo)


		return $context;
	}//end get_section_elements_context


	/**
	* GET_TOOLS
	* @return
	*/
	public function get_tools() {

		$registered_tools 	= $this->get_registered_tools();
		$model 				= get_class($this);
		$tipo 				= $this->tipo;
		$is_component 		= strpos($model, 'component_')===0;

		$tools = [];
		foreach ($registered_tools as $tool) {

			if( in_array($model, $tool->afected_models)
				|| ($is_component===true && in_array('all_components', $tool->afected_models))
				|| (is_array($tool->afected_tipos) && in_array($tipo, $tool->afected_tipos))
			  ) {

				if (isset($tool->requirement_translatable)) {
					$is_translatable = $is_component ? ($this->traducible==='no' ? false : true) : false;
					if ($tool->requirement_translatable===$is_translatable) {
						$tools[] = $tool;
					}
				}else{
					$tools[] = $tool;
				}
			}
		}

		return $tools;
	}//end get_tools



	/**
	* GET_REGISTERED_TOOLS
	* @return
	*/
	public function get_registered_tools() {

		if(isset($_SESSION['dedalo']['registered_tools'])) {
			return $_SESSION['dedalo']['registered_tools'];
		}

		$sqo_tool_active = json_decode('{
				"section_tipo": "dd1324",
				"limit": 0,
				"filter": {
				    "$and": [
				        {
				            "q": {"section_id":"1","section_tipo":"dd64","type":"dd151","from_component_tipo":"dd1354"},
				            "q_operator": null,
				            "path": [
				                {
				                    "section_tipo": "dd1324",
				                    "component_tipo": "dd1354",
				                    "modelo": "component_radio_button",
				                    "name": "Active"
				                }
				            ]
				        }
				    ]
				}
			}');

		$search = new search($sqo_tool_active);
		$result = $search->search();

		$registered_tools = [];
		foreach ($result->ar_records as $record) {
			$section = section::get_instance($record->section_id, $record->section_tipo);
			$section_dato = json_decode($record->datos);
			$section->set_dato($section_dato);
			$section->set_bl_loaded_matrix_data(true);

			$component_tipo = 'dd1353';
			$model 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($model,
															$component_tipo,
															$record->section_id,
															'list',
															DEDALO_DATA_NOLAN,
															$record->section_tipo);
			$registered_tools[] 	= $component->get_dato();
		}

		$_SESSION['dedalo']['registered_tools'] = $registered_tools;


		return $registered_tools;
	}//end get_registered_tools



}//end class


