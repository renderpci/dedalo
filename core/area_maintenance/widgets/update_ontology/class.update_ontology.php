<?php declare(strict_types=1);
/**
* UPDATE_ONTOLOGY
* Maintenance widget that synchronises the local Dédalo Ontology from a remote
* master server and optionally exports ontology terms to a CSV for translation.
*
* This class is the server-side handler for the `update_ontology` widget in the
* area_maintenance dashboard.  It is reached exclusively through:
*   - `dd_area_maintenance_api::widget_request()` — which dispatches to methods
*     listed in `API_ACTIONS` (SEC-044 allowlist guard).
*   - `get_widget_value` — the hard-coded entry-point that always calls `get_value()`
*     regardless of `API_ACTIONS`.
*
* Responsibilities:
*   - `get_value()` — builds the widget's current state: reachable ontology servers,
*     installed ontology metadata (dd1), and the list of active TLD prefixes.
*   - `update_ontology()` — the destructive import pipeline: download compressed
*     snapshot files from a remote server, load them via `pg_restore`, rebuild the
*     `dd_ontology` index, flush session caches, regenerate JS lang files, write the
*     hierarchy schema-diff, and purge the hierarchy cache.
*   - `export_to_translate()` — searches all ontology sections for non-model nodes
*     and returns a CSV-ready array of section id + multilingual term values, suitable
*     for feeding into a translation workflow.
*   - `get_row_item_with_langs()` — internal helper that resolves a single ontology
*     node's model (ontology6/component_portal) and multilingual term (ontology5/
*     component_input_text) values for CSV output.
*
* Data shapes managed:
*   - Each TLD (top-level domain) of the ontology is stored in a PostgreSQL
*     `matrix_ontology` table (e.g. `matrix_dd`, `matrix_numisdata`).  The
*     companion `dd_ontology` table holds a flattened hierarchy index.
*   - Server descriptors follow the shape `{name, url, code}` defined via the
*     `ONTOLOGY_SERVERS` config constant (array of objects).
*
* @package Dédalo
* @subpackage Core
*/
class update_ontology {



	/**
	* API_ACTIONS
	* SEC-044: methods callable through `dd_area_maintenance_api::widget_request`.
	* `get_value` is invoked through `get_widget_value` (hard-coded method) and
	* therefore not listed here.
	*
	* @var array<string>
	*/
	public const API_ACTIONS = [
		'export_to_translate',
		'update_ontology'
	];



	/**
	* GET_VALUE
	* Builds and returns the current state object for the `update_ontology` widget.
	*
	* Called by the maintenance dashboard on every widget render (via
	* `get_widget_value`, not through `API_ACTIONS`).  The returned `result`
	* property is consumed directly by the front-end widget to pre-populate the
	* UI with the current ontology metadata, available servers, and TLD list.
	*
	* Server resolution order:
	*   1. Prefer the v7 `ONTOLOGY_SERVERS` constant (array of `{name, url, code}`)
	*      defined in `config.php`.
	*   2. Fall back to the legacy pair `STRUCTURE_SERVER_URL` + `STRUCTURE_SERVER_CODE`
	*      if present, wrapping them in a single-element array with a migration prompt
	*      in the name.
	*   3. Use an empty array if no server config exists.
	*   Additionally, when `IS_AN_ONTOLOGY_SERVER === true`, the local installation
	*   itself is appended as a `'localhost'` source (useful for self-hosted setups).
	*
	* Each server is probed via `ontology_data_io::check_remote_server()`, which
	* performs an HTTP health-check and returns `{result, msg, errors, code}`.
	*
	* The `prefix_tipos` list is derived from the legacy `DEDALO_PREFIX_TIPOS`
	* constant and is always augmented with `'ontology'` and `'ontologytype'`
	* so that the core ontology TLDs are never accidentally omitted.
	*
	* The `current_ontology` object is built from the dd1 ontology-root node
	* properties, giving the UI the installed version, authoring date, and entity.
	*
	* @return object $response
	*   - result: object {
	*       servers:              array of server-check objects ({name, url, code, result, msg, errors, response_code}),
	*       current_ontology:     object {date, host, entity, entity_label, version} from dd1 properties,
	*       prefix_tipos:         string[] active TLD prefixes including 'ontology' and 'ontologytype',
	*       structure_from_server: bool|null value of STRUCTURE_FROM_SERVER constant or null,
	*       body:                 string UI label/message,
	*       confirm_text:         string destructive-action confirmation text
	*     }
	*   - msg:    'OK. Request done successfully'
	*   - errors: array (always empty on success)
	*/
	public static function get_value() : object {

		// servers
		// Build the list of candidate ontology servers from config constants.
		// ONTOLOGY_SERVERS (v7) takes precedence; fall back to legacy constants.
			if (defined('ONTOLOGY_SERVERS')) {
				$servers = ONTOLOGY_SERVERS;
			}else if (defined('STRUCTURE_SERVER_URL') && defined('STRUCTURE_SERVER_CODE')) {
				$servers = [(object)[
					'name'	=> 'Old Ontology server config. Define ONTOLOGY_SERVERS ASAP',
					'url'	=> STRUCTURE_SERVER_URL,
					'code'	=> STRUCTURE_SERVER_CODE
				]];
			}else{
				$servers = [];
			}

		// local files
		// When the current instance IS the ontology master, also list it as a
		// 'localhost' source so the admin can import from local disk snapshots.
			if (IS_AN_ONTOLOGY_SERVER===true) {
				$servers[] = (object)[
					'name'	=> 'Local files',
					'url'	=> DEDALO_PROTOCOL.DEDALO_HOST.DEDALO_API_URL,
					'code'	=> 'localhost'
				];
			}

		// check ontology servers
		// Probe each server via HTTP; annotate the descriptor with the health-check
		// result so the UI can show live reachability status per server.
			$ontology_servers = [];
			foreach ($servers as $current_server) {

				$server = (object)$current_server;

				$server_ready			= ontology_data_io::check_remote_server( $server );
				$server->msg			= $server_ready->msg;
				$server->errors			= $server_ready->errors;
				$server->response_code	= $server_ready->code;
				$server->result			= $server_ready->result;

				// localhost is always considered reachable — the HTTP check would
				// hit a loopback and may not reflect actual file availability.
				if($server->code === 'localhost' && is_object($server->result)){
					$server->result->result = true;
				}

				$ontology_servers[]	= $server;
			}

		// tld list
		// get_legacy_constant_value reads DEDALO_PREFIX_TIPOS from either the
		// current config.php or the legacy equivalent. The result is cast to
		// array because older configs may store it as a plain string.
			$DEDALO_PREFIX_TIPOS = (array)get_legacy_constant_value('DEDALO_PREFIX_TIPOS');
			// force to add 'ontology' to the list
			// 'ontology' and 'ontologytype' must always be present so that the
			// core dd_ontology TLD is never excluded from import/export operations.
			$DEDALO_PREFIX_TIPOS = array_values(array_unique(
				[...$DEDALO_PREFIX_TIPOS, 'ontology', 'ontologytype']
			));

		// current_ontology: dd1 properties
		// dd1 is the root ontology node; its properties carry version, authoring
		// host, entity, and timestamp of the last installed snapshot.
			$ontology_node		= ontology_node::get_instance('dd1');
			$dd1_properties		= $ontology_node->get_properties();
			$current_ontology	= (object)[
				'date'			=> $dd1_properties->date,
				'host'			=> $dd1_properties->host,
				'entity'		=> $dd1_properties->entity,
				'entity_label'	=> $dd1_properties->entity_label,
				'version'		=> $dd1_properties->version
			];

		$result = (object)[
			'servers'				=> $ontology_servers,
			'current_ontology'		=> $current_ontology,
			'prefix_tipos'			=> $DEDALO_PREFIX_TIPOS,
			'structure_from_server'	=> (defined('STRUCTURE_FROM_SERVER') ? STRUCTURE_FROM_SERVER : null),
			'body'					=>  label::get_label('update_ontology')." is disabled for ".DEDALO_ENTITY,
			'confirm_text'			=> '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! WARNING !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!' . PHP_EOL
				.'!!!!!!!!!!!!!! DELETING ACTUAL ONTOLOGY !!!!!!!!!!!!!!!!!!!!!!!!!!!' . PHP_EOL
				.'Are you sure you want to overwrite the current Ontology data?' .PHP_EOL
				.'You will lose all changes made to the local Ontology.'
		];

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end get_value



	/**
	* EXPORT_TO_TRANSLATE
	* Searches the requested ontology TLDs and returns a CSV-ready 2-D array of
	* node identifiers and their multilingual term values, ready to feed into an
	* external translation workflow.
	*
	* The export intentionally excludes "model" nodes (ontology30 = section_id '2'
	* in the dd64/DEDALO_SECTION_SI_NO_TIPO boolean section) because those are
	* structural templates and do not need translation.  Callers may additionally
	* exclude specific model families by name via `export_ontology_exclude_models`.
	*
	* Algorithm:
	*   1. Derive section tipos from TLD names  (e.g. 'dd' → 'dd0', 'numisdata' → 'numisdata0').
	*   2. Build a compound `$and` filter:
	*      a) Exclude nodes where `ontology30` (is_model) == section_id '2' (i.e. "Yes").
	*      b) For each entry in `export_ontology_exclude_models`, exclude nodes whose
	*         `ontology6` (model portal) → `ontology5` (term) does NOT equal the
	*         entry (negated regex prefix `!=`).
	*   3. Execute the search with `skip_projects_filter = true` so all TLD records
	*      are reached regardless of the current project context.
	*   4. Sort results by `section_tipo` ascending for readability.
	*   5. Resolve each row via `get_row_item_with_langs()` and flatten to a plain
	*      PHP array for the CSV row.
	*
	* Column layout of the returned rows: ['id', 'section_tipo', 'model', ...langs]
	*
	* @param object $options
	*   - export_ontology_langs:          string[]  language codes to include as columns (e.g. ['lg-spa','lg-eng'])
	*   - export_ontology_tld_list:       string[]  TLD prefixes to export (e.g. ['dd', 'numisdata'])
	*   - export_ontology_exclude_models: string[]  model term values to exclude (e.g. ['component_input_text'])
	* @return object $response
	*   - result: array[]|false  2-D array (header row + data rows) or false on failure
	*   - msg:    string
	*   - errors: array
	*/
	public static function export_to_translate(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__.' ';
			$response->errors	= [];

		// options
			$export_ontology_langs			= $options->export_ontology_langs ?? [];
			$export_ontology_tld_list		= $options->export_ontology_tld_list ?? [];
			$export_ontology_exclude_models	= $options->export_ontology_exclude_models ?? [];

		try {

			// get all TLDs records

			// section tipo list from TLD list. E.g. dd => dd0
			// Each TLD stores its nodes in the section type '<tld>0' (the root section).
			$ar_section_tipo = array_map(function($tld){
				return $tld . '0';
			}, $export_ontology_tld_list);


			// filter compose
			$filter_items = [];

			// filter. Exclude models
			// ontology30 is the `is_model` component (component_radio_button).
			// Section dd64 is the Yes/No lookup (DEDALO_SECTION_SI_NO_TIPO);
			// section_id '2' is the "Yes" record, meaning "this node is a model".
			// We exclude model nodes from translation exports because they are
			// structural templates, not user-facing content.
			$filter_items[] = json_decode('
				{
					"q": [
						{
							"section_id": "2",
							"section_tipo": "dd64",
							"from_component_tipo": "ontology30"
						}
					],
					"q_operator": null,
					"path": [
						{
							"name": "Is model",
							"model": "component_radio_button",
							"section_tipo": "dd0",
							"component_tipo": "ontology30"
						}
					],
					"q_split": false,
					"type": "jsonb"
				}
			');

			// filter. From model deep term regex !=item
			// Each entry in $export_ontology_exclude_models is a model term value
			// (e.g. 'component_input_text').  The '!=' prefix is a SQO negated-regex
			// operator: keep only nodes whose model term does NOT match this value.
			foreach ($export_ontology_exclude_models as $el) {
				$q = '!=' . $el;
				$filter_items[] = (object)[
					'q'		=> [$q],
					'path'	=> json_decode('
						[
							{
								"name": "Model",
								"model": "component_portal",
								"section_tipo": "dd0",
								"component_tipo": "ontology6"
							},
							{
								"name": "Term",
								"model": "component_input_text",
								"section_tipo": "dd0",
								"component_tipo": "ontology5"
							}
						]
					'),
					'q_split'	=> false,
					'type'		=> 'jsonb'
				];
			}

			$filter = (object)[
				'$and' => $filter_items
			];

			// search_query_object
			// limit=0 means no pagination — fetch every matching record.
			// skip_projects_filter=true bypasses the per-project record fence so
			// that all TLD nodes are visible regardless of active project.
			$sqo = new search_query_object();
				$sqo->set_section_tipo( $ar_section_tipo );
				$sqo->set_limit( 0 );
				$sqo->set_skip_projects_filter( true );
				$sqo->set_filter($filter);

			// search exec
			$search	= search::get_instance($sqo);
			$db_result	= $search->search();

			$ar_records = $db_result->fetch_all();

			// sort by section_tipo ASC for convenience
			// Grouping by TLD makes the CSV easier to review and diff.
			usort($ar_records, function($a, $b) {
				return strcmp($a->section_tipo, $b->section_tipo);
			});

			$csv_data = [];

			$langs = $export_ontology_langs;

			// csv header
			// The spread operator appends one column per requested language code.
			$csv_data[] = ['id', 'section_tipo', 'model', ...$langs];

			// csv rows
			foreach ($ar_records as $row) {

				// get model and term in all langs
				// get_row_item_with_langs returns an object whose dynamic properties
				// map lang codes to term values; cast to array for the CSV row.
				$item = self::get_row_item_with_langs($row->section_tipo, $row->section_id, $langs);
				$csv_data[] = array_values( (array)$item );
			}

		} catch (Exception $e) {

			$response->msg = $e->getMessage();
			$response->errors[]	= 'exception exporting Ontology';
			debug_log(__METHOD__
				. ' Exception exporting Ontology ' . PHP_EOL
				. 'exception: ' . $e->getMessage()
				, logger::ERROR
			);
		}

		$response->result	= $csv_data ?? false;
		$response->msg		= !empty($response->errors)
			? 'Warning! exporting Ontology with errors'
			: 'OK. Exported Ontology successfully ('.count($ar_records).' records)';


		return $response;
	}//end export_to_translate



	/**
	* UPDATE_ONTOLOGY
	* Full ontology replacement pipeline: downloads compressed snapshot files from
	* a remote master server, restores them into the local PostgreSQL database, rebuilds
	* the `dd_ontology` hierarchy index, flushes caches, regenerates JS language files,
	* and records a schema-diff for change tracking.
	*
	* Called from the `update_ontology` widget in area_maintenance via
	* `dd_area_maintenance::widget_request()`.  This is a DESTRUCTIVE operation —
	* existing ontology data in the affected TLD tables is replaced by the remote snapshot.
	*
	* Pipeline steps (in order):
	*   1. Pgpass check — `system::check_pgpass_file()` must succeed; the underlying
	*      `pg_restore` call requires a `.pgpass` file with correct permissions so that
	*      PostgreSQL credentials are available non-interactively.  Hard-fail if absent.
	*   2. Download — `ontology_data_io::download_remote_ontology_file()` fetches each
	*      `.copy.gz` snapshot from the remote server URL and saves it locally.  Only
	*      successfully downloaded files are advanced to step 3.
	*   3. Import — for each downloaded file:
	*      - TLD `matrix_dd` (private lists): `ontology_data_io::import_private_lists_from_file()`.
	*      - All other TLDs: ensure the main section row exists (`ontology::add_main_section()`),
	*        create the root `dd_ontology` node (`ontology::create_dd_ontology_ontology_section_node()`),
	*        then restore the matrix data (`ontology_data_io::import_from_file()`).
	*   4. dd_ontology index rebuild — `ontology::set_records_in_dd_ontology()` is called
	*      per imported TLD (skipping `matrix_dd`) to re-index all nodes into the flat
	*      `dd_ontology` table that the hierarchy engine uses for fast lookups.
	*   5. Pre-diff snapshot — `hierarchy::get_simple_schema_of_sections()` captures the
	*      old section schema BEFORE optimization so it can be diffed against the new one.
	*   6. Table optimization — `db_tasks::optimize_tables()` on `dd_ontology`,
	*      `matrix_ontology`, `matrix_ontology_main`, and `matrix_dd`.
	*   7. Session flush — all non-auth session keys under `$_SESSION['dedalo']` are
	*      cleared to prevent stale ontology caches from persisting in the current session.
	*   8. JS lang file regeneration — `backup::write_lang_file()` is called for every
	*      language in `DEDALO_APPLICATION_LANGS` to rebuild the browser-side label bundles
	*      that embed ontology term strings.
	*   9. Activity log — the update is recorded via `logger::$obj['activity']->log_message()`
	*      with action 'SAVE' and the new ontology version string.
	*  10. Schema diff — `hierarchy::save_simple_schema_file()` compares the old and new
	*      section schemas and writes a JSON diff file for auditing structural changes.
	*      Hard-fail (early return) if the diff file cannot be written.
	*  11. Hierarchy cache purge — `dd_cache::delete_cache_files()` removes cached hierarchy
	*      files so the next request rebuilds them from the freshly imported data.
	*
	* @param object $options
	*   - server: object {name: string, url: string, code: string}  — selected remote server descriptor
	*   - files:  array of file descriptor objects {section_tipo: string, tld: string, url: string}
	*   - info:   object {date: string, host: string, entity: string, ...}  — metadata from the remote server
	* @return object $response
	*   - result:    bool   true on overall success (errors array may still be non-empty for partial failures)
	*   - msg:       string accumulated pipeline messages joined by newline
	*   - errors:    array  error strings from individual pipeline stages
	*   - root_info: object {term: string, properties: object}  new ontology root metadata (only present on success)
	*/
	public static function update_ontology(object $options): object
	{

		// response
		$response = new stdClass();
		$response->result = false;
		$response->msg = 'Error. Request failed [' . __METHOD__ . ']';
		$response->errors = [];

		// options
		$files = $options->files;
		$info = $options->info;

		// ar_msg
		// Accumulates informational messages from each pipeline stage for the final
		// response message (joined at the end with PHP_EOL).
		$ar_msg = [];

		// Note: no ~/.pgpass precondition. The psql/pg_dump commands run by the import below
		// authenticate via the PGPASSWORD env var (DBi::pg_shell_exec / DBi::pg_exec) taken
		// from DEDALO_PASSWORD_CONN, so the database may be LOCAL or REMOTE. Real authentication
		// failures are surfaced by the underlying psql exec, not pre-gated here.

		// download files
		// Only files that download successfully advance to the import step.
		// Files that fail download are logged in errors but do not abort the
		// rest of the pipeline, so a partial update is still possible.
		$files_to_import = [];
		foreach ($files as $current_file_item) {

			$download_file_response = ontology_data_io::download_remote_ontology_file($current_file_item->url);

			$ar_msg[] = $download_file_response->msg;
			if (!empty($download_file_response->errors)) {
				$response->errors = array_merge($response->errors, $download_file_response->errors);
			}

			if ($download_file_response->result === true) {
				$files_to_import[] = $current_file_item;
			}
		}

		// import ontology sections
		// import file
		// The 'matrix_dd' TLD holds private lookup lists (e.g. yes/no, language
		// codes) that require a different import strategy (delete+replace) compared
		// to regular ontology TLDs (merge/upsert via pg_restore).
		foreach ($files_to_import as $current_file_item) {

			if ($current_file_item->tld === 'matrix_dd') {
				// private lists
				$import_response = ontology_data_io::import_private_lists_from_file($current_file_item);
			} else {
				// main section
				// create the main section if not exists
				// Ensures the root record for this TLD exists in matrix_ontology_main
				// before the matrix data is restored on top of it.
				ontology::add_main_section($current_file_item);
				// create dd_ontology node for the main section
				// Registers the TLD root node in dd_ontology so the hierarchy engine
				// can locate it without a full index rebuild first.
				ontology::create_dd_ontology_ontology_section_node($current_file_item);
				// matrix data of regular ontology
				$import_response = ontology_data_io::import_from_file($current_file_item);
			}
			// add messages and errors
			if (!empty($import_response->msg)) {
				$ar_msg[] = $import_response->msg;
			}
			if (!empty($import_response->errors)) {
				$response->errors = array_merge($response->errors, $import_response->errors);
			}
		}

		// update dd_ontology with the imported records
		// After all matrix tables are restored, rebuild the dd_ontology flat index
		// for each imported TLD.  This is done in a second pass so that cross-TLD
		// references in the matrix data are already present when indexing begins.
		foreach ($files_to_import as $current_file_item) {

			if (!is_object($current_file_item) || !isset($current_file_item->tld, $current_file_item->section_tipo)) {
				debug_log(
					__METHOD__
					. " Ignored file item: Missing 'tld' or 'section_tipo' properties. " . PHP_EOL
					. ' current_file_item: ' . to_string($current_file_item)
					,
					logger::ERROR
				);
				continue;
			}

			// private list, matrix_dd, doesn't process it as dd_ontology nodes
			// matrix_dd contains lookup tables that are not part of the ontology
			// hierarchy, so they must not be indexed in dd_ontology.
			if ($current_file_item->tld === 'matrix_dd') {
				continue;
			}

			$section_tipo = $current_file_item->section_tipo;
			$sqo = new search_query_object();
			$sqo->set_section_tipo([$section_tipo]);
			$sqo->limit = 0;

			$set_dd_ontology_response = ontology::set_records_in_dd_ontology($sqo);
			// add messages and errors
			if (!empty($set_dd_ontology_response->msg)) {
				$ar_msg[] = $set_dd_ontology_response->msg;
			}
			if (!empty($set_dd_ontology_response->errors)) {
				$response->errors = array_merge($response->errors, $set_dd_ontology_response->errors);
			}
		}

		// simple_schema_of_sections. Get current simple schema of sections before update data
		// Will used to compare with the new schema (after update)
		// (!) Must be captured BEFORE optimize_tables so the comparison reflects the
		// true pre-update state, not the post-vacuum state.
		$old_simple_schema_of_sections = hierarchy::get_simple_schema_of_sections();

		// post processing tables
		$ar_tables = ['dd_ontology', 'matrix_ontology', 'matrix_ontology_main', 'matrix_dd'];
		// optimize tables
		db_tasks::optimize_tables($ar_tables);

		// delete all session data except auth
		// After replacing the ontology, any session-cached section maps, labels,
		// or hierarchy data are stale.  Wiping all non-auth keys forces a clean
		// rebuild on the next request.  The 'auth' key is preserved to keep the
		// current admin session alive.
		if (isset($_SESSION['dedalo']) && is_array($_SESSION['dedalo'])) {
			foreach ($_SESSION['dedalo'] as $key => $value) {
				if ($key === 'auth')
					continue;
				unset($_SESSION['dedalo'][$key]);
			}
		}

		// update javascript labels
		// The JS label bundles embed ontology term strings, so they must be
		// regenerated after every ontology update.  Failures are recorded as
		// errors but do not abort the pipeline — a partial lang-file update is
		// better than rolling back the entire import.
		$ar_langs = DEDALO_APPLICATION_LANGS;
		foreach ($ar_langs as $lang => $label) {

			// direct
			$write_file = backup::write_lang_file($lang);
			if ($write_file === false) {
				$response->errors[] = 'Error writing write_lang_file of lang: ' . $lang;
				continue;
			}

			// debug
			debug_log(
				__METHOD__
				. " Writing lang file " . PHP_EOL
				. ' lang: ' . to_string($lang)
				,
				logger::WARNING
			);
		}

		// logger activity : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
		// Record the update in the activity log so administrators can audit when
		// and by whom the ontology was last replaced.
		logger::$obj['activity']->log_message(
			'SAVE',
			logger::INFO,
			DEDALO_ROOT_TIPO,
			NULL,
			[
				'msg' => 'Updated Ontology',
				'version' => ontology_node::get_term_by_tipo(DEDALO_ROOT_TIPO, 'lg-spa')
			],
			logged_user_id() // int
		);

		// save_simple_schema_file. Get new simple_schema_of_sections
		// to compare with the previous scheme and save the changes
		// Compares the old schema snapshot (captured before import) with the new
		// post-import schema and writes a dated JSON diff file to disk.
		// This is a hard-fail: if the diff cannot be written, roll back the response.
		$save_simple_schema_file_response = hierarchy::save_simple_schema_file((object) [
			'old_simple_schema_of_sections' => $old_simple_schema_of_sections
		]);
		if ($save_simple_schema_file_response->result === false) {
			$response->result = false;
			$response->msg = 'Error saving simple_schema_file: ' . $save_simple_schema_file_response->msg;
			$response->errors = array_merge($response->errors, $save_simple_schema_file_response->errors);
			return $response;
		} else {
			$ar_msg[] = 'OK. Saved a new simple schema changes file: ' . basename($save_simple_schema_file_response->filepath);
		}

		// force reset cache of hierarchy tree
		// delete previous cache files
		// Cached hierarchy files contain serialised section/component maps derived
		// from the old ontology.  Delete them so the next request rebuilds from
		// the freshly imported data rather than stale on-disk cache.
		dd_cache::delete_cache_files();

		// get new Ontology info
		// Read back the root node properties from the just-imported ontology so
		// the UI can display the confirmed new version/date without a second request.
		$ontology_node = ontology_node::get_instance(DEDALO_ROOT_TIPO);
		$root_info = (object) [
			'term' => ontology_node::get_term_by_tipo(DEDALO_ROOT_TIPO, DEDALO_STRUCTURE_LANG, false, false),
			'properties' => $ontology_node->get_properties()
		];

		// response
		$response->result = true;
		$msg = empty($response->errors)
			? 'OK. Request done successfully'
			: 'Warning! Request done with errors';
		$response->msg = $msg . ' ' . implode(PHP_EOL, $ar_msg);
		$response->root_info = $root_info;


		return $response;
	}//end update_ontology



	/**
	* GET_ROW_ITEM_WITH_LANGS
	* Resolves the model identifier and all requested language variants of the term
	* for a single ontology node, returning a flat object ready for CSV serialisation.
	*
	* Ontology node structure addressed here:
	*   - ontology6 (component_portal)     — the "Model" field; holds the PHP class name
	*     (e.g. 'component_input_text') that describes the type of this ontology node.
	*   - ontology5 (component_input_text) — the "Term" field; a multilingual label
	*     stored as an array of `{lang, value}` objects in the component's data.
	*
	* The returned object's property order matches the CSV column layout defined in
	* `export_to_translate()`: id, section_tipo, model, [lang1, lang2, …].
	* If a requested language has no value for a given node, the corresponding
	* property is simply absent from the object (the CSV cell will be empty when
	* cast via `array_values((array)$item)`).
	*
	* @param string     $section_tipo  Ontology section tipo (e.g. 'dd0', 'numisdata0')
	* @param int|string $section_id    Record id within that section
	* @param array      $langs         Language codes to include (e.g. ['lg-spa', 'lg-eng'])
	* @return object $item  {id, section_tipo, model, [lang => value, ...]}
	*/
	private static function get_row_item_with_langs(string $section_tipo, int|string $section_id, array $langs) : object {

		$item = (object)[
			'id' => $section_id,
			'section_tipo' => $section_tipo
		];

		// model
		// ontology6 is a component_portal that points to the PHP model class for this
		// node.  get_value() returns the resolved term string (e.g. 'component_input_text').
		$tipo = 'ontology6';
		$model = ontology_node::get_model_by_tipo($tipo ,true);
		$component = component_common::get_instance(
			$model, // string model
			$tipo , // string tipo
			$section_id, // string section_id
			'list', // string mode
			DEDALO_DATA_LANG, // string lang
			$section_tipo // string section_tipo
		);
		$item->model = $component->get_value();

		// term
		// ontology5 is a component_input_text that stores the multilingual label.
		// get_data() returns an array of {lang, value} objects — one per language
		// that has a stored translation.  We index them by lang code so the CSV
		// columns line up regardless of storage order.
		$tipo = 'ontology5';
		$model = ontology_node::get_model_by_tipo($tipo ,true);
		$component = component_common::get_instance(
			$model, // string model
			$tipo , // string tipo
			$section_id, // string section_id
			'list', // string mode
			DEDALO_DATA_LANG, // string lang
			$section_tipo // string section_tipo
		);

		$data = $component->get_data();

		foreach ($data as $element) {
			$lang = $element->lang;
			$value = $element->value;

			// Assign each language's value as a dynamic property so the object can
			// be cast to an ordered array matching the CSV column sequence.
			$item->{$lang} = $value;
		}


		return $item;
	}//end get_row_item_with_langs



}//end update_ontology
