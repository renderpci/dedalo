<?php
/**
* COMPONENT_COMMON
* Common methods of all components
*
*/
abstract class component_common extends common {

	# GENERAL VARS
		protected $tipo;					# string component tipo in structur ex ('dd22') eq. terminoID
		protected $parent;					# int parent section_id
		protected $section_tipo;			# string parent section tipo
		protected $lang;					# string lang en estructura ('lg-esp')
		protected $valor_lang;				# string Idioma del valor final del componente (si es una lista de valor, el idioma del campo al que apunta que puede ser traducible aunque el componente no lo sea dato"1" valor:"Si" o "yes")
		protected $traducible;				# string definido en tesauro (si/no)
		protected $modo;					# string default edit
		protected $dato;					# object dato (json ecoded in db)
		protected $valor;					# string usually dato
		protected $dataframe;				# object dataframe
		public $version_date;				# date normalmente despejado de time machine y asignado al component actual

		# STRUCTURE DATA
		public $RecordObj_dd;				# obj ts
		protected $modelo;
		protected $norden;
		protected $label;					# etiqueta

		protected $required;				# field is required . Valorar de usar 'Usable en Indexación' (tesauro) para gestionar esta variable
		protected $debugger;				# info for admin
		protected $ejemplo;					# ex. 'MO36001-GA'
		protected $ar_tools_name = array('tool_time_machine','tool_lang','tool_replace_component_data','tool_add_component_data');
		protected $ar_tools_obj;
		protected $ar_authorized_tool_name;

		protected $exists_dato_in_any_lan = false;
		protected $dato_resolved;

		# Idioma esperado para este componente (usado para verificar que la estrucutra está bien formada)
		protected $expected_lang;

		# parent section obj (optional, util for component_av...)
		public $section_obj;

		# referenced section tipo (used by component_autocomplete, compoent_radio_button.. for set target section_tipo (propiedades) - aditional to referenced component tipo (TR)- )
		public $referenced_section_tipo;

		# CACHE COMPONENTS INTANCES
		#public static $ar_component_instances = array();	# array chache of called instances of components

		public $render_vars;

		# search_input_name. injected for records search
		public $search_input_name;

		# generate_json component
		public $generate_json_element = false;

		# diffusion_properties. Used to inject diffusion element properties in current component (useful to configure custom value resolutions)
		public $diffusion_properties;

		# update_diffusion_info_propagate_changes bool
		# To optimize save process in scripts of importation, you can dissable (false) this option if is not really necessary
		public $update_diffusion_info_propagate_changes;

		# Component definition. Used in component label
		public $def;



	/**
	* GET_INSTANCE
	* Singleton pattern
	* @returns array array of component objects by key
	*/
	public static function get_instance($component_name=null, $tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_LANG, $section_tipo=null, $cache=true) {

		# TIPO : MANDATORY
		if (empty($tipo)) {
			throw new Exception("Error: on construct component : tipo is mandatory. tipo:$tipo, parent:$parent, modo:$modo, lanfg:$lang", 1);
		}

		# PARENT : OPTIONAL (On save component, new section is created)
		#if (empty($parent)) {
			#if(SHOW_DEBUG===true) {
				#dump($component_name,"component_name");
			#}
		#}

		# SECTION_TIPO : OPTIONAL (if empty, section_tipo is calculated from: 1. page globals, 2. structure -only useful for real sections-)
		if (empty($section_tipo)) {
			/*
			$section_tipo = component_common::resolve_section_tipo($tipo);
			debug_log(__METHOD__." Called component without section tipo ".to_string($tipo), logger::DEBUG);
			*/
			trigger_error("Sorry. resolve_section_tipo is not supported anymore. Please fix this call ASASP");
			if(SHOW_DEBUG===true) {
				dump($section_tipo, ' DEBUG WARNING: TRIGGERED resolve_section_tipo from: '.to_string($tipo));
				$bt = debug_backtrace();
				debug_log(__METHOD__." DEBUG WARNING: TRIGGERED resolve_section_tipo: bt : ".to_string($bt), logger::ERROR);
			}
			return null;
		}

		if(SHOW_DEBUG===true) {
			if ( !empty($component_name) && strpos($component_name, 'component_')===false ) {
				dump($tipo," tipo");
				$bt = debug_backtrace();
				debug_log(__METHOD__." DEBUG WARNING: TRIGGERED section or ($component_name) intented to load as component: bt : ".to_string($bt), logger::ERROR);
				throw new Exception("Error Processing Request. section or ($component_name) intented to load as component", 1);
			}
			if ( is_numeric($tipo) || !is_string($tipo) || !RecordObj_dd::get_prefix_from_tipo($tipo) ) {
				dump($tipo," tipo");
				throw new Exception("Error Processing Request. trying to use wrong var: '$tipo' as tipo to load as component", 1);
			}
			if ( (!empty($parent)
				 && ( (!is_numeric($parent) || abs($parent)<1)) && strpos($parent, DEDALO_SECTION_ID_TEMP)===false) )
				{
				dump($parent," parent - DEDALO_SECTION_ID_TEMP:".DEDALO_SECTION_ID_TEMP);
				throw new Exception("Error Processing Request. trying to use wrong var: '$parent' as parent to load as component", 1);
			}
			$ar_valid_modo = array('edit','list','search','simple','list_tm','tool_portal','tool_lang','edit_tool','indexation','selected_fragment','tool_indexation','tool_transcription','print','edit_component','load_tr','update','portal_list','list_thesaurus','portal_list_view_mosaic','edit_in_list','edit_note','tool_structuration','dataframe_edit','tool_description','view_tool_description','player','json');
			if ( empty($modo) || !in_array($modo, $ar_valid_modo) ) {
				if(SHOW_DEBUG===true) {
					throw new Exception("Error Processing Request. trying to use wrong var: '$modo' as modo to load as component", 1);	;
				}
				debug_log(__METHOD__." trying to use empty or invalid modo: '$modo' as modo to load component $tipo. modo: ".to_string($modo), logger::DEBUG);
			}
			if ( empty($lang) || strpos($lang, 'lg-')===false ) {
				#dump($lang," lang");
				$dt = debug_backtrace();
				dump($dt, ' var ++ '.to_string());
				throw new Exception("Error Processing Request. trying to use wrong var: '$lang' as lang to load as component $component_name, $tipo", 1);
			}
			if (!empty($section_tipo)) {
				# Verify modelo_name is section
				$section_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($section_tipo,true);
				if ($section_modelo_name!=='section') {
					dump($section_tipo," section_tipo - section_modelo_name: $section_modelo_name");
					if (empty($section_modelo_name)) {
						$msg = "Error. Current section ($section_tipo) don't exists or model is missing. Please fix structure ASAP";
						throw new Exception($msg, 1);
					}
					throw new Exception("Error Processing Request. Trying to use: $section_modelo_name ($section_tipo) as section. Verified modelo is: $section_modelo_name", 1);
				}
				# Verify this section is a invalid resource call
				$ar_resources = array('rsc2','rsc75','rsc3','rsc4');
				if (in_array($section_tipo, $ar_resources) && $tipo!=='rsc88') {
					debug_log(__METHOD__." ERROR - Error Processing Request. Direct call to resource section_tipo ($section_tipo) is not legal".to_string(), logger::ERROR);
					debug_log(__METHOD__." ERROR: debug_backtrace ".to_string( debug_backtrace() ), logger::DEBUG);
					trigger_error("ERROR - Error Processing Request. Direct call to resource section_tipo");
					#throw new Exception("Error Processing Request. Direct call to resource section_tipo ($section_tipo) is not legal", 1);
				}else if(strpos($modo, 'dataframe')===false){
					$ar_modified_section_tipos = array_map(function($item){
						return $item['tipo'];
					}, section::get_modified_section_tipos());
					// add publication info
						$ar_modified_section_tipos[] = diffusion::$publication_first_tipo;
						$ar_modified_section_tipos[] = diffusion::$publication_last_tipo;
						$ar_modified_section_tipos[] = diffusion::$publication_first_user_tipo;
						$ar_modified_section_tipos[] = diffusion::$publication_last_user_tipo;
					if (true===in_array($tipo, $ar_modified_section_tipos)) {
						# skip verification
					}else{
						# Verify this section is from current component tipo
						$ar_terminoID_by_modelo_name = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($tipo, 'section', 'parent');
						if (!isset($ar_terminoID_by_modelo_name[0])) {
							debug_log(__METHOD__." ar_terminoID_by_modelo_name is empty for tipo ($tipo), ar_terminoID_by_modelo_name:".to_string($ar_terminoID_by_modelo_name), logger::ERROR);
							throw new Exception("Error Processing Request", 1);
						}
						$calculated_section_tipo = $ar_terminoID_by_modelo_name[0];
						$real_section 			 = section::get_section_real_tipo_static($section_tipo);
						$is_real 				 = $real_section===$section_tipo ? true : false;
						if ( $is_real && $section_tipo!=$calculated_section_tipo && $modo!=='search' && SHOW_DEBUG===true) {
							#dump(debug_backtrace(), ' debug_backtrace '.to_string());
							#throw new Exception("Error Processing Request. Current component ($tipo) is not children of received section_tipo: $section_tipo.<br> Real section_tipo is: $real_section and calculated_section_tipo: $calculated_section_tipo ", 1);
						}
					}
				}
			}

			if (is_array($parent)) {
				trigger_error("Error: parent is array!");
				$bt = debug_backtrace();
				debug_log(__METHOD__." Error: parent is array! : ".to_string($bt), logger::ERROR);
			}
		}//end if(SHOW_DEBUG===true)

		# Direct construct without cache instance
		# Use this config in imports
		if ($cache===false) {
			return new $component_name($tipo, $parent, $modo, $lang, $section_tipo);
		}

		static $ar_component_instances;

		# key for cache
		$key = $tipo .'_'. $section_tipo .'_'. $parent .'_'. $lang;

		$max_cache_instances = 160; // 500
		$cache_slice_on 	 = 40; // 200 //$max_cache_instances/2;

		# OVERLOAD : If ar_component_instances > 99 , not add current element to cache to avoid overload
		if ( isset($ar_component_instances) && count($ar_component_instances)>$max_cache_instances ) {
			$ar_component_instances = array_slice($ar_component_instances, $cache_slice_on, null, true);
			if(SHOW_DEBUG===true) {
				#debug_log(__METHOD__." Overload components prevent. Unset first cache item [$key]");
			}
		}

		# unset($ar_component_instances);
		# FIND CURRENT INSTANCE IN CACHE
		if ( !isset($ar_component_instances) || !array_key_exists($key, $ar_component_instances) ) {

			if (empty($component_name)) {
				$component_name = RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
			}
			if (strpos($component_name, 'component_')===false) {
				if(SHOW_DEBUG===true) {
					throw new Exception("Error Processing Request. Ilegal component: '$component_name' on ".__METHOD__, 1);
				}
				return null;
			}

			# __CONSTRUCT : Store new component in static array var
			$ar_component_instances[$key] = new $component_name($tipo, $parent, $modo, $lang, $section_tipo);

		}else{

			# Change modo if need
			if ($ar_component_instances[$key]->get_modo()!==$modo) {
				$ar_component_instances[$key]->set_modo($modo);
			}
		}


		if(SHOW_DEBUG===true) {
			# Verify 'component_name' and 'tipo' are correct
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			if (!empty($component_name) && $component_name!==$modelo_name) {
				$msg = "Error Processing Request. Inconsistency detected with get_instance 'tipo' ($tipo). Expected model is ($modelo_name) and received model is ($component_name)";
				#throw new Exception($msg, 1);
				debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
			}
		}

		return $ar_component_instances[$key];
	}//end get_instance



	# __CONSTRUCT
	public function __construct($tipo=NULL, $parent=NULL, $modo='edit', $lang=DEDALO_DATA_LANG, $section_tipo=null) {

		# TIPO : Test valid tipo
		if ( empty($tipo) ) {
			$msg = "Component common: valid 'tipo' value is mandatory!";
			$GLOBALS['log_messages'][] = $msg;
			throw new Exception($msg, 1);
		}elseif ($tipo==='dummy') {
			throw new Exception("Error dummy caller!!", 1);
		}
		$this->tipo = $tipo;

		# PARENT : Test valid parent
		#if ( $parent === NULL ) {
		#	$msg = "Component common: valid 'parent' value is mandatory! ";
		#	throw new Exception($msg, 1);
		#}
		$this->parent = $parent;

		# MODO
		if ( empty($modo) ) {
			$modo = 'edit';
		}
		$this->modo = $modo;
		if ($this->modo==='print') {
			$this->print_options = new stdClass();
		}
		if ($this->modo==='edit') {
			$this->update_diffusion_info_propagate_changes = true;
		}

		# LANG : Test valid lang
		if(isset($this->lang)) {
			# LANG : Overwrite var '$lang' with previous component declatarion of '$this->lang'
			$lang = $this->lang;
		}elseif ( empty($lang) ) {
			$msg = __METHOD__.' Valid \'lang\' value is mandatory! Default DEDALO_DATA_LANG ('.DEDALO_DATA_LANG.') is used';
			$GLOBALS['log_messages'][] = $msg;
			trigger_error($msg);
			$lang = DEDALO_DATA_LANG;
		}
		$this->lang = $lang;

		# SECTION_TIPO
		# SECTION_TIPO : OPTIONAL (if empty, section_tipo is calculated from: 1. page globals, 2. structure -only useful for real sections-)
		if (empty($section_tipo)) {
			$section_tipo = component_common::resolve_section_tipo($tipo);
			debug_log(__METHOD__." Calculated section tipo from tipo ($tipo) !!!!!! Fix ASAP ".to_string(), logger::ERROR);
		}
		$this->section_tipo = $section_tipo;


		# STRUCTURE DATA : common::load_structure_data()
		# Fijamos el tipo recibido y cargamos la estructura previamente para despejar si este tipo es traducible o no
		# y fijar de nuevo el lenguaje en caso de no ser traducible
		parent::load_structure_data();

		# LANG : Check lang
		# Establecemos el lenguaje preliminar (aunque todavía no están cargados lo datos de matrix, ya tenemos la información de si es o no traducible
		# a partir de la carga de la estructura)
		if ($this->traducible==='no') {
			$propiedades = $this->get_propiedades();
			if (isset($propiedades->with_lang_versions) && $propiedades->with_lang_versions===true) {
				# Allow tool lang on non translatable components
			}else{
				# Force nolan
				$this->lang = DEDALO_DATA_NOLAN;
			}
		}

		$this->ar_tools_obj		= false;
		$this->debugger			= "tipo:$this->tipo - norden:$this->norden - modo:$this->modo - parent:$this->parent";


		# SET_DATO_DEFAULT (new way 28-10-2016)
		if ( $this->modo==='edit' ) {
			$this->set_dato_default();
		}
	}//end __construct



	/**
	* SET_DATO_DEFAULT
	* Set dato default when propiedades->dato_default exists and current component dato is empty
	* propiedades are loaded always (structure data) at begining of build component. Because this
	* is more fast verify if is set 'dato_default' and not load component data always as before
	* @return bool true
	*/
	private function set_dato_default() {

		# propiedades is object or null
		$propiedades = $this->get_propiedades();

		if(isset($propiedades->dato_default)) {

			# MATRIX DATA : Load matrix data
			$this->load_component_dato();

			$dato = $this->dato;
			if (empty($dato)) {

				$dato_default = $propiedades->dato_default;

				# Method Used
				if(isset($propiedades->dato_default->method)) {
					$dato_default = $this->get_method( (string)$propiedades->dato_default->method );
				}

				$this->set_dato($dato_default);

				if ( strpos($this->parent, DEDALO_SECTION_ID_TEMP)===false ) {
					$this->id 	= $this->Save();
				}

				# INFO LOG
				if(SHOW_DEBUG===true) {
					$msg = " Created ".get_called_class()." \"$this->label\" id:$this->parent, tipo:$this->tipo, section_tipo:$this->section_tipo, modo:$this->modo with default data from 'propiedades': ".json_encode($propiedades->dato_default);
					debug_log(__METHOD__.$msg);
				}

				# MATRIX DATA : Reload matrix data again
				$this->load_component_dato();
			}
		}

		return true;
	}//end set_dato_default



	# define tipo
	protected function define_tipo($tipo) {
		$this->tipo = $tipo;
		return true;
	}
	# define lang
	protected function define_lang($lang) {
		$this->lang = $lang;
		return true;
	}
	# define modo
	protected function define_modo($modo) {
		$this->modo = $modo;
		return true;
	}



	/**
	* SET_DATO
	* @return
	*/
	public function set_dato($dato) {

		parent::set_dato($dato);

		# Fix this component as data loaded to avoid overwite current dato setted, with database dato
		# Set as loaded
		$this->bl_loaded_matrix_data = true;
	}//end set_dato



	/**
	* GET_DATO
	*/
	protected function get_dato() {

		if(isset($this->dato_resolved)) {
			return $this->dato_resolved;
		}

		/*
		#
		# IS TEMP CASE
		# Sometimes we need use component as temporal element without save real data to database. Is this case
		# data is saved to session as temporal data
		if (isset($this->is_temp) && $this->is_temp===true) {
			$temp_data_uid = $this->tipo.'_'.$this->parent.'_'.$this->lang.'_'.$this->section_tipo;
			if (isset($_SESSION['dedalo4']['component_temp_data'][$temp_data_uid])) {
				$this->dato = $_SESSION['dedalo4']['component_temp_data'][$temp_data_uid];
			}else{
				$this->dato = null;
			}

		}else{

			# MATRIX DATA : Load matrix data
			$this->load_component_dato();
		}
		*/

		# MATRIX DATA : Load matrix data
		$this->load_component_dato();

		return $this->dato; # <- Se aplicará directamente el fallback de idioma para el modo list
	}//end get_dato



	/**
	* GET_DATO_FULL
	* @return
	*/
	public function get_dato_full() {

		$section = section::get_instance($this->parent, $this->section_tipo);

		$all_component_data = $section->get_all_component_data($this->tipo);

		$dato_full = isset($all_component_data->dato) ? $all_component_data->dato : null;

		return $dato_full;
	}//end get_dato_full



	# GET_DATO_UNCHANGED
	# Recover component var 'dato' without change type or other custom component changes
	# This is a easy way to access internal protected var 'dato' from out of component (like section::save_component_dato)
	public function get_dato_unchanged() {

		return $this->dato;
	}//end get_dato_unchanged


	/**
	* LOAD MATRIX DATA
	* Get data once from matrix about parent, dato
	*/
	protected function load_component_dato() {

		if( empty($this->parent) || $this->modo==='dummy' || $this->modo==='search') {

			# Experimental (devolvemos como que ya se ha intentado cargar, aunque sin id)
			#$this->bl_loaded_matrix_data = true;
			return null;
		}


		if( $this->bl_loaded_matrix_data!==true ) {
			# Experimental (si ya se ha intentado cargar pero con sin id, y ahora se hace con id, lo volvemos a intentar)
			#if( !$this->bl_loaded_matrix_data || ($this->bl_loaded_matrix_data && intval($this->id)<1) ) {

				if (empty($this->section_tipo)) {
					if(SHOW_DEBUG===true) {
						$msg = " Error Processing Request. section tipo not found for component $this->tipo";
						#throw new Exception("$msg", 1);
						debug_log(__METHOD__.$msg);
					}
				}
				$section = section::get_instance($this->parent, $this->section_tipo);

			# Fix dato
			# El lang_fallback, lo haremos directamente en la extracción del dato del componente en la sección y sólo para el modo list.
			$lang_fallback=false;
			if ($this->modo==='list') {
				$lang_fallback=true;
			}
			$this->dato = $section->get_component_dato($this->tipo, $this->lang, $lang_fallback);

			# Set as loaded
			$this->bl_loaded_matrix_data = true;
		}
	}//end load_component_dato



	/**
	* RESOLVE_SECTION_TIPO
	* @param string $tipo Component tipo
	* @return string $section_tipo
	*/
	public static function resolve_section_tipo($tipo) {

		if (defined('SECTION_TIPO')) {
			# 1 get from page globals
			$section_tipo = SECTION_TIPO;
		}else{
			# 2 calculate from structure -only useful for real sections-
			$section_tipo = component_common::get_section_tipo_from_component_tipo($tipo);
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." WARNING: calculate_section_tipo:$section_tipo from structure for component $tipo Called by:".debug_backtrace()[0]['function']);
				if ($section_tipo===DEDALO_SECTION_USERS_TIPO || $section_tipo===DEDALO_SECTION_PROJECTS_TIPO) {
					debug_log(__METHOD__." WARNING SECTION BÁSICA!! Called by:".debug_backtrace()[0]['function'], 1);
				}
			}
		}

		return $section_tipo;
	}//end resolve_section_tipo



	/**
	* FIX_LANGUAGE_NOLAN
	*/
	protected function fix_language_nolan() {

		$this->expected_lang = DEDALO_DATA_NOLAN;
		return null;

		# Fix lang always
		$this->lang = DEDALO_DATA_NOLAN;
		# Fix traducible
		$this->traducible = 'no';
	}//end fix_language_nolan



	/**
	* GET_COMPONENT_CACHE_KEY_NAME
	*/
	public function get_component_cache_key_name() {

		return DEDALO_DATABASE_CONN.'_component_get_html_'.$this->get_identificador_unico();
	}//end get_component_cache_key_name



	/**
	* GET HTML CODE . RETURN INCLUDE FILE __CLASS__.PHP
	* @return $html
	*	Get standar path file "DEDALO_LIB_BASE_PATH .'/'. $class_name .'/'. $class_name .'.php'" (ob_start)
	*	and return rendered html code
	*/
	public function get_html() {

		$component_name = get_called_class();

		if(SHOW_DEBUG===true) {
			$this->start_time= microtime(1);
			$start_time 	 = start_time();
			global$TIMER;$TIMER[__METHOD__.'_'.$component_name.'_IN_'.$this->tipo.'_'.microtime(1)]=microtime(1);
		}



			#
			# DEDALO_CACHE_MANAGER : Read from cache if var exists ##
			if(DEDALO_CACHE_MANAGER===true && CACHE_COMPONENTS===true) {
				# No guardamos los componentes de actividad en cache
				if (!in_array($this->tipo, logger_backend_activity::$ar_elements_activity_tipo)) {
					$cache_key_name = $this->get_component_cache_key_name();
					if (cache::exists($cache_key_name)) {
						#debug_log("INFO: readed data from component cache key: $cache_key_name");
						# Notify for load component js/css
						# Ojo! los portales auto-notifican a sus componentes, (notify_load_lib_element_tipo_of_portal) por lo que
						# haría falta una forma de ejecutar esto aun cuando se usan desde cache..
						//common::notify_load_lib_element_tipo($modelo_name, $modo);
						return cache::get($cache_key_name);
					}
				}
			}# /DEDALO_CACHE_MANAGER #################################


		#
		# HTML BUFFER
		ob_start();
		switch ($this->modo) {
			case 'edit':
				# Now all components call init in edit mode, therefore, is not necessary this snippet
				#include ( DEDALO_LIB_BASE_PATH .'/component_common/html/component_common_'. $this->modo .'.phtml' );
				break;
			case 'search':
				include ( DEDALO_LIB_BASE_PATH .'/component_common/html/component_common_'. $this->modo .'.phtml' );
				break;
			default:
				# code...
				break;
		}
		include ( DEDALO_LIB_BASE_PATH .'/'. $component_name .'/'. $component_name .'.php' );
		$html = ob_get_clean();


			#
			# DEDALO_CACHE_MANAGER : Set cache var #################
			if(DEDALO_CACHE_MANAGER===true && CACHE_COMPONENTS===true) {
				#if(strpos($cache_key_name, 'list')!=false)
				cache::set($cache_key_name, $html);
			}# /DEDALO_CACHE_MANAGER #################################



		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_'.$component_name.'_OUT_'.$this->tipo.'_'.microtime(1)]=microtime(1);
			$total=round(microtime(1)-$this->start_time,3)*1000;
			if ($total>0.080) {
				#dump($total, ' total ++ '.$this->tipo .' '. $component_name );
			}
			if($this->modo==='edit') {
				$html = str_lreplace('</div>', "<span class=\"debug_info debug_component_total_time\">$total ms $this->modo</span></div>", $html);
			}
		}

		return $html;
	}//end get_html



	/**
	* SAVE
	* Save component data in matrix using parent section
	* Verify all necessary vars to save and call section 'save_component_dato($this)'
	* @see section->save_component_dato($this)
	* @return int $section_matrix_id
	*/
	public function Save() {

		# MAIN VARS
		$section_tipo	= $this->get_section_tipo();
		$parent 		= $this->get_parent();
		$tipo 			= $this->get_tipo();
		$lang 			= $this->get_lang();
		$modo 			= $this->get_modo();
		if (empty($lang)) {
			$lang = DEDALO_DATA_LANG;
		}
		/* Innecesario ???
		# Si sabemos que el elemento no es traducible, fijamos su 'lang' en 'lg-nolan' (DEDALO_DATA_NOLAN)
		if ($this->traducible=='no') {
			$lang = DEDALO_DATA_NOLAN;
		}
		*/

		#
		# DATAFRAME MODE
		if (strpos($modo,'dataframe')===0 && isset($this->caller_dataset)) {

			#debug_log(__METHOD__." caller_dataset ".to_string($this->caller_dataset), logger::DEBUG);

			$new_tipo 			= $this->caller_dataset->component_tipo;
			$new_section_tipo 	= $this->caller_dataset->section_tipo;
			$new_parent 		= $this->caller_dataset->section_id;
			$new_modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($new_tipo, true);
			$new_component 		= component_common::get_instance( $new_modelo_name,
																  $new_tipo,
																  $new_parent,
																  'edit',
																  $lang,
																  $new_section_tipo);

			# Force load current db dato to avoid loose it
			$new_component->get_dato();

			# Set dataframe data
			$new_component->update_dataframe_element($this->dato, $this->caller_dataset->caller_key, $this->caller_dataset->type);

			if (isset($this->save_to_database) && $this->save_to_database===false) {
				debug_log(__METHOD__." Stopped ?? dataframe save to DDBB $this->section_tipo : $new_section_tipo , $this->parent : $new_parent ".to_string(), logger::WARNING);
				#$new_component->save_to_database = false;
			}

			return $new_component->Save();
		}//end if (strpos($modo,'dataframe')===0 && isset($this->caller_dataset))



		# PARENT : Verify parent
		if(abs($parent)<1 && strpos($parent, DEDALO_SECTION_ID_TEMP)===false) {
			if(SHOW_DEBUG===true) {
				dump($this, "this section_tipo:$section_tipo - parent:$parent - tipo:$tipo - lang:$lang");
				throw new Exception("Error Processing Request. Inconsistency detected: component trying to save without parent ($parent) ", 1);;
			}
			die("Error. Save component data is stopped. Inconsistency detected. Contact with your administrator ASAP");
		}

		# Verify component minimum vars before save
		if( empty($parent) || empty($tipo) || empty($lang) )
			throw new Exception("Save: More data are needed!  section_tipo:$section_tipo, parent:$parent, tipo,$tipo, lang,$lang", 1);


		# DATO
		$dato = $this->dato;


		#
		# IS TEMP CASE
		# Sometimes we need use component as temporal element without save real data to database. Is this case
		# data is saved to session as temporal data
		/*
		if (isset($this->is_temp) && $this->is_temp===true) {
			$temp_data_uid = $tipo.'_'.$parent.'_'.$lang.'_'.$section_tipo;
			$_SESSION['dedalo4']['component_temp_data'][$temp_data_uid] = $dato ;
			if(SHOW_DEBUG===true) {
				debug_log("INFO: IS_TEMP: saved dato from component $temp_data_uid");
			}
			return false;
		}
		*/


		# SECTION : Preparamos la sección que será la que se encargue de salvar el dato del componente
		$section 	= section::get_instance($parent, $section_tipo);
		$section_id = $section->save_component_dato($this, 'direct');

		if(SHOW_DEBUG===true) {
			#$section->get_dato();
			#debug_log(__METHOD__." Saved component common section: ".json_encode($section), logger::DEBUG);;
		}

		#
		# OPTIONAL STOP THE SAVE PROCESS TO DELAY DDBB ACCESS
		if (isset($this->save_to_database) && $this->save_to_database===false) {
			# Stop here (remember make a real section save later!)
			# No component time machine data will be saved when section saves later
			return $section_id;
		}


		# ID : Check valid id returned
		if (abs($section_id)<1 && strpos($section_id, DEDALO_SECTION_ID_TEMP)===false) {
			throw new Exception("Save: received id ($section_id) not valid!", 1);
		}


		# ACTIVITY
		$this->save_activity();


		# DEDALO_CACHE_MANAGER : Delete cache of current component html
		if(DEDALO_CACHE_MANAGER===true && CACHE_COMPONENTS===true) {
			# No borramos la chache de los componentes de activity ya que no son editables y por tanto no cambian nunca
			if (!in_array($this->tipo, logger_backend_activity::$ar_elements_activity_tipo)) {
				# Delete all caches of current tipo
				cache::del_contains($this->tipo);
			}
			#debug_log(__METHOD__." Saved dato of component $this->tipo ($this->label) ");
		}


		return (int)$section_id;
	}//end Save



	/**
	* SAVE_ACTIVITY
	* @return
	*/
	public function save_activity() {

		# ACTIVITY
		# Prevent infinite loop saving self
		if (!in_array($this->tipo, logger_backend_activity::$ar_elements_activity_tipo)) {
			try {
				# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
				$matrix_table 	= common::get_matrix_table_from_tipo($this->section_tipo);
				logger::$obj['activity']->log_message(
					'SAVE',
					logger::INFO,
					$this->tipo,
					null,
					array(	"msg"			=> "Saved component data",
							"tipo"			=> $this->tipo,
							"parent"		=> $this->parent,
							"lang"			=> $this->lang,
							"top_id"		=> (TOP_ID ? TOP_ID : $this->parent),
							"top_tipo"		=> (TOP_TIPO ? TOP_TIPO : $this->section_tipo),
							"component_name"=> get_called_class(),
							"table"			=> $matrix_table,
							"section_tipo"	=> $this->section_tipo
						 )
				);
			} catch (Exception $e) {
				if(SHOW_DEBUG===true) {
					$msg = 'Exception: ' . $e->getMessage();
					trigger_error($msg);
				}
			}//end try catch
		}//end if (!in_array($tipo, logger_backend_activity::$ar_elements_activity_tipo))
	}//end save_activity



	/**
	* GENERATE_JS
	* @see component_radio_button.php
	*/
	/*
	array('js' => array(
					array('trigger'	=> array(
											"1" => array('component_common.show(\'dd658\')'),
											"3" => array('component_common.hide(\'dd658\')')
											),
				),
	);
	 */
	public function generate_js() {

		// PROPIEDADES
		$propiedades = $this->get_propiedades();

		if(isset($propiedades->js)) {

			$propiedades_js = json_encode($propiedades->js);
			$wrapper_id 	= 'wrapper_'.$this->get_identificador_unico();

			$js_code  ='';
			$js_code .="\n<script>";
			$js_code .="component_common.parse_propiedades_js($propiedades_js,'$wrapper_id')";
			$js_code .="</script>\n";

			return $js_code;
		}//end if(isset($propiedades->js))

		return null;
	}//end generate_js



	/**
	* FILTRO
	* Consulta si el parent (la sección a que pertenece) está autorizada para el usuario actual
	* @return bool(true/false)
	* Devuelve false si NO es autorizado
	*/
	function get_filter_authorized_record() {
		# NOTA : Obviamos esta comprobación en la nueva estructura de sección (json). Evaluar si
		# realmente es necesaria cuando sea posible.
		return true;
	}//end get_filter_authorized_record



	# GET_EJEMPLO
	protected function get_ejemplo() {
		return $this->debugger;
		if(empty($this->ejemplo)) return "example: 'MO-15-5620-GANDIA'";
		return parent::get_ejemplo();
	}//end get_ejemplo



	/**
	* GET_REQUIRED
	*/
	private function get_required() {
		if($this->required==='si') {
			return false;
		}else{
			return true;
		}
	}//end get_required



	/**
	* GET_AR_TOOLS_OBJ
	*/
	public function get_ar_tools_obj() {
		if($this->ar_tools_obj===false) {
			$this->load_tools();
		}

		return $this->ar_tools_obj;
	}//end get_ar_tools_obj



	/**
	* LOAD SPECIFIC TOOL
	* Note: Used in class.inspector to load relation tool
	* @param string $tool_name
	* @return object | null $tool_object
	*/
	public function load_specific_tool($tool_name) {

		$tool_obj = null;

		if ($tool_name==='tool_relation') {
			if(SHOW_DEBUG===true) {
				#debug_log(__METHOD__." DESACTIVA LA CARGA DE TOOL RELATION ".__METHOD__);
			}
			return $tool_obj;
		}

		$authorized_tool = component_security_tools::is_authorized_tool_for_logged_user($tool_name);
		if ($authorized_tool===true) {
			require_once(DEDALO_LIB_BASE_PATH . '/tools/'.$tool_name.'/class.'.$tool_name.'.php');
			$tool_obj = new $tool_name($this);
		}

		return $tool_obj;
	}//end load_specific_tool



	/**
	* GET_AR_TOOLS_NAME
	* @return array $ar_tools_name
	*/
	protected function get_ar_tools_name() {
		# Default tools
		$ar_tools_name = $this->ar_tools_name;

		$propiedades = $this->get_propiedades();
		if (isset($propiedades->ar_tools_name)) {
			foreach ((array)$propiedades->ar_tools_name as $current_name => $obj_tool) {
				$ar_tools_name[] = $current_name;
			}
		}

		return (array)$ar_tools_name;
	}//end get_ar_tools_name



	/**
	* LOAD TOOLS
	*/
	public function load_tools( $check_lang_tools=true ) {

		if(strpos($this->modo, 'edit')===false ){
			if(SHOW_DEBUG===true) {
				#trigger_error("Innecesario cargar los tools aquí. Modo: $this->modo");
			}
			return null;
		}

		# Si no estamos logeados, no es necesario cargar los tools
		if(login::is_logged()!==true) return null;

		# Load all tools of current component
		$ar_tools_name = $this->get_ar_tools_name();

		# check_lang_tools default is true
		if ($check_lang_tools===true) {
			$traducible = $this->RecordObj_dd->get_traducible();
			if ($traducible==='no' || $this->lang===DEDALO_DATA_NOLAN) {
				$key = array_search('tool_lang',$ar_tools_name);
				if($key!==false){
					unset($ar_tools_name[$key]);
				}
			}
		}


		# Create obj tools array
		if( is_array($ar_tools_name)) foreach ($ar_tools_name as $tool_name) {

			if ( $tool_name==='tool_add_component_data' && !in_array(get_called_class(), component_relation_common::get_components_with_relations()) ) {
				continue; // Skip. Only suitable for component_relation_common (portals, autocomplete, etc...)
			}	

			$authorized_tool = component_security_tools::is_authorized_tool_for_logged_user($tool_name);

			if ($authorized_tool===true) {

				# INDEXATION TOOL CASE : When current tool have 'indexation' name, test thesaurus permissions for avoid inconsistencies
				if (strpos($tool_name, 'indexation')!==false) {
					$ts_permissions = (int)security::get_security_permissions(DEDALO_TESAURO_TIPO, DEDALO_TESAURO_TIPO);
					if ($ts_permissions<1) continue;	# Skip this tool
				}

				# Authorized tools names
				if (!in_array($tool_name, (array)$this->ar_authorized_tool_name)) {
					$this->ar_authorized_tool_name[] = $tool_name;
				}
			}
		}

		return $this->ar_authorized_tool_name;
	}//end load_tools



	/**
	* GET VALOR
	* LIST:
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	*/
	public function get_valor() {

		$valor = self::get_dato();

		if(SHOW_DEBUG===true) {
			if (!is_null($valor) && !is_string($valor) && !is_numeric($valor)) {
				$msg = "WARNING: CURRENT 'valor' in $this->tipo is NOT valid string. Type is:\"".gettype($valor).'" - valor:'.to_string($valor);
				trigger_error($msg);
				debug_log(__METHOD__." ".$msg, logger::WARNING);
				dump(debug_backtrace(), 'get_valor debug_backtrace() ++ '.to_string());
			}
		}

		if(!is_array($valor)) return $valor;

		return "<em>No string value</em>";
	}//end get_valor



	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null ) {

		if (empty($valor)) {
			$valor = $this->get_valor($lang);
		}

		if(SHOW_DEBUG===true) {
			#$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($this->tipo,true);
			#return "COMMON[$modelo_name]: ".to_string($valor);
		}

		return to_string($valor);
	}//end get_valor_export



	/**
	* DATO IN DEFAULT LANG
	*/
	protected function get_dato_default_lang() {

		if (empty($this->parent)) {
			trigger_error("Sorry. Few vars on get_dato_default_lang");
			return false;
		}

		if ($this->lang === DEDALO_DATA_LANG_DEFAULT) {

			$dato = $this->get_dato();

		}else{

			$parent 		= $this->get_parent();
			$tipo			= $this->get_tipo();
			$section_tipo 	= $this->get_section_tipo();

			$current_component_name	= get_class($this);
			$component_obj			= component_common::get_instance($current_component_name, $tipo, $parent, 'edit', DEDALO_DATA_LANG_DEFAULT, $section_tipo);
			$dato					= $component_obj->get_dato();
		}

		return $dato;
	}//end get_dato_default_lang



	/**
	* GET_DATO_NO_TRADUCIBLE
	* Despeja el único dato de este componente.
	* Si hay mas de 1 generará un error de consistencia
	* @see self::get_dato()
	*/
	protected function get_dato_no_traducible() {
		trigger_error("En proceso : get_dato_no_traducible");

		$parent 		= self::get_parent();
		$tipo			= self::get_tipo();
		$section_tipo	= self::get_section_tipo();

		if (empty($parent) || empty($tipo)) {
			throw new Exception("Few vars on get_dato_default_lang", 1);
		}

		# Búsqueda
		$arguments=array();
		$arguments['parent']= $parent;
		$arguments['tipo'] 	= $tipo;
		$matrix_table 		= common::get_matrix_table_from_tipo($section_tipo);
		$RecordObj_matrix	= new RecordObj_matrix($matrix_table,NULL);
		$ar_id				= $RecordObj_matrix->search($arguments);

		if(empty($ar_id)) {

			$dato 			= NULL;

		}else if(count($ar_id)>1) {

			if (SHOW_DEBUG===true) {
				dump($ar_id,'$ar_id');
			}
			throw new Exception("Error: Inconsistency: More than one record founded!", 1);

		}else{

			$current_id		= $ar_id[0];

			# Despejamos el dato
			$current_class_name	= get_class($this);
			$component_obj		= component_common::get_instance($current_class_name, $tipo, $parent, 'edit', $lang=DEDALO_DATA_NOLAN, $this->section_tipo);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
			$lang 				= $component_obj->get_lang();
			$dato				= $component_obj->get_dato();

			if ($lang !== DEDALO_DATA_NOLAN) {
				trigger_error("Error. Incorrect lang ($lang) for current component ($current_class_name - $tipo - $current_id). Expected  ".DEDALO_DATA_NOLAN);
			}
		}

		return $dato ;
	}//end get_dato_no_traducible



	/**
	* GET DATO AS STRING
	* Get dato formated as string
	*/
	public function get_dato_as_string() {

		$dato = $this->get_dato();
		#return var_export($dato,true);

		if(is_array($dato)) {
			$string = 'Array: ';
			foreach ($dato as $key => $value) {
				if(is_array($value)) $value = 'array '.implode(', ', $value );
				if (is_string($value)) {
					$string .= $key .':'. $value .', ';
				}
			}
			if(strlen($string)>2) $string = substr($string, 0,-2);
			return $string;
		}else if (is_object($dato)) {
			#$string = 'Object: ' . get_class($dato);
		}else if (is_int($dato)) {
			$string = 'Int: ' . $dato;
		}else if (is_string($dato)) {
			$string = 'Str: ' . $dato;
		}
		return $dato;
	}//end get_dato_as_string



	/**
	* GET_DEFAULT_COMPONENT
	* Devuelve el componente para el lenguaje por defecto del tipo y parent actual
	* Ejemplo: el dato de un componente (traducible) en el idioma actual está vacio (no se ha creado registro en matrix todavía). Cargamos el componente
	* en el idioma por defecto para poder acceder a las tools de lenguaje (necesitan un id_matrix para cargarse) y mostramos el icono del tool para hacer
	* un traducción automática o hacer notar que existe información en otro idioma (en el principal)
	*/
	protected function get_default_component() {

		if (empty($this->parent)) {
			trigger_error("Sorry. Few vars parent:$parent - tipo:$tipo");
			return false;
		}

		$parent 		= $this->get_parent();
		$tipo			= $this->get_tipo();
		$section_tipo 	= $this->get_section_tipo();

		# No existe registro en este idioma. Buscamos con el idioma de datos por defecto DEDALO_DATA_LANG_DEFAULT

			# SECTION : DIRECT SEARCH
			$arguments=array();
			$arguments["section_id"]= $parent;
			$arguments["datos#>>'{components,$tipo,dato,".DEDALO_DATA_LANG_DEFAULT."}':!="] = 'null';

			$matrix_table			= common::get_matrix_table_from_tipo($section_tipo);
			$JSON_RecordObj_matrix	= new JSON_RecordObj_matrix($matrix_table,NULL,$section_tipo);
			$ar_id					= $JSON_RecordObj_matrix->search($arguments);

			/* OLD WORLD
			$arguments=array();
			$arguments['parent']= $parent;
			$arguments['tipo'] 	= $tipo;
			$arguments['lang'] 	= DEDALO_DATA_LANG_DEFAULT ;

			$matrix_table 		= common::get_matrix_table_from_tipo($section_tipo);
			$RecordObj_matrix	= new RecordObj_matrix($matrix_table,NULL);
			$ar_id				= $RecordObj_matrix->search($arguments);
			*/

		# Existe registro matrix para este componente en su idioma principal
		if(!empty($ar_id[0])) {
			$current_id		= $ar_id[0];

			# Despejamos el dato
			$current_class_name	= get_class($this);
			$component_obj		= component_common::get_instance($current_class_name, $tipo, $current_id, 'edit', DEDALO_DATA_LANG_DEFAULT, $this->section_tipo);

			return $component_obj;

		# No existe registro en el idioma principal
		}else{

			return null;
		}
	}//end get_default_component



	/**
	* COMPONENT IS RELATIONABLE
	* @return bool(true/false)
	*/
	protected function is_relationable() {

		$component_name 			= get_class($this);
		$ar_components_reationables = array('component_text_area');

		if( in_array($component_name, $ar_components_reationables) )
			return true;

		return false;
	}//end is_relationable



	/**
	* GET MODIFICATION DATE
	*/
	public function get_mod_date() {

		$RecordObj_time_machine = $this->get_last_time_machine_obj();

		if(is_object($RecordObj_time_machine)) {
			return $RecordObj_time_machine->get_timestamp();
		}

		return null;
	}//end get_mod_date



	/**
	* GET MODIFICATED BY USER
	*/
	public function get_mod_by_user_name() {

		$RecordObj_time_machine = $this->get_last_time_machine_obj();

		if(is_object($RecordObj_time_machine)) {
			return $RecordObj_time_machine->get_userID();
		}

		return null;
	}//end get_mod_by_user_name



	/**
	* GET_LAST_TIME_MACHINE_OBJ
	* @return object $RecordObj_time_machine
	*/
	public function get_last_time_machine_obj() {

		if(empty($this->parent)) return null;

		if (isset($this->RecordObj_time_machine)) {
			return $this->RecordObj_time_machine;
		}

		$arguments=array();
		$arguments['section_id']	= $this->parent;
		$arguments['tipo']			= $this->tipo;
		$arguments['section_tipo']	= $this->section_tipo;
		$arguments['lang']			= $this->lang;
		$arguments['order_by_desc']	= 'timestamp';
		$arguments['sql_limit']		= 1;
		$RecordObj_time_machine		= new RecordObj_time_machine(null);
		$ar_id						= (array)$RecordObj_time_machine->search($arguments);

		if(count($ar_id)>0) {
			$last_tm_record_id 				= $ar_id[0];
			$this->RecordObj_time_machine	= new RecordObj_time_machine($last_tm_record_id);

			return $this->RecordObj_time_machine;
		}

		return null;
	}//end get_last_time_machine_obj



	/**
	* GET_VALOR_FROM_AR_LOCATORS
	* Return resolved string from all values of all locators. Used by component_portal
	* @param object $request_options
	* @return object $valor_from_ar_locators {result,info}
	*/
	public function get_valor_from_ar_locators( $request_options ) {

		$start_time = microtime(1);
		$valor_from_ar_locators	= new stdClass();

		$options = new stdClass();
			$options->lang 				= DEDALO_DATA_LANG;
			$options->data_to_be_used 	= 'valor';
			$options->separator_fields 	= ', ';
			$options->separator_rows 	= '<br>';
			$options->separator_fields 	= ', ';
			$options->ar_locators 		= false;
			foreach ($request_options as $key => $value) {
				if (property_exists($options, $key)) $options->$key = $value;
			}

		#
		# LOCATORS (If empty, return '') if we sent the ar_locator property to resolve it, the resolution will be directly wihtout check the structure of the component.
		# if the caller is a component that send your own dato is necesary calculate the component structure.
		if($options->ar_locators === false){
			$ar_locators = (array)$this->get_dato();
			if (empty($ar_locators)) {
				$valor_from_ar_locators->result = '';
				$valor_from_ar_locators->debug  = 'No locators found '.$this->get_tipo();
				return $valor_from_ar_locators;
			}

			#
			# TERMINOS_RELACIONADOS . Obtenemos los terminos relacionados del componente actual
			$ar_terminos_relacionados = (array)$this->RecordObj_dd->get_relaciones();

			#
			# FIELDS AND MATRIX_TABLE
			$fields=array();
			foreach ($ar_terminos_relacionados as $key => $ar_value) {

				$modelo 	 = key($ar_value);
				$tipo 		 = $ar_value[$modelo];
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
				if ($modelo_name==='section') {
					$section_tipo = $tipo;
					$matrix_table = common::get_matrix_table_from_tipo( $section_tipo );
				}else{
					$fields[] = $tipo;
				}
			}
		}else{
			$fields=array();
			$ar_locators = $options->ar_locators;
			foreach ($options->ar_locators as $current_locator) {
				$fields[] = $current_locator->component_tipo;
				$current_section_tipo = $current_locator->section_tipo;
			}
			$matrix_table = common::get_matrix_table_from_tipo( $current_section_tipo );

		}// end if(!isset($options->ar_locators))


		# Selector de terminos relacionados en DB
		# SELECT :
		$strQuery_select='';
		foreach ($fields as $current_tipo) {

			#$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
			#if (strpos($modelo_name,'component_')===false) {
			#	debug_log(__METHOD__." Skipped  $current_tipo - $modelo_name ".to_string(), logger::DEBUG);
			#	continue;
			#}

			# SELECCIÓN EN EL LENGUAJE ACTUAL
			$RecordObj_dd 	= new RecordObj_dd($current_tipo);
			$current_lang 	= $RecordObj_dd->get_traducible() ==='no' ? DEDALO_DATA_NOLAN : $options->lang;
			$strQuery_select .= "\n datos #>>'{components,$current_tipo,$options->data_to_be_used,$current_lang}' AS $current_tipo";
			if($current_tipo !== end($fields)) $strQuery_select .= ',';
		}

		#
		# WHERE : Filtro de locators en DB
		$strQuery_where='';
		foreach ($ar_locators as $current_locator) {
			if (empty($current_locator->section_id)) {
				#throw new Exception("Error Processing Request BAD LOCATOR", 1);

				debug_log(__METHOD__." IGNORED BAD LOCATOR:  ".to_string($current_locator), logger::ERROR);
				continue;
			}
			$current_section_id 	= $current_locator->section_id;
			$current_section_tipo 	= $current_locator->section_tipo;

			$strQuery_where .= "\n (section_id = $current_section_id AND section_tipo = '$current_section_tipo') OR";
		}
		if (!empty($strQuery_where)) {
			$strQuery_where = substr($strQuery_where, 0, -2);
		}
		$strQuery_where = '('.$strQuery_where.')';

		# QUERY
		$strQuery = "-- ".__METHOD__."\n SELECT $strQuery_select FROM $matrix_table WHERE $strQuery_where";

		$result	  = JSON_RecordObj_matrix::search_free($strQuery);
		$ar_final = array();
		while ($rows = pg_fetch_assoc($result)) {
			$string ='';
			foreach ($fields as $current_tipo) {
				$string .= (string)$rows[$current_tipo];
				if($current_tipo !== end($fields)) $string .= $options->separator_fields;
			}
			$ar_final[] = $string;
		}//end while

		$valor_from_ar_locators->result = implode($options->separator_rows, $ar_final);

		if(SHOW_DEBUG===true) {
			$html_info='';
			$limit_time=SLOW_QUERY_MS/100;
			$total_list_time = round(microtime(1)-$start_time,3);
			$style='';
			if ($total_list_time>$limit_time || $total_list_time>0.020) {
				$style = "color:red";
			}
			$html_info .= "<div class=\"debug_info get_valor_from_ar_locators\" style=\"{$style}\" onclick=\"$(this).children('pre').toggle()\"> Time: ";
			$html_info .= $total_list_time;
			$html_info .= "<pre style=\"display:none\"> ".$strQuery ."</pre>";
			$html_info .= "</div>";
			$valor_from_ar_locators->debug = $html_info;
			if ($total_list_time>$limit_time) {
				debug_log(__METHOD__.' '.$total_list_time."ms. SLOW QUERY: ".$strQuery);
			}
			#debug_log(__METHOD__.' '.$total_list_time."ms. QUERY: ".$strQuery);
		}//end if(SHOW_DEBUG===true)

		return (object)$valor_from_ar_locators;
	}//end get_valor_from_ar_locators



	/**
	* AR LIST OF VALUES
	* Used by comonent_check_box, comonent_radio_button, comonent_select and comonent_autocomplete
	*
	* @param string $lang default 'DEDALO_DATA_LANG'
	* @param string $id_path default false
	* @param string $referenced_section_tipo
	* @param string $filter_custom
	*
	* @return object ar_list_of_values {result,info}
	* Format:
	*	Object {
	*		"result": Array (
	*	    		[{"section_id":"9","section_tipo":"dd882"}] => Hombre
	*	    		[{"section_id":"10","section_tipo":"dd882"}] => Mujer
	*				),
	*		"strQuery":"SELECT ....",
	*		"others":"..."
	* 	} parent
	*/
	public function get_ar_list_of_values__DEPERECATED($lang=DEDALO_DATA_LANG, $id_path=false, $referenced_section_tipo=false, $filter_custom=false, $value_container='valor') {

		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$this->tipo.'_'.$this->modo.'_'.$this->parent.'_'.microtime(1)]=microtime(1);;
		}

		$use_cache = true; // Default false
		if ($this->modo==='list') {
			$use_cache = true; // Used in section list for speed
		}


		if(isset($this->ar_list_of_values)) {
			if(SHOW_DEBUG===true) {
				#debug_log(__METHOD__." get_ar_list_of_values already is calculated..");
			}
			return $this->ar_list_of_values;
		}

		static $list_of_values_cache;

		$uid = $this->tipo.'_'.$this->modo.'_'.$lang.'_'.$referenced_section_tipo.'_'.rawurlencode($filter_custom);	//.'_'.$this->parent
		if($use_cache===true && isset($list_of_values_cache[$uid])) {
			if(SHOW_DEBUG===true) {
				//debug_log(__METHOD__." +++ Returned get_ar_list_of_values already is calculated in list_of_values_cache.. ($uid)");
			}
			return $this->ar_list_of_values = $list_of_values_cache[$uid];
		}

		$start_time = microtime(1);

		# vars
		$list_of_values		= new stdClass();
		$ar_final 			= array();
		$tipo 				= $this->tipo;
		$filter_propiedades ='';


		# AR_VALUES_FROM_COMPONENT_DATO
		if (isset($this->propiedades->filtered_by_search)) {

			$search_query_object = json_decode( json_encode($this->propiedades->filtered_by_search) );
			$search_development2 = new search_development2($search_query_object);
			$records_data 		 = $search_development2->search();
				#dump($records_data, ' records_data ++ '.to_string());
			$ar_current_dato = $records_data->ar_records;
			/*
			$ar_current_dato = [];
			foreach ($this->propiedades->filtered_by_search as $key => $filter_element) {

				$current_modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($filter_element->component_tipo,true);
				$current_component 		= component_common::get_instance($current_modelo_name,
																		 $filter_element->component_tipo,
																		 $filter_element->section_id,
																		 'list',
																		 DEDALO_DATA_LANG,
																		 $filter_element->section_tipo);
				$current_dato = $current_component->get_dato();
					#dump($urrent_dato, ' urrent_dato ++ '.to_string());
				$ar_current_dato = array_merge($ar_current_dato, $current_dato);
			}
			*/
			/*
			# $modelo_name, $tipo, $strict=true
			$ar_componets_related = common::get_ar_related_by_model('component_', $this->tipo, false);

			$result = [];
			foreach ($ar_current_dato as $key => $current_locator) {
				$key_result = new stdClass();
					$key_result->section_id   = $current_locator->section_id;
					$key_result->section_tipo = $current_locator->section_tipo;

				$result[json_encode($key_result)] = component_relation_common::get_locator_value( $current_locator, DEDALO_DATA_LANG, $show_parents=false, $ar_componets_related, $divisor=', ' );
			}
			# Sort result for easy user select
			asort($result, SORT_NATURAL | SORT_FLAG_CASE);
			#dump($result, ' result 11 ++ '.to_string());

			$list_of_values	= new stdClass();
				$list_of_values->result   = (array)$result;
				$list_of_values->msg 	  = 'Ok. Values from "ar_values_from_component_dato" executed';
				$list_of_values->strQuery = null;

			return $list_of_values;
			*/
			$ar_filter_propiedades = [];
			foreach ($ar_current_dato as $key => $value) {
				$ar_filter_propiedades[] = 'section_id=' . (int)$value->section_id;
			}
			if (empty($ar_filter_propiedades)) {
				$filter_propiedades = 'AND (section_id=0) '; // Impossible value
			}else{
				$filter_propiedades = 'AND ('.implode(' OR ', $ar_filter_propiedades).') ';
			}
		}


		#if ($this->modo =='list' && isset($_SESSION['config4']['get_ar_list_of_values'][$uid]) ) {
		#	return $_SESSION['config4']['get_ar_list_of_values'][$uid];
		#}


		#
		# AR_TERMINOS_RELACIONADOS
		$ar_terminos_relacionados = (array)$this->RecordObj_dd->get_relaciones();
			if (empty($ar_terminos_relacionados)) {
				#throw new Exception("Error Processing Request. List of values without TR. Please review structure ($tipo)", 1);
				$msg = "WARNING: Skipped list of values without TR. Please review structure config of element $tipo ".RecordObj_dd::get_termino_by_tipo($tipo);
				if(SHOW_DEBUG===true) {
					$msg .= "<br>Nota: esta función (get_ar_list_of_values) NO está acabada. Falta contemplar los casos en que el dato se accede directamente (Ver versión anterior abajo)";
				}
				trigger_error($msg);
				$list_of_values->result   = (array)$ar_final;
				$list_of_values->msg 	  = (string)$msg;
				$list_of_values->strQuery = null;

				return $list_of_values;
			}

			$fields 				= array();
			$section_tipo_related 	= $referenced_section_tipo;
			$matrix_table 			= false;
			foreach ($ar_terminos_relacionados as $key => $ar_value) {
				$modelo 	 = key($ar_value);
				$tipo 		 = $ar_value[$modelo];
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
				if ($modelo_name==='section' && $section_tipo_related===false) {
				#if ($modelo===MODELO_SECTION && $section_tipo_related===false) {
					$section_tipo_related 	= $tipo;	// Fix section tipo related
					$matrix_table 			= common::get_matrix_table_from_tipo($section_tipo_related); // Fix matrix table
				}else{
					$fields[] = $tipo;
				}
			}
			$terminoID_valor = reset($fields); // Select first field tipo
			#if (!$section_tipo_related) {
			#	$section_tipo_related = $this->get_section_tipo_from_component_tipo($terminoID_valor); // // Fix section tipo related
			#}
			if ($matrix_table===false) {
				$matrix_table = common::get_matrix_table_from_tipo($terminoID_valor); // Fix matrix table
			}
			$ar_terminos_relacionados = $fields;



		#
		# STRQUERY_SELECT SELECTOR
		$strQuery_select='';
			$strQuery_where='';
			#datos #>'{components}' ?
			$last_element = end($ar_terminos_relacionados);
			foreach ($ar_terminos_relacionados as $current_tipo) {

				/*
				# SELECCIÓN CON UN LENGUANJE
				$RecordObj_dd 	= new RecordObj_dd($current_tipo);
				$current_lang 	= ($RecordObj_dd->get_traducible() =='no' ? DEDALO_DATA_NOLAN : $lang);
				$strQuery_select .= JSON_RecordObj_matrix::build_pg_select('btree','datos',$current_tipo,'dato',$current_lang);
				*/
				# SELECCIÓN CON TODOS LOS LENGUAJES
				$strQuery_select .= "datos #>>'{components,$current_tipo,$value_container}' AS $current_tipo " ;
				# SELECCIÓN EN EL LENGUAJE ACTUAL (SÓLO PARA ORDENAR)
				$RecordObj_dd 	= new RecordObj_dd($current_tipo);
				$current_lang 	= $RecordObj_dd->get_traducible()==='no' ? DEDALO_DATA_NOLAN : $lang;
				$strQuery_select .= ", datos #>>'{components,$current_tipo,$value_container,$current_lang}' AS {$current_tipo}_lang " ;

				# WHERE CLAUSE
				#$strQuery_where = "datos #>'{components}' ? '$current_tipo'";
				$strQuery_where = "section_tipo = '$section_tipo_related'";
				if ( $current_tipo !== $last_element ) {
					$strQuery_where  .=" AND ";
					$strQuery_select .=", \n\t\t\t\t\t";
				}
			}


		#
		# PROPIEDADES : Filtrado por propiedades (opcional)

			#
			# FILTERED_BY_FIELD_VALUE
			if (isset($this->propiedades->filtered_by_field_value)) {
				#trigger_error("Sorry: Working here");
				/*
				ejemplo:
					{
						"filtered_by_field_value": {
							"dd508": "ich32"
						}
					}
				*/
				# 1 Obtenemos el valor actual del value_component_tipo
				$value_component_tipo  	= reset($this->propiedades->filtered_by_field_value);
				$value_section_tipo 	= $value_component_tipo;	// SOLUCIONAR EL TENER EL DATO DE SECCIÓN EN PROPIEDADES !!!
				$matrix_table_tipo 		= common::get_matrix_table_from_tipo($value_section_tipo);
				if (!$id_path) {
				$id_path 				= (string)tools::get_id_path(null);
				}
				$ar_id 					= (array)explode(',', $id_path);

				$id_query 			 	= '';
				$strQuery_select_tipo 	= '';
				$RecordObj_dd_tipo 		= new RecordObj_dd($value_component_tipo);
				$current_lang_tipo 		= ($RecordObj_dd_tipo->get_traducible()==='no' ? DEDALO_DATA_NOLAN : $lang);
				$strQuery_select_tipo  .= JSON_RecordObj_matrix::build_pg_select('btree','datos',$value_component_tipo,'dato',$current_lang_tipo);

				foreach ($ar_id as $key => $currrent_id) {
					$ar_locator = (array)explode('.',$currrent_id);
					$current_section_tipo 	= $ar_locator[0];
					$current_section_id 	= $ar_locator[1];

					$id_query .= "( section_tipo='$current_section_tipo' AND ";
					$id_query .= "section_id=$current_section_id )";
					if ( $currrent_id !== end($ar_id) ) $id_query .=" OR ";
				}
				$query= "
						SELECT $strQuery_select_tipo
						FROM $matrix_table_tipo
						WHERE
						$id_query AND (
						datos #>'{components}' ? '$value_component_tipo');";
						#AND datos #>>'{section_tipo}' = '$value_component_section_tipo'
				$result			 = JSON_RecordObj_matrix::search_free($query);
				$rows 			 = (array)pg_fetch_assoc($result);
				$filter_locator  = reset($rows);

				#$component  = component_common::get_instance(null, $value_component_tipo, $parent_id, 'edit', DEDALO_DATA_LANG, $value_component_section_tipo);
				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__." Verificar section tipo en la llamada del componente..");
				}
				#$p_value 	= $component->get_dato_unchanged();


				$p_key 			= key($this->propiedades->filtered_by_field_value);
				$RecordObj_dd 	= new RecordObj_dd($p_key);
				$current_lang 	= ($RecordObj_dd->get_traducible()==='no' ? DEDALO_DATA_NOLAN : $lang);
				$filter_propiedades .= "AND ".JSON_RecordObj_matrix::build_pg_filter('gin','datos',$p_key,$current_lang,$filter_locator);
			}//end if (isset($this->propiedades->filtered_by_field_value)) {


			#
			# FILTERED_BY
			if (isset($this->propiedades->filtered_by)) {
				/*
				ejemplo:
					{"filtered_by": {
							"rsc90": [{
								"section_id":"34","section_tipo":"dd914"
							}]
						}
					}
				*/
				$end_value = end($this->propiedades->filtered_by);
				foreach($this->propiedades->filtered_by as $p_key => $p_value) {

					$current_component_tipo = $p_key;
					$current_value  		= $p_value;
					$current_value_flat 	= json_encode($current_value);

					$RecordObj_dd 	= new RecordObj_dd($current_component_tipo);
					$current_lang 	= $RecordObj_dd->get_traducible()==='no' ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;
					$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);

					$ar_components_with_references 	= component_relation_common::get_components_with_relations();

					if(in_array( $modelo_name,$ar_components_with_references )){

						$ar_filter = [];
						foreach ($current_value as $value) {
							$value->from_component_tipo = $current_component_tipo;
							$current_value_flat = json_encode($value);
							//AND datos#>'{relations}' @> '[{"section_id":"6","section_tipo":"mupreva164","from_component_tipo":"mupreva235"}]'::jsonb;
							$ar_filter[] = "datos#>'{relations}' @> '[$current_value_flat]'::jsonb";
						}
						$filter_propiedades .= ' AND ('.implode(' OR ', $ar_filter).' )';
					}else{
						$filter_propiedades .= "AND datos#>'{components,$current_component_tipo,dato,$current_lang}' @> '$current_value_flat'::jsonb ";
					}


					if ($p_value!==$end_value) $filter_propiedades .=" \n";
				}
				#debug_log(__METHOD__." filter_propiedades ".to_string($filter_propiedades), logger::DEBUG);
			}


			#
			# filtered by REFERENCED_SECTION_TIPO (optional)
			if ($referenced_section_tipo!==false) {
				foreach ((array)$referenced_section_tipo as $current_section_tipo) {
					$filter_propiedades .= "\n-- referenced_section_tipo \n AND section_tipo = '$current_section_tipo' ";
				}
			}


		#
		# MAIN QUERY
		$strQuery="
				-- ".__METHOD__."
				SELECT section_id, section_tipo, $strQuery_select
				FROM \"$matrix_table\" WHERE
				$strQuery_where  $filter_propiedades $filter_custom
				";

		$strQuery = sanitize_query($strQuery);
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);

		$ar_final = array();
		while ($rows = pg_fetch_assoc($result)) {

			$locator  = new locator();
				$locator->set_section_id( $rows['section_id'] );
				$locator->set_section_tipo( $rows['section_tipo'] );

			$valor = (string)'';
			/*
			foreach ($ar_terminos_relacionados as $current_tipo) {
				$valor .= $rows[$current_tipo];
				if ( count($ar_terminos_relacionados)>1 && $current_tipo != end($ar_terminos_relacionados) ) $valor .=" ";
			}
			*/

			foreach ($ar_terminos_relacionados as $current_tipo) {

				# ROW format is string json with all langs data like '{"lg-cat": "No", "lg-eng": "No", "lg-eus": null, "lg-fra": null, "lg-spa": "No"}'
				$val = json_decode($rows[$current_tipo]);

				#$RecordObj_dd 	= new RecordObj_dd($current_tipo);
				#$current_lang 	= ($RecordObj_dd->get_traducible() =='no' ? DEDALO_DATA_NOLAN : $lang);

				$lang_nolang 	= DEDALO_DATA_NOLAN;
				$lang_current 	= $lang;
				# lang never must be DEDALO_DATA_NOLAN
				if ($lang_current===DEDALO_DATA_NOLAN) {
					$lang_current = DEDALO_DATA_LANG;
				}
				$lang_default 	= DEDALO_DATA_LANG_DEFAULT;	//'lg-spa';

				# LANG FALLBACK
				switch (true) {
					# COMPONENT HAS CHANGED TRANSLATABLE / NON TRANSLATABLE AND TWO DATA IS STORED
					case (isset($val->$lang_nolang) && isset($val->$lang_current) && $val->$lang_nolang!==$val->$lang_current):
						debug_log(__METHOD__." component current_tipo:$current_tipo parent:$this->parent referenced_section_tipo:$referenced_section_tipo have double data ($lang_current / $lang_nolang). $lang_current was used, but please review this ASAP to avoid inconsistencies", logger::WARNING);
						# Don't break here

					# SET NOLAN (current component is not translatable)
					case (isset($val->$lang_nolang) && !isset($val->$lang_current)):

						# Only string and numbers are supported now
						/*
						if (is_array($val->$lang_nolang) || is_object($val->$lang_nolang)) {
							$val->$lang_nolang = '';
						}
						*/
						$valor .= to_string($val->$lang_nolang);
						break;
					# SET LANG CURRENT REQUEST (current component is translatable)
					case (isset($val->$lang_current)):
						#if (is_string($val->$lang_current)) {
							$valor .= to_string($val->$lang_current);
						#}
						break;
					# SET DEFAULT LANG FOR LIST OF VALUES
					case (isset($val->$lang_default)):
						$valor .= component_common::decore_untranslated( to_string($val->$lang_default) );
						break;
					# SET ANY VALUE FOUNDED (first value found)
					default:
						foreach ((array)$val as $key => $c_value) {
							if(!empty($c_value)) {
								$valor .= component_common::decore_untranslated( to_string($c_value) ); break;	// first value found in array of langs
							}
						}//end foreach ($val as $key => $c_value)
						break;
				}//end switch (true) {

				$valor .= ' '; # Add space between component values
			}

			$ar_final[ json_encode($locator) ] = trim($valor);
		}

		asort($ar_final, SORT_NATURAL | SORT_FLAG_CASE);
		# Set object
		$list_of_values->result   = (array)$ar_final;
		$list_of_values->strQuery = (string)$strQuery;
		$list_of_values->msg      = (string)'ok';

		if(SHOW_DEBUG===true) {
			$limit_time=SLOW_QUERY_MS/100;
			$html_info='';

			$total_list_time = round(microtime(1)-$start_time,3);
			$style='';
			if ($total_list_time>$limit_time || $total_list_time>0.020) {
				$style = "color:red";
			}
			#$html_info .= "<div class=\"debug_info ar_list_of_values_debug_info\" style=\"{$style}\" onclick=\"$(this).children('pre').toggle()\">";
			$html_info .= ' Time: ';
			$html_info .= $total_list_time;
			#$html_info .= "<pre style=\"display:none\"> ".$strQuery ."</pre>";
			#$html_info .= "</div>";
			#echo "<div> Time To Generate section list: HTML: ".round(microtime(1)-$start_time,3)."</div>";

			$list_of_values->debug = $html_info;
			#if ($this->modo!='edit') {
			#	echo $html_info;
			#}
			if ($total_list_time>$limit_time) {
				debug_log(__METHOD__.' '.$total_list_time."ms. SLOW QUERY: ".$strQuery);
			}
			#debug_log(__METHOD__." QUERY: $strQuery total_list_time:$total_list_time - uid:$uid");
		}//end if(SHOW_DEBUG===true)

		#if ($this->modo ==='list') {
		#	$_SESSION['config4']['get_ar_list_of_values'][$uid] = $list_of_values;
		#}

		# CACHE
		if ($use_cache===true) {
			$list_of_values_cache[$uid] = $list_of_values;
		}

		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$this->tipo.'_'.$this->modo.'_'.$this->parent.'_count_'.count($ar_final).'_'.microtime(1)]=microtime(1);
		}

		# Fix var
		return $this->ar_list_of_values = $list_of_values;
	}//end get_ar_list_of_values



	/**
	* PARSE_SEARCH_DYNAMIC
	* Check existence of $source in properties and resolve filter if yes
	* @return object $filter
	*/
	public function parse_search_dynamic($ar_filtered_by_search_dynamic) {

		// resolve_section_id
			$resolve_section_id = function ($source_section_id){
				switch ($source_section_id) {
					case 'current':
						$result = $this->get_parent();
						break;
					default:
						$result = $source_section_id;
				}
				return $result;
			};
		// resolve_section_tipo
			$resolve_section_tipo = function ($source_section_tipo){
				switch ($source_section_tipo) {
					case 'current':
						$result = $this->get_section_tipo();
						break;
					default:
						$result = $source_section_tipo;
				}
				return $result;
			};


		$ar_filter_items = [];
		foreach ($ar_filtered_by_search_dynamic->filter_elements as $current_element) {

			// source
				$q 					= $current_element->q;
				$source 			= $q->source;
				$component_tipo 	= $source->component_tipo;
				$section_id 		= $resolve_section_id($source->section_id);
				$section_tipo 		= $resolve_section_tipo($source->section_tipo);

				$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				$component 			= component_common::get_instance($modelo_name,
																	 $component_tipo,
																	 $section_id,
																	 'list',
																	 DEDALO_DATA_LANG,
																	 $section_tipo);
				$dato = $component->get_dato();

				if(!empty($dato)){

					// resolve base_value object
						$base_value = reset($dato);
					// replaces locator from_component_tipo with path info
						$base_value->from_component_tipo = reset($current_element->path)->component_tipo;

				}else{
						$base_value = [];
				}

					// filter item
						$item = new stdClass();
							$item->q 	= $base_value;
							$item->path = $current_element->path;

			$ar_filter_items[] = $item;
		}

		// operator global
			$operator = $ar_filtered_by_search_dynamic->operator;

		// filter object
			$filter = new stdClass();
				$filter->{$operator} = $ar_filter_items;

		// debug
			if(SHOW_DEBUG===true) {
				#dump(nul, ' filter ++ '.json_encode($filter, JSON_PRETTY_PRINT));
			}


		return $filter;
	}//end parse_search_dynamic



	/**
	* GET_AR_LIST_OF_VALUES2
	* @return array $ar_list_of_values
	*/
	public function get_ar_list_of_values2($lang=DEDALO_DATA_LANG) {

		$start_time = microtime(1);

		switch (true) {
			case isset($this->propiedades->filtered_by_search_dynamic) || isset($this->propiedades->filtered_by_search):

				$filter = [];
				if(isset($this->propiedades->filtered_by_search_dynamic)){
					$filter = $this->parse_search_dynamic($this->propiedades->filtered_by_search_dynamic);
				}else{
					$filter = json_decode( json_encode($this->propiedades->filtered_by_search));
				}

  				$target_section_tipo = $this->get_ar_target_section_tipo();
  				$target_section_tipo = reset($target_section_tipo);

				# new search_query_object
				$search_query_object = new stdClass();
					$search_query_object->section_tipo 			= $target_section_tipo;
					$search_query_object->limit 				= 0;
					$search_query_object->skip_projects_filter 	= true;
					$search_query_object->filter 				= $filter;

				$hash_id = '_'.md5(json_encode($filter));
				break;

			default:
				# get_ar_related_by_model: $modelo_name, $tipo, $strict=true
  				# $target_section_tipo = common::get_ar_related_by_model('section', $this->tipo, true);
  				$target_section_tipo = $this->get_ar_target_section_tipo();
  				$target_section_tipo = reset($target_section_tipo);

				# new search_query_object
				$search_query_object = new stdClass();
					$search_query_object->section_tipo 			= $target_section_tipo;
					$search_query_object->limit 				= 0;
					$search_query_object->skip_projects_filter 	= true;

				$hash_id ='';
				break;
		}

		// check target_section_tipo
			$target_section_model = RecordObj_dd::get_modelo_name_by_tipo($target_section_tipo,true);
			if ($target_section_model!=='section') {
				$response = new stdClass();
					$response->result   			= [];
					$response->msg 	  				= 'Error. section tipo: '.$target_section_tipo.' is not a valid section ('.$target_section_model.')';
					debug_log(__METHOD__."  ".$response->msg.to_string(), logger::ERROR);
				return $response;
			}

		// cache
			static $ar_list_of_values_data = [];
			$uid = isset($search_query_object->section_tipo) ? $search_query_object->section_tipo.'_'.$lang. $hash_id : $this->tipo.'_'.$lang. $hash_id;
			if (isset($ar_list_of_values_data[$uid])) {
				#debug_log(__METHOD__." Return cached item for ar_list_of_values: ".to_string($uid), logger::DEBUG);
				return $ar_list_of_values_data[$uid];
			}

		// ar_componets_related. get_ar_related_by_model: $modelo_name, $tipo, $strict=true
			$ar_componets_related = common::get_ar_related_by_model('component_', $this->tipo, false);

		// Build query select
			$query_select = [];
			foreach ($ar_componets_related as $related_tipo) {

			    // path . search_development2::get_query_path($tipo, $section_tipo, $resolve_related=true)
				$path = search_development2::get_query_path($related_tipo, $target_section_tipo, $resolve_related=true);

				// add selector lag 'all' to last element of path
				$end_path = end($path);
				$end_path->lang = 'all';

				$item = new stdClass();
					$item->path = $path;

				$query_select[] = $item;
			}
			$search_query_object->select = $query_select;
			$search_query_object->allow_sub_select_by_id = false;


		// Search
			$search_development2 = new search_development2($search_query_object);
			$records_data 		 = $search_development2->search();
			$ar_current_dato 	 = $records_data->ar_records;
				#dump( json_encode($search_query_object, JSON_PRETTY_PRINT), ' search_query_object ++ '.to_string());
				#dump($ar_current_dato, ' ar_current_dato ++ '.json_encode($search_query_object, JSON_PRETTY_PRINT));


		$result = [];
		foreach ($ar_current_dato as $key => $current_row) {

			# value. is a basic locator section_id, section_tipo
			$value = new stdClass();
				$value->section_id   = $current_row->section_id;
				$value->section_tipo = $current_row->section_tipo;

			# get_locator_value: $locator, $lang, $show_parents=false, $ar_componets_related, $divisor=', '
			#$label = component_relation_common::get_locator_value($value, $lang, false, $ar_componets_related, ', ');

			// Build label
				$label 	  = '';
				$ar_label = [];
				foreach ($ar_componets_related as $related_tipo) {

					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($related_tipo,true);

					if ($modelo_name==='component_autocomplete_hi') {
						# resolve
						$current_label = component_relation_common::get_locator_value($value, $lang, false, $ar_componets_related, ', ');

					}else if (in_array($modelo_name , component_relation_common::get_components_with_relations())){
						# resolve
						$current_label = component_relation_common::get_locator_value($value, $lang, false, [$related_tipo], ', ');

					}elseif ($modelo_name==='component_section_id') {
						$current_label = $current_row->{$related_tipo};
					}else{
						# use query select value
						$dato_full_json = $current_row->{$related_tipo};
						// $dato_full_json, $decore_untranslated=false, $main_lang=DEDALO_DATA_LANG_DEFAULT, $lang=DEDALO_DATA_LANG
						$current_label = self::get_value_with_fallback_from_dato_full($dato_full_json, false, DEDALO_DATA_LANG_DEFAULT, $lang);
					}
					if (!empty($current_label)) {
						$ar_label[] = $current_label;
					}
				}
				$label = implode(' | ', $ar_label);

			$item = new stdClass();
				$item->value 	  = $value;
				$item->label 	  = $label;
				$item->section_id = $current_row->section_id;

			$result[] = $item;
		}
		# Sort result for easy user select
			if(isset($this->propiedades->sort_by)){
				$custom_sort = reset($this->propiedades->sort_by); // Only one at this time
				if ($custom_sort->direction==='DESC') {
					usort($result, function($a,$b) use($custom_sort){
						return strnatcmp($b->{$custom_sort->path}, $a->{$custom_sort->path});
					});
				}else{
					usort($result, function($a,$b) use($custom_sort){
						return strnatcmp($a->{$custom_sort->path}, $b->{$custom_sort->path});
					});
				}
			}else{
				// Deafult. Alphabetic ascendent
				usort($result, function($a,$b){
					return strnatcmp($a->label, $b->label);
				});
			}


		$response = new stdClass();
			$response->result   			= (array)$result;
			$response->msg 	  				= 'Ok';
			if(SHOW_DEBUG===true) {
				$response->search_query_object 	= json_encode($search_query_object, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
				$response->debug 				= 'Total time:' . exec_time_unit($start_time,'ms').' ms';
			}

		// cache
			$ar_list_of_values_data[$uid] = $response;

		return $response;
	}//end get_ar_list_of_values2



	/**
	* GET CURRENT RECORD WITH LANG FALLBACK UNIFIED
	* A partir de tipo y parent del objeto recibido despeja cuales de los registros disponibles están en el idioma actual
	* (si son traducibles) y si no lo están busca el equivalente en el idioma de datos por defecto
	* @param $component_obj
	* @return $ar_final
	*	Array tipo => dato (like Array([dd156] => Documentos solamente))
	*/
	public static function get_current_record_with_lang_fallback_unified($component_obj) {

		# vars (need 'traducible', 'parent', 'tipo')
		$traducible 		= $component_obj->get_traducible();
		$parentID 			= $component_obj->get_parent();
		if(empty($parentID)) {
			dump($component_obj,'$component_obj');
			throw new Exception("parentID is empty", 1);
		}
		$tipo 				= $component_obj->get_tipo();
		$section_tipo 		= $component_obj->get_section_tipo();
		$matrix_table 		= common::get_matrix_table_from_tipo($section_tipo);
		$ar_final 			= array();

		# Despejamos todos sus hijos
		$arguments=array();
		$arguments['parent']	= $parentID;
		$arguments['tipo']		= $tipo;
		$RecordObj_matrix		= new RecordObj_matrix($matrix_table,NULL);
		$ar_records				= $RecordObj_matrix->search($arguments);


		# EMPTY RECORDS CASE
		if (empty($ar_records)) {
			if(SHOW_DEBUG===true) {
				dump($component_obj,'$component_obj received obj');
			}
			# Resultado vacío.
			trigger_error("No records found in matrix with arguments: ".print_r($arguments,true));

		# NORMAL CASE
		}else{

			foreach ($ar_records as $id) {

				# NO TRADUCIBLE
				if ($traducible==='no') {

					# Si hay mas de 1 registro lanzamos un error pues habrá una inconsistencia aquí
					if (count($ar_records)>1) {
						if(SHOW_DEBUG===true) {
							dump($ar_records,'$ar_records');
						}
						throw new Exception("Inconsistency found. Too much records", 1);
					}

					$RecordObj_matrix		= new RecordObj_matrix($matrix_table,$id);
					$lang 					= $RecordObj_matrix->get_lang();
					if ($lang===DEDALO_DATA_NOLAN) {
						$dato 				= $RecordObj_matrix->get_dato();
						$ar_final[$tipo]	= $dato;
					}
				# TRADUCIBLE FALLBACKS
				}else{

					$RecordObj_matrix		= new RecordObj_matrix($matrix_table,$id);
					$lang 					= $RecordObj_matrix->get_lang();

					# 1 DEDALO_DATA_LANG
					if ($lang===DEDALO_DATA_LANG) {
						$dato 				= $RecordObj_matrix->get_dato();
						$ar_final[$tipo]	= $dato;
					}
					# 2 DEDALO_DATA_LANG_DEFAULT
					else if ($lang===DEDALO_DATA_LANG_DEFAULT){
						$dato 				= $RecordObj_matrix->get_dato();
						$ar_final[$tipo]	= component_common::decore_untranslated($dato);
					}

				}#if ($traducible==='no')

			}//end foreach

		}//end if (empty($ar_records))

		return $ar_final;
	}//end get_current_record_with_lang_fallback_unified



	/**
	* GET_IMPLODED_AR_LIST_OF_VALUES
	* Despejamos la lista con los valores agrupados por "parents"
	* @return array $ar_list_of_values_formated
	*/
	private static function get_imploded_ar_list_of_values($ar_list_of_values) {

		$ar_list_of_values_formated = array();

		foreach($ar_list_of_values->result as $key => $value) {

			$string = '';
			if(is_array($value)) foreach($value as $key2) {
				if (is_array($key2)) foreach($key2 as $key3) {
					if (is_array($key3)) foreach ($key3 as $key4) {
						$string .= "$key4, ";
					}else{
						$string .= "$key3, ";
					}
				}else{
					$string .= "$key2, ";
				}
			}else{
				$string .= "$value, ";
			}
			#echo "\t - $key: $string <br>\n";
			$ar_list_of_values_formated[$key] = substr($string,0,-2);
		}

		return $ar_list_of_values_formated;
	}//end get_imploded_ar_list_of_values



	/**
	* DECORE UNTRANSLATED
	*/
	public static function decore_untranslated($string) {

		return '<mark>'.to_string($string).'</mark>';
	}//end decore_untranslated



	/**
	* GET LANG NAME
	*/
	protected function get_lang_name() {

		$lang_name 	= '';

		$lang = $this->get_lang();
		if( !empty($lang) && strpos($lang, 'lg-')!==false ) {
			$lang_name 	= lang::get_name_from_code( $lang, DEDALO_DATA_LANG );
		}

		return $lang_name;
	}//end get_lang_name



	/**
	* ADD_OBJECT_TO_DATO
	* Add received object to objects array
	*/
	public static function add_object_to_dato( $object, array $dato) {

		if (!is_object($object)) {
			throw new Exception("Error Processing Request. var 'object' is not of type object ", 1);
		}
		if (get_class($object)==='locator') {
			$std_object = locator::get_std_class( $object );
		}else{
			$std_object = $object;
		}

		$object_exists=false;
		foreach ($dato as $key => $current_object_obj) {
			/*
			if (!is_object($current_object_obj)) {
				if(SHOW_DEBUG===true) {
					throw new Exception("Error Processing Request. 'dato' elements are not objects. Please verify json_decode is called before use this method", 1);
				}
				trigger_error(__METHOD__ . "Sorry. Object expected. Nothing is added");
				break;
			}
			*/
			if ((object)$std_object==(object)$current_object_obj) {
				$object_exists=true; break;
			}
		}

		if ($object_exists===false) {
			$dato[] = $std_object;
		}

		return $dato;
	}//end add_object_to_dato



	/**
	* REMOVE_OBJECT_IN_DATO
	* Remove received object in objects array
	*/
	public static function remove_object_in_dato( $object, array $dato) {

		if (!is_object($object)) {
			throw new Exception("Error Processing Request. var 'object' is not of type object ", 1);
		}
		if (get_class($object)==='locator') {
			$std_object = locator::get_std_class( $object );
		}else{
			$std_object = $object;
		}

		$remove_key=false;
		foreach ($dato as $key => $current_object_obj) {
			if (!is_object($current_object_obj)) {
				if(SHOW_DEBUG===true) {
					throw new Exception("Error Processing Request. 'dato' elements are not objects. Please verify json_decode is called before use this method", 1);
				}
				trigger_error(__METHOD__ . "Sorry. Object expected. Nothing is removed");
				break;
			}
			if ((object)$std_object==(object)$current_object_obj) {
				$remove_key=$key;
				break;
			}
		}

		if ($remove_key!==false) {

			unset($dato[$remove_key]);
			$dato = array_values($dato); # Re-index array dato (IMPORTANT FOR MAINTAIN JSON ARRAY FORMAT !!)
		}

		return $dato;
	}//end remove_object_in_dato



	/**
	* REMOVE_OBJECT_IN_DATO
	* Remove received locator in objects array comparing ar_properties
	*/
	public static function remove_locator_in_dato( $locator_obj, array $dato, $ar_properties=array('section_tipo','section_id')) {

		if (!is_object($locator_obj)) {
			throw new Exception("Error Processing Request. var 'object' is not of type object locator_obj ", 1);
		}


		$remove_key=false;
		foreach ($dato as $key => $current_locator_obj) {
			if (!is_object($current_locator_obj)) {
				if(SHOW_DEBUG===true) {
					throw new Exception("Error Processing Request. 'dato' elements are not objects. Please verify json_decode is called before use this method", 1);
				}
				trigger_error(__METHOD__ . "Sorry. Object locator expected. Nothing is removed");
				break;
			}
			if ( true===locator::compare_locators( $locator_obj, $current_locator_obj, $ar_properties ) ){
				$remove_key=$key;
				break;
			}
		}

		if ($remove_key!==false) {

			unset($dato[$remove_key]);
			$dato = array_values($dato); # Re-index array dato (IMPORTANT FOR MAINTAIN JSON ARRAY FORMAT !!)
		}

		return $dato;
	}//end remove_object_in_dato


	/**
	* GET_DIFFUSION_OBJ
	* @param stdClass Object $propiedades
	*/
	public function get_diffusion_obj( $propiedades ) {

		# Build object
		$diffusion_obj = new diffusion_component_obj();
			$diffusion_obj->component_name		= get_class($this);
			#$diffusion_obj->id 				= $this->get_id();	# Removed in b4
			$diffusion_obj->parent 				= $this->get_parent();
			$diffusion_obj->section_tipo 		= $this->get_section_tipo();
			$diffusion_obj->tipo 				= $this->get_tipo();
			$diffusion_obj->lang 				= $this->get_lang();
			$diffusion_obj->label 				= $this->get_label();
			#$diffusion_obj->dato 				= $this->get_dato();

			# initial_media_path
			#$section 							= section::get_instance($diffusion_obj->parent, $diffusion_obj->section_tipo );
			#$diffusion_obj->initial_media_path  = $section->get_initial_media_path();

			$diffusion_obj->initial_media_path = $this->get_initial_media_path();

			/*
			$valor = $this->get_dato();
			$valor = to_string($valor);
			#$valor = filter_var($valor, FILTER_SANITIZE_STRING);
			$diffusion_obj->columns['valor'] 	= $valor;
			*/

		# Set standar 'valor' (Overwrite when need resolve dato. Ex. portals)
		$diffusion_obj->columns['valor'] = $this->get_valor();

		return $diffusion_obj;
	}//end get_diffusion_obj



	/**
	* GET_STATS_OBJ
	*/
	public function get_stats_obj( $propiedades ) {

		$stats_obj = new diffusion_stats_component_obj();
		$stats_obj = $this->get_dato();

		return $stats_obj;
	}//end get_stats_obj



	/**
	* GET_STATS_VALUE
	*/
	public static function get_stats_value( $tipo, $ar_value ) {

		$caller_component = get_called_class();

		#if($caller_component!='component_radio_button') return;

		if(!isset($stats_value))
		static $stats_value;


		# Formateamos el dato recibido
		if( is_array($ar_value) ) {

			foreach ($ar_value as $key => $value) {

				if(!isset($stats_value[$tipo][$value])) $stats_value[$tipo][$value] = 0;
				$stats_value[$tipo][$value] = $stats_value[$tipo][$value] + 1;
			}

		}else{

			$value = $ar_value;

			if(!isset($stats_value[$tipo][$value])) $stats_value[$tipo][$value] = 0;
			$stats_value[$tipo][$value] = $stats_value[$tipo][$value] + 1;
		}


		return $stats_value[$tipo];
	}//end get_stats_value



	/**
	* GET_STATS_VALUE_RESOLVED
	*/
	public static function get_stats_value_resolved( $tipo, $current_stats_value, $stats_model ,$stats_propiedades=NULL ) {

		$caller_component = get_called_class();

		foreach ($current_stats_value as $current_dato => $value) {

			if( empty($current_dato) ) {

				$current_dato = 'nd';
				$ar_final[$current_dato] = $value;

			}else{

				$current_component = component_common::get_instance($caller_component, $tipo, NULL, 'stats');
				$current_component->set_dato($current_dato);

				$valor = $current_component->get_valor();

				$ar_final[$valor] = $value;
			}


		}//end foreach


		$label 		= RecordObj_dd::get_termino_by_tipo( $tipo,null,true ).':'.$stats_model;
		$ar_final 	= array($label => $ar_final );

		return $ar_final;
	}//end get_stats_value_resolved



	/**
	* GET_COMPONENT_AR_LANGS
	* Devuelve un array con todos los idiomas usados por este componente a partir del dato de la sección que lo aloja
	* @return array $component_ar_langs
	*/
	public function get_component_ar_langs() {

		$component_ar_langs=array();

		$tipo 			= $this->tipo;
		$parent 		= $this->parent;

		if (empty($parent)) {
			trigger_error("Error: parent is mandatory for ".__METHOD__);
			if(SHOW_DEBUG===true) {
				dump($this,"this");
				throw new Exception("Error Processing Request", 1);
			}
		}
		$section_tipo 	= $this->section_tipo;
		$section 		= section::get_instance($this->parent,$section_tipo);
		$section_dato 	= $section->get_dato();

		if (isset($section_dato->components->$tipo->dato)) {
			$component_dato_full = $section_dato->components->$tipo->dato;
		}else{
			$component_dato_full = null;
		}


		if ($component_dato_full!==null) {
			foreach ($component_dato_full as $key => $value) {
				$component_ar_langs[] = $key; // Old way
				/*
				$locator = new locator();
					$locator->set_section_tipo(DEDALO_LANGS_SECTION_TIPO);
					$locator->set_section_id(lang::get_section_id_from_code($key));

				$component_ar_langs[] = $locator;
				*/
			}
		}

		return (array)$component_ar_langs;
	}//end get_component_ar_langs



	/**
	* GET_AR_AUTHORIZED_TOOL_NAME
	*/
	public function get_ar_authorized_tool_name() {
		if (self::get_permissions($this->section_tipo, $this->tipo)<=1) {
			return array();
		}

		if (!isset($this->ar_authorized_tool_name)) {
			$this->get_ar_tools_obj();
		}

		return (array)$this->ar_authorized_tool_name;
	}//end get_ar_authorized_tool_name



	/**
	* GET_COMPONENT_INFO
	* @param string $format
	*	Default 'json'
	*/
	public function get_component_info($format='json') {

		$component_info = new stdClass();

			$component_info->ar_tools_name 	= (array)$this->get_ar_authorized_tool_name();
			if (get_class($this)==='component_calculation') {
				# code...
			}else{
				$component_info->propiedades = $this->get_propiedades();
			}


		switch ($format) {
			case 'json':
				/*  json_handler::encode da error . Revisar ?
				$component_info_json = json_handler::encode($component_info);
				if (!$component_info_json) {
					dump($component_info, ' component_info ++ '.to_string());
				}
				*/
				$component_info_json = json_encode($component_info);
				#$component_info_json = rawurlencode($component_info_json);
				return $component_info_json;
				break;

			default:
				return $component_info;
				break;
		}

		return $component_info;
	}//end get_component_info



	public static function build_locator() {

		throw new Exception("DEPRECATED METHOD", 1);
	}
	public static function build_locator_relation() {

		throw new Exception("DEPRECATED METHOD", 1);
	}



	/*
	* GET_VALOR_LANG
	* Return the main component lang
	* If the component need change this langs (selects, radiobuttons...) overwritte this function
	*/
	public function get_valor_lang(){

		return $this->lang;
	}


	/*
	* GET_METHOD
	* Return the result of the method calculation into the component
	*/
	public function get_method( $name ){
		/*
		if (method_exists($this,$name)) {
			return $this->$$name();
		}
		*/
		if (SHOW_DEBUG===true) {
			debug_log(__METHOD__.' This component don\'t have one method defined: '.$name, logger::WARNING);
		}
		return false;
	}//end get_method



	/**
	* GET_REFERENCED_TIPO
	* (used by component_autocomplete, component_radio_button.. )
	* @return string $this->referenced_tipo from TR of current component
	*/
	public function get_referenced_tipo() {

		if (isset($this->referenced_tipo)) return $this->referenced_tipo;

		# RELACIONES : Search and add relations to current component
		$relaciones = (array)$this->RecordObj_dd->get_relaciones();

		# ONLY >1 TR IS ALLOWED
		if(count($relaciones)<1 || !isset($relaciones[0])) {
			$tipo 		= $this->get_tipo();
			$termino 	= RecordObj_dd::get_termino_by_tipo($tipo,null,true);
			$modelo 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$msg = "Error Processing Request. invalid number of related components (".count($relaciones).") $termino";
			if(SHOW_DEBUG===true) {
				$msg .= "<hr> $modelo : $termino [$tipo] => relaciones = ". var_export($relaciones,true);
			}
			#throw new Exception($msg, 1);
		}

		if (empty($relaciones[0])) {
			if(SHOW_DEBUG===true) {
				dump($relaciones,'Empty relaciones '.$this->tipo);
				trigger_error("Referenced tipo not found (relaciones[0][0]) in ".$this->tipo." - ".get_class($this)." - ".$this->get_label()  );
			}
			return false;
		}

		$this->referenced_tipo = reset($relaciones[0]);

		return $this->referenced_tipo;
	}//end get_referenced_tipo



	/**
	* GET_REFERENCED_SECTION_TIPO
	* (used by component_autocomplete, component_radio_button.. for set target section_tipo (propiedades) - aditional to referenced component tipo (TR)- )
	* @return string $this->referenced_section_tipo from json propiedades section_tipo
	*
	*
	*	ACABARÁ UNIFICÁNDOSE AL COMPORTAMIENTO DE PORTAL Y AUTOCOMPLETE
	*
	*/
	public function get_referenced_section_tipo($tipo) {

		if (isset($this->referenced_section_tipo)) return $this->referenced_section_tipo;

		/*
			NOTA: La convertimos en una alias de get_section_tipo_from_component_tipo

		if (empty($this->propiedades) || !is_object($this->propiedades) || !property_exists($this->propiedades, 'section_tipo')) {
			#throw new Exception("Error Processing Request. ".get_class($this)." Propiedades -> section_tipo is mandatory ($this->tipo)", 1);
		}

		$this->referenced_section_tipo = $this->propiedades->section_tipo;

		return $this->referenced_section_tipo;
		*/

		return $this->get_section_tipo_from_component_tipo($tipo);
	}//end get_referenced_section_tipo



	/**
	* GET_TARGET_SECTION_TIPO --> TO DEPRECATE
	* Sección de la que se alimenta de registros el portal. No confundir con la sección en la que está el portal
	* OJO !! SE DEPRECÓ EN COMPONENT_COMMON SIN VERIFICAR LAS LLAMADAS A ELLA (DIFFUSION POR EJEMPLO). la vuelvo a activar en el componente portal porque es necesaria aquí.. (Paco 04-12-2015
	* Se desactivó porque ahora un portal puede tener más de 1 target_section (multi target..). Mantendremos este método por compatibilidad con lo anterior hasta solucionar el tema
	* de forma más "elegante". Se devolverá un array con todas, en orden. Por tanto es importante poner la principal la primera !!!
	* @return string tipo . first element of ar_target_section_tipo
	* @see TO DEPRECATE
	*/
	public function get_target_section_tipo() {
		$ar_target_section_tipo = $this->get_ar_target_section_tipo();
		$main_target_section 	= reset($ar_target_section_tipo);
		#
		# DEPRECATED SOON WARNING
		trigger_error("WARNING: this method: 'get_target_section_tipo' will be deprecated soon. First element is returned now, but, PLEASE USE 'get_ar_target_section_tipo' AND SELECT THE ELEMENT THAT YOU NEED ");

		return $main_target_section;
	}//end get_target_section_tipo


	/**
	* GET_AR_TARGET_SECTION_TIPO
	* Sección/es de la que se alimenta de registros el portal/autocomplete. No confundir con la sección en la que está el portal
	*/
	public function get_ar_target_section_tipo() {

		if (!$this->tipo) return NULL;

		if(isset($this->ar_target_section_tipo)) {
			return $this->ar_target_section_tipo;
		}

		$ar_terminoID_by_modelo_name = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($this->tipo, 'section', 'termino_relacionado', $search_exact=true);

		$propiedades 	 = $this->get_propiedades();

		if(isset($propiedades->source->search)){
			foreach ($propiedades->source->search as $current_search) {
				$current_section_tipo = $current_search->section_tipo;
				// check if is available
				$current_model = RecordObj_dd::get_modelo_name_by_tipo($current_section_tipo,true);
				if ($current_model==='section') {
					$ar_terminoID_by_modelo_name[] = $current_section_tipo;
				}else{
					debug_log(__METHOD__." !!!!!!!!!!! IGNORED NO SECTION element: $current_section_tipo ".to_string($current_model), logger::ERROR);
				}
			}
		}

		if(SHOW_DEBUG===true) {
			if ( empty( $ar_terminoID_by_modelo_name)) {
				$component_name = RecordObj_dd::get_termino_by_tipo($this->tipo,null,true);
				throw new Exception("Error Processing Request. Please, define target section structure for component: $component_name - $this->tipo", 1);
			}
		}

		$ar_target_section_tipo = $ar_terminoID_by_modelo_name;


		# Fix value
		$this->ar_target_section_tipo = $ar_target_section_tipo;

		return (array)$ar_target_section_tipo;
	}//end get_ar_target_section_tipo



	/**
	* BUILD_SEARCH_COMPARISON_OPERATORS
	* @return object stdClass $search_comparison_operators
	*/
	public function build_search_comparison_operators( $comparison_operators=array('ILIKE','LIKE','=','!=') ) {
		$search_comparison_operators = new stdClass();

		#
		# Overwrite defaults with 'propiedades'->SQL_comparison_operators
		if(isset($this->propiedades->SQL_comparison_operators)) {
			$comparison_operators = (array)$this->propiedades->SQL_comparison_operators;
		}


		foreach ($comparison_operators as $current) {
			# Get the name of the operator in current lang
			$operator = operator::get_operator($current);
			$search_comparison_operators->$current = $operator;
		}
		return (object)$search_comparison_operators;
	}//end build_search_comparison_operators


	/**
	* BUILD_SEARCH_LOGICAL_OPERATORS
	* Default generic method
	* @return object stdClass $search_comparison_operators
	*/
	public function build_search_logical_operators( $logical_operators=array('AND','OR','NOT') ) {
		$search_logical_operators = new stdClass();

		#
		# Overwrite defaults with 'propiedades'->SQL_logical_operators
		if(isset($this->propiedades->SQL_logical_operators)) {
			$logical_operators = (array)$this->propiedades->SQL_logical_operators;
		}

		foreach ($logical_operators as $current) {
			# Get the name of the operator in current lang
			$operator = operator::get_operator($current);
			$search_logical_operators->$current = $operator;
		}

		return (object)$search_logical_operators;
	}//end build_search_logical_operators



	/**
	* GET_SEARCH_QUERY
	* Build search query for current component . Overwrite for different needs in other components
	* (is static to enable direct call from section_records without construct component)
	* Params
	* @param string $json_field . JSON container column Like 'dato'
	* @param string $search_tipo . Component tipo Like 'dd421'
	* @param string $tipo_de_dato_search . Component dato container Like 'dato' or 'valor'
	* @param string $current_lang . Component dato lang container Like 'lg-spa' or 'lg-nolan'
	* @param string $search_value . Value received from search form request Like 'paco'
	* @param string $comparison_operator . SQL comparison operator Like 'ILIKE'
	*
	* @see class.section_records.php get_rows_data filter_by_search
	* @return string $search_query . POSTGRE SQL query (like 'datos#>'{components, oh21, dato, lg-nolan}' ILIKE '%paco%' )
	*/
	public static function get_search_query( $json_field, $search_tipo, $tipo_de_dato_search=null, $current_lang=null, $search_value='', $comparison_operator='ILIKE') {//, $logical_operator = 'AND'

		if (empty($search_value)) return false;

		$json_field = 'a.'.$json_field; // Add 'a.' for mandatory table alias search

		$current_lang='all'; // Forced to search in all langs always

		$search_query='';
		switch (true) {
			case ($comparison_operator==='ILIKE' || $comparison_operator==='LIKE'):
				// Allow wildcards like "house*" or "*house"
				$separator 	   = '*';
				if ( $search_value[0] === $separator ) {
					// Begin with * like
					if ($current_lang=='all') {
						$search_query = " unaccent({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search}') $comparison_operator unaccent('%[\"%{$search_value}') ";
					}else{
						$search_value = str_replace($separator, '', $search_value);
						$search_query = " unaccent({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}') $comparison_operator unaccent('%$search_value') ";
					}

				}else if ( $search_value[strlen($search_value) - 1] === $separator ) {
					// End with *
					$search_value = str_replace($separator, '', $search_value);
					if ($current_lang=='all') {
						$search_query = " unaccent({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search}') $comparison_operator unaccent('%[\"{$search_value}%') ";
					}else{
						$search_query = " unaccent({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}') $comparison_operator unaccent('$search_value%') ";
					}
				}else{
					// Contain
					$search_value = str_replace($separator, '', $search_value);
					if ($current_lang=='all') {
						#$search_query = " unaccent({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search}') ~* unaccent('.*\[\".*$search_value.*') ";
						$search_query = " unaccent({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search}') $comparison_operator unaccent('%$search_value%') ";
					}else{
						$search_query = " unaccent({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}') $comparison_operator unaccent('%$search_value%') ";
					}
				}
				break;

			case ($comparison_operator==='=' || $comparison_operator==='!='):
				if ($current_lang=='all') {
					$ar_lang_search_query = array();
					foreach (common::get_ar_all_langs() as $iter_lang) {
						$ar_lang_search_query[] = "{$json_field}#>'{components, $search_tipo, $tipo_de_dato_search, ". $iter_lang ."}' $comparison_operator '\"$search_value\"'";
					}
					$search_query = " (".implode(" OR ", $ar_lang_search_query).") ";
				}else{
					$search_query = " unaccent({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}') $comparison_operator '$search_value' ";
				}
				break;

			case ($comparison_operator==='IS NULL' || $comparison_operator==='IS NOT NULL'):
				if($comparison_operator === 'IS NULL'){
					$comparison_operator2 = '=';
					$union_operator = 'OR';
				}else{
					$comparison_operator2 = '!=';
					$union_operator = 'AND';
				}
				$search_query  = " ({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}') $comparison_operator $union_operator ";
				$search_query .= " {$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}') $comparison_operator2 '' )";
				break;

			default:
				if ($current_lang=='all') {
						$search_query = " unaccent({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search}') $comparison_operator unaccent('%[\"%{$search_value}') ";
				}else{
						$search_query = " unaccent({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}') $comparison_operator '%$search_value%' ";
				}
				break;
		}

		if(SHOW_DEBUG===true) {
			$search_query = " -- filter_by_search $search_tipo ". get_called_class() ." $comparison_operator \n".$search_query;
		}

		return (string)$search_query;
	}//end get_search_query



	/**
	* GET_SEARCH_ORDER
	* Overwrite as needed
	* @return string $order_direction
	*/
	public static function get_search_order($json_field, $search_tipo, $tipo_de_dato_order, $current_lang, $order_direction) {
		$order_by_resolved = "a.$json_field#>>'{components, $search_tipo, $tipo_de_dato_order, $current_lang}' ".$order_direction;

		return (string)$order_by_resolved;
	}//end get_search_order



	/**
	* GET_SELECT_QUERY
	* Build component specific sql portion query to inject in a global query
	* Note that this select_query is used only in direct data components
	* For components that use references (locators) see:
	* @see component_reference_common->get_select_query
	* @return string $select_query
	*/
	public static function get_select_query($request_options) { // Used by subquerys

		$options = new stdClass();
			$options->json_field  = 'dato';
			$options->search_tipo = null;
			$options->lang 		  = null;
			$options->subquery 	  = false;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$json_field = 'a.'.$options->json_field; // Add 'a.' for mandatory table alias search

		$select_query  = '';

		if(SHOW_DEBUG===true) {
			$select_query .= "\n  -- ".get_called_class().' > '.__METHOD__." $options->search_tipo . Select default ";
		}
		if ($options->lang==='all') {
			$select_query .= "\n  {$json_field}#>'{components, $options->search_tipo, dato}' as $options->search_tipo";
		}else{
			$select_query .= "\n  {$json_field}#>'{components, $options->search_tipo, dato, $options->lang}' as $options->search_tipo";
		}
		// $sql_columns .= "\n a.$sql_options->json_field#>>'{components, $current_column_tipo, ".$sql_options->tipo_de_dato.", $current_lang}' AS $current_column_tipo,";

		return $select_query;
	}//end get_select_query



	/**
	* GET_AR_COMPONENTS_WITH_REFERENCES
	* Get model name array of components that can store references (locators)
	* @return array $ar_components_with_references
	*//* USE component_relation_common::get_components_with_relations <---
	public static function get_ar_components_with_references() {
		return [ 'component_autocomplete',
				 'component_autocomplete_hi',
				 'component_check_box',
				 'component_portal',
				 'component_radio_button',
				 'component_select',
				 'component_select_lang', 	// added 27-02-2018
				 'component_publication',  	// added 27-02-2018
				 'component_filter',  		// added 6-05-2018
				 'component_filter_master'  // added 6-05-2018
				];
	}//end get_ar_components_with_references
	*/



	/**
	* GET_STATE
	* (common because is used by various components and tools, ..)
	* @param object $state_obj ("lang":"toolXXX":1)
	* @return object $this->component_state set and store component_state)
	*/
	public function get_component_state($tool_locator=null,$lang=DEDALO_DATA_LANG) {

		$component_state 	 = $this->get_component_state_obj();

		if (empty($component_state) || !is_object($component_state)) {
			return false;
		}
		$section_id 		 = $component_state->get_parent();
		$component_tipo 	 = $this->get_tipo();
		$section_tipo		 = $component_state->get_section_tipo();

		$options 	= new stdClass();
			$options->section_tipo 		= $section_tipo;
			$options->section_id 		= $section_id;
			$options->component_tipo 	= $component_tipo;
			$options->lang 				= $lang;
			$options->tool_locator 		= $tool_locator;

		$component_state->set_options($options);

		return $component_state;
	}//end get_component_state



	/**
	* GET_COMPONENT_STATE_OBJ
	* (common because is used by various components and tools, ..)
	* @return object $this->component_state (get and store component_state)
	*/
	protected function get_component_state_obj($modo='edit_tool') {

		if(isset($this->component_state)) return $this->component_state;

		$section_id 			= $this->get_parent();
		$component_tipo 		= $this->get_tipo();
		$section_tipo			= $this->get_section_tipo();
		$component_state_tipo 	= $this->get_component_state_tipo();

		if (!$component_state_tipo) {
			return null;
		}else{
			$this->component_state  = component_common::get_instance('component_state',
																	  $component_state_tipo,
																	  $section_id,
																	  $modo,
																	  DEDALO_DATA_NOLAN,
																	  $section_tipo);
		}

		return (object)$this->component_state;
	}//end get_component_state_obj



	/**
	* GET_COMPONENT_STATE_TIPO
	* @return
	*/
	public function get_component_state_tipo() {

		if(isset($this->component_state_tipo)) return $this->component_state_tipo;

		$section_id 	= $this->get_parent();
		$component_tipo = $this->get_tipo();
		$section_tipo	= $this->get_section_tipo();
		$ar_result 		= section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, 'component_state', true, true);

		if (empty($ar_result[0])) {
			return false;
		}else{
			$this->component_state_tipo = $ar_result[0];
		}

		return (string)$this->component_state_tipo;
	}//end get_component_state_tipo



	/**
	* GET_STATE_PROCESS_HTML
	* @return string $state_process_html
	*/
	public function get_state_process_html() {

		if (!isset($this->propiedades->state->edit_component)) {
			return null;
		}

		$ar_children_tipo_by_modelo = section::get_ar_children_tipo_by_modelo_name_in_section($this->section_tipo, 'component_state', true, true);
		if (empty($ar_children_tipo_by_modelo)) {
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Section without component_state defined in structure");
			}
			return null;
		}
		$component_state_tipo = $ar_children_tipo_by_modelo[0];
		$component_state 	  = component_common::get_instance('component_state',
															   $component_state_tipo,
															   $this->parent,
															   'edit_component',
															   DEDALO_DATA_NOLAN,
															   $this->section_tipo);

		$state = $this->propiedades->state->edit_component;
		$component_state->configure_for_component( $state, $this->tipo, $this->parent, $this->section_tipo, $this->lang );

		$state_process_html = $component_state->get_html();

		return $state_process_html;
	}//end get_state_process_html



	/**
	* RENDER_LIST_VALUE
	* (Overwrite for non default behaviour)
	* Receive value from section list and return proper value to show in list
	* Sometimes is the same value (eg. component_input_text), sometimes is calculated (e.g component_portal)
	* @param string $value
	* @param string $tipo
	* @param int $parent
	* @param string $modo
	* @param string $lang
	* @param string $section_tipo
	* @param int $section_id
	*
	* @return string $list_value
	*/
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id, $current_locator=null, $caller_component_tipo=null) {

		return $value;
	}//end render_list_value



	/**
	* GET_DIFFUSION_VALUE
	* Calculate current component diffsuion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( $lang ) {

		# Default behaviour is get value
		$diffusion_value = $this->get_valor( $lang );

		# strip_tags all values (remove untranslate mark elements)
		$diffusion_value = preg_replace("/<\/?mark>/", "", $diffusion_value);


		return (string)$diffusion_value;
	}//end get_diffusion_value



	/**
	* UPDATE_DATO_VERSION
	* @return $response->result =0; // the component don't have the function "update_dato_version"
	* @return $response->result =1; // the component do the update"
	* @return $response->result =2; // the component try the update but the dato don't need change"
	*/
	public static function update_dato_version($request_options) {

		$options = new stdClass();
			$options->update_version 	= null;
			$options->dato_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version = $options->update_version;
			$dato_unchanged = $options->dato_unchanged;
			$reference_id 	= $options->reference_id;


		$response = new stdClass();
		$modelo_name = get_called_class();
		$response->result =0;
		$response->msg = "This component $modelo_name don't have update_dato_version, please check the class of the component <br />";

		return $response;
	}//end update_dato_version



	/**
	* GET_SEMANTIC_NODES
	* Used by components using locators like component_portal and component_autocomplete
	* @return array $semantic_nodes
	*	like array('dd1874')
	*/
	public function get_semantic_nodes() {

		if(isset($this->semantic_nodes)) return $this->semantic_nodes;

		$this->semantic_nodes = array();

		$childrens = $this->RecordObj_dd->get_ar_childrens_of_this();
		foreach ($childrens as $current_tipo) {
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
			if ($modelo_name==='semantic_node') {
				$this->semantic_nodes[] = $current_tipo;
			}
		}

		return (array)$this->semantic_nodes;
	}//end get_semantic_nodes



	/**
	* ADD_INDEX_SEMANTIC
	* Used by components using locators like component_portal and component_autocomplete
	* @param string $termino_id
	* @param string $locator_section_tipo
	* @param string $locator_section_id
	* @param string $ds_key
	*	Dédalo semantics key
	* @return object $response
	*/
	public function add_index_semantic($new_ds_locator, $locator_section_tipo, $locator_section_id, $ds_key) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		$dato = $this->get_dato();
		foreach ((array)$dato as $current_locator) {

			if ($current_locator->section_tipo===$locator_section_tipo && $current_locator->section_id==$locator_section_id) {
			#if ( locator::compare_locators($current_locator, $locator, array('section_tipo','section_id')) ) {

				# new ds locator is builded from termino_id temporarily
				#$new_ds_locator = component_autocomplete_ts::convert_dato_to_locator($termino_id);

				# ds container add if not exits in current locator
				if(!isset($current_locator->ds)) {
					$current_locator->ds = new stdClass();
				}
				if(!isset($current_locator->ds->$ds_key)) {
					$current_locator->ds->$ds_key = array();
				}

				# add ds locator to current portal locator removing duplicates
				$current_locator->ds->$ds_key = component_common::add_object_to_dato((object)$new_ds_locator, (array)$current_locator->ds->$ds_key);

				$this->set_dato($dato);
				$this->Save();

				$response->result 	= true;
				$response->msg 		= "Added index semantic locator ds";
				break;
			}

		}//endforeach ((array)$dato as $current_locator) {

		return (object)$response;
	}//end add_index_semantic



	/**
	* REMOVE_INDEX_SEMANTIC
	* Used by components using locators like component_portal and component_autocomplete
	* @param string $termino_id
	* @param string $locator_section_tipo
	* @param string $locator_section_id
	* @return object $response
	*/
	public function remove_index_semantic($new_ds_locator, $locator_section_tipo, $locator_section_id, $ds_key) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		$dato = $this->get_dato();
		foreach ((array)$dato as $current_locator) {

			if ($current_locator->section_tipo===$locator_section_tipo && $current_locator->section_id==$locator_section_id) {

				# ds container add if not exits in current locator
				if(!isset($current_locator->ds->$ds_key)) {
					$response->msg = 'Sorry, current index not exists. Nothing is removed';
					return $respose;
				}

				# new ds locator is builded from termino_id temporarily
				#$new_ds_locator = component_autocomplete_ts::convert_dato_to_locator($termino_id);

				# add ds locator to current portal locator removing duplicates
				#$current_locator->ds->$ds_key = component_common::remove_object_in_dato((object)$new_ds_locator, (array)$current_locator->ds->$ds_key);
				$current_locator->ds->$ds_key = component_common::remove_locator_in_dato((object)$new_ds_locator, (array)$current_locator->ds->$ds_key);

				$this->set_dato($dato);
				$this->Save();

				$response->result 	= true;
				$response->msg 		= "Removed index semantic locator";
				break;
			}

		}//endforeach ((array)$dato as $current_locator) {

		return (object)$response;
	}//end remove_index_semantic



	/**
	* GET_VALOR_LIST_HTML_TO_SAVE
	* Usado por section:save_component_dato
	* Devuelve a section el html a usar para rellenar el 'campo' 'valor_list' al guardar
	* Por defecto será el html generado por el componente en modo 'list', pero en algunos casos
	* es necesario sobre-escribirlo, como en component_portal, que ha de resolverse obigatoriamente en cada row de listado
	* @see class.section.php
	* @return string $html
	*/
	public function get_valor_list_html_to_save() {
		# Store current modo
		$modo_previous = $this->get_modo();

		# Temporal modo
		$this->set_modo('list');

		# Get html from current component
		$html = $this->get_html();

		# Return it to anterior mode after get the html
		$this->set_modo($modo_previous);	# Important!

		return (string)$html;
	}//end get_valor_list_html_to_save



	/**
	* GET_ORDER_BY_LOCATOR
	* @return bool
	*/
	public static function get_order_by_locator() {

		return false;
	}//end get_order_by_locator



	/**
	* SET_DATO_FROM_CSV
	* Receive a plain text value from csv file and set this value as dato.
	* Override in each component.
	* @param object $data
	* @return bool
	*/
	public function set_dato_from_csv( $data ) {
		debug_log(__METHOD__." Please, overwrite this method in each ".to_string(), logger::DEBUG);
		#$this->set_dato($value);
		return false;
	}//end set_dato_from_csv



	/**
	* GET_SECTION_ID_FROM_VALUE
	* Only first
	* @return mixed int|null
	*/
	public static function get_section_id_from_value( $value, $target_section_tipo, $target_component_tipo ) {

		# Search if value exists in target section
		$json_field 		 = 'datos';
		$search_tipo 		 = $target_component_tipo;
		$tipo_de_dato_search = 'dato';
		$RecordObj_dd 		 = new RecordObj_dd($target_component_tipo);
		$traducible 		 = $RecordObj_dd->get_traducible();
		$current_lang 		 = ($traducible==='si') ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
		$search_value 		 = $value;
		$comparison_operator = '=';

		$target_component_model = RecordObj_dd::get_modelo_name_by_tipo($target_component_tipo, true);

		$search_query = $target_component_model::get_search_query( $json_field, $search_tipo, $tipo_de_dato_search, $current_lang, $search_value, $comparison_operator);

		$table = common::get_matrix_table_from_tipo($target_section_tipo);

		$strQuery = "SELECT section_id FROM \"$table\" a WHERE $search_query ORDER BY section_id ASC LIMIT 1";
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);
		$section_id_from_value = null;
		while ($rows = pg_fetch_assoc($result)) {
			$section_id_from_value = (int)$rows['section_id'];
			break;
		}

		return $section_id_from_value;
	}//end get_section_id_from_value



	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-save its data
	* Note that the first action is always load dato to avoid save empty content
	* @see class.tool_update_cache.php
	* @return bool
	*/
	public function regenerate_component() {

		# Force loads dato always !IMPORTANT
		$this->get_dato();

		# Save component data
		$this->Save();


		return true;
	}//end regenerate_component



	/**
	* GET_SEARCH_INPUT_NAME
	* Search input name (var search_input_name is injected in search -> records_search_list.phtml)
	* and recovered in component_common->get_search_input_name()
	* Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
	* @return string $search_input_name
	*/
	public function get_search_input_name() {
		if (!isset($this->search_input_name)) {
			// Default set
			$this->search_input_name = $this->section_tipo.'_'.$this->tipo;
		}

		return $this->search_input_name;
	}//end get_search_input_name



	/**
	* GET_DIVISOR
	* Default is space ( ). To overwrite, add in propiedades {source->divisor->'x'}
	* @return string $divisor
	*/
	public function get_divisor() {
		$divisor = ' | '; // Default
		$propiedades = $this->get_propiedades();
		if (isset($propiedades->source->divisor)) {
			$divisor = $propiedades->source->divisor;
		}

		return $divisor;
	}//end get_divisor



	/**
	* EXTRACT_COMPONENT_dato_FALLBACK
	* 21-04-2017 Paco
	* @return string $value
	*/
	public static function extract_component_dato_fallback($component, $lang=DEDALO_DATA_LANG, $main_lang=DEDALO_DATA_LANG_DEFAULT) {

		// get and store initial lang
			$inital_lang = $component->get_lang();

		// Try directe dato
			$dato = $component->get_dato();

		// fallback if empty
			if (empty($dato)) {

				// Try main lang. (Used config DEDALO_DATA_LANG_DEFAULT as main_lang)
					if ($lang!==$main_lang) {
						$component->set_lang($main_lang);
						$dato = $component->get_dato();
					}

				// Try nolan
					if (empty($dato)) {
						$component->set_lang(DEDALO_DATA_NOLAN);
						$dato = $component->get_dato(DEDALO_DATA_NOLAN);
					}

				// Try all projects langs sequence
					if (empty($dato)) {
						$data_langs = common::get_ar_all_langs(); # Langs from config projects
						foreach ($data_langs as $current_lang) {
							if ($current_lang===$lang || $current_lang===$main_lang) {
								continue; // Already checked
							}
							$component->set_lang($current_lang);
							$dato = $component->get_dato($current_lang);
							if (!empty($dato)) break; # Stops when first data is found
						}
					}
			}

		// restore initial lang
			$component->set_lang($inital_lang);

		return $dato;
	}//end extract_component_dato_fallback



	/**
	* EXTRACT_COMPONENT_VALUE_FALLBACK
	* 21-04-2017 Paco
	* @return string $value
	*/
	public static function extract_component_value_fallback($component, $lang=DEDALO_DATA_LANG, $mark=true, $main_lang=DEDALO_DATA_LANG_DEFAULT) {

		# Try directe value
		$value = $component->get_valor($lang);

		if (empty($value)) {

			# Try main lang. (Used config DEDALO_DATA_LANG_DEFAULT as main_lang)
			if ($lang!==$main_lang) {
				$component->set_lang($main_lang);
				$value = $component->get_valor($main_lang);
			}

			# Try nolan
			if (empty($value)) {
				$component->set_lang(DEDALO_DATA_NOLAN);
				$value = $component->get_valor(DEDALO_DATA_NOLAN);
			}

			# Try all projects langs sequence
			if (empty($value)) {
				$data_langs = common::get_ar_all_langs(); # Langs from config projects
				foreach ($data_langs as $current_lang) {
					if ($current_lang===$lang || $current_lang===$main_lang) {
						continue; // Already checked
					}
					$component->set_lang($current_lang);
					$value = $component->get_valor($current_lang);
					if (!empty($value)) break; # Stops when first data is found
				}
			}
			# Try resolve
			/*
			if (empty($value)) {

				$section_tipo = self::get_section_tipo_from_component_tipo($component->get_tipo());
				$main_lang = common::get_main_lang($section_tipo);
				$component->set_lang($main_lang);
				$value = $component->get_valor($main_lang);
			}*/

			# Set value as untranslated
			if ($mark===true) {
				$value = '<mark>'.$value.'</mark>';
			}
		}

		return $value;
	}//end extract_component_value_fallback



	/**
	* GET_VALUE_WITH_FALLBACK_FROM_DATO_FULL
	* Recive a full dato of translatable component and try to find a no empty lang
	* Expected dato is a string like '{"lg-eng": "", "lg-spa": "Comedor"}'
	* @return string $value
	*/
	public static function get_value_with_fallback_from_dato_full( $dato_full_json, $decore_untranslated=false, $main_lang=DEDALO_DATA_LANG_DEFAULT, $lang=DEDALO_DATA_LANG) {

		if (empty($dato_full_json)) {
			return null;
		}

		# decoded_obj . Unify received 'dato_full_json' in object format
		if (is_object($dato_full_json)) {
			$decoded_obj = $dato_full_json;
		}else{
			if (!$decoded_obj = json_decode($dato_full_json)) {
				debug_log(__METHOD__." Error on decode dato_full_json: ".to_string($dato_full_json), logger::ERROR);
				return $dato_full_json;
			}
		}

		# Declare as false
		$is_fallback  = false;

		# Try directe value
		$value	= isset($decoded_obj->$lang) ? $decoded_obj->$lang : null;


		if (empty($value)) {

			# Try main lang. (Used config DEDALO_DATA_LANG_DEFAULT as main_lang)
			if ($lang!==$main_lang) {
				$value = isset($decoded_obj->$main_lang) ? $decoded_obj->$main_lang : null;
			}

			# Try nolan
			if (empty($value)) {
				$nolan_lang = DEDALO_DATA_NOLAN;
				$value = isset($decoded_obj->$nolan_lang) ? $decoded_obj->$nolan_lang : null;
			}

			# Try all projects langs sequence
			if (empty($value)) {
				$data_langs = common::get_ar_all_langs(); # Langs from config projects
				foreach ($data_langs as $current_lang) {
					if ($current_lang===$lang || $current_lang===$main_lang) {
						continue; // Already checked
					}
					$value = isset($decoded_obj->$current_lang) ? $decoded_obj->$current_lang : null;
					if (!empty($value)) break; # Stops when first data is found
				}
			}

			# Set as fallback value
			$is_fallback = true;
		}


		/* OLD WAY
		$default_lang 	= DEDALO_DATA_LANG_DEFAULT; //DEDALO_APPLICATION_LANGS_DEFAULT;
		$is_fallback	= false;
		if (!empty($decoded_obj->$current_lang)) {
			// Current lang
			$value = $decoded_obj->$current_lang;
		}else{
			// Fallbacks
			if($current_lang!==DEDALO_APPLICATION_LANGS_DEFAULT && !empty($decoded_obj->$default_lang)) {
				$value = $decoded_obj->$default_lang;
				$is_fallback = true;
			}else{
				if (!is_object($decoded_obj)) {
					$value = $decoded_obj;
				}else{
					// Select the first not empty
					foreach ($decoded_obj as $c_lang => $c_value) {
						if (!empty($c_value)) {
							$value = $c_value;
							$is_fallback = true;
							break;
						}
					}
				}
			}
		}
		*/

		// Flat possible array values to string
		$value = to_string($value);

		if ($is_fallback===true && $decore_untranslated===true) {
			$value = self::decore_untranslated($value);
		}

		return $value;
	}//end get_value_with_fallback_from_dato_full



	/**
	* GET_DATAFRAME
	* @return (object)dataframe
	*/
	public function get_dataframe() {

		if(!isset($this->dataframe)) {
			# MATRIX DATA : Load matrix data
			$this->load_component_dataframe();
		}

		return $this->dataframe;
	}//end get_dataframe



	/**
	* UPDATE_DATAFRAME_ELEMENT
	* Is one at one
	* Updates component dataframe locator. Can add, update existing or delete locator in dataframe container
	* @param object | array | null $locator optional (is not required to delete element)
	*	Locator can be a locator object or a array of one locator object
	*	If locator is null, then existing element with $from_key and $type will be deleted
	* @param string $from_key
	*	Key that point current dataframe_element
	* @param string $type
	*	Type of dataframe element (encoded type of uncertainty, time, space, etc.)
	* @return bool
	*/
	public function update_dataframe_element( $locator=null, $from_key=null, $type=null ) {

		$current_dataframe 	= (array)$this->get_dataframe();
		$final_dataframe 	= array();

		# Generate a new array with all other locators (differents to current requested $from_key, $type)
		# This removes previous element
		foreach ((array)$current_dataframe as $key => $current_locator) {

			if( !is_object($current_locator) ){
				debug_log(__METHOD__." Bad type of locator [1]. Skipped. gettype:".gettype($current_locator).", component tipo:$this->tipo, locator: ".to_string($current_locator), logger::DEBUG);
				continue;
			}

			if ($current_locator->from_key!=$from_key && $current_locator->type!=$type) {
				$final_dataframe[] = $current_locator;
			}
		}

		# If no empty locator add element
		if (!empty($locator)) {
			if (is_array($locator)) {
				$locator = reset($locator);
			}
			if( !is_object($locator) ){
				debug_log(__METHOD__." Bad type of locator [2]. Skipped. gettype:".gettype($locator).", component tipo:$this->tipo, locator: ".to_string($locator), logger::DEBUG);
			}else{
				$final_dataframe[] = $locator;
			}
		}

		# Set component dataframe
		$this->dataframe = $final_dataframe;
		debug_log(__METHOD__." final_dataframe ".to_string($final_dataframe)  , logger::DEBUG);

		return true;
	}//end update_dataframe_element



	/**
	* LOAD_COMPONENT_DATAFRAME
	* set the dataframe with the information of the database
	* it call to the section for get the full component data and select you own part.
	* the dataframe is a array of objects (dataframes):
	* every object (dataframe) normally will be a locator with the dataframe section that define the frame of the data
	* with the "type" key that say the diferents dataframes of the dato
	* dataframe for certainty 	- dd558	-	DEDALO_DATAFRAME_TYPE_UNCERTAINTY
	* dataframe for time 		- dd559	-	DEDALO_DATAFRAME_TYPE_TIME
	* dataframe for space 		- dd560	-	DEDALO_DATAFRAME_TYPE_SPACE
	* the locator can has the "from_key" that reference to the key of the dato array that this dataframe affect or will be apply, search, etc
	*/
	public function load_component_dataframe() {

		if( empty($this->parent) || $this->modo==='dummy' || $this->modo==='search') {
			return null;
		}

		#if( $this->bl_loaded_matrix_data!==true ) {

			if (empty($this->section_tipo)) {
				if(SHOW_DEBUG===true) {
					$msg = " Error Processing Request. section tipo not found for component $this->tipo";
					#throw new Exception("$msg", 1);
					debug_log(__METHOD__.$msg);
				}
			}
			$section = section::get_instance($this->parent, $this->section_tipo);

			# Fix dataframe
			$component_data 	= $section->get_all_component_data($this->tipo);
			if (isset($component_data->dataframe)) {
				$this->dataframe 	= (array)$component_data->dataframe;
			}else{
				$this->dataframe 	= array();
			}


			# Set as loaded
			$this->bl_loaded_matrix_data = true;
		#}
	}//end load_component_dataframe



	/**
	* GET_COMPONENT_PERMISSIONS
	* @return int $this->permissions
	*/
	public function get_component_permissions() {

		if (isset($this->permissions)) {
			return $this->permissions;
		}

		if ($this->modo==='search') {

			if ( $this->section_tipo===DEDALO_THESAURUS_SECTION_TIPO ) {

				$this->permissions = 2; // Allow all users to search in thesaurus

			}elseif ( true===in_array($this->tipo, section::get_modified_section_tipos_basic()) ) {

				$this->permissions = 2; // Allow all users to search with section info components

			}else{

				$this->permissions = common::get_permissions($this->section_tipo, $this->tipo);
			}

		}else{

			$this->permissions = common::get_permissions($this->section_tipo, $this->tipo);
		}


		return $this->permissions;
	}//end get_component_permissions



	################################## SEARCH 2 ########################################################



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
			$options->section_tipo		= null;
			$options->add_filter		= true;
			$options->tipo				= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$id 			  = $options->id;
		$logical_operator = $options->logical_operator;
		$tipo 			  = $options->tipo;
		# Default from options
		$section_tipo = $options->section_tipo;

		# Defaults
		$filter_group = null;
		$select_group = array();

		$RecordObj_dd_component_tipo = new RecordObj_dd($tipo);
		$component_tipo_properties 	= $RecordObj_dd_component_tipo->get_propiedades(true);

		// source. get the properties of the component to get the section_tipo and components to search if no defined get it of the relation_terms of the component
			if(isset($component_tipo_properties->source->search)){
				// properties terms (new way)
				$source_search = $component_tipo_properties->source->search;
				$ar_terminos_relacionados = [];
				foreach ($source_search as $current_search) {
					if ($current_search->type === 'internal'){

						// components_skip_search_only_v5
						$components_skip_search_only_v5 = $current_search->components_skip_search_only_v5;

						$ar_related_section_tipo[] 	= $current_search->section_tipo;
						foreach ($current_search->components as $cs_tipo) {
							// if (isset($components_skip_search_only_v5) && in_array($cs_tipo, $components_skip_search_only_v5)) {
							// 	continue;
							// }
							$ar_terminos_relacionados[] = $cs_tipo;
						}
					}
				}
			}else{
				// structure related terms (legacy)
				$ar_related_section_tipo  = common::get_ar_related_by_model('section', $tipo);
				$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($tipo, true, true);
			}

		if (isset($ar_related_section_tipo[0])) {

			// Create from related terms
				$section_tipo = reset($ar_related_section_tipo); // Note override section_tipo here !
				foreach ($ar_terminos_relacionados as $current_tipo) {
					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo, true);
					if (strpos($modelo_name,'component')!==0) continue;

					$path = search_development2::get_query_path($current_tipo, $section_tipo);
						#dump($path, ' path ++ current_tipo:'.$current_tipo.' - section_tipo:'.to_string($section_tipo));


					# FILTER . filter_element (operator_group)
						if ($options->add_filter===true) {

							// remove some elements only from filter, not for show
							if (isset($components_skip_search_only_v5) && in_array($current_tipo, $components_skip_search_only_v5)) {
								// skip
							}else{
								$filter_element = new stdClass();
									$filter_element->q 		= $options->q;
									$filter_element->lang 	= $options->lang;
									$filter_element->path 	= $path;

								if(!isset($filter_group)) {
									$filter_group = new stdClass();
								}
								$filter_group->$logical_operator[] = $filter_element;
							}
						}
					# SELECT . Select_element (select_group)
						# Add options lang
						$end_path = end($path);
						$end_path->lang = $options->lang;

						$select_element = new stdClass();
							$select_element->path = $path;

						$select_group[] = $select_element;
				}
		}else{
			if($options->add_filter === true){

				$path = search_development2::get_query_path($tipo, $section_tipo);

				$filter_element = new stdClass();
					$filter_element->q 	 			= $options->q ;
					$filter_element->q_operator  	= $options->q_operator ;
					$filter_element->q_split 		= $options->q_split;
					$filter_element->lang 			= $options->lang;
					$filter_element->path			= $path;

				$filter_group = new stdClass();
					$filter_group->$logical_operator = [$filter_element];
			}
			$select_group_element = new stdClass();
				$select_group_element->path = $path;

			$select_group = [$select_group_element];
		}

		$query_object = new stdClass();
			$query_object->id  	   		= $id;
			$query_object->section_tipo = $section_tipo;
			$query_object->filter  		= $filter_group;
			$query_object->select  		= $select_group;
			$query_object->limit   		= $options->limit;
			$query_object->offset  		= $options->offset;


		return (object)$query_object;
	}//end build_search_query_object



	/**
	* GET_SEARCH_QUERY2
	* @return array $ar_query_object
	*/
	public static function get_search_query2( $query_object ) {

		# Example
			# {
			#   "q": "pepe",
			#   "lang": "lg-spa",
			#   "path": [
			#     {
			#       "section_tipo": "oh1",
			#       "component_tipo": "oh24",
			#       "target_section": "rsc197"
			#     },
			#     {
			#       "section_tipo": "rsc197",
			#       "component_tipo": "rsc453"
			#     }
			#   ],
			#   "component_path": [
			#     "dato"
			#   ]
			# }

		# Empty q case
		#if (empty($query_object->q)) {
			#return array();
		#}

		$component_tipo = end($query_object->path)->component_tipo;

		# component path default
		$query_object->component_path = ['components',$component_tipo,'dato'];
		# component lang
		if (!isset($query_object->lang)) {
			# default
			$query_object->lang = 'all';
		}

		# Component class name calling here
		$called_class = get_called_class();

		# split multiple (true by default)
		$q_split = isset($query_object->q_split) ? (bool)$query_object->q_split : true;
		if ($q_split===false) {
			# With query_object property 'q_split' as false (autocomplete_hi)
			$current_query_object = $query_object;
		}else{
			# Default mode
			$current_query_object = component_common::split_query($query_object);
		}

		# conform each object
		if (search_development2::is_search_operator($current_query_object)===true) {
			foreach ($current_query_object as $operator => $ar_elements) {
				foreach ($ar_elements as $c_query_object) {
					// Inject all resolved query objects
					$c_query_object = $called_class::resolve_query_object_sql($c_query_object);
				}
			}
		}else{
			$current_query_object = $called_class::resolve_query_object_sql($current_query_object);
		}

		# Convert to array always
		$ar_query_object = is_array($current_query_object) ? $current_query_object : array($current_query_object);

		return $ar_query_object;
	}//end get_search_query2



	/**
	* GET_SELECT_QUERY2
	* @return
	*/
	public static function get_select_query2($select_object) {

		/*
		[path] => Array
			(
				[0] => stdClass Object
					(
						[name] => Título
						[modelo] => component_input_text
						[section_tipo] => numisdata224
						[component_tipo] => numisdata231
					)

			)

		[lang] => lg-spa
		*/
		#$selector = isset($select_object->selector) ? $select_object->selector : 'valor_list';


		# component path is not calculated
		if(!isset($select_object->component_path)) {

			$end_path 		= end($select_object->path);
			$component_tipo = $end_path->component_tipo;

			if (isset($end_path->selector)) {
				$selector = $end_path->selector;
			}else{
				$selector = 'valor_list';
			}

			if (isset($end_path->lang) && $end_path->lang==='all') {
	      		$select_object->component_path = ['components',$component_tipo,$selector];
	      	}else{

		      	if (isset($end_path->lang)) {
					$lang = $end_path->lang;
				}else{
					$RecordObj_dd = new RecordObj_dd($component_tipo);
					$traducible   = $RecordObj_dd->get_traducible();
					if ($traducible!=='si') {
						$default_lang = DEDALO_DATA_NOLAN;
					}else{
						$default_lang = DEDALO_DATA_LANG;
					}
					$lang = $default_lang;
				}

				# Set default
				$select_object->component_path = ['components',$component_tipo,$selector,$lang];
	      	}
		}

		if(!isset($select_object->type)) {
			$select_object->type = 'string';
		}


		return $select_object;
	}//end get_select_query2



	/**
	* SPLIT_QUERY
	* @param object $query_object
	* @return array $ar_query_object
	*/
	public static function split_query($query_object) {

		$search_value = $query_object->q;

		# For unification, all non string are json encoded
		# This allow accept mixed values (encoded and no encoded)
		if (!is_string($search_value)) {
			$search_value = json_encode($search_value);
		}

		$operator_between = '$or';	// default (!)

		# JSON CASE
		if ($json_value = json_decode($search_value)) {
			if (is_array($json_value) && count($json_value)>1) {
				$group = new stdClass();
					$name = $operator_between;
					$group->$name = [];
				foreach ($json_value as $current_value) {
					$current_value 			= array($current_value);
					$query_object->type 	= 'jsonb';
					$query_object_clon 		= clone($query_object);
					$query_object_clon->q 	= json_encode($current_value);
					$group->$name[] 		= $query_object_clon;
				}
				$ar_query_object = $group;
			}else{
				$query_object->type = 'jsonb';
				$ar_query_object 	= $query_object;
			}

		# STRING CASE
		}else{

			$operator_between = '$and'; // only when is string

			# \S?"([^\"]+)"|\S?'([^\']+)'|[^\s]+
			$pattern = '/\S?"([^\"]+)"|\S?\'([^\\\']+)\'|[^\s]+/iu';
			preg_match_all($pattern, $search_value, $matches);

			# split into searchable units
			$total_count = count($matches[0]);
			if ($total_count===1) {

				$current_search_value = reset($matches[0]);

				$query_object->q = self::remove_first_and_last_quotes($current_search_value);
				$ar_query_object = $query_object;

			}else{

				$group = new stdClass();
					$name = $operator_between;
					$group->$name = [];

				foreach ($matches[0] as $key => $current_search_value) {

					$query_object_clon 		= clone($query_object);
					$query_object_clon->q 	= self::remove_first_and_last_quotes($current_search_value);
					$group->$name[] 		= $query_object_clon;

				}//end foreach ($matches[0] as $key => $value)

				$ar_query_object = $group;

			}//end if ($total_count===1) {
		}

		return $ar_query_object;
	}//end split_query



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() {

		$ar_operators = [
			#'=' 	=> 'igual'
		];

		return $ar_operators;
	}//end search_operators_info



	/**
	* REMOVE_FIRST_AND_LAST_QUOTES
	* Removes first and last quotes (single or doubles) respecting existing operators
	* @return string $string
	*/
	public static function remove_first_and_last_quotes($string) {

		$first_2char 	= mb_substr($string, 0, 2);
		$ar_operators 	= ['!=','>=','<='];
		if (in_array($first_2char, $ar_operators)) {

			$op = $first_2char;
			$current_string = mb_substr($string, 2);
			#$current_string = trim($current_string,'"\'');
			$current_string = trim($current_string,'"');

			$string = $op . $current_string;

			return $string;
		}

		$first_char 	= mb_substr($string, 0, 1);
		$ar_operators 	= ['+','-','=','*','>','<'];
		if (in_array($first_char, $ar_operators)) {

			$op = $first_char;
			$current_string = mb_substr($string, 1);
			#$current_string = trim($current_string,'"\'');
			$current_string = trim($current_string,'"');

			$string = $op . $current_string;

			return $string;
		}

		#$string = trim($string,'"\'');
		$string = trim($string,'"');

		return $string;
	}//end remove_first_and_last_quotes



	/**
	* AUTOCOMPLETE_SEARCH
	* Generic autocomplete search (override when need different way)
	* Get a formed search_query_object, exec the search and return an array of formated results
	* @return array $ar_result
	*/
	public function autocomplete_search($search_query_object, $divisor=', ') {

		// Set defaults for resolve row additions
			$components_with_relations 	= component_relation_common::get_components_with_relations();
			$propiedades 	 			= $this->get_propiedades();
			$show_parent_name_default 	= get_called_class()==='component_autocomplete_hi' ? true : false;
			$show_parent_name 			= isset($propiedades->show_parent_name) ? (bool)$propiedades->show_parent_name : $show_parent_name_default;
			$search_list_add 			= isset($propiedades->search_list_add) ? (array)$propiedades->search_list_add : false;
			#$show_childrens 			= isset($propiedades->show_childrens) ? (bool)$propiedades->show_childrens : false;

		#// Search filter custom
		#	if (isset($propiedades->source->filter_custom)) {
		#		$op = '$and';
		#		foreach ($propiedades->source->filter_custom as $key => $filter_element) {
		#			$search_query_object->filter->{$op}[] = $filter_element;
		#		}
		#	}

		// Search filter custom (properties)
			if (isset($propiedades->source->filter_custom)) {

				// Build custom filter from propiedades
					$op = '$and';
					$filter_custom = new stdClass();
					foreach ($propiedades->source->filter_custom as $key => $filter_element) {
						$filter_custom->{$op}[] = $filter_element;
					}

				// Add user filter inside
					$filter_custom->{$op}[] = $search_query_object->filter;

				// Replace final filter
					$search_query_object->filter = $filter_custom;
			}

		// Conform search query object with some modifiers
			# Remove option of sub_select_by_id (not work on left joins)
			$search_query_object->allow_sub_select_by_id = false;

			# Avoid auto add filter by user projects in search
			if (!property_exists($search_query_object,'skip_projects_filter')) {
				$search_query_object->skip_projects_filter 	= true;
			}

		// Exec search
			$search_development2 = new search_development2($search_query_object);
			$rows_data 		 	 = $search_development2->search();
			$ar_records 		 = $rows_data->ar_records;

		// debug
			if(SHOW_DEBUG===true) {
				// debug_log(__METHOD__." search_query_object - modo:$this->modo - ".json_encode($search_query_object, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), logger::DEBUG);
				// debug_log(__METHOD__." rows_data->strQuery ".to_string($rows_data->strQuery), logger::DEBUG);
			}

		// childrens addition optional
			// see self add_childrens

		// Iterate rows to conform as final array result. ar_result is array of objects
			$ar_result = [];
			foreach ($ar_records as $key => $row) {

				// Locator build
					$locator = new locator();
						$locator->set_section_tipo($row->section_tipo);
						$locator->set_section_id($row->section_id);
						$locator->set_type(DEDALO_RELATION_TYPE_LINK);
						$locator->set_from_component_tipo($this->tipo);

					$locator_json = json_encode($locator);

				// Join all fields except 2 first fixed (section_id, section_tipo)
					$ar_full_label  = [];
					$ar_original 	= [];
					foreach ($row as $key => $value) {
						if ($key==='section_id' || $key==='section_tipo' || empty($value)) continue;

						// Resolve indirect values and exec fallback lang when empty
							$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($key,true);
							switch (true) {
								case $modelo_name==='component_text_area':
									// Resolve value with component
									$value = $modelo_name::render_list_value($value, $key, $row->section_id, 'list', $this->lang, $row->section_tipo, $row->section_id, null, null);
									break;
								case in_array($modelo_name, $components_with_relations):
									// Resolve value from locator
									$value_locators = json_decode($value);
									if (isset($value_locators[0])) {
										$value = component_relation_common::get_locator_value($value_locators[0], $this->lang, false, false, ', ');
									}else{
										continue 2; # Skip empty array
									}
									break;
								default:
									// Extract value from row data
									$value = component_common::get_value_with_fallback_from_dato_full($value, $mark=false, DEDALO_DATA_LANG_DEFAULT, $this->lang);
									break;
							}

						// Skip still empty values
							if (empty($value)) continue;

						// Format the value
							if (is_string($value)) {
								$value = strip_tags($value);
							}else{
								$value = to_string($value); //gettype($value);
							}

						// Add value
							$ar_full_label[] = $value;
							$ar_original[] 	 = $value;
					}//end foreach ($row as $key => $value)

				// Show_parent_name (propiedades). Parent locator is always calculated and is not in current record (data is as locator children in parent record)
					if($show_parent_name===true) {
						// Directly, with recursive options true
						// $locator, $lang=DEDALO_DATA_LANG, $show_parents=false, $ar_componets_related=false, $divisor=', ', $include_self=true
						$parents_value = component_relation_common::get_locator_value($locator, $this->lang, true, false, ', ', false);
						if (!empty($parents_value)) {
							// Add value
							$ar_full_label[] = strip_tags($parents_value);
						}
					}//end if($show_parent_name===true)/**/

				// Search_list_add (propiedades). Add custom resolved values from same section. For example, add municipality for resolve an ambiguous name
					if ($search_list_add!==false) {
						$ar_dd_value = [];
						foreach ($search_list_add as $add_tipo) {
							$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($add_tipo,true);
							$component 		= component_common::get_instance($modelo_name,
																			 $add_tipo,
																			 $row->section_id,
																			 'list',
																			 $this->lang,
																			 $row->section_tipo);
							$current_value = strip_tags( $component->get_valor($this->lang) );
							if (!empty($current_value)) {
								// Add value
								$ar_full_label[] = $current_value;
							}
						}
					}//end if ($search_list_add!==false)

				// Debug added
					if(SHOW_DEBUG===true) {
						$ar_full_label[] = '['.$row->section_tipo.'_'.$row->section_id.']';
					}

				// Final value
					$label 	  = implode($divisor, $ar_full_label);
					$original = implode(', ', $ar_original);

					$value_obj = new stdClass();
						$value_obj->value = $original;
						$value_obj->label = $label;
						$value_obj->key   = $locator_json;

					$ar_result[] = $value_obj;

			}//end foreach ($ar_records as $key => $row)
			#debug_log(__METHOD__." ar_result ".to_string($ar_result), logger::DEBUG);


		return (array)$ar_result;
	}//end autocomplete_search



	/**
	* ADD_CHILDRENS
	* @return array $ar_records_edit
	*/
	public static function add_childrens($ar_records, $recursive=true) {

		// Fields
		$fields = [];
		foreach ($ar_records[0] as $property => $rvalue) {
			if ($property==='section_tipo' || $property==='section_id') continue;
			$fields[] = $property;
		}

		$ar_records_edit = [];
		foreach ($ar_records as $key => $value) {
			// add self
			$ar_records_edit[] = $value;
			# get_childrens($section_id, $section_tipo, $component_tipo=null, bool $recursive=true)
			$ar_childres = component_relation_children::get_childrens($value->section_id, $value->section_tipo, null, $recursive);
			#dump($ar_childres, ' ar_childres ++ '.to_string());
			foreach ($ar_childres as $ch_key => $ch_value) {

				$finded = array_filter(
					$ar_records_edit,
					function ($e) use ($ch_value) {
						return $e->section_section_tipo === $ch_value->section_section_tipo && $e->section_id == $ch_value->section_id;
					}
				);
				if (!empty($finded)) {
					continue; // Skip already existing items
				}

				$item = new stdClass();
					$item->section_id 	= $ch_value->section_id;
					$item->section_tipo = $ch_value->section_tipo;

				foreach ($fields as $field_tipo) {
					$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($field_tipo,true);
					$component 		= component_common::get_instance($modelo_name,
																	 $field_tipo,
																	 $ch_value->section_id,
																	 'list',
																	 DEDALO_DATA_LANG,
																	 $ch_value->section_tipo);
					$dato = $component->get_dato_full();
					$item->{$field_tipo} = json_encode($dato);
				}
				$ar_records_edit[] = $item;
			}
		}
		dump($ar_records, ' ar_records ++ '.to_string());
		dump($ar_records_edit, ' ar_records_edit ++ '.to_string());


		return $ar_records_edit;
	}//end add_childrens







	################################## //end SEARCH 2 ########################################################



	/**
	* GET_DEF
	* Get componet structure definition 'def' if exists. Used in component label
	* @see component_common_draw::draw_label()
	* @return string $def
	*/
	public function get_def($lang=DEDALO_APPLICATION_LANG) {

		// DES
			// if (isset($this->def)) {
			// 	$def = $this->def;
			// }else{
			// 	$def = RecordObj_dd::get_def_by_tipo($this->tipo, $lang);
			// }

		$def = null;

		return $def;
	}//end get_def



	/**
	* GET_MY_SECTION
	* @return
	*/
	public function get_my_section() {

		return section::get_instance($this->parent, $this->section_tipo);
	}//end get_my_section



	/**
	* UNIQUE_SERVER_CHECK
	* @return bool
	*/
	public function unique_server_check($dato){

		$options = new stdClass();
			$options->q 	 			= '='.$dato;
			$options->q_operator		= '';
			$options->q_split 			= false;
			$options->section_tipo		= $this->get_section_tipo();
			$options->component_name 	= $this->get_component_name();
			$options->tipo				= $this->get_tipo();
			$options->name 				= $this->get_label();
			$options->limit  			= 1;
			$options->logical_operator 	= '$or';

		$search_query_object = self::build_search_query_object($options);

		$search_development2 = new search_development2($search_query_object);
		$response = $search_development2->search();

		$result = (count($response->ar_records)>0) ?  false : true;

		return $result;
	}//end unique_server_check



	/**
	* GET_CALCULATION_DATA
	* @return $data
	* get the data of the component for do a calculation
	*/
	public function get_calculation_data($options = null){

		$data = $this->get_valor();

		return $data;
	}//end get_calculation_data



	/**
	* GET_CERTAINTY
	* @return (array)$certainty
	* select the certainty of the dataframe
	*//*
	public function get_certainty() {

		$dataframe 		= (array)$this->get_dataframe();
		$ar_certainty 	= array();
		foreach ($dataframe as $frame_obj) {
			if($frame_obj->type === DEDALO_DATAFRAME_TYPE_UNCERTAINTY) {
				$ar_certainty[] = $frame_obj;
			}
		}

		return $ar_certainty;
	}//end get_certainty*/



	/**
	* PARSE_STATS_VALUES
	* @return array $ar_clean
	*/
	public static function parse_stats_values($tipo, $section_tipo, $propiedades, $lang=DEDALO_DATA_LANG, $selector='valor_list') {

		if (isset($propiedades->valor_arguments)) {
			$selector = 'dato';
		}

		// Search
			if (isset($propiedades->stats_look_at)) {
				$related_tipo = reset($propiedades->stats_look_at);
			}else{
				$related_tipo = false; //$current_column_tipo;
			}
			$path 		= search_development2::get_query_path($tipo, $section_tipo, true, $related_tipo);
			$end_path 	= end($path);
			$end_path->selector = $selector;

			$search_query_object = '{
			  "section_tipo": "'.$section_tipo.'",
			  "allow_sub_select_by_id": false,
			  "remove_distinct": true,
			  "limit": 0,
			  "select": [
			    {
			      "path": '.json_encode($path).'
			    }
			  ]
			}';
			#dump($search_query_object, ' search_query_object ** ++ '.to_string());
			$search_query_object = json_decode($search_query_object);
			$search_development2 = new search_development2($search_query_object);
			$result 			 = $search_development2->search();
			#dump($result, ' result ** ++ '.to_string());

		// Parse results for stats
			$ar_clean = [];
	        foreach ($result->ar_records as $key => $item) {

	        	$value = end($item);

	        	// Override label with custom component parse
	        		if (isset($propiedades->valor_arguments)) {
	        			$c_component_tipo = isset($propiedades->stats_look_at) ? reset($propiedades->stats_look_at) : $tipo;
						$modelo_name 	  = RecordObj_dd::get_modelo_name_by_tipo($c_component_tipo, true);
						$value 		 	  = $modelo_name::get_stats_value_with_valor_arguments($value, $propiedades->valor_arguments);
					}

	        	$label = strip_tags(trim($value));
	        	$uid   = $label;

				if(!isset($ar_clean[$uid])){
					$ar_clean[$uid] = new stdClass();
					$ar_clean[$uid]->count = 0;
					$ar_clean[$uid]->tipo  = $tipo;
				}

				$ar_clean[$uid]->count++;
				$ar_clean[$uid]->value = $label;

			}
			#dump($ar_clean, ' ar_clean ++ ** '.to_string());


		return $ar_clean;
	}//end parse_stats_values



	/**
	* GET_SECTION_ID
	* Alias of get_parent()
	* @return int
	*/
	public function get_section_id() {

		return $this->get_parent();
	}//end get_section_id



}//end class
?>
