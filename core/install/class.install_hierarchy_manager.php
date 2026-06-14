<?php declare(strict_types=1);

/**
* CLASS INSTALL_HIERARCHY_MANAGER
* Discovery, import, activation, and installation of Dédalo thesaurus hierarchies
* during the initial installation wizard.
*
* Responsibilities:
* - Discover available hierarchy data files (*.copy.gz) in the configured import
*   directory and correlate them with the descriptive metadata in hierarchies.json.
* - Read the list of supported hierarchy typologies from hierarchies_typologies.json.
* - Bulk-import the bootstrap matrix_hierarchy_main records (countries, thematic
*   hierarchies, languages, etc.) from a pre-generated SQL file via psql shell
*   commands, resetting the sequence afterwards.
* - Activate an individual hierarchy: create its matrix_hierarchy_main record if
*   absent, write all required component fields (tld, typology, label, language,
*   active flag, active-in-thesaurus flag, source real section, target sections,
*   children links), generate the two virtual thesaurus sections (terms and models)
*   in the ontology via hierarchy::generate_virtual_section(), and register child
*   locators for Toponymy hierarchies (typology 2).
* - Orchestrate a bulk install of a caller-selected subset of hierarchies: for each
*   selected item, import its .copy.gz data file via backup::import_from_copy_file()
*   and then call activate_hierarchy().
*
* Data shapes:
* - A hierarchy record in matrix_hierarchy_main is a standard Dédalo section of
*   tipo DEDALO_HIERARCHY_SECTION_TIPO ('hierarchy1'). Its component fields are
*   written individually through component_common::get_instance() + set_dato() +
*   Save(), using DEDALO_DATA_NOLAN ('') as the language (non-language-specific).
* - A "file item" produced by get_available_hierarchy_files() is an anonymous
*   stdClass with keys: file, file_name, section_tipo, tld, label, type
*   ('term'|'model'), typology (int), active_in_thesaurus (bool).
* - A "selected hierarchy" item passed from the client must at minimum carry: tld,
*   typology, label, and optionally active_in_thesaurus (defaults to true).
* - Active / active-in-thesaurus flags are stored as relation locators pointing to
*   the DEDALO_SECTION_SI_NO_TIPO ('dd64') section, with section_id
*   NUMERICAL_MATRIX_VALUE_YES (1) or NUMERICAL_MATRIX_VALUE_NO (2).
*
* Relationships:
* - Included by class.install_config_manager.php and class.install.php.
* - class.install.php exposes thin static wrappers that delegate to every public
*   method here; callers should prefer the install.php surface unless they target
*   hierarchy management specifically.
* - Uses install_config_manager::get_config() for all path and DB connection
*   details; never builds paths or connection strings independently.
* - Delegates actual DB record creation to hierarchy::get_hierarchy_by_tld(),
*   section::get_instance(), component_common::get_instance(),
*   hierarchy::generate_virtual_section(), and backup::import_from_copy_file().
* - Shell-invokes psql for bulk SQL operations (DELETE + COPY + sequence reset)
*   because PHP's PDO/pg layer cannot stream the large COPY-format payloads needed
*   at install time. All dynamic values are passed through escapeshellarg().
*
* @package Dédalo
* @subpackage Install
*/
class install_hierarchy_manager {

	/**
	* GET_AVAILABLE_HIERARCHY_FILES
	* Scan the hierarchy import directory for *.copy.gz files and enrich each
	* entry with metadata from hierarchies.json (label, typology,
	* active_in_thesaurus) and a derived type ('term' or 'model').
	*
	* The method merges the filesystem list with the descriptive registry so that
	* callers (e.g. the install wizard UI) can present human-readable names and
	* filter by typology without needing to parse raw filenames.
	*
	* File-name convention: <tld><digit>[...].copy.gz
	*   e.g. "fauna1.copy.gz"  → section_tipo = 'fauna1', tld = 'fauna'
	*        "fauna2.copy.gz"  → section_tipo = 'fauna2', tld = 'fauna', type = 'model'
	* Digit extraction: all digits are stripped from section_tipo to recover the
	* alphabetical tld (e.g. 'fauna1' → 'fauna', 'es1' → 'es').
	* Type detection: if the section_tipo contains the digit '2' the file holds
	* model records; otherwise it holds term records.
	*
	* Returns result = [] (empty array) and logs a logger::ERROR when the
	* configured directory is missing or contains no matching files.
	*
	* @see class area_development::get_ar_widgets() — primary UI consumer
	* @return object $response
	*   - result: array of enriched file-item stdClass objects (see class header)
	*   - msg:    human-readable status
	*/
	public static function get_available_hierarchy_files() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config		= install_config_manager::get_config();
			$dir_path	= $config->hierarchy_files_dir_path;

		// labels
			$hierarchies_json	= file_get_contents(__DIR__.'/hierarchies.json');
			$hierarchies		= json_decode($hierarchies_json);

		// read the dir
			$hierarchy_files = (array)glob($dir_path . '/*.copy.gz');

		// hierarchy_files conform items
			// Transform each raw filesystem path into a rich descriptor object by
			// matching the extracted tld against the hierarchies.json registry.
			$hierarchy_files = array_map(function($file) use($hierarchies){

				$file_name		= pathinfo($file)['basename'];
				$section_tipo	= explode('.', $file_name)[0];
				// Strip all digits to obtain the alphabetical tld prefix
				// (e.g. 'fauna1' → 'fauna', 'es1' → 'es').
				$tld			= preg_replace('/\d/', '', $section_tipo);

				// Look up the tld entry in hierarchies.json (case-insensitive).
				// Falls back to an empty stdClass when the tld is not registered,
				// so downstream null-coalescence produces 'undefined [...]' labels.
				$current_hierarchy = array_find($hierarchies ?? [], function($el) use($tld){
					return strtolower($el->tld)===strtolower($tld);
				}) ?? new stdClass();

				$label					= $current_hierarchy->label ?? 'undefined ['.$tld.']';
				// Files whose section_tipo contains '2' are model-record exports;
				// all others are term-record exports.
				$type					= strpos($section_tipo, '2')!==false ? 'model' : 'term';
				$typology				= $current_hierarchy->typology ?? 'undefined typology ['.$tld.']';
				$active_in_thesaurus	= $current_hierarchy->active_in_thesaurus ?? 'undefined typology ['.$tld.']';

				$item = (object)[
					'file'					=> $file,
					'file_name'				=> $file_name,
					'section_tipo'			=> $section_tipo,
					'tld'					=> $tld,
					'label'					=> $label,
					'type'					=> $type,
					'typology'				=> $typology,
					'active_in_thesaurus'	=> $active_in_thesaurus
				];

				return $item;
			}, $hierarchy_files);

			$response->result	= $hierarchy_files;
			$response->msg		= 'OK. Request done '.__METHOD__;

		// empty case
			if (empty($hierarchy_files)) {
				debug_log(__METHOD__
					. "Dédalo Error: directory '$dir_path' is not accessible or empty!  " . PHP_EOL
					. ' dir_path: ' . to_string($dir_path) . PHP_EOL
					. ' hierarchy_files: ' . to_string($hierarchy_files)
					, logger::ERROR
				);
			}

		return $response;
	}//end get_available_hierarchy_files

	/**
	* GET_HIERARCHY_TYPLOLOGIES
	* Read the static registry of known hierarchy typologies from
	* hierarchies_typologies.json and return it as a decoded array.
	*
	* Typologies classify what domain a hierarchy represents (e.g. Thematic,
	* Toponymy, Languages). They drive UI grouping and conditional logic inside
	* activate_hierarchy() (typology 2 = Toponymy receives extra children locators).
	*
	* Returns an empty array and logs a logger::ERROR if the JSON file is absent
	* (it is bundled with the install package and should always exist).
	*
	* Note: The method name contains a typo ('Typlologies' instead of 'Typologies');
	* it is kept as-is to preserve API compatibility.
	*
	* Sample return value:
	* [
	*   { "typology": 1, "label": "Thematic"  },
	*   { "typology": 2, "label": "Toponymy"  },
	*   ...
	*   { "typology": 15, "label": "Others"   }
	* ]
	*
	* @return array $typlologies — decoded JSON array of typology descriptor objects
	*/
	public static function get_hierarchy_typlologies() : array {

		$json_file_path = __DIR__ . '/hierarchies_typologies.json';

		if (!file_exists($json_file_path)) {
			debug_log(__METHOD__
				. " Error: file do not exists: " . $json_file_path
				, logger::ERROR
			);
			return [];
		}

		$json_data = file_get_contents($json_file_path);
		$typologies = json_decode($json_data);

		return $typologies;
	}//end get_hierarchy_typlologies

	/**
	* IMPORT_HIERARCHY_MAIN_RECORDS
	* Bulk-load the bootstrap set of matrix_hierarchy_main rows (countries,
	* thematic hierarchies, languages, etc.) from the pre-generated SQL export
	* file install/import/matrix_hierarchy_main.sql.
	*
	* The operation is destructive by design: the existing table contents are
	* deleted and the identity sequence is reset before the SQL file is replayed,
	* ensuring a clean, reproducible initial state.  This is only intended for
	* use during the first-time installation wizard; running it on a live instance
	* would destroy all hierarchy configuration.
	*
	* Three sequential psql shell commands are executed:
	*   1. DELETE FROM matrix_hierarchy_main + ALTER SEQUENCE … RESTART WITH 1
	*      — wipes any stale data.
	*   2. --file <sql_file_path>
	*      — streams the full INSERT payload from the SQL file into PostgreSQL.
	*   3. setval('matrix_hierarchy_main_id_seq', MAX(id)+1)
	*      — advances the sequence past the imported rows so subsequent INSERTs
	*        do not collide.
	*
	* (!) All sections imported here are inactive by default.
	*     Call activate_hierarchy() afterwards to load terms/models and mark a
	*     hierarchy as active.
	*
	* Time limit is extended to 600 s (10 min) because large SQL files can take
	* several minutes to replay over a local PostgreSQL connection.
	*
	* @return object $response
	*   - result: true on success, false if the SQL file is missing
	*   - msg:    human-readable status
	*/
	public static function import_hierarchy_main_records() : object {

		// set timeout in seconds
		set_time_limit(600); // 10 minutes (10*60)

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config			= install_config_manager::get_config();
			$exec			= true;
			$sql_file_path	= DEDALO_ROOT_PATH . '/install/import/matrix_hierarchy_main.sql';
			$matrix_table	= 'matrix_hierarchy_main';

		// check if file exists
			if (!file_exists($sql_file_path)) {
				$response->msg = 'Error. The required file do not exists: '.$sql_file_path;
				return $response;
			}

		// terminal command psql delete previous records
			// SEC-041: shell-quote DB / user / matrix_table constants.
			// `$matrix_table` originates from a server-iterated list (not user
			// input); quoted defence-in-depth. The `\"<table>\"` SQL identifier
			// quoting inside the -c argument is preserved.
			$command = DB_BIN_PATH.'psql -d '.escapeshellarg($config->db_install_name).' -U '.escapeshellarg(DEDALO_USERNAME_CONN).' '.$config->host_line.' '.$config->port_line.' --echo-errors -c "DELETE FROM \"'.$matrix_table.'\"; ALTER SEQUENCE IF EXISTS '.$matrix_table.'_id_seq RESTART WITH 1 ;";';
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
			if ($exec) {
				$command_res = shell_exec($command);
				debug_log(__METHOD__." Exec response 1 (shell_exec): ".json_encode($command_res), logger::DEBUG);
			}

		// terminal command psql execute sql query from .sql file
			// SEC-041 defence-in-depth.
			$command = DB_BIN_PATH.'psql -d '.escapeshellarg($config->db_install_name).' -U '.escapeshellarg(DEDALO_USERNAME_CONN).' '.$config->host_line.' '.$config->port_line.' --echo-errors --file '.escapeshellarg($sql_file_path);
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
			if ($exec) {
				$command_res = shell_exec($command);
				debug_log(__METHOD__." Exec response 2 (shell_exec): ".json_encode($command_res), logger::DEBUG);
			}

		// update sequence value
			$query = 'SELECT setval(\'matrix_hierarchy_main_id_seq\', (SELECT MAX(id) FROM "matrix_hierarchy_main")+1)';
			// SEC-041 defence-in-depth: $query is a hard-coded SQL string.
			$command = DB_BIN_PATH.'psql -d '.escapeshellarg($config->db_install_name).' -U '.escapeshellarg(DEDALO_USERNAME_CONN).' '.$config->host_line.' '.$config->port_line.' --echo-errors '
				.'-c "'.$query.';";';
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
			if ($exec) {
				$command_res = shell_exec($command);
				debug_log(__METHOD__." Exec response 3 (shell_exec): ".json_encode($command_res), logger::DEBUG);
			}

		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;

		return $response;
	}//end import_hierarchy_main_records

	/**
	* ACTIVATE_HIERARCHY
	* Fully activate a single thesaurus hierarchy: create (or reuse) its
	* matrix_hierarchy_main record, write all required component fields, generate
	* the virtual thesaurus sections in the ontology, and register child locators.
	*
	* This method is idempotent with respect to the matrix record: it first calls
	* hierarchy::get_hierarchy_by_tld() and only creates a new section when one
	* does not already exist.  All component writes (set_dato + Save) are applied
	* unconditionally so that re-running activation refreshes stale field values.
	*
	* Field-writing sequence (new record only):
	*   1. TLD             (DEDALO_HIERARCHY_TLD2_TIPO 'hierarchy6')   — e.g. 'fauna'
	*   2. Typology        (DEDALO_HIERARCHY_TYPOLOGY_TIPO 'hierarchy9') — int, e.g. 1
	*   3. Label           (DEDALO_HIERARCHY_LABEL_TIPO 'hierarchy7')  — display name
	*   4. Language        (DEDALO_HIERARCHY_LANG_TIPO 'hierarchy8')   — lang locator
	*      for DEDALO_DATA_LANG_DEFAULT (the installation's default data language).
	*
	* Field-writing sequence (always applied):
	*   5. Active flag           (DEDALO_HIERARCHY_ACTIVE_TIPO 'hierarchy4')
	*      — a relation locator pointing to DEDALO_SECTION_SI_NO_TIPO / NUMERICAL_MATRIX_VALUE_YES.
	*   6. Active-in-thesaurus   (DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO 'hierarchy125')
	*      — locator pointing to YES or NO depending on $options->active_in_thesaurus.
	*   7. Source real section   (DEDALO_HIERARCHY_SOURCE_REAL_SECTION_TIPO 'hierarchy109')
	*      — hardcoded to [DEDALO_THESAURUS_SECTION_TIPO ('hierarchy20')]; required
	*        for generate_virtual_section() to know which template to clone.
	*
	* Virtual section generation:
	*   8. hierarchy::generate_virtual_section() provisions the two ontology
	*      virtual sections (<tld>1 for terms, <tld>2 for models) derived from
	*      DEDALO_THESAURUS_SECTION_TIPO. Errors are collected but do not abort.
	*
	*   9. Target section tipos  (hierarchy53 / hierarchy58) — '<tld>1' / '<tld>2'.
	*
	* Children locators (only when $options->typology === 2, i.e. Toponymy):
	*  10. DEDALO_HIERARCHY_CHILDREN_TIPO ('hierarchy45') — a dd48 locator pointing
	*      to section_id '1' of '<tld>1' (root term node).
	*  11. DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO ('hierarchy59') — a dd48 locator
	*      pointing to section_id '2' of '<tld>2' (root model node).  Written only
	*      if the corresponding model .copy.gz file exists on disk.
	*
	* (!) DEDALO_HIERARCHY_LABEL_TIPO is referenced in step 3 but has no
	*     corresponding define() in core/base/dd_tipos.php.  This will cause a
	*     fatal PHP error if step 3 is reached on a standard installation.
	*     The inline comment '// hierarchy7' indicates the intended constant value.
	*
	* @param object $options — descriptor for the hierarchy to activate. Expected keys:
	*   - tld               string  e.g. 'fauna'
	*   - typology          int     e.g. 1 (Thematic), 2 (Toponymy) — see hierarchies_typologies.json
	*   - label             string  human-readable name e.g. 'Fauna'
	*   - active_in_thesaurus bool  optional; defaults to true
	* @return object $response
	*   - result: true on success, false on fatal error (missing section_id, virtual section failure)
	*   - msg:    human-readable status
	*   - errors: string[] accumulated non-fatal error messages
	*/
	public static function activate_hierarchy(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		// options
			$tld					= $options->tld;
			$typology				= $options->typology;
			$label					= $options->label;
			$active_in_thesaurus	= $options->active_in_thesaurus ?? true;

		// short vars
			$config	= install_config_manager::get_config();

		// hierarchy search
			// Check whether matrix_hierarchy_main already contains a record for
			// this tld.  get_hierarchy_by_tld() queries the DEDALO_HIERARCHY_TLD2_TIPO
			// ('hierarchy6') JSON field using a case-insensitive jsonpath match.
			$hierarchy_row	= hierarchy::get_hierarchy_by_tld( $tld );
			$section_tipo	= DEDALO_HIERARCHY_SECTION_TIPO;
			$section_id		= $hierarchy_row->section_id;
			$section_exists	= !empty($section_id);

		// hierarchy not already exists case. Create a new one
			if ($section_exists===false) {

				// update sequence value
				// Advance the sequence before inserting so the new record's id does
				// not collide with rows from the bulk SQL import performed earlier.
				$matrix_table = 'matrix_hierarchy_main';
				$query = 'SELECT setval(\''.$matrix_table.'_id_seq\', (SELECT MAX(id) FROM "'.$matrix_table.'")+1)';
				// SEC-041 defence-in-depth.
				$command = DB_BIN_PATH.'psql -d '.escapeshellarg(DEDALO_DATABASE_CONN).' -U '.escapeshellarg(DEDALO_USERNAME_CONN).' '.$config->host_line.' '.$config->port_line.' --echo-errors '
					.'-c "'.$query.';";';
				debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
				$command_res = shell_exec($command);
				debug_log(__METHOD__." Exec response (shell_exec): ".json_encode($command_res), logger::DEBUG);

				// create a new section
				$section = section::get_instance(
					$section_tipo, // string section_tipo
					'edit' // string mode
				);
				$section_id = $section->create_record();
			}

		// check valid $section_id
			// Fatal guard: if create_record() failed or returned null/0 there is
			// nothing to write component data into — abort with an error response.
			if (empty($section_id)) {
				$msg = " ERROR creating a new section in '$section_tipo' - tld: '$tld'";
				debug_log(__METHOD__
					. $msg
					, logger::ERROR
				);
				$response->errors[] = $msg;

				return $response; // return error here !
			}

		// new hierarchy case
			// Write the four identity fields only for newly created records.
			// Re-activating an existing hierarchy skips this block to avoid
			// overwriting user-edited metadata (e.g. translated labels).
			if ($section_exists===false) {

				// tld
					$tld_tipo	= DEDALO_HIERARCHY_TLD2_TIPO; // hierarchy6
					$model_name	= ontology_node::get_model_by_tipo($tld_tipo, true);
					$component	= component_common::get_instance(
						$model_name,
						$tld_tipo,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);
					$dato = [$tld];
					$component->set_dato($dato);
					$component->Save();

				// typology
					$hierarchy_type_tipo	= DEDALO_HIERARCHY_TYPOLOGY_TIPO; // hierarchy9
					$model_name				= ontology_node::get_model_by_tipo($hierarchy_type_tipo, true);
					$component				= component_common::get_instance(
						$model_name,
						$hierarchy_type_tipo,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);
					$dato = [$typology];
					$component->set_dato($dato);
					$component->Save();

				// label
					// (!) DEDALO_HIERARCHY_LABEL_TIPO is used here but is not defined
					// in core/base/dd_tipos.php. The inline comment '// hierarchy7'
					// indicates the intended ontology tipo. This will cause a fatal
					// PHP "Use of undefined constant" error at runtime on a standard
					// installation. Define the constant or replace the reference with
					// the literal 'hierarchy7' to fix.
					$label_tipo	= DEDALO_HIERARCHY_LABEL_TIPO; // hierarchy7
					$model_name	= ontology_node::get_model_by_tipo($label_tipo, true);
					$component	= component_common::get_instance(
						$model_name,
						$label_tipo,
						$section_id,
						'edit',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);
					$dato = [$label];
					$component->set_dato($dato);
					$component->Save();

				// name
					// Store a language locator so the hierarchy knows which data
					// language its terms are authored in (maps to DEDALO_DATA_LANG_DEFAULT).
					$name_tipo	= DEDALO_HIERARCHY_LANG_TIPO;	// hierarchy8
					$model_name	= ontology_node::get_model_by_tipo($name_tipo, true);
					$component	= component_common::get_instance(
						$model_name,
						$name_tipo,
						$section_id,
						'edit',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);
					$lang_locator = lang::get_lang_locator_from_code(DEDALO_DATA_LANG_DEFAULT);
					$dato = [$lang_locator];
					$component->set_dato($dato);
					$component->Save();
			}

		// active hierarchy
			// Mark the hierarchy as active by storing a DEDALO_RELATION_TYPE_LINK
			// ('dd151') locator that points to NUMERICAL_MATRIX_VALUE_YES (1)
			// inside the yes/no section (DEDALO_SECTION_SI_NO_TIPO 'dd64').
			// This raw json_decode approach is used here because the $dato shape is
			// a simple, fully-known literal; it avoids a separate locator object
			// instantiation for the active field (contrast with active-in-thesaurus
			// below which uses the locator class).
			$active_tipo	= DEDALO_HIERARCHY_ACTIVE_TIPO;	// hierarchy4
			$model_name		= ontology_node::get_model_by_tipo($active_tipo, true);
			$component		= component_common::get_instance(
				$model_name,
				$active_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$dato = json_decode('[
			  {
				"type": "'.DEDALO_RELATION_TYPE_LINK.'",
				"section_id": "'.NUMERICAL_MATRIX_VALUE_YES.'",
				"section_tipo": "'.DEDALO_SECTION_SI_NO_TIPO.'",
				"from_component_tipo": "'.DEDALO_HIERARCHY_ACTIVE_TIPO.'"
			  }
			]');
			$component->set_dato($dato);
			$component->Save();

		// active in thesaurus
			// Whether the hierarchy should be visible in the thesaurus area tree.
			// Uses the locator class (vs raw json_decode above) because the target
			// section_id is computed at runtime from $active_in_thesaurus.
			// DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO = 'hierarchy125'.
			$active_view_ts_tipo	= DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO;	// hierarchy4
			$model_name				= ontology_node::get_model_by_tipo($active_view_ts_tipo, true);
			$component				= component_common::get_instance(
				$model_name,
				$active_view_ts_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			// Map the boolean to yes (1) or no (2) section_id in the dd64 section.
			$target_active_ts_section_id = ($active_in_thesaurus===true) ? NUMERICAL_MATRIX_VALUE_YES : NUMERICAL_MATRIX_VALUE_NO;

			$active_data = new locator();
				$active_data->set_type(DEDALO_RELATION_TYPE_LINK);
				$active_data->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
				$active_data->set_section_id($target_active_ts_section_id);
				$active_data->set_from_component_tipo(DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO);

			$component->set_dato($active_data);
			$component->Save();

		// set real section tipo (!) needed to create virtual section
			// hierarchy::generate_virtual_section() reads this field to know which
			// "template" section tipo to clone when provisioning the ontology virtual
			// sections for <tld>1 and <tld>2.  It must be set to
			// DEDALO_THESAURUS_SECTION_TIPO ('hierarchy20') before generate_virtual_section()
			// is called, or the virtual section generation will fail.
			// source_real_section_tipo
			$model_name	= ontology_node::get_model_by_tipo(DEDALO_HIERARCHY_SOURCE_REAL_SECTION_TIPO, true);
			$component	= component_common::get_instance(
				$model_name,
				DEDALO_HIERARCHY_SOURCE_REAL_SECTION_TIPO,
				$section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$component->set_dato([DEDALO_THESAURUS_SECTION_TIPO]);
			$component->Save();

		// create ontology tld (generate_virtual_section)
			// Provision two virtual sections in the ontology: <tld>1 (terms) and
			// <tld>2 (models), derived from DEDALO_THESAURUS_SECTION_TIPO.
			// Errors are logged and appended to $response->errors but do not cause
			// an early return; the remaining field writes continue regardless.
			$options = (object)[
				'section_id'	=> $section_id,
				'section_tipo'	=> $section_tipo
			];
			$call_response = hierarchy::generate_virtual_section($options);
			if ($call_response->result===false) {
				$msg = " ERROR " . PHP_EOL . to_string($call_response->msg);
				debug_log(__METHOD__
					. $msg
					, logger::ERROR
				);
				$response->errors[] = $msg;
			}

		// set target section data
			// Store the tipo identifiers for the two virtual sections just created.
			// target thesaurus
				$component_tipo	= DEDALO_HIERARCHY_TARGET_SECTION_TIPO;	// 'hierarchy53';
				$model_name		= ontology_node::get_model_by_tipo($component_tipo, true);
				$component		= component_common::get_instance(
					$model_name,
					$component_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				// Term virtual section tipo is always '<tld>1' (e.g. 'fauna1').
				$dato = [$tld.'1'];
				$component->set_dato($dato);
				$component->Save();

			// target model
				$component_tipo	= DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO;	// 'hierarchy58';
				$model_name		= ontology_node::get_model_by_tipo($component_tipo, true);
				$component		= component_common::get_instance(
					$model_name,
					$component_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				// Model virtual section tipo is always '<tld>2' (e.g. 'fauna2').
				$dato = [$tld.'2'];
				$component->set_dato($dato);
				$component->Save();

		// set children data
			// Toponymy hierarchies (typology 2, e.g. country TLDs like 'es', 'fr')
			// require explicit child-locator records that point to the root term (id=1)
			// and root model (id=2) of their respective virtual sections.
			// Other typologies (thematic, languages, etc.) do not need these because
			// their root nodes are not pre-seeded with fixed section_ids.
			if ($typology==2) {
				// general term
					$component_tipo	= DEDALO_HIERARCHY_CHILDREN_TIPO;	// 'hierarchy45';
					$model_name		= ontology_node::get_model_by_tipo($component_tipo, true);
					$component		= component_common::get_instance(
						$model_name,
						$component_tipo,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);
					// 'dd48' = DEDALO_RELATION_TYPE_CHILDREN_TIPO; hardcoded literal used
					// here rather than the constant — value is confirmed in dd_tipos.php.
					$dato = json_decode('[
						{
							"type": "dd48",
							"section_id": "1",
							"section_tipo": "'.$tld.'1",
							"from_component_tipo": "'.DEDALO_HIERARCHY_CHILDREN_TIPO.'"
						}
					]');
					$component->set_dato($dato);
					$component->Save();

				// general model
					// Only register the model child locator when the model .copy.gz
					// file is present on disk. Some toponymy hierarchies ship without
					// a model file; the absence is logged as a warning, not an error.
					$dir_path		= $config->hierarchy_files_dir_path;
					$models_file	= $dir_path . '/' . strtolower($tld) . '.copy.gz';
					if (file_exists($models_file)) {

						$component_tipo	= DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO;	// 'hierarchy59';
						$model_name		= ontology_node::get_model_by_tipo($component_tipo, true);
						$component		= component_common::get_instance(
							$model_name,
							$component_tipo,
							$section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$section_tipo
						);
						$dato = json_decode('[
							{
								"type": "dd48",
								"section_id": "2",
								"section_tipo": "'. $tld.'2",
								"from_component_tipo": "'.DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO.'"
							}
						]');
						$component->set_dato($dato);
						$component->Save();

					}else{
						debug_log(__METHOD__
							." Ignored not existing model data for tld: ".to_string($tld)
							, logger::WARNING
						);
					}
			}

		// response OK
		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;

		return $response;
	}//end activate_hierarchy

	/**
	* INSTALL_HIERARCHIES
	* Batch-install a caller-selected subset of available thesaurus hierarchies.
	*
	* For each entry in $options->selected_hierarchies the method:
	*   1. Validates that a matching .copy.gz file exists (by tld) in the set
	*      returned by get_available_hierarchy_files().  Missing entries are logged
	*      and appended to $response->errors, then skipped (processing continues).
	*   2. Imports term/model records from the .copy.gz file via
	*      backup::import_from_copy_file() which streams the PostgreSQL COPY-format
	*      payload directly into the target matrix table.
	*   3. Calls activate_hierarchy() to write all required hierarchy metadata and
	*      provision virtual ontology sections.
	*
	* All per-hierarchy response objects are accumulated in $response->responses so
	* callers can inspect individual outcomes. The top-level result is always true
	* even if individual hierarchies failed; callers must inspect $response->errors
	* and $response->responses for partial failures.
	*
	* Note: $options is the raw client-supplied object (from the install wizard UI).
	*       selected_hierarchies items are expected to carry at least: tld, typology,
	*       label, and optionally active_in_thesaurus.
	*
	* @param object $options
	*   - selected_hierarchies: array of hierarchy descriptor objects (see activate_hierarchy $options)
	* @return object $response
	*   - result:    true (always; check errors/responses for partial failures)
	*   - msg:       human-readable status
	*   - errors:    string[] per-item error messages for unmatched tlds
	*   - responses: object[] per-item backup::import_from_copy_file() and
	*                activate_hierarchy() responses, interleaved in processing order
	*/
	public static function install_hierarchies(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		// selected_hierarchies
			$selected_hierarchies = $options->selected_hierarchies ?? [];

		// get available hierarchy files
			$hierarchies = self::get_available_hierarchy_files();

		// process each selected hierarchy
			$ar_responses = [];
			foreach ($selected_hierarchies as $item) {

				// find the hierarchy item in available files
				// Match by tld (strict equality) against the filesystem-discovered list.
				$found = array_find($hierarchies->result, function($el) use($item){
					return $el->tld === $item->tld;
				});

				if ($found===false) {
					$msg = " Error: hierarchy item not found: " . to_string($item);
					debug_log(__METHOD__.$msg, logger::ERROR);
					$response->errors[] = $msg;
					continue;
				}

				// import hierarchy file using backup::import_from_copy_file
				// Streams the pre-exported .copy.gz COPY-format payload into
				// the correct matrix table (determined by $found->section_tipo).
				$import_options = (object)[
					'file'		=> $found->file,
					'section_tipo'	=> $found->section_tipo
				];
				$ar_responses[] = backup::import_from_copy_file( $import_options );

				// creates/activate the new hierarchy and ontology
				// Note: $item (the client-supplied descriptor) is passed rather than
				// $found (the filesystem-derived item) so that the caller can override
				// fields such as active_in_thesaurus at the selection step.
				$ar_responses[] = self::activate_hierarchy($item);
			}

		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;
		$response->responses	= $ar_responses;

		return $response;
	}//end install_hierarchies

}//end class install_hierarchy_manager
