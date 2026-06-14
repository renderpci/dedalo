<?php declare(strict_types=1);
/**
* HIERARCHY
* Registry and lifecycle manager for Dédalo thesaurus/descriptor hierarchies.
*
* A "hierarchy" in Dédalo represents a named controlled vocabulary (e.g., a thematic
* thesaurus, a toponymy, a language list). Every hierarchy is stored as a record in
* 'matrix_hierarchy_main' (section_tipo = 'hierarchy1') and owns two virtual sections:
*
*   <tld>1  — descriptor section (actual terms: "Valencia", "Amphorae", …)
*   <tld>2  — model/typology section (disambiguation values: "City", "Black", …)
*
* Virtual sections do not carry their own component definitions; they inherit everything
* from a "real" section referenced via DEDALO_HIERARCHY_SOURCE_REAL_SECTION_TIPO.
*
* This class extends ontology and overrides:
*   - $main_table         → 'matrix_hierarchy_main'
*   - $main_section_tipo  → 'hierarchy1'
*   - get_active_elements() to filter by hierarchy4 (Active flag)
*   - clear() to additionally flush hierarchy-specific caches
*
* Key responsibilities:
*   - generate_virtual_section()   : provision the two virtual sections in the ontology
*   - get_main_lang()              : resolve the primary language for a thesaurus section
*   - get_section_map_elemets()    : read section_map properties (term tipo, children tipo …)
*   - get_element_tipo_from_section_map() : single-key helper over section_map resolver
*   - export_hierarchy()           : dump matrix rows to gzipped psql COPY files
*   - get/build/save/parse schema change utilities for ontology-upgrade auditing
*   - create_thesaurus_general_term() : create the root display term for a thesaurus
*   - sync_hierarchy_active_status()  : keep "Active" in sync with "Active in thesaurus"
*
* Related constants (core/base/dd_tipos.php):
*   DEDALO_HIERARCHY_SECTION_TIPO               = 'hierarchy1'
*   DEDALO_HIERARCHY_ACTIVE_TIPO                = 'hierarchy4'
*   DEDALO_HIERARCHY_TERM_TIPO                  = 'hierarchy5'
*   DEDALO_HIERARCHY_TLD2_TIPO                  = 'hierarchy6'
*   DEDALO_HIERARCHY_LANG_TIPO                  = 'hierarchy8'
*   DEDALO_HIERARCHY_TYPOLOGY_TIPO              = 'hierarchy9'
*   DEDALO_HIERARCHY_TARGET_SECTION_TIPO        = 'hierarchy53'
*   DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO  = 'hierarchy58'
*   DEDALO_HIERARCHY_CHILDREN_TIPO              = 'hierarchy45'
*   DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO        = 'hierarchy59'
*   DEDALO_HIERARCHY_SOURCE_REAL_SECTION_TIPO   = 'hierarchy109'
*   DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO   = 'hierarchy125'
*
* Extended by: (none in v7 core)
* Uses traits: (none directly; inherits ontology's manage_cache_size / clear)
*
* @package Dédalo
* @subpackage Core
*/
class hierarchy extends ontology {



	/**
	* CLASS VARS
	*/

		/**
		* Primary database table for hierarchy master records.
		* Each row (section_tipo='hierarchy1') represents one named thesaurus
		* configuration: its TLD, target section, active flag, language, typology, etc.
		* Overrides ontology::$main_table ('matrix_ontology_main').
		* @var string $main_table
		*/
		public static string $main_table = 'matrix_hierarchy_main';

		/**
		* Ontology tipo that identifies the main hierarchy definition section.
		* All hierarchy configuration records are stored under this section_tipo.
		* Overrides ontology::$main_section_tipo ('ontology35').
		* @var string $main_section_tipo
		*/
		public static string $main_section_tipo = 'hierarchy1';

		/**
		* Component portal tipos that hold the children (child-term) relations for a hierarchy.
		* 'hierarchy45' = General Term portal  (descriptor trees)
		* 'hierarchy59' = General Term Model portal  (typology/model trees)
		* Formerly component_relation_children; migrated to component_portal in v7.
		* @var array $hierarchy_portals_tipo
		*/
		public static array $hierarchy_portals_tipo = [
			DEDALO_HIERARCHY_CHILDREN_TIPO,
			DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO
		];

		/**
		* In-process cache mapping section_tipo → resolved main language code.
		* Example entry: ['es1' => 'lg-spa', 'ts1' => 'lg-eng']
		* Populated lazily by get_main_lang(); cleared by clear().
		* @var array $cache_main_lang
		*/
		public static array $cache_main_lang = [];

		/**
		* In-process cache mapping section_tipo → its section_map properties array.
		* Avoids repeated ontology traversal when resolving term/children tipos
		* for the same thesaurus section within a single request.
		* Cleared by clear(). Size-bounded by manage_cache_size().
		* Note: the property name contains a typo ('elemets' vs 'elements') —
		* it is preserved to avoid breaking call sites.
		* @var array $cache_section_map_elemets
		*/
		public static array $cache_section_map_elemets = [];

		/**
		* In-process two-level cache: section_tipo → component_tipo → section_id (int|null).
		* Used by get_hierarchy_section() to remember which hierarchy1 record
		* points to a given target section_tipo, avoiding repeated SQO searches.
		* Cleared by clear().
		* @var array $cache_hierarchy_section
		*/
		public static array $cache_hierarchy_section = [];

		/**
		* In-process cache for the active hierarchy elements list.
		* Populated on first call to get_active_elements(); cleared by clear().
		* Stores the array of element objects returned by ontology::row_to_element().
		* @var array $cache_hierarchy_elements
		*/
		public static array $cache_hierarchy_elements = [];



	/**
	* CLEAR
	* Purges all in-process static caches maintained by this class and its parent.
	*
	* Must be called between worker requests to prevent state-bleed across tenants
	* (see memory note: audit-2026-06-worker-state-bleed).
	* Calls parent::clear() first so the ontology-level caches
	* ($cache_ontology_sections, $cache_active_ontology_elements) are also reset.
	*
	* @return void
	*/
	public static function clear() : void {
		parent::clear();
		self::$cache_main_lang = [];
		self::$cache_section_map_elemets = [];
		self::$cache_hierarchy_section = [];
		self::$cache_hierarchy_elements = [];
	}



	/**
	* GET_DEFAULT_SECTION_TIPO_TERM
	* Returns the canonical section_tipo for the descriptor (term) virtual section
	* of a hierarchy identified by its TLD.
	*
	* Convention: descriptor section = <tld_lowercase> + '1', e.g. 'es' → 'es1'.
	* The returned tipo is the virtual section that holds the actual thesaurus terms.
	*
	* @param string $tld - Two-letter (or longer) top-level domain, e.g. 'es', 'ts', 'oh'.
	* @return string $default_section_tipo_term - e.g. 'es1'
	*/
	public static function get_default_section_tipo_term(string $tld) : string {

		$default_section_tipo_term = strtolower($tld) . '1';

		return $default_section_tipo_term;
	}//end get_default_section_tipo_term



	/**
	* GET_DEFAULT_SECTION_TIPO_MODEL
	* Returns the canonical section_tipo for the model/typology virtual section
	* of a hierarchy identified by its TLD.
	*
	* Convention: model section = <tld_lowercase> + '2', e.g. 'es' → 'es2'.
	* The model section stores disambiguation values (typologies) that qualify
	* descriptor terms, e.g. "City" or "Black Figure" attached to a pottery term.
	*
	* @param string $tld - Two-letter (or longer) top-level domain, e.g. 'es', 'ts', 'oh'.
	* @return string $default_section_tipo_model - e.g. 'es2'
	*/
	public static function get_default_section_tipo_model(string $tld) : string {

		$default_section_tipo_model = strtolower($tld) . '2';

		return $default_section_tipo_model;
	}//end get_default_section_tipo_model



	/**
	* GENERATE_VIRTUAL_SECTION
	* Provisions the two virtual ontology sections required for a new thesaurus hierarchy.
	*
	* Every Dédalo hierarchy needs two virtual sections that share the TLD of the hierarchy:
	*   <tld>1  — descriptor section: holds the actual thesaurus terms (e.g. 'es1' for Spanish)
	*   <tld>2  — model section: holds disambiguation typologies (e.g. 'es2')
	*
	* "Virtual" means these section tipos exist as ontology nodes (rows in dd_ontology and in
	* the <tld>0 matrix table) but do not carry their own component definitions — they inherit
	* the component layout from the "real" source section referenced by
	* DEDALO_HIERARCHY_SOURCE_REAL_SECTION_TIPO (hierarchy109).
	*
	* The overall provisioning sequence is:
	*   1. Validate that the hierarchy record is marked Active.
	*   2. Read the TLD (hierarchy6), source real section (hierarchy109), typology (hierarchy9),
	*      and display name (hierarchy5) from the supplied hierarchy1 record.
	*   3. Register a new top-level entry in 'matrix_ontology_main' via ontology::add_main_section().
	*   4. Create a dd_ontology node for the new TLD root via create_dd_ontology_ontology_section_node().
	*   5. Create two section_record rows (section_id 1 and 2) in the <tld>0 matrix table,
	*      setting Publication, Is-descriptor, Is-model, Model, Is-translatable, Relations,
	*      TLD, and Name component data before saving.
	*   6. Attach each new section node to its parent grouper in the ontology tree:
	*        hierarchy56 grouper for descriptors, hierarchy57 grouper for models.
	*   7. Insert both nodes into dd_ontology via ontology::insert_dd_ontology_record().
	*   8. Grant the current user access (permission level 2) to the two virtual sections.
	*   9. Store the target section tipos back in the hierarchy1 record
	*        (DEDALO_HIERARCHY_TARGET_SECTION_TIPO = hierarchy53,
	*         DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO = hierarchy58).
	*
	* @param object $options
	*   - section_id   int|string  Row id of the hierarchy1 record to provision from.
	*   - section_tipo string      Should always be 'hierarchy1'.
	*   Example: { section_id: 3, section_tipo: 'hierarchy1' }
	* @return object $response
	*   - result  bool    true on full success; false on any validation or write failure.
	*   - msg     string  Human-readable outcome message.
	*   - errors  array   Accumulated error strings (may be non-empty even when result=true).
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
			$model_name		= ontology_node::get_model_by_tipo($active_tipo, true);
			$component		= component_common::get_instance(
				$model_name,
				$active_tipo,
				$section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$data		= $component->get_data();
			$locator	= $data[0] ?? null;
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
			$model_name	= ontology_node::get_model_by_tipo($tld2_tipo, true);
			$component	= component_common::get_instance(
				$model_name,
				$tld2_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$data		= $component->get_data();
			$first_data	= $data[0]->value ?? null;
			$tld2		= !empty($first_data)
				? strtolower( $first_data )
				: $first_data;
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
			$model_name	= ontology_node::get_model_by_tipo(DEDALO_HIERARCHY_SOURCE_REAL_SECTION_TIPO,true);
			$component	= component_common::get_instance(
				$model_name,
				DEDALO_HIERARCHY_SOURCE_REAL_SECTION_TIPO,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$data				= $component->get_data();
			$real_section_tipo	= $data[0]->value ?? false;
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
			$real_section_model_name = ontology_node::get_model_by_tipo($real_section_tipo, true);
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
			$model_name		= ontology_node::get_model_by_tipo($hierarchy_type, true);
			$component		= component_common::get_instance(
				$model_name,
				$hierarchy_type,
				$section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$hierarchy_type_data = $component->get_data();
			// (!) $is_toponymy is derived from typology section_id == '2' but is never
			// referenced later in this method. Preserved in case downstream code expects
			// the side-effects of the computation; do not remove without auditing callers.
			$is_toponymy = (isset($hierarchy_type_data[0]) && isset($hierarchy_type_data[0]->section_id) && $hierarchy_type_data[0]->section_id=='2')
				? true
				: false;
			$typology_id = isset($hierarchy_type_data[0])
				? (int)$hierarchy_type_data[0]->section_id
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
			$model_name	= ontology_node::get_model_by_tipo($name_tipo, true);
			$component	= component_common::get_instance(
				$model_name,
				$name_tipo,
				$section_id,
				'edit',
				DEDALO_DATA_LANG,
				$section_tipo
			);
			$data_lang = $component->get_data_lang_with_fallback();
			$name = $data_lang[0]->value ?? null;
			if (empty($name)) {
				$name = 'Hierarchy ' . $tld2;
			}
			$name_data = $component->get_data();

		// -------- VIRTUAL SECTION --------

		// ontology main. Create a new ontology main section if not already exists
			$file_item = new stdClass();
				$file_item->tld			= $tld2;
				$file_item->typology_id	= $typology_id;
				$file_item->name_data	= $name_data;
			ontology::add_main_section( $file_item );
		// create dd_ontology node for the main section
			ontology::create_dd_ontology_ontology_section_node( $file_item );

		// ontology nodes
		// Create two different nodes:
		// 1. main section for the thesaurus descriptors. as ts1, es1, etc.
		// 2. main section for the thesaurus models/typologies. ts2, es2, etc

			// virtual section
			// create the ontology node, save it, and process the `dd_ontology`
			// It uses a template to build the ontology node data

			// create the new section record in database
			$section = section::get_instance( $tld2.'0' );
			$section->create_record( (object)[
				'section_id' => 1
			]);

			// get the new section record
			$section_record = section_record::get_instance(
				$tld2.'0', // string section_tipo
				1 // string|null section_id
			);

			// Publication
				$tipo 	= DEDALO_ONTOLOGY_PUBLICATION_TIPO;
				$model 	= ontology_node::get_model_by_tipo( $tipo );
				$column = section_record_data::get_column_name( $model );
				$component_data = new locator();
					$component_data->set_id( 1 );
					$component_data->set_type( 'dd151' );
					$component_data->set_section_tipo( DEDALO_SECTION_SI_NO_TIPO );
					$component_data->set_section_id( NUMERICAL_MATRIX_VALUE_YES );
					$component_data->set_from_component_tipo( $tipo );

				$section_record->set_component_data($tipo, $column, [$component_data]);

			// Is descriptor
				$tipo 	= DEDALO_ONTOLOGY_IS_DESCRIPTOR_TIPO;
				$model 	= ontology_node::get_model_by_tipo( $tipo );
				$column = section_record_data::get_column_name( $model );
				$component_data = new locator();
					$component_data->set_id( 1 );
					$component_data->set_type( 'dd151' );
					$component_data->set_section_tipo( DEDALO_SECTION_SI_NO_TIPO );
					$component_data->set_section_id( NUMERICAL_MATRIX_VALUE_YES );
					$component_data->set_from_component_tipo( $tipo );

				$section_record->set_component_data($tipo, $column, [$component_data]);

			// Is Model
			// (!) set_component_data is intentionally NOT called here for the descriptor
			// section_record. The locator is built but discarded; 'Is Model' defaults to NO
			// for the descriptor section (<tld>1). The model section (<tld>2) overrides
			// this flag to YES after copying all other fields from this record (see below).
				$tipo 	= DEDALO_ONTOLOGY_IS_MODEL_TIPO;
				$model 	= ontology_node::get_model_by_tipo( $tipo );
				$column = section_record_data::get_column_name( $model );
				$component_data = new locator();
					$component_data->set_id( 1 );
					$component_data->set_type( 'dd151' );
					$component_data->set_section_tipo( DEDALO_SECTION_SI_NO_TIPO );
					$component_data->set_section_id( NUMERICAL_MATRIX_VALUE_NO );
					$component_data->set_from_component_tipo( $tipo );

			// Model (section = 6)
			// Points to dd0/6 — the hardcoded section_id for 'section' model in the
			// 'dd' ontology. This links the virtual section node to the generic
			// 'section' component model definition in dd_ontology.
				$tipo 	= DEDALO_ONTOLOGY_MODEL_TIPO;
				$model 	= ontology_node::get_model_by_tipo( $tipo );
				$column = section_record_data::get_column_name( $model );
				$component_data = new locator();
					$component_data->set_id( 1 );
					$component_data->set_type( 'dd151' );
					$component_data->set_section_tipo( 'dd0' );
					$component_data->set_section_id( '6' );
					$component_data->set_from_component_tipo( $tipo );

				$section_record->set_component_data($tipo, $column, [$component_data]);

			// Is translatable
				$tipo 	= DEDALO_ONTOLOGY_TRANSLATABLE_TIPO;
				$model 	= ontology_node::get_model_by_tipo( $tipo );
				$column = section_record_data::get_column_name( $model );
				$component_data = new locator();
					$component_data->set_id( 1 );
					$component_data->set_type( 'dd151' );
					$component_data->set_section_tipo( DEDALO_SECTION_SI_NO_TIPO );
					$component_data->set_section_id( NUMERICAL_MATRIX_VALUE_NO );
					$component_data->set_from_component_tipo( $tipo );

				$section_record->set_component_data($tipo, $column, [$component_data]);

			// relations
			// 'Connected to' (DEDALO_ONTOLOGY_CONNECTED_TO_TIPO) links this virtual
			// section node to the real source section node in dd_ontology.
			// The real section supplies all component definitions (virtual sections
			// inherit the component layout from it at runtime).
			// The locator points to <real_tld>0 / <real_section_id>.
				$tipo 	= DEDALO_ONTOLOGY_CONNECTED_TO_TIPO;
				$model 	= ontology_node::get_model_by_tipo( $tipo );
				$column = section_record_data::get_column_name( $model );
				$relation_section_tipo	= get_tld_from_tipo( $real_section_tipo ).'0';
				$relation_section_id	= get_section_id_from_tipo( $real_section_tipo );

				$relation_locator = new locator();
					$relation_locator->set_type( 'dd151' );
					$relation_locator->set_section_tipo( $relation_section_tipo );
					$relation_locator->set_section_id( $relation_section_id );
					$relation_locator->set_from_component_tipo( $tipo );

				$section_record->set_component_data($tipo, $column, [$relation_locator]);


			// TLD
				$tipo 	= DEDALO_ONTOLOGY_TLD_TIPO;
				$model 	= ontology_node::get_model_by_tipo( $tipo );
				$column = section_record_data::get_column_name( $model );
				$component_data = new stdClass();
					$component_data->id 	= 1;
					$component_data->value 	= $tld2;
					$component_data->lang 	= DEDALO_DATA_LANG;

				$section_record->set_component_data($tipo, $column, [$component_data]);

			// Name
				$tipo 			= DEDALO_ONTOLOGY_TERM_TIPO;
				$model 			= ontology_node::get_model_by_tipo( $tipo );
				$column 		= section_record_data::get_column_name( $model );

				$section_record->set_component_data($tipo, $column, $name_data);

			// save
				$section_record->save();

			// parent grouper
			// Place the descriptor section node under the 'hierarchytype' grouper
			// (hierarchy56) that corresponds to this hierarchy's typology id.
			// create_parent_grouper() creates the grouper node if absent and returns its tipo.
				$parent_grouper_tipo = ontology::create_parent_grouper('hierarchy56', 'hierarchytype', $typology_id);

				$parent_tld			= get_tld_from_tipo( $parent_grouper_tipo );
				$parent_section_id	= get_section_id_from_tipo( $parent_grouper_tipo );
				$parent_node_tipo 	= $parent_tld.'0';

				$parent_tipo		= DEDALO_ONTOLOGY_PARENT_TIPO;
				$parent_model		= ontology_node::get_model_by_tipo( $parent_tipo );
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

				$component_parent->set_data( [$parent_locator] );
				$component_parent->save();

			// insert the node in dd_ontology
				ontology::insert_dd_ontology_record($tld2.'0', 1);

			// Virtual model section
			// section_id 2 in <tld>0 → the <tld>2 model/typology virtual section.
			// Reuses all data from section_record (section_id=1) and then flips
			// Is-Model to YES, so the two sections share identical configuration
			// except for that single flag.
				// create the new section record in database
				$section = section::get_instance( $tld2.'0' );
				$section->create_record( (object)[
					'section_id' => 2
				]);

				// get the new section record
				$model_section_record = section_record::get_instance(
					$tld2.'0', // string section_tipo
					2 // string|null section_id
				);
				// get section data of the main section_record
				// all data will be the same expect the is model component
				// in this case is model component will be set to yes
				$model_data = $section_record->get_data();
				// insert the previous data in the model section_record
				$model_section_record->set_data( $model_data );

				// is model
				// change the is model component to yes
				$tipo 	= DEDALO_ONTOLOGY_IS_MODEL_TIPO;
				$model 	= ontology_node::get_model_by_tipo( $tipo );
				$column = section_record_data::get_column_name( $model );
				$component_data = new locator();
					$component_data->set_id( 1 );
					$component_data->set_type( 'dd151' );
					$component_data->set_section_tipo( DEDALO_SECTION_SI_NO_TIPO );
					$component_data->set_section_id( NUMERICAL_MATRIX_VALUE_YES );
					$component_data->set_from_component_tipo( $tipo );

				$model_section_record->set_component_data($tipo, $column, [$component_data]);

				// save
				$model_section_record->save();

				// parent
				// Place the model section node under the 'hierarchymtype' grouper
				// (hierarchy57) — the parallel grouper for model sections.
				// (!) $parent_tipo is hardcoded to 'ontology15' here instead of using
				// DEDALO_ONTOLOGY_PARENT_TIPO. This appears to be an intentional choice
				// for the model-section parent link; do not change without verifying the
				// ontology tree integrity.
					$parent_model_grouper_tipo = ontology::create_parent_grouper('hierarchy57', 'hierarchymtype', $typology_id);

					$parent_model_tld	= get_tld_from_tipo( $parent_model_grouper_tipo );
					$parent_section_id	= get_section_id_from_tipo( $parent_model_grouper_tipo );
					$parent_node_tipo	= $parent_model_tld.'0';

					$parent_tipo		= 'ontology15';
					$parent_model		= ontology_node::get_model_by_tipo( $parent_tipo );
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

					$component_model_parent->set_data( [$parent_model_locator] );
					$component_model_parent->save();

				// insert the model node in dd_ontology
					ontology::insert_dd_ontology_record($tld2.'0', 2);

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
				$model_name					= ontology_node::get_model_by_tipo($target_tipo, true);
				$component_target_section	= component_common::get_instance(
					$model_name,
					$target_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				$target_section_data = new stdClass();
					$target_section_data->lang = DEDALO_DATA_NOLAN;
					$target_section_data->value = $tld2.'1';
				$component_target_section->set_data( [$target_section_data] );
				$component_target_section->save();

				$target_model_tipo				= DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO;	//'hierarchy53';
				$model_name						= ontology_node::get_model_by_tipo($target_model_tipo, true);
				$component_target_model_section	= component_common::get_instance(
					$model_name,
					$target_model_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				$target_model_section_data = new stdClass();
					$target_model_section_data->lang = DEDALO_DATA_NOLAN;
					$target_model_section_data->value = $tld2.'2';
				$component_target_model_section->set_data( [$target_model_section_data] );
				$component_target_model_section->save();

		// response OK
			$response->result = true;
			$response->msg = count($response->errors)===0
				? 'Request done successfully'
				: 'Request done with errors';


		return $response;
	}//end generate_virtual_section



	/**
	* GET_MAIN_LANG
	* Resolves the primary language code for a thesaurus section.
	*
	* Every hierarchy in Dédalo has one authoritative language — for example the Spanish
	* thesaurus ('es1') uses 'lg-spa'.  This information lives in the hierarchy1 record
	* (component DEDALO_HIERARCHY_LANG_TIPO = 'hierarchy8', stored in the 'relation' JSONB
	* column of 'matrix_hierarchy_main') and is identified by matching the TLD prefix of
	* $section_tipo against the TLD stored in each hierarchy row.
	*
	* Performance note: a raw SQL query against the JSONB 'string' column with a jsonpath
	* predicate is used instead of the ORM search layer because this method is called
	* very frequently during thesaurus rendering; the result is cached in $cache_main_lang.
	*
	* Fallback chain (applied when the DB row is missing or the lang locator is empty):
	*   - 'lg1'       → always returns 'lg-eng' immediately (lang root term is English).
	*   - 'es1'       → 'lg-spa'
	*   - 'hierarchy1'→ DEDALO_DATA_LANG_DEFAULT
	*   - anything else → 'lg-eng'
	*
	* @param string $section_tipo - The thesaurus section tipo to look up, e.g. 'es1', 'ts1'.
	* @return string $main_lang - BCP-47-style language code prefixed with 'lg-', e.g. 'lg-eng'.
	*/
	public static function get_main_lang( string $section_tipo ) : string {

		// lg1 is always in English — the language-list root section is invariant
			if ($section_tipo==='lg1') {
				return 'lg-eng';
			}

		// cache
			if(isset(self::$cache_main_lang[$section_tipo])) {
				return self::$cache_main_lang[$section_tipo];
			}

		// default value
			$main_lang		= null;
			$fallback_value	= 'lg-eng';

		// short vars
			$matrix_table			= 'matrix_hierarchy_main';
			$hierarchy_lang_tipo	= DEDALO_HIERARCHY_LANG_TIPO;
			$hierarchy_section_tipo	= DEDALO_HIERARCHY_SECTION_TIPO;
			$hierarchy_tld_tipo		= DEDALO_HIERARCHY_TLD2_TIPO;
			$prefix					= get_tld_from_tipo($section_tipo);
			$prefix_lower			= strtolower($prefix); // data is stored sometimes in uppercase

		// params
		// $2 is a jsonpath expression that matches hierarchy rows whose TLD value
		// equals $prefix_lower (case-insensitive). The jsonpath walks the 'string'
		// JSONB column: $.hierarchy6[*].value where value matches the prefix regex.
			$params = [
				$hierarchy_section_tipo,
				"\$.{$hierarchy_tld_tipo}[*].value ? (@ like_regex \"^$prefix_lower$\" flag \"i\")" // Case insensitive search
			];

		// SQL query
		// Uses the PostgreSQL JSONB #> operator to extract the lang locator array
		// from the 'relation' column at path {hierarchy8}. This avoids deserialising
		// the full row and is significantly faster than a PHP-level array walk.
			$sql  = "SELECT section_id, relation#>'{".$hierarchy_lang_tipo."}' AS main_lang" . PHP_EOL;
			$sql .= "FROM $matrix_table WHERE" . PHP_EOL;
			$sql .= "section_tipo = $1 AND" . PHP_EOL;
			$sql .= "string @? ($2)::jsonpath" . PHP_EOL;
			$sql .= "LIMIT 1;";

		// search
		// Although only one row is expected (LIMIT 1), a while loop is used to
		// allow pg_fetch_assoc to advance the cursor; the 'break' inside
		// ensures we exit after the first row.
			$result	= matrix_db_manager::exec_search($sql, $params);
			while ($row = pg_fetch_assoc($result)) {

				$main_lang_column = $row['main_lang'];
				// JSON decode DB column
				// The 'relation' JSONB sub-path is returned as a JSON string by pg;
				// decode to an array of locator objects.
				$main_lang_value = is_string($main_lang_column) ? json_decode($main_lang_column) : $main_lang_column;

				// resolve locator
				// The first locator in the array points to the lg section and section_id
				// that represents the language. lang::get_code_from_locator() converts
				// it to the 'lg-xxx' code used throughout Dédalo.
				$main_lang_locator = $main_lang_value[0] ?? null;
				if (!is_object($main_lang_locator)) {
					debug_log(__METHOD__
						. " Empty main_lang_locator. not found into section. Fallback will be applied ($fallback_value)" . PHP_EOL
						.' section_tipo: ' . $section_tipo . PHP_EOL
						.' main_lang_value: ' . to_string($main_lang_value)
						, logger::ERROR
					);
				}else{
					$main_lang = lang::get_code_from_locator(
						$main_lang_locator,
						true // bool add_prefix
					);
				}

				break; // only one result is expected
			}

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
			self::$cache_main_lang[$section_tipo] = $main_lang;
			// Manage cache size to prevent memory leaks (using inherited method)
			self::manage_cache_size(self::$cache_main_lang);


		return $main_lang;
	}//end get_main_lang



	/**
	* GET_ALL_TABLES
	* Returns the deduplicated list of PostgreSQL matrix table names that back
	* the supplied set of hierarchy section tipos.
	*
	* Multiple section tipos can share the same physical table (e.g. 'es1' and 'es2'
	* both live in 'matrix_hierarchy'). This method collapses duplicates so callers
	* can iterate once per table instead of once per section tipo.
	*
	* @param array $ar_section_tipo - Indexed array of section tipo strings.
	*   Example: ['lg1', 'ts1', 'es1']
	* @return array $all_tables - Unique table names, e.g. ['matrix_langs', 'matrix_hierarchy'].
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
	* Looks up a named element tipo from the section_map configuration of a
	* thesaurus section.
	*
	* The section_map is an ontology component (model 'section_map') attached to each
	* thesaurus section. Its 'properties' JSON object maps semantic keys (e.g. 'term',
	* 'children', 'parents') to the actual component tipos in use for that section.
	*
	* This method is a thin wrapper over section_map::get_first_element_tipo(), which
	* implements the deterministic scope fallback chain:
	*   main → thesaurus → relation_list
	* instead of the old "first scope found in property order" lookup that could produce
	* inconsistent results depending on storage order.
	*
	* @param string $section_tipo - The thesaurus section, e.g. 'es1'.
	* @param string $type - Semantic key to look up, e.g. 'term', 'children', 'parents'.
	* @param string|null $scope - Restrict lookup to a specific scope ('main', 'thesaurus',
	*   'relation_list'). null walks the full chain from 'main'.
	* @return string|null $element_tipo - The resolved component tipo, or null if not found.
	*/
	public static function get_element_tipo_from_section_map( string $section_tipo, string $type, ?string $scope=null ) : ?string {

		return section_map::get_first_element_tipo($section_tipo, $type, $scope);
	}//end get_element_tipo_from_section_map



	/**
	* GET_SECTION_MAP_ELEMETS
	* Returns the full 'properties' array of the section_map component for a
	* thesaurus section, providing all semantic tipo mappings in one call.
	*
	* The section_map is located by searching the section's children for a node of
	* model 'section_map'. For virtual sections the lookup falls back to the real
	* section tipo if no section_map is found directly.
	*
	* The returned array is a cast of the stdClass properties object stored in the
	* ontology node, with keys like 'term', 'children', 'parents', etc. mapping
	* to component tipo strings.
	*
	* Note: the method name contains a typo ('elemets' vs 'elements'). It is
	* preserved to avoid breaking call sites. Use get_element_tipo_from_section_map()
	* for single-key lookups with scope control.
	*
	* @param string $section_tipo - Thesaurus section tipo, e.g. 'es1'. Empty string returns [].
	* @return array $ar_elements - Associative array of semantic-key → component-tipo mappings,
	*   or empty array if no section_map is found.
	*/
	public static function get_section_map_elemets( string $section_tipo ) : array {

		$ar_elements = array();

		if (empty($section_tipo)) {
			return $ar_elements;
		}

		// cache
		if (isset(self::$cache_section_map_elemets[$section_tipo])) {
			return self::$cache_section_map_elemets[$section_tipo];
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
			$ontology_node	= ontology_node::get_instance($section_map_tipo);
			$ar_properties	= $ontology_node->get_properties();

			$ar_elements = (array)$ar_properties;
		}

		// Set static var for re-use
			self::$cache_section_map_elemets[$section_tipo] = $ar_elements;
			// Manage cache size to prevent memory leaks (using inherited method)
			self::manage_cache_size(self::$cache_section_map_elemets);


		return (array)$ar_elements;
	}//end get_section_map_elemets



	/**
	* GET_HIERARCHY_SECTION
	* Finds the hierarchy1 record whose $hierarchy_component_tipo value matches
	* $section_tipo, and returns its section_id.
	*
	* This is used to navigate from a virtual thesaurus section tipo (e.g. 'es1')
	* back to the controlling hierarchy1 record. The $hierarchy_component_tipo
	* parameter specifies which component in hierarchy1 stores the target value
	* (e.g. DEDALO_HIERARCHY_TARGET_SECTION_TIPO = 'hierarchy53' for descriptor sections,
	* or DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO = 'hierarchy58' for model sections).
	*
	* Results are keyed by [section_tipo][hierarchy_component_tipo] in $cache_hierarchy_section.
	*
	* @param string $section_tipo - Virtual section tipo to search for, e.g. 'es1'.
	* @param string $hierarchy_component_tipo - Component in hierarchy1 that holds the value,
	*   e.g. 'hierarchy53' or 'hierarchy58'.
	* @return int|null $section_id - The hierarchy1 section_id, or null if not found.
	*/
	public static function get_hierarchy_section(string $section_tipo, string $hierarchy_component_tipo) : ?int {

		// cache

		if (isset(self::$cache_hierarchy_section[$section_tipo][$hierarchy_component_tipo])) {
			return self::$cache_hierarchy_section[$section_tipo][$hierarchy_component_tipo];
		}

		$model = ontology_node::get_model_by_tipo($hierarchy_component_tipo,true);

		// search query object
			$search_query_object = new search_query_object();
				$search_query_object->set_section_tipo([DEDALO_HIERARCHY_SECTION_TIPO]);
				$search_query_object->set_filter((object)[
					'$and' => [
						(object)[
							'q'				=> $section_tipo,
							'q_operator'	=> '==',
							'path'			=> [
								(object)[
									'section_tipo'		=> DEDALO_HIERARCHY_SECTION_TIPO,
									'component_tipo'	=> $hierarchy_component_tipo,
									'model'				=> $model,
									'name'				=> "$model $hierarchy_component_tipo"
								]
							]
						]
					]
				]);

		// search
			$search		= search::get_instance($search_query_object);
			$db_result	= $search->search();
			$record		= $db_result
				? ($db_result->fetch_one() ?? null)
				: null;

			if(empty($record)) {
				return null;
			}

		// section id
			$section_id = isset($record->section_id) ? (int)$record->section_id : null;

		// cache
			self::$cache_hierarchy_section[$section_tipo][$hierarchy_component_tipo] = $section_id;
			// Manage cache size to prevent memory leaks (using inherited method)
			self::manage_cache_size(self::$cache_hierarchy_section);

		return $section_id;
	}//end get_hierarchy_section



	/**
	* GET_HIERARCHY_BY_TLD
	* Fetches the hierarchy1 record that owns a given TLD via a direct JSONB
	* jsonpath query, and returns the (section_id, section_tipo) pair.
	*
	* Uses a raw SQL query against 'matrix_hierarchy_main' for performance; TLD
	* matching is case-insensitive via the jsonpath 'flag "i"' flag.
	* The $tld is sanitised through safe_tld() before interpolation into the
	* jsonpath string to prevent SQL injection.
	*
	* @param string $tld - Two-letter (or longer) hierarchy TLD, e.g. 'es', 'ts', 'oh'.
	* @return object|null $row - stdClass with properties section_id (string) and
	*   section_tipo (string), e.g. {"section_id":"66","section_tipo":"hierarchy1"}.
	*   Returns null when no matching hierarchy is found or on query failure.
	*/
	public static function get_hierarchy_by_tld( string $tld ) : ?object {

		// short vars
		$matrix_table	= self::$main_table; // expected 'matrix_hierarchy_main'
		$section_tipo	= DEDALO_HIERARCHY_SECTION_TIPO;

		// set a safe tld to avoid SQL injection attacks (only alphanumeric and hyphen)
		$tld 				= trim(strtolower($tld));
		$safe_tld 			= safe_tld( $tld );
		$hierarchy_tld_tipo = DEDALO_HIERARCHY_TLD2_TIPO;

		// params
		$params = [
			$section_tipo,
			"\$.{$hierarchy_tld_tipo}[*].value ? (@ like_regex \"^$safe_tld$\" flag \"i\")" // Case insensitive search
		];

		// SQL query
		$sql  = "SELECT section_id, section_tipo" . PHP_EOL;
		$sql .= "FROM $matrix_table WHERE" . PHP_EOL;
		$sql .= "section_tipo = $1 AND" . PHP_EOL;
		$sql .= "string @? ($2)::jsonpath" . PHP_EOL;
		$sql .= "LIMIT 1;";

		// search
		$result = matrix_db_manager::exec_search($sql, $params);
		if ($result === false) {
			return null;
		}
		$row = pg_fetch_object($result);


		return $row !== false ? $row : null;
	}//end get_hierarchy_by_tld



	/**
	* EXPORT_HIERARCHY
	* Dumps one or more thesaurus matrix tables to gzip-compressed psql COPY files
	* on the filesystem at EXPORT_HIERARCHY_PATH.
	*
	* The export is performed via a shell call to `psql … \copy … TO <file> ; gzip`.
	* After all files are written the method scans EXPORT_HIERARCHY_PATH for .gz files
	* and includes download links in the response message.
	*
	* $section_tipo accepts three forms:
	*   '*'         — export all currently active hierarchies (one file per section_tipo)
	*   'all'       — export every row in 'matrix_hierarchy' regardless of section_tipo
	*                 into a single timestamped file
	*   'es1,ts1'   — comma-separated list of specific section tipos to export
	*
	* Table routing:
	*   'lg1' / 'lg2' → 'matrix_langs'
	*   anything else → 'matrix_hierarchy'
	*
	* Requires:
	*   - EXPORT_HIERARCHY_PATH constant defined (absolute filesystem path).
	*   - DB_BIN_PATH and DEDALO_DATABASE_CONN constants for the psql invocation.
	*   - The web server user must have write access to EXPORT_HIERARCHY_PATH.
	*
	* (!) This method calls shell_exec() directly. EXPORT_HIERARCHY_PATH must
	* point to a directory the web server process can write to. All section tipo
	* values are passed through safe_tipo() before shell interpolation.
	*
	* @param string $section_tipo - Export scope: '*', 'all', or comma-separated tipo list.
	* @return object $response
	*   - result  bool    true when export commands complete without PHP-level errors.
	*   - msg     string  Human-readable summary including download links for .gz files.
	*   - errors  array   Per-section error strings for skipped or invalid tipos.
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

			$columns = implode(',', matrix_db_manager::$columns);

			$command  = '';
			$command .= 'cd "'.EXPORT_HIERARCHY_PATH.'" ; ';
			$command  .= DB_BIN_PATH.'psql ' . DEDALO_DATABASE_CONN . ' ' . DBi::get_connection_string();
			$command .= ' -c "\copy (SELECT '. $columns .'  FROM '.$matrix_table.' WHERE ';
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
		// (!) $command_res holds the last value set inside the foreach loop. If the loop
		// ran zero iterations (empty $ar_section_tipo), $command_res is undefined here.
		// The undefined-variable warning is a pre-existing condition; do not change code.
			$response->result	= true;
			$response->msg	= 'OK. All data is exported successfully'; // Override first message
			$response->msg	.= "<br>".implode('<br>', $msg);
			$response->msg	.= '<br>' . 'command_res: ' .$command_res;
			$response->msg	.= '<br>' . 'To import, use a command like this: ';
			$response->msg	.= '<br>' . 'SECTION_TIPO=\'us1\' ; gunzip ${SECTION_TIPO}.copy.gz | psql dedalo_myentity -U mydbuser -h localhost -c "\copy matrix_hierarchy('. $columns .') from ${SECTION_TIPO}.copy"';

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
						// SEC-033: rel=noopener and htmlspecialchars on URL/label.
						$safe_url = htmlspecialchars($url, ENT_QUOTES, 'UTF-8');
						$a		= '<a href="'.$safe_url.'" target="_blank" rel="noopener noreferrer">'.$safe_url.'</a>';
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
	* Snapshots the current ontology tree as a flat associative array mapping each
	* section tipo to its direct and indirect children tipos.
	*
	* The result is intended to be compared with an older snapshot via
	* build_simple_schema_changes() to detect components added to sections during
	* an ontology upgrade. The snapshot is written to disk by save_simple_schema_file().
	*
	* All section tipos of model 'dd6' (section model in the dd ontology) are
	* enumerated. For each, the real section tipo is resolved (virtual sections share
	* children with their real counterpart) and ontology_node::get_ar_recursive_children()
	* returns all descendant tipos.
	*
	* Example output:
	* [
	*   "oh1"  => ["oh17","oh25", …],
	*   "ich1" => ["ich14","ich58", …]
	* ]
	*
	* @return array $simple_schema_of_sections - Map of section_tipo → array of child tipos.
	*/
	public static function get_simple_schema_of_sections() : array {

		$all_sections = ontology_utils::get_ar_all_tipo_of_model_tipo('dd6');

		$simple_schema_of_sections = [];
		foreach ($all_sections as $current_section) {

			$real_section = section::get_section_real_tipo_static($current_section);

			$ar_children = ontology_node::get_ar_recursive_children(
				$real_section,
				false,
				null
			);
			$simple_schema_of_sections[$current_section] = $ar_children;
		}

		return $simple_schema_of_sections;
	}//end get_simple_schema_of_sections



	/**
	* BUILD_SIMPLE_SCHEMA_CHANGES
	* Diffs two ontology schema snapshots and returns only the sections that gained
	* new children since the old snapshot was taken.
	*
	* Each element of the returned array describes one section that has additions:
	*   { tipo: 'oh1', children_added: ['oh99', 'oh100'] }
	*
	* Sections that exist only in $old_schema (deletions) are intentionally ignored;
	* this method tracks additions only, as removals are considered separately.
	* Sections present in $new_schema but absent in $old_schema are also skipped
	* (they are new sections, not modified ones).
	*
	* @param array $old_schema - Map of section_tipo → children tipos before the update.
	* @param array $new_schema - Map of section_tipo → children tipos after the update.
	* @return array $simple_schema_changes - Array of stdClass objects, each with
	*   properties 'tipo' (string) and 'children_added' (array of string).
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
	* Lists the schema-change JSON files stored in DEDALO_BACKUP_PATH_ONTOLOGY/changes/,
	* sorted in reverse chronological order (most recent first).
	*
	* Files are named by convention as 'simple_schema_changes_YYYY-MM-DD_H-i-s.json'
	* (see save_simple_schema_file()). The reverse sort makes the most recent change
	* file the first element, which is convenient for diff browsing UIs.
	*
	* @return array $filenames - Indexed array of bare filenames (no directory prefix),
	*   e.g. ['simple_schema_changes_2026-06-01_12-00-00.json', …].
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
	* Reads and enriches a schema-change JSON file produced by save_simple_schema_file().
	*
	* Each entry in the file is a raw change record {tipo, children_added}. This method
	* enriches it with human-readable labels (via ontology_node::get_term_by_tipo()) and
	* resolves the parent chain (via ontology_node::get_ar_parents_of_this()) so the UI
	* can show full context without extra round-trips.
	*
	* The $filename is sanitised by sanitize_file_name() and basename() to prevent path
	* traversal attacks. The file is read from DEDALO_BACKUP_PATH_ONTOLOGY/changes/.
	*
	* Output shape (one element per changed section):
	* [
	*   {
	*     "section"  : {"tipo":"oh1", "label":"Oral History"},
	*     "parents"  : [{"tipo":"dd323","label":"Imaterial"}, …],
	*     "children" : [{"tipo":"oh2","label":"Identification"}, …]
	*   },
	*   …
	* ]
	*
	* @param string $filename - Bare filename (no path), e.g. 'simple_schema_changes_2026-06-01.json'.
	* @return array $changes - Array of enriched stdClass objects; empty array if file is
	*   missing, empty, or not valid JSON.
	*/
	public static function parse_simple_schema_changes_file( string $filename ) : array {

		// sanitize filename to prevent path traversal
			$filename = sanitize_file_name($filename);
			$filename = basename($filename); // strip any path components

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
					$section_item->label	= ontology_node::get_term_by_tipo($current_section->tipo, DEDALO_APPLICATION_LANG);

			// parents
				$parents		= [];
				$ontology_node	= ontology_node::get_instance($current_section->tipo);
				$parents_tipo	= $ontology_node->get_ar_parents_of_this();
				foreach ($parents_tipo as $parent_tipo) {

					$parent_item = new stdClass();
						$parent_item->tipo = $parent_tipo;
						$parent_item->label = ontology_node::get_term_by_tipo($parent_tipo, DEDALO_APPLICATION_LANG);

						$parents[] = $parent_item;
				}

			// children
				$children		= [];
				$children_tipo	= $current_section->children_added;
				foreach ($children_tipo as $child_tipo) {

					$child_item = new stdClass();
						$child_item->tipo = $child_tipo;
						$child_item->label = ontology_node::get_term_by_tipo($child_tipo, DEDALO_APPLICATION_LANG);

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
	* Compares an old ontology snapshot with the current state and persists the diff
	* as a JSON file on disk for later audit or UI review.
	*
	* This is the orchestration entry point for schema-change tracking. Typical call
	* sequence during an ontology upgrade:
	*   1. Capture $old = hierarchy::get_simple_schema_of_sections() BEFORE the update.
	*   2. Apply the ontology update.
	*   3. Call save_simple_schema_file({ old_simple_schema_of_sections: $old }) AFTER.
	*
	* The resulting JSON file is readable by parse_simple_schema_changes_file() and
	* listable via get_simple_schema_changes_files().
	*
	* @param object $options
	*   - old_simple_schema_of_sections array   Required. Pre-update schema snapshot.
	*   - name                          ?string  Output filename; defaults to
	*       'simple_schema_changes_YYYY-MM-DD_H-i-s.json'.
	*   - dir_path                      ?string  Output directory; defaults to
	*       DEDALO_BACKUP_PATH_ONTOLOGY . '/changes/'.
	* @return object $response
	*   - result   bool    true on success.
	*   - msg      string  Human-readable status.
	*   - filepath string  Absolute path to the written file (on success).
	*   - errors   array   Empty on success.
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
	* Resolves the typology locator for a hierarchy identified by its TLD.
	*
	* The typology (DEDALO_HIERARCHY_TYPOLOGY_TIPO = 'hierarchy9') is a component_select
	* inside the hierarchy1 record that classifies the hierarchy as Thematic, Toponymy,
	* Language, etc. Its value is a locator pointing to the 'hierarchytype' section row
	* that matches the classification.
	*
	* This method is used when the caller knows the TLD (e.g. 'es') but needs the full
	* typology locator rather than only the section_id.
	*
	* @param string $tld - Hierarchy TLD, e.g. 'es', 'ts', 'oh'.
	* @return object|null $typology_locator - A locator stdClass pointing to the typology
	*   entry (section_tipo/section_id in 'hierarchytype'), or null if the TLD or typology
	*   component is not found.
	*/
	public static function get_typology_locator_from_tld( string $tld ) : ?object {

		$hierarchy_row	= hierarchy::get_hierarchy_by_tld( $tld );
		$section_id		= $hierarchy_row->section_id;
		if( empty($section_id) ){
			return null;
		}

		$model = ontology_node::get_model_by_tipo( DEDALO_HIERARCHY_TYPOLOGY_TIPO );
		$typology_component = component_common::get_instance(
			$model, // string model
			DEDALO_HIERARCHY_TYPOLOGY_TIPO, // string tipo
			$section_id, // string section_id
			'list', // string mode
			DEDALO_DATA_NOLAN, // string lang
			DEDALO_HIERARCHY_SECTION_TIPO // string section_tipo
		);

		$typology_data = $typology_component->get_data();

		$typology_locator = $typology_data[0] ?? null;


		return $typology_locator;
	}//end get_typology_locator_from_tld



	/**
	* GET_ALL_MAIN_HIERARCHY_RECORDS
	* Returns all rows from 'matrix_hierarchy_main' (section_tipo = 'hierarchy1')
	* as raw record objects, regardless of active status.
	*
	* Conceptually the hierarchy counterpart of ontology::get_all_main_ontology_records(),
	* though that method does not exist under that name — this is an independent
	* implementation using an unconstrained SQO over 'hierarchy1' with no project filter.
	*
	* This is a heavy operation; prefer get_active_elements() for most use cases.
	* Logs an ERROR if the result set is empty, since at least one hierarchy record
	* is expected in a properly configured Dédalo instance.
	*
	* @return array $ar_records - Array of raw row objects from the search result;
	*   empty array only if the database has no hierarchy records.
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
			$db_result = $search->search();

		$ar_records = $db_result->fetch_all();

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
	* Returns all hierarchy records that have the 'Active' flag set to YES.
	*
	* Overrides ontology::get_active_elements() to query 'hierarchy1' instead of
	* 'ontology35', and to filter on hierarchy4 (Active radio button) instead of
	* the ontology equivalent. The SQO filter matches records whose hierarchy4
	* component value is a locator pointing to dd64/1 (the "Yes" value in the
	* dd_section_si_no section).
	*
	* Each matching row is passed through ontology::row_to_element() to produce the
	* normalised element object with properties such as target_section_tipo,
	* target_section_model_tipo, active_in_thesaurus, etc.
	*
	* Results are cached in $cache_hierarchy_elements. The cache is NOT bounded by
	* manage_cache_size() in the normal sense (it stores a single array value),
	* but is cleared by clear() between requests.
	*
	* @return array $active_hierarchies - Array of element objects; empty if no active
	*   hierarchies exist. Each element is a stdClass produced by row_to_element().
	* @test true
	*/
	public static function get_active_elements() : array {

		// cache
		if (!empty(self::$cache_hierarchy_elements)) {
			return self::$cache_hierarchy_elements;
		}

		// main filter
		$filter = (object)[
			'$and' => [
				(object)[
					'q' => (object)[
						'section_id'			=> '1',
						'section_tipo'			=> 'dd64',
						'from_component_tipo'	=> 'hierarchy4'
					],
					'q_operator' => null,
					'path' => [
						(object)[
							'name'				=> 'Active',
							'model'				=> 'component_radio_button',
							'section_tipo'		=> 'hierarchy1',
							'component_tipo'	=> 'hierarchy4'
						]
					]
				]
			]
		];

		// section tipo depends on the current class (hierarchy, ontology)
		$section_tipo = hierarchy::$main_section_tipo;

		$sqo = new search_query_object();
			$sqo->set_select([
				(object)['column' => 'section_tipo'],
				(object)['column' => 'section_id']
			]);
			$sqo->set_section_tipo( [$section_tipo] );
			$sqo->set_limit( 0 );
			$sqo->set_offset( 0 );
			$sqo->set_filter( $filter );

		$search = search::get_instance(
			$sqo // object sqo
		);
		$db_result = $search->search();

		// active_elements
		$active_elements = [];
		foreach ($db_result as $row) {
			$active_elements[] = ontology::row_to_element($row);
		}

		// cache
		self::$cache_hierarchy_elements = $active_elements;
		// Manage cache size to prevent memory leaks (using inherited method)
		self::manage_cache_size(self::$cache_hierarchy_elements);


		return $active_elements;
	}//end get_active_elements



	/**
	* CREATE_THESAURUS_GENERAL_TERM
	* Provisions the root display term for a hierarchy's thesaurus tree and registers
	* it in the portal component.
	*
	* The Dédalo thesaurus tree must have a single visible root term (the "General Term")
	* beneath which all other terms are arranged. This method creates that root term as
	* a new record in the target thesaurus section, sets its term value to the hierarchy's
	* display name, and saves its locator in the portal component on the hierarchy1 record.
	*
	* $general_term_tipo controls which portal receives the new term:
	*   'hierarchy45' — DEDALO_HIERARCHY_CHILDREN_TIPO: General Term portal (descriptor tree)
	*   'hierarchy59' — DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO: General Term Model portal (typology tree)
	*
	* The method is idempotent with respect to already-created terms: if the portal
	* already has data it returns false without creating a duplicate.
	*
	* @param string $section_tipo - The hierarchy section tipo, expected 'hierarchy1'.
	* @param string|int $section_id - The row id of the hierarchy1 record.
	* @param string $general_term_tipo - Portal tipo: 'hierarchy45' or 'hierarchy59'.
	* @return bool - true if the general term was successfully created and its term value
	*   set; false if validation fails, the portal already has data, or any step errors.
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

		$model		= ontology_node::get_model_by_tipo($general_term_tipo,true);
		$component	= component_common::get_instance(
			$model, // string model
			$general_term_tipo, // string tipo
			$section_id, // string section_id
			'list', // string mode
			DEDALO_DATA_NOLAN, // string lang
			$section_tipo // string section_tipo
		);

		$data = $component->get_data();
		if (!empty($data)) {
			// Already contains data. Skip creation
			return false;
		}

		// target_section_tipo. Get from component 'Target thesaurus' (hierarchy53)
		$target_tipo = $general_term_tipo==='hierarchy59'
			? DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO // hierarchy58 Model case
			: DEDALO_HIERARCHY_TARGET_SECTION_TIPO; // hierarchy58 Term case

		$target_model_name			= ontology_node::get_model_by_tipo($target_tipo, true);
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
		$component->save();
		$new_section_id = $response->section_id;

		// get current hierarchy name as 'Exhibition'
		$hierarchy_name = hierarchy::get_hierarchy_name($section_tipo, $section_id) ?? "General term from hierarchy $section_tipo - $section_id";

		// set new section 'Term' value based on current Hierarchy name as 'Exhibition'
		$set_term_value_result = hierarchy::set_term_value($target_section_tipo, $new_section_id, $hierarchy_name);


		return $set_term_value_result;
	}//end create_thesaurus_general_term



	/**
	* GET_HIERARCHY_NAME
	* Returns the display name of a hierarchy from its 'Name' component (hierarchy5).
	*
	* hierarchy5 is a component_input_text storing the human-readable title of the
	* hierarchy (e.g. "Spanish Thematic Thesaurus"). Used as the label for the
	* auto-created General Term when create_thesaurus_general_term() is called.
	*
	* Note: get_value() returns the raw scalar value without lang-based fallback;
	* the lang passed to get_instance() is DEDALO_DATA_NOLAN (language-neutral)
	* because hierarchy names are stored in the 'string' column, not multilang 'lang_data'.
	*
	* @param string $section_tipo - Expected 'hierarchy1'.
	* @param string|int $section_id - The row id of the hierarchy1 record.
	* @return string|null - The hierarchy name string, or null if not set.
	*/
	public static function get_hierarchy_name(  string $section_tipo, string|int $section_id ) : string|null {

		// Term name tipo (componentinput_text)
		$term_tipo = DEDALO_HIERARCHY_TERM_TIPO; // 'hierarchy5'

		$model = ontology_node::get_model_by_tipo($term_tipo,true);

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
	* Writes a string value to the 'term' component of a thesaurus record.
	*
	* The concrete term component tipo is resolved dynamically from the section_map
	* of $section_tipo (scope='thesaurus') rather than being hardcoded. This makes
	* the method work across all thesaurus section types without knowing the exact
	* component tipo in advance (it might be 'ts25', 'es25', etc., depending on the
	* thesaurus structure).
	*
	* The value is written using DEDALO_DATA_LANG, meaning it targets the
	* current application/data language; it is NOT stored as language-neutral.
	*
	* @param string $section_tipo - Target thesaurus section tipo, e.g. 'es1'.
	* @param string|int $section_id - Target record id within that section.
	* @param string $name - The term string to write.
	* @return bool - true if the component saved successfully; false if the term
	*   component tipo could not be resolved or the save failed.
	*/
	public static function set_term_value( string $section_tipo, string|int $section_id, string $name ) : bool {

		// section map resolution for term (write path: thesaurus scope, single tipo)
		$term_tipo = hierarchy::get_element_tipo_from_section_map( $section_tipo, 'term', 'thesaurus' );
		if (empty($term_tipo)) {
			debug_log(__METHOD__
				. " Section without section map definition or bad configured. 'term' is not resolved " . PHP_EOL
				. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
				. ' section_id: ' . to_string($section_id)
				, logger::ERROR
			);
			return false;
		}

		$model = ontology_node::get_model_by_tipo($term_tipo,true);

		$component = component_common::get_instance(
			$model, // string model
			$term_tipo, // string tipo
			$section_id, // string section_id
			'list', // string mode
			DEDALO_DATA_LANG, // string lang
			$section_tipo // string section_tipo
		);

		$component->set_data( [$name] );

		$save_result = $component->save();

		$result = empty($save_result) ? false : true;


		return $result;
	}//end set_term_value



	/**
	* SYNC_HIERARCHY_ACTIVE_STATUS
	* Deactivates hierarchy records whose 'Active in thesaurus' flag is false,
	* keeping the 'Active' (hierarchy4) flag in sync.
	*
	* Background: a hierarchy can be 'Active' (visible in admin lists) but not
	* 'Active in thesaurus' (excluded from public thesaurus navigation). Over time
	* this divergence creates a large number of apparently active but unused toponymy
	* and thematic hierarchies. This maintenance method resolves the mismatch by
	* setting 'Active' to NO for any hierarchy where active_in_thesaurus is false.
	*
	* Exceptions (hard-coded ignore list):
	*   'rsc197' — the 'People' hierarchy is intentionally kept active even when not
	*   displayed in the thesaurus, because it is used by other relation components.
	*
	* @return bool - true if all save operations succeeded (or there was nothing to do);
	*   false if one or more saves failed ($error_count > 0).
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
			$active_model	= ontology_node::get_model_by_tipo( $active_tipo );
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

			$component->set_data( [$locator] );

			$save_result = $component->save();
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
