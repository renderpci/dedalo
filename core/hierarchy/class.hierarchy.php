<?php declare(strict_types=1);
/**
* HIERARCHY
* Centralized hierarchy methods
*/
class hierarchy extends ontology {



	// Table where hierarchy data is stored
	static $main_table			= 'matrix_hierarchy_main';
	static $main_section_tipo	= 'hierarchy1';

	// array hierarchy_portals_tipo
	// store hierarchy portals data (former component_relation_children, now component_portal)
	static $hierarchy_portals_tipo = [
		DEDALO_HIERARCHY_CHILDREN_TIPO, // hierarchy45 hierarchy main: General term
		DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO // hierarchy59 hierarchy main: General term model
	];


	/**
	* GET_DEFAULT_SECTION_TIPO_TERM
	* @param string $tld
	* 	Sample: 'es'
	* @return string $default_section_tipo_term
	* 	Sample 'es1'
	*/
	public static function get_default_section_tipo_term(string $tld) : string {

		$default_section_tipo_term = strtolower($tld) . '1';

		return $default_section_tipo_term;
	}//end get_default_section_tipo_term



	/**
	* GET_DEFAULT_SECTION_TIPO_MODEL
	* @param string $tld
	* 	Sample: 'es'
	* @return string $default_section_tipo_model
	* 	Sample 'es2'
	*/
	public static function get_default_section_tipo_model(string $tld) : string {

		$default_section_tipo_model = strtolower($tld) . '2';

		return $default_section_tipo_model;
	}//end get_default_section_tipo_model



	/**
	* GENERATE_VIRTUAL_SECTION
	* Create two sections used by thesaurus to manage the descriptors and model/typologies
	* Descriptors are the main thesaurus section with the terms (Valencia, Amphorae, etc), and is defined with the tld & 1 as es1, object1, etc.
	* Model/typologies are secondary thesaurus section used to disambiguation the descriptor (City, Black, etc...) and is defined with the tld & 2 as es2, object2, etc.
	* Note: Virtual sections not contains components, they inheritance all definition from real sections.
	* (`es1` is a section that use of the `hierarchy20` definition)
	* @param object $options
	* Sample:
	* {
	* 	section_id : 3,
	* 	section_tipo : 'hierarchy1'
	* }
	* @return object $response
	*/
	public static function generate_virtual_section(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ';
			$response->errors	= [];

		// options
			$section_id		= $options->section_id;
			$section_tipo	= $options->section_tipo;

		// check active
			$active_tipo	= DEDALO_HIERARCHY_ACTIVE_TIPO;	// 'hierarchy4';
			$model_name		= ontology_node::get_modelo_name_by_tipo($active_tipo, true);
			$component		= component_common::get_instance(
				$model_name,
				$active_tipo,
				$section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$dato		= $component->get_dato();
			$locator	= $dato[0] ?? null;
			if( empty($locator) ||
				!isset($locator->section_tipo) || $locator->section_tipo!==DEDALO_SECTION_SI_NO_TIPO ||
				!isset($locator->section_id) || $locator->section_id!=NUMERICAL_MATRIX_VALUE_YES) {

				// Error: Current hierarchy is not active. Stop here (!)

				$response->result	= false;
				$response->msg		.= label::get_label('error_generate_hierarchy');
				$response->errors[]	= 'Empty hierarchy active value: ' . $active_tipo;
				debug_log(__METHOD__ .PHP_EOL
					.' msg: ' . $response->msg
					, logger::ERROR
				);
				return $response;
			}

		// check tld
			$tld2_tipo	= DEDALO_HIERARCHY_TLD2_TIPO;	// 'hierarchy6';
			$model_name	= ontology_node::get_modelo_name_by_tipo($tld2_tipo, true);
			$component	= component_common::get_instance(
				$model_name,
				$tld2_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$dato		= $component->get_dato();
			$first_dato	= $dato[0] ?? null;
			$tld2		= !empty($first_dato)
				? strtolower( $first_dato )
				: $first_dato;
			if (empty($tld2)) {

				// Error: TLD2 is mandatory

				$response->result	= false;
				$response->msg		.= 'Error on get tld2. Empty value (tld is mandatory)';
				$response->errors[]	= 'Empty hierarchy tld value: ' . $tld2_tipo;
				debug_log(__METHOD__ .PHP_EOL
					." msg: ". $response->msg
					, logger::ERROR
				);
				return $response;
			}

		// source_real_section_tipo
			$model_name	= ontology_node::get_modelo_name_by_tipo(DEDALO_HIERARCHY_SOURCE_REAL_SECTION_TIPO,true);
			$component	= component_common::get_instance(
				$model_name,
				DEDALO_HIERARCHY_SOURCE_REAL_SECTION_TIPO,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$dato				= $component->get_dato();
			$real_section_tipo	= $dato[0] ?? false;
			if (empty($real_section_tipo)) {

				// Error: source_real_section_tipo is mandatory

				$response->result	= false;
				$response->msg		.= 'Error on get source_real_section_tipo. Empty value (source_real_section_tipo is mandatory)';
				$response->errors[]	= 'Empty source section_tipo value: ' . DEDALO_HIERARCHY_SOURCE_REAL_SECTION_TIPO;
				debug_log(__METHOD__ .PHP_EOL
					." msg: ". $response->msg
					, logger::ERROR
				);
				return $response;
			}
			$real_section_model_name = ontology_node::get_modelo_name_by_tipo($real_section_tipo, true);
			if ($real_section_model_name!=='section') {

				// Error: source_real_section_tipo is not a section !

				$response->result	= false;
				$response->msg		.= 'Error on get source_real_section_tipo. Invalid model (only sections tipo are valid)';
				$response->errors[]	= 'Invalid source section_tipo model: ' . $real_section_model_name;
				debug_log(__METHOD__ .PHP_EOL
					." msg: ". $response->msg
					, logger::ERROR
				);
				return $response;
			}

		// typology (of hierarchy)
			$hierarchy_type	= DEDALO_HIERARCHY_TYPOLOGY_TIPO;
			$model_name		= ontology_node::get_modelo_name_by_tipo($hierarchy_type, true);
			$component		= component_common::get_instance(
				$model_name,
				$hierarchy_type,
				$section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$hierarchy_type_dato = $component->get_dato();
			$is_toponymy = (isset($hierarchy_type_dato[0]) && isset($hierarchy_type_dato[0]->section_id) && $hierarchy_type_dato[0]->section_id=='2')
				? true
				: false;
			$typology_id = isset($hierarchy_type_dato[0])
				? (int)$hierarchy_type_dato[0]->section_id
				: 0;
			if ($typology_id<1) {

				// Error: typology (select Thematic, Toponymy, etc..) is mandatory

				$response->result	= false;
				$response->msg		.= 'Error on get typology. Empty value (typology is mandatory)';
				$response->errors[]	= 'Invalid typology';
				debug_log(__METHOD__ .PHP_EOL
					." msg: ".$response->msg
					, logger::ERROR
				);
				return $response;
			}

		// name
			$name_tipo	= DEDALO_HIERARCHY_TERM_TIPO;	//'hierarchy5';
			$model_name	= ontology_node::get_modelo_name_by_tipo($name_tipo, true);
			$component	= component_common::get_instance(
				$model_name,
				$name_tipo,
				$section_id,
				'edit',
				DEDALO_DATA_LANG,
				$section_tipo
			);
			$dato_fallback = component_common::extract_component_dato_fallback(
				$component,
				DEDALO_DATA_LANG, // lang
				DEDALO_DATA_LANG_DEFAULT // main_lang
			);
			$name = $dato_fallback[0] ?? null;
			if (empty($name)) {
				$name = 'Hierarchy ' . $tld2;
			}
			$name_data = $component->get_dato_full();

		// -------- VIRTUAL SECTION --------

		// ontology main. Create a new ontology main section if not already exists
			$main_options = new stdClass();
				$main_options->tld			= $tld2;
				$main_options->typology_id	= $typology_id;
				$main_options->name_data	= $name_data;
			ontology::add_main_section( $main_options );

		// ontology nodes
		// Create two different nodes:
		// 1. main section for the thesaurus descriptors. as ts1, es1, etc.
		// 2. main section for the thesaurus models/typologies. ts2, es2, etc

			// virtual section
			// create the ontology node, save it, and process the `jer_dd`
			// It uses a template to build the ontology node data

				// ontology table record template data
					$section_data_string	= file_get_contents( DEDALO_CORE_PATH.'/ontology/templates/virtual_section_data.json' );
					$section_data			= json_handler::decode( $section_data_string );
					if (!is_object($section_data)) {
						$response->result	= false;
						$response->msg		.= 'Error on get section data from file virtual_section_data.json';
						$response->errors[]	= 'Invalid JSON section data from file';
						debug_log(__METHOD__ .PHP_EOL
							." msg: ".$response->msg
							, logger::ERROR
						);
						return $response;
					}

				// tld
					$section_data->components->ontology7->dato->{DEDALO_DATA_NOLAN} = [$tld2];

				// Name
					$section_data->components->ontology5->dato = $name_data;

				// model
					$model_locator = new locator();
						$model_locator->set_type( 'dd151' );
						$model_locator->set_section_tipo( DEDALO_SECTION_SI_NO_TIPO );
						$model_locator->set_section_id( NUMERICAL_MATRIX_VALUE_NO );
						$model_locator->set_from_component_tipo( 'ontology30' );

					$section_data->relations[] = $model_locator;

				// relations
					$relation_section_tipo	= get_tld_from_tipo( $real_section_tipo ).'0';
					$relation_section_id	= get_section_id_from_tipo( $real_section_tipo );

					$relation_locator = new locator();
						$relation_locator->set_type( 'dd151' );
						$relation_locator->set_section_tipo( $relation_section_tipo );
						$relation_locator->set_section_id( $relation_section_id );
						$relation_locator->set_from_component_tipo( 'ontology10' );

					$section_data->relations[] = $relation_locator;

				// virtual section
					$section = section::get_instance(
						1, // string|null section_id
						$tld2.'0' // string section_tipo
					);

					$section->forced_create_record();
					// save section
					$section->set_dato( $section_data );
					$section->Save();

				// parent grouper
					$parent_grouper_tipo = ontology::create_parent_grouper('hierarchy56', 'hierarchytype', $typology_id);

					$parent_tld			= get_tld_from_tipo( $parent_grouper_tipo );
					$parent_section_id	= get_section_id_from_tipo( $parent_grouper_tipo );
					$parent_node_tipo 	= $parent_tld.'0';

					$parent_tipo		= 'ontology15';
					$parent_model		= ontology_node::get_modelo_name_by_tipo( $parent_tipo );
					$component_parent	= component_common::get_instance(
						$parent_model, // string model
						$parent_tipo, // string tipo
						'1', // string section_id
						'list', // string mode
						DEDALO_DATA_NOLAN, // string lang
						$tld2.'0' // string section_tipo
					);

					$parent_locator = new locator();
						$parent_locator->set_section_tipo( $parent_node_tipo );
						$parent_locator->set_section_id( $parent_section_id );

					$component_parent->set_dato( $parent_locator );
					$component_parent->Save();

				// insert the node in jer_dd
					ontology::insert_jer_dd_record($tld2.'0', 1);

			// virtual model section
				// modify the section data to use it as model.
					foreach ($section_data->relations as $key => $current_locator) {
						// replace the model locator to yes
						if($current_locator->from_component_tipo==='ontology30' ){
							$current_locator->section_id = (string)NUMERICAL_MATRIX_VALUE_YES;
						}
					}

				// virtual model section
					$model_section = section::get_instance(
						2, // string|null section_id
						$tld2.'0' // string section_tipo
					);
					$model_section->forced_create_record();
					// save section
						$model_section->set_dato( $section_data );
						$model_section->Save();

					// parent
						$parent_model_grouper_tipo = ontology::create_parent_grouper('hierarchy57', 'hierarchymtype', $typology_id);

						$parent_model_tld	= get_tld_from_tipo( $parent_model_grouper_tipo );
						$parent_section_id	= get_section_id_from_tipo( $parent_model_grouper_tipo );
						$parent_node_tipo	= $parent_model_tld.'0';

						$parent_tipo		= 'ontology15';
						$parent_model		= ontology_node::get_modelo_name_by_tipo( $parent_tipo );
						$component_model_parent	= component_common::get_instance(
							$parent_model, // string model
							$parent_tipo, // string tipo
							'2', // string section_id
							'list', // string mode
							DEDALO_DATA_NOLAN, // string lang
							$tld2.'0' // string section_tipo
						);

						$parent_model_locator = new locator();
							$parent_model_locator->set_section_tipo( $parent_node_tipo );
							$parent_model_locator->set_section_id( $parent_section_id );

						$component_model_parent->set_dato( $parent_model_locator );
						$component_model_parent->Save();

					// insert the model node in jer_dd
						ontology::insert_jer_dd_record($tld2.'0', 2);

			// set permissions. Allow current user access to created default sections
			// as es1, es2
				$ar_section_tipo	= [$tld2.'1', $tld2.'2'];
				$user_id			= logged_user_id();

				$set_permissions_result = component_security_access::set_section_permissions((object)[
					'ar_section_tipo'	=> $ar_section_tipo,
					'user_id'			=> $user_id,
					'permissions'		=> 2
				]);
				if ($set_permissions_result===false) {
					debug_log(__METHOD__
						. " Error: Unable to set access permissions to current user: $user_id  ".PHP_EOL
						. ' ar_section_tipo: '.to_string($ar_section_tipo),
						logger::ERROR
					);
					$response->errors[] = 'Error setting permissions for current user';
				}

			// target section with the created sections
			// when the process was finished insert the target section into the components
				$target_tipo				= DEDALO_HIERARCHY_TARGET_SECTION_TIPO;	//'hierarchy53';
				$model_name					= ontology_node::get_modelo_name_by_tipo($target_tipo, true);
				$component_target_section	= component_common::get_instance(
					$model_name,
					$target_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				$component_target_section->set_dato( $tld2.'1' );
				$component_target_section->Save();

				$target_model_tipo				= DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO;	//'hierarchy53';
				$model_name						= ontology_node::get_modelo_name_by_tipo($target_model_tipo, true);
				$component_target_model_section	= component_common::get_instance(
					$model_name,
					$target_model_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				$component_target_model_section->set_dato( $tld2.'2' );
				$component_target_model_section->Save();

		// response OK
			$response->result = true;
			$response->msg = count($response->errors)===0
				? 'Request done successfully'
				: 'Request done with errors';


		return $response;
	}//end generate_virtual_section



	/**
	* GET_MAIN_LANG
	* Search in section HIERARCHY (DEDALO_HIERARCHY_SECTION_TIPO) the lang for requested 'thesaurus' section by section_tipo
	* Do a direct db search request for speed and store results in a static var for avoid resolve the same main_lang twice
	* Speed here is very important because this method is basic for thesaurus sections defined in hierarchies
	* @param string $section_tipo
	* @return string $main_lang
	*/
	public static function get_main_lang( string $section_tipo ) : string {

		// Always fixed langs root term as English
			if ($section_tipo==='lg1') {
				return 'lg-eng';
			}

		// cache
			static $cache_main_lang;
			if(isset($cache_main_lang[$section_tipo])) {
				return $cache_main_lang[$section_tipo];
			}

		// default value
			$main_lang		= null;
			$fallback_value	= 'lg-eng';

		// short vars
			$matrix_table			= 'matrix_hierarchy_main';
			$hierarchy_section_tipo	= DEDALO_HIERARCHY_SECTION_TIPO;
			$hierarchy_tld_tipo		= DEDALO_HIERARCHY_TLD2_TIPO;
			$lang					= DEDALO_DATA_NOLAN;
			$prefix					= get_tld_from_tipo($section_tipo);
			$prefix_lower			= strtolower($prefix); // data is stored always in uppercase
			$prefix_upper			= strtoupper($prefix); // data is stored always in uppercase

		// SQL query
			$strQuery  = '-- '.__METHOD__;
			$strQuery .= "\nSELECT section_id, datos#>'{relations}' AS relations \nFROM $matrix_table WHERE";
			$strQuery .= "\n section_tipo = '$hierarchy_section_tipo' AND";
			$strQuery .= "\n (datos#>'{components,$hierarchy_tld_tipo,dato,$lang}' ? '$prefix_lower' "; // Now hierarchy tld is an array
			$strQuery .= " OR datos#>'{components,$hierarchy_tld_tipo,dato,$lang}' ? '$prefix_upper') ";
			$strQuery .= "\n LIMIT 1 ;";

		// search
			$result		= JSON_RecordObj_matrix::search_free($strQuery);
			while ($row = pg_fetch_assoc($result)) {

				$relations = json_handler::decode($row['relations']);

				// resolve locator
					$main_lang_locator = array_find( (array)$relations, function($el){
						return (isset($el->from_component_tipo) && $el->from_component_tipo===DEDALO_HIERARCHY_LANG_TIPO);
					});
					if (!is_object($main_lang_locator)) {
						debug_log(__METHOD__
							. " Empty main_lang_locator. not found into section relations. Fallback will be applied ($fallback_value)" . PHP_EOL
							.' section_tipo: ' . $section_tipo . PHP_EOL
							.' relations: ' . to_string($relations)
							, logger::ERROR
						);
					}else{
						$main_lang = lang::get_code_from_locator(
							$main_lang_locator,
							true // bool add_prefix
						);
					}

				// only first record is used (limit = 1)
				break;
			}//end while

		// fallback empty value
			if (empty($main_lang)) {
				switch (true) {
					case ($section_tipo==='es1'):
						$main_lang = 'lg-spa';
						break;
					case ($section_tipo===DEDALO_HIERARCHY_SECTION_TIPO): // hierarchy1
						$main_lang = DEDALO_DATA_LANG_DEFAULT;
						break;
					default:
						$main_lang = $fallback_value;
						break;
				}
				debug_log(__METHOD__
					." Unable to get main lang for section. Fallback applied for safe lang to: $main_lang " . PHP_EOL
					.' section_tipo: ' . $section_tipo . PHP_EOL
					.' main_lang: ' . $main_lang
					, logger::WARNING
				);
			}

		// store cache
			$cache_main_lang[$section_tipo] = $main_lang;


		return $main_lang;
	}//end get_main_lang



	/**
	* GET_ALL_TABLES
	* Return array of unique tables of requested hierarchy sections
	* @param array $ar_section_tipo
	* 	Format like [0] => lg1
	*			    [2] => ts1
	* @return array $all_tables
	*/
	public static function get_all_tables( array $ar_section_tipo ) : array {

		$all_tables = [];
		foreach ($ar_section_tipo as $section_tipo) {
			$table = common::get_matrix_table_from_tipo($section_tipo);
			if (!empty($table) && !in_array($table, $all_tables)) {
				$all_tables[] = $table;
			}
		}

		return $all_tables;
	}//end get_all_tables



	/**
	* GET_ELEMENT_TIPO_FROM_SECTION_MAP
	* Search in section_map the current request element,
	* For example, search for term tipo, children element tipo, etc..
	* @param string $section_tipo
	* @param string $type
	* @return string|null $element_tipo
	*/
	public static function get_element_tipo_from_section_map( string $section_tipo, string $type ) : ?string {

		$element_tipo = null;

		// Search map
		$ar_elements = hierarchy::get_section_map_elemets($section_tipo);

		// sample
		// {
		//     "thesaurus": {
		//         "term": "hierarchy25",
		//         "model": "hierarchy27",
		//         "parent": "hierarchy36",
		//         "is_indexable": "hierarchy24",
		//         "is_descriptor": "hierarchy23"
		//     }
		// }

		if (!empty($ar_elements)) {
			foreach ($ar_elements as $object_value) {
				if (property_exists($object_value, $type)) {
					$element_tipo = $object_value->{$type};
					break;
				}
			}
		}


		return $element_tipo;
	}//end get_element_tipo_from_section_map



	/**
	* GET_SECTION_MAP_ELEMETS
	* Get elements from section_list_thesaurus -> properties
	* @param string $section_tipo
	* @return array ar_elements
	*/
	public static function get_section_map_elemets( string $section_tipo ) : array {

		$ar_elements = array();

		if (empty($section_tipo)) {
			return $ar_elements;
		}

		static $section_map_elemets_cache;
		if (isset($section_map_elemets_cache[$section_tipo])) {
			return $section_map_elemets_cache[$section_tipo];
		}

		// Elements are stored in current section > section_map
		// Search element in current section
		$ar_modelo_name_required = ['section_map'];

		// Search in current section
		$ar_children  = section::get_ar_children_tipo_by_model_name_in_section(
			$section_tipo,
			$ar_modelo_name_required,
			true, // bool from_cache
			false, // bool resolve_virtual
			false, // bool recursive
			true // bool search_exact
		);
		// Fallback to real section when in virtual
		if (!isset($ar_children[0])) {
			$section_real_tipo = section::get_section_real_tipo_static($section_tipo);
			if ($section_tipo!==$section_real_tipo) {
				$ar_children  = section::get_ar_children_tipo_by_model_name_in_section(
					$section_real_tipo,
					$ar_modelo_name_required,
					true, // bool from_cache
					false, // bool resolve_virtual
					false, // bool recursive
					true // bool search_exact
				);
			}
		}//end if (!isset($ar_children[0]))

		// If element exists (section_map) we get element 'properties' json value as array
		if (isset($ar_children[0])) {

			$section_map_tipo = $ar_children[0];

			// relation map
			$ontology_node	= new ontology_node($section_map_tipo);
			$ar_properties	= $ontology_node->get_properties();

			$ar_elements = (array)$ar_properties;
		}

		// Set static var for re-use
		$section_map_elemets_cache[$section_tipo] = $ar_elements;


		return (array)$ar_elements;
	}//end get_section_map_elemets



	/**
	* GET_HIERARCHY_SECTION
	* Search hierarchy sections by target section_tipo and
	* get result section_id
	* @param $section_tipo
	*	Source section_tipo
	* @param $hierarchy_component_tipo
	*	Target component tipo where search section_tipo
	* @return int|null $section_id
	*/
	public static function get_hierarchy_section(string $section_tipo, string $hierarchy_component_tipo) : ?int {

		$model = ontology_node::get_modelo_name_by_tipo($hierarchy_component_tipo,true);

		// search query object
			$search_query_object = json_decode('{
			  "section_tipo": "'.DEDALO_HIERARCHY_SECTION_TIPO.'",
			  "filter": {
				"$and": [
				  {
					"q": "'.$section_tipo.'",
					"path": [
					  {
						"section_tipo": "'.DEDALO_HIERARCHY_SECTION_TIPO.'",
						"component_tipo": "'.$hierarchy_component_tipo.'",
						"model": "'.$model.'",
						"name": "'.$model.' '.$hierarchy_component_tipo.'"
					  }
					]
				  }
				]
			  }
			}');

		// search
			$search			= search::get_instance($search_query_object);
			$search_result	= $search->search();
			$record			= reset($search_result->ar_records);

		// section id
			$section_id = isset($record->section_id) ? (int)$record->section_id : null;


		return $section_id;
	}//end get_hierarchy_section



	/**
	* GET_HIERARCHY_BY_TLD
	* Search hierarchy sections by tld and
	* get result section_id
	* @param $tld
	*	tld like 'es'
	* @return object $response
	*/
	public static function get_hierarchy_by_tld( string $tld ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// short vars
			$table			= self::$main_table; // expected 'matrix_hierarchy_main'
			$section_tipo	= DEDALO_HIERARCHY_SECTION_TIPO;

		$sql = '
			SELECT section_id
			FROM "'.$table.'"
			WHERE
			section_tipo = \''.$section_tipo.'\' AND
			f_unaccent(matrix_hierarchy_main.datos#>>\'{components,hierarchy6,dato}\') ~* f_unaccent(\'.*\["'.$tld.'"\].*\')
		';
		// debug info
		debug_log(__METHOD__
			." Executing DB query ".to_string($sql)
			, logger::WARNING
		);

		$result = pg_query(DBi::_getConnection(), $sql);
		if ($result===false) {
			$msg = " Error on db execution (get_hierarchy_by_tld): ".pg_last_error(DBi::_getConnection());
			debug_log(__METHOD__
				. $msg
				, logger::ERROR
			);
			$response->errors[] = $msg;

			return $response; // return error here !
		}
		$rows	= pg_fetch_assoc($result);
		$value	= !empty($rows) ? reset($rows) : null;

		$response->result	= $value ?? null;
		$response->msg		= 'OK. Request done';


		return $response;
	}//end get_hierarchy_by_tld



	/**
	* EXPORT_HIERARCHY
	* For MASTER toponymy export
	* @param string $section_tipo
	* 	Could be '*', 'all', and comma separated list too as 'ts1,es1,fr1'
	* @return object $response
	*/
	public static function export_hierarchy( string $section_tipo ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		// EXPORT_HIERARCHY_PATH check
			if (!defined('EXPORT_HIERARCHY_PATH')) {
				$response->errors[] = 'var EXPORT_HIERARCHY_PATH is not defined';
				return $response;
			}

		// ar_section_tipo (target section tipo list)
			if ($section_tipo==='*') {

				$active_hierarchies = hierarchy::get_active_elements();

				$ar_section_tipo = array_map(function($el){
					return $el->target_section_tipo;
				}, $active_hierarchies);

			}elseif($section_tipo==='all'){

				$ar_section_tipo = ['all'];

			}else{

				$ar_section_tipo = explode(',', $section_tipo);
				foreach ($ar_section_tipo as $key => $current_section_tipo) {
					$ar_section_tipo[$key] = trim($current_section_tipo);
				}
			}

		$msg = [];
		foreach ($ar_section_tipo as $key => $current_section_tipo) {

			// safe tipo. Must be as 'es1', not only the tld
			$safe_tipo = safe_tipo($current_section_tipo);
			if ($safe_tipo===false) {
				debug_log(__METHOD__
					. " Ignored invalid section tipo " . PHP_EOL
					. ' section_tipo: ' . to_string($current_section_tipo)
					, logger::ERROR
				);
				$response->errors[]	= 'Ignored invalid section tipo: ' . $current_section_tipo. ' . Use format like "es1"';
				continue;
			}

			$matrix_table = $safe_tipo==='lg1' || $safe_tipo==='lg2'
				? 'matrix_langs'
				: 'matrix_hierarchy';

			$command  = '';
			$command .= 'cd "'.EXPORT_HIERARCHY_PATH.'" ; ';
			$command  .= DB_BIN_PATH.'psql ' . DEDALO_DATABASE_CONN . ' ' . DBi::get_connection_string();
			$command .= ' -c "\copy (SELECT section_id, section_tipo, datos FROM '.$matrix_table.' WHERE ';
			if ($current_section_tipo==='all') {

				$command .= 'section_tipo IS NOT NULL ORDER BY section_tipo, section_id ASC) ';
				$date 	  = date('Y-m-d_His');
				$command .= 'TO '.$current_section_tipo.'_'.$date.'.copy " ; ';
				$command .= 'gzip -f '.$current_section_tipo.'_'.$date.'.copy';

			}else{
				$command .= 'section_tipo = \''.$safe_tipo.'\' ORDER BY section_id ASC) ';
				$command .= 'TO '.$safe_tipo.'.copy " ; ';
				$command .= 'gzip -f '.$safe_tipo.'.copy';
			}
			debug_log(__METHOD__
				.' Exec command (export_hierarchy) '.PHP_EOL
				.to_string($command)
				, logger::WARNING
			);

			$command_res = shell_exec($command);
			debug_log(__METHOD__
				.' Exec response (shell_exec) ' . PHP_EOL
				.to_string($command_res)
				, logger::DEBUG
			);

			$msg[] = trim('section_tipo: '.$current_section_tipo.' = '.to_string($command_res));
		}//end foreach ($ar_section_tipo as $key => $current_section_tipo)

		// response OK
			$response->result	= true;
			$response->msg	= 'OK. All data is exported successfully'; // Override first message
			$response->msg	.= "<br>".implode('<br>', $msg);
			$response->msg	.= '<br>' . 'command_res: ' .$command_res;
			$response->msg	.= '<br>' . 'To import, use a command like this: ';
			$response->msg	.= '<br>' . 'SECTION_TIPO=\'us1\' ; gunzip ${SECTION_TIPO}.copy.gz | psql dedalo_myentity -U mydbuser -h localhost -c "\copy matrix_hierarchy(section_id, section_tipo, datos) from ${SECTION_TIPO}.copy"';

		// files links
			$dir_path	= EXPORT_HIERARCHY_PATH; // like '../httpdocs/dedalo/install/import/hierarchy'
			$files		= glob( $dir_path . '/*' ); // get all file names
			$ar_link	= [];
			foreach($files as $file){ // iterate files
				if(is_file($file)) {
					$extension = pathinfo($file,PATHINFO_EXTENSION);
					if ($extension==='gz') {
						$file_name = pathinfo($file,PATHINFO_BASENAME);
						$url	= DEDALO_ROOT_WEB . '/install/import/hierarchy/' . $file_name;
						$a		= '<a href="'.$url.'" target="_blank">'.$url.'</a>';
						$ar_link[] = $a;
					}
				}
			}
			if (!empty($ar_link)) {
				$response->msg	.= '<br>Available files for download: ' . '<br>' . implode('<br>', $ar_link);
			}


		return $response;
	}//end export_hierarchy



	/**
	* GET_SIMPLE_SCHEMA_OF_SECTIONS
	* Get all sections of the current ontology with his own children in a simple associative array.
	* [
	* 	"oh1"  => ["oh17","oh25"],
	* 	"ich1" => ["ich14","ich58"]
	* ]
	* @return array  $simple_schema_of_sections
	*/
	public static function get_simple_schema_of_sections() : array {

		$all_sections = ontology_node::get_ar_all_terminoID_of_modelo_tipo('dd6', false);

		$simple_schema_of_sections = [];
		foreach ($all_sections as $current_section) {

			$real_section = section::get_section_real_tipo_static($current_section);

			$ar_children = ontology_node::get_ar_recursive_children(
				$real_section,
				false,
				null,
				null,
				false //use cache false
			);
			$simple_schema_of_sections[$current_section] = $ar_children;
		}

		return $simple_schema_of_sections;
	}//end get_simple_schema_of_sections



	/**
	* BUILD_SIMPLE_SCHEMA_CHANGES
	* Compare two simple schemas and return only the changes by section and return it into array of objects
	* @param associative array $old_schema
	* @param associative array $new_schema
	* @return array of objects $simple_schema_changes
	*/
	public static function build_simple_schema_changes(array $old_schema, array $new_schema) : array {

		$simple_schema_changes = [];

		foreach ($new_schema as $current_section => $curent_children) {

			$old_children = $old_schema[$current_section] ?? null;

			if(isset($old_children)){

				$diferences = array_values(array_diff($curent_children, $old_children));

				if(empty($diferences)){
					continue;
				}

				$section_schema = new stdClass();
					$section_schema->tipo			= $current_section;
					$section_schema->children_added	= $diferences;

				$simple_schema_changes[] = $section_schema;
			}
		}

		return $simple_schema_changes;
	}//end build_simple_schema_changes



	/**
	* GET_SIMPLE_SCHEMA_CHANGES_FILES
	* @return array $filenames
	*/
	public static function get_simple_schema_changes_files() : array {

		$dir_path	= DEDALO_BACKUP_PATH_ONTOLOGY . '/changes/';

		$all_files = get_dir_files($dir_path, ['json']);

		$files = [];
		foreach ($all_files as $dir_file) {
			$files[] = basename($dir_file);
		}

		arsort($files);

		$filenames = array_values($files);

		return $filenames;
	}//end get_simple_schema_changes_files



	/**
	* PARSE_SIMPLE_SCHEMA_CHANGES_FILE
	* Open the file specified into $filename variable and parse it into a simple schema changes.
	* Simple schema changes is a array of objects with section as main node, his parents and his children.
	* all nodes has the tipo and his label.
	* section is a object
	* parents is a array of objects
	* children is a array of objects
	* [{
	* 	"section 	: {"tipo":"oh1","label":"Oral History"},
	* 	"parents"	: [{"tipo":"dd323","lqbel":"Imaterial"},{"tipo":"dd355","label":"Cultural"}]
	* 	"children"	: [{"tipo":"oh2","lqbel":"Identification"},{"tipo":"oh14","label":"Code"}]
	* "}]
	* @param string $filename
	* @return array $data
	*/
	public static function parse_simple_schema_changes_file( string $filename ) : array {

		// file_path
			$simple_schema_dir_path	= DEDALO_BACKUP_PATH_ONTOLOGY . '/changes/';
			$file_path				= $simple_schema_dir_path . $filename;

		// file_contents. Get string from files
			$file_contents = file_get_contents($file_path);
			if(empty($file_contents)){
				return [];
			}

		// data. Parse file content string
			$data = json_decode($file_contents);
			if(empty($data)){
				return [];
			}

		$changes = [];
		foreach ($data as $current_section) {

			// section
				$section_item = new stdClass();
					$section_item->tipo		= $current_section->tipo;
					$section_item->label	= ontology_node::get_termino_by_tipo($current_section->tipo, DEDALO_APPLICATION_LANG);

			// parents
				$parents		= [];
				$ontology_node	= new ontology_node($current_section->tipo);
				$parents_tipo	= $ontology_node->get_ar_parents_of_this();
				foreach ($parents_tipo as $parent_tipo) {

					$parent_item = new stdClass();
						$parent_item->tipo = $parent_tipo;
						$parent_item->label = ontology_node::get_termino_by_tipo($parent_tipo, DEDALO_APPLICATION_LANG);

						$parents[] = $parent_item;
				}

			// children
				$children		= [];
				$children_tipo	= $current_section->children_added;
				foreach ($children_tipo as $child_tipo) {

					$child_item = new stdClass();
						$child_item->tipo = $child_tipo;
						$child_item->label = ontology_node::get_termino_by_tipo($child_tipo, DEDALO_APPLICATION_LANG);

						$children[] = $child_item;
				}

			$item = (object)[
				'section'	=> $section_item,
				'parents'	=> $parents,
				'children'	=> $children
			];

			$changes[] = $item;
		}


		return $changes;
	}//end parse_simple_schema_changes_file



	/**
	* SAVE_SIMPLE_SCHEMA_FILE
	* Calculates and writes the simple_schema_changes file
	* @param object options
	* {
	*	old_simple_schema_of_sections : array
	* 	name: ?string = 'simple_schema_changes_'.date("Y-m-d_H-i-s").'.json'
	* 	dir_path: ?string = DEDALO_BACKUP_PATH_ONTOLOGY . '/changes/'
	* }
	* @return object response
	*/
	public static function save_simple_schema_file( object $options ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// options
			// previous version of simple_schema_of_sections (normally before update Ontology)
			$old_simple_schema_of_sections = $options->old_simple_schema_of_sections;
			// target file name, normally is calculated by default with current date
			$name = $options->name ?? 'simple_schema_changes_'.date("Y-m-d_H-i-s").'.json';
			// dir_path. Target directory where save the file
			$dir_path = $options->dir_path ?? DEDALO_BACKUP_PATH_ONTOLOGY . '/changes/';

		// target file path. Create directory if not already exists
			$directory_is_ready = create_directory($dir_path, 0750);
			if(!$directory_is_ready){
				$response->result	= false;
				$response->msg		= "Error on read or create directory. Permission denied ($dir_path)";
				return $response;
			}

		// simple_schema_of_sections. Get updated version
			$new_simple_schema_of_sections = hierarchy::get_simple_schema_of_sections();

		// build changes list
			$simple_schema_changes = hierarchy::build_simple_schema_changes(
				$old_simple_schema_of_sections,
				$new_simple_schema_of_sections
			);

		// save changes list data to the target file
			$filepath			= $dir_path . $name;
			$save_simple_schema	= file_put_contents($filepath, json_encode($simple_schema_changes));
			if($save_simple_schema===false){
				$response->result	= false;
				$response->msg		= "Error on read or create file of simple schema changes. Permission denied ($filepath)";
				return $response;
			}
			debug_log(__METHOD__
				. " Saved a new simple schema changes file " . PHP_EOL
				. ' filepath: ' . to_string($filepath) . PHP_EOL
				. ' simple_schema_changes: ' . to_string($simple_schema_changes)
				, logger::WARNING
			);

		// response OK
			$response->result	= true;
			$response->msg		= 'OK. Request successfully processed';
			$response->filepath	= $filepath;


		return $response;
	}//end save_simple_schema_file



	/**
	* GET_TYPOLOGY_LOCATOR_FROM_TLD
	* Get the tld hierarchy definition and get his own typology definition
	* @param string $tld
	* @return object|null $typology_locator
	*/
	public static function get_typology_locator_from_tld( string $tld ) : ?object {

		$hierarchy_response	= hierarchy::get_hierarchy_by_tld( $tld );
		$section_id			= $hierarchy_response->result;
		if( empty($section_id) ){
			return null;
		}

		$model = ontology_node::get_model_terminoID( DEDALO_HIERARCHY_TYPOLOGY_TIPO );
		$typology_component = component_common::get_instance(
			$model, // string model
			DEDALO_HIERARCHY_TYPOLOGY_TIPO, // string tipo
			$section_id, // string section_id
			'list', // string mode
			DEDALO_DATA_NOLAN, // string lang
			DEDALO_HIERARCHY_SECTION_TIPO // string section_tipo
		);

		$typology_data = $typology_component->get_dato();

		$typology_locator = $typology_data[0] ?? null;


		return $typology_locator;
	}//end get_typology_locator_from_tld



	/**
	* GET_ALL_MAIN_HIERARCHY_RECORDS
	* Alias of ontology::get_all_main_ontology_records
	* @return array $ar_records
	*/
	public static function get_all_main_hierarchy_records() : array {

		$main_section_tipo = self::$main_section_tipo;

		// search_query_object
			$sqo = new search_query_object();
				$sqo->set_section_tipo( [$main_section_tipo] );
				$sqo->set_limit( 0 );
				$sqo->set_skip_projects_filter( true );

		// search exec
			$search	= search::get_instance($sqo);
			$result	= $search->search();

		$ar_records = $result->ar_records ?? [];

		if (empty($ar_records)) {
			debug_log(__METHOD__
				. " EMPTY AR RECORDS " . PHP_EOL
				. ' section_tipo: ' . to_string($main_section_tipo) . PHP_EOL
				. ' sqo: ' . to_string($sqo) . PHP_EOL
				, logger::ERROR
			);
		}


		return $ar_records;
	}//end get_all_main_hierarchy_records



	/**
	* GET_ACTIVE_ELEMENTS
	* Execs a real SQL search and
	* returns an array of current active ontologies or hierarchies
	* @return array $active_hierarchies
	* @test true
	*/
	public static function get_active_elements() : array {

		static $active_hierarchy_elements_cache;
		if (isset($active_hierarchy_elements_cache)) {
			return $active_hierarchy_elements_cache;
		}

		// main filter
		$filter = json_decode('
			{
				"$and": [
					{
						"q": {
							"section_id": "1",
							"section_tipo": "dd64",
							"from_component_tipo": "hierarchy4"
						},
						"q_operator": null,
						"path": [
							{
								"name": "Active",
								"model": "component_radio_button",
								"section_tipo": "hierarchy1",
								"component_tipo": "hierarchy4"
							}
						],
						"type": "jsonb"
					}
				]
			}
		');

		// section tipo depends on the current class (hierarchy, ontology)
		$section_tipo = hierarchy::$main_section_tipo;

		$sqo = new search_query_object();
			$sqo->set_section_tipo( [$section_tipo] );
			$sqo->set_limit( 0 );
			$sqo->set_offset( 0 );
			$sqo->set_filter( $filter );

		$search = search::get_instance(
			$sqo // object sqo
		);
		$result = $search->search();

		// active_elements
		$active_elements = array_map(
			'ontology::row_to_element',
			$result->ar_records
		);

		// cache
		$active_hierarchy_elements_cache = $active_elements;


		return $active_elements;
	}//end get_active_elements



	/**
	* CREATE_THESAURUS_GENERAL_TERM
	* It creates the section to display as root term in the Thesaurus,
	* and add to `General Term` (hierarchy45) portal data.
	* Before to create it, check for already existing one.
	* @param string $section_tipo - Expected 'hierarchy1'
	* @param string|int $section_id - Id of the current hierarchy
	* @param string $general_term_tipo
	* 	'hierarchy45' for General term
	* 	'hierarchy59' for General term model
	* @return bool
	*/
	public static function create_thesaurus_general_term( string $section_tipo, string|int $section_id, string $general_term_tipo ) : bool {

		// General term tipo. ! Please note that this is no longer a component_children, now is a component_portal
		if (!in_array($general_term_tipo, ['hierarchy45','hierarchy59'])) {
			debug_log(__METHOD__
				. " Invalid tipo form general_term_tipo. Only 'hierarchy45','hierarchy59' are valid  " . PHP_EOL
				. ' general_term_tipo : ' . to_string($general_term_tipo)
				, logger::ERROR
			);
			return false;
		}

		$model		= ontology_node::get_modelo_name_by_tipo($general_term_tipo,true);
		$component	= component_common::get_instance(
			$model, // string model
			$general_term_tipo, // string tipo
			$section_id, // string section_id
			'list', // string mode
			DEDALO_DATA_NOLAN, // string lang
			$section_tipo // string section_tipo
		);

		$dato = $component->get_dato();
		if (!empty($dato)) {
			// Already contains data. Skip creation
			return false;
		}

		// target_section_tipo. Get from component 'Target thesaurus' (hierarchy53)
		$target_tipo = $general_term_tipo==='hierarchy59'
			? DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO // hierarchy58 Model case
			: DEDALO_HIERARCHY_TARGET_SECTION_TIPO; // hierarchy58 Term case

		$target_model_name			= ontology_node::get_modelo_name_by_tipo($target_tipo, true);
		$component_target_section	= component_common::get_instance(
			$target_model_name,
			$target_tipo,
			$section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$section_tipo
		);
		$target_section_tipo =  $component_target_section->get_value();
		if (empty($target_section_tipo)) {
			debug_log(__METHOD__
				. " Error getting target_section_tipo from 'General Term' component  " . PHP_EOL
				. ' tipo : ' . to_string($general_term_tipo)
				, logger::ERROR
			);
			return false;
		}

		// add_new_element
		$response = $component->add_new_element( (object)[
			'target_section_tipo' => $target_section_tipo
		]);
		if ( !$response->result || empty($response->section_id) ) {
			debug_log(__METHOD__
				. " Error adding new element (add_new_element) to 'General Term' component  " . PHP_EOL
				. ' tipo (general_term_tipo) : ' . to_string($general_term_tipo) . PHP_EOL
				. ' target_section_tipo : ' . to_string($target_section_tipo)
				, logger::ERROR
			);
			return false;
		}
		// save the component
		$component->Save();
		$new_section_id = $response->section_id;

		// get current hierarchy name as 'Exhibition'
		$hierarchy_name = hierarchy::get_hierarchy_name($section_tipo, $section_id) ?? "General term from hierarchy $section_tipo - $section_id";

		// set new section 'Term' value based on current Hierarchy name as 'Exhibition'
		$set_term_value_result = hierarchy::set_term_value($target_section_tipo, $new_section_id, $hierarchy_name);


		return $set_term_value_result;
	}//end create_thesaurus_general_term



	/**
	* GET_HIERARCHY_NAME
	* Gets the hierarchy name from the component 'Name' (hierarchy5) value
	* @param string $section_tipo - Expected 'hierarchy1'
	* @param string|int $section_id - Id of the current hierarchy
	* @return string|null
	*/
	public static function get_hierarchy_name(  string $section_tipo, string|int $section_id ) : string|null {

		// Term name tipo (componentinput_text)
		$term_tipo = DEDALO_HIERARCHY_TERM_TIPO; // 'hierarchy5'

		$model = ontology_node::get_modelo_name_by_tipo($term_tipo,true);

		$component = component_common::get_instance(
			$model, // string model
			$term_tipo, // string tipo
			$section_id, // string section_id
			'list', // string mode
			DEDALO_DATA_NOLAN, // string lang
			$section_tipo // string section_tipo
		);

		$value = $component->get_value();

		return $value;
	}//end get_hierarchy_name



	/**
	* SET_TERM_VALUE
	* Sets the 'Term' (usually 'hierarchy25') string value
	* @param string $section_tipo - (target section tipo as 'es1')
	* @param string|int $section_id
	* @param string $name
	* @return bool
	*/
	public static function set_term_value( string $section_tipo, string|int $section_id, string $name ) : bool {

		// section map resolution for term
		$term_tipo = hierarchy::get_element_tipo_from_section_map( $section_tipo, 'term' );
		if (empty($term_tipo)) {
			debug_log(__METHOD__
				. " Section without section map definition or bad configured. 'term' is not resolved " . PHP_EOL
				. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
				. ' section_id: ' . to_string($section_id)
				, logger::ERROR
			);
			return false;
		}

		$model = ontology_node::get_modelo_name_by_tipo($term_tipo,true);

		$component = component_common::get_instance(
			$model, // string model
			$term_tipo, // string tipo
			$section_id, // string section_id
			'list', // string mode
			DEDALO_DATA_LANG, // string lang
			$section_tipo // string section_tipo
		);

		$component->set_dato( [$name] );

		$save_result = $component->Save();

		$result = empty($save_result) ? false : true;


		return $result;
	}//end set_term_value



	/**
	* SYNC_HIERARCHY_ACTIVE_STATUS
	* Sync Hierarchy 'Active' with 'Active in thesaurus' status.
	* Propagates 'Active in thesaurus' to 'Active' to prevent large list of
	* apparently unused toponymies
	* @return bool
	*/
	public static function sync_hierarchy_active_status() : bool {

		// Get Hierarchy active sections
		$active_hierarchies = hierarchy::get_active_elements();

		// Check if we have any active hierarchies to process
		if (empty($active_hierarchies)) {
			return true; // Nothing to process, but not an error
		}

		// ignore target_section_tipo
		$ignore_target_section_tipo = [
			'rsc197' // 'People' hierarchy
		];

		$error_count = 0;

		// Iterate to sync with 'Active in thesaurus' values
		foreach ($active_hierarchies as $item) {

			if ( $item->active_in_thesaurus ) {
				continue; // It's in sync
			}

			if ( in_array($item->target_section_tipo, $ignore_target_section_tipo) ) {
				continue; // Ignore some hierarchies like 'People'
			}

			// No active in thesaurus cases. Set as inactive
			$active_tipo	= DEDALO_HIERARCHY_ACTIVE_TIPO; // hierarchy4
			$active_model	= ontology_node::get_modelo_name_by_tipo( $active_tipo );
			$component		= component_common::get_instance(
				$active_model,
				$active_tipo ,
				$item->section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$item->section_tipo
			);

			$locator = new locator();
				$locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
				$locator->set_section_id(NUMERICAL_MATRIX_VALUE_NO);

			$component->set_dato( [$locator] );

			$save_result = $component->Save();
			if (!$save_result) {
				// Log error or handle save failure
				debug_log(__METHOD__
					. " Failed to save component for section_id: " . PHP_EOL
					. ' $item->section_id: ' . to_string($item->section_id)
					, logger::ERROR
				);
				$error_count++;
			}else{
				debug_log(__METHOD__
					. " Updated value for for section_id: " . PHP_EOL
					. ' $item->section_id: ' . to_string($item->section_id)
					, logger::WARNING
				);
			}
		}


		return $error_count === 0;
	}//end sync_hierarchy_active_status



}//end class hierarchy
