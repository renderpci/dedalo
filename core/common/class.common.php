<?php
declare(strict_types=1);
/**
* COMMON (ABSTRACT CLASS)
* Shared methods by sections and components
*/
abstract class common {



	/**
	* CLASS VARS
	*/
		// string tipo. like 'dd4525'
		public $tipo;
		// string mode. like 'edit'
		public $mode;
		// string model. like 'component_date'
		public $model;
		// string lang. like 'lg-eng'
		public $lang;
		// string label. like 'component_section_id'
		public $label;
		public $dato; // object dato (JSON encoded in db)
		public $section_id;

		// object RecordObj_dd. Ontology definition object
		public $RecordObj_dd;

		// norden
		public $norden;

		// string traducible (si|no)
		public $traducible;
		// bool translatable
		public $translatable;

		// // section_id. string like '1526'
		// public $section_id;

		// lang. string like 'lg-eng'
		// public $lang;

		// permissions. int value from 0 to 3
		public $permissions;

		// ar_loaded_models_name. List of all components/sections model name used in current page (without duplicates). Used to determine
		// the css and css files to load
		static $ar_loaded_models_name = array();

		// identificador_unico. UID used to set DOM elements id unique based on section_tipo, section_id, lang, mode, etc.
		public $identificador_unico;
		// variant. Modifier of identificador_unico
		public $variant;

		// pagination. object used to paginate sections, portals, etc.
		public $pagination;

		// bl_loaded_structure_data. Set to true when element structure data is loaded. Avoid reload structure data again
		public $bl_loaded_structure_data;
		//bl_loaded_matrix_data. Set to true when element matrix data is loaded. Avoid reconnect to db data again
		public $bl_loaded_matrix_data = false;

		// TABLE  matrix_table
		// public $matrix_table;

		// context. Object with information about context of current element
		public $context;

		// public properties
		public $properties;

		// from_parent. Used to link context ddo elements
		public $from_parent;

		// parent_grouper
		public $parent_grouper;

		// build options sent by the client into show ddo to modify the standard get data.
		// in area_thesaurus it send if the thesaurus need get models or terms.
		// in component_portal it send if the source external need to be updated.
		public $build_options = null;

		// request config with show, select and search of the item
		public $request_config;

		// request_ddo_value
		public $request_ddo_value;

		// cache of calculated context, used to get the context that was calculated and reuse it.
		static $structure_context_cache = [];

		// view. Specific element view combined with mode is used to render elements
		public $view;

		// children_view. Specific element children_view used to render child elements
		public $children_view;

		// caller_dataframe the element that call to other element (component, section, area, etc)
		public $caller_dataframe;

		// data_source . string ('tm' for time machine source data)
		public $data_source;

		// uid. Unique id string
		public $uid;

		// with_lang_versions
		public $with_lang_versions;

		// API autocomplete search. bool
		public $autocomplete;

		// object process data object (messages and process data)
		// use as { msg: string, property1: mixed, ... }
		public static $pdata;

		// tools. Array of element tools. If defined, they will not be recalculated
		public $tools;

		// buttons_context. Used to store calculated buttons context value
		// Note that on get_structure_context_simple case, is set to [] to prevent calculate it
		public $buttons_context;

		// required methods
			// abstract protected function define_id($id);
			// abstract protected function define_tipo();
			// abstract protected function define_lang();
			// abstract public function get_html();

		// temporal excluded/mapped models
			// public static $ar_temp_map_models = [
			// 	// map to => old model
			// 	'component_portal'	=> 'component_autocomplete_hi',
			// 	'component_portal'	=> 'component_autocomplete',
			// 	'section_group'		=> 'section_group_div'
			// ];
			public static $ar_temp_map_models = [
				// map from old model => new model
				'component_autocomplete_hi'	=> 'component_portal',
				'component_autocomplete'	=> 'component_portal',
				'section_group_div'			=> 'section_group',
				'component_calculation' 	=> 'component_info'
			];
			public static $ar_temp_exclude_models = [
				// v5
				'component_security_areas',
				'component_autocomplete_ts', // ?
				// 'button_trigger',
				// v6
				// 'component_autocomplete'
				// 'component_av'
				// 'component_calculation',
				// 'component_check_box'
				// 'component_date'
				// 'component_email'
				// 'component_external',
				// 'component_filter'
				// 'component_filter_master'
				// 'component_filter_records'
				// 'component_geolocation'
				'component_html_file',
				// 'component_html_text',
				// 'component_image'
				// 'component_info',
				// 'component_input_text'
				'component_input_text_large',
				//'component_inverse',
				'component_ip',
				// 'component_iri'
				// 'component_json'
				'component_layout',
				// 'component_number'
				// 'component_password',
				// 'component_pdf'
				// 'component_portal'
				// 'component_publication'
				// 'component_radio_button'
				// 'component_relation_children',
				// 'component_relation_index',
				// 'component_relation_model',
				// 'component_relation_parent',
				// 'component_relation_related',
				'component_relation_struct',
				'component_score',
				// 'component_section_id'
				// 'component_security_access'
				'component_security_tools',
				// 'component_select'
				// 'component_select_lang'
				'component_state',
				// 'component_svg'
				// 'component_text_area'
			];
			public static $groupers = [
				'section_group',
				'section_group_div',
				'section_tab',
				'tab'
				// 'section_group_relation',
				// 'section_group_portal'
			];



	# ACCESSORS
	final public function __call(string $strFunction, array $arArguments) {

		$strMethodType		= substr($strFunction, 0, 4); # like set or get_
		$strMethodMember	= substr($strFunction, 4);
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
	final protected function SetAccessor(string $strMember, $strNewValue) : bool {

		if(property_exists($this, $strMember)) {

			// fix value
			$this->$strMember = $strNewValue;

			return true;
		}else{
			return false;
		}
	}
	# GET
	final protected function GetAccessor(string $strMember) {

		return property_exists($this, $strMember)
			? $this->$strMember
			: false;
	}//end GetAccessor



	/**
	* GET_PERMISSIONS
	* Do not use this method directly to resolve component permissions
	* @param string $tipo
	* @return int $permissions
	*/
	public static function get_permissions( string $parent_tipo=null, string $tipo=null ) : int {

		// no logged case
			if(login::is_logged()!==true) {
				return 0;
			}

		// check params
			if( empty($parent_tipo) ) {
				if(SHOW_DEBUG===true) {
					dump($parent_tipo, 'parent_tipo');
					trigger_error("Error Processing Request. get_permissions: parent_tipo is empty");
				}
				debug_log(__METHOD__." Error Processing Request. get_permissions: tipo is empty ".to_string(), logger::ERROR);
				return 0;
			}
			if( empty($tipo) ) {
				if(SHOW_DEBUG===true) {
					dump($tipo, 'get_permissions error for tipo');
					trigger_error("Error Processing Request. get_permissions: tipo is empty");
				}
				debug_log(__METHOD__." Error Processing Request. get_permissions: tipo is empty ".to_string(), logger::ERROR);
				return 0;
			}

		// get permissions looking in calculated permissions_table
			$permissions = security::get_security_permissions($parent_tipo, $tipo);


		return (int)$permissions;
	}//end get_permissions



	/**
	* GET_MODEL
	* @return string $model
	* 	Is the self class name like 'component_autocomplete'
	*/
	public function get_model() : string {

		return get_called_class();
	}//end get_model



	/**
	* SET_PERMISSIONS
	* @param int $number
	*/
	public function set_permissions( int $number ) : void {

		$this->permissions = (int)$number;
	}//end set_permissions



	/**
	* SET_BL_LOADED_MATRIX_DATA
	* @param bool $value
	* @return bool
	*/
	public function set_bl_loaded_matrix_data( bool $value ) : bool {

		$this->bl_loaded_matrix_data = $value;

		return true;
	}//end set_bl_loaded_matrix_data



	/**
	* GET_BL_LOADED_MATRIX_DATA
	* @return bool $value
	*/
	public function get_bl_loaded_matrix_data() : bool {

		return $this->bl_loaded_matrix_data;
	}//end get_bl_loaded_matrix_data



	/**
	* LOAD STRUCTURE DATA
	* Get data once from Ontology (tipo, model, norden, estraducible, etc.)
	* @return bool
	*/
	protected function load_structure_data() : bool {

		// check mandatory property tipo
			if( empty($this->tipo) ) {
				// dump($this, " DUMP ELEMENT WITHOUT TIPO - THIS ");
				// throw new Exception("Error (3): tipo is mandatory!", 1);
				debug_log(__METHOD__."  Error: trying to load structure on element without tipo ! ". get_called_class(), logger::ERROR);
				return false;
			}

		if( !$this->bl_loaded_structure_data) {

			$this->RecordObj_dd	= new RecordObj_dd($this->tipo);

			// fix vars
				$this->model	= $this->RecordObj_dd->get_modelo();
				$this->norden	= $this->RecordObj_dd->get_norden();
				$this->label	= RecordObj_dd::get_termino_by_tipo($this->tipo,DEDALO_APPLICATION_LANG,true);		#echo 'DEDALO_APPLICATION_LANG: '.DEDALO_APPLICATION_LANG ;#var_dump($this->label);	#die();

			// translatable
				$this->traducible	= $this->RecordObj_dd->get_traducible();
				$this->translatable	= $this->traducible==='si';
				// If the element is not translatable, we set its 'lang' to 'lg-nolan' (DEDALO_DATA_NOLAN)
				if ($this->traducible==='no') {
					$this->fix_language_nolan();
				}

			// properties : Always JSON decoded
				$properties = $this->RecordObj_dd->get_properties();
				$this->properties = !empty($properties) ? $properties : false;

			// matrix_table
				// if(!isset($this->matrix_table))
				// $this->matrix_table = self::get_matrix_table_from_tipo($this->tipo);

			// bl_loaded_structure_data
				$this->bl_loaded_structure_data = true;
		}

		return true;
	}//end load_structure_data



	/**
	* IS_TRANSLATABLE
	* @return bool
	*/
	public function is_translatable() : bool {

		$translatable = $this->translatable ?? false;

		return $translatable;
	}//end is_translatable



	/**
	* GET MATRIX_TABLE FROM TIPO
	* @param string $tipo
	* @return string|null $matrix_table
	*/
	public static function get_matrix_table_from_tipo(string $tipo) : ?string {

		// check valid tipo
			if (empty($tipo)) {
				debug_log(__METHOD__
					." Error Processing Request. tipo is empty ".to_string($tipo)
					, logger::ERROR)
				;
				return null;
			}elseif ($tipo==='matrix') {
				debug_log(__METHOD__
					." Error Processing Request. tipo is invalid ".to_string($tipo)
					, logger::ERROR
				);
				return null;
			}

		// cache
			static $matrix_table_from_tipo;
			if(isset($matrix_table_from_tipo[$tipo])) {
				return $matrix_table_from_tipo[$tipo];
			}

		// all case
			if ($tipo==='all') {
				return null;
			}

		// model
			$model_name = RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
			// empty model case
			if (empty($model_name)) {
				$msg = "Current tipo ($tipo) model name is empty. Model is mandatory, check your model for tipo: '$tipo'";
				debug_log(__METHOD__
					. ' ' . $msg
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					$bt = debug_backtrace();
					dump($bt, ' bt ++ '.to_string());
				}
				return null;
			}
			// area model case
			if (strpos($model_name, 'area')===0 || $model_name==='menu' || $model_name==='section_tool') {
				return null;
			}
			// non section model case
			if ($model_name!=='section') {
				debug_log(__METHOD__
					. " Error. Don't use non section tipo to calculate matrix_table. Use always section_tipo". PHP_EOL
					. " tipo: $tipo " . PHP_EOL
					. " model: $model_name" . PHP_EOL
					. ' bt 0: ' . to_string( debug_backtrace()[0] ) . PHP_EOL
					. ' bt 1: ' . to_string( debug_backtrace()[1] ) . PHP_EOL
					// . ' bt all: ' . to_string( debug_backtrace() )
					, logger::ERROR
				);

				return null;
			}

		// section cases
			switch (true) {

				case ($tipo===DEDALO_SECTION_PROJECTS_TIPO):
					$matrix_table = 'matrix_projects';
					break;

				case ($tipo===DEDALO_SECTION_USERS_TIPO):
					$matrix_table = 'matrix_users';
					break;

				default:

					// try related. If section have TR of model name 'matrix_table' takes its matrix_table value
						$ar_related = common::get_ar_related_by_model('matrix_table', $tipo);
						if ( isset($ar_related[0]) ) {
							// real or virtual section
							$matrix_table = RecordObj_dd::get_termino_by_tipo($ar_related[0], DEDALO_STRUCTURE_LANG, true);
						}

					// try resolve virtual section fallback
						if ( empty($matrix_table) ) {
							// try real section
							$real_tipo = section::get_section_real_tipo_static($tipo);
							if ($real_tipo!==$tipo) {
								$ar_related	= common::get_ar_related_by_model('matrix_table', $real_tipo);
								if ( isset($ar_related[0]) ) {
									// real section
									$matrix_table = RecordObj_dd::get_termino_by_tipo($ar_related[0], DEDALO_STRUCTURE_LANG, true);
								}
							}
						}

					// fallback to default
						if (!isset($matrix_table)) {
							$matrix_table = 'matrix';
						}
			}//end switch

		// cache
			$matrix_table_from_tipo[$tipo] = $matrix_table;


		return $matrix_table;
	}//end get_matrix_table_from_tipo



	/**
	* GET_MATRIX_TABLES_WITH_RELATIONS
	* Note: Currently tables are static. make a connection to db to do dynamic ASAP
	* @return array $ar_tables_with_relations
	*/
	public static function get_matrix_tables_with_relations() : array {

		// cache
			static $ar_tables_with_relations_cache;
			if (isset($ar_tables_with_relations_cache)) {
				return $ar_tables_with_relations_cache;
			}

		// tables
			$ar_tables_with_relations = [];
			$ar_children_tables = RecordObj_dd::get_ar_childrens('dd627', 'norden');
			foreach ($ar_children_tables as $table_tipo) {

				// model
				$model_name = RecordObj_dd::get_modelo_name_by_tipo($table_tipo,true);
				if ($model_name!=='matrix_table') {
					continue;
				}

				// properties
				$RecordObj_dd	= new RecordObj_dd( $table_tipo );
				$properties		= $RecordObj_dd->get_properties();
				if (isset($properties) && property_exists($properties,'inverse_relations')) {

					// table_name, such 'matrix_hierarchy'
					$table_name = RecordObj_dd::get_termino_by_tipo($table_tipo, DEDALO_STRUCTURE_LANG, true, false);

					if ($properties->inverse_relations===true) {

						// add table
						$ar_tables_with_relations[] = $table_name;

					}else if($table_name==='matrix_test' && DEVELOPMENT_SERVER===true){

						// add table matrix_test only in development server context
						$ar_tables_with_relations[] = $table_name;
					}
				}
			}//end foreach ($ar_children_tables as $table_tipo)

		// fallback to defaults when a problem is detected
			if (empty($ar_tables_with_relations)) {
				debug_log(__METHOD__
					.' Error on read Ontology tables list. Old Ontology version < 26-01-2018 ! '
					, logger::ERROR
				);
				$ar_tables_with_relations = [
					"matrix",
					"matrix_list",
					"matrix_activities",
					"matrix_hierarchy"
				];
			}

		// cache
			$ar_tables_with_relations_cache = $ar_tables_with_relations;


		return $ar_tables_with_relations;
	}//end get_matrix_tables_with_relations



	/**
	* SET_DATO
	* @param mixed dato
	* @return bool true
	*/
	public function set_dato($dato) : bool {

		// set
		$this->dato = $dato;

		// loaded. Fix this element as data loaded to prevent overwrite current fixed dato, with database dato
		$this->set_bl_loaded_matrix_data(true);

		return true;
	}//end set_dato



	/**
	* SET_LANG
	* When isset lang, valor and dato are cleaned
	* and $this->bl_loaded_matrix_data is reset to force load from database again
	* @param string $lang
	* @return bool
	*/
	public function set_lang(string $lang) : bool {

		#if($lang!==DEDALO_DATA_LANG) {
			# FORCE reload dato from database when dato is requested again
			$this->set_to_force_reload_dato();
		#}

		$this->lang = $lang;

		return true;
	}//end set_lang



	/**
	* SET_TO_FORCE_RELOAD_DATO
	* @return void
	*/
	public function set_to_force_reload_dato() {

		// unset previous calculated valor
			if (isset($this->valor)) {
				unset($this->valor);
			}

		// force reload dato from database when dato is requested again
			$this->set_bl_loaded_matrix_data(false);
	}//end set_to_force_reload_dato



	/**
	* GET_MAIN_LANG
	* @return string $main_lang
	*/
	public static function get_main_lang( string $section_tipo, $section_id=null ) : string {

		// Always fixed lang of languages as English (section tipo = lg1)
		if ($section_tipo===DEDALO_LANGS_SECTION_TIPO) {
			return 'lg-eng';
		}

		static $current_main_lang = [];
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
				$section		= section::get_instance($section_id, $section_tipo);
				$model_name	= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_HIERARCHY_LANG_TIPO,true);
				$component		= component_common::get_instance(
					$model_name,
					DEDALO_HIERARCHY_LANG_TIPO,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
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

				# Thesaurus virtual
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
	* SETVAR
	* @param string $name
	* @param mixed $default = false
	* @return mixed
	*/
	public static function setVar(string $name, $default=false) : mixed {

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
	* @param object|false $data_obj
	*/
	public static function setVarData(string $name, $data_obj, $default=false) : mixed {

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
	* @return string
	*/
		// public static function get_page_query_string(bool $remove_optional_vars=true) : string {

		// 	$queryString	= $_SERVER['QUERY_STRING']; # like max=10
		// 	$queryString	= safe_xss($queryString);

		// 	if($remove_optional_vars===false) {
		// 		return $queryString;
		// 	}

		// 	$qs 				= '' ;
		// 	$ar_optional_vars	= array('order_by','order_dir','lang','accion','pageNum');

		// 	$search			= array('&&',	'&=',	'=&',	'??',	'==');
		// 	$replace		= array('&',	'&',	'&',	'?',	'=' );
		// 	$queryString	= str_replace($search, $replace, $queryString);

		// 	$posAND		= strpos($queryString, '&');
		// 	$posEQUAL	= strpos($queryString, '=');

		// 	# go through and rebuild the query without the optional variables
		// 	if($posAND !== false){ # query tipo ?captacionID=1&informantID=6&list=0

		// 		$ar_pares = explode('&', $queryString);
		// 		if(is_array($ar_pares)) foreach ($ar_pares as $key => $par){

		// 			#echo " <br> $key - $par ";
		// 			if(strpos($par,'=')!==false) {

		// 				$troz		= explode('=',$par) ;

		// 				$varName	= false;	if(isset($troz[0])) $varName  = $troz[0];
		// 				$varValue	= false;	if(isset($troz[1])) $varValue = $troz[1];

		// 				if(!in_array($varName, $ar_optional_vars)) {
		// 					$qs .= $varName . '=' . $varValue .'&';
		// 				}
		// 			}
		// 		}

		// 	}else if($posAND === false && $posEQUAL !== false) { # query tipo ?captacionID=1

		// 		$qs = $queryString ;
		// 	}

		// 	$qs = str_replace($search, $replace, $qs);

		// 	# if last char is & delete it
		// 	if(substr($qs, -1)==='&') $qs = substr($qs, 0, -1);

		// 	return $qs;
		// }//end get_page_query_string



	/**
	* GET_AR_ALL_LANGS : Return array of all langs of all projects in Dédalo
	* @return array $ar_all_langs
	*	like (lg-eng=>locator,lg-spa=>locator) or resolved (lg-eng => English, lg-spa => Spanish)
	*/
	public static function get_ar_all_langs() : array {

		$ar_all_langs = DEDALO_PROJECTS_DEFAULT_LANGS;

		return $ar_all_langs;
	}//end get_ar_all_langs



	/**
	* GET_AR_ALL_LANGS_RESOLVED
	* @param string $lang
	*	Default DEDALO_DATA_LANG
	* @return array $ar_all_langs_resolved
	* [
	*	lg-spa : Spanish,
	*   lg-eng : English,
	*   ..
	* ]
	*/
	public static function get_ar_all_langs_resolved( string $lang=DEDALO_DATA_LANG ) : array {

		$ar_all_langs = common::get_ar_all_langs();

		$ar_all_langs_resolved = [];
		foreach ($ar_all_langs as $current_lang) {

			$lang_name = lang::get_name_from_code( $current_lang, $lang );
			$ar_all_langs_resolved[$current_lang] = $lang_name;
		}

		return $ar_all_langs_resolved;
	}//end get_ar_all_langs_resolved



	/**
	* GET_PROPERTIES
	* Alias of $this->RecordObj_dd->get_properties() but json decoded
	* @return object|array|null $properties
	*/
	public function get_properties() : ?object {

		$properties = isset($this->properties)
			? $this->properties // already fixed
			: $this->RecordObj_dd->get_properties(); // already parsed

		if ($properties===false) {
			$properties = null;
		}

		return $properties;
	}//end get_properties



	/**
	* SET_PROPERTIES
	* @param mixed $value
	* @return bool
	*/
	public function set_properties($value) : bool {

		$properties = (is_string($value))
			? json_decode($value)
			: $value;

		// Fix properties object|null
		$this->properties = $properties;

		return true;
	}//end set_properties



	/**
	* GET_PROPIEDADES : V5 compatibility for diffusion
	* Don't used it in V6 calls!!!
	*/
	public function get_propiedades() {

		# Read string from database str
		$propiedades = $this->RecordObj_dd->get_propiedades();

		$propiedades_obj = !empty($propiedades)
			? json_decode($propiedades)
			: null;


		return $propiedades_obj;
	}//end get_propiedades



	/**
	* GET_AR_RELATED_COMPONENT_TIPO
	* @return array $ar_related_component_tipo
	*/
	public function get_ar_related_component_tipo() : array {

		$ar_related_component_tipo=array();

		$relaciones = $this->RecordObj_dd->get_relaciones();
		if(is_array($relaciones)) {
			foreach ($relaciones as $value) {
				$tipo = reset($value);
				$ar_related_component_tipo[] = $tipo;
			}
		}

		return $ar_related_component_tipo;
	}//end get_ar_related_component_tipo



	/**
	* GET_AR_RELATED_BY_MODEL
	* @param string $model_name
	* @param string $tipo
	* @param bool $strict = true
	* @return array $ar_related_by_model
	*/
	public static function get_ar_related_by_model(string $model_name, string $tipo, bool $strict=true) : array {

		// cache
			static $ar_related_by_model_data = [];
			$uid = $model_name.'_'.$tipo.'_'.(int)$strict;
			// if (isset($ar_related_by_model_data[$uid])) {
			if (array_key_exists($uid, $ar_related_by_model_data)) {
				return $ar_related_by_model_data[$uid];
			}

		$RecordObj_dd	= new RecordObj_dd($tipo);
		$relaciones		= $RecordObj_dd->get_relaciones();

		$ar_related_by_model=array();
		foreach ((array)$relaciones as $relation) foreach ((array)$relation as $model_tipo => $current_tipo) {

			# Calcularlo desde el model_tipo no es seguro, ya que el modelo de un componente pude cambiar y esto no actualiza el model_tipo de la relación
			#$related_terms[$tipo] = RecordObj_dd::get_termino_by_tipo($model_tipo, DEDALO_STRUCTURE_LANG, true, false);	//$terminoID, $lang=NULL, $from_cache=false, $fallback=true
			# Calcular siempre el modelo por seguridad
			$current_model_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo, true);
			if ($strict===true) {
				// Default compare equal
				if ($current_model_name===$model_name) {
					$ar_related_by_model[] = $current_tipo;
				}
			}else{
				if (strpos($current_model_name, $model_name)!==false) {
					$ar_related_by_model[] = $current_tipo;
				}
			}
		}

		// cache
			$ar_related_by_model_data[$uid] = $ar_related_by_model;


		return $ar_related_by_model;
	}//end get_ar_related_by_model



	/**
	* GET_ALLOWED_RELATION_TYPES
	* Search in structure and return an array of tipos
	* @return array $ar_allowed
	*/
	public static function get_allowed_relation_types() : array {

		// For speed, we use constants now
		$ar_allowed = [
			DEDALO_RELATION_TYPE_CHILDREN_TIPO,
			DEDALO_RELATION_TYPE_PARENT_TIPO,
			DEDALO_RELATION_TYPE_RELATED_TIPO,
			// DEDALO_RELATION_TYPE_EQUIVALENT_TIPO,
			DEDALO_RELATION_TYPE_INDEX_TIPO,
			DEDALO_RELATION_TYPE_STRUCT_TIPO,
			DEDALO_RELATION_TYPE_MODEL_TIPO,
			DEDALO_RELATION_TYPE_LINK,
			DEDALO_RELATION_TYPE_FILTER
		]; // DEDALO_RELATION_TYPE_RECORD_TIPO


		return $ar_allowed;
	}//end get_allowed_relation_types



	/**
	* GET_REQUEST_VAR
	* Alias of core function get_request_var
	* @return mixed string | bool $var_value
	*/
		// public static function get_request_var(string $var_name) {

		// 	return get_request_var($var_name);
		// }//end get_request_var



	/**
	* TRUNCATE_TEXT
	* Multi-byte truncate or trim text
	* @return string $final_string
	*/
	public static function truncate_text(string $string, int $limit, string $break=" ", string $pad='...') : string {

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

		// add final "..."" when is truncated
			if (!empty($final_string) && strlen($final_string)<strlen($string)) {
				$final_string = $final_string . $pad;
			}

		return $final_string;
	}//end truncate_text



	/**
	* TRUNCATE_HTML
	* Thanks to Søren Løvborg (printTruncated)
	*/
		// public static function DES_truncate_html(int $maxLength, string $html, bool $isUtf8=true) : string {

		// 	$full_text = '';

		// 	if (empty($html)) {
		// 		return $full_text;
		// 	}

		// 	$printedLength	= 0;
		// 	$position		= 0;
		// 	$tags			= array();

		// 	// For UTF-8, we need to count multibyte sequences as one character.
		// 	$re = $isUtf8
		// 		? '{</?([a-z]+)[^>]*>|&#?[a-zA-Z0-9]+;|[\x80-\xFF][\x80-\xBF]*}'
		// 		: '{</?([a-z]+)[^>]*>|&#?[a-zA-Z0-9]+;}';

		// 	while ($printedLength < $maxLength && preg_match($re, $html, $match, PREG_OFFSET_CAPTURE, $position))
		// 	{
		// 		list($tag, $tagPosition) = $match[0];

		// 		// Print text leading up to the tag.
		// 		$str = substr($html, $position, $tagPosition - $position);
		// 		if ($printedLength + strlen($str) > $maxLength)
		// 		{
		// 			#print(substr($str, 0, $maxLength - $printedLength));
		// 			$full_text .= substr($str, 0, $maxLength - $printedLength);
		// 			$printedLength = $maxLength;
		// 			break;
		// 		}

		// 		#print($str);
		// 		$full_text .= $str;
		// 		$printedLength += strlen($str);
		// 		if ($printedLength >= $maxLength) break;

		// 		if ($tag[0] === '&' || ord($tag) >= 0x80)
		// 		{
		// 			// Pass the entity or UTF-8 multibyte sequence through unchanged.
		// 			#print($tag);
		// 			$full_text .= $tag;
		// 			$printedLength++;
		// 		}
		// 		else
		// 		{
		// 			// Handle the tag.
		// 			$tagName = $match[1][0];
		// 			if ($tag[1] === '/')
		// 			{
		// 				// This is a closing tag.

		// 				$openingTag = array_pop($tags);
		// 				//assert($openingTag === $tagName); // check that tags are properly nested.

		// 				// assert($openingTag === $tagName); // check that tags are properly nested.
		// 				// $full_text .= $tag;

		// 				if ($openingTag!==$tagName) {
		// 					debug_log(__METHOD__." Error. openingTag ($openingTag) is different to expected tagName ($tagName)".to_string(), logger::ERROR);
		// 				}else{
		// 					 $full_text .= $tag;
		// 				}
		// 			}
		// 			else if ($tag[strlen($tag) - 2] === '/')
		// 			{
		// 				// Self-closing tag.
		// 				#print($tag);
		// 				$full_text .= $tag;
		// 			}
		// 			else
		// 			{
		// 				// Opening tag.
		// 				#print($tag);
		// 				$full_text .= $tag;
		// 				$tags[] = $tagName;
		// 			}
		// 		}

		// 		// Continue after the tag.
		// 		$position = $tagPosition + strlen($tag);
		// 	}

		// 	// Print any remaining text.
		// 	if ($printedLength < $maxLength && $position < strlen($html))
		// 		#print(substr($html, $position, $maxLength - $printedLength));
		// 		$full_text .= substr($html, $position, $maxLength - $printedLength);

		// 	// Close any open tags.
		// 	while (!empty($tags)) {
		// 		#printf('</%s>', array_pop($tags));
		// 		$full_text .= sprintf('</%s>', array_pop($tags));
		// 	}


		// 	return $full_text;
		// }//end truncate_html



	/**
	* TRUNCATE_HTML
	* Truncate a string up to a number of characters while preserving whole words and HTML tags
	*
	* @param integer $length
	* 	Length of returned string, including ellipsis.
	* @param string $text
	* 	String to truncate
	* @param boolean $considerHtml
	* 	If true, HTML tags would be handled correctly
	* @param string $ending
	* 	Ending to be appended to the trimmed string.
	* @param boolean $exact
	* 	If false, $text will not be cut mid-word
	*
	* @return string $truncate
	* 	Trimmed string.
	*/
	public static function truncate_html(int $length, string $text, bool $considerHtml=true, string $ending = '...', bool $exact=false) : string {

		if ($considerHtml===true) {
			// if the plain text is shorter than the maximum length, return the whole text
			if (strlen(preg_replace('/<.*?>/', '', $text)) <= $length) {
				return $text;
			}
			// splits all html-tags to scan-able lines
			preg_match_all('/(<.+?>)?([^<>]*)/s', $text, $lines, PREG_SET_ORDER);
			$total_length	= strlen($ending);
			$open_tags		= array();
			$truncate		= '';
			foreach ($lines as $line_matchings) {
				// if there is any html-tag in this line, handle it and add it (uncounted) to the output
				if (!empty($line_matchings[1])) {
					// if it's an "empty element" with or without xhtml-conform closing slash
					if (preg_match('/^<(\s*.+?\/\s*|\s*(img|br|input|hr|area|base|basefont|col|frame|isindex|link|meta|param)(\s.+?)?)>$/is', $line_matchings[1])) {
						// do nothing
					// if tag is a closing tag
					} else if (preg_match('/^<\s*\/([^\s]+?)\s*>$/s', $line_matchings[1], $tag_matchings)) {
						// delete tag from $open_tags list
						$pos = array_search($tag_matchings[1], $open_tags);
						if ($pos !== false) {
						unset($open_tags[$pos]);
						}
					// if tag is an opening tag
					} else if (preg_match('/^<\s*([^\s>!]+).*?>$/s', $line_matchings[1], $tag_matchings)) {
						// add tag to the beginning of $open_tags list
						array_unshift($open_tags, strtolower($tag_matchings[1]));
					}
					// add html-tag to $truncate'd text
					$truncate .= $line_matchings[1];
				}
				// calculate the length of the plain text part of the line; handle entities as one character
				$content_length = strlen(preg_replace('/&[0-9a-z]{2,8};|&#[0-9]{1,7};|[0-9a-f]{1,6};/i', ' ', $line_matchings[2]));
				if ($total_length+$content_length> $length) {
					// the number of characters which are left
					$left = $length - $total_length;
					$entities_length = 0;
					// search for html entities
					if (preg_match_all('/&[0-9a-z]{2,8};|&#[0-9]{1,7};|[0-9a-f]{1,6};/i', $line_matchings[2], $entities, PREG_OFFSET_CAPTURE)) {
						// calculate the real length of all entities in the legal range
						foreach ($entities[0] as $entity) {
							if ($entity[1]+1-$entities_length <= $left) {
								$left--;
								$entities_length += strlen($entity[0]);
							} else {
								// no more characters left
								break;
							}
						}
					}
					$truncate .= substr($line_matchings[2], 0, $left+$entities_length);
					// maximum length is reached, so get off the loop
					break;
				} else {
					$truncate .= $line_matchings[2];
					$total_length += $content_length;
				}
				// if the maximum length is reached, get off the loop
				if($total_length>= $length) {
					break;
				}
			}
		}else{
			if (strlen($text) <= $length) {
				return $text;
			} else {
				$truncate = substr($text, 0, $length - strlen($ending));
			}
		}
		// if the words shouldn't be cut in the middle...
		if ($exact===false) {
			// ...search the last occurrence of a space...
			$spacepos = strrpos($truncate, ' ');
			if (isset($spacepos) && $spacepos!==false) {
				// ...and cut the text in this position
				$truncate = substr($truncate, 0, $spacepos);
			}
		}
		// add the defined ending to the text
		$truncate .= $ending;
		if($considerHtml) {
			// close all unclosed html-tags
			foreach ($open_tags as $tag) {
				$truncate .= '</' . $tag . '>';
			}
		}


		return $truncate;
	}//end truncate_html



	/**
	* BUILD_ELEMENT_JSON_OUTPUT
	* It simply groups the context and the data into one object.
	* @param array $context
	* @param array $data
	* @return object $result
	*/
	public static function build_element_json_output(array $context, array $data=[]) : object {

		$element = new stdClass();
			$element->context	= $context;
			$element->data		= $data;

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
	* @return object $json
	*	Object with data and context (configurable) like:
	* {
	* 	context : [...],
	* 	data : [...]
	* }
	*/
	public function get_json(object $options=null) : object {

		$json_cache = false; // experimental. Set false in production (!)

		// Debug
			if(SHOW_DEBUG===true) {
				$get_json_start_time = start_time();
			}

		// options
			$get_context		= $options->get_context ?? true;
			$context_type		= $options->context_type ?? 'default';
			$get_data			= $options->get_data ?? true;
			$get_request_config	= $options->get_request_config ?? false;

		// short vars
			$called_model	= get_class($this);
			$called_tipo	= $this->get_tipo();

		// cache context
			static $resolved_get_json = [];
			if ($json_cache===true) {
				$key_beats = [
					$called_model,
					$called_tipo,
					$this->get_section_id() ?? '',
					($this->get_section_tipo() ?? ''),
					$this->mode,
					$context_type,
					(int)$get_request_config,
					(int)$get_context,
					(int)$get_data
				];
				$cache_key = implode('_', $key_beats);
				if (isset($resolved_get_json[$cache_key])) {
					debug_log(__METHOD__." ////////////////////////////////////// Returned resolved JSON with key: ".to_string($cache_key), logger::DEBUG);
					return $resolved_get_json[$cache_key];
				}
			}

		// old way
			// re-create options object to easy select from JSON controller
				$options = (object)[
					'get_context'			=> $get_context,
					'context_type'			=> $context_type,
					'get_data'				=> $get_data,
					'get_request_config'	=> $get_request_config
				];

			// path. Class name is called class (ex. component_input_text), not this class (common)
				$path = DEDALO_CORE_PATH .'/'. $called_model .'/'. $called_model .'_json.php';

			// controller include
				$json = include( $path );


		// Debug
			if(SHOW_DEBUG===true) {

				$exec_time = exec_time_unit($get_json_start_time).' ms';

				$json->debug = new stdClass();
					$json->debug->exec_time = $exec_time;

				$current_section_tipo	= $this->get_section_tipo() ?? $this->tipo ?? '';
				$current_section_id		= $this->get_section_id() ?? '';

				$len = !empty($called_tipo)
					? strlen($called_tipo)
					: 0;
				$repeat = ($len < 21)
					? (21 - $len)
					: 0;
				$tipo_line = $called_tipo .' '. str_repeat('-', $repeat);
				debug_log(
					'------- get_json --------------------- '. $tipo_line .' '. $exec_time .' ---- '. $called_model.' - '.$current_section_tipo.'.'.$current_section_id,
					logger::DEBUG
				);
			}

		// cache
			if ($json_cache===true) {
				$resolved_get_json[$cache_key] = $json;
			}


		return $json;
	}//end get_json



	/**
	* GET_STRUCTURE_CONTEXT
	* 	Common function to resolve element context
	* @param int $permissions = 0
	* @param bool $add_request_config = false
	*
	* @return dd_object $dd_object
	*/
	public function get_structure_context(int $permissions=0, bool $add_request_config=false) : dd_object {

		if(SHOW_DEBUG===true) {
			$start_time = start_time();
		}

		// short vars
			$model			= get_class($this);
			$tipo			= $this->get_tipo();
			$section_tipo	= $this->get_section_tipo();
			$translatable	= $this->RecordObj_dd->get_traducible()==='si';
			$mode			= $this->get_mode();
			$label			= $this->get_label();
			$lang			= $this->get_lang();
			$sortable		= $this->get_sortable() ?? false; // Used by section columns to sort list

		// cache structure_context using ddo_key
			// (!) Note that 'sections_json.php' will filter out duplicated context items using this criteria:
			// 	$el->tipo===$context_item->tipo &&
			// 	$el->section_tipo===$context_item->section_tipo &&
			// 	$el->mode===$context_item->mode;
				$use_cache = true;
				if ($use_cache===true) {
					$ddo_key = $tipo.'_'.$section_tipo.'_'.$mode;
					if (isset(self::$structure_context_cache[$ddo_key])) {
						if(SHOW_DEBUG===true) {
							$len = !empty($this->tipo)
								? strlen($this->tipo)
								: 0;
							$repeat = ($len < 21)
								? (21 - $len)
								: 0;
							$tipo_line = $this->tipo .' '. str_repeat('-', $repeat);
							debug_log(
								'------- get_structure_context CACHED - ' . $tipo_line .' '. exec_time_unit($start_time,'ms').' ms' . " ---- $model ". json_encode($add_request_config),
								logger::DEBUG
							);
						}
						return self::$structure_context_cache[$ddo_key];
					}
				}

		// properties
			$properties = $this->get_properties() ?? new stdClass();
			$remove_edit_css = false;
			// set properties of the section_list node
			// section and component_portal could has a section_list node with the list definition
			// (in section case is mandatory but in component_portal is optional)
			// in this cases the properties will be get from the section_list instead the main node
			if(($model==='section' || $model==='component_portal') && $this->mode==='list'){
				// section list, get the section_list node as child of the main component.
				$ar_terms = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
					$this->tipo,
					'section_list',
					'children',
					true
				);
				if(isset($ar_terms[0])) {
					$RecordObj_dd	= new RecordObj_dd($ar_terms[0]);
					$properties		= $RecordObj_dd->get_properties();
				}else{
					// in cases that section_list is not present (usually component_portal)
					// remove the edit css, it happens because the main term, by default, defines the edit behavior in ontology
					$remove_edit_css = true;
				}
			}else{
				// all other components need to remove edit css
				$remove_edit_css = true;
			}

		// css
			$css = $properties->css ?? null;
			$css = ($remove_edit_css === true && $this->mode==='list')
				? null
				: $css;

			if (isset($properties->css)) {
				// remove from properties object
				unset($properties->css);
			}
			// (!) new. Section overwrite css (virtual sections case)
			// see sample at section 'rsc170'
			if (strpos($model, 'component_')===0) {
				$RecordObj_dd		= new RecordObj_dd($section_tipo);
				$section_properties	= $RecordObj_dd->get_properties();
				if (isset($section_properties->css) && isset($section_properties->css->{$tipo})) {
					$css = $section_properties->css->{$tipo};
				}
			}

		// parent
			// 1 . From requested context
				// if (isset(dd_core_api::$dd_request)) {

				// 	$dd_request		= dd_core_api::$dd_request;
				// 	$request_ddo	= array_find($dd_request, function($item){
				// 		return $item->typo==='request_ddo';
				// 	});

				// 	// ar_dd_objects . Array of all dd objects in requested context
				// 		// $ar_dd_objects = array_values( array_filter($dd_request, function($item) {
				// 		// 	 if($item->typo==='ddo') return $item;
				// 		// }) );
				// 		$ar_dd_objects = $request_ddo
				// 			? $request_ddo->value
				// 			: [];

				// 	if (isset($this->from_parent)) {
				// 		$current_from_parent = $this->from_parent;
				// 		$request_dd_object = array_reduce($ar_dd_objects, function($carry, $item) use($tipo, $section_tipo, $current_from_parent){
				// 			if ($item->tipo===$tipo && $item->section_tipo===$section_tipo && $item->parent===$current_from_parent) {
				// 				return $item;
				// 			}
				// 			return $carry;
				// 		});
				// 	}else{
				// 	 	$request_dd_object = array_reduce($ar_dd_objects, function($carry, $item) use($tipo, $section_tipo){
				// 			if ($item->tipo===$tipo && $item->section_tipo===$section_tipo) {
				// 				return $item;
				// 			}
				// 			return $carry;
				// 		});
				// 	}
				// 	if (!empty($request_dd_object->parent)) {
				// 		// set
				// 		$parent = $request_dd_object->parent;
				// 	}
				// }

			// 1 . From session
				if (isset($_SESSION['dedalo']['config']['ddo'][$section_tipo])) {

					$section_ddo = $_SESSION['dedalo']['config']['ddo'][$section_tipo];

					if (isset($this->from_parent)) {
						$current_from_parent = $this->from_parent;
						$dd_object = array_reduce($section_ddo, function($carry, $item) use($tipo, $section_tipo, $current_from_parent){
							if ($item->tipo===$tipo && $item->section_tipo===$section_tipo && $item->parent===$current_from_parent) {
								return $item;
							}
							return $carry;
						});
					}else{
						$dd_object = array_reduce($section_ddo, function($carry, $item) use($tipo, $section_tipo){
							if ($item->tipo===$tipo && $item->section_tipo===$section_tipo) {
								return $item;
							}
							return $carry;
						});
					}
					if (!empty($dd_object->parent)) {
						// set
						$parent = $dd_object->parent;
					}
				}

			// 2 . From injected 'from_parent'
				if (!isset($parent) && isset($this->from_parent)) {

					// injected by the element
					$parent = $this->from_parent;
				}

			// 3 . From structure (fallback)
				if (!isset($parent)) {

					// use section tipo as parent
					$parent = $this->get_section_tipo();
				}

			// 4 . From structure (area case)
				if (empty($parent)) {

					// use structure term tipo as parent
					$parent = $this->RecordObj_dd->get_parent();
				}

		// parent_grouper (structure parent)
			$parent_grouper = !empty($this->parent_grouper)
				? $this->parent_grouper
				: $this->RecordObj_dd->get_parent();

		// tools
			$tools		= [];
			$tools_list	= $this->get_tools();
			foreach ($tools_list as $tool_object) {

				// mode check. If defined and is not the actual, skip tool
				if (isset($tool_object->properties->mode) && $tool_object->properties->mode!==$mode) {
					continue;
				}
				// tool_config
				$tool_config	= isset($properties->tool_config->{$tool_object->name})
					? $properties->tool_config->{$tool_object->name}
					: null;

				// tool context
				$current_tool_section_tipo	= $this->get_section_tipo() ?? $this->tipo;
				$tool_context				= tool_common::create_tool_simple_context(
					$tool_object,
					$tool_config,
					$this->tipo,
					$current_tool_section_tipo
				);
				// add
				$tools[] = $tool_context;
			}//end foreach ($tools_list as $item)

		// buttons
			$buttons = $this->get_buttons_context();

		// request_config
			$request_config = ($add_request_config===true)
				? $this->build_request_config() // array
				:  null;

		// columns_map (the final calculation was moved to common JS)
			$columns_map = !empty($request_config)
				? ($this->get_columns_map() ?? [])
				: null;

		// legacy_model
			$legacy_model = RecordObj_dd::get_legacy_model_name_by_tipo($this->tipo);

		// dd_object
			$dd_object = new dd_object((object)[
				'label'				=> $label, // *
				'tipo'				=> $tipo,
				'section_tipo'		=> $section_tipo, // *
				'model'				=> $model, // *
				'legacy_model'		=> $legacy_model,
				'parent'			=> $parent, // *
				'parent_grouper'	=> $parent_grouper,
				'lang'				=> $lang,
				'mode'				=> $mode,
				'translatable'		=> $translatable,
				'properties'		=> $properties,
				'css'				=> $css,
				'permissions'		=> $permissions,
				'tools'				=> $tools,
				'buttons'			=> $buttons,
				'request_config'	=> $request_config,
				'columns_map'		=> $columns_map,
				'sortable'			=> $sortable
			]);

		// optional properties
			// filter_by_list
				if (isset($properties->source->filter_by_list)) {
					// Calculate array of elements to show in filter. Resolve self section items
						$filter_list = array_map(function($item){
							$item->section_tipo = ($item->section_tipo==='self')
								? $this->get_section_tipo()
								: $item->section_tipo;
							return $item;
						}, $properties->source->filter_by_list);

					$filter_by_list = component_relation_common::get_filter_list_data($filter_list);
					$dd_object->filter_by_list = $filter_by_list;
				}

			// specific by model
				if (strpos($model, 'component_')===0) {

					// component specific

					if (isset($properties->state_of_component)) {
						foreach ($properties->state_of_component as $soc_key => $soc_value) {
							if (isset($soc_value->target_component) && isset($soc_value->msg)) {
								// resolve label
								$base_label		= label::get_label( $soc_value->msg );
								$component_name	= RecordObj_dd::get_termino_by_tipo($soc_value->target_component, DEDALO_APPLICATION_LANG, true);
								$msg			= sprintf($base_label, $component_name);
								// replace label by just resolved version
								$soc_value->msg = $msg;
							}
						}
					}

					if ($sortable===true) {
						// add component path to allow sort columns properly
						// ? remove if because forbids cache list mode uniformly
						// if (!empty($this->from_parent)) {
							$dd_object->path = isset($this->request_config)
								? $this->get_order_path($tipo, $section_tipo)
								: [];
						// }
					}
					if ($mode==='search') {
						// search operators info (tool tips)
						$dd_object->search_operators_info	= $this->search_operators_info();
						$dd_object->search_options_title	= search::search_options_title($dd_object->search_operators_info);
					}else{

						$new_dataframe = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
							$this->tipo,
							'component_dataframe',
							'children',
							true
						);

						$dd_object->new_dataframe = (!empty($new_dataframe))
							? $new_dataframe[0]
							: null;

						// component info from Ontology (!) For now it is not used because it affects speed.
						// $dd_object->ontology_info = $this->get_ontlogy_info();
					}

					// set the show_interface of shared sections
					// check if the matrix table of the target section is matrix_dd (shared table between installations as yes/no list)
					// if target section is a shared section, remove the button edit and button list of the interface
					// Note 03-06-2024: To prevent unneeded calculations (permissions too), restrict target_section_ddo to
					// calls with add_request_config = true
					if ($add_request_config===true) {

						$ar_target_section_ddo = $this->get_ar_target_section_ddo();

						// user id
						$user_id_logged = logged_user_id();

						foreach ($ar_target_section_ddo as $current_section_ddo) {
							if(		isset($current_section_ddo->matrix_table)
								&&  $current_section_ddo->matrix_table==='matrix_dd'
								&&  $user_id_logged!=DEDALO_SUPERUSER
								){

								if(!isset($properties->show_interface)){
									$properties->show_interface = new stdClass();
								}

								$properties->show_interface->button_edit = false;
								$properties->show_interface->button_list = false;
							}
						}
					}

				}else if($model==='section') {

					// section_map.
					// Used to point specific components into common definitions
					// ex:  "hierarchy25" in thesaurus or "tch152" components can be mapped to "term" to be searched in the same way
					// term will be "hierarchy25" in thesaurus or will be object name in tangible heritage.
					// Uses: 	to show children option in search panel
					// 			to show the term in the thesaurus tree
					// sample:
						// {
						//	"thesaurus": {
						//		"term": "hierarchy25",
						//		"model": "hierarchy27",
						//		"order": "hierarchy48",
						//		"parent": "hierarchy36",
						//		"is_indexable": "hierarchy24",
						//		"is_descriptor": "hierarchy23"
						//	}
						// }
						$dd_object->section_map = section::get_section_map( $section_tipo );

					// (!) Removed 01-06-2023 because don't follow dd_object definitions
					// and apparently is not used by anyone
						// section specific. relation_list // time_machine_list
							// $dd_object->relation_list		= $this->get_relation_list_tipo();
							// $dd_object->time_machine_list	= $this->get_time_machine_list_tipo();

						$ar_children_tipo = section::get_ar_children_tipo_by_model_name_in_section(
							$this->tipo,
							['relation_list'], // ar_model_name_required
							true, // from cache
							true, // resolve virtual
							false, // bool recursive
							true // bool search_exact
						);
						if (!isset($dd_object->config)) {
							$dd_object->config = new stdClass();
						}
						$dd_object->config->relation_list_tipo = $ar_children_tipo[0] ?? null;

					// section matrix_table
						$dd_object->matrix_table = common::get_matrix_table_from_tipo( $section_tipo );
				}

			// view, all components has view, used to change the render view.
			// the default value is "default" except in component_portal
				$dd_object->view = $this->get_view();

			// children_view. Sometimes the component defines the view of his children (see rsc368)
				$dd_object->children_view = $this->get_children_view();

			// search
				if ($this->mode==='search') {
					// parent_grouper_label
					if (isset($parent_grouper)) {
						if (!isset($dd_object->config)) {
							$dd_object->config = new stdClass();
						}
						$dd_object->config->parent_grouper_label = RecordObj_dd::get_termino_by_tipo($parent_grouper);
					}
				}

		// cache. fix context dd_object
			if ($use_cache===true) {
				self::$structure_context_cache[$ddo_key] = $dd_object;
			}

		// Debug
			if(SHOW_DEBUG===true) {
				$time = exec_time_unit($start_time,'ms');

				$debug = new stdClass();
					$debug->exec_time	= $time.' ms';

				$dd_object->debug = $debug;

				if ($time>15) {
					$time_string = $time>15
						? sprintf("\033[31m%s\033[0m", $time)
						: $time;
					$len = !empty($this->tipo)
						? strlen($this->tipo)
						: 0;
					$repeat = ($len < 14)
						? (14 - $len)
						: 0;
					$tipo_line = $this->tipo .' '. str_repeat('-', $repeat);
					error_log('------- SLOW get_structure_context --- '."$tipo_line $time_string ms" . " ---- $model - parent:". $parent .' '.json_encode($add_request_config));
				}
			}


		return $dd_object;
	}//end get_structure_context



	/**
	* GET_STRUCTURE_CONTEXT_SIMPLE
	* @param int $permissions = 0
	* @param bool $add_request_config = false
	* @return dd_object $full_ddo
	*/
	public function get_structure_context_simple(int $permissions=0, bool $add_request_config=false) : dd_object {

		// tools. Force set $this->tools to prevent calculate tools in simple mode
		$this->tools = [];

		// buttons_context. Force to avoid calculate buttons_context (also involves calculating permissions)
		$this->buttons_context = [];

		// permissions. Force set $this->permissions to prevent calculate permissions in simple mode
		$this->set_permissions($permissions);

		// call general method
		$full_ddo = $this->get_structure_context($permissions, $add_request_config);

		// dd_object
			// $dd_object = new dd_object((object)[
			// 	'label'			=> $full_ddo->label,
			// 	'tipo'			=> $full_ddo->tipo,
			// 	'section_tipo'	=> $full_ddo->section_tipo,
			// 	'model'			=> $full_ddo->model,
			// 	'parent'		=> $full_ddo->parent,
			// 	'lang'			=> $full_ddo->lang,
			// 	'mode'			=> $full_ddo->mode,
			// 	'translatable'	=> $full_ddo->translatable,
			// 	'permissions'	=> $full_ddo->permissions,
			// ]);


		return $full_ddo;
	}//end get_structure_context_simple



	/**
	* GET_SUBDATUM
	* Used by sections and portal that has relations with other components and it need get the information of the other components
	* subdatum: is the context and data of every section or component that the caller (this component) need to show, search or select
	* ex: if the caller is a portal that call to toponymy section it will need the context and data of the pointer section and the components that will be showed or searched.
	* This method use the data of the caller (ar_locators) to get only the data to be used, ex: only the first records of the section to show in list mode.
	* For get the subdatum will used the request_config. If the request_config has external api it will get the section of the ontology that has the representation of the external service (Zenon)
	* @param string $from_parent = null
	* @param array $ar_locators = []
	* @return object $subdatum
	* 	Object with two properties: context, data
	*/
	public function get_subdatum(string $from_parent=null, array $ar_locators=[], object $subdatum_options=null) : object {

		// debug
			if(SHOW_DEBUG===true) {
				$start_time = start_time();
				$len = !empty($this->tipo)
					? strlen($this->tipo)
					: 0;
				$repeat = ($len < 35)
					? (35 - $len)
					: 0;
				$tipo_line = $this->tipo .' '. str_repeat('-', $repeat);
				debug_log(
					'------- get_subdatum start ----------- '. $tipo_line.' '. get_class($this) .' -- '. ($this->get_section_tipo() ?? $this->tipo).'-'.$this->get_section_id(),
					logger::DEBUG
				);
			}

		// dump(null, ' get_ar_subcontext call this **************************** '.to_string($this->tipo).' - $from_parent: '.$from_parent);

		$ar_subcontext	= [];
		$ar_subdata		= [];

		// already_calculated
			// static $ar_subcontext_calculated = [];

		// request_config. On empty return empty context and data object
			$request_config = $this->context->request_config ?? null;
			if(empty($request_config)) {
				debug_log(__METHOD__
					." Empty request config. Ignored subdatum  ". PHP_EOL
					.' tipo: ' . to_string($this->tipo). PHP_EOL
					.' context: ' . to_string($this->context)
					, logger::ERROR
				);
				// no request config case. Return empty here
				return (object)[
					'context'	=> [],
					'data'		=> []
				];
			}

		// select api_engine dedalo only configs
			// $request_config_dedalo = array_filter($request_config, function($el){
			// 	return $el->api_engine==='dedalo';
			// });

		// children_resursive function, used to get all children for specific ddo and inject the result to new request_config (inheritance request from parent)
			if (!function_exists('get_children_recursive')) {
				function get_children_recursive(array $ar_ddo, object $dd_object) : array {
					$ar_children = [];
					foreach ($ar_ddo as $ddo) {
						if($ddo->parent===$dd_object->tipo) {
							$ar_children[] = $ddo;
							$result = get_children_recursive($ar_ddo, $ddo);
							if (!empty($result)) {
								$ar_children = array_merge($ar_children, $result);
							}
						}
					}

					return $ar_children;
				}
			}

		// full_ddo_map. Get the full ddo in every request_config
			$full_ddo_map = [];
			foreach ($request_config as $request_config_object) {

				// skip empty ddo_map
				if(empty($request_config_object->show->ddo_map)) {
					debug_log(__METHOD__
						. " Ignored empty show ddo_map " . PHP_EOL
						. ' (tipo: '.$this->tipo.' - '. RecordObj_dd::get_termino_by_tipo($this->tipo) .')' . PHP_EOL
						. ' in request_config_object (It may be due to a lack of permissions in their children). request_config_object:' . PHP_EOL
						. to_string($request_config_object),
						logger::WARNING
					);
					continue;
				}
				// merge all ddo of all request_config
				$full_ddo_map = array_merge(
					$full_ddo_map,
					$request_config_object->show->ddo_map
				);
				// hide
				// if request config has hide property defined, add his ddo_map to be resolved
				if( isset($request_config_object->hide) && isset($request_config_object->hide->ddo_map)){
					$full_ddo_map = array_merge(
						$full_ddo_map,
						$request_config_object->hide->ddo_map
					);
				}
			}//end foreach ($request_config_dedalo as $request_config_object)
			// remove duplicates, sometimes the portal point to other portal with two different bifurcations, and the portal pointed is duplicated in the request_config (dedalo, Zenon,...)
			$full_ddo_map = array_unique($full_ddo_map, SORT_REGULAR);

		// get the context and data for every locator
			foreach($ar_locators as $current_locator) {

				// check locator format
					if (!is_object($current_locator)) {
						// throw new Exception("Error Processing Request. current_locator is not an object", 1);
						debug_log(
							__METHOD__." Error Processing Request. urrent_locator is NOT an expected object. Ignored locator ! " .PHP_EOL
							.' locator: '.to_string($current_locator),
							logger::ERROR
						);
						continue;
					}

				$section_id		= $current_locator->section_id;
				$section_tipo	= $current_locator->section_tipo;
				$section_id_key	= $current_locator->section_id;

				// get only the direct ddos that are compatible with the current locator. His section_tipo is the same that the current locator.
				// but when the ddo is a component_dataframe (used as sub section as data frame of the locator) get include it.
				$ar_ddo = array_filter($full_ddo_map, function($ddo) use($section_tipo){
					return 	$ddo->section_tipo===$section_tipo ||
							(is_array($ddo->section_tipo) && in_array($section_tipo, $ddo->section_tipo)) ||
							(isset($ddo->model) && $ddo->model === 'component_dataframe');
				});

				// ar_ddo iterate
				foreach($ar_ddo as $dd_object) {
					$ddo_start_time = start_time();
					// use the locator section_tipo.
					// when the ddo is a component_dataframe (used as sub section as data frame or semantic_node of the locator)
					// use his own section_tipo, it's totally dependent of the section_id of the locator and it's compatible.
					// Note: it's different of the multiple section_tipo as es1, fr1, etc that every locator define his own ddo compatibles.
						// reference: oh24 -> old semantic_node
						// reference: numisdata161 -> old dataframe

					// skip security_areas
						if($dd_object->tipo===DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO) {
							// 'component_security_areas' removed in v6 but the component will stay in ontology,
							// PROVISIONAL, only in the alpha state of V6 for compatibility of the ontology of V5.
							continue;
						}
					// short vars
						$current_tipo	= $dd_object->tipo;
						$model			= ( isset($dd_object->model) )
							? $dd_object->model
							: RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
						$view			= $dd_object->view ?? null;

						// dataframe case
						// dataframe ddo need to get section_tipo has it has defined
						// dataframe store his data in the same section than main component,
						// so, dataframe subdatum will be calculated with his own section_tipo definition
						// and the section_id of the main component (instead the locator, dataframe is not in the target section)
						if($model === 'component_dataframe'){
							$section_tipo = is_array($dd_object->section_tipo)
								? reset($dd_object->section_tipo)
								: $dd_object->section_tipo;

							$section_id_key	= $current_locator->section_id; // section_id_key link the dataframe data to the main locator
							$section_id		= $this->get_section_id(); // the section that call to component, not the component

						}else{
							// standard use of the locator to get data of the ddo
							$section_id		= $current_locator->section_id;
							$section_tipo	= $current_locator->section_tipo;
							$section_id_key	= $current_locator->section_id;
						}

						$current_section_tipo = $section_tipo; //$dd_object->section_tipo ?? $dd_object->tipo;
						// if the component is a dataframe assign a possible suffix to be used
						$dataframe_tm_mode = (get_called_class() === 'component_dataframe')
							? '_dataframe'
							: '';
						// if the component or section is in tm mode propagate the mode to the ddo
						// and it's a dataframe add the suffix '_dataframe' to differentiate it of the tm mode in the component
						// see radio_button case of the dataframe component of the numisdata161
						$mode = $this->mode==='tm'
							? 'tm' . $dataframe_tm_mode // propagate tm mode from parent
							: ($dd_object->mode ?? $this->get_mode());

					// prevent resolve non children from path ddo, remove the non direct child,
					// it will be calculated by his parent (in recursive loop)
						if (isset($dd_object->parent) && $dd_object->parent!==$this->tipo) {
							if(SHOW_DEBUG===true) {
								dump($dd_object, ' SKIP dd_object (parent!=$this->tipo) ++'.to_string($this->tipo));
							}
							continue;
						}


					// ar_subcontext_calculated
						// $cid = $current_section_tipo . '_' . $section_id . '_' . $current_tipo;
						// if (in_array($cid, $ar_subcontext_calculated)) {
						// // if (isset($ar_subcontext_calculated[$cid])) {
						// 	debug_log(__METHOD__." Error Processing Request. Already calculated! ".$cid .to_string(), logger::ERROR);
						// 	// throw new Exception("Error Processing Request. Already calculated! ".$cid, 1);
						// 	// continue;
						// 	// $related_element = $ar_subcontext_calculated[$cid];
						// }

					// common temporal excluded/mapped models *******
						// $match_key = array_search($model, common::$ar_temp_map_models);
						$mapped_model = isset(common::$ar_temp_map_models[$model])
							? common::$ar_temp_map_models[$model]
							: false;
						if (false!==$mapped_model) {
							// mapped model
							$model = $mapped_model;
							debug_log(__METHOD__." +++ Mapped model $model to $mapped_model from layout map ".to_string(), logger::WARNING);
						}else if (in_array($model, common::$ar_temp_exclude_models)) {
							// excluded model
							debug_log(__METHOD__." +++ Excluded model $model from layout map ".to_string(), logger::WARNING);
							continue;
						}

					// related_element switch
						switch (true) {

							// section case (will be used in areas calculations with multiple sections)
							case ($model==='section'):
								// section
									$section = section::get_instance($section_id, $section_tipo, $mode, $cache=true);

								// datos column already resolved case, inject data in current section
									$datos = isset($current_locator->datos) ? json_decode($current_locator->datos) : null;
									if (!is_null($datos)) {
										$section->set_dato($datos);
									}

								// get component JSON (include context and data)
									// $element_json = $section->get_json();
									$related_element = $section;
								break;

							// component case
							case (strpos($model, 'component_')===0):

								// who call sub-datum. Could be a component_portal or a section
								$source_model = get_called_class();

								// caller_dataframe cases
								$caller_dataframe = (strpos($source_model, 'component_')===0)
									? (object)[
										'section_id_key'	=> $section_id_key,
										// 'tipo_key'			=> $this->tipo,
										'section_tipo'		=> $this->get_section_tipo(),
									  ]
									: null;

								// create the component child and inject his configuration (or use the default if the parent don't has specific request_config for it)
								$current_lang		= $dd_object->lang ?? common::get_element_lang($current_tipo, DEDALO_DATA_LANG);
								$related_element	= component_common::get_instance(
									$model,
									$current_tipo,
									$section_id,
									$mode,
									$current_lang,
									$current_section_tipo,
									true,
									$caller_dataframe // object|null
								);

								// Permissions inheritance.
								// Get the permissions to inject to children.
								// Situation :
								// The user can access to the source portal (permissions 1 or 2), but he/she can not access to target section (permissions 0).
								// in this situation the user need to read the data of the target section because he/she can access to the source portal
								// and he/she will be able to search with autocomplete, to assign data to the portal (or link data).
								// Behavior:
								// When a component has data to show but the user don't has permissions to access to target section
								// or target components, the target component need to be set as read (permissions 1)
								// the user will need read the portal and his data, event if they can not change the target section.
								// The same case happens with the searched section with autocomplete.
								// The user will need to read the target section and his components to choose data.
								// Exception:
								// if the user can read or read/write permissions, do not change it.
									$child_permissions = $related_element->get_component_permissions();
									if(strpos(get_called_class(), 'component_')===0 || (
										get_called_class() === 'section' && $this->autocomplete===true
									)){
										if($child_permissions <1){
											$related_element->set_permissions(1);
										}
									}

								// component_text_area lang case. Change lang before get dato (!)
									if ($model==='component_text_area') {
										$original_lang = $related_element->get_original_lang();
										if (!empty($original_lang) && $original_lang!==$current_lang) {
											$related_element->set_lang($original_lang);
										}
									}

								// component_info get dato case.
								// get the data from database instead the calculation
								// do not use the default get_dato() because it's calculated by observer and save in DB
									if ($model==='component_info') {
										$related_element->use_db_data = true;
									}

								// pagination->limit. Get limit from component calculation or if it's defined from ddo
								// Sample of use is request config: numisdata11 (ordered coins)
									if(isset($dd_object->limit)){
										// $dbt = debug_backtrace();
										// dump($dbt, ' dbt ++ '.to_string());
										$related_element->pagination->limit = $dd_object->limit;
									}

								// data_source inherit
									// if (isset($this->data_source)) {
									// 	$related_element->data_source = $this->data_source;
									// }

								// virtual request_config, create new request config to be injected to the current_ddo.
								// the current component has the configuration to all children components,
								// and it's necessary calculate the new request_config that will be use in the next loop
								// the main component has all config, his children has specific config (only his own part)
									// get the component rqo to be updated with the current config
									$component_request_config = $related_element->build_request_config();
									foreach ($request_config as $request_config_object) {

										// use the current api_engine to ensure the inheritance has correct relation dd_engine -> dd_engine, zenon - >zenon
											$api_engine			= $request_config_object->api_engine;
											$children_show		= isset($request_config_object->show)
												? get_children_recursive($request_config_object->show->ddo_map, $dd_object)
												: null;
											$children_search	= isset($request_config_object->search)
												? get_children_recursive($request_config_object->search->ddo_map, $dd_object)
												: null;
											$children_choose	= isset($request_config_object->choose)
												? get_children_recursive($request_config_object->choose->ddo_map, $dd_object)
												: null;
											$children_hide		= isset($request_config_object->hide)
												? get_children_recursive($request_config_object->hide->ddo_map, $dd_object)
												: null;

										// select the current api_engine
											$new_request_config_object = array_find($component_request_config, function($el) use($api_engine){
												return $el->api_engine===$api_engine;
											});
											if (empty($new_request_config_object) || !is_object($new_request_config_object)) {
												// debug_log(__METHOD__
												// 	. " Error. Expected request config but value is empty from component_request_config " . PHP_EOL
												// 	. ' tipo: ' 	 . $this->tipo . PHP_EOL
												// 	. ' dd_object: ' . to_string($dd_object) . PHP_EOL
												// 	. ' component_request_config: ' .PHP_EOL. json_encode($component_request_config, JSON_PRETTY_PRINT) . PHP_EOL
												// 	, logger::ERROR
												// );
												continue;
											}

										// set the ddo_map with the new config
											if (!empty($children_show)) {
												$new_request_config_object->show->ddo_map  = $children_show;
											}
											if (!empty($children_search)) {
												if (empty($new_request_config_object->search)) {
													$new_request_config_object->search = (object)[
														'ddo_map' => []
													];
												}
												$new_request_config_object->search->ddo_map  = $children_search;
											}
											if (!empty($children_choose)) {
												if (empty($new_request_config_object->choose)) {
													$new_request_config_object->choose = (object)[
														'ddo_map' => []
													];
												}
												$new_request_config_object->choose->ddo_map  = $children_choose;
											}
											if (!empty($children_hide)) {
												if (empty($new_request_config_object->hide)) {
													$new_request_config_object->hide = (object)[
														'ddo_map' => []
													];
												}
												$new_request_config_object->hide->ddo_map  = $children_hide;
											}

									}//end foreach ($request_config as $request_config_object)

								// Inject the request_config inside the component
									$related_element->request_config = $component_request_config;

								// Inject this tipo as related component from_component_tipo
									if (strpos($source_model, 'component_')===0){
										$related_element->from_component_tipo	= $this->tipo;
										$related_element->from_section_tipo		= $this->get_section_tipo();
									}

								// inject view
									if(!empty($view)){
										$related_element->view = $view;
									}
								break;

							// grouper case
							case (in_array($model, common::$groupers)):
								$related_element = new $model($current_tipo, $current_section_tipo, $mode);
								break;

							// others case
							default:
								debug_log(__METHOD__
									. " Ignored model '$model' - current_tipo: '$current_tipo'  - ". PHP_EOL
									. RecordObj_dd::get_termino_by_tipo($current_tipo)
									, logger::WARNING
								);
								break;
						}//end switch (true)

					// add
						if (isset($related_element)) {

							// Inject var from_parent as from_parent
								if (isset($from_parent)) {
									$related_element->from_parent = $from_parent;
								}

							// parent_grouper
								if (isset($dd_object->parent_grouper)) {
									$related_element->parent_grouper = $dd_object->parent_grouper;
								}

							// properties injection
								if (isset($dd_object->properties)) {

									$properties = $related_element->get_properties() ?? new stdClass();
									foreach ($dd_object->properties as $key => $value) {
										$properties->$key = $value;
									}
									$related_element->set_properties($properties);
								}

							// skip_subdatum subdatum_options
								$bool_get_data = true;
								// (!) Commented because currently all portals are direct (included set dato external cases). To consider to use in the future
								// if (isset($subdatum_options->skip_subdatum) && $mode === 'edit') {
								// 	$legacy_model = RecordObj_dd::get_legacy_model_name_by_tipo($current_tipo);
								// 	if(in_array($legacy_model, $subdatum_options->skip_subdatum)) {
								// 		$bool_get_data = false;
								// 		dump($bool_get_data, ' bool_get_data ++ '.$current_tipo.' -  '.to_string($model));
								// 	}
								// }

							// get the JSON context of the related component
								$item_options = new stdClass();
									$item_options->get_context	= true;
									$item_options->get_data		= $bool_get_data;
								$element_json = $related_element->get_json($item_options);

							// ar_subcontext
								$ar_subcontext = array_merge($ar_subcontext, $element_json->context);
									// dump($ar_subcontext, ' ar_subcontext +---///////--------------+ '.to_string());

							// row_section_id
							// add parent_section_id with the main locator section_id that define the row, to preserve row coherence between all columns
							// (some columns can has other portals or subdata and it's necessary to preserve the root locator section_id)
							// add parent_tipo with the caller tipo, it defines the global context (portal or section) that are creating the rows.
								$ar_final_subdata = [];
								foreach ($element_json->data as $value_obj) {

									$value_obj->row_section_id	= $current_locator->section_id;
									$value_obj->parent_tipo		= $this->tipo;

									$ar_final_subdata[] = $value_obj;
								}

							// dd_info, additional information to the component, like parents
								$value_with_parents = $dd_object->value_with_parents ?? false;
								if ($value_with_parents===true) {
									$dd_info = common::get_ddinfo_parents($current_locator, $this->tipo);
									$ar_final_subdata[] = $dd_info;
								}

							// data add
								$ar_subdata = array_merge($ar_subdata, $ar_final_subdata);
						}//end if (isset($related_element))

					// add calculated subcontext
						// $ar_subcontext_calculated[] = $cid;

					if(SHOW_DEBUG===true) {
						$len = !empty($dd_object->tipo)
							? strlen($dd_object->tipo)
							: 0;
						$repeat = ($len < 21)
							? (21 - $len)
							: 0;
						$tipo_line = $dd_object->tipo .' '. str_repeat('-', $repeat);

						debug_log(
							'------- resolve ddo ------------------ '.$tipo_line.' '.exec_time_unit($ddo_start_time,'ms').' ms' . ' ---- ' . $related_element->get_model(),
							logger::DEBUG
						);
					}
				}//end foreach ($layout_map as $section_tipo => $ar_list_tipos) foreach ($ar_list_tipos as $current_tipo)

			}//end foreach($ar_locators as $current_locator)


		// subdatum
			$subdatum = new stdClass();
				$subdatum->context	= $ar_subcontext;
				$subdatum->data		= $ar_subdata;

		// debug
			if(SHOW_DEBUG===true) {
				$time = exec_time_unit($start_time,'ms');
				$time_string = $time>50
					? sprintf("\033[31m%s\033[0m", $time)
					: $time;
				$len = !empty($this->tipo)
					? strlen($this->tipo)
					: 0;
				$repeat = ($len < 21)
					? (21 - $len)
					: 0;
				$tipo_line = $this->tipo .' '. str_repeat('-', $repeat);
				debug_log(
					'------- get_subdatum ----------------- '."$tipo_line $time_string ms ---- ". get_class($this) .' -- '. ($this->get_section_tipo() ?? $this->tipo).'-'.$this->get_section_id(),
					logger::DEBUG
				);
			}


		return $subdatum;
	}//end get_subdatum



	/**
	* BUILD_COMPONENT_SUBDATA
	* @return object $element_json
	*/
		// public function build_component_subdata(string $model, string $tipo, $section_id, string $section_tipo, string $mode, string $lang, string$source_model, $custom_dato='no_value') : object {

		// 	// components
		// 		$current_component = component_common::get_instance(
		// 			$model,
		// 			$tipo,
		// 			$section_id,
		// 			$mode,
		// 			$lang,
		// 			$section_tipo
		// 		);
		// 	// null component, when the data is not correct or the tipo don't mach with the ontology (ex:time machine data of old components)
		// 		if($current_component === null){
		// 			$value = false;

		// 			// data item
		// 			$item  = $this->get_data_item($value);
		// 				$item->parent_tipo			= $this->get_tipo();
		// 				$item->parent_section_id	= $this->get_section_id();
		// 				$data = [$item];

		// 			$element_json = new stdClass();
		// 				$element_json->context 	= [];
		// 				$element_json->data 	= $data;

		// 			return $element_json;
		// 		}

		// 	// properties
		// 		// if (isset($dd_object->properties)){
		// 		// 	$current_component->set_properties($dd_object->properties);
		// 		// }
		// 	// Inject this tipo as related component from_component_tipo
		// 		if (strpos($source_model, 'component_')===0){
		// 			$current_component->from_component_tipo = $this->tipo;
		// 			$current_component->from_section_tipo 	= $this->section_tipo;
		// 		}

		// 	// inject dato if is received
		// 		if ($custom_dato!=='no_value') {
		// 			$current_component->set_dato($custom_dato);
		// 		}

		// 	// get component json
		// 		$get_json_options = new stdClass();
		// 			$get_json_options->get_context	= false;
		// 			$get_json_options->get_data		= true;
		// 		$element_json = $current_component->get_json($get_json_options);

		// 	// dd_info, additional information to the component, like parents
		// 		// $value_with_parents = $dd_object->value_with_parents ?? false;
		// 		// if ($value_with_parents===true) {
		// 		// 	$dd_info = common::get_ddinfo_parents($locator, $this->tipo);
		// 		// 	$ar_subdata[] = $dd_info;
		// 		// }

		// 	// dump($element_json, ' element_json ++ '.to_string("$model, $tipo, $section_id, $section_tipo, $mode, $lang, $source_model - dato: ") . to_string($dato));

		// 	return $element_json;
		// }//end build_component_subdata



	/**
	* BUILD_REQUEST_CONFIG
	* Calculate the SQO for the components or section that need search by their own (section, autocomplete, portal, ...)
	* The search_query_object_context (request_config) have at least:
	* one sqo, that define the search with filter, offset, limit, etc, the select option it's not used (it will use the ddo)
	* one ddo for the searched section (source ddo)
	* one ddo for the component searched.
	* 	It is possible to create more than one ddo for different components.
	* @return array $this->request_config
	*/
	public function build_request_config() : array {
		$start_time=start_time();

		// already fixed value case
			if (isset($this->request_config)) {
				return $this->request_config;
			}

		// cache. Experimental 10-08-2023. Note that 'get_ar_request_config' is affected by section_id when sqo->fixed_filter is defined
			static $resolved_request_config_parsed = [];
			$resolved_key = $this->tipo .'_'. $this->get_section_tipo() .'_'. $this->mode .'_'. $this->section_id;
			$use_cache = false;
			if ($use_cache===true && isset($resolved_request_config_parsed[$resolved_key])) {
				return $resolved_request_config_parsed[$resolved_key];
			}


		// debug
			if(SHOW_DEBUG===true) {
				// $idd = $this->tipo . ' ' . RecordObj_dd::get_modelo_name_by_tipo($this->tipo,true);
				// dump($idd, ' idd ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ '.to_string($this->mode));
			}

		// requested_source is fixed from RQO calls to API when they exists like
			// {
			//     "typo": "source",
			//     "action": "search",
			//     "model": "section",
			//     "tipo": "dd64",
			//     "section_tipo": "dd64",
			//     "section_id": null,
			//     "mode": "edit",
			//     "lang": "lg-eng"
			// }
			$requested_source	= dd_core_api::$rqo->source ?? null;
			$requested_sqo		= dd_core_api::$rqo->sqo ?? null;

		if( isset($requested_source) &&
			($requested_source->tipo===$this->tipo ||
				(isset($requested_sqo) && in_array($this->tipo, (array)$requested_sqo->section_tipo)))
			) {

			// set the request_config with the API rqo sent by client

			// requested_show. get the rqo sent to the API
			$requested_show = isset(dd_core_api::$rqo) && isset(dd_core_api::$rqo->show)
				? unserialize(serialize(dd_core_api::$rqo->show))
				: false;

			if (!empty($requested_show)) {

				// consolidate ddo items properties
					$new_show_ddo_map = [];
					foreach ($requested_show->ddo_map as $key => $current_ddo) {
						//get the direct ddo linked by the source
						$new_ddo = unserialize(serialize($current_ddo));
						if ($new_ddo->parent===$requested_source->tipo || $new_ddo->parent==='self') {
							// check if the section_tipo of the current_ddo, is compatible with the section_tipo of the current instance
							if(in_array($this->tipo, (array)$new_ddo->section_tipo) || $new_ddo->section_tipo==='self'){
								$new_ddo->parent		= $this->tipo;
								$new_ddo->section_tipo	= $this->tipo;
							}
						}

						// added label & mode if not are already defined
						if(!isset($new_ddo->label)) {
							$new_ddo->label = RecordObj_dd::get_termino_by_tipo($new_ddo->tipo, DEDALO_APPLICATION_LANG, true, true);
						}
						if(!isset($new_ddo->mode)) {
							$new_ddo->mode = $this->mode;
						}
						$new_show_ddo_map[] = $new_ddo;
					}//end foreach ($requested_show->ddo_map as $key => $current_ddo)

				// request_config_object. Create the new request_config_object with the caller
					$request_config_object = new request_config_object();
						$request_config_object->api_engine		= 'dedalo';
						$request_config_object->type			= 'main';
						$request_config_object->show			= new stdClass();
						$request_config_object->show->ddo_map	= $new_show_ddo_map;

					// requested_search
						$requested_search = isset(dd_core_api::$rqo) && isset(dd_core_api::$rqo->search)
							? unserialize(serialize(dd_core_api::$rqo->search))
							: false;
						if (!empty($requested_search)) {

							$new_search_ddo_map = [];
							// consolidate ddo items properties
							foreach ($requested_search->ddo_map as $key => $current_ddo) {

								// new_ddo. Get the direct ddo linked by the source
									$new_ddo = unserialize(serialize($current_ddo));
									if ($new_ddo->parent===$requested_source->tipo || $new_ddo->parent==='self') {
										// check if the section_tipo of the current_ddo, is compatible with the section_tipo of the current instance
										if(in_array($this->tipo, (array)$new_ddo->section_tipo) || $new_ddo->section_tipo==='self'){
											$new_ddo->parent		= $this->tipo;
											$new_ddo->section_tipo	= $this->tipo;
										}
									}

								// label add if not are already defined
									if(!isset($new_ddo->label)) {
										$new_ddo->label = RecordObj_dd::get_termino_by_tipo($new_ddo->tipo, DEDALO_APPLICATION_LANG, true, true);
									}
								// mode add if not are already defined
									if(!isset($new_ddo->mode)) {
										$new_ddo->mode = $this->mode;
									}

								// add to search ddo_map
									$new_search_ddo_map[] = $new_ddo;
							}//end foreach ($requested_show->ddo_map as $key => $current_ddo)

							$request_config_object->search			= new stdClass();
							$request_config_object->search->ddo_map	= $new_search_ddo_map;
						}//end if (!empty($requested_search))

					// sqo add
						if (isset(dd_core_api::$rqo->sqo)) {
							$sqo = unserialize(serialize(dd_core_api::$rqo->sqo));
							$sqo->section_tipo = array_map(function($el){
								return (object)[
									'tipo' => $el
								];
							}, $sqo->section_tipo);
							$request_config_object->sqo = $sqo;
						}

					// fix request_config
						$this->request_config = [$request_config_object];

					// merge and set ddo elements
						dd_core_api::$ddo_map = array_merge(
							dd_core_api::$ddo_map,
							$request_config_object->show->ddo_map
						);

				return $this->request_config; // we have finished ! Note we stop here (!)
			}//end if (!empty($requested_show))
		}//end if( isset($requested_source) &&...

		// create a new fresh request_config with fallback options

		// short vars
			$mode			= $this->get_mode();
			$tipo			= $this->get_tipo();
			$section_tipo	= $this->get_section_tipo();
			$user_id		= logged_user_id();

		// 1. From user preset
			$user_preset = request_config_presets::search_request_config(
				$tipo,
				$section_tipo,
				$user_id,
				$mode,
				null
			);
			// dump($user_preset, ' user_preset ++ '." tipo:$tipo, section_tipo:$section_tipo, user_id:$user_id, mode:$mode ".to_string());
			if (!empty($user_preset)) {

				// fix request_config value
				$request_config = $user_preset;

				debug_log(__METHOD__.
					" request_config calculated from request_config_presets [$section_tipo-$tipo] ",
					logger::DEBUG
				);
			}

		// 2. From Ontology
			if (empty($request_config)) {

				$request_config = $this->get_ar_request_config();
			}


		// fix request_config value
			$this->request_config = $request_config;


		// fix ddo_map (dd_core_api static var)
			$dedalo_request_config = array_find($request_config, function($el){
				return isset($el->api_engine) && $el->api_engine==='dedalo';
			});
			if (is_object($dedalo_request_config)) {

				// fix missing type
				$dedalo_request_config->type = $dedalo_request_config->type ?? 'main';

				// sqo. Preserves filter across calls using session sqo if exists
				$model	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
				$sqo_id	= ($model==='section')
					? section::build_sqo_id($tipo, $mode) // implode('_', ['section', $tipo])
					: null; // cache key sqo_id
				if ($model==='section') {
					// dd_core_api::$rqo->sqo is set case
					// Fixed in dd_core_api::start if user browser has SQO value for this section on local DDBB
					// Note that $requested_sqo is dd_core_api::$rqo->sqo
					if (!empty($requested_sqo)) {
						foreach ($requested_sqo as $sqo_key => $sqo_value) {

							if (!isset($dedalo_request_config->sqo)) {
								$dedalo_request_config->sqo = new stdClass();
							}

							// ignore section_tipo
							if ($sqo_key==='section_tipo') {
								continue;
							}

							if ($sqo_key==='limit') {
								// limit null value from server NOT overwrite request config value if exists
								$dedalo_request_config->sqo->{$sqo_key} = $sqo_value ?? $dedalo_request_config->sqo->{$sqo_key} ?? null;
							}else{
								$dedalo_request_config->sqo->{$sqo_key} = $sqo_value;
							}
						}
					}
					// fallback to session (note that always is saved navigation SQO in session to allow preserve records on tools like tool_export)
					// Here it is mainly used to preserve the navigation of section_tool because the 'tipo' is different from real section
					else if (isset($_SESSION['dedalo']['config']['sqo'][$sqo_id])) {
						// replace default sqo with the already stored in session (except section_tipo to prevent to
						// loose labels and limit to avoid overwrite list in edit and vice-versa)
						foreach ($_SESSION['dedalo']['config']['sqo'][$sqo_id] as $key => $value) {
							if($key==='section_tipo' || $key==='generated_time') continue;
							// limit. Do no t apply null value. instead leave to calculate defaults
							if ($key==='limit' && $value===null) {
								continue;
							}
							if (!isset($dedalo_request_config->sqo)) {
								$dedalo_request_config->sqo = new stdClass();
							}
							$dedalo_request_config->sqo->{$key} = $value;
						}
					}
				}
			}

			$request_config_len = sizeof($request_config);
			for ($i=0; $i < $request_config_len; $i++) {

				$current_request_config = $request_config[$i];

				// skip empty ddo_map
				if (empty($current_request_config->show->ddo_map)) {
					continue;
				}

				// add ddo_map
				dd_core_api::$ddo_map = array_merge(
					dd_core_api::$ddo_map,
					$current_request_config->show->ddo_map
				);
			}

		// cache
			if ($use_cache===true) {
				$resolved_request_config_parsed[$resolved_key] = $this->request_config;
			}

		// des
			// // request_ddo. Insert into the global dd_objects storage the current dd_objects that will needed
			// 	// received request_ddo
			// 		$request_ddo = array_find($dd_request, function($item) {
			// 			return $item->typo==='request_ddo';
			// 		});
			// 	// not received request_ddo
			// 		if(empty($request_ddo)) {
			// 			// preset request_ddo
			// 				if (!isset($user_preset)) {
			// 					$user_preset = layout_map::search_user_preset($tipo, $section_tipo, logged_user_id(), $mode, null);
			// 				}
			// 				if (!empty($user_preset)) {
			// 					$request_ddo = array_find($user_preset, function($item){
			// 						return $item->typo==='request_ddo';
			// 					});
			// 				}

			// 			// calculated request_ddo
			// 				if (empty($request_ddo)) {
			// 					$request_ddo = $this->get_request_ddo();
			// 				}
			// 		}

			// 	// fix request_ddo_value for current element
			// 		$this->request_ddo_value = $request_ddo->value;

			// 	// add non existent ddo's to static var dd_core_api::$request_ddo_value
			// 		foreach ($request_ddo->value as $ddo) {
			// 			if (!dd_object::in_array_ddo($ddo, dd_core_api::$request_ddo_value, ['model','tipo','section_tipo','mode','lang', 'parent','typo','type'])) {
			// 				dd_core_api::$request_ddo_value[] = $ddo;
			// 			}
			// 		}

		// debug
			debug_log(
				'------- build_request_config --------- '.$this->tipo.' ---------------- '.exec_time_unit($start_time,'ms').' ms' . ' --- ' . get_called_class() . ' -- ' . $resolved_key,
				logger::DEBUG
			);


		return $this->request_config;
	}//end build_request_config



	/**
	* GET_AR_REQUEST_CONFIG
	* Resolves the component config context with backward compatibility
	* The proper config in v6 is on term properties config, NOT as related terms
	* Note that section tipo 'self' will be replaced by current '$section_tipo'
	*
	* @return array $ar_request_config
	*/
	public function get_ar_request_config() : array {

		// short vars
			$tipo				= $this->get_tipo();
			$external			= false;
			$section_tipo		= $this->get_section_tipo();
			$section_id			= $this->get_section_id();
			$mode				= $this->get_mode();
			$model				= get_called_class();
			$requested_source	= dd_core_api::$rqo->source ?? null;
			$requested_sqo		= dd_core_api::$rqo->sqo ?? null;

		// debug
			if(SHOW_DEBUG===true) {
				// if (to_string($section_tipo)==='self') {
				// 	throw new Exception("Error Processing get_request_config (6) unresolved section_tipo:".to_string($section_tipo), 1);
				// }
			}

		// check section tipo model (allow areas)
			if ($section_tipo!=='self') {
				$section_model = RecordObj_dd::get_modelo_name_by_tipo($section_tipo,true);
				if ($section_model!=='section' && strpos($section_model, 'area_')===false) {
					// throw new Exception("Error Processing Request. Model is not section ($section_tipo - $section_model)", 1);
					debug_log(__METHOD__
						. " Error. Invalid section/area tipo " . PHP_EOL
						. ' section_tipo: '  . to_string($section_tipo) . PHP_EOL
						. ' section_model: ' . to_string($section_model) . PHP_EOL
						. ' current tipo: '  . to_string($tipo) . PHP_EOL
						. ' dbt: ' . to_string( debug_backtrace()[1] )
						, logger::ERROR
					);
				}
			}

		// cache
			static $resolved_request_properties_parsed = [];
			// resolved_key
			$resolved_key = $tipo .'_'. $section_tipo .'_'. (int)$external .'_'. $mode .'_'. $section_id;

			// @todo : Remove section_id from cache $resolved_key (resolve numisdata4 list problem before)
				// @note : To verify this cache behavior, see numisdata4 list
				// (!) Removed $section_id from resolved_key 25-01-2024 because it is only needed in case sqo->fixed_filter is defined.
				// When case is sqo->fixed_filter, the $use_cache property is set to false to prevent saving as resolved cache item
				// (!) Removed $external from resolved_key 10-08-2023 because is not longer used
				// In those cases, prevent to cache this result
				// $resolved_key = $tipo .'_'. $section_tipo .'_'. $mode;
				// define use_cache as true. Change before set value if needed

			$use_cache = true;
			if ($use_cache===true && isset($resolved_request_properties_parsed[$resolved_key])) {
				// debug_log(__METHOD__." Return ar_request_config from cached value. resolved_key: ".to_string($resolved_key), logger::ERROR);
				return $resolved_request_properties_parsed[$resolved_key];
			}

		// properties.
			// Get the properties, if the mode is list, get the child term 'section_list' that had has the configuration
			// of the list (for sections and portals) by default or edit mode get the properties of the term itself.
			switch ($mode) {
				case 'list':
					// default. Properties from self element
					$source_properties = $this->get_properties();

					// section. If section or component has properties injected, use it instead the section_list
					// And sometimes the portals don't has section_list defined.
					// In these cases get the properties from the current tipo
					if($model==='section' && isset($source_properties->source->request_config)){
						break; // stop here
					}

					// in the case that section_list is defined
					$ar_terms = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
						$tipo,
						'section_list',
						'children',
						true // bool search exact
					);
					if(isset($ar_terms[0])) {

						// section_list. Use properties from section list instead self properties

						$current_term	= $ar_terms[0];
						$RecordObj_dd	= new RecordObj_dd($current_term);

						// override properties var
						$source_properties	=  $RecordObj_dd->get_properties();
					}
					break;

				default:
					// edit mode or components without section_list defined
					$source_properties = $this->get_properties();
					break;
			}

		// clone the source properties
		// to use a copy of the properties to parse the request_config resolving section_tipo as self or other needs
		// don't use php clone, it doesn't work with deep objects
			$properties = ($source_properties !== null)
				? json_decode(json_encode( $source_properties ))
				: null;

		// pagination defaults. Note that injected values may exist in element pagination.
			$offset	= isset($this->pagination->offset)
				? $this->pagination->offset
				: 0;
			$limit	= isset($this->pagination->limit)
				? $this->pagination->limit
				: (function() use($model, $mode, $properties) {
					// from properties try
					if (isset($properties->source) && isset($properties->source->request_config)) {
						$found = array_find($properties->source->request_config, function($el){
							return isset($el->api_engine) && $el->api_engine==='dedalo';
						});
						if (!empty($found) && isset($found->sqo) && isset($found->sqo->limit)) {
							return $found->sqo->limit;
						}
					}

					if ($model==='section') {
						return $mode==='list' ? 10 : 1;
					}else{
						return $mode==='list' ? 1 : 10;
					}
				  })();

		// ar_request_query_objects
			$ar_request_query_objects = [];
			if( isset($properties->source->request_config) ) { //  || $model==='component_autocomplete_hi'

				// V6, properties request_config is defined case

				foreach ($properties->source->request_config as $item_request_config) {

					// if($external===false && $item_request_config->sqo->type==='external') continue; // ignore external

					// parsed_item. Base object to fulfill with the necessary properties (api_engine, sqo, show, search, choose)
						$parsed_item = new request_config_object();

					// api_engine
						$parsed_item->set_api_engine(
							$item_request_config->api_engine ?? 'dedalo'
						);

					// type
						$parsed_item->set_type(
							$item_request_config->type ?? 'main'
						);

					// sqo. Add search query object property
						$parsed_item->set_sqo(
							$item_request_config->sqo ?? new stdClass()
						);

						// section_tipo. get the ar_sections as ddo
							$ar_section_tipo = isset($parsed_item->sqo->section_tipo)
								? component_relation_common::get_request_config_section_tipo($parsed_item->sqo->section_tipo, $section_tipo)
								: [$section_tipo];

						// parsed_item (section_tipo). normalized ddo with tipo and label
							$parsed_item->sqo->section_tipo = array_map(function($current_section_tipo){
								$ddo = new dd_object();
									$ddo->set_tipo($current_section_tipo);
									$ddo->set_label(RecordObj_dd::get_termino_by_tipo($current_section_tipo, DEDALO_APPLICATION_LANG, true, true));
									$ddo->set_color(RecordObj_dd::get_color($current_section_tipo));
									$ddo->set_permissions(common::get_permissions($current_section_tipo, $current_section_tipo));

								// buttons. Add button_new and button_delete to determine new and delete permissions on client
									$buttons = [];
									if ($ddo->permissions>1) {
										// button_new
											$ar_button_new = section::get_ar_children_tipo_by_model_name_in_section(
												$current_section_tipo,
												['button_new'],
												true, // bool from_cache
												true, // bool resolve_virtual
												true, // bool recursive
												true, // bool search_exact
												false // array|bool $ar_tipo_exclude_elements
											);
											if (isset($ar_button_new[0])) {
												$buttons[] = (object)[
													'model'			=> 'button_new',
													'permissions'	=> common::get_permissions($current_section_tipo, $ar_button_new[0])
												];
											}
										// button_delete
											$ar_button_delete = section::get_ar_children_tipo_by_model_name_in_section(
												$current_section_tipo,
												['button_delete'],
												true, // bool from_cache
												true, // bool resolve_virtual
												true, // bool recursive
												true, // bool search_exact
												false // array|bool $ar_tipo_exclude_elements
											);
											if (isset($ar_button_delete[0])) {
												$buttons[] = (object)[
													'model'			=> 'button_delete',
													'permissions'	=> common::get_permissions($current_section_tipo, $ar_button_delete[0])
												];
											}
									}
									// set buttons
									$ddo->set_buttons($buttons);

								// Matrix table. set matrix table of the section to determinate if the section is editable or private (shared and not editable by users)
									$ddo->set_matrix_table(common::get_matrix_table_from_tipo($current_section_tipo));

								return $ddo;
							}, (array)$ar_section_tipo);

						// filter_by_list. get the filter_by_list (to set the pre-filter selector)
							if (isset($item_request_config->sqo->filter_by_list)) {
								$parsed_item->sqo->filter_by_list = component_relation_common::get_filter_list_data($item_request_config->sqo->filter_by_list);
							}

						// fixed_filter
							if (isset($item_request_config->sqo->fixed_filter)) {
								$parsed_item->sqo->fixed_filter = component_relation_common::get_fixed_filter(
									$item_request_config->sqo->fixed_filter,
									$section_tipo,
									$section_id
								);
								// cache. Note that this parse could be different based on ar_fixed[]->source->component_dato using $section_id
								// to prevent unwanted cache items, remove save value in cache from here
								$use_cache = false;
							}

						// limit. Add default if not already set
							if (!isset($parsed_item->sqo->limit)) {
								$parsed_item->sqo->limit = $limit;
							}
							// overwrite with $this->pagination->limit if exists
							if (isset($this->pagination->limit)) {
								$parsed_item->sqo->limit = $this->pagination->limit;
							}
							// overwrite from API request. Check received limit from dd_core_api::$rqo
							if ($requested_source && $requested_source->tipo===$this->tipo && isset($requested_sqo->limit)) {
								$parsed_item->sqo->limit = $requested_sqo->limit;
							}

					// show (mandatory). In list mode it's possible to create specific ddo_map in a section_list term child of the portal or section.

						// set show with the parsed request_config
							$parsed_item->show = $item_request_config->show ?? null;
							if (empty($parsed_item->show)) {
								debug_log(__METHOD__
									. " Error. Expected request_config->show but is empty. Adding empty object to prevent crash " . PHP_EOL
									. ' parsed_item: ' .PHP_EOL. json_encode($parsed_item, JSON_PRETTY_PRINT) . PHP_EOL
									, logger::ERROR
								);
								$parsed_item->show = new stdClass();
							}

						// get_ddo_map. Get the ddo_map from ontology, defined by specific term, like "section_map"
						// see sample at 'numisdata656' or 'dmm26'
							$get_ddo_map		= $parsed_item->show->get_ddo_map ?? false;
							$ar_ddo_calcutaled	= [];
							if($get_ddo_map!==false) {
								switch ($get_ddo_map->model) {

									case 'section_map':
										$procesed_component_tipo = [];
										foreach ($ar_section_tipo as $current_section_tipo) {

											$section_map = section::get_section_map( $current_section_tipo );
											if(empty($section_map)) {
												debug_log(__METHOD__
													." Ignored section_tipo without section_map (1) current_section_tipo: ".to_string($current_section_tipo) . PHP_EOL
													.' tipo: ' . $this->tipo . PHP_EOL
													.' section_tipo: ' . $this->section_tipo . PHP_EOL
													.' section_id: ' . $this->section_id
													, logger::WARNING
												);
												continue;
											}
											foreach ($get_ddo_map->columns as $current_column_path) {

												$section_map_value = get_object_property($section_map, $current_column_path);

												// ignore value
												if(empty($section_map_value)){
													debug_log(__METHOD__
														." Ignored section_tipo without section_map (2) current_section_tipo: ".to_string($current_section_tipo) . PHP_EOL
														.' tipo: ' . $this->tipo . PHP_EOL
														.' section_tipo: ' . ($this->section_tipo ?? null) . PHP_EOL
														.' section_id: ' . $this->section_id
														, logger::WARNING
													);
													continue;
												}
												$ar_component_tipo = (array)$section_map_value;

												foreach ($ar_component_tipo as $current_component_tipo) {
													if(in_array($current_component_tipo, $procesed_component_tipo)){

														$to_change_ddo = array_find($ar_ddo_calcutaled, function($ddo) use($current_component_tipo){
															return $ddo->tipo === $current_component_tipo;
														});

														$to_change_ddo->section_tipo = array_merge( (array)$to_change_ddo->section_tipo, [$current_section_tipo] );

													}else{
														// $column_name = end($current_column_path);
														$ddo = new dd_object();
															$ddo->set_tipo($current_component_tipo);
															$ddo->set_section_tipo($current_section_tipo);
															$ddo->set_parent($tipo);
															// $ddo->set_column($column_name);

														$procesed_component_tipo[] = $current_component_tipo;
														$ar_ddo_calcutaled[] = $ddo;
													}
												}
											}
										}//end foreach ($ar_section_tipo as $current_section_tipo)
										break;

									default:
										// Nothing to do
										break;
								}//end switch ($get_ddo_map->model)
							}//end if($get_ddo_map!==false)

						// get all ddo and set the label to every ddo (used for showing into the autocomplete like es1: Spain, fr1: France)
							$ar_ddo_map = $parsed_item->show->ddo_map ?? $ar_ddo_calcutaled;

						// ddo_map
							$final_ddo_map = [];
							foreach ($ar_ddo_map as $current_ddo) {

								// check without tipo case
									if (!isset($current_ddo->tipo)) {
										debug_log(__METHOD__.  ' ERROR. Ignored current_ddo don\'t have tipo: ++ '.to_string($tipo), logger::ERROR);
										dump($current_ddo, ' ERROR. Ignored current_ddo don\'t have tipo: ++ '.to_string($tipo));
										continue;
									}

								// check if the ddo is active into the ontology
									$is_active = RecordObj_dd::check_active_tld($current_ddo->tipo);
									if( $is_active === false ){
										debug_log(__METHOD__
											. " Removed ddo from ddo_map->show definition because the tld is not installed " . PHP_EOL
											. to_string($current_ddo)
											, logger::WARNING
										);
										continue;
									}

								// model. Calculated always to prevent errors
									$current_ddo->model = RecordObj_dd::get_modelo_name_by_tipo($current_ddo->tipo, true);

								// list mode exclude groupers (see case section test2)
									if ($this->mode==='list' && strpos($current_ddo->model, 'section_group')!==false) {
										continue;
									}

								// label. Add to all ddo_map items
									if (!isset($current_ddo->label)) {
										$current_ddo->label = RecordObj_dd::get_termino_by_tipo($current_ddo->tipo, DEDALO_APPLICATION_LANG, true, true);
									}

								// section_tipo. Set the default "self" value to the current section_tipo (the section_tipo of the parent)
									if ($current_ddo->section_tipo==='self') {
										$current_ddo->section_tipo = $ar_section_tipo;
									}

								// parent. Set the default "self" value to the current tipo (the parent)
									if ($current_ddo->parent==='self') {
										$current_ddo->parent = $tipo;
									}

								// fixed_mode. When the mode is set in properties or is set by tool or user templates
								// set the fixed_mode to true, to preserve the mode across changes in render process
									if( isset($current_ddo->mode) ) {
										$current_ddo->fixed_mode = true;
									}

								// mode
									if (!isset($current_ddo->mode)) {
										$current_ddo->mode = $model!=='section'
											? 'list'
											: $mode;
									}

								// fields_map. Used by component external to map to different API format, defined in the component,
								// when this property is present and true, get the component fields_map
								// see 'zenon5' or 'isad30'
									if(isset($current_ddo->fields_map) && $current_ddo->fields_map===true){
										$RecordObj_dd				= new RecordObj_dd($current_ddo->tipo);
										$current_ddo_properties		= $RecordObj_dd->get_properties();
										$current_ddo->properties	= $current_ddo_properties;
										$current_ddo->fields_map	= isset($current_ddo_properties->fields_map)
											? $current_ddo_properties->fields_map
											: [];
										$current_ddo->lang			= $RecordObj_dd->get_traducible()==='si' ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
										$current_ddo->model			= $RecordObj_dd->get_modelo_name();
										// $current_ddo->parent		= $current_ddo->section_tipo;
										$current_ddo->permissions	= common::get_permissions($current_ddo->section_tipo, $current_ddo->tipo);
									}

								// component dataframe when portal caller is in tm mode
								// the component will be always in view of the portal caller (without events or functionality)
								// see
									if ($this->mode==='tm' && $current_ddo->model === 'component_dataframe') {
										$current_ddo->view = $this->view;
									}

								// permissions check
									if($model==='section') {
										$check_section_tipo = is_array($current_ddo->section_tipo) ? reset($current_ddo->section_tipo) : $current_ddo->section_tipo;
										$permissions = common::get_permissions($check_section_tipo, $current_ddo->tipo);
										if($permissions<1){
											continue;
										}
									}

								// add parsed ddo
									$final_ddo_map[] = $current_ddo;
							}//end foreach ($ar_ddo_map as $current_ddo)

						$parsed_item->show->ddo_map = $final_ddo_map;

						if (isset($parsed_item->show->sqo_config)) {
							// fallback non defined operator
							if (!isset($parsed_item->show->sqo_config->operator)) {
								$parsed_item->show->sqo_config->operator = '$or';
							}
							// limit. Overwrite config by session value if exists
							if (isset($parsed_item->show->sqo_config->limit)) {
								// get session limit if it was defined
								if ($model==='section') {
									$sqo_id	= section::build_sqo_id($tipo, $mode); // implode('_', ['section', $tipo]); // cache key sqo_id
									$parsed_item->sqo->limit = (isset($_SESSION['dedalo']['config']['sqo'][$sqo_id]->limit))
										? $_SESSION['dedalo']['config']['sqo'][$sqo_id]->limit
										: $parsed_item->show->sqo_config->limit;
								}else{
									// default
									$parsed_item->sqo->limit = $parsed_item->show->sqo_config->limit;
									// overwrite with $this->pagination->limit if exists
									if (isset($this->pagination->limit)) {
										$parsed_item->sqo->limit = $this->pagination->limit;
									}
									// overwrite from API request. Check received limit from dd_core_api::$rqo
									if ($requested_source && $requested_source->tipo===$this->tipo && isset($requested_sqo->limit)) {
										$parsed_item->sqo->limit = $requested_sqo->limit;
									}
								}
							}

						}else{
							// fallback non defined sqo_config
							$sqo_config = new stdClass();
								$sqo_config->full_count		= false;
								// $sqo_config->add_select	= false;
								// $sqo_config->direct		= true;
								$sqo_config->limit			= $limit;
								$sqo_config->offset			= $offset;
								$sqo_config->mode			= $mode;
								$sqo_config->operator		= '$or';

							$parsed_item->show->sqo_config = $sqo_config;
						}
						// fix the limit in the instance
						$this->pagination->limit = isset($parsed_item->sqo->limit)
							? $parsed_item->sqo->limit
							: (isset($parsed_item->show->sqo_config->limit)
								? $parsed_item->show->sqo_config->limit
								: $this->pagination->limit);

					// search
						if (isset($item_request_config->search)) {
							// set item
							$parsed_item->set_search(
								$item_request_config->search
							);
							$ar_search_ddo_map = $parsed_item->search->ddo_map ?? null;
							if($ar_search_ddo_map){
								// ddo_map
								$final_search_ddo_map = [];
								foreach ($ar_search_ddo_map as $current_search_ddo_map) {

									if (empty($current_search_ddo_map->tipo)) {
										// dump($ar_search_ddo_map, ' ar_search_ddo_map +++++++++++++++++++++++++++++++++++++ '.to_string($tipo));
										debug_log(__METHOD__." Ignored empty search_ddo_map->tipo. current_search_ddo_map: ".PHP_EOL.to_string($current_search_ddo_map), logger::ERROR);
										continue;
									}

									// check if the ddo is active into the ontology
										$is_active = RecordObj_dd::check_active_tld($current_search_ddo_map->tipo);
										if( $is_active === false ){
											debug_log(__METHOD__
												. " Removed ddo from ddo_map->search definition because the tld is not installed " . PHP_EOL
												. to_string($current_search_ddo_map)
												, logger::WARNING
											);
											continue;
										}
									// model. Calculated always to prevent errors
										$current_search_ddo_map->model = RecordObj_dd::get_modelo_name_by_tipo($current_search_ddo_map->tipo, true);

									// label. Add to all ddo_map items
										$current_search_ddo_map->label = RecordObj_dd::get_termino_by_tipo($current_search_ddo_map->tipo, DEDALO_APPLICATION_LANG, true, true);

									// section_tipo. Set the default "self" value to the current section_tipo (the section_tipo of the parent)
										$current_search_ddo_map->section_tipo = $current_search_ddo_map->section_tipo==='self'
											? $ar_section_tipo
											: $current_search_ddo_map->section_tipo;

									// parent. Set the default "self" value to the current tipo (the parent)
										$current_search_ddo_map->parent = $current_search_ddo_map->parent==='self'
											? $tipo
											: $current_search_ddo_map->parent;

									// mode
										$current_search_ddo_map->mode = isset($current_search_ddo_map->mode)
											? $current_search_ddo_map->mode
											: ($model !== 'section'
												? 'list'
												: $mode);

									$final_search_ddo_map[] = $current_search_ddo_map;
								}

								$parsed_item->search->ddo_map = $final_search_ddo_map;
							}
							if (isset($parsed_item->search->sqo_config)) {
								// // fallback non defined operator
								// if (!isset($parsed_item->search->sqo_config->operator)) {
								// 	$parsed_item->search->sqo_config->operator = '$or';
								// }
								// // limit. Overwrite config by session value if exists
								// if (isset($parsed_item->search->sqo_config->limit)) {
								// 	// get session limit if it was defined
								// 	if ($model==='section') {
								// 		$sqo_id	= section::build_sqo_id($tipo, $mode) // implode('_', ['section', $tipo]); // cache key sqo_id
								// 		$parsed_item->sqo->limit = (isset($_SESSION['dedalo']['config']['sqo'][$sqo_id]->limit))
								// 			? $_SESSION['dedalo']['config']['sqo'][$sqo_id]->limit
								// 			: $parsed_item->search->sqo_config->limit;
								// 	}else{
								// 		$parsed_item->sqo->limit = $parsed_item->search->sqo_config->limit;
								// 	}
								// }
							}else{
								// fallback non defined sqo_config
								$sqo_config = new stdClass();
									$sqo_config->full_count		= false;
									// $sqo_config->add_select	= false;
									// $sqo_config->direct		= true;
									$sqo_config->limit			= $limit;
									$sqo_config->offset			= $offset;
									$sqo_config->mode			= $mode;
									$sqo_config->operator		= '$or';

								$parsed_item->search->sqo_config = $sqo_config;
							}
						}

					// choose
						if (isset($item_request_config->choose)) {

							$choose_ddo_map = $item_request_config->choose->ddo_map;
							foreach ($choose_ddo_map as $current_choose_ddo) {

								// check if the ddo is active into the ontology
									$is_active = RecordObj_dd::check_active_tld($current_choose_ddo->tipo);
									if( $is_active === false ){
										debug_log(__METHOD__
											. " Removed ddo from ddo_map->choose definition because the tld is not installed " . PHP_EOL
											. to_string($current_choose_ddo)
											, logger::WARNING
										);
										continue;
									}

								// model. Calculated always to prevent errors
									$current_choose_ddo->model = RecordObj_dd::get_modelo_name_by_tipo($current_choose_ddo->tipo, true);

								// section_tipo
									$current_choose_ddo->section_tipo = $current_choose_ddo->section_tipo==='self'
										? $ar_section_tipo
										: $current_choose_ddo->section_tipo;

								// parent. Set the default "self" value to the current tipo (the parent)
									$current_choose_ddo->parent = $current_choose_ddo->parent==='self'
										? $tipo
										: $current_choose_ddo->parent;

								// label. Add to all ddo_map items
									$current_choose_ddo->label = RecordObj_dd::get_termino_by_tipo($current_choose_ddo->tipo, DEDALO_APPLICATION_LANG, true, true);

								// mode
									$current_choose_ddo->mode = isset($current_choose_ddo->mode)
										? $current_choose_ddo->mode
										: ($model !== 'section'
											? 'list'
											: $mode);

								$final_ddo_map[] = $current_choose_ddo;
							}

							// $parsed_item->show->ddo_map = $choose_ddo_map;
							// set item
							$parsed_item->set_choose(
								$item_request_config->choose
							);
						}

					// hide
						if (isset($item_request_config->hide)) {

							$hide_ddo_map = $item_request_config->hide->ddo_map;
							foreach ($hide_ddo_map as $current_ddo_map) {

								// section_tipo
									$current_ddo_map->section_tipo = $current_ddo_map->section_tipo==='self'
										? $ar_section_tipo
										: $current_ddo_map->section_tipo;

								// parent. Set the default "self" value to the current tipo (the parent)
									$current_ddo_map->parent = $current_ddo_map->parent==='self'
										? $tipo
										: $current_ddo_map->parent;

								// label. Add to all ddo_map items
									$current_ddo_map->label = RecordObj_dd::get_termino_by_tipo($current_ddo_map->tipo, DEDALO_APPLICATION_LANG, true, true);

								// mode
									$current_ddo_map->mode = isset($current_ddo_map->mode)
										? $current_ddo_map->mode
										: ($model !== 'section'
											? 'list'
											: $mode);
								// model
									$current_ddo_map->model = RecordObj_dd::get_modelo_name_by_tipo($current_ddo_map->tipo, true);


								$final_ddo_map[] = $current_ddo_map;
							}

							// set item
							$parsed_item->set_hide(
								$item_request_config->hide
							);
						}

					// external config. Add properties
					// like {"api_config": {"api_url": "https://zenon.dainst.org/api/v1/record",..}
						if ($parsed_item->api_engine!=='dedalo' && isset($parsed_item->show->ddo_map)) {
							$engine_section_tipo = isset($parsed_item->show->ddo_map[0])
								? $parsed_item->show->ddo_map[0]->section_tipo
								: null;
							if (!empty($engine_section_tipo)) {
								$RecordObj_dd				= new RecordObj_dd($engine_section_tipo);
								$engine_section_properties	= $RecordObj_dd->get_properties();
								if (is_object($engine_section_properties) && property_exists($engine_section_properties, 'api_config')) {
									$parsed_item->set_api_config($engine_section_properties->api_config);
								}
							}
						}

					// add complete parsed item
						$ar_request_query_objects[] = $parsed_item;
				}//end foreach ($properties->source->request_config as $item_request_config)

			}else{
				// V5 model

				// if (in_array($model, component_relation_common::get_components_with_relations()) ) {
				// ar_related
					switch ($mode) {
						case 'edit':
							if ($model==='section') {
								// section
								$table					= common::get_matrix_table_from_tipo($tipo);
								$ar_model_name_required	= [
									'component_',
									'section_group',
									'section_group_div',
									'section_tab',
									'tab'
									// 'section_group_relation',
									// 'section_group_portal',
								];
								$ar_related				= section::get_ar_children_tipo_by_model_name_in_section(
									$tipo,
									$ar_model_name_required,
									true, // bool from_cache
									true, // bool resolve_virtual
									true, // bool recursive
									false, // bool search_exact
									false, // array|bool $ar_tipo_exclude_elements
									['component_dataframe'] // ?array $ar_exclude_models
								);
							}elseif (in_array($model, common::$groupers)) {
								// groupers
								$ar_related = (array)RecordObj_dd::get_ar_childrens($tipo);
							}else{
								// components
								$ar_related = (array)RecordObj_dd::get_ar_terminos_relacionados(
									$tipo,
									true, // bool cache
									true // bool simple
								);
							}
							break;
						case 'related_list':
							if ($model==='section') {
								// Try to find in the virtual section if it has defined the relation_list (relation_list could had its own relation_list)
								$ar_terms = section::get_ar_children_tipo_by_model_name_in_section(
									$tipo,
									['relation_list'], // array ar_model_name_required
									true, // bool from_cache
									false, // bool resolve_virtual
									false, // bool recursive
									true // bool search_exact
								);

								// If not found children, try resolving real section
								if (empty($ar_terms)) {
									$ar_terms = section::get_ar_children_tipo_by_model_name_in_section(
										$tipo,
										['relation_list'], // array ar_model_name_required
										true, // bool from_cache
										true, // bool resolve_virtual
										false, // bool recursive
										true // bool search_exact
									);
								}// end if (empty($ar_terms))

								if(isset($ar_terms[0])) {
									# Use found related terms as new list
									$current_term = $ar_terms[0];
									$ar_related   = RecordObj_dd::get_ar_terminos_relacionados(
										$current_term, // string tipo
										true, // bool cache
										true // bool simple
									);
								}
							}
							break;
						case 'list':
						case 'search':
						default:
							if ($model==='section') {
								# case section list is defined
								$ar_terms = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($tipo, 'section_list', 'children', true);
								if(isset($ar_terms[0])) {
									# Use found related terms as new list
									$current_term = $ar_terms[0];
									$ar_related   = RecordObj_dd::get_ar_terminos_relacionados(
										$current_term, // string tipo
										true, // bool cache
										true // bool simple
									);
								}
							}elseif (in_array($model, common::$groupers)) {
								// groupers
								$ar_related = (array)RecordObj_dd::get_ar_childrens($tipo);
							}else{
								// portal cases
								// case section list is defined
								$ar_terms = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
									$tipo, // string tipo
									'section_list', // string model
									'children', // string relation_type
									true // bool search_exact
								);
								if(isset($ar_terms[0])) {
									// Use found section_list related terms as new list
									$current_term	= $ar_terms[0];
									$ar_related		= RecordObj_dd::get_ar_terminos_relacionados(
										$current_term, // string tipo
										true, // bool cache
										true // bool simple
									);

									$section_isset = false;
									foreach ((array)$ar_related as $current_tipo) {
										$current_model = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
										if ($current_model==='section') {
											$section_isset = true;
										}
									};

									//fallback when the related term has not section defined
									// it will use of the main component related
									if($section_isset === false){
										$ar_main_section = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
											$tipo, // string tipo
											'section', // string model
											'termino_relacionado', // string relation_type
											true // bool search_exact
										);

										$ar_related = array_merge($ar_main_section, $ar_related);
									}
								}else{
									// Fallback related when section list is not defined; portal case.
									$ar_related = RecordObj_dd::get_ar_terminos_relacionados(
										$tipo, // string tipo
										true, // bool cache
										true // bool simple
									);
								}
							}
							break;
					}//end switch ($mode)

				// related_clean
					$ar_related_clean 	 = [];
					$target_section_tipo = $section_tipo;
					if (!empty($ar_related)) {
						foreach ((array)$ar_related as $current_tipo) {
							$current_model = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
							if ($current_model==='section') {
								$target_section_tipo = $current_tipo; // Overwrite (!)
								continue;
							}else if ($current_model==='exclude_elements') {
								continue;
							}else if($current_tipo===DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO) {
								continue; // 'component_security_areas' removed in v6 but the component will stay in ontology, PROVISIONAL, only in the alpha state of V6 for compatibility of the ontology of V5.
							}else if($current_model==='component_filter' && isset($table) && ($table==='matrix_dd' || $table==='matrix_list')) {
								continue; // exclude component_filter from private list like 'yes/no'
							}

							$ar_related_clean[] = $current_tipo;
						}
					}
					// check ar_related_clean is legal.
					// (!) Removed 20-10-2022 because it's no longer necessary this check
						// $without_related_term_models = [
						// 	'component_relation_index',
						// 	'component_select_lang',
						// 	'component_input_text'
						// ];
						// if (empty($ar_related_clean) && !in_array($model, $without_related_term_models)) {
						// 	// $ar_related_clean = [$tipo]; Loop de la muerte (!)
						// 	debug_log(__METHOD__
						// 		." Empty related items. Review your structure config to fix this error. model:$model - tipo:$tipo - ar_related_clean:"
						// 		.to_string($ar_related_clean)
						// 		, logger::ERROR
						// 	);
						// }

				// sqo_config
					$sqo_config = new stdClass();
						$sqo_config->full_count		= false;
						// $sqo_config->add_select	= false;
						// $sqo_config->direct		= true;
						$sqo_config->limit			= $limit;
						$sqo_config->offset			= $offset;
						$sqo_config->mode			= $mode;
						$sqo_config->operator		= '$or';

				// fix the limit in the instance.
				// Note that some instances do not have pagination property, like areas
					if (isset($this->pagination)) {
						$this->pagination->limit = $limit;
					}

				// mode
					$current_mode = ($model!=='section')
						? 'list'
						: $mode;

				// view
					// $tipo_RecordObj_dd	= new RecordObj_dd($tipo);
					// $tipo_properties	= $tipo_RecordObj_dd->get_properties();
					// (!) Changed because is already calculated and properties could be different from $tipo when in a section_list
					$tipo_properties	= $properties;
					$children_view		= isset($tipo_properties->children_view)
						? $tipo_properties->children_view
						: null;

				// authorized ddo items. Check the permissions of each element and discard non accessible
					$ar_related_clean_auth = (function() use($ar_related_clean, $target_section_tipo){
						// check each element permissions
						$result = [];
						foreach ($ar_related_clean as $item_tipo) {
							// permissions filter
							$permissions = common::get_permissions($target_section_tipo, $item_tipo);
							if ($permissions>0) {
								$result[] = $item_tipo;
							}
						}
						return $result;
					})();

				// ddo_map
					$ddo_map = array_map(function($current_tipo) use($tipo, $target_section_tipo, $current_mode, $children_view){

						$model						= RecordObj_dd::get_modelo_name_by_tipo($current_tipo, true);
						// $legacy_model			= RecordObj_dd::get_legacy_model_name_by_tipo($current_tipo)
						$current_tipo_RecordObj_dd	= new RecordObj_dd($current_tipo);
						$current_tipo_properties	= $current_tipo_RecordObj_dd->get_properties();
						$own_view					= isset($current_tipo_properties->view)
							? $current_tipo_properties->view
							: common::resolve_view((object)[
								'model'	=> $model,
								'tipo'	=> $current_tipo
							  ]);

						$view = isset($children_view)
							? $children_view
							: $own_view;

						$ddo = new dd_object();
							$ddo->set_tipo($current_tipo);
							$ddo->set_model($model);
							$ddo->set_section_tipo($target_section_tipo);
							$ddo->set_parent($tipo);
							$ddo->set_mode($current_mode);
							$ddo->set_view($view);
							$ddo->set_label(RecordObj_dd::get_termino_by_tipo($current_tipo, DEDALO_APPLICATION_LANG, true, true));
						return $ddo;
					}, $ar_related_clean_auth);

				// show
					$show = new stdClass();
						$show->ddo_map		= $ddo_map;
						$show->sqo_config	= $sqo_config;

				// search
					// 	$search = new stdClass();
					// 		$search->ddo_map	= $ar_related_clean;
					// 		$search->sqo_config	= $sqo_config;

				// select
					// 	$select = new stdClass();
					// 		$select->ddo_map	= $ar_related_clean;

				// sqo section_tipo as ddo
					$ar_section_tipo	= is_array($target_section_tipo) ? $target_section_tipo : [$target_section_tipo];
					$ddo_section_tipo	= array_map(function($current_section_tipo){
						$ddo = new dd_object();
							$ddo->set_tipo($current_section_tipo);
							$ddo->set_label(RecordObj_dd::get_termino_by_tipo($current_section_tipo, DEDALO_APPLICATION_LANG, true, true));
							$ddo->set_color(RecordObj_dd::get_color($current_section_tipo));
							$ddo->set_permissions(common::get_permissions($current_section_tipo, $current_section_tipo));

						// buttons. Add button_new and button_delete to determine new and delete permissions on client
							$buttons = [];
							if ($ddo->permissions>1) {
								// button_new
									$ar_button_new = section::get_ar_children_tipo_by_model_name_in_section(
										$current_section_tipo,
										['button_new'],
										true, // bool from_cache
										true, // bool resolve_virtual
										true, // bool recursive
										true, // bool search_exact
										false // array|bool $ar_tipo_exclude_elements
									);
									if (isset($ar_button_new[0])) {
										$buttons[] = (object)[
											'model'			=> 'button_new',
											'permissions'	=> common::get_permissions($current_section_tipo, $ar_button_new[0])
										];
									}
								// button_delete
									$ar_button_delete = section::get_ar_children_tipo_by_model_name_in_section(
										$current_section_tipo,
										['button_delete'],
										true, // bool from_cache
										true, // bool resolve_virtual
										true, // bool recursive
										true, // bool search_exact
										false // array|bool $ar_tipo_exclude_elements
									);
									if (isset($ar_button_delete[0])) {
										$buttons[] = (object)[
											'model'			=> 'button_delete',
											'permissions'	=> common::get_permissions($current_section_tipo, $ar_button_delete[0])
										];
									}
							}
							// set buttons
							$ddo->set_buttons($buttons);

						// Matrix table. set matrix table of the section to determinate if the section is editable or private (shared and not editable by users)
							$ddo->set_matrix_table(common::get_matrix_table_from_tipo($current_section_tipo));

						return $ddo;
					}, $ar_section_tipo);

				// sqo
					$sqo = new stdClass();
						$sqo->section_tipo = $ddo_section_tipo;

				// request_config_object. build
					// $request_config_object = new stdClass();
					// 	$request_config_object->api_engine	= 'dedalo';
					// 	$request_config_object->show			= $show;
					// 	$request_config_object->sqo			= $sqo;
					// 	// $request_config_object->sqo->tipo	= $tipo;
					// 	// $request_config_object->search		= $search;
					// 	// $request_config_object->select		= $select;

					$request_config_object = new request_config_object();
						$request_config_object->set_api_engine('dedalo');
						$request_config_object->set_type('main');
						$request_config_object->set_show($show);
						$request_config_object->set_sqo($sqo);

				// added parsed item
					$ar_request_query_objects[] = $request_config_object;

				// set var (TEMPORAL TO GIVE ACCESS FROM GET_SUB_DATA)
					dd_core_api::$context_dd_objects = $ddo_map;
			}//end if(isset($properties->source->request_config) || $model==='component_autocomplete_hi')


		// cache
			if ($use_cache===true) {
				$resolved_request_properties_parsed[$resolved_key] = $ar_request_query_objects;
			}

		// debug
			if(SHOW_DEBUG===true) {
				// if ($this->tipo=='oh17') {
					// dump($ar_request_query_objects, ' ar_request_query_objects ++ '.to_string($this->tipo));
				// }
			}


		return $ar_request_query_objects;
	}//end get_ar_request_config



	/**
	* GET_REQUEST_CONFIG_OBJECT
	* Call method get_ar_request_config whit current options
	* and return the expected one request_config_object
	* @return request_config_object|null $request_config_object
	*/
	public function get_request_config_object() : ?request_config_object {

		// short vars
			// $mode			= $this->get_mode(); // records_mode;
			// $tipo			= $this->get_tipo();
			// $section_tipo	= $this->get_section_tipo();
			// $section_id		= $this->get_section_id();
			// $limit			= $this->pagination->limit;

		// ar_request_config
			// $options = new stdClass();
			// 	$options->tipo			= $tipo;
			// 	$options->external		= false;
			// 	$options->section_tipo	= $section_tipo;
			// 	$options->mode			= $mode;
			// 	$options->section_id	= $section_id;
			// 	$options->limit			= $limit;
			$ar_request_query_objects = $this->get_ar_request_config();

		// request_config_object
			$request_config_object = reset($ar_request_query_objects) ?? null;


		return $request_config_object;
	}//end get_request_config_object



	/**
	* GET_RECORDS_MODE
	* @return string $records_mode
	*/
	public function get_records_mode() : string {

		$model			= get_called_class();
		$properties		= $this->get_properties();
		$records_mode	= isset($properties->source->records_mode)
			? $properties->source->records_mode
			: (in_array($model, component_relation_common::get_components_with_relations())
				? 'list'
				: $this->get_mode()
			);

		return $records_mode;
	}//end get_records_mode



	/**
	* GET_SOURCE
	* @return object $source
	*/
	public function get_source() : object {

		// $source = new request_query_object();
		// 	$source->set_tipo($this->get_tipo());
		// 	$source->set_section_tipo($this->get_section_tipo());
		// 	$source->set_lang($this->get_lang());
		// 	$source->set_mode($this->get_mode());
		// 	$source->set_section_id($this->get_section_id());
		// 	$source->set_model(get_class($this));

		$source = (object)[
			'tipo'			=> $this->get_tipo(),
			'model'			=> get_class($this),
			'section_tipo'	=> $this->get_section_tipo(),
			'section_id'	=> $this->get_section_id(),
			'lang'			=> $this->get_lang(),
			'mode'			=> $this->get_mode()
		];


		return $source;
	}//end get_source



	/**
	* GET_DDINFO_PARENTS
	* @return object $dd_info
	*/
	public static function get_ddinfo_parents(object $locator, string $source_component_tipo) : object {

		$section_id		= $locator->section_id;
		$section_tipo	= $locator->section_tipo;

		// dd_info_value array|null
		$dd_info_value = component_relation_common::get_locator_value(
			$locator, // object locator
			DEDALO_DATA_LANG, // string lang
			true, // bool show_parents
			null, // array|null ar_components_related
			false // bool include_self
		);

		$dd_info = new stdClass();
			$dd_info->tipo			= 'ddinfo';
			$dd_info->section_id	= $section_id;
			$dd_info->section_tipo	= $section_tipo;
			$dd_info->value			= $dd_info_value;
			$dd_info->parent		= $source_component_tipo;


		return $dd_info;
	}//end get_ddinfo_parents



	/**
	* BUILD_SEARCH_QUERY_OBJECT
	* Generic builder for search_query_object (override when need)
	* @return object $query_object
	*/
		// public static function build_search_query_object( object $request_options ) : object {
		// 	$start_time = start_time();

		// 	$options = new stdClass();
		// 		$options->q						= null;
		// 		$options->q_operator			= null;
		// 		$options->q_split				= null;
		// 		$options->limit					= 10;
		// 		$options->offset				= 0;
		// 		$options->lang					= 'all';
		// 		$options->logical_operator		= '$or';
		// 		$options->id					= 'temp';
		// 		$options->tipo					= null;
		// 		$options->section_tipo			= null; // use always array as value
		// 		$options->add_filter			= true;
		// 		$options->add_select			= true;
		// 		$options->order_custom			= null;
		// 		$options->full_count			= false;
		// 		$options->filter_by_locator		= false;
		// 		$options->filter_by_locators	= false; // different of 'filter_by_locator' (!)
		// 		$options->direct				= false; // true for section (!)
		// 		$options->mode					= 'list'; // It is necessary to calculate the ddo's to search / show (layout_map)
		// 		foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// 	$id					= $options->id;
		// 	$logical_operator	= $options->logical_operator;
		// 	$tipo				= $options->tipo;
		// 	$mode				= $options->mode;

		// 	# Default from options (always array)
		// 	$section_tipo = is_array($options->section_tipo) ? $options->section_tipo : [$options->section_tipo];

		// 	# Defaults
		// 	$filter_group = null;
		// 	$select_group = array();
		// 	$total_locators = false;

		// 	// filter_by_locator_builder
		// 		$filter_by_locator_builder = function($filter_by_locator, $section_tipo) {

		// 			if (is_array($section_tipo)) {
		// 				$section_tipo = reset($section_tipo);
		// 			}

		// 			// Is an array of objects
		// 				$ar_section_id = [];
		// 				foreach ((array)$filter_by_locator as $key => $value_obj) {
		// 					$current_section_id = (int)$value_obj->section_id;
		// 					if (!in_array($current_section_id, $ar_section_id)) {
		// 						$ar_section_id[] = $current_section_id;
		// 					}
		// 				}

		// 			$filter_element = new stdClass();
		// 				$filter_element->q 		= json_encode($ar_section_id);
		// 				$filter_element->path 	= json_decode('[
		// 					{
		// 						"section_tipo": "'.$section_tipo.'",
		// 						"component_tipo": "dummy",
		// 						"model": "component_section_id",
		// 						"name": "Searching"
		// 					}
		// 				]');

		// 			$op = '$and';
		// 			$filter_group = new stdClass();
		// 				$filter_group->$op = [$filter_element];

		// 			$total_locators = count($ar_section_id);

		// 			return [
		// 				'filter_group' 	 => $filter_group,
		// 				'total_locators' => $total_locators
		// 			];
		// 		};

		// 	if ($options->direct===true) {

		// 		# FILTER
		// 			if ($options->add_filter===true) {

		// 				if ($options->filter_by_locators!==false) {

		// 					// filter_by_locators case
		// 					$filter_by_locators	= $options->filter_by_locators;
		// 					$filter_group		= false;
		// 					$total_locators		= count($filter_by_locators);

		// 				}elseif ($options->filter_by_locator!==false){

		// 					// filter_by_locator case
		// 					$filter_by_locator_data = $filter_by_locator_builder($options->filter_by_locator, $section_tipo);

		// 					$filter_group	= $filter_by_locator_data['filter_group'];
		// 					$total_locators	= $filter_by_locator_data['total_locators'];
		// 				}

		// 			}//end if ($options->add_filter===true)

		// 	}else{

		// 		$RecordObj_dd_component_tipo = new RecordObj_dd($tipo);
		// 		$component_tipo_properties 	 = $RecordObj_dd_component_tipo->get_properties(true);

		// 		// source search. If not defined, use fallback to legacy related terms and build one
		// 			$request_config = common::get_request_config($tipo, $external=false, $section_tipo, $mode);

		// 		// request_config iteration
		// 			foreach ($request_config as $source_search_item) {

		// 				// current section tipo
		// 					$current_section_tipo = $source_search_item->section_tipo;

		// 				foreach ($source_search_item->search as $current_tipo) {

		// 					// check is real component
		// 						$model = RecordObj_dd::get_modelo_name_by_tipo($current_tipo, true);
		// 						if (strpos($model,'component')!==0) {
		// 							debug_log(__METHOD__." IGNORED. Expected model is component, but '$model' is received for current_tipo: $current_tipo ".to_string(), logger::ERROR);
		// 							continue;
		// 						}

		// 					$path = search::get_query_path($current_tipo, $current_section_tipo);

		// 					# FILTER . filter_element (operator_group) - default is true
		// 						if ($options->add_filter===true) {

		// 							if ($options->filter_by_locator!==false) {

		// 								// filter_by_locators case
		// 								$filter_by_locators	= $options->filter_by_locators;
		// 								$filter_group		= false;
		// 								$total_locators		= count((array)$filter_by_locators);

		// 							}elseif ($options->filter_by_locators!==false) {

		// 								// filter_by_locator case
		// 								$filter_by_locator_data = $filter_by_locator_builder($options->filter_by_locator, $current_section_tipo);

		// 								$filter_group 	= $filter_by_locator_data['filter_group'];
		// 								$total_locators = $filter_by_locator_data['total_locators'];

		// 							}else{//end if ($options->filter_by_locator!==false)

		// 								// if (!empty($options->q)) {
		// 									$filter_element = new stdClass();
		// 										$filter_element->q 		= $options->q ?? '';
		// 										$filter_element->lang 	= $options->lang;
		// 										$filter_element->path 	= $path;

		// 									$filter_group = new stdClass();
		// 										$filter_group->$logical_operator[] = $filter_element;
		// 								// }
		// 							}
		// 						}//end if ($options->add_filter===true)


		// 					# SELECT . Select_element (select_group)
		// 						if($options->add_select===true){

		// 							# Add options lang
		// 							$end_path = end($path);
		// 							$end_path->lang = $options->lang;

		// 							$select_element = new stdClass();
		// 								$select_element->path = $path;

		// 							$select_group[] = $select_element;
		// 						}

		// 				}//end foreach ($source_search_item->components as $current_tipo)

		// 			}//end foreach ($source_search as $source_search_item) {

		// 	}//end if ($options->direct===true)

		// 	$full_count		= $total_locators ?? $options->full_count;
		// 	$mode			= $options->mode ?? null;
		// 	$order_custom	= $options->order_custom ?? null;

		// 	// sqo
		// 		// $query_object = new stdClass();
		// 		// 	$query_object->typo			= 'sqo';
		// 		// 	$query_object->id			= $id;
		// 		// 	$query_object->section_tipo	= $section_tipo;
		// 		// 	$query_object->filter		= $filter_group;
		// 		// 	$query_object->select		= $select_group;
		// 		// 	$query_object->limit		= $options->limit;
		// 		// 	$query_object->offset		= $options->offset;
		// 		// 	$query_object->full_count	= $full_count;

		// 		// 	if (!empty($options->mode)) {
		// 		// 		$query_object->mode = $options->mode;
		// 		// 	}
		// 		// 	if (!empty($filter_by_locators)) {
		// 		// 		$query_object->filter_by_locators = $filter_by_locators;
		// 		// 	}
		// 		// 	if (!empty($options->order_custom)) {
		// 		// 		$query_object->order_custom = $options->order_custom;
		// 		// 	}

		// 	// sqo
		// 		$sqo = new build_search_query_object();
		// 			$sqo->set_id($id);
		// 			$sqo->set_section_tipo($section_tipo);
		// 			$sqo->set_filter($filter);
		// 			$sqo->set_select($select);
		// 			$sqo->set_limit($limit);
		// 			$sqo->set_offset($offset);
		// 			$sqo->set_full_count($full_count);

		// 			if (!empty($mode)) {
		// 				$sqo->set_mode($mode);
		// 			}
		// 			if (!empty($filter_by_locators)) {
		// 				$sqo->set_filter_by_locators($filter_by_locators);
		// 			}
		// 			if (!empty($order_custom)) {
		// 				$sqo->set_order_custom($order_custom);
		// 			}


		// 	return (object)$query_object;
		// }//end build_search_query_object



	/**
	* GET SECTION ID
	* Section id está en el dato (registro matrix) de la sección estructurado en json
	* tal que: {"section_id": 2 ..}
	* @param string|int|null
	*/
	public function get_section_id() : string|int|null {

		return $this->section_id ?? null;
	}//end get_section_id



	/**
	* GET_DATA_ITEM
	* Only to maintain vars and format unified
	* @param mixed $value
	* @return object $item
	*/
	public function get_data_item($value) : object {

		$item = new stdClass();
			$item->section_id			= $this->get_section_id();
			$item->section_tipo			= $this->get_section_tipo();
			$item->tipo					= $this->get_tipo();
			$item->pagination			= $this->get_pagination();
			$item->from_component_tipo	= $this->from_component_tipo ?? $this->get_tipo();
			$item->value				= $value;

		return $item;
	}//end get_data_item



	/**
	* GET_ELEMENT_LANG
	* Used to resolve component lang before construct it
	* @param string $tipo
	* @param string|null $data_lang
	*
	* @return string lang
	* 	code like 'lg-spa'
	*/
	public static function get_element_lang(string $tipo, string $data_lang=null) : string {

		if (empty($data_lang)) {
			$data_lang = DEDALO_DATA_LANG;
		}

		$translatable	= RecordObj_dd::get_translatable($tipo);
		$lang			= ($translatable===true) ? $data_lang : DEDALO_DATA_NOLAN;

		return $lang;
	}//end get_element_lang



	/**
	* GET_SECTION_ELEMENTS_CONTEXT
	* Get list of all components available for current section using get_context_simple
	* Used to build search presets in filter
	* @param object $request_options
	* @return array $context
	*/
	public static function get_section_elements_context(object $options) : array {

		// options
			$context_type				= $options->context_type ?? 'simple';
			$ar_section_tipo			= $options->ar_section_tipo ?? null;
			$use_real_sections			= $options->use_real_sections ?? false;
			$skip_permissions 			= $options->skip_permissions ?? false;
			$path						= $options->path ?? [];
			$ar_tipo_exclude_elements	= $options->ar_tipo_exclude_elements ?? false;
			$ar_components_exclude		= $options->ar_components_exclude ?? [
				'component_password',
				// 'component_filter_records',
				'component_image',
				'component_3d',
				'component_av',
				'component_pdf',
				'component_security_administrator',
				//'component_relation_children',
				//'component_relation_related',
				//'component_relation_model',
				//'component_relation_parent',
				//'component_relation_index',
				//'component_relation_struct',
				'component_geolocation',
				'component_info',
				'component_state',
				'component_semantic_node',
				'section_tab'
			];
			$ar_include_elements		= $options->ar_include_elements ?? [
				'component',
				'section_group',
				'section_group_div',
				'section_tab'
			];

		// common section info
			$ar_elements = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
				DEDALO_SECTION_INFO_SECTION_GROUP,
				'component',
				'children',
				false // bool search_exact
			);
			$section_info_elements = array_merge([DEDALO_SECTION_INFO_SECTION_GROUP], $ar_elements);

		// Manage multiple sections
		// section_tipo can be an array of section_tipo. To prevent duplicates, check and group similar sections (like es1, co1, ..)
		$resolved_section	= [];
		$context			= [];
		foreach ((array)$ar_section_tipo as $section_tipo) {

			// permissions
				$section_permisions = ($skip_permissions === true)
					? 1
					: security::get_security_permissions($section_tipo, $section_tipo);

				// $section_permisions =  security::get_security_permissions($section_tipo, $section_tipo);

			// user id
				$user_id_logged = logged_user_id();

			// skip section if permissions are not enough (except thesaurus 'hierarchy20')
				if ( $section_permisions<1  && $section_tipo!==DEDALO_THESAURUS_SECTION_TIPO ) {
					// user don't have access to current section. skip section
					continue;
				}

			// use_real_sections. If true, replace current section_tipo to prevent duplicates in output (thesaurus case)
				if ($use_real_sections===true) {
					$section_real_tipo = section::get_section_real_tipo_static($section_tipo);
					if (in_array($section_real_tipo, $resolved_section)) {
						continue;
					}
					$resolved_section[] = $section_real_tipo;

					// replace section_tipo value from here (!)
					$section_tipo = $section_real_tipo;
				}

			// create the section instance and get the context_simple
				$dd_section = section::get_instance(
					null, // string|null section_tipo
					$section_tipo, // string section_tipo
					'list', // string list
					true // bool cache
				);

			// element JSON
				// 	$get_json_options = new stdClass();
				// 		$get_json_options->get_context 		= true;
				// 		$get_json_options->context_type 	= $context_type;
				// 		$get_json_options->get_data 		= false;
				// 	$element_json = $dd_section->get_json($get_json_options);

			// item context add to context
				// $item_context = $element_json->context;
				$item_context = [
					$dd_section->get_structure_context_simple(
						$section_permisions,
						false // bool add_rqo
					)
				];
				$context = array_merge($context, $item_context);

			// section children
				$ar_elements = section::get_ar_children_tipo_by_model_name_in_section(
					$section_tipo, // section_tipo
					$ar_include_elements, // ar_include_elements
					true, // from_cache
					true, // resolve_virtual
					true, // recursive
					false, // search_exact
					$ar_tipo_exclude_elements // exclude_elements
				);

			// Add common section info elements (only if ar_elements if not empty)
				if (!empty($ar_elements)) {
					foreach ($section_info_elements as $current_section_info_el) {
						$ar_elements[] = $current_section_info_el;
					}
				}

			foreach ($ar_elements as $element_tipo) {

				if($element_tipo===DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO) continue; //'component_security_areas' removed in v6 but the component will stay in ontology, PROVISIONAL, only in the alpha state of V6 for compatibility of the ontology of V5.

				// model
					$model = RecordObj_dd::get_modelo_name_by_tipo($element_tipo,true);
					if (in_array($model, $ar_components_exclude)) {
						continue;
					}

				// common temporal excluded/mapped models *******
					// $match_key = array_search($model, common::$ar_temp_map_models);
					$mapped_model = isset(common::$ar_temp_map_models[$model])
						? common::$ar_temp_map_models[$model]
						: false;
					if (false!==$mapped_model) {
						debug_log(__METHOD__." +++ Mapped model $model to $mapped_model from layout map ".to_string(), logger::WARNING);
						$model = $mapped_model;
					}else if (in_array($model, common::$ar_temp_exclude_models)) {
						debug_log(__METHOD__." +++ Excluded model $model from layout map ".to_string(), logger::WARNING);
						continue;
					}

				switch (true) {

					// component case
					case (strpos($model, 'component_')===0):
						$translatable	= RecordObj_dd::get_translatable($element_tipo);
						$current_lang	= $translatable ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
						$element		= component_common::get_instance(
							$model,
							$element_tipo,
							null,
							'search',
							$current_lang,
							$section_tipo
						);
						break;

					// grouper case
					case (in_array($model, common::$groupers)):
						$grouper_model	= ($model==='section_group_div') ? 'section_group' : $model;
						$element		= new $grouper_model($element_tipo, $section_tipo, 'list');
						break;

					// others case
					default:
						debug_log(__METHOD__
							." Ignored model '$model' - current_tipo: '$element_tipo' "
							, logger::WARNING
						);
						break;
				}//end switch (true)

				// element JSON
					// 	$get_json_options = new stdClass();
					// 		$get_json_options->get_context 		= true;
					// 		$get_json_options->context_type 	= $context_type;
					// 		$get_json_options->get_data 		= false;
					// 	$element_json = $element->get_json($get_json_options);

				if(empty($element)){
					debug_log(__METHOD__
						." Ignored empty element !!!!".PHP_EOL
						."tipo: ".to_string($element_tipo).PHP_EOL
						."model: ".to_string($model)
						, logger::ERROR
					);
					continue;
				}

				// item context simple
				$item_context = [
					$element->get_structure_context_simple(
						$section_permisions,
						false // bool add_rqo
					)
				];

				// target section tipo add
					if ($model==='component_portal' || $model==='component_dataframe') {
						$ddo = reset($item_context);
						$target_section_tipo = $element->get_ar_target_section_tipo();
						$ddo->target_section_tipo = $target_section_tipo;
					}

				// context add
					$context = array_merge($context, $item_context);

			}//end foreach ($ar_elements as $element_tipo)
		}//end foreach ((array)$ar_section_tipo as $section_tipo)
	// dump($context, ' context +---------------+ '.to_string());

		return $context;
	}//end get_section_elements_context



	/**
	* GET_TOOLS
	* Get element (component, section, ...) tools filtered by user permissions
	* @return array $tools
	*/
	public function get_tools() : array {

		// debug
			if(SHOW_DEBUG===true) {
				$start_time=start_time();

				// metrics
				metrics::$get_tools_total_calls++;
			}

		// already set
			if (isset($this->tools)) {
				return $this->tools;
			}

		// cache
			$use_cache = true;
			if ($use_cache===true) {
				// static $cache_get_tools;
				static $cache_get_tools;
				$cache_key = $this->tipo.'_'.($this->get_section_tipo() ?? '');
				if (isset($cache_get_tools[$cache_key])) {
					return $cache_get_tools[$cache_key];
				}
			}

		$tools = [];

		// user_id
			$user_id = logged_user_id();
			if (empty($user_id)) {
				return $tools;
			}

		// user_tools (cached on file cache_user_tools.json)
			$user_tools	= tool_common::get_user_tools($user_id);

		// short vars
			$model				= get_class($this);
			$tipo				= $this->tipo;
			$is_component		= strpos($model, 'component_')===0;
			$tranducible		= $this->traducible; // string si|no fixed on construct element
			$properties			= $this->get_properties();
			$with_lang_versions	= $this->with_lang_versions;

		// element tools
			foreach ($user_tools as $tool) {

				$affected_tipos				= isset($tool->affected_tipos)  ? (array)$tool->affected_tipos : [];
				$affected_models			= isset($tool->affected_models) ? (array)$tool->affected_models : [];
				$requirement_translatable	= isset($tool->requirement_translatable) ? (bool)$tool->requirement_translatable : false;
				$in_properties				= $properties->tool_config->{$tool->name} ?? null;

				if(		in_array($model, $affected_models)
					||	in_array($tipo,  $affected_tipos)
					||	($is_component===true && in_array('all_components', $affected_models))
					||	!is_null($in_properties)
				  ) {

					// affected_tipos specific restriction like tool_indexation (only 'rsc36')
						if (!empty($affected_tipos[0])) {
							if(!in_array($tipo, $affected_tipos)) {
								continue;
							}
						}

					// diffusion case. Skip non diffusion defined (in Ontology) sections
						if ($tool->name==='tool_diffusion') {
							$have_section_diffusion = diffusion::have_section_diffusion($tipo);
							if ($have_section_diffusion===false) {
								continue;
							}
						}

					if ($requirement_translatable===true) {

						$translatable = ($is_component===true)
							? (($tranducible==='no' && $with_lang_versions!==true) ? false : true)
							: false;

						if ($requirement_translatable===$translatable) {
							$tools[] = $tool;
						}

					}else{

						$tools[] = $tool;
					}
				}
			}//end foreach ($registered_tools as $tool)

		// cache
			if ($use_cache===true) {
				// static
				$cache_get_tools[$cache_key] = $tools;
			}

		// debug
			if(SHOW_DEBUG===true) {
				// metrics
				$total_time_ms = exec_time_unit($start_time, 'ms');
				metrics::$get_tools_total_time += $total_time_ms;
			}


		return $tools;
	}//end get_tools



	/**
	* GET_BUTTONS_CONTEXT
	* @return array $ar_button_ddo
	* 	Array of dd_object
	*/
	public function get_buttons_context() : array {

		// already calculated
			if (isset($this->buttons_context)) {
				return $this->buttons_context;
			}

		// ar_button_ddo is array always
			$ar_button_ddo = [];

		// model validation (only areas and section are allowed)
			$model = get_called_class();
			if ($model!=='section' && strpos($model, 'area')===false) {
				return []; // null;
			}

		// tipo
			$tipo = $this->tipo;

		// ar_buttons_tipo
			$ar_buttons_tipo = (get_called_class()==='section')
				? $this->get_section_buttons_tipo()
				: RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($tipo, 'button_', 'children', false);

		// ar_button_objects create
			foreach ($ar_buttons_tipo as $current_button_tipo) {

				// permissions
					$permissions = common::get_permissions($tipo, $current_button_tipo);
					if($permissions<2) {
						continue;
					}

				// model
					$model = RecordObj_dd::get_modelo_name_by_tipo($current_button_tipo, true);
					// skip exclude_models
					if(in_array($model, common::$ar_temp_exclude_models)){
						continue;
					}

				// label $terminoID, $lang=NULL, $from_cache=false, $fallback=true
					$button_label = RecordObj_dd::get_termino_by_tipo($current_button_tipo, DEDALO_APPLICATION_LANG, true, true);

				// properties
					$RecordObj_dd		= new RecordObj_dd($current_button_tipo);
					$button_properties	= $RecordObj_dd->get_properties();
					if(isset($button_properties->disable) && $button_properties->disable === true ){
						continue;
					}

				// button_import and button_trigger cases for compatibility with v5 ontology
				// in future version will be merge both with new model button_tool
				// in the mid-time use button_trigger for general cases to dispatch tools.
					$tools = null;
					if($model==='button_import' || $model==='button_trigger'){

						// tools_list
						$tools_list	= tool_common::get_user_tools( logged_user_id() );

						$tools = [];
						foreach ($tools_list as $tool_object) {

							$tool_config = isset($button_properties->tool_config->{$tool_object->name})
								? $button_properties->tool_config->{$tool_object->name}
								: null;

							if(!isset($tool_config)) continue;

							$current_section_tipo	= $this->get_section_tipo() ?? $this->tipo;
							$tool_context			= tool_common::create_tool_simple_context($tool_object, $tool_config, $this->tipo, $current_section_tipo );

							$tools[] = $tool_context;
						}//end foreach ($tools_list as $item)
					}//end if($model === 'button_import')

				// button object
					$button_obj = new dd_object();
						$button_obj->set_type('button');
						$button_obj->set_tipo($current_button_tipo);
						$button_obj->set_model($model);
						$button_obj->set_label($button_label);
						$button_obj->set_properties($button_properties);
						$button_obj->set_tools($tools);

				// add button ddo
				$ar_button_ddo[] = $button_obj;
			}//end foreach ($ar_buttons_tipo as $current_button_tipo)

		// fix value
			$this->buttons_context = $ar_button_ddo;


		return $ar_button_ddo;
	}//end get_buttons_context



	/**
	* GET_COLUMNS_MAP
	* Columns_map define the order and how the section or component will build the columns in list, the columns maps was defined in the properties.
	* @return array|null $columns_map
	*/
	public function get_columns_map() : ?array {

		$mode = $this->get_mode();
		$tipo = $this->get_tipo();

		// get the properties, if the mode is list, get the child term 'section_list' that had has the configuration of the list (for sections and portals)
		// by default or edit mode get the properties of the term itself.
			switch ($mode) {
				case 'list':
				case 'tm':
				// case 'portal_list':
					# in the case that section_list is defined
					$ar_terms = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($tipo, 'section_list', 'children', true);
					if(isset($ar_terms[0])) {
						# Use found related terms as new list
						$current_term	= $ar_terms[0];
						$RecordObj_dd	= new RecordObj_dd($current_term);
						$properties		= $RecordObj_dd->get_properties();
					}
					else{
						// sometime the portals don't has section_list defined, in these cases get the properties of the current tipo
						$properties		= $this->get_properties();
					}
					break;

				default:
					// edit mode or components without section_list defined (other than portals or sections)
					$properties		= $this->get_properties();
					break;
			}

		$columns_map = $properties->source->columns_map ?? null;


		return $columns_map;
	}//end get_columns_map



	/**
	* GET_AR_INVERTED_PATHS
	* Resolve the unique and isolated paths into the ddo_map with all dependencies (portal into portals, portals into sections, etc)
	* get the path in inverse format, the last in the chain will be the first object [0]
	* @return array ar_inverted_paths the the specific paths, with inverse path format.
	* (!) Commented because nobody calls it (21-11-2022)
	*/
		// public function get_ar_inverted_paths(array $full_ddo_map) : array {

		// 	// get the parents for the column, creating the inverse path
		// 	// (from the last component to the main parent, the column will be with the data of the first item of the column)
		// 		if (!function_exists('get_parents')) {
		// 			function get_parents($ar_ddo, $dd_object) {
		// 				$ar_parents = [];

		// 				$parent = array_find($ar_ddo, function($item) use($dd_object){
		// 					return $item->tipo===$dd_object->parent;
		// 				});
		// 				if (!empty($parent)) {
		// 					$ar_parents[]	= $parent;
		// 					$new_parents	= get_parents($ar_ddo, $parent);
		// 					$ar_parents[]	= array_merge($ar_parents, $new_parents);
		// 				}

		// 				return $ar_parents;
		// 			}
		// 		}

		// 	// every ddo will be checked if it is a component_portal or if is the last component in the chain
		// 	// set the valid_ddo array with only the valid ddo that will be used.
		// 		$ar_inverted_paths = [];
		// 		$ddo_length = count($full_ddo_map);
		// 		for ($i=0; $i < $ddo_length; $i++) {

		// 			$current_ddo = $full_ddo_map[$i];
		// 			// check if the current ddo has children associated, it's necessary identify the last ddo in the path chain, the last ddo create the column
		// 			// all parents has the link and data to get the data of the last ddo.
		// 			// interview -> people to study -> name
		// 			// «name» will be the column, «interview» and «people under study» has the locator to get the data.
		// 			$current_ar_valid_ddo = array_find($full_ddo_map, function($item) use($current_ddo){
		// 				return $item->parent === $current_ddo->tipo;
		// 			});
		// 			if(!empty($current_ar_valid_ddo)) continue;
		// 			$column = [];

		// 			// get the path with inverse order
		// 			// people to study -> interview
		// 			$parents = get_parents($full_ddo_map, $current_ddo);

		// 			// join all with the inverse format
		// 			// name -> people to study -> interview
		// 			$column[]				= $current_ddo;
		// 			$column					= array_merge($column, $parents);
		// 			$ar_inverted_paths[]	= $column;
		// 		}

		// 	return $ar_inverted_paths;
		// }//end get_ar_inverted_paths



	/**
	* SET_VIEW
	* @return void
	*/
	public function set_view(?string $view) : void {

		$this->view = $view;
	}//end set_view



	/**
	* GET_VIEW
	* @return string|null $view
	*/
	public function get_view() : ?string {

		// When view is injected by ddo_map
			if(isset($this->view)) {
				return $this->view;
			}

		// list mode
			if ($this->mode==='list' &&
				(strpos(get_called_class(), 'component_')===0 || get_called_class()==='section')){
				// section list
				$ar_terms = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
					$this->tipo,
					'section_list',
					'children',
					true
				);
				if(isset($ar_terms[0])) {
					$current_term	= $ar_terms[0];
					$RecordObj_dd	= new RecordObj_dd($current_term);
					$properties		= $RecordObj_dd->get_properties();
					if( isset($properties->view) ) {
						return $properties->view;
					}
				}
			}

		// properties defined case
			$properties = $this->get_properties();
			if( isset($properties->view) ) {
				return $properties->view;
			}

		// resolve legacy models and exceptions
			$options = new stdClass();
				$options->model	= $this->get_model();
				$options->tipo	= $this->get_tipo();

			$view = common::resolve_view($options);

		return $view;
	}//end get_view



	/**
	* RESOlVE_VIEW
	* @param object $options
	* @return string|null $view
	*/
	public static function resolve_view(object $options) : ?string {

		// options
			$model	= $options->model;
			$tipo	= $options->tipo;

		// non relation components cases as 'component_input_text'
		// $ar_related = component_relation_common::get_components_with_relations();
			$components_to_change = [
				'component_portal',
				'component_text_area'
			];

		// relation components like 'component_portal'
			$legacy_model = (in_array($model, $components_to_change))
				? RecordObj_dd::get_legacy_model_name_by_tipo($tipo)
				: $model;

		// view
			switch ($legacy_model) {
				case 'component_portal':
					$view = 'default';
					break;
				case 'component_relation_children':
				case 'component_relation_parent':
				case 'component_relation_index':
				case 'component_relation_related':
				case 'component_autocomplete':
				case 'component_autocomplete_hi':
					$view = 'line';
					break;
				case 'component_html_text':
					$view = 'html_text';
					break;
				default:
					$view = null; // 'default';
					break;
			}

		return $view;
	}//end resolve_view



	/**
	* GET_CHILDREN_VIEW
	* @return string|null $children_view
	*/
	public function get_children_view() : ?string {

		// When view is injected by ddo_map
			if(isset($this->children_view)){
				return $this->children_view;
			}

		// properties defined case
			$properties = $this->get_properties();
			if(isset($properties->children_view)){
				return $properties->children_view;
			}

		// based on legacy_model
			$legacy_model = RecordObj_dd::get_legacy_model_name_by_tipo($this->get_tipo());
			switch ($legacy_model) {
				case 'component_relation_children':
				case 'component_relation_parent':
				case 'component_relation_index':
				case 'component_relation_related':
				case 'component_autocomplete':
				case 'component_autocomplete_hi':
					$children_view = 'text';
					break;
				default:
					$children_view = null; // 'default';
					break;
			}

		return $children_view;
	}//end get_children_view



	/**
	* RESOLVE_LIMIT
	* @return int|null
	*/
	public function resolve_limit() : ?int {

		// properties check for request_config
		$properties = $this->get_properties();
		if (!property_exists($properties, 'source') ||
			!property_exists($properties->source, 'request_config')
			) {
			return null;
		}

		$request_config			= $properties->source->request_config;
		$request_config_item	= array_find($request_config, function($el){
			return $el->api_engine==='dedalo';
		});

		// sqo try
		if (isset($request_config_item->sqo) && isset($request_config_item->sqo->limit)) {
			return (int)$request_config_item->sqo->limit;
		}

		// show try
		if (isset($request_config_item->show->sqo_config) && isset($request_config_item->show->sqo_config->limit)) {
			return (int)$request_config_item->show->sqo_config->limit;
		}


		return null;
	}//end resolve_limit



}//end class common
