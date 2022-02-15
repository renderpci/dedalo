<?php

require_once( dirname(dirname(dirname(dirname(dirname(__FILE__))))) .'/vendor/autoload.php');

/*
* CLASS tool_import_rdf
*
*
*/
class tool_import_rdf extends tool_common {

	

	# component
	protected $section_tipo;

	/**
	* __CONSTRUCT
	*/
	public function __construct($section_tipo, $modo='button') {
			
		# Fix modo
		$this->modo = $modo;

		// fix section tipo. (!) To unify tools vars, param section_tipo could be a full section object in some cases	
		$this->section_tipo = (is_object($section_tipo))
			? $section_tipo->get_tipo()
			: $section_tipo;

		# Fix search options
		// $search_options_id		= $this->section_tipo; // section tipo like oh1
		// $saved_search_options	= section_records::get_search_options( $search_options_id );
		
		// save cloned version of saved_search_options	
		// $this->search_options = unserialize(serialize($saved_search_options));

		return true;
	}//end __construct



	/**
	* GET_ONTOLOGY
	* @return
	*/
	public function get_ontology_tipo($component_tipo) {

		$RecordObj_dd = new RecordObj_dd($component_tipo);
		$propiedades = $RecordObj_dd->get_propiedades(true);
		$ontology_tipo = $propiedades->ar_tools_name->tool_import_rdf->external_ontology;

		return $ontology_tipo;
	}//end get_ontology_tipo


	/**
	* GET_COMPONENT_DATO($SECTION_ID,	$COMPONENT_TIPO);
	* @return
	*/
	public function get_component_dato($section_id,	$component_tipo){

		$RecordObj_dd	= new RecordObj_dd($component_tipo);
		$translatable 	= $RecordObj_dd->get_traducible();
		$modelo			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo);
		$lang			=  ($translatable==='no')
			? DEDALO_DATA_NOLAN
			: DEDALO_DATA_LANG;
		$component_tipo = component_common::get_instance($modelo,
														 $component_tipo,
														 $section_id,
														 'list',
														 $lang,
														 $this->section_tipo);

		$component_dato = $component_tipo->get_dato();

		return $component_dato;
	}//end get_component_dato($section_id,	$component_tipo);



	/**
	* GET_RDF_DATA
	* @return
	*/
	public static function get_rdf_data($ontology_tipo, $ar_data, $locator) {

		$RecordObj_dd = new RecordObj_dd($ontology_tipo);
		$propiedades = $RecordObj_dd->get_propiedades(true);

		$name_space = $propiedades->xmlns;

		foreach($name_space as $key => $value){
			\EasyRdf\RdfNamespace::set($key, $value);
		}

		$rdf_data = [];
		foreach($ar_data as $uri){

			$rdf_uri = (substr($uri, -4)!=='.rdf')
				? $uri.'.rdf'
				: $uri;

			$base_uri = substr($rdf_uri, 0, strlen($rdf_uri)-4);

			$rdf_graph = new \EasyRdf\Graph($rdf_uri);

			try {
				$rdf_graph->load();
			} catch (Exception $e) {

				debug_log(__METHOD__." Ignored broken link in rdf ".to_string($rdf_uri), logger::DEBUG);
				continue;
			}

			// $resources = $rdf_graph->resources();
			// $rdf_types = $rdf_graph->toRdfPhp();
			$rdf_type = $rdf_graph->type($base_uri);

			$ontology_chidren = RecordObj_dd::get_ar_childrens($ontology_tipo);

			$dd_obj = tool_import_rdf::get_class_map_to_dd($ontology_chidren, $rdf_type, $rdf_graph, $base_uri, $locator);

			$ar_rdf_html =$rdf_graph->dump('html');

			$ar_dd_obj = new stdClass();
				$ar_dd_obj->dd_obj 			= $dd_obj;
				$ar_dd_obj->ar_rdf_html 	= $ar_rdf_html;

			$rdf_data[] = $ar_dd_obj;
		}

			// dump($rdf_data, ' rdf_data +-------------------------------+ '.to_string());
		return $rdf_data;

		// $me = $nmo->primaryTopic();
		// if($nmo->type()==='nmo:TypeSeriesItem'){


	}//end get_rdf_data

	/**
	* GET_CLASS_MAP_TO_DD
	* @return
	*/
	public static function get_class_map_to_dd($ar_class_children, $rdf_type, $rdf_graph, $base_uri, $locator) {

		$ar_owl_ObjectProperty = [];
		foreach ($ar_class_children as $owl_class_tipo) {
			$class_name = RecordObj_dd::get_termino_by_tipo($owl_class_tipo);

			if ($class_name === $rdf_type) {
				$ar_owl_ObjectProperty = RecordObj_dd::get_ar_childrens($owl_class_tipo);
				$current_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($owl_class_tipo, 'section', 'termino_relacionado', false);
			}
		}
		$section_tipo = reset($current_section_tipo);
		$section_tipo_label		= RecordObj_dd::get_termino_by_tipo($section_tipo);
		//main section
			$field = new stdClass();
				$field->tipo 				= $section_tipo;
				$field->section_tipo 		= $section_tipo;
				$field->parent 				= 'root';
				$field->rdf_type			= $rdf_type;
				$field->value 				= $base_uri;
				$field->component_label 	= $section_tipo_label;
				$field->section_tipo_label 	= $section_tipo_label;

		$dd_object = [$field];
		$dd_object = array_merge($dd_object, tool_import_rdf::get_resource_to_dd_object($ar_owl_ObjectProperty, $rdf_graph, $base_uri, $current_section_tipo, $section_tipo, $locator));

		return $dd_object;
	}//end get_class_map_to_dd


	/**
	* GET_RDF_TO_DD_OBJECT
	* @return
	*/
	public static function get_resource_to_dd_object($ar_owl_ObjectProperty, $rdf_graph, $base_uri, $ar_section_tipo, $parent, $locator = false) {

		$ar_resources = [];
		$section_tipo = reset($ar_section_tipo);
		foreach ($ar_owl_ObjectProperty as $ObjectProperty_tipo) {
			$section_tipo_label		= RecordObj_dd::get_termino_by_tipo($section_tipo);
			$object_property_name	= RecordObj_dd::get_termino_by_tipo($ObjectProperty_tipo);
			$related_dd_tipo		= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($ObjectProperty_tipo, 'component_', 'termino_relacionado', false);
			$children_dd_tipo		= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($ObjectProperty_tipo, 'owl:ObjectProperty', 'children', false);
			$current_tipo 			= reset($related_dd_tipo);


			$RecordObj_dd = new RecordObj_dd($ObjectProperty_tipo);
				$propiedades = $RecordObj_dd->get_propiedades(true);
				// if(isset($propiedades->match)){
				// 		dump($propiedades, ' propiedades ++ '.to_string());
				// }

			if($children_dd_tipo){
				$current_resource = $rdf_graph->getResource($base_uri, $object_property_name);
				if(!isset($current_resource)) continue;
				$resource_uri = $current_resource->getUri();
				$ar_resources = array_merge($ar_resources, tool_import_rdf::get_resource_to_dd_object($children_dd_tipo, $rdf_graph, $resource_uri, [$section_tipo], $parent, $locator));
			}else{
				$procesed_data = false;
				if(isset($propiedades->process->source)){
						$source = $propiedades->process->source;
						$source_data = '';
						if($source === '$base_uri'){
							$source_data = $base_uri;
						}
						$procesed_data = tool_import_rdf::process_data_map($source_data, $propiedades->process->data_map);
				}
				if(isset($propiedades->process->split)){
						$source = $propiedades->process->split->source;
						$source_data = '';
						if($source === '$base_uri'){
							$source_data = $base_uri;
						}
						$split_by = $propiedades->process->split->split_by;
						$ar_parts = explode($split_by , $source_data);

						$get_element = $propiedades->process->split->get;
						if($get_element==='end'){
							$element_got = end($ar_parts);
						}
						$object_property_name = $propiedades->process->split->property_name;
						$procesed_data = $element_got;
				}
				if(isset($propiedades->process->date)){
						$source = $propiedades->process->date;
						$start = $source->start;
						$end = $source->end;
						$date_start_literal	= $rdf_graph->getLiteral($base_uri, $start);
						$date_end_literal	= $rdf_graph->getLiteral($base_uri, $end);

						$start_data = isset($date_start_literal)
							? $date_start_literal->getValue()
							: null;

						$start_format = isset($start_data)
							? $date_start_literal->getDatatype()
							: null;

						$end_data = isset($date_end_literal)
							? $date_end_literal->getValue()
							: null;

						$end_format = isset($end_data)
							? $date_end_literal->getDatatype()
							: null;

						$match_format = $source ->format;

						$object_property_name = isset($date_start_literal)
							? $start
							: $end;

						if(isset($start_data)){
							$start_date = new dd_date();
								$set_start = 'set_'.$match_format->$start_format;
								$start_date->$set_start($start_data);
						}else{
							$start_date= null;
						}

						if(isset($end_data)){
							$end_date = new dd_date();
								$set_end = 'set_'.$match_format->$end_format;
								$end_date->$set_end($end_data);
						}else{
							$end_date= null;
						}

						$date = new stdClass;
							if(isset($start_date)){ $date->start = $start_date; }
							if(isset($end_date)) { $date->end = $end_date; }

						$procesed_data= [$date];
				}
				if(isset($propiedades->process->geo_tag)){
					$source	= $propiedades->process->geo_tag;
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
				if(isset($propiedades->process->geo_map)){
					$source	= $propiedades->process->geo_map;
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

				$ar_dd_component_label 	= RecordObj_dd::get_termino_by_tipo($current_tipo);
				$object_model_name 		= RecordObj_dd::get_modelo_name_by_tipo($current_tipo);

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

						$procesed_data = isset($propiedades->process)
							? $procesed_data
							: $literal->getValue();

						// get the literal in the deep link
							$class_dd_tipo			= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($ObjectProperty_tipo, 'owl:Class', 'termino_relacionado', false);
							if(isset($class_dd_tipo[0])){

								$ar_literal_section_tipo	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($class_dd_tipo[0], 'section', 'termino_relacionado', false);

								// check if the current literal has a record inside Dédalo.
									$RecordObj_dd = new RecordObj_dd($class_dd_tipo[0]);
									$class_propiedades = $RecordObj_dd->get_propiedades(true);

									if(isset($class_propiedades->match)){
										$literal_section_tipo_to_check = reset($ar_literal_section_tipo);
										// dump($literal_section_tipo_to_check.' '.$class_propiedades->match.' '.$resource_procesed_data, ' literal_section_tipo_to_check ++ '.to_string());
										$procesed_data = tool_import_rdf::get_resource_macth($literal_section_tipo_to_check, $class_propiedades->match, $procesed_data);
									}
							}

						tool_import_rdf::set_data_into_component($locator, $current_tipo, $procesed_data, $lang);
					}


					$field = new stdClass();
							$field->tipo 				= $current_tipo;
							$field->section_tipo 		= $section_tipo;
							$field->parent 				= $parent;
							$field->rdf_type			= $object_property_name;
							$field->value 				= $procesed_data;
							$field->component_label 	= $ar_dd_component_label;
							$field->section_tipo_label 	= $section_tipo_label;



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
							if(isset($propiedades->process->source)){
									$source = $propiedades->process->source;
									$source_data = '';
									if($source === '$base_uri'){
										$source_data = $base_uri;
									}
									$resource_procesed_data = tool_import_rdf::process_data_map($source_data, $propiedades->process->data_map);
							}
							$resource_procesed_data = ($resource_procesed_data)
								? $resource_procesed_data
								: $resource->getUri();

							// get the literal in the deep link
								$class_dd_tipo			= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($ObjectProperty_tipo, 'owl:Class', 'termino_relacionado', false);
								$object_dd_tipo			= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($class_dd_tipo[0], 'owl:ObjectProperty', 'children', false);
								$current_section_tipo	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($class_dd_tipo[0], 'section', 'termino_relacionado', false);
								$parent_dd_tipo			= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($ObjectProperty_tipo, 'component_', 'termino_relacionado', false);
								$resource_uri 	= $resource->getUri();
								try {
									$resource->load('rdfxml');
								} catch (Exception $e) {

									debug_log(__METHOD__." Ignored broken link in rdf ".to_string($resource_uri), logger::DEBUG);
									continue;
								}


							// check if the current resource has a record inside Dédalo.
								$RecordObj_dd = new RecordObj_dd($class_dd_tipo[0]);
								$class_propiedades = $RecordObj_dd->get_propiedades(true);

								if(isset($class_propiedades->match)){
									$section_tipo_to_check = reset($current_section_tipo);
									// dump($section_tipo_to_check.' '.$class_propiedades->match.' '.$resource_procesed_data, ' section_tipo_to_check ++ '.to_string());
									$resource_procesed_data = tool_import_rdf::get_resource_macth($section_tipo_to_check, $class_propiedades->match, $resource_procesed_data);
								}

							// create the component_portal of the resource link
								$field = new stdClass();
									$field->tipo				= $current_tipo;
									$field->section_tipo		= $section_tipo;
									$field->parent 				= $parent;
									$field->rdf_type			= $object_property_name;
									$field->value				= $resource_procesed_data;
									$field->component_label		= $ar_dd_component_label;
									$field->section_tipo_label	= $section_tipo_label;

								tool_import_rdf::set_data_into_component($locator, $current_tipo, $resource_procesed_data);


							//get the sub_data for the link
							$ar_resources 	= array_merge($ar_resources, tool_import_rdf::get_resource_to_dd_object($object_dd_tipo, $rdf_graph, $resource_uri, $current_section_tipo, reset($parent_dd_tipo), $resource_procesed_data));
						}

					}
				}
			}
			if(isset($field)){
				$ar_resources[] = $field;
			}

		}
		return $ar_resources;
	}//end get_rdf_to_dd_object



	/**
	* PROCESS_DATA
	* @return
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
	}//end process_data


	/**
	* GET_SOLVED_SELECT_VALUE
	* Search for received value in section. If it found, returns locator, else create the new value
	* and returns the resultant locator
	* @return object $locator
	*/
	public static function get_resource_macth($section_tipo, $component_tipo, $value, $filter=null) {

		$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		$name			= RecordObj_dd::get_termino_by_tipo($component_tipo, DEDALO_DATA_LANG, true, true);

		$RecordObj_dd	= new RecordObj_dd($component_tipo);
		$lang			= ($RecordObj_dd->get_traducible()==='no') ? DEDALO_DATA_NOLAN : 'all';

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
									"section_tipo": "'.$section_tipo.'",
									"component_tipo": "'.$component_tipo.'",
									"modelo": "'.$modelo_name.'",
									"name": "'.$name.'"
								}
							]
						}
					]
				}';

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


		$search_development2	= new search_development2($sqo);
		$search_result			= $search_development2->search();
		$ar_records				= $search_result->ar_records;
		$count					= count($ar_records);


		if($count>1) {

			// more than one exists with same value
				dump('', ' SQO +++++++++++++++++ '.to_string($sqo));
				throw new Exception("Error Processing Request [get_solved_select_value]. Search in section_tipo: $section_tipo get more than one result. Only one is expected ! ($count)", 1);

		}elseif ($count===1) {

			// founded. Already created record
				$section_id = reset($ar_records)->section_id;

		}elseif ($count===0) {

			// no found. Create a new empty record
				$section	= section::get_instance(null, $section_tipo);
				$section->Save();
				$section_id	= $section->get_section_id();

				if($modelo_name==='component_iri'){
					$dato = new stdClass();
						$dato->iri = $value;
				}

				$value = (isset($dato))
					? $dato
					: $value;

			// save new value
				$RecordObj_dd	= new RecordObj_dd($component_tipo);
				$lang			= ($RecordObj_dd->get_traducible()==='no') ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;
				$code_component	= component_common::get_instance($modelo_name,
																 $component_tipo,
																 $section_id,
																 'list',
																 $lang,
																 $section_tipo);
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
	}//end get_resource_macth



	/**
	* SET_DATA_INTO_COMPONENT
	* @return
	*/
	public static function set_data_into_component($locator, $component_tipo, $value, $lang=DEDALO_DATA_LANG) {

		$section_tipo	= $locator->section_tipo;
		$section_id		= $locator->section_id;
		$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);

		// save new value
			$RecordObj_dd	= new RecordObj_dd($component_tipo);
			$lang			= ($RecordObj_dd->get_traducible()==='no') ? DEDALO_DATA_NOLAN : $lang;

			$code_component	= component_common::get_instance($modelo_name,
															 $component_tipo,
															 $section_id,
															 'edit',
															 $lang,
															 $section_tipo,
															 false);


			$old_data = $code_component->get_dato();

			if(is_object($old_data)){
				$count = 0;
				foreach ($old_data as $old_value) {
					$count ++;
				}
				if($count===0) $old_data=[];
			};

			// if($component_tipo==='numisdata98'){
			// 		dump($value, ' value +-----------+ '.to_string(empty($old_data)));
			// }

			if($modelo_name==='component_iri' && !empty($old_data)){

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

				$value 		= $new_values;
				$old_data 	= [];
			}

			$relation_models = component_relation_common::get_components_with_relations();
			if(in_array($modelo_name, $relation_models) && !empty($old_data)){

				$object_exists = locator::in_array_locator($value, $old_data, ['section_id','section_tipo']);

				if ($object_exists===false) {
					$new_data	= $old_data;
					$new_data[]	= $value;
					$value		= $new_data;
					$old_data = null;
				}
			}


			if($old_data !== $value && empty($old_data)){
				// if($component_tipo==='numisdata98'){
				// 		dump($value, ' final +------/////////////////////////////////-----+ '.to_string());
				// }
				$code_component->set_dato( $value );
				$code_component->Save();
			}

			return;

	}//end set_data_into_component

}//end tool_import_rdf