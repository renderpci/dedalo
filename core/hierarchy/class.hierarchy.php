<?php declare(strict_types=1);
/**
* HIERARCHY
* Centralized hierarchy methods
*/
class hierarchy extends ontology {



	// Table where hierarchy data is stored
	static $main_table = 'matrix_hierarchy_main';
	static $main_section_tipo = 'hierarchy1';


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
			$response->msg		= [];

		// options
			$section_id		= $options->section_id;
			$section_tipo	= $options->section_tipo;

		// check active
			$active_tipo	= DEDALO_HIERARCHY_ACTIVE_TIPO;	// 'hierarchy4';
			$model_name		= RecordObj_dd::get_modelo_name_by_tipo($active_tipo, true);
			$component		= component_common::get_instance(
				$model_name,
				$active_tipo,
				$section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$dato		= (array)$component->get_dato();
			$locator	= reset($dato);
			if( !isset($locator->section_tipo) || $locator->section_tipo!==DEDALO_SECTION_SI_NO_TIPO ||
				!isset($locator->section_id) || $locator->section_id!=NUMERICAL_MATRIX_VALUE_YES) {

				// Error: Current hierarchy is not active. Stop here (!)

				$response->result	= false;
				$response->msg[]	= label::get_label('error_generate_hierarchy');
				debug_log(__METHOD__ .PHP_EOL
					." msg: ".to_string($response->msg)
					, logger::ERROR
				);
				return $response;
			}

		// check tld
			$tld2_tipo	= DEDALO_HIERARCHY_TLD2_TIPO;	// 'hierarchy6';
			$model_name	= RecordObj_dd::get_modelo_name_by_tipo($tld2_tipo, true);
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
				$response->msg[]	= 'Error on get tld2. Empty value (tld is mandatory)';
				debug_log(__METHOD__ .PHP_EOL
					." msg: ".to_string($response->msg)
					, logger::ERROR
				);
				return $response;
			}

		// source_real_section_tipo
			$model_name	= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_HIERARCHY_SOURCE_REAL_SECTION_TIPO,true);
			$component	= component_common::get_instance(
				$model_name,
				DEDALO_HIERARCHY_SOURCE_REAL_SECTION_TIPO,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$dato = $component->get_dato();
			// check value
			$real_section_tipo = isset($dato[0]) ? $dato[0] : false;
			if (empty($real_section_tipo)) {

				// Error: source_real_section_tipo is mandatory

				$response->result	= false;
				$response->msg[]	= 'Error on get source_real_section_tipo. Empty value (source_real_section_tipo is mandatory)';
				debug_log(__METHOD__ .PHP_EOL
					." msg: ".to_string($response->msg)
					, logger::ERROR
				);
				return $response;
			}
			$real_section_model_name = RecordObj_dd::get_modelo_name_by_tipo($real_section_tipo, true);
			if ($real_section_model_name!=='section') {

				// Error: source_real_section_tipo is not a section !

				$response->result	= false;
				$response->msg[]	= 'Error on get source_real_section_tipo. Invalid model (only sections tipo are valid)';
				debug_log(__METHOD__ .PHP_EOL
					." msg: ".to_string($response->msg)
					, logger::ERROR
				);
				return $response;
			}

		// typology (of hierarchy)
			$hierarchy_type	= DEDALO_HIERARCHY_TYPOLOGY_TIPO;
			$model_name		= RecordObj_dd::get_modelo_name_by_tipo($hierarchy_type, true);
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
				$response->msg[]	= 'Error on get typology. Empty value (typology is mandatory)';
				debug_log(__METHOD__ .PHP_EOL
					." msg: ".to_string($response->msg)
					, logger::ERROR
				);
				return $response;
			}

		// name
			$name_tipo	= DEDALO_HIERARCHY_TERM_TIPO;	//'hierarchy5';
			$model_name	= RecordObj_dd::get_modelo_name_by_tipo($name_tipo, true);
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

		// commands sequence

		// ******* VIRTUAL SECTION *******

		// ontology main
			$main_options = new stdClass();
				$main_options->tld			= $tld2;
				$main_options->typology_id	= $typology_id;
				$main_options->name_data	= $name_data;
			$main_section = ontology::add_main_section( $main_options );

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
					$parent_model		= RecordObj_dd::get_modelo_name_by_tipo( $parent_tipo );
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
					// replace the model locator to yes
					foreach ($section_data->relations as $key => $current_locator) {
						if($current_locator->from_component_tipo==='ontology30' ){
							$current_locator->section_id = (string)NUMERICAL_MATRIX_VALUE_YES;
							break;
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

					//parent
						$parent_model_grouper_tipo = ontology::create_parent_grouper('hierarchy57', 'hierarchymtype', $typology_id);

						$parent_model_tld	= get_tld_from_tipo( $parent_model_grouper_tipo );
						$parent_section_id	= get_section_id_from_tipo( $parent_model_grouper_tipo );
						$parent_node_tipo	= $parent_model_tld.'0';

						$parent_tipo		= 'ontology15';
						$parent_model		= RecordObj_dd::get_modelo_name_by_tipo( $parent_tipo );
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
				$ar_section_tipo = [$tld2.'1', $tld2.'2'];
				$user_id = logged_user_id();

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
				}

			// target section with the created sections
			// when the process was finished inset the target section into the components
				$target_tipo	= DEDALO_HIERARCHY_TARGET_SECTION_TIPO;	//'hierarchy53';
				$model_name	= RecordObj_dd::get_modelo_name_by_tipo($target_tipo, true);
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

				$target_model_tipo	= DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO;	//'hierarchy53';
				$model_name	= RecordObj_dd::get_modelo_name_by_tipo($target_model_tipo, true);
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


		return $response;
	}//end generate_virtual_section



	/**
	* CREATE_ROOT_TERMS
	* @param object $request_options
	* @return bool
	*/
	protected static function create_root_terms( object $request_options ) : bool {

		$options = new stdClass();
			$options->section_tipo 	= null;
			$options->section_id 	= null;
			$options->ar_sections 	= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$tipo 			= DEDALO_THESAURUS_TERM_TIPO;
		$model_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$section_id 	= 1;

		# Iterate sections (normally like ts1,ts2)
		foreach ((array)$options->ar_sections as $key => $current_section_tipo) {

			$section = section::get_instance($section_id,$current_section_tipo);
			$section->forced_create_record();

			$component = component_common::get_instance(
				$model_name,
				$tipo,
				$section_id,
				'edit',
				DEDALO_DATA_LANG,
				$current_section_tipo
			);
			$name = ($key===0) ? "Sample term" : "Sample model";
			$component->set_dato("$name [{$current_section_tipo}-{$section_id}]");
			$component->Save();

			debug_log(__METHOD__
				." Created first record of thesaurus section $current_section_tipo - $section_id "
				, logger::DEBUG
			);

			# Attach as children of current hierarchy
			$component_relation_children_tipo = ($key===0)
				? DEDALO_HIERARCHY_CHILDREN_TIPO
				: DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO;
			$component_relation_children = component_common::get_instance(
				'component_relation_children',
				$component_relation_children_tipo,
				$options->section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$options->section_tipo
			);
			$component_relation_children->make_me_your_children( $current_section_tipo, $section_id );
			$component_relation_children->Save();

			debug_log(__METHOD__
				." Added first record of thesaurus section $current_section_tipo - $section_id as children of hierarchy $component_relation_children_tipo "
				, logger::DEBUG
			);
		}

		return true;
	}//end create_root_terms


	/**
	* CREATE_TERM
	* Creates new structure term with request params. If term already exists, return false
	* @param object $request_options
	* @return object $response
	*/
	public static function create_term( object $request_options ) : object {

		// options
			$options = new stdClass();
				$options->terminoID		= '';
				$options->parent		= '';
				$options->modelo		= '';
				$options->esmodelo		= 'no';
				$options->esdescriptor	= 'si';
				$options->visible		= 'si';
				$options->norden		= null;
				$options->tld2			= '';
				$options->traducible	= 'no';
				$options->relaciones	= null;
				$options->properties	= null;
				$options->name			= '';
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= '';

		// structure element test . Test record exits
			$RecordObj_dd	= new RecordObj_dd($options->terminoID, $options->tld2);
			$parent_test	= $RecordObj_dd->get_parent();
			if (!empty($parent_test)) {
				$response->result	= true;
				$response->msg		= "Current hierarchy ($options->terminoID - $options->name) already exists. Term creation order ignored.";
				debug_log(__METHOD__
					. ' msg: '.to_string($response->msg),
					logger::WARNING
				);
				return $response;
			}

		// norden
			$ar_children	= RecordObj_dd::get_ar_childrens($options->parent);
			$norden			= (int)count($ar_children)+1;

		// Defaults
			$RecordObj_dd->set_terminoID($options->terminoID);
			$RecordObj_dd->set_parent($options->parent);
			$RecordObj_dd->set_modelo($options->modelo);
			$RecordObj_dd->set_esmodelo($options->esmodelo);
			$RecordObj_dd->set_esdescriptor($options->esdescriptor);
			$RecordObj_dd->set_visible($options->visible);
			$RecordObj_dd->set_norden($norden);
			$RecordObj_dd->set_tld($options->tld2);
			$RecordObj_dd->set_traducible($options->traducible);
			$RecordObj_dd->set_relaciones($options->relaciones);
			$RecordObj_dd->set_properties($options->properties);

		// term. Column term
			$term = new stdClass();
				$term->{DEDALO_STRUCTURE_LANG} = $options->name;
			$RecordObj_dd->set_term($term);

		// force_insert_on_save
			$RecordObj_dd->set_force_insert_on_save(true); # important !

		// SAVE : After save, we can recover new created terminoID (prefix+autoIncrement)
			// $created_id_ts = $RecordObj_dd->save_term_and_descriptor( $options->name );
			$created_id_ts = $RecordObj_dd->Save();
			if ($created_id_ts) {
				$response->result 	= true;
				$response->msg 		= "Created record: $created_id_ts - $options->name";
			}


		return $response;
	}//end create_term



	/**
	* ROW_TO_JSON_OBJ
	* @return bool|null
	*/
	private static function row_to_json_obj( string $tipo, $parent, $dato=null, $lang='lg-spa', ?string $section_tipo=null ) {

		if(empty($dato)){
			debug_log(__METHOD__
				." Error Processing Request. dato is mandatory !"
				, logger::ERROR
			);
			return false;
		}

		if(empty($section_tipo)){
			debug_log(__METHOD__
				." Error Processing Request. section_tipo is mandatory !".to_string()
				, logger::ERROR
			);
			return false;
		}

		// Test section tipo and modelo_name exists (TEMPORAL FOR INSTALATIONS BEFORE 4.5)
		$section_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($section_tipo, true);
		if ($section_modelo_name!=='section') {
			throw new Exception("Error Processing Request. Section tipo '$section_tipo' do not exists in Ontology.<br>
					Please review your Ontology data before continue working to avoid critical errors.<br>", 1);
		}

		$mode		= 'edit';
		$model_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$component	= component_common::get_instance(
			$model_name,
			$tipo,
			$parent,
			$mode,
			$lang,
			$section_tipo
		);

		$component->set_dato($dato);
		$component->Save();
		unset($model_name);
		unset($component);

		return null;
	}//end row_to_json_obj


	/**
	* GET_MAIN_LANG
	* Search in section HIERARCHY (DEDALO_HIERARCHY_SECTION_TIPO) the lang for requested 'thesaurus' section by section_tipo
	* Do a direct db search request for speed and store results in a static var for avoid resolve the same main_lang twice
	* Speed here is very important because this method is basic for thesaurus sections defined in hierarchies
	* @param string $section_tipo
	* @return string|null $main_lang
	*/
	public static function get_main_lang( string $section_tipo ) : ?string {

		// Always fixed langs as English
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
	* Return array of tables of requested hierarchy sections
	* @param array $ar_section_tipo
	* 	Format like [0] => lg1
	*			    [2] => ts1
	* @return array $all_tables
	*/
	public static function get_all_tables( array $ar_section_tipo ) : array {

		$all_tables = array();
		foreach ((array)$ar_section_tipo as $section_tipo) {
			$table = common::get_matrix_table_from_tipo($section_tipo);
			if (!in_array($table, $all_tables)) {
				$all_tables[] = $table;
			}
		}

		return (array)$all_tables;
	}//end get_all_tables



	/**
	* GET_ALL_TERM_TIPO_BY_MAP
	* Returns array of thesaurus term by map
	* @param array $ar_section_tipo
	* @return array $all_term_tipo_by_map
	*/
	public static function get_all_term_tipo_by_map( array $ar_section_tipo ) : array {

		$all_term_tipo_by_map = [];
		foreach ((array)$ar_section_tipo as $section_tipo) {

			// Matrix table
			$table = common::get_matrix_table_from_tipo($section_tipo);

			// term_tipo
			$term_tipo = hierarchy::get_element_tipo_from_section_map($section_tipo, 'term');

			if(!is_null($term_tipo)) {
				// append non null values
				$all_term_tipo_by_map[$table][] = $term_tipo;
			}
		}

		return $all_term_tipo_by_map;
	}//end get_all_term_tipo_by_map



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

		static $section_map_elemets ;
		if (isset($section_map_elemets[$section_tipo])) {
			return $section_map_elemets[$section_tipo];
		}

		// Elements are stored in current section > section_map
		// Search element in current section
		$ar_modelo_name_required = array('section_map');

		// Search in current section
		$ar_children  = section::get_ar_children_tipo_by_model_name_in_section(
			$section_tipo,
			$ar_modelo_name_required,
			true, // bool from_cache
			false, // bool resolve_virtual
			false, // bool recursive
			true // bool search_exact
		);
		# Fallback to real section when in virtual
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


		# If element exists (section_map) we get element 'properties' json value as array
		if (isset($ar_children[0])) {

			$section_map_tipo = $ar_children[0];

			// relation map
			$RecordObj_dd	= new RecordObj_dd($section_map_tipo);
			$ar_properties	= $RecordObj_dd->get_properties();

			$ar_elements = (array)$ar_properties;
		}

		// Set static var for re-use
		$section_map_elemets[$section_tipo] = $ar_elements;


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

		$model = RecordObj_dd::get_modelo_name_by_tipo($hierarchy_component_tipo,true);

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
	public static function get_hierarchy_by_tld(string $tld) : object {

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
		$rows	= (array)pg_fetch_assoc($result);
		$value	= reset($rows);

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
	public static function export_hierarchy(string $section_tipo) : object {

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

			$command  = '';
			$command .= 'cd "'.EXPORT_HIERARCHY_PATH.'" ; ';
			$command  .= DB_BIN_PATH.'psql ' . DEDALO_DATABASE_CONN . ' ' . DBi::get_connection_string();
			$command .= ' -c "\copy (SELECT section_id, section_tipo, datos FROM matrix_hierarchy WHERE ';
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
			$response->msg	= 'Ok. All data is exported successfully'; // Override first message
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

		$all_sections = RecordObj_dd::get_ar_all_terminoID_of_modelo_tipo('dd6', false);

		$simple_schema_of_sections = [];

		foreach ($all_sections as $current_section) {

			$real_section = section::get_section_real_tipo_static($current_section);

			$ar_children = RecordObj_dd::get_ar_recursive_childrens(
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
	public static function parse_simple_schema_changes_file($filename) : array {

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
					$section_item->label	= RecordObj_dd::get_termino_by_tipo($current_section->tipo, DEDALO_APPLICATION_LANG);

			// parents
				$parents		= [];
				$RecordObj_dd	= new RecordObj_dd($current_section->tipo);
				$parents_tipo	= $RecordObj_dd->get_ar_parents_of_this();
				foreach ($parents_tipo as $parent_tipo) {

					$parent_item = new stdClass();
						$parent_item->tipo = $parent_tipo;
						$parent_item->label = RecordObj_dd::get_termino_by_tipo($parent_tipo, DEDALO_APPLICATION_LANG);

						$parents[] = $parent_item;
				}

			// children
				$children		= [];
				$children_tipo	= $current_section->children_added;
				foreach ($children_tipo as $child_tipo) {

					$child_item = new stdClass();
						$child_item->tipo = $child_tipo;
						$child_item->label = RecordObj_dd::get_termino_by_tipo($child_tipo, DEDALO_APPLICATION_LANG);

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
	* 	name: string = 'simple_schema_changes_'.date("Y-m-d_H-i-s").'.json'
	* }
	* @return object response
	*/
	public static function save_simple_schema_file(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// options
			// previous version of simple_schema_of_sections (normally before update Ontology)
			$old_simple_schema_of_sections	= $options->old_simple_schema_of_sections;
			// target file name, normally is calculated by default with current date
			$name = $options->name ?? 'simple_schema_changes_'.date("Y-m-d_H-i-s").'.json';
			// dir_path. Target directory where save the file
			$dir_path = $options->dir_path ?? DEDALO_BACKUP_PATH_ONTOLOGY . '/changes/';

		// simple_schema_of_sections. Get updated version
			$new_simple_schema_of_sections = hierarchy::get_simple_schema_of_sections();

		// build changes list
			$simple_schema_changes = hierarchy::build_simple_schema_changes(
				$old_simple_schema_of_sections,
				$new_simple_schema_of_sections
			);

		// target file path. Create directory if not already exists
			$directory_is_ready = create_directory($dir_path, 0750);
			if(!$directory_is_ready){
				$response->result	= false;
				$response->msg		= "Error on read or create directory. Permission denied ($dir_path)";
				return $response;
			}

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
	* VALID_TLD
	* Validate tld using a regex
	* tld are used as prefix for tipos
	* Only lower case are accepted !
	* @param string $tld
	* 	Like 'dd'
	* @return bool
	*/
	public static function valid_tld(string $tld) : bool {

		preg_match("/^[a-z]{2,}$/", $tld, $output_array);
		$found = $output_array[0] ?? false;
		if (!$found) {
			return false;
		}

		return true;
	}//end valid_tld



	/**
	* GET_TYPOLOGY_LOCATOR_FROM_TLD
	* Get the tld hierarchy definition and get his own typology definition
	* @param string $tld
	* @return object|null $typology_locator
	*/
	public static function get_typology_locator_from_tld( string $tld ) :?object {

		$hierarchy_response	= hierarchy::get_hierarchy_by_tld( $tld );
		$section_id		= $hierarchy_response->result;

		if( empty($section_id) ){
			return null;
		}

		$model = RecordObj_dd::get_model_terminoID( DEDALO_HIERARCHY_TYPOLOGY_TIPO );

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



}//end class hierarchy
