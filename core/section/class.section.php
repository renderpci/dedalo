<?php
/*
* CLASS SECTION
*/



class section extends common {



	/**
	* CLASS VARS
	*/
		# Overwrite __construct var lang passed in this component
		protected $lang;

		# FIELDS
		protected $section_id;
		protected $tipo;
		protected $dato;

		# STATE
		protected $mode;

		# STRUCTURE DATA
		protected $modelo;
		protected $label;

		# Buttons objects
		public $ar_buttons;

		public $ar_all_project_langs;

		public $show_inspector = true;	# default show: true

		public $section_virtual = false;
		public $section_real_tipo;

		static $active_section_id;

		public $is_temp = false;	# Used to force save data to session instead database. Default is false

		public $options;

		# SAVE_HANDLER
		# Default is 'database'. Other options like 'session' are accepted
		# Note that section change automatically this value (to 'session' for example) when received section_id is like 'temp1' for manage this cases as temporal section
		public $save_handler = 'database';

		# static cache for section instances
		static $ar_section_instances;

		public $save_modified = true; # Default is true

		public $layout_map;

		// injected whole database record, with all columns
		public $record;

		public $pagination;

		// tm_context. Array
		public $tm_context;

		/**
		* SECTIONS FOR DATAFRAME
		*________________________
		* @param $source string
		* Define if the section get data from his record in DDBB or the section get data from the components in other section (section doesn't has record in DDBB get parts of other section)
		* by default source should be DDBB, but for dataframe (context of data) the section can get his data from other section, and in those cases (source='caller_section')
		* the section will need to create the caller section to get, set or save data.
		* When dataframe section is saved it add to the data de property: section_id_key as:
		* {
		*	 	"type": "dd151",
		*	 	"section_id": "1",
		*	 	"section_tipo":	"rolejob1",
		*	 	"section_id_key": 4,
		* 		"from_component_tipo": "oh89"
		* 	}
		* section_id_key property is the link the section_id of the portal.
		* The locator of the portal with section_id = 4 will have the link with section_id_key = 4 of the dataframe section.
		* Dataframe sections doesn't has record in the DDBB, it create his data doing getting data with the caller_dataframe section and filtering with section_id_key.
		* @param $caller_dataframe locator (section_id, section_tipo)
		* is the section that has data in DDBB, it's the section of the portal with the data that need to be data framed with roles, uncertainty or any other dataframe.
		**/
		public $source;
		public $caller_dataframe;



	# DIFFUSION INFO
	# Store section diffusion info. If empty, current section is not publish.
	# Format is array or null
	# protected $diffusion_info;



	# INVERSE RELATIONS
	# Parents sections that call to this sections with portals or autocompletes
	# array of locators with, section_id, section_tipo and component_tipo (the component that call),
	# public $inverse_locators;



	/**
	* GET_INSTANCE
	* Cache section instances (singleton pattern)
	* @param string|int|null $section_id = null
	* @param string $tipo = null
	* @param string|null $mode = 'list'
	* @param bool $cache = true
	*
	* @return instance section
	*/
	public static function get_instance($section_id=null, string $tipo=null, string $mode='list', bool $cache=true) : section {

		// check valid tipo
			if (empty($tipo)) {
				throw new Exception("Error: on construct section : tipo is mandatory. section_id:$section_id, tipo:$tipo, mode:$mode", 1);
			}

		// Not cache new sections (without section_id)
			if (empty($section_id)) {
				return new section(null, $tipo, $mode);
			}

		return new section($section_id, $tipo, $mode);

		// removed cache features temporally (!) Verify real speed benefits
			// // Direct construct without cache instance
			// // Use this config in imports
			// 	if ($cache===false) {
			// 		return new section($section_id, $tipo, $mode);
			// 	}

			// # key for cache
			// $key = $section_id .'_'. $tipo.'_'.$mode;

			// $max_cache_instances = 300*3; // Default 300
			// $cache_slice_on 	 = 100*3; // Default 100

			// # OVERLOAD : If ar_section_instances > 99 , not add current section to cache to avoid overload
			// # array_slice ( array $array , int $offset [, int $length = NULL [, bool $preserve_keys = false ]] )
			// if (isset(self::$ar_section_instances) && sizeof(self::$ar_section_instances)>$max_cache_instances) {
			// 	self::$ar_section_instances = array_slice(self::$ar_section_instances, $cache_slice_on, null, true);
			// 	if(SHOW_DEBUG===true) {
			// 		debug_log(__METHOD__.' '.DEDALO_HOST." Overload sections prevent (max $max_cache_instances). Unset first $cache_slice_on cache items [$key]", logger::DEBUG);
			// 	}

			// 	// let GC do the memory job
			// 	//time_nanosleep(0, 10000000); // 10 ms
			// 	time_nanosleep(0, 2000000); // 02 ms
			// }

			// # FIND CURRENT INSTANCE IN CACHE
			// if ( !array_key_exists($key, (array)self::$ar_section_instances) ) {
			// 	self::$ar_section_instances[$key] = new section($section_id, $tipo, $mode);
			// }

			// return self::$ar_section_instances[$key];
	}//end get_instance



	/**
	* CONSTRUCT
	* Extends parent abstract class common
	*/
	private function __construct($section_id=null, ?string $tipo=null, ?string $mode='edit') {

		if (empty($tipo)) {
			throw new Exception("Error: on construct section : tipo is mandatory. section_id:$section_id, tipo:$tipo, mode:$mode", 1);
		}

		if(SHOW_DEBUG===true) {
			#$section_name = RecordObj_dd::get_termino_by_tipo($tipo,null,true);
			#global$TIMER;$TIMER[__METHOD__.'_' .$section_name.'_IN_'.$tipo.'_'.$mode.'_'.$section_id.'_'.start_time()]=start_time();
		}

		// Set general vars
			$this->lang			= DEDALO_DATA_NOLAN;
			$this->section_id	= $section_id;
			$this->tipo			= $tipo;
			$this->mode			= $mode ?? 'edit';
			$this->parent		= 0;

		// load_structure_data. When tipo is set, calculate structure data
			parent::load_structure_data();

		// active_section_section_id : Set global var
			if(		$mode==='edit'
				&&	(isset($this->section_id) && ($this->section_id>0 || strpos($this->section_id, DEDALO_SECTION_ID_TEMP)!==false))
				&&	!isset(section::$active_section_id) ) {

					// fix active_section_id
						section::$active_section_id = $this->get_section_id();
			}
		// set source from properties when section doesn't use record in database, get data from other section.
			$this->source = $this->properties->source ?? null;

		// pagination
			$this->pagination = new stdClass();
				$this->pagination->offset	= 0;
				$this->pagination->limit	= null;
	}//end __construct



	/**
	* GET DATO
	* @return object $dato
	*/
	public function get_dato() : object {

		// check valid call
			if ( abs(intval($this->section_id))<1 && strpos($this->section_id, DEDALO_SECTION_ID_TEMP)===false ) {
				if(SHOW_DEBUG===true) {
					if ($this->section_id==='result') {
						throw new Exception("Error Processing Request. 'result' is not valid section_id. Maybe you are using foreach 'ar_list_of_values' incorrectly", 1);
					};
				}
				throw new Exception("Error Processing Request. get_component_data of section section_id <1 is not allowed (section_id:'$this->section_id')", 1);
			}

		// save_handler. If section_id have a temporal string the save handier will be 'session' the section will save into the menory NOT to database
			if( strpos($this->section_id, DEDALO_SECTION_ID_TEMP)!==false ){
				$this->save_handler = 'session';
			}

		// save_handler session
			// Sometimes we need use section as temporal element without save real data to database. Is this case
			// data is saved to session as temporal data and can be recovered from $_SESSION['dedalo']['section_temp_data'] using key '$this->tipo.'_'.$this->section_id'
			if (isset($this->save_handler) && $this->save_handler==='session') {
				if (!isset($this->dato)) {
					$temp_data_uid = $this->tipo.'_'.$this->section_id;
					# Fix dato as object
					$this->dato = isset($_SESSION['dedalo']['section_temp_data'][$temp_data_uid])
						? clone $_SESSION['dedalo']['section_temp_data'][$temp_data_uid]
						: new stdClass();
				}
				return $this->dato;
			}

		// data is not loaded. Load once
			if($this->bl_loaded_matrix_data!==true) {
				// dataframe case, the section doesn't has his own data in DDBB
				if ($this->source==='caller_section' && !empty($this->caller_dataframe)) {
					// create the section of the caller
					$caller_section	= section::get_instance(
						$this->caller_dataframe->section_id,
						$this->caller_dataframe->section_tipo,
						$this->mode,
						true
					);
					// get the data of the caller section from database
					$caller_dato	= $caller_section->get_dato();

					$new_section_dato = new stdClass();
					$section_id_key = (int)$this->section_id;
					// get the data with matching the section_id of the current section with the section_id_key of the data of the caller
					// section_id === section_id_key
					// 4 === 4
					$filtered_relations = $new_section_dato->relations  = array_filter($caller_dato->relations, function($el) use ($section_id_key){
						return isset($el->section_id_key) && $el->section_id_key===$section_id_key;
					});
					// create the final data with filtered values and empty components (literals are not compatible for now)
					$new_section_dato->relations  = array_values($filtered_relations);
					$new_section_dato->components = new stdClass();

					$dato = $new_section_dato;

				}else{

					// if virtual section have section_tipo "real" in properties, change the tipo of the section to the real
						$tipo = (isset($this->properties->section_tipo) && $this->properties->section_tipo==='real')
							? $this->get_section_real_tipo()
							: $this->tipo;

					$section_tipo			= $this->tipo;
					$matrix_table			= common::get_matrix_table_from_tipo($section_tipo);
					$JSON_RecordObj_matrix	= new JSON_RecordObj_matrix($matrix_table, $this->section_id, $tipo);

				// load dato from db
					$dato = $JSON_RecordObj_matrix->get_dato();
					// dump(null, ' dato from DB ++ ->->->->->->->->->->->->->->->->->->->->->->->->->->->->->->->->->-> '.to_string($this->tipo.'-'.$this->section_id.'-'. RecordObj_dd::get_termino_by_tipo($this->tipo) ));
				}

				// fix dato (force object)
					$this->dato = (object)$dato;

				// set as loaded
					$this->bl_loaded_matrix_data = true;
			}//end if($this->bl_loaded_matrix_data!==true)

		// debug
			if(SHOW_DEBUG===true) {
				#$start_time = start_time();
				#global$TIMER;$TIMER[__METHOD__.'_OUT_'.$this->tipo.'_'.$this->mode.'_'.start_time()]=start_time();
			}


		return $this->dato;
	}//end get_dato



	/**
	* SET_DATO
	* Set whole section data as raw object
	* Fix section relations and components to prevent save issues
	* @return bool true
	*/
	public function set_dato($dato) {

		// call common->set_dato (!) fix var 'bl_loaded_matrix_data' as true
		return parent::set_dato($dato);
	}//end set_dato



	/**
	* GET_COMPONENT_DATO
	* Extract from the container of the section, the specific data of each component in the required language
	* will be deprecated with the get_all_component_data (08-2017)
	*/
	public function get_component_dato(string $component_tipo, string $lang, bool $lang_fallback=false) {

		$all_component_data = $this->get_all_component_data($component_tipo);

		if ($lang_fallback===true) { // case mode list (see component common)

			if (isset($all_component_data->dato->{$lang}) && !empty($all_component_data->dato->{$lang})) {
				// lang data exists
				$component_dato = $all_component_data->dato->{$lang};
			}else{
				// fallback to default lang
				$lang_default = DEDALO_DATA_LANG_DEFAULT;
				$component_dato = ($lang!==$lang_default && !empty($all_component_data->dato->{$lang_default}))
					? $all_component_data->dato->{$lang_default}
					: null;
			}

		}else{

			$component_dato = isset($all_component_data->dato->{$lang})
				? $all_component_data->dato->{$lang}
				: null;
		}

		return $component_dato;
	}//end get_component_dato



	/**
	* GET_ALL_COMPONENT_DATA
	* Get all data of the component, with dato, valor, valor_list and dataframe
	* this function will be the only communication with the component for get the information (08-2017)
	* @param string $component_tipo
	* @return object|null component_data
	*/
	public function get_all_component_data(string $component_tipo) : ?object {

		$section_data = $this->get_dato();

		if (!is_object($section_data)) {
			trigger_error("[get_all_component_data] Error on read component_data component_tipo: $component_tipo" );
		}

		$component_data = isset($section_data->components->{$component_tipo})
			? $section_data->components->{$component_tipo}
			: null;

		return $component_data;
	}//end get_all_component_data



	/**
	* SAVE_COMPONENT_DATO
	* Save the component data received in the JSON container of the section
	* Rebuild the global object of the section (at the moment it is not possible to save only part of the JSON object in PostgreSQL)
	* @param object $component_obj
	* @param string $component_data_type
	* @param bool $save_to_database
	* @return
	*/
	public function save_component_dato(object $component_obj, string $component_data_type, bool $save_to_database) {

		// The section is necessary before managing the component data. If it does not exist, we will create it previously
			if (abs(intval($this->get_section_id()))<1  && strpos((string)$this->get_section_id(), DEDALO_SECTION_ID_TEMP)===false) {
				$section_id = $this->Save();
				trigger_error("A section has been created ($section_id) triggered by component save ".$component_obj->get_tipo());
				if(SHOW_DEBUG===true) {
					// throw new Exception("Warning : Trying save component in section without section_id. Created section and saved", 1);
					debug_log(__METHOD__." Warning : Trying save component in section without section_id. Created section and saved ".to_string(), logger::ERROR);
				}
			}

		// set self section_obj to component. (!) Important to prevent cached and not cached versions of
		// current section conflicts (and for speed)
			$component_obj->set_section_obj($this);

		// component_global_dato : Extract the component portion from the section's global object
			$component_tipo				= $component_obj->get_tipo();
			$component_lang				= $component_obj->get_lang();
			// $component_valor_lang	= $component_obj->get_valor_lang();
			// $component_modelo_name	= get_class($component_obj);	#RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			// $component_traducible	= $component_obj->get_traducible();
			if (empty($component_tipo)) {
				throw new Exception("Error Processing Request: component_tipo is empty", 1);
			}

		// set dato
			if ($component_data_type==='relation') {

				// relation components
					// previous component dato from unchanged section dato
					$previous_component_dato = array_values(
						array_filter($this->get_relations(), function($el) use ($component_tipo){
							return isset($el->from_component_tipo) && $el->from_component_tipo===$component_tipo;
						})
					);
					$this->set_component_relation_dato( $component_obj );

			}else{

				// direct components
					// previous component dato from unchanged section dato
					$previous_component_dato = $this->get_component_dato(
						$component_tipo,
						$component_lang,
						false // bool lang_fallback
					);
					$this->set_component_direct_dato( $component_obj );
		}

		// diffusion_info
			$this->dato->diffusion_info = null;	// Always reset section diffusion_info on save components

		// optional stop the save process to delay DDBB access
			if($save_to_database===false) {
				# Stop here (remember make a real section save later!)
				# No component time machine data will be saved when section saves later
				#debug_log(__METHOD__." Stopped section save process component_obj->save_to_database = true ".to_string(), logger::ERROR);
				return $this->section_id;
			}

		// time machine data. We save only current component lang 'dato' in time machine
			$save_options = new stdClass();
				$save_options->time_machine_data	= $component_obj->get_dato_unchanged();
				$save_options->time_machine_lang	= $component_lang;
				$save_options->time_machine_tipo	= $component_tipo;
				// previous_component_dato
				$save_options->previous_component_dato	= $previous_component_dato;

		// save section result
			$result = $this->Save( $save_options );


			// #
			// # DIFFUSION_INFO
			// # Note that this process can be very long if there are many inverse locators in this section
			// # To optimize save process in scripts of importation, you can disable this option if is not really necessary
			// #
			// #$dato->diffusion_info = null;	// Always reset section diffusion_info on save components
			// #register_shutdown_function( array($this, 'diffusion_info_propagate_changes') ); // exec on __destruct current section
			if ($component_obj->update_diffusion_info_propagate_changes===true) {
				$this->diffusion_info_propagate_changes();
				# debug_log(__METHOD__." Deleted diffusion_info data for section $this->tipo - $this->section_id ", logger::DEBUG);
			}

		// post_save_component_processes
			$this->post_save_component_processes((object)[
				'component' => $component_obj
			]);


		return $result;
	}//end save_component_dato



	/**
	* SET_COMPONENT_DIRECT_DATO
	* @param object $component_obj
	* @return object $this->dato
	*/
	public function set_component_direct_dato( object $component_obj ) : object {

		// set self section_obj to component. (!) Important to prevent cached and not cached versions of
		// current section conflicts (and for speed)
			$component_obj->set_section_obj($this);

		// component short vars
			$component_tipo 		= $component_obj->get_tipo();
			$component_lang 		= $component_obj->get_lang();
			$component_valor_lang 	= $component_obj->get_valor_lang();
			$component_modelo_name 	= get_class($component_obj);
			$component_traducible 	= $component_obj->get_traducible();

		// section dato
			$dato = $this->get_dato();
			if (!is_object($dato)) {
				// $dato = $this->dato = new stdClass();
				throw new Exception("Error Processing Request. Section Dato is not as expected type (object). type: ".gettype($dato), 1);
			}

		# SELECT COMPONENT IN SECTION DATO
		if (isset($dato->components->{$component_tipo})) {

			// component dato already exists in section object. Only select it
				$component_global_dato = $dato->components->{$component_tipo};

		}else{

			// component dato NOT exists in section object. We build a new one with current info
				#$obj_global 						= new stdClass();
				#$obj_global->$component_tipo 		= new stdClass();
				#$component_global_dato 			= new stdClass();
				#$component_global_dato				= $obj_global->$component_tipo;

				$component_global_dato = new stdClass();

					// INFO : We create the info of the current component
						// $component_global_dato->info 		= new stdClass();
						// 	$component_global_dato->info->label = RecordObj_dd::get_termino_by_tipo($component_tipo,null,true);
						// 	$component_global_dato->info->modelo= $component_modelo_name;
						$inf = RecordObj_dd::get_termino_by_tipo($component_tipo,null,true) .' ['.$component_modelo_name.']';
						$component_global_dato->inf = $inf;


					$component_global_dato->dato = new stdClass();
					// $component_global_dato->valor		= new stdClass();
					// $component_global_dato->valor_list	= new stdClass();
					// $component_global_dato->dataframe	= new stdClass();
		}

		# DATO OBJ
			if (!isset($component_global_dato->dato->{$component_lang})) {
				$component_global_dato->dato->{$component_lang} = new stdClass();
			}

		#
		# DATO : We update the data in the current language
			$component_dato = $component_obj->get_dato_unchanged(); ## IMPORTANT !!!!! (NO usar get_dato() aquí ya que puede cambiar el tipo fijo establecido por set_dato)
				$component_global_dato->dato->{$component_lang} = $component_dato;



		# DATAFRAME
			$dataframe = $component_obj->get_dataframe();
			if (isset($component_global_dato->dataframe)) {
				// already exists property dataframe. Add always
				$component_global_dato->dataframe = $dataframe;
			}else{
				// not exists property. Add only if dataframe is not empty
				if (!empty($dataframe)) {
					$component_global_dato->dataframe = $dataframe;
				}
			}


		#
		# REPLACE COMPONENT PORTION OF GLOBAL OBJECT :  We update the entire component in the global object
			if (!isset($dato->components->{$component_tipo})) {
				if (!isset($dato->components)) {
					$dato->components = new stdClass();
				}
				$dato->components->{$component_tipo} = new stdClass();
			}
			$dato->components->{$component_tipo} = $component_global_dato;

		// update section full data object
			$this->set_dato($dato);


		return $this->dato;
	}//end set_component_direct_dato



	/**
	* SET_COMPONENT_RELATION_DATO
	* @return object $this->dato
	*/
	public function set_component_relation_dato( object $component_obj ) : object {

		// set self section_obj to component. (!) Important to prevent cached and not cached versions of
		// current section conflicts (and for speed)
			$component_obj->set_section_obj($this);

		// component short vars
			$component_tipo			= $component_obj->get_tipo();
			$component_dato			= $component_obj->get_dato_full();
			$relation_type			= $component_obj->get_relation_type();
			$from_component_tipo	= $component_tipo;

		// caller_section case
		// used for dataframe
		// dataframe sections doesn't has data in database it get data from the caller section
			if ($this->source==='caller_section' && !empty($this->caller_dataframe)) {
				// create the caller section that has data in DDBB
				$caller_section	= section::get_instance(
					$this->caller_dataframe->section_id,
					$this->caller_dataframe->section_tipo,
					$this->mode,
					true
				);
				// get the full relations data
				$relations_dato	= $caller_section->get_relations( 'relations' );

				// 1 remove old locators (all) of the component with current section_id_key
				// the component could has other locators with different section_id_key that will be preserved.
					$cleaned_locators	= [];
					$section_id_key		= (int)$this->section_id;
					foreach ($relations_dato as $current_locator) {
						if (   (isset($current_locator->from_component_tipo) && $current_locator->from_component_tipo===$component_tipo)
							&& (isset($current_locator->section_id_key) && $current_locator->section_id_key===$section_id_key)
							){
							// nothing to do (do not store this locator)
						}else{
							$cleaned_locators[] = $current_locator;
						}
					}

				// add current dato
				// if the component has locators, it will be added, else nothing to add
					if (!empty($component_dato)) {
						foreach ($component_dato as $current_locator) {
							$current_locator->section_id_key = $section_id_key;
							$cleaned_locators[] = $current_locator;
						}
					}

				// Update section dato relations on finish
					$caller_section->dato->relations = $cleaned_locators;

				// save
					$caller_section->Save();

				return $caller_section->dato;
			}


		# Remove all previous locators of current component tipo
		$this->remove_relations_from_component_tipo( $component_tipo, 'relations' );

		# Remove all existing search locators of current component tipo
		$this->remove_relations_from_component_tipo( $component_tipo, 'relations_search' );


		if (!empty($component_dato)) {

			# ADD_RELATION . Add locator one by one
			foreach ((array)$component_dato as $key => $current_locator) {

				# Add relation
				$add_relation = $this->add_relation( $current_locator, 'relations' );
				// If something fail, advise
				if($add_relation===false) {
					debug_log(__METHOD__." ERROR ON ADD LOCATOR:  ".to_string($current_locator), logger::ERROR);
					#$result = false;
				}
			}

			# SEARCH_RELATIONS . If component have search_relations, add too
			if ($relations_search_value = $component_obj->get_relations_search_value()) {

				foreach ($relations_search_value as $current_search_locator) {
					# Add relation
					$add_relation = $this->add_relation( $current_search_locator, 'relations_search' );
					// If something fail, advise
					if($add_relation===false) {
						debug_log(__METHOD__." ERROR ON ADD SEARCH LOCATOR:  ".to_string($current_search_locator), logger::ERROR);
					}
				}
			}
		}//end if (!empty($component_dato))


		return $this->dato;
	}//end set_component_relation_dato



	/**
	* SAVE
	* Create or update a section record in matrix
	* @param object $save_options
	* @return int|null $section_id
	*/
	public function Save( object $save_options=null ) : ?int {

		// options
			$options = new stdClass();
				$options->main_components_obj		= false;
				$options->main_relations			= false;
				$options->new_record				= false;
				$options->forced_create_record		= false;
				$options->component_filter_dato		= false;

				# Time machine options (overwrite when save component)
				$options->time_machine_data			= false;
				$options->time_machine_lang			= false;
				$options->time_machine_tipo			= false;
				$options->time_machine_section_id	= (int)$this->section_id; // always
				$options->previous_component_dato	= null; // only when save from component


			// save_options overwrite defaults
			if (!empty($save_options)) {
				foreach ((object)$save_options as $key => $value) {
					if (property_exists($options, $key)) { $options->$key = $value; }
				}
			}

		// tipo. Current section tipo
			$tipo = $this->get_tipo();

			# If the section virtual have the section_tipo "real" in properties, change the tipo of the section to the real
			if(isset($this->properties->section_tipo) && $this->properties->section_tipo==='real'){
				$tipo = $this->get_section_real_tipo();
			}

			# Verify tipo is structure data
			if( !(bool)verify_dedalo_prefix_tipos($tipo) ) throw new Exception("Current tipo is not valid: $tipo", 1);

			# SECTION VIRTUAL . Correct tipo
			# If we are in a virtual section, we will clear the real type (the destination section) and
			# we will work with the real type from now on
			$section_real_tipo = ($tipo===DEDALO_ACTIVITY_SECTION_TIPO)
				? $tipo
				: $this->get_section_real_tipo();

		// user id. Current logged user id
			$user_id  = (int)navigator::get_user_id();

		// date now
			$date_now = component_date::get_timestamp_now_for_db();

		// Save_handler different to database case
			// Sometimes we need use section as temporal element without save real data to database. Is this case
			// data is saved to session as temporal data and can be recovered from $_SESSION['dedalo']['section_temp_data'] using key '$this->tipo.'_'.$this->section_id'
			if (isset($this->save_handler) && $this->save_handler==='session') {

				$temp_data_uid 		= $this->tipo.'_'.$this->section_id;
				$section_temp_data 	= (object)$this->dato;

				# Set value to session
				# Always encode and decode data before store in session to avoid problems on unserialize not loaded classes
				$_SESSION['dedalo']['section_temp_data'][$temp_data_uid] = json_decode( json_encode($section_temp_data) );

				return (int)$this->section_id;
			}

		// caller_section. When the section get data from other section (his source is the caller section instead DDBB)
			if($this->source === 'caller_section') {

				// time machine. Save component data only
					$JSON_RecordObj_matrix	= new JSON_RecordObj_matrix(
						'dataframe', // fake table
						(int)$this->section_id,
						$tipo // string section_tipo
					);
					$JSON_RecordObj_matrix->save_time_machine($options);

				return $this->section_id;
			}

		// matrix table
			$matrix_table = common::get_matrix_table_from_tipo($tipo); // This function fallback to real section if virtual section don't have table defined


		if (!empty($this->section_id) && (int)$this->section_id>=1 && $options->forced_create_record===false) { # UPDATE RECORD

			################################################################################
			# UPDATE RECORD : Update current matrix section record triggered by one component

			if ($this->save_modified===false) {
				// section dato only
					$section_dato = (object)$this->get_dato();

			}else{
				// update_modified_section_data . Resolve and add modification date and user to current section dato
					$this->update_modified_section_data((object)[
						'mode' => 'update_record'
					]);

				// section dato
					$section_dato = (object)$this->get_dato();

				// dato add modification info
					# Section modified by userID
					$section_dato->modified_by_userID	= (int)$user_id;
					# Section modified date
					$section_dato->modified_date		= (string)$date_now;	# Format 2012-11-05 19:50:44
			}

			# Save section dato
				$JSON_RecordObj_matrix	= new JSON_RecordObj_matrix( (string)$matrix_table, (int)$this->section_id, (string)$tipo );
				$JSON_RecordObj_matrix->set_datos($section_dato);
				$saved_id_matrix		= $JSON_RecordObj_matrix->Save( $options );
				if (false===$saved_id_matrix || $saved_id_matrix < 1) { //  && $tipo!==DEDALO_ACTIVITY_SECTION_TIPO
					trigger_error("Error on trying save->update record. Nothing is saved!");
					if(SHOW_DEBUG===true) {
						throw new Exception("Error Processing Request. Returned id_matrix on save (update) section is mandatory. Received id_matrix: $saved_id_matrix ", 1);
					}
				}

		}else{ # NEW RECORD

			################################################################################
			# NEW RECORD . Create and save matrix section record in correct table

			// prevent to save non authorized/valid section_id
				if ($this->section_id=='-1') {
					debug_log(__METHOD__." Trying to save invalid section_id: ".to_string($this->section_id), logger::ERROR);
					return null;
				}

			##
			# COUNTER : Counter table. Default is ¡matrix_counter¡
			# Prepare the id of the counter based on the table we are working on (matrix, matrix_dd, etc.)
			# By default it will be 'matrix_counter', but if our section table is different from 'matrix' we will use a counter table distinct
			# formatted as 'matrix_counter' + substr($matrix_table, 6). For example 'matrix_counter_dd' for matrix_dd
				if ($options->forced_create_record===false) {

					// Use normal incremental counter
					$matrix_table_counter	= (substr($matrix_table, -3)==='_dd') ? 'matrix_counter_dd' : 'matrix_counter';
					$current_id_counter		= (int)counter::get_counter_value($tipo, $matrix_table_counter);

					// Create a counter if not exists
						if ($current_id_counter===0 && $tipo!==DEDALO_ACTIVITY_SECTION_TIPO) {
							$consolidate_counter = counter::consolidate_counter( $tipo, $matrix_table, $matrix_table_counter );
							// Re-check counter value
							$current_id_counter = (int)counter::get_counter_value($tipo, $matrix_table_counter);
						}

					$section_id_counter = $current_id_counter+1;

					# section_id. Fix section_id (Non return point, next calls to Save will be updates)
					$this->section_id = (int)$section_id_counter;
				}

			##
			# SECTION JSON DATA
			# Store section dato

				# SECTION_OBJ
				# When section is created at first time, section_obj is created wit basic data to write a 'empty section'
				# In some cases, before save at first time, data exits in section object. Take care of this data is added to
				# current first section data or not

					// section dato
						$section_dato = isset($this->dato) ? (object)$this->dato : new stdClass();

					// Section id
						$section_dato->section_id		 = (int)$this->section_id;

					// Section tipo
						$section_dato->section_tipo 	 = (string)$tipo;

					// Section real tipo
						$section_dato->section_real_tipo = (string)$section_real_tipo;

					// Section label
						$section_dato->label 			 = (string)RecordObj_dd::get_termino_by_tipo($tipo,null,true);

					// Section created by userID
						$section_dato->created_by_userID = (int)$user_id;

					// Section created date
						$section_dato->created_date 	 = (string)$date_now;	# Format 2012-11-05 19:50:44

					// diffusion_info
						$section_dato->diffusion_info 	 = array(); // Empty array by default

					// Update modified section data . Resolve and add creation date and user to current section dato
						$this->update_modified_section_data((object)[
							'mode' => 'new_record'
						]);

					// Components container
						if (!empty($options->main_components_obj)) {
							// Main components obj : When creating a section, you can optionally pass the component data directly
							$section_dato->components = $options->main_components_obj;	# Añade el dato de todos los componentes de una sola vez (activity)
						}else{
							// components container (empty when insert)
							$section_dato->components = isset($this->dato->components) ? $this->dato->components : new stdClass();
						}

					// Relations container
						if (!empty($options->main_relations)) {
							// Main relations : When creating a section, you can optionally pass the data of the relationships directly
							$section_dato->relations = $options->main_relations;	# Añade el dato de todas las relaciones de una sola vez (activity)
						}else{
							// relations container
							$section_dato->relations = isset($this->dato->relations) ? (array)$this->dato->relations : [];
						}

					// update section dato with final object. Important
						$this->dato = $section_dato;


					// Set as loaded
						$this->bl_loaded_matrix_data = true;

			// Real data save
				// Time machine data. We save only current new section in time machine once (section info not change, only components changes)
					$time_machine_data = clone $section_dato;
						unset($time_machine_data->components); 	# Remove unnecessary empty 'components' object
						unset($time_machine_data->relations); 	# Remove unnecessary empty 'relations' object
					$save_options = new stdClass();
						$save_options->time_machine_data = $time_machine_data;
						$save_options->time_machine_lang = DEDALO_DATA_NOLAN;	# Always nolan for section
						$save_options->time_machine_tipo = $tipo;
						$save_options->new_record		 = true;

				// Save JSON_RecordObj
					$JSON_RecordObj_matrix = new JSON_RecordObj_matrix((string)$matrix_table, (int)$this->section_id, (string)$tipo);
					$JSON_RecordObj_matrix->set_datos($section_dato);
					#$JSON_RecordObj_matrix->set_section_id($this->section_id);
					#$JSON_RecordObj_matrix->set_section_tipo($tipo);
					$saved_id_matrix = $JSON_RecordObj_matrix->Save( $save_options );
					if (false===$saved_id_matrix || $saved_id_matrix < 1) { //  && $tipo!==DEDALO_ACTIVITY_SECTION_TIPO
						trigger_error("Error on trying save->insert record. Nothing is saved!");
						if(SHOW_DEBUG===true) {
							throw new Exception("Error Processing Request. Returned id_matrix on save section is mandatory. Received id_matrix: $saved_id_matrix ", 1);
						}
					}


			if($this->tipo===DEDALO_ACTIVITY_SECTION_TIPO) {

				# (!) Note that value returned by Save action, in case of activity, is the section_id auto created by table sequence 'matrix_activity_section_id_seq', not by counter
				$this->section_id = (int)$saved_id_matrix;

			}else{

				// Counter update : If all is ok, update section counter (counter +1) in structure 'properties:section_id_counter'
				if ($saved_id_matrix > 0) {
					if ($options->forced_create_record!==false) {
						# CONSOLIDATE COUNTER VALUE
						# Search last section_id for current section and set counter to this value (when user later create a new record manually, counter will be ok)
						counter::consolidate_counter($tipo, $matrix_table);

					}else{
						# Counter update
						counter::update_counter($tipo, $matrix_table_counter, $current_id_counter);
					}
				}

				// Store in cached sections . (!) Important
					# key for cache
					// $key = $this->section_id .'_'. $tipo;
					// self::$ar_section_instances[$key] = $this;

				// Logger activity
					logger::$obj['activity']->log_message(
						'NEW',
						logger::INFO,
						$this->tipo,
						null,
						array(
							'msg'			=> 'Created section record',
							'section_id'	=> $this->section_id,
							'section_tipo'	=> $this->tipo,
							'tipo'			=> $this->tipo,
							'table'			=> $matrix_table
							// "is_portal"	=> intval($options->is_portal),
							// "top_id"		=> $top_id,
							// "top_tipo"	=> TOP_TIPO,
							// "tm_id"		=> 'desactivo',#$time_machine_last_id,
							// "counter"	=> counter::get_counter_value($this->tipo, $matrix_table_counter),
						)
					);

				##
				# FILTER DEFAULTS SET
				if ($this->tipo===DEDALO_SECTION_PROJECTS_TIPO) {

					##
					# AUTO AUTHORIZE THIS PROJECT FOR CURRENT USER
					# If this newly created section is a project, this project is added as authorized to the user who created it
					# User currently logged in
						$component_filter_master = component_common::get_instance(
							'component_filter_master',
							DEDALO_FILTER_MASTER_TIPO,
							$user_id,
							'edit',
							DEDALO_DATA_NOLAN,
							DEDALO_SECTION_USERS_TIPO
						);
						$dato_filter_master = $component_filter_master->get_dato();

						$filter_master_locator = new locator();
							$filter_master_locator->set_section_id($this->section_id);
							$filter_master_locator->set_section_tipo(DEDALO_FILTER_SECTION_TIPO_DEFAULT);
							$filter_master_locator->set_type(DEDALO_RELATION_TYPE_FILTER);
							$filter_master_locator->set_from_component_tipo(DEDALO_FILTER_MASTER_TIPO);
						$dato_filter_master[] = $filter_master_locator; // Add locator to dato

						$component_filter_master->set_dato($dato_filter_master);
						$component_filter_master->Save();
						debug_log(__METHOD__." Added locator from section save to component_filter_master: ".to_string($filter_master_locator), logger::DEBUG);

				}else{

					# Filter defaults. Note that portal already saves inherited project to new created section
					# To avoid saves twice, only set default project when not is a portal call to create new record


					##
					# DEFAULT PROJECT FOR CREATE STANDARD SECTIONS
					# When a section record is created, it is auto assigned the default project (defined in config DEDALO_DEFAULT_PROJECT)
					# when the section has a 'component_filter' defined
					$ar_tipo_component_filter = section::get_ar_children_tipo_by_modelo_name_in_section(
						$section_real_tipo,
						['component_filter'],
						true, // from_cache
						false, // resolve_virtual
						true // cache
					);
					if (empty($ar_tipo_component_filter[0])) {

						if(SHOW_DEBUG===true) {
							#throw new Exception("Error Processing Request. Too much component_filter elements found", 1);
						}
						debug_log(__METHOD__." Ignored set filter default in section without filter: $this->tipo ".to_string(), logger::WARNING);

					}else{

						if (!empty($options->component_filter_dato)) {
							// set the component_filter with the dato sended by the caller (portals)
							$component_filter 	= component_common::get_instance(
								'component_filter',
								$ar_tipo_component_filter[0],
								$this->section_id,
								'list', // Important 'list' to avoid auto save default value !!
								DEDALO_DATA_NOLAN,
								$tipo
							);
							$component_filter->set_dato($options->component_filter_dato);
							$component_filter->Save();

						}else{
							# When component_filter is called in edit mode, the component check if dato is empty and if is,
							# add default user project and save it
							// (!) Note that construct component_filter in edit mode, saves default value too. Here, current section is saved again
							$component_filter = component_common::get_instance(
								'component_filter',
								$ar_tipo_component_filter[0],
								$this->section_id,
								'edit', // Important edit !! # Already saves default project when load in edit mode
								DEDALO_DATA_NOLAN,
								$tipo
							);
							// note that section is auto-saved here
						}
					}//end if (empty($ar_tipo_component_filter[0]))

				}//end if ($this->tipo===DEDALO_SECTION_PROJECTS_TIPO)


				// component state defaults set. Set default values on component_state when is present
					$ar_component_state = section::get_ar_children_tipo_by_modelo_name_in_section(
						$section_real_tipo, // section_tipo
						['component_state'], // ar_modelo_name_required
						true, // from_cache
						false, // resolve_virtual
						true // recursive
					);
					if (isset($ar_component_state[0])) {
						$component_state = component_common::get_instance(
							'component_state',
							$ar_component_state[0],
							$this->section_id,
							'edit',
							DEDALO_DATA_NOLAN,
							$tipo
						);
						// (!) Note that set_defaults saves too. Here, current section is saved again if component_state is founded
						$component_state->set_defaults();
					}//end if (isset($ar_component_state[0]))

			}//end if($this->tipo!==DEDALO_ACTIVITY_SECTION_TIPO)
		}//end if ($this->id >= 1)


		// debug
			if(SHOW_DEBUG===true) {
				// global$TIMER;$TIMER[__METHOD__.'_OUT_'.$this->tipo.'_'.$this->mode.'_'.start_time()]=start_time();
			}


		return $this->section_id;
	}//end Save



	/**
	* DELETE (SECTION)
	* Delete section with options
	* @param string $delete_mode data|record
	* @return bool
	*/
	public function Delete( string $delete_mode ) : bool {

		// section_id
			// force type int
			$section_id = intval($this->section_id);
			// prevent delete <1 records
			if($section_id<1) {
				debug_log(__METHOD__." Invalid section_id: $section_id. Delete action is aborted ".to_string(), logger::WARNING);
				return false;
			}

		// section_tipo
			$section_tipo = $this->tipo;
			// section_real_tipo. If the section virtual have the section_tipo "real" in properties change the tipo of the section to the real
			if(isset($this->properties->section_tipo) && $this->properties->section_tipo === "real"){
				$section_tipo = $this->get_section_real_tipo();
			}
			// user id
			$user_id = navigator::get_user_id();
			// matrix_table
			$matrix_table = common::get_matrix_table_from_tipo($section_tipo);


		// delete_mode based actions
			switch($delete_mode) {

				case 'delete_data' :

					# CHILDREN : Calculate components children of current section
					$ar_component_tipo = section::get_ar_children_tipo_by_modelo_name_in_section(
						$section_tipo ,
						['component_'],
						true, // from_cache
						true, // resolve virtual
						true, // recursive
						false, // search exact
					);

					// don't delete some components
					$ar_components_modelo_no_delete_dato = [
						'component_section_id'
					];

					$ar_models_of_media_components = section::get_components_with_media_content();

					$ar_deleted_tipos = [];
					foreach ($ar_component_tipo as $current_component_tipo) {

						$current_model_name = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo, true);

						if (in_array($current_model_name, $ar_components_modelo_no_delete_dato)){
							continue;
						}

						$translatable	= RecordObj_dd::get_translatable($current_component_tipo);
						$ar_lang		= ($translatable === false)
							? [DEDALO_DATA_NOLAN]
							: DEDALO_PROJECTS_DEFAULT_LANGS;

						foreach ($ar_lang as $current_lang) {

							$current_component = component_common::get_instance(
								$current_model_name,
								$current_component_tipo,
								$section_id,
								'list',
								$current_lang,
								$section_tipo,
								false
							);

							$current_component_dato = $current_component->get_dato();
							if(empty($current_component_dato)){
								continue;
							}

							$dato_empty = ($current_model_name === 'component_filter')
								? $current_component->get_default_dato_for_user($user_id)
								: null;

							$current_component->set_dato($dato_empty);
							$current_component->Save();
						}

						if(in_array($current_model_name, $ar_models_of_media_components)){
							$current_component->remove_component_media_files();
						}

						$ar_deleted_tipos[] = $current_component_tipo;
					}

					// remove component inside section data in DDBB
						$section_data = $this->get_dato();
						foreach($ar_deleted_tipos as $current_component_tipo){
							if(isset($section_data->components->$current_component_tipo)){
								unset($section_data->components->$current_component_tipo);
							}
						}
						$this->Save();

					$logger_msg = "Deleted section and children data";
					break;

				case 'delete_record' :

					#
					# TIME MACHINE : prepare matrix_time_machine data for recover this section later
					# Get time machine id based on section tipo and section_id
					$ar_id_time_machine = (array)RecordObj_time_machine::get_ar_time_machine_of_this($section_tipo, $this->section_id, 'lg-nolan', $section_tipo); // $tipo, $parent, $lang=NULL, $section_tipo
					if (empty($ar_id_time_machine[0])) {
						#return "Error on delete record. Time machine version of this record not exists. Please contact with your admin to delete this record";
						$RecordObj_time_machine_new = new RecordObj_time_machine(null);
							$RecordObj_time_machine_new->set_section_id((int)$this->section_id);
							$RecordObj_time_machine_new->set_section_tipo((string)$section_tipo);
							$RecordObj_time_machine_new->set_tipo((string)$section_tipo);
							$RecordObj_time_machine_new->set_lang((string)$this->get_lang());
							$RecordObj_time_machine_new->set_timestamp((string)component_date::get_timestamp_now_for_db());	# Format 2012-11-05 19:50:44
							$RecordObj_time_machine_new->set_userID((int)navigator::get_user_id());
							$RecordObj_time_machine_new->set_dato((object)$this->dato);
						$id_time_machine = (int)$RecordObj_time_machine_new->Save();
					}else{
						$id_time_machine = (int)$ar_id_time_machine[0];
					}
					if ($id_time_machine<1) {
						throw new Exception("Error Processing Request. id_time_machine is empty", 1);
					}
					# Update time machine record
					$RecordObj_time_machine = new RecordObj_time_machine($id_time_machine);
						$RecordObj_time_machine->set_dato($this->get_dato());	// Update dato with the last data stored in this section before is deleted
						$RecordObj_time_machine->set_state('deleted');			// Mark state as 'deleted' for fast recovery
					$tm_save = (int)$RecordObj_time_machine->Save();			// Expected int id_time_machine returned if all is ok
					# Verify time machine is updated properly before delete this section
					if ($tm_save!==$id_time_machine) {
						# Something failed in time machine save
						if(SHOW_DEBUG===true) {
							dump($tm_save, " tm_save is distinct: tm_save:$tm_save - id_time_machine:$id_time_machine");
						}
						trigger_error("ERROR: Failed save update data for time machine record $id_time_machine [Section:Delete]. Record is NOT deleted (2)");
						return false;
					}
					$dato_time_machine 	= $RecordObj_time_machine->get_dato();
					$dato_section 		= $this->get_dato();

					// before compare, encode and decode the objects to avoid comparison errors
						// $dato_time_machine_compare	= json_decode( json_encode($dato_time_machine) );
						// $dato_section_compare		= json_decode( json_encode($dato_section) );

					if ($dato_time_machine != $dato_section) {
						if(SHOW_DEBUG===true) {
							dump($dato_time_machine,"SHOW_DEBUG COMPARE ERROR dato_time_machine");
							dump($dato_section,"SHOW_DEBUG COMPARE ERROR dato_section");
						}
						#trigger_error("ERROR: Failed compare data of time machine record $id_time_machine [Section:Delete]. Record is NOT deleted (3)");
						throw new Exception("ERROR: Failed compare data of time machine record $id_time_machine [Section:Delete]. Record is NOT deleted (3)", 1);

						return false;
					}


					#
					# SECTION DELETE
					# Delete matrix record
					$JSON_RecordObj_matrix	= new JSON_RecordObj_matrix($matrix_table, $this->section_id, $section_tipo);
					$JSON_RecordObj_matrix->MarkForDeletion();


					#
					# INVERSE REFERENCES
					# Remove all inverse references to this section
					$this->remove_all_inverse_references();


					#
					# RELATION REFERENCES
					# Remove all relation references (children, model, etc.)
					# $this->remove_all_relation_references();


					#
					# MEDIA
					# Remove media files associated to this section
					$this->remove_section_media_files();


					$logger_msg = "DEBUG INFO ".__METHOD__." Deleted section and children records. delete_mode $delete_mode";
					break;

				// delete the section with dataframe data.
				// this section doesn't has data in DDBB and need to load and delete data from caller section.
				case 'delete_dataframe' :

					if($this->source === 'caller_section' && !empty($this->caller_dataframe)){
						// create the caller section and get his relations data
						$caller_section	= section::get_instance(
							$this->caller_dataframe->section_id,
							$this->caller_dataframe->section_tipo,
							$this->mode,
							true
						);
						$relations_dato	= $caller_section->get_relations( 'relations' );

						// 1 remove old locators (all) of the component with current section_id_key
						// the component could has other locators with different section_id_key that will be preserved.
							$cleaned_locators	= [];
							$section_id_key		= (int)$this->section_id;
							foreach ($relations_dato as $current_locator) {
								if ( isset($current_locator->section_id_key) && $current_locator->section_id_key===$section_id_key ){
									//nothing to do, doesn't stored this locator (it will be deleted)
								}else{
									// add the locators than not match.
									$cleaned_locators[] = $current_locator;
								}
							}

						// Update section dato relations on finish
							$caller_section->dato->relations = $cleaned_locators;

						// save
							$caller_section->Save();


						$logger_msg = "DEBUG INFO ".__METHOD__." Deleted dataframe section. delete_mode $delete_mode";

					}else{

						debug_log(__METHOD__." Dataframe section has not defined source property".to_string(), logger::ERROR);
						return false;
					}
					break;

				default:

					debug_log(__METHOD__." Delete mode not defined ".to_string(), logger::ERROR);
					return false;
			}
			debug_log(__METHOD__." Deleted section '$this->section_id' and their 'children'. delete_mode:'$delete_mode'", logger::DEBUG);

		// publication . Remove published records in MYSQL, etc.
			try {
				diffusion::delete_record($this->tipo, $this->section_id);
			} catch (Exception $e) {
				debug_log(__METHOD__." Error on diffusion::delete_record: ".$e->getMessage(), logger::WARNING);
			}

		// log
			$is_portal = (TOP_TIPO!==$this->tipo);
			# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
			logger::$obj['activity']->log_message(
				'DELETE',
				logger::INFO,
				$this->get_tipo(),
				null,
				array(
					'msg'			=> $logger_msg,
					'section_id'	=> $this->section_id,
					'tipo'			=> $this->tipo,
					'is_portal'		=> intval($is_portal),
					'top_id'		=> TOP_ID,
					'top_tipo'		=> TOP_TIPO,
					'table'			=> $matrix_table,
					'delete_mode'	=> $delete_mode,
					'section_tipo'	=> $this->tipo
				)
			);

		// DEDALO_CACHE_MANAGER : get_ar_filter_cache
			if( DEDALO_CACHE_MANAGER===true ) {
				cache::del_contains( $this->tipo );
			}


		return true;
	}//end Delete




	/**
	* GET_SECTION_REAL_TIPO
	* @return string $section_real_tipo
	*/
	public function get_section_real_tipo() : string {

		if(isset($this->section_real_tipo)) return $this->section_real_tipo;

		$section_real_tipo = section::get_section_real_tipo_static( $this->tipo );
		if ($section_real_tipo!==$this->tipo) {
			# Fix section_real_tipo
			$this->section_real_tipo = $section_real_tipo;
			$this->section_virtual 	 = true;
		}else{
			# Fix section_real_tipo
			$this->section_real_tipo = $section_real_tipo;
			$this->section_virtual 	 = false;
		}

		return $section_real_tipo;
	}//end get_section_real_tipo



	/**
	* GET_SECTION_REAL_TIPO_STATIC
	* @param string $section_tipo
	* @return string $section_real_tipo
	*	If not exists related section, returns the same received section_tipo
	*/
	public static function get_section_real_tipo_static(string $section_tipo) : string {

		$ar_related = common::get_ar_related_by_model($modelo_name='section', $section_tipo);
		if (isset($ar_related[0])) {
			$section_real_tipo = $ar_related[0];
		}else{
			$section_real_tipo = $section_tipo;
		}

		return $section_real_tipo;
	}//end get_section_real_tipo_static



	/**
	* GET CHILDRENS OBJS BY MODELO NAME
	*
	* @param $modelo_name_required
	*	Name of desired filtered model. You can use partial name like 'component_' (string position search is made it)
	* @see class.section.php -> get_ar_authorized_areas_for_user
	* @return $ar_section_obj
	*	Array of objects (usually components) filtered by modelo_name_required with parent = current section id matrix
	*/
	public function get_ar_children_objects_by_modelo_name_in_section(string $modelo_name_required, bool $resolve_virtual=true) : array {

		$ar_section_obj = array();

		if(SHOW_DEBUG===true) {
			$start_time = start_time();
			// global$TIMER;$TIMER[__METHOD__.'_IN_'.$modelo_name_required.'_'.$this->tipo.'_'.$this->mode.'_'.start_time()]=start_time();
		}

		$parent  = intval($this->get_section_id());
		$tipo	 = $this->get_tipo();


			# RESOLVE_VIRTUAL : Resolve virtual section to real
			if($resolve_virtual) {

				# ORIGINAL TIPO : always keeps the original type (current)
				$original_tipo = $tipo;

				# SECTION VIRTUAL
				$section_real_tipo = $this->get_section_real_tipo();
				if($section_real_tipo!=$original_tipo) {

					# OVERWRITE CURRENT SECTION TIPO WITH REAL SECTION TIPO
					$tipo = $section_real_tipo;
				}
			}


		# STATIC CACHE
		$uid = $parent .'_'. $tipo .'_'. $modelo_name_required;
		static $ar_children_objects_by_modelo_name_in_section;
		if(isset($ar_children_objects_by_modelo_name_in_section[$uid])) {

			if(SHOW_DEBUG===true) {
				// global$TIMER;$TIMER[__METHOD__.'_OUT_STATIC_'.$modelo_name_required.'_'.$this->tipo.'_'.$this->mode.'_'.start_time()]=start_time();
				#debug_log(__METHOD__." Returned '$modelo_name_required' for tipo:$this->tipo FROM STATIC CACHE");
			}
			return $ar_children_objects_by_modelo_name_in_section[$uid];
		}


		# GET SECTION ELEMENT CHILDRENS - OBTENEMOS LOS ELEMENTOS HIJOS DE ESTA SECCIÓN
		switch (true) {
			# For buttons only need one level
			case (strpos($modelo_name_required, 'button_')!==false):
				$ar_recursive_childrens = (array)RecordObj_dd::get_ar_childrens($tipo);
				break;
			default:
				$ar_recursive_childrens = (array)section::get_ar_recursive_children($tipo);
		}
		if(SHOW_DEBUG===true) {
			#dump($ar_recursive_childrens, 'ar_recursive_childrens tipo:'.$tipo." - modelo_name_required:$modelo_name_required", array()); dump($this," ");
			#debug_log( __METHOD__." get_ar_children_objects_by_modelo_name_in_section: ".json_encode($modelo_name_required) );
		}


		if( empty($ar_recursive_childrens) ) {
			#throw new Exception(__METHOD__." ar_recursive_childrens is empty! This section don't have: '$modelo_name_required' ");
			#debug_log(__METHOD__." ar_recursive_childrens is empty! This section id=$parent don't have: '$modelo_name_required' (tipo:$tipo) 384 ". __METHOD__ );
			return NULL	;
		}

		# Recorremos los elementos hijos de la sección actual en el tesauro
		foreach($ar_recursive_childrens as $terminoID) {

			# Clear obj on every iteration
			$current_obj 		= null;
			$modelo_name		= RecordObj_dd::get_modelo_name_by_tipo($terminoID, true);


			# Filtramos para cargar sólo los del modelo deseado
			if( strpos($modelo_name, $modelo_name_required)===false ) continue; # Skip


			# Construimos el objeto (en función del tipo deseado se construye de forma distinta: component, button, etc..)
			switch(true) {

				# Build component obj
				case (strpos($modelo_name, 'component_')!==false) :

					$current_obj = component_common::get_instance($modelo_name, $terminoID, $parent,'edit', DEDALO_DATA_LANG, $this->tipo ); #$id=NULL, $tipo=NULL, $mode='edit', $parent=NULL, $lang=DEDALO_DATA_LANG
					break;

				# Build button obj
				case (strpos($modelo_name, 'button_')!==false) :

					if ($modelo_name==='button_delete') break; # Skip Delete buttons

					$current_obj = new $modelo_name($terminoID, $target=$parent, $this->tipo);
					$current_obj->set_context_tipo($tipo);
					break;

				default :
					trigger_error("Sorry, element $modelo_name is not defined for build object");
			}


			# Add well formed object to array
				if(is_object($current_obj)) {
					$ar_section_obj[] = $current_obj;
				}
		}

		// STORE CACHE DATA
		$ar_children_objects_by_modelo_name_in_section[$uid] = $ar_section_obj ;


		return $ar_section_obj;
	}//end get_ar_children_objects_by_modelo_name_in_section



	/**
	* GET_SECTION_AR_CHILDREN_TIPO
	* @param string $section_tipo
	* @param array $ar_modelo_name_required
	* @param bool $from_cache
	*	default true
	* @param bool $resolve_virtual
	*	Force resolve section if is virtual section. default false
	*	Name of desired filtered model array. You can use partial name like 'component_' (string position search is made it)
	* @return array $section_ar_children_tipo
	*/
	public static function get_ar_children_tipo_by_modelo_name_in_section(
			string $section_tipo,
			array $ar_modelo_name_required,
			bool $from_cache=true,
			bool $resolve_virtual=false, // (!) keep default resolve_virtual=false
			bool $recursive=true,
			bool $search_exact=false,
			$ar_tipo_exclude_elements=false
		) : array {

		# AR_MODELO_NAME_REQUIRED cast 'ar_modelo_name_required' to array
		$ar_modelo_name_required = (array)$ar_modelo_name_required;

		static $cache_ar_children_tipo;
		$cache_uid = $section_tipo.'_'.serialize($ar_modelo_name_required).'_'.(int)$resolve_virtual.'_'.(int)$recursive;
		if ($from_cache===true) {
			if (isset($cache_ar_children_tipo[$cache_uid])) {
				return $cache_ar_children_tipo[$cache_uid];
			}
			// elseif (isset($_SESSION['dedalo']['config']['ar_children_tipo_by_modelo_name_in_section'][$cache_uid])) {
			// 	return $_SESSION['dedalo']['config']['ar_children_tipo_by_modelo_name_in_section'][$cache_uid];
			// }
		}

		$ar_terminos_relacionados_to_exclude = [];

		#
		# RESOLVE_VIRTUAL : Resolve virtual section to real
		if(true===$resolve_virtual) {

			# ORIGINAL TIPO : always keeps the original type (current)
			$original_tipo = $section_tipo;

			# SECTION VIRTUAL
			$section_real_tipo = section::get_section_real_tipo_static($section_tipo);

			if($section_real_tipo!==$original_tipo) {

				# OVERWRITE CURRENT SECTION TIPO WITH REAL SECTION TIPO
				$section_tipo = $section_real_tipo;

				# EXCLUDE ELEMENTS
				if ($ar_tipo_exclude_elements===false) {
					$ar_tipo_exclude_elements = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
						$original_tipo, // tipo
						$modelo_name='exclude_elements', // modelo_name
						$relation_type='children', // relation_type
						$search_exact // search_exact
					);
				}
				if (!isset($ar_tipo_exclude_elements[0])) {
					#throw new Exception("Error Processing Request. exclude_elements of section $original_tipo not found. Exclude elements is mandatory (1)", 1);
					error_log("Warning. exclude_elements of section $original_tipo not found (1)");
				}else{

					$tipo_exclude_elements = $ar_tipo_exclude_elements[0];

					$ar_terminos_relacionados_to_exclude = RecordObj_dd::get_ar_terminos_relacionados($tipo_exclude_elements, $cache=false, $simple=true);

					foreach ($ar_terminos_relacionados_to_exclude as $key => $component_tipo) {

						$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
						if($modelo_name==='section_group') {
							$ar_recursive_childrens 			 = (array)section::get_ar_recursive_children($component_tipo);
							$ar_terminos_relacionados_to_exclude = array_merge($ar_terminos_relacionados_to_exclude,$ar_recursive_childrens);
						}

					}//end foreach ($ar_terminos_relacionados_to_exclude as $key => $component_tipo) {
				}

			}//end if($section_real_tipo!=$original_tipo) {
		}//end if($resolve_virtual)

		$tipo						= $section_tipo;
		$section_ar_children_tipo	= array();


		# OBTENEMOS LOS ELEMENTOS HIJOS DE ESTA SECCIÓN
		if (count($ar_modelo_name_required)>1) {

			if (true===$recursive) { // Default is recursive
				$ar_recursive_childrens = (array)section::get_ar_recursive_children($tipo);
			}else{
				$RecordObj_dd			= new RecordObj_dd($tipo);
				$ar_recursive_childrens = (array)$RecordObj_dd->get_ar_childrens_of_this();
			}

		}else{

			switch (true) {
				// Components are searched recursively
				case (strpos($ar_modelo_name_required[0], 'component')!==false && $recursive!==false):
					$ar_recursive_childrens = (array)section::get_ar_recursive_children($tipo);
					break;
				// Others (section_xx, buttons, etc.) are in the first level
				default:
					$RecordObj_dd			= new RecordObj_dd($tipo);
					$ar_recursive_childrens = (array)$RecordObj_dd->get_ar_childrens_of_this();
					break;
			}
		}

		if( empty($ar_recursive_childrens) ) {
			#throw new Exception(__METHOD__." ar_recursive_childrens is empty! This section don't have: '$modelo_name_required' ");
			#debug_log(__METHOD__." ar_recursive_childrens is empty! This section id=$parent don't have: '$modelo_name_required' ". __METHOD__ );
			return $section_ar_children_tipo; # return empty array
		}

		# UNSET the exclude elements of the virtual section to the original section
		if($resolve_virtual) {
			$ar_recursive_childrens = array_diff($ar_recursive_childrens,$ar_terminos_relacionados_to_exclude);
		}
		# Recorremos los elementos hijos de la sección actual en el tesauro
		foreach($ar_recursive_childrens as $current_terminoID) {

			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_terminoID, true);
			foreach((array)$ar_modelo_name_required as $modelo_name_required) {

				if (strpos($modelo_name, $modelo_name_required)!==false && !in_array($current_terminoID, $section_ar_children_tipo) ) {

					if($search_exact===true && $modelo_name!==$modelo_name_required) {
						# No is accepted model
					}else{
						$section_ar_children_tipo[] = $current_terminoID;
					}
				}

				# COMPONENT_FILTER : Si buscamos 'component_filter', sólo devolveremos el primero, dado que pueden haber secciones anidadas
				if($ar_modelo_name_required[0]==='component_filter' && count($ar_recursive_childrens)>1) {
					if(SHOW_DEBUG===true) {
						#debug_log(__METHOD__." Broken loop for search 'component_filter' in section $section_tipo ".count($ar_recursive_childrens). " " .to_string($ar_modelo_name_required));
						#throw new Exception("Error Processing Request", 1);
					}
					continue;
				}
			}
		}//end foreach($ar_recursive_childrens as $current_terminoID)

		// Cache session store
		$cache_ar_children_tipo[$cache_uid] = $section_ar_children_tipo;
		// $_SESSION['dedalo']['config']['ar_children_tipo_by_modelo_name_in_section'][$cache_uid] = $section_ar_children_tipo;


		return $section_ar_children_tipo;
	}//end get_ar_children_tipo_by_modelo_name_in_section



	/**
	* GET_AR_RECURSIVE_CHILDREN : private alias of RecordObj_dd::get_ar_recursive_childrens
	* Note the use of $ar_exclude_models to exclude not desired section elements, like auxiliary sections in ich
	* @param string $tipo
	* @return array $ar_recursive_children
	*/
	public static function get_ar_recursive_children(string $tipo) : array {

		# AR_EXCLUDE_MODELS
		# Current elements and children are not considerate part of section and must be excluded in children results
		$ar_exclude_models = [
			'box elements',
			'area'
		];

		$ar_recursive_children = RecordObj_dd::get_ar_recursive_childrens(
			$tipo, // string tipo
			false, // bool is recursion
			$ar_exclude_models, // array ar_exclude_models
			'norden' // string order
		);

		return (array)$ar_recursive_children;
	}//end get_ar_recursive_children




	/**
	* GET_SECTION_BUTTONS_TIPO
	* Calculates current section buttons tipo considering virtual section cases
	* @return array $ar_buttons_tipo
	*/
	public function get_section_buttons_tipo() : array {

		// section_real_tipo
			$section_real_tipo = $this->get_section_real_tipo();

		// section virtual case
		if ($section_real_tipo!==$this->tipo) {

			// ar_excluded_tipo. Exclude elements of layout edit
			// vars: $section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=false, $recursive=true, $search_exact=false, $ar_tipo_exclude_elements=false
				$ar_excluded_tipo			= false;
				$ar_exclude_elements_tipo	= section::get_ar_children_tipo_by_modelo_name_in_section(
					$this->tipo, // section_tipo
					['exclude_elements'], // ar_modelo_name_required
					true // from_cache
				);
				if (!isset($ar_exclude_elements_tipo[0])) {
					error_log("Warning. exclude_elements of section $this->tipo not found (2). All virtual section must has defined exclude_elements");
				}else{
					// locate excluded tipos (related terms) in this virtual section
					$ar_excluded_tipo = RecordObj_dd::get_ar_terminos_relacionados($ar_exclude_elements_tipo[0], $cache=false, $simple=true);
				}

			// real section
				$children_real_tipo = section::get_ar_children_tipo_by_modelo_name_in_section(
					$section_real_tipo, // section_tipo
					['button_'], // ar_modelo_name_required
					true, // from_cache
					false, // resolve_virtual
					false, // recursive
					false, // search_exact
					$ar_excluded_tipo // ar_tipo_exclude_elements
				);

			// virtual section. Add the specific buttons of the virtual section, if the virtual have buttons add to the list.
				$children_virtual_tipo = section::get_ar_children_tipo_by_modelo_name_in_section(
					$this->tipo, // section_tipo
					['button_'], // ar_modelo_name_required
					true, // from_cache
					false, // resolve_virtual
					false, // recursive
					false, // search_exact
					$ar_excluded_tipo // ar_tipo_exclude_elements
				);

			$ar_buttons_tipo = array_merge($children_virtual_tipo, $children_real_tipo);

		}else{

			// if the section is a real section, add the buttons directly
			$ar_buttons_tipo = section::get_ar_children_tipo_by_modelo_name_in_section(
				$this->tipo, // section_tipo
				['button_'], // ar_modelo_name_required
				true, // from_cache
				false, // resolve_virtual
				false, // recursive
				false, // search_exact
				false //ar_tipo_exclude_elements
			);

		}//end if ($this->section_virtual==true )


		return $ar_buttons_tipo;
	}//end get_section_buttons_tipo




	/**
	* GET_BUTTON
	* @return object|null $button_object
	*/
	public function get_button(string $modelo_name) : ?object {

		$ar_buttons = (array)$this->get_ar_children_objects_by_modelo_name_in_section($modelo_name,false);
		foreach ($ar_buttons as $current_button_object) {
			return $current_button_object;	# Only first element
		}

		return null;
	}//end get_button



	/**
	* GET_AR_ALL_PROJECT_LANGS
	* Alias of static method common::get_ar_all_project_langs
	* @return array $ar_all_project_langs
	*	(like lg-spa, lg-eng)
	*/
	public function get_ar_all_project_langs() : array {

		$ar_all_project_langs = common::get_ar_all_langs();

		return (array)$ar_all_project_langs;
	}//end get_ar_all_project_langs



	/**
	* GET_SECTION_TIPO : alias of $this->get_tipo()
	*/
	public function get_section_tipo() : string {

		return $this->get_tipo();
	}//end get_section_tipo



	/**
	* SET_CREATED_DATE
	* @param string $timestamp
	*	$date is timestamp as "2016-06-15 20:01:15" or "2016-06-15"
	* This method is used mainly in importations
	*/
	public function set_created_date(string $timestamp) : void {

		$date = dd_date::get_date_with_format( $timestamp, $format="Y-m-d H:i:s" );

		$dato = $this->get_dato(); // Force load
		$dato->created_date = $date;
		$this->set_dato($dato); // Force update
	}//end set_created_date



	/**
	* SET_MODIFIED_DATE
	* @param string $timestamp
	*	$date is timestamp as "2016-06-15 20:01:15" or "2016-06-15"
	* This method is used mainly in importations
	*/
	public function set_modified_date(string $timestamp) : void {

		$date = dd_date::get_date_with_format( $timestamp, $format="Y-m-d H:i:s" );

		$dato = $this->get_dato(); // Force load
		$dato->modified_date = $date;
		$this->set_dato($dato); // Force update
	}//end set_modified_date



	/**
	* GET_CREATED_DATE
	* @return string|null $valor_local
	*/
	public function get_created_date() : ?string {

		$dato = $this->get_dato();
		if( !isset($dato->created_date) ){
			return false;
		}

		$valor_local = component_date::timestamp_to_date($dato->created_date, $full=true);

		return $valor_local;
	}//end get_created_date



	/**
	* GET_MODIFIED_DATE
	* @return string|null $valor_local
	*/
	public function get_modified_date() : ?string {

		$dato = $this->get_dato();
		if( !isset($dato->modified_date) ){
			return false;
		}

		$valor_local = component_date::timestamp_to_date($dato->modified_date, $full=true);

		return $valor_local;
	}//end get_modified_date



	/**
	* GET_CREATED_BY_USERID
	* Get section dato property 'created_by_userID'
	* @return int|null $created_by_userID
	*/
	public function get_created_by_userID() : ?int {

		$dato = $this->get_dato();
		if( isset($dato->created_by_userID) )  {
			return $dato->created_by_userID;
		}

		return false;
	}//end get_created_by_userID



	/**
	* GET_CREATED_BY_USER_NAME
	*/
	public function get_created_by_user_name(bool $full_name=false) : ?string {

		$dato = $this->get_dato();

		if( !isset($dato->created_by_userID) ) {
			return null;
		}
		$user_id = $dato->created_by_userID;
		if( !$user_id ) {
			return null;
		}

		$username_tipo = ($full_name===true)
			? DEDALO_FULL_USER_NAME_TIPO
			: DEDALO_USER_NAME_TIPO;

		$component_input_text = component_common::get_instance(
			'component_input_text',
			$username_tipo,
			$user_id,
			'edit',
			DEDALO_DATA_NOLAN,
			DEDALO_SECTION_USERS_TIPO
		);
		$user_name = $component_input_text->get_valor();

		return $user_name;
	}//end get_created_by_user_name



	/**
	* GET_MODIFIED_BY_USER_NAME
	* @return string|null $user_name
	*/
	public function get_modified_by_user_name() : ?string {

		$dato = $this->get_dato();
		if( !isset($dato->modified_by_userID) ){
			return null;
		}
		$user_id = $dato->modified_by_userID;
		if( !$user_id ) {
			return null;
		}

		$component_input_text = component_common::get_instance('component_input_text',DEDALO_USER_NAME_TIPO, $user_id, 'edit', DEDALO_DATA_NOLAN, DEDALO_SECTION_USERS_TIPO);
		$user_name = $component_input_text->get_valor();

		return $user_name;
	}//end get_modified_by_user_name



	/**
	* GET_USER_NAME_BY_USERID
	* @return string $usesr_name
	*/
	public static function get_user_name_by_userID(int $userID) : string {

		if($userID==DEDALO_SUPERUSER){
			$user_name = 'Admin debuger';
		}else{
			$username_model = RecordObj_dd::get_modelo_name_by_tipo(DEDALO_FULL_USER_NAME_TIPO,true);
			$obj_user_name	= component_common::get_instance($username_model, // 'component_input_text',
															 DEDALO_FULL_USER_NAME_TIPO,
															 $userID,
															 'list',
															 DEDALO_DATA_NOLAN,
															 DEDALO_SECTION_USERS_TIPO);
			$user_name = $obj_user_name->get_valor();
		}

		return $user_name;
	}//end get_user_name_by_userID



	/**
	* GET_SECTION_INFO
	* @param string $format
	* @return object|string|null
	*/
	public function get_section_info(string $format='json') {

		$section_info = new stdClass();

			$section_info->created_date 			= (string)$this->get_created_date();
			$section_info->created_by_user_name		= (string)$this->get_created_by_user_name();
			$section_info->modified_date 			= (string)$this->get_modified_date();
			$section_info->modified_by_user_name	= (string)$this->get_modified_by_user_name();

			$section_info->label					= (string)rawurlencode($this->get_label());
			$section_info->section_id				= (string)$this->get_section_id();

		// publication info
			$section_info->publication_first		= array(
				'label' => RecordObj_dd::get_termino_by_tipo(diffusion::$publication_first_tipo, DEDALO_DATA_LANG, true, true),
				'value' => $this->get_publication_date(diffusion::$publication_first_tipo)
			);
			$section_info->publication_last			= array(
				'label' => RecordObj_dd::get_termino_by_tipo(diffusion::$publication_last_tipo, DEDALO_DATA_LANG, true, true),
				'value' => $this->get_publication_date(diffusion::$publication_last_tipo)
			);
			$section_info->publication_first_user	= array(
				'label' => null, // RecordObj_dd::get_termino_by_tipo(diffusion::$publication_first_user_tipo, DEDALO_DATA_LANG, true, true),
				'value' => $this->get_publication_user(diffusion::$publication_first_user_tipo)
			);
			$section_info->publication_last_user	= array(
				'label' => null, // RecordObj_dd::get_termino_by_tipo(diffusion::$publication_last_user_tipo, DEDALO_DATA_LANG, true, true),
				'value' => $this->get_publication_user(diffusion::$publication_last_user_tipo)
			);

		switch ($format) {
			case 'json':
				return json_handler::encode($section_info);
				break;

			default:
				return $section_info;
				break;
		}

		return null;
	}//end get_section_info



	/**
	* GET_PUBLICATION_DATE
	* @param string $component_tipo
	* @return string|null $local_date
	*/
	public function get_publication_date(string $component_tipo) : ?string {

		// tipos
			$section_id		= $this->section_id;
			$section_tipo	= $this->tipo;

		// component
			$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$modelo_name,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$dato = $component->get_dato();

		// local_date
			if (empty($dato)) {

				$local_date = null;

			}else{

				$current_date	= reset($dato);
				$dd_date		= new dd_date($current_date->start);
				$timestamp		= $dd_date->get_dd_timestamp();
				$local_date		= component_date::timestamp_to_date($timestamp, true); // string|null
			}


		return $local_date;
	}//end get_publication_date



	/**
	* GET_PUBLICATION_USER
	* @param string $component_tipo
	* @return string|null $user_name
	*/
	public function get_publication_user(string $component_tipo) : ?string {

		// tipos
			$section_id		= $this->section_id;
			$section_tipo	= $this->tipo;

		// component
			$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$modelo_name,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$dato = $component->get_dato();

		// user name
			if (empty($dato)) {

				$user_name = null;

			}else{
				$user_id	= reset($dato)->section_id;
				// $user_name	= section::get_user_name_by_userID($user_id);
				$component_input_text = component_common::get_instance('component_input_text',DEDALO_USER_NAME_TIPO, $user_id, 'edit', DEDALO_DATA_NOLAN, DEDALO_SECTION_USERS_TIPO);
				$user_name = $component_input_text->get_valor();
			}

		return $user_name;
	}//end get_publication_user



	/**
	* GET_AR_CHILDRENS_BY_MODEL
	* Get the children of the section by modelo_name required
	* children like relation_list or time machine_list
	* @param string $section_tipo
	* @param array $ar_modelo_name_required
	* @return string|null $first_child
	*/
	public static function get_ar_childrens_by_model(string $section_tipo, array $ar_modelo_name_required) : ?string {

		if(SHOW_DEBUG) $start_time = start_time();

		$current_section_tipo = $section_tipo;

		// $ar_modelo_name_required = [$modelo_name];

		// Locate children element in current section (virtual ot not)
		$ar_childrens = section::get_ar_children_tipo_by_modelo_name_in_section(
			$current_section_tipo,
			$ar_modelo_name_required, // ar_modelo_name_required
			$from_cache=true,
			false, // resolve_virtual
			$recursive=false,
			$search_exact=true
		);

		// If not found children, try resolving real section
		if (empty($ar_childrens)) {
			$resolve_virtual = true;
			$ar_childrens = section::get_ar_children_tipo_by_modelo_name_in_section(
				$current_section_tipo,
				$ar_modelo_name_required,
				$from_cache=true,
				true, // resolve_virtual
				$recursive=false,
				$search_exact=true
			);
		}// end if (empty($ar_childrens))

		if(isset($ar_childrens[0])){
			$first_child = $ar_childrens[0];
			return $first_child;
		}

		return null;
	}//end get_ar_childrens_by_model



	/**
	* GET_AR_ALL_SECTION_RECORDS_UNFILTERED
	* @see diffusion::build_table_data_recursive
	*
	* @param string $section_tipo
	* @return array $ar_records
	*/
	public static function get_ar_all_section_records_unfiltered( string $section_tipo ) : array {

		$result = section::get_resource_all_section_records_unfiltered($section_tipo);

		if(SHOW_DEBUG===true) {
			$n_rows = pg_num_rows($result);
			if ($n_rows>1000) {
				debug_log(__METHOD__." WARNING: TOO MUCH RESULTS IN QUERY. TO OPTIMIZE MEMORY NOT STORE RESULTS IN ARRAY IN THIS SEARCH. BETTER USE 'get_resource_all_section_records_unfiltered' ".to_string(), logger::ERROR);
			}
		}
		$ar_records=array();
		while ($rows = pg_fetch_assoc($result)) {
			$ar_records[] = $rows['section_id'];
		}

		return $ar_records;
	}//end get_ar_all_section_records_unfiltered



	/**
	* GET_RESOURCE_ALL_SECTION_RECORDS_UNFILTERED
	* @param string $section_tipo
	* @param string $select = 'section_id'
	* @return resource $result
	*/
	public static function get_resource_all_section_records_unfiltered( string $section_tipo, string $select='section_id' ) {

		$matrix_table	= common::get_matrix_table_from_tipo($section_tipo);
		$strQuery		= "-- ".__METHOD__." \nSELECT $select FROM \"$matrix_table\" WHERE section_tipo = '$section_tipo' ORDER BY section_id ASC ";
		$result			= JSON_RecordObj_matrix::search_free($strQuery);

		return $result;
	}//end get_resource_all_section_records_unfiltered



	/**
	* GET_COMPONENTS_WITH_MEDIA_CONTENT
	* Return array with model names of defined as 'media components'.
	* Used to locate components to remove media content
	* @return array
	*/
	public static function get_components_with_media_content() : array {

		$components_with_media_content = array_merge(
			component_media_common::get_media_components(), // 'component_av','component_image','component_pdf','component_svg'
			[
				'component_html_file' // component_html_file. Could include user uploaded files
			]
		);

		return $components_with_media_content;
	}//end get_components_with_media_content



	/**
	* REMOVE_SECTION_MEDIA_FILES
	* "Remove" (rename and move files to deleted folder) all media file linked to current section (all quality versions)
	* @see section->Delete
	* @return array|null
	* 	Array of objects (removed components info)
	*/
	protected function remove_section_media_files() : ?array {

		$ar_removed = [];

		// short vars
			$section_tipo		= $this->tipo;
			$section_id			= $this->section_id;
			$section_dato		= $this->get_dato();
			$ar_media_elements	= section::get_components_with_media_content();

		// section components property empty case
			if (!isset($section_dato->components) || empty($section_dato->components)) {
				debug_log(__METHOD__." Nothing to remove ".to_string(), logger::DEBUG);
				return $ar_removed;
			}

		// components into section dato
			foreach ($section_dato->components as $component_tipo => $component_value) {

				$model = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				if (!in_array($model, $ar_media_elements)) continue; # Skip

				$lang		= common::get_element_lang($component_tipo, DEDALO_DATA_LANG);
				$component	= component_common::get_instance(
					$model,
					$component_tipo,
					$section_id,
					'edit',
					$lang,
					$section_tipo
				);
				if ( false===$component->remove_component_media_files() ) {
					debug_log(__METHOD__." Error on remove_section_media_files: model:$model, tipo:$component_tipo, section_id:$section_id, section_tipo:$section_tipo", logger::ERROR);
					continue;
				}

				$ar_restored[] = (object)[
					'tipo'	=> $component_tipo,
					'model'	=> $model
				];

				debug_log(__METHOD__." removed media files from  model:$model, tipo:$component_tipo, section_id:$section_id, section_tipo:$section_tipo", logger::WARNING);
			}//end foreach


		return $ar_removed;
	}//end remove_section_media_files



	/**
	* RESTORE_DELETED_SECTION_MEDIA_FILES
	* Use when recover section from time machine. Get files "deleted" (renamed in 'deleted' folder) and move and rename to the original media folder
	* @return array|null
	* 	Array of objects (restored components info)
	*/
	public function restore_deleted_section_media_files() : ?array {

		$ar_restored = [];

		// short vars
			$section_tipo		= $this->tipo;
			$section_id			= $this->section_id;
			$section_dato		= $this->get_dato();
			$ar_media_elements	= section::get_components_with_media_content();

		// section components property empty case
			if (!isset($section_dato->components) || empty($section_dato->components)) {
				debug_log(__METHOD__." Nothing to restore ".to_string(), logger::DEBUG);
				return $ar_restored;
			}

		// components into section dato
			foreach ($section_dato->components as $component_tipo => $component_value) {

				$model = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				if (!in_array($model, $ar_media_elements)) continue; # Skip

				$lang		= common::get_element_lang($component_tipo, DEDALO_DATA_LANG);
				$component	= component_common::get_instance(
					$model,
					$component_tipo,
					$section_id,
					'edit',
					$lang,
					$section_tipo
				);
				if ( false===$component->restore_component_media_files() ) {
					debug_log(__METHOD__." Error on restore_deleted_section_media_files: model:$model, tipo:$component_tipo, section_id:$section_id, section_tipo:$section_tipo", logger::ERROR);
					continue;
				}

				$ar_restored[] = (object)[
					'tipo'	=> $component_tipo,
					'model'	=> $model
				];

				debug_log(__METHOD__." restored media files from  model:$model, tipo:$component_tipo, section_id:$section_id, section_tipo:$section_tipo", logger::WARNING);
			}//end foreach


		return $ar_restored;
	}//end restore_deleted_section_media_files



	/**
	* FORCED_CREATE_RECORD :
	* Check if the section exists in the DB, if the section exist, return true, else create new section with
	* the section_id and section_tipo into the database and return true.
	* Default value component filter is saved too for maintain accessibility
	* @return bool true is insert / false if not
	*/
	public function forced_create_record() : bool {

		$start_time = start_time();

		if(is_null($this->section_id)) {

			// Save to obtain a new incremental section_id
			#debug_log(__METHOD__." == SECTION : Record already exists ($this->section_id, $section_tipo) ".to_string(), logger::DEBUG);
			$this->Save();
			return true;

		}else{

			// Check if section_id already exists
				$section_tipo = $this->tipo;
				$matrix_table = common::get_matrix_table_from_tipo($section_tipo);

				$strQuery = "SELECT section_id FROM \"$matrix_table\" WHERE section_id = $this->section_id AND section_tipo = '$section_tipo' ";
				$result	  = JSON_RecordObj_matrix::search_free($strQuery);
				$num_rows = pg_num_rows($result);

				# Record already exists. Not continue
				if($num_rows>0) {
					debug_log(__METHOD__." == SECTION : Record already exists ($this->section_id, $section_tipo) ".to_string(), logger::ERROR);
					return false;
				}

			// section_id not exists. Create a new section record // ADDED 27-12-2018
				#debug_log(__METHOD__." == SECTION : Creating new forced record ($this->section_id, $section_tipo) ".to_string(), logger::DEBUG);
				$save_options = new stdClass();
					$save_options->forced_create_record = $this->section_id;
				$this->Save($save_options);
		}

		return true;
	}//end forced_create_record



	### /DIFFUSION INFO #####################################################################################



	/**
	* GET_DIFFUSION_INFO
	* Get property 'diffusion_info' from section dato
	* @return object|null $diffusion_info
	*/
	public function get_diffusion_info() : ?object {

		$dato = $this->get_dato();
		if(is_object($dato) && property_exists($dato, 'diffusion_info')) {
			return $dato->diffusion_info;
		}

		return null;
	}//end get_diffusion_info



	/**
	* DIFFUSION_INFO_ADD
	* @param string $diffusion_element_tipo
	* @return bool
	*/
	public function diffusion_info_add(string $diffusion_element_tipo) : bool {

		$dato = $this->get_dato();

		if (!isset($dato->diffusion_info) || !is_object($dato->diffusion_info)) {	// property_exists($dato, 'diffusion_info')
			$dato->diffusion_info = new stdClass();
		}
		if (!isset($dato->diffusion_info->$diffusion_element_tipo)) {

			$diffusion_element_data = new stdClass();
				$diffusion_element_data->date 	 = date('Y-m-d H:i:s');;
				$diffusion_element_data->user_id = $_SESSION['dedalo']['auth']['user_id'];

			$dato->diffusion_info->$diffusion_element_tipo = $diffusion_element_data;

			$this->set_dato($dato); // Force update section dato
		}

		return true;
	}//end diffusion_info_add



	/**
	* DIFFUSION_INFO_PROPAGATE_CHANGES
	* Resolve section caller to current section (from inverse locators)
	* and set every diffusion info as null to set publication as Outdated
	* @return bool
	*/
	public function diffusion_info_propagate_changes() : bool {

		$inverse_locators = $this->get_inverse_locators();

		foreach((array)$inverse_locators as $locator) {

			$current_section_tipo = $locator->from_section_tipo;
			$current_section_id   = $locator->from_section_id;

			$section = section::get_instance($current_section_id, $current_section_tipo, $mode='list');
			$dato 	 = $section->get_dato();

			if (!empty($dato->diffusion_info)) {

				// Unset section diffusion_info in section dato
				$dato->diffusion_info = null; // Default value

				// Update section whole dato
				$section->set_dato($dato);

				// Save section with updated dato
				$section->Save();
				debug_log(__METHOD__." Propagated diffusion_info changes to section  $current_section_tipo, $current_section_id ".to_string(), logger::DEBUG);
			}else{
				debug_log(__METHOD__." Unnecessary do diffusion_info changes to section  $current_section_tipo, $current_section_id ".to_string(), logger::DEBUG);
			}
		}

		return true;
	}//end diffusion_info_propagate_changes



	### INVERSE LOCATORS / REFERENCES #####################################################################################



	/**
	* GET_INVERSE_LOCATORS
	* Alias of section->get_inverse_references
	* @return array $inverse_locators
	*/
	public function get_inverse_locators() : array {

		return $this->get_inverse_references();
	}//end get_inverse_locators



	/**
	* GET_INVERSE_REFERENCES
	* Get calculated inverse locators for all matrix tables
	* @see search::calculate_inverse_locator
	* @return array $inverse_locators
	*/
	public function get_inverse_references() : array {

		if (empty($this->section_id)) {
			# Section not exists yet. Return empty array
			return array();
		}

		#$inverse_locators = search::get_inverse_relations_from_relations_table($this->tipo, $this->section_id);

		# Create a minimal locator based on current section
		$reference_locator = new locator();
			$reference_locator->set_section_tipo($this->tipo);
			$reference_locator->set_section_id($this->section_id);

		# Get calculated inverse locators for all matrix tables
		$ar_inverse_locators = search_related::get_referenced_locators( $reference_locator );


		return (array)$ar_inverse_locators;
	}//end get_inverse_references



	/**
	* REMOVE_ALL_INVERSE_REFERENCES
	* @return array $removed_locators
	*/
	public function remove_all_inverse_references() : array {

		$removed_locators = [];

		$inverse_locators = $this->get_inverse_locators();
		foreach ((array)$inverse_locators as $current_locator) {

			$component_tipo = $current_locator->from_component_tipo;
			$section_tipo 	= $current_locator->from_section_tipo;
			$section_id 	= $current_locator->from_section_id;

			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo( $component_tipo, true );
			#if ($modelo_name!=='component_portal' && $modelo_name!=='component_autocomplete' && $modelo_name!=='component_relation_children') {
			if ('component_relation_common' !== get_parent_class($modelo_name)) {
				if(SHOW_DEBUG===true) {
					trigger_error("ERROR (remove_all_inverse_references): Only portals are supported!! Ignored received: $modelo_name");
				}
				continue;
			}

			$component = component_common::get_instance(
				$modelo_name,
				$component_tipo,
				$section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			$locator_to_remove = new locator();
				$locator_to_remove->set_section_tipo($this->tipo);
				$locator_to_remove->set_section_id($this->section_id);
				$locator_to_remove->set_type($component->get_relation_type());
				$locator_to_remove->set_from_component_tipo($component_tipo);

			if (true === $component->remove_locator_from_dato( $locator_to_remove )) {
				// Save component dato
				$component->Save();

				$removed_locators[] = [
					"removed_from" 		=> $current_locator,
					"locator_to_remove" => $locator_to_remove
				];

				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__." !!!! Removed inverse reference to tipo:$this->tipo, section_id:$this->section_id in $modelo_name: tipo:$current_locator->from_component_tipo, section_id:$current_locator->from_section_id, section_tipo:$current_locator->from_section_tipo ", logger::DEBUG);
				}
			}else{
				debug_log(__METHOD__." Error on remove reference to current_locator ".json_encode($current_locator), logger::ERROR);
			}
		}


		return $removed_locators;
	}//end remove_all_inverse_references



	/**
	* GET_RELATION_LIST
	* get the relation_list tipo for the section
	* @return string|null $relation_list_tipo
	*/
	public function get_relation_list() : ?string {

		$section_tipo		= $this->tipo;
		$relation_list_tipo	= section::get_ar_childrens_by_model($section_tipo, ['relation_list']) ?? null;

		$permissions = !empty($relation_list_tipo)
			? common::get_permissions($section_tipo, $relation_list_tipo)
			: null;

		if(isset($permissions) && $permissions >0 ){
			return $relation_list_tipo;
		}

		return null;
	}//end get_relation_list



	### RELATIONS #####################################################################################



	/**
	* GET_RELATIONS
	* Get section container 'relations' array of locators values
	* Consider the variable in the section when constructing the object ......	*
	* @param string $relations_container = 'relations'
	* @return array $relations
	*/
	public function get_relations( string $relations_container='relations' ) : array {

		# Default array empty
		$relations = [];

		if (empty($this->section_id)) {
			// Section not exists yet. Return empty array
			return $relations;
		}

		$dato = $this->get_dato(); // Force load data
		if( isset($dato->{$relations_container}) )  {
			$relations = (array)$dato->{$relations_container};
		}

		return $relations;
	}//end get_relations



	/**
	* ADD_RELATION
	* @param object $locator
	*	locator with valid 'type' property defined mandatory
	* @param string $relations_container = 'relations'
	* @return bool
	*/
	public function add_relation( object $locator, string $relations_container='relations' ) : bool {

		if(empty($locator)) {
			debug_log(__METHOD__." Invalid empty locator is received to add. Locator was ignored (type:".gettype($locator).") ".to_string($locator), logger::ERROR);
			return false;
		}

		if (!is_object($locator) || !isset($locator->type)) {
			debug_log(__METHOD__." Invalid locator is received to add. Locator was ignored (type:".gettype($locator).") ".to_string($locator), logger::ERROR);
			if(SHOW_DEBUG===true) {
				throw new Exception("Error Processing Request. var 'locator' not contains property 'type' ", 1);
			}
			return false;
		}

		// section relations data
			$relations	= $this->get_relations( $relations_container );

		// data integrity check: Clean possible bad formed locators (old and beta errors)
			foreach ((array)$relations as $key => $current_relation) {
				if (!is_object($current_relation) ||
					!isset($current_relation->section_id) ||
					!isset($current_relation->section_tipo) ||
					!isset($current_relation->type)
					) {

					debug_log(__METHOD__." Invalid relations locator is received. ".to_string($current_relation), logger::ERROR);

					throw new Exception("Error Processing Request. !! FOUNDED BAD FORMAT RELATION LOCATOR IN SECTION_RELATION DATA: (type:".gettype($current_relation).") ".to_string($current_relation), 1);
				}
				#if ($remove_previous_of_current_type && $current_relation->type===$current_type) {
				#	debug_log(__METHOD__." Removing locator of type $current_type from relation locator: ".to_string($current_relation), logger::DEBUG);
				#	unset($relations[$key]);
				#}
			}
			# maintain array index after unset value. ! Important for encode json as array later (if keys are not correlatives, undesired object is created)
			$relations = array_values($relations);

		# Test if already exists
		/*$ar_properties=array('section_id','section_tipo','type');
		if (isset($locator->from_component_tipo)) 	$ar_properties[] = 'from_component_tipo';
		if (isset($locator->tag_id)) 		 		$ar_properties[] = 'tag_id';
		if (isset($locator->component_tipo)) 		$ar_properties[] = 'component_tipo';
		if (isset($locator->section_top_tipo))		$ar_properties[] = 'section_top_tipo';
		if (isset($locator->section_top_id)) 		$ar_properties[] = 'section_top_id';*/
		$object_exists = locator::in_array_locator( $locator, $ar_locator=$relations);
		if ($object_exists===false) {

			array_push($relations, $locator);
			//$relations[] = $locator;

			# Force load 'dato' if not exists / loaded
			if ( empty($this->dato) && $this->section_id>0 ) {
				$this->get_dato();
			}
			if ( empty($this->dato) || !is_object($this->dato) ) {
				$this->dato = new stdClass();
			}

			# Add to container
			$this->dato->{$relations_container} = (array)$relations;
			//$this->set_relations($relations);

			return true;
		}else{
			debug_log(__METHOD__.' Ignored add locator action: locator already exists: '.json_encode($locator), logger::ERROR);
		}

		return false;
	}//end add_relation



	/**
	* REMOVE_RELATION
	* @param object locator $locator
	*/
	public function remove_relation( $locator, $relations_container='relations' ) {

		$relations = $this->get_relations( $relations_container );


		$ar_properties=array('section_id','section_tipo','type');
		if (isset($locator->from_component_tipo)) 	$ar_properties[] = 'from_component_tipo';
		if (isset($locator->tag_id)) 		 		$ar_properties[] = 'tag_id';
		if (isset($locator->component_tipo)) 		$ar_properties[] = 'component_tipo';
		if (isset($locator->section_top_tipo))		$ar_properties[] = 'section_top_tipo';
		if (isset($locator->section_top_id)) 		$ar_properties[] = 'section_top_id';

		$removed 		= false;
		$new_relations 	= [];
		foreach ($relations as $key => $current_locator_obj) {

			# Test if already exists
			$equal = locator::compare_locators( $current_locator_obj, $locator, $ar_properties );
			if ( $equal===true ) {
				$removed = true;

			}else{

				$new_relations[] = $current_locator_obj;
			}
		}

		# Updates current dato relations with clean array of locators
		if ($removed===true) {

			$this->dato->{$relations_container} = $new_relations;
		}


		return (bool)$removed;
	}//end remove_relation



	/**
	* REMOVE_RELATIONS_FROM_COMPONENT_TIPO
	* Delete all locators of type requested from section relation dato
	* (!) Note that this method do not save
	* @param string $component_tipo
	* @param string $relations_container = 'relations'
	* @return array $ar_deleted_locators
	*/
	public function remove_relations_from_component_tipo( string $component_tipo, string $relations_container='relations' ) : array {

		$relations = $this->get_relations( $relations_container );

		$removed				= false;
		$ar_deleted_locators	= [];
		$new_relations			= [];
		foreach ($relations as $key => $current_locator) {

			# Test if from_component_tipo
			if (isset($current_locator->from_component_tipo) && $current_locator->from_component_tipo===$component_tipo) {
				# Ignored locator
				$ar_deleted_locators[] = $current_locator;
				$removed = true;
				if(SHOW_DEBUG===true) {
					$c_section_label	= RecordObj_dd::get_termino_by_tipo($current_locator->section_tipo);
					$c_scomponent_label	= RecordObj_dd::get_termino_by_tipo($component_tipo);
					// debug_log(__METHOD__." Deleted locator in '$relations_container'. component_tipo:$component_tipo - section_tipo:$current_locator->section_tipo - $c_section_label - $c_scomponent_label " . PHP_EOL . to_string($current_locator), logger::DEBUG);
				}
			}else{
				# Add normally
				$new_relations[] = $current_locator;
			}
		}

		if ($removed===true) {
			# maintain array index after unset value. ! Important for encode JSON as array later (if keys are not correlatives, object is created)
			#$relations = array_values($relations);

			# Update section dato relations on finish
			$this->dato->{$relations_container} = $new_relations;
		}


		return (array)$ar_deleted_locators;
	}//end remove_relations_from_component_tipo




	### /RELATIONS #####################################################################################



	/**
	* GET_SECTION_MAP
	* Section map data is stored in 'properties' of element of model 'section_map' placed in first level of section
	* @param string $section_tipo
	* @return object|null $setion_map
	*/
	public static function get_section_map( string $section_tipo ) : ?object {

		// cache
			static $section_map_cache;
			if(isset($section_map_cache[$section_tipo])) return $section_map_cache[$section_tipo];

		$ar_modelo_name_required	= array('section_map');
		$resolve_virtual			= false;

		// Locate section_map element in current section (virtual or not)
		$ar_children = section::get_ar_children_tipo_by_modelo_name_in_section(
			$section_tipo,
			$ar_modelo_name_required,
			$from_cache=true,
			$resolve_virtual,
			$recursive=false,
			$search_exact=true
		);

		// If not found children, try resolving real section
		if (empty($ar_children)) {
			$resolve_virtual = true;
			$ar_children = section::get_ar_children_tipo_by_modelo_name_in_section(
				$section_tipo,
				$ar_modelo_name_required,
				$from_cache=true,
				$resolve_virtual,
				$recursive=false,
				$search_exact=true
			);
		}

		$section_map = null;
		if( isset($ar_children[0]) ) {

			$tipo			= $ar_children[0];
			$RecordObj_dd	= new RecordObj_dd($tipo);
			$section_map	= $RecordObj_dd->get_properties() ?? null;
		}

		// cache. Store in cache for speed
			$section_map_cache[$section_tipo] = $section_map;


		return $section_map;
	}//end get_section_map




	/**
	* GET_SEARCH_QUERY
	* Used for compatibility of search queries when need filter by section_tipo inside filter (thesaurus case for example)
	* @param object $query_object
	* @return array $ar_query_object
	*/
	public static function get_search_query(object $query_object) : array {

		// component path default
			$query_object->component_path = ['section_tipo'];

		// component class name calling here
			$called_class = get_called_class();

		// component lang
			if (!isset($query_object->lang)) {
				# default
				$query_object->lang = 'all';
			}

		// current_query_object default
			$current_query_object = $query_object;

		// conform each object
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

		// convert to array always
			$ar_query_object = is_array($current_query_object)
				? $current_query_object
				: [$current_query_object];

		return $ar_query_object;
	}//end get_search_query



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @param object $query_object
	* @return object $query_object
	*/
	public static function resolve_query_object_sql( object $query_object ) : object {

		# Always set fixed values
		$query_object->type = 'string';

		# Always set format to column
		$query_object->format = 'column';

		$q = $query_object->q;
		$q = pg_escape_string(DBi::_getConnection(), stripslashes($q));

		$operator = '=';
		$q_clean  = str_replace('\"', '', $q);
		$query_object->operator = $operator;
		$query_object->q_parsed	= '\''.$q_clean.'\'';


		return $query_object;
	}//end resolve_query_object_sql



	/**
	* GET_MODIFIED_SECTION_TIPOS
	* @return array $ar_tipos
	*/
	public static function get_modified_section_tipos() : array {

		$ar_tipos = array(
			array('name'=>'created_by_user', 'tipo'=>'dd200', 'model'=>'component_select'),
			array('name'=>'created_date', 	 'tipo'=>'dd199', 'model'=>'component_date'),
			array('name'=>'modified_by_user','tipo'=>DEDALO_SECTION_INFO_MODIFIED_BY_USER, 'model'=>'component_select'), 	// 'dd197'
			array('name'=>'modified_date', 	 'tipo'=>DEDALO_SECTION_INFO_MODIFIED_DATE, 'model'=>'component_date') 			// 'dd201'
		);

		return $ar_tipos;
	}//end get_modified_section_tipos



	/**
	* GET_MODIFIED_SECTION_TIPOS_BASIC
	* @return
	*/
	public static function get_modified_section_tipos_basic() : array {

		$ar_tipos = array(
			'dd200',
			'dd199',
			DEDALO_SECTION_INFO_MODIFIED_BY_USER,
			DEDALO_SECTION_INFO_MODIFIED_DATE
		);

		return $ar_tipos;
	}//end get_modified_section_tipos_basic



	/**
	* UPDATE_MODIFIED_SECTION_DATA
	* @param object $options
	* @return bool
	*/
	public function update_modified_section_data(object $options) : bool {

		if ($this->tipo===DEDALO_ACTIVITY_SECTION_TIPO) {
			return false;
		}

		// options
			$mode = $options->mode;

		// Fixed private tipos
			$modified_section_tipos = section::get_modified_section_tipos();
				$created_by_user 	= array_filter($modified_section_tipos, function($item){ return $item['name']==='created_by_user'; }); 	// array('tipo'=>'dd200', 'model'=>'component_select');
				$created_date 		= array_filter($modified_section_tipos, function($item){ return $item['name']==='created_date'; }); 		// array('tipo'=>'dd199', 'model'=>'component_date');
				$modified_by_user 	= array_filter($modified_section_tipos, function($item){ return $item['name']==='modified_by_user'; }); 	// array('tipo'=>'dd197', 'model'=>'component_select');
				$modified_date 		= array_filter($modified_section_tipos, function($item){ return $item['name']==='modified_date'; }); 		// array('tipo'=>'dd201', 'model'=>'component_date');

		// Current user locator
			$user_locator = new locator();
				$user_locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO); // dd128
				$user_locator->set_section_id($_SESSION['dedalo']['auth']['user_id']); // logged user
				$user_locator->set_type(DEDALO_RELATION_TYPE_LINK);

		// Current date
			$base_date  = component_date::get_date_now();
			$dd_date  	= new dd_date($base_date);
			$time 		= dd_date::convert_date_to_seconds($dd_date);
			$dd_date->set_time($time);
			$date_now 	= new stdClass();
				$date_now->start = $dd_date;


		switch ($mode) {

			case 'new_record': // new record

				// Created by user
					$created_by_user	= reset($created_by_user);
					$component			= component_common::get_instance(
						$created_by_user['model'],
						$created_by_user['tipo'],
						$this->section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$this->tipo // section_tipo
					);
					$component->set_dato($user_locator);
					#$dato = $component->get_dato();
					#$this->add_relation( reset($dato) );
					$this->set_component_relation_dato($component);
					#$component->save_to_database = false; // Avoid exec db real save
					#$component->Save(); // Only updates section data

				// Creation date
					$created_date 	= reset($created_date);
					$component 		= component_common::get_instance(
						$created_date['model'],
						$created_date['tipo'],
						$this->section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$this->tipo // section_tipo
					);
					$component->set_dato($date_now);
					#$component->save_to_database = false; // Avoid exec db real save
					#$component->Save(); // Only updates section data
					$this->set_component_direct_dato($component);
					#$dato = $component->get_dato();
					#$this->add_relation( reset($dato) );
				break;

			case 'update_record': // update_record (record already exists)

				// Modified by user
					$modified_by_user	= reset($modified_by_user);
					$component			= component_common::get_instance(
						$modified_by_user['model'],
						$modified_by_user['tipo'],
						$this->section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$this->tipo // section_tipo
					);
					$component->set_dato($user_locator);
					#$component->save_to_database = false; // Avoid exec db real save
					#$component->Save(); // Only updates section data
					$this->set_component_relation_dato($component);

				// Modification date
					$modified_date	= reset($modified_date);
					$component		= component_common::get_instance(
						$modified_date['model'],
						$modified_date['tipo'],
						$this->section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$this->tipo // section_tipo
					);
					$component->set_dato($date_now);
					#$component->save_to_database = false; // Avoid exec db real save
					#$component->Save(); // Only updates section data
					$this->set_component_direct_dato($component);
				break;
		}


		return true;
	}//end update_modified_section_data



	/**
	* GET_AR_GROUPER_MODELS
	* @return array $ar_groupers_models
	*/
	public static function get_ar_grouper_models() : array {

		$ar_groupers_models = ['section_group','section_group_div','section_tab','tab'];

		return $ar_groupers_models;
	}//end get_ar_grouper_models



	/**
	* GET_TM_SUBDATUM
	* Used by time machine to get the components and section sub context and subdata.
	* subdatum: is the context and data of every section or component that the caller (this time machine) need to show, search or select
	* ex: if the time machine of the component is a portal that call to toponymy tm it will need the context and data of the pointer section and the components that will be showed or searched.
	* This method use the data of the caller (ar_db_record) to get only the data to be used, ex: only the records of the component in time machine to show.
	* For get the subdatum will used the request_config. If the request_config has external api it will get the section of the ontology that has the representation of the external service (Zenon)
	* @param string $from_parent = null
	* @param array $ar_db_record = []
	* 	Array of natrix_time_machine table found records
	* @return object $subdatum
	* 	Object with two properties: array context, array data
	*	{
	*		context	: [],
	* 		data	: []
	* 	}
	*/
	public function get_tm_subdatum(string $from_parent=null, array $ar_db_record=[]) : object {

		// debug
			// if(SHOW_DEBUG===true) {
			// 	$start_time = start_time();
			// 	$len = !empty($this->tipo)
			// 		? strlen($this->tipo)
			// 		: 0;
			// 	$repeat = ($len < 14)
			// 		? (14 - $len)
			// 		: 0;
			// 	$tipo_line = $this->tipo .' '. str_repeat('-', $repeat);
			// 	$log = "------------------- get_tm_subdatum start ----------- $tipo_line ---- ". get_class($this) .' -- '. ($this->section_tipo ?? $this->tipo).'-'.$this->section_id ; //  .' '.json_encode($ar_db_record, JSON_PRETTY_PRINT)
			// 	error_log($log);
			// }

		$ar_subcontext	= [];
		$ar_subdata		= [];

		// request_config. On empty return empty context and data object
			$request_config = $this->context->request_config ?? null;
			if(empty($request_config)) {
				// no request config case. Return empty here
				return (object)[
					'context'	=> [],
					'data'		=> []
				];
			}

		// ddo_map. Get the full ddo in every request_config
			$full_ddo_map = [];
			foreach ($request_config as $request_config_item) {

				// skip empty ddo_map
				if(empty($request_config_item->show->ddo_map)) {
					debug_log(__METHOD__." Ignored empty show ddo_map in request_config_item:".to_string($request_config_item), logger::ERROR);
					continue;
				}
				// merge all ddos of all request_config
				$full_ddo_map = array_merge($full_ddo_map, $request_config_item->show->ddo_map);
			}//end foreach ($request_config_dedalo as $request_config_item)
			// remove duplicates, sometimes the portal point to other portal with two different bifurcations, and the portal pointed is duplicated in the request_config (dedalo, Zenon,...)
			$ddo_map = array_unique($full_ddo_map, SORT_REGULAR);


		// get the context and data for every locator
			foreach($ar_db_record as $db_record) {

				// check record format
					if (!is_object($db_record)) {
						if(SHOW_DEBUG===true) {
							// dump($db_record, ' db_record ++ '.to_string());
							// dump($ar_db_record, ' ar_db_record ++ '.to_string());
							// throw new Exception("Error Processing Request. db_record is not an object", 1);
							debug_log(
								__METHOD__." Error Processing Request. db_record is NOT an expected object. Ignored record ! ".to_string($db_record),
								logger::ERROR
							);
						}
						continue;
					}

				// sub-data time machine from record columns
					$section_id		= $db_record->section_id;
					$section_tipo	= $db_record->section_tipo;
					$lang			= $db_record->lang;
					$id				= $db_record->id;
					$timestamp		= $db_record->timestamp;
					$user_id		= $db_record->userID;
					$tipo			= $db_record->tipo;
					$dato			= $db_record->dato;


				// empty tipo case catch
					if (empty($tipo)) {
						debug_log(__METHOD__." Empty tipo was received ! . db_record: ".PHP_EOL.to_string($db_record), logger::ERROR);
						continue;
					}

				// short vars
					$source_model				= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
					$components_with_relations	= component_relation_common::get_components_with_relations();
					$mode						= 'list';


				// ar_ddo iterate
						// build data from elements
				foreach ($ddo_map as $ddo) {

					// ddo tipo
						$current_ddo_tipo = $ddo->tipo;

					// ddo item model
						$ddo->model = $ddo->model ?? RecordObj_dd::get_modelo_name_by_tipo($ddo->tipo, true);

					// model of dato tipo
						$model = RecordObj_dd::get_modelo_name_by_tipo($tipo, true); // model of dato tipo

					// switch cases
						switch (true) {

							case ($current_ddo_tipo==='dd1573'): // id (model: component_section_id)
								$data_item = (object)[
									'section_id'			=> $section_id,
									'section_tipo'			=> $section_tipo,
									'tipo'					=> $current_ddo_tipo,  // fake tipo only used to match ddo with data
									'lang'					=> DEDALO_DATA_NOLAN,
									'from_component_tipo'	=> $current_ddo_tipo,  // fake tipo only used to match ddo with data
									'value'					=> $id,
									'debug_model'			=> 'component_section_id',
									'debug_label'			=> 'matrix ID',
									'debug_mode'			=> 'list',
									'matrix_id'				=> $id
								];
								$ar_subdata[]		= $data_item;
								$ar_subcontext[]	= $ddo;
								break;

							case ($current_ddo_tipo==='dd547'): // When (model: component_date) from activity section

								$timestamp_tipo	= $current_ddo_tipo;
								$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($timestamp_tipo,true);
								$component		= component_common::get_instance(
									$modelo_name,
									$timestamp_tipo,
									$section_id,
									'list',
									DEDALO_DATA_NOLAN,
									$section_tipo
								);

								// dato
									$dd_date = new dd_date();
										$date = $dd_date->get_date_from_timestamp( $timestamp );
									$date_value = new stdClass();
										$date_value->start = $date;
									$component_dato = [$date_value];
									$component->set_dato($component_dato);
									$component->set_permissions(1);

								// get component json
									$get_json_options = new stdClass();
										$get_json_options->get_context	= false;
										$get_json_options->get_data		= true;
									$element_json = $component->get_json($get_json_options);

								// edit section_id to match section locator data item
									$data_item = reset($element_json->data);
										$data_item->matrix_id = $id;

								$ar_subdata[]		= $data_item;
								$ar_subcontext[]	= $ddo;
								break;

							case ($current_ddo_tipo==='dd543'): // Who (model: component_autocomplete) from activity section

								$locator = new locator();
									$locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
									$locator->set_section_id($user_id);
									$locator->set_type(DEDALO_RELATION_TYPE_LINK);
								$ar_values = component_relation_common::get_locator_value(
									$locator,
									DEDALO_DATA_LANG, // lang
									false, // show_parents
									['dd132'], // array|bool ar_components_related
									true // bool include_self
								);
								$data_item = (object)[
									'section_id'			=> $section_id,
									'section_tipo'			=> $section_tipo,
									'tipo'					=> $current_ddo_tipo,
									'lang'					=> DEDALO_DATA_NOLAN,
									'from_component_tipo'	=> $current_ddo_tipo,
									'value'					=> $ar_values,
									'debug_model'			=> 'component_select',
									'debug_label'			=> 'modified by user',
									'debug_mode'			=> 'list',
									'matrix_id'				=> $id
								];

								$ar_subdata[]		= $data_item;
								$ar_subcontext[]	= $ddo;
								break;

							case ($current_ddo_tipo==='dd546'): // Where (model: component_input_text)
								// component_label
									$component_label = RecordObj_dd::get_termino_by_tipo(
										$tipo, // string terminoID
										DEDALO_DATA_LANG, // string lang
										true, // bool from_cache
										true // bool fallback
									);
									// on tool_time_machine prepend section label
									$rqo = dd_core_api::$rqo ?? null;
									if ( $rqo && $rqo->source->tipo!==$rqo->source->section_tipo ) {
										// section_label
											$section_label = RecordObj_dd::get_termino_by_tipo(
												$section_tipo, // string terminoID
												DEDALO_DATA_LANG, // string lang
												true, // bool from_cache
												true // bool fallback
											);
											$component_label = $section_label.': '.$component_label;
									}
								$current_value	= [$component_label];
								$data_item		= (object)[
									'section_id'			=> $section_id,
									'section_tipo'			=> $section_tipo,
									'tipo'					=> $current_ddo_tipo,  // fake tipo only used to match ddo with data
									'lang'					=> DEDALO_DATA_LANG,
									'from_component_tipo'	=> $current_ddo_tipo,  // fake tipo only used to match ddo with data
									'value'					=> $current_value, // .' ['.$section_tipo.']'
									'debug_model'			=> 'component_input_text',
									'debug_label'			=> 'Where',
									'debug_mode'			=> 'list',
									'matrix_id'				=> $id
								];
								$ar_subdata[]		= $data_item;
								$ar_subcontext[]	= $ddo;
								break;

							case ($ddo->model==='dd_grid' && $model==='section'): // Value : section first tm creation record case
								// model section case. If row dato model is section, create a pseudo dd_grid data
								// simulate grid value
								$dd_grid_value = (object)[
									'type'		=> 'column',
									'label'		=> 'section',
									'cell_type'	=> 'text',
									'value'		=> [
										'Created: '.$db_record->dato->created_date,
										'By user: '.$db_record->dato->created_by_userID
									]
								];
								$data_item = (object)[
									'section_id'			=> $section_id,
									'section_tipo'			=> $section_tipo,
									'tipo'					=> $current_ddo_tipo,
									'lang'					=> DEDALO_DATA_NOLAN,
									'from_component_tipo'	=> $current_ddo_tipo,
									'from_section_tipo'		=> $section_tipo,
									'value'					=> $dd_grid_value,
									'debug_model'			=> $ddo->model,
									'debug_label'			=> 'section',
									'debug_mode'			=> 'mini',
									'matrix_id'				=> $id
								];
								$ar_subdata[] = $data_item;
								break;

							default:

								// component
									$component_tipo	= ($source_model==='section')
										? $ddo->tipo // get from ddo
										: $tipo; 	 // get from db record dato ($db_record->tipo)
									$component_model	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true); // $ddo->model;
									$is_relation		= in_array($component_model, $components_with_relations);
									$lang				= $is_relation===true
										? DEDALO_DATA_NOLAN
										: ((bool)RecordObj_dd::get_translatable($component_tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN);

									$current_component = component_common::get_instance(
										$component_model,
										$component_tipo,
										$section_id,
										$mode,
										$lang,
										$section_tipo
									);

									// missing component case. When the data is not correct or the tipo don't mach with the ontology (ex:time machine data of old components)
										if($current_component===null) {

											debug_log(__METHOD__." Temporal data_item build for missing component: $model - $component_tipo", logger::WARNING);

											$data_item = $this->get_data_item(null);
												$data_item->parent_tipo			= $section_tipo;
												$data_item->parent_section_id	= $section_id;
												$data_item->from_component_tipo	= $current_ddo_tipo;
												$data_item->from_section_tipo	= $section_tipo;

											$ar_subdata[]		= $data_item;
											$ar_subcontext[]	= $ddo;
											continue 2;
										}//end if($current_component===null)

								// inject this tipo as related component from_component_tipo
									$current_component->from_component_tipo	= $current_ddo_tipo;
									$current_component->from_section_tipo	= $section_tipo;

								// dato. inject dato from time machine record
									$current_dato = ($source_model!=='section')
										? $dato // from deleted component dato case
										: (($is_relation===false) // from deleted section case
											? $dato->components->{$current_ddo_tipo}->dato->{$lang} ?? null
											: array_values(array_filter($dato->relations, function($el) use($current_ddo_tipo) {
												return $el->from_component_tipo===$current_ddo_tipo;
											  })));

									// inject current_dato
										$current_component->set_dato($current_dato);

									// permissions. Set to allow all users read
										$current_component->set_permissions(1);

								if ($ddo->model==='dd_grid') {

									// component value
										$value = $current_component->get_value();
									// data item
										$data_item = $current_component->get_data_item($value);
										// add matrix_id always
										$data_item->matrix_id = $id;
										// force tipo from ddo. If not forced, time_machine_list cannot match context ddo column
										$data_item->tipo = $current_ddo_tipo;
									// data add
										$ar_subdata[]		= $data_item;
										$ar_subcontext[]	= $ddo;
								}else{

									// normal case

									// get component JSON data
										$element_json = $current_component->get_json((object)[
											'get_context'	=> true,
											'get_data'		=> true
										]);

									// ar_subcontext
										$ar_subcontext = array_merge($ar_subcontext, $element_json->context);

									// empty data case. Generate and add a empty value item
										if (empty($element_json->data) && $model!=='component_section_id') {
											$data_item = $current_component->get_data_item(null);
												$data_item->parent_tipo		= $section_tipo;
												$data_item->row_section_id	= $section_id;
											$element_json->data = [$data_item];
										}

									// parse component_data. Add matrix_id and unify output value
										$component_data	= array_map(function($data_item) use($id, $section_id, $ddo, $current_component) {

											$data_item->matrix_id			= $id; // (!) needed to match context and data in tm mode section
											return $data_item;
										}, $element_json->data);


									// data add
										$ar_subdata = array_merge($ar_subdata, $component_data);
								}//end if ($is_dd_grid_column===true)
								break;
						}//end switch(true)
				}//end foreach ($ddo_map as $ddo)

			}//end foreach($ar_locators as $current_locator)


		// subdatum
			$subdatum = new stdClass();
				$subdatum->context	= $ar_subcontext;
				$subdatum->data		= $ar_subdata;

		// debug
			// if(SHOW_DEBUG===true) {
			// 	$time = exec_time_unit($start_time,'ms');
			// 	$time_string = $time>100
			// 		? sprintf("\033[31m%s\033[0m", $time)
			// 		: $time;
			// 	$len = !empty($this->tipo)
			// 		? strlen($this->tipo)
			// 		: 0;
			// 	$repeat = ($len < 14)
			// 		? (14 - $len)
			// 		: 0;
			// 	$tipo_line = $this->tipo .' '. str_repeat('-', $repeat);
			// 	$log = "------------------- get_tm_subdatum ----------------- $tipo_line $time_string ms ---- ". get_class($this) .' -- '. ($this->section_tipo ?? $this->tipo).'-'.$this->section_id ; //  .' '.json_encode($ar_locators, JSON_PRETTY_PRINT)
			// 	error_log($log);
			// }


		return $subdatum;
	}//end get_tm_subdatum



	/**
	* GET_TIME_MACHINE_LIST
	* Get the time machine list tipo for the section
	* @return string|null $time_machine_list_tipo
	*/
	public function get_time_machine_list() : ?string {

		$section_tipo			= $this->tipo;
		$time_machine_list_tipo	= section::get_ar_childrens_by_model($section_tipo, ['time_machine_list']) ?? null;

		$permissions = isset($time_machine_list_tipo)
			? common::get_permissions( $section_tipo, $time_machine_list_tipo)
			: null;

		if(isset($permissions) && $permissions >0 ){
			return $time_machine_list_tipo;
		}

		return null;
	}//end get_time_machine_list



	/**
	* POST_SAVE_COMPONENT_PROCESSES
	* Executed on component save (when save script is complete)
	* @param object $options
	* @return bool
	*/
	public function post_save_component_processes(object $options) : bool {

		// options
			$component = $options->component;

		// short vars
			$section_tipo	= $this->tipo;
			$section_id		= $this->section_id;
			$lang			= $component->get_lang();
			$component_tipo = $component->get_tipo();

		// ontology sync. Synchronize this section values with equivalents in table 'matrix_descriptors_dd'. Only master server
			if (// defined('STRUCTURE_IS_MASTER') && STRUCTURE_IS_MASTER===true &&
				defined('ONTOLOGY_SECTION_TIPOS') && ONTOLOGY_SECTION_TIPOS['section_tipo']===$section_tipo) {

				$ar_update_tipos = [
					ONTOLOGY_SECTION_TIPOS['term'],
					// ONTOLOGY_SECTION_TIPOS['definition']
				];

				if (in_array($component_tipo, $ar_update_tipos)) {

					// term_id
						$term_id = (function() use($section_id, $section_tipo){

							$component_tipo	= ONTOLOGY_SECTION_TIPOS['term_id'];
							$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
							$component		= component_common::get_instance(
								$modelo_name,
								$component_tipo,
								$section_id,
								'list',
								DEDALO_DATA_NOLAN,
								$section_tipo
							);
							$dato		= $component->get_dato();
							$term_id	= reset($dato);

							return $term_id;
						})();

					if (empty($term_id)) {
						debug_log(__METHOD__." term_id value is mandatoy. Nothing is propagated to descriptors ".to_string($term_id), logger::ERROR);
					}else{

						$dato_tipo = (function() use($component_tipo){
							switch ($component_tipo) {
								case ONTOLOGY_SECTION_TIPOS['term']:		return 'termino';	break;
								// case ONTOLOGY_SECTION_TIPOS['definition']:	return 'def';		break;
								// case ONTOLOGY_SECTION_TIPOS['observations']:return 'obs';		break;
							}
							return null;
						})();

						if (!empty($dato_tipo)) {

							$value = $component->get_valor();

							// set and save the value to descriptors dd
								$RecordObj = new RecordObj_descriptors_dd(RecordObj_descriptors_dd::$descriptors_matrix_table, null, $term_id, $lang, $dato_tipo);
								$RecordObj->set_dato($value);
								$result = $RecordObj->Save();

								debug_log(__METHOD__." Updated descriptors_dd 'termino' [$term_id] - dato_tipo : $dato_tipo - with value: ".to_string($value), logger::DEBUG);
						}
					}
				}
			}//end ontology sync


		return true;
	}//end post_save_component_processes



}//end class section
