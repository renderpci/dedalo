<?php
declare(strict_types=1);
/**
* COMPONENT_COMMON
* Common methods of all components
*
*/
abstract class component_common extends common {



	/**
	* CLASS VARS
	* @var
	*/
		// string section_id. Component's section section_id
		// protected $section_id;
		// string parent. Component's section section_id (alias of $section_id)
		public $parent;
		// string section_tipo. Component's section tipo
		public $section_tipo;
		public $valor_lang;				// string language of the final value of the component (if it is a list of values, the language of the field it points to that can be translated even if the component is not data "1" value: "Si" or "yes"
		// protected $dato;				// object dato (JSON encoded in db)
		public $valor;					// string usually dato
		public $dataframe;				// object dataframe
		public $version_date;			// date normally resolved from time machine and assigned to current component
		public $locator;				// full locator used to instance the component, the instance only use section_tipo,component_tipo,mode,lang of the locator but we need the full locator to use properties as tag_id, top_tipo, etc.
		public $required;				// field is required . Valorar de usar 'Usable en Indexación' (tesauro) para gestionar esta variable
		public $debugger;				// info for admin
		// ar_tools_name. Default list of tools for every component. Override if component don't need this minimum tools
		public $ar_tools_name = [
			'tool_time_machine',
			'tool_lang',
			'tool_replace_component_data',
			'tool_add_component_data'
		];
		public $ar_tools_obj;
		public $ar_authorized_tool_name;

		public $exists_dato_in_any_lan = false;
		public $dato_resolved;

		// expected language for this component (used to verify that the structure is well formed)
		public $expected_lang;

		// parent section obj (optional, useful for component_av...)
		public $section_obj;

		// referenced section tipo (used by component_autocomplete, compoent_radio_button.. for set target section_tipo (properties) - additional to referenced component tipo (TR)- )
		public $referenced_section_tipo;

		public $render_vars;

		// search_input_name. injected for records search
		public $search_input_name;

		// generate_json component
		public $generate_json_element = false;

		// diffusion_properties
		public $diffusion_properties;

		// update_diffusion_info_propagate_changes bool
		// To optimize save process in scripts of importation, you can disable (false) this option if is not really necessary
		public $update_diffusion_info_propagate_changes;

		// Component definition. Used in component label
		public $def;

		// changed_data . Fixed when DD_API save call to component update_data_value()
		public $changed_data;

		// matrix_id
		public $matrix_id;

		// observable data, used for propagate to other components that are seeing this component changes.
		public $observable_dato;

		// string from_section_tipo
		public $from_section_tipo;
		// string from_component_tipo
		public $from_component_tipo;
		// array data_list
		public $data_list;
		// object column_obj
		public $column_obj;
		// observers_data
		public $observers_data;
		// fields_separator. Default separator between fields
		public $fields_separator = ' | ';
		// save_to_database, used for controlled if the component save his data to database. bool. default: true.
		public $save_to_database;
		// array ar_list_of_values
		public $ar_list_of_values;
		// bool updating_dato. Used by updater script
		public $updating_dato;
		// static array $ar_component_instances
		public static $ar_component_instances = [];
		// public bool cache
		public $cache;
		// components mono-value (his data is array but only first element is used)
		// Used in tool propagate_component_data to determine if they can use 'add' functionality
		public static $components_monovalue = [
			'component_3d',
			'component_av',
			'component_geolocation',
			'component_image',
			'component_json',
			'component_password',
			'component_pdf',
			'component_publication',
			'component_model',
			'component_section_id',
			'component_security_access',
			'component_select',
			'component_select_lang',
			'component_svg',
			'component_text_area'
		];



	/**
	* GET_INSTANCE
	* Singleton pattern
	* Creates a component instance
	* @param string $component_name = null
	* @param string $tipo = null
	* @param mixed $section_id = null
	* @param string $mode = 'edit'
	* @param string $lang = DEDALO_DATA_LANG
	* @param string $section_tipo = null
	* @param bool $cache = true
	*
	* @return object|null $component
	*/
	final public static function get_instance(string $component_name=null, string $tipo=null, $section_id=null, string $mode='edit', string $lang=DEDALO_DATA_LANG, string $section_tipo=null, bool $cache=true, object $caller_dataframe=null) : ?object {

		// tipo check. Is mandatory
			if (empty($tipo)) {
				$msg = "Error: on construct component (1): tipo is mandatory. component_name:'$component_name', tipo:'$tipo', section_id:'$section_id', mode:'$mode', lang:'$lang'";
				debug_log(__METHOD__
					. $msg
					, logger::ERROR
				);
				throw new Exception($msg, 1);
			}

		// model check. Verify 'component_name' and 'tipo' are correct
			$model_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			if (empty($component_name)) {

				// calculate component name (is ontology element model)
					$component_name = $model_name;

			}else if (!empty($component_name) && $model_name!==$component_name) {

				// warn to admin
					debug_log(__METHOD__.' '
						. "Warning. Fixed inconsistency in component get_instance tipo:'$tipo'. Expected model is '$model_name' and received model is '$component_name'"
						, logger::ERROR
					);

				// fix bad model
					$component_name = $model_name;
			}
			if (strpos($component_name, 'component_')!==0) {

				debug_log(__METHOD__
					. ' Error Processing Request. Illegal component: ' .PHP_EOL
					. ' component_name:' . to_string($component_name) .PHP_EOL
					. ' tipo:' . to_string($tipo) .PHP_EOL
					. ' section_tipo:' . to_string($section_tipo) .PHP_EOL
					. ' section_id:' . to_string($section_id) .PHP_EOL
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					$bt = debug_backtrace();
					dump($bt, ' bt ++ '.to_string($tipo));
					// throw new Exception("Error Processing Request. Illegal component: '$component_name' on ".__METHOD__, 1);
				}

				return null;
			}

		// section_tipo check : optional (if empty, section_tipo is calculated from: 1. page globals, 2. structure -only useful for real sections-)
			if (empty($section_tipo)) {
				debug_log(__METHOD__
					. '  Error. resolve_section_tipo is not supported anymore. Please fix this call ASASP '
					. ' sectiom_tipo: ' . to_string($section_tipo)
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					$bt = debug_backtrace();
					debug_log(__METHOD__
						. " DEBUG WARNING: TRIGGERED resolve_section_tipo". PHP_EOL
						. ' tipo: ' .$tipo . PHP_EOL
						. ' section_tipo: ' .$section_tipo . PHP_EOL
						. ' backtrace: ' . to_string($bt)
						, logger::ERROR
					);
				}
				return null;
			}

		// debug verification
			$check_instance_params = false;
			if(SHOW_DEBUG===true && $check_instance_params===true) {
				// model received check
					if ( !empty($component_name) && strpos($component_name, 'component_')===false ) {
						dump($tipo," tipo");
						throw new Exception("Error Processing Request. section or ($component_name) intended to load as component", 1);
					}
				// tipo format check
					if ( is_numeric($tipo) || !is_string($tipo) || !RecordObj_dd::get_prefix_from_tipo($tipo) ) {
						dump($tipo," tipo");
						throw new Exception("Error Processing Request. trying to use wrong var: '$tipo' as tipo to load as component", 1);
					}
				// section_id format check
					if ( !empty($section_id) ) {
						if (is_array($section_id)) {
							$bt = debug_backtrace();
							debug_log(__METHOD__
								." Error: section_id is array! : " . PHP_EOL
								.' backtrace: '.to_string($bt)
								, logger::ERROR
							);
						}
						if ( abs(intval($section_id))<1 && strpos((string)$section_id, DEDALO_SECTION_ID_TEMP)===false ) {
							dump($section_id," section_id - DEDALO_SECTION_ID_TEMP:" . DEDALO_SECTION_ID_TEMP);
							debug_log(__METHOD__
								." Error: DEDALO_SECTION_ID_TEMP. Trying to use wrong var: section_id: '$section_id' to load as component " . PHP_EOL
								.' DEDALO_SECTION_ID_TEMP: '. DEDALO_SECTION_ID_TEMP
								.' backtrace: '.to_string($bt)
								, logger::ERROR
							);
							throw new Exception("Error Processing Request. trying to use wrong var: '$section_id' as section_id to load as component", 1);
						}
					}

				// mode (mode) validation
					$ar_valid_mode = array(
						'edit',
						'list',
						'search',
						'tm',
						'related_list', // used by component_relation_index, and component_text_area to build custom sections
						// 'simple',
						// 'tool_portal',
						// 'tool_lang',
						// 'edit_tool',
						// 'indexation',
						// 'indexation_list',
						// 'selected_fragment',
						// 'tool_indexation',
						// 'tool_transcription',
						// 'print',
						// 'edit_component',
						// 'load_tr',
						// 'update',
						// 'portal_list',
						// 'list_thesaurus',
						// 'portal_list_view_mosaic',
						// 'edit_in_list',
						// 'edit_note',
						// 'tool_structuration',
						// 'dataframe_edit',
						// 'tool_description',
						// 'view_tool_description',
						// 'player',
						// 'json'
					);
					if ( empty($mode) || !in_array($mode, $ar_valid_mode) ) {
						if(SHOW_DEBUG===true) {
							throw new Exception("Error Processing Request. trying to use wrong var: '$mode' as mode to load as component", 1);	;
						}
						debug_log(__METHOD__." trying to use empty or invalid mode: '$mode' as mode to load component $tipo. mode: ".to_string($mode), logger::DEBUG);
					}
				// lang format check
					if ( empty($lang) || strpos($lang, 'lg-')===false ) {
						dump($lang," lang");
						throw new Exception("Error Processing Request. trying to use wrong var: '$lang' as lang to load as component", 1);
					}
				// section_tipo format check
					if (!empty($section_tipo)) {
						# Verify model_name is section
						$section_model_name = RecordObj_dd::get_modelo_name_by_tipo($section_tipo,true);
						if ($section_model_name!=='section') {
							dump($section_tipo," Verify model_name is section: section_model_name: $section_model_name");
							if (empty($section_model_name)) {
								$msg = "Error. Current section ($section_tipo) does not exists or model is missing. Please fix structure ASAP";
								throw new Exception($msg, 1);
							}
							throw new Exception("Error Processing Request. Trying to use: $section_model_name ($section_tipo) as section. Verified modelo is: $section_model_name", 1);
						}
						# Verify this section is a invalid resource call
						$ar_resources = array('rsc2','rsc75','rsc3','rsc4');
						if (in_array($section_tipo, $ar_resources) && $tipo!=='rsc88') {
							// debug_log(__METHOD__." ERROR - Error Processing Request. Direct call to resource section_tipo ($section_tipo) is not legal".to_string(), logger::ERROR);
							// debug_log(__METHOD__." ERROR: debug_backtrace ".to_string( debug_backtrace() ), logger::DEBUG);
							// trigger_error("ERROR - Error Processing Request. Direct call to resource section_tipo");
							#throw new Exception("Error Processing Request. Direct call to resource section_tipo ($section_tipo) is not legal", 1);
						}else{
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
								$ar_terminoID_by_model_name = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($tipo, 'section', 'parent');
								if (!isset($ar_terminoID_by_model_name[0])) {
									debug_log(__METHOD__
										." ar_terminoID_by_model_name is empty for tipo: ($tipo), ar_terminoID_by_modelo_name: ".to_string($ar_terminoID_by_model_name)
										, logger::ERROR
									);
									throw new Exception("Error Processing Request", 1);
								}
								$calculated_section_tipo	= $ar_terminoID_by_model_name[0];
								$real_section				= section::get_section_real_tipo_static($section_tipo);
								$is_real					= $real_section===$section_tipo ? true : false;
								if ( $is_real && $section_tipo!==$calculated_section_tipo && $mode!=='search' && SHOW_DEBUG===true) {
									#dump(debug_backtrace(), ' debug_backtrace '.to_string());
									#throw new Exception("Error Processing Request. Current component ($tipo) is not children of received section_tipo: $section_tipo.<br> Real section_tipo is: $real_section and calculated_section_tipo: $calculated_section_tipo ", 1);
								}
							}
						}
					}
			}//end if(SHOW_DEBUG===true)

		// update mode prevents to set cache as true
			if ($mode==='update' && $cache===true) {
				debug_log(__METHOD__
					. " Forced wrong cache value (true) to false when mode is 'update'  " . PHP_EOL
					. ' mode: ' . $mode . PHP_EOL
					. ' cache: ' . $cache . PHP_EOL
					, logger::ERROR
				);
				$cache = false;
			}

		// cache
			// $cache = false;

		// cache is false case. Direct construct without cache instance. Use this config in imports
			if ($cache===false || empty($section_id) || $mode==='update') {

				// instance new component
				$component = new $component_name(
					$tipo,
					$section_id,
					$mode,
					$lang,
					$section_tipo,
					$cache
				);
				// dataframe
				if(isset($caller_dataframe)) {
					$component->set_caller_dataframe($caller_dataframe);
				}

				return $component;
			}//end if ($cache===false || empty($section_id) || $mode==='update')

		// cache is true case. Get cache instance if it exists. Otherwise, create a new one
			// cache overload
				$max_cache_instances	= 1200;
				$cache_slice_on			= 400;
				$total					= count(self::$ar_component_instances);
				if ( $total > $max_cache_instances ) {
					// self::$ar_section_instances = array_slice(self::$ar_section_instances, $cache_slice_on, null, true);
					// new array
					$new_array = [];
					$i = 1;
					foreach (self::$ar_component_instances as $inst_key => $inst_value) {
						if ($i > $cache_slice_on) {
							$new_array[$inst_key] = $inst_value;
						}else{
							$i++;
						}
					}
					// replace matrix_instances array
					self::$ar_component_instances = $new_array;

					// error_log('))))))))))))))))))))))))))))))))))))))))) Replaced ar_component_instances cache from n '.$total.' to '.count($new_array));
					// error_log('))))))))))))))))))))))))))))))))))))))))) Replaced ar_component_instances (1200/400) key: '. implode('_', [$tipo, $section_tipo, $section_id, $lang, $mode]));
				}

			// find current instance in cache
				$cache_key = implode('_', [$tipo, $section_tipo, $section_id, $lang, $mode]);
				if(isset($caller_dataframe)) {
					// $cache_key .= '_'.$caller_dataframe->section_tipo.'_'.$caller_dataframe->tipo_key.'_'.$caller_dataframe->section_id_key;
					$cache_key .= '_'.$caller_dataframe->section_tipo.'_'.$caller_dataframe->section_id_key;
				}
				if ( !isset(self::$ar_component_instances[$cache_key]) ) {
					// instance new component
					self::$ar_component_instances[$cache_key] = new $component_name(
						$tipo,
						$section_id,
						$mode,
						$lang,
						$section_tipo,
						$cache
					);
					// dataframe
					if(isset($caller_dataframe)) {
						self::$ar_component_instances[$cache_key]->set_caller_dataframe($caller_dataframe);
					}
				}


		return self::$ar_component_instances[$cache_key];
	}//end get_instance



	/**
	* __CONSTRUCT
	* @param string $tipo = null
	* @param string|int|null $section_id = null
	* @param string $mode = 'edit'
	* @param string $lang = DEDALO_DATA_LANG
	* @param string $section_tipo = null
	* @return void
	*/
	protected function __construct(string $tipo, $section_id=null, string $mode='edit', string $lang=DEDALO_DATA_LANG, string $section_tipo=null, bool $cache=true) {

		// uid
			$this->uid = hrtime(true); // nanoseconds

		// tipo
			$this->tipo = $tipo;

		// section_id.
			// Preserve 'parent' for v5 compatibility in some situations
			$this->parent		= $section_id;
			$this->section_id	= $section_id;

		// mode
			if (empty($mode)) {
				$mode = 'edit';
			}
			$this->mode = $mode;
			if ($this->mode==='edit') {
				$this->update_diffusion_info_propagate_changes = true;
			}

		// lang
			// Note that $this->lang could be already assigned. If true, don't overwrite the fixed value
			if (!isset($this->lang)) {
				if (empty($lang)) {
					debug_log(__METHOD__.'  '
						. ' Valid \'lang\' value is mandatory! ('.$tipo.' - '.get_called_class().') Default DEDALO_DATA_LANG ('.DEDALO_DATA_LANG.') is used'
						, logger::ERROR
					);
					$lang = DEDALO_DATA_LANG;
				}
				$this->lang = $lang;
			}

		// section_tipo
			if (empty($section_tipo)) {
				debug_log(__METHOD__
					." Error. section_tipo is mandatory ! "
					. json_encode(func_get_args(), JSON_PRETTY_PRINT)
					, logger::ERROR
				);
				throw new Exception("Error Processing Request. section_tipo is mandatory !", 1);
			}
			$this->section_tipo = $section_tipo;

		// cache
			$this->cache = (bool)$cache;

		// structure data (load from Ontology)
			// We set the received type and load the structure previously to determine if this type is translatable
			// or not and set the language again if it is not translatable
			parent::load_structure_data();

		// properties
			$properties = $this->get_properties();

		// lang : Check lang again after structure data is loaded
		// We establish the preliminary language from the load of the Ontology
			// with_lang_versions
			if (!isset($this->with_lang_versions)) {
				$this->with_lang_versions = (isset($properties->with_lang_versions) && $properties->with_lang_versions===true);
			}
			// set default lang for non translatable and not with_lang_versions
			if ($this->traducible==='no') {
				if ($this->with_lang_versions===true) {
					// Allow tool lang on non translatable components
					// like component_iri, component_input_text
				}else{
					// Force no lang
					$this->lang = DEDALO_DATA_NOLAN;
				}
			}

		// ar_tools_obj reset
			$this->ar_tools_obj = null;

		// set_dato_default (new way 28-10-2016)
			if ( $this->mode==='edit' && !is_null($this->section_id) && $this->data_source!=='tm' ) {
				$this->set_dato_default();
			}

		// pagination. Set defaults
			if (!isset($this->pagination)) {

				$this->pagination = new stdClass();
					$this->pagination->offset	= 0;
					$this->pagination->limit	= null;

				// limit. From properties request_config sqo_config
					// if (isset($properties->source) && isset($properties->source->request_config)) {
					// 	$request_config_object = array_find($properties->source->request_config, function($el){
					// 		return !isset($el->api_engine) || $el->api_engine==='dedalo';
					// 	});
					// 	if (!empty($request_config_object) &&
					// 		isset($request_config_object->show) &&
					// 		isset($request_config_object->show->sqo_config) &&
					// 		isset($request_config_object->show->sqo_config->limit)
					// 		) {
					// 		// overwrite default limit
					// 		$this->pagination->limit = (int)$request_config_object->show->sqo_config->limit;
					// 	}
					// }
			}

			// DES
				// $request_config = ( isset($properties->source->request_config) )
				// 	? $properties->source->request_config
				// 	: [];
				// $found = array_find($request_config, function($el){
				// 	return isset($el->api_engine) && $el->api_engine==='dedalo';
				// });
				// $rqo = !empty($found)
				// 	? $found
				// 	: (isset($request_config[0])
				// 		? $request_config[0]
				// 		: null);

				// if (empty($rqo)) {
				// 	// v5 config
				// 	// limit
				// 		// $this->pagination->limit = isset($properties->max_records)
				// 		// 	? (int)$properties->max_records
				// 		// 	: 5;

				// 		$this->pagination->limit = $this->mode==='edit'
				// 			? 10
				// 			: 1;

				// 	// offset
				// 		$this->pagination->offset = isset($properties->offset)
				// 			? (int)$properties->offset
				// 			: 0;

				// }else{
				// 	// v6 config
				// 	// limit
				// 		$this->pagination->limit = (isset($rqo->sqo) && isset($rqo->sqo->limit))
				// 			? (int)$rqo->sqo->limit
				// 			: ((isset($rqo->show) && isset($rqo->show->sqo_config->limit))
				// 				// show limit
				// 				? (int)$rqo->show->sqo_config->limit
				// 				: 1);

				// 		if($this->mode==='list'){
				// 			$this->pagination->limit = 1;
				// 		}

				// 	// offset
				// 		$this->pagination->offset = (isset($rqo->sqo) && isset($rqo->sqo->offset))
				// 			? (int)$rqo->sqo->offset
				// 			: ((isset($rqo->show) && isset($rqo->show->sqo_config->offset))
				// 				? (int)$rqo->show->sqo_config->offset
				// 				: 0);
				// }
	}//end __construct



	/**
	* GET_IDENTIFIER
	* Compound a chained plain flat identifier string for use as media component name, etc..
	* @return string $name Like 'dd42_dd207_1'
	*/
	public function get_identifier() : string {

		if ( empty($this->get_tipo() ) ) {
			throw new Exception("Error Processing Request. empty component_tipo", 1);
		}
		if ( empty($this->get_section_tipo() ) ) {
			throw new Exception("Error Processing Request. empty section_tipo", 1);
		}
		if ( empty($this->get_section_id() ) ) {
			throw new Exception("Error Processing Request. empty section_id", 1);
		}

		$identifier = $this->tipo . locator::DELIMITER . $this->section_tipo . locator::DELIMITER . $this->section_id;

		return $identifier;
	}//end get_identifier



	/**
	* SET_DATO_DEFAULT
	* Set dato default when properties->dato_default exists and current component dato is empty
	* properties are loaded always (structure data) at beginning of build component. Because this
	* is more fast verify if is set 'dato_default' and not load component data always as before
	* @return bool
	*/
	protected function set_dato_default() : bool {

		// Data default only can be saved by users than have permissions to save.
		// Read users can not change component data.
			if($this->get_component_permissions() < 2){
				return false;
			}

		// tm mode case
			if ($this->mode==='tm' || $this->data_source==='tm') {
				debug_log(__METHOD__
					. " Warning on set_dato_default: invalid mode or data_source (tm) ! . Ignored order" . PHP_EOL
					. ' section_id: ' . to_string($this->section_id) . PHP_EOL
					. ' section_tipo: ' . $this->section_tipo . PHP_EOL
					. ' tipo: ' . $this->tipo . PHP_EOL
					. ' model: ' . get_class($this) . PHP_EOL
					. ' mode: ' . $this->mode . PHP_EOL
					. ' data_source: ' . $this->data_source . PHP_EOL
					. ' lang: ' . $this->lang
					, logger::WARNING
				);
				return false;
			}

		$dato_default = null;

		// optional defaults for config_defaults file
			if (defined('CONFIG_DEFAULT_FILE_PATH')) {
				// config_default_file is a JSON array value
				$contents = file_get_contents(CONFIG_DEFAULT_FILE_PATH);
				$defaults = json_decode($contents);
				if (!empty($defaults)) {
					if (!is_array($defaults)) {
						debug_log(__METHOD__
							. " Ignored config_default_file value. Expected type was array but received is "
							. ' type: '. gettype($defaults)
							, logger::ERROR
						);
					}else{
						$found = array_find($defaults, function($el){
							return $el->tipo===$this->tipo; // Note that match only uses component tipo (case hierarchy25 problem)
						});
						if (!empty($found)) {
							$dato_default = $found->value;
						}
					}
				}else{
					debug_log(__METHOD__
						." Ignored empty defaults file contents ! (Check if JSON is valid) "
						.' defaults: '. to_string($defaults)
						, logger::ERROR
					);
				}
			}

		// properties try
			if (empty($dato_default)) {
				$properties = $this->get_properties();
				if(isset($properties->dato_default)) {
					// Method fallback. Remember method option like cases as date 'today'
					$dato_default = isset($properties->dato_default->method)
						? $this->get_method( $properties->dato_default->method )
						: $properties->dato_default;
				}
			}

		// set default dato (only when own dato is empty)
			if (!empty($dato_default)) {

				// matrix data : force load matrix data
					$this->load_component_dato();

				// current dato check
					$dato = $this->dato;
					if (empty($dato)) {

						// set dato only when own dato is empty
							$this->set_dato($dato_default);

						// temp section cases do not save anything
							if ( strpos((string)$this->section_id, DEDALO_SECTION_ID_TEMP)===false ) {
								$this->Save();
							}

						// debug
							debug_log(__METHOD__
								." Created ".get_called_class()." \"$this->label\" id:$this->section_id, tipo:$this->tipo, section_tipo:$this->section_tipo, mode:$this->mode".PHP_EOL
								." with default data from 'properties':"
								. to_string($dato_default)
								, logger::DEBUG
							);

						// matrix data : load matrix data again
							$this->load_component_dato();

						// dato default is fixed
							return true;
					}
			}//end if (!empty($dato_default))

		// data default is not fixed
		return false;
	}//end set_dato_default



	/**
	* SET_DATO_RESOLVED
	* @param array|null $dato
	* @return void
	*/
	public function set_dato_resolved(?array $dato) : void {
		$this->dato_resolved = $dato;
	}//end set_dato_resolved



	/**
	* SET_DATO
	* @param array|null dato
	* @return bool true
	*/
	public function set_dato($dato) : bool {

		// dato format check
			if (!is_null($dato) && !is_array($dato) && $this->mode!=='update') {

				$matrix_table = common::get_matrix_table_from_tipo($this->section_tipo);
				if ($matrix_table==='matrix_dd') {
					// v5 matrix_dd list compatibility
					// nothing to do here
				}else{
					debug_log(__METHOD__ . ' '
						. '[SET] RECEIVED DATO TO SET, IS NOT AS EXPECTED TYPE array|null' . PHP_EOL
						. 'type: '. gettype($dato) .PHP_EOL
						. 'dato: '. to_string($dato) .PHP_EOL
						. 'model: '. get_called_class() .PHP_EOL
						. 'tipo: ' . $this->tipo . PHP_EOL
						. 'section_tipo: ' . $this->section_tipo . PHP_EOL
						. 'section_id: ' . $this->section_id . PHP_EOL
						. 'mode: '. $this->mode .PHP_EOL
						. 'cache: '. to_string($this->cache) .PHP_EOL
						. 'table: '. $matrix_table
						, logger::ERROR
					);
				}
			}

		// force array on non empty
			if (!is_array($dato) && !is_null($dato)) {
				$dato = [$dato];
			}

		// unset previous calculated valor
			if (isset($this->valor)) {
				unset($this->valor);
			}
		// unset previous calculated ar_list_of_values
			if (isset($this->ar_list_of_values)) {
				unset($this->ar_list_of_values);
			}

		// empty array cases: [null] to null
			if (is_array($dato) && count($dato)===1 && (is_null($dato[0]) || $dato[0]==='')) {
				$dato = null;
			}

		// call common->set_dato (!) fix var 'bl_loaded_matrix_data' as true
			parent::set_dato($dato);

		// resolved set
			$this->dato_resolved = $dato;


		return true;
	}//end set_dato



	/**
	* GET_DATO
	* Get component dato from database.
	* To get data from other sources, set var $data_source like 'tm'
	* @return array|null $dato
	*/
	public function get_dato() {

		// dato_resolved. Already resolved case
			if(isset($this->dato_resolved)) {
				return $this->dato_resolved;
			}

		// time machine mode case. data_source='tm'
			if (isset($this->data_source) && $this->data_source==='tm') {
			// if ($this->mode==='tm') {

				// matrix_id check
					if (empty($this->matrix_id)) {
						debug_log(__METHOD__
							." ERROR. 'matrix_id' IS MANDATORY IN TIME MACHINE MODE. " .PHP_EOL
							. ' class: ' . get_called_class() . PHP_EOL
							. ' tipo: ' . $this->tipo . PHP_EOL
							. ' section_tipo: ' . $this->section_tipo . PHP_EOL
							. ' section_id: ' . $this->section_id
							, logger::ERROR
						);
						return null;
					}

				// tm dato. Note that no lang or section_id is needed, only matrix_id
					$dato_tm = component_common::get_component_tm_dato(
						$this->tipo,
						$this->section_tipo,
						$this->matrix_id
					);

					// fix dato
					$this->dato = $dato_tm;

					// set as already loaded to prevent load again
					$this->bl_loaded_matrix_data = true;

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

		$dato = $this->dato;
		if (!is_null($dato) && !is_array($dato)) {
			$matrix_table = common::get_matrix_table_from_tipo($this->section_tipo);
			if ($matrix_table==='matrix_dd') {
				// v5 matrix_dd list compatibility
				$dato = [$dato];
			}else{
				if ($this->mode!=='update') {
					$dato_to_show = get_called_class()==='component_password'
						? '************'
						: $dato;
					debug_log(__METHOD__ . ' '
						. '[GET] RECEIVED DATO IS NOT AS EXPECTED TYPE array|null ' .PHP_EOL
						. 'type: '				. gettype($dato) . PHP_EOL
						. 'dato: '				. json_encode($dato_to_show, JSON_PRETTY_PRINT) . PHP_EOL
						. 'model: '				. get_called_class() . PHP_EOL
						. 'table: '				. $matrix_table . PHP_EOL
						. 'component_tipo: '	. $this->tipo . PHP_EOL
						. 'section_tipo: '		. $this->section_tipo . PHP_EOL
						. 'section_id: '		. $this->section_id
						, logger::WARNING
					);
					/**
					* @todo Unify all components behavior when dato format is wrong (fix, save ..)
						// fix as array
							// $dato = [$dato];
							// $this->set_dato($dato);
							// debug_log(__METHOD__
							// 	. " Fixed and set bad format dato to array " . PHP_EOL
							// 	. to_string($dato)
							// 	, logger::WARNING
							// );
					*/
				}
			}
		}


		return $dato; // <- The language fallback for the mode list will be directly applied
	}//end get_dato



	/**
	* GET_DATO_FULL
	* @return object|null $dato_full
	* 	sample: {
	*	    "lg-spa": [
	*	        "L'Horta Sud"
	*	    ]
	*	}
	*/
	public function get_dato_full() {

		$section			= $this->get_my_section();
		$all_component_data	= $section->get_all_component_data($this->tipo);
		$dato_full			= $all_component_data->dato ?? null;

		return $dato_full;
	}//end get_dato_full



	# GET_DATO_UNCHANGED
	# Recover component var 'dato' without change type or other custom component changes
	# This is a easy way to access internal protected var 'dato' from out of component (like section::save_component_dato)
	public function get_dato_unchanged() {

		return $this->dato;
	}//end get_dato_unchanged



	/**
	* LOAD_COMPONENT_DATO
	* Get data once from matrix about section_id, dato
	* @return bool
	*/
	protected function load_component_dato() : bool {

		// check vars
			if(empty($this->section_id) || $this->mode==='dummy' || $this->mode==='search') {
				return false;
			}
			if (empty($this->section_tipo)) {
				debug_log(__METHOD__
					." Error Processing Request. section tipo not found for component tipo: $this->tipo "
					, logger::ERROR
				);
				return false;
			}

		if($this->bl_loaded_matrix_data!==true) {

			// section create
				$section = $this->get_my_section();

			// fix dato
				$this->dato = $section->get_component_dato(
					$this->tipo, // component_tipo
					$this->lang, // lang
					false // lang_fallback
				);

			// Set as loaded
				$this->bl_loaded_matrix_data = true;
		}

		return true;
	}//end load_component_dato



	/**
	* GET_VALUE
	* Get the string value of the components.
	* Use dd_grid to resolve his value
	* first it get the dd_grid_value
	* second it flat the dd_grid to obtain a string
	* @return string|null $value
	* 	dd_grid_cell_object
	*/
	public function get_value() : ?string {

		$grid_value	= $this->get_grid_value();
		$value		= dd_grid_cell_object::resolve_value($grid_value);

		return $value;
	}//end get_value



	/**
	* GET_GRID_VALUE
	* Get the value of the components. By default will be get_dato().
	* overwrite in every different specific component
	* Some the text components can set the value with the dato directly
	* the relation components need to process the locator to resolve the value
	* @param object|null $ddo = null
	* @return dd_grid_cell_object $dd_grid_cell_object
	*/
	public function get_grid_value(object $ddo=null) : dd_grid_cell_object {

		// set the separator if the ddo has a specific separator, it will be used instead the component default separator
			$fields_separator	= $ddo->fields_separator ?? null;
			$records_separator	= $ddo->records_separator ?? null;
			$format_columns		= $ddo->format_columns ?? null;
			$class_list			= $ddo->class_list ?? null;

			if(isset($this->column_obj)){
				$column_obj = $this->column_obj;
			}else{
				$column_obj = new stdClass();
					$column_obj->id = $this->section_tipo.'_'.$this->tipo;
			}

		// short vars
			$dato		= $this->get_dato();
			$label		= $this->get_label();
			$properties	= $this->get_properties();

		// data
			$data = empty($dato)
				? null
				: array_map(function($el){
					if (is_array($el) || is_object($el)) {
						return json_encode($el);
					}
					return $el;
				}, $dato);

		// fields_separator
			$fields_separator = isset($fields_separator)
				? $fields_separator
				: (isset($properties->fields_separator)
					? $properties->fields_separator
					: ', ');

		// records_separator
			$records_separator = isset($records_separator)
				? $records_separator
				: (isset($properties->records_separator)
					? $properties->records_separator
					: ' | ');

		// fallback value. Overwrite in translatable components like input_text or text_area
			$fallback_value = $data ?? null;

		// dd_grid_cell_object
			$dd_grid_cell_object = new dd_grid_cell_object();
				$dd_grid_cell_object->set_type('column');
				$dd_grid_cell_object->set_label($label);
				$dd_grid_cell_object->set_cell_type('text');
				$dd_grid_cell_object->set_ar_columns_obj([$column_obj]);
				if(isset($class_list)){
					$dd_grid_cell_object->set_class_list($class_list);
				}
				$dd_grid_cell_object->set_fields_separator($fields_separator);
				$dd_grid_cell_object->set_records_separator($records_separator);
				$dd_grid_cell_object->set_value($data);
				$dd_grid_cell_object->set_fallback_value($fallback_value);


		return $dd_grid_cell_object;
	}//end get_grid_value



	/**
	* GET_RAW_VALUE
	* Get the raw value of the components. By default will be get_dato().
	* overwrite in every different specific component
	* The direct components can set the value with the dato directly
	* The relation components will separate the locator in rows
	* @return dd_grid_cell_object $raw_value
	* 	dd_grid_cell_object
	*/
	public function get_raw_value() : dd_grid_cell_object {

		// column_obj
			if(isset($this->column_obj)){
				$column_obj = $this->column_obj;
			}else{
				$column_obj = new stdClass();
					$column_obj->id = $this->section_tipo.'_'.$this->tipo;
			}

		// dato_full
			$data = $this->get_dato_full();

		// get the total of locators of the data, it will be use to render the rows separated.
			$row_count = 1; // sizeof($data);

		// label
			$label = $this->get_label();

		// raw_value
			$raw_value = new dd_grid_cell_object();
				$raw_value->set_type('column');
				$raw_value->set_label($label);
				$raw_value->set_cell_type('json');
				$raw_value->set_ar_columns_obj([$column_obj]);
				$raw_value->set_row_count($row_count);
				$raw_value->set_value($data);


		return $raw_value;
	}//end get_raw_value



	/**
	* GET_GRID_FLAT_VALUE
	* Get the flat value of the components (text version of data).
	* overwrite in every different specific component
	* @return dd_grid_cell_object $flat_value
	* 	dd_grid_cell_object
	*/
	public function get_grid_flat_value() : dd_grid_cell_object {

		// column_obj
			if(isset($this->column_obj)){
				$column_obj = $this->column_obj;
			}else{
				$column_obj = new stdClass();
					$column_obj->id = $this->section_tipo.'_'.$this->tipo;
			}

		// get text of the data
			$data = $this->get_value();

		// get the total of locators of the data, it will be use to render the rows separated.
			$row_count = 1; // sizeof($data);

		// label
			$label = $this->get_label();

		// flat_value
			$flat_value = new dd_grid_cell_object();
				$flat_value->set_type('column');
				$flat_value->set_label($label);
				$flat_value->set_cell_type('text');
				$flat_value->set_ar_columns_obj([$column_obj]);
				$flat_value->set_row_count($row_count);
				$flat_value->set_value($data);


		return $flat_value;
	}//end get_grid_flat_value



	/**
	* SAVE
	* Save component data in matrix using parent section
	* Verify all necessary vars to save and call section 'save_component_dato($this)'
	* @see section->save_component_dato($this)
	* @return int|null $section_matrix_id
	*/
	public function Save() : ?int {

		// short vars
			$section_tipo	= $this->get_section_tipo();
			$section_id		= $this->get_section_id();
			$tipo			= $this->get_tipo();
			$lang			= $this->get_lang() ?? DEDALO_DATA_LANG;
			$mode			= $this->get_mode();

			// Innecesario ???
				// Si sabemos que el elemento no es traducible, fijamos su 'lang' en 'lg-nolan' (DEDALO_DATA_NOLAN)
				// if ($this->traducible=='no') {
				// 	$lang = DEDALO_DATA_NOLAN;
				// }

		// check component minimum vars before save
			if( empty($section_id) || empty($tipo) || empty($lang) ) {
				debug_log(__METHOD__
					. " Error on save: Few vars! . Ignored order" . PHP_EOL
					. ' section_id: ' . to_string($section_id) . PHP_EOL
					. ' section_tipo: ' . $section_tipo . PHP_EOL
					. ' tipo: ' . $tipo . PHP_EOL
					. ' model: ' . get_class($this) . PHP_EOL
					. ' mode: ' . $mode . PHP_EOL
					. ' lang: ' . $lang
					, logger::ERROR
				);
				return null;
			}

		// tm mode case
			if ($this->mode==='tm' || $this->data_source==='tm') {
				debug_log(__METHOD__
					. " Error on save: invalid mode (tm)! . Ignored order" . PHP_EOL
					. ' section_id: ' . to_string($section_id) . PHP_EOL
					. ' section_tipo: ' . $section_tipo . PHP_EOL
					. ' tipo: ' . $tipo . PHP_EOL
					. ' model: ' . get_class($this) . PHP_EOL
					. ' mode: ' . $mode . PHP_EOL
					. ' data_source: ' . $this->data_source . PHP_EOL
					. ' lang: ' . $lang
					, logger::ERROR
				);
				return null;
			}

		// section_id validate
			// if ( abs(intval($section_id))<1 && strpos((string)$section_id, DEDALO_SECTION_ID_TEMP)===false ) {
			// 	if(SHOW_DEBUG===true) {
			// 		dump($this, "this section_tipo:$section_tipo - section_id:$section_id - tipo:$tipo - lang:$lang");
			// 	}
			// 	trigger_error('Error Processing component save. Inconsistency detected: component trying to save without section_id: '. $section_id);
			// 	return false;
			// }

		// is temp case
		// Sometimes we need use component as temporal element without save real data to database. Is this case
		// data is saved to session as temporal data
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

		// section save. The section will be the responsible to save the component data
			$save_to_database	= isset($this->save_to_database) ? (bool)$this->save_to_database : true; // default is true
			$section			= $this->get_my_section();
			$section_id			= $section->save_component_dato($this, 'direct', $save_to_database);

		// section_id : Check valid section_id returned
		// if (abs($section_id)<1 && strpos((string)$section_id, DEDALO_SECTION_ID_TEMP)===false) {
			if ( empty($section_id) || (abs(intval($section_id))<1 && strpos((string)$section_id, DEDALO_SECTION_ID_TEMP)===false) ) {
				debug_log(__METHOD__
					. " Error on component Save: received id ($section_id) is not valid for save! Ignored order " . PHP_EOL
					. ' section_id: ' . to_string($section_id) . PHP_EOL
					. ' section_tipo: ' . $section_tipo . PHP_EOL
					. ' tipo: ' . $tipo
					, logger::ERROR
				);
				return null;
			}

		// save_to_database. Optional stop the save process to delay ddbb access
			if ($save_to_database===false) {
				# Stop here (remember make a real section save later!)
				# No component time machine data will be saved when section saves later
				return (int)$section_id;
			}

		// activity
			$this->save_activity();

		// Observers. The observers will be need to be notified for re-calculate your own dato with the new component dato
			$this->propagate_to_observers();


		return (int)$section_id;
	}//end Save



	/**
	* SAVE_ACTIVITY
	* @return void
	*/
	public function save_activity() : void {

		# ACTIVITY
		# Prevent infinite loop saving self
		if (!in_array($this->tipo, logger_backend_activity::$ar_elements_activity_tipo)) {
			try {
				# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
				$matrix_table = common::get_matrix_table_from_tipo($this->section_tipo);
				logger::$obj['activity']->log_message(
					'SAVE',
					logger::INFO,
					$this->tipo,
					null,
					[
						'msg'				=> 'Saved component data',
						'tipo'				=> $this->tipo,
						'section_id'		=> $this->section_id,
						'lang'				=> $this->lang,
						'top_id'			=> (TOP_ID ? TOP_ID : $this->section_id),
						'top_tipo'			=> (TOP_TIPO ? TOP_TIPO : $this->section_tipo),
						'component_name'	=> get_called_class(),
						'table'				=> $matrix_table,
						'section_tipo'		=> $this->section_tipo
					]
				);
			} catch (Exception $e) {
				debug_log(__METHOD__
					." Exception saving activity caught. " .PHP_EOL
					. " tipo: $this->tipo, section_tipo: $this->section_tipo, section_id: $this->section_id" .PHP_EOL
					. ' exception: '.$e->getMessage()
					, logger::DEBUG
				);
			}//end try catch
		}//end if (!in_array($tipo, logger_backend_activity::$ar_elements_activity_tipo))
	}//end save_activity



	/**
	* PROPAGATE_TO_OBSERVERS
	* Note: This property is only use in the server context, the client doesn't listen in this way.
	* is used by calculations or compoment_info (with widgets) that show sums, or other calculations dependents of others components
	* the observers of the component are defined by the own component in properties that say: This component in this section is watching me:
	* {
	*  "observers": [
	*    {
	*      "section_tipo": "numisdata3",
	*      "component_tipo": "numisdata595"
	*    }
	*  ]
	* }
	* @return array|null $observers_data
	*/
	public function propagate_to_observers() : ?array {
		$start_time=start_time(1);

		// get all observers defined in properties
			$properties = $this->get_properties();

		// if the component don't has observers stop the process.
			if(!isset($properties->observers)){
				return null;
			}

		// ar_observers
			$ar_observers = $properties->observers;

		// create the locator of the current component, this locator will be use to search, from the observer section, the component that are changed.
			$current_locator = new locator();
				$current_locator->set_section_tipo($this->section_tipo);
				$current_locator->set_section_id($this->section_id);

		// $observable_dato is defined by the type of the event fired by the user,
		// if event fired is update we will use the final dato with all changes, the data that will stored in BBDD
		// but if the event is delete, we will use the previous data, before delete the info, because we need know the sections referenced that need delete and update your own data / state
			$observable_dato = [];

		// clone the original data to not touch the original in the observable save process
			$original_data =  $this->get_observable_dato();
			if(!empty($original_data)){
				if (is_array($original_data)) {
					foreach ($original_data as $data) {
						$copy_data = is_object($data)
							? clone $data
							: $data;
						$observable_dato[] = $copy_data;
					}
				}else{
					debug_log(__METHOD__
						. " original data was expected as type array, but another is received " . PHP_EOL
						. " !! This value will not added to observable_dato " . PHP_EOL
						. ' type: ' . gettype($original_data) . PHP_EOL
						. ' original_data: ' . to_string($original_data)
						, logger::ERROR
					);
				}
			}

		// observers_data
			$observers_data = [];
			foreach ($ar_observers as $current_observer) {

				$current_observer_data = component_common::update_observer_dato(
					$current_observer, // object $observer
					$current_locator, // object $locator
					$observable_dato, // ?array $observable_dato
					$this->tipo // string observable_tipo
				);
				$observers_data = array_merge($observers_data, $current_observer_data);
			}

		// store data to access later in api
			$this->observers_data = $observers_data;

		// debug
			debug_log(__METHOD__
				." Exec time: ".exec_time_unit($start_time,'ms').' ms'
				, logger::DEBUG
			);


		return $observers_data;
	}//end propagate_to_observers



	/**
	* UPDATE_OBSERVER_DATO
	* Update the observer data using the config server in the observer component
	* set in properties the config of the observer
	* ex:
	*  {
	*	"info": "our own comments to info of the event",
	*	"server": {
	*		"config": {
	*			"use_inverse_relations"	: bool,
	* 			"use_observable_dato"	: bool,
	* 			"use_inverse_relations"	: bool,
	* 			"filter"				: sqo
	*		},
	*		"perform": {
	*			"params": {
	*				"xx": bool,
	* 				"yy": int    *
	*			},
	*		"function": "set_dato_xxx"
	*		}
	* 	},
	*	"component_tipo": "ddxx"
	* }
	* component_tipo: the component that is observed his changes. the component that fire the event.
	* config options:
	* 	use_self_section: use the $locator (the section that made the change) because the component is in the same section that observable
	* 	use_observable_dato: use the $observable_dato (the section has added, deleted, changed in portal) because the component to update is in the target section of the portal
	* 	use_inverse_relations: use all inverse relations of the section, because the component to update is not in the same or target section of portal
	* 	filter: define a sqo to get specific locators defined by a search.
	* perform options:
	* 	function:
	* 		define the function to be executed when the event is fired
	* 	params:
	* 		the options that will be passed to the function
	* @param object $observer 		// component to update
	* @param object $locator 		// section that made the change
	* @param mixed $observable_dato // data that has changed
	* @param string $observable_tipo // tipo of the component that made the change
	*
	* @return array $ar_data
	*/
	public static function update_observer_dato(object $observer, object $locator, ?array $observable_dato, string $observable_tipo) : array {

		// ar_observe. Create the observer component
			$RecordObj_dd	= new RecordObj_dd($observer->component_tipo);
			$properties		= $RecordObj_dd->get_properties();
			$ar_observe		= $properties->observe ?? [];

		// current_observer. Get the current observe preference in ontology to be processed
			$current_observer = array_find($ar_observe, function($item) use ($observable_tipo){
				return $item->component_tipo === $observable_tipo || $item->component_tipo === 'all';
			});

		// empty observer->server case
			if(!isset($current_observer) || !isset($current_observer->server)) {
				return []; // nothing to do
			}

		// ar_section. Used to search some data with one criteria defined by filter
		// see numisdata595, it get the data of portal numisdata77 to be used as main data.
			if(isset($current_observer->server->filter) && $current_observer->server->filter!==false) {

				// from_component_tipo. Get the from_component_tipo of the filter to set at observable locator
				// the observable can't know what is the path to own section and we used the path of the sqo to get the caller component(portal, autocomplete, etc)
					// $elements	= reset($current_observer->filter);
					// $element	= reset($elements);
					// php v8 compatible
						$filter			= $current_observer->server->filter; // object as {"$and":[{"q":null,"path":[{"section_tipo":"oh1","component_tipo":"oh25"}],"q_operator":null}]}
						$objIterator	= new ArrayIterator($filter);
						$first_key		= $objIterator->key(); // string as '$and'
						$elements		= $filter->{$first_key}; // array of objects
						if (empty($elements) || empty($elements[0])) {
							debug_log(__METHOD__
								." ERROR: No elements are defined for current_observer filter " .PHP_EOL
								.' observer->server: ' . to_string($current_observer->server)
								, logger::ERROR
							);
							return [];
						}
						$element = reset($elements); // object as {"q":null,"path":[{"section_tipo":"oh1","component_tipo":"oh25"}],"q_operator":null}

					$from_component_tipo = end($element->path)->component_tipo;

				// locator set from_component_tipo
					$locator->set_from_component_tipo($from_component_tipo);

				// q . The sqo base is defined into properties of the observer component.
				// and is update the q of the filter with the locator of the component that had changed
				// update the q with the locator of the observable component
				// the locator is the section_tipo and section_id of the own observable section.
					// $elements = reset($current_observer->filter);
					foreach ($elements as $key => $item_value) {
						$elements[$key]->q = $locator;
					}

				// sqo. Build the search_query_object to use in the search.
					$sqo = new stdClass();
						$sqo->section_tipo	= $observer->section_tipo;
						$sqo->full_count	= false;
						$sqo->limit			= 0;
						$sqo->filter		= $current_observer->server->filter;

				// search the sections that has reference to the observable component, the component that had changed
					$search		= search::get_instance($sqo);
					$result		= $search->search();

					$ar_section	= $result->ar_records;
			}else{
				// if observer don't has filter to get the sections to be updated, get the observable section to use
				// the observe component will be created width this locator (observable section_id and section_tipo but with your own tipo)
					$ar_section = [$locator];
			}

		// config. Get the dato of the observable component to be used to create the observer component
		// in case of any relation component will be used to find "the component that I call" or "use my relations"
			$config = $current_observer->server->config ?? null;
			if(isset($config)){
				switch (true) {
					case (((isset($config->use_observable_dato) && $config->use_observable_dato===true)
						 && (isset($config->use_self_section) && $config->use_self_section===true))):
						if (!empty($observable_dato)) {
							$ar_section = array_merge($ar_section, $observable_dato);
						}
						break;

					case (((isset($config->use_observable_dato) && $config->use_observable_dato===true)
						 && (isset($config->use_self_section) && $config->use_self_section===false))):
						$ar_section = $observable_dato;
						break;

					// when the section is not the observer section ($locator) or the section of the observable dato ($observable_dato)
					// use the inverse relations to get all sections that call to the observable section
					case(isset($config->use_inverse_relations) && $config->use_inverse_relations===true):
						$section_observable = section::get_instance(
							$locator->section_id,
							$locator->section_tipo,
							'edit',
							true
						);
						$inverse_locators = $section_observable->get_inverse_references();
						$ar_section = [];
						foreach ($inverse_locators as $inv_locator) {
								// create the locator of the current component, this locator will be use to search, from the observer section, the component that are changed.
								$current_locator = new locator();
									$current_locator->set_section_tipo($inv_locator->from_section_tipo);
									$current_locator->set_section_id($inv_locator->from_section_id);
							$ar_section[] = $current_locator;
						}
						break;
				}
			}

		// ar_data. Collect all observer components data
		// with all locators collected by the different methods, it will create the observable components to be updated.
			$ar_data = [];
			if(!empty($ar_section)) {

				$component_name = RecordObj_dd::get_modelo_name_by_tipo($observer->component_tipo,true);

				foreach ($ar_section as $current_section) {
					// create the observer component that will be update
					$component = component_common::get_instance(
						$component_name,
						$observer->component_tipo,
						$current_section->section_id,
						'list',
						DEDALO_DATA_LANG,
						$current_section->section_tipo,
						false // bool cache
					);
					// get the specific event function in preferences to be fired (instead the default get_dato)
					if(isset($current_observer->server->perform)){

						$function			= $current_observer->server->perform->function;
						$params_definition	= $current_observer->server->perform->params ?? [];
						$params = is_array($params_definition)
							? $params_definition
							: [$params_definition];

						// check function exits
							if (!method_exists($component, $function)) {
								debug_log(__METHOD__
									. " An error occurred calling function- Method do not exists !  " . PHP_EOL
									. ' function: ' . to_string($function) . PHP_EOL
									. ' component_name: ' . $component_name . PHP_EOL
									. ' component_tipo: ' . $observer->component_tipo . PHP_EOL
									, logger::ERROR
								);
							}

						// exec call
						$result = call_user_func_array(array($component, $function), $params);

						// check errors on call
							if ($result===false) {
								debug_log(__METHOD__
									. " An error occurred executing call_user_func_array  " . PHP_EOL
									. ' function: ' . to_string($function) . PHP_EOL
									. ' component_name: ' . $component_name . PHP_EOL
									. ' component_tipo: ' . $observer->component_tipo . PHP_EOL
									, logger::ERROR
								);
							}

					}else{

						// force to update the dato of the observer component
						$dato = $component->get_dato();

						$component->observable_dato = ($component_name === 'component_relation_related')
							? $component->get_dato_with_references()
							: $dato;

						// save the new dato into the database, this will be used for search into components calculations of info's
						$component->Save();
					}

					// only will be send the result of the observer component to the current section_tipo and section_id,
					// this section is the section that user is changed and need to be update width the new data
					// the sections that are not the current user changed / viewed will be save but don't return the result to the client.
					if($current_section->section_id == $locator->section_id && $current_section->section_tipo === $locator->section_tipo){
						// get the JSON of the component to send with the save of the observable component data
						$component_json = $component->get_json();
						$ar_data = array_merge($ar_data, $component_json->data);
					}
				}//end foreach ($ar_section as $current_section)
			}// end if(!empty($ar_section ))


		return $ar_data;
	}//end update_observers_dato



	/**
	* REFRESH_DATA
	* Get observable data to refresh the component_data, for ex:
	* if the main component has deleted his value, check if the observer need to delete his own data because is not valid until his observable has empty.
	* @param object $options
	* {
	* 	"actions" : [{
	*		"condition": "on_empty",
	*		"action": "empty_data"
	* 	}]
	* }
	* @return bool
	*/
	public function refresh_data(object $options) : bool {

		$actions = $options->actions;

		foreach ($actions as $item) {

			$condition	= $item->condition;
			$action		= $item->action;
			$args		= $item->arguments ?? [];

			$user_fn = strpos($action, '::')===false
				? [$this, $action] // non static case
				: $action; // static function case

			switch ($condition) {
				case 'on_empty':
					$observable_data = $this->get_observable_dato();

					if(empty($observable_data)){
						call_user_func_array($user_fn, $args);
						$this->Save();
					}
					break;

				default:
					// code...
					break;
			}

		}

		return true;
	}//end refresh_data



	/**
	* EMPTY_DATA
	* Remove the component data in the current lang
	* @return bool
	*/
	public function empty_data() : bool {

		$this->set_dato(null);

		return true;
	}//end empty_data



	/**
	* GET_REQUIRED
	*/
	public function get_required() : bool {

		// return ($this->required==='si'); // (!) Not used in structure anymore (usableIndex)
		return true;
	}//end get_required



	/**
	* LOAD TOOLS (DEPRECATED)
	* @param bool $check_lang_tools = true
	* @return array $ar_tools_obj
	* security_tools
	*/
		// public function load_tools( bool $check_lang_tools=true ) : array {

		// 	// other modes than 'edit' do not need tools
		// 		if(	strpos($this->mode, 'edit')===false
		// 			|| login::is_logged()!==true
		// 			) {
		// 			return [];
		// 		}

		// 	// if we are not logged in, it is not necessary to load the tools
		// 		if(login::is_logged()!==true) {
		// 			return [];
		// 		}

		// 	# Load all tools of current component
		// 	$ar_tools_name = $this->get_ar_tools_name();

		// 	# check_lang_tools default is true
		// 	if ($check_lang_tools===true) {
		// 		$traducible = $this->RecordObj_dd->get_traducible();
		// 		if ($traducible==='no' || $this->lang===DEDALO_DATA_NOLAN) {
		// 			$key = array_search('tool_lang',$ar_tools_name);
		// 			if($key!==false){
		// 				unset($ar_tools_name[$key]);
		// 			}
		// 		}
		// 	}

		// 	# Create obj tools array
		// 	$ar_tools_obj = [];
		// 	if(is_array($ar_tools_name)) foreach ($ar_tools_name as $tool_name) {

		// 		$authorized_tool = component_security_tools::is_authorized_tool_for_logged_user($tool_name);

		// 		if ($authorized_tool===true) {

		// 			# INDEXATION TOOL CASE : When current tool have 'indexation' name, test thesaurus permissions for avoid inconsistencies
		// 			if (strpos($tool_name, 'indexation')!==false) {
		// 				$ts_permissions = (int)common::get_permissions(DEDALO_THESAURUS_TIPO, DEDALO_THESAURUS_TIPO);
		// 				if ($ts_permissions<1) continue;	# Skip this tool
		// 			}

		// 			# Authorized tools names
		// 			#if (!in_array($tool_name, (array)$this->ar_authorized_tool_name)) {
		// 				$tool = new stdClass();
		// 					$tool->name = $tool_name;

		// 				$ar_tools_obj[] = $tool;
		// 			#}
		// 		}
		// 	}

		// 	// set
		// 		$this->ar_tools_obj = $ar_tools_obj;


		// 	return $ar_tools_obj;
		// }//end load_tools



	/**
	* LOAD SPECIFIC TOOL (DEPRECATED)
	* Note: Used in class.inspector to load relation tool
	* @param string $tool_name
	* @return object|null $tool_object
	*/
		// public function load_specific_tool(string $tool_name) : ?object {

		// 	$tool_obj = null;

		// 	if ($tool_name==='tool_relation') {
		// 		return $tool_obj;
		// 	}

		// 	$authorized_tool = component_security_tools::is_authorized_tool_for_logged_user($tool_name);
		// 	if ($authorized_tool===true) {
		// 		require_once(DEDALO_CORE_PATH . '/tools/'.$tool_name.'/class.'.$tool_name.'.php');
		// 		$tool_obj = new $tool_name($this);
		// 	}

		// 	return $tool_obj;
		// }//end load_specific_tool



	/**
	* GET_AR_TOOLS_NAME (DEPRECATED)
	* @return array $ar_tools_name
	*/
		// protected function get_ar_tools_name() : array {

		// 	// Default tools
		// 	$ar_tools_name = $this->ar_tools_name;

		// 	$properties = $this->get_properties();
		// 	if (isset($properties->ar_tools_name)) {
		// 		foreach ((array)$properties->ar_tools_name as $current_name => $obj_tool) {
		// 			$ar_tools_name[] = $current_name;
		// 		}
		// 	}

		// 	return (array)$ar_tools_name;
		// }//end get_ar_tools_name



	/**
	* GET VALOR
	* 	(!) Important. This method is still used by diffusion (v5)
	* 	DO NOT CHANGE THE RETURN VALUES
	*/
	public function get_valor() {

		$valor = self::get_dato();

		// debug
			// if(SHOW_DEBUG===true) {
			// 	if (!is_null($valor) && !is_string($valor) && !is_numeric($valor)) {
			// 		$msg = "WARNING: CURRENT 'valor' in $this->tipo is NOT valid string. Type is:\"".gettype($valor).'" - valor:'.to_string($valor);
			// 		debug_log(__METHOD__
			// 			." ".$msg
			// 			, logger::ERROR
			// 		);
			// 		dump(debug_backtrace(), 'get_valor debug_backtrace() ++ '.to_string());
			// 	}
			// }

		if(!is_array($valor)) {
			return $valor;
		}

		return "<em>No string value</em>";
	}//end get_valor



	/**
	* GET_VALOR_EXPORT
	* Return component value sent to export data
	* @return string $valor
	*/
	public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null) {

		if (empty($valor)) {
			$valor = $this->get_valor($lang);
		}

		if(SHOW_DEBUG===true) {
			#$model_name = RecordObj_dd::get_modelo_name_by_tipo($this->tipo,true);
			#return "COMMON[$model_name]: ".to_string($valor);
		}

		return to_string($valor);
	}//end get_valor_export



	/**
	* DATO IN DEFAULT LANG
	*/
		// protected function get_dato_default_lang() {

		// 	if (empty($this->section_id)) {
		// 		trigger_error("Sorry. Few vars on get_dato_default_lang");
		// 		return false;
		// 	}

		// 	if ($this->lang===DEDALO_DATA_LANG_DEFAULT) {

		// 		$dato = $this->get_dato();

		// 	}else{

		// 		$section_id		= $this->get_section_id();
		// 		$tipo			= $this->get_tipo();
		// 		$section_tipo	= $this->get_section_tipo();

		// 		$current_component_name	= get_class($this);
		// 		$component_obj			= component_common::get_instance(
		// 			$current_component_name,
		// 			$tipo,
		// 			$section_id,
		// 			'edit',
		// 			DEDALO_DATA_LANG_DEFAULT,
		// 			$section_tipo
		// 		);
		// 		$dato = $component_obj->get_dato();
		// 	}

		// 	return $dato;
		// }//end get_dato_default_lang



	/**
	* GET DATO AS STRING (DEPRECATED)
	* Get dato formatted as string
	*/
		// public function get_dato_as_string() : string {

		// 	$dato = $this->get_dato();
		// 	#return var_export($dato,true);

		// 	if(is_array($dato)) {
		// 		$string = 'Array: ';
		// 		foreach ($dato as $key => $value) {
		// 			if(is_array($value)) $value = 'array '.implode(', ', $value );
		// 			if (is_string($value)) {
		// 				$string .= $key .':'. $value .', ';
		// 			}
		// 		}
		// 		if(strlen($string)>2) $string = substr($string, 0,-2);
		// 		return $string;
		// 	}else if (is_object($dato)) {
		// 		#$string = 'Object: ' . get_class($dato);
		// 	}else if (is_int($dato)) {
		// 		$string = 'Int: ' . $dato;
		// 	}else if (is_string($dato)) {
		// 		$string = 'Str: ' . $dato;
		// 	}


		// 	return $dato;
		// }//end get_dato_as_string



	/**
	* PARSE_SEARCH_DYNAMIC
	* Check existence of $source in properties and resolve filter if yes
	* @param object $ar_filtered_by_search_dynamic
	* @return object $filter
	*/
	public function parse_search_dynamic(object $ar_filtered_by_search_dynamic) : object {

		// custom_resolve_section_id
			$custom_resolve_section_id = function ($source_section_id){
				switch ($source_section_id) {
					case 'current':
						$result = $this->get_section_id();
						break;
					default:
						$result = $source_section_id;
				}
				return $result;
			};

		// custom resolve_section_tipo
			$custom_resolve_section_tipo = function ($source_section_tipo){
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
				$q				= $current_element->q;
				$source			= $q->source;
				$component_tipo	= $source->component_tipo;
				$section_id		= $custom_resolve_section_id($source->section_id);
				$section_tipo	= $custom_resolve_section_tipo($source->section_tipo);

				$model_name		= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				$component		= component_common::get_instance(
					$model_name,
					$component_tipo,
					$section_id,
					'list',
					DEDALO_DATA_LANG,
					$section_tipo
				);

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
						$item->q	= $base_value;
						$item->path	= $current_element->path;

			$ar_filter_items[] = $item;
		}

		// operator global
			$operator = $ar_filtered_by_search_dynamic->operator;

		// filter object
			$filter = new stdClass();
				$filter->{$operator} = $ar_filter_items;


		return $filter;
	}//end parse_search_dynamic



	/**
	* GET_AR_LIST_OF_VALUES
	* Calculate all values list for component_select, component_check_box, component_radio_button ..
	* @param string $lang = DEDALO_DATA_LANG
	* @param bool $include_negative = false
	*
	* @return object $response
	*/
	public function get_ar_list_of_values(string $lang=DEDALO_DATA_LANG, bool $include_negative=false) : object {

		$start_time = start_time();

		// response
			$response = new stdClass();
				$response->result	= [];
				$response->msg		= __METHOD__ . ' Error. Request failed';

		// short vars
			$fields_separator			= ', ';
			$components_with_relations	= component_relation_common::get_components_with_relations();

		// search_query_object cases
			switch (true) {

				case isset($this->properties->filtered_by_search_dynamic) || isset($this->properties->filtered_by_search):

					// filter . expected array
						$filter = (isset($this->properties->filtered_by_search_dynamic))
							? $this->parse_search_dynamic($this->properties->filtered_by_search_dynamic)
							: json_decode( json_encode($this->properties->filtered_by_search));

					// target_section_tipo
						$ar_target_section_tipo	= $this->get_ar_target_section_tipo();
						$target_section_tipo	= reset($ar_target_section_tipo);

					// new search_query_object
						// $search_query_object = new stdClass();
						// 	$search_query_object->section_tipo 			= $target_section_tipo;
						// 	$search_query_object->limit 				= 0;
						// 	$search_query_object->skip_projects_filter 	= true;
						// 	$search_query_object->filter 				= $filter;
						$search_query_object = new search_query_object();
							$search_query_object->set_section_tipo($ar_target_section_tipo);
							$search_query_object->set_limit(0);
							$search_query_object->set_skip_projects_filter(true);
							$search_query_object->set_filter($filter);

					$hash_id = '_'.md5(json_encode($filter));
					break;

				default:

					// target_section_tipo
						// get_ar_related_by_model: $model_name, $tipo, $strict=true
		  				// $target_section_tipo = common::get_ar_related_by_model('section', $this->tipo, true);
						$ar_target_section_tipo	= $this->get_ar_target_section_tipo();
						$target_section_tipo	= reset($ar_target_section_tipo);

					// new search_query_object
						// $search_query_object = new stdClass();
						// 	$search_query_object->section_tipo 			= $target_section_tipo;
						// 	$search_query_object->limit 				= 0;
						// 	$search_query_object->skip_projects_filter 	= true;
						$search_query_object = new search_query_object();
							$search_query_object->set_section_tipo($ar_target_section_tipo);
							$search_query_object->set_limit(0);
							$search_query_object->set_skip_projects_filter(true);

					$hash_id = '';
					break;
			}

		// check target_section_tipo
			$target_section_model = RecordObj_dd::get_modelo_name_by_tipo($target_section_tipo,true);
			if ($target_section_model!=='section') {

				// response error
					$response->result	= [];
					$response->msg		= 'Error. section tipo: '.$target_section_tipo.' is not a valid section ('.$target_section_model.')';
					debug_log(__METHOD__
						."  ".$response->msg.to_string()
						, logger::ERROR
					);

				return $response;
			}

		// cache
			static $ar_list_of_values_data = [];
			$uid = isset($target_section_tipo)
				? $target_section_tipo .'_'. $lang . $hash_id
				: $this->tipo .'_'. $lang . $hash_id;
			if (isset($ar_list_of_values_data[$uid])) {

				// response OK from cache
					$response = $ar_list_of_values_data[$uid];

				return $response;
			}

		// ar_componets_related. get_ar_related_by_model: $model_name, $tipo, $strict=true
			$ar_componets_related = common::get_ar_related_by_model('component_', $this->tipo, false);

		// search_query_object select. Build query select
			$query_select = [];
			foreach ($ar_componets_related as $related_tipo) {

				// path
					$path = search::get_query_path(
						$related_tipo, // string tipo
						$target_section_tipo, // string section_tipo
						true // bool resolve_related
					);
					// add selector lag 'all' to last element of path
					$end_path = end($path);
					$end_path->lang = 'all';

				// select item
					$item = new stdClass();
						$item->path = $path;

				$query_select[] = $item;
			}
			$search_query_object->select					= $query_select;
			$search_query_object->allow_sub_select_by_id	= false;

		// search exec
			$search = search::get_instance($search_query_object);
			// include_negative values to include root user in list
				if ($include_negative===true) {
					$search->include_negative = true;
				}
			$records_data		= $search->search();
			$ar_current_dato	= $records_data->ar_records;

		$result = [];
		$ar_current_dato_size = sizeof($ar_current_dato);
		for ($i=0; $i < $ar_current_dato_size; $i++) {

			$current_row = $ar_current_dato[$i];

			# value. is a basic locator section_id, section_tipo
			$value = new stdClass();
				$value->section_id		= $current_row->section_id;
				$value->section_tipo	= $current_row->section_tipo;

			// get_locator_value: $locator, $lang, $show_parents=false, $ar_componets_related, $fields_separator=', '
			// $label = component_relation_common::get_locator_value(
			// 	$value, // object locator
			// 	$lang, // string lang
			// 	false, // bool show_parents
			// 	$ar_componets_related, // array|null ar_components_related
			// );

			// Build label
				$ar_label = [];
				foreach ($ar_componets_related as $related_tipo) {

					$model_name = RecordObj_dd::get_modelo_name_by_tipo($related_tipo,true);
					// if ($model_name==='component_autocomplete_hi') {
					if (in_array($model_name, $components_with_relations)) {

						// resolve locator_value
						$ar_current_label = component_relation_common::get_locator_value(
							$value, // object locator
							$lang, // string lang
							false, // bool show_parents
							$ar_componets_related,  // array|null ar_components_related
							true // bool include_self
						);
						$current_label = !empty($ar_current_label)
							? implode($fields_separator, $ar_current_label)
							: $ar_current_label; // null case
					}elseif ($model_name==='component_section_id') {

						// direct value
						$current_label = $current_row->{$related_tipo};
					}else{

						// use query select value
						$dato_full_json	= $current_row->{$related_tipo};
						$current_label	= self::get_value_with_fallback_from_dato_full(
							$dato_full_json,
							true // bool decore_untranslated
						);
					}

					// add if no empty
					if (!empty($current_label)) {
						$ar_label[] = $current_label;
					}
				}
				$label = implode(' | ', $ar_label);

			$item = new stdClass();
				$item->value		= $value;
				$item->label		= $label;
				$item->section_id	= $current_row->section_id;

			// add tool information when the component is component_security_tools
			// the component_security_tools is built as component_check_box and rendered as view
			// this information is required to get specific tool information
				if($this->tipo===DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO) {

					// create the component of tool_simple_object_tipo and get his data
					$component_tool_simple_object_tipo	= tools_register::$simple_tool_obj_component_tipo; // 'dd1353'
					$model_name							= RecordObj_dd::get_modelo_name_by_tipo($component_tool_simple_object_tipo, true);
					$component_tool_name				= component_common::get_instance(
						$model_name, // string model
						$component_tool_simple_object_tipo, // string tipo
						$current_row->section_id, // string section_id
						'list', // string mode
						DEDALO_DATA_NOLAN, // string lang
						$current_row->section_tipo // string section_tipo
					);
					$data = $component_tool_name->get_dato();

					// add to the datalist the name and always_active
					$item->tool_name		= $data[0]->name ?? '';
					$item->always_active	= $data[0]->always_active ?? false;
				}

			$result[] = $item;
		}
		// Sort result for easy user select
			if(isset($this->properties->sort_by)){
				$custom_sort = reset($this->properties->sort_by); // Only one at this time
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
				// Default. Alphabetic ascendant label
				usort($result, function($a,$b){
					return strnatcmp($a->label, $b->label);
				});
			}

		// response OK
			$response->result	= (array)$result;
			$response->msg		= 'Ok';
			if(SHOW_DEBUG===true) {
				$response->search_query_object	= json_encode($search_query_object, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
				$response->debug				= 'Total time: ' . exec_time_unit($start_time,'ms').' ms';
			}

		// cache
			$ar_list_of_values_data[$uid] = $response;


		return $response;
	}//end get_ar_list_of_values



	/**
	* GET_LIST_OF_VALUES
	* Retrieves all records of the target section and creates an object with the literal and his locator of the value.
	* It will use by component_select, component_check_box, component_radio_button .. to show the possibles values of the component
	* Use the request_config of the component to get the ddo_map to show and the ddo_map to hide (use as internal data values)
	* @param string $lang used to resolve the literal
	* @return object $response
	*/
	public function get_list_of_values(string $lang) : object {

			$start_time = start_time();

		// response
			$response = new stdClass();
				$response->result	= [];
				$response->msg		= __METHOD__ . ' Error. Request failed';

		// request config (mandatory)
			$request_config = $this->request_config;

		// fix ddo_map (dd_core_api static var)
			$dedalo_request_config = array_find($request_config, function($el){
				return isset($el->api_engine) && $el->api_engine==='dedalo';
			});
			// if the component has not created his own request_config, create new one
			$dedalo_request_config = isset($dedalo_request_config)
				? $dedalo_request_config
				: $this->build_request_config()[0];

		$result = [];

		if (!empty($dedalo_request_config)) {

			// 1 search all sections in the target list
				$ar_target_section = $dedalo_request_config->sqo->section_tipo;

				// get all target sections defined in sqo
				$ar_sections_tipo = [];
				foreach ($ar_target_section as $current_section) {
					$ar_sections_tipo[] = $current_section->tipo;
				}

				// cache of the list_of_values, if the list was calculated return it
					static $list_of_values_data = [];

					$hash_id = isset($dedalo_request_config->sqo->filter)
						? md5(json_encode($dedalo_request_config->sqo->filter))
						: 'full';

					$uid = !empty($ar_sections_tipo)
						? implode('-', $ar_sections_tipo) .'_'. $lang . '_' . $hash_id
						: $this->tipo .'_'. $lang . '_'. $hash_id;
					if (isset($list_of_values_data[$uid])) {

						if(SHOW_DEBUG===true) {
							// $response->request_config	= json_encode($request_config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
							$list_of_values_data[$uid]->debug	= 'Total time: ' . exec_time_unit($start_time,'ms').' ms';
						}

						// response OK from cache
							$response = $list_of_values_data[$uid];

						// return $response;
					}

				// set the limit 0 to retrieve all records of the target section
				$limit = 0;
				// sqo create
					$sqo = new search_query_object();
						$sqo->set_section_tipo($ar_sections_tipo);
						$sqo->set_limit($limit);
						if(isset($dedalo_request_config->sqo->fixed_filter)){
							$sqo->set_filter(reset($dedalo_request_config->sqo->fixed_filter));
						}

				$search = search::get_instance($sqo);
				$search_result = $search->search();

			//2 with the all section create the list_of values

			foreach ($search_result->ar_records as $row) {

				// create the section instance and set current row as his own data
				// it prevent to call multiple times to DDBB
				$section = section::get_instance(
					$row->section_id,
					$row->section_tipo
				);
				$section->set_dato($row->datos);

				// get the locator of the current row
				$locator = new locator();
					$locator->set_section_tipo($row->section_tipo);
					$locator->set_section_id($row->section_id);

				// get the values of the show
				$show_ddo_map = $dedalo_request_config->show->ddo_map;

				$ar_label = [];
				foreach ($show_ddo_map as $ddo) {

					// ignore non component ddo
					if (strpos($ddo->model, 'component_')===false) {
						debug_log(__METHOD__
							. " Ignored non component model ddo in get_list_of_values " . PHP_EOL
							. ' model: ' . to_string($ddo->model) . PHP_EOL
							. ' ddo: ' . to_string($ddo)
							, logger::ERROR
						);
						continue;
					}

					// create the component to be resolved
					$current_component = component_common::get_instance(
						$ddo->model, // string model
						$ddo->tipo, // string tipo
						$row->section_id, // string section_id
						'solved', // string mode
						$lang, // string lang
						$row->section_tipo // string section_tipo
					);
					// get the literal of the component
					$ar_label[] = $current_component->get_value();
				}

				// get the values of the hide components
				// hide component are used as internal data of the component, it doesn't show into the list.
				$ar_hide = [];

				if(isset($dedalo_request_config->hide)){
					$hide_ddo_map = $dedalo_request_config->hide->ddo_map;

					foreach ($hide_ddo_map as $ddo) {

						// create the component to be resolved
						$current_component = component_common::get_instance(
							$ddo->model, // string model
							$ddo->tipo, // string tipo
							$row->section_id, // string section_id
							'solved', // string modo
							$lang, // string lang
							$row->section_tipo // string section_tipo
						);
						// create a object with the literal and his own information
						$hide_item = new stdClass();
							$hide_item->literal			= $current_component->get_value();
							$hide_item->tipo			= $ddo->tipo;
							$hide_item->section_id		= $row->section_id;
							$hide_item->section_tipo	= $row->section_tipo;

						$ar_hide[] = $hide_item;
					}
				}
				// for the literals to show, create a label with the fields_separator
				$label = implode(" | ", $ar_label);

				$item = new stdClass();
					$item->value		= $locator;
					$item->label		= $label;
					$item->section_id	= $row->section_id;
					$item->hide			= $ar_hide;

				$result[] = $item;
			}

		}else{

			debug_log(__METHOD__
				. " Error: component without requetst_config!!!" .PHP_EOL
				. ' tipo: ' . $this->tipo . PHP_EOL
				. ' section_id: '. $this->section_id .PHP_EOL
				. ' section_tipo: '. $this->section_tipo
				, logger::ERROR
			);
			return $response;
		}

		// Sort result for easy user select
			if(isset($this->properties->sort_by)){
				$custom_sort = reset($this->properties->sort_by); // Only one at this time
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
				// Default. Alphabetic ascendant label
				usort($result, function($a,$b){
					return strnatcmp($a->label, $b->label);
				});
			}

		// response OK
			$response->result	= (array)$result;
			$response->msg		= 'Ok';
			if(SHOW_DEBUG===true) {
				// $response->request_config	= json_encode($request_config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
				$response->debug = 'Total time: ' . exec_time_unit($start_time,'ms').' ms';
			}

		// cache adds the response to cache to be reused
			$list_of_values_data[$uid] = $response;


		return $response;
	}//end get_list_of_values



	/**
	* DECORE_UNTRANSLATED
	* @param string|null $string
	* @return string|null
	*/
	public static function decore_untranslated(?string $string) : ?string {

		if (is_null($string)) {
			return null;
		}

		return '<mark>'.to_string($string).'</mark>';
	}//end decore_untranslated



	/**
	* ADD_OBJECT_TO_DATO
	* Add received object to the objects array (dato)
	* @param object $object
	* @param array $dato
	* @return array $dato
	*/
	public static function add_object_to_dato(object $object, array $dato) : array {

		// safe std class
			$std_object = get_class($object)==='locator'
				? locator::get_std_class( $object )
				: $object;


		// check if already exists
			foreach ($dato as $current_object_obj) {

				if ((object)$std_object==(object)$current_object_obj) {

					debug_log(__METHOD__
						." Ignored add element ".to_string($std_object) .PHP_EOL
						.' the object already exists.'
						, logger::WARNING
					);

					return $dato;
				}
			}

		// add if not
			$dato[] = $std_object;


		return $dato;
	}//end add_object_to_dato



	/**
	* GET_DIFFUSION_OBJ (DEPRECATED)
	* @param stdClass Object $properties
	*/
		// public function get_diffusion_obj(object $properties) : object {

		// 	# Build object
		// 	$diffusion_obj = new diffusion_component_obj();
		// 		$diffusion_obj->component_name	= get_class($this);
		// 		$diffusion_obj->parent			= $this->get_section_id();
		// 		$diffusion_obj->section_tipo	= $this->get_section_tipo();
		// 		$diffusion_obj->tipo			= $this->get_tipo();
		// 		$diffusion_obj->lang			= $this->get_lang();
		// 		$diffusion_obj->label			= $this->get_label();
		// 		#$diffusion_obj->dato			= $this->get_dato();

		// 		# initial_media_path
		// 		#$section 							= section::get_instance($diffusion_obj->parent, $diffusion_obj->section_tipo );
		// 		#$diffusion_obj->initial_media_path  = $section->get_initial_media_path();

		// 		$diffusion_obj->initial_media_path = $this->get_initial_media_path();

		// 		/*
		// 		$valor = $this->get_dato();
		// 		$valor = to_string($valor);
		// 		#$valor = filter_var($valor, FILTER_SANITIZE_STRING);
		// 		$diffusion_obj->columns['valor'] 	= $valor;
		// 		*/

		// 	# Set standard 'valor' (Overwrite when need resolve dato. Ex. portals)
		// 	$diffusion_obj->columns['valor'] = $this->get_valor();


		// 	return $diffusion_obj;
		// }//end get_diffusion_obj



	/**
	* GET_STATS_VALUE_RESOLVED
	* @return array $ar_final
	*/
		// public static function get_stats_value_resolved(string $tipo, $current_stats_value, string $stats_model, object $stats_properties=null) : array {

		// 	$caller_component = get_called_class();

		// 	$ar_values = [];
		// 	foreach ($current_stats_value as $current_dato => $value) {

		// 		if( empty($current_dato) ) {

		// 			$current_dato = 'nd';
		// 			$ar_values[$current_dato] = $value;

		// 		}else{

		// 			$current_component = component_common::get_instance(
		// 				$caller_component,
		// 				$tipo,
		// 				null,
		// 				'stats'
		// 			);
		// 			$current_component->set_dato($current_dato);

		// 			$valor = $current_component->get_valor();

		// 			$ar_values[$valor] = $value;
		// 		}
		// 	}//end foreach

		// 	$label		= RecordObj_dd::get_termino_by_tipo($tipo, DEDALO_DATA_LANG, true, true).':'.$stats_model;
		// 	$ar_final	= array($label => $ar_values);


		// 	return $ar_final;
		// }//end get_stats_value_resolved



	/**
	* GET_COMPONENT_AR_LANGS
	* Returns an array with all the languages used by this component from the data of the section that hosts it
	* @return array $component_ar_langs
	*/
	public function get_component_ar_langs() : array {

		$component_ar_langs = [];

		$tipo		= $this->tipo;
		$section_id	= $this->section_id;
		if (empty($section_id)) {
			debug_log(__METHOD__
				. " Error: section_id is mandatory !" .PHP_EOL
				. ' tipo: ' . $tipo . PHP_EOL
				. ' section_id: '. $section_id
				, logger::ERROR
			);

			return $component_ar_langs;
		}

		$section		= $this->get_my_section();
		$section_dato	= $section->get_dato();

		$component_dato_full = $section_dato->components->$tipo->dato ?? null;
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

		return $component_ar_langs;
	}//end get_component_ar_langs



	/**
	* GET_AR_AUTHORIZED_TOOL_NAME (DEPRECATED)
	* @return array $this->ar_authorized_tool_name
	*/
		// public function get_ar_authorized_tool_name() : array {

		// 	if (self::get_permissions($this->section_tipo, $this->tipo)<=1) {
		// 		return array();
		// 	}

		// 	if (!isset($this->ar_authorized_tool_name)) {
		// 		//REMOVED OLD WAY$this->get_ar_tools_obj();
		// 	}

		// 	return (array)$this->ar_authorized_tool_name;
		// }//end get_ar_authorized_tool_name



	/*
	* GET_VALOR_LANG (DEPRECATED)
	* Return the component lang
	* If the component need change this langs (selects, radiobuttons...) overwrite this function
	*/
		// public function get_valor_lang() : string {

		// 	return $this->lang;
		// }//end get_valor_lang



	/**
	* GET_AR_TARGET_SECTION_DDO
	* target section/s from which the portal/autocomplete feeds with records.
	* Not to be confused with the section in which the portal is
	* @return array ar_target_section_ddo
	* 	Array of ddo objects like [
	*	{
	*		typo: ddo,
	*		tipo : dd64
	*		color: "#b9b9b9"
	*		label: "Yes/No"
	*		matrix_table: "matrix_dd"
	*		model: "section"
	*		permissions: 3,
	* 		buttons: [{...}]
	* 	}
	* ]
	*/
	public function get_ar_target_section_ddo() : array {

		// cached
			// if(isset($this->ar_target_section_tipo)) {
			// 	return $this->ar_target_section_tipo;
			// }

		$ar_target_section_ddo = [];

		// config_context. Get_config_context normalized
			$ar_request_config = $this->get_ar_request_config();
			foreach ($ar_request_config as $config_context_item) {
				$ar_current_section_tipo	= $config_context_item->sqo->section_tipo;
				$ar_target_section_ddo		= array_merge($ar_target_section_ddo, $ar_current_section_tipo);
			}

		// empty case
			if (empty($ar_target_section_ddo)) {
				$component_name = RecordObj_dd::get_termino_by_tipo($this->tipo, DEDALO_DATA_LANG, true, true);
				debug_log(__METHOD__
					. " Error Processing Request. Please, define target section structure for component: $component_name".PHP_EOL
					. ' tipo: '. $this->tipo .PHP_EOL
					. ' model: ' .get_called_class()
					, logger::DEBUG
				);
			}

		// Fix value
			// $this->ar_target_section_ddo = $ar_target_section_ddo;

		return $ar_target_section_ddo;
	}//end get_ar_target_section_ddo




	/**
	* GET_AR_TARGET_SECTION_TIPO
	* Section/s from which the portal/autocomplete feeds with records.
	* Not to be confused with the section in which the portal is
	* @return array ar_target_section_tipo
	* 	Array of string tipo like ['dd153']
	*/
	public function get_ar_target_section_tipo() : array {

		$ar_target_section_ddo	= $this->get_ar_target_section_ddo();
		$ar_target_section_tipo	= array_map(function($ddo){
			return $ddo->tipo;
		}, $ar_target_section_ddo);


		return $ar_target_section_tipo;
	}//end get_ar_target_section_tipo



	/**
	* GET_DIFFUSION_VALUE
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @param string|null $lang = null
	* @param object|null $option_obj = null
	* @return string|null $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value(?string $lang=null, ?object $option_obj=null) : ?string {

		// Default behavior is get value
			$diffusion_value = $this->get_valor(
				$lang ?? DEDALO_DATA_LANG
			);

		// strip_tags all values (remove untranslated mark elements)
			$diffusion_value = !empty($diffusion_value)
				? preg_replace("/<\/?mark>/", "", to_string($diffusion_value))
				: null;


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_DIFFUSION_RESOLVE_VALUE
	* Note that component_relation_common implements a DIFFERENT version of current method.
	* This method is only usable for component_text_area and similar non relation components
	* @see mdcat4091 for a use example (!)
	* Added 10-10-2021 (Paco) to enable process build_geolocation_data_geojson on text area publication
	* @param object $option_obj (from 'propiedades')
	* @return mixed
	*/
	public function get_diffusion_resolve_value(object $option_obj=null) : mixed {

		// example $option_obj
			// {
			//		"process_dato": "diffusion_sql::build_geolocation_data_geojson"
			//		"process_dato_arguments": {
			//			"target_component_tipo": "numisdata698",
			//			"component_method": "get_diffusion_value"
			//		},
			//		"lang" : "lg-spa"
			// }

		// process_dato
			if (isset($option_obj->process_dato)) {

				// method to call
					$class_name		= explode('::', $option_obj->process_dato)[0];
					$method_name	= explode('::', $option_obj->process_dato)[01];

				// custom_arguments
					$dato	= $this->get_dato();
					$lang	= $option_obj->lang; // $this->lang

					// component. add options component info for fallbacks etc.
						$option_obj->component = $this;

					$custom_arguments = [
						'options'	=> $option_obj,
						'dato'		=> $dato
					];

				// check function exits
					if (!method_exists($class_name, $method_name)) {
						debug_log(__METHOD__
							. " An error occurred calling function - Method do not exists !  " . PHP_EOL
							. ' method_name: ' . to_string($method_name) . PHP_EOL
							. ' class_name: '  . $class_name
							, logger::ERROR
						);
					}

				$value = call_user_func_array([$class_name, $method_name], $custom_arguments);

			}else{

				$value = '';
			}


		return $value;
	}//end get_diffusion_resolve_value



	/**
	* UPDATE_DATO_VERSION
	* @param object $request_options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_dato_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the dato don't need change"
	*/
	public static function update_dato_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version	= null;
			$options->dato_unchanged	= null;
			$options->reference_id		= null;
			$options->tipo				= null;
			$options->section_id		= null;
			$options->section_tipo		= null;
			$options->context			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version = $options->update_version;
			$dato_unchanged = $options->dato_unchanged;
			$reference_id 	= $options->reference_id;


		$response = new stdClass();
			$response->result	= 0;
			$response->msg		= "This component ".get_called_class()." don't have update_dato_version, please check the class of the component <br />";


		return $response;
	}//end update_dato_version



	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-save its data
	* Note that the first action is always load dato to avoid save empty content
	* @see class.tool_update_cache.php
	* @return bool
	*/
	public function regenerate_component() : bool {

		// Force loads dato always !IMPORTANT
		$dato = $this->get_dato();

		// force format correctly empty data like [null] -> null
		$this->set_dato($dato);

		// Save component data
		$this->Save();


		return true;
	}//end regenerate_component



	/**
	* IS_DATO_EMPTY (DEPRECATED)
	* @return bool
	*/
		// public static function is_dato_empty($dato) : bool {

		// 	foreach ((array)$dato as $value) {
		// 		if (!empty($value)) {
		// 			return false;
		// 		}
		// 	}

		// 	return true;
		// }//end is_dato_empty



	/**
	* EXTRACT_COMPONENT_DATO_FALLBACK
	* @param object $component
	* @param string $lang = DEDALO_DATA_LANG
	* @param string $main_lang = DEDALO_DATA_LANG_DEFAULT
	* @return array $dato_fb
	*/
	public static function extract_component_dato_fallback(object $component, string $lang=DEDALO_DATA_LANG, string $main_lang=DEDALO_DATA_LANG_DEFAULT) : array {

		// get and store initial lang to restore later
			$inital_lang = $component->get_lang();

		// Try direct dato
			$dato = $component->get_dato();
			if (empty($dato)) {
				// set one null value to force iterate data
				$dato = [null];
			}

		// fallback if empty
		$dato_fb = [];
		foreach ($dato as $key => $value) {

			// if(empty($value) || $value==='<br data-mce-bogus="1">'){
			if( $component->is_empty($value)===true ){

				// Try main lang. (Used config DEDALO_DATA_LANG_DEFAULT as main_lang)
					if ($lang!==$main_lang || $component->with_lang_versions===true) {
						// change temporally the component lang
						$component->set_lang($main_lang);
						$dato_lang = $component->get_dato();
						$dato_fb[$key] = isset($dato_lang[$key])
							? $dato_lang[$key]
							: null;
					}

				// Try nolan
					if (empty($dato_fb[$key])) {
						// change temporally the component lang
						$component->set_lang(DEDALO_DATA_NOLAN);
						$dato_lang = $component->get_dato();
						$dato_fb[$key] = isset($dato_lang[$key])
							? $dato_lang[$key]
							: null;

							if ($component->tipo==='rsc116') {
								dump($dato_fb, ' dato_fb ++ lang: '. DEDALO_DATA_NOLAN. ' - '.to_string($component->tipo));
							}
					}

				// Try all projects langs sequence
					if (empty($dato_fb[$key])) {
						$data_langs = common::get_ar_all_langs(); // Langs from config projects
						foreach ($data_langs as $current_lang) {
							if ($current_lang===$lang || $current_lang===$main_lang) {
								continue; // Already checked
							}
							// change temporally the component lang
							$component->set_lang($current_lang);
							$dato_lang = $component->get_dato();
							$dato_fb[$key] = isset($dato_lang[$key])
								? $dato_lang[$key]
								: null;

							// useful value is found
							if (!empty($dato_fb[$key])) {
								break; // Stops when any data is found
							}
						}
					}

				// empty case
					if (empty($dato_fb[$key])) {
						$dato_fb[$key] = null;
					}
			}else{
				$dato_fb[$key] = $value;
			}
		}

		// restore initial lang
			$component->set_lang($inital_lang);


		return $dato_fb;
	}//end extract_component_dato_fallback



	/**
	* EXTRACT_COMPONENT_VALUE_FALLBACK
	* 21-04-2017 Paco
	* @return string $value
	*/
	public static function extract_component_value_fallback(object $component, string $lang=DEDALO_DATA_LANG, bool $mark=true, string $main_lang=DEDALO_DATA_LANG_DEFAULT) : string {

		# Try direct value
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

		if (!is_string($value)) {
			$value = to_string($value);
		}

		return $value;
	}//end extract_component_value_fallback



	/**
	* GET_VALUE_WITH_FALLBACK_FROM_DATO_FULL
	* Receive a full dato of translatable component and try to find a no empty lang
	* Expected dato is a string like '{"lg-eng": "", "lg-spa": "Comedor"}'
	* @param mixed $dato_full_json
	* @param bool $decore_untranslated = false
	* @param string $main_lang = DEDALO_DATA_LANG_DEFAULT
	* @return string|null $value
	*/
	public static function get_value_with_fallback_from_dato_full(mixed $dato_full_json, bool $decore_untranslated=false, string $main_lang=DEDALO_DATA_LANG_DEFAULT) : ?string {

		if (empty($dato_full_json)) {
			return null;
		}

		# decoded_obj . Unify received 'dato_full_json' in object format
		if (is_object($dato_full_json)) {
			$decoded_obj = $dato_full_json;
		}else{
			if (!$decoded_obj = json_handler::decode($dato_full_json)) {
				debug_log(__METHOD__
					.' Error on decode dato_full_json: ' . PHP_EOL
					. to_string($dato_full_json)
					, logger::ERROR
				);
				return $dato_full_json;
			}
		}

		# Declare as false
		$is_fallback  = false;

		# Try direct value
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
			// Fallback
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
			$value = component_common::decore_untranslated($value);
		}

		return $value;
	}//end get_value_with_fallback_from_dato_full



	/**
	* GET_COMPONENT_PERMISSIONS
	* @return int $this->permissions
	*/
	public function get_component_permissions() : int {

		if (isset($this->permissions)) {
			return $this->permissions;
		}

		if ($this->mode==='search') {

			if ( $this->section_tipo===DEDALO_THESAURUS_SECTION_TIPO ) {

				$this->permissions = 2; // Allow all users to search in thesaurus

			}elseif ( true===in_array($this->tipo, section::get_modified_section_tipos_basic()) ) {

				$this->permissions = 2; // Allow all users to search with section info components

			}elseif ( strpos((string)$this->section_id, 'search') === 0){

				$this->permissions = 2;

			}else{

				$this->permissions = common::get_permissions($this->section_tipo, $this->tipo);
			}

		}else{

			// permissions_section_tipo
				$permissions_section_tipo = $this->get_section_tipo(); // default

			// permissions
				$this->permissions = common::get_permissions($permissions_section_tipo, $this->tipo);

			// DEDALO_SECTION_USERS_TIPO
				if ($this->section_tipo===DEDALO_SECTION_USERS_TIPO) {

					// logged user id
						$user_id = logged_user_id();

					// his own section
						if($this->section_id==$user_id) {

							switch (true) {

								// Admin General. Former component_security_administrator. Always read only for self user
								case ($this->tipo===DEDALO_SECURITY_ADMINISTRATOR_TIPO) :
									$this->permissions = 1;
									break;

								// check profile
								// check developer
								// check if the section is the user_id section and remove write permissions
								// the user can not set more permissions to itself
								case (  in_array($this->tipo, [
											DEDALO_USER_PROFILE_TIPO, // profile selector
											DEDALO_USER_DEVELOPER_TIPO, // developer radio button
											DEDALO_USER_NAME_TIPO,  // username input_text
											'dd330' // section_id
										]) && security::is_global_admin($user_id)===false) :
									$this->permissions = 1;
									break;

								// Allow user edit self data name, email, password and image (used by tool_user_admin)
								case (  in_array($this->tipo, [
											DEDALO_FULL_USER_NAME_TIPO,
											DEDALO_USER_EMAIL_TIPO,
											DEDALO_USER_PASSWORD_TIPO,
											DEDALO_USER_IMAGE_TIPO
										]) ) :
									$this->permissions = 2;
									break;

								default :
									// Nothing to change
									break;
							}
						}//end if($this->section_id==$user_id)
				}//end if ($this->section_tipo===DEDALO_SECTION_USERS_TIPO)
		}

		// check if the action is search with autocomplete and return 1 (read).
			if ($this->permissions <1 && $this->autocomplete===true) {
				$this->permissions = 1;
			}


		return $this->permissions;
	}//end get_component_permissions



	################################## SEARCH 2 ########################################################



	/**
	* GET_SEARCH_QUERY
	* Builds a search_query taking care of split multiple values and conform output objects
	* @param object $query_object
	*  sample
		* {
		*   "q": "pepe",
		*   "lang": "lg-spa",
		*   "path": [
		*     {
		*       "section_tipo": "oh1",
		*       "component_tipo": "oh24",
		*       "target_section": "rsc197"
		*     },
		*     {
		*       "section_tipo": "rsc197",
		*       "component_tipo": "rsc85",
		* 		"model": "component_input_text"
		*     }
		*   ],
		*   "component_path": [
		*     "dato"
		*   ]
		* }
	* @return array $ar_query_object
	* 	Array of one or more SQO (search query object)
	*/
	public static function get_search_query( object $query_object ) : array {

		// empty q case
			// if (empty($query_object->q)) {
			// 	return array();
			// }

		// component_path
			if(isset(end($query_object->path)->component_tipo)) {
				$component_tipo = end($query_object->path)->component_tipo;
				// default component path
				$query_object->component_path = ['components',$component_tipo,'dato'];
			}

		// component lang
			if (!isset($query_object->lang)) {
				// default
				$query_object->lang = 'all';
			}

		// component class name calling here
			$called_class = get_called_class();

		// split multiple (true by default)
			$q_split				= isset($query_object->q_split) ? (bool)$query_object->q_split : true;
			$current_query_object	= ($q_split===false)
				? $query_object // With query_object property 'q_split' as false (autocomplete_hi)
				: component_common::split_query($query_object); // Default mode

		// conform each object
			if (search::is_search_operator($current_query_object)===true) {
				foreach ($current_query_object as $operator => $ar_elements) {
					foreach ($ar_elements as $c_query_object) {
						// update all resolved query objects
						// Note that object $c_query_object is changed by the component, it not new object,
						// it's the same object but with the component additions
						$c_query_object = $called_class::resolve_query_object_sql( $c_query_object );
					}
				}
			}else{
				$current_query_object = $called_class::resolve_query_object_sql( $current_query_object );
			}

		// convert to array always
			$ar_query_object = is_array($current_query_object)
				? $current_query_object
				: [$current_query_object];


		return $ar_query_object;
	}//end get_search_query



	/**
	* GET_SELECT_QUERY
	* @param object $select_object
	* @return object $select_object
	*/
	public static function get_select_query( object $select_object ) : object {

		// ref
			// [path] => Array
			// 	(
			// 		[0] => stdClass Object
			// 			(
			// 				[name] => Título
			// 				[model] => component_input_text
			// 				[section_tipo] => numisdata224
			// 				[component_tipo] => numisdata231
			// 			)
			// 	)
			// [lang] => lg-spa
			# $selector = isset($select_object->selector) ? $select_object->selector : 'valor_list';

		// component_path check. If not exists, its not parsed yet
			if(!isset($select_object->component_path)) {

				$end_path		= end($select_object->path);
				$component_tipo	= $end_path->component_tipo;

				// selector
					$selector = isset($end_path->selector)
						? $end_path->selector
						: 'dato';

				// component_path
					if (isset($end_path->lang) && $end_path->lang==='all') {

						$select_object->component_path = ['components',$component_tipo,$selector];

					}else{

						$lang = isset($end_path->lang)
							? $end_path->lang
							: (RecordObj_dd::get_translatable($component_tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN);

						// Set default
						$select_object->component_path = ['components',$component_tipo,$selector,$lang];
					}
			}

		// type check
			if(!isset($select_object->type)) {
				$select_object->type = 'string';
			}


		return $select_object;
	}//end get_select_query



	/**
	* SPLIT_QUERY
	* @param object $query_object
	*	Query object value (q) could be an object, array or string
	* @return object $split_query_object
	*/
	public static function split_query( object $query_object) : object {

		// search value
			$search_value = $query_object->q;
			// For unification, all non string are JSON encoded
			// This allow accept mixed values (encoded and no encoded)
			if (!is_string($search_value)) {
				$search_value = json_encode($search_value);
			}

		// operator
			$q_operator			= $query_object->q_operator ?? null;
			$operator_between	= '$or';	// default (!)

		// q
			$q = $query_object->q ?? null;
			if ($q==='only_operator') {
				return $query_object;
			}

		// JSON CASE
		if ($json_value = json_decode($search_value)) {

			if (is_array($json_value) && count($json_value)>1) {
				$group = new stdClass();
					$name = $operator_between;
					$group->{$name} = [];
				foreach ($json_value as $current_value) {
					$current_value			= array($current_value);
					$query_object->type		= 'jsonb';
					$query_object_clon		= clone($query_object);
					$query_object_clon->q	= json_encode($current_value);
					$group->{$name}[]		= $query_object_clon;
				}
				$split_query_object = $group;
			}else{
				$query_object->type	= 'jsonb';
				$split_query_object	= $query_object;
			}

		// STRING CASE
		}else{

			// model
			if (!isset(end($query_object->path)->model)) {
				end($query_object->path)->model = RecordObj_dd::get_termino_by_tipo(
					end($query_object->path)->component_tipo
				);
			}
			$model = end($query_object->path)->model;
			if ($model==='component_json' || $q_operator==='=='
				|| (!empty($query_object->q) && strpos($query_object->q, '==')===0) ) {

				// component JSON case
				// $query_object->q	= str_replace('"', '\"', $search_value);
				$split_query_object	= $query_object;

			}else{

				// all others
				$operator_between = ($model==='component_input_text' || $model==='component_text_area')
					? '$and' // Like 'Pepe García'
					: '$or'; // like '2008 2009'

				// \S?"([^\"]+)"|\S?'([^\']+)'|[^\s]+
				$pattern = '/\S?"([^\"]+)"|\S?\'([^\\\']+)\'|[^\s]+/iu';
				preg_match_all($pattern, $search_value, $matches);

				// split into searchable units
				$total_count = count($matches[0]);

				if ($total_count===1) {

					$current_search_value = reset($matches[0]);

					$query_object->q = self::remove_first_and_last_quotes($current_search_value);
					$split_query_object = $query_object;

				}else{

					$group = new stdClass();
						$name = $operator_between;
						$group->{$name} = [];

					foreach ($matches[0] as $current_search_value) {

						$query_object_clon		= clone($query_object);
						$query_object_clon->q	= self::remove_first_and_last_quotes($current_search_value);
						$group->{$name}[]		= $query_object_clon;

					}//end foreach ($matches[0] as $key => $value)

					$split_query_object = $group;
				}//end if ($total_count===1) {
			}//end if ($model==='component_json')
		}//end if ($json_value = json_decode($search_value))


		return $split_query_object;
	}//end split_query



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() : array {

		$ar_operators = [];

		return $ar_operators;
	}//end search_operators_info



	/**
	* REMOVE_FIRST_AND_LAST_QUOTES
	* Removes first and last quotes (single or doubles) respecting existing operators
	* @param string $string
	* @return string $string
	*/
	public static function remove_first_and_last_quotes(string $string) : string {

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
	* Creates or get from memory the component section object
	* @return object $this->section_obj
	*/
	public function get_my_section() : object {

		// Note that (06-02-2022) the section cache has not conflicts with same instance in list or edit modes
		// now the JSON_RecordObj_matrix has the cache of section data. (same data for list and edit)
			if (isset($this->section_obj)) {
				return $this->section_obj;
			}

		// cache. Note that component cache will be sync with section. Set as false for component update
			$cache = $this->cache;

		// section build instance
			$section = section::get_instance(
				$this->section_id,
				$this->section_tipo,
				'list', // 'edit',
				$cache, // bool cache (synced whit this component)
				$this->caller_dataframe ?? null
			);
			$this->section_obj = $section;

		return $this->section_obj;
	}//end get_my_section



	/**
	* GET_CALCULATION_DATA
	* @return $data
	* get the data of the component for do a calculation
	*/
	public function get_calculation_data(?object $options=null) {

		$data = $this->get_valor();

		return $data;
	}//end get_calculation_data



	/**
	* PARSE_STATS_VALUES
	* @return array $ar_clean
	*/
	// public static function parse_stats_values(string $tipo, string $section_tipo, $properties, string $lang=DEDALO_DATA_LANG, string $selector='valor_list') : array {

	// 	if (isset($properties->valor_arguments)) {
	// 		$selector = 'dato';
	// 	}

	// 	// Search
	// 		if (isset($properties->stats_look_at)) {
	// 			$related_tipo = reset($properties->stats_look_at);
	// 		}else{
	// 			$related_tipo = false; //$current_column_tipo;
	// 		}
	// 		$path 		= search::get_query_path($tipo, $section_tipo, true, $related_tipo);
	// 		$end_path 	= end($path);
	// 		$end_path->selector = $selector;

	// 		$search_query_object = '{
	// 		  "section_tipo": "'.$section_tipo.'",
	// 		  "allow_sub_select_by_id": false,
	// 		  "remove_distinct": true,
	// 		  "limit": 0,
	// 		  "select": [
	// 		    {
	// 		      "path": '.json_encode($path).'
	// 		    }
	// 		  ]
	// 		}';
	// 		#dump($search_query_object, ' search_query_object ** ++ '.to_string());
	// 		$search_query_object = json_decode($search_query_object);
	// 		$search 			 = search::get_instance($search_query_object);
	// 		$result 			 = $search->search();
	// 		#dump($result, ' result ** ++ '.to_string());

	// 	// Parse results for stats
	// 		$ar_clean = [];
	//         foreach ($result->ar_records as $key => $item) {

	//         	$value = end($item);

	//         	// Override label with custom component parse
	//         		if (isset($properties->valor_arguments)) {
	//         			$c_component_tipo = isset($properties->stats_look_at) ? reset($properties->stats_look_at) : $tipo;
	// 					$model_name 	  = RecordObj_dd::get_modelo_name_by_tipo($c_component_tipo, true);
	// 					$value 		 	  = $model_name::get_stats_value_with_valor_arguments($value, $properties->valor_arguments);
	// 				}

	//         	$label = strip_tags(trim($value));
	//         	$uid   = $label;

	// 			if(!isset($ar_clean[$uid])){
	// 				$ar_clean[$uid] = new stdClass();
	// 				$ar_clean[$uid]->count = 0;
	// 				$ar_clean[$uid]->tipo  = $tipo;
	// 			}

	// 			$ar_clean[$uid]->count++;
	// 			$ar_clean[$uid]->value = $label;

	// 		}
	// 		#dump($ar_clean, ' ar_clean ++ ** '.to_string());


	// 	return $ar_clean;
	// }//end parse_stats_values



	/**
	* GET_SECTION_ID
	* Alias of get_parent()
	* @return int
	*/
		// public function get_section_id() {

		// 	// return $this->get_parent();
		// 	return $this->section_id;
		// }//end get_section_id



	/**
	* GET_DATA_ITEM
	* @param mixed $value
	* @return object $item
	*/
	public function get_data_item($value) : object {

		$item = new stdClass();
			$item->section_id			= $this->get_section_id();
			$item->section_tipo			= $this->get_section_tipo();
			$item->tipo					= $this->get_tipo();
			$item->lang					= $this->get_lang();
			$item->from_component_tipo	= $this->from_component_tipo ?? $item->tipo;
			$item->value				= $value;

		if($this->mode === 'solved'){
			$item->literal 				= $this->get_value();
		}

		// debug
			if(SHOW_DEBUG===true) {
				$item->debug_model = $this->get_model();
				$item->debug_label = $this->get_label();
				$item->debug_mode = $this->get_mode();
				$item->debug_dataframe = $this->get_caller_dataframe() ?? null;
			}

		return $item;
	}//end get_data_item



	/**
	* UPDATE_DATA_VALUE
	* Used to maintain component data when dd_core_api saves component
	* * @see dd_core_api update
	* @param object $changed_data
	* sample:
	* {
    *  	"action": "add_new_element",
    *	"key": null,
    *	"value": "rsc167"
    * }
	* @return bool
	*/
	public function update_data_value(object $changed_data) : bool {

		$dato				= $this->get_dato() ?? [];
		$lang				= $this->get_lang();
		$with_lang_versions	= $this->with_lang_versions;

		switch ($changed_data->action) {

			// insert given value in dato
			case 'insert':
				$dato[] = $changed_data->value;

				$this->set_dato($dato);

				//set the observable data used to send other components that observe you, if insert it will need the final dato, with new references
				$this->observable_dato = (get_called_class() === 'component_relation_related')
					? $this->get_dato_with_references()
					: $dato;
				break;

			case 'update':
				// check if the key exist in the $dato if the key exist change it directly, else create all positions with null value for coherence
				if( isset($dato[$changed_data->key]) || array_key_exists($changed_data->key, $dato) ) {
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
				//set the observable data used to send other components that observe you, if insert it will need the final dato, with new references
				$this->observable_dato = (get_called_class() === 'component_relation_related')
					? $this->get_dato_with_references()
					: $dato;
				break;

			// remove a item value from the component data array
			case 'remove':
				//set the observable data used to send other components that observe you, if remove it will need the old dato, with old references
				$this->observable_dato = (get_called_class()==='component_relation_related')
					? $this->get_dato_with_references()
					: $dato;

				switch (true) {
					case ($changed_data->value===null && $changed_data->key===false):
						$value = [];
						$this->set_dato($value);
						break;

					case ($changed_data->value===null && ($lang!==DEDALO_DATA_NOLAN && $with_lang_versions===true)):
						// propagate to other data langs
						// $section = section::get_instance($this->get_section_id(), $this->get_section_tipo());
						$section = $this->get_my_section();

						// deactivate save option
						$this->save_to_database = false;
						$save_to_database = $this->save_to_database; // default is true

						$ar_langs = $this->get_component_ar_langs();
						foreach ($ar_langs as $current_lang) {

							// change lang and get dato
							$this->set_lang($current_lang);
							$dato = $this->get_dato();

							// remove null key and set dato updated
							array_splice($dato, $changed_data->key, 1);
							$this->set_dato($dato);

							// send to section for fix data (avoid save each lang)
							$section->save_component_dato($this, 'direct', $save_to_database);
						}

						// reactivate save option
						$this->save_to_database = true;
						break;

					default:
						$key = $changed_data->key;
						array_splice($dato, $key, 1);
						$this->set_dato($dato);
						break;
				}
				break;

			// set the whole data sent by the client without check the array key, bulk insert or update
			case 'set_data':

				$this->set_dato($changed_data->value);
				//set the observable data used to send other components that observe you, if insert it will need the final dato, with new references
				$this->observable_dato = (get_called_class() === 'component_relation_related')
					? $this->get_dato_with_references()
					: $changed_data->value;
				break;

			// re-organize the whole component data based on target key given. Used by portals to sort rows
			case 'sort_data':

				// vars
					$value		= $changed_data->value;
					unset($value->paginated_key);
					$source_key	= $changed_data->source_key;
					$target_key	= $changed_data->target_key;

				// current DB array of value
					$dato = $this->get_dato();

				// debug
					// debug_log(__METHOD__
					// 	.' +++++++++++++++++++++++++++++++++  sort_data:'
					// 	.PHP_EOL.'key value:'. to_string($source_key)
					// 	.PHP_EOL.'given value:'. to_string($value)
					// 	.PHP_EOL.'DB value (dato[source_key]):'. to_string($dato[$source_key])
					// 	.PHP_EOL.'dato value:'. to_string($dato)
					// 	, logger::ERROR
					// );

				// check selected value to detect mistakes
					if (!isset($dato[$source_key])) {
						debug_log(__METHOD__
							.' Error on sort_data. Source value key ['.$source_key.'] do not exists! '
							, logger::ERROR
						);
						return false;
					}elseif(!locator::compare_locators(
							$dato[$source_key],
							$value,
							['section_id','section_tipo','from_component_tipo','tag_id'])
						) {
						debug_log(__METHOD__
							.' Error on sort_data. Source value if different from DB value:' .PHP_EOL
							.' key value: '. to_string($source_key) .PHP_EOL
							.' given value: '. to_string($value) .PHP_EOL
							.' DB value (dato[source_key]): '. to_string($dato[$source_key]) .PHP_EOL
							.' dato value: '. to_string($dato)
							, logger::ERROR
						);
						return false;
					}

				// remove old key value ans add value at $target_key position
					$new_dato = [];
					foreach ($dato as $key => $current_value) {
						if ($key===$source_key) {
							continue;
						}
						if($key===$target_key && $target_key < $source_key){
							$new_dato[] = $value;
							$new_dato[] = $current_value;
							continue;
						}else if($key===$target_key && $target_key > $source_key){
							$new_dato[] = $current_value;
							$new_dato[] = $value;
							continue;
						}

						$new_dato[] = $current_value;
					}

				// new dato set
					$this->set_dato($new_dato);
				break;

			// used by component_portal to add created target section to current component with project values inheritance
			case 'add_new_element':

				$target_section_tipo = $changed_data->value;

				// component add_new_element. Returns object $response
					$response = $this->add_new_element((object)[
						'target_section_tipo' => $target_section_tipo
					]);
					if ($response->result!==true) {
						debug_log(__METHOD__
							." Error on add_new_element (section_tipo:'$target_section_tipo'). Response:".PHP_EOL
							.to_string($response)
							, logger::ERROR
						);
						return false;
					}
				break;

			// used to force component to save. Example: component_av updates the dato with files_info in each save call
			case 'force_save':

				// nothing to do here, only return true to allow save call continue
				break;

			default:
				// error
				debug_log(__METHOD__
					." Error on update_data_value. changed_data->action is not valid! ". PHP_EOL
					.' changed_data->action: ' . to_string($changed_data->action)
					, logger::ERROR
				);
				return false;
				break;
		}


		return true;
	}//end update_data_value



	/**
	* GET_DATO_PAGINATED
	* It slices the component array of locators to allocate pagination options
	* @param int|null $custom_limit = null
	* @return array $dato_paginated
	*/
	public function get_dato_paginated(?int $custom_limit=null) : array {

		// dato full
			$dato = $this->get_dato();

		// empty case
			if (empty($dato)) {
				return $dato;
			}

		// limit
			$limit = isset($custom_limit)
				? $custom_limit
				: $this->pagination->limit;

		// offset
			$offset = $this->pagination->offset ?? 0;

		// array_lenght. avoid use zero as limit. Instead this, use null
			$array_lenght = $limit>0 ? $limit : null;

		// slice
			$dato_paginated = array_slice($dato, $offset, $array_lenght);

		// pagination keys. Set an offset relative key to each element of paginated array
			foreach ($dato_paginated as $key => $value) {
				$paginated_key = $key + $offset;
				$value->paginated_key = $paginated_key;
			}


		return $dato_paginated;
	}//end get_dato_paginated



	/**
	* GET_STRUCTURE_BUTTONS
	* @return array
	*/
	public function get_structure_buttons(int $permissions=null) : array {


		return [];
	}//end get_structure_buttons



	/**
	* GET_COMPONENT_TM_DATO
	* @return array|null $tm_dato
	*/
	public static function get_component_tm_dato(string $tipo, string $section_tipo, int|string $matrix_id) : ?array {

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

		$record = reset($result->ar_records);

		$tm_dato = !empty($record)
			? $record->dato
			: [];

		// check bad data (old formats not array)
			if (!empty($tm_dato) && !is_array($tm_dato)) {
				debug_log(__METHOD__
					." Bad dato found in time machine data. Making array cast to dato found: ".gettype($tm_dato) .PHP_EOL
					.' tm_dato: ' .  to_string($tm_dato),
					logger::ERROR
				);
				$tm_dato = [$tm_dato];
			}

		// check type
			if (!is_null($tm_dato) && !is_array($tm_dato)) {
				debug_log(__METHOD__
					. " TM dato type is not as expected (array/null) . NULL will be return as temp value. review time_amchine record  " . PHP_EOL
					. ' type: ' . gettype($tm_dato) . PHP_EOL
					. ' tm_dato: ' . json_encode($tm_dato, JSON_PRETTY_PRINT) . PHP_EOL
					. ' matrix_id: ' . to_string($matrix_id) . PHP_EOL
					. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
					. ' tipo: ' . to_string($tipo)
					, logger::WARNING
				);
				$tm_dato = null;
			}


		return $tm_dato;
	}//end get_component_tm_dato



	/**
	* GET_SORTABLE
	* @return bool
	* 	Default is true. Override when component is sortable
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



	/**
	* GET_ORDER_PATH
	* Calculate full path of current element to use in columns order path (context)
	* @param string $component_tipo
	* @param string $section_tipo
	* @return array $path
	*/
	public function get_order_path(string $component_tipo, string $section_tipo) : array {

		// get standard search query path. This get component path downwards
			$path = search::get_query_path($component_tipo, $section_tipo);

		// from_section_tipo. When is defined, this component is inside a portal and
		// we need the parent portal path too to add at beginning
			if (isset($this->from_section_tipo) && $this->from_section_tipo!==$section_tipo) {
				// recursion
				// $pre_path = $this->get_order_path($this->from_component_tipo, $this->from_section_tipo);
				// $pre_path = search::get_query_path($this->from_component_tipo, $this->from_section_tipo);
				// array_unshift($path, ...$pre_path);
				array_unshift($path, (object)[
					'component_tipo'	=> $this->from_component_tipo,
					'model'				=> RecordObj_dd::get_modelo_name_by_tipo($this->from_component_tipo,true),
					'name'				=> RecordObj_dd::get_termino_by_tipo($this->from_component_tipo),
					'section_tipo'		=> $this->from_section_tipo
				]);
			}


		return $path;
	}//end get_order_path



	/**
	* GET_LIST_VALUE
	* Unified value list output
	* By default, list value is equivalent to dato. Override in other cases.
	* Note that empty array or string are returned as null
	* @return array|null $list_value
	*/
	public function get_list_value() : ?array {

		$dato = $this->get_dato();
		if (empty($dato)) {
			return null;
		}

		$list_value = $dato;


		return $list_value;
	}//end get_list_value



	/**
	* CONFORM_IMPORT_DATA
	* @param string $import_value
	* @param string $column_name
	* 	like 'test145_dmy'
	* @return object $response
	*/
	public function conform_import_data(string $import_value, string $column_name) : object {

		// Response
		$response = new stdClass();
			$response->result	= null;
			$response->errors	= [];
			$response->msg		= 'Error. Request failed';

		// Check if is a JSON string. Is yes, decode
		if(json_handler::is_json($import_value)){

			// try to JSON decode (null on not decode)
			$dato_from_json	= json_handler::decode($import_value); // , false, 512, JSON_INVALID_UTF8_SUBSTITUTE

			// array convert all except null
			// if (!is_array($dato_from_json) && !is_null($dato_from_json)) {
			// 	$dato_from_json = [$dato_from_json];
			// }

			$import_value	= $dato_from_json;

		}else{

			// string case

			if(empty($import_value)) {

				$import_value = null;

			}else{

				// log JSON conversion error
				debug_log(__METHOD__
					." JSON json_last_error: ".json_last_error() . PHP_EOL
					.' tipo: ' . $this->tipo . PHP_EOL
					.' section_tipo: ' . $this->section_tipo . PHP_EOL
					.' section_id: ' . $this->section_id . PHP_EOL
					.' model: ' . get_called_class() . PHP_EOL
					.' import_value: ' . to_string($import_value) . PHP_EOL
					.' column_name: ' . $column_name
					, logger::ERROR
				);

				$failed = new stdClass();
					$failed->section_id		= $this->section_id;
					$failed->data			= stripslashes( $import_value );
					$failed->component_tipo	= $this->get_tipo();
					$failed->msg			= 'IGNORED: malformed data '. to_string($import_value);
				$response->errors[] = $failed;

				return $response;
			}
		}

		$response->result	= $import_value;
		$response->msg		= 'OK';


		return $response;
	}//end conform_import_data



	/**
	* GET_ONTLOGY_INFO
	* Get the component information (former 'def', now 'Definition') from the Ontology
	* for current component term_id
	* @return string|null $ontlogy_info
	*/
	public function get_ontlogy_info() : ?string {

		$section_tipo	= ONTOLOGY_SECTION_TIPOS['section_tipo'];

		$section_id = ontology::get_section_id_by_term_id($this->tipo);

		$component_tipo	= ONTOLOGY_SECTION_TIPOS['definition']; // expected dd1478
		$model			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true); // expected component_text_area
		$component		= component_common::get_instance(
			$model,
			$component_tipo,
			$section_id,
			'list',
			DEDALO_APPLICATION_LANG,
			$section_tipo
		);
		$dato = $component->get_dato();

		$ontlogy_info = $dato[0] ?? null;


		return $ontlogy_info;
	}//end get_ontlogy_info



	/**
	* IS_EMPTY
	* Generic check if given value is or not empty considering
	* @param mixed $value
	* @return bool
	*/
	public function is_empty(mixed $value) : bool {

		// null case
			if(is_null($value)){
				return true;
			}

		// string length 0 case
			$value = is_string($value)
				? trim($value)
				: $value;

		// common empty check
			if(empty($value)){
				return true;
			}


		return false;
	}//end is_empty



}//end class component_common
