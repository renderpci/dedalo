<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/lib/vendor/autoload.php');

/**
* CLASS TOOL_IMPORT_RDF
*
*
*/
class tool_import_rdf extends tool_common {



	/**
	* GET_ONTOLOGY
	* Get the ontology tipo associated with a given component tipo.
	* This method retrieves the ontology tipo associated with a specified component tipo.
	* It relies on the 'tool_import_rdf' property of the Data Definition (dd) corresponding
	* to the provided component tipo.
	* @param string $component_tipo
	* @return string $ontology_tipo
	*/
	public function get_ontology_tipo(string $component_tipo) : string {

		$ontology_node	= new ontology_node($component_tipo);
		$properties		= $ontology_node->get_properties(true);

		// Retrieve the ontology tipo from the 'tool_import_rdf' property
		$ontology_tipo	= $properties->ar_tools_name->tool_import_rdf->external_ontology;

		return $ontology_tipo;
	}//end get_ontology_tipo



	/**
	* GET_COMPONENT_DATO
	* @param int|string $section_id
	* @param string $component_tipo
	* @return mixed $component_dato
	*/
	public function get_component_dato(int|string $section_id,	string $component_tipo) : mixed {

		$lang	= ontology_node::get_translatable($component_tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
		$model	= ontology_node::get_model_name_by_tipo($component_tipo);

		// component
		$component = component_common::get_instance(
			$model,
			$component_tipo,
			$section_id,
			'list',
			$lang,
			$this->section_tipo
		);

		$component_dato = $component->get_dato();


		return $component_dato;
	}//end get_component_dato



	/**
	* GET_RDF_DATA
	* @param object $options
	* @return object $response
	*/
	public static function get_rdf_data($options) : object {

		// options
			$ontology_tipo	= $options->ontology_tipo ?? null;
			$ar_values		= $options->ar_values ?? [];
			$locator		= $options->locator ?? null;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// properties
			$ontology_node = new ontology_node($ontology_tipo);
			$properties = $ontology_node->get_properties();

		// namespace
			$name_space = $properties->xmlns;
			foreach($name_space as $key => $value){
				\EasyRdf\RdfNamespace::set($key, $value);
			}

		// rdf_data
			$rdf_data = [];
			foreach($ar_values as $uri) {

				$rdf_uri = (substr($uri, -4)!=='.rdf')
					? $uri.'.rdf'
					: $uri;

				$base_uri = substr($rdf_uri, 0, strlen($rdf_uri)-4);

				$rdf_graph = new \EasyRdf\Graph($rdf_uri);

				try {
					$rdf_graph->load();
				} catch (Exception $e) {

					debug_log(__METHOD__
						." Ignored broken link in RDF" . PHP_EOL
						.' rdf_uri: ' . to_string($rdf_uri)
						, logger::ERROR
					);
					continue;
				}

				// $resources = $rdf_graph->resources();
				// $rdf_types = $rdf_graph->toRdfPhp();
				$rdf_type = $rdf_graph->type($base_uri);

				$ontology_children = ontology_node::get_ar_children($ontology_tipo);

				$dd_obj = tool_import_rdf::get_class_map_to_dd($ontology_children, $rdf_type, $rdf_graph, $base_uri, $locator);

				$ar_rdf_html =$rdf_graph->dump('html');

				$ar_dd_obj = new stdClass();
					$ar_dd_obj->dd_obj		= $dd_obj;
					$ar_dd_obj->ar_rdf_html	= $ar_rdf_html;

				$rdf_data[] = $ar_dd_obj;
			}

		// response OK
			$response->result	= $rdf_data;
			$response->msg		= 'OK. Request done ['.__FUNCTION__.']';


		return $response;
	}//end get_rdf_data



	/**
	* GET_CLASS_MAP_TO_DD
	*
	* @param array $ar_class_children
	* @param string $rdf_type
	* @param $rdf_graph
	* @param $base_uri
	* @param $locator
	* @return array $ar_dd_object
	*/
	public static function get_class_map_to_dd(array $ar_class_children, string $rdf_type, $rdf_graph, $base_uri, $locator) : array {

		$ar_owl_ObjectProperty = [];
		foreach ($ar_class_children as $owl_class_tipo) {
			$class_name = ontology_node::get_term_by_tipo($owl_class_tipo);

			if ($class_name === $rdf_type) {
				$ar_owl_ObjectProperty = ontology_node::get_ar_children($owl_class_tipo);
				$current_section_tipo = ontology_node::get_ar_tipo_by_model_name_and_relation($owl_class_tipo, 'section', 'related', false);
			}
		}

		if (!isset($current_section_tipo)) {
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__
					. " section tipo not found for rdf_type " . PHP_EOL
					. ' ar_class_children: ' . to_string($ar_class_children) . PHP_EOL
					. ' rdf_type: ' . to_string($rdf_type) . PHP_EOL
					. ' rdf_graph: ' . to_string($rdf_graph) . PHP_EOL
					. ' base_uri: ' . to_string($base_uri) . PHP_EOL
					. ' locator: ' . to_string($locator)
					, logger::ERROR
				);
			}
			return [];
		}

		$section_tipo		= reset($current_section_tipo);
		$section_tipo_label	= ontology_node::get_term_by_tipo($section_tipo);

		// main section
			$field = new stdClass();
				$field->tipo				= $section_tipo;
				$field->section_tipo		= $section_tipo;
				$field->parent				= 'root';
				$field->rdf_type			= $rdf_type;
				$field->value				= $base_uri;
				$field->component_label		= $section_tipo_label;
				$field->section_tipo_label	= $section_tipo_label;


		$ar_dd_object = array_merge(
			[$field],
			tool_import_rdf::get_resource_to_dd_object(
				$ar_owl_ObjectProperty,
				$rdf_graph,
				$base_uri,
				$current_section_tipo,
				$section_tipo,
				$locator
			)
		);


		return $ar_dd_object;
	}//end get_class_map_to_dd



	/**
	* GET_RDF_TO_DD_OBJECT
	* @param array  $ar_owl_ObjectProperty
	*  Array containing OWL Object Property types.
	* @param object $rdf_graph
	*  RDF graph object containing the data.
	* @param string $base_uri
	*  Base URI for constructing resource URIs.
	* @param array  $ar_section_tipo
	*  Array of section tipo(s).
	* @param string $parent
	*  Parent component.
	* @param mixed  $locator
	*  Locator object or false if not available.
	*
	* @return array $ar_resources
	*/
	public static function get_resource_to_dd_object($ar_owl_ObjectProperty, $rdf_graph, $base_uri, $ar_section_tipo, $parent, $locator=false) : array {

		$ar_resources	= [];
		$section_tipo	= reset($ar_section_tipo);

		foreach ($ar_owl_ObjectProperty as $ObjectProperty_tipo) {

			$section_tipo_label		= ontology_node::get_term_by_tipo($section_tipo);
			$object_property_name	= ontology_node::get_term_by_tipo($ObjectProperty_tipo);
			$related_dd_tipo		= ontology_node::get_ar_tipo_by_model_name_and_relation($ObjectProperty_tipo, 'component_', 'related', false);
			$children_dd_tipo		= ontology_node::get_ar_tipo_by_model_name_and_relation($ObjectProperty_tipo, 'owl:ObjectProperty', 'children', false);
			$current_tipo			= reset($related_dd_tipo);

			// properties
				$ontology_node = new ontology_node($ObjectProperty_tipo);
				$properties = $ontology_node->get_properties(true);
			// When the data to import has a section between the source and resource (as ref biblio or ref person)
			// it will have a ddo_map to indicate the path to the resource.
				if(isset($properties->ddo_map)){

					$ar_ddo = $properties->ddo_map ?? [];
					// get the ddo has child of the current component.
					$current_ddo = array_find($ar_ddo, function($item) use($current_tipo){
						return $item->parent===$current_tipo;
					});
					// get the resource to use, normally the ref biblio or ref person has a resource in RDF
					$resource = $rdf_graph->getResource($base_uri, $object_property_name);
					if(!isset($resource)) {
						continue;
					}
					$resource_uri = $resource->getUri();
					// create new options
					$resource_options = new stdClass();
						$resource_options->current_tipo		= $current_tipo;
						$resource_options->target_ddo		= $current_ddo;
						$resource_options->path 			= $ar_ddo;
						$resource_options->locator			= $locator;
						$resource_options->value			= $resource_uri;
					// search following the path defined in ontology to check if the resource is loaded and it's linked into the current section
					// if not, create new one and get the new locator
					$new_locator = tool_import_rdf::create_new_resource($resource_options);

					// if is necessary set new data, go to next level with the data created and the new context (next section into the path)
					// see the numisdata1138 as example.
					if($new_locator!==null){
						$ar_resources = tool_import_rdf::get_resource_to_dd_object($children_dd_tipo, $rdf_graph, $base_uri, [$current_ddo->section_tipo], $current_ddo->component_tipo, $new_locator);
					}
				}

			if($children_dd_tipo) {
				$current_resource = $rdf_graph->getResource($base_uri, $object_property_name);
				// $all_resources = $rdf_graph->properties($base_uri);
				if(!isset($current_resource)) {
					continue;
				}
				$resource_uri = $current_resource->getUri();
				$ar_resources = array_merge($ar_resources, tool_import_rdf::get_resource_to_dd_object($children_dd_tipo, $rdf_graph, $resource_uri, [$section_tipo], $parent, $locator));
			}else{
				$procesed_data = false;
				if(isset($properties->process->source)){
					$source = $properties->process->source;
					$source_data = '';
					if($source === '$base_uri'){
						$source_data = $base_uri;
					}
					$procesed_data = tool_import_rdf::process_data_map($source_data, $properties->process->data_map);
				}
				if(isset($properties->process->split)){
					$source = $properties->process->split->source;
					$source_data = '';
					if($source === '$base_uri'){
						$source_data = $base_uri;
					}
					$split_by = $properties->process->split->split_by;
					$ar_parts = explode($split_by , $source_data);

					$get_element = $properties->process->split->get;
					if($get_element==='end'){
						$element_got = end($ar_parts);
					}
					$object_property_name = $properties->process->split->property_name;
					$procesed_data = $element_got;
				}
				if(isset($properties->process->date)){
					$source				= $properties->process->date;
					$start				= $source->start;
					$end				= $source->end ?? null;

					//start
					$date_start_literal	= $rdf_graph->getLiteral($base_uri, $start);

					$start_data = isset($date_start_literal)
						? $date_start_literal->getValue()
						: null;

					$start_format = isset($start_data)
						? $date_start_literal->getDatatype()
						: null;

					// end
					if($end != null){
						$date_end_literal	= $rdf_graph->getLiteral($base_uri, $end);

						$end_data = isset($date_end_literal)
							? $date_end_literal->getValue()
							: null;

						$end_format = isset($end_data)
							? $date_end_literal->getDatatype()
							: null;
					}

					$match_format = $source ->format;

					$object_property_name = isset($date_start_literal)
						? $start
						: $end;

					if(isset($start_data)){
						$start_data_string = ($start_format==='xsd:date')
							? $start_data->format('Y-m-d')
							: $start_data;

						$start_date = new dd_date();
							$set_start = 'set_'.$match_format->$start_format;
							$start_date->$set_start($start_data_string);
					}else{
						$start_date = null;
					}

					if(isset($end_data)){

						$end_data_string = ($end_format==='xsd:date')
							? $end_data->format('Y-m-d')
							: $end_data;

						$end_date = new dd_date();
							$set_end = 'set_'.$match_format->$end_format;
							$end_date->$set_end($end_data_string);
					}else{
						$end_date= null;
					}

					$date = new stdClass;
						if(isset($start_date)){ $date->start = $start_date; }
						if(isset($end_date)) { $date->end = $end_date; }

					$procesed_data= [$date];

				}
				if(isset($properties->process->geo_tag)){
					$source	= $properties->process->geo_tag;
					$lat	= $source->lat;
					$long	= $source->long;

					$data_lat_literal	= $rdf_graph->getLiteral($base_uri, $lat);
					$data_long_literal	= $rdf_graph->getLiteral($base_uri, $long);

					$object_property_name = isset($lat)
							? $lat
							: $long;

					$data_lat = isset($data_lat_literal)
							? $data_lat_literal->getValue()
							: null;
					$data_long = isset($data_long_literal)
							? $data_long_literal->getValue()
							: null;

					$feature = new stdClass();
						$feature->type = "Feature";
						$feature->properties = new stdClass();
						$feature->geometry = new stdClass();
						$feature->geometry->type = "Point";
						$feature->geometry->coordinates= [(float)$data_long, (float)$data_lat];

					$geojson = new stdClass();
						$geojson->type = "FeatureCollection";
						$geojson->features = [$feature];

					$geojson_encode = json_encode($geojson);
					$geojson_parse = str_replace('"', '\'', $geojson_encode);

					$procesed_data = '[geo-n-1--data:'.$geojson_parse.':data]';
				}
				if(isset($properties->process->geo_map)){
					$source	= $properties->process->geo_map;
					$lat	= $source->lat;
					$long	= $source->long;

					$data_lat_literal	= $rdf_graph->getLiteral($base_uri, $lat);
					$data_long_literal	= $rdf_graph->getLiteral($base_uri, $long);

					$object_property_name = isset($lat)
							? $lat
							: $long;

					$data_lat = isset($data_lat_literal)
							? $data_lat_literal->getValue()
							: null;
					$data_long = isset($data_long_literal)
							? $data_long_literal->getValue()
							: null;

					$procesed_data = new stdClass();
						$procesed_data->lat		= (float)$data_lat;
						$procesed_data->lon		= (float)$data_long;
						$procesed_data->zoom	= 20;
				}

				//get the Dédalo component names

				$ar_dd_component_label 	= ontology_node::get_term_by_tipo($current_tipo);
				$object_model_name 		= ontology_node::get_model_name_by_tipo($current_tipo);

				$ar_current_resource = $rdf_graph->allResources($base_uri, $object_property_name);
				//literal, if the resource is the end of the path
				if(!isset($ar_current_resource)) continue;
				if(sizeof($ar_current_resource)=== 0){
					$ar_project_lang = common::get_ar_all_langs();

					$literal = $rdf_graph->getLiteral($base_uri, $object_property_name);
					if(!isset($literal)) continue;

					$check_lang = $literal->getLang();
					if($check_lang === null){
						$ar_project_lang = [DEDALO_DATA_LANG];
					}

					foreach ($ar_project_lang as $lang) {

						$lang_alpha2 = lang::get_alpha2_from_code($lang);

						$literal = ($check_lang === null)
							? $rdf_graph->getLiteral($base_uri, $object_property_name)
							: $rdf_graph->getLiteral($base_uri, $object_property_name, $lang_alpha2);
						if(!isset($literal)) continue;

						$procesed_data = isset($properties->process)
							? $procesed_data
							: $literal->getValue();

						// get the literal in the deep link
							$class_dd_tipo = ontology_node::get_ar_tipo_by_model_name_and_relation($ObjectProperty_tipo, 'owl:Class', 'related', false);
							if(isset($class_dd_tipo[0])){

								$ar_literal_section_tipo = ontology_node::get_ar_tipo_by_model_name_and_relation($class_dd_tipo[0], 'section', 'related', false);

								// check if the current literal has a record inside Dédalo.
									$class_dd_tipo_ontology_node = new ontology_node($class_dd_tipo[0]);
									$class_properties = $class_dd_tipo_ontology_node->get_properties();

									if(isset($class_properties->match)){
										$literal_section_tipo_to_check = reset($ar_literal_section_tipo);
										// dump($literal_section_tipo_to_check.' '.$class_properties->match.' '.$resource_procesed_data, ' literal_section_tipo_to_check ++ '.to_string());
										$procesed_data = tool_import_rdf::get_resource_match($literal_section_tipo_to_check, $class_properties->match, $procesed_data);
									}
							}

						tool_import_rdf::set_data_into_component($locator, $current_tipo, $procesed_data, $lang);
					}

					$field = new stdClass();
						$field->tipo				= $current_tipo;
						$field->section_tipo		= $section_tipo;
						$field->parent				= $parent;
						$field->rdf_type			= $object_property_name;
						$field->value				= $procesed_data;
						$field->component_label		= $ar_dd_component_label;
						$field->section_tipo_label	= $section_tipo_label;


				}else{
					// if the resource is a link to the resource
					foreach ($ar_current_resource as $uri => $resource) {
						// if the component is a iri, store the uri of the resource and don't follow the link
						if($object_model_name==='component_iri'){

							$ar_values = $rdf_graph->allResources($base_uri, $object_property_name);
							$iri_procesed_data = [];
							foreach($ar_values as $iri_resource){
								$iri_obj = new stdClass();
									$iri_obj->iri = $iri_resource->getUri();
								$iri_procesed_data[] = $iri_obj;
							}

							$field = new stdClass();
								$field->tipo				= $current_tipo;
								$field->section_tipo		= $section_tipo;
								$field->parent 				= $parent;
								$field->rdf_type			= $object_property_name;
								$field->value				= $iri_procesed_data;
								$field->component_label		= $ar_dd_component_label;
								$field->section_tipo_label	= $section_tipo_label;

								tool_import_rdf::set_data_into_component($locator, $current_tipo, $iri_procesed_data);

						}else{

							$resource_procesed_data = false;
							if(isset($properties->process->source)){
									$source = $properties->process->source;
									$source_data = '';
									if($source === '$base_uri'){
										$source_data = $base_uri;
									}
									$resource_procesed_data = tool_import_rdf::process_data_map($source_data, $properties->process->data_map);
							}
							$resource_procesed_data = ($resource_procesed_data)
								? $resource_procesed_data
								: $resource->getUri();

							// get the literal in the deep link
								$class_dd_tipo			= ontology_node::get_ar_tipo_by_model_name_and_relation($ObjectProperty_tipo, 'owl:Class', 'related', false);
								$object_dd_tipo			= ontology_node::get_ar_tipo_by_model_name_and_relation($class_dd_tipo[0], 'owl:ObjectProperty', 'children', false);
								$current_section_tipo	= ontology_node::get_ar_tipo_by_model_name_and_relation($class_dd_tipo[0], 'section', 'related', false);
								$parent_dd_tipo			= ontology_node::get_ar_tipo_by_model_name_and_relation($ObjectProperty_tipo, 'component_', 'related', false);
								$resource_uri			= $resource->getUri();
								try {
									$resource->load('rdfxml');
								} catch (Exception $e) {

									debug_log(__METHOD__." Ignored broken link in rdf ".to_string($resource_uri), logger::DEBUG);
									continue;
								}
							// check if the current resource has a record inside Dédalo.
								$class_dd_tipo_ontology_node = new ontology_node($class_dd_tipo[0]);
								$class_properties = $class_dd_tipo_ontology_node->get_properties();

								if(isset($class_properties->match)){
									$section_tipo_to_check = reset($current_section_tipo);
									// dump($section_tipo_to_check.' '.$class_properties->match.' '.$resource_procesed_data, ' section_tipo_to_check ++ '.to_string());
									$resource_procesed_data = tool_import_rdf::get_resource_match($section_tipo_to_check, $class_properties->match, $resource_procesed_data);
								}

							// create the component_portal of the resource link
								$field = new stdClass();
									$field->tipo				= $current_tipo;
									$field->section_tipo		= $section_tipo;
									$field->parent				= $parent;
									$field->rdf_type			= $object_property_name;
									$field->value				= $resource_procesed_data;
									$field->component_label		= $ar_dd_component_label;
									$field->section_tipo_label	= $section_tipo_label;

								tool_import_rdf::set_data_into_component($locator, $current_tipo, $resource_procesed_data);

							// get the sub_data for the link
							$ar_resources = array_merge(
								$ar_resources,
								tool_import_rdf::get_resource_to_dd_object($object_dd_tipo, $rdf_graph, $resource_uri, $current_section_tipo, reset($parent_dd_tipo), $resource_procesed_data)
							);
						}
					}//end foreach ($ar_current_resource as $uri => $resource)
				}
			}//end if($children_dd_tipo)

			if(isset($field)){
				$ar_resources[] = $field;
			}
		}//end foreach ($ar_owl_ObjectProperty as $ObjectProperty_tipo)


		return $ar_resources;
	}//end get_rdf_to_dd_object



	/**
	* PROCESS_DATA_MAP
	* Takes source data and a data map, searches for matches in the source data,
	* and returns the corresponding transformed data based on the mappings provided in the data map.
	* @param mixed $source_data
	*  The source data to be processed.
	* @param array $data_map
	*  An associative array mapping source data values to their corresponding transformed values.
	* @return mixed|null $procesed_data
	*  The processed data based on the data map, or null if no match is found.
	*/
	public static function process_data_map($source_data, $data_map) {

		$procesed_data = false;

		foreach ($data_map as $key => $value) {
			if(strpos($source_data, $key)!==false){
				$procesed_data = $value;
				break;
			};
		}

		return $procesed_data;
	}//end process_data_map



	/**
	* GET_RESOURCE_MATCH
	* Search for received value in section. If it found, returns locator, else create the new value
	* and returns the resultant locator
	* @return object $locator
	*/
	public static function get_resource_match( string $section_tipo, string $component_tipo, string $value, ?string $filter=null ) : object {

		$model_name		= ontology_node::get_model_name_by_tipo( $component_tipo,true );
		$name			= ontology_node::get_term_by_tipo( $component_tipo, DEDALO_DATA_LANG, true, true );
		$lang 			= ontology_node::get_translatable( $component_tipo ) ? 'all' : DEDALO_DATA_NOLAN;

		// filter
			$filter_string = !empty($filter)
				? $filter
				: '{
					"$and": [
						{
							"q": "'.$value.'",
							"q_operator": "==",
							"q_split": false,
							"unaccent": false,
							"lang": "'.$lang.'",
							"path": [
								{
									"section_tipo"		: "'.$section_tipo.'",
									"component_tipo"	: "'.$component_tipo.'",
									"model"				: "'.$model_name.'",
									"name"				: "'.$name.'"
								}
							]
						}
					]
				  }';

		// sqo
			$sqo = json_decode('{
				"parsed": false,
				"section_tipo": "'.$section_tipo.'",
				"limit": 2,
				"offset": 0,
				"type": "search_json_object",
				"full_count": false,
				"order": false,
				"filter": '.$filter_string.',
				"skip_projects_filter": true,
				"select": []
			}');

		// search
			$search			= search::get_instance($sqo);
			$search_result	= $search->search();
			$ar_records		= $search_result->ar_records;
			$count			= count($ar_records);

		if($count>1) {

			// more than one exists with same value
				dump('', ' SQO +++++++++++++++++ '.to_string($sqo));
				debug_log(__METHOD__
					." Error Processing Request [get_solved_select_value]. Search on section_tipo: $section_tipo gets more than one result. Only one is expected ! ($count) " . PHP_EOL
					.' section_tipo: ' . $section_tipo . PHP_EOL
					.' count: ' .$count
					, logger::DEBUG
				);

			// use the first one
				$section_id = reset($ar_records)->section_id;

		}elseif ($count===1) {

			// founded. Already created record
				$section_id = reset($ar_records)->section_id;

		}elseif ($count===0) {

			// no found. Create a new empty record
				$section	= section::get_instance(null, $section_tipo);
				$section->Save();
				$section_id	= $section->get_section_id();

				if($model_name==='component_iri'){
					$dato = new stdClass();
						$dato->iri = $value;
				}

				$value = (isset($dato))
					? $dato
					: $value;

			// save new value
				$lang			= ontology_node::get_translatable( $component_tipo ) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
				$code_component	= component_common::get_instance(
					$model_name,
					$component_tipo,
					$section_id,
					'list',
					$lang,
					$section_tipo
				);
				$dato = is_array($value) ? $value : [$value];
				$code_component->set_dato( $dato );
				$code_component->Save();

			// debug_log(__METHOD__." Created new non existent record value: ".to_string($value), logger::ERROR);
		}

		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);
			$locator->set_type(DEDALO_RELATION_TYPE_LINK);


		return $locator;
	}//end get_resource_match



	/**
	* SET_DATA_INTO_COMPONENT
	* This method sets the provided value into a specified component instance within a section.
	* It performs checks, handles specific cases for component_iri, and relations, and saves the
	* new value if it's different from the existing data, avoiding overwriting existing information.
	* @param object|bool $locator
	* @param string $component_tipo
	* @param mixed $value
	* @param string $lang = DEDALO_DATA_LANG
	* @return bool
	* 	Returns true on successful saving, false otherwise.
	*/
	public static function set_data_into_component(object|bool $locator, string $component_tipo, mixed $value, string $lang=DEDALO_DATA_LANG) : bool {

		// locator check
			if (empty($locator) || !is_object($locator)) {
				debug_log(__METHOD__
					. ' Wrong locator received ' . PHP_EOL
					. ' locator: ' . to_string($locator) .PHP_EOL
					. ' gettype: ' . gettype($locator)
					, logger::ERROR
				);
				return false;
			}

		// sort vars
			$section_tipo	= $locator->section_tipo;
			$section_id		= $locator->section_id;
			$model_name		= ontology_node::get_model_name_by_tipo($component_tipo,true);

		// save new value
			$lang = ontology_node::get_translatable($component_tipo) ? $lang : DEDALO_DATA_NOLAN;

			$code_component	= component_common::get_instance(
				$model_name,
				$component_tipo,
				$section_id,
				'edit',
				$lang,
				$section_tipo,
				false
			);

		// old data
			$old_data = $code_component->get_dato();
			if(is_object($old_data)) {
				$count = 0;
				foreach ($old_data as $old_value) {
					$count ++;
				}
				if($count===0) $old_data=[];
			};

		// component_iri case
			if($model_name==='component_iri' && !empty($old_data)) {

				$new_values = $old_data;
				foreach ($value as $current_iri_obj) {
					$iri_value = $current_iri_obj->iri;

					$find = array_find($old_data, function($el) use($iri_value){
						return $el->iri === $iri_value;
					});

					if($find === null){
						$new_values[] = $current_iri_obj;
					}
				}

				// overwrite value
				$value = $new_values;

				// reset old data
				$old_data = [];
			}

		// relations
			$relation_models = component_relation_common::get_components_with_relations();
			if(in_array($model_name, $relation_models) && !empty($old_data)) {

				$object_exists = locator::in_array_locator($value, $old_data, ['section_id','section_tipo']);
				if ($object_exists===false) {

					$new_data	= $old_data;
					$new_data[]	= $value;

					// overwrite value
					$value = $new_data;

					// reset old data
					$old_data = null;
				}
			}

		// save if different avoiding to overwrite existing data
			if( empty($old_data) // no previous data exists
				&& $old_data !== $value // new value is different
				) {

				// debug
					// if ($model_name!=='component_iri') {
					// 	dump($old_data, ' old_data )))))))))))) ++ '.to_string($model_name.' '.$component_tipo));
					// 	dump($value, ' value )))))))))))) ++ '.to_string($model_name.' '.$component_tipo));
					// }
				debug_log(__METHOD__
					. " Saving component data. model: $model_name - component_tipo: $component_tipo " . PHP_EOL
					. ' value: ' .to_string($value)
					, logger::DEBUG
				);

				$code_component->set_dato( $value );
				$code_component->Save();

				return true;
			}


		return false;
	}//end set_data_into_component



	/**
	* CREATE_NEW_RESOURCE
	* create new section when the component has a section between values. as ref biblio or ref persons
	* Search for received value in section. If it found, returns locator, else create the new value
	* and returns the resultant locator
	* @param object properties
	* @return object|null $locator
	*/
	public static function create_new_resource(object $properties) : ?object {

		// properties
			$locator		= $properties->locator;
			$target_ddo		= $properties->target_ddo;
			$component_tipo	= $properties->current_tipo;
			$path			= $properties->path;
			$value			= $properties->value;

			$lang = ontology_node::get_translatable( $component_tipo ) ? 'all' : DEDALO_DATA_NOLAN;
		// filter
			$filter = '{
				"$and": [
					{
						"q": "'.$value.'",
						"q_split": false,
						"unaccent": false,
						"lang": "'.$lang.'",
						"path": '.json_encode($path).'
					}
				]
			}';

		// sqo
			$sqo = json_decode('{
				"parsed": false,
				"section_tipo": "'.$locator->section_tipo.'",
				"limit": 2,
				"offset": 0,
				"type": "search_json_object",
				"full_count": false,
				"order": false,
				"filter": '.$filter.',
				"skip_projects_filter": true,
				"select": []
			}');

		// search
			$search			= search::get_instance($sqo);
			$search_result	= $search->search();
			$ar_records		= $search_result->ar_records;
			$count			= count($ar_records);

		if($count >= 1){
			return null;
		}

		$model			= ontology_node::get_model_name_by_tipo($component_tipo);
		$lang			= ontology_node::get_translatable( $component_tipo ) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;

		// component
		$component = component_common::get_instance(
			$model,
			$component_tipo,
			$locator->section_id,
			'list',
			$lang,
			$locator->section_tipo
		);
		$data = $component->get_dato();

		// no found. Create a new empty record
		$section = section::get_instance(null, $target_ddo->section_tipo);
		$section->Save();
		$section_id	= $section->get_section_id();


		$new_locator = new locator();
			$new_locator->set_section_tipo($target_ddo->section_tipo);
			$new_locator->set_section_id($section_id);
			$new_locator->set_type(DEDALO_RELATION_TYPE_LINK);

		// save new value
		$new_data = array_merge($data, [$new_locator]);
		$component->set_dato( $new_data );
		$component->Save();


		return $new_locator;
	}//end create_new_resource



}//end tool_import_rdf
