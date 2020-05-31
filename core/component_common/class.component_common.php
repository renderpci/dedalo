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
		protected $section_id;				# int parent section_id
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

		# diffusion_properties
		public $diffusion_properties;

		# update_diffusion_info_propagate_changes bool
		# To optimize save process in scripts of importation, you can dissable (false) this option if is not really necessary
		public $update_diffusion_info_propagate_changes;

		# Component definition. Used in component label
		public $def;

		// changed_data . Fixed when DD_API save call to component update_data_value()
		public $changed_data;

		// matrix_id
		public $matrix_id;



	/**
	* GET_INSTANCE
	* Singleton pattern
	* @returns array array of component objects by key
	*/
	public static function get_instance($component_name=null, $tipo, $section_id=null, $modo='edit', $lang=DEDALO_DATA_LANG, $section_tipo=null, $cache=true) {

		// tipo check. Is mandatory
			if (empty($tipo)) {
				throw new Exception("Error: on construct component : tipo is mandatory. tipo:$tipo, section_id:$section_id, modo:$modo, lanfg:$lang", 1);
			}

		// model check. Verify 'component_name' and 'tipo' are correct
			$model_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			if (empty($component_name)) {

				// calculate component name (is ontology elemnent model)
					$component_name = RecordObj_dd::get_modelo_name_by_tipo($tipo, true);

			}else if (!empty($component_name) && $model_name!==$component_name) {

				// warn to admin
					$msg = "Warning. Fixed inconsistency in component get_instance tipo:'$tipo'. Expected model is '$model_name' and received model is '$component_name'";
					debug_log(__METHOD__.' '. $msg, logger::ERROR);

				// fix bad model
					$component_name = $model_name;
			}
			if (strpos($component_name, 'component_')!==0) {
				if(SHOW_DEBUG===true) {
					throw new Exception("Error Processing Request. Ilegal component: '$component_name' on ".__METHOD__, 1);
				}
				return null;
			}

		// section_tipo check : optional (if empty, section_tipo is calculated from: 1. page globals, 2. structure -only useful for real sections-)
			if (empty($section_tipo)) {
				// $section_tipo = component_common::resolve_section_tipo($tipo);
				// debug_log(__METHOD__." Called component without section tipo ".to_string($tipo), logger::DEBUG);
				trigger_error("Sorry. resolve_section_tipo is not supported anymore. Please fix this call ASASP");
				if(SHOW_DEBUG===true) {
					dump($section_tipo, ' DEBUG WARNING: TRIGGERED resolve_section_tipo from: '.to_string($tipo));
					$bt = debug_backtrace();
					debug_log(__METHOD__." DEBUG WARNING: TRIGGERED resolve_section_tipo: bt : ".to_string($bt), logger::ERROR);
				}
				return null;
			}

		// debug verifications
			if(SHOW_DEBUG===true) {
				// model received check
					if ( !empty($component_name) && strpos($component_name, 'component_')===false ) {
						dump($tipo," tipo");
						throw new Exception("Error Processing Request. section or ($component_name) intented to load as component", 1);
					}
				// tipo format check
					if ( is_numeric($tipo) || !is_string($tipo) || !RecordObj_dd::get_prefix_from_tipo($tipo) ) {
						dump($tipo," tipo");
						throw new Exception("Error Processing Request. trying to use wrong var: '$tipo' as tipo to load as component", 1);
					}
				// section_id format check
					if ( (!empty($section_id)
						 && ( (!is_numeric($section_id) || abs($section_id)<1)) && strpos($section_id, DEDALO_SECTION_ID_TEMP)===false) )
						{
						dump($section_id," section_id - DEDALO_SECTION_ID_TEMP:".DEDALO_SECTION_ID_TEMP);
						throw new Exception("Error Processing Request. trying to use wrong var: '$section_id' as section_id to load as component", 1);
					}
					if (is_array($section_id)) {
						trigger_error("Error: section_id is array!");
						$bt = debug_backtrace();
						debug_log(__METHOD__." Error: section_id is array! : ".to_string($bt), logger::ERROR);
					}
				// modo (mode) validation
					$ar_valid_modo = array('edit','list','search','simple','tm','tool_portal','tool_lang','edit_tool','indexation','selected_fragment','tool_indexation','tool_transcription','print','edit_component','load_tr','update','portal_list','list_thesaurus','portal_list_view_mosaic','edit_in_list','edit_note','tool_structuration','dataframe_edit','tool_description','view_tool_description','player','json');
					if ( empty($modo) || !in_array($modo, $ar_valid_modo) ) {
						if(SHOW_DEBUG===true) {
							throw new Exception("Error Processing Request. trying to use wrong var: '$modo' as modo to load as component", 1);	;
						}
						debug_log(__METHOD__." trying to use empty or invalid modo: '$modo' as modo to load component $tipo. modo: ".to_string($modo), logger::DEBUG);
					}
				// lang format check
					if ( empty($lang) || strpos($lang, 'lg-')===false ) {
						dump($lang," lang");
						throw new Exception("Error Processing Request. trying to use wrong var: '$lang' as lang to load as component", 1);
					}
				// section_tipo format check
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
			}//end if(SHOW_DEBUG===true)

		// no cache. Direct construct without cache instance. Use this config in imports
			if ($cache===false) {
				return new $component_name($tipo, $section_id, $modo, $lang, $section_tipo);
			}

		static $ar_component_instances;

		# key for cache
		$key = $tipo .'_'. $section_tipo .'_'. $section_id .'_'. $lang;

		$max_cache_instances = 160; // 500
		$cache_slice_on 	 = 40; // 200 //$max_cache_instances/2;

		// overload : If ar_component_instances > 99 , not add current element to cache to avoid overload
			if ( isset($ar_component_instances) && count($ar_component_instances)>$max_cache_instances ) {
				$ar_component_instances = array_slice($ar_component_instances, $cache_slice_on, null, true);
				if(SHOW_DEBUG===true) {
					#debug_log(__METHOD__." Overload components prevent. Unset first cache item [$key]");
				}
			}

		// cache instances. Find current instance in cache
			if ( !isset($ar_component_instances) || !array_key_exists($key, $ar_component_instances) ) {

				// __CONSTRUCT : Store new component in static array var
					$ar_component_instances[$key] = new $component_name($tipo, $section_id, $modo, $lang, $section_tipo);

			}else{

				// Change modo if need
					if ($ar_component_instances[$key]->get_modo()!==$modo) {
						$ar_component_instances[$key]->set_modo($modo);
					}
			}

		// debug
			if(SHOW_DEBUG===true) {
				// # Verify 'component_name' and 'tipo' are correct
				// $modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
				// if (!empty($component_name) && $component_name!==$modelo_name) {
				// 	$msg = "Error Processing Request. Inconsistency detected and fixed with get_instance 'tipo' ($tipo). Expected model is ($modelo_name) and received model is ($component_name)";
				// 	#throw new Exception($msg, 1);
				// 	debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
				// }
			}


		return $ar_component_instances[$key];
	}//end get_instance



	/**
	* __CONSTRUCT
	*/
	public function __construct($tipo=NULL, $section_id=NULL, $modo='edit', $lang=DEDALO_DATA_LANG, $section_tipo=null) {

		// tipo
			if ( empty($tipo) ) {
				$msg = "Component common: valid 'tipo' value is mandatory!";
				$GLOBALS['log_messages'][] = $msg;
				throw new Exception($msg, 1);
			}elseif ($tipo==='dummy') {
				throw new Exception("Error dummy caller!!", 1);
			}
			$this->tipo = $tipo;

		// $section_id
			$this->parent 		= $section_id;
			$this->section_id 	= $section_id;

		// modo
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

		// lang
			if(isset($this->lang)) {
				# LANG : Overwrite var '$lang' with previous component declatarion of '$this->lang'
				$lang = $this->lang;
			}elseif ( empty($lang) ) {
				$msg = __METHOD__.' Valid \'lang\' value is mandatory! ('.$tipo.' - '.get_called_class().') Default DEDALO_DATA_LANG ('.DEDALO_DATA_LANG.') is used';
				$GLOBALS['log_messages'][] = $msg;
				trigger_error($msg);
				$lang = DEDALO_DATA_LANG;
			}
			$this->lang = $lang;

		// section_tipo
			if (empty($section_tipo)) {
				// # section_tipo : optional (if empty, section_tipo is calculated from: 1. page globals, 2. structure -only useful for real sections-)
				// $section_tipo = component_common::resolve_section_tipo($tipo);
				// debug_log(__METHOD__." Calculated section tipo from tipo ($tipo) !!!!!! Fix ASAP ".to_string(), logger::ERROR);
				throw new Exception("Error Processing Request. section_tipo is mandatory !", 1);
			}
			$this->section_tipo = $section_tipo;

		// structure data
		// Fijamos el tipo recibido y cargamos la estructura previamente para despejar si este tipo es traducible o no
		// y fijar de nuevo el lenguaje en caso de no ser traducible
			parent::load_structure_data();

		// lang : Check lang again after structure data is loaded
		// Establecemos el lenguaje preliminar a partir de la carga de la estructura
			if ($this->traducible==='no') {
				$propiedades = $this->get_propiedades();
				if (isset($propiedades->with_lang_versions) && $propiedades->with_lang_versions===true) {
					# Allow tool lang on non translatable components
				}else{
					# Force nolan
					$this->lang = DEDALO_DATA_NOLAN;
				}
			}

		// ar_tools_obj reset
			$this->ar_tools_obj = false;

		// debug set base info
			$this->debugger = "tipo:$this->tipo - norden:$this->norden - modo:$this->modo - section_id:$this->section_id";

		// set_dato_default (new way 28-10-2016)
			if ( $this->modo==='edit' && !is_null($this->section_id) ) {
				$this->set_dato_default();
			}


		return true;
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

				$this->set_dato($dato_default);

				if ( strpos($this->section_id, DEDALO_SECTION_ID_TEMP)===false ) {
					$this->id 	= $this->Save();
				}

				# INFO LOG
				if(SHOW_DEBUG===true) {
					$msg = " Created ".get_called_class()." \"$this->label\" id:$this->section_id, tipo:$this->tipo, section_tipo:$this->section_tipo, modo:$this->modo with default data from 'propiedades': ".json_encode($propiedades->dato_default);
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

		// time machine mode case
			if ($this->modo==='tm') {

				if (empty($this->matrix_id)) {
					debug_log(__METHOD__." ERROR. 'matrix_id' IS MANDATORY IN TIME MACHINE MODE  ".to_string(), logger::ERROR);
					return false;
				}

				// tm dato. Note that no lang or section_id is needed, only matrix_id
				$dato_tm = component_common::get_component_tm_dato($this->tipo, $this->section_tipo, $this->matrix_id);
				// inject dato to component
				$this->dato_resolved = $dato_tm;

				return $this->dato_resolved;
			}

		/*
		#
		# IS TEMP CASE
		# Sometimes we need use component as temporal element without save real data to database. Is this case
		# data is saved to session as temporal data
		if (isset($this->is_temp) && $this->is_temp===true) {
			$temp_data_uid = $this->tipo.'_'.$this->parent.'_'.$this->lang.'_'.$this->section_tipo;
			if (isset($_SESSION['dedalo']['component_temp_data'][$temp_data_uid])) {
				$this->dato = $_SESSION['dedalo']['component_temp_data'][$temp_data_uid];
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

		$section = section::get_instance($this->section_id, $this->section_tipo);

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
	* Get data once from matrix about section_id, dato
	*/
	protected function load_component_dato() {

		if( empty($this->section_id) || $this->modo==='dummy' || $this->modo==='search') {

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
				$section = section::get_instance($this->section_id, $this->section_tipo);


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
	* GET HTML CODE . RETURN INCLUDE FILE __CLASS__.PHP
	* @return $html
	*	Get standar path file "DEDALO_CORE_PATH .'/'. $class_name .'/'. $class_name .'.php'" (ob_start)
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
		# HTML BUFFER
		ob_start();
		switch ($this->modo) {
			case 'edit':
				# Now all components call init in edit mode, therefore, is not necessary this snippet
				#include ( DEDALO_CORE_PATH .'/component_common/html/component_common_'. $this->modo .'.phtml' );
				break;
			case 'search':
				include ( DEDALO_CORE_PATH .'/component_common/html/component_common_'. $this->modo .'.phtml' );
				break;
			default:
				# code...
				break;
		}
		include ( DEDALO_CORE_PATH .'/'. $component_name .'/'. $component_name .'.php' );
		$html = ob_get_clean();


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
		$section_id 	= $this->get_section_id();
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
			$new_section_id 	= $this->caller_dataset->section_id;
			$new_modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($new_tipo, true);
			$new_component 		= component_common::get_instance( $new_modelo_name,
																  $new_tipo,
																  $new_section_id,
																  'edit',
																  $lang,
																  $new_section_tipo);

			# Force load current db dato to avoid loose it
			$new_component->get_dato();

			# Set dataframe data
			$new_component->update_dataframe_element($this->dato, $this->caller_dataset->caller_key, $this->caller_dataset->type);

			if (isset($this->save_to_database) && $this->save_to_database===false) {
				debug_log(__METHOD__." Stopped ?? dataframe save to DDBB $this->section_tipo : $new_section_tipo , $this->section_id : $new_section_id ".to_string(), logger::WARNING);
				#$new_component->save_to_database = false;
			}

			return $new_component->Save();
		}//end if (strpos($modo,'dataframe')===0 && isset($this->caller_dataset))



		# PARENT : Verify section_id
		if(abs($section_id)<1 && strpos($section_id, DEDALO_SECTION_ID_TEMP)===false) {
			if(SHOW_DEBUG===true) {
				dump($this, "this section_tipo:$section_tipo - section_id:$section_id - tipo:$tipo - lang:$lang");
				throw new Exception("Error Processing Request. Inconsistency detected: component trying to save without section_id ($section_id) ", 1);;
			}
			die("Error. Save component data is stopped. Inconsistency detected. Contact with your administrator ASAP");
		}

		# Verify component minimum vars before save
		if( empty($section_id) || empty($tipo) || empty($lang) )
			throw new Exception("Save: More data are needed!  section_tipo:$section_tipo, section_id:$section_id, tipo,$tipo, lang,$lang", 1);


		# DATO
		$dato = $this->dato;


		#
		# IS TEMP CASE
		# Sometimes we need use component as temporal element without save real data to database. Is this case
		# data is saved to session as temporal data
		/*
		if (isset($this->is_temp) && $this->is_temp===true) {
			$temp_data_uid = $tipo.'_'.$section_id.'_'.$lang.'_'.$section_tipo;
			$_SESSION['dedalo']['component_temp_data'][$temp_data_uid] = $dato ;
			if(SHOW_DEBUG===true) {
				debug_log("INFO: IS_TEMP: saved dato from component $temp_data_uid");
			}
			return false;
		}
		*/


		# SECTION : Preparamos la sección que será la que se encargue de salvar el dato del componente
		$section 	= section::get_instance($section_id, $section_tipo);
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

		# Observers
		// the observers will be need to be notified for re-calculate your own dato with the new component dato
		$this->propagate_to_observers();


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
							"section_id"	=> $this->section_id,
							"lang"			=> $this->lang,
							"top_id"		=> (TOP_ID ? TOP_ID : $this->section_id),
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
	* PROPAGATE_TO_OBSERVERS
	* is used by calculations or compoment_info (with widgets) that show sums, or other calculations dependents of others compoments
	* the observers of the component are defined by the own component in properties that say: This component in this section is watching me:
	* {
	*  "observers": [
	*    {
	*      "section_tipo": "numisdata3",
	*      "component_tipo": "numisdata595"
	*    }
	*  ]
	* }
	* @return
	*/
	public function propagate_to_observers() {
		// get all observers defined in proporties
		$properties = $this->get_propiedades();
		// if the component don't has observers stop the process.
		if(!isset($properties->observers)){
			return;
		}
		$ar_observers = $properties->observers;

		// create the locator of the current component, this locator will be use to search, from the observer section, the component that are changed.
		$current_locator = new locator();
			$current_locator->set_section_tipo($this->section_tipo);
			$current_locator->set_section_id($this->section_id);

		$observers_data = [];
		foreach ($ar_observers as $current_observer) {
			$current_observer_data = component_common::update_observer_dato($current_observer, $current_locator, $this->tipo);
			$observers_data = array_merge($observers_data, $current_observer_data);
		}

		// store data to accces later in api
		$this->observers_data = $observers_data;

		return $observers_data;
	}//end propagate_to_observers


	/**
	* UPDATE_OBSERVER_DATO
	* @return
	*/
	public static function update_observer_dato($observer, $locator, $observable_tipo) {

		// create the observer component
		$RecordObj_dd = new RecordObj_dd($observer->component_tipo);
		$properties = $RecordObj_dd->get_propiedades(true);

		$ar_observe = $properties->observe;

		$current_observer = array_find($ar_observe, function($item) use ($observable_tipo){
			return $item->component_tipo === $observable_tipo;
		});

		if(isset($current_observer->filter) && $current_observer->filter !== false){
			// get the from_component_tipo of the filter to set at observable locator
			// the observable can't know what is the path to own section and we used the path of the sqo to get the caller component(portal, autocomplet, etc)
			$elements 	= reset($current_observer->filter);
			$element 	= reset($elements);
			$from_component_tipo = end($element->path)->component_tipo;

			$locator->set_from_component_tipo($from_component_tipo);

			// the sqo base is defined into properties of the observer component.
			// and is update the q of the filter with the locator of the component that had changed
			// update the q with the locator of the observable component
			// the locator is the section_tipo and section_id of the own observable section.
			$elements = reset($current_observer->filter);
			foreach ($elements as $key => $item) {
				$elements[$key]->q = $locator;
			}

			// build the search_query_object to use in the search.
			$sqo = new stdClass();
				$sqo->section_tipo 	= $observer->section_tipo;
				$sqo->full_count 	= false;
				$sqo->limit 		= 0;
				$sqo->filter 		= $current_observer->filter;
				dump($sqo, ' $sqo ++ '.to_string());
			// search the sections that has reference to the observable component, the component that had changed
			$search = search::get_instance($sqo);
			$result = $search->search();
			$ar_section = $result->ar_records;
		}else{
			$ar_section = [$locator];
		}

		$component_name = RecordObj_dd::get_modelo_name_by_tipo($observer->component_tipo,true);
		$ar_data = [];
		foreach ($ar_section as $current_section) {
			// create the observer component that will be update
			$component = component_common::get_instance($component_name,
														$observer->component_tipo,
														$current_section->section_id,
														'list',
														DEDALO_DATA_LANG,
														$current_section->section_tipo);

			// force to update the dato of the observer component
			$dato = $component->get_dato();

			// save the new dato into the database, this will be used for search into components calculations of infos
			$component->Save();

			// only will be send the result of the observer compoent to the current section_tipo and section_id,
			// this section is the section that user is changed and need to be update witht the new data
			// the sections that are not the current user changed/ viewed will be save but don't return the result to the client.
			if($current_section->section_id == $locator->section_id && $current_section->section_tipo === $locator->section_tipo){
				// get the json of the component to send witht the save of the observable compoment data
				$component_json = $component->get_json();
				$ar_data = array_merge($ar_data, $component_json->data);
			}
		}

		return $ar_data;
	}//end update_observers_dato


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
	* LOAD TOOLS
	*/
	public function load_tools( $check_lang_tools=true ) {

		if(strpos($this->modo, 'edit')===false ){
			if(SHOW_DEBUG===true) {
				#trigger_error("Innecesario cargar los tools aquí. Modo: $this->modo");
			}
			return [];
		}

		# Si no estamos logeados, no es necesario cargar los tools
		if(login::is_logged()!==true) return [];

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
		$this->ar_tools_obj = [];
		if(is_array($ar_tools_name)) foreach ($ar_tools_name as $tool_name) {

			$authorized_tool = component_security_tools::is_authorized_tool_for_logged_user($tool_name);

			if ($authorized_tool===true) {

				# INDEXATION TOOL CASE : When current tool have 'indexation' name, test thesaurus permissions for avoid inconsistencies
				if (strpos($tool_name, 'indexation')!==false) {
					$ts_permissions = (int)security::get_security_permissions(DEDALO_TESAURO_TIPO, DEDALO_TESAURO_TIPO);
					if ($ts_permissions<1) continue;	# Skip this tool
				}

				# Authorized tools names
				#if (!in_array($tool_name, (array)$this->ar_authorized_tool_name)) {

					$tool = new stdClass();
						$tool->name = $tool_name;

					$this->ar_tools_obj[] = $tool;
				#}
			}
		}

		return $this->ar_tools_obj;
	}//end load_tools



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
			require_once(DEDALO_CORE_PATH . '/tools/'.$tool_name.'/class.'.$tool_name.'.php');
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
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id ) {

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

		if (empty($this->section_id)) {
			trigger_error("Sorry. Few vars on get_dato_default_lang");
			return false;
		}

		if ($this->lang === DEDALO_DATA_LANG_DEFAULT) {

			$dato = $this->get_dato();

		}else{

			$section_id 	= $this->get_section_id();
			$tipo			= $this->get_tipo();
			$section_tipo 	= $this->get_section_tipo();

			$current_component_name	= get_class($this);
			$component_obj			= component_common::get_instance($current_component_name, $tipo, $section_id, 'edit', DEDALO_DATA_LANG_DEFAULT, $section_tipo);
			$dato					= $component_obj->get_dato();
		}

		return $dato;
	}//end get_dato_default_lang



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
	* PARSE_SEARCH_DYNAMIC
	* Check existence of $source in properties and resolve filter if yes
	* @return object $filter
	*/
	public function parse_search_dynamic($ar_filtered_by_search_dynamic) {

		// resolve_section_id
			$resolve_section_id = function ($source_section_id){
				switch ($source_section_id) {
					case 'current':
						$result = $this->get_section_id();
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
	public function get_ar_list_of_values2($lang=DEDALO_DATA_LANG, $include_negative=false) {

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

			    // path . search::get_query_path($tipo, $section_tipo, $resolve_related=true)
				$path = search::get_query_path($related_tipo, $target_section_tipo, $resolve_related=true);

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
			$search 			= search::get_instance($search_query_object);
			// include_negative values to include root user in list
				if ($include_negative===true) {
					$search->include_negative = true;
				}
			$records_data 		= $search->search();
			$ar_current_dato 	= $records_data->ar_records;
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
					}elseif ($modelo_name==='component_section_id') {
						$current_label = $current_row->{$related_tipo};
					}else{
						# use query select value
						$dato_full_json = $current_row->{$related_tipo};
						$current_label = self::get_value_with_fallback_from_dato_full( $dato_full_json, false );
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
				// Default. Alphabetic ascendent
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
	* DECORE UNTRANSLATED
	*/
	public static function decore_untranslated($string) {

		return '<mark>'.to_string($string).'</mark>';
	}//end decore_untranslated



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
	* REMOVE_LOCATOR_IN_DATO
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
	}//end remove_locator_in_dato


	/**
	* GET_DIFFUSION_OBJ
	* @param stdClass Object $propiedades
	*/
	public function get_diffusion_obj( $propiedades ) {

		# Build object
		$diffusion_obj = new diffusion_component_obj();
			$diffusion_obj->component_name		= get_class($this);

			$diffusion_obj->parent 				= $this->get_section_id();
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
		$section_id 	= $this->section_id;

		if (empty($section_id)) {
			trigger_error("Error: section_id is mandatory for ".__METHOD__);
			if(SHOW_DEBUG===true) {
				dump($this,"this");
				throw new Exception("Error Processing Request", 1);
			}
		}
		$section_tipo 	= $this->section_tipo;
		$section 		= section::get_instance($this->section_id, $section_tipo);
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
			//REMOVED OLD WAY$this->get_ar_tools_obj();
		}

		return (array)$this->ar_authorized_tool_name;
	}//end get_ar_authorized_tool_name



	/*
	* GET_VALOR_LANG
	* Return the component lang
	* If the component need change this langs (selects, radiobuttons...) overwritte this function
	*/
	public function get_valor_lang(){

		return $this->lang;
	}//end get_valor_lang



	/**
	* GET_AR_TARGET_SECTION_TIPO
	* Sección/es de la que se alimenta de registros el portal/autocomplete. No confundir con la sección en la que está el portal
	*/
	public function get_ar_target_section_tipo() {

		if (!$this->tipo) return null;

		// cached
			if(isset($this->ar_target_section_tipo)) {
				return $this->ar_target_section_tipo;
			}

		// get_config_context normalized
			$config_context = (array)component_common::get_config_context($this->tipo, $external=false, $this->section_tipo);
			$ar_target_section_tipo = array_map(function($item){
				return $item->section_tipo;
			}, $config_context);

		// $propiedades = $this->get_propiedades();
		// if(isset($propiedades->source->config_context)){

		// 	$ar_target_section_tipo = [];
		// 	foreach ($propiedades->source->config_context as $current_item) {
		// 		if ($current_item->type!=='internal') continue;

		// 		// resolve self section_tipo
		// 			if (isset($current_item->section_tipo) && $current_item->section_tipo==='self') {
		// 				$current_item->section_tipo = $this->section_tipo;
		// 			}

		// 		//add hierarchy_types
		// 		if(isset($current_item->hierarchy_types) && !empty($current_item->hierarchy_types)){
		// 			// get the hierarchy sections from properties
		// 				$hierarchy_types = !empty($current_item->hierarchy_types) ? $current_item->hierarchy_types : null;

		// 			# Resolve hierarchy_sections for speed
		// 				if (!empty($hierarchy_types)) {
		// 					$hierarchy_sections_from_types = component_relation_common::get_hierarchy_sections_from_types($hierarchy_types);

		// 					# Add hierarchy_sections_from_types
		// 					foreach ($hierarchy_sections_from_types as $current_section_tipo) {
		// 						if (!in_array($current_section_tipo, $ar_target_section_tipo)) {
		// 							$ar_target_section_tipo[] = $current_section_tipo;
		// 						}
		// 					}
		// 				}
		// 		}else{
		// 			$ar_target_section_tipo[] = $current_item->section_tipo;
		// 		}
		// 	}

		// }else{
		// 	$ar_target_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($this->tipo, 'section', 'termino_relacionado', $search_exact=true);
		// }

		// avoid array holes
		$ar_target_section_tipo = array_values($ar_target_section_tipo);


		if(SHOW_DEBUG===true) {
			if ( empty( $ar_target_section_tipo)) {
				$component_name = RecordObj_dd::get_termino_by_tipo($this->tipo,null,true);
				throw new Exception("Error Processing Request. Please, define target section structure for component: $component_name - $this->tipo", 1);
			}
		}

		# Fix value
		$this->ar_target_section_tipo = $ar_target_section_tipo;

		return (array)$ar_target_section_tipo;
	}//end get_ar_target_section_tipo



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
	public static function get_value_with_fallback_from_dato_full( $dato_full_json, $decore_untranslated=false, $main_lang=DEDALO_DATA_LANG_DEFAULT) {

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
		$lang 	= DEDALO_DATA_LANG;
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
	public function update_dataframe_element( $locator=null, $from_key, $type ) {

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

		if( empty($this->section_id) || $this->modo==='dummy' || $this->modo==='search') {
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
			$section = section::get_instance($this->section_id, $this->section_tipo);

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

		# component_path
		if(isset(end($query_object->path)->component_tipo)) {
			$component_tipo = end($query_object->path)->component_tipo;

			# component path default
			$query_object->component_path = ['components',$component_tipo,'dato'];
		}

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
		if (search::is_search_operator($current_query_object)===true) {
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
	* @param object $select_object
	* @return object $select_object
	*/
	public static function get_select_query2($select_object) {

		// ref
			// [path] => Array
			// 	(
			// 		[0] => stdClass Object
			// 			(
			// 				[name] => Título
			// 				[modelo] => component_input_text
			// 				[section_tipo] => numisdata224
			// 				[component_tipo] => numisdata231
			// 			)
			// 	)
			// [lang] => lg-spa
			# $selector = isset($select_object->selector) ? $select_object->selector : 'valor_list';

		// component_path check
			if(!isset($select_object->component_path)) {

				$end_path 		= end($select_object->path);
				$component_tipo = $end_path->component_tipo;

				// selector
					$selector = isset($end_path->selector)
						? $end_path->selector
						: 'dato';

				// component_path
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

		// type check
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



	################################## //end SEARCH 2 ########################################################


	/**
	* GET_MY_SECTION
	* @return
	*/
	public function get_my_section() {

		return section::get_instance($this->section_id, $this->section_tipo);
	}//end get_my_section



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
			$path 		= search::get_query_path($tipo, $section_tipo, true, $related_tipo);
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
			$search 			 = search::get_instance($search_query_object);
			$result 			 = $search->search();
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




	/**
	* GET_DATA_ITEM
	* @param mixed $value
	* @return object $item
	*/
	public function get_data_item($value) {

		$item = new stdClass();
			$item->section_id 			= $this->get_section_id();
			$item->section_tipo 		= $this->get_section_tipo();
			$item->tipo 				= $this->get_tipo();
			$item->lang 				= $this->get_lang();
			$item->from_component_tipo 	= isset($this->from_component_tipo) ? $this->from_component_tipo : $item->tipo;
			$item->value 				= $value;

		return $item;
	}//end get_data_item



	/**
	* UPDATE_DATA_VALUE
	* Used to maintain component data when dd_core_api saves component
	* @param object $data
	* @return bool true
	* @see dd_core_api update
	*/
	public function update_data_value($changed_data) {

		$dato 				= $this->get_dato();
		$lang 				= $this->get_lang();
		$properties 		= $this->get_propiedades();
		$with_lang_versions = $properties->with_lang_versions ?? false;

		// fix changed_data
			$this->changed_data = $changed_data;

		switch ($changed_data->action) {
			case 'insert':
			case 'update':
				// check if the key exist in the $dato if the key exist chage it directly, else create all positions with null value for coherence
				if(isset($dato[$changed_data->key]) || array_key_exists($changed_data->key, $dato)){
					$dato[$changed_data->key] = $changed_data->value;
				}else{
					// fill gaps in array
					for ($i=0; $i <= $changed_data->key; $i++) {
						if(!isset($dato[$i])){
							$dato[$i] = null;
						}
					}
					$dato[$changed_data->key] = $changed_data->value;
				}

				$this->set_dato($dato);
				break;

			case 'remove':
				switch (true) {
					case ($changed_data->key===false && $changed_data->value===null):
						$value = [];
						$this->set_dato($value);
						break;

					case ($changed_data->value===null && ($lang!==DEDALO_DATA_NOLAN && $with_lang_versions===true)):

						// propagate to other data langs
						$section = section::get_instance($this->get_section_id(), $this->get_section_tipo());

						// deactivate save option
						$this->save_to_database = false;

						$ar_langs = $this->get_component_ar_langs();
						foreach ($ar_langs as $current_lang) {

							// change lang and get dato
							$this->set_lang($current_lang);
							$dato = $this->get_dato();

							// remove null key and set dato updated
							array_splice($dato, $changed_data->key, 1);
							$this->set_dato($dato);

							// send to section for fix data (avoid save each lang)
							$section->save_component_dato($this);
						}

						// reactivate save option
						$this->save_to_database = true;
						break;

					default:
						$key = $changed_data->key;

						// fix property 'to_remove' to help properly remove
							$this->changed_data->to_remove = $dato[$key];

						array_splice($dato, $key, 1);
						$this->set_dato($dato);
						break;
				}
				break;

			default:
				# code...
				break;
		}


		return true;
	}//end update_data_value



	/**
	* GET_CONFIG_CONTEXT
	* Resolves the component config context with backward compatibility
	* The proper config in v6 is on term properties config, NOT as retated terms
	* Note that section tipo 'self' will be replaced by argument '$section_tipo'
	* @param string $tipo
	*	component tipo
	* @param bool $external
	*	optional defaul false
	* @param string $section_tipo
	*	optional default null
	* @return object $config_context
	*/
	public static function get_config_context($tipo, $external=false, $section_tipo=null) {

		if (to_string($section_tipo)==='self') {
			throw new Exception("Error Processing get_config_context (6) unresolved section_tipo:".to_string($section_tipo), 1);
		}

		$RecordObj_dd	= new RecordObj_dd($tipo);
		$properties		= $RecordObj_dd->get_propiedades(true);

		// properties config_context is defined
		if(isset($properties->source->config_context)){

			$config_context = [];
			foreach ($properties->source->config_context as $current_config_context) {

				if($external===false && $current_config_context->type==='external') continue; // ignore external

				if(!isset($current_config_context->select)){
					$current_config_context->select = $current_config_context->search;
				}

				if(!isset($current_config_context->show)){
					$current_config_context->show = $current_config_context->select;
				}

				// resolve self section
					if (isset($current_config_context->section_tipo) && $current_config_context->section_tipo==='self') {
						$current_config_context->section_tipo = is_array($section_tipo) ? reset($section_tipo) : $section_tipo;
					}

				// add hierarchy_types
				if(isset($current_config_context->hierarchy_types) && !empty($current_config_context->hierarchy_types)){
					// get the hierarchy sections from properties
						$hierarchy_types = $current_config_context->hierarchy_types;

					# Resolve hierarchy_sections for speed
						if (!empty($hierarchy_types)) {

							$hierarchy_sections_from_types = component_relation_common::get_hierarchy_sections_from_types($hierarchy_types);

							# Add hierarchy_sections_from_types
							foreach ($hierarchy_sections_from_types as $current_section_tipo) {

								// build config_context_item
									$config_context_item = new stdClass();
										$config_context_item->type 			= 'internal';
										$config_context_item->section_tipo 	= $current_section_tipo;
										$config_context_item->search 		= $current_config_context->search;
										$config_context_item->select 		= $current_config_context->select;
										$config_context_item->show 			= $current_config_context->show;

									$config_context[] = $config_context_item;

							}
						}
				}else{

					$config_context[] = $current_config_context;
				}
			}

		}else{

			$model = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);

			if ($model==='section') {
				// section
				$ar_modelo_name_required = ['component_','section_group','section_tab','tab','section_group_relation','section_group_portal','section_group_div'];
				$ar_related_components = section::get_ar_children_tipo_by_modelo_name_in_section($tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=true, $recursive=false, $search_exact=false, $ar_tipo_exclude_elements=false);
				$target_section_tipo = $tipo;
			}else{

				$ar_related = RecordObj_dd::get_ar_terminos_relacionados($tipo, true, true);

				$ar_related_components = [];
				foreach ($ar_related as $key => $current_tipo) {

					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);

					if ($modelo_name==='section') {
						$target_section_tipo = $current_tipo; // Set portal_section_tipo find it
						continue;
					}

					$ar_related_components[] = $current_tipo;
				}
			}

			if (!isset($target_section_tipo)) {
				$target_section_tipo = $section_tipo;
			}

			if (empty($ar_related_components)) {
				$ar_related_components = [$tipo];
			}

			// build config_context_item
			$config_context_item = new stdClass();
				$config_context_item->type 			= 'internal';
				$config_context_item->section_tipo 	= $target_section_tipo;
				$config_context_item->search 		= $ar_related_components;
				$config_context_item->select 		= $ar_related_components;
				$config_context_item->show 			= $ar_related_components;

			$config_context = [$config_context_item];

		}

		return $config_context;
	}//end get_config_context



	/**
	* GET_DATO_PAGINATED
	* It slices the component array of locators to allocate pagination options
	* @return arrray $dato_paginated
	*/
	public function get_dato_paginated() {

		// sort vars
			$properties = $this->get_propiedades();
			$mode 		= $this->get_modo();

		// dato full
			$dato = $this->get_dato();

		// empty case
			if (empty($dato)) {
				return $dato;
			}

		// limit
			$limit = ($mode==='list')
				? $this->pagination->limit ?? $properties->list_max_records ?? $this->max_records
				: $this->pagination->limit ?? $properties->max_records ?? $this->max_records;

		// offset
			$offset = $this->pagination->offset ?? 0;

		// array_lenght. avoid use zero as limit. Instead this, use null
			$array_lenght = $limit>0 ? $limit : null;

		// slice
			$dato_paginated = array_slice($dato, $offset, $array_lenght);

		// pagination keys. Set a offset relative key to each element of paginated array
			foreach ($dato_paginated as $key => $value) {
				$paginated_key = $key + $offset;
				$value->paginated_key = $paginated_key;
			}


		return $dato_paginated;
	}//end get_dato_paginated



	/**
	* GET_STRUCTURE_BUTTONS
	* @return
	*/
	public function get_structure_buttons($permissions=null) {


		return [];
	}//end get_structure_buttons



	/**
	* GET_COMPONENT_TM_DATO
	* @return array $tm_dato
	*/
	public static function get_component_tm_dato($tipo, $section_tipo, $matrix_id) {

		// search query object
			$sqo = json_decode('{
			  "mode": "tm",
			  "section_tipo": [
			    "'.$section_tipo.'"
			  ],
			  "filter_by_locators": [
			    {
			      "matrix_id": "'.$matrix_id.'",
			      "section_tipo": "'.$section_tipo.'",
			      "tipo": "'.$tipo.'"
			    }
			  ],
			  "order": [
			    {
			      "direction": "DESC",
			      "path": [
			        {
			          "component_tipo": "id"
			        }
			      ]
			    }
			  ]
			}');

		$search = search::get_instance($sqo);
		$result = $search->search();
			#dump($result, ' result ++ '.to_string());

		$record = reset($result->ar_records);

		$tm_dato = !empty($record)
			? $record->dato
			: [];

		return $tm_dato;
	}//end get_component_tm_dato



}//end class
