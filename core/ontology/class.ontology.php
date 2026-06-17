<?php declare(strict_types=1);
/**
* ONTOLOGY
* Central registry and lifecycle manager for Dédalo's ontology definitions.
*
* This class owns all CRUD operations that bridge the two ontology storage layers:
*   1. 'matrix_ontology_main' — one row per top-level domain (TLD), stores the
*      editable metadata of each ontology family (name, tld, active flag, typology, etc.).
*   2. Per-TLD matrix tables (e.g. 'matrix_dd0', 'matrix_es0') — one row per ontology
*      node (component, section model, area, …), each keyed by (section_tipo, section_id).
*   3. 'dd_ontology' flat denormalised table — read by the runtime engine
*      (class.ontology_node.php) for high-speed node lookups.  Changes to the two
*      matrix layers must be flushed here via insert_dd_ontology_record() or the
*      regenerate_records_in_dd_ontology() batch.
*
* The conventional TLD-to-matrix mapping is:
*   tld  →  target_section_tipo  →  table
*   'dd' →  'dd0'                →  'matrix_dd0'
*   'es' →  'es0'                →  'matrix_es0'
*
* Responsibilities:
* - Bootstrap: parse legacy 'dd_ontology' flat rows and populate the matrix (create_ontology_records).
* - Lookup helpers: map TLD ↔ target_section_tipo, retrieve main section rows.
* - Sync: convert matrix section records → ontology_node → 'dd_ontology' (insert_dd_ontology_record,
*   set_records_in_dd_ontology, regenerate_records_in_dd_ontology).
* - Lifecycle: add_main_section, create_parent_grouper, delete_ontology.
* - Query helpers: get_active_elements, get_all_ontology_sections, get_root_terms.
*
* Extended by:
*   hierarchy  (core/hierarchy/class.hierarchy.php) — thesaurus/term-list variant
*               that overrides $main_table, $main_section_tipo and most query helpers
*               while inheriting the shared TLD ↔ section_tipo mapping and CRUD logic.
*
* Data shapes managed:
*   ontology_node — runtime lightweight DTO (tipo, tld, parent, model, properties …)
*   locator       — cross-section pointer {section_tipo, section_id, type, …}
*   element       — normalised output object returned by row_to_element()
*
* @package Dédalo
* @subpackage Core
*/
class ontology {

	/**
	* Maximum number of entries kept in each in-process static cache.
	* When a cache exceeds this count the oldest half is discarded by
	* manage_cache_size().  Prevents unbounded memory growth in long-lived
	* PHP-FPM workers or CLI batch processes.
	* @var int MAX_CACHE_SIZE
	*/
	public const int MAX_CACHE_SIZE = 1000;

	/**
	* MANAGE_CACHE_SIZE
	* Trims a static cache array to at most MAX_CACHE_SIZE entries.
	*
	* When the limit is exceeded only the most-recently-added tail is kept.
	* Array keys are preserved so callers can still look up by string key after
	* trimming.  Called from every cache-write site in this class.
	*
	* @param array &$cache Reference to the cache array to trim in-place.
	* @return void
	*/
	protected static function manage_cache_size(array &$cache) : void {
		if (count($cache) > self::MAX_CACHE_SIZE) {
			// Keep only the most recent entries
			$cache = array_slice($cache, -self::MAX_CACHE_SIZE, null, true);
		}
	}

	/**
	* CLEAR
	* Purges all in-process static caches maintained by this class.
	*
	* Must be called by the request dispatcher between worker requests
	* (see context-cache-core-stamp-architecture memory note) to prevent
	* state-bleed across tenants.  hierarchy::clear() calls this via parent.
	*
	* @return void
	*/
	public static function clear() : void {
		self::$cache_ontology_sections = [];
		self::$cache_active_ontology_elements = [];
	}



	/**
	* Primary database table storing top-level ontology domain records.
	* Each row represents one TLD family (dd, rsc, es, …) and holds metadata
	* such as name, active flag, lang, typology, and target_section_tipo.
	* Overridden by hierarchy ('matrix_hierarchy_main').
	* @var string $main_table
	*/
	public static string $main_table		= 'matrix_ontology_main';

	/**
	* Section tipo of the main ontology section — 'ontology35' (DEDALO_ONTOLOGY_SECTION_TIPO).
	* Used as the section_tipo when creating or querying rows in $main_table.
	* Overridden by hierarchy ('hierarchy1').
	* @var string $main_section_tipo
	*/
	public static string $main_section_tipo	= DEDALO_ONTOLOGY_SECTION_TIPO; // 'ontology35';

	/**
	* Tipo of the component_relation_children component that stores child-node
	* locators on each ontology node record.  Corresponds to 'ontology14'.
	* Used by reorder_nodes_from_dd_ontology() and get_siblings().
	* @var string $children_tipo
	*/
	public static string $children_tipo = 'ontology14';

	/**
	* Process-scoped cache for the list of target_section_tipo strings
	* returned by get_all_ontology_sections().  Populated on first call;
	* cleared by clear().
	* @var array $cache_ontology_sections
	*/
	public static array $cache_ontology_sections = [];

	/**
	* Process-scoped cache for the active element objects returned by
	* get_active_elements().  Populated on first call; cleared by clear().
	* @var array $cache_active_ontology_elements
	*/
	public static array $cache_active_ontology_elements = [];


	/**
	* CREATE_ONTOLOGY_RECORDS
	* Batch-converts an array of legacy 'dd_ontology' flat rows into editable matrix records.
	*
	* Each row in $dd_ontology_rows corresponds to one node in the (formerly named 'jer_dd')
	* flat ontology table.  The method delegates per-row work to
	* add_section_record_from_dd_ontology() and is the entry-point called by
	* transform_data::generate_all_main_ontology_sections() during a full ontology
	* bootstrap or migration run.
	*
	* Rows whose section_id is '0' (i.e. the synthetic TLD-root placeholder such as 'dd0')
	* are intentionally skipped — section_id 0 is invalid in the matrix, and the root
	* node for each TLD is stored in 'matrix_ontology_main' instead (via add_main_section).
	*
	* @see transform_data::generate_all_main_ontology_sections
	* @param array $dd_ontology_rows Array of raw stdClass row objects from 'dd_ontology'.
	* @return bool Always true; individual row failures are logged but do not abort the loop.
	* @test true
	*/
	public static function create_ontology_records( array $dd_ontology_rows ) : bool {

		foreach ($dd_ontology_rows as $dd_ontology_row) {

			$id = get_section_id_from_tipo( $dd_ontology_row->tipo );
			// Skip main section of the tld.
			// main section is defined with the tld  + 0 as dd0,rsc0, etc.
			// this definition will be stored in ontology main
			// therefore, don't save it into matrix tables,
			// it will create a mistake section with section_id = 0 and section_tipo as 'dd0'
			// as well as section_tipo is fine with 'dd0' section_id can not be 0 in any case.
			if( $id==='0' ){
				continue;
			}

			$result = self::add_section_record_from_dd_ontology( $dd_ontology_row );
			if (!$result) {
				debug_log(__METHOD__
					. " Error adding section " . PHP_EOL
					. ' dd_ontology_row: ' . to_string($dd_ontology_row)
					, logger::ERROR
				);
			}
		}


		return true;
	}//end create_ontology_records



	/**
	* ADD_SECTION_RECORD_FROM_DD_ONTOLOGY
	* Transforms a single 'dd_ontology' flat row into a full matrix section record.
	*
	* This is the per-row worker called by create_ontology_records().  It:
	*   1. Creates a new section record in the appropriate per-TLD matrix table
	*      (e.g. 'matrix_dd0') using the numeric portion of $dd_ontology_row->tipo as section_id.
	*   2. Instantiates and saves each component (tld, model, is_descriptor, is_model,
	*      translatable, term, properties-v5, properties-css, properties-rqo, properties).
	*   3. Derives the target_section_tipo from the row's tld via map_tld_to_target_section_tipo().
	*
	* Component tipo constants used:
	*   ontology4  — is_descriptor (component_radio_button)
	*   ontology5  — term          (component_input_text multilingual)
	*   ontology6  — model         (component_portal → dd0 node)
	*   ontology7  — tld           (component_input_text)
	*   ontology8  — is_translatable (component_radio_button)
	*   ontology16 — properties.css
	*   ontology17 — properties.source (RQO / request_config)
	*   ontology18 — properties (general JSON blob)
	*   ontology19 — propiedades (v5 legacy JSON)
	*   ontology30 — is_model     (component_radio_button)
	*
	* @param object $dd_ontology_row Raw row from 'dd_ontology'. Expected shape:
	*   {
	*     "id": "16028305",
	*     "tipo": "test102",
	*     "parent": "test45",
	*     "term": "{\"lg-spa\": \"section_id\"}",
	*     "model_tipo": "dd1747",
	*     "is_model": false,
	*     "order_number": "28",
	*     "tld": "test",
	*     "is_translatable": false,
	*     "relations": "null",
	*     "propiedades": null,
	*     "properties": null
	*   }
	* @return bool True on success; false is not currently returned (errors are logged only).
	* @test true
	*/
	public static function add_section_record_from_dd_ontology( object $dd_ontology_row ) : bool {

		// vars
		$tld					= $dd_ontology_row->tld;
		$target_section_tipo	= self::map_tld_to_target_section_tipo( $tld );
		$node_tipo				= $dd_ontology_row->tipo;
		$parent					= $dd_ontology_row->parent;
		$model					= $dd_ontology_row->model_tipo;
		$is_model				= $dd_ontology_row->is_model;
		$translatable			= $dd_ontology_row->is_translatable;
		$relations				= !empty ( $dd_ontology_row->relations )
			? (json_handler::decode( $dd_ontology_row->relations ) ?? [])
			: [];
		$properties_v5			= !empty ( $dd_ontology_row->propiedades ) ? json_decode( $dd_ontology_row->propiedades ) : null;
		$properties				= !empty ( $dd_ontology_row->properties ) ? json_decode( $dd_ontology_row->properties ) : new stdClass();
		$term					= !empty ( $dd_ontology_row->term ) ? json_decode( $dd_ontology_row->term ) : new stdClass();


		// get the section_id from the node_tipo: oh1 = 1, rsc197 = 197, etc.
		$section_id = (int)get_section_id_from_tipo( $node_tipo );

		// Section, create new section
		$section = section::get_instance($target_section_tipo);
		$section->create_record((object)[
			'section_id' => $section_id // force creation with specific section_id
		]);

		// tld
			$tld_tipo		= 'ontology7';
			$tld_model		= ontology_node::get_model_by_tipo( $tld_tipo  );
			$tld_component	= component_common::get_instance(
				$tld_model,
				$tld_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);
			// @working here !
			$data = null;
			if(!empty($tld)){
				$value = new stdClass();
					$value->value = $tld;
				$data = [$value];
			}
			$tld_component->set_data( $data );
			$tld_component->save();

		// model. Get the model tld and id
			if( !empty($model) && $model!=='null' ){
				$model_section_id	= get_section_id_from_tipo( $model );
				$model_tld			= get_tld_from_tipo( $model );
				$model_section_tipo	= self::map_tld_to_target_section_tipo( $model_tld );

				$model_locator = new locator();
					$model_locator->set_section_tipo( $model_section_tipo );
					$model_locator->set_section_id( $model_section_id );

				$model_tipo			= 'ontology6';
				$model_model		= ontology_node::get_model_by_tipo( $model_tipo );
				$model_component	= component_common::get_instance(
					$model_model,
					$model_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$target_section_tipo
				);

				$data = empty($model_locator) ? null : [$model_locator];
				$model_component->set_data( $data );
				$model_component->save();
			}

		// descriptor
			//always with fixed data as yes, all ontology nodes are descriptors.
			$is_descriptor_tipo			= 'ontology4';
			$is_descriptor_model		= ontology_node::get_model_by_tipo( $is_descriptor_tipo  );
			$is_descriptor_component	= component_common::get_instance(
				$is_descriptor_model,
				$is_descriptor_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$descriptor_locator = new locator();
				$descriptor_locator->set_section_tipo( DEDALO_SECTION_SI_NO_TIPO );
				$descriptor_locator->set_section_id( NUMERICAL_MATRIX_VALUE_YES );

			$data = [$descriptor_locator];
			$is_descriptor_component->set_data( $data );
			$is_descriptor_component->save();

		// is model
			$is_model_tipo		= 'ontology30';
			$is_model_model		= ontology_node::get_model_by_tipo( $is_model_tipo  );
			$is_model_component	= component_common::get_instance(
				$is_model_model,
				$is_model_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$is_model_locator = new locator();
				$is_model_locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
				$is_model_locator->set_section_id($is_model ? NUMERICAL_MATRIX_VALUE_YES : NUMERICAL_MATRIX_VALUE_NO);

			$data = [$is_model_locator];
			$is_model_component->set_data( $data );
			$is_model_component->save();

		// translatable
			$translatable_tipo		= 'ontology8';
			$translatable_model		= ontology_node::get_model_by_tipo( $translatable_tipo  );
			$translatable_component	= component_common::get_instance(
				$translatable_model,
				$translatable_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$translatable_locator = new locator();
				$translatable_locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
				$translatable_locator->set_section_id($translatable ? NUMERICAL_MATRIX_VALUE_YES : NUMERICAL_MATRIX_VALUE_NO);

			$data = [$translatable_locator];
			$translatable_component->set_data( $data );
			$translatable_component->save();

		// term
			$term_tipo		= 'ontology5';
			$term_model		= ontology_node::get_model_by_tipo( $term_tipo  );
			//build the term data
			$term_data = [];
			foreach ($term as $current_lang => $term_value) {
				$current_term_value = new stdClass();
					$current_term_value->lang 	= $current_lang;
					$current_term_value->value	= $term_value;

				$term_data[] = $current_term_value;
			}
			// create the component
			$term_component	= component_common::get_instance(
				$term_model,
				$term_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$target_section_tipo
			);
			// set its data and save
			$term_component->set_data( $term_data );
			$term_component->save();


		// properties V5
			$properties_v5_tipo			= 'ontology19';
			$properties_v5_model		= ontology_node::get_model_by_tipo( $properties_v5_tipo  );
			$properties_v5_component	= component_common::get_instance(
				$properties_v5_model,
				$properties_v5_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$dato = empty($properties_v5) ? null : [$properties_v5];
			$properties_v5_component->set_dato( $dato );
			$properties_v5_component->Save();

		// properties CSS
			$properties_css_tipo		= 'ontology16';
			$properties_css_model		= ontology_node::get_model_by_tipo( $properties_css_tipo  );
			$properties_css_component	= component_common::get_instance(
				$properties_css_model,
				$properties_css_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$properties_css = $properties->css ?? null;

			$data = [$properties_css];
			$properties_css_component->set_data( $data );
			$properties_css_component->save();

		// properties RQO
			$properties_rqo_tipo		= 'ontology17';
			$properties_rqo_model		= ontology_node::get_model_by_tipo( $properties_rqo_tipo  );
			$properties_rqo_component	= component_common::get_instance(
				$properties_rqo_model,
				$properties_rqo_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$properties_rqo = $properties->source ?? null;

			$data = [$properties_rqo];
			$properties_rqo_component->set_data( $data );
			$properties_rqo_component->save();

		// properties
			$properties_tipo		= 'ontology18';
			$properties_model		= ontology_node::get_model_by_tipo( $properties_tipo  );
			$properties_component	= component_common::get_instance(
				$properties_model,
				$properties_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			// list thesaurus exception `dd144`
			// until 6.4 list thesaurus is an array of objects without any kind of definition
			// in 6.4 his definition change to be a `show` object with a `ddo_map` as others
			// if($model === 'dd144' && !empty($properties) && is_array($properties) ){

			// 	// generate the new objects and assign the old properties
			// 	$new_properties = new stdClass();
			// 		$new_properties->show = new stdClass();
			// 		$new_properties->show->ddo_map = $properties;

			// 	$properties = $new_properties;

			// 	// update dd_ontology record with the new properties
			// 	$ontology_node = ontology_node::get_instance($dd_ontology_row->tipo);
			// 	$ontology_node->get_properties(); // force load data
			// 	$ontology_node->set_properties($new_properties);
			// 	$ontology_node->update();
			// }

			// Properties general extraction
			// 'source' and 'css' are stored in dedicated components (ontology17 / ontology16)
			// and are therefore excluded from the general properties blob (ontology18).
			// Each remaining key is stored as its scalar `.value` to strip the wrapper object
			// used in the legacy 'dd_ontology' column.
			if(!empty($properties)) {
				$properties_general = new stdClass();
				foreach ($properties as $pkey => $pvalue) {
					if ($pkey==='source' || $pkey==='css') {
						continue;
					}
					$properties_general->{$pkey} = $pvalue->value ?? null;
				}
				$properties_general_value = [$properties_general];
			}

			$properties_component->set_data( $properties_general_value ?? null );
			$properties_component->save();


		return true;
	}//end add_section_record_from_dd_ontology



	/**
	* GET_ONTOLOGY_MAIN_FROM_TLD
	* Retrieves the single 'matrix_ontology_main' row for a given TLD string.
	*
	* Uses a PostgreSQL JSONB containment query (@>) against the 'string' column
	* to find the row whose DEDALO_HIERARCHY_TLD2_TIPO component value matches $tld.
	* Example: 'dd' → {section_tipo: 'ontology35', section_id: 1}.
	*
	* The TLD is sanitised via safe_tld() before use in the query to prevent
	* SQL injection (safe_tld() strips everything except alphanumerics and hyphens).
	*
	* @param string $tld Short top-level domain string, e.g. 'dd', 'rsc', 'es'.
	* @return object|null Row with properties section_id and section_tipo, or null on miss.
	* @test true
	*/
	public static function get_ontology_main_from_tld( string $tld ) : ?object {

		// set a safe tld to avoid SQL injection attacks (only alphanumeric and hyphen)
		$tld 		= trim(strtolower($tld));
		$safe_tld 	= safe_tld( $tld );

		if(empty($safe_tld)) {
			debug_log(__METHOD__
			   .' Ignored invalid tld' . PHP_EOL
			   .' tld: ' . to_string($tld)
			   , logger::ERROR
			);
			return null;
		}

		// params
		$params = [
			self::$main_section_tipo,
			'{"'.DEDALO_HIERARCHY_TLD2_TIPO.'": [{"value": "'.$safe_tld.'"}]}'
		];

		// SQL query
		$sql  = 'SELECT section_id, section_tipo ' . PHP_EOL;
		$sql .= 'FROM '. self::$main_table . PHP_EOL;
		$sql .= 'WHERE section_tipo = $1 AND' . PHP_EOL;
		$sql .= 'string @> $2' . PHP_EOL;
		$sql .= 'LIMIT 1;';

		// search
		$result = matrix_db_manager::exec_search($sql, $params);
		if ($result === false) {
			return null;
		}
		$row = pg_fetch_object($result);


		return $row !== false ? $row : null;
	}//end get_ontology_main_from_tld



	/**
	* GET_ONTOLOGY_MAIN_FORM_TARGET_SECTION_TIPO
	* Retrieves the 'matrix_ontology_main' row whose DEDALO_HIERARCHY_TARGET_SECTION_TIPO
	* component value matches $target_section_tipo.
	*
	* Inverse of get_ontology_main_from_tld(): given the matrix table identifier
	* (e.g. 'ontology45') it returns the corresponding main section row
	* (e.g. section_tipo: 'ontology35', section_id: 4).
	*
	* Uses a JSONB containment query (@>) for the lookup, with safe_tipo() sanitisation.
	*
	* @param string $target_section_tipo The per-TLD matrix section tipo, e.g. 'dd0', 'ontology45'.
	* @return object|null Row with section_id and section_tipo, or null on miss.
	* @test true
	*/
	public static function get_ontology_main_form_target_section_tipo( string $target_section_tipo ) : ?object {

		// set a safe tipo to avoid SQL injection attacks (only alphanumeric and hyphen)
		$target_section_tipo = trim(strtolower($target_section_tipo));
		$safe_tipo = safe_tipo( $target_section_tipo );

		if(empty($safe_tipo)) {
			debug_log(__METHOD__
			   .' Ignored invalid target section tipo' . PHP_EOL
			   .' target_section_tipo: ' . to_string($target_section_tipo)
			   , logger::ERROR
			);
			return null;
		}

		// params
		$params = [
			self::$main_section_tipo,
			'{"'.DEDALO_HIERARCHY_TARGET_SECTION_TIPO.'": [{"value": "'.$safe_tipo.'"}]}'
		];

		// SQL query
		$sql  = 'SELECT section_id, section_tipo ' . PHP_EOL;
		$sql .= 'FROM '. self::$main_table . PHP_EOL;
		$sql .= 'WHERE section_tipo = $1 AND' . PHP_EOL;
		$sql .= 'string @> $2' . PHP_EOL;
		$sql .= 'LIMIT 1;';

		// search
		$result = matrix_db_manager::exec_search($sql, $params);
		if ($result === false) {
			return null;
		}
		$row = pg_fetch_object($result);


		return $row !== false ? $row : null;
	}//end get_ontology_main_form_target_section_tipo



	/**
	* ASSIGN_RELATIONS_FROM_DD_ONTOLOGY
	* Populates the 'connected-to' component (ontology10) for every matrix node of a TLD.
	*
	* Called after create_ontology_records() has created matrix rows: at that point
	* the node-to-node relation data (which lives in the 'relations' column of 'dd_ontology')
	* can be resolved because target nodes already exist.  For each matrix row it:
	*   1. Derives the node tipo from the TLD + section_id.
	*   2. Fetches the raw relation tipos via ontology_node::get_relation_nodes().
	*   3. Converts each relation tipo to a locator pointing to the target matrix section.
	*   4. Saves the locator array into the DEDALO_ONTOLOGY_CONNECTED_TO_TIPO component.
	*
	* @param string $tld TLD to process, e.g. 'dd', 'rsc'.
	* @return bool False if the TLD fails validation or the matrix record set cannot be loaded.
	* @test true
	*/
	public static function assign_relations_from_dd_ontology( string $tld ) : bool {

		// set a safe tld to avoid SQL injection attacks (only alphanumeric and hyphen)
		$tld 		= trim(strtolower($tld));
		$safe_tld 	= safe_tld( $tld );

		if(empty($safe_tld)) {
			debug_log(__METHOD__
			   .' Ignored invalid tld' . PHP_EOL
			   .' tld: ' . to_string($tld)
			   , logger::ERROR
			);
			return false;
		}

		// target_section_tipo
		$target_section_tipo = self::map_tld_to_target_section_tipo( $safe_tld );

		// get all section instances rows
		$all_section_instances = section::get_resource_all_section_records_unfiltered( $target_section_tipo );
		if (!$all_section_instances) {
			debug_log(__METHOD__
			   .' Error on get resource_all_section_records' . PHP_EOL
			   .' target_section_tipo: ' . to_string($target_section_tipo)
			   , logger::ERROR
			);
			return false;
		}

		while ($row = pg_fetch_assoc($all_section_instances)) {

			$section_id = $row['section_id'];

			$node_tipo = $tld.$section_id;
			$relations = ontology_node::get_relation_nodes( $node_tipo, true, true );

			// Relations
			$relations_tipo			= DEDALO_ONTOLOGY_CONNECTED_TO_TIPO; // 'ontology10' component_autocomplete_hi;
			$relations_model		= ontology_node::get_model_by_tipo( $relations_tipo  );
			$relations_component	= component_common::get_instance(
				$relations_model,
				$relations_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$related_locators = [];
			foreach ($relations as $related_tipo) {

				// get the parent tld and id
				$related_section_id		= get_section_id_from_tipo( $related_tipo );
				$related_tld			= get_tld_from_tipo( $related_tipo );
				$related_section_tipo	= self::map_tld_to_target_section_tipo( $related_tld );

				$related_locator = new locator();
					$related_locator->set_section_tipo( $related_section_tipo );
					$related_locator->set_section_id( $related_section_id );

				$related_locators[] = $related_locator;
			}

			$relations_component->set_data( $related_locators );
			$relations_component->save();
		}


		return true;
	}//end assign_relations_from_dd_ontology



	/**
	* REORDER_NODES_FROM_DD_ONTOLOGY
	* Writes the ordered child-locator list into every node's component_relation_children
	* (ontology14) for a given TLD.
	*
	* Like assign_relations_from_dd_ontology(), this runs after create_ontology_records()
	* so that all sibling nodes already exist in the matrix.  For each row it:
	*   1. Retrieves the child tipos from ontology_node::get_ar_children().
	*   2. Converts each child tipo to a locator targeting its matrix section record.
	*   3. Saves the ordered array into the children component (self::$children_tipo = 'ontology14').
	*
	* The ordering is authoritative — it determines how the ontology tree is displayed
	* in the thesaurus and area views.
	*
	* @param string $tld TLD to process, e.g. 'dd', 'rsc'.
	* @return bool False if the TLD is invalid or the record set cannot be loaded.
	* @test true
	*/
	public static function reorder_nodes_from_dd_ontology( string $tld ) : bool {

		// set a safe tld to avoid SQL injection attacks (only alphanumeric and hyphen)
		$tld 		= trim(strtolower($tld));
		$safe_tld 	= safe_tld( $tld );

		if(empty($safe_tld)) {
			debug_log(__METHOD__
			   .' Ignored invalid tld' . PHP_EOL
			   .' tld: ' . to_string($tld)
			   , logger::ERROR
			);
			return false;
		}

		// vars
		$target_section_tipo = self::map_tld_to_target_section_tipo( $safe_tld );

		// get all section
		$all_section_instances = section::get_resource_all_section_records_unfiltered( $target_section_tipo );
		if (!$all_section_instances) {
			debug_log(__METHOD__
			   .' Error on get resource_all_section_records' . PHP_EOL
			   .' tld: ' . to_string($tld) . PHP_EOL
			   .' target_section_tipo: ' . to_string($target_section_tipo)
			   , logger::ERROR
			);
			return false;
		}

		while ($row = pg_fetch_assoc($all_section_instances)) {

			$section_id	= $row['section_id'];
			$node_tipo	= $tld.$section_id;
			$children	= ontology_node::get_ar_children($node_tipo);

			$children_data = [];
			foreach ($children as $child_tipo) {

				$child_section_id	= get_section_id_from_tipo( $child_tipo );
				$child_tld			= get_tld_from_tipo( $child_tipo );
				$child_section_tipo	= self::map_tld_to_target_section_tipo( $child_tld );

				$child_locator = new locator();
					$child_locator->set_section_tipo($child_section_tipo);
					$child_locator->set_section_id($child_section_id);

				$children_data[] = $child_locator;
			}

			$children_tipo		= ontology::$children_tipo; // 'ontology14' component_relation_children;
			$children_model		= ontology_node::get_model_by_tipo( $children_tipo );
			$children_component	= component_common::get_instance(
				$children_model,
				$children_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$children_component->set_data($children_data);
			$children_component->save();
		}


		return true;
	}//end reorder_nodes_from_dd_ontology



	/**
	* ADD_MAIN_SECTION
	* Creates or updates the 'matrix_ontology_main' record for a given TLD.
	*
	* This is the primary entry-point for registering a new top-level ontology
	* family (official TLDs: dd, rsc, hierarchy; institutional TLDs: es, qdp, mupreva …).
	* It is idempotent: if a row already exists for the TLD it reuses that section_id;
	* otherwise it creates a new section record.
	*
	* Components written (constants → tipology):
	*   DEDALO_HIERARCHY_FILTER_TIPO           — project filter (links to project 1)
	*   DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO — active-in-thesaurus flag (only 'dd' = yes by default)
	*   DEDALO_HIERARCHY_LANG_TIPO             — main language (defaults to Spanish, lg-spa = 17344)
	*   DEDALO_HIERARCHY_ACTIVE_TIPO           — active flag (yes by default)
	*   DEDALO_HIERARCHY_TERM_TIPO             — display name (multilingual)
	*   DEDALO_HIERARCHY_TLD2_TIPO             — TLD string value
	*   DEDALO_HIERARCHY_TARGET_SECTION_TIPO   — matrix section tipo (e.g. 'dd0')
	*   DEDALO_HIERARCHY_TYPOLOGY_TIPO         — typology locator (optional)
	*   DEDALO_HIERARCHY_CHILDREN_TIPO         — root children (only for 'dd'; nodes dd1 and dd2)
	*
	* @param object $file_item Descriptor object. Expected shape:
	*   {
	*     "tld":         "oh",         // required
	*     "section_tipo":"oh0",        // optional; derived from tld if absent
	*     "typology_id": "5",          // optional; resolved from hierarchy if absent
	*     "name_data":   {"lg-spa": ["oh"]}  // optional; falls back to tld string
	*   }
	* @return int|string|null The section_id of the created/updated main section, or null on save failure.
	* @test true
	*/
	public static function add_main_section( object $file_item ) : int|string|null {

		// file item properties
			$tld					= $file_item->tld;
			$target_section_tipo	= $file_item->section_tipo ?? ontology::map_tld_to_target_section_tipo( $tld );
			$typology_id			= $file_item->typology_id ?? null;
			$name_data				= $file_item->name_data ?? null;

		// Typology fallback
			if( empty($typology_id) ){
				$typology_locator = hierarchy::get_typology_locator_from_tld( $tld );
				if( !empty($typology_locator) ){
					$typology_id = (int)$typology_locator->section_id;
				}
			}

		// Name fallback
			if( empty($name_data) ){
				$name_data = [(object)[
					"id"	=> 1,
					"lang" 	=> DEDALO_STRUCTURE_LANG,
					"value" => $tld
				]];
			}

		// check if the main tld already exists
			$row_ontology_main = self::get_ontology_main_from_tld( $tld );

		// if main section exist update it, else create new one
			$main_section_id = ( !empty($row_ontology_main) )
				? $row_ontology_main->section_id
				: null ;

		// If the main section doesn't exists create new record using section
			if($main_section_id===null){
				$main_section = section::get_instance(
					self::$main_section_tipo // string section_tipo
				);
				$main_section_id = $main_section->create_record();
			}
		// create the main section_record
			$section_record = section_record::get_instance(self::$main_section_tipo, (int)$main_section_id);

		// Project
			$tipo 	= DEDALO_HIERARCHY_FILTER_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );
			$component_data = new locator();
				$component_data->set_id( 1 );
				$component_data->set_type( DEDALO_RELATION_TYPE_FILTER ); // dd675
				$component_data->set_section_tipo( DEDALO_SECTION_PROJECTS_TIPO ); // dd153
				$component_data->set_section_id( '1' );
				$component_data->set_from_component_tipo( $tipo );

			$section_record->set_component_data($tipo, $column, [$component_data]);

		// Thesaurus active
			$tipo 	= DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );
			$ts_active_data = new locator();
				$ts_active_data->set_id( 1 );
				$ts_active_data->set_type( DEDALO_RELATION_TYPE_LINK ); // dd151
				$ts_active_data->set_section_tipo( DEDALO_SECTION_SI_NO_TIPO ); // dd64
				// active in thesaurus. Set only dd as active to force to show in the thesaurus tree
			// Only the core 'dd' ontology is shown in the thesaurus tree by default.
			// Institutional TLDs (es, qdp, …) are off by default so the thesaurus tree
			// does not show incomplete or unreviewed ontologies to end-users.
			// Administrators can turn each TLD on manually via the ontology editor.
				$ts_is_active = ($tld === 'dd') ? NUMERICAL_MATRIX_VALUE_YES : NUMERICAL_MATRIX_VALUE_NO; // only dd terms will be active by default, any other tld wil be no active, user can change it manually.
				$ts_active_data->set_section_id( $ts_is_active );
				$ts_active_data->set_from_component_tipo( $tipo );

			$section_record->set_component_data($tipo, $column, [$ts_active_data]);

		// Language
			$tipo 	= DEDALO_HIERARCHY_LANG_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );
			$component_data = new locator();
				$component_data->set_id( 1 );
				$component_data->set_type( DEDALO_RELATION_TYPE_LINK ); // dd151
				$component_data->set_section_tipo( 'lg1' );
				$component_data->set_section_id( '17344' ); // lg-spa, Spanish!
				$component_data->set_from_component_tipo( $tipo );

			$section_record->set_component_data($tipo, $column, [$component_data]);

		// Active
			$tipo 	= DEDALO_HIERARCHY_ACTIVE_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );
			$component_data = new locator();
				$component_data->set_id( 1 );
				$component_data->set_type( DEDALO_RELATION_TYPE_LINK ); // dd151
				$component_data->set_section_tipo( DEDALO_SECTION_SI_NO_TIPO ); // dd64
				$component_data->set_section_id( NUMERICAL_MATRIX_VALUE_YES ); // 1
				$component_data->set_from_component_tipo( $tipo );

			$section_record->set_component_data($tipo, $column, [$component_data]);

		// Name
			$tipo 	= DEDALO_HIERARCHY_TERM_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );

			if (!empty($name_data)) {
				if( is_object($name_data) ) {
					// v6 compatibility
					$fixed_value = [];
					foreach($name_data as $lang => $value) {
						$fixed_value[] = (object)[
							'id'    => 1,
							'lang'  => $lang,
							'value' => to_string($value)
						];
					}
					$name_data = $fixed_value;
				}

				$section_record->set_component_data($tipo, $column, $name_data);
			}

		// TLD
			$tipo 	= DEDALO_HIERARCHY_TLD2_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );
			$tld_data = [(object)[
				'id'	=> 1,
				'lang' 	=> DEDALO_DATA_NOLAN,
				'value' => $tld
			]];

			$section_record->set_component_data($tipo, $column, $tld_data);

		// Target section tipo
			$tipo 	= DEDALO_HIERARCHY_TARGET_SECTION_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );

			$target_section_tipo_data = [(object)[
				'id'	=> 1,
				'lang' 	=> DEDALO_DATA_NOLAN,
				'value' => $target_section_tipo
			]];

			$section_record->set_component_data($tipo, $column, $target_section_tipo_data);

		// Typology
			if( !empty($typology_id) ){
				$tipo 	= DEDALO_HIERARCHY_TYPOLOGY_TIPO;
				$model 	= ontology_node::get_model_by_tipo( $tipo );
				$column = section_record_data::get_column_name( $model );

				$typology_data = new locator();
					$typology_data->set_type( DEDALO_RELATION_TYPE_LINK ); // dd151
					$typology_data->set_section_tipo( DEDALO_HIERARCHY_TYPES_SECTION_TIPO );
					$typology_data->set_section_id( $typology_id );
					$typology_data->set_from_component_tipo( DEDALO_HIERARCHY_TYPOLOGY_TIPO );

				$section_record->set_component_data($tipo, $column, [$typology_data]);
			}

		// add model root node in the dd main section only. Note that only dd has the models for the ontology.
		// The 'dd' TLD is special: nodes dd1 (general terms) and dd2 (models) are the two
		// root children.  Institutional TLDs only have their own term tree; they do not
		// re-define the model root.
			if($tld === 'dd'){

				$tipo 	= DEDALO_HIERARCHY_CHILDREN_TIPO; // hierarchy45
				$model 	= ontology_node::get_model_by_tipo( $tipo );
				$column = section_record_data::get_column_name( $model );

				// general term
				$general_term = new locator();
					$general_term->set_type( DEDALO_RELATION_TYPE_CHILDREN_TIPO ); // dd48
					$general_term->set_section_tipo( $target_section_tipo );
					$general_term->set_section_id( '1' );
					$general_term->set_from_component_tipo( $tipo );

				// model term
				$model_term = new locator();
					$model_term->set_type( DEDALO_RELATION_TYPE_CHILDREN_TIPO ); // dd48
					$model_term->set_section_tipo( $target_section_tipo );
					$model_term->set_section_id( '2' );
					$model_term->set_from_component_tipo( $tipo );

				$section_record->set_component_data($tipo, $column, [$general_term, $model_term]);
			}

		// Save the section record
			if( !$section_record->save() ) {
				debug_log(__METHOD__
					. " Error saving section record " . PHP_EOL
					. ' main_section_id: ' . to_string($main_section_id)
					, logger::ERROR
				);
			}


		return $main_section_id;
	}//end add_main_section



	/**
	* CREATE_DD_ONTOLOGY_ONTOLOGY_SECTION_NODE
	* Creates or updates the 'dd_ontology' root node for a local/institutional TLD.
	*
	* Every TLD that has been registered in 'matrix_ontology_main' also needs a
	* corresponding root node in 'dd_ontology' (the runtime flat table) so the
	* ontology engine can resolve it.  This method builds that node as tipo = tld+'0'
	* (e.g. 'mdcat0', 'mupreva0') and upserts it via ontology_node::insert().
	*
	* The root node always:
	*   - Has model_tipo = SECTION_MODEL ('dd6') and model = 'section'.
	*   - Is not a model (is_model = false).
	*   - Is non-translatable.
	*   - Is flagged as the main (root) node for the TLD (set_is_main(true)).
	*   - Is linked to standard relation tipos: 'ontology1' and 'dd1201'.
	*   - Carries properties.main_tld (the TLD string) and properties.color.
	*
	* @param object $file_item Configuration object:
	*   {
	*     tld:                string  — required
	*     typology_id:        int     — optional; resolved from hierarchy if absent
	*     name_data:          array|object — optional; falls back to tld string
	*     parent_grouper_tipo:string  — optional; resolved via create_parent_grouper if absent
	*   }
	* @return string|false|null The created tipo string (e.g. 'mdcat0') on success,
	*   false on insert error, null if dependencies are unresolvable.
	* @test true
	*/
	public static function create_dd_ontology_ontology_section_node( object $file_item ) : string|false|null {

		// file item properties
			$tld					= $file_item->tld;
			$typology_id			= $file_item->typology_id ?? null;
			$name_data				= $file_item->name_data ?? null;
			$parent_grouper_tipo	= $file_item->parent_grouper_tipo ?? null;

		// Typology fallback
			if( empty($typology_id) ){
				$typology_locator = hierarchy::get_typology_locator_from_tld( $tld );
				$typology_id = !empty($typology_locator) ? (int)$typology_locator->section_id : 15;
			} else {
				$typology_id = (int)$typology_id;
			}

		// Name fallback
			if( empty($name_data) ){
				$name_data = [(object)[
					"lang" 	=> DEDALO_STRUCTURE_LANG,
					"value" => $tld
				]];
			}

		// create the parent group node
		// if parent group is given, will use it, else create the parent_gruper to build the nodes.
			if( empty($parent_grouper_tipo) ){
				// parent group is set with his typology
				// if typology is not set it will assign to typology 15 `others`
				$parent_grouper_tipo = ontology::create_parent_grouper( 'ontology40', 'ontologytype', $typology_id );
			}

		// Ontology section for the given tld
		// ontology section is the main or root node used to create the ontology nodes.
		// it is defined as tld+0, because the nodes start with 1 as dd1, rsc1, etc.
			$tipo = $tld.'0'; // as mdcat0, mupreva0, etc.

			$ontology_node = ontology_node::get_instance($tipo);
				$ontology_node->set_parent($parent_grouper_tipo);
				$ontology_node->set_model_tipo(SECTION_MODEL); // Use constant 'dd6'
				$ontology_node->set_model('section');
				$ontology_node->set_is_model(false);
				$ontology_node->set_tld($tld);
				$ontology_node->set_is_translatable(false);
				$ontology_node->set_is_main(true);
				$ontology_node->set_relations([
					(object)['tipo' => 'ontology1'],
					(object)['tipo' => 'dd1201']
				]);

				// Properties, add main_tld as official tld definitions
				// and local section color
				$properties = new stdClass();
					$properties->main_tld	= $tld;
					$properties->color		= '#2d8894';
				$ontology_node->set_properties($properties);

				// term
				if (!empty($name_data)) {
					if( is_object($name_data) ) {
						// v6 compatibility
						$term = $name_data;
						// safe string conversion (v6 conversion issues)
						foreach($term as $lang => $value) {
							$term->{$lang} = to_string($value);
						}
					} else {
						$term = new stdClass();
						foreach ($name_data as $data_element) {
							$term->{$data_element->lang} = to_string($data_element->value);
						}
					}
					$ontology_node->set_term_data( $term );
				}

			// Insert into DDBB
			if (!$ontology_node->insert()) {
				debug_log(__METHOD__ . " Error inserting ontology node: $tipo", logger::ERROR);
				return false;
			}


		return $tipo;
	}//end create_dd_ontology_ontology_section_node



	/**
	* CREATE_PARENT_GROUPER
	* Ensures a typology grouper node exists in both 'dd_ontology' and the matrix,
	* then returns its tipo for use as the parent reference of a new TLD root node.
	*
	* Ontology nodes are organised under a two-level grouper hierarchy:
	*   ontology40  (instances node, e.g. "Ontology typologies | ontologytype")
	*     └─ ontologytype14  (core node for a specific typology, e.g. typology 14)
	*
	* This method has to be resilient to partial bootstrap states: during a full
	* regeneration the child node (ontologytype14) may be processed before its
	* parent (ontology40) has been inserted.  When that happens the method creates
	* the parent in both 'dd_ontology' and the matrix on-the-fly so that the child
	* can correctly write its parent locator.
	*
	* The method also calls add_main_section() and create_dd_ontology_ontology_section_node()
	* for the $tld namespace itself (e.g. 'ontologytype') so the typology TLD is
	* fully registered before the grouper node is returned.
	*
	* @param string $parent_group The main instances node tipo, default 'ontology40'.
	* @param string $tld          The typology TLD namespace, 'ontologytype' or 'hierarchymtype'.
	* @param int    $typology_id  Numeric typology id (row in DEDALO_HIERARCHY_TYPES_SECTION_TIPO).
	* @return string|false The grouper tipo (e.g. 'ontologytype14') on success, false on error.
	* @test true
	*/
	public static function create_parent_grouper( string $parent_group='ontology40', string $tld='ontologytype', int $typology_id=15 ) : string|false {

		// Ontology main section for the given tld
		// ontology section is the main or root node used to create the ontology nodes.
		// it is defined as tld+0, instead nodes that they start with 1 as dd1, rsc1, etc.
		// this node is create to manage the typology sections
			// Suffix appended to the human-readable grouper label so operators
			// can distinguish hierarchy-model groupers ('[m]') from plain ontology
			// and hierarchy groupers in the area menu.
			$suffix = ( $tld==='hierarchymtype' )
				? ' [m]'.' | '.$tld
				: ''.' | '.$tld;

			// Multilingual labels for the grouper node.
			// These are internal structural labels (not data) so they are hardcoded
			// here rather than pulled from the thesaurus.
			$name_data =[
				(object)[
					'lang' => 'lg-spa',
					'value' => ($tld==='ontologytype')
						? 'Tipologías de ontología'.$suffix
						: 'Tipologías de jerarquía'.$suffix
				],
				(object)[
					'lang' => 'lg-eng',
					'value' => ($tld==='ontologytype')
						? 'Ontology typologies'.$suffix
						: 'Hierarchy typologies'.$suffix
				],
				(object)[
					'lang' => 'lg-deu',
					'value' => ($tld==='ontologytype')
						? 'Ontologie-Typen'.$suffix
						: 'Typologien der Hierarchie'.$suffix
				],
				(object)[
					'lang' => 'lg-fra',
					'value' => ($tld==='ontologytype')
						? 'Types d\'ontologie'.$suffix
						: 'Typologies hiérarchiques'.$suffix
				],
				(object)[
					'lang' => 'lg-ita',
					'value' => ($tld==='ontologytype')
						? 'Tipi di ontologia'.$suffix
						: 'Tipologie di gerarchia'.$suffix
				],
				(object)[
					'lang' => 'lg-cat',
					'value' => ($tld==='ontologytype')
						? 'Tipus d\'ontologia'.$suffix
						: 'Tipus de jerarquies'.$suffix
				],
				(object)[
					'lang' => 'lg-ell',
					'value' => ($tld==='ontologytype')
						? 'Τύποι οντολογίας'.$suffix
						: 'Τυπολογίες ιεραρχίας'.$suffix
				]
			];

			$file_data = new stdClass();
				$file_data->tld					= $tld;
				$file_data->typology_id			= $typology_id;
				$file_data->name_data			= $name_data;
				$file_data->parent_grouper_tipo	= 'ontologytype14';// don't create parent grouper

			// create the main section (table 'matrix_ontology_main') - equivalent to hierarchy main section
			ontology::add_main_section( $file_data );

			// create dd_ontology node for the main section (table 'dd_ontology')
			ontology::create_dd_ontology_ontology_section_node( $file_data );

		// Check parent
		// parent nodes needs to exist because the node will store itself in the children component of his parent
		// the main instances of typology for ontology node is `ontology40`
		// the main instances of typology for hierarchy nodes is `hierarchy56`
		// the main instances of typology for hierarchy mocel nodes is hierarchy57`
			$parent_tld			= get_tld_from_tipo( $parent_group );
			$parent_section_id	= get_section_id_from_tipo( $parent_group );
			$parent_node_tipo	= $parent_tld.'0';

			// dd_ontology. Check if the parent already exists in 'dd_ontology' table
				$parent_node = ontology_node::get_instance( $parent_node_tipo );
				$parent_ontology_row_data = $parent_node->get_data();
				if( empty($parent_ontology_row_data) ){

					// set parent nodes
					// $ontology_node = ontology_node::get_instance($parent_node_tipo);
					$parent_node->set_parent($parent_group);
					$parent_node->set_model_tipo(SECTION_MODEL); // dd6
					$parent_node->set_model('section');
					$parent_node->set_is_model(false);
					$parent_node->set_tld($parent_tld);
					$parent_node->set_is_translatable(false);
					$parent_node->set_is_main(true);
					$parent_node->set_relations([
						(object)['tipo' => 'ontology1'],
						(object)['tipo' => 'dd1201']
					]);

					// Properties, add main_tld as official tld definitions
					// and local section color
						$properties = new stdClass();
							$properties->main_tld	= $parent_tld;
							$properties->color		= '#276f67';
						$parent_node->set_properties($properties);

					// insert dd_ontology record
					if (!$parent_node->insert()) {
						debug_log(__METHOD__ . " Error inserting parent group node in dd_ontology: $parent_node_tipo", logger::ERROR);
						return false;
					}
				}

			// matrix. Check if the parent already exists in matrix
			$found = false;
			// if parent_section_id is not null, check if the parent exists in matrix
			if($parent_section_id !== null){
				$section_record = section_record::get_instance( $parent_node_tipo, (int)$parent_section_id );
				$found = $section_record->exists_in_the_database();
			}
			// if parent_section does not exist in matrix, create it
			if( $found===false ){
				// create a section record in matrix
				$section = section::get_instance( $parent_node_tipo );
				$parent_section_id_created = $section->create_record( (object)[
					'section_id' => $parent_section_id ? (int)$parent_section_id : null
				]);
				if (!$parent_section_id_created) {
					debug_log(__METHOD__ . " Error creating parent group section record in matrix: $parent_node_tipo", logger::ERROR);
					return false;
				}
			}

		// matrix section of the typology node
			$section_tipo = $tld.'0'; // it can be: ontologytype0, hierarchytype0, hierarchymtype0

			if($typology_id === null){
				$typology_section = section::get_instance( $section_tipo );
				// create the record in matrix_ontology table.
				$typology_id = $typology_section->create_record();
				if (!$typology_id) {
					debug_log(__METHOD__ . " Error creating typology section record in matrix: $section_tipo", logger::ERROR);
					return false;
				}
			}

			$section_record = section_record::get_instance( $section_tipo, (int)$typology_id);

		// Publication (= Yes, by default)
			$tipo 	= DEDALO_ONTOLOGY_PUBLICATION_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );
			$component_data = new locator();
				$component_data->set_id( 1 );
				$component_data->set_type( DEDALO_RELATION_TYPE_LINK ); // dd151
				$component_data->set_section_tipo( DEDALO_SECTION_SI_NO_TIPO ); // dd64
				$component_data->set_section_id( NUMERICAL_MATRIX_VALUE_YES ); // 1
				$component_data->set_from_component_tipo( $tipo );

			$section_record->set_component_data($tipo, $column, [$component_data]);

		// Is descriptor (= Yes, by default)
			$tipo 	= DEDALO_ONTOLOGY_IS_DESCRIPTOR_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );
			$component_data = new locator();
				$component_data->set_id( 1 );
				$component_data->set_type( DEDALO_RELATION_TYPE_LINK ); // dd151
				$component_data->set_section_tipo( DEDALO_SECTION_SI_NO_TIPO ); // dd64
				$component_data->set_section_id( NUMERICAL_MATRIX_VALUE_YES ); // 1
				$component_data->set_from_component_tipo( $tipo );

			$section_record->set_component_data($tipo, $column, [$component_data]);

		// Model (= area, by default)
			$tipo 	= DEDALO_ONTOLOGY_MODEL_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );
			$component_data = new locator();
				$component_data->set_id( 1 );
				$component_data->set_type( DEDALO_RELATION_TYPE_LINK ); // dd151
				$component_data->set_section_tipo( 'dd0' ); // DEDALO_ROOT_TIPO equivalent for section
				$component_data->set_section_id( '4' ); // area model root
				$component_data->set_from_component_tipo( $tipo );

			$section_record->set_component_data($tipo, $column, [$component_data]);

		// Translatable (= No, by default)
			$tipo 	= DEDALO_ONTOLOGY_TRANSLATABLE_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );
			$component_data = new locator();
				$component_data->set_id( 1 );
				$component_data->set_type( DEDALO_RELATION_TYPE_LINK ); // dd151
				$component_data->set_section_tipo( DEDALO_SECTION_SI_NO_TIPO ); // dd64
				$component_data->set_section_id( NUMERICAL_MATRIX_VALUE_NO ); // 2
				$component_data->set_from_component_tipo( $tipo );

			$section_record->set_component_data($tipo, $column, [$component_data]);

		// Is model (= No, by default)
			$tipo 	= DEDALO_ONTOLOGY_IS_MODEL_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );
			$component_data = new locator();
				$component_data->set_id( 1 );
				$component_data->set_type( DEDALO_RELATION_TYPE_LINK ); // dd151
				$component_data->set_section_tipo( DEDALO_SECTION_SI_NO_TIPO ); // dd64
				$component_data->set_section_id( NUMERICAL_MATRIX_VALUE_NO ); // 2
				$component_data->set_from_component_tipo( $tipo );

			$section_record->set_component_data($tipo, $column, [$component_data]);

		// tld
			$tipo 	= DEDALO_ONTOLOGY_TLD_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );
			$tld_data = [(object)[
				'id'	=> 1,
				'lang' 	=> DEDALO_DATA_NOLAN,
				'value' => $tld
			]];

			$section_record->set_component_data($tipo, $column, $tld_data);

		// Name
			// use the typology name. (component_input_text)
			$model			= 'component_input_text'; // ontology_node::get_model_by_tipo( DEDALO_HIERARCHY_TYPES_NAME_TIPO, true );
			$typology_term	= component_common::get_instance(
				$model, // string model
				DEDALO_HIERARCHY_TYPES_NAME_TIPO, // string tipo
				$typology_id, // string section_id
				'list', // string mode
				DEDALO_DATA_LANG, // string lang
				DEDALO_HIERARCHY_TYPES_SECTION_TIPO // string section_tipo
			);

			$typology_term_full_data = $typology_term->get_data();
			$tipo 	= DEDALO_ONTOLOGY_TERM_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );

			$section_record->set_component_data($tipo, $column, $typology_term_full_data);

		// parent
			$tipo 	= DEDALO_ONTOLOGY_PARENT_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo ) ?? 'component_relation_parent';
			$column = section_record_data::get_column_name( $model );
			$node_locator = new locator();
				$node_locator->set_type( DEDALO_RELATION_TYPE_PARENT_TIPO );
				$node_locator->set_section_id( $parent_section_id );
				$node_locator->set_section_tipo( $parent_node_tipo );
				$node_locator->set_from_component_tipo( $tipo );

			$section_record->set_component_data($tipo, $column, [$node_locator]);

		// save section record
			if (!$section_record->save()) {
				debug_log(__METHOD__ . " Error saving section record for parent grouper: $section_tipo id: $typology_id", logger::ERROR);
				return false;
			}

		// create the dd_ontology node
			if (!ontology::insert_dd_ontology_record( $section_tipo, $typology_id )) {
				debug_log(__METHOD__ . " Error inserting parent group node in dd_ontology: $parent_node_tipo", logger::ERROR);
				return false;
			}

		// return the parent grouper as `ontologytype14
			$parent_grouper_tipo = $tld.$typology_id;


		return $parent_grouper_tipo;
	}//end create_parent_grouper



	/**
	* MAP_TLD_TO_TARGET_SECTION_TIPO
	* Derives the per-TLD matrix section tipo by appending '0' to the sanitised TLD.
	*
	* This is the canonical TLD → section_tipo mapping used throughout the class.
	* Example: 'dd' → 'dd0', 'rsc' → 'rsc0', 'mupreva' → 'mupreva0'.
	*
	* (!) Throws an Exception if $tld fails safe_tld() validation (empty, contains
	* illegal characters, etc.).  Callers must guard against this or ensure the TLD
	* has already been validated upstream.
	*
	* @param string $tld Raw TLD string.
	* @return string The target_section_tipo, e.g. 'dd0'.
	* @throws Exception If $tld is not a valid ontology TLD.
	* @test true
	*/
	public static function map_tld_to_target_section_tipo( string $tld ) : string {

		$safe_tld = safe_tld( $tld );

		if( $safe_tld === false){
			debug_log(__METHOD__
				. " Error. current tld is not valid " . PHP_EOL
				. ' tld: ' . to_string( $tld )
				, logger::ERROR
			);

			throw new Exception(" Error. current tld is not valid", 1);
		}

		$target_section_tipo = $safe_tld.'0';


		return $target_section_tipo;
	}//end map_tld_to_target_section_tipo



	/**
	* MAP_TARGET_SECTION_TIPO_TO_TLD
	* Extracts the TLD prefix from a target_section_tipo string.
	*
	* Inverse of map_tld_to_target_section_tipo().
	* Example: 'dd0' → 'dd', 'mupreva0' → 'mupreva'.
	*
	* Delegates to get_tld_from_tipo() which strips the trailing numeric section_id.
	*
	* @param string $target_section_tipo The section tipo, e.g. 'dd0', 'es0'.
	* @return string|false The TLD prefix, or false if the tipo has no numeric suffix.
	* @test true
	*/
	public static function map_target_section_tipo_to_tld( string $target_section_tipo ) : string|false {

		$tld = get_tld_from_tipo( $target_section_tipo );


		return $tld;
	}//end map_target_section_tipo_to_tld



	/**
	* GET_ALL_ONTOLOGY_SECTIONS
	* Returns every registered target_section_tipo string from 'matrix_ontology_main'.
	*
	* Reads all rows from the main ontology table (via get_all_main_ontology_records()),
	* extracts the DEDALO_HIERARCHY_TARGET_SECTION_TIPO value from each row's 'string'
	* JSONB column, and returns the array of unique section tipos
	* (e.g. ['dd0', 'rsc0', 'es0', 'ontologytype0', …]).
	*
	* Results are cached in self::$cache_ontology_sections for the lifetime of the
	* worker process.  Clear via self::clear() between requests.
	*
	* @return array<string> Flat array of target_section_tipo strings; empty on DB failure.
	* @test true
	*/
	public static function get_all_ontology_sections() : array {

		// cache
		if ( !empty(self::$cache_ontology_sections) ) {
			return self::$cache_ontology_sections;
		}

		// records. Get all records from main ontology executing a search
		$db_result = self::get_all_main_ontology_records();
		if ( !$db_result ) {
			return [];
		}

		// iterate rows
		$ontology_sections = [];
		foreach ($db_result as $row) {

			$hierarchy_target_section_data = $row->string->{DEDALO_HIERARCHY_TARGET_SECTION_TIPO} ?? [];
			$target_section_tipo = $hierarchy_target_section_data[0]->value ?? null;

			// target section tipo check
			if ( empty($target_section_tipo) ) {
				debug_log(__METHOD__
					. " Skipped hierarchy without target section tipo: $row->section_tipo, $row->section_id " . PHP_EOL
					. ' hierarchy_target_section_data: ' . to_string($hierarchy_target_section_data)
					, logger::ERROR
				);
				continue;
			}

			// add section tipo
			$ontology_sections[] = $target_section_tipo;
		}

		// cache
		if ( !empty($ontology_sections) ) {
			self::$cache_ontology_sections = $ontology_sections;
			// Manage cache size to prevent memory leaks
			self::manage_cache_size(self::$cache_ontology_sections);
		}

		return $ontology_sections;
	}//end get_all_ontology_sections



	/**
	* GET_ALL_MAIN_ONTOLOGY_RECORDS
	* Executes an unlimited search against 'matrix_ontology_main' and returns the raw result.
	*
	* The project-filter is intentionally skipped (set_skip_projects_filter(true)) because
	* the main ontology is a global registry that must be readable regardless of the
	* current project context — it would be wrong to exclude TLDs not associated with
	* the active project when rebuilding or displaying the full ontology tree.
	*
	* @return db_result|false Iterable db_result on success; false if the query fails
	*   or returns an empty set (both cases are logged at ERROR level).
	* @test true
	*/
	public static function get_all_main_ontology_records() : db_result|false {

		$main_section_tipo = self::$main_section_tipo;

		// search_query_object
			$sqo = new search_query_object();
				$sqo->set_section_tipo( [$main_section_tipo] );
				$sqo->set_limit( 0 );
				$sqo->set_skip_projects_filter( true );

		// search exec
			$search	= search::get_instance($sqo);
			$db_result	= $search->search();

		if (empty($db_result)) {
			debug_log(__METHOD__
				. " EMPTY AR RECORDS " . PHP_EOL
				. ' section_tipo: ' . to_string($main_section_tipo) . PHP_EOL
				. ' sqo: ' . to_string($sqo) . PHP_EOL
				, logger::ERROR
			);
		}


		return $db_result;
	}//end get_all_main_ontology_records



	/**
	* GET_ACTIVE_ELEMENTS
	* Returns the list of active ontology (or hierarchy) definitions from 'matrix_ontology_main'.
	*
	* "Active" means DEDALO_HIERARCHY_ACTIVE_TIPO (hierarchy4) points to the 'yes' record
	* in DEDALO_SECTION_SI_NO_TIPO ('dd64').  Inactive TLDs are not presented to users
	* in area menus or exported via the API.
	*
	* Each matching row is converted to a rich element object via row_to_element().
	* Results are cached in self::$cache_active_ontology_elements; cleared by clear().
	*
	* Note: self::$main_section_tipo controls whether this queries the ontology or
	* hierarchy main table — hierarchy overrides it to 'hierarchy1'.
	*
	* @return array<object> Array of element objects (see row_to_element() for shape);
	*   empty array if no active elements are found.
	* @test true
	*/
	public static function get_active_elements() : array {

		// cache
		if ( !empty(self::$cache_active_ontology_elements) ) {
			return self::$cache_active_ontology_elements;
		}

		// main filter: only 'Active' records (hierarchy4 = 1)
		$filter = (object)[
			'$and' => [
				(object)[
					'q' => (object)[
						'section_id'			=> (string)NUMERICAL_MATRIX_VALUE_YES, // '1'
						'section_tipo'			=> 'dd64', // component_radio_button model
						'from_component_tipo'	=> DEDALO_HIERARCHY_ACTIVE_TIPO // 'hierarchy4'
					],
					'q_operator' => null,
					'path' => [
						(object)[
							'name'				=> 'Active',
							'model'				=> 'component_radio_button',
							'section_tipo'		=> self::$main_section_tipo,
							'component_tipo'	=> DEDALO_HIERARCHY_ACTIVE_TIPO
						]
					],
					'type' => 'jsonb'
				]
			]
		];

		// section tipo depends on the current class (hierarchy, ontology)
		$section_tipo = self::$main_section_tipo;

		$sqo = new search_query_object();
			$sqo->set_select([
				(object)['column' => 'section_tipo'],
				(object)['column' => 'section_id']
			]);
			$sqo->set_section_tipo( [$section_tipo] );
			$sqo->set_limit( 0 );
			$sqo->set_offset( 0 );
			$sqo->set_filter( $filter );

		$search = search::get_instance( $sqo );
		$db_result = $search->search();

		// active_elements
		$active_elements = [];
		if ( $db_result ) {
			foreach ($db_result as $row) {
				$active_elements[] = self::row_to_element($row);
			}
		}

		// cache
		self::$cache_active_ontology_elements = $active_elements;
		// Manage cache size to prevent memory leaks
		self::manage_cache_size(self::$cache_active_ontology_elements);

		return $active_elements;
	}//end get_active_elements



	/**
	* ROW_TO_ELEMENT
	* Converts a raw database row from 'matrix_ontology_main' into a normalized element object
	* containing core ontology section properties (name, tld, target_section, typology, etc.).
	*
	* @param object $row raw database row object from 'matrix_ontology_main' (must contain section_id and section_tipo)
	* @return object $element {
	*	"section_id": int|string,
	*	"section_tipo": string,
	*	"name": string,
	*	"name_data": array|null,
	*	"tld": string|null,
	*	"target_section_tipo": string|null,
	*	"target_section_model_tipo": string|null,
	*	"main_lang": string|null (e.g., 'lg-spa'),
	*	"typology_id": int|null,
	*	"typology_name": string|null,
	*	"order": int,
	*	"active_in_thesaurus": bool
	* }
	* @test true
	*/
	public static function row_to_element( object $row ) : object {

		$section_id		= $row->section_id;
		$section_tipo	= $row->section_tipo;

		/**
		 * Local helper to get component instances concisely
		 */
		$get_component = function( string $tipo, string $lang=DEDALO_DATA_LANG ) use ($section_id, $section_tipo) {
			$model = ontology_node::get_model_by_tipo( $tipo, true );
			return component_common::get_instance( $model, $tipo, $section_id, 'list', $lang, $section_tipo );
		};

		// name
			$name_comp	= $get_component( DEDALO_HIERARCHY_TERM_TIPO );
			$name		= $name_comp ? $name_comp->get_value() : null;
			$name_data	= $name_comp ? $name_comp->get_data() : null;

		// tld
			$tld_comp	= $get_component( DEDALO_HIERARCHY_TLD2_TIPO );
			$tld		= $tld_comp ? $tld_comp->get_value() : null;

		// target_section_tipo
			$target_section_tipo_comp	= $get_component( DEDALO_HIERARCHY_TARGET_SECTION_TIPO );
			$target_section_tipo		= $target_section_tipo_comp ? $target_section_tipo_comp->get_value() : null;

		// target_section_model_tipo
			$target_section_model_tipo_comp	= $get_component( DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO );
			$target_section_model_tipo		= $target_section_model_tipo_comp ? $target_section_model_tipo_comp->get_value() : null;

		// main_lang
			$lang_comp	= $get_component( DEDALO_HIERARCHY_LANG_TIPO );
			$main_lang	= $lang_comp ? $lang_comp->get_value_code() : null;

		// Typology (typology_id | typology_name)
			$typology_comp	= $get_component( DEDALO_HIERARCHY_TYPOLOGY_TIPO, DEDALO_DATA_NOLAN );
			$typology_data	= $typology_comp ? $typology_comp->get_data() : null;
			$typology_id	= $typology_data[0]->section_id ?? null;
			$typology_name	= $typology_comp ? $typology_comp->get_value() : null;

		// hierarchy order
			$component_order	= $get_component( DEDALO_HIERARCHY_ORDER_TIPO, DEDALO_DATA_NOLAN );
			$order_data			= $component_order ? $component_order->get_data() : null;
			$order_value		= $order_data[0]->value ?? 0;

		// active_in_thesaurus status
		// it will use to discard into tree view the hierarchy in client
		// in the JSON controller will check to remove his typology if the hierarchy is not active
			$component_active_in_thesaurus	= $get_component( DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO, DEDALO_DATA_NOLAN );
			$active_in_thesaurus_data		= $component_active_in_thesaurus ? $component_active_in_thesaurus->get_data() : null;
			$active_section_id				= $active_in_thesaurus_data[0]->section_id ?? null;
			$active_in_thesaurus			= (int)$active_section_id === NUMERICAL_MATRIX_VALUE_YES;

		// Build element
		$element = (object)[
			"section_id"				=> $section_id,
			"section_tipo"				=> $section_tipo,
			"name"						=> $name,
			"name_data"					=> $name_data,
			"tld"						=> $tld,
			"target_section_tipo"		=> $target_section_tipo,
			"target_section_model_tipo"	=> $target_section_model_tipo,
			"main_lang"					=> $main_lang,
			"typology_id"				=> $typology_id,
			"typology_name"				=> $typology_name,
			"order"						=> $order_value,
			"active_in_thesaurus"		=> $active_in_thesaurus
		];


		return $element;
	}//end row_to_element



	/**
	* PARSE_SECTION_RECORD_TO_ONTOLOGY_NODE
	* Reads a matrix section record and builds a fully-populated ontology_node DTO.
	*
	* This is the bridge from the editable matrix layer to the runtime 'dd_ontology'
	* flat table.  Every component of the section is instantiated and its data is
	* extracted, then transferred to the ontology_node via setters.  The resulting
	* object can be persisted to 'dd_ontology' via ontology_node::insert().
	*
	* Overwrite resolution:
	*   A 'localontology0' section may store overriding values for a core 'dd0' node
	*   (e.g. an institution-specific label or properties).  get_overwrite() checks
	*   whether such a record exists.  When found, most components (term, properties,
	*   translatable, relations) are read from the local override first; model and
	*   is_model are always taken from the canonical (main) node to preserve coherence.
	*
	* Components read (constant → tipo):
	*   DEDALO_ONTOLOGY_TLD_TIPO        → ontology7  (mandatory; null return if missing)
	*   DEDALO_ONTOLOGY_PARENT_TIPO     → ontology15
	*   DEDALO_ONTOLOGY_IS_MODEL_TIPO   → ontology30
	*   DEDALO_ONTOLOGY_MODEL_TIPO      → ontology6
	*   DEDALO_ONTOLOGY_ORDER_TIPO      → ontology41
	*   DEDALO_ONTOLOGY_TRANSLATABLE_TIPO → ontology8
	*   DEDALO_ONTOLOGY_CONNECTED_TO_TIPO → ontology10
	*   ontology16 — properties.css
	*   ontology17 — properties.source (RQO / request_config)
	*   ontology18 — properties (general blob)
	*   ontology19 — propiedades (v5 legacy)
	*   DEDALO_ONTOLOGY_TERM_TIPO       → ontology5
	*
	* @param string $section_tipo Matrix section tipo of the node, e.g. 'dd0'.
	* @param string|int $section_id Numeric ID of the section record.
	* @return ontology_node|null Populated node on success; null if tld is empty (row is invalid).
	* @test true
	*/
	public static function parse_section_record_to_ontology_node( string $section_tipo, string|int $section_id ) : ?ontology_node {
		$start_time = start_time();

		// Definitions
			$tld_tipo			= DEDALO_ONTOLOGY_TLD_TIPO; // ontology7
			$parent_tipo		= DEDALO_ONTOLOGY_PARENT_TIPO; // ontology15
			$is_model_tipo		= DEDALO_ONTOLOGY_IS_MODEL_TIPO; // ontology30
			$model_tipo_comp	= DEDALO_ONTOLOGY_MODEL_TIPO; // ontology6
			$order_tipo			= DEDALO_ONTOLOGY_ORDER_TIPO; // ontology41
			$translatable_tipo	= DEDALO_ONTOLOGY_TRANSLATABLE_TIPO; // ontology8
			$relations_tipo		= DEDALO_ONTOLOGY_CONNECTED_TO_TIPO; // ontology10
			$term_tipo			= DEDALO_ONTOLOGY_TERM_TIPO; // ontology5
			$properties_tipo	= 'ontology18';
			$properties_css_tipo = 'ontology16';
			$properties_rqo_tipo = 'ontology17';
			$properties_v5_tipo	= 'ontology19';

		// Overwrite locator check
		// Local ontology nodes can overwrite the main definitions with specific properties, names, etc.
		// $overwrite_locator points to the local definition and is used to create the dd_ontology node with the overwrite data.
		// If the main node has not any overwrite node, the $overwrite_locator is null and the main node is used (default behavior)
			$overwrite_locator = self::get_overwrite( $section_tipo, $section_id );

		// node locator (main node)
			$locator = new locator();
				$locator->set_section_tipo($section_tipo);
				$locator->set_section_id($section_id);

		/**
		 * Local helper to resolve data favoring overwrite locator if present
		 */
		$get_resolved_data = function(string $tipo) use ($locator, $overwrite_locator) {
			$data = null;
			if ($overwrite_locator) {
				$data = self::get_node_component_data($overwrite_locator, $tipo);
			}
			return $data ?? self::get_node_component_data($locator, $tipo);
		};

		// TLD (Mandatory)
			$tld_data = $get_resolved_data($tld_tipo);
			if (empty($tld_data)) {
				debug_log(__METHOD__ . " Ignored record because tld value ([$tld_tipo]) is empty. TLD is mandatory. section_tipo: $section_tipo section_id: $section_id", logger::ERROR);
				return null;
			}
			$tld	= $tld_data[0]->value;
			$tipo	= $tld . $section_id;

		// Ontology Node instantiation
			$ontology_node = ontology_node::get_instance( $tipo );
			$ontology_node->set_tld($tld);

		// Parent
			$parent_data = $get_resolved_data($parent_tipo);
			if (empty($parent_data) || empty($parent_data[0])) {
				// main dd nodes exception
				$log_level = ($tipo === 'dd1' || $tipo === 'dd2' || get_section_id_from_tipo($section_tipo) === '0') ? logger::WARNING : logger::ERROR;
				debug_log(__METHOD__ . " Record without parent data. tipo: $tipo section_tipo: $section_tipo id: $section_id", $log_level);
			} else {
				$parent_locator	= $parent_data[0];
				// Main root nodes (dd1 and dd2) store their parent locator pointing to
				// the main ontology section record (DEDALO_ONTOLOGY_SECTION_TIPO = 'ontology35')
				// rather than to another node.  In dd_ontology these roots have parent = null.
				$parent = ($parent_locator->section_tipo !== DEDALO_ONTOLOGY_SECTION_TIPO)
					? self::get_term_id_from_locator($parent_locator)
					: null; // main root nodes of the ontology dd1 and dd2
				$ontology_node->set_parent( $parent );
			}

		// Is Model
			// (!) IMPORTANT: is_model is intentionally read from the canonical node,
			// NOT from the overwrite.  A local override cannot change whether a node
			// is a model — that would break the ontology's structural integrity.
			$is_model_data = self::get_node_component_data($locator, $is_model_tipo);
			$is_model = !empty($is_model_data) && (int)$is_model_data[0]->section_id === NUMERICAL_MATRIX_VALUE_YES;
			$ontology_node->set_is_model($is_model);

		// Model
			$model_data = $get_resolved_data($model_tipo_comp);
			$model_tipo_res = null;
			$model_res		= null;

			if (empty($model_data)) {
				if ($is_model === false) {
					debug_log(__METHOD__ . " Record without model. tipo: $tipo section_tipo: $section_tipo id: $section_id", logger::ERROR);
				}
			} else {
				$model_locator	= $model_data[0];
				$model_tipo_res = self::get_term_id_from_locator($model_locator);
				$model_res		= ontology_node::get_term_by_tipo($model_tipo_res, DEDALO_STRUCTURE_LANG, true, false);
			}
			$ontology_node->set_model_tipo($model_tipo_res);
			$ontology_node->set_model($model_res);

		// Order
			$order_model = ontology_node::get_model_by_tipo($order_tipo);
			if (empty($order_model)) {
				debug_log(__METHOD__ . " Section without order component ([$order_tipo]). section_tipo: $section_tipo id: $section_id", logger::DEBUG);
			} else {
				$order_component = component_common::get_instance($order_model, $order_tipo, $section_id, 'list', DEDALO_DATA_NOLAN, $section_tipo);
				$order_data = $order_component->get_data();
				if (!empty($order_data)) {
					$ontology_node->set_order_number((int)$order_data[0]->value);
				}
			}

		// Translatable
			$translatable = $overwrite_locator ? self::resolve_translatable($overwrite_locator) : null;
			$translatable = $translatable ?? self::resolve_translatable($locator);
			$ontology_node->set_is_translatable($translatable);

		// Is Main
			$ontology_node->set_is_main($tipo === $tld . '0');

		// Relations
			$relations = $overwrite_locator ? self::resolve_relations($overwrite_locator) : null;
			$relations = $relations ?? self::resolve_relations($locator);
			$ontology_node->set_relations($relations);

		// Properties V5
			$prop_v5_data = $get_resolved_data($properties_v5_tipo);
			$properties_v5 = !is_empty($prop_v5_data) && !empty($prop_v5_data[0]->value) ? json_encode($prop_v5_data[0]->value, JSON_PRETTY_PRINT) : null;
			$ontology_node->set_propiedades($properties_v5);

		// Properties
			$prop_data = $get_resolved_data($properties_tipo);
			$properties = !empty($prop_data) ? ($prop_data[0]->value ?? new stdClass()) : new stdClass();

			if (!is_object($properties)) {
				debug_log(__METHOD__
					. " Invalid properties value. Expected object. review  " . PHP_EOL
					. ' $properties type: ' . gettype($properties) . PHP_EOL
					. ' $properties: ' . to_string($properties) . PHP_EOL
					. ' locator: ' . to_string($locator) . PHP_EOL
					, logger::ERROR
				);
				// force object to allow continue
				$properties = new stdClass();
			}

			// Properties CSS
			$prop_css_data = $get_resolved_data($properties_css_tipo);
			if (!empty($prop_css_data)) {
				$properties->css = $prop_css_data[0]->value;
			}

			// Properties RQO
			$prop_rqo_data = $get_resolved_data($properties_rqo_tipo);
			if (!empty($prop_rqo_data)) {
				$properties->source = $prop_rqo_data[0]->value;
			}

		// Properties mix
			// Reset the properties if they are empty.
			if (empty(get_object_vars($properties))) {
				$properties = null;
			}

			// validate-on-save (non-blocking): structurally invalid
			// request_config definitions are reported as warnings here so they
			// surface at ontology update time instead of as an empty UI later.
			// @see request_config_object::validate_config
			if (isset($properties->source->request_config)) {
				$config_issues = request_config_object::validate_config($properties->source->request_config);
				if (!empty($config_issues)) {
					$issues_msg = implode(PHP_EOL, array_map(function($issue){
						return "[{$issue->level}] {$issue->path}: {$issue->message}";
					}, $config_issues));
					debug_log(__METHOD__
						." Invalid request_config in ontology node '$tipo' properties:" . PHP_EOL
						. $issues_msg
						, logger::WARNING
					);
				}
			}

			// set the term into jet_dd_record
			$ontology_node->set_properties( $properties );

		// Term
			$term = $overwrite_locator ? self::resolve_term($overwrite_locator) : null;
			$term = $term ?? self::resolve_term($locator);
			$ontology_node->set_term_data($term);

		// debug
			if(SHOW_DEBUG===true) {
				$total =  exec_time_unit($start_time).' ms';
				debug_log(__METHOD__
					.' dd_ontology_record exec_time_unit: ' . $total . " [$section_tipo-$section_id]" . PHP_EOL
					.' overwrite_locator: ' . json_encode($overwrite_locator)
					, logger::DEBUG
				);
			}

		return $ontology_node;
	}//end parse_section_record_to_ontology_node



	/**
	* GET_NODE_COMPONENT_DATA
	* Retrieves the raw data array of a single component on an ontology section record.
	*
	* A thin helper used throughout parse_section_record_to_ontology_node() to
	* reduce repetitive component instantiation code.  Always uses DEDALO_DATA_NOLAN
	* as the language context because ontology component values are language-neutral
	* (except term, which is handled separately via resolve_term()).
	*
	* @param locator $locator Points to the section record to read from.
	* @param string  $tipo   Component tipo to instantiate (e.g. 'ontology7').
	* @return array|null Component data array on success; null if the component has no data.
	*/
	private static function get_node_component_data( locator $locator, string $tipo ) : ?array {

		$properties_model	= ontology_node::get_model_by_tipo( $tipo  );
		$component			= component_common::get_instance(
			$properties_model,
			$tipo ,
			$locator->section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$locator->section_tipo
		);
		$data = $component->get_data();

		if (empty($data)) {
			return null;
		}

		return $data;
	}//end get_node_component_data



	/**
	* RESOLVE_TRANSLATABLE
	* Reads the is_translatable flag from an ontology section record.
	*
	* The translatable flag is stored as a component_radio_button value referencing
	* DEDALO_SECTION_SI_NO_TIPO ('dd64'):
	*   section_id = 1 (NUMERICAL_MATRIX_VALUE_YES) → true
	*   section_id = 2 (NUMERICAL_MATRIX_VALUE_NO)  → false
	*
	* Falls back to true (translatable by default) when the component data is missing,
	* logging at DEBUG level.  This conservative default prevents newly created nodes
	* from silently omitting their term translations.
	*
	* @param locator $locator Points to the section record to read.
	* @return bool True if the node is translatable, false otherwise.
	*/
	private static function resolve_translatable( locator $locator ) : bool {

		$translatable_tipo = DEDALO_ONTOLOGY_TRANSLATABLE_TIPO; // 'ontology8' component_radio_button

		// get the translatable data of the node.
		$translatable_data = self::get_node_component_data( $locator, $translatable_tipo );

		if ( empty($translatable_data) || !isset($translatable_data[0]) ) {

			debug_log(__METHOD__
				. " Record without translatable_data (using default true) " . PHP_EOL
				. ' section_tipo      : ' . to_string($locator->section_tipo) . PHP_EOL
				. ' section_id        : ' . to_string($locator->section_id) . PHP_EOL
				. ' translatable_tipo : ' . to_string($translatable_tipo)
				, logger::DEBUG
			);
			return true; // default value
		}

		$translatable_data_locator = $translatable_data[0];
		$translatable = (int)$translatable_data_locator->section_id === NUMERICAL_MATRIX_VALUE_YES;

		return $translatable;
	}//end resolve_translatable



	/**
	* RESOLVE_RELATIONS
	* Reads the 'connected-to' relation list from an ontology section record and
	* converts each locator to an ontology-node-style relation object.
	*
	* The DEDALO_ONTOLOGY_CONNECTED_TO_TIPO ('ontology10') component stores an
	* array of locators pointing to related nodes.  This method resolves each
	* locator to its term_id (via get_term_id_from_locator) and wraps it as:
	*   {tipo: 'dd55'}
	*
	* @param locator $locator Points to the section record to read.
	* @return array<object>|null Array of relation objects, or null if no relations are defined.
	*/
	private static function resolve_relations( locator $locator ) : ?array {

		$relations_tipo = DEDALO_ONTOLOGY_CONNECTED_TO_TIPO; // ontology10 component_autocomplete_hi

		// get the relations data of the node.
		$relations_data = self::get_node_component_data( $locator, $relations_tipo );

		if ( empty($relations_data) ) {
			return null;
		}

		$relations = [];
		foreach ($relations_data as $current_relation) {

			// get the relation data as term_id (e.g. 'dd55')
			$relation_term_id = self::get_term_id_from_locator( $current_relation );

			if ( empty($relation_term_id) ) {
				continue;
			}

			$relations[] = (object)[
				'tipo' => $relation_term_id
			];
		}

		return !empty($relations) ? $relations : null;
	}//end resolve_relations



	/**
	* RESOLVE_TERM
	* Reads the multilingual term / label for an ontology node from its section record.
	*
	* Iterates the DEDALO_ONTOLOGY_TERM_TIPO ('ontology5') component data and builds
	* a plain object keyed by language code:
	*   {"lg-eng": "Denmark", "lg-spa": "Dinamarca"}
	*
	* Uses DEDALO_DATA_LANG as the lang context so all available translations are loaded.
	* Returns null if the component model is not defined or the data is empty.
	*
	* @param locator $locator Points to the section record to read.
	* @return object|null Multilingual term object, or null if none is stored.
	*/
	private static function resolve_term( locator $locator ) : ?object {

		$term_tipo  = DEDALO_ONTOLOGY_TERM_TIPO; // ontology5
		$term_model = ontology_node::get_model_by_tipo( $term_tipo );

		if ( empty($term_model) ) {
			return null;
		}

		$term_component = component_common::get_instance(
			$term_model,
			$term_tipo,
			$locator->section_id,
			'list',
			DEDALO_DATA_LANG,
			$locator->section_tipo
		);

		if ( !$term_component ) {
			return null;
		}

		$term_data = $term_component->get_data();

		if ( is_empty($term_data) ) {
			return null;
		}

		$term = new stdClass();
		foreach ($term_data as $item) {
			$lang = $item->lang;
			$term->$lang = $item->value;
		}

		return $term;
	}//end resolve_term



	/**
	* GET_TERM_ID_FROM_LOCATOR
	* Resolves a locator to its canonical term_id string (e.g. 'dd55').
	*
	* A term_id is the concatentation of TLD and section_id: tld + section_id.
	* This method attempts two strategies to derive the TLD:
	*
	*   1. Fast path — map_target_section_tipo_to_tld(): derives the TLD from the
	*      section_tipo string directly (e.g. 'dd0' → 'dd').  Works for all TLDs
	*      already registered in the ontology (the common case).
	*
	*   2. Slow fallback — reads the DEDALO_ONTOLOGY_TLD_TIPO ('ontology7') component
	*      on the pointed-to matrix record.  This handles edge cases where the
	*      section_tipo is not in the expected TLD+0 form (e.g. during a partial
	*      bootstrap when map tables are incomplete).
	*
	* Returns null if neither strategy can resolve the TLD.
	*
	* @param object $locator Must contain section_tipo (string) and section_id (string|int).
	* @return string|null term_id string (e.g. 'dd55'), or null on failure.
	* @test true
	*/
	public static function get_term_id_from_locator( object $locator ) : ?string {

		// get the tld from main ontology mapping of the locator section_tipo
		$tld = self::map_target_section_tipo_to_tld( (string)$locator->section_tipo );

		// check if the node exist and it get data to resolve the tld
		// if not, try to get the tld from the main ontology definition.
		if ( empty($tld) ) {

			debug_log(__METHOD__
				. " TLD mapping not found for section_tipo. (Fallback to record resolution) " . PHP_EOL
				. ' locator: ' . to_string( $locator )
				, logger::WARNING
			);

			// get the component data using the locator
			$tld_tipo  = DEDALO_ONTOLOGY_TLD_TIPO; // ontology7 component_input_text
			$tld_model = ontology_node::get_model_by_tipo( $tld_tipo );

			if ( empty($tld_model) ) {
				return null;
			}

			$tld_component = component_common::get_instance(
				$tld_model,
				$tld_tipo,
				$locator->section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$locator->section_tipo
			);

			if ( !$tld_component ) {
				return null;
			}

			$tld_data = $tld_component->get_data();
			$tld = $tld_data[0]->value ?? null;

			if ( empty($tld) ) {
				debug_log(__METHOD__ . " Unable to resolve TLD from record data for: " . to_string($locator), logger::ERROR);
				return null;
			}
		}

		$term_id = $tld . $locator->section_id;

		return $term_id;
	}//end get_term_id_from_locator



	/**
	* GET_ORDER_FROM_LOCATOR
	* Returns the 1-based position of $locator within a siblings array.
	*
	* Used during matrix-to-dd_ontology conversion to compute the order_number
	* of a node: the parent's children component stores an ordered array of
	* locators; the position of the current locator in that array is its order.
	*
	* Comparison is by (section_tipo, section_id) identity.  Defaults to 1 if
	* the locator is not found (should not happen in a consistent dataset).
	*
	* @param object  $locator  The locator to look up.
	* @param array   $siblings Ordered array of sibling locator-like objects from the
	*                          parent's component_relation_children ('ontology14').
	* @return int 1-based position of $locator, or 1 as fallback.
	* @test true
	*/
	public static function get_order_from_locator( object $locator, array $siblings ) : int {

		// Ensure the array is a pure array
		$siblings = array_values($siblings);
		foreach ($siblings as $index => $sibling) {

			if ( $sibling->section_tipo === $locator->section_tipo &&
				 (int)$sibling->section_id === (int)$locator->section_id
			) {
				return $index + 1;
			}
		}

		// Default to 1 if not found in the array (fallback)
		return 1;
	}//end get_order_from_locator



	/**
	* GET_SIBLINGS
	* Retrieves the ordered children locator list from a parent ontology node.
	*
	* "Siblings" in this context means the ordered array of child-node locators
	* stored in the parent's component_relation_children (self::$children_tipo = 'ontology14').
	* The returned array is the authoritative insertion order for all children of
	* the given parent.
	*
	* @param object $parent_locator Locator with section_tipo and section_id pointing
	*                               to the parent matrix record.
	* @return array<object> Ordered array of child locator objects; empty on miss.
	* @test true
	*/
	public static function get_siblings( object $parent_locator ) : array {

		// get the component data using the locator
		$children_tipo  = self::$children_tipo; // 'ontology14'
		$children_model = ontology_node::get_model_by_tipo( $children_tipo );

		if ( empty($children_model) ) {
			return [];
		}

		$children_component = component_common::get_instance(
			$children_model,
			$children_tipo,
			$parent_locator->section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$parent_locator->section_tipo
		);

		if ( !$children_component ) {
			return [];
		}

		// siblings will be the children component data.
		return $children_component->get_data() ?? [];
	}//end get_siblings



	/**
	* INSERT_DD_ONTOLOGY_RECORD
	* Parses a matrix section record and upserts it into 'dd_ontology'.
	*
	* This is the single-record version of set_records_in_dd_ontology():
	*   1. Calls parse_section_record_to_ontology_node() to build the ontology_node DTO.
	*   2. Calls ontology_node::insert(), which performs an UPSERT (delete + insert) in
	*      'dd_ontology' so the runtime engine always sees the latest data.
	*
	* Returns the tipo of the inserted node on success, or null if the section record
	* is invalid (missing TLD) or the insert fails.
	*
	* @param string     $section_tipo The matrix section tipo, e.g. 'dd0'.
	* @param string|int $section_id   Numeric ID of the section record.
	* @return string|null The tipo of the upserted node (e.g. 'dd55'), or null on failure.
	* @test true
	*/
	public static function insert_dd_ontology_record( string $section_tipo, string|int $section_id ) : ?string {
		$start_time = start_time();

		$ontology_node = self::parse_section_record_to_ontology_node( $section_tipo, $section_id );
		if ( empty($ontology_node) ) {
			debug_log(__METHOD__
				. " Error: Unable to parse section record to ontology node " . PHP_EOL
				. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
				. ' section_id: ' . to_string($section_id)
				, logger::ERROR
			);
			return null;
		}

		if ( !$ontology_node->insert() ) {
			debug_log(__METHOD__
				. " Error inserting ontology node into database " . PHP_EOL
				. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
				. ' section_id: ' . to_string($section_id)
				, logger::ERROR
			);
			return null;
		}

		if ( SHOW_DEBUG === true ) {
			debug_log(__METHOD__
				. " Total time insert_dd_ontology_record: " . exec_time_unit($start_time, 'ms') . ' ms'
				, logger::DEBUG
			);
		}


		return $ontology_node->get_tipo();
	}//end insert_dd_ontology_record



	/**
	* SYNC_ORDER_TO_DD_ONTOLOGY
	* Pushes the new per-parent order_number values into dd_ontology after a tree reorder.
	*
	* The ontology menu builds sibling order from dd_ontology.order_number
	* (ontology_node::get_ar_children_of_this → dd_ontology_db_manager::search ORDER BY
	* order_number ASC). dd_ts_api::save_order only writes the order component in the matrix;
	* calling this method after sort_children() keeps dd_ontology in sync.
	*
	* Only updates rows whose dd_ontology 'parent' column matches the reordered parent
	* — a child registered under a different parent in dd_ontology is left untouched.
	*
	* @param array  $changed              Result of component_relation_children::sort_children().
	*                                     Each item: {value: int, locator: {section_tipo, section_id}}.
	* @param string $parent_section_tipo  section_tipo of the reordered parent node.
	* @param int    $parent_section_id    section_id of the reordered parent node.
	* @return int   Number of dd_ontology rows actually updated.
	* @test true
	*/
	public static function sync_order_to_dd_ontology(
		array  $changed,
		string $parent_section_tipo,
		int    $parent_section_id
	) : int {

		if (empty($changed)) {
			return 0;
		}

		// Resolve parent term_id (e.g. section_tipo='dd1', section_id=5 → 'dd5')
		$parent_locator = new locator();
		$parent_locator->set_section_tipo($parent_section_tipo);
		$parent_locator->set_section_id($parent_section_id);

		$parent_term_id = self::get_term_id_from_locator($parent_locator);
		if (empty($parent_term_id)) {
			debug_log(__METHOD__
				. " Unable to resolve parent term_id — skipping dd_ontology sync" . PHP_EOL
				. ' parent: ' . $parent_section_tipo . '_' . $parent_section_id
				, logger::WARNING
			);
			return 0;
		}

		$updated = 0;

		foreach ($changed as $item) {

			$child_term_id = self::get_term_id_from_locator($item->locator);
			if (empty($child_term_id)) {
				continue;
			}

			$row = dd_ontology_db_manager::read($child_term_id);
			if (empty($row)) {
				// Not an ontology node — nothing to sync
				continue;
			}

			// Guard: only update when dd_ontology parent matches the reordered parent
			if (($row['parent'] ?? null) !== $parent_term_id) {
				continue;
			}

			// Skip unchanged values
			if ((int)($row['order_number'] ?? 0) === (int)$item->value) {
				continue;
			}

			$values = new stdClass();
			$values->order_number = (int)$item->value;

			if (dd_ontology_db_manager::update($child_term_id, $values)) {
				$updated++;
			}
		}

		return $updated;
	}//end sync_order_to_dd_ontology



	/**
	* SET_RECORDS_IN_DD_ONTOLOGY
	* Synchronises a set of matrix_ontology records into 'dd_ontology' using a SQO.
	*
	* This is the API-facing batch sync method (called e.g. by tool_ontology after an
	* ontology editor save).  It:
	*   1. Executes $sqo to find the target matrix records.
	*   2. For each record:
	*      - If it is a 'matrix_ontology_main' row (ontology35): it is treated as a
	*        TLD root node.  Inactive TLDs have their 'dd_ontology' rows deleted;
	*        active TLDs are synced via create_dd_ontology_ontology_section_node().
	*      - Otherwise: insert_dd_ontology_record() upserts the node into 'dd_ontology'.
	*   3. Invalidates the diffusion section-map cache when any rows are updated.
	*
	* The response object uses partial-success semantics: if some records succeeded
	* and some failed, result is true with a 'Partial success' message and the
	* failing records are enumerated in response.errors.
	*
	* @param object $sqo search_query_object; must have section_tipo set.
	* @return object $response {
	*   result:          bool,
	*   msg:             string,
	*   errors:          array<string>,
	*   total:           int,
	*   processed_count: int
	* }
	* @test true
	*/
	public static function set_records_in_dd_ontology( object $sqo ) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];
			$response->total	= 0;

		// Validate input
		if ( !isset($sqo->section_tipo) ) {
			$response->errors[] = 'Missing section_tipo in sqo';
			return $response;
		}

		$search = search::get_instance( $sqo );
		$db_result	= $search->search();
		$total		= $db_result ? $db_result->row_count() : 0;

		// Check if we have records to process
		if ( $total === 0 ) {
			$response->result	= true;
			$response->msg		= "OK. No records found to process for " . to_string($sqo->section_tipo);
			$response->msg	   .= ' | ' . exec_time_unit($start_time, 'ms') . ' ms';
			return $response;
		}

		$processed_count = 0;
		foreach ($db_result as $current_record) {

			$section_tipo	= $current_record->section_tipo;
			$section_id		= $current_record->section_id;
			$term_id		= null;

			if ( $section_tipo === self::$main_section_tipo ) {

				// main_ontology records (ontology35)
				$tld = self::get_main_tld($section_id, $section_tipo);

				// if current ontology is not active (is not in the active tld list)
				// all tld records must be deleted from 'dd_ontology' table
				$is_active_tld = ontology_utils::check_active_tld($tld);
				if ( $is_active_tld === false ) {

					// remove any other things than tld.
						$safe_tld = safe_tld( (string)$tld );

						if ( $safe_tld === false ) {
							$response->errors[] = "Invalid TLD for deletion: " . to_string($tld);
							continue;
						}

					// Delete the dd_ontology nodes
					// Inactive main ontology TLD nodes must be deleted to prevent inconsistent resolutions
						$deleted_dd_ontology_nodes = ontology_utils::delete_tld_nodes( $safe_tld );

						if ( $deleted_dd_ontology_nodes === false ) {
							$response->errors[] = "Unable to delete TLD nodes for: $tld";
							continue;
						}

					$term_id = $safe_tld . '0';

				} else {

					// add / update
					$typology_id	= self::get_main_typology_id($tld);
					$name_data		= self::get_main_name_data($tld);
					$term_id		= self::create_dd_ontology_ontology_section_node((object)[
						'tld'					=> $tld,
						'typology_id'			=> $typology_id,
						'name_data'				=> $name_data,
						'parent_grouper_tipo'	=> 'ontologytype' . $typology_id
					]);
				}

			} else {

				// regular matrix_ontology_records
				$term_id = self::insert_dd_ontology_record( $section_tipo, $section_id );
			}

			if ( empty($term_id) ) {
				$response->errors[] = "Failed to process dd_ontology record for section_tipo: $section_tipo, section_id: $section_id";
			} else {
				$processed_count++;
			}
		}

		// Final response construction
		if ( empty($response->errors) ) {
			$response->result			= true;
			$response->msg				= "OK. Request completed successfully for " . to_string($sqo->section_tipo);
			$response->msg			   .= ' | ' . exec_time_unit($start_time, 'ms') . ' ms';
			$response->total			= $total;
			$response->processed_count	= $processed_count;
		} else {
			// Partial success or failure
			$response->processed_count	= $processed_count;
			$response->total			= $total;

			if ( $processed_count > 0 ) {
				$response->result	= true; // Consider partial success as success
				$response->msg		= "Partial success. Some records processed for " . to_string($sqo->section_tipo);
			} else {
				$response->msg		= "Request failed for " . to_string($sqo->section_tipo);
			}
			$response->msg .= ' | ' . exec_time_unit($start_time, 'ms') . ' ms';
		}

		// dd_ontology changed: invalidate the persistent "sections with diffusion"
		// map, which is derived purely from the ontology. Over-invalidation is
		// harmless (one extra rebuild on the next read).
		if ( $processed_count > 0 ) {
			diffusion_utils::delete_section_map_cache_file();
		}


		return $response;
	}//end set_records_in_dd_ontology



	/**
	* REGENERATE_RECORDS_IN_DD_ONTOLOGY
	* Fully rebuilds 'dd_ontology' for one or more TLDs from their matrix sources.
	*
	* Unlike set_records_in_dd_ontology() this method performs a destructive
	* delete-then-reinsert cycle with backup/restore protection:
	*
	*   Step 1 — backup: ontology_utils::create_bk_table() snapshots the current
	*             'dd_ontology' rows for the affected TLDs.
	*   Step 2 — parse: for every matrix record in the TLD matrix table, build
	*             an ontology_node via parse_section_record_to_ontology_node().
	*             A parse failure aborts and restores from backup.
	*   Step 3 — delete: ontology_utils::delete_tld_nodes() removes all 'dd_ontology'
	*             rows for each TLD.
	*   Step 4 — insert: inserts every parsed ontology_node.
	*             An insert failure triggers a full restore from backup.
	*   Step 5 — main section: re-runs add_main_section() and
	*             create_dd_ontology_ontology_section_node() for each TLD to refresh
	*             the root node.
	*
	* On success invalidates the diffusion section-map cache.
	*
	* (!) This is a heavyweight, destructive operation.  Run it only during planned
	* ontology maintenance, not on every user save.  Prefer set_records_in_dd_ontology()
	* for incremental updates.
	*
	* @param array<string> $tld Array of TLD strings to regenerate, e.g. ['dd', 'rsc'].
	* @return object $response {result: bool, msg: string, errors: array, total_insert: int}
	* @test true
	*/
	public static function regenerate_records_in_dd_ontology( array $tld ) : object {

		$response = new stdClass();
			$response->result		= false;
			$response->msg			= 'Error. Request failed';
			$response->errors		= [];
			$response->total_insert = 0;

		// create a copy of the $tld
			$backup = ontology_utils::create_bk_table( $tld );

			if ( $backup === false ) {
				$response->errors[] = "Impossible to create the dd_ontology backup previous to regenerate the TLDs: " . to_string($tld);
				return $response;
			}

		// get all section_tipo from tld
			$section_tipo = array_map( function($el) {
				return self::map_tld_to_target_section_tipo($el);
			}, $tld );

		// 1 search all nodes as matrix records
			$sqo = new search_query_object();
				$sqo->set_section_tipo( $section_tipo );
				$sqo->limit = 0;

			$search = search::get_instance( $sqo );
			$db_result	= $search->search();
			$total		= $db_result ? $db_result->row_count() : 0;

		// 2 create the dd_ontology nodes of all matrix records
			$ontology_nodes = [];
			if ( $total > 0 ) {
				foreach ($db_result as $current_record) {

					$current_section_tipo	= $current_record->section_tipo;
					$current_section_id		= $current_record->section_id;

					// ontology_node item
					$ontology_node = self::parse_section_record_to_ontology_node( $current_section_tipo, $current_section_id );

					if ( empty($ontology_node) ) {
						ontology_utils::delete_bk_table();
						$response->errors[] = "Failed regenerate dd_ontology node for section_tipo: $current_section_tipo, section_id: $current_section_id";
						debug_log(__METHOD__ . " Error generating dd_ontology for $current_section_tipo-$current_section_id", logger::ERROR);
						return $response;
					}

					$ontology_nodes[] = $ontology_node;
				}
			}

		// 3 delete all tld records
			foreach ($tld as $current_tld) {
				ontology_utils::delete_tld_nodes( $current_tld );
			}

		// 4 insert the new nodes of the given tld
			$total_insert = 0;
			foreach ($ontology_nodes as $ontology_node) {

				$insert_result = $ontology_node->insert();

				// error inserting
				// recovery al tld from bk table.
				if ( empty($insert_result) ) {
					// restore the backup table
					ontology_utils::restore_from_bk_table($tld);
					// delete bk table
					ontology_utils::delete_bk_table();
					$response->errors[] = "Failed inserting dd_ontology. Restored previous data from backup.";
					return $response;
				}

				$total_insert++;
			}

		// 5 add_main_section (overwrite existing record like 'dd0')
			foreach ($tld as $current_tld) {

				// get the information to create the main section
				$typology_id	= self::get_main_typology_id( $current_tld );
				$name_data		= self::get_main_name_data( $current_tld );

				$file_item = new stdClass();
					$file_item->tld			= $current_tld;
					$file_item->typology_id	= $typology_id ?? null;
					$file_item->name_data	= $name_data ?? null;

				// add main section and records
				$add_result = self::add_main_section( $file_item );
				if ( empty($add_result) ) {
					// restore the backup table
					ontology_utils::restore_from_bk_table($tld);
					// delete bk table
					ontology_utils::delete_bk_table();
					$response->errors[] = 'Failed add_main_section file_item: ' . to_string($file_item);
					debug_log(__METHOD__
						. " Error creating ontology main section " . PHP_EOL
						. ' add_result: ' . to_string($add_result) . PHP_EOL
						. ' file_item: ' . to_string($file_item)
						, logger::ERROR
					);
					return $response;
				}

				// create dd_ontology node for the main section
				self::create_dd_ontology_ontology_section_node( $file_item );
			}

		// response
			if ( empty($response->errors) ) {
				$response->result	= true;
				$response->msg		= 'OK. The regenerate records request has been completed successfully.';
			}
			// total_insert dd_ontology records
			$response->total_insert = $total_insert;

		// dd_ontology nodes were reinserted directly (bypassing set_records), so
		// invalidate the ontology-derived "sections with diffusion" map.
			if ( $total_insert > 0 ) {
				diffusion_utils::delete_section_map_cache_file();
			}


		return $response;
	}//end regenerate_records_in_dd_ontology



	/**
	* DELETE_MAIN
	* Resolves the TLD for a given main section record and delegates full ontology
	* deletion to delete_ontology().
	*
	* This is the API entry-point when deleting an ontology through the admin UI:
	* the caller knows only the (section_tipo, section_id) of the main record, not
	* the TLD string.  This method reads the TLD via get_main_tld() and then calls
	* delete_ontology() which removes everything.
	*
	* @param object $options Must include:
	*   {
	*     section_id:   int|string — row ID in 'matrix_ontology_main'
	*     section_tipo: string    — e.g. 'ontology35'
	*   }
	* @return object $response Standard {result, msg, errors} object from delete_ontology().
	* @test true
	*/
	public static function delete_main(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ';
			$response->errors	= [];

		// options
			$section_id		= $options->section_id;
			$section_tipo	= $options->section_tipo;

		// tld. Resolves tld value from ontology_main record (field 'hierarchy6')
			$tld = ontology::get_main_tld($section_id, $section_tipo);

		// check if the tld ontology is empty
			if( empty($tld) ){
				$response->msg .= "Empty tld on get_main_tld($section_id, $section_tipo)";
				$response->errors[] = 'Empty tld';
				return $response;
			}

		// delete the virtual section
			$response = ontology::delete_ontology( $tld );


		return $response;
	}//end delete_main



	/**
	* GET_MAIN_TLD
	* Returns the lowercase TLD string stored in the DEDALO_HIERARCHY_TLD2_TIPO
	* ('hierarchy6') component of a 'matrix_ontology_main' or 'matrix_hierarchy_main' record.
	*
	* Used by delete_main() and set_records_in_dd_ontology() when they receive a
	* (section_id, section_tipo) pair and need the TLD to drive further operations.
	*
	* @param string|int $section_id  Row ID in the main matrix table.
	* @param string     $section_tipo Section tipo of the main table row, e.g. 'ontology35'.
	* @return string|null Lowercase TLD (e.g. 'dd', 'rsc'), or null if the component has no data.
	* @test true
	*/
	public static function get_main_tld( string|int $section_id, string $section_tipo ) : ?string {

		$tld_tipo	= DEDALO_HIERARCHY_TLD2_TIPO; // hierarchy6
		$model_name	= ontology_node::get_model_by_tipo( $tld_tipo, true );

		$component = component_common::get_instance(
			$model_name,
			$tld_tipo,
			$section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$section_tipo
		);

		if ( !$component ) {
			return null;
		}

		$data = $component->get_data();
		$tld  = $data[0]->value ?? null;

		return $tld ? strtolower((string)$tld) : null;
	}//end get_main_tld



	/**
	* GET_MAIN_TYPOLOGY_ID
	* Retrieves the typology ID for a given TLD from its main section record.
	*
	* Typologies categorise TLDs in the ontology editor (e.g. "official", "local",
	* "others").  The typology is stored as a locator in DEDALO_HIERARCHY_TYPOLOGY_TIPO
	* ('hierarchy9'), and its section_id is used directly as the typology_id integer.
	*
	* Falls back to typology 15 ("others") when:
	*   - The DEDALO_HIERARCHY_TYPOLOGY_TIPO component has no data.
	*   - The main record cannot be found for the given TLD.
	*
	* @param string $tld TLD string, e.g. 'dd', 'es'.
	* @return int|null Typology ID (e.g. 14 for official, 15 for others),
	*   or null if the main record is missing entirely.
	* @test true
	*/
	public static function get_main_typology_id( string $tld ) : ?int {

		$default_typology = 15; // others typology

		// get main record
		$main_record = self::get_ontology_main_from_tld( $tld );
		if ( empty($main_record) ) {
			debug_log(__METHOD__ . " Empty main record for tld: $tld", logger::ERROR);
			return null;
		}

		// Typology component
		$tipo  = DEDALO_HIERARCHY_TYPOLOGY_TIPO;
		$model = ontology_node::get_model_by_tipo( $tipo, true );

		$component = component_common::get_instance(
			$model,
			$tipo,
			$main_record->section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$main_record->section_tipo
		);

		if ( !$component ) {
			return $default_typology;
		}

		$typology_data = $component->get_data();

		// Use section_id as typology_id. If empty data, use 15 as default (others)
		return isset($typology_data[0]->section_id)
			? (int)$typology_data[0]->section_id
			: $default_typology;
	}//end get_main_typology_id



	/**
	* GET_MAIN_NAME_DATA
	* Retrieves the full multilingual name/term data for a given TLD's main section record.
	*
	* Reads DEDALO_HIERARCHY_TERM_TIPO ('hierarchy5') with DEDALO_DATA_LANG context
	* so all available language translations are included.  The returned array is in
	* the standard component_input_text data shape, e.g.:
	*   [{"lang": "lg-spa", "value": "Prueba"}, {"lang": "lg-eng", "value": "Test"}]
	*
	* @param string $tld TLD string, e.g. 'dd', 'es'.
	* @return array|null Array of multilingual value objects, or null on miss.
	* @test true
	*/
	public static function get_main_name_data( string $tld ) : ?array {

		// get main record
		$main_record = self::get_ontology_main_from_tld( $tld );
		if ( empty($main_record) ) {
			debug_log(__METHOD__ . " Empty main record for tld: $tld", logger::ERROR);
			return null;
		}

		// Name component
		$tipo  = DEDALO_HIERARCHY_TERM_TIPO;
		$model = ontology_node::get_model_by_tipo( $tipo, true );

		$component = component_common::get_instance(
			$model,
			$tipo,
			$main_record->section_id,
			'list',
			DEDALO_DATA_LANG,
			$main_record->section_tipo
		);

		return $component ? $component->get_data() : null;
	}//end get_main_name_data



	/**
	* DELETE_ONTOLOGY
	* Completely removes all traces of a TLD from both storage layers and the runtime table.
	*
	* Deletion is performed in a specific order to maintain referential consistency:
	*   Step 1 — delete 'dd_ontology' nodes for the TLD (runtime table first so the
	*             engine never sees orphaned references).
	*   Step 2 — delete the 'matrix_ontology_main' row via sections::delete() with
	*             delete_with_children = true.  The options object includes
	*             prevent_delete_main = true to avoid re-entering this method
	*             from a cascading section delete hook.
	*   Step 3 — delete all matrix node records (per-TLD table rows) via sections::delete()
	*             with delete_with_children = true.
	*   Step 4 — reset the TLD's counter (prevents new nodes getting recycled IDs).
	*
	* On any failure an error response is returned immediately; completed steps are
	* not rolled back.  On success invalidates the diffusion section-map cache.
	*
	* @param string $tld TLD to delete, e.g. 'es', 'mupreva'.  Sanitised via safe_tld().
	* @return object $response {
	*   result:       bool,
	*   msg:          string,
	*   errors:       array<string>,
	*   delete_main:  object  (sections::delete response for main row)
	*   delete_nodes: object  (sections::delete response for node rows)
	* }
	*/
	public static function delete_ontology( string $tld ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ' . __METHOD__;
			$response->errors	= [];

		// remove any other things than tld.
			$safe_tld = safe_tld( $tld );

			if ( $safe_tld === false ) {
				$response->errors[] = "Invalid TLD provided for deletion: " . to_string($tld);
				return $response;
			}

		// 1 Delete the dd_ontology nodes
			$deleted_dd_ontology = ontology_utils::delete_tld_nodes( $safe_tld );

			if ( $deleted_dd_ontology === false ) {
				$response->errors[] = 'Unable to delete dd_ontology records for TLD: ' . $safe_tld;
				$response->msg .= 'Error deleting dd_ontology [1] for the TLD: ' . $safe_tld;
				return $response;
			}

		// 2 Delete main section
			// get main section for this tld
			$main_section = self::get_ontology_main_from_tld( $safe_tld );

			if ( empty($main_section) ) {
				$response->errors[] = 'Unable to find main_section for TLD: ' . $safe_tld;
				$response->msg .= 'Error deleting dd_ontology [2] for the TLD: ' . $safe_tld;
				return $response;
			}

			$main_sections_instance = sections::get_instance( null, null );

			$options = new stdClass();
				$options->delete_mode				= 'delete_record';
				$options->section_tipo				= $main_section->section_tipo;
				$options->section_id				= $main_section->section_id;
				$options->delete_diffusion_records	= true;
				$options->delete_with_children		= true;
				$options->prevent_delete_main		= true; // prevent infinite loop
			$delete_main_response = $main_sections_instance->delete( $options );

			if ( $delete_main_response->result === false ) {
				return $delete_main_response;
			}

		// 3 Delete all ontology nodes (records) in matrix_ontology
			$nodes_section_tipo = self::map_tld_to_target_section_tipo( $safe_tld );

			$nodes_sqo = new search_query_object();
				$nodes_sqo->set_section_tipo( [$nodes_section_tipo] );
				$nodes_sqo->set_limit( 0 );

			// Delete all nodes of the section
			$nodes_sections_instance = sections::get_instance( null, null );

			$options_nodes = new stdClass();
				$options_nodes->delete_mode				= 'delete_record';
				$options_nodes->section_tipo			= $nodes_section_tipo;
				$options_nodes->sqo						= $nodes_sqo;
				$options_nodes->delete_diffusion_records= true;
				$options_nodes->delete_with_children	= true;
				$options_nodes->prevent_delete_main		= true; // prevents infinite loop
			$delete_nodes_response = $nodes_sections_instance->delete( $options_nodes );

			if ( $delete_nodes_response->result === false ) {
				return $delete_nodes_response;
			}

		// 4 delete counter
			counter::modify_counter(
				$safe_tld . '0',
				'reset'
			);

		// response OK
			$response->result		= true;
			$response->delete_main	= $delete_main_response;
			$response->delete_nodes	= $delete_nodes_response;
			$response->msg			= empty($response->errors)
				? 'OK. Request completed successfully'
				: 'Warning. Request completed with errors';

		// dd_ontology nodes were deleted: invalidate the ontology-derived
		// "sections with diffusion" map.
			diffusion_utils::delete_section_map_cache_file();


		return $response;
	}//end delete_ontology



	/**
	* DD_ONTOLOGY_VERSION_IS_VALID
	* Checks whether the installed ontology (dd1 root node) meets a minimum version date.
	*
	* Used during system bootstrap to detect outdated ontology installations that need
	* regeneration before they can be used by this version of Dédalo.
	*
	* Resolution strategy for the date (two-stage fallback):
	*   1. New style (Dédalo >= 6.4): properties.date field on the 'dd1' ontology_node.
	*   2. Legacy style: parses a 'YYYY-MM-DD' pattern from the 'dd1' term value,
	*      e.g. 'Dédalo 2024-12-31T00:00:00+01:00'.
	*
	* Returns false if neither source yields a parseable date.
	*
	* @param string $min_date The minimum acceptable date, e.g. '2025-12-31'.
	* @return bool True if the ontology date >= $min_date; false otherwise.
	*/
	public static function dd_ontology_version_is_valid( string $min_date ) : bool {

		$ontology_node = ontology_node::get_instance('dd1');
		if (!$ontology_node) {
			return false;
		}

		$date = null;

		// 1. Check properties (Dédalo >= 6.4 way)
		$properties = $ontology_node->get_properties();
		if ( isset($properties->date) && !empty($properties->date) ) {
			$date = (string)$properties->date;
		} else {
			// 2. Fallback: Get date from term info (Legacy versions)
			// Sample: 'Dédalo 2024-12-31T00:00:00+01:00'
			$term       = $ontology_node->get_term_data();
			$term_value = $term->{DEDALO_STRUCTURE_LANG} ?? null;

			if ( !empty($term_value) ) {
				if ( preg_match('/[0-9]{4}-[0-9]{2}-[0-9]{2}/', (string)$term_value, $matches) ) {
					$date = $matches[0];
				}
			}
		}

		if ( empty($date) ) {
			debug_log(__METHOD__ . " Unable to resolve version date from dd1 node (properties or term)", logger::ERROR);
			return false;
		}

		try {
			$ontology_datetime = new DateTime($date);
			$min_datetime      = new DateTime($min_date);

			return $ontology_datetime >= $min_datetime;

		} catch (Exception $e) {
			debug_log(__METHOD__ . " Date parsing error: " . $e->getMessage() . " | date: $date | min_date: $min_date", logger::ERROR);
			return false;
		}
	}//end dd_ontology_version_is_valid



	/**
	* GET_ROOT_TERMS
	* Returns the ordered list of root-node locators for the thesaurus tree view.
	*
	* Reads the appropriate children component of the main section record:
	*   - is_model = false: DEDALO_HIERARCHY_CHILDREN_TIPO ('hierarchy45') — data terms
	*   - is_model = true:  DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO ('hierarchy59') — model terms
	*
	* The returned array drives the initial render of the thesaurus/ontology tree in the UI.
	* Each element is a locator object pointing to a root ontology/hierarchy node.
	*
	* Note: $componnent (sic) contains a typo in the variable name; not changed here
	* per doc-only constraint.
	*
	* @param string     $section_tipo Main section tipo of the ontology/hierarchy, e.g. 'ontology35'.
	* @param string|int $section_id   Row ID of the main section record.
	* @param ?bool       $is_model    Whether to return model root terms (default false).
	* @return array<object> Ordered array of root locator objects; empty if not set.
	*/
	public static function get_root_terms( string $section_tipo, string|int $section_id, ?bool $is_model=false ) : array {

		// source tipo
		$tipo = $is_model===true
			? DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO // 'hierarchy59'
			: DEDALO_HIERARCHY_CHILDREN_TIPO; // 'hierarchy45'

		$model		= ontology_node::get_model_by_tipo($tipo,true);
		$componnent	= component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id, // string section_id
			'list', // string mode
			DEDALO_DATA_NOLAN, // string lang
			$section_tipo // string section_tipo
		);

		$root_terms = $componnent->get_data() ?? [];

		return $root_terms;
	}//end get_root_terms



	/**
	* GET_MAIN_ORDER
	* Retrieves the numeric display order for a given TLD's main section.
	*
	* Reads DEDALO_HIERARCHY_ORDER_TIPO ('hierarchy48', component_number) from the
	* 'matrix_ontology_main' (or 'matrix_hierarchy_main') record for the TLD.
	* The order value controls how TLD families are sorted in tree and menu views.
	*
	* Returns 0 as the default when the component exists but has no data.
	*
	* @param string $tld TLD string, e.g. 'dd', 'rsc'.
	* @return int|null Display order integer (0 by default), or null if the main record is missing.
	* @test true
	*/
	public static function get_main_order( string $tld ) : ?int {

		// get main record
		$main_record = self::get_ontology_main_from_tld( $tld );
		if ( empty($main_record) ) {
			debug_log(__METHOD__ . " Empty main record for tld: $tld", logger::ERROR);
			return null;
		}

		// Order component
		$tipo  = DEDALO_HIERARCHY_ORDER_TIPO; // hierarchy48 component_number
		$model = ontology_node::get_model_by_tipo( $tipo, true );

		$component = component_common::get_instance(
			$model,
			$tipo,
			$main_record->section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$main_record->section_tipo
		);

		if ( !$component ) {
			return 0; // Default order
		}

		$order_data = $component->get_data();

		// Access the 'value' property of the first data record
		return isset($order_data[0]->value)
			? (int)$order_data[0]->value
			: 0;
	}//end get_main_order



	/**
	* GET_OVERWRITE
	* Finds the 'localontology0' override record that shadows a given ontology node.
	*
	* Institutional deployments may need to provide alternative labels, properties,
	* or request_config values for core 'dd0' ontology nodes without modifying the
	* shared ontology.  A "local overwrite" is a 'localontology0' matrix record that
	* stores a relation back to the canonical node.
	*
	* This method performs a 'related' search against 'localontology0' (and
	* 'matrix_ontology_main') to find any such record pointing to ($section_tipo,
	* $section_id).  It returns a locator to the found override, or null if none exists.
	*
	* Two node types are never overwritten:
	*   - 'localontology0' nodes themselves (prevents infinite self-referential lookup).
	*   - Nodes where is_model = true (model definitions must stay authoritative).
	*
	* @param string     $section_tipo The section tipo of the node to check, e.g. 'dd0'.
	* @param string|int $section_id   The section ID of the node to check.
	* @return locator|null Locator pointing to the 'localontology0' override record,
	*   or null if no override exists.
	* @test true
	*/
	public static function get_overwrite( string $section_tipo, string|int $section_id ) : ?locator {

		// search if the node has a overwrite node in local ontology
			$local_section_tipo = 'localontology0';

		// If the current section is already a local ontology, skip overwrite search
			if ( $section_tipo === $local_section_tipo ) {
				return null;
			}

		// Model protection: Prevent overwriting ontology models (e.g., 'area', 'component_input_text')
		// Models are abstract definitions that should not have local overrides.
		// Construct the tipo from tld+section_id and verify if this node is a model.
			$tld  = get_tld_from_tipo($section_tipo);
			$tipo = $tld . $section_id;
			$ontology_node = ontology_node::get_instance( $tipo );
			$is_model = $ontology_node->get_is_model();
			if ($is_model === true) {
				return null;
			}

		// node locator
			$locator = new locator();
				$locator->set_section_tipo( $section_tipo );
				$locator->set_section_id( $section_id );

		// create a sqo to find references in local ontology
			$sqo = new search_query_object();
				$sqo->set_select([]); // Prevents to load all columns
				$sqo->set_section_tipo( [$local_section_tipo] );
				$sqo->set_mode('related');
				$sqo->set_filter_by_locators([$locator]);
				$sqo->set_limit( 1 );
				$sqo->set_full_count(false);
				$sqo->set_tables([
					'matrix_ontology_main',
					'matrix_ontology'
				]);

		// search the overwrite section
			$search = search::get_instance( $sqo );
			$db_result = $search->search();

			if ( !$db_result || $db_result->row_count() === 0 ) {
				return null;
			}

		// set the overwrite node locator with the row
			$overwrite_row = $db_result ? $db_result->fetch_one() : null;
			if ( empty($overwrite_row) ) {
				return null;
			}

			$overwrite_locator = new locator();
				$overwrite_locator->set_section_tipo( $overwrite_row->section_tipo );
				$overwrite_locator->set_section_id( $overwrite_row->section_id );

		return $overwrite_locator;
	}//end get_overwrite



	/**
	* BUILD_CACHE_FILE
	* Experimental: dumps all 'dd_ontology' rows to a PHP opcode-cache file.
	*
	* Reads every row from 'dd_ontology' ordered by tipo and writes the result
	* to 'cache_ontology.php' via dd_cache::cache_to_file().  The intention is to
	* allow the opcode cache (OPcache) to serve ontology lookups from a pre-compiled
	* PHP array rather than hitting the database on every request.
	*
	* (!) NOT production-ready.  Do not call from request handlers.
	*
	* Note: row values are stored as-is without JSON parsing because parsing is
	* cheaper at cache-read time than at dump time (see inline comment).
	*
	* @return void
	*/
	public static function build_cache_file() : void {

		$conn = DBi::_getConnection();

		$data = [];

		// search for dd_ontology nodes
		$sql = 'SELECT * FROM "dd_ontology" ORDER BY tipo ASC, id ASC';
		$result = pg_query($conn, $sql);
		while( $row = pg_fetch_assoc($result) ){

			$tipo = $row['tipo'];

			// ! Do not parse values here becuse is more expensive than parse in cache recovering.

			$data[$tipo] = $row;
		}

		dd_cache::cache_to_file((object)[
			'data' => $data,
			'file_name' => 'cache_ontology.php',
			'prefix' => '' // Set empty string as prefix to avoid prefixing the file name
		]);

	}//end build_cache_file



}//end ontology
