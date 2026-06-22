<?php declare(strict_types=1);

/**
* CLASS INSTALLER_HIERARCHY_MANAGER
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
*   written individually through component_common::get_instance() + set_data() +
*   save(). Most fields use DEDALO_DATA_NOLAN ('lg-nolan') as the language
*   (non-language-specific); the translatable term/name (hierarchy5) is written in
*   DEDALO_DATA_LANG_DEFAULT.
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
* - Included by class.installer_config_manager.php and class.installer.php.
* - class.installer.php exposes thin static wrappers that delegate to every public
*   method here; callers should prefer the install.php surface unless they target
*   hierarchy management specifically.
* - Uses installer_config_manager::get_config() for all path and DB connection
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
final class installer_hierarchy_manager {

	/**
	* CONSTRUCTOR
	* Static-only utility: instantiation is disallowed.
	*/
	private function __construct() {}


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
			$config		= installer_config_manager::get_config();
			$dir_path	= $config->hierarchy_files_dir_path;

		// labels
			// Guard the read: an unguarded file_get_contents() on a missing/unreadable
			// file emits an E_WARNING that Error::captureError() promotes into
			// $_ENV['DEDALO_LAST_ERROR'], which the API layer reports to the client as a
			// (phantom) server error — failing the whole install. Mirror the defensive
			// file_exists() check already used by get_hierarchy_typlologies().
			$hierarchies_json_path	= __DIR__.'/hierarchies.json';
			$hierarchies			= [];
			if (is_file($hierarchies_json_path) && is_readable($hierarchies_json_path)) {
				$hierarchies_json	= file_get_contents($hierarchies_json_path);
				$decoded			= json_decode($hierarchies_json);
				$hierarchies		= is_array($decoded) ? $decoded : [];
			} else {
				debug_log(__METHOD__
					. " Error: hierarchies.json missing or unreadable: " . $hierarchies_json_path
					, logger::ERROR
				);
			}

		// read the dir
		// PER-FILE VERIFICATION: keep only entries that are real, readable files on disk, so the
		// available list can never offer a hierarchy whose data file is missing/unreadable.
			$hierarchy_files = array_values(array_filter(
				(array)glob($dir_path . '/*.copy.gz'),
				static function($f) { return is_string($f) && is_file($f) && is_readable($f); }
			));

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
					return strtolower($el->tld ?? '')===strtolower($tld);
				}) ?? new stdClass();

				$label					= $current_hierarchy->label ?? 'undefined ['.$tld.']';
				// The numeric SUFFIX of section_tipo selects the record type:
				// '<tld>1' → term records, '<tld>2' → model records. Match the trailing
				// digit only (not any '2' elsewhere) so tld names can't be misclassified.
				$type					= (preg_match('/(\d+)$/', $section_tipo, $m_type) && $m_type[1]==='2') ? 'model' : 'term';
				$typology				= $current_hierarchy->typology ?? 'undefined typology ['.$tld.']';
				$active_in_thesaurus	= $current_hierarchy->active_in_thesaurus ?? 'undefined active_in_thesaurus ['.$tld.']';

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

		// Harden the declared ': array' contract: a failed read (false) or malformed
		// JSON (null) — or a JSON object — would otherwise raise a TypeError on return.
		if (!is_array($typologies)) {
			debug_log(__METHOD__
				. " Error: hierarchies_typologies.json did not decode to an array: " . $json_file_path
				, logger::ERROR
			);
			return [];
		}

		return $typologies;
	}//end get_hierarchy_typlologies

	/**
	* BUILD_MATRIX_HIERARCHY_MAIN_SQL
	* Regenerates the bootstrap export file install/import/matrix_hierarchy_main.sql that
	* import_hierarchy_main_records() later replays into a fresh install. This is the on-demand
	* generator — run by a maintainer when the canonical hierarchy set or the table schema
	* changes. build_install_version() imports whatever file is committed; it does NOT call this.
	*
	* Source of truth: the current database (DEDALO_DATABASE_CONN). Each matrix_hierarchy_main
	* row is:
	*  1. FILTERED by its TLD (string->'hierarchy6') against the to_install allow-list
	*     (core/installer/hierarchies_to_install.json, matched case-insensitively) — only the shipped
	*     hierarchies are kept; project/dev/test ones (TLDTEST, UNITTEST, …) are dropped.
	*  2. DEACTIVATED — the active flags hierarchy4 (active) and hierarchy125 (active-in-thesaurus)
	*     are set to NUMERICAL_MATRIX_VALUE_NO so every shipped hierarchy is inactive by default
	*     (the install wizard activates the selected ones).
	*  3. Rendered as an INSERT statement (current v7 column set), value-escaped via
	*     pg_escape_literal so JSONB payloads round-trip safely.
	*
	* The file is pure INSERTs (no DELETE / sequence reset — import_hierarchy_main_records()
	* does that around the replay).
	*
	* @return object $response
	*   - result: true on success, false on failure
	*   - msg:    human-readable status (includes the row count written)
	*   - errors: non-fatal warnings (e.g. to_install entries with no matching record)
	*/
	public static function build_matrix_hierarchy_main_sql() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		// load to_install TLD allow-list (matched case-insensitively)
			$to_install_file = __DIR__.'/hierarchies_to_install.json';
			if (!file_exists($to_install_file)) {
				$response->msg = 'Error. Missing to_install list: '.$to_install_file;
				debug_log(__METHOD__.' '.$response->msg, logger::ERROR);
				return $response;
			}
			$to_install = json_decode((string)file_get_contents($to_install_file));
			if (!is_array($to_install) || empty($to_install)) {
				$response->msg = 'Error. to_install list is empty or invalid JSON';
				debug_log(__METHOD__.' '.$response->msg, logger::ERROR);
				return $response;
			}
			$allow = [];
			foreach ($to_install as $t) {
				$allow[strtoupper((string)$t)] = true;
			}

		// source connection
			$conn = DBi::_getConnection();

		// Deactivate active flags (hierarchy4, hierarchy125 → NO) and expose the TLD for filtering.
		// jsonb_set rewrites each array element's section_id; rows lacking the key are untouched.
		// Component tipos and the NO value come from constants (no magic strings).
			$no		= '"'.NUMERICAL_MATRIX_VALUE_NO.'"';				// JSON string, e.g. "2"
			$h_act	= DEDALO_HIERARCHY_ACTIVE_TIPO;					// hierarchy4
			$h_ait	= DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO;		// hierarchy125
			$h_tld	= DEDALO_HIERARCHY_TLD2_TIPO;					// hierarchy6
			$sql = "
				WITH d1 AS (
					SELECT m.*,
						CASE WHEN relation ? '$h_act'
							THEN jsonb_set(relation,'{".$h_act."}',(SELECT jsonb_agg(jsonb_set(e,'{section_id}','$no')) FROM jsonb_array_elements(relation->'$h_act') e))
							ELSE relation END AS rel1
					FROM matrix_hierarchy_main m
				),
				d2 AS (
					SELECT d1.*,
						CASE WHEN rel1 ? '$h_ait'
							THEN jsonb_set(rel1,'{".$h_ait."}',(SELECT jsonb_agg(jsonb_set(e,'{section_id}','$no')) FROM jsonb_array_elements(rel1->'$h_ait') e))
							ELSE rel1 END AS rel2
					FROM d1
				)
				SELECT
					id, section_id, section_tipo,
					upper(string->'$h_tld'->0->>'value') AS tld,
					data::text AS data, rel2::text AS relation, string::text AS string, date::text AS date,
					iri::text AS iri, geo::text AS geo, number::text AS number, media::text AS media,
					misc::text AS misc, relation_search::text AS relation_search, meta::text AS meta
				FROM d2 ORDER BY id;
			";
			$result = pg_query($conn, $sql);
			if ($result===false) {
				$response->msg = 'Error on db execution: '.pg_last_error($conn);
				debug_log(__METHOD__.' '.$response->msg, logger::ERROR);
				return $response;
			}

		// Build INSERTs for rows whose TLD is allow-listed.
			$cols		= ['id','section_id','section_tipo','data','relation','string','date','iri','geo','number','media','misc','relation_search','meta'];
			$int_cols	= ['id','section_id'];
			$lines		= [];
			$seen_tld	= [];
			while ($row = pg_fetch_assoc($result)) {
				$tld = strtoupper((string)($row['tld'] ?? ''));
				if ($tld==='' || !isset($allow[$tld])) {
					continue; // not shipped: project/dev/test hierarchy
				}
				$seen_tld[$tld] = true;
				$vals = [];
				foreach ($cols as $c) {
					$v = $row[$c];
					if ($v===null) {
						$vals[] = 'NULL';
					} elseif (in_array($c, $int_cols, true)) {
						$vals[] = (string)(int)$v;					// integer columns: unquoted
					} else {
						$vals[] = pg_escape_literal($conn, $v);		// text/jsonb: safely quoted
					}
				}
				$lines[] = 'INSERT INTO "matrix_hierarchy_main" ("'.implode('","', $cols).'") VALUES ('.implode(',', $vals).');';
			}

			if (empty($lines)) {
				$response->msg = 'Error. No matrix_hierarchy_main rows matched the to_install list';
				debug_log(__METHOD__.' '.$response->msg, logger::ERROR);
				return $response;
			}

		// Informational: allow-list entries that matched no record.
			foreach ($allow as $tld => $unused) {
				if (!isset($seen_tld[$tld])) {
					$response->errors[] = 'to_install TLD with no record: '.$tld;
				}
			}

		// Write the file (header + pure INSERTs).
			$file_path	= DEDALO_ROOT_PATH.'/install/import/matrix_hierarchy_main.sql';
			$header		= '-- matrix_hierarchy_main install seed (v7 schema).'.PHP_EOL
				. '-- Auto-generated by '.__METHOD__.' from '.DEDALO_DATABASE_CONN.'.'.PHP_EOL
				. '-- Filtered by core/installer/hierarchies_to_install.json; all hierarchies shipped INACTIVE'.PHP_EOL
				. '-- (hierarchy4 / hierarchy125 = NUMERICAL_MATRIX_VALUE_NO). Do not hand-edit.'.PHP_EOL;
			$content	= $header.implode(PHP_EOL, $lines).PHP_EOL;
			if (file_put_contents($file_path, $content)===false) {
				$response->msg = 'Error. Could not write '.$file_path;
				debug_log(__METHOD__.' '.$response->msg, logger::ERROR);
				return $response;
			}

		$response->result	= true;
		$response->msg		= 'OK. Wrote '.count($lines).' rows to '.$file_path;
		debug_log(__METHOD__.' '.$response->msg, logger::WARNING);

		return $response;
	}//end build_matrix_hierarchy_main_sql

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
			$config			= installer_config_manager::get_config();
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
			$command = system::get_pg_bin_path().'psql -d '.escapeshellarg($config->db_install_name).' -U '.escapeshellarg(DEDALO_USERNAME_CONN).' '.$config->host_line.' '.$config->port_line.' --echo-errors -c "DELETE FROM \"'.$matrix_table.'\"; ALTER SEQUENCE IF EXISTS '.$matrix_table.'_id_seq RESTART WITH 1 ;";';
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
			if ($exec) {
				$command_res = installer_config_manager::pg_shell_exec($command);
				debug_log(__METHOD__." Exec response 1 (shell_exec): ".json_encode($command_res), logger::DEBUG);
			}

		// terminal command psql execute sql query from .sql file
			// SEC-041 defence-in-depth. ON_ERROR_STOP=1 makes psql exit non-zero on the first
			// SQL error, and DBi::pg_exec surfaces that exit code (PGPASSWORD auth, remote-safe).
			// Previously this used a shell_exec whose result was never inspected, so a failed
			// import (e.g. a stale .sql with obsolete columns) silently shipped an EMPTY table.
			$command = system::get_pg_bin_path().'psql -d '.escapeshellarg($config->db_install_name).' -U '.escapeshellarg(DEDALO_USERNAME_CONN).' '.$config->host_line.' '.$config->port_line.' -v ON_ERROR_STOP=1 --echo-errors --file '.escapeshellarg($sql_file_path);
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
			if ($exec) {
				$output			= [];
				$result_code	= 0;
				DBi::pg_exec($command, $output, $result_code);
				debug_log(__METHOD__." Exec response 2 (exec) code: ".$result_code.PHP_EOL.json_encode($output), logger::DEBUG);
				if ($result_code !== 0) {
					$msg = ' Error importing '.$sql_file_path.' (psql exit code '.$result_code.')';
					debug_log(__METHOD__.$msg.PHP_EOL.to_string($output), logger::ERROR);
					$response->msg = $msg;
					return $response;
				}
			}

		// update sequence value
			$query = 'SELECT setval(\'matrix_hierarchy_main_id_seq\', (SELECT MAX(id) FROM "matrix_hierarchy_main")+1)';
			// SEC-041 defence-in-depth: $query is a hard-coded SQL string.
			$command = system::get_pg_bin_path().'psql -d '.escapeshellarg($config->db_install_name).' -U '.escapeshellarg(DEDALO_USERNAME_CONN).' '.$config->host_line.' '.$config->port_line.' --echo-errors '
				.'-c "'.$query.';";';
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
			if ($exec) {
				$command_res = installer_config_manager::pg_shell_exec($command);
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
	* does not already exist.  All component writes (set_data + Save) are applied
	* unconditionally so that re-running activation refreshes stale field values.
	*
	* Field-writing sequence (new record only):
	*   1. TLD             (DEDALO_HIERARCHY_TLD2_TIPO 'hierarchy6')   — e.g. 'fauna'
	*   2. Typology        (DEDALO_HIERARCHY_TYPOLOGY_TIPO 'hierarchy9') — a LOCATOR to the
	*      typology taxonomy (DEDALO_HIERARCHY_TYPES_SECTION_TIPO 'hierarchy13') whose
	*      section_id is the typology number (1=Thematic, 2=Toponymy, …); NOT a bare int.
	*   3. Label           (DEDALO_HIERARCHY_LABEL_TIPO 'hierarchy7')  — display name
	*   4. Term/name       (DEDALO_HIERARCHY_TERM_TIPO 'hierarchy5')   — translatable name
	*      written in DEDALO_DATA_LANG_DEFAULT; required by generate_virtual_section().
	*   5. Language        (DEDALO_HIERARCHY_LANG_TIPO 'hierarchy8')   — lang locator
	*      for DEDALO_DATA_LANG_DEFAULT (the installation's default data language).
	*
	* Field-writing sequence (always applied):
	*   6. Active flag           (DEDALO_HIERARCHY_ACTIVE_TIPO 'hierarchy4')
	*      — a relation locator pointing to DEDALO_SECTION_SI_NO_TIPO / NUMERICAL_MATRIX_VALUE_YES.
	*   7. Active-in-thesaurus   (DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO 'hierarchy125')
	*      — locator pointing to YES or NO depending on $options->active_in_thesaurus.
	*   8. Source real section   (DEDALO_HIERARCHY_SOURCE_REAL_SECTION_TIPO 'hierarchy109')
	*      — hardcoded to [DEDALO_THESAURUS_SECTION_TIPO ('hierarchy20')]; required
	*        for generate_virtual_section() to know which template to clone.
	*
	* Virtual section generation:
	*   9. hierarchy::generate_virtual_section() provisions the two ontology
	*      virtual sections (<tld>1 for terms, <tld>2 for models) derived from
	*      DEDALO_THESAURUS_SECTION_TIPO. Errors are collected but do not abort.
	*
	*  10. Target section tipos  (hierarchy53 / hierarchy58) — '<tld>1' / '<tld>2'.
	*
	* Children locators (only when $options->typology === 2, i.e. Toponymy):
	*  11. DEDALO_HIERARCHY_CHILDREN_TIPO ('hierarchy45') — a dd48 locator pointing
	*      to section_id '1' of '<tld>1' (root term node).
	*  12. DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO ('hierarchy59') — a dd48 locator
	*      pointing to section_id '2' of '<tld>2' (root model node).  Written only
	*      if the corresponding model .copy.gz file exists on disk.
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
			$config	= installer_config_manager::get_config();

		// hierarchy search
			// Check whether matrix_hierarchy_main already contains a record for
			// this tld.  get_hierarchy_by_tld() queries the DEDALO_HIERARCHY_TLD2_TIPO
			// ('hierarchy6') JSON field using a case-insensitive jsonpath match.
			// get_hierarchy_by_tld() returns null when no matrix_hierarchy_main row
			// exists for this tld yet — the normal fresh-install case. Read section_id
			// defensively: an unguarded $hierarchy_row->section_id on null raises an
			// E_WARNING that Error::captureError() promotes into $_ENV['DEDALO_LAST_ERROR'],
			// which the API layer reports to the client as a (phantom) server error.
			$hierarchy_row	= hierarchy::get_hierarchy_by_tld( $tld );
			$section_tipo	= DEDALO_HIERARCHY_SECTION_TIPO;
			$section_id		= $hierarchy_row->section_id ?? null;
			$section_exists	= !empty($section_id);

		// hierarchy not already exists case. Create a new one
			if ($section_exists===false) {

				// update sequence value
				// Advance the sequence before inserting so the new record's id does
				// not collide with rows from the bulk SQL import performed earlier.
				$matrix_table = 'matrix_hierarchy_main';
				$query = 'SELECT setval(\''.$matrix_table.'_id_seq\', (SELECT MAX(id) FROM "'.$matrix_table.'")+1)';
				// SEC-041 defence-in-depth.
				$command = system::get_pg_bin_path().'psql -d '.escapeshellarg(DEDALO_DATABASE_CONN).' -U '.escapeshellarg(DEDALO_USERNAME_CONN).' '.$config->host_line.' '.$config->port_line.' --echo-errors '
					.'-c "'.$query.';";';
				debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
				$command_res = installer_config_manager::pg_shell_exec($command);
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
					// Text fields (component_input_text) are non-translatable but still store
					// their value under the language-neutral slot (lang = DEDALO_DATA_NOLAN
					// 'lg-nolan'). set_data() only tags the lang for translatable components, so
					// a bare set_data([$value]) here produced {value} WITHOUT a lang key, which
					// the edit view (it matches data by lang) could not render. set_data_lang()
					// tags the lang for any supports_translation component — matching how the
					// thesaurus editor itself saves these fields.
					$tld_tipo	= DEDALO_HIERARCHY_TLD2_TIPO; // hierarchy6
					$component	= self::get_hierarchy_component($tld_tipo, $section_id, 'list', $section_tipo, $response->errors);
					if ($component!==null) {
						$component->set_data_lang([(object)['value' => $tld]], DEDALO_DATA_NOLAN);
						$component->save();
					}

				// typology
					// hierarchy9 is a component_select whose value is a LOCATOR pointing
					// to the typology taxonomy section (DEDALO_HIERARCHY_TYPES_SECTION_TIPO
					// 'hierarchy13'); the selected option's section_id IS the typology number
					// (1=Thematic, 2=Toponymy, …). A plain integer is silently rejected by the
					// select component, leaving hierarchy9 empty — which makes
					// hierarchy::generate_virtual_section() abort with "typology is mandatory"
					// (it reads $data[0]->section_id), so the <tld>1/<tld>2 virtual sections
					// are never provisioned and the hierarchy cannot display in the thesaurus.
					$hierarchy_type_tipo	= DEDALO_HIERARCHY_TYPOLOGY_TIPO; // hierarchy9
					$component				= self::get_hierarchy_component($hierarchy_type_tipo, $section_id, 'list', $section_tipo, $response->errors);
					if ($component!==null) {
						$typology_locator = new locator();
							$typology_locator->set_type(DEDALO_RELATION_TYPE_LINK);
							$typology_locator->set_section_tipo(DEDALO_HIERARCHY_TYPES_SECTION_TIPO);
							$typology_locator->set_section_id((string)$typology);
							$typology_locator->set_from_component_tipo(DEDALO_HIERARCHY_TYPOLOGY_TIPO);
						$component->set_data([$typology_locator]);
						$component->save();
					}

				// label
					$label_tipo	= DEDALO_HIERARCHY_LABEL_TIPO; // hierarchy7
					$component	= self::get_hierarchy_component($label_tipo, $section_id, 'edit', $section_tipo, $response->errors);
					if ($component!==null) {
						$component->set_data_lang([(object)['value' => $label]], DEDALO_DATA_NOLAN);
						$component->save();
					}

				// term / display name
					// hierarchy5 (DEDALO_HIERARCHY_TERM_TIPO) is the hierarchy's translatable
					// name. hierarchy::generate_virtual_section() reads it (as $name_data) and
					// passes it to provision_virtual_sections(), which type-hints array — so a
					// missing/null hierarchy5 raises a TypeError that rolls back the whole
					// virtual-section provisioning. Write it in the default data language
					// (the same lang the term records are authored in, see hierarchy8 below).
					$term_tipo	= DEDALO_HIERARCHY_TERM_TIPO;	// hierarchy5
					$component	= self::get_hierarchy_component($term_tipo, $section_id, 'edit', $section_tipo, $response->errors, DEDALO_DATA_LANG_DEFAULT);
					if ($component!==null) {
						$component->set_data_lang([(object)['value' => $label]], DEDALO_DATA_LANG_DEFAULT);
						$component->save();
					}

				// name
					// Store a language locator so the hierarchy knows which data
					// language its terms are authored in (maps to DEDALO_DATA_LANG_DEFAULT).
					$name_tipo	= DEDALO_HIERARCHY_LANG_TIPO;	// hierarchy8
					$component	= self::get_hierarchy_component($name_tipo, $section_id, 'edit', $section_tipo, $response->errors);
					if ($component!==null) {
						$lang_locator = lang::get_lang_locator_from_code(DEDALO_DATA_LANG_DEFAULT);
						$component->set_data([$lang_locator]);
						$component->save();
					}
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
			$component		= self::get_hierarchy_component($active_tipo, $section_id, 'list', $section_tipo, $response->errors);
			if ($component!==null) {
				$dato = json_decode('[
				  {
					"type": "'.DEDALO_RELATION_TYPE_LINK.'",
					"section_id": "'.NUMERICAL_MATRIX_VALUE_YES.'",
					"section_tipo": "'.DEDALO_SECTION_SI_NO_TIPO.'",
					"from_component_tipo": "'.DEDALO_HIERARCHY_ACTIVE_TIPO.'"
				  }
				]');
				$component->set_data($dato);
				$component->save();
			}

		// active in thesaurus
			// Whether the hierarchy should be visible in the thesaurus area tree.
			// Uses the locator class (vs raw json_decode above) because the target
			// section_id is computed at runtime from $active_in_thesaurus.
			// DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO = 'hierarchy125'.
			$active_view_ts_tipo	= DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO;	// hierarchy125
			$component				= self::get_hierarchy_component($active_view_ts_tipo, $section_id, 'list', $section_tipo, $response->errors);
			if ($component!==null) {
				// Map the boolean to yes (1) or no (2) section_id in the dd64 section.
				$target_active_ts_section_id = ($active_in_thesaurus===true) ? NUMERICAL_MATRIX_VALUE_YES : NUMERICAL_MATRIX_VALUE_NO;

				$active_data = new locator();
					$active_data->set_type(DEDALO_RELATION_TYPE_LINK);
					$active_data->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
					$active_data->set_section_id($target_active_ts_section_id);
					$active_data->set_from_component_tipo(DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO);

				$component->set_data([$active_data]);
				$component->save();
			}

		// set real section tipo (!) needed to create virtual section
			// hierarchy::generate_virtual_section() reads this field to know which
			// "template" section tipo to clone when provisioning the ontology virtual
			// sections for <tld>1 and <tld>2.  It must be set to
			// DEDALO_THESAURUS_SECTION_TIPO ('hierarchy20') before generate_virtual_section()
			// is called, or the virtual section generation will fail.
			// source_real_section_tipo
			$component	= self::get_hierarchy_component(DEDALO_HIERARCHY_SOURCE_REAL_SECTION_TIPO, $section_id, 'edit', $section_tipo, $response->errors);
			if ($component!==null) {
				$component->set_data_lang([(object)['value' => DEDALO_THESAURUS_SECTION_TIPO]], DEDALO_DATA_NOLAN);
				$component->save();
			}

		// create ontology tld (generate_virtual_section)
			// Provision two virtual sections in the ontology: <tld>1 (terms) and
			// <tld>2 (models), derived from DEDALO_THESAURUS_SECTION_TIPO.
			// Errors are logged and appended to $response->errors but do not cause
			// an early return; the remaining field writes continue regardless.
			// Use a dedicated var (not $options) so the incoming descriptor is not
			// clobbered for any code that runs after this point.
			$virtual_section_options = (object)[
				'section_id'	=> $section_id,
				'section_tipo'	=> $section_tipo
			];
			$call_response = hierarchy::generate_virtual_section($virtual_section_options);
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
				$component		= self::get_hierarchy_component($component_tipo, $section_id, 'list', $section_tipo, $response->errors);
				if ($component!==null) {
					// Term virtual section tipo is always '<tld>1' (e.g. 'fauna1').
					$component->set_data_lang([(object)['value' => $tld.'1']], DEDALO_DATA_NOLAN);
					$component->save();
				}

			// target model
				$component_tipo	= DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO;	// 'hierarchy58';
				$component		= self::get_hierarchy_component($component_tipo, $section_id, 'list', $section_tipo, $response->errors);
				if ($component!==null) {
					// Model virtual section tipo is always '<tld>2' (e.g. 'fauna2').
					$component->set_data_lang([(object)['value' => $tld.'2']], DEDALO_DATA_NOLAN);
					$component->save();
				}

		// set children data
			// Toponymy hierarchies (typology 2, e.g. country TLDs like 'es', 'fr')
			// require explicit child-locator records that point to the root term (id=1)
			// and root model (id=2) of their respective virtual sections.
			// Other typologies (thematic, languages, etc.) do not need these because
			// their root nodes are not pre-seeded with fixed section_ids.
			if ($typology==2) {
				// general term
					$component_tipo	= DEDALO_HIERARCHY_CHILDREN_TIPO;	// 'hierarchy45';
					$component		= self::get_hierarchy_component($component_tipo, $section_id, 'list', $section_tipo, $response->errors);
					if ($component!==null) {
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
						$component->set_data($dato);
						$component->save();
					}

				// general model
					// Only register the model child locator when the model .copy.gz
					// file is present on disk. Some toponymy hierarchies ship without
					// a model file; the absence is logged as a warning, not an error.
					$dir_path		= $config->hierarchy_files_dir_path;
					// Model data files use the '<tld>2.copy.gz' convention (digit 2 = models),
					// e.g. 'ad2.copy.gz'. The earlier '<tld>.copy.gz' form never matched a shipped
					// file, so this child-locator block was dead code.
					$models_file	= $dir_path . '/' . strtolower($tld) . '2.copy.gz';
					if (file_exists($models_file)) {

						$component_tipo	= DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO;	// 'hierarchy59';
						$component		= self::get_hierarchy_component($component_tipo, $section_id, 'list', $section_tipo, $response->errors);
						if ($component!==null) {
							$dato = json_decode('[
								{
									"type": "dd48",
									"section_id": "2",
									"section_tipo": "'. $tld.'2",
									"from_component_tipo": "'.DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO.'"
								}
							]');
							$component->set_data($dato);
							$component->save();
						}

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
	* GET_HIERARCHY_COMPONENT
	* Resolve a component_common instance for a hierarchy field, guarding both the
	* ontology model lookup and the instantiation. ontology_node::get_model_by_tipo()
	* is declared ': ?string' and component_common::get_instance() ': ?object', so a
	* broken/partial ontology can yield null at either step. Returning null here (and
	* recording a non-fatal error) lets callers skip the set_data()/Save() instead of
	* fataling with "Call to a member function set_data() on null".
	*
	* @param string $tipo          component tipo (e.g. DEDALO_HIERARCHY_LABEL_TIPO)
	* @param mixed  $section_id     target section id
	* @param string $mode           component mode ('list' | 'edit')
	* @param string $section_tipo   owning section tipo (DEDALO_HIERARCHY_SECTION_TIPO)
	* @param array  $errors         accumulator (by ref) for non-fatal error messages
	* @param string $lang           data language; DEDALO_DATA_NOLAN for the usual
	*                               non-language-specific fields, an actual lang
	*                               (e.g. DEDALO_DATA_LANG_DEFAULT) for translatable
	*                               fields such as the term/name (hierarchy5).
	* @return object|null component_common instance, or null on failure
	*/
	private static function get_hierarchy_component(string $tipo, mixed $section_id, string $mode, string $section_tipo, array &$errors, string $lang=DEDALO_DATA_NOLAN) : ?object {

		$model_name = ontology_node::get_model_by_tipo($tipo, true);
		if (empty($model_name)) {
			$msg = " ERROR: cannot resolve ontology model for tipo '$tipo'";
			debug_log(__METHOD__.$msg, logger::ERROR);
			$errors[] = $msg;
			return null;
		}

		$component = component_common::get_instance(
			$model_name,
			$tipo,
			$section_id,
			$mode,
			$lang,
			$section_tipo
		);
		if (!is_object($component)) {
			$msg = " ERROR: cannot instantiate component '$tipo' (model '$model_name')";
			debug_log(__METHOD__.$msg, logger::ERROR);
			$errors[] = $msg;
			return null;
		}

		return $component;
	}//end get_hierarchy_component

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

		// selected hierarchies
			// Accept BOTH shapes: the install wizard sends `hierarchies` (an array of tld strings);
			// internal/legacy callers may send `selected_hierarchies` (descriptor objects). Normalize
			// to a list of tld strings — the authoritative metadata (typology/label/file) is taken
			// from the verified available-files list below, not from client input.
			$raw_selected = $options->selected_hierarchies ?? $options->hierarchies ?? [];
			if (!is_array($raw_selected)) {
				$raw_selected = [];
			}
			$selected_tlds = [];
			foreach ($raw_selected as $sel) {
				$tld = is_string($sel) ? $sel : ($sel->tld ?? null);
				if (!empty($tld)) {
					$selected_tlds[] = $tld;
				}
			}

		// get available hierarchy files (already per-file verified to exist + be readable)
			$hierarchies	= self::get_available_hierarchy_files();
			$available		= is_array($hierarchies->result) ? $hierarchies->result : [];

		// process each selected hierarchy
			$ar_responses	= [];
			$ok				= true;
			foreach ($selected_tlds as $tld) {

				// find ALL available files for this tld. A hierarchy ships up to two data files:
				// the term export '<tld>1.copy.gz' and the model export '<tld>2.copy.gz'. Both share
				// the same tld, so EVERY matching file must be imported — not just the first one (the
				// previous `break` after the first match silently dropped the model data, leaving
				// each hierarchy's '<tld>2' virtual section empty).
				$matches = array_values(array_filter($available, static function($el) use($tld){
					return ($el->tld ?? null) === $tld;
				}));
				if (empty($matches)) {
					$msg = "Error: no available hierarchy file for tld '".$tld."'";
					debug_log(__METHOD__.' '.$msg, logger::ERROR);
					$response->errors[] = $msg;
					$ok = false;
					continue;
				}

				// metadata source: prefer the term item ('<tld>1'); its hierarchies.json-derived
				// typology/label/active_in_thesaurus drive activation (all matches share them).
				$meta = null;
				foreach ($matches as $candidate) {
					if (($candidate->type ?? null) === 'term') { $meta = $candidate; break; }
				}
				if ($meta === null) {
					$meta = $matches[0];
				}

				// the typology must be a real number to activate the hierarchy (an unregistered
				// tld in hierarchies.json yields a placeholder string — reject it explicitly).
				if (!is_numeric($meta->typology)) {
					$msg = "Error: hierarchy '".$tld."' is not registered (no valid typology); skipped";
					debug_log(__METHOD__.' '.$msg, logger::ERROR);
					$response->errors[] = $msg;
					$ok = false;
					continue;
				}

				// import every data file for this tld (terms + models) into its matrix table.
				// Track the term ('<tld>1') outcome separately: without term data there is no
				// hierarchy to activate, so a term-import failure skips activation; a model
				// ('<tld>2') failure is recorded but does not block activation.
				$primary_ok = true;
				foreach ($matches as $found) {

					$is_primary = (($found->type ?? null) === 'term');

					// PER-FILE VERIFICATION: the .copy.gz must still exist and be readable right now
					// (prevents trying to import a non-existing/removed hierarchy file).
					if (empty($found->file) || !is_file($found->file) || !is_readable($found->file)) {
						$msg = "Error: hierarchy data file missing or unreadable for tld '".$tld."': ".to_string($found->file ?? null);
						debug_log(__METHOD__.' '.$msg, logger::ERROR);
						$response->errors[] = $msg;
						$ok = false;
						if ($is_primary) { $primary_ok = false; }
						continue;
					}

					// resolve the target matrix table for the import.
					// A brand-new hierarchy's virtual section (e.g. 'ts1') is NOT registered in the
					// ontology until activate_hierarchy() runs (below), so get_matrix_table_from_tipo()
					// returns '' for it (and logs a misleading ERROR). Probe the model first with the
					// quiet ontology_node::get_model_by_tipo() — null means unregistered — and skip
					// straight to the fallback to avoid the noisy error log. Core sections shipped in
					// the seed (e.g. 'lg1' → matrix_langs) resolve directly. For everything else, fall
					// back to the source thesaurus template table
					// (DEDALO_THESAURUS_SECTION_TIPO → matrix_hierarchy) — what the virtual section
					// inherits once activated.
					$matrix_table = null;
					$section_model = ontology_node::get_model_by_tipo($found->section_tipo);
					if (!empty($section_model)) {
						$matrix_table = common::get_matrix_table_from_tipo($found->section_tipo);
					}
					if (empty($matrix_table)) {
						$matrix_table = common::get_matrix_table_from_tipo(DEDALO_THESAURUS_SECTION_TIPO);
					}
					if (empty($matrix_table)) {
						$msg = "Error: could not resolve the target matrix table for hierarchy '".$tld."' (".to_string($found->section_tipo).")";
						debug_log(__METHOD__.' '.$msg, logger::ERROR);
						$response->errors[] = $msg;
						$ok = false;
						if ($is_primary) { $primary_ok = false; }
						continue;
					}

					// import the .copy.gz payload into its matrix table
					$import_options = (object)[
						'section_tipo'	=> $found->section_tipo,
						'file_path'		=> $found->file,
						'matrix_table'	=> $matrix_table
					];
					$import_response = backup::import_from_copy_file( $import_options );
					$ar_responses[] = $import_response;
					if (($import_response->result ?? false) !== true) {
						$response->errors[] = "Error importing hierarchy '".$tld."' (".to_string($found->section_tipo)."): ".to_string($import_response->msg ?? '');
						$ok = false;
						if ($is_primary) { $primary_ok = false; }
						continue;
					}
				}

				// without term data there is nothing to activate for this tld
				if ($primary_ok !== true) {
					$msg = "Error: term data not imported for tld '".$tld."'; activation skipped";
					debug_log(__METHOD__.' '.$msg, logger::ERROR);
					$response->errors[] = $msg;
					$ok = false;
					continue;
				}

				// create/activate the hierarchy + ontology virtual sections, using the VERIFIED
				// metadata from the available file (tld/typology/label/active_in_thesaurus).
				$activate_options = (object)[
					'tld'					=> $meta->tld,
					'typology'				=> (int)$meta->typology,
					'label'					=> $meta->label,
					'active_in_thesaurus'	=> is_bool($meta->active_in_thesaurus) ? $meta->active_in_thesaurus : true
				];
				$activate_response = self::activate_hierarchy($activate_options);
				$ar_responses[] = $activate_response;
				if (($activate_response->result ?? false) !== true) {
					$response->errors[] = "Error activating hierarchy '".$tld."': ".to_string($activate_response->msg ?? '');
					$ok = false;
				}
			}

		$response->result		= ($ok===true && empty($response->errors));
		$response->msg			= $response->result
			? 'OK. Request done '.__METHOD__
			: 'Completed with errors. Some hierarchies were not installed.';
		$response->responses	= $ar_responses;

		return $response;
	}//end install_hierarchies

}//end class installer_hierarchy_manager
