<?php declare(strict_types=1);
/**
* CLASS SECTION
*
*/
class section extends common {



	/**
	* CLASS VARS
	*/
		// FIELDS
		// protected $section_id;
		// protected $dato;

		// Buttons objects
		public $ar_buttons;

		public $ar_all_project_langs;

		public $show_inspector = true; // default show: true

		public $section_virtual = false;
		public $section_real_tipo;

		public static $active_section_id;

		public $is_temp = false; // Used to force save data to session instead database. Default is false

		public $options;

		// SAVE_HANDLER
		// Default is 'database'. Other options like 'session' are accepted
		// Note that section change automatically this value (to 'session' for example) when received section_id is like 'temp1' for manage this cases as temporal section
		public $save_handler = 'database';

		// static cache for section instances
		public static $ar_section_instances = [];

		public $save_modified = true; # Default is true

		// public $layout_map;

		// injected whole database record, with all columns
		public $record;

		// tm_context. Array
		public $tm_context;

		// time machine save control
		public $save_tm = true;


		/**
		* SECTIONS FOR DATAFRAME
		*________________________
		*/
			/**
			* @param object $caller_dataframe
			* locator (section_id, section_tipo)
			* The section that has data in DDBB, it's the section of the portal with the data that need to be data-framed with roles, uncertainty or any other dataframe.
			*/
			public $caller_dataframe;



		/**
		* @param object $JSON_RecordObj_matrix
		*/
		protected $JSON_RecordObj_matrix;



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
	* @param mixed $section_id = null
	* @param string|null $tipo = null
	* @param string|null $mode = 'list'
	* @param bool $cache = true
	* @param object|null $caller_dataframe = null
	* @return object $section
	*/
	public static function get_instance( mixed $section_id=null, ?string $tipo=null, string $mode='list', bool $cache=true, ?object $caller_dataframe=null ) : section {

		// tipo check. Is mandatory
			if (empty($tipo)) {
				$msg = "Error: on construct section : tipo is mandatory. section_id:'$section_id', tipo:'$tipo', mode:'$mode'";
				debug_log(__METHOD__
					. $msg
					, logger::ERROR
				);
				throw new Exception($msg, 1);
			}

		// tipo check model (only section is expected)
			$model = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			if ($model!=='section') {
				debug_log(__METHOD__
					. ' Expected model of tipo '.$tipo.' is section, but received is ' . PHP_EOL
					. ' model: ' . to_string($model)
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					$bt = debug_backtrace();
					dump($bt, ' bt ++ '.to_string());
				}
			}

		// cache
			// $cache = false;

		// cache is false case. Use always (cache=false) in imports (!). Not cache new sections (without section_id)
			if ($cache===false || empty($section_id) || $mode==='update' || $mode==='tm') {

				// instance new section
				$section = new section($section_id, $tipo, $mode);
				// dataframe case
				if(isset($caller_dataframe)){
					$section->set_caller_dataframe($caller_dataframe);
				}

				return $section;
			}//end if ($cache===false || empty($section_id))

		// cache is true case. Get cache instance if it exists. Otherwise, create a new one
			// cache overload
				$max_cache_instances	= 1200;
				$cache_slice_on			= 400;
				$total					= count(self::$ar_section_instances);
				if ( $total > $max_cache_instances ) {
					// new array
					$new_array = [];
					$i = 1;
					foreach (self::$ar_section_instances as $inst_key => $inst_value) {
						if ($i > $cache_slice_on) {
							$new_array[$inst_key] = $inst_value;
						}else{
							$i++;
						}
					}
					// replace matrix_instances array
					self::$ar_section_instances = $new_array;
				}

			// find current instance in cache
				$cache_key = implode('_', [$section_id, $tipo, $mode]);
				if(isset($caller_dataframe)){
					$cache_key .= '_'.$caller_dataframe->section_tipo.'_'.$caller_dataframe->section_tipo_key.'_'.$caller_dataframe->section_id_key;

				}
				if ( !isset(self::$ar_section_instances[$cache_key]) ) {
					self::$ar_section_instances[$cache_key] = new section($section_id, $tipo, $mode);
					// dataframe case
					if(isset($caller_dataframe)) {
						self::$ar_section_instances[$cache_key]->set_caller_dataframe($caller_dataframe);
					}
				}


		return self::$ar_section_instances[$cache_key];
	}//end get_instance



	/**
	* CONSTRUCT
	* Extends parent abstract class common
	* @param mixed $section_id = null
	* @param string|null$tipo = null
	* @param string|null $mode = 'edit'
	*/
	private function __construct( mixed $section_id=null, ?string $tipo=null, string $mode='list' ) {

		// check tipo
			if (empty($tipo)) {
				throw new Exception("Error: on __construct section : tipo is mandatory. section_id:$section_id, tipo:$tipo, mode:$mode", 1);
			}

		// uid
			$this->uid = hrtime(true); // nanoseconds

		// Set general vars
			$this->lang			= DEDALO_DATA_NOLAN;
			$this->section_id	= $section_id;
			$this->tipo			= $tipo;
			$this->mode			= $mode ?? 'edit';

		// load_structure_data. When tipo is set, calculate structure data
			parent::load_structure_data();

		// active_section_section_id : Set global var
			if(		$mode==='edit'
				&&	(isset($this->section_id) && ($this->section_id>0 || strpos((string)$this->section_id, DEDALO_SECTION_ID_TEMP)!==false))
				&&	!isset(section::$active_section_id) ) {

					// fix active_section_id
						section::$active_section_id = $this->get_section_id();
			}

		// pagination. Set defaults
			$this->pagination = new stdClass();
				$this->pagination->offset	= 0;
				$this->pagination->limit	= null;
	}//end __construct




	/**
	* GET_IDENTIFIER
	* Compound a chained plain flat identifier string for use as media component name, etc..
	* @return string $name Like 'dd207_1'
	*/
	public function get_identifier() : string {

		if ( empty($this->get_tipo() ) ) {
			throw new Exception("Error Processing Request. empty section_tipo", 1);
		}
		if ( empty($this->get_section_id() ) ) {
			throw new Exception("Error Processing Request. empty section_id", 1);
		}

		$identifier = $this->tipo . locator::DELIMITER . $this->section_id;

		return $identifier;
	}//end get_identifier



	/**
	* SET_BL_LOADED_MATRIX_DATA
	* Pass bl_loaded_matrix_data to own $JSON_RecordObj_matrix instance
	* only when value is 'false' to force reload data from DDBB
	* When value is 'true' is ignored because the section manages this value
	* on set_dato
	* @see $this->set_dato()
	* @param bool $value
	* @return bool
	*/
	public function set_bl_loaded_matrix_data(bool $value) : bool {

		if ($value===false) {

			if (empty($this->section_id)) {
				return false;
			}

			$matrix_table			= common::get_matrix_table_from_tipo($this->tipo);
			$JSON_RecordObj_matrix	= $this->JSON_RecordObj_matrix ?? JSON_RecordObj_matrix::get_instance(
				$matrix_table,
				(int)$this->section_id, // int section_id
				$this->tipo, // string section tipo
				true // bool cache
			);
			$this->JSON_RecordObj_matrix = $JSON_RecordObj_matrix;
			// force updates value
			$JSON_RecordObj_matrix->set_bl_loaded_matrix_data(false);
		}

		return  true;
	}//end set_bl_loaded_matrix_data



	/**
	* GET DATO
	* @return object $dato
	*/
	public function get_dato() : object {

		// check valid call
			if ( abs(intval($this->section_id))<1 &&
				(strpos((string)$this->section_id, DEDALO_SECTION_ID_TEMP)===false &&
				strpos((string)$this->section_id, 'search')===false)
				) {

				if(SHOW_DEBUG===true) {
					if ($this->section_id==='result') {
						throw new Exception("Error Processing Request. 'result' is not valid section_id. Maybe you are using foreach 'ar_list_of_values' incorrectly", 1);
					};
				}
				debug_log(__METHOD__
					." section_id <1 is not allowed . section_id: ".to_string($this->section_id)
					, logger::ERROR
				);
				$dbt = debug_backtrace();
				dump($dbt, ' dbt debug_backtrace ++ '.to_string());
				throw new Exception("Error Processing Request. get_component_data of section section_id <1 is not allowed (section_id:'$this->section_id')", 1);
			}

		// save_handler session case
			// If section_id have a temporal string, the save handier will be 'session'
			// the section will be saved in memory, NOT in the database and you will get the data from there
			if( strpos((string)$this->section_id, DEDALO_SECTION_ID_TEMP)!==false ){
				$this->save_handler = 'session';
			}
			// Sometimes we need use section as temporal element without save real data to database. Is this case
			// data is saved to session as temporal data and can be recovered from $_SESSION['dedalo']['section_temp_data'] using key '$this->tipo.'_'.$this->section_id'
			if (isset($this->save_handler) && $this->save_handler==='session') {
				if (!isset($this->dato)) {
					$temp_data_uid = $this->tipo .'_'. $this->section_id;
					# Fix dato as object
					$this->dato = isset($_SESSION['dedalo']['section_temp_data'][$temp_data_uid])
						? clone $_SESSION['dedalo']['section_temp_data'][$temp_data_uid]
						: new stdClass();
				}
				return $this->dato;
			}

		// data is loaded once
			// JSON_RecordObj_matrix
				$matrix_table			= common::get_matrix_table_from_tipo($this->tipo);
				$JSON_RecordObj_matrix	= $this->JSON_RecordObj_matrix ?? JSON_RecordObj_matrix::get_instance(
					$matrix_table,
					(int)$this->section_id, // int section_id
					$this->tipo, // string section tipo
					true // bool cache
				);
				$this->JSON_RecordObj_matrix = $JSON_RecordObj_matrix;

			// load dato from db
				$dato = $JSON_RecordObj_matrix->get_dato();

		// fix dato (force object)
			$this->dato = is_object($dato)
				? $dato
				: (empty($dato) ? new stdClass() : (object)$dato);


		return $this->dato;
	}//end get_dato



	/**
	* SET_DATO
	* Set whole section data as raw object
	* Fix section relations and components to prevent save issues
	* @return bool true
	*/
	public function set_dato($dato) : bool {

		// call common->set_dato (!) fix var 'bl_loaded_matrix_data' as true
			$result = parent::set_dato($dato);

		// update JSON_RecordObj_matrix cached data
			if (!empty($this->section_id)) {
				$matrix_table			= common::get_matrix_table_from_tipo($this->tipo);
				$JSON_RecordObj_matrix	= $this->JSON_RecordObj_matrix ?? JSON_RecordObj_matrix::get_instance(
					$matrix_table, // string matrix_table
					(int)$this->section_id, // int section_id
					$this->tipo, // string tipo
					true // bool cache
				);
				$JSON_RecordObj_matrix->set_dato($dato);
				$JSON_RecordObj_matrix->set_blIsLoaded(true);
			}

		// set as loaded
			// $this->bl_loaded_matrix_data = true;


		return $result;
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
				$lang_default	= DEDALO_DATA_LANG_DEFAULT;
				$component_dato	= ($lang!==$lang_default && !empty($all_component_data->dato->{$lang_default}))
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
	* @return int|string|null $section_id
	*/
	public function save_component_dato(object $component_obj, string $component_data_type, bool $save_to_database) : int|string|null {

		// section. The section is necessary before managing the component data. If it does not exist, we will create it previously
			if (abs(intval($this->get_section_id()))<1  && strpos((string)$this->get_section_id(), DEDALO_SECTION_ID_TEMP)===false) {
				$section_id = $this->Save();
				// throw new Exception("Warning : Trying save component in section without section_id. Created section and saved", 1);
				debug_log(__METHOD__
					." Warning : Trying save component in section without section_id.". PHP_EOL
					." Created and saved a new section" . PHP_EOL
					.' new section_id: ' . $section_id
					, logger::ERROR
				);
			}

		// set self section_obj to component. (!) Important to prevent cached and not cached versions of
		// current section conflicts (and for speed)
			// $component_obj->set_section_obj($this);

		// component_global_dato : Extract the component portion from the section's global object
			$component_tipo	= $component_obj->get_tipo();
			$component_lang	= $component_obj->get_lang();
			if (empty($component_tipo)) {
				throw new Exception("Error Processing Request: component_tipo is empty", 1);
			}

		// set dato
			if ($component_data_type==='relation') {

				// relation components
					// previous component dato from unchanged section dato
					// previous component is used to check time_machine data
					// when time_machine has not previous data of the component, because was a explicit not time_machine save
					// the previous_component_dato will used to set as previous time_machine_data.
					// It prevent lost the previous changes in data.
					$previous_component_dato = array_values(
						array_filter($this->get_relations(), function($el) use ($component_tipo, $component_obj){

							// dataframe case
							// by default, component_dataframe is built with caller_dataframe except when import data.
							// When import data from CSV files, the component is built without dataframe
							// because is not possible to create different instances for every dataframe data.
							// In those cases the component_dataframe manage its data as other components with whole data.
							$previous_dato = (get_class($component_obj)==='component_dataframe' && isset($component_obj->caller_dataframe) )
								? ( isset($el->from_component_tipo) && $el->from_component_tipo===$component_tipo )
									&& $el->section_tipo_key===$component_obj->caller_dataframe->section_tipo_key
									&& (int)$el->section_id_key===(int)$component_obj->caller_dataframe->section_id_key
								: isset($el->from_component_tipo) && $el->from_component_tipo===$component_tipo;

							 return $previous_dato;
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
				// get the time_machine data from component
				// it could has a dataframe and in those cases it will return its data and the data from its dataframe mixed.
				$save_options->time_machine_data	= $component_obj->get_time_machine_data_to_save();//$component_obj->get_dato_unchanged();
				$save_options->time_machine_lang	= $component_lang;
				$save_options->time_machine_tipo	= $component_tipo;
				// previous_component_dato
				$save_options->previous_component_dato	= $previous_component_dato;

				// component_dataframe
				// when the component is dataframe, save all information together
				// use the main and dataframe data as locators, mix all and save with the main component tipo
				if (get_class($component_obj)==='component_dataframe') {
					// use the main component
					$main_tipo = $component_obj->get_main_component_tipo();
					$save_options->time_machine_tipo	= $main_tipo;

				}

				if( isset($component_obj->bulk_process_id) ){
					$save_options->time_machine_bulk_process_id	= $component_obj->bulk_process_id;
				}


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
	* Set literal value to component (path: dato->relations)
	* @param object $component_obj
	* @return object|null $fixed_component_dato
	*  sample:
	*  {
	*	    "inf": "input_text [component_input_text]",
	*	    "dato": {
	*	        "lg-eng": null
	*	    }
	*	}
	*/
	public function set_component_direct_dato( object $component_obj ) : ?object {

		// set self section_obj to component. (!) Important to prevent cached and not cached versions of
		// current section conflicts (and for speed)
			$component_obj->set_section_obj($this);

		// component short vars
			$component_tipo			= $component_obj->get_tipo();
			$component_lang			= $component_obj->get_lang();
			$component_model_name	= get_class($component_obj);

		// section dato
			$dato = $this->get_dato();
			if (!is_object($dato)) {
				// $dato = $this->dato = new stdClass();
				throw new Exception("Error Processing Request. Section Dato is not as expected type (object). type: ".gettype($dato), 1);
			}

		// component_global_dato. Select component in section dato
			if (isset($dato->components->{$component_tipo})) {

				// component dato already exists in section object. Only select it
					$component_global_dato = $dato->components->{$component_tipo};

				// component dato property
					if (!isset($component_global_dato->dato)) {
						$component_global_dato->dato = new stdClass();
					}

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
							// 	$component_global_dato->info->model= $component_model_name;
							$inf = RecordObj_dd::get_termino_by_tipo($component_tipo,null,true) .' ['.$component_model_name.']';
							$component_global_dato->inf = $inf;

						$component_global_dato->dato = new stdClass();
						// $component_global_dato->valor		= new stdClass();
						// $component_global_dato->valor_list	= new stdClass();
			}

		// component_lang
			if (!isset($component_global_dato->dato->{$component_lang})) {
				$component_global_dato->dato->{$component_lang} = new stdClass();
			}

		// dato_unchanged : We update the data in the current language
			$component_dato = $component_obj->get_dato_unchanged(); ## IMPORTANT !!!!! (NO usar get_dato() aquí ya que puede cambiar el tipo fijo establecido por set_dato)

		// unset when data null
			if($component_dato===null || empty($component_dato)){

				// unset current language
				if (isset($component_global_dato->dato->{$component_lang})) {
					unset($component_global_dato->dato->{$component_lang});
				}

				// check all languages, if any other languages has null data, remove it.
				if (!empty($component_global_dato->dato)) {
					foreach ($component_global_dato->dato as $current_lang => $current_value) {
						if($current_value===null){
							unset($component_global_dato->dato->{$current_lang});
						}
					}
				}

				// check data object, if do not has any property, remove the global object.
				$component_global_dato_count = isset($component_global_dato->dato)
					? count(get_object_vars($component_global_dato->dato))
					: 0;
				if($component_global_dato_count === 0){

					// remove whole component dato definition
					unset($dato->components->{$component_tipo});

					// update section with full data object
					$this->set_dato($dato);

					// stop here
					return null;
				}
			}else{

				// update component dato current lang value
				$component_global_dato->dato->{$component_lang} = $component_dato;
			}

		// replace component portion of global object :  we update the entire component in the section global object
			if (!isset($dato->components->{$component_tipo})) {
				if (!isset($dato->components)) {
					$dato->components = new stdClass();
				}
				$dato->components->{$component_tipo} = new stdClass();
			}
			$dato->components->{$component_tipo} = $component_global_dato;

		// update section full data object
			$this->set_dato($dato);

		// component_dato
			$fixed_component_dato = $dato->components->{$component_tipo};


		return $fixed_component_dato;
	}//end set_component_direct_dato



	/**
	* SET_COMPONENT_RELATION_DATO
	* Set relation value to section (path: dato->relations)
	* @param object $component_obj
	* 	Component instance
	* @return array $fixed_component_dato
	* 	sample:
	* 	[
	*	    {
	*	        "section_tipo": "test3",
	*	        "section_id": "1",
	*	        "type": "dd151",
	*	        "from_component_tipo": "test101"
	*	    },
	*	    {
	*	        "type": "dd151",
	*	        "section_id": "21",
	*	        "section_tipo": "test3",
	*	        "from_component_tipo": "test101"
	*	    }
	*	]
	*/
	public function set_component_relation_dato( object $component_obj ) : array {

		// set self section_obj to component. (!) Important to prevent cached and not cached versions of
		// current section conflicts (and for speed)
			$component_obj->set_section_obj($this);

		// component short vars
			$component_tipo	= $component_obj->get_tipo();
			$component_dato	= $component_obj->get_dato_full();

		$options = new stdClass();
			$options->component_tipo		= $component_tipo;
			$options->relations_container	= 'relations';
			$options->model					= $component_obj->get_model();
			$options->caller_dataframe		= $component_obj->get_caller_dataframe();

		// Remove all previous locators of current component tipo
		$this->remove_relations_from_component_tipo( $options );

		// Remove all existing search locators of current component tipo
		$options->relations_container = 'relations_search';
		$this->remove_relations_from_component_tipo( $options );

		// add locators
		if (!empty($component_dato)) {

			// ADD_RELATION . Add locator one by one
			foreach ((array)$component_dato as $current_locator) {

				// Add relation
				$add_relation = $this->add_relation( $current_locator, 'relations' );
				// If something goes wrong, let me know
				if($add_relation===false) {
					debug_log(__METHOD__
						." ERROR ON ADD LOCATOR:  " . to_string($current_locator)
						, logger::ERROR)
					;
				}
			}

			// SEARCH_RELATIONS . If component have search_relations, add too
			if ($relations_search_value = $component_obj->get_relations_search_value()) {

				foreach ($relations_search_value as $current_search_locator) {
					// Add relation
					$add_relation = $this->add_relation( $current_search_locator, 'relations_search' );
					// If something goes wrong, let me know
					if($add_relation===false) {
						debug_log(__METHOD__
							." ERROR ON ADD SEARCH LOCATOR:  " . to_string($current_search_locator)
							, logger::ERROR
						);
					}
				}
			}
		}//end if (!empty($component_dato))

		// component_dato
			if (!isset($this->dato->relations) && $this->section_id!==DEDALO_SECTION_ID_TEMP) {
				debug_log(__METHOD__
					. " Invalid section dato->relations." . PHP_EOL
					. ' tipo: ' . $this->tipo . PHP_EOL
					. ' section_id: ' . $this->section_id . PHP_EOL
					. ' section dato: ' . json_encode($this->dato, JSON_PRETTY_PRINT) . PHP_EOL
					. ' component_obj: ' . json_encode($component_obj, JSON_PRETTY_PRINT)
					, logger::ERROR
				);
			}
			$relations = $this->dato->relations ?? [];
			$fixed_component_dato = array_values(
				array_filter($relations, function($el) use($component_tipo) {
					return isset($el->from_component_tipo) && $el->from_component_tipo===$component_tipo;
				})
			);


		return $fixed_component_dato;
	}//end set_component_relation_dato



	/**
	* SAVE
	* Create or update a section record in matrix
	* @param object|null $save_options = null
	* @return int|string|null $section_id
	*/
	public function Save( ?object $save_options=null ) : int|string|null {
		$start_time = start_time();

		if(SHOW_DEBUG===true) {
			// metrics
				metrics::$section_save_total_calls++;;
		}

		// options
			$options = new stdClass();
				$options->main_components_obj			= false;
				$options->main_relations				= false;
				$options->new_record					= false;
				$options->forced_create_record			= false;
				$options->component_filter_dato			= false;

				// Time machine options (overwrite when save component)
				$options->time_machine_data				= false;
				$options->time_machine_lang				= false;
				$options->time_machine_tipo				= false;
				$options->time_machine_section_id		= (int)$this->section_id; // always
				$options->time_machine_section_id_key	= null;
				$options->time_machine_bulk_process_id	= null;

				$options->save_tm						= $this->save_tm;
				$options->previous_component_dato		= null; // only when save from component

			// save_options overwrite defaults
			if (!empty($save_options)) {
				foreach ((object)$save_options as $key => $value) {
					if (property_exists($options, $key)) { $options->$key = $value; }
				}
			}

		// tm mode case
			if ($this->mode==='tm' || $this->data_source==='tm') {
				debug_log(__METHOD__
					. " Error on save: invalid mode (tm)! . Ignored order" . PHP_EOL
					. ' section_id: ' . to_string($this->section_id) . PHP_EOL
					. ' section_tipo: ' . $this->tipo . PHP_EOL
					. ' tipo: ' . $this->tipo . PHP_EOL
					. ' model: ' . get_class($this) . PHP_EOL
					. ' mode: ' . $this->mode . PHP_EOL
					. ' lang: ' . $this->lang
					, logger::ERROR
				);
				return null;
			}

		// tipo. Current section tipo
			$tipo = (isset($this->properties->section_tipo) && $this->properties->section_tipo==='real')
				? $this->get_section_real_tipo()
				: $this->get_tipo();
			// Verify tipo is structure data
				if( !(bool)verify_dedalo_prefix_tipos($tipo) ) {
					// $msg = "EXCEPTION. Current tipo is not valid for save section: '$tipo'. Nothing will be saved!";
					// throw new Exception("Current tipo is not valid: $tipo", 1);
					debug_log(__METHOD__
						." Error: Current tipo is not valid for save section. Nothing will be saved! ". PHP_EOL
						.' tipo: ' . to_string($tipo)
						, logger::ERROR
					);
					return null;
				}
			// section virtual . Correct tipo
			// If we are in a virtual section, we will clear the real type (the destination section) and
			// we will work with the real type from now on
				$section_real_tipo = ($tipo===DEDALO_ACTIVITY_SECTION_TIPO)
					? $tipo
					: $this->get_section_real_tipo();

		// user id. Current logged user id
			$user_id = logged_user_id();

		// date now
			$date_now = dd_date::get_timestamp_now_for_db();

		// save_handler session case
			// Sometimes we need use section as temporal element without save real data to database. Is this case
			// data is saved to session as temporal data and can be recovered from $_SESSION['dedalo']['section_temp_data'] using key '$this->tipo.'_'.$this->section_id'
			if (isset($this->save_handler) && $this->save_handler==='session') {

				$temp_data_uid		= $this->tipo.'_'.$this->section_id;
				$section_temp_data	= (object)$this->dato;

				// Set value to session
				// Always encode and decode data before store in session to avoid problems on unserialize not loaded classes
				$_SESSION['dedalo']['section_temp_data'][$temp_data_uid] = json_decode( json_encode($section_temp_data) );

				return $this->section_id;
			}

		// matrix table. Note that this function fallback to real section if virtual section don't have table defined
			$matrix_table = common::get_matrix_table_from_tipo($tipo);
			if (empty($matrix_table)) {
				debug_log(__METHOD__
					. " Error on save: invalid matrix_table! Ignored save order" . PHP_EOL
					. ' section_id: ' . to_string($this->section_id) . PHP_EOL
					. ' section_tipo: ' . $this->tipo . PHP_EOL
					. ' tipo: ' . $this->tipo . PHP_EOL
					. ' model: ' . get_class($this) . PHP_EOL
					. ' mode: ' . $this->mode . PHP_EOL
					. ' lang: ' . $this->lang
					, logger::ERROR
				);
				throw new Exception("Error Processing Request. Unable to get matrix_table from tipo ($tipo - $this->section_id)", 1);
			}


		if (!empty($this->section_id) && (int)$this->section_id>=1 && $options->forced_create_record===false) { # UPDATE RECORD

			################################################################################
			# UPDATE RECORD : Update current matrix section record triggered by one component

			if ($tipo===DEDALO_ACTIVITY_SECTION_TIPO) {
				debug_log(__METHOD__
					. " Error. Illegal try to update activity section record ($this->section_id)"
					, logger::ERROR
				);
				return null;
			}

			if ($this->save_modified===false) {

				// section dato only. Do not change existing modified_section_data
					$section_dato = (object)$this->get_dato();

			}else{

				// update_modified_section_data . Resolve and add modification date and user to current section dato
				// (!) Note that this method changes $this->dato (add relations and components)
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

			// Save section dato
				$JSON_RecordObj_matrix = isset($this->JSON_RecordObj_matrix)
					? $this->JSON_RecordObj_matrix
					: JSON_RecordObj_matrix::get_instance(
						$matrix_table,
						(int)$this->section_id,
						$tipo,
						true // bool cache
					  );
				$JSON_RecordObj_matrix->set_dato($section_dato);
				$saved_id_matrix = $JSON_RecordObj_matrix->Save( $options );
				if (false===$saved_id_matrix || $saved_id_matrix < 1) { //  && $tipo!==DEDALO_ACTIVITY_SECTION_TIPO
					debug_log(__METHOD__
						. ' Error trying to save->update record. Nothing was saved! ' . PHP_EOL
						. ' section_id: ' . to_string($this->section_id) . PHP_EOL
						. ' section_tipo: ' . $this->tipo . PHP_EOL
						. ' model: ' . get_class($this) . PHP_EOL
						. ' mode: ' . $this->mode
						, logger::ERROR
					);
					return null;
				}

		}else{ # NEW RECORD

			################################################################################
			# NEW RECORD . Create and save matrix section record in correct table

			// prevent to save non authorized/valid section_id
				if (!empty($this->section_id) && (int)$this->section_id < 1) {
					debug_log(__METHOD__
						. ' Error trying to save invalid section_id. Nothing was saved!' . PHP_EOL
						. ' section_id: ' . to_string($this->section_id)
						, logger::ERROR
					);
					return null;
				}

			// counter : Counter table. Default is ¡matrix_counter
				// Prepare the id of the counter based on the table we are working on (matrix, matrix_dd, etc.)
				// By default it will be 'matrix_counter', but if our section table is different from 'matrix' we will use a counter table distinct
				// formatted as 'matrix_counter' + substr($matrix_table, 6). For example 'matrix_counter_dd' for matrix_dd
				if ($options->forced_create_record===false) {

					// Use normal incremental counter
					$matrix_table_counter = (!empty($matrix_table) && substr($matrix_table, -3)==='_dd')
						? 'matrix_counter_dd'
						: 'matrix_counter';
					$current_id_counter = (int)counter::get_counter_value($tipo, $matrix_table_counter);

					// Create a counter if not already exists
						if ($current_id_counter===0 && $tipo!==DEDALO_ACTIVITY_SECTION_TIPO) {
							// consolidate_counter
							counter::consolidate_counter($tipo, $matrix_table, $matrix_table_counter);
							// Re-check counter value
							$current_id_counter = (int)counter::get_counter_value($tipo, $matrix_table_counter);
						}

					$new_section_id_counter = $current_id_counter+1;

					// section_id. Fix section_id (point of no return, next calls to Save will be updates)
					$this->section_id = (int)$new_section_id_counter;
				}

			# SECTION JSON DATA
			# Store section dato

				# SECTION_OBJ
				# When section is created at first time, section_obj is created wit basic data to write a 'empty section'
				# In some cases, before save at first time, data exits in section object. Take care of this data is added to
				# current first section data or not

					// section dato
						$section_dato						= isset($this->dato) ? (object)$this->dato : new stdClass();

					// Section id
						$section_dato->section_id			= (int)$this->section_id;

					// Section tipo
						$section_dato->section_tipo			= (string)$tipo;

					// Section real tipo
						$section_dato->section_real_tipo	= (string)$section_real_tipo;

					// Section label
						$section_dato->label				= (string)RecordObj_dd::get_termino_by_tipo($tipo,null,true);

					// Section created by userID
						$section_dato->created_by_userID	= (int)$user_id;

					// Section created date
						$section_dato->created_date			= (string)$date_now; // Format 2012-11-05 19:50:44

					// diffusion_info
						$section_dato->diffusion_info		= null; // null by default

					// Components container
						if (!empty($options->main_components_obj)) {
							// Main components obj : When creating a section, you can optionally pass the full component data directly
							$section_dato->components = $options->main_components_obj;	// Add the data of all the components at once (activity)
						}else{
							// components container (empty when insert)
							$section_dato->components = $this->dato->components ?? new stdClass();
						}

					// Relations container
						if (!empty($options->main_relations)) {
							// Main relations : When creating a section, you can optionally pass the full data of the relationships directly
							$section_dato->relations = $options->main_relations; // Add the data of all relationships at once (activity)
						}else{
							// relations container
							$section_dato->relations = $this->dato->relations ?? [];
						}

					// update section dato with final object. Important
						$this->dato = $section_dato;

					// Update modified section data. After set section dato, resolve and add creation date and user to current section dato
					// (!) Note that this method changes $this->dato (add relations and components)
						$this->update_modified_section_data((object)[
							'mode' => 'new_record'
						]);

			// Real data save
				// Time machine data. We save only current new section in time machine once (section info not change, only components changes)
					$time_machine_data = clone $this->dato;
						unset($time_machine_data->components); 	// Remove unnecessary empty 'components' object
						unset($time_machine_data->relations); 	// Remove unnecessary empty 'relations' object
					$save_options = new stdClass();
						$save_options->time_machine_data	= $time_machine_data;
						$save_options->time_machine_lang	= DEDALO_DATA_NOLAN; // Always nolan for section
						$save_options->time_machine_tipo	= $tipo;
						$save_options->new_record			= true;
						$save_options->save_tm				= $this->save_tm;

				// Save JSON_RecordObj
					$JSON_RecordObj_matrix = $this->JSON_RecordObj_matrix ?? JSON_RecordObj_matrix::get_instance(
						$matrix_table, // string matrix_table
						(int)$this->section_id, // int section_id
						$tipo, // string tipo
						true // bool cache
					);
					$JSON_RecordObj_matrix->set_dato($this->dato);
					$saved_id_matrix = $JSON_RecordObj_matrix->Save( $save_options );
					if (false===$saved_id_matrix || $saved_id_matrix < 1) { //  && $tipo!==DEDALO_ACTIVITY_SECTION_TIPO
						debug_log(__METHOD__
							. ' Error trying to save->insert record. Nothing was saved! ' . PHP_EOL
							. ' saved_id_matrix: '   . to_string($saved_id_matrix) . PHP_EOL
							. ' section_id: '   . to_string($this->section_id) . PHP_EOL
							. ' save_options: ' . to_string($save_options) . PHP_EOL
							. ' this->dato: ' . to_string($this->dato)
							, logger::ERROR
						);
						return null;
					}

			if($this->tipo===DEDALO_ACTIVITY_SECTION_TIPO) {

				// (!) Note that value returned by Save action, in case of activity, is the section_id
				// auto created by table sequence 'matrix_activity_section_id_seq', not by counter
				$this->section_id = (int)$saved_id_matrix;

			}else{

				// Counter update : If all is OK, update section counter (counter +1) in structure 'properties:section_id_counter'
				if ($saved_id_matrix > 0) {

					if ($options->forced_create_record===false) {
						// Counter update
						counter::update_counter($tipo, $matrix_table_counter, $current_id_counter);
					}else{
						// consolidate counter value
						// Search last section_id for current section and set counter to this value (when user later create a new record manually, counter will be ok)
						counter::consolidate_counter($tipo, $matrix_table);
					}
				}else{

					debug_log(__METHOD__
						." ERROR. Invalid saved_id_matrix: ".to_string($saved_id_matrix)
						, logger::ERROR
					);
					return null;
				}

				// Logger activity
					logger::$obj['activity']->log_message(
						'NEW', // string $message
						logger::INFO, // int $log_level
						$this->tipo, // string $tipo_where
						null, // string $operations
						[ // associative array datos
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
						],
						logged_user_id() // int
					);

				##
				# FILTER DEFAULTS SET (dd153)
				if ($this->tipo===DEDALO_SECTION_PROJECTS_TIPO) {

					##
					# AUTO AUTHORIZE THIS PROJECT FOR CURRENT USER
					# If this newly created section is a project, this project is added as authorized to the user who created it
					# User currently logged in
						$component_filter_master = component_common::get_instance(
							'component_filter_master',
							DEDALO_FILTER_MASTER_TIPO, // dd170
							$user_id,
							'edit',
							DEDALO_DATA_NOLAN,
							DEDALO_SECTION_USERS_TIPO // dd153
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
						debug_log(__METHOD__
							.' Added locator from section save to component_filter_master ' . PHP_EOL
							.' User filter caches will be deleted to force refresh the data ' . PHP_EOL
							.' user_id: ' .$user_id. PHP_EOL
							.' filter_master_locator: ' . to_string($filter_master_locator)
							, logger::DEBUG
						);
						// (!) Note that component_filter_master force refresh user projects caches on save

				}else{

					# Filter defaults. Note that portal already saves inherited project to new created section
					# To prevent to saves twice, only set default project when not is a portal call to create new record

					##
					# DEFAULT PROJECT FOR CREATE STANDARD SECTIONS
					# When a section record is created, it is auto assigned the default project (defined in config DEDALO_DEFAULT_PROJECT)
					# when the section has a 'component_filter' defined
					$ar_tipo_component_filter = section::get_ar_children_tipo_by_model_name_in_section(
						$section_real_tipo,
						['component_filter'],
						true, // from_cache
						false, // resolve_virtual
						true, // recursive
						true // search_exact
					);
					if (empty($ar_tipo_component_filter[0])) {

						// section without filter case (list of values mainly)
						debug_log(__METHOD__
							." Ignored set filter default in section without filter: $this->tipo" . PHP_EOL
							.' section_tipo: ' . $this->tipo . PHP_EOL
							.' section label ' . RecordObj_dd::get_termino_by_tipo($this->tipo, DEDALO_APPLICATION_LANG)
							, logger::WARNING
						);

					}else{

						if (!empty($options->component_filter_dato)) {

							// custom projects dato passed

							// set the component_filter with the dato sent by the caller (portals)
							$component_filter = component_common::get_instance(
								'component_filter',
								$ar_tipo_component_filter[0],
								$this->section_id,
								'list', // Important 'list' to avoid auto save default value !!
								DEDALO_DATA_NOLAN,
								$tipo
							);
							$component_filter->set_dato( $options->component_filter_dato );
							$component_filter->Save();

						}else{

							// default case

							// When component_filter is called in edit mode, the component check if dato is empty and if is,
							// add default user project and save it
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
					/* DEACTIVATED 24-08-2023 by Paco because model component_state is not used in v6 (mapped to component_info)
					$ar_component_state = section::get_ar_children_tipo_by_model_name_in_section(
						$section_real_tipo, // section_tipo
						['component_state'], // ar_model_name_required
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
					*/

			}//end if($this->tipo!==DEDALO_ACTIVITY_SECTION_TIPO)
		}//end if ($this->id >= 1)


		// reset caches
			switch ($this->tipo) {

				case DEDALO_REQUEST_CONFIG_PRESETS_SECTION_TIPO:
					request_config_presets::clean_cache();
					break;

				case DEDALO_REGISTER_TOOLS_SECTION_TIPO:
					tools_register::clean_cache();
					break;

				case DEDALO_SECTION_PROJECTS_TIPO:
					filter::clean_cache(
						logged_user_id(), // user id. Current logged user id
						DEDALO_FILTER_MASTER_TIPO // dd170
					);
					break;

				default:
					// no cache to delete here
					break;
			}

		// debug
			if(SHOW_DEBUG===true) {

				$total_time_ms = exec_time_unit($start_time, 'ms');

				// metrics
					metrics::$section_save_total_time += $total_time_ms;

				debug_log(__METHOD__
					." Saved section finish: ($this->tipo - $this->section_id) in time: ".$total_time_ms.' ms'
					, logger::DEBUG
				);
			}


		return $this->section_id;
	}//end Save



	/**
	* DELETE (SECTION)
	* Delete section with options
	* @param string $delete_mode
	* 	Options: delete_record|delete_data|delete_dataframe
	* @param bool $delete_diffusion_records = true
	*	Selected by user in delete dialog checkbox
	* @return bool
	*/
	public function Delete( string $delete_mode, bool $delete_diffusion_records=true ) : bool {

		// section_id
			// force type int
			$section_id = intval($this->section_id);
			// prevent delete <1 records
			if($section_id<1) {
				debug_log(__METHOD__
					." Invalid section_id: $section_id. Delete action is aborted "
					, logger::WARNING
				);
				return false;
			}

		// section_tipo
			$section_tipo = $this->tipo;
			// section_real_tipo. If the virtual section has the section_tipo "real" in properties, change the tipo of the section to the real one.
			if(isset($this->properties->section_tipo) && $this->properties->section_tipo==='real'){
				$section_tipo = $this->get_section_real_tipo();
			}
			// user id
			$user_id = logged_user_id();
			// matrix_table
			$matrix_table = common::get_matrix_table_from_tipo($section_tipo);
			// Ignore invalid empty matrix tables
			if (empty($matrix_table)) {
				debug_log(__METHOD__
					. " ERROR: invalid empty matrix table " . PHP_EOL
					. ' section_tipo: ' . $section_tipo
					, logger::ERROR
				);
				return false;
			}

		// delete_mode based actions
			switch($delete_mode) {

				case 'delete_record' :
					// create a new time machine record. Always, even when the section has recovered previously, a new time machine record is created
					// to mark every section delete point in the time. For tool list, only the last record (state 'deleted') will be used.
						$RecordObj_time_machine_new = new RecordObj_time_machine(null);
							$RecordObj_time_machine_new->set_section_id( (int)$this->section_id );
							$RecordObj_time_machine_new->set_section_tipo( (string)$section_tipo );
							$RecordObj_time_machine_new->set_tipo( (string)$section_tipo );
							$RecordObj_time_machine_new->set_lang( (string)$this->get_lang() );
							$RecordObj_time_machine_new->set_timestamp( dd_date::get_timestamp_now_for_db() ); // Format 2012-11-05 19:50:44
							$RecordObj_time_machine_new->set_userID( logged_user_id() );
							$RecordObj_time_machine_new->set_dato( $this->get_dato() );
							$RecordObj_time_machine_new->set_state('deleted');
						$id_time_machine = (int)$RecordObj_time_machine_new->Save();
						// check save resulting id
						if ($id_time_machine<1) {
							debug_log(__METHOD__
								." Error Processing Request. id_time_machine is empty "
								, logger::ERROR
							);
							throw new Exception("Error Processing Request. id_time_machine is empty", 1);
						}

						// check time machine dato
						$dato_time_machine	= $RecordObj_time_machine_new->get_dato();
						$dato_section		= $this->get_dato();
						// JSON encode and decode each of them to unify types before compare
						$a			= json_handler::decode(json_handler::encode($dato_time_machine));
						$b			= json_handler::decode(json_handler::encode($dato_section));
						$is_equal	= (bool)($a == $b);
						if ($is_equal===false) {
							debug_log(__METHOD__
								. " ERROR: The data_time_machine and data_section were expected to be identical. (time machine record: $id_time_machine [Section:Delete]." .PHP_EOL
								. ' Record is NOT deleted ! (3) ' . PHP_EOL
								. ' section_tipo: ' . $this->section_tipo . PHP_EOL
								. ' section_id: ' . $this->section_id
								, logger::ERROR
							);
							// debug
							dump($dato_time_machine, 'SHOW_DEBUG COMPARE ERROR dato_time_machine');
							dump($dato_section,		 'SHOW_DEBUG COMPARE ERROR dato_section');

							return false;
						}

					// clean old time machine records status (only the last record must be 'deleted' to allow tool_time_machine list easily)
						// get all time machine records for this section
						$ar_id_time_machine = RecordObj_time_machine::get_ar_time_machine_of_this(
							$section_tipo,
							(int)$this->section_id,
							DEDALO_DATA_NOLAN,
							$section_tipo
						);
						// iterate all and remove 'deleted' state if is set (except for the last new created)
						foreach ($ar_id_time_machine as $current_id_time_machine) {
							if ($current_id_time_machine==$id_time_machine) {
								continue; // already set
							}
							$RecordObj_time_machine = new RecordObj_time_machine( (string)$current_id_time_machine );
							if ( $RecordObj_time_machine->get_state()==='deleted' ) {
								$RecordObj_time_machine->set_state(null);
								$RecordObj_time_machine->Save();
							}
						}

					// section delete. Delete matrix record
						$JSON_RecordObj_matrix = isset($this->JSON_RecordObj_matrix)
							? $this->JSON_RecordObj_matrix
							: JSON_RecordObj_matrix::get_instance(
								$matrix_table,
								(int)$this->section_id,
								$section_tipo,
								true // bool cache
							  );
						$JSON_RecordObj_matrix->MarkForDeletion();

						// force JSON_RecordObj_matrix destruct to real deletion exec
						$JSON_RecordObj_matrix->__destruct();

					// inverse references. Remove all inverse references to this section
						$this->remove_all_inverse_references(true);

					// relation references. Remove all relation references (children, model, etc.)
						// $this->remove_all_relation_references();

					// media. Remove media files associated to this section
						$this->remove_section_media_files();

					// logger message
						$logger_msg = "DEBUG INFO ".__METHOD__." Deleted section and references. delete_mode: $delete_mode";
					break;

				case 'delete_data' :
					// children : Calculate components children of current section
					$ar_component_tipo = section::get_ar_children_tipo_by_model_name_in_section(
						$section_tipo ,
						['component_'],
						true, // from_cache
						true, // resolve virtual
						true, // recursive
						false, // search exact
					);

					// don't delete some components
					$ar_components_model_no_delete_dato = [
						'component_section_id',
						'component_external',
						'component_inverse'
					];

					$ar_models_of_media_components = section::get_components_with_media_content();

					$ar_deleted_tipos = [];
					foreach ($ar_component_tipo as $current_component_tipo) {

						$current_model_name = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo, true);

						// don't delete some components check
							if (in_array($current_model_name, $ar_components_model_no_delete_dato)){
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

							$dato_empty = ($current_model_name==='component_filter')
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

				default:

					debug_log(__METHOD__
						. " Error on delete section. Delete mode not defined !" .PHP_EOL
						. ' delete_mode is mandatory to call section->Delete( $delete_mode ) '
						, logger::ERROR
					);
					return false;
			}
			debug_log(__METHOD__
				." Deleted section '$this->section_id' and their 'children'". PHP_EOL
				.' delete_mode:' . $delete_mode
				, logger::DEBUG
			);

		// publication . Remove published records in MYSQL, etc.
			if ($delete_diffusion_records===true) {
				try {
					diffusion::delete_record($this->tipo, $this->section_id);
				} catch (Exception $e) {
					debug_log(__METHOD__
						." Error on diffusion::delete_record: " .PHP_EOL
						.' Exception Catch message: '.$e->getMessage()
						, logger::WARNING
					);
				}
			}

		// log
			$is_portal = (TOP_TIPO!==$this->tipo);
			// LOGGER ACTIVITY : WHAT(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
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
					// 'top_id'		=> TOP_ID ?? null,
					// 'top_tipo'	=> TOP_TIPO ?? null,
					'table'			=> $matrix_table,
					'delete_mode'	=> $delete_mode,
					'section_tipo'	=> $this->tipo
				),
				logged_user_id() // int
			);


		return true;
	}//end Delete



	/**
	* GET_SECTION_REAL_TIPO
	* Resolves current section real tipo if is a virtual section
	* @return string $section_real_tipo
	*/
	public function get_section_real_tipo() : string {

		if(isset($this->section_real_tipo)) {
			return $this->section_real_tipo;
		}

		$section_real_tipo = section::get_section_real_tipo_static( $this->tipo );
		if ($section_real_tipo!==$this->tipo) {
			// Fix section_real_tipo
			$this->section_real_tipo	= $section_real_tipo;
			$this->section_virtual		= true;
		}else{
			// Fix section_real_tipo
			$this->section_real_tipo	= $section_real_tipo;
			$this->section_virtual		= false;
		}

		return $section_real_tipo;
	} //end get_section_real_tipo



	/**
	* GET_SECTION_REAL_TIPO_STATIC
	* Resolves current section real tipo if is a virtual section statically
	* @param string $section_tipo
	* @return string $section_real_tipo
	*	If not exists related section, returns the same received section_tipo
	*/
	public static function get_section_real_tipo_static(string $section_tipo) : string {

		$ar_related = common::get_ar_related_by_model(
			'section', // string model_name
			$section_tipo
		);

		$section_real_tipo = $ar_related[0] ?? $section_tipo;


		return $section_real_tipo;
	}//end get_section_real_tipo_static



	/**
	* GET_SECTION_AR_CHILDREN_TIPO
	* @param string $section_tipo
	* @param array $ar_model_name_required
	* @param bool $from_cache
	*	default true
	* @param bool $resolve_virtual
	*	Force resolve section if is virtual section. default false
	*	Name of desired filtered model array. You can use partial name like 'component_' (string position search is made it)
	* @return array $section_ar_children_tipo
	*/
	public static function get_ar_children_tipo_by_model_name_in_section(
			string $section_tipo,
			array $ar_model_name_required,
			bool $from_cache=true,
			bool $resolve_virtual=false, // (!) keep default resolve_virtual=false
			bool $recursive=true,
			bool $search_exact=false,
			array|bool $ar_tipo_exclude_elements=false,
			?array $ar_exclude_models=null
		) : array {

		# AR_MODEL_NAME_REQUIRED cast 'ar_model_name_required' to array
		$ar_model_name_required = (array)$ar_model_name_required;

		static $cache_ar_children_tipo = [];
		$cache_uid = $section_tipo.'_'.serialize($ar_model_name_required).'_'.(int)$resolve_virtual.'_'.(int)$recursive;
		if ($from_cache === true) {
			// if (isset($cache_ar_children_tipo[$cache_uid])) {
			if (array_key_exists($cache_uid, $cache_ar_children_tipo)) {
				return $cache_ar_children_tipo[$cache_uid];
			}
			// elseif (isset($_SESSION['dedalo']['config']['ar_children_tipo_by_modelo_name_in_section'][$cache_uid])) {
			// 	return $_SESSION['dedalo']['config']['ar_children_tipo_by_modelo_name_in_section'][$cache_uid];
			// }
		}

		$ar_elements_to_be_exclude = [];

		#
		# RESOLVE_VIRTUAL : Resolve virtual section to real
		if($resolve_virtual === true) {

			# ORIGINAL TIPO : always keeps the original type (current)
			$original_tipo = $section_tipo;

			# SECTION VIRTUAL
			$section_real_tipo = section::get_section_real_tipo_static($section_tipo);

			if($section_real_tipo!==$original_tipo) {

				# OVERWRITE CURRENT SECTION TIPO WITH REAL SECTION TIPO
				$section_tipo = $section_real_tipo;
			}//end if($section_real_tipo!=$original_tipo) {

			# EXCLUDE ELEMENTS
			if ($ar_tipo_exclude_elements===false) {
				$ar_tipo_exclude_elements = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
					$original_tipo, // string tipo
					'exclude_elements', // string model_name
					'children', // string relation_type
					$search_exact // bool search_exact
				);
			}
			if (!isset($ar_tipo_exclude_elements[0])) {
				// debug_log(__METHOD__
				// 	." Warning. exclude_elements of section $original_tipo not found (1) ".to_string()
				// 	, logger::WARNING
				// );
			}else{

				$tipo_exclude_elements		= $ar_tipo_exclude_elements[0];
				$ar_elements_to_be_exclude	= RecordObj_dd::get_ar_terminos_relacionados(
					$tipo_exclude_elements,
					false, // bool cache
					true // bool simple
				);

				foreach ($ar_elements_to_be_exclude as $element_tipo) {

					$model_name = RecordObj_dd::get_modelo_name_by_tipo($element_tipo, true);
					if($model_name==='section_group' || $model_name === 'section_tab' || $model_name === 'tab') {
						$ar_recursive_children		= (array)section::get_ar_recursive_children($element_tipo, $ar_exclude_models);
						$ar_elements_to_be_exclude	= array_merge($ar_elements_to_be_exclude, $ar_recursive_children);
					}
				}//end foreach ($ar_elements_to_be_exclude as $key => $element_tipo) {
			}
		}//end if($resolve_virtual)

		$tipo						= $section_tipo;
		$section_ar_children_tipo	= array();


		// we obtain the child elements of this section
		if (count($ar_model_name_required)>1) {

			if (true===$recursive) { // Default is recursive
				$ar_recursive_children = (array)section::get_ar_recursive_children($tipo, $ar_exclude_models);
			}else{
				$RecordObj_dd			= new RecordObj_dd($tipo);
				$ar_recursive_children	= $RecordObj_dd->get_ar_children_of_this();
			}

		}else{

			switch (true) {
				// Components are searched recursively
				case (strpos($ar_model_name_required[0], 'component')!==false && $recursive!==false):
					$ar_recursive_children = section::get_ar_recursive_children($tipo, $ar_exclude_models);
					break;
				// Others (section_xx, buttons, etc.) are in the first level
				default:
					$RecordObj_dd			= new RecordObj_dd($tipo);
					$ar_recursive_children	= $RecordObj_dd->get_ar_children_of_this();
					break;
			}
		}

		if( empty($ar_recursive_children) ) {
			// throw new Exception(__METHOD__." ar_recursive_children is empty! This section don't have: '$model_name_required' ");
			// debug_log(__METHOD__." ar_recursive_children is empty! This section id=$parent don't have: '$model_name_required' ". __METHOD__ );
			return $section_ar_children_tipo; # return empty array
		}

		// unset the exclude elements of the virtual section to the original section
		if($resolve_virtual === true) {
			$ar_recursive_children = array_diff($ar_recursive_children, $ar_elements_to_be_exclude);
		}

		// Loop through the child elements of the current section in the thesaurus
		foreach($ar_recursive_children as $current_terminoID) {

			$model_name = RecordObj_dd::get_modelo_name_by_tipo($current_terminoID, true);
			foreach((array)$ar_model_name_required as $model_name_required) {

				if (strpos($model_name, $model_name_required)!==false && !in_array($current_terminoID, $section_ar_children_tipo) ) {

					if($search_exact===true && $model_name!==$model_name_required) {
						// Is not accepted model
					}else{
						$section_ar_children_tipo[] = $current_terminoID;
					}
				}

				// component_filter : If we search for 'component_filter', we will only return the first one, since there may be nested sections
				if($ar_model_name_required[0]==='component_filter' && count($ar_recursive_children)>1) {
					if(SHOW_DEBUG===true) {
						// debug_log(__METHOD__." Broken loop for search 'component_filter' in section $section_tipo ".count($ar_recursive_children). " " .to_string($ar_model_name_required));
						// throw new Exception("Error Processing Request", 1);
					}
					continue;
				}
			}
		}//end foreach($ar_recursive_children as $current_terminoID)

		// Cache session store
		$cache_ar_children_tipo[$cache_uid] = $section_ar_children_tipo;
		// $_SESSION['dedalo']['config']['ar_children_tipo_by_modelo_name_in_section'][$cache_uid] = $section_ar_children_tipo;


		return $section_ar_children_tipo;
	}//end get_ar_children_tipo_by_model_name_in_section



	/**
	* GET_AR_RECURSIVE_CHILDREN : private alias of RecordObj_dd::get_ar_recursive_children
	* Note the use of $ar_exclude_models to exclude not desired section elements, like auxiliary sections in ich
	* @param string $tipo
	* @param array|null $ar_exclude_models = null
	* @return array $ar_recursive_children
	*/
	public static function get_ar_recursive_children( string $tipo, ?array $ar_exclude_models=null ) : array {

		# AR_EXCLUDE_MODELS
		$default_ar_exclude_models = [
			'box elements',
			'area',
			'component_semantic_node' // used in v5 but unused in v6
		];

		# Current elements and children are not considerate part of section and must be excluded in children results
		$exclude_models = !empty($ar_exclude_models)
			? array_merge($default_ar_exclude_models, $ar_exclude_models)
			: $default_ar_exclude_models;


		$ar_recursive_children = RecordObj_dd::get_ar_recursive_children(
			$tipo, // string tipo
			false, // bool is recursion
			$exclude_models, // array ar_exclude_models
			'norden' // string order
		);

		return $ar_recursive_children;
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
			// vars: $section_tipo, $ar_model_name_required, $from_cache=true, $resolve_virtual=false, $recursive=true, $search_exact=false, $ar_tipo_exclude_elements=false
				$ar_excluded_tipo			= false;
				$ar_exclude_elements_tipo	= section::get_ar_children_tipo_by_model_name_in_section(
					$this->tipo, // section_tipo
					['exclude_elements'], // ar_model_name_required
					true // from_cache
				);
				if (!isset($ar_exclude_elements_tipo[0])) {
					debug_log(__METHOD__
						." Warning. exclude_elements of section $this->tipo not found (2). All virtual section must has defined exclude_elements ",
						logger::WARNING
					);
				}else{
					// locate excluded tipos (related terms) in this virtual section
					$ar_excluded_tipo = RecordObj_dd::get_ar_terminos_relacionados(
						$ar_exclude_elements_tipo[0],
						false, // bool cache
						true // bool simple
					);
				}

			// real section
				$children_real_tipos = section::get_ar_children_tipo_by_model_name_in_section(
					$section_real_tipo, // section_tipo
					['button_'], // ar_model_name_required
					true, // from_cache
					false, // resolve_virtual
					false, // recursive
					false, // search_exact
					$ar_excluded_tipo // ar_tipo_exclude_elements
				);

			// virtual section. Add the specific buttons of the virtual section, if the virtual have buttons add to the list.
				$children_virtual_tipos = section::get_ar_children_tipo_by_model_name_in_section(
					$this->tipo, // section_tipo
					['button_'], // ar_model_name_required
					true, // from_cache
					false, // resolve_virtual
					false, // recursive
					false, // search_exact
					$ar_excluded_tipo // ar_tipo_exclude_elements
				);

			$ar_buttons_tipo = array_merge( $children_real_tipos, $children_virtual_tipos );

		}else{

			// if the section is a real section, add the buttons directly
			$ar_buttons_tipo = section::get_ar_children_tipo_by_model_name_in_section(
				$this->tipo, // section_tipo
				['button_'], // ar_model_name_required
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
	* GET_AR_ALL_PROJECT_LANGS
	* Alias of static method common::get_ar_all_project_langs
	* @return array $ar_all_project_langs
	*	(like lg-spa, lg-eng)
	*/
		// public function get_ar_all_project_langs() : array {

		// 	$ar_all_project_langs = common::get_ar_all_langs();

		// 	return (array)$ar_all_project_langs;
		// }//end get_ar_all_project_langs



	/**
	* GET_SECTION_TIPO : alias of $this->get_tipo()
	* @return string $section_tipo
	*/
	public function get_section_tipo() : string {

		return $this->get_tipo();
	}//end get_section_tipo



	/**
	* SET_CREATED_DATE
	* @param string $timestamp
	*	$date is timestamp as "2016-06-15 20:01:15" or "2016-06-15"
	* This method is used mainly in importations
	* @return void
	*/
	public function set_created_date(string $timestamp) : void {

		$dd_date			= dd_date::get_dd_date_from_timestamp($timestamp);
		$date_with_format	= $dd_date->get_dd_timestamp(
			'Y-m-d H:i:s',
			true
		);

		$dato = $this->get_dato(); // Force load
		$dato->created_date = $date_with_format;
		$this->set_dato($dato); // Force update
	}//end set_created_date



	/**
	* SET_MODIFIED_DATE
	* @param string $timestamp
	*	$date is timestamp as "2016-06-15 20:01:15" or "2016-06-15"
	* This method is used mainly in importations
	* @return void
	*/
	public function set_modified_date(string $timestamp) : void {

		$dd_date			= dd_date::get_dd_date_from_timestamp($timestamp);
		$date_with_format	= $dd_date->get_dd_timestamp(
			'Y-m-d H:i:s',
			true
		);

		$dato = $this->get_dato(); // Force load
		$dato->modified_date = $date_with_format;
		$this->set_dato($dato); // Force update
	}//end set_modified_date



	/**
	* GET_CREATED_DATE
	* @return string|null $local_value
	*/
	public function get_created_date() : ?string {

		$dato			= $this->get_dato();
		$local_value	= isset($dato->created_date)
			? dd_date::timestamp_to_date(
				$dato->created_date,
				true // bool full
			  )
			: null;

		return $local_value;
	}//end get_created_date



	/**
	* GET_MODIFIED_DATE
	* @return string|null $local_value
	*/
	public function get_modified_date() : ?string {

		$dato			= $this->get_dato();
		$local_value	= isset($dato->modified_date)
			? dd_date::timestamp_to_date(
				$dato->modified_date,
				true // bool full
			  )
			: null;

		return $local_value;
	}//end get_modified_date



	/**
	* GET_CREATED_BY_USERID
	* Get section dato property 'created_by_userID'
	* @return int|null $created_by_userID
	*/
	public function get_created_by_userID() : ?int {

		$dato = $this->get_dato();
		if( isset($dato->created_by_userID) )  {
			return (int)$dato->created_by_userID;
		}

		return null;
	}//end get_created_by_userID



	/**
	* SET_CREATED_BY_USERID
	* Set section dato property 'created_by_userID'
	* @return bool
	*/
	public function set_created_by_userID(int $value) : bool {

		// force get dato
		$this->get_dato();

		$this->dato->created_by_userID = $value;

		return true;
	}//end set_created_by_userID



	/**
	* GET_MODIFIED_BY_USERID
	* Get section dato property 'modified_by_userID'
	* @return int|null $modified_by_userID
	*/
	public function get_modified_by_userID() : ?int {

		$dato = $this->get_dato();
		if( isset($dato->modified_by_userID) )  {
			return (int)$dato->modified_by_userID;
		}

		return null;
	}//end get_modified_by_userID



	/**
	* SET_MODIFIED_BY_USERID
	* Set section dato property 'modified_by_userID'
	* @return bool
	*/
	public function set_modified_by_userID(int $value) : bool {

		// force get dato
		$this->get_dato();

		$this->dato->modified_by_userID = $value;

		return true;
	}//end set_modified_by_userID



	/**
	* GET_CREATED_BY_USER_NAME
	* @param bool $full_name = false
	* @return string|null $user_name
	*/
	public function get_created_by_user_name(bool $full_name=false) : ?string {

		$user_id = $this->get_created_by_userID();
		if( empty($user_id) ) {
			return null;
		}

		$user_name = section::get_user_name_by_userID(
			$user_id,
			$full_name // bool full_name
		);

		return $user_name;
	}//end get_created_by_user_name



	/**
	* GET_MODIFIED_BY_USER_NAME
	* @param bool $full_name = false
	* @return string|null $user_name
	*/
	public function get_modified_by_user_name(bool $full_name=false) : ?string {

		$user_id = $this->get_modified_by_userID();
		if( empty($user_id) ) {
			return null;
		}

		$user_name = section::get_user_name_by_userID(
			$user_id,
			$full_name // bool full_name
		);

		return $user_name;
	}//end get_modified_by_user_name



	/**
	* GET_USER_NAME_BY_USERID
	* @param int $userID
	* @param bool $full_name = true
	* @return string $user_name
	*/
	public static function get_user_name_by_userID(int $userID, bool $full_name=true) : ?string {

		if($userID==DEDALO_SUPERUSER){
			$user_name = $full_name===false
				? 'root'
				: 'Admin debugger';
		}else{
			$tipo = $full_name===false
				? DEDALO_USER_NAME_TIPO
				: DEDALO_FULL_USER_NAME_TIPO;

			$full_username_model	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component				= component_common::get_instance(
				$full_username_model, // 'component_input_text',
				$tipo,
				$userID,
				'list',
				DEDALO_DATA_NOLAN,
				DEDALO_SECTION_USERS_TIPO
			);
			$dato		= $component->get_dato();
			$user_name	= $dato[0] ?? null;
		}

		return $user_name;
	}//end get_user_name_by_userID



	/**
	* GET_SECTION_INFO
	* Return information about creation, modification and publication of current section
	* @return object
	*/
	public function get_section_info() : object {

		$section_info = (object)[
			'created_date'				=> $this->get_created_date(),
			'modified_date'				=> $this->get_modified_date(),
			'created_by_user_name'		=> $this->get_created_by_user_name(false),
			'modified_by_user_name'		=> $this->get_modified_by_user_name(false),
			'created_by_userID'			=> $this->get_created_by_userID(),
			// publication
			'publication_first_date'	=> $this->get_publication_date(diffusion::$publication_first_tipo),
			'publication_last_date'		=> $this->get_publication_date(diffusion::$publication_last_tipo),
			'publication_first_user'	=> $this->get_publication_user(diffusion::$publication_first_user_tipo),
			'publication_last_user'		=> $this->get_publication_user(diffusion::$publication_last_user_tipo)
		];


		return $section_info;
	}//end get_section_info



	/**
	* GET_PUBLICATION_DATE
	* @see class.diffusion definitions for publication_first_tipo, publication_last_tipo, etc.
	* @param string $component_tipo
	* @return string|null $local_date
	*/
	public function get_publication_date(string $component_tipo) : ?string {

		$local_date = null;

		// tipos
			$section_id		= $this->section_id;
			$section_tipo	= $this->tipo;

		// component
			$model_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component	= component_common::get_instance(
				$model_name,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$dato = $component->get_dato();

		// local_date
			if (!empty($dato) && !empty($dato[0]) && !empty($dato[0]->start)) {

				$dd_date	= new dd_date($dato[0]->start);
				$timestamp	= $dd_date->get_dd_timestamp();
				$local_date	= dd_date::timestamp_to_date($timestamp, true); // string|null
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
			$model_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component	= component_common::get_instance(
				$model_name,
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
				$user_id	= isset($dato[0]) && isset($dato[0]->section_id)
					? (int)$dato[0]->section_id
					: null;
				$user_name	= isset($user_id)
					? section::get_user_name_by_userID($user_id, false)
					: null;
			}


		return $user_name;
	}//end get_publication_user



	/**
	* GET_COMPONENT_COUNTER
	* Obtain the counter for given component ontology tipo
	* Components storage its id to match with any other component as dataframe
	* @param string $tipo
	* @return int $component_counter
	*/
	public function get_component_counter( string $tipo ) : int {

		$dato				= $this->get_dato();
		$component_counter	= $dato->counters->$tipo ?? 0; // default counter value is always 1, including the empty counter

		return $component_counter;
	}//end get_component_counter



	/**
	* SET_COMPONENT_COUNTER
	* Fix the component counter with given ontology tipo and value
	* Set the counter of the component into section data schema
	* @param string $tipo
	* @param int value
	* @return int $dato->counters->$tipo
	*/
	public function set_component_counter( string $tipo, int $value ) : int {

		$dato = $this->get_dato(); // Force load

		if( !isset($dato->counters) ){
			$dato->counters = new stdClass();
		}

		$dato->counters->$tipo = $value; // set the new counter for the component adding 1 to the counter.
		$this->set_dato($dato); // Force update

		return $dato->counters->$tipo;
	}//end set_component_counter



	/**
	* GET_AR_ALL_SECTION_RECORDS_UNFILTERED
	* @see diffusion::build_table_data_recursive
	*
	* @param string $section_tipo
	* @return array $ar_records
	*/
	public static function get_ar_all_section_records_unfiltered( string $section_tipo ) : array {

		$result = section::get_resource_all_section_records_unfiltered(
			$section_tipo
		);

		if(SHOW_DEBUG===true) {
			$n_rows = pg_num_rows($result);
			if ($n_rows>1000) {
				debug_log(__METHOD__
					." WARNING: TOO MANY RESULTS IN THE QUERY. TO OPTIMIZE MEMORY, DO NOT STORE RESULTS IN ARRAY IN THIS SEARCH. BEST USE 'get_resource_all_section_records_unfiltered' "
					, logger::ERROR
				);
			}
		}
		$ar_records = [];
		while ($rows = pg_fetch_assoc($result)) {
			$ar_records[] = $rows['section_id'];
		}

		return $ar_records;
	}//end get_ar_all_section_records_unfiltered



	/**
	* GET_RESOURCE_ALL_SECTION_RECORDS_UNFILTERED
	* Iterate result as:
	* while ($rows = pg_fetch_assoc($result)) {
	*	$current_id = $rows['section_id'];
	* }
	* @param string $section_tipo
	* @param string $select = 'section_id'
	* @return PgSql\Result|bool $result
	*/
	public static function get_resource_all_section_records_unfiltered( string $section_tipo, string $select='section_id' ) {

		$matrix_table	= common::get_matrix_table_from_tipo($section_tipo);
		// Ignore invalid empty matrix tables
		if (empty($matrix_table)) {
			debug_log(__METHOD__
				. " ERROR: invalid empty matrix table " . PHP_EOL
				. ' section_tipo: ' . $section_tipo
				, logger::ERROR
			);
			return false;
		}
		$strQuery   = "-- ".__METHOD__." \nSELECT $select FROM \"$matrix_table\" WHERE section_tipo = '$section_tipo' ORDER BY section_id ASC ";
		$result		= JSON_RecordObj_matrix::search_free($strQuery);

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
					debug_log(__METHOD__
						." Error on remove_section_media_files: model:$model, tipo:$component_tipo, section_id:$section_id, section_tipo:$section_tipo"
						, logger::ERROR
					);
					continue;
				}

				$ar_restored[] = (object)[
					'tipo'	=> $component_tipo,
					'model'	=> $model
				];

				debug_log(__METHOD__
					." removed media files from  model:$model, tipo:$component_tipo, section_id:$section_id, section_tipo:$section_tipo"
					, logger::WARNING
				);
			}//end foreach


		return $ar_removed;
	}//end remove_section_media_files



	/**
	* RESTORE_DELETED_SECTION_MEDIA_FILES
	* Use when recover section from time machine. Get files "deleted" (renamed in 'deleted' folder) and move and rename to the original media folder
	* @return array|null $ar_restored
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
				debug_log(__METHOD__
					." Nothing to restore "
					, logger::DEBUG
				);
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
					debug_log(__METHOD__
						." Error on restore_deleted_section_media_files: ". PHP_EOL
						. " model:$model, tipo:$component_tipo, section_id:$section_id, section_tipo:$section_tipo"
						, logger::ERROR
					);
					continue;
				}

				$ar_restored[] = (object)[
					'tipo'	=> $component_tipo,
					'model'	=> $model
				];

				debug_log(__METHOD__
					." restored media files from  model:$model, tipo:$component_tipo, section_id:$section_id, section_tipo:$section_tipo"
					, logger::WARNING
				);
			}//end foreach


		return $ar_restored;
	}//end restore_deleted_section_media_files



	/**
	* FORCED_CREATE_RECORD :
	* Check if the section exists in the DB, if the section exist, return true, else create new section with
	* the section_id and section_tipo into the database and return true.
	* Note that default value component filter is saved too for maintain accessibility
	* @return bool true is insert / false if not
	*/
	public function forced_create_record() : bool {

		if( $this->section_id === null ) {

			// Save to obtain a new incremental section_id
			$this->Save();
			return true;

		}else{

			// Check if section_id already exists
				$current_section_record_exists = section::section_record_exists( $this->section_id, $this->tipo );
				// Record already exists. Not continue
				if($current_section_record_exists===true) {
					debug_log(__METHOD__
						." Record already exists, ignored !!!! ($this->section_id, $this->tipo)"
						, logger::WARNING
					);
					return false;
				}

			// section_id not exists. Create a new section record // ADDED 27-12-2018
				$save_options = new stdClass();
					$save_options->forced_create_record = true;
				$this->Save($save_options);
		}

		return true;
	}//end forced_create_record



	/**
	* SECTION_RECORD_EXISTS
	* Search in current matrix_table the section_id given for current section_tipo
	* @param int|string $section_id
	* 	Will be cast to int into the search
	* @param string $section_tipo
	* @return bool $result
	*/
	public static function section_record_exists( int|string $section_id, string $section_tipo ) : bool {

		// Check if section_id already exists
		$matrix_table = common::get_matrix_table_from_tipo($section_tipo);
		// Ignore invalid empty matrix tables
		if (empty($matrix_table)) {
			debug_log(__METHOD__
				. " ERROR: invalid empty matrix table. Unable to resolve section_record_exists! " . PHP_EOL
				. ' section_tipo: ' . $section_tipo
				, logger::ERROR
			);
			return false;
		}

		$strQuery	= "SELECT section_id FROM \"$matrix_table\" WHERE section_id = ".(int)$section_id." AND section_tipo = '$section_tipo' ";
		$result		= JSON_RecordObj_matrix::search_free($strQuery);
		$num_rows	= pg_num_rows($result);

		// num_rows. > 0 indicates already exists
		$result = (bool)($num_rows>0);


		return $result;
	}//end section_record_exists



	### /DIFFUSION INFO #####################################################################################



	/**
	* GET_DIFFUSION_INFO
	* Get property 'diffusion_info' from section dato
	* sample:
	* {
	*   ...
	* 	diffusion_info : null
	* }
	* @return object|null $diffusion_info
	*/
	public function get_diffusion_info() : ?object {

		$dato			= $this->get_dato();
		$diffusion_info	= $dato->diffusion_info ?? null;


		return $diffusion_info;
	}//end get_diffusion_info



	/**
	* ADD_DIFFUSION_INFO_DEFAULT
	* Add default base diffusion_info to section only if not already set
	* @param string $diffusion_element_tipo
	* @return bool
	* true if not already set and is fixed, false if is already set
	*/
	public function add_diffusion_info_default(string $diffusion_element_tipo) : bool {

		$dato = $this->get_dato();

		// empty cases
			if (!isset($dato->diffusion_info)) {
				$dato->diffusion_info = new stdClass();
			}

		// set property $diffusion_element_tipo
		if (!isset($dato->diffusion_info->$diffusion_element_tipo)) {

			$date		= date('Y-m-d H:i:s');
			$user_id	= logged_user_id();

			$dato->diffusion_info->{$diffusion_element_tipo} = (object)[
				'date'		=> $date,
				'user_id'	=> $user_id
			];

			// Force update section dato
			$this->set_dato($dato);

			return true;
		}

		return false;
	}//end add_diffusion_info_default



	/**
	* DIFFUSION_INFO_PROPAGATE_CHANGES
	* Resolve section caller to current section (from inverse locators)
	* and set every diffusion info as null to set publication as Outdated
	* @return bool
	*/
	public function diffusion_info_propagate_changes() : bool {
		$start_time = start_time();

		// (!) stopped temporally 27-03-2023 by Paco to prevent unexpected errors in diffusion
		return true;

		// exclude some matrix_table records to propagate diffusion info
			$exclude_tables = [
				'matrix_users',
				'matrix_projects',
				'matrix_profiles',
				'matrix_activity',
				'matrix_dd',
				'matrix_list',
				'matrix_hierarchy_main',
				'matrix_indexations',
				'matrix_langs',
				'matrix_layout',
				'matrix_tools'
			];
			$matrix_table = common::get_matrix_table_from_tipo($this->tipo);
			if (in_array($matrix_table, $exclude_tables)) {
				return true;
			}

		// inverse_locators
		$inverse_locators = $this->get_inverse_references();
		foreach($inverse_locators as $locator) {

			$current_section_tipo	= $locator->from_section_tipo;
			$current_section_id		= $locator->from_section_id;

			$section = section::get_instance(
				$current_section_id,
				$current_section_tipo,
				'list' // string mode
			);
			$dato = $section->get_dato();

			if (!empty($dato->diffusion_info)) {

				// Unset section diffusion_info in section dato
				$dato->diffusion_info = null; // Default value

				// Update section whole dato
				$section->set_dato($dato);

				// Save section with updated dato
				$section->Save();
				debug_log(__METHOD__
					." Propagated diffusion_info changes to section $current_section_tipo, $current_section_id ". exec_time_unit($start_time).' ms'
					, logger::DEBUG
				);
			}else{
				debug_log(__METHOD__
					." Unnecessary do diffusion_info changes to section $current_section_tipo, $current_section_id ". exec_time_unit($start_time).' ms'
					, logger::DEBUG
				);
			}
		}

		return true;
	}//end diffusion_info_propagate_changes



	### INVERSE LOCATORS / REFERENCES #####################################################################################



	/**
	* GET_INVERSE_REFERENCES
	* Get calculated inverse locators for all matrix tables
	* @see search::calculate_inverse_locator
	* @return array $inverse_locators
	*/
	public function get_inverse_references() : array {

		if (empty($this->section_id)) {
			// The section does not exist yet. Return empty array
			return [];
		}

		// Create a minimal locator based on current section
		$filter_locator = new locator();
			$filter_locator->set_section_tipo($this->tipo);
			$filter_locator->set_section_id($this->section_id);

		// Get calculated inverse locators for all matrix tables
		$ar_inverse_locators = search_related::get_referenced_locators(
			[$filter_locator]
		);


		return $ar_inverse_locators;
	}//end get_inverse_references



	/**
	* REMOVE_ALL_INVERSE_REFERENCES
	* @see section->Delete()
	* @param bool $save = true
	* On true, saves the component dato (set false to test purposes only)
	* @return array $removed_locators
	*/
	public function remove_all_inverse_references( bool $save=true ) : array {

		$removed_locators = [];
		$caller_dataframe = $this->get_caller_dataframe();
		$inverse_locators = $this->get_inverse_references();
		foreach ($inverse_locators as $current_locator) {

			$component_tipo	= $current_locator->from_component_tipo;
			$section_tipo	= $current_locator->from_section_tipo;
			$section_id		= $current_locator->from_section_id;

			$model_name = RecordObj_dd::get_modelo_name_by_tipo( $component_tipo, true );
			#if ($model_name!=='component_portal' && $model_name!=='component_autocomplete' && $model_name!=='component_relation_children') {
			if ('component_relation_common' !== get_parent_class($model_name) && $model_name !== 'component_dataframe') {
				debug_log(__METHOD__
					. " ERROR (remove_all_inverse_references): Only portals are supported!! Ignored received: $model_name " . PHP_EOL
					, logger::WARNING
				);
				continue;
			}

			$component = component_common::get_instance(
				$model_name,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo,
				true,
				$caller_dataframe
			);

			// locator_to_remove
			$locator_to_remove = new locator();
				$locator_to_remove->set_type($component->get_relation_type());
				$locator_to_remove->set_section_id($this->section_id);
				$locator_to_remove->set_section_tipo($this->tipo);
				$locator_to_remove->set_from_component_tipo($component_tipo);

			if (true === $component->remove_locator_from_dato( $locator_to_remove )) {

				// removed case

				// Save component dato
				if ($save===true) {
					$component->Save();
				}

				$removed_locators[] = (object)[
					'removed_from'		=> $current_locator,
					'locator_to_remove'	=> $locator_to_remove
				];

				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__
						." !!!! Removed inverse reference to tipo:$this->tipo, section_id:$this->section_id in $model_name: tipo:$current_locator->from_component_tipo, section_id:$current_locator->from_section_id, section_tipo:$current_locator->from_section_tipo "
						, logger::DEBUG
					);
				}
			}else{

				// not removed case

				debug_log(__METHOD__
					." Error on remove reference to current_locator. locator_to_remove was not removed from inverse_locators! ". PHP_EOL
					.' current_locator: ' . to_string($current_locator) . PHP_EOL
					.' locator_to_remove: ' . to_string($locator_to_remove) . PHP_EOL
					.' component: ' . $model_name . PHP_EOL
					.' tipo: ' . $component_tipo . PHP_EOL
					.' section_tipo: ' . $section_tipo . PHP_EOL
					.' section_id: ' . $section_id
					, logger::WARNING
				);
				if(SHOW_DEBUG===true) {
					dump($inverse_locators, ' remove_all_inverse_references inverse_locators ++ save: '.to_string($save));
					dump($component->get_dato(), ' remove_all_inverse_references component->get_dato() ++ '.to_string());
				}
			}
		}//end foreach ($inverse_locators as $current_locator)


		return $removed_locators;
	}//end remove_all_inverse_references



	### RELATIONS #####################################################################################



	/**
	* GET_RELATIONS
	* Get section container 'relations' array of locators values
	* Consider the variable in the section when constructing the object ......	*
	* @param string $relations_container = 'relations'
	* @return array $relations
	*/
	public function get_relations( string $relations_container='relations' ) : array {

		if (empty($this->section_id)) {
			// Section do not exists yet. Return empty array
			return [];
		}

		$dato = $this->get_dato(); // Force load data

		$relations = $dato->{$relations_container} ?? [];


		return $relations;
	}//end get_relations



	/**
	* ADD_RELATION
	* @param object $locator
	*	locator with valid 'type' property defined is mandatory
	* @param string $relations_container = 'relations'
	* @return bool
	* 	true if is added
	*/
	public function add_relation( object $locator, string $relations_container='relations' ) : bool {

		// check locator is valid
			if(empty($locator)) {
				debug_log(__METHOD__
					." Invalid empty locator is received to add (empty)." . PHP_EOL
					." Locator was ignored (type:".gettype($locator).") " . PHP_EOL
					.' locator: '.to_string($locator)
					, logger::ERROR
				);
				return false;
			}
			if (!is_object($locator)) {
				debug_log(__METHOD__
					." Invalid locator is received to add. (non object)" . PHP_EOL
					." Locator was ignored (type:".gettype($locator).") " . PHP_EOL
					.' locator: ' . to_string($locator)
					, logger::ERROR
				);
				return false;
			}
			if (!isset($locator->type)) {
				debug_log(__METHOD__
					." Invalid locator is received to add. (type is not set)" . PHP_EOL
					." Locator was ignored (type:".gettype($locator).") " . PHP_EOL
					.' locator: ' . to_string($locator)
					, logger::ERROR
				);
				return false;
			}

		// paginated_key. Remove possible property paginated_key if it exists
			if (isset($locator->paginated_key)) {
				debug_log(__METHOD__
					. " Removing temporal property 'paginated_key' from locator " . PHP_EOL
					. ' locator: ' . to_string($locator)
					, logger::ERROR
				);
				unset($locator->paginated_key);
			}

		// relations. section relations data. Could be empty
			$relations = $this->get_relations( $relations_container );
			if (!empty($relations)) {
				// data integrity check: Clean possible bad formed locators (old and beta errors)
				foreach ($relations as $current_relation) {
					if (!is_object($current_relation) ||
						!isset($current_relation->section_id) ||
						!isset($current_relation->section_tipo) ||
						!isset($current_relation->type)
						) {

						debug_log(__METHOD__
							." Invalid relations locator found. " . PHP_EOL
							.' !! FOUNDED BAD FORMAT RELATION LOCATOR IN SECTION_RELATION DATA:' . PHP_EOL
							.' The execution will stop until this erroneous data is corrected!' . PHP_EOL
							.' locator: '. json_encode($current_relation) . PHP_EOL
							.' relations: '. json_encode($relations)
							, logger::ERROR
						);
						// throw new Exception("Error Processing Request. !! FOUNDED BAD FORMAT RELATION LOCATOR IN SECTION_RELATION DATA: (type:".gettype($current_relation).") ".to_string($current_relation), 1);
					}
				}
			}

		// safe array index to prevent accidental assoc array
			$relations = array_values($relations);

		// Add if not already exists
			$locator_exists = locator::in_array_locator( $locator, $relations );
			if ($locator_exists===true) {

				debug_log(__METHOD__
					.' Ignored add locator action: locator already exists: ' . PHP_EOL
					.' locator: '. to_string($locator)
					, logger::WARNING
				);

				return false;
			}
			array_push($relations, $locator);

		// Force load 'dato' if not exists / loaded
		// (!) removed because is not necessary. get_relations method already loads section dato
			if ( empty($this->dato) && $this->section_id>0 ) {
				$this->get_dato();
			}
			if ( empty($this->dato) || !is_object($this->dato) ) {
				$this->dato = new stdClass();
			}

		// Update whole container
			$this->dato->{$relations_container} = $relations;


		return true;
	}//end add_relation



	/**
	* REMOVE_RELATION
	* @param object locator $locator
	* locator with valid 'type' property defined is mandatory
	* @param string $relations_container = 'relations'
	* @return bool
	* 	true if is removed
	*/
	public function remove_relation( object $locator, string $relations_container='relations' ) : bool {

		// ar_properties. Used to compare existing locators with given
			$ar_properties=array('section_id','section_tipo','type');
			// optional properties, based on given locator
			if (isset($locator->from_component_tipo))	$ar_properties[] = 'from_component_tipo';
			if (isset($locator->tag_id))				$ar_properties[] = 'tag_id';
			if (isset($locator->component_tipo))		$ar_properties[] = 'component_tipo';
			if (isset($locator->section_top_tipo))		$ar_properties[] = 'section_top_tipo';
			if (isset($locator->section_top_id))		$ar_properties[] = 'section_top_id';

		// add locators to new_relations array excluding given locator
			$removed		= false;
			$new_relations	= [];
			$relations		= $this->get_relations( $relations_container );
			foreach ($relations as $current_locator_obj) {

				// Test if already exists
				$equal = locator::compare_locators( $current_locator_obj, $locator, $ar_properties );
				if ( $equal===false ) {

					// add
					$new_relations[] = $current_locator_obj;

				}else{

					// no add
					$removed = true;
				}
			}

		// Updates current dato relations with clean array of locators
			if ($removed===true) {
				$this->dato->{$relations_container} = $new_relations;
			}


		return $removed;
	}//end remove_relation



	/**
	* REMOVE_RELATIONS_FROM_COMPONENT_TIPO
	* Delete all locators of type requested from section relation dato
	* (!) Note that this method do not save
	* @param object $options
	* {
	*	component_tipo: string ,
	* 	relations_container: string 'relations',
	* 	model: string 'component_dataframe',
	* 	caller_dataframe: {
	* 		section_tipo: string "numisdata4",
	* 		section_id: string "1",
	* 		section_id_key: string "1",
	* 		tipo_key: string "numisdata161"
	* 	}
	* }
	* @return array $ar_deleted_locators
	*/
	public function remove_relations_from_component_tipo( object $options ) : array {

		// options
			$component_tipo			= $options->component_tipo;
			$relations_container	= $options->relations_container ?? 'relations';
			$model					= $options->model ?? null;
			$caller_dataframe		= $options->caller_dataframe ?? null;

		$removed				= false;
		$ar_deleted_locators	= [];
		$new_relations			= [];
		$relations				= $this->get_relations( $relations_container );
		foreach ($relations as $current_locator) {

			// dataframe case
			// by default, component_dataframe is built with caller_dataframe except when import data.
			// When import data from CSV files, the component is built without dataframe
			// because is not possible to create different instances for every dataframe data.
			// In those cases the component_dataframe manage its data as other components with whole data.
			if($model === 'component_dataframe' && isset($caller_dataframe) ) {

				if (
					( isset($current_locator->from_component_tipo) && $current_locator->from_component_tipo===$component_tipo)
					&& ( isset($current_locator->section_id_key) && intval($current_locator->section_id_key)===intval($caller_dataframe->section_id_key) )
					&& ( isset($current_locator->section_tipo_key) && $current_locator->section_tipo_key===$caller_dataframe->section_tipo_key)
					){
						$ar_deleted_locators[] = $current_locator;

						debug_log(__METHOD__
							. " Removed COMPONENT_DATAFRAME locator from section relations" . PHP_EOL
							. ' current_locator: ' . to_string($current_locator)
							, logger::WARNING
						);

						$removed = true;
				}else{
					// Add normally
					$new_relations[] = $current_locator;
				}

			}else{

				// Test if from_component_tipo
				if (isset($current_locator->from_component_tipo) && $current_locator->from_component_tipo===$component_tipo) {

					$ar_deleted_locators[] = $current_locator;

					// debug
						// debug_log(__METHOD__
						// 	. " Removed $model locator from section relations" . PHP_EOL
						// 	. ' current_locator: ' . to_string($current_locator)
						// 	, logger::WARNING
						// );

					$removed = true;

				}else{
					// Add normally
					$new_relations[] = $current_locator;
				}
			}
		}//end foreach ($relations as $current_locator)

		if ($removed===true) {
			// Update section dato relations on finish
			$this->dato->{$relations_container} = $new_relations;
		}


		return $ar_deleted_locators;
	}//end remove_relations_from_component_tipo




	### /RELATIONS #####################################################################################



	/**
	* GET_SECTION_MAP
	* Section map data is stored in 'properties' of element of model 'section_map'
	* placed in the first level of section.
	* Note that virtual section could have different section_map than the real section
	* furthermore, we try first without resolve and if result is empty, resolving real section
	* @param string $section_tipo
	* @return object|null $setion_map
	* output sample:
	* {
	*	"thesaurus": {
	*		"term": "test52",
	*		"model": "test169",
	*		"parent": "test71",
	*		"is_descriptor": "test88"
	*	}
	* }
	*/
	public static function get_section_map( string $section_tipo ) : ?object {

		// cache
			static $section_map_cache = [];
			if (array_key_exists($section_tipo, $section_map_cache)) {
				return $section_map_cache[$section_tipo];
			}

		$ar_model_name_required	= ['section_map'];

		// Locate section_map element in current section (virtual or not)
			$ar_children = section::get_ar_children_tipo_by_model_name_in_section(
				$section_tipo,
				$ar_model_name_required,
				true, // bool from_cache
				false, // bool resolve_virtual
				false, // bool recursive
				true // bool search_exact
			);

		// If not found children, try resolving real section (resolve_virtual=true)
			if (empty($ar_children)) {
				$ar_children = section::get_ar_children_tipo_by_model_name_in_section(
					$section_tipo,
					$ar_model_name_required,
					true, // bool from_cache
					true, // // bool resolve_virtual
					false, // bool recursive
					true // bool search_exact
				);
			}

		// section_map
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
	* Used for compatibility of search queries when we need filter by section_tipo
	* inside filter (thesaurus case for example)
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
				// default apply
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
			array('name'=>'created_date',	 'tipo'=>'dd199', 'model'=>'component_date'),
			array('name'=>'modified_by_user','tipo'=>DEDALO_SECTION_INFO_MODIFIED_BY_USER, 'model'=>'component_select'), 	// 'dd197'
			array('name'=>'modified_date',	 'tipo'=>DEDALO_SECTION_INFO_MODIFIED_DATE, 'model'=>'component_date') 			// 'dd201'
		);

		return $ar_tipos;
	} //end get_modified_section_tipos



	/**
	 * GET_MODIFIED_SECTION_TIPOS_BASIC
	 Return the list of fixed
	 * @return array $ar_tipos
	 */
	public static function get_modified_section_tipos_basic() : array {

		$ar_tipos = [
			'dd200', // Created by user
			'dd199', // Creation date
			DEDALO_SECTION_INFO_MODIFIED_BY_USER,
			DEDALO_SECTION_INFO_MODIFIED_DATE
		];

		return $ar_tipos;
	}//end get_modified_section_tipos_basic



	/**
	* UPDATE_MODIFIED_SECTION_DATA
	* @param object $options
	* @return object $this->dato
	*/
	public function update_modified_section_data(object $options) : object {

		if ($this->tipo===DEDALO_ACTIVITY_SECTION_TIPO) {
			return $this->dato;
		}

		// options
			$mode = $options->mode;

		// Fixed private tipos
			$modified_section_tipos = section::get_modified_section_tipos();
				$created_by_user	= array_find($modified_section_tipos, function($el){ return $el['name']==='created_by_user'; }); 	// array('tipo'=>'dd200', 'model'=>'component_select');
				$created_date		= array_find($modified_section_tipos, function($el){ return $el['name']==='created_date'; }); 		// array('tipo'=>'dd199', 'model'=>'component_date');
				$modified_by_user	= array_find($modified_section_tipos, function($el){ return $el['name']==='modified_by_user'; }); 	// array('tipo'=>'dd197', 'model'=>'component_select');
				$modified_date		= array_find($modified_section_tipos, function($el){ return $el['name']==='modified_date'; }); 		// array('tipo'=>'dd201', 'model'=>'component_date');

		// Current user locator
			$user_id		= logged_user_id();
			$user_locator	= new locator();
				$user_locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO); // dd128
				$user_locator->set_section_id($user_id); // logged user
				$user_locator->set_type(DEDALO_RELATION_TYPE_LINK);

		// Current date
			$base_date	= component_date::get_date_now();
			$dd_date	= new dd_date($base_date);
			$time		= dd_date::convert_date_to_seconds($dd_date);
			$dd_date->set_time($time);
			$date_now 	= new stdClass();
				$date_now->start = $dd_date;

		switch ($mode) {

			case 'new_record': // new record

				// Created by user
					$user_locator->set_from_component_tipo($created_by_user['tipo']);
					// set value with safe path
						if (!isset($this->dato->relations)) {
							$this->dato->relations = [];
						}
						$temp_relations = array_filter($this->dato->relations, function($el) use($user_locator){
							return !isset($el->from_component_tipo) || $el->from_component_tipo!==$user_locator->from_component_tipo;
						});
						// add current locator
						$temp_relations[] = $user_locator;
						// update relations container
						$this->dato->relations = array_values($temp_relations);

				// Creation date
					$component = component_common::get_instance(
						$created_date['model'],
						$created_date['tipo'],
						$this->section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$this->tipo // section_tipo
					);
					$component->set_dato( $date_now );
					// $this->set_component_direct_dato( $component ); // (!) removed 11-02-2023 : interact with section save flow (tool register case)
					$component_dato = $component->get_dato_unchanged(); ## IMPORTANT !!!!! (NO usar get_dato() aquí ya que puede cambiar el tipo fijo establecido por set_dato)

				// set value with safe path
					if (!isset($this->dato->components)) {
						$this->dato->components = new stdClass();
					}
					$component_full_dato = (object)[
						'inf'	=> 'created_date [component_date]',
						'dato'	=> (object)[
							DEDALO_DATA_NOLAN => $component_dato
						]
					];
					$this->dato->components->{$created_date['tipo']} = $component_full_dato;
				break;

			case 'update_record': // update_record (record already exists)

				// forced to load section data
					$this->get_dato();

				// Modified by user
					$user_locator->set_from_component_tipo($modified_by_user['tipo']);
					// set value with safe path
						if (!isset($this->dato->relations)) {
							$this->dato->relations = [];
						}
						$temp_relations = array_filter($this->dato->relations, function($el) use($user_locator){
							return !isset($el->from_component_tipo) || $el->from_component_tipo!==$user_locator->from_component_tipo;
						});
						// add current locator
						$temp_relations[] = $user_locator;
						// update relations container
						$this->dato->relations = array_values($temp_relations);

				// Modification date
					$component = component_common::get_instance(
						$modified_date['model'],
						$modified_date['tipo'],
						$this->section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$this->tipo // section_tipo
					);
					$component->set_dato($date_now);
					// $this->set_component_direct_dato($component); // (!) removed 11-02-2023 : interact with section save flow (tool register case)
					$component_dato = $component->get_dato_unchanged(); // (!) IMPORTANT !!!!! (NO usar get_dato() aquí ya que puede cambiar el tipo fijo establecido por set_dato)

				// set value with safe path
					if (!isset($this->dato->components)) {
						$this->dato->components = new stdClass();
					}
					$component_full_dato = (object)[
						'inf'	=> 'modified_date [component_date]',
						'dato'	=> (object)[
							DEDALO_DATA_NOLAN => $component_dato
						]
					];
					$this->dato->components->{$modified_date['tipo']} = $component_full_dato;
				break;
		}


		return $this->dato;
	}//end update_modified_section_data



	/**
	* GET_AR_GROUPER_MODELS
	* Returns the list of grouper models
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
	* @param string|null $from_parent = null
	* @param array $ar_db_record = []
	* 	Array of natrix_time_machine table found records
	* @return object $subdatum
	* 	Object with two properties: array context, array data
	*	{
	*		context	: [],
	* 		data	: []
	* 	}
	*/
	public function get_tm_subdatum( ?string $from_parent=null, array $ar_db_record=[] ) : object {

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
							debug_log(
								__METHOD__." Error Processing Request. db_record is NOT an expected object. Ignored record ! ".to_string($db_record),
								logger::ERROR
							);
						}
						continue;
					}

				// sub-data time machine from record columns
					$section_id			= $db_record->section_id;
					$section_tipo		= $db_record->section_tipo;
					$lang				= $db_record->lang;
					$id					= $db_record->id;
					$timestamp			= $db_record->timestamp;
					$bulk_process_id	= $db_record->bulk_process_id;
					$user_id			= $db_record->userID;
					$tipo				= $db_record->tipo;
					$dato				= $db_record->dato;

				// empty tipo case catch
					if (empty($tipo)) {
						debug_log(__METHOD__." Empty tipo was received ! . db_record: ".PHP_EOL.to_string($db_record), logger::WARNING);
						continue;
					}

				// short vars
					$source_model				= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
					$components_with_relations	= component_relation_common::get_components_with_relations();
					$mode						= 'tm';

				// if time machine is recovering sections, creates the section and inject his time machine dato to be used as normal section loaded from matrix
				// all data and sub-data will get from this.
				if($source_model==='section'){
					$section = section::get_instance(
						$section_id,
						$section_tipo
					);
					$section->set_dato($dato);
				}

				// ar_ddo iterate
						// build data from elements
				foreach ($ddo_map as $ddo) {

					// ddo tipo
						$current_ddo_tipo = $ddo->tipo;

					// ddo item model
						$ddo->model = $ddo->model ?? RecordObj_dd::get_modelo_name_by_tipo($ddo->tipo, true);

					// permissions
						$ddo->permissions = 1;

					// model of dato tipo
						$model = RecordObj_dd::get_modelo_name_by_tipo($tipo, true); // model of dato tipo

					// switch cases
						switch (true) {

							case ($current_ddo_tipo==='dd1573'): // id (model: component_section_id)
								$data_item = (object)[
									'id'					=> 'matrix_id',
									'section_id'			=> $section_id,
									'section_tipo'			=> $section_tipo,
									'tipo'					=> $current_ddo_tipo,  // fake tipo only used to match ddo with data
									'lang'					=> DEDALO_DATA_NOLAN,
									'mode'					=> $mode, // expected 'tm'
									'from_component_tipo'	=> $current_ddo_tipo,  // fake tipo only used to match ddo with data
									'value'					=> $id,
									'debug_model'			=> 'component_section_id',
									'debug_label'			=> 'matrix ID',
									'matrix_id'				=> $id,
									'user_id'				=> $user_id
								];
								$ar_subdata[]		= $data_item;
								$ar_subcontext[]	= $ddo;
								break;

							case ($current_ddo_tipo==='dd1371'): // process id (model: component_section_id)
								$data_item = (object)[
									'id'					=> 'bulk_process_id',
									'section_id'			=> $section_id,
									'section_tipo'			=> $section_tipo,
									'tipo'					=> $current_ddo_tipo,  // fake tipo only used to match ddo with data
									'lang'					=> DEDALO_DATA_NOLAN,
									'mode'					=> $mode, // expected 'tm'
									'from_component_tipo'	=> $current_ddo_tipo,  // fake tipo only used to match ddo with data
									'value'					=> [$bulk_process_id], // always need to be array
									'debug_model'			=> 'component_number',
									'debug_label'			=> 'Process id',
									'matrix_id'				=> $id
								];
								$ar_subdata[]		= $data_item;
								$ar_subcontext[]	= $ddo;
								break;

							case ($current_ddo_tipo==='rsc329'): // user notes
								// search notes with current matrix_id
									$sqo = new search_query_object();
										$sqo->section_tipo	= DEDALO_TIME_MACHINE_NOTES_SECTION_TIPO; // rsc832
										$sqo->filter		= json_decode('{
											"$and": [
												{
													"q": "'.$id.'",
													"q_operator": null,
													"path": [
														{
															"section_tipo": "'.DEDALO_TIME_MACHINE_NOTES_SECTION_TIPO.'",
															"component_tipo": "rsc835",
															"model": "component_number",
															"name": "Code"
														}
													]
												}
											]
										}');
									$search = search::get_instance($sqo);
									$result = $search->search();

									$note_section_id = $result->ar_records[0]->section_id ?? null;

								// component
									$note_model			= RecordObj_dd::get_modelo_name_by_tipo($current_ddo_tipo,true);
									$current_component	= component_common::get_instance(
										$note_model,
										$current_ddo_tipo,
										$note_section_id,
										$mode, // use tm mode to preserve service_time_machine coherence
										$ddo->lang ?? DEDALO_DATA_LANG,
										$sqo->section_tipo
									);

									// inject this tipo as related component from_component_tipo
										$current_component->from_component_tipo	= $current_ddo_tipo;
										$current_component->from_section_tipo	= $section_tipo;

									// permissions. Set to allow all users read
										$current_component->set_permissions(1);

									// get component JSON
										$get_json_options = new stdClass();
											$get_json_options->get_context	= false;
											$get_json_options->get_data		= true;
										$element_json = $current_component->get_json($get_json_options);

									// edit section_id to match section locator data item
										$data_item = !empty($element_json->data) && !empty($element_json->data[0])
											? $element_json->data[0]
											: $current_component->get_data_item(null);
										// set matrix_id
										$data_item->matrix_id = $id;

									// attach to current ddo
										$data_item->from_component_tipo	= $current_ddo_tipo;
										$data_item->section_id			= $section_id;
										$data_item->section_tipo		= $section_tipo;
										// parent properties
										$data_item->parent_section_tipo	= $sqo->section_tipo;
										$data_item->parent_section_id	= $note_section_id;

									// tm_user_id. Add time machine info
										$data_item->tm_user_id = $user_id;

									$ar_subdata[]		= $data_item;
									$ar_subcontext[]	= $ddo;
								break;

							case ($current_ddo_tipo==='dd547'): // When (model: component_date) from activity section

								$timestamp_tipo	= $current_ddo_tipo;
								$model_name		= RecordObj_dd::get_modelo_name_by_tipo($timestamp_tipo,true);
								$component		= component_common::get_instance(
									$model_name,
									$timestamp_tipo,
									$section_id,
									$mode,
									DEDALO_DATA_NOLAN,
									$section_tipo
								);

								// dato
									$date = dd_date::get_dd_date_from_timestamp( $timestamp );
									$date_value = new stdClass();
										$date_value->start = $date;
									$component_dato = [$date_value];
									$component->set_dato($component_dato);
									$component->set_permissions(1);

								// get component JSON
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
									'id'					=> 'who',
									'section_id'			=> $section_id,
									'section_tipo'			=> $section_tipo,
									'tipo'					=> $current_ddo_tipo,
									'lang'					=> DEDALO_DATA_NOLAN,
									'mode'					=> $mode,
									'from_component_tipo'	=> $current_ddo_tipo,
									'value'					=> $ar_values,
									'debug_label'			=> 'modified by user',
									'matrix_id'				=> $id
								];

								$ar_subdata[]		= $data_item;
								$ar_subcontext[]	= $ddo;
								break;

							case ($current_ddo_tipo==='dd546'): // Where (model: component_input_text)
								// component_label
									$component_label = RecordObj_dd::get_termino_by_tipo(
										$tipo, // string terminoID
										DEDALO_APPLICATION_LANG, // string lang
										true, // bool from_cache
										true // bool fallback
									);
									// on tool_time_machine prepend section label
									$rqo = dd_core_api::$rqo ?? null;
									if ( $rqo && $rqo->source->tipo!==$rqo->source->section_tipo ) {
										// section_label
											$section_label = RecordObj_dd::get_termino_by_tipo(
												$section_tipo, // string terminoID
												DEDALO_APPLICATION_LANG, // string lang
												true, // bool from_cache
												true // bool fallback
											);
											$component_label = $section_label.': '.$component_label;
									}
								$current_value	= [$component_label];
								$data_item		= (object)[
									'id'					=> 'where',
									'section_id'			=> $section_id,
									'section_tipo'			=> $section_tipo,
									'tipo'					=> $current_ddo_tipo,  // fake tipo only used to match ddo with data
									'lang'					=> DEDALO_DATA_LANG,
									'mode'					=> $mode,
									'from_component_tipo'	=> $current_ddo_tipo,  // fake tipo only used to match ddo with data
									'value'					=> $current_value, // .' ['.$section_tipo.']'
									'debug_model'			=> 'component_input_text',
									'debug_label'			=> 'Where',
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
									'id'					=> 'dd_grid',
									'section_id'			=> $section_id,
									'section_tipo'			=> $section_tipo,
									'tipo'					=> $current_ddo_tipo,
									'lang'					=> DEDALO_DATA_NOLAN,
									'mode'					=> $mode,
									'from_component_tipo'	=> $current_ddo_tipo,
									'from_section_tipo'		=> $section_tipo,
									'value'					=> $dd_grid_value,
									'debug_model'			=> $ddo->model,
									'debug_label'			=> 'section',
									'matrix_id'				=> $id
								];
								$ar_subdata[] = $data_item;
								break;

							default:

								// component
									$component_tipo	= ($source_model==='section')
										? $ddo->tipo // get from ddo
										: $tipo;	 // get from db record dato ($db_record->tipo)
									$component_model	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true); // $ddo->model;
									$is_relation		= in_array($component_model, $components_with_relations);
									$lang				= $is_relation===true
										? DEDALO_DATA_NOLAN
										: ((bool)RecordObj_dd::get_translatable($component_tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN);

									$caller_dataframe = $ddo->caller_dataframe ?? null;

									$current_component = component_common::get_instance(
										$component_model,
										$component_tipo,
										$section_id,
										$mode, // the component always in tm because the edit could fire a save with the dato_default
										$lang,
										$section_tipo,
										true,
										$caller_dataframe
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

								// view
									$current_view = $ddo->view ?? 'text';
									$current_component->set_view($current_view);

								// dato. inject dato from time machine record
									if ($source_model==='section') {

										$dato = isset($dato)
											? $dato
											: new stdClass();

										// dato safe format
										if (!isset($dato->relations)) {
											$dato->relations = [];
										}
										if (!isset($dato->components)) {
											$dato->components = new stdClass();
										}
									}
									$current_dato = ($source_model!=='section')
										? $dato // from deleted component dato case
										: (($is_relation===false) // from deleted section case
											? $dato->components->{$current_ddo_tipo}->dato->{$lang} ?? null
											: array_values(array_filter($dato->relations, function($el) use($current_ddo_tipo) {
												return isset($el->from_component_tipo) && $el->from_component_tipo===$current_ddo_tipo;
											  })));

									// has dataframe
									// if the component has a dataframe
									// the time machine data will has both data, the main data from the main component
									// and the dataframe data.
									// to inject the correct main data is necessary filter it with the from_component_tipo
										if ( strpos($source_model, 'component_')!==false ) {
											$dataframe_ddo = $current_component->get_dataframe_ddo();
											if( !empty($dataframe_ddo) && !empty($dato) && $source_model!=='section'){
												if (is_array($dato)) {
													$current_dato = array_values( array_filter( $dato, function($el) use($current_ddo_tipo) {
														return isset($el->from_component_tipo) && $el->from_component_tipo===$current_ddo_tipo;
													}));
												}else{
													debug_log(__METHOD__
														. " [has dataframe] dato expected type is array " . PHP_EOL
														. ' dato type: ' . gettype($dato) . PHP_EOL
														. ' dato: ' . to_string($dato) . PHP_EOL
														. ' section_tipo: ' . to_string($this->tipo) . PHP_EOL
														. ' section_id: ' . to_string($this->section_id) . PHP_EOL
														. ' dataframe_ddo: ' . to_string($dataframe_ddo) . PHP_EOL
														, logger::ERROR
													);
												}
											}
										}

									// inject current_dato
										$current_component->set_dato($current_dato);

									// permissions. Set to allow all users read
										$current_component->set_permissions(1);

								if ($ddo->model==='dd_grid') {

									// component value
										$value = $current_component->get_grid_value();
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

									// Check if the element JSON has his own request_config to change it as list
									// when the component has his own definition in ontology, it can had a components in edit mode
									// all this components need to be set to mode = list
									// this change is important to maintain the data as is in time machine
									// and prevent to save default data from components in edit mode inside the tool tm.
										foreach ($element_json->context as $value) {
											if(isset($value->request_config) && is_array($value->request_config)){
												// select the request config of dedalo api_engine
												$new_request_config_object = array_find($value->request_config, function($el) {
													return $el->api_engine==='dedalo';
												});
												// if the component has his own show and ddo_map, change it to mode = list
												if(is_object($new_request_config_object) && isset($new_request_config_object->show) && isset($new_request_config_object->show->ddo_map)){
													foreach ($new_request_config_object->show->ddo_map as $new_ddo) {
														$new_ddo->mode = 'tm';
													}
												}
											}
										}

									// mix ar_subcontext
										$ar_subcontext = array_merge($ar_subcontext, $element_json->context);

									// empty data case. Generate and add a empty value item
										if (empty($element_json->data) && $model!=='component_section_id') {
											$data_item = $current_component->get_data_item(null);
												$data_item->parent_tipo		= $section_tipo;
												$data_item->row_section_id	= $section_id;
											$element_json->data = [$data_item];
										}
									// has_dataframe
										// if the component has a dataframe create new component and inject his own data
										// dataframe data is saved by the main dataframe and is part of the row data
										if ( strpos($source_model, 'component_')!==false ) {
											if( !empty($dataframe_ddo) ){
												foreach ( $dataframe_ddo as $current_dataframe_ddo ) {

													$dataframe_tipo = $current_dataframe_ddo->tipo;

													// 1 remove dataframe data created by the main component in his subdatum process
													// when the main component create his own subdatum it can get incorrect dataframe data
													// because the main component use the time machine data but not the dataframe data by itself.
													// and it can meet his data with the current dataframe data.
													// to avoid it, remove the dataframe data from the main component.
													foreach ($element_json->data as $key => $current_source_data) {
														if($current_source_data->tipo === $dataframe_tipo || $current_source_data->from_component_tipo === $dataframe_tipo){
															unset($element_json->data[$key]);
														}
													}

													// 2 get the dataframe data from dato, filtering by dataframe_tipo
													if( !empty($dato) ){
														$dataframe_data = array_values( array_filter( $dato, function($el) use($dataframe_tipo) {
															return isset($el->from_component_tipo) && $el->from_component_tipo===$dataframe_tipo;
														}));
													}


													// 3 get the component dataframe data with time machine data
													$dataframe_model = RecordObj_dd::get_modelo_name_by_tipo($dataframe_tipo);
													foreach ($dataframe_data as $key => $current_dataframe_data) {
														// create the caller_dataframe with the current data information
														$new_caller_dataframe = new stdClass();
															$new_caller_dataframe->section_id_key	= $current_dataframe_data->section_id_key;
															$new_caller_dataframe->section_tipo_key	= $current_dataframe_data->section_tipo_key;
															$new_caller_dataframe->section_tipo		= $section_tipo;

														// // create the dataframe component
														$dataframe_component = component_common::get_instance(
															$dataframe_model,
															$dataframe_tipo,
															$section_id,
															$mode, // the component always in tm because the edit could fire a save with the dato_default
															$lang,
															$section_tipo,
															true,
															$new_caller_dataframe
														);
														// inject the current data
														$dataframe_component->set_dato( [$current_dataframe_data] );
														// permissions. Set to allow all users read
														$dataframe_component->set_permissions(1);
														// get component JSON data
														$dataframe_json = $dataframe_component->get_json((object)[
															'get_context'	=> true,
															'get_data'		=> true
														]);

														// parse component_data. Add matrix_id and unify output value
														$dataframe_data	= array_map(function($data_item) use($id) {
															$data_item->matrix_id = $id; // (!) needed to match context and data in tm mode section
															return $data_item;
														}, $dataframe_json->data);
														// mix dataframe data with the current main data
														$ar_subdata = array_merge($ar_subdata, $dataframe_data);
													}
												}
											}
										}
									// parse component_data. Add matrix_id and unify output value
										$component_data	= array_map(function($data_item) use($id) {
											$data_item->matrix_id = $id; // (!) needed to match context and data in tm mode section
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
	* GET_TIME_MACHINE_LIST_TIPO
	* Get the time machine list tipo for the section
	* @return string|null $time_machine_list_tipo
	*/
	public function get_time_machine_list_tipo() : ?string {

		$section_tipo = $this->tipo;

		// $time_machine_list_tipo	= section::get_ar_children_by_model($section_tipo, ['time_machine_list']) ?? null;

		$ar_children_tipo = section::get_ar_children_tipo_by_model_name_in_section(
			$section_tipo,
			['time_machine_list'], // ar_model_name_required
			true, // from cache
			true, // resolve virtual
			false, // bool recursive
			true // bool search_exact
		);
		$time_machine_list_tipo	= $ar_children_tipo[0] ?? null;

		$permissions = isset($time_machine_list_tipo)
			? common::get_permissions($section_tipo, $time_machine_list_tipo)
			: 0;

		if( isset($permissions) && $permissions>0 ) {
			return $time_machine_list_tipo;
		}

		return null;
	}//end get_time_machine_list_tipo



	/**
	* POST_SAVE_COMPONENT_PROCESSES
	* Executed on component save (when section save script is complete)
	* This is a hook to allow custom action after section saves
	* @param object $options
	* {
	* 	component : object
	* }
	* @return bool
	*/
	public function post_save_component_processes(object $options) : bool {

		// options
			$component = $options->component;

		// Hook only. Not used at now


		return true;
	}//end post_save_component_processes



	/**
	* DUPLICATE_CURRENT_SECTION
	* Creates a new record cloning all data from current section
	* @return int|string|null $section_id
	*/
	public function duplicate_current_section() : int|string|null {

		$section_tipo = $this->get_tipo();

		// create a new blank section record with same the section_tipo that current
			$new_section	= section::get_instance(null, $section_tipo);
			$new_section_id	= $new_section->Save();

			if (empty($new_section_id) || (int)$new_section_id<1) {
				return null;
			}

		// copy data
			$source_dato = clone $this->get_dato();

			// load new_section dato
			$new_section->get_dato();

			// ar_section_info_tipos. Ontology children of DEDALO_SECTION_INFO_SECTION_GROUP
				$ar_section_info_tipos = RecordObj_dd::get_ar_children(DEDALO_SECTION_INFO_SECTION_GROUP);

			// tipos to skip on copy
				$skip_tipos = $ar_section_info_tipos;

			// models to skip on copy
				$skip_models = [
					// 'component_state',
					'component_publication',
					'component_info'
				];

			// relation components
				$group_locators = []; // group locator to prevent save component for each locator
				foreach ($source_dato->relations as $locator) {
					$current_tipo = $locator->from_component_tipo ?? false;
					if ($current_tipo!==false) {
						// tipo filter
						if (in_array($current_tipo, $skip_tipos)) {
							continue;
						}
						// its OK. Add value
						$group_locators[$current_tipo][] = $locator;
					}
				}
				foreach ($group_locators as $current_tipo => $ar_locators) {
					// model filter
					$current_model = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
					// model safe
					if (strpos($current_model, 'component_')!==0) {
						debug_log(__METHOD__
							. " Skipped non component model " . PHP_EOL
							. ' model: ' . to_string($current_model) . PHP_EOL
							. ' tipo: ' . to_string($current_tipo) . PHP_EOL
							. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
							. ' new_section_id: ' . to_string($new_section_id)
							, logger::ERROR
						);
						continue;
					}
					if (in_array($current_model, $skip_models)) {
						continue;
					}
					$lang		= $ar_locators[0]->lang ?? DEDALO_DATA_NOLAN; // could exists locators with lang
					$component	= component_common::get_instance(
						$current_model,
						$current_tipo,
						$new_section_id,
						'list',
						$lang,
						$section_tipo
					);
					$component->set_dato($ar_locators);
					$component->Save(); // forces to create each relation in relation table and time machine and activity records
				}

			// inherits from father if exists
				// component_relation_parent find
				$ar_parent_tipo = section::get_ar_children_tipo_by_model_name_in_section($section_tipo, ['component_relation_parent'], true, true, true, true, false);
				if (!empty($ar_parent_tipo)) {
					// calls to current section as child from another sections
					$parents_data = component_relation_parent::get_parents(
						$this->get_section_id(),
						$section_tipo
					);
					if (!empty($parents_data)) {

						$current_tipo	= $ar_parent_tipo[0];
						$current_model	= RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);

						$save_current = true;
						// model safe
						if (strpos($current_model, 'component_')!==0) {
							debug_log(__METHOD__
								. " Skipped non component model " . PHP_EOL
								. ' model: ' . to_string($current_model) . PHP_EOL
								. ' tipo: ' . to_string($current_tipo) . PHP_EOL
								. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
								. ' new_section_id: ' . to_string($new_section_id)
								, logger::ERROR
							);
							$save_current = false;
						}
						if (in_array($current_model, $skip_models)) {
							$save_current = false;
						}
						if ($save_current===true) {
							$component = component_common::get_instance(
								$current_model,
								$current_tipo,
								$new_section_id,
								'list',
								DEDALO_DATA_NOLAN,
								$section_tipo
							);
							$component->set_dato($parents_data);
							$component->Save(); // forces to create each relation in relation table and time machine and activity records
						}
					}
				}

			// literal components
				$ar_media_components = component_media_common::get_media_components();

				foreach ($source_dato->components as $current_tipo => $component_full_dato) {
					// tipo filter
					if (in_array($current_tipo, $skip_tipos)) {
						continue;
					}
					// model filter
					$current_model = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
					// model safe
					if (strpos($current_model, 'component_')!==0) {
						debug_log(__METHOD__
							. " Skipped non component model " . PHP_EOL
							. ' model: ' . to_string($current_model) . PHP_EOL
							. ' tipo: ' . to_string($current_tipo) . PHP_EOL
							. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
							. ' new_section_id: ' . to_string($new_section_id)
							, logger::ERROR
						);
						continue;
					}
					if (in_array($current_model, $skip_models)) {
						continue;
					}
					// media common cases
					if( in_array($current_model, $ar_media_components) ){

						$source_component = component_common::get_instance(
							$current_model,
							$current_tipo,
							$this->section_id,
							'list',
							$lang,
							$section_tipo
						);

						$source_component->duplicate_component_media_files( $new_section_id );
					}
					// its OK. Add value
					foreach ($component_full_dato->dato as $lang => $local_value) {

						// target component
						$target_component = component_common::get_instance(
							$current_model,
							$current_tipo,
							$new_section_id,
							'list',
							$lang,
							$section_tipo
						);
						// media common cases
						if( in_array($current_model, $ar_media_components) ){

							// consolidate media files and save it
							$target_component->regenerate_component( (object)[
								'delete_normalized_files' => false
							]);

						}else{
							// save in a common way
							$target_component->set_dato($local_value); // set dato in current lang
							$target_component->Save(); // save each lang to force to create a time machine and activity records
						}
					}

				}


		return (int)$new_section_id;
	}//end duplicate_current_section



	/**
	* GET_PERMISSIONS
	* @return int $this->permissions
	*/
	public function get_section_permissions() : int {

		// check if the permissions are set previously, then return it.
			if(isset($this->permissions)){
				return $this->permissions;
			}

		// common cases permissions calculation
			$this->permissions = common::get_permissions($this->tipo, $this->tipo);

		// special cases
			switch (true) {

				// maintains dedalo_activity_section_tipo < 2 to prevent edition
				case ($this->tipo===DEDALO_ACTIVITY_SECTION_TIPO && $this->permissions>1):
					return 1;

				// user section . Allow user edit self data (used by tool_user_admin)
				case ($this->tipo===DEDALO_SECTION_USERS_TIPO && $this->permissions<1 && $this->section_id==logged_user_id()):
					$this->permissions = 1; // set to 1 to allow tool_user_admin access
					break;

				// time machine notes case (rsc832)
				case ($this->tipo===DEDALO_TIME_MACHINE_NOTES_SECTION_TIPO):
					// his own section
					$this->permissions = (logged_user_id()===$this->get_created_by_userID())
						? 2
						: 1;
					// open access for super admins to the section list of Time Machine notes
					if ($this->permissions<2 && $this->mode==='list' && security::is_global_admin(logged_user_id())) {
						$this->permissions = 2;
					}
					break;
			}


		return $this->permissions;
	}//end get_permissions



	/**
	* BUILD_SQO_ID
	* Unified way to compound sqo_id value
	* This string is used as key for section session SQO
	* like $_SESSION['dedalo']['config']['sqo'][$sqo_id]
	* @param string $tipo
	* 	section tipo like 'oh1'
	* @return string $sqo_id
	* 	final sqo_id like 'oh1'
	*/
	public static function build_sqo_id(string $tipo) {

		$sqo_id = $tipo;

		return $sqo_id;
	}//end build_sqo_id



	/**
	* __DESTRUCT
	*/
		// public function __destruct() {

		// 	$matrix_table	= common::get_matrix_table_from_tipo($this->tipo);
		// 	$key			= $matrix_table.'_'.$this->section_id .'_'. $this->tipo;
		// 		// dump(JSON_RecordObj_matrix::$ar_JSON_RecordObj_matrix_instances, ' JSON_RecordObj_matrix::$ar_JSON_RecordObj_matrix_instances var ++ '.to_string($key));
		// 	if( isset(JSON_RecordObj_matrix::$ar_JSON_RecordObj_matrix_instances[$key]) ) {

		// 		unset(JSON_RecordObj_matrix::$ar_JSON_RecordObj_matrix_instances[$key]);
		// 			dump($key, ' Removed key from JSON_RecordObj_matrix::$ar_JSON_RecordObj_matrix_instances ++ '.to_string());
		// 	}
		// }//end __destruct



}//end class section
