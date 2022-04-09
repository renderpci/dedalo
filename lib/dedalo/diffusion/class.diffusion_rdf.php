<?php
require_once(DEDALO_LIB_BASE_PATH . '/diffusion/class.diffusion.php');
require_once( dirname(dirname(dirname(dirname(__FILE__)))) .'/vendor/autoload.php');
/*
* CLASS DIFFUSION_rdf
* Used to publish data to RDF
* The publication in RDF need to be defined in the ontology inside a diffusion_element
*/



/**
* DIFFUSION_RDF
* @param int $section_id
* @param array $rdf_wrapper
*/
class diffusion_rdf extends diffusion {


	public $section_id;
	public $rdf_wrapper;	// Array of rdf wrapper lines to inject body content at element $rdf_wrapper[rdf_value]

	public $service_name;	// From propiedades of diffusion_element (Fixed on update_record)
	public $service_type;	// From propiedades of diffusion_element (Fixed on update_record)
	public $external_ontology_tipo; // the diffusion element tipo
	// public $entity_section_id; //Fixed on update_record
	public $ar_records; // Inject data here by tool diffusion when update_record

	public $entity_locator; // the entity publication service locator to use for get the URL base.

	public $DEDALO_EXTRAS_BASE_URL;


	/**
	* CONSTRUCT
	* @param object $options . Default null
	*/
	function __construct($options=null) {

		parent::__construct($options=null);

		$this->DEDALO_EXTRAS_BASE_URL = DEDALO_ROOT_WEB . '/'. basename(dirname(DEDALO_LIB_BASE_PATH)) .'/'. basename(DEDALO_LIB_BASE_PATH) .'/'. basename(DEDALO_EXTRAS_PATH);
	}//end __construct


	/**
	* UPDATE_RECORD
	*/
	public function update_record( $request_options, $resolve_references=false ) {


		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		// options
			$options = new stdClass();
				$options->section_tipo				= null;
				$options->section_id				= null;
				$options->diffusion_element_tipo	= null;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// target_section_tipo
			$RecordObj_dd 		 = new RecordObj_dd($options->diffusion_element_tipo);
			$propiedades 		 = $RecordObj_dd->get_propiedades(true);
			#$target_section_tipo = $propiedades->diffusion->target_section_tipo;

		// Fix vars
			$this->external_ontology_tipo	= $options->diffusion_element_tipo;
			$this->service_name				= $propiedades->diffusion->service_name;
			$this->service_type				= $propiedades->diffusion->service_type;
			$this->name_space				= $propiedades->xmlns;
			$this->entity_locator			= $this->resolve_entity_locator();

		// search records
			if (empty($this->ar_records)) {
				$ar_section_id = [$options->section_id];
			}else{
				$ar_section_id = array_map(function($item){
					return $item->section_id;
				}, (array)$this->ar_records);
			}

		// filter to publish records
			$ar_section_id = self::get_to_publish_rows($options->section_tipo, $ar_section_id);

		// Directory
			$sub_path    = '/rdf/'.$this->service_name.'/';	 //nomisma/';
			$folder_path = DEDALO_MEDIA_BASE_PATH . $sub_path;
			if (!is_dir($folder_path)) {
				if(!mkdir($folder_path, 0777, true)) {
					$response->msg = trim(" Error on read or create directory. Permission denied");
					return $init_response;
				}
				debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
			}

		// diffusion rdf
			$current_date	= new DateTime();
			$date			= $current_date->format('Y-m-d H_i_s');

			$ar_owl_class_tipo		= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($options->diffusion_element_tipo, 'owl:Class', 'children', true);
			foreach ($ar_owl_class_tipo as $current_class_tipo) {
				$ar_current_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_class_tipo, 'section', 'termino_relacionado', true);
				$current_section_tipo = reset($ar_current_section_tipo);
				if($current_section_tipo === $options->section_tipo){
					$owl_class_tipo = $current_class_tipo;
					break;
				}
			}

			$rdf_name		= RecordObj_dd::get_termino_by_tipo($owl_class_tipo);
				$rdf_file_name	= $rdf_name.'_'. $date.'.rdf';

			$rdf_options = new stdClass();
				// $rdf_options->external_ontology_tipo	= $this->external_ontology_tipo;
				$rdf_options->owl_class_tipo			= $owl_class_tipo;	// Numisma RDF : modelo_name : xml
				$rdf_options->section_tipo				= $options->section_tipo; // $target_section_tipo;	// Fichero
				$rdf_options->ar_section_id				= $ar_section_id;	// Array like [45001,45002,45003];
				$rdf_options->save_to_file_path			= DEDALO_MEDIA_BASE_PATH . $sub_path . $rdf_file_name; // Target file
				$rdf_options->url_file					= DEDALO_MEDIA_BASE_URL  . $sub_path . $rdf_file_name;

			$response = $this->build_rdf_file( $rdf_options );
				#dump($response, ' response ++ '.to_string($options));

		// saves publication data
			diffusion::update_publication_data($options->section_tipo, $options->section_id);

		return $response;
	}//end update_record


	/**
	* BUILD_rdf_FILE
	* @param object $request_options
	* @return object $response
	*/
	public function build_rdf_file( $request_options ) {

		# Maximum execution time seconds
		set_time_limit(600);

		$start_time=microtime(1);

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= [];

		$options = new stdClass();
			// $options->external_ontology_tipo	= null;
			$options->owl_class_tipo			= null;
			$options->rdf_validate				= true;
			$options->rdf_format_output			= true;
			$options->section_tipo				= null;
			$options->ar_section_id				= array();
			$options->save_to_file_path			= false;
			$options->url_file					= false;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		#
		# WRAPPER
		// $external_ontology_tipo	= $options->external_ontology_tipo;
		$owl_class_tipo			= $options->owl_class_tipo;	// Like mupreva2190 for 'Numisma RDF'

		$rdf_graph = new \EasyRdf\Graph();

		// $RecordObj_dd = new RecordObj_dd($owl_class_tipo);
		// $propiedades = $RecordObj_dd->get_propiedades(true);

		$name_space = $this->name_space;

		foreach($name_space as $key => $value){
			\EasyRdf\RdfNamespace::set($key, $value);
		}

		// $ontology_chidren = RecordObj_dd::get_ar_childrens($ontology_tipo);

		// $owl_class_tipo = null;
		// $ar_owl_ObjectProperty = [];
		// foreach ($ontology_chidren as $current_owl_class_tipo) {
		// 	$ar_current_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_owl_class_tipo, 'section', 'termino_relacionado', true);
		// 	$current_section_tipo = reset($ar_current_section_tipo);
		// 	if($current_section_tipo === $options->section_tipo){
		// 		$owl_class_tipo 			= $current_owl_class_tipo;
		// 		break;
		// 	}
		// }


		$format_options = array();
		foreach (\EasyRdf\Format::getFormats() as $format) {
			if ($format->getSerialiserClass()) {
				$format_options[$format->getLabel()] = $format->getName();
			}
		}

			// dump($format_options, ' format_options ++ '.to_string());

		# PARSE RDF_OBJECT
		$ar_element=array();
		foreach ($options->ar_section_id as $current_section_id) {
			$element 	  = $this->build_rdf_node($rdf_graph, null, $owl_class_tipo, $options->section_tipo, $current_section_id);
			#dump($element, ' element ++ $current_section_id: '.to_string($current_section_id));
			$ar_element[] = $element;
		}


		$data = $rdf_graph->serialise('rdfxml');
		if (!is_scalar($data)) {
			$data = var_export($data, true);
		}
			// dump(htmlspecialchars($data), ' RDF ++ '.to_string());
		// print "<pre>".htmlspecialchars($data)."</pre>";

		/*
			"RDF/PHP": "php",
			"RDF/JSON Resource-Centric": "json",
			"JSON-LD": "jsonld",
			"N-Triples": "ntriples",
			"Turtle Terse RDF Triple Language": "turtle",
			"RDF/XML": "rdfxml",
			"Graphviz": "dot",
			"Notation3": "n3",
			"Portable Network Graphics (PNG)": "png",
			"Graphics Interchange Format (GIF)": "gif",
			"Scalable Vector Graphics (SVG)": "svg"
   		*/

		#
		# SAVE FILE
			if ($options->save_to_file_path) {
				if( file_put_contents($options->save_to_file_path, $data) ){
					#$response->msg[] = "File is saved successfully";
					$msg  = '';
					$msg .= '&nbsp;<a class="btn btn-primary btn-sm" role="button" href="'.$options->url_file.'" target="_blank"><span class="glyphicon glyphicon-save"></span> Download '.pathinfo($options->url_file,PATHINFO_BASENAME).'</a>';
					if(SHOW_DEBUG===true) {
					$msg .= '<hr>DEBUG: ' . $options->save_to_file_path;
					}
					$response->msg[] = $msg;
				}
			}

		// response additional info
			$response->result = true;
			$response->url = $options->url_file;

		$total_time=round(microtime(1)-$start_time,3);
		$response->debug[] = "Generated [".count($options->ar_section_id)." elements] in $total_time secs";


		return $response;
	}//end build_rdf_file


	/**
	* BUILD_RDF_node
	* @return
	*/
	public function build_rdf_node($rdf_graph, $node_graph, $ObjectProperty_tipo, $section_tipo, $section_id) {

		//get the name of the property, it is defined in the ontology term, and will use as rdf property
		$object_name			= RecordObj_dd::get_termino_by_tipo($ObjectProperty_tipo);
		$object_model_name 		= RecordObj_dd::get_modelo_name_by_tipo($ObjectProperty_tipo);
		$RecordObj_dd = new RecordObj_dd($ObjectProperty_tipo);
			$properties = $RecordObj_dd->get_propiedades(true);
		// result of the recursion, to be used in the component_portals to check if the resource linked has data
		// if yes, it will create the resource link in the graph, else, it will doesn't create the link
		$result = false;
		// the main section is the owl:Class
		switch ($object_model_name) {

			case 'owl:Class':
				if(isset($properties->process)){
					switch ($properties->process->type) {
						case 'entity_publication_uri':
							// check if the title in the base_uril_entity is self and resolve it
							$base_uri_entity = $properties->process->base_uri_entity;
							$base_uri_entity->title = ($base_uri_entity->title === 'self') ? $object_name : $base_uri_entity->title;
							$uri_data = $this->resolve_base_uri($base_uri_entity);
							//resolve the uri id
							if(isset($propiedades->var_uri)){
								$var_uri = $this->resolve_var_uri($propiedades->var_uri , $section_tipo, $section_id);
								$uri = $uri_data . $var_uri;
							}else{
								$uri = $uri_data . $section_id;
							}
							// create the graph of the class
							$node_graph = $rdf_graph->resource($uri, $object_name);

							// recursion: all children need to be processed
								$ar_owl_ObjectProperty	= RecordObj_dd::get_ar_childrens($ObjectProperty_tipo);
								if(!empty($ar_owl_ObjectProperty)){
									foreach ($ar_owl_ObjectProperty as $current_ObjectProperty_tipo) {
										$sub_node_graph = $this->build_rdf_node($rdf_graph, $node_graph, $current_ObjectProperty_tipo, $section_tipo, $section_id);
									}
									$result = true;
								}
							break;

						default:
							// code...
							break;
					}
				}
				break;

			case 'rdf':

				$ar_related_dd_tipo	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($ObjectProperty_tipo, 'component_', 'termino_relacionado', false);
				$current_tipo 		= reset($ar_related_dd_tipo);
				$model_name			= RecordObj_dd::get_modelo_name_by_tipo($current_tipo);

				$component			= component_common::get_instance($model_name,
															 $current_tipo,
															 $section_id,
															 'list',
															 DEDALO_DATA_NOLAN,
															 $section_tipo);

				$data = (array)$component->get_dato();

				$ar_owl_class_tipo	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($ObjectProperty_tipo, 'owl:Class', 'termino_relacionado', true);
				$owl_class_tipo 	= reset($ar_owl_class_tipo);

				// max_items. (!) Notice that here we use the user configurable DEDALO_DIFFUSION_RESOLVE_LEVELS value as n items resolve (Example: 1 coins for current type)
					$max_items = isset($_SESSION['dedalo4']['config']['DEDALO_DIFFUSION_RESOLVE_LEVELS'])
						? $_SESSION['dedalo4']['config']['DEDALO_DIFFUSION_RESOLVE_LEVELS']
						: (defined('DEDALO_DIFFUSION_RESOLVE_LEVELS') ? DEDALO_DIFFUSION_RESOLVE_LEVELS : 1);

				// process data locators
					$data_length = empty($data) ? 0 : count($data);
					for ($i=0; $i < $data_length; $i++) {

						// continue until reach max_items limit
						if ($i>=$max_items) {
							break;
						}

						$current_locator = $data[$i];

						// Check target is publicable
							$current_is_publicable = diffusion::get_is_publicable($current_locator);
							if ($current_is_publicable!==true) {
								$max_items++;
								continue;
							}

						$this->build_rdf_node(
							$rdf_graph, // rdf_graph
							null, // node_graph
							$owl_class_tipo, // ObjectProperty_tipo
							$current_locator->section_tipo, // section_tipo
							$current_locator->section_id // section_id
						);
					}
				break;

			default:
				// ddo_map create or get from properties
					$ddo_map			= [];
					$ar_related_dd_tipo	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($ObjectProperty_tipo, 'component_', 'termino_relacionado', false);
					// check if the ontology has his owm ddo_map defined, if not, it will create a ddo_map with related components.
					if(isset($properties->process) && isset($properties->process->ddo_map)){

						$ddo_map = $properties->process->ddo_map;
						// resolve the 'self' value for section_tipo or parent, if this properties are defined use it.
						foreach ($ddo_map as $ddo) {
							$ddo->section_tipo	= $ddo->section_tipo === 'self' ? $section_tipo : $ddo->section_tipo;
							$ddo->parent		= $ddo->parent === 'self' ? $section_tipo : $ddo->parent;
						}
					}else{
						// create new ddo_map when the ontology doesn't has one ddo_map
						foreach ($ar_related_dd_tipo as $current_tipo) {
							$ddo = new stdClass();
								$ddo->tipo			= $current_tipo;
								$ddo->section_tipo	= $section_tipo;
								$ddo->parent		= $section_tipo;
								$ddo->value_fn		= "get_diffusion_value";

							$ddo_map[] = $ddo;
						}
					}

				// resolve the ddo_map
					// get the value of all ddo
					$ar_values = $this->get_ddo_map_value($ddo_map, $parent=$section_tipo, $section_tipo, $section_id);

					// set the default lang, and transform to alpha2 standard (lg-eng -> en)
					$default_lang			= DEDALO_DATA_LANG_DEFAULT;
					$default_alpha2_lang	= lang::get_alpha2_from_code($default_lang);
					$ar_langs = [$default_alpha2_lang];
					// create unique array with all languages of the data, it will used to fill the gaps in the components that has to be joined and doesn't has done the translation
					foreach ($ar_values as $value) {
						if (!in_array($value->lang, $ar_langs) && $value->lang !== null) {
							$ar_langs[] = $value->lang;
						}
					}
					// get_end_ddo, the last ddo in the chain, they have the values
					$end_ddo = [];
					// If the ddo_map has a config, the config->result->ddo_map will be use instead the current ddo_map because the current $ddo_map is for search the data
					// and the result ($ar_values) need to be processed with the ddo_map that mach, see numisdata1311
					foreach ($ddo_map as $ddo) {
						$ddo_map = (isset($ddo->config) && isset($ddo->config->result->ddo_map))
							? $ddo->config->result->ddo_map
							: $ddo_map;
					}

					foreach ($ddo_map as $ddo) {
						$children = array_filter($ddo_map, function($item) use($ddo) {
							return $item->parent===$ddo->tipo;
						});
						if(empty($children)){
							$end_ddo[] = $ddo;
						}
					}

				// resolve processed data
					// get the process defined in properties
					$type_of_process = (isset($properties->process) && isset($properties->process->type))
						? $properties->process->type
						: 'default';

					switch ($type_of_process) {
						// get_data_uri is used to locate a specific uri in the component_iri, the component could have more than one uri (wikipedia, nomisma, etc..)
						// it select the correct value with the base uri (in the Entities Publication services) and the match it with the data of the component_iri
						case 'get_data_uri':
							$base_uri_entity = $properties->process->base_uri_entity;
							$base_uri_entity->title = ($base_uri_entity->title === 'self') ? $object_name : $base_uri_entity->title;
							$uri_data = $this->resolve_base_uri($base_uri_entity);

							$uri_finded = null;
							foreach ($ar_values as $current_uri) {
								foreach($current_uri->value as $uri){
									$find = strripos($uri->iri, $uri_data);
									if($find !== false){
										$uri_finded = $uri->iri;
										break 2;
									}
								}
							}

							if ($uri_finded) {
								$node_graph->addResource($object_name, $uri_finded);
								$result = true;
							}


							break;
						// resolve the component date and create the RDF equivalent
						case 'get_data_date':

							$get_date	= $properties->process->get_date;
							$format		= $properties->process->format;

							foreach ($ar_values as $current_date) {
								foreach ($current_date->value as $date_value) {

									$data = $date_value->{$get_date};
									foreach ($data as $key => $value) {

										$current_format = isset($format->{$key})
											? $format->{$key}
											: null;
										if ($current_format	) {
											$node_graph->add(
												$object_name,
												EasyRdf\Literal::create($value, null, $current_format)
											);
											$result = true;
										}
									}
								}
							}
							break;
						// resolve the portal creating a new resource in the graph and adding the data of the components inside,
						// if the components doesn't has data it will not create the link in the current_node
						case 'get_portal':
							// get the base uri for the new resource, id the uri is in the graph it will re-use the resource
							$base_uri_entity = $properties->process->base_uri_entity;
							$base_uri_entity->title = ($base_uri_entity->title === 'self') ? $object_name : $base_uri_entity->title;
							$uri_data = $this->resolve_base_uri($base_uri_entity);
							// resolve the id of the uri
							if(isset($properties->process->var_uri)){
								$var_uri = $this->resolve_var_uri($properties->process->var_uri , $section_tipo, $section_id);
								$uri = $uri_data . $var_uri;
							}else{
								$uri = $uri_data . $section_id;
							}
							// create the new resource (the $new_node_graph is the new graph used for recursive)
							$new_node_graph = $rdf_graph->resource($uri);
							// recursion, with the components children of the current term.
								$ar_owl_ObjectProperty	= RecordObj_dd::get_ar_childrens($ObjectProperty_tipo);
								$sub_node_graph = false;
								if(!empty($ar_owl_ObjectProperty)){
									foreach ($ar_owl_ObjectProperty as $current_ObjectProperty_tipo) {
										$sub_node_graph = $this->build_rdf_node($rdf_graph, $new_node_graph, $current_ObjectProperty_tipo, $section_tipo, $section_id);
										// assign to the node of the global graph the pointer only if the sub nodes has values
										if($sub_node_graph===true){
											$node_graph->addResource($object_name, $uri);
										}
									}
								}
							break;
						// resolve the link to other resources uri + section_id without language; as coins referred types uri.
						case 'get_resource_link':

							$base_uri_entity = $properties->process->base_uri_entity ?? null;
							$uri_data = '';
							if($base_uri_entity){
								$base_uri_entity->title = ($base_uri_entity->title === 'self') ? $object_name : $base_uri_entity->title;
								$uri_data = $this->resolve_base_uri($base_uri_entity);
							}
							foreach ($ar_values as $ddo_value) {
								// set the value to the graph if the ddo has value
								if(!empty($ddo_value->value)){
									$uri = $uri_data . $ddo_value->value;
									$node_graph->addResource($object_name, $uri);
									$result = true;
								}
							}
							break;
						// resolve the section_id without language
						case 'get_section_id':

							foreach ($ar_values as $ddo_value) {
								// set the value to the graph if the ddo has value
								if(!empty($ddo_value->value)){
									$node_graph->addLiteral($object_name, strip_tags($ddo_value->value));
									$result = true;
								}
							}
							break;
						// resolve numbers
						case 'get_data_number':
							$format		= $properties->process->format;
							foreach ($ar_values as $date_value) {

								$value = $date_value->value;
								$type = gettype($value);

								$current_format = isset($format->{$type})
									? $format->{$type}
									: null;
								if ($current_format	) {
									$node_graph->add(
										$object_name,
										EasyRdf\Literal::create($value, null, $current_format)
									);
									$result = true;
								}
							}
							break;
						// get specific uri
						case 'entity_publication_uri':
							// check if the title in the base_uril_entity is self and resolve it
							$base_uri_entity = $properties->process->base_uri_entity;
							$base_uri_entity->title = ($base_uri_entity->title === 'self') ? $object_name : $base_uri_entity->title;
							$uri_data = $this->resolve_base_uri($base_uri_entity);
							//resolve the uri id
							if(isset($propiedades->var_uri)){
								$var_uri = $this->resolve_var_uri($propiedades->var_uri , $section_tipo, $section_id);
								$uri = $uri_data . $var_uri;
							}else{
								$uri = $uri_data;
							}
							// create the graph of the class
							$node_graph = $rdf_graph->resource($uri, $object_name);
							break;
						// resolve the data can be used directly, text components.
						default:
							$ar_processed_ddo = [];
							foreach ($ar_langs as $current_lang) {
								// get the real data to use
								$ar_ddo_to_join = array_filter($ar_values, function($ddo) use($current_lang) {
									$ar_ddo = [];
									if($ddo->lang===$current_lang || $ddo->lang === null){
										$ar_ddo[] = $ddo;
									}

									return $ar_ddo;
								});

								// fallback to match with the end_ddo to add empty data values for languages:
								foreach ($end_ddo as $ddo_reference) {
									$children = array_find($ar_ddo_to_join, function($item) use($ddo_reference) {
										return $item->tipo===$ddo_reference->tipo;
									});
									// if the ddo not exist (doesn't have value in the language)
									if(empty($children)){
										// add id
										$current_id = isset($ddo_reference->id)
											? $ddo_reference->id
											: null;
										// get the value of the main language
										$fallback_value = array_find($ar_values, function($item) use($default_alpha2_lang, $current_id) {
											return $item->lang===$default_alpha2_lang && $item->id === $current_id;
										});
										// if empty the main language add empty text
										$current_value = $fallback_value
											? $fallback_value->value
											: '';
										// create the ddo and save with the array of values to be joined
										$fallback_ddo = new stdClass();
											$fallback_ddo->tipo		= $ddo_reference->tipo;
											$fallback_ddo->id		= $current_id;
											$fallback_ddo->lang		= $current_lang;
											$fallback_ddo->value	= $current_value;

											$ar_ddo_to_join[] = $fallback_ddo;
									}
								}

								// check if the process has text_format
								if(isset($properties->process) && isset($properties->process->text_format)){

									$text_format = $properties->process->text_format;
									// replace the text template with the data ex: "${a}, ${b}, ${c}/${d}"
									foreach ($ar_ddo_to_join as $current_ddo_to_join) {
										$search			= '${'.$current_ddo_to_join->id.'}';
										$replace_value	= $current_ddo_to_join->value;
										$text_format	= str_replace($search, $replace_value, $text_format);
									}
									// create the ddo
									$procesed_ddo = new stdClass();
										$procesed_ddo->lang		= $current_lang;
										$procesed_ddo->value	= $text_format;

										$ar_processed_ddo[] = $procesed_ddo;

								} // check if the process has formula
								else if(isset($properties->process) && isset($properties->process->php_formula)){
									$php_formula = $properties->process->php_formula;
									$type = $php_formula->type ?? 'default';
									$formula_result = '';

									switch ($type) {
										case 'empty':
											$sentence = $php_formula->sentence;
											// replace the formula template with the data, ex: "${a} ? ${b} : ${c}"
											foreach ($ar_ddo_to_join as $current_ddo_to_join) {
												$search			= '${'.$current_ddo_to_join->id.'}';
												$replace_value	= $current_ddo_to_join->value ?? ' ';
												$sentence		= str_replace($search, $replace_value, $sentence);
											}
											$ar_parts	= explode(' ? ', $sentence);
											$ar_parts2	= explode(' : ', $ar_parts[1]);

											$formula_result = empty($ar_parts[0]) ? $ar_parts2[0] : $ar_parts2[1];
											break;

										default:
											break;
									}
									// create the new ddo
									$procesed_ddo = new stdClass();
										$procesed_ddo->lang		= $current_lang;
										$procesed_ddo->value	= $formula_result;

										$ar_processed_ddo[] = $procesed_ddo;

								}// if not has text_fotmat or formula we join the data with ", "
								else{
									// create an array to store all ddo data
									$current_value = [];
									foreach ($ar_ddo_to_join as $current_ddo_to_join) {
										$current_value[] =  $current_ddo_to_join->value;
									}
									// create the ddo
									$procesed_ddo = new stdClass();
										$procesed_ddo->lang		= $current_lang;
										$procesed_ddo->value	= implode(', ', $current_value);

										$ar_processed_ddo[] = $procesed_ddo;

								}
							}
							foreach ($ar_processed_ddo as $ddo_value) {
								// set the value to the graph if the ddo has value
								if(!empty($ddo_value->value)){
									$node_graph->addLiteral($object_name, strip_tags($ddo_value->value), $ddo_value->lang);
									$result = true;
								}
							}
							break;
					}
				break;
		}

		return $result;
	}//end build_rdf_node


	/**
	* GET_DDO_MAP_VALUE
	* resolve the ddo_map components
	* @return
	*/
	public function get_ddo_map_value($ddo_map, $parent, $section_tipo, $section_id) {

		$ar_values = [];
		$children = array_filter($ddo_map, function($item) use($parent) {
			return $item->parent===$parent;
		});

		foreach ($children as $ddo) {
			$result		= $this->get_ddo_value($ddo, $ddo_map, $section_tipo, $section_id);
			$ar_values	= array_merge($ar_values, $result);
		}

		return $ar_values;
	}//end get_ddo_map_value


	/**
	* GET_DDO_VALUE
	* resolve the ddo values
	* @return
	*/
	public function get_ddo_value($ddo, $ddo_map, $section_tipo, $section_id) {

		$ar_values	= [];
		$current_tipo	= $ddo->tipo;
		$model_name		= RecordObj_dd::get_modelo_name_by_tipo($current_tipo);

		if($model_name === 'relation_list'){

			$element		= new relation_list( $current_tipo,
												 $section_id,
												 $section_tipo,
												 'list',);

		}else{
			$element		= component_common::get_instance($model_name,
															 $current_tipo,
															 $section_id,
															 'list',
															 DEDALO_DATA_LANG,
															 $section_tipo);
		}
		$parent = $ddo->tipo;

		$children = array_filter($ddo_map, function($item) use($parent) {
			return $item->parent===$parent;
		});

		if(empty($children)){

			$id			= $ddo->id ?? null;
			$value_fn	= $ddo->value_fn ?? 'get_diffusion_value';

			if($model_name === 'relation_list'){
				$diffusion_properties		= $ddo->diffusion_properties;
				$element->set_diffusion_properties($diffusion_properties);

				$value		= $element->get_diffusion_dato();

				$config_properties = $ddo->config ?? null;
				if($config_properties){
					$config = $this->resolve_configuration($config_properties);
					$result = $this->{$config_properties->process_fn}((object)[
						'config_properties'	=> $config_properties,
						'config'			=> $config,
						'value'				=> $value
					]);
					$ar_values = $result;
				}else{

					foreach ($value as $value) {
						$ddo_value = new stdClass();
							$ddo_value->tipo	= $ddo->tipo;
							$ddo_value->lang	= null;
							$ddo_value->value	= $value->section_id;
							$ddo_value->id		= $id;

						$ar_values[] = $ddo_value;
					}
				}
			}elseif($model_name === 'component_section_id'){

				$ddo_value = new stdClass();
					$ddo_value->tipo	= $ddo->tipo;
					$ddo_value->lang	= null;
					$ddo_value->value	= $section_id;
					$ddo_value->id		= $id;

				$ar_values[] = $ddo_value;
			}elseif($model_name === 'component_image'){
				$quality		= $ddo->fn_params->quality ?? '1.5MB';
				$test_file		= $ddo->fn_params->test_file ?? false;
				$absolute		= $ddo->fn_params->absolute ?? false;
				$default_add	= $ddo->fn_params->default_add ?? false;

				$value		= $element->get_image_url($quality, $test_file, $absolute, $default_add);

				$ddo_value = new stdClass();
					$ddo_value->tipo	= $ddo->tipo;
					$ddo_value->lang	= null;
					$ddo_value->value	= $value;
					$ddo_value->id		= $id;

				$ar_values[] = $ddo_value;
			}elseif(in_array($model_name, component_relation_common::get_components_with_relations())){

				$value		= $element->{$value_fn}();

				$ddo_value = new stdClass();
					$ddo_value->tipo	= $ddo->tipo;
					$ddo_value->lang	= null;
					$ddo_value->value	= $value;
					$ddo_value->id		= $id;

				$ar_values[] = $ddo_value;
			}else{
				$dato_full	= $element->get_dato_full();
				if(!empty($dato_full)){
					foreach ($dato_full as $current_lang => $value) {
						if(!empty($value)){
							$element->set_lang($current_lang);
							$lang	= lang::get_alpha2_from_code($current_lang);
							$value	= $element->{$value_fn}($current_lang);

							$ddo_value = new stdClass();
								$ddo_value->tipo	= $ddo->tipo;
								$ddo_value->lang	= $lang;
								$ddo_value->value	= $value;
								$ddo_value->id		= $id;

							$ar_values[] = $ddo_value;
						}
					}
				}
			}
		}else{
			$ar_locators = $element->get_dato();
			foreach ($ar_locators as $current_locator) {
				$result = $this->get_ddo_map_value($ddo_map, $parent, $current_locator->section_tipo, $current_locator->section_id);
				$ar_values	= array_merge($ar_values, $result);
			}
		}

		return $ar_values;
	}//end get_ddo_value

	/**
	* RESOLVE_ENTITY
	* Resolve the section of publication services (dd1010) of the entity that has the URL base resolutions.
	* @return locator $entity_locator
	*/
	public function resolve_entity_locator() {

		$entity_locator = new locator();

		// Search Dedalo entities publication services
			$section_tipo	= DEDALO_SERVICES_SECTION_TIPO; 	// services_section_tipo = 'dd1010';
			$entity_id		= DEDALO_ENTITY_ID; // Config DEDALO_ENTITY_ID
			$service_type 	= $this->service_type; // setting in the diffusion_element

		// query object
			$query = '
			{
				"id": "base_uri",
				"modo": "list",
				"section_tipo": "'.$section_tipo.'",
				"limit": 1,
				"filter": {
					"$and": [
						{
							"q": "{\"section_id\":\"'.$entity_id.'\",\"section_tipo\":\"dd1000\",\"from_component_tipo\":\"dd1016\",\"type\":\"dd151\"}",
							"q_operator": null,
							"path": [
								{
									"section_tipo": "'.$section_tipo.'",
									"component_tipo": "dd1016",
									"modelo": "component_select",
									"name": "Entity"
								}
							]
						},
						{
							"q": "{\"section_id\":\"'.$service_type.'\",\"section_tipo\":\"dd1020\",\"from_component_tipo\":\"dd1037\",\"type\":\"dd151\"}",
							"q_operator": null,
							"path": [
								{
									"section_tipo": "'.$section_tipo.'",
									"component_tipo": "dd1037",
									"modelo": "component_select",
									"name": "Name"
								}
							]
						}
					]
				}
			}';
			$search_query_object = json_decode($query);


		// search
			$search_development2	= new search_development2($search_query_object);
			$result					= $search_development2->search();
			$dato_entity			= reset($result->ar_records);

		// base_uri
			if (empty($dato_entity)) {

				$entity_locator = null;
				debug_log(__METHOD__." Empty records!  Nothing is found for entity: '$entity_id' and service_name: '$service_name' ".to_string(), logger::ERROR);

			}else{
				$entity_locator->set_section_id($dato_entity->section_id);
				$entity_locator->set_section_tipo($dato_entity->section_tipo);
			}

		return $entity_locator;
	}//end resolve_entity_locator


	/**
	* RESOLVE_BASE_URI
	* get the base uri to used to create the RDF id
	* normally the base_uri is used to assign the links to the publication resource in the public web
	* it's stored in the Publication services section (dd1010) in the component_iri
	* @return string $base_uri
	*/
	public function resolve_base_uri($base_uri_entity, $section_id=null) {

		// Search Dedalo entities publication services
			$section_tipo 			= $base_uri_entity->section_tipo; 	// services_section_tipo = 'dd1010';
			$title 					= $base_uri_entity->title;
			$component_tipo 		= $base_uri_entity->component_tipo; // component_iri dd1014

			if ($section_tipo===DEDALO_SERVICES_SECTION_TIPO) {

				$service_name	= $this->service_name;

				$RecordObj_dd = new RecordObj_dd($component_tipo);
				$model = $RecordObj_dd->get_modelo_name();

				// RecordObj_dd::get_modelo_name_by_tipo($component_tipo);
				$component_lang = $RecordObj_dd->get_traducible();
				$lang = $component_lang === 'si' ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
				$component = component_common::get_instance($model,
															 $component_tipo,
															 $this->entity_locator->section_id,
															 'list',
															 $lang,
															 $this->entity_locator->section_tipo);

				$iri_object_data = $component->get_dato();
				// $row_data =  json_decode($row->datos);
				// $iri_object_data = $row_data->components->{$component_tipo};

				$ar_result 		 = array_filter((array)$iri_object_data, function($item) use($title){
					return $item->title === $title;
				});

				$result 	= reset($ar_result);
				$base_uri 	= !empty($result->iri) ? $result->iri : null;


			}else{
				// Case search in public entity section

				// Collection (Entity)

					$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($base_uri_entity->from_component_tipo,true);
					$component 		= component_common::get_instance($modelo_name,
														$base_uri_entity->from_component_tipo,
														$section_id,
														'list',
														DEDALO_DATA_NOLAN,
														$base_uri_entity->from_section_tipo);
					$dato_entity = $component->get_dato();

					if (!empty($dato_entity)) {
						// component load
						$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
						$component 		= component_common::get_instance($modelo_name,
															$component_tipo,
															$dato_entity[0]->section_id,
															'list',
															DEDALO_DATA_NOLAN,
															$section_tipo);
						$dato = $component->get_dato();
					}

				// base_uri
					if (empty($dato)) {

						$base_uri = null;
						debug_log(__METHOD__." Empty dato!  Nothing is found for section_id: '$section_id' - section_tipo: '$section_tipo' - component_tipo: ".to_string($component_tipo), logger::ERROR);

					}else{

						$iri_object_data = (array)$dato;
						$ar_result 		 = array_filter((array)$iri_object_data, function($item) use($title){
							return isset($item->title) && $item->title===$title;
						});

						$base_uri = isset($ar_result[0]) ? $ar_result[0]->iri : null;
					}
			}
			#dump($base_uri, ' base_uri ++ '.to_string());
		return $base_uri;
	}//end resolve_base_uri


	/**
	* RESOLVE_VAR_URI
	* resolve the specific id for the uri, it could be a section_id, or the data in one component
	* @return
	*/
	public function resolve_var_uri($var_uri , $section_tipo, $section_id) {

		$var_uri  = $var_uri ?? [];

		$var_uri_string='';
		foreach((array)$var_uri as $key => $component_tipo) {

			if ($key==='#') {

				$value = $component_tipo;
				if (substr($var_uri_string, -1)==='&' ) {
					$var_uri_string = substr($var_uri_string, 0, -1);
				}
				$var_uri_string .= $value;

			}else{

				# Resolve value
				$ct_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				if ($ct_modelo_name==='component_section_id') {
					$value = $section_id;
				}else{
					$ct_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
					$component_obj 	 = component_common::get_instance(	$ct_modelo_name,
																		$component_tipo,
																		$section_id,
																		'list',
																		DEDALO_DATA_LANG,
																		$section_tipo,
																		false);
					$dato = $component_obj->get_valor();
						#dump($dato, ' dato ++ '.to_string( $ct_modelo_name ));
					$value = $dato;
				}
				#$var_uri_string .= "$key=$value";

				$var_uri_string .= $value; // Rewrite version


			}

			// $var_uri_string .= ($component_tipo!=end($var_uri)) ? '&' : '';
		}

		return $var_uri_string;
	}//end resolve_var_uri


	/**
	* RESOLVE_configuration
	* get the config to used in specific ddo
	* filter section_id for use to get data
	* it's stored in the Publication services section (dd1010) in the component_json
	* @return string $base_uri
	*/
	public function resolve_configuration($configuration_entity, $section_id=null) {

		// Search Dedalo entities publication services
			$section_tipo	= $configuration_entity->section_tipo; 	// services_section_tipo = 'dd1010';
			$title			= $configuration_entity->title;
			$component_tipo	= $configuration_entity->component_tipo; // component_iri dd1014
			$id				= $configuration_entity->id; // catalog_filter

			if ($section_tipo===DEDALO_SERVICES_SECTION_TIPO) {

				$service_name	= $this->service_name;

				$RecordObj_dd = new RecordObj_dd($component_tipo);
				$model = $RecordObj_dd->get_modelo_name();

				// RecordObj_dd::get_modelo_name_by_tipo($component_tipo);
				$component_lang = $RecordObj_dd->get_traducible();
				$lang = $component_lang === 'si' ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
				$component = component_common::get_instance($model,
															 $component_tipo,
															 $this->entity_locator->section_id,
															 'list',
															 $lang,
															 $this->entity_locator->section_tipo);

				$config_dato = $component->get_dato();
				// $row_data =  json_decode($row->datos);
				// $iri_object_data = $row_data->components->{$component_tipo};
				if (empty($config_dato)) {

						$config = null;
						debug_log(__METHOD__." Empty dato!  Nothing is found for section_id: '$section_id' - section_tipo: '$section_tipo' - component_tipo: ".to_string($component_tipo), logger::ERROR);

				}else{

					$config = !empty($config_dato->{$title}) ? $config_dato->{$title} : null;

					$ar_result 		 = array_filter((array)$config, function($item) use($id){
						return $item->id === $id;
					});
					$result 	= reset($ar_result);
				}

			}else{
				// Case search in public entity section

				// Collection (Entity)

					$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($configuration_entity->from_component_tipo,true);
					$component 		= component_common::get_instance($modelo_name,
														$configuration_entity->from_component_tipo,
														$section_id,
														'list',
														DEDALO_DATA_NOLAN,
														$configuration_entity->from_section_tipo);
					$dato_entity = $component->get_dato();

					if (!empty($dato_entity)) {
						// component load
						$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
						$component 		= component_common::get_instance($modelo_name,
															$component_tipo,
															$dato_entity[0]->section_id,
															'list',
															DEDALO_DATA_NOLAN,
															$section_tipo);
						$config_dato = $component->get_dato();
					}

				// config
					if (empty($config_dato)) {

						$config = null;
						debug_log(__METHOD__." Empty dato!  Nothing is found for section_id: '$section_id' - section_tipo: '$section_tipo' - component_tipo: ".to_string($component_tipo), logger::ERROR);

					}else{

						$config = !empty($config_dato->{$title}) ? $config_dato->{$title} : null;
						$ar_result 		 = array_filter((array)$config, function($item) use($id){
							return $item->id === $id;
						});
						$result 	= reset($ar_result);
					}

			}
			#dump($config, ' config ++ '.to_string());
		return $result;
	}//end resolve_configuration


	/**
	* GET_DIFFUSION_SECTIONS_FROM_DIFFUSION_ELEMENT
	* Used to determine when show publication button in sections
	* @return array $ar_diffusion_sections
	*/
	public static function get_diffusion_sections_from_diffusion_element($diffusion_element_tipo) {

		$ar_diffusion_sections = array();

		# xml elements
		$elements = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_element_tipo, 'owl:Class', 'children', true);
		foreach ($elements as $current_element_tipo) {

			# Pointer to section
			$ar_related = common::get_ar_related_by_model('section', $current_element_tipo);

			if (isset($ar_related[0])) {
				$ar_diffusion_sections[] = $ar_related[0];
			}
		}


		return $ar_diffusion_sections;
	}//end get_diffusion_sections_from_diffusion_element


	/**
	* DIFFUSION_COMPLETE_DUMP
	* @return
	*/
	public function diffusion_complete_dump($diffusion_element, $resolve_references = true) {

		// Working here
		debug_log(__METHOD__." Called unfinished class. Nothing is done ".to_string(), logger::DEBUG);
	}//end diffusion_complete_dump


	/**
	* GET_DIFFUSION_ELEMENT_TABLES_MAP
	* @return
	*/
	public function get_diffusion_element_tables_map() {

		$diffusion_element_tables_map = new stdClass();

		# Working here

		return $diffusion_element_tables_map;
	}//end get_diffusion_element_tables_map


	/**
	* GET_to_publish_ROWS
	* @return array $ar_section_id_clean
	*/
	public static function get_to_publish_rows($section_tipo, $ar_section_id) {

		# Resolve component_publication_tipo
		$component_publication_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, ['component_publication'], $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true);
		$component_section_id_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, ['component_section_id'], $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true);


	        $q = implode(',', (array)$ar_section_id);

        // query
			$query = '
			{
			    "id": "numisdata4_list",
			    "section_tipo": "'.$section_tipo.'",
			    "limit": false,
			    "filter": {
			        "$and": [
			            {
			                "q": "'.$q.'",
			                "q_operator": null,
			                "path": [
			                    {
			                        "section_tipo": "'.$section_tipo.'",
			                        "component_tipo": "'.reset($component_section_id_tipo).'",
			                        "modelo": "component_section_id",
			                        "name": "ID"
			                    }
			                ]
			            },
			            {
			                "q": "{\"section_id\":\"1\",\"section_tipo\":\"dd64\",\"type\":\"dd151\",\"from_component_tipo\":\"'.reset($component_publication_tipo).'\"}",
			                "q_operator": null,
			                "path": [
			                    {
			                        "section_tipo": "'.$section_tipo.'",
			                        "component_tipo": "'.reset($component_publication_tipo).'",
			                        "modelo": "component_publication",
			                        "name": "Publish"
			                    }
			                ]
			            }
			        ]
			    }
			}';
			$search_query_object = json_decode($query);
			#dump($query, 'search_query_object ++ '.json_encode($search_query_object, JSON_PRETTY_PRINT));

		// search
			$search_development2 = new search_development2($search_query_object);
			$result 			 = $search_development2->search();
			$ar_records 		 = $result->ar_records;

		// format output as array of id's
			$ar_section_id_clean = array_map(function($item){
				return $item->section_id;
			}, (array)$ar_records);


		return (array)$ar_section_id_clean;
	}//end get_to_publish_rows


	/**
	* FILTER_LOCATORS
	* @return
	*/
	public function filter_locators($options) {

		$value				= $options->value;
		$config				= $options->config;
		$config_properties	= $options->config_properties;

		$section_tipo = reset($value)->section_tipo;
		$ar_section_id = [];
		foreach ($value as $current_locator) {
			$ar_section_id[] = $current_locator->section_id;
		}
		$section_id		= implode(',', $ar_section_id);
		$filter_json	= $config->filter ?? '';
		$filter			= json_encode($filter_json);
		$ddo_map		= $config_properties->result->ddo_map ?? null;

		foreach ($ddo_map as $ddo) {
			$ddo->section_tipo	= $ddo->section_tipo === 'self' ? $section_tipo : $ddo->section_tipo;
			$ddo->parent		= $ddo->parent === 'self' ? $section_tipo : $ddo->parent;
		}

		$query = '
			{
				"id": "filter",
				"modo": "list",
				"section_tipo": "'.$section_tipo.'",
				"limit": 1,
				"filter": {
					"$and": [
						{
							"q": "'.$section_id.'",
							"q_operator": null,
							"path": [
								{
									"section_tipo": "'.$section_tipo.'",
									"component_tipo": "component_section_id",
                        			"modelo": "component_section_id",
									"name": "Id"
								}
							]
						},
						'.$filter.'
					]
				}
			}';
			$search_query_object = json_decode($query);


		// search
			$search_development2	= new search_development2($search_query_object);
			$search_result			= $search_development2->search();
			$records				= $search_result->ar_records;

		// result
			$result = [];
			foreach ($records as $record) {
					$section_id = $record->section_id;
					$section_tipo = $record->section_tipo;

					$result = array_merge($result, $this->get_ddo_map_value($ddo_map, $parent=$section_tipo, $section_tipo, $section_id));
			}

			return $result;
	}//end filter_locators























}//end class

