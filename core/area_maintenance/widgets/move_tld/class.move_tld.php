<?php declare(strict_types=1);
/**
* MOVE_TLD
* Area-maintenance widget that bulk-renames ontology tipo identifiers (TLDs)
* across every matrix table in the Dédalo database.
*
* In Dédalo every section and component is identified by a short string called
* a "tipo" (also called a TLD — top-level domain — when referring to the section
* family prefix, e.g. "numisdata", "tchi1"). When a project's ontology is
* consolidated or migrated to a shared TLD schema, every occurrence of the old
* tipo must be replaced with the new one in all stored data: section_tipo columns,
* JSONB datos blobs, locators, hierarchies, indexes, and more. This widget drives
* that replacement through `transform_data::changes_in_tipos()`.
*
* Responsibilities:
* - Expose `get_value()` so the maintenance dashboard can display a usage summary
*   and the list of available definition files before the operator commits to a run.
* - Expose `move_tld()` so the API can execute the transformation against all
*   matrix tables using one or more operator-selected JSON definition files.
*
* Definition files live at:
*   DEDALO_CORE_PATH/base/transform_definition_files/move_tld/*.json
* Each file is a JSON array of transform objects. A section-level entry example:
*   {
*     "old":    "numisdata279",     // source tipo to replace
*     "new":    "tchi1",            // destination tipo
*     "type":   "section",          // "section" | "component"
*     "perform": ["replace_tipo"],  // operations the engine must carry out
*     "skip_virtuals": ["numisdata5"], // virtual section tipos in the same table
*                                      // that must NOT be rewritten
*     "info":   "Finds => Immobile" // human-readable description for the log
*   }
* Component-level entries follow the same shape but omit "skip_virtuals".
*
* The operator selects one or more files via the maintenance-area UI; all selected
* maps are merged and applied in a single `transform_data::changes_in_tipos()` call.
*
* Security: the API surface is gated by API_ACTIONS (SEC-044). The definition-file
* list is further restricted by `area_maintenance::get_definitions_files()` through
* an allowlist plus realpath confinement (SEC-069).
*
* (!) WARNING: this operation iterates every row of every matrix table and rewrites
* tipo strings in-place. It is irreversible and can run for a very long time on
* large databases. Always take a full database backup before invoking.
*
* API entry point: dd_area_maintenance_api::widget_request()
* Dispatch helper:  area_maintenance::get_definitions_files('move_tld')
* Engine:           transform_data::changes_in_tipos() (core/base/upgrade/)
*
* @package Dédalo
* @subpackage Core
*/
class move_tld {



	/**
	* Allowlist of API action names callable through `dd_area_maintenance_api::widget_request`.
	* (SEC-044) Only the method names present in this array may be dispatched by the
	* widget_request gateway. `get_value` is excluded because it is dispatched through
	* the separate hard-coded `get_widget_value` path, not through widget_request.
	* @var array<string> API_ACTIONS
	*/
	public const API_ACTIONS = [
		'move_tld'
	];



	/**
	* GET_VALUE
	* Returns the initial widget payload for the maintenance dashboard panel.
	*
	* Called by `dd_area_maintenance_api::get_widget_value()` every time the panel
	* is opened or refreshed. The result object populates the widget's body text and
	* the file picker from which the operator selects which definition file(s) to run.
	*
	* The `files` property contains objects of shape `{ file_name: string, content: object|null }`
	* as returned by `area_maintenance::get_definitions_files('move_tld')`. An empty
	* array means no JSON definition files are present in the directory.
	*
	* @return object $response - stdClass with:
	*   - result  object  { body: string, files: array<object> }
	*   - msg     string  Human-readable status message
	*   - errors  array   Empty on success
	*/
	public static function get_value() : object {

		$response = new stdClass();
		$response->result = (object)[
			'body' => 'Move TLD defined map items from source (ex. numisdata279) to target (ex. tchi1).<br>
					   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_tld.<br>
					   Note: this can be a very long process because it has to go through all the records in all the tables.',
			'files' => area_maintenance::get_definitions_files('move_tld')
		];
		$response->msg = 'OK. Request done successfully';
		$response->errors = [];


		return $response;
	}//end get_value



	/**
	* MOVE_TLD
	* Executes a bulk tipo-rename across all matrix tables using one or more
	* operator-selected JSON definition files.
	*
	* The method resolves the file names chosen by the operator against the list
	* produced by `area_maintenance::get_definitions_files('move_tld')` (which
	* enforces the SEC-069 path confinement) and extracts only the bare file names
	* to pass to `transform_data::changes_in_tipos()`. That engine loads the JSON
	* maps itself from the well-known directory and applies every replace_tipo
	* directive across the fixed table list below.
	*
	* The table list covers every standard matrix table. matrix_time_machine is
	* included so that historical snapshots also reflect the new tipos — omitting it
	* would leave the Time Machine pointing at non-existent tipos after the rename.
	*
	* (!) This method is synchronous and blocks the request thread for the full
	* duration. On large databases the operation can take many minutes. The
	* maintenance dashboard typically wraps this in a background-runnable call
	* via `dd_area_maintenance_api::widget_request` with `background_running:true`.
	*
	* @param object $options - Request payload from the maintenance UI:
	*   {
	*     files_selected: array<string>  // e.g. ['finds_numisdata279_to_tchi1.json']
	*   }
	* @return object $response - stdClass with:
	*   - result  bool|false  Return value of transform_data::changes_in_tipos();
	*                         false on failure or if validation guards trip early
	*   - msg     string      Human-readable status; describes the failure point on error
	*   - errors  array<string>  Populated with a short error token on early exit
	*/
	public static function move_tld(object $options): object
	{

		$response = new stdClass();
		$response->result = false;
		$response->msg = 'Error. Request failed [' . __METHOD__ . ']';
		$response->errors = [];

		// options
		// Unpack the caller-supplied file list; bail immediately if nothing was selected.
		$files_selected = $options->files_selected;
		if (empty($files_selected)) {
			$response->errors[] = 'empty files_selected';
			return $response;
		}

		// files
		// Resolve selected names against the SEC-069-sanitised catalogue so that
		// only files that actually exist inside the move_tld directory are accepted.
		$definitions_files = area_maintenance::get_definitions_files('move_tld');
		$json_files = array_filter($definitions_files, function ($el) use ($files_selected) {
			return in_array($el->file_name, $files_selected);
		});
		if (empty($json_files)) {
			$response->errors[] = 'json_files not found';
			return $response;
		}

		// ar_file_name
		// Strip the catalogue objects down to bare file-name strings; changes_in_tipos
		// re-reads the files from disk using its own path construction.
		$ar_file_name = array_values(
			array_map(function ($el) {
				return $el->file_name;
			}, $json_files)
		);

		// process changes_in_tipos
		// Complete list of matrix tables that store tipo strings in any column (section_tipo,
		// datos JSONB, tipo columns, etc.). matrix_time_machine is intentionally included so
		// historical snapshots remain consistent with the renamed tipos after the migration.
		$ar_tables = [
			'matrix',
			'matrix_activities',
			'matrix_activity',
			'matrix_counter',
			'matrix_dataframe',
			'matrix_dd',
			'matrix_hierarchy',
			'matrix_hierarchy_main',
			'matrix_indexations',
			'matrix_layout',
			'matrix_layout_dd',
			'matrix_list',
			'matrix_nexus',
			'matrix_nexus_main',
			'matrix_notes',
			'matrix_profiles',
			'matrix_projects',
			'matrix_stats',
			'matrix_time_machine'
		];
		// Load transform_data on demand — it is not part of the core autoload path and
		// is only needed when a migration widget actually triggers a run.
		require_once DEDALO_CORE_PATH . '/base/upgrade/class.transform_data.php';
		$result = transform_data::changes_in_tipos(
			$ar_tables,
			$ar_file_name
		);

		$response->result = $result;
		$response->msg = ($result === false)
			? 'Error. changes_in_tipos failed'
			: 'OK. request done successfully';


		return $response;
	}//end move_tld



}//end move_tld