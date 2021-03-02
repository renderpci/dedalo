<?php
/*
* CLASS RELATION_LIST
* Manage the relations of the sections
* build the list of the relations between sections
*/
class relation_list extends common {

	protected $tipo;
	protected $section_id;
	protected $section_tipo;
	protected $modo;
	protected $value_resolved;
	protected $limit;
	protected $offset;
	protected $count;


	# diffusion_properties. Used to inject diffusion element properties in current element (useful to configure custom value resolutions)
	public $diffusion_properties;



	/**
	* CONSTRUCT
	* 
	*/
	public function __construct($tipo, $section_id, $section_tipo, $modo='edit') {

		$this->tipo 		= $tipo;
		$this->section_id 	= $section_id;
		$this->section_tipo = $section_tipo;
		$this->modo 		= $modo;

	}//end __construct


	/**
	* GET_DATO
	* @return 
	*/
	public function get_dato() {

		return [];		
	}//end get_dato



	/**
	* GET_INVERSE_REFERENCES
	* Get calculated inverse locators for all matrix tables
	* @see search_development2::calculate_inverse_locator
	* @return array $inverse_locators
	*/
	public function get_inverse_references($limit=1, $offset=0, $count=false) {

		if (empty($this->section_id)) {
			# Section not exists yet. Return empty $arrayName = array('' => , );
			return array();
		}

		# Create a minimal locator based on current section
		$reference_locator = new locator();
			$reference_locator->set_section_tipo($this->section_tipo);
			$reference_locator->set_section_id($this->section_id);
		
		# Get calculated inverse locators for all matrix tables
		$inverse_locators = search_development2::calculate_inverse_locators( $reference_locator, $limit, $offset, $count);


		return (array)$inverse_locators;	
	}//end get_inverse_references



	/**
	* GET_RELATION_LIST_OBJ
	*
	*/
	public function get_relation_list_obj($ar_inverse_references, $value_resolved=false){		
		
		$ar_context	= [];
		$ar_data	= [];

		$sections_related		= [];
		$ar_relation_components	= [];
		# loop the locators that call to the section
		foreach ((array)$ar_inverse_references as $current_locator) {
			
			$current_section_tipo = $current_locator->from_section_tipo;

			# 1 get the @context
				if (!in_array($current_section_tipo, $sections_related )){

					$sections_related[] =$current_section_tipo;

					//get the id
					$current_id = new stdClass;
						$current_id->section_tipo		= $current_section_tipo;
						$current_id->section_label		= RecordObj_dd::get_termino_by_tipo($current_section_tipo,DEDALO_APPLICATION_LANG, true);
						$current_id->component_tipo		= 'id';
						$current_id->component_label	= 'id';

						$ar_context[] = $current_id;

					//get the columns of the @context
					$ar_modelo_name_required	= array('relation_list');
					$resolve_virtual			= false;

					// Locate relation_list element in current section (virtual ot not)
					$ar_children = section::get_ar_children_tipo_by_modelo_name_in_section($current_section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual, $recursive=false, $search_exact=true);

					// If not found children, try resolving real section
					if (empty($ar_children)) {
						$resolve_virtual = true;
						$ar_children = section::get_ar_children_tipo_by_modelo_name_in_section($current_section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual, $recursive=false, $search_exact=true);
					}// end if (empty($ar_children))


					if( isset($ar_children[0]) ) {
						$current_children 		= reset($ar_children);
						$recordObjdd 			= new RecordObj_dd($current_children);
						$ar_relation_components[$current_section_tipo] = $recordObjdd->get_relaciones();
						if(isset($ar_relation_components[$current_section_tipo])){
							foreach ($ar_relation_components[$current_section_tipo] as $current_relation_component) {
								foreach ($current_relation_component as $modelo => $tipo) {

									$current_relation_list = new stdClass;
										$current_relation_list->section_tipo	= $current_section_tipo;
										$current_relation_list->section_label	= RecordObj_dd::get_termino_by_tipo($current_section_tipo,DEDALO_APPLICATION_LANG, true);
										$current_relation_list->component_tipo	= $tipo;
										$current_relation_list->component_label	= RecordObj_dd::get_termino_by_tipo($tipo, DEDALO_APPLICATION_LANG, true);

									$ar_context[] = $current_relation_list;
								}
							}
						}
					}
					
				}// end if (!in_array($current_section_tipo, $sections_related )

			# 2 get ar_data
				if (isset($ar_relation_components[$current_section_tipo])) {
					$current_component = $ar_relation_components[$current_section_tipo];
				}else{
					$current_component = null;
					debug_log(__METHOD__." Section without relation_list. Please, define relation_list for section: $current_section_tipo ".to_string(), logger::WARNING);
				}					
				$ar_data_result	= $this->get_ar_data($current_locator, $current_component, $value_resolved);			
				$ar_data		= array_merge($ar_data, $ar_data_result);

		}// end foreach ar_inverse_references

		$context = 'context';
		
		$json = new stdClass;
			$json->{$context}	= $ar_context;
			$json->data			= $ar_data;


		return $json;
	}//get_relation_list_obj



	/**
	* GET_DATA
	*/
	public function get_ar_data($locator, $ar_components, $value_resolved=false){

		$data = [];

		$section_tipo	= $locator->from_section_tipo;
		$section_id		= $locator->from_section_id;

		$current_id = new stdClass;
			$current_id->section_tipo	= $section_tipo;
			$current_id->section_id		= $section_id;
			$current_id->component_tipo	= 'id';

		$data[] = $current_id;
		
		if($value_resolved===true && isset($ar_components)){
			foreach ($ar_components as $current_relation_component) {
				foreach ($current_relation_component as $modelo => $tipo) {
					$modelo_name		= RecordObj_dd::get_modelo_name_by_tipo($modelo, true);
					$current_component	= component_common::get_instance(
																		$modelo_name, 
																		$tipo, 
																		$section_id,
																		'list', 
																		DEDALO_DATA_LANG, 
																		$section_tipo
																		);
					$value = $current_component->get_valor();

					$component_object = new stdClass;
						$component_object->section_tipo		= $section_tipo;
						$component_object->section_id		= $section_id;
						$component_object->component_tipo	= $tipo;
						$component_object->value			= $value;

					$data[] = $component_object;
				}
			}
		}
	
		return $data;
	}//end get_data



	/**
	* GET_JSON
	*/
	public function get_json(){

		if(SHOW_DEBUG===true) $start_time = start_time();
		
			# Class name is called class (ex. component_input_text), not this class (common)	
			include ( DEDALO_LIB_BASE_PATH .'/'. get_called_class() .'/'. get_called_class() .'_json.php' );

		if(SHOW_DEBUG===true) {
			#$GLOBALS['log_messages'][] = exec_time($start_time, __METHOD__. ' ', "html");
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}
		
		return $json;
	}//end get_json



	/**
	* GET_DIFFUSION_DATO
	* @return string $diffusion_value
	* 
	* @see numisdata1021
	*/
	public function get_diffusion_dato() {	

		# Propiedades of diffusion element that references this component
		# (!) Note that is possible overwrite real component properties injecting properties from diffusion (see diffusion_sql::resolve_value)
		# 	  This is useful to change the 'data_to_be_used' param of target component (indirectly)
		$diffusion_properties	= $this->get_diffusion_properties();
		$process_dato_arguments	= isset($diffusion_properties->process_dato_arguments) 
			? $diffusion_properties->process_dato_arguments
			: null;
		$ar_inverse_references	= $this->get_inverse_references($limit=false, $offset=0, $count=false);
		$ar_values = [];
		foreach ($ar_inverse_references as $current_locator) {

			// filter_section
				if (isset($process_dato_arguments->filter_section)) {
					if (!in_array($current_locator->from_section_tipo, $process_dato_arguments->filter_section)) {
						continue;
					}
				}

			// filter_component
				if (isset($process_dato_arguments->filter_component)) {
					if (!in_array($current_locator->from_component_tipo, $process_dato_arguments->filter_component)) {
						continue;
					}
				}

			// locator restored from inverse
				$locator = new locator();
					$locator->set_section_tipo($current_locator->from_section_tipo);
					$locator->set_section_id($current_locator->from_section_id);

			// Check target is publicable
				$current_is_publicable = diffusion::get_is_publicable($locator);
				if ($current_is_publicable!==true) {
					// debug_log(__METHOD__." + Skipped locator not publicable: ".to_string($locator), logger::DEBUG);
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
		}


		return $ar_values;
	}//end get_diffusion_dato


	
	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value($lang=null) {

		// dump(func_get_args(), 'func_get_args() ++ /////////////// '.to_string($this->tipo));
		// dump($this, ' this ++ '.to_string());
		// dump($this->tipo, ' this->tipo ++ '.to_string());

		$diffusion_value = null;

		# Propiedades of diffusion element that references this component
		# (!) Note that is possible overwrite real component properties injecting properties from diffusion (see diffusion_sql::resolve_value)
		# 	  This is useful to change the 'data_to_be_used' param of target component (indirectly)
		$diffusion_properties = $this->get_diffusion_properties();
		
		$data_to_be_used = isset($diffusion_properties->data_to_be_used)
			? $diffusion_properties->data_to_be_used 
			: 'dato';

		// overwrite data_to_be_used
			if (isset($diffusion_properties->process_dato_arguments) && isset($diffusion_properties->process_dato_arguments->data_to_be_used)) {
				$data_to_be_used = $diffusion_properties->process_dato_arguments->data_to_be_used;
			}	

		switch ($data_to_be_used) {

			case 'custom':
				$ar_values = [];

				$custom_map = $diffusion_properties->process_dato_arguments->custom_map;
					// dump($custom_map, ' custom_map ++ '.to_string());

				$ar_inverse_references = $this->get_inverse_references($limit=false, $offset=0, $count=false);
				foreach ($ar_inverse_references as $current_locator) {

					$custom_locator = new locator();
						$custom_locator->set_section_tipo($current_locator->from_section_tipo);
						$custom_locator->set_section_id($current_locator->from_section_id);

					// Check target is publicable
					$current_is_publicable = diffusion::get_is_publicable($custom_locator);
					if ($current_is_publicable!==true) {
						debug_log(__METHOD__." + Skipped locator not publicable: ".to_string($custom_locator), logger::DEBUG);
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
						if ($map_item->section_tipo===$current_locator->from_section_tipo) {

							$value_obj = new stdClass();
								$value_obj->section_tipo	= $current_locator->from_section_tipo;
								$value_obj->section_id		= $current_locator->from_section_id;

							// iterate object map_item
							foreach ($map_item as $map_key => $map_obj) {
								// dump($map_obj, ' map_obj ++ '.to_string($map_key));

								// section_tipo
									if ($map_key==='section_tipo') {
										continue;
									}

								// table
									if ($map_key==='table') {
										$value_obj->table = $map_obj;
										continue;
									}

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

								$process_dato_arguments	= $map_obj->custom_arguments->process_dato_arguments;
									$process_dato_arguments->lang = $lang;		

								$current_value = diffusion_sql::resolve_value($process_dato_arguments, $current_dato, $separator=' | ');
									// dump($current_value, ' current_value ++ '.to_string());
								
								$value_obj->{$map_key} = $current_value;
							}

							$ar_values[] = $value_obj;
						}

					}//end foreach ($custom_map as $map_item)					
				}

				$diffusion_value = $ar_values;
				break;
			
			case 'valor':
				$ar_values = [];
				$ar_inverse_references = $this->get_inverse_references($limit=false, $offset=0, $count=false);
				foreach ($ar_inverse_references as $current_locator) {
				// Check target is publicable
					$current_is_publicable = diffusion::get_is_publicable($current_locator);
					if ($current_is_publicable!==true) {
						debug_log(__METHOD__." + Skipped locator not publicable: ".to_string($current_locator), logger::DEBUG);
						continue;
					}
					$ar_values[] = $current_locator;
				}

				$ar_relations_lists	= $this->get_relation_list_obj($ar_values, $value_resolved=true);	
				$diffusion_value	= $ar_relations_lists;
				break;

			case 'dato_full':
				$ar_values = [];
				$ar_inverse_references = $this->get_inverse_references($limit=false, $offset=0, $count=false);
				foreach ($ar_inverse_references as $current_locator) {

					// Check target is publicable
					$current_is_publicable = diffusion::get_is_publicable($current_locator);
					if ($current_is_publicable!==true) {
						debug_log(__METHOD__." + Skipped locator not publicable: ".to_string($current_locator), logger::DEBUG);
						continue;
					}
					// if (count($ar_values)>10) {
					// 	break;
					// }
					$ar_values[] = $current_locator;
				}

				$diffusion_value = $ar_values;
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
				

		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_VALOR_EXPORT
	* @return array $ar_values
	*/
	public function get_valor_export() {
		
		$ar_values = [];
		$ar_inverse_references = $this->get_inverse_references($limit=false, $offset=0, $count=false);
		foreach ($ar_inverse_references as $current_locator) {

			$item = new stdClass();
				$item->section_tipo			= $this->section_tipo;
				$item->component_tipo		= $this->tipo;
				$item->from_section_tipo	= $current_locator->from_section_tipo;
				$item->from_component_tipo	= $current_locator->from_component_tipo;
				$item->value				= $current_locator->from_section_id;

			$ar_values[] = $item;
		}

		return $ar_values;
	}//end get_valor_export



	/**
	* GET_DATO_EXPORT
	* @return array $ar_values 
	*/
	public function get_dato_export() {
		
		$ar_values = [];
		$ar_inverse_references = $this->get_inverse_references($limit=false, $offset=0, $count=false);
		foreach ($ar_inverse_references as $current_locator) {
			$ar_values[] = $current_locator;
		}

		return json_encode($ar_values);
	}//end get_dato_export



}//relation_list


