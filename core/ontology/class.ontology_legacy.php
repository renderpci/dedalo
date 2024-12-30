<?php declare(strict_types=1);

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
* ONTOLOGY_legacy
* Manages structure (ontology) import and export data
* Useful for developers to create tools structure data
*/
class ontology_legacy {



	/**
	* EXPORT
	* @param string $tipo
	* @return array $ar_data
	*/
	public static function export(string $tipo) : array {

		$ar_data = ontology_legacy::parse($tipo);

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
			$item = ontology_legacy::tipo_to_json_item($tipo);
			$ar_data[] = $item;

		// children
			$children = RecordObj_dd::get_ar_recursive_childrens($tipo);
			foreach ($children as $children_tipo) {
				$ar_data[] = ontology_legacy::tipo_to_json_item($children_tipo);
			}

		return $ar_data;
	}//end parse



	/**
	* TIPO_TO_JSON_ITEM
	* This is a normalized Ontology JSON item.
	* Basically, is a jerd_dd record, but with parsed JSON values and translated property names.
	* Fills requested ontology item data resolving tipo
	* @param string $tipo
	* @param array $options = []
	* @return object $item
	*/
	public static function tipo_to_json_item( string $tipo, array $options=[] ) : object {

		// default options fallback
		if (empty($options)) {
			$options = [
				'tipo',
				'tld',
				'is_model',
				'model',
				'model_tipo',
				'parent',
				'order',
				'translatable',
				'propiedades',
				'properties',
				'relations',
				'term',
				// 'label'
			];
		}

		$RecordObj_dd = new RecordObj_dd($tipo);
		$RecordObj_dd->use_cache = false; // (!) prevents using previous db results
		$RecordObj_dd->get_dato();

		$item = new stdClass();

		foreach ($options as $property) {
			switch ($property) {
				case 'tipo':
					$item->{$property} = $tipo;
					break;
				case 'model':
					// $item->{$property} = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
					$item->{$property} = $RecordObj_dd->get_modelo_name();
					break;
				case 'model_tipo':
					$item->{$property} = $RecordObj_dd->get_modelo();
					break;
				case 'translatable':
					$item->{$property} = $RecordObj_dd->get_traducible()==='si';
					break;
				case 'propiedades':
					$item->{$property} = $RecordObj_dd->get_propiedades(true);
					break;
				case 'label':
					$term = $RecordObj_dd->get_term() ?? new stdClass();
					$label = $term->{DEDALO_APPLICATION_LANG} ?? $term->{DEDALO_STRUCTURE_LANG} ?? null;
					if (is_null($label)) {
						// fallback to anything
						foreach ($term as $value) {
							$label = $value;
							break;
						}
					}
					$item->{$property} = $label;
					break;
				default:
					$item->{$property} = $RecordObj_dd->{'get_'.$property}();
			}
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

		foreach ($data as $item) {

			if (empty($item) || !isset($item->tld)) {
				debug_log(__METHOD__." Ignored empty item on import ".to_string(), logger::ERROR);
				continue;
			}

			// term. jer_dd
				$esmodelo	= $item->is_model ?? 'no';
				$traducible	= $item->translatable===true ? 'si' : 'no';

				$RecordObj_dd = new RecordObj_dd(null, $item->tld);

				$RecordObj_dd->set_terminoID($item->tipo);
				$RecordObj_dd->set_esdescriptor('si');
				$RecordObj_dd->set_esdescriptor('si');
				$RecordObj_dd->set_visible('si');
				$RecordObj_dd->set_parent($item->parent);
				$RecordObj_dd->set_esmodelo($esmodelo);
				$RecordObj_dd->set_norden($item->order);
				$RecordObj_dd->set_traducible($traducible);
				$RecordObj_dd->set_relaciones($item->relations);
				$RecordObj_dd->set_properties($item->properties);
				$RecordObj_dd->set_modelo($item->model_tipo);
				$RecordObj_dd->set_tld($item->tld);
				$RecordObj_dd->set_term($item->term);

				$term_id = $RecordObj_dd->Save();

		}//end foreach ($data as $key => $item)


		return true;
	}//end import



	/**
	* GET_TLD_RECORDS
	* Get all record in jer_dd table for specific tld (dd, rsc, ...)
	* @param string $tld
	* @return array $tld_records
	*/
	public static function get_tld_records(string $tld) : array {

		// jer_dd. get all rows from jer_dd with match with the tld
			$sql_query = '
				SELECT * FROM "jer_dd" WHERE "tld" = \''.$tld.'\';
			';
			$jer_dd_result = pg_query(DBi::_getConnection(), $sql_query);

		// iterate jer_dd_result row
			$tld_records = [];
			while($row = pg_fetch_object($jer_dd_result)) {
				$tld_records[] = $row;
			}


		return $tld_records;
	}//end get_tld_records



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
				$ar_elements[]	= ontology_legacy::tipo_to_json_item($element_tipo, [
					'tipo',
					'model',
					'parent',
					'order',
					'label'
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
			$tld = get_tld_from_tipo($term_id);
			if (empty($tld)) {
				debug_log(__METHOD__." Error on add_term. Ignored. Empty term_id in options: ".to_string($options), logger::ERROR);
				return false;
			}

		// id
			$id = str_replace($tld, '', $term_id); // remove tld. from 'oh123' to '123'. id is a internal counter and it is not saved or set to the object

		// verify if term already exists in the section
			// section_id. search and locate the ontology record by term_id
			$section_id = ontology_legacy::get_section_id_by_term_id($term_id);
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
				$json_item	= ontology_legacy::tipo_to_json_item($term_id);
			}
			$save_item	= ontology_legacy::save_json_ontology_item($term_id, $json_item);	// returns object response

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
	* @param object $options
	* @return bool
	*/
	public static function edit_term(object $options) : bool {

		// options
			$term_id	= $options->term_id; // string as 'dd1582'
			$value		= $options->value; // string as 'Oral History'
			$lang		= $options->lang; // string as 'lg-spa'

		// check term_id
			if (empty($term_id)) {
				debug_log(__METHOD__
					." Error on edit_term. Ignored. Empty term_id in options: "
					.' options: ' . to_string($options)
					, logger::ERROR
				);
				return false;
			}

		// section_id. search and locate the ontology record by term_id
			$section_id = ontology_legacy::get_section_id_by_term_id($term_id);
			// empty case. Create a new one
			if (empty($section_id)) {
				$section_id = ontology_legacy::add_term((object)[
					'term_id' => $term_id
				]);
				if (empty($section_id)) {
					// prevent dead loops stopping here !
					debug_log(__METHOD__
						. " Error. Unable to create term record in Ontology section" . PHP_EOL
						. ' term_id: ' . to_string($term_id)
						, logger::ERROR
					);
					return false;
				}
				debug_log(__METHOD__
					." [CREATED] get_section_id_by_term_id section_id +++ section_id: '$section_id' +++ term_id: $term_id"
					, logger::WARNING
				);
			}

		// short vars
			$section_tipo	= ONTOLOGY_SECTION_TIPOS['section_tipo'];
			$component_tipo	= ONTOLOGY_SECTION_TIPOS['term'];
			$dato_tipo		= 'termino';

		// component save value
			$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$modelo_name,
				$component_tipo,
				$section_id,
				'edit',
				$lang,
				$section_tipo
			);

			$new_dato = ($modelo_name==='component_input_text') ? [$value] : $value;
			$component->set_dato($new_dato);
			$component->Save();

		// save ontology object too
			$json_item = ontology_legacy::tipo_to_json_item($term_id);
			(function($value) use($section_tipo, $section_id) {

				$component_tipo	= ONTOLOGY_SECTION_TIPOS['json_item']; // expected dd1556
				$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true); // expected component_json
				$component		= component_common::get_instance(
					$modelo_name,
					$component_tipo,
					$section_id,
					'edit',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				$component->set_dato($value);
				$component->Save();
			})($json_item);


		return true;
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
	* 	object created using method: ontology_legacy::tipo_to_json_item($term_id)
	* @return object $response
	*/
	public static function save_json_ontology_item(string $term_id, ?object $json_item=null) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		$section_tipo = ONTOLOGY_SECTION_TIPOS['section_tipo'];

		// section_id. locate the ontology record by term_id
			$section_id = ontology_legacy::get_section_id_by_term_id($term_id);
			if (empty($section_id)) {

				// create a new record
				$section_id = ontology_legacy::add_term((object)[
					'term_id'	=> $term_id
				]);
				// (!) Note that add_term also add self calculated JSON item
				$response->msg = 'OK. Created a new ontology term record including JSON item '.$term_id.' successfully';
			}

			if (empty($json_item)) {
				$json_item = ontology_legacy::tipo_to_json_item($term_id);
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

			$term_id = $row['terminoID'];

			// JSON Ontology Item save
				$save_item	= ontology_legacy::save_json_ontology_item($term_id, null);

			debug_log(__METHOD__
				." ---> Added/updated term: ".to_string($term_id) . PHP_EOL
				.$save_item->msg
				, logger::WARNING
			);
		}

		$response->result	= true;
		$response->msg		= 'OK. Request done successfully';


		return $response;
	}//end update_json_ontology_items



}//end ontology_legacy
