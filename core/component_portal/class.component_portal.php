<?php
/*
* CLASS component_portal
*
*
*/
class component_portal extends component_relation_common {


	protected $relation_type = DEDALO_RELATION_TYPE_LINK;

	# test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');

	# ar_target_section_tipo
	public $ar_target_section_tipo;		# Used to fix section tipo (calculado a partir del componente relacionado de tipo section) Puede ser virtual o real

	# Array of related terms in structure (one or more)
	protected $ar_terminos_relacionados;

	# referenced component tipo
	public $tipo_to_search;

	public $max_records = 3;



	// /**
	// * GET_DATO
	// * @return array $dato
	// *	Array of objects (locators)
	// */
	// public function get_dato() {

	// 	$dato = parent::get_dato();

	// 	return (array)$dato;
	// }//end get_dato



	/**
	* SET_DATO
	*/
	public function set_dato($dato) {

		if (is_string($dato)) { # Tool Time machine case, dato is string
			$dato = json_handler::decode($dato);
		}

		return parent::set_dato( (array)$dato );
	}//end set_dato



	/**
	* GET_PROPIEDADES
	* Only to enable component_autocomplete_hi compatibility
	* @return object $properties
	*/
	public function get_propiedades() {

		$properties = parent::get_propiedades();
			#dump($properties, ' properties ++ '.to_string($this->tipo));

		// component_portal_hi compatibility
		$real_model = RecordObj_dd::get_real_model_name_by_tipo($this->tipo);
		if ($real_model==='component_autocomplete_hi') {
			// convert from
			// {
			//   "source": {
			//     "mode": "autocomplete",
			//     "hierarchy_types": [
			//       2
			//     ],
			//     "hierarchy_sections": []
			//   },
			//   "value_with_parents": true,
			//   "css": {
			//     ".wrap_component": {
			//       "mixin": [
			//         ".vertical",
			//         ".width_33",
			//         ".line_top"
			//       ],
			//       "style": {
			//         "clear": "left"
			//       }
			//     },
			//     ".content_data": {
			//       "style": {}
			//     }
			//   }
			// }

			$source_string = trim('
			{
				"config_context": [
			      {
			        "type": "internal",
			        "hierarchy_types": '.(isset($properties->source->hierarchy_types) ? json_encode($properties->source->hierarchy_types) : '[2]').',
			        "search": [
			          "hierarchy25"
			        ],
			        "select": [
			          "hierarchy25",
			          "hierarchy41"
			        ],
			        "show": [
			          "hierarchy25"
			        ]
			      }
				],
			    "section_to_search": '.(isset($properties->source->hierarchy_sections) ? json_encode($properties->source->hierarchy_sections) : '[]').',
			    "filter_by_list": [],
			    "divisor": " | ",
			    "type_map": {},
			    "operator": "or",
			    "records_mode": "list"
			}
			');
			// dump(json_decode($source_string), ' source_string ++ '.to_string($this->tipo));

			$new_properties = new stdClass();
				$new_properties->source 			= json_decode($source_string);
				$new_properties->value_with_parents = isset($properties->value_with_parents) ? $properties->value_with_parents : false;
				$new_properties->css  				= isset($properties->css) ? $properties->css : null;

			$properties = $new_properties;
		}//end if ($real_model==='component_portal_hi')


		return $properties;
	}//end get_propiedades



	/**
	* GET_TIPO_TO_SEARCH
	* Locate in structure TR the component tipo to search
	* @return string $tipo_to_search
	*/
	public function get_tipo_to_search($options=null) {

		if(isset($this->tipo_to_search)) {
			return $this->tipo_to_search;
		}

		$propiedades 	 = $this->get_propiedades();

		if(isset($propiedades->source->search)){
				foreach ($propiedades->source->search as $current_search) {
					if($current_search->type === "internal"){
						$ar_terminoID_by_modelo_name =  $current_search->components;
					}
				}
			}else{
				$ar_terminoID_by_modelo_name = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($this->tipo, 'component_', 'termino_relacionado');
			}

			#dump($ar_terminoID_by_modelo_name, ' ar_terminoID_by_modelo_name '.$this->tipo.' ');
		$tipo_to_search = reset($ar_terminoID_by_modelo_name);

		if (!isset($tipo_to_search)) {
			throw new Exception("Error Processing Request. Inconsistency detect. This component need related component to search always", 1);
		}

		// Fix value
			$this->tipo_to_search = $tipo_to_search;

		return $tipo_to_search;
	}//end get_tipo_to_search


	/**
	* GET_VALOR_LANG
	* Return the main component lang
	* If the component need change this langs (selects, radiobuttons...) overwritte this function
	* @return string $lang
	*/
	public function get_valor_lang() {

		$relacionados = (array)$this->RecordObj_dd->get_relaciones();
		if(empty($relacionados)){
			return $this->lang;
		}

		$termonioID_related = array_values($relacionados[0])[0];
		$RecordObj_dd 		= new RecordObj_dd($termonioID_related);

		$lang = ($RecordObj_dd->get_traducible()==='no') ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;


		return $lang;
	}//end get_valor_lang



	/**
	* CREATE_NEW_AUTOCOMPLETE_RECORD
	* Insert a new record on target section, set projects filter heritage, defaults and text ar_data
	* Return locator object of new created section
	* @param int $parent . section_id of current component_portal
	* @param string $tipo . tipo of current component_portal
	* @param string $target_section_tipo . tipo of section on create the record
	* @param string $section_tipo . section_tipo of current component_portal
	* @param object $ar_data . Object with all component_tipo => value of component_portal value elements
	* @return locator object. Locator of new created section to add in current component_portal data
	*/
	// public static function create_new_autocomplete_record($parent, $tipo, $target_section_tipo, $section_tipo, $ar_data) {

	// 	// set from_component_tipo
	// 		$from_component_tipo = $tipo;

	// 	// projects heritage
	// 		if ($section_tipo!==DEDALO_SECTION_PROJECTS_TIPO) {
	// 			# All except main section Projects
	// 			$source_ar_filter = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, 'component_filter', true, true); //$section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=false
	// 			if (!isset($source_ar_filter[0])) {
	// 				if(SHOW_DEBUG===true) {
	// 					throw new Exception("Error Processing Request. component_filter is not defined! ($section_tipo)", 1);
	// 				}
	// 				return "Error: component_filter is not defined!";
	// 			}
	// 			$source_component_filter = component_common::get_instance('component_filter',
	// 																	  $source_ar_filter[0],
	// 																	  $parent,
	// 																	  'edit',
	// 																	  DEDALO_DATA_NOLAN,
	// 																	  $section_tipo);
	// 			$source_component_filter_dato = $source_component_filter->get_dato();
	// 				#dump($source_component_filter_dato, ' source_component_filter_dato'.to_string());die();
	// 		}

	// 	// section : Create a new section
	// 		$section 	= section::get_instance(null,$target_section_tipo);
	// 		$section_id = $section->Save();

	// 	// filter : Set heritage of projects
	// 		if ($section_tipo!==DEDALO_SECTION_PROJECTS_TIPO) {
	// 			# All except main section Projects
	// 			$target_ar_filter  = section::get_ar_children_tipo_by_modelo_name_in_section($target_section_tipo, 'component_filter', true, true);
	// 			if (!isset($target_ar_filter[0])) {
	// 				if(SHOW_DEBUG===true) {
	// 					throw new Exception("Error Processing Request. target component_filter is not defined! ($target_section_tipo)", 1);
	// 				}
	// 				return "Error: target component_filter is not defined!";
	// 			}
	// 			$target_component_filter = component_common::get_instance('component_filter',
	// 																	  $target_ar_filter[0],
	// 																	  $section_id,
	// 																	  'list', // 'list' mode avoid autosave default project
	// 																	  DEDALO_DATA_NOLAN,
	// 																	  $target_section_tipo);
	// 			$target_component_filter->set_dato($source_component_filter_dato);
	// 			$target_component_filter->Save();
	// 		}

	// 	// component_portal
	// 		$component_portal 	= component_common::get_instance('component_portal',
	// 																	  $tipo,
	// 																	  $section_id,
	// 																	  'edit',
	// 																	  DEDALO_DATA_NOLAN,
	// 																	  $section_tipo);

	// 	// propiedades
	// 		$propiedades = $component_portal->get_propiedades();
	// 		if (!empty($propiedades)) {

	// 			if (isset($propiedades->filtered_by)) foreach($propiedades->filtered_by as $current_tipo => $current_value) {

	// 				$current_lang = DEDALO_DATA_LANG;
	// 				$RecordObj_dd = new RecordObj_dd($current_tipo);
	// 				if ($RecordObj_dd->get_traducible()==='no') {
	// 					$current_lang = DEDALO_DATA_NOLAN;
	// 				}

	// 				$curren_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
	// 				$component 			= component_common::get_instance($curren_modelo_name,
	// 																	$current_tipo,
	// 																	$section_id,
	// 																	'edit',
	// 																	$current_lang,
	// 																	$target_section_tipo);
	// 				$component->set_dato($current_value);
	// 				$component->Save();

	// 				debug_log(__METHOD__." Updated target section component $current_tipo [$curren_modelo_name] to ".to_string($current_value), logger::DEBUG);
	// 			}
	// 		}
	// 		#dump($propiedades, ' propiedades');	die("section_id: $section_id B");

	// 	// components
	// 		# Format:
	// 		# value: stdClass Object
	// 		# (
	// 		#    [rsc85] => a
	// 		#    [rsc86] => b
	// 		# )
	// 		#
	// 		foreach ($ar_data as $current_tipo => $current_value) {

	// 			$current_lang = DEDALO_DATA_LANG;
	// 			$RecordObj_dd = new RecordObj_dd($current_tipo);
	// 			if ($RecordObj_dd->get_traducible()==='no') {
	// 				$current_lang = DEDALO_DATA_NOLAN;
	// 			}

	// 			$curren_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
	// 			$component = component_common::get_instance($curren_modelo_name,
	// 														$current_tipo,
	// 														$section_id,
	// 														'edit',
	// 														$current_lang,
	// 														$target_section_tipo);
	// 			$component->set_dato( $current_value );
	// 			$component->Save();
	// 		}

	// 	// locator . return locator object of created section
	// 		$locator = new locator();
	// 			$locator->set_type(DEDALO_RELATION_TYPE_LINK);
	// 			$locator->set_section_id($section_id);
	// 			$locator->set_section_tipo($target_section_tipo);
	// 			$locator->set_from_component_tipo($from_component_tipo);
	// 				#dump($locator,'locator');


	// 	return $locator;
	// }//end create_new_autocomplete_record



	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-save its data
	* Note that the first action is always load dato to avoid save empty content
	* @see class.tool_update_cache.php
	* @return bool
	*/
	public function regenerate_component() {

		# Custom propiedades external dato
		$propiedades = $this->get_propiedades();

		# Force loads dato always !IMPORTANT
		$this->get_dato();

		debug_log(__METHOD__." Ignored regenerate action in this component. USE generate_relations_table_data TO REGENERATE RELATIONS ".to_string($this->tipo), logger::WARNING);

		if(empty($dato)) return true;

		# Save component data
		#$this->Save();

		return true;
	}//end regenerate_component



	/**
	* UPDATE_DATO_VERSION
	* @return object $response
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


		$update_version = implode(".", $update_version);

		switch ($update_version) {
			case '4.8.0':

				if ($options->context==='update_component_dato') {
					# Current component is already get and set dato with component_relation_common (in "relations")
					# We need recover here the old dato from section->components->tipo->dato
					# This context is different to time machine update dato
					$section  		= section::get_instance($options->section_id, $options->section_tipo);
					$dato_unchanged = $section->get_component_dato($options->tipo, DEDALO_DATA_NOLAN, $lang_fallback=false);
				}

				# Compatibility old dedalo instalations
				if (!empty($dato_unchanged) && is_array($dato_unchanged)) {

					$ar_locators = array();
					foreach ((array)$dato_unchanged as $key => $current_locator) {
						$locator = new locator();
							$locator->set_section_tipo($current_locator->section_tipo);
							$locator->set_section_id($current_locator->section_id);
							$locator->set_type(DEDALO_RELATION_TYPE_LINK);
							$locator->set_from_component_tipo($options->tipo);
						$ar_locators[] = $locator;
					}//end foreach ((array)$dato_unchanged as $key => $clocator)

					$new_dato = (array)$ar_locators;

					$response = new stdClass();
						$response->result   = 1;
						$response->new_dato = $new_dato;
						$response->msg = "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
					return $response;

				}else{

					$response = new stdClass();
						$response->result = 2;
						$response->msg = "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
					return $response;
				}
				break;

			case '4.9.0':
				# Remember DELETE ALL OLD COMPONENT DATO (inside section->components->tipo) !!!!!!!!!!!!!!!!
				throw new Exception("Error Processing Request. Remember DELETE ALL OLD COMPONENT DATO (inside section->components->tipo)", 1);
				# PENDING TO DO !!
				break;
		}
	}//end update_dato_version



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value($lang=null) {

		$this->valor = null;

		$this->set_lang($lang);

		$diffusion_value = $this->get_valor($lang);
		$diffusion_value = strip_tags($diffusion_value);

		return (string)$diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_DIFFUSION_DATO
	* @return string $diffusion_value
	*/
	public function get_diffusion_dato() {

		$dato = $this->get_dato();
		if (is_array($dato)) {
			$ar_id =array();
			foreach ($dato as $current_locator) {
				$ar_id[] = $current_locator->section_id;
			}
			$final_dato = $ar_id;
		}
		$diffusion_value = json_encode($final_dato);

		return (string)$diffusion_value;
	}//end get_diffusion_dato



	/**
	* RENDER_LIST_VALUE
	* Overwrite for non default behaviour
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

		# Activity case (in transition from component_portal_ts to component_portal_hi)
		# Current stored data is in format: "dd546": {"dato": {"lg-nolan": "dd242"}} bypassing the component in write
    	# file rows_activity.phtml parses current value to label in current lang
		#if ($tipo==='dd545' || $tipo==='dd546') {
		#	debug_log(__METHOD__." tipo: $tipo - section_tipo: $section_tipo - section_id: $section_id - parent: $parent - value: ".to_string($value), logger::DEBUG);
		#	return $value;
		#}

		$component 	= component_common::get_instance(get_called_class(),
													 $tipo,
													 $parent,
													 $modo, //'list',
													 DEDALO_DATA_NOLAN,
													 $section_tipo);

		# Use already query calculated values for speed
		#$ar_records = (array)json_handler::decode($value);
		#$component->set_dato($ar_records);

		$component->set_identificador_unico($component->get_identificador_unico().'_'.$section_id.'_'.$caller_component_tipo); // Set unic id for build search_options_session_key used in sessions


		$result = $component->get_html();


		return $result;
	}//end render_list_value



	/**
	* GET_COMPONENT_INFO
	* @return object | json string $component_info
	*/
	public function get_component_info($format='json') {

		$component_info_obj = parent::get_component_info(false);

		// external mode check
			$propiedades = $this->get_propiedades();
			if(isset($propiedades->source->search)){

				$component_info_obj->external_data = [];

				foreach ($propiedades->source->search as $current_search) {
					if ($current_search->type === 'external'){

						$external_section_tipo = $current_search->section_tipo;
						$current_recordObjdd = new RecordObj_dd($external_section_tipo);
						$external_section_properties = $current_recordObjdd->get_propiedades(true);

						if (isset($external_section_properties->external_data)) {

							$external_data = $external_section_properties->external_data;
							$external_data->section_tipo = $external_section_tipo;

							$component_info_obj->external_data[] = $external_data;
						}
					}
				}
			}

			if ($format === 'json') {
				$component_info =  json_encode($component_info_obj);
			}else{
				$component_info = $component_info_obj;
			}

		return $component_info;
	}//end get_component_info



///////////////// HIERARCHY LEGACY
	/**
	* GET_HIERARCHY_SECTIONS_FROM_TYPES
	* Calculate hierarchy sections (target section tipo) of types requested, like es1,fr1,us1 from type 2 (Toponymy)
	* @return array $hierarchy_sections_from_types
	*/
	public static function get_hierarchy_sections_from_types( $hierarchy_types ) {

		$hierarchy_section_tipo = DEDALO_HIERARCHY_SECTION_TIPO;
		$hierarchy_name_tipo 	= DEDALO_HIERARCHY_TERM_TIPO;


		$ar_filter = [];
		# Active
		$active_locator = new locator();
			$active_locator->set_section_id(NUMERICAL_MATRIX_VALUE_YES);
			$active_locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
			$active_locator->set_type(DEDALO_RELATION_TYPE_LINK);
			$active_locator->set_from_component_tipo(DEDALO_HIERARCHY_ACTIVE_TIPO);

		$ar_filter[] = '{
				"q": '.json_encode(json_encode($active_locator)).',
				"path": [
					{
						"section_tipo": "'.$hierarchy_section_tipo.'",
						"component_tipo": "'.DEDALO_HIERARCHY_ACTIVE_TIPO.'",
						"modelo": "'.RecordObj_dd::get_modelo_name_by_tipo(DEDALO_HIERARCHY_ACTIVE_TIPO,true).'",
						"name": "Active"
					}
				]
			}';
		# Typology
		foreach ((array)$hierarchy_types as $key => $value) {

			$typology_locator = new locator();
				$typology_locator->set_section_id($value);
				$typology_locator->set_section_tipo(DEDALO_HIERARCHY_TYPES_SECTION_TIPO);
				$typology_locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$typology_locator->set_from_component_tipo(DEDALO_HIERARCHY_TYPOLOGY_TIPO);

			$ar_filter[] = '{
				"q": '.json_encode(json_encode($typology_locator)).',
				"path": [
					{
						"section_tipo": "hierarchy1",
						"component_tipo": "hierarchy9",
						"modelo": "component_select",
						"name": "Typology"
					}
				]
			}';
		}//end foreach ((array)$hierarchy_types as $key => $value)

		$filter = implode(',',$ar_filter);

		$search_query_object = json_decode('
			{
			  "id": "get_hierarchy_sections_from_types",
			  "section_tipo": "'.$hierarchy_section_tipo.'",
			  "skip_projects_filter":"true",
			  "limit":0,
			  "filter": {
				"$and": [
				  '.$filter.'
				]
			  }
			}
		');


		$search = search::get_instance($search_query_object);
		$result = $search->search();

		// iterate rows
			$hierarchy_sections_from_types = [];
			foreach ($result->ar_records as $row) {

				if (empty($row->datos->components->{DEDALO_HIERARCHY_TARGET_SECTION_TIPO}->dato->{DEDALO_DATA_NOLAN})) {
					debug_log(__METHOD__." Skipped hierarchy without target section tipo: $row->section_tipo, $row->section_id ".to_string(), logger::ERROR);
					continue;
				}

				$target_dato 		 = $row->datos->components->{DEDALO_HIERARCHY_TARGET_SECTION_TIPO}->dato->{DEDALO_DATA_NOLAN};
				$target_section_tipo = reset($target_dato);

				$hierarchy_sections_from_types[] = $target_section_tipo;
			}


		return (array)$hierarchy_sections_from_types;
	}//end get_hierarchy_sections_from_types



	/**
	* ADD_HIERARCHY_SECTIONS_FROM_TYPES
	* Merge resolved hierarchy_sections_from_types with received section_to_search
	* and create an array unique
	* @return array $section_to_search
	*/
	public static function add_hierarchy_sections_from_types($hierarchy_types) {

		$hierarchy_sections_from_types = [];
		foreach ((array)$hierarchy_types as $current_type) {
			$sections_from_types = component_portal::get_hierarchy_sections_from_types( $current_type );
			$hierarchy_sections_from_types = array_merge($hierarchy_sections_from_types, $sections_from_types);
		}

		return (array)$hierarchy_sections_from_types;
	}//end add_hierarchy_sections_from_types



////////////////////END HIERARCHY LEGACY



	/**
	* GET_HIERARCHY_TERMS_FILTER
	* @return array $filter_custom
	*/
	public function get_hierarchy_terms_filter() {

		$filter_custom = [];

		$propiedades = $this->get_propiedades();

		$terms = $propiedades->source->hierarchy_terms;
		foreach ($terms as $current_item) {
			$resursive = (bool)$current_item->recursive;
			# Get childrens
			$ar_childrens = component_relation_children::get_childrens($current_item->section_id, $current_item->section_tipo, null, $resursive);
			$component_section_id_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($current_item->section_tipo, ['component_section_id'], true, true, true, true, false);

			$path = new stdClass();
				$path->section_tipo 	= $current_item->section_tipo;
				$path->component_tipo 	= reset($component_section_id_tipo);
				$path->modelo 			= 'component_section_id';
				$path->name 			= 'Id';

			$ar_section_id = array_map(function($children){
				return $children->section_id;
			}, $ar_childrens);

			$filter_item = new stdClass();
				$filter_item->q 	= implode(',', $ar_section_id);
				$filter_item->path 	= [$path];

				$filter_custom[] = $filter_item;

		}// end foreach

		return $filter_custom;

	}//end get_hierarchy_terms_filter



	/**
	* GET_SQO_CONTEXT
	* Calculate the sqo for the components or section that need search by own (section, autocomplete, portal, ...)
	* The search_query_object_context (sqo_context) have at least:
	* one sqo, that define the search with filter, offest, limit, etc, the select option is not used (it will use the ddo)
	* one ddo for the searched section (source ddo)
	* one ddo for the component searched.
	* 	is possible create more than one ddo for different components.
	* @return object | json
	*/
	public function get_sqo_context() {

		// already calculated
			if (isset($this->sqo_context)) {
				return $this->sqo_context;
			}


		// sort vars
			$section_tipo 	= $this->get_section_tipo();
			$tipo			= $this->get_tipo();
			$lang 			= $this->get_lang();
			$section_id		= $this->get_parent();
			$mode 			= $this->get_modo();
			$propiedades	= $this->get_propiedades();


		// SEARCH
			$search = [];
			// typo SOURCE SEARCH
				$source_search = new stdClass();
					$source_search->typo 			= 'source';
					$source_search->action 			= 'search';
					$source_search->tipo 			= $tipo;
					$source_search->section_tipo 	= $section_tipo;
					$source_search->lang 			= $lang;
					$source_search->mode 			= 'list';

				$search[] = $source_search;

			// typo SEARCH
				// filter_custom
					$filter_custom = [];
				// hierarchy_terms_filter
					if (isset($propiedades->source->hierarchy_terms)) {
						$hierarchy_terms_filter = $this->get_hierarchy_terms_filter();
						$filter_custom = array_merge($filter_custom, $hierarchy_terms_filter);
					}
				// propiedades filter custom
					if (isset($propiedades->source->filter_custom)) {
						$filter_custom = array_merge($filter_custom, $propiedades->source->filter_custom);
					}
				// Limit
					$limit = isset($propiedades->limit) ? (int)$propiedades->limit : 40;
				// operator can be injected by api
					$operator = isset($propiedades->source->operator) ? '$'.$propiedades->source->operator : null;
				// search_sections
					$ar_target_section_tipo = $this->get_ar_target_section_tipo();
					$search_sections 		= array_values( array_unique($ar_target_section_tipo) );

				// search_query_object build
					$search_sqo_options = new stdClass();
						$search_sqo_options->q 	 				  = null;
						$search_sqo_options->limit  			  = $limit;
						$search_sqo_options->offset 			  = 0;
						$search_sqo_options->section_tipo 		  = $search_sections;
						$search_sqo_options->tipo 				  = $tipo;
						$search_sqo_options->logical_operator 	  = $operator;
						$search_sqo_options->add_select 		  = false;
						$search_sqo_options->filter_custom 		  = !empty($hierarchy_terms_filter) ? $hierarchy_terms_filter : null;
						$search_sqo_options->skip_projects_filter = true; // skip_projects_filter true on edit mode

					$search_query_object = common::build_search_query_object($search_sqo_options);

				// value_with_parents
					if (isset($propiedades->value_with_parents) && $propiedades->value_with_parents===true){

						$search_query_object->value_with_parents 	= true;
						$search_query_object->source_component_tipo = $tipo;

					}// end $value_with_parent = true

				// add sqo
					$search[] = $search_query_object;


		// SHOW
			$show= [];
			// search_query_object_options

				$limit 	= $propiedades->max_records ?? $this->max_records;
				$offset = 0;

				$pagination = new stdClass();
					$pagination->limit 	= $limit;
					$pagination->offset = $offset;

				$show_sqo_options = new stdClass();
					$show_sqo_options->section_tipo = $search_sections;
					$show_sqo_options->tipo			= $tipo;
					$show_sqo_options->full_count	= false;
					$show_sqo_options->add_select 	= false;
					$show_sqo_options->add_filter 	= true;
					// paginations options
					$show_sqo_options->limit 		 = $limit;
					$show_sqo_options->offset 		 = $offset;

				$search_query_object = common::build_search_query_object($show_sqo_options);

				// value_with_parents
					if (isset($propiedades->value_with_parents) && $propiedades->value_with_parents===true){
						$search_query_object->value_with_parents 	= true;
						$search_query_object->source_component_tipo = $tipo;
					}// end $value_with_parent = true

				// add sqo
					$show[] = $search_query_object;


		// SEARCH LAYOUT MAP
			// fields for select / show. add ddo

			// subcontext from layout_map items
			// search
				$layout_map_options = new stdClass();
					$layout_map_options->section_tipo 			= $section_tipo;
					$layout_map_options->tipo 					= $tipo;
					$layout_map_options->modo 					= $mode;
					$layout_map_options->add_section 			= true;
					$layout_map_options->config_context_type 	= 'select';
				$search = array_merge( $search, layout_map::get_layout_map($layout_map_options));

			//show
				$layout_map_options->config_context_type 		= 'show';
				$show = array_merge( $show, layout_map::get_layout_map($layout_map_options));


			$sqo_context = new stdClass();
				$sqo_context->show 		= $show;
				$sqo_context->search 	= $search;


			///////////////////////////////////////////

			/*
			$search = json_decode('[
				{
					"typo": "sqo",
					"id": "temp",
					"section_tipo": ["numisdata3"],
					"filter": {
						"$or": [
							{
								"q": null,
								"lang": "all",
								"path": [
									{
										"name"				: "Catálogo",
										"modelo"			: "component_select",
										"section_tipo"		: "numisdata3",
										"component_tipo"	: "numisdata309"
									},
									{
										"name"				: "Catálogo",
										"modelo"			: "component_input_text",
										"section_tipo"		: "numisdata300",
										"component_tipo"	: "numisdata303",
										"lang_DES"				: "all"
									}
								]
							},
							{
								"q"		: null,
								"lang"	: "all",
								"path"	: [
									{
										"name"				: "Número",
										"modelo"			: "component_input_text",
										"section_tipo"		: "numisdata3",
										"component_tipo"	: "numisdata27",
										"lang_DES"				: "all"
									}
								]
							}
						]
					},
					"limit": 40,
					"offset": 0,
					"skip_projects_filter": true
				},
				{
					"typo"			: "ddo",
					"model"			: "section",
					"tipo" 			: "numisdata3",
					"section_tipo" 	: "numisdata3",
					"mode" 			: "list",
					"lang" 			: "no-lan",
					"parent"		: "root"
				},
				{
					"typo"			: "ddo",
					"tipo" 			: "numisdata27",
					"section_tipo" 	: "numisdata3",
					"mode" 			: "list",
					"lang" 			: "lg-nolan",
					"parent"		: "numisdata3",
					"model"			: "component_input_text"
				},
				{
					"typo"			: "ddo",
					"tipo" 			: "numisdata309",
					"section_tipo" 	: "numisdata3",
					"mode" 			: "list",
					"lang" 			: "lg-nolan",
					"parent"		: "numisdata3",
					"model"			: "component_select"
				},
				{
					"typo"			: "ddo",
					"tipo" 			: "numisdata81",
					"section_tipo" 	: "numisdata3",
					"mode" 			: "list",
					"lang" 			: "lg-eng",
					"parent"		: "numisdata3",
					"model"			: "component_input_text"
				}
			]');
			*/

		// fix
		$this->sqo_context	= $sqo_context;
		$this->pagination	= $pagination;


		return $sqo_context;
	}//end get_sqo_context



}//end class
