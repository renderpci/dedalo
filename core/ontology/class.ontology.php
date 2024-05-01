<?php
require_once( dirname(__FILE__) . '/class.RecordObj_dd_edit.php');



// definitions
	// define('ONTOLOGY_SECTION_TIPOS', [
	// 	'section_tipo'	=> 'dd1500',
	// 	'id'			=> 'dd1483',
	// 	'tld'			=> 'dd1482',
	// 	'term_id'		=> 'dd1475',
	// 	'term'			=> 'dd1477',
	// 	'definition'	=> 'dd1478',
	// 	'observations'	=> 'dd1476'
	// ]);



/**
* ONTOLOGY
* Manages structure (ontology) import and export data
* Useful for developers to create tools structure data
*/
class ontology {



	/**
	* EXPORT
	* @param string $tipo
	* @return array $ar_data
	*/
	public static function export(string $tipo) : array {

		$ar_data = ontology::parse($tipo);

		return $ar_data;
	}//end export



	/**
	* PARSE
	* Get and convert ontology term and children to JSON format
	* @param string $tipo
	* @return array $ar_data
	*/
	public static function parse(string $tipo) : array {

		$ar_data = [];

		// current term data
			$item = ontology::tipo_to_json_item($tipo);
			$ar_data[] = $item;

		// children
			$children = RecordObj_dd::get_ar_recursive_childrens($tipo);
			foreach ($children as $children_tipo) {
				$ar_data[] = ontology::tipo_to_json_item($children_tipo);
			}

		return $ar_data;
	}//end parse



	/**
	* TIPO_TO_JSON_ITEM
	* Resolve full ontology item data from tipo
	* @param string $tipo
	* @param array $request_options = [....]
	* @return object $item
	*/
	public static function tipo_to_json_item(string $tipo, array $request_options=[
		'tipo' 			=> true,
		'tld'			=> true,
		'is_model'		=> true,
		'model'			=> true,
		'model_tipo'	=> true,
		'parent'		=> true,
		'order'			=> true,
		'translatable'	=> true,
		'propiedades'	=> true,
		'properties'	=> true,
		'relations'		=> true,
		'descriptors'	=> true,
		'label'			=> false
		]) : object {

		$options = new stdClass();
			$options->tipo			= false;
			$options->tld			= false;
			$options->is_model		= false;
			$options->model			= false;
			$options->model_tipo	= false;
			$options->parent		= false;
			$options->order			= false;
			$options->translatable	= false;
			$options->propiedades	= false;
			$options->properties	= false;
			$options->relations		= false;
			$options->descriptors	= false;
			$options->label			= false;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$RecordObj_dd = new RecordObj_dd($tipo);
		$RecordObj_dd->use_cache = false; // (!) prevents using previous db results
		$RecordObj_dd->get_dato();

		$item = new stdClass();

			if ($options->tipo===true) {
				$item->tipo = $tipo;
			}
			if ($options->tld===true) {
				$item->tld = $RecordObj_dd->get_tld();
			}
			if ($options->is_model===true) {
				$item->is_model = $RecordObj_dd->get_esmodelo();
			}
			if ($options->model===true) {
				$item->model = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			}
			if ($options->model_tipo===true) {
				$item->model_tipo = $RecordObj_dd->get_modelo();
			}
			if ($options->parent===true) {
				$item->parent = $RecordObj_dd->get_parent();
			}
			if ($options->order===true) {
				$item->order = (int)$RecordObj_dd->get_norden();
			}
			if ($options->translatable===true) {
				$item->translatable = $RecordObj_dd->get_traducible()==='si';
			}
			if ($options->propiedades===true) {
				$propiedades = $RecordObj_dd->get_propiedades(true);
				$item->propiedades = $propiedades; // stored as string in DDBB
			}
			if ($options->properties===true) {
				$item->properties = $RecordObj_dd->get_properties();
			}
			if ($options->relations===true) {

				$current_relations = $RecordObj_dd->get_relaciones();
				if (!empty($current_relations)) {

					$relations = array_map(function($element){
						$element		= is_array($element) ? (object)$element : $element;
						$element_array	= get_object_vars($element);
						$current_obj = new stdClass();
							$current_obj->tipo = property_exists($element, 'tipo')
								? $element->tipo
								: reset($element_array);
						return $current_obj;
					}, $current_relations);
				}
				$item->relations = $relations ?? null;
			}
			if ($options->descriptors===true) {
					// descriptors
					$strQuery		= "SELECT dato, tipo, lang FROM \"matrix_descriptors_dd\" WHERE parent = '$tipo'";
					$result			= JSON_RecordObj_matrix::search_free($strQuery);
					$ar_descriptors	= [];
					while ($row = pg_fetch_assoc($result)) {

						$type = $row['tipo']==='termino' ? 'term' : $row['tipo'];

						$ar_descriptors[] = (object)[
							'value'	=> $row['dato'],
							'lang'	=> $row['lang'],
							'type'	=> $type
						];
					}
					$item->descriptors = $ar_descriptors;
			}

			// get termino by tipo with fallback
			if ($options->label===true) {
				$item->label = RecordObj_dd::get_termino_by_tipo(
					$tipo, // string terminoID
					DEDALO_APPLICATION_LANG, // string lang
					true, // bool from_cache
					true // bool do fallback
				);
			}

		return $item;
	}//end tipo_to_json_item



	/**
	* IMPORT
	* Creates a NEW term for each onomastic item in data.
	* (!) Note that it is important to clean old terms before, because current function don't
	* update terms, only insert new terms (!)
	* @return bool true
	*/
	public static function import(array $data) : bool {

		foreach ($data as $key => $item) {

			if (empty($item) || !isset($item->tld)) {
				debug_log(__METHOD__." Ignored empty item on import ".to_string(), logger::ERROR);
				continue;
			}

			// term. jer_dd
				$esmodelo	= $item->is_model ?? 'no';
				$traducible	= $item->translatable===true ? 'si' : 'no';

				$RecordObj_dd_edit = new RecordObj_dd_edit(null, $item->tld);

				$RecordObj_dd_edit->set_terminoID($item->tipo);
				$RecordObj_dd_edit->set_esdescriptor('si');
				$RecordObj_dd_edit->set_esdescriptor('si');
				$RecordObj_dd_edit->set_visible('si');
				$RecordObj_dd_edit->set_parent($item->parent);
				$RecordObj_dd_edit->set_esmodelo($esmodelo);
				$RecordObj_dd_edit->set_norden($item->order);
				$RecordObj_dd_edit->set_traducible($traducible);
				$RecordObj_dd_edit->set_relaciones($item->relations);
				$RecordObj_dd_edit->set_properties($item->properties);
				$RecordObj_dd_edit->set_modelo($item->model_tipo);
				$RecordObj_dd_edit->set_tld($item->tld);

				$term_id = $RecordObj_dd_edit->Save();

			// descriptors
				$descriptors = $item->descriptors;
				foreach ($descriptors as $current_descriptor) {

					$term = $current_descriptor->type==='term' ? 'termino' : $current_descriptor->type;

					$RecordObj_descriptors_dd = new RecordObj_descriptors_dd(
						'matrix_descriptors_dd', null, $item->tipo, $current_descriptor->lang, $term
					);

					$RecordObj_descriptors_dd->set_dato($current_descriptor->value);
					$RecordObj_descriptors_dd->Save();

				}// end foreach ($descriptors)

		}//end foreach ($data as $key => $item)


		return true;
	}//end import



	/**
	* CLEAN_STRUCTURE_DATA
	* @param string $tld
	* @return bool true
	*/
	public static function clean_structure_data(string $tld) : bool {

		// jer_dd. delete terms (jer_dd)
			$sql_query = '
				DELETE FROM "jer_dd" WHERE "tld" = \''.$tld.'\';
			';
			$result_delete_jer 	= pg_query(DBi::_getConnection(), $sql_query);

		// matrix_descriptors_dd. delete descriptors (matrix_descriptors_dd)
			$sql_query = '
				DELETE FROM "matrix_descriptors_dd" WHERE "parent" ~ \'^'.$tld.'[0-9]+\';
			';
			$result_delete_descriptors 	= pg_query(DBi::_getConnection(), $sql_query);

		// reset the TLD counter
			$sql_query = '
				DELETE FROM "main_dd" WHERE "tld" = \''.$tld.'\';
			';
			$result_reset_counter = pg_query(DBi::_getConnection(), $sql_query);


		return true;
	}//end clean_structure_data



	/**
	* RENUMERATE_TERM_ID
	* @return array $ontology
	*/
	public static function renumerate_term_id(array $ontology, int &$counter) : array {

		foreach ($ontology as $item) {
			$tipo = $item->tipo;
			$ar_items_childrens = array_filter($ontology, function($current_element) use($tipo){
				return $current_element->parent === $tipo;
			});
			$new_tld = 'tool'.++$counter;

			$item->tipo = $new_tld;
			$item->tld 	= 'tool';

			foreach ($ar_items_childrens as $key => $current_element) {
				$ontology[$key]->parent = $new_tld;
			}
		}

		return $ontology;
	}//end renumerate_term_id



	/**
	* GET_CHILDREN_RECURSIVE_OLD . TS TREE FULL FROM PARENT
	* You get the types of the sections / areas and hierarchically break down their section_group
	* @param string $terminoID
	* @return array $ar_tesauro
	*	array recursive of thesaurus structure children
	*/
		// public static function get_children_recursive_OLD(string $tipo) : array {

		// 	if(SHOW_DEBUG===true) {
		// 		$start_time=microtime(1);
		// 	}

		// 	# STATIC CACHE
		// 	static $childrens_recursive_data;
		// 	if(isset($childrens_recursive_data[$tipo])) return $childrens_recursive_data[$tipo];

		// 	$ar_elements = [];

		// 	$source_model = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		// 	switch ($source_model) {

		// 		case 'section':

		// 			$section_tipo				= $tipo;
		// 			$ar_modelo_name_required	= array('section_group','section_tab','button_','relation_list','time_machine_list');

		// 			# Real section
		// 			//($section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=false, $recursive=true, $search_exact=false)
		// 			$ar_ts_childrens = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required, true, true, false, false);

		// 			# Virtual section too is neccesary (buttons specifics)
		// 			$ar_ts_childrens_v	= section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required, true, false, false, false);
		// 			$ar_ts_childrens	= array_merge($ar_ts_childrens, $ar_ts_childrens_v);
		// 			break;

		// 		default:
		// 			# Areas
		// 			$RecordObj_dd		= new RecordObj_dd($tipo);
		// 			$ar_ts_childrens	= $RecordObj_dd->get_ar_childrens_of_this();
		// 			break;
		// 	}


		// 	$ar_exclude_modelo = array('component_security_administrator','section_list','search_list','component_semantic_node','box_elements','exclude_elements'); # ,'filter','tools'

		// 	// ar_exclude_components
		// 		$dedalo_version = explode(".", DEDALO_VERSION);
		// 		if ( (int)$dedalo_version[0]>5 ) {
		// 			$ar_exclude_components = defined('DEDALO_AR_EXCLUDE_COMPONENTS') ? DEDALO_AR_EXCLUDE_COMPONENTS : [];
		// 		}else{
		// 			$ar_exclude_components = defined('DEDALO_AR_EXCLUDE_COMPONENTS') ? unserialize(DEDALO_AR_EXCLUDE_COMPONENTS) : [];
		// 		}

		// 	foreach((array)$ar_ts_childrens as $element_tipo) {

		// 		// Remove_exclude_models
		// 			$component_model = RecordObj_dd::get_modelo_name_by_tipo($element_tipo,true);
		// 			if( in_array($component_model, $ar_exclude_modelo)) {
		// 				continue ;
		// 			}

		// 		// remove_exclude_terms : config excludes. If instalation config value DEDALO_AR_EXCLUDE_COMPONENTS is defined, remove from ar_temp
		// 			if (in_array($element_tipo, $ar_exclude_components)) {
		// 				continue;
		// 			}

		// 		// get the ontology json format
		// 			$ar_elements[]	= ontology::tipo_to_json_item($element_tipo, [
		// 				'tipo'			=> true,
		// 				'tld'			=> false,
		// 				'is_model'		=> false,
		// 				'model'			=> true,
		// 				'model_tipo'	=> false,
		// 				'parent'		=> true,
		// 				'order'			=> true,
		// 				'translatable'	=> false,
		// 				'properties'	=> false,
		// 				'relations'		=> false,
		// 				'descriptors'	=> false,
		// 				'label'			=> true
		// 			]);

		// 		$ar_elements = array_merge( $ar_elements, self::get_children_recursive($element_tipo));
		// 	}

		// 	# STORE CACHE DATA
		// 	$childrens_recursive_data[$tipo] = $ar_elements;

		// 	if(SHOW_DEBUG===true) {
		// 		$total=round(microtime(1)-$start_time,3);
		// 		#debug_log(__METHOD__." ar_tesauro ($total) ".to_string($ar_tesauro), logger::DEBUG);
		// 	}

		// 	return $ar_elements;
		// }//end get_children_recursive_OLD



	/**
	* GET_CHILDREN_RECURSIVE . TS TREE FULL FROM PARENT
	* You get the types of the sections / areas and hierarchically break down their section_group
	* @param string $terminoID
	* @return array $ar_tesauro
	*	array recursive of thesaurus structure children
	*/
	public static function get_children_recursive(string $tipo) : array {

		if(SHOW_DEBUG===true) {
			// $start_time=microtime(1);
		}

		# STATIC CACHE
		static $children_recursive_data;
		if(isset($children_recursive_data[$tipo])) return $children_recursive_data[$tipo];

		$ar_elements = [];

		$source_model = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		switch ($source_model) {

			case 'section':

				$section_tipo				= $tipo;
				$ar_modelo_name_required	= array('section_group','section_tab','button_','relation_list','time_machine_list');

				// real section
					$ar_ts_children = section::get_ar_children_tipo_by_model_name_in_section(
						$section_tipo, // string section_tipo
						$ar_modelo_name_required, // array ar_modelo_name_required
						true, // bool from_cache
						true, // bool resolve_virtual
						false, // bool recursive
						false // bool search_exact
					);

				// virtual case add too
					$section_real_tipo = section::get_section_real_tipo_static($section_tipo);
					if ($section_tipo!==$section_real_tipo) {
						// Virtual section too is necessary (buttons specifics)
						$ar_ts_children_v = section::get_ar_children_tipo_by_model_name_in_section(
							$section_tipo, // string section_tipo
							$ar_modelo_name_required, // array ar_modelo_name_required
							true, // bool from_cache
							false, // bool resolve_virtual
							false, // bool recursive
							false// bool search_exact
						);
						$ar_ts_children	= array_merge($ar_ts_children, $ar_ts_children_v);
					}
				break;

			default:
				# Areas
				$RecordObj_dd	= new RecordObj_dd($tipo);
				$ar_ts_children	= $RecordObj_dd->get_ar_childrens_of_this();
				break;
		}

		// ar_exclude_model
			$ar_exclude_model = array(
				'component_security_administrator',
				'section_list','search_list',
				'component_semantic_node',
				'component_dataframe',
				'box elements',
				'exclude_elements'
			);

		// ar_exclude_components
			$dedalo_version = explode('.', DEDALO_VERSION);
			$ar_exclude_components = (int)$dedalo_version[0]>5
				? (defined('DEDALO_AR_EXCLUDE_COMPONENTS') ? DEDALO_AR_EXCLUDE_COMPONENTS : []) // v6
				: (defined('DEDALO_AR_EXCLUDE_COMPONENTS') ? unserialize(DEDALO_AR_EXCLUDE_COMPONENTS) : []); // v5

		// $ar_children = array_unique($ar_ts_children);
		$ar_children = $ar_ts_children;
		foreach($ar_children as $element_tipo) {

			// Remove_exclude_models
				$component_model = RecordObj_dd::get_modelo_name_by_tipo($element_tipo,true);
				if( in_array($component_model, $ar_exclude_model)) {
					continue ;
				}

			// remove_exclude_terms : config excludes. If installation config value DEDALO_AR_EXCLUDE_COMPONENTS is defined, remove from ar_temp
				if (in_array($element_tipo, $ar_exclude_components)) {
					continue;
				}

			// get the ontology JSON format
				$ar_elements[]	= ontology::tipo_to_json_item($element_tipo, [
					'tipo'			=> true,
					'tld'			=> false,
					'is_model'		=> false,
					'model'			=> true,
					'model_tipo'	=> false,
					'parent'		=> true,
					'order'			=> true,
					'translatable'	=> false,
					'properties'	=> false,
					'relations'		=> false,
					'descriptors'	=> false,
					'label'			=> true
				]);

			$ar_elements = array_merge( $ar_elements, self::get_children_recursive($element_tipo) );
		}

		# STORE CACHE DATA
		$children_recursive_data[$tipo] = $ar_elements;

		if(SHOW_DEBUG===true) {
			// $total=round(microtime(1)-$start_time,3);
			// debug_log(__METHOD__." ar_tesauro ($total) ".to_string($ar_tesauro), logger::DEBUG);
			// if ($tipo==='numisdata3') {
			// 	dump($ar_elements, ' //////// ar_elementss ++ '.to_string($tipo));
			// }
		}

		return $ar_elements;
	}//end get_children_recursive



	/**
	* ADD_TERM
	* @param object $options
	* @return int|false $section_id
	*/
	public static function add_term(object $options) {

		// options
			$term_id	= $options->term_id;
			$json_item	= $options->json_item ?? null;

		// term_id
			if (empty($term_id)) {
				debug_log(__METHOD__." Error on add_term. Ignored. Empty term_id in options: ".to_string($options), logger::ERROR);
				return false;
			}

		// tld
			$tld = RecordObj_dd_edit::get_prefix_from_tipo($term_id);
			if (empty($tld)) {
				debug_log(__METHOD__." Error on add_term. Ignored. Empty term_id in options: ".to_string($options), logger::ERROR);
				return false;
			}

		// id
			$id = str_replace($tld, '', $term_id); // remove tld. from 'oh123' to '123'. id is a internal counter and it is not saved or set to the object

		// verify if term already exists in the section
			// section_id. search and locate the ontology record by term_id
			$section_id = ontology::get_section_id_by_term_id($term_id);
			if (!empty($section_id)) {
				debug_log(__METHOD__
					." Ignored add term request. Section: '$section_id' already exists!
					. term: ".to_string($term_id)
					, logger::ERROR
				);
				return false;
			}

		// lang. At this time, is still 'lg-spa'
			$lang = DEDALO_STRUCTURE_LANG;

		// section. Create a new one
			$section_tipo	= ONTOLOGY_SECTION_TIPOS['section_tipo'];
			$section		= section::get_instance(null, $section_tipo, 'edit', false);
			$section->Save();
			$section_id = (int)$section->get_section_id();

		// component term_id
			(function($value) use($section_tipo, $section_id, $lang) {
				$tipo			= ONTOLOGY_SECTION_TIPOS['term_id'];
				$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
				$component		= component_common::get_instance($modelo_name,
																 $tipo,
																 $section_id,
																 'edit',
																 DEDALO_DATA_NOLAN,
																 $section_tipo);
				$dato = [$value];
				$component->set_dato($dato);
				$component->Save();
			})($term_id);

		// component tld
			(function($value) use($section_tipo, $section_id, $lang) {
				$tipo			= ONTOLOGY_SECTION_TIPOS['tld'];
				$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
				$component		= component_common::get_instance($modelo_name,
																 $tipo,
																 $section_id,
																 'edit',
																 DEDALO_DATA_NOLAN,
																 $section_tipo);
				$dato = [$value];
				$component->set_dato($dato);
				$component->Save();
			})($tld);

		// component id
			(function($value) use($section_tipo, $section_id, $lang) {
				$tipo			= ONTOLOGY_SECTION_TIPOS['id'];
				$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
				$component		= component_common::get_instance($modelo_name,
																 $tipo,
																 $section_id,
																 'edit',
																 DEDALO_DATA_NOLAN,
																 $section_tipo);
				$dato = [$value];
				$component->set_dato($dato);
				$component->Save();
			})($id);

		// JSON Ontology Item
			if (empty($json_item)) {
				$json_item	= ontology::tipo_to_json_item($term_id);
			}
			$save_item	= ontology::save_json_ontology_item($term_id, $json_item);	// returns object response

		// component parent
			// (function($value) use($section_tipo, $section_id, $lang) {

			// 	$component_tipo	= ONTOLOGY_SECTION_TIPOS['term_id'];
			// 	$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);

			// 	// filter
			// 		$filter_string = '{
			// 			"$and": [
			// 				{
			// 					"q": "'.$value.'",
			// 					"q_operator": "=",
			// 					"q_split": false,
			// 					"unaccent": false,
			// 					"path": [
			// 						{
			// 							"section_tipo": "'.$section_tipo.'",
			// 							"component_tipo": "'.$component_tipo.'",
			// 							"modelo": "'.$modelo_name.'",
			// 							"name": "term_id"
			// 						}
			// 					]
			// 				}
			// 			]
			// 		}';
			// 		$sqo = json_decode('{
			// 			"parsed": false,
			// 			"section_tipo": "'.$section_tipo.'",
			// 			"limit": 2,
			// 			"offset": 0,
			// 			"type": "search_json_object",
			// 			"full_count": false,
			// 			"order": false,
			// 			"filter": '.$filter_string.',
			// 			"skip_projects_filter": true,
			// 			"select": []
			// 		}');
			// 		$search_development2	= new search_development2($sqo);
			// 		$search_result			= $search_development2->search();
			// 		$ar_records				= $search_result->ar_records;
			// 		$count					= count($ar_records);

			// 		if ($count===1) {
			// 			$tipo 			= ONTOLOGY_SECTION_TIPOS['parent'];
			// 			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			// 			$component 		= component_common::get_instance($modelo_name,
			// 															 $tipo,
			// 															 $section_id,
			// 															 'edit',
			// 															 DEDALO_DATA_NOLAN,
			// 															 $section_tipo);

			// 			$target_section_id = reset($ar_records)->section_id;

			// 			$locator = new locator();
			// 				$locator->set_section_tipo($section_tipo);
			// 				$locator->set_section_id($target_section_id);
			// 				$locator->set_type(DEDALO_RELATION_TYPE_LINK);

			// 			$dato = [$locator];
			// 			$component->set_dato($dato);
			// 			$component->Save();
			// 		}else{
			// 			trigger_error('Parent not found! term_id not exists: '.to_string($value));
			// 		}
			// })($parent);

		// component is_model
			// (function($value) use($section_tipo, $section_id, $lang) {
			// 	$tipo 			= ONTOLOGY_SECTION_TIPOS['is_model'];
			// 	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			// 	$component 		= component_common::get_instance($modelo_name,
			// 													 $tipo,
			// 													 $section_id,
			// 													 'edit',
			// 													 DEDALO_DATA_NOLAN,
			// 													 $section_tipo);

			// 	$target_section_id = ($value==='si')
			// 		? NUMERICAL_MATRIX_VALUE_YES // 1
			// 		: NUMERICAL_MATRIX_VALUE_NO; // 2

			// 	$locator = new locator();
			// 		$locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
			// 		$locator->set_section_id($target_section_id);
			// 		$locator->set_type(DEDALO_RELATION_TYPE_LINK);

			// 	$dato = [$locator];
			// 	$component->set_dato($dato);
			// 	$component->Save();
			// })($is_model);


		return $section_id;
	}//end add_term



	/**
	* EDIT_TERM
	* Edit term in section 'Ontology'.
	* Note on save section finish, also is saved the value in 'matrix_descriptors_dd'
	*
	* @see class section -> post_save_component_processes
	*
	* @param object $options
	* @return bool
	*/
	public static function edit_term(object $options) : bool {

		// options
			$term_id	= $options->term_id; // string as 'dd1582'
			$dato		= $options->dato; // string as 'Oral History'
			$dato_tipo	= $options->dato_tipo; // string options: termino | def | obs
			$lang		= $options->lang; // string as 'lg-spa'

		// check term_id
			if (empty($term_id)) {
				debug_log(__METHOD__." Error on edit_term. Ignored. Empty term_id in options: ".to_string($options), logger::ERROR);
				return false;
			}

		// section_id. search and locate the ontology record by term_id
			$section_id = ontology::get_section_id_by_term_id($term_id);
			// empty case. Create a new one
			if (empty($section_id)) {
				$section_id = ontology::add_term((object)[
					'term_id' => $term_id
				]);
				if (empty($section_id)) {
					// prevent dead loops stopping here !
					throw new Exception("Error. Unable to create term record in Ontology section (term_id:'$term_id')", 1);
				}
				debug_log(__METHOD__." [CREATED] get_section_id_by_term_id section_id +++ section_id: '$section_id' +++ term_id: $term_id", logger::WARNING);
			}

		// update value
			if (!empty($section_id)) {

				// short vars
					$section_tipo	= ONTOLOGY_SECTION_TIPOS['section_tipo'];
					$component_tipo	= (function($dato_tipo){
						switch ($dato_tipo) {
							case 'termino':	return ONTOLOGY_SECTION_TIPOS['term'];			break;
							case 'def':		return ONTOLOGY_SECTION_TIPOS['definition'];	break;
							case 'obs':		return ONTOLOGY_SECTION_TIPOS['observations'];	break;
						}
						return null;
					})($dato_tipo);

				// component save value
				if (!empty($component_tipo)) {

					(function($value) use($section_tipo, $section_id, $component_tipo, $lang, $dato_tipo) {
						// dump($lang, ' $lang ++ component_tipo: '.$component_tipo.' - dato_tipo: '.$dato_tipo. ' - value: '.to_string($value));
						$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
						$component		= component_common::get_instance($modelo_name,
																		 $component_tipo,
																		 $section_id,
																		 'edit',
																		 $lang,
																		 $section_tipo);

						$new_dato = ($modelo_name==='component_input_text') ? [$value] : $value;
						$component->set_dato($new_dato);
						$component->Save();
						// (!) Note that on Save, section exec method post_save_component_processes that saves into RecordObj_descriptors_dd
					})($dato);

					// save ontology object too
						$json_item = ontology::tipo_to_json_item($term_id);
						(function($value) use($section_tipo, $section_id) {

							$component_tipo	= ONTOLOGY_SECTION_TIPOS['json_item']; // expected dd1556
							$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true); // expected component_json
							$component		= component_common::get_instance($modelo_name,
																			 $component_tipo,
																			 $section_id,
																			 'edit',
																			 DEDALO_DATA_NOLAN,
																			 $section_tipo);
							$component->set_dato($value);
							$component->Save();
						})($json_item);

					return true;
				}else{
					trigger_error('edit_term : Invalid component_tipo '.$component_tipo);
				}
			}else{
				trigger_error('edit_term : Invalid section_id '.$section_id);
			}


		return false;
	}//end edit_term



	/**
	* GET_SECTION_ID_BY_TERM_ID
	* Search in DDBB for records in section Ontology where term_id is th request term_id
	* @param string $term_id
	* @return int|null $section_id
	*/
	public static function get_section_id_by_term_id(string $term_id) : ?int {

		$section_tipo	= ONTOLOGY_SECTION_TIPOS['section_tipo'];
		$component_tipo	= ONTOLOGY_SECTION_TIPOS['term_id'];
		$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);

		// filter
			$filter_string = '{
				"$and": [
					{
						"q": "'.$term_id.'",
						"q_operator": "==",
						"q_split": false,
						"unaccent": false,
						"lang": "lg-nolan",
						"path": [
							{
								"section_tipo": "'.$section_tipo.'",
								"component_tipo": "'.$component_tipo.'",
								"modelo": "'.$modelo_name.'",
								"name": "term_id"
							}
						]
					}
				]
			}';
		// sqo (search query object)
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

		$dedalo_version = explode(".", DEDALO_VERSION);
		if ( (int)$dedalo_version[0]>5 ) {
			// v6
			$search		= search::get_instance($sqo);
			$rows_data	= $search->search();
			$ar_records	= $rows_data->ar_records;
		}else{
			// v5
			$search_development2	= new search_development2($sqo);
			$search_result			= $search_development2->search();
			$ar_records				= $search_result->ar_records;
		}

		// total records check
			$count = count($ar_records);
			if ($count===0) {

				// Zero records found. Record do not exists
				debug_log(__METHOD__." count zero. get_section_id_by_term_id " . to_string(), logger::DEBUG);
				if(SHOW_DEBUG===true) {
					// $bt = debug_backtrace();
					// dump($bt, ' bt ++++++++++++++++++++++++++++++++ '.to_string());
					// dump($term_id, ' term_id sqo +++++++ '.to_string($sqo));
				}

				return null;

			}else if ($count===1) {

				// OK case
				return reset($ar_records)->section_id;

			}else{

				// Duplicates found
				if(SHOW_DEBUG===true) {
					dump($count, ' count ++ '.to_string($sqo));
					// $bt = debug_backtrace();
					// dump($bt, ' bt ++++++++++++++++++++++++++++++++ '.to_string());
				}
				$msg = 'ERROR. Term is duplicate. Fix ASAP: '.to_string($term_id);
				// (!) added throw to prevent infinite loop! Do not change this line
				throw new Exception("Error Processing Request.". $msg, 1);
			}


		return null;
	}//end get_section_id_by_term_id



	/**
	* SAVE_JSON_ONTOLOGY_ITEM
	* Saves json_item in matrix_dd section 'Ontology' (dd1500).
	* Search for existing term_id in the section and, creates/updates the record with
	* received json_item data checking if it is different from previous data
	* @param string $term_id
	* 	Like 'rsc368'
	* @param mixed $json_item (object | null)
	* 	object created using method: ontology::tipo_to_json_item($term_id)
	* @return object $response
	*/
	public static function save_json_ontology_item(string $term_id, ?object $json_item=null) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		$section_tipo = ONTOLOGY_SECTION_TIPOS['section_tipo'];

		// section_id. locate the ontology record by term_id
			$section_id = ontology::get_section_id_by_term_id($term_id);
			if (empty($section_id)) {

				// create a new record
				$section_id = ontology::add_term((object)[
					'term_id'	=> $term_id
				]);
				// (!) Note that add_term also add self calculated JSON item
				$response->msg = 'OK. Created a new ontology term record including JSON item '.$term_id.' successfully';
			}


			if (empty($json_item)) {
				$json_item = ontology::tipo_to_json_item($term_id);
			}

			// updated existing record
			$component_tipo	= ONTOLOGY_SECTION_TIPOS['json_item']; // expected dd1556
			$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true); // expected component_json
			$component		= component_common::get_instance(
				$modelo_name,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$current_dato = $component->get_dato();

			// Compare. Use always the comparison operator (==) to compare objects property by property
				$is_equal_object = ($current_dato==$json_item);

			if ($is_equal_object===false) {
				$component->set_dato($json_item);
				$component->Save();
				$response->msg = 'OK. JSON item '.$term_id.' saved successfully';
			}else{
				$response->msg = 'OK. JSON item '.$term_id.' save IGNORED. The new data is equal than already existing data';
			}


		$response->result = true;

		// debug
			debug_log(__METHOD__
				." $response->msg "
				, logger::DEBUG
			);


		return $response;
	}//end save_json_ontology_item



	/**
	* UPDATE_JSON_ONTOLOGY_ITEMS
	* Called from trigger tool administration to propagate values from Ontology (structure).
	* Propagate (save/update) current Ontology data to the section 'Ontology' (dd1500) at 'JSON Ontology Item' field. Only changes will be saved
	* @return object $response
	*/
	public static function update_json_ontology_items() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// get all terms
		$sql_query = '
			create or replace function naturalsort(text)
			    returns bytea language sql immutable strict as $f$
			    select string_agg(convert_to(coalesce(r[2], length(length(r[1])::text) || length(r[1])::text || r[1]), \'SQL_ASCII\'),\'\x00\')
			    from regexp_matches($1, \'0*([0-9]+)|([^0-9]+)\', \'g\') r;
			$f$;
			SELECT "terminoID" FROM "jer_dd" WHERE tld!=\'test\' ORDER BY naturalsort("terminoID") ASC;
		';
		$result		= pg_query(DBi::_getConnection(), $sql_query);
		while ($row = pg_fetch_assoc($result)) {

			$terminoID = $row['terminoID'];

			// JSON Ontology Item save
				$term_id	= $terminoID;
				$json_item	= ontology::tipo_to_json_item($term_id);
				$save_item	= ontology::save_json_ontology_item($term_id, null);

			debug_log(__METHOD__." ---> Added/updated term: ".to_string($terminoID).PHP_EOL.$save_item->msg, logger::WARNING);
		}

		$response->result	= true;
		$response->msg		= 'OK. Request done successfully';


		return $response;
	}//end update_json_ontology_items



}//end ontology




/*
DBi::_getConnection();
include('class.RecordObj_dd_edit.php');
$ontology_data = json_decode('[
  {
    "tipo": "oh81",
    "tld": "oh",
    "model": "section_tool",
    "model_tipo": "dd125",
    "parent": "oh80",
    "order": 1,
    "translatable": false,
    "properties": {
      "context": {
        "context_name": "section_tool",
        "tool_section_tipo": "oh81",
        "top_tipo": "oh1",
        "target_section_tipo": "rsc167",
        "target_component_tipo": "rsc35",
        "target_tool": "tool_transcription",
        "prueba":"Hola test 7"
      }
    },
    "relations": null,
    "descriptors": [
      {
        "value": "Transcription nuevisimo",
        "lang": "lg-eng",
        "type": "term"
      },
      {
        "value": "Transcripción entrevistas",
        "lang": "lg-spa",
        "type": "term"
      },
      {
        "value": "Transcripció dentrevistes",
        "lang": "lg-cat",
        "type": "term"
      },
      {
        "value": "Μεταγραφή συνεντεύξεις",
        "lang": "lg-ell",
        "type": "term"
      }
    ]
  },
  {
    "tipo": "oh82",
    "tld": "oh",
    "model": "section_list",
    "model_tipo": "dd91",
    "parent": "oh81",
    "order": 1,
    "translatable": false,
    "properties": null,
    "relations": [
      {
        "tipo": "rsc21"
      },
      {
        "tipo": "rsc19"
      },
      {
        "tipo": "rsc23"
      },
      {
        "tipo": "rsc263"
      },
      {
        "tipo": "rsc36"
      },
      {
        "tipo": "rsc244"
      },
      {
        "tipo": "rsc35"
      }
    ],
    "descriptors": [
      {
        "value": "Listado",
        "lang": "lg-spa",
        "type": "term"
      },
      {
        "value": "Llistat",
        "lang": "lg-cat",
        "type": "term"
      },
      {
        "value": "List",
        "lang": "lg-eng",
        "type": "term"
      }
    ]
  }
]');
#ontology::import($ontology_data);
ontology::import_tools();
*/
