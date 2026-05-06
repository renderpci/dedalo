<?php declare(strict_types=1);
/**
* CLASS RELATION_LIST
* Manage the relations of the sections
* build the list of the relations between sections
*/
class relation_list extends common {



	/**
	* CLASS VARS
	*/

		/**
		 * Search Query Object defining the filter and pagination for relation lookups.
		 * Determines which related records are retrieved and how they are sorted.
		 * @var ?object $sqo
		 */
		public ?object $sqo = null;

		/**
		 * Total count of relations matching the current query.
		 * Populated during get_data() to enable pagination controls.
		 * @var ?int $count
		 */
		public ?int $count = null;

		/**
		 * Diffusion properties object controlling how relations are exported/published.
		 * Defines mapping rules for relation output formats in diffusion endpoints.
		 * @var ?object $diffusion_properties
		 */
		public ?object $diffusion_properties = null;

		/**
		 * Static cache for diffusion dato (raw relation data) to avoid repeated processing.
		 * Stores parsed relation data for reuse across diffusion operations.
		 * @var array $diffusion_dato_cache
		 */
		public static array $diffusion_dato_cache = [];

		/**
		 * Static cache for diffusion values (formatted relation strings) to optimize exports.
		 * Prevents re-formatting the same relation data multiple times.
		 * @var array $diffusion_value_cache
		 */
		public static array $diffusion_value_cache = [];

		/**
		 * Optional filter to limit which section tipos are returned in relation results.
		 * Applied to the SQO in get_data() to restrict the scope of related sections.
		 * @var ?array $section_filter
		 */
		protected ?array $section_filter = null;

		/**
		 * Optional filter to limit which component tipos are included in filter_by_locators.
		 * Restricts relations based on the originating component tipo.
		 * @var ?array $component_filter
		 */
		protected ?array $component_filter = null;




	/**
	* SET_SECTION_FILTER
	* Sets the section filter to limit which section tipos are returned in relation results.
	* @param ?array $section_filter
	* @return static
	*/
	public function set_section_filter(?array $section_filter) : static {
		$this->section_filter = $section_filter;
		return $this;
	}



	/**
	* SET_COMPONENT_FILTER
	* Sets the section filter to limit which section tipos are returned in relation results.
	* @param ?array $component_filter
	* @return static
	*/
	public function set_component_filter(?array $component_filter) : static {
		$this->component_filter = $component_filter;
		return $this;
	}



	/**
	* CONSTRUCT
	*
	*/
	public function __construct(string $tipo, $section_id, string $section_tipo, string $mode='list') {

		$this->tipo			= $tipo;
		$this->section_id	= $section_id;
		$this->section_tipo	= $section_tipo;
		$this->mode			= $mode;
	}//end __construct



	/**
	* GET_INVERSE_REFERENCES
	* Get calculated inverse locators for all matrix tables
	* @see search::calculate_inverse_locator
	* @return array $inverse_locators
	*/
	public function get_inverse_references(object $sqo) : array {

		// sections
		$sections = sections::get_instance(null, $sqo, $this->section_tipo, $this->mode);
		$db_result = $sections->get_data();

		$inverse_sections = $db_result->fetch_all();


		return $inverse_sections;
	}//end get_inverse_references



	/**
	* GET_RELATION_LIST_OBJ
	*
	* @param array $ar_inverse_references
	* @return object $json
	*/
	public function get_relation_list_obj(array $ar_inverse_references) : object {

		$json		= new stdClass;
		$ar_context	= [];
		$ar_data	= [];

		$sections_related		= [];
		$ar_relation_components	= [];
		# loop the locators that call to the section
		foreach ($ar_inverse_references as $current_record) {

			$current_section_tipo = $current_record->section_tipo;

			# 1 get the @context
			if (!in_array($current_section_tipo, $sections_related )){

				$sections_related[] =$current_section_tipo;

				//get the id
				$current_id = new stdClass;
					$current_id->section_tipo		= $current_section_tipo;
					$current_id->section_label		= ontology_node::get_term_by_tipo($current_section_tipo,DEDALO_APPLICATION_LANG, true);
					$current_id->component_tipo		= 'id';
					$current_id->component_label	= 'id';

					$ar_context[] = $current_id;

				//get the columns of the @context
				$ar_model_name_required	= array('relation_list');
				$resolve_virtual		= false;

				// Locate relation_list element in current section (virtual or not)
				$ar_children = section::get_ar_children_tipo_by_model_name_in_section($current_section_tipo, $ar_model_name_required, $from_cache=true, $resolve_virtual, $recursive=false, $search_exact=true);

				// If not found children, try resolving real section
				if (empty($ar_children)) {
					$resolve_virtual = true;
					$ar_children = section::get_ar_children_tipo_by_model_name_in_section($current_section_tipo, $ar_model_name_required, $from_cache=true, $resolve_virtual, $recursive=false, $search_exact=true);
				}// end if (empty($ar_children))


				if( isset($ar_children[0]) ) {
					$current_children	= reset($ar_children);
					$ontology_node		= ontology_node::get_instance($current_children);
					$ar_relation_components[$current_section_tipo] = $ontology_node->get_relations();
					if(isset($ar_relation_components[$current_section_tipo])){
						foreach ($ar_relation_components[$current_section_tipo] as $current_relation_component) {
							foreach ($current_relation_component as $tipo) {

								$current_relation_list = new stdClass;
									$current_relation_list->section_tipo	= $current_section_tipo;
									$current_relation_list->section_label	= ontology_node::get_term_by_tipo($current_section_tipo,DEDALO_APPLICATION_LANG, true);
									$current_relation_list->component_tipo	= $tipo;
									$current_relation_list->component_label	= ontology_node::get_term_by_tipo($tipo, DEDALO_APPLICATION_LANG, true);

								$ar_context[] = $current_relation_list;
							}
						}
					}
				}

			}// end if (!in_array($current_section_tipo, $sections_related )

			# 2 get ar_data
			$ar_components = $ar_relation_components[$current_section_tipo] ?? [];
			if (empty($ar_components)) {
				debug_log(__METHOD__
					." Section without relation_list. Please, define relation_list for section: $current_section_tipo "
					, logger::WARNING
				);
			}
			$ar_data_result = $this->get_ar_data($current_record, $ar_components);
			$ar_data = [...$ar_data, ...$ar_data_result];
		}// end foreach

		// $context = 'context';
		$json->context	= $ar_context;
		$json->data		= $ar_data;

		return $json;
	}//get_relation_list_obj



	/**
	* GET_AR_DATA
	* @param object $current_record
	* @param array $ar_components
	* @return array $data
	*/
	public function get_ar_data(object $current_record, array $ar_components) : array {

		$data = [];

		$section_tipo	= $current_record->section_tipo;
		$section_id		= $current_record->section_id;

		// section instance
			$section = section::get_instance(
				$section_tipo,
				$this->mode,
				true // cache
			);
		// inject dato to section when the dato come from db and set as loaded
			$datos = $current_record->datos ?? null;
			if (!is_null($datos)) {
				$section->set_dato($datos);
			}

		$current_id = new stdClass;
			$current_id->section_tipo	= $section_tipo;
			$current_id->section_id		= $section_id;
			$current_id->component_tipo	= 'id';

		$data[] = $current_id;

		if(!empty($ar_components)){
			foreach ($ar_components as $current_relation_component) {
				foreach ($current_relation_component as $modelo => $tipo) {
					// $model_name		= ontology_node::get_model_by_tipo($modelo, true);
					$model_name			= ontology_node::get_model_by_tipo($tipo, true);
					$current_component	= component_common::get_instance(
						$model_name,
						$tipo,
						$section_id,
						'list',
						DEDALO_DATA_LANG,
						$section_tipo
					);
					// $value = $current_component->get_valor();
					$value = $current_component->get_value();

					$component_object = new stdClass;
						$component_object->section_tipo		= $section_tipo;
						$component_object->section_id 		= $section_id;
						$component_object->component_tipo	= $tipo;
						$component_object->value 			= $value;

					$data[] = $component_object;
				}
			}
		}

		return $data;
	}//end get_data



	/**
	* GET_JSON
	* @param object|null $request_options = null
	* 	Optional. Default is false
	* @return object $json
	*	Object with data and context (configurable) like:
	* {
	* 	context : [...],
	* 	data : [...]
	* }
	*/
	public function get_json( ?object $request_options=null ) : object {

		$path = DEDALO_CORE_PATH .'/'. get_called_class() .'/'. get_called_class() .'_json.php';

		// controller include
			$json = include( $path );

		return $json;
	}//end get_json



	/**
	* GET_DIFFUSION_DATO
	* Calculates the diffusion dato of current relation_list using inverse locators
	* @see numisdata1021 (relations_coins) or 'dmmgobes28' (graves_data)
	* @return array $ar_values
	*/
	public function get_diffusion_dato() : array {

		// Properties of diffusion element that references this component
		// (!) Note that is possible overwrite real component properties injecting properties from diffusion (see diffusion_sql::resolve_value)
		// 	  This is useful to change the 'data_to_be_used' param of target component (indirectly)
		// sample v5 properties:
		// {
		//   "data_to_be_used": "dato",
		//   "process_dato_arguments": {
		//     "filter_section": ["dmm480"]
		//   }
		// }
		$diffusion_properties	= $this->get_diffusion_properties();
		$process_dato_arguments	= isset($diffusion_properties->process_dato_arguments)
			? $diffusion_properties->process_dato_arguments
			: null;

		$process_dato_arguments_key = !empty($process_dato_arguments)
			? json_encode($process_dato_arguments)
			: '';

		$filter_section = isset($process_dato_arguments->filter_section)
			? (array)$process_dato_arguments->filter_section
			: null;

		$filter_component = isset($process_dato_arguments->filter_component)
			? (array)$process_dato_arguments->filter_component
			: null;

		// cache
			$cache_key = $this->tipo.'_'.$this->section_tipo.'_'.$this->section_id.'_'.$process_dato_arguments_key.'_'.to_string($filter_section).'_'.to_string($filter_component);
			if (isset(self::$diffusion_dato_cache[$cache_key])) {
				return self::$diffusion_dato_cache[$cache_key];
			}

		// sqo . Common used to get inverse locators
			$sqo = new search_query_object();
				$sqo->set_section_tipo(['all']);
				$sqo->set_mode('related');
				$sqo->set_limit(null);
				$sqo->set_offset(0);

				// Create filter locator
				$filter_locator = new locator();
					$filter_locator->set_section_tipo($this->section_tipo);
					$filter_locator->set_section_id($this->section_id);

				$sqo->set_filter_by_locators([$filter_locator]);

		// inverse_references
			$ar_inverse_references = $this->get_inverse_references($sqo);
				// sample. Full section dato
				// {
				//     "section_tipo": "numisdata300",
				//     "section_id": "1",
				//     "datos": {
				//         "label": "Catálogo",
				//         "relations": [
				//             {
				//                 "type": "dd675",
				//                 "section_id": "1",
				//                 "section_tipo": "dd153",
				//                 "from_component_tipo": "numisdata304"
				//             }, ...
				//          ]
				//     }
				// }

		// clean references as locators that point here (this section_tipo, this section_id)
			$ar_locators = [];
			foreach ($ar_inverse_references as $section_dato) {
				if (isset($section_dato->datos->relations)) {
					foreach ($section_dato->datos->relations as $current_locator) {
						if ($current_locator->section_tipo===$this->section_tipo && $current_locator->section_id==$this->section_id) {
							// add modified version
							$pseudo_locator = new stdClass();
								// same data
								$pseudo_locator->section_tipo			= $current_locator->section_tipo;
								$pseudo_locator->section_id				= $current_locator->section_id;
								$pseudo_locator->from_component_tipo	= $current_locator->from_component_tipo;
								// add useful data
								$pseudo_locator->from_section_tipo		= $section_dato->section_tipo;
								$pseudo_locator->from_section_id		= $section_dato->section_id;

							$ar_locators[] = $pseudo_locator;
						}
					}
				}
			}

		$ar_values = [];
		foreach ($ar_locators as $current_locator) {

			// filter_section
				if (!empty($filter_section)) {
					if (!in_array($current_locator->from_section_tipo, $filter_section)) {
						continue;
					}
				}

			// filter_component
				if (!empty($filter_component)) {
					if (!in_array($current_locator->from_component_tipo, $filter_component)) {
						continue;
					}
				}

			// locator restored from inverse
				$locator = new locator();
					$locator->set_section_tipo($current_locator->from_section_tipo);
					$locator->set_section_id($current_locator->from_section_id);

			// Check target is publishable
				$current_is_publicable = diffusion::get_is_publicable($locator);
				if ($current_is_publicable!==true) {
					// debug_log(__METHOD__." + Skipped locator not publishable: ".to_string($locator), logger::DEBUG);
					continue;
				}

			// value. Default is locator. To override it, set:  diffusion_properties->process_dato_arguments->format
				$value = (isset($process_dato_arguments->format))
					? (function($locator, $format) {
						switch ($format) {
							case 'section_id':
								return $locator->section_id;
								break;
							default:
								# code...
								break;
						}
						return $locator;
					  })($locator, $process_dato_arguments->format)
					: $locator;// default is built locator


			$ar_values[] = $value;
		}//end foreach ($ar_locators as $current_locator)

		// cache
			self::$diffusion_dato_cache[$cache_key] = $ar_values;


		return $ar_values;
	}//end get_diffusion_dato



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a MySQL field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @see class.diffusion_mysql.php
	* @param string|null $lang = null
	* @return array|string|null $diffusion_value
	*/
	public function get_diffusion_value( ?string $lang=null ) {

		$diffusion_value = null;

		// properties of diffusion element that references this component
			// (!) Note that is possible overwrite real component properties injecting properties from diffusion (see diffusion_sql::resolve_value)
			// This is useful to change the 'data_to_be_used' param of target component (indirectly)
			$diffusion_properties = $this->get_diffusion_properties();

		// data_to_be_used
			$data_to_be_used = isset($diffusion_properties->data_to_be_used)
				? $diffusion_properties->data_to_be_used
				: 'dato';
			// overwrite data_to_be_used
			if (isset($diffusion_properties->process_dato_arguments) && isset($diffusion_properties->process_dato_arguments->data_to_be_used)) {
				$data_to_be_used = $diffusion_properties->process_dato_arguments->data_to_be_used;
			}

		$diffusion_properties_key = !empty($diffusion_properties)
			? json_encode($diffusion_properties)
			: '';

		// cache

			$cache_key = $this->tipo.'_'.$this->section_tipo.'_'.$this->section_id.'_'.$data_to_be_used.'_'.$diffusion_properties_key;
			if (isset(self::$diffusion_value_cache[$cache_key])) {
				return self::$diffusion_value_cache[$cache_key];
			}

		// sqo
		$sqo_data = (object)[
			'section_tipo'			=> ['all'],
			'mode'					=> 'related',
			'limit'					=> false,
			'offset'				=> 0,
			'filter_by_locators'	=> [
				(object)[
					'section_tipo'	=> $this->section_tipo,
					'section_id'	=> $this->section_id
				]
			]
		];
		$sqo = new search_query_object($sqo_data);

		switch ($data_to_be_used) {

			case 'custom':
				// see sample at: qdp341, mdcat4338
				$ar_values = [];

				$custom_map = $diffusion_properties->process_dato_arguments->custom_map;

				// ar_inverse_references
				// $ar_inverse_references = $this->get_inverse_references($sqo);
				$ar_inverse_references = array_map(function($row){
					return (object)[
						'section_tipo'	=> $row->section_tipo,
						'section_id'	=> $row->section_id
					];
				}, $this->get_inverse_references($sqo));

				// foreach ($ar_inverse_references as $current_locator) {
				foreach ($ar_inverse_references as $section_dato) {

					$current_locator = (object)[
						'from_section_tipo'	=> $section_dato->section_tipo,
						'from_section_id'	=> $section_dato->section_id
					];

					// check valid locator
						if (!isset($current_locator->from_section_tipo) || !isset($current_locator->from_section_id)) {
							debug_log(__METHOD__
								. " Error: Invalid locator. Expected from_section_tipo and from_section_id " . PHP_EOL
								. ' current_locator: ' . json_encode($current_locator, JSON_PRETTY_PRINT) . PHP_EOL
								. ' custom_map: ' . json_encode($custom_map, JSON_PRETTY_PRINT) . PHP_EOL
								. ' sqo: ' . json_encode($sqo, JSON_PRETTY_PRINT)
								, logger::ERROR
							);
							throw new Exception("Error Processing Request", 1);
						}

					$custom_locator = new locator();
						$custom_locator->set_section_tipo($current_locator->from_section_tipo);
						$custom_locator->set_section_id($current_locator->from_section_id);

					// Check target is publishable
						$current_is_publicable = diffusion::get_is_publicable($custom_locator);
						if ($current_is_publicable!==true) {
							debug_log(__METHOD__
								." + Skipped locator not publishable: " . PHP_EOL
								. json_encode($custom_locator, JSON_PRETTY_PRINT)
								, logger::DEBUG
							);
							continue;
						}

					// custom_map reference
						// [
						// {
						// 	"section_tipo": "qdp1",
						// 	"table": "objects",
						// 	"image": {
						// 	  "component_method": "get_diffusion_resolve_value",
						// 	  "custom_arguments": {
						// 		"process_dato_arguments": {
						// 		  "target_component_tipo": "qdp66",
						// 		  "dato_splice": [
						// 			1
						// 		  ],
						// 		  "component_method": "get_diffusion_resolve_value",
						// 		  "custom_arguments": [
						// 			{
						// 			  "process_dato_arguments": {
						// 				"target_component_tipo": "rsc29",
						// 				"component_method": "get_diffusion_value",
						// 				"dato_splice": [
						// 				  1
						// 				]
						// 			  }
						// 			}
						// 		  ]
						// 		}
						// 	  }
						// 	},
						// 	"title": {
						// 	  "component_method": "get_diffusion_resolve_value",
						// 	  "custom_arguments": {
						// 		"process_dato_arguments": {
						// 		  "target_component_tipo": "qdp152",
						// 		  "component_method": "get_diffusion_value",
						// 		  "dato_splice": [
						// 			1
						// 		  ]
						// 		}
						// 	  }
						// 	}
						// }
						// ]
					foreach ((array)$custom_map as $map_item) {

						// match current locator section tipo with defined maps section_tipo. If not exist, ignore it
						if ($map_item->section_tipo!==$current_locator->from_section_tipo) {
							continue;
						}

						$value_obj = new stdClass();
							$value_obj->section_tipo	= $current_locator->from_section_tipo;
							$value_obj->section_id		= $current_locator->from_section_id;

						$related_value_obj = new stdClass();

						$is_related = false;

						// iterate object map_item
						foreach ($map_item as $map_key => $map_obj) {

							// section_tipo
								if ($map_key==='section_tipo') {
									continue;
								}

							// table
								if ($map_key==='table') {
									$value_obj->table			= $map_obj;
									$related_value_obj->table	= $map_obj;
									continue;
								}

							// related case (@see mdcat4338 properties)
								if(isset($map_obj->related)) {

									$deep_relation_list = new relation_list(
										$map_obj->related->target_component_tipo, //string tipo
										$current_locator->from_section_id, // mixed section_id
										$current_locator->from_section_tipo, // string section_tipo
										'edit'
									);
									$current_dato = $deep_relation_list->get_diffusion_dato();

									// sqo . Common used to get inverse locators
									$deep_sqo = (object)[
										'section_tipo'			=> ['all'],
										'mode'					=> 'related',
										'limit'					=> false,
										'offset'				=> 0,
										'filter_by_locators'	=> [
											(object)[
												'section_tipo'	=> $deep_relation_list->section_tipo,
												'section_id'	=> $deep_relation_list->section_id
											]
										]
									];

									// inverse_references
									// return all records found
									$current_dato = array_map(function($row){
										return (object)[
											'section_tipo'	=> $row->section_tipo,
											'section_id'	=> $row->section_id
										];
									}, $deep_relation_list->get_inverse_references($deep_sqo));

									$filtered_result = [];
									foreach ((array)$current_dato as $current_dato_value) {
										// filter_section
										// if (!in_array($current_dato_value->from_section_tipo, (array)$map_obj->related->filter_section)) {
										if (!in_array($current_dato_value->section_tipo, (array)$map_obj->related->filter_section)) {
											continue;
										}

										$filtered_result[] = $current_dato_value; // add row
									}

									if (!empty($filtered_result)) {
										foreach ($filtered_result as $filtered_value) {

											$filtered_custom_locator = new locator();
												$filtered_custom_locator->set_section_tipo($filtered_value->section_tipo);
												$filtered_custom_locator->set_section_id($filtered_value->section_id);

											// Check target is publicable
												$filtered_current_is_publicable = diffusion::get_is_publicable($filtered_custom_locator);
												if ($filtered_current_is_publicable!==true) {
													debug_log(__METHOD__
														." + Skipped locator not publicable: ". PHP_EOL
														.' filtered_custom_locator:' . to_string($filtered_custom_locator)
														, logger::DEBUG
													);
													continue;
												}

											// current_value
												$current_dato			= [$filtered_custom_locator];
												$process_dato_arguments	= $map_obj->custom_arguments->process_dato_arguments;
													$process_dato_arguments->lang = $lang;
												$current_value = diffusion_sql::resolve_value(
													$process_dato_arguments, // mixed options
													$current_dato, // mixed dato
													' | ' // string default_separator
												);

											if ($is_related===false) {
												$related_value_obj->section_tipo	= $filtered_value->section_tipo;
												$related_value_obj->section_id		= $filtered_value->section_id;
											}

											$related_value_obj->{$map_key}	= $current_value;

										}//end foreach ($filtered_result as $filtered_value)
									}
									$is_related = true;
									continue;
								}//end if(isset($map_obj->related))

							// reference
								// "type": "dd151",
								// "section_id": "7",
								// "section_tipo": "technique1",
								// "from_component_tipo": "qdp168",
								// "from_section_tipo": "qdp1",
								// "from_section_id": "2"

							$custom_locator = new locator();
								$custom_locator->set_section_tipo($current_locator->from_section_tipo);
								$custom_locator->set_section_id($current_locator->from_section_id);

							$current_dato = [$custom_locator];

							$is_direct = !isset($map_obj->custom_arguments->process_dato_arguments);
							if ($is_direct) {

								// direct case @see 'mdcat4338' (changed to calculated value 31-03-2025)
								$process_dato_arguments	= $map_obj->process_dato_arguments;
								$process_dato_arguments->lang = $lang;

								// function_handler
								$function_handler = $map_obj->process_dato; // like 'diffusion_sql::return_fixed_value'

								$current_properties = new stdClass();
									$current_properties->process_dato_arguments = $process_dato_arguments;
								$current_options = new stdClass();
									$current_options->properties = $current_properties;
								$current_value = $function_handler($current_options, $current_dato);

							}else{

								// default case (resolve_value)
								$process_dato_arguments	= $map_obj->custom_arguments->process_dato_arguments;
								$process_dato_arguments->lang = $lang;

								$current_value = diffusion_sql::resolve_value($process_dato_arguments, $current_dato, $separator=' | ');
							}

							$value_obj->{$map_key} = $current_value;
						}//end foreach ($map_item as $map_key => $map_obj)

						if (!in_array($value_obj, $ar_values) && $is_related===false) {
							$ar_values[] = $value_obj;
						}else if(!in_array($related_value_obj, $ar_values) && $is_related===true){
							$ar_values[] = $related_value_obj;
						}

					}//end foreach ($custom_map as $map_item)
				}//end foreach ($ar_inverse_references as $section_dato) {

				$diffusion_value = $ar_values;
				break;

			case 'valor':
				$ar_values = [];
				$ar_inverse_references = $this->get_inverse_references($sqo);
				foreach ($ar_inverse_references as $inverse_reference) {

					$current_locator = new locator();
						$current_locator->set_section_tipo($inverse_reference->section_tipo);
						$current_locator->set_section_id($inverse_reference->section_id);

					// Check target is publicable
					$current_is_publicable = diffusion::get_is_publicable($current_locator);
					if ($current_is_publicable!==true) {
						debug_log(__METHOD__
							." + Skipped locator not publishable: ". PHP_EOL
							. ' current_locator: ' . json_encode($current_locator, JSON_PRETTY_PRINT)
							, logger::DEBUG
						);
						continue;
					}
					$ar_values[] = $current_locator;
				}

				$ar_relations_lists	= $this->get_relation_list_obj($ar_values);
				$diffusion_value	= $ar_relations_lists;
				break;

			case 'dato_full':
				$ar_values = [];
				$ar_inverse_references = $this->get_inverse_references($sqo);
				foreach ($ar_inverse_references as $inverse_reference) {

					$current_locator = new locator();
						$current_locator->set_section_tipo($inverse_reference->section_tipo);
						$current_locator->set_section_id($inverse_reference->section_id);

					// Check target is publicable
					$current_is_publicable = diffusion::get_is_publicable($current_locator);
					if ($current_is_publicable!==true) {
						debug_log(__METHOD__
							." + Skipped locator not publishable: ". PHP_EOL
							. ' current_locator: ' . json_encode($current_locator, JSON_PRETTY_PRINT)
							, logger::DEBUG
						);
						continue;
					}
					// if (count($ar_values)>10) {
					// 	break;
					// }
					$ar_values[] = $current_locator;
				}

				$diffusion_value = $ar_values;
				break;

			case 'filtered_values': // inject each relation value (locator) to target component and request the processed value
				// see sample at: numisdata1302

				// get relations filtered dato (by section_tipo and component_tipo)
					$diffusion_value = $this->get_diffusion_dato();

				// params from properties
					$target_component_tipo	= $diffusion_properties->process_dato_arguments->target_component_tipo;
					$output					= $diffusion_properties->process_dato_arguments->output ?? 'array';
					$separator				= $diffusion_properties->process_dato_arguments->separator ?? ' | ';
					$direct_value			= $diffusion_properties->process_dato_arguments->direct_value ?? false;
					$component_method		= $diffusion_properties->process_dato_arguments->component_method ?? null;
					$options				= $diffusion_properties->process_dato_arguments->options ?? null;

				// ar_value. Iterate locators and store component processed value
					$ar_value = [];
					foreach ($diffusion_value as $current_locator) {

						$model = ontology_node::get_model_by_tipo($target_component_tipo,true);

						if ($direct_value===true) {

							// direct component value case (@see 'dmmgobes29')

							$translatable = ontology_node::get_translatable( $target_component_tipo );
							$lang = ( $translatable===true) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
							$current_component = component_common::get_instance(
								$model,
								$target_component_tipo,
								$current_locator->section_id,
								'list',
								$lang,
								$current_locator->section_tipo
							);

							if ($component_method==='get_diffusion_value') {
								// sample at 'dmmgobes31'
									// {
									//   "data_to_be_used": "filtered_values",
									//   "process_dato_arguments": {
									//     "output": "string",
									//     "direct_value": true,
									//     "filter_section": "dmm480",
									//     "target_component_tipo": "dmm500",
									//     "component_method": "get_diffusion_value",
									//     "options": {
									//       "custom_parents": {
									//         "info": " Select by model code (province '8870' from es2)",
									//         "select_model": [
									//           "es2_8870"
									//         ]
									//       }
									//     }
									//   }
									// }
								$ar_value[] = $current_component->{$component_method}($lang, $options);
							}else if ( isset($component_method) ) {
								$component_data = $current_component->{$component_method}();

								if(is_string($component_data)){
									try {
										$data_parse = json_decode($component_data);
										if($data_parse !== null){
											$component_data = $data_parse;
										}
									} catch (Exception $e) {

									}
								}
								if(!empty($component_data)){
									if(is_array($component_data)){
										$ar_value = [...$ar_value, ...$component_data];
									}else{
										$ar_value[] = $component_data;
									}
								}
							}else{
								$ar_value[] = $current_component->get_value();
							}

						}else{

							// default related value case (portals, etc.) @see 'numisdata1302'

							$current_component = component_common::get_instance(
								$model,
								$target_component_tipo,
								$this->section_id,
								'list',
								DEDALO_DATA_LANG,
								$this->section_tipo
							);
							$current_component->set_dato($current_locator); // force set dato
							$ar_value[] = $current_component->get_value();
						}
					}

				// diffusion_value as string or array (default array)
					$diffusion_value = ($output==='string')
						? implode($separator, $ar_value)
						: $ar_value;
					// unify empty values to null
					if (empty($diffusion_value) && $diffusion_value!==null) {
						$diffusion_value = null;
					}
				break;

			case 'dato':
			default:
				// DES
					// $ar_values = [];
					// $ar_inverse_references = $this->get_inverse_references($limit=false, $offset=0, $count=false);
					// foreach ($ar_inverse_references as $current_locator) {

					// 	// Check target is publicable
					// 	$current_is_publicable = diffusion::get_is_publicable($current_locator);
					// 	if ($current_is_publicable!==true) {
					// 		debug_log(__METHOD__." + Skipped locator not publicable: ".to_string($current_locator), logger::DEBUG);
					// 		continue;
					// 	}
					// 	$ar_values[] = $current_locator->section_tipo;
					// }

					// $diffusion_value = array_unique($ar_values);

				$diffusion_value = $this->get_diffusion_dato();
				break;
		}

		// remove duplicates option
			if (isset($diffusion_properties->process_dato_arguments)
				&& isset($diffusion_properties->process_dato_arguments->remove_duplicates)
				&& $diffusion_properties->process_dato_arguments->remove_duplicates===true) {

				if (is_array($diffusion_value)) {
					$diffusion_value = array_unique($diffusion_value, SORT_REGULAR);
				}
			}

		// cache
			self::$diffusion_value_cache[$cache_key] = $diffusion_value;


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_DATA
	* Resolve the inverse references (who are calling to this section)
	* and creates its own data with the result as an array of locators
	* data is not filtered, it get the inverse references as its own data
	* @return array $data
	*
	* @test false
	*/
	public function get_data() : array {

		// Build filter locators
		$ar_filter_locators = [];
		if (empty($this->component_filter)) {
			// default: one locator without component filter
			$ar_filter_locators[] = (object)[
				'section_tipo'	=> $this->section_tipo,
				'section_id'	=> $this->section_id
			];
		} else {
			// multiple locators: one for each component type in the filter
			foreach ((array)$this->component_filter as $tipo) {
				$ar_filter_locators[] = (object)[
					'section_tipo'			=> $this->section_tipo,
					'section_id'			=> $this->section_id,
					'from_component_tipo'	=> $tipo
				];
			}
		}

		// sqo . Common used to get inverse locators
		$sqo_data = (object)[
			'section_tipo'			=> !empty($this->section_filter) ? $this->section_filter : ['all'],
			'mode'					=> 'related',
			'limit'					=> false,
			'offset'				=> 0,
			'filter_by_locators'	=> $ar_filter_locators
		];

		// sqo
			$sqo = new search_query_object($sqo_data);

		// inverse_references
			$ar_inverse_references = $this->get_inverse_references($sqo);
				// sample. Full section dato
				// {
				//     "section_tipo": "numisdata300",
				//     "section_id": "1",
				//     "realtion": [
				//         {
				//             "type": "dd675",
				//             "section_id": "1",
				//             "section_tipo": "dd153",
				//             "from_component_tipo": "numisdata304"
				//         }, ...
				//     ]
				// }

		// create its data with the inverse references
		$data = array_map( function($el) {
			return (object)[
				'section_tipo' => $el->section_tipo,
				'section_id' => $el->section_id
			];
		}, $ar_inverse_references);


		return $data;
	}//end get_data



	/**
	* GET_DIFFUSION_DATA
	* Resolve the default diffusion data
	* is used by the `diffusion_data`
	* for component_section_id the default is its own data
	* @param object $ddo
	* @param ?string $diffusion_element_tipo
	* @return array $diffusion_data
	*
	* @see class.diffusion_data.php
	* @test false
	*/
	public function get_diffusion_data( object $ddo, ?string $diffusion_element_tipo=null ) : array {

		$diffusion_data = [];

		// Default diffusion data object
		$diffusion_data_object = new diffusion_data_object( (object)[
			'tipo'	=> $this->tipo,
			'lang'	=> null,
			'value'	=> null,
			'id'	=> $ddo->id ?? null
		]);

		$diffusion_data[] = $diffusion_data_object;

		// Custom function case
			// If ddo provide a specific function to get its diffusion data
			// check if it exists and can be used by diffusion environment
			// if all is ok, use this function and return the value returned by this function
			$fn = $ddo->fn ?? null;

			if( $fn ){
				// check if the function exist
				// if not, return a null value in diffusion data
				// and stop the resolution
				// 'is_callable' allows magic methods
				if( !is_callable([$this, $fn]) ){
					debug_log(__METHOD__
						. " function doesn't exist " . PHP_EOL
						. " function name: ". $fn
						, logger::ERROR
					);

					return $diffusion_data;
				}

				// execute the function directly since it's already validated
				try {
					$fn_data = $this->$fn( $ddo, $diffusion_element_tipo );

					switch (true) {
						// if the function is a method of the current component
						// it will return any kind of values.
						case method_exists($this, $fn):
							$diffusion_data_object->set_value( $fn_data );

							return $diffusion_data;
						// default, diffusion_fn method loaded by common __call
						// it will return an array of diffusion_data_object
						// and the default diffusion_data_object will be replaced
						default:
							// overwrite default diffusion data
							$diffusion_data = $fn_data;
							break;
					}
				} catch (Throwable $e) {
					debug_log(__METHOD__
						. " error executing diffusion function " . PHP_EOL
						. " function name: ". $fn . PHP_EOL
						. " error: " . $e->getMessage()
						, logger::ERROR
					);
					$fn_data = null;
				}
				// overwrite default diffusion data
				$diffusion_data = $fn_data;

				return $diffusion_data;
			}

		// Resolve the data by default
			// apply filters from ddo if provided
			if (!empty($ddo->section_filter)) {
				$this->set_section_filter((array)$ddo->section_filter);
			}
			if (!empty($ddo->component_filter)) {
				$this->set_component_filter((array)$ddo->component_filter);
			}

			// If the ddo doesn't provide any specific function the component will use a get_url as default.
			$data = $this->get_data();

			// if the ddo provides a data_slice property, use it to slice the data
			if(isset($ddo->data_slice)){
				$data = array_slice($data, $ddo->data_slice->offset, $ddo->data_slice->length);
			}

			$diffusion_value = !empty($data)
				? $data
				: null;

			$diffusion_data_object->set_value( $diffusion_value );


		return $diffusion_data;
	}//end get_diffusion_data



}//end class relation_list
