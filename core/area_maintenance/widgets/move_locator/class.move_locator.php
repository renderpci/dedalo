<?php declare(strict_types=1);
/**
* CLASS MOVE_LOCATOR
* Area-maintenance widget that bulk-migrates section locators across the full
* Dédalo matrix using a declarative JSON map file.
*
* A "locator" in Dédalo identifies a record as a (section_tipo, section_id) pair —
* for example `rsc194_1`. When a section tipo is consolidated or renamed (e.g.
* rsc194 → rsc197), every occurrence of old locators stored in component data,
* relations, hierarchies, indexes, and other matrix tables must be updated in lock-
* step. This widget drives that process through `transform_data::changes_in_locators()`.
*
* Responsibilities:
* - Expose `get_value()` so the maintenance UI can discover available definition
*   files and display a usage summary before the user commits to the migration.
* - Expose `move_locator()` so the API can execute the migration against all
*   matrix tables using one or more operator-selected JSON definition files.
*
* Definition files live at:
*   DEDALO_CORE_PATH/base/transform_definition_files/move_locator/*.json
* Each file is a JSON array of transform objects. Each object describes one
* source → destination section mapping:
*   {
*     "old":  "rsc194",          // source section tipo
*     "new":  "rsc197",          // destination section tipo
*     "type": "section",         // only "section" is consumed by changes_in_locators
*     "perform": ["move_tld"],   // optional companion operations
*     "add_data_to_new_section": [...], // optional post-move data injection
*     "info": "human-readable description"
*   }
*
* Security: API surface is gated by API_ACTIONS (SEC-044). The definition-file
* list is further restricted by `area_maintenance::get_definitions_files()` via an
* allowlist + realpath confinement check (SEC-069).
*
* WARNING: A move_locator migration iterates every row of every matrix table and
* rewrites locator strings in-place. It is irreversible and can run for a very
* long time on large databases. Always take a backup before invoking.
*
* @package Dédalo
* @subpackage Core
*/
class move_locator {



	/**
	* Allowlist of API action names callable through `dd_area_maintenance_api::widget_request`.
	* (SEC-044) Only the method names present in this array may be dispatched by the
	* widget_request gateway. `get_value` is excluded because it is dispatched through
	* the hard-coded `get_widget_value` path, not through widget_request.
	* @var array<string> API_ACTIONS
	*/
	public const API_ACTIONS = [
		'move_locator'
	];



	/**
	* GET_VALUE
	* Returns the widget's initial display value for the maintenance UI.
	*
	* Called by `area_maintenance::get_widget_value()` (hard-coded, not via
	* widget_request) to populate the widget panel before the user triggers a
	* migration. The response carries:
	*   - `body`  — a human-readable description of what move_locator does and
	*               where its definition files are located.
	*   - `files` — the list of available JSON definition files discovered by
	*               `area_maintenance::get_definitions_files('move_locator')`.
	*               Each element is an object `{file_name: string, content: mixed}`.
	*
	* The UI uses the files list to render a selection control so the operator
	* can choose which definition file(s) to apply before calling `move_locator()`.
	*
	* @return object $response - stdClass with:
	*   result  : object {body: string, files: array<object>}
	*   msg     : string
	*   errors  : array<string>
	*/
	public static function get_value() : object {

		$response = new stdClass();
		$response->result = (object)[
			'body' => 'Move locator defined map items from source (ex. rsc194) to target (ex. rsc197) adding new section_id based in the last section_id of destiny.<br>
					   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_locator.<br>
					   Note: this can be a very long process because it has to go through all the records in all the tables.',
			'files' => area_maintenance::get_definitions_files('move_locator')
		];
		$response->msg = 'OK. Request done successfully';
		$response->errors = [];


		return $response;
	}//end get_value



	/**
	* MOVE_LOCATOR
	* Executes a bulk locator migration across every Dédalo matrix table.
	*
	* For each JSON definition file selected by the operator, reads the
	* section-mapping declarations and calls `transform_data::changes_in_locators()`
	* which iterates the full set of matrix tables, rewriting every stored locator
	* string that matches an "old" section tipo to its "new" section tipo and
	* computing a fresh section_id offset based on the current counter of the
	* destination section.
	*
	* Dispatched through `dd_area_maintenance_api::widget_request()` (SEC-044).
	*
	* Validation:
	* - Returns early with an error if `files_selected` is empty.
	* - Filters the supplied file names against `get_definitions_files('move_locator')`
	*   (allowlist + realpath confinement, SEC-069) and returns early if none match.
	*
	* Side effects:
	* - Activity logging is suppressed for the duration of the migration inside
	*   `transform_data::changes_in_locators()` to prevent spurious TM entries.
	* - The operation is IRREVERSIBLE. It modifies rows in all matrix tables and
	*   uses the destination counter to compute new section_ids; there is no rollback.
	* - (!) Can run for a very long time on large databases — the UI should set an
	*   appropriate HTTP/CLI timeout or run the request asynchronously.
	*
	* @param object $options - Caller-supplied options object:
	*   {
	*     files_selected: array<string>  // e.g. ['people_rsc194_to_rsc197.json']
	*   }
	* @return object $response - stdClass with:
	*   result  : bool   — true on success; false on any failure
	*   msg     : string — human-readable status
	*   errors  : array<string> — validation or execution errors
	*/
	public static function move_locator(object $options): object
	{

		$response = new stdClass();
		$response->result = false;
		$response->msg = 'Error. Request failed [' . __METHOD__ . ']';
		$response->errors = [];

		// options
		$files_selected = $options->files_selected;
		if (empty($files_selected)) {
			$response->errors[] = 'empty files_selected';
			return $response;
		}

		// files
		// Re-read the allowed file list from disk (with SEC-069 confinement) and
		// intersect with the caller-supplied names to prevent path-traversal attacks.
		$definitions_files = area_maintenance::get_definitions_files('move_locator');
		$json_files = array_filter($definitions_files, function ($el) use ($files_selected) {
			return in_array($el->file_name, $files_selected);
		});
		if (empty($json_files)) {
			$response->errors[] = 'json_files not found';
			return $response;
		}

		// ar_file_name
		// Re-index to a plain 0-based array of bare file names so that
		// transform_data::changes_in_locators() can build its own full paths.
		$ar_file_name = array_values(
			array_map(function ($el) {
				return $el->file_name;
			}, $json_files)
		);

		// process changes_in_tipos
		// Exhaustive list of all matrix tables that may store locator strings.
		// If a new matrix table is introduced it must be added here as well.
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
		require_once DEDALO_CORE_PATH . '/base/upgrade/class.transform_data.php';
		$result = transform_data::changes_in_locators(
			$ar_tables,
			$ar_file_name
		);

		$response->result = $result;
		$response->msg = ($result === false)
			? 'Error. changes_in_locators failed'
			: 'OK. request done successfully';


		return $response;
	}//end move_locator



}//end move_locator