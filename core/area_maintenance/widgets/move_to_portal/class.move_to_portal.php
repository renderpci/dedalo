<?php declare(strict_types=1);
/**
* MOVE_TO_PORTAL
* Area-maintenance widget that bulk-migrates component data from a source section
* into a new portal-linked target section across the entire Dédalo matrix.
*
* "Portalization" is the structural operation of splitting data that was previously
* stored flat inside one section (the source) out into a dedicated subordinate
* section (the target) and tying the two together through a portal component. For
* example, "Use and function" components that lived directly inside object record
* section qdp1 may be moved into a specialised sub-section tch10, with a portal
* component (e.g. tch551) on the new record establishing the relation back to the
* original object. This widget drives that batch operation for every record of the
* source section.
*
* Responsibilities:
* - Expose `get_value()` so the maintenance UI can display a usage summary and
*   let the operator browse available JSON definition files before committing.
* - Expose `move_to_portal()` so the API can execute the portalization against the
*   full dataset, delegating the heavy work to `transform_data::portalize_data()`.
*
* Definition files live at:
*   DEDALO_CORE_PATH/base/transform_definition_files/move_to_portal/*.json
* Each file is a JSON array of transform objects. Each object has the shape:
*   {
*     "source_section": "qdp1",       // tipo of the section to read data from
*     "target_section": "tch10",      // tipo of the section to create records in
*     "portal":         "tch551",     // portal component tipo linking the two sections
*     "components": [
*       {
*         "source_tipo": "qdp191",    // component to copy/move from the source record
*         "target_tipo": "tch191",    // component to write to on the new target record
*         "info":        "..."        // human-readable description (ignored at runtime)
*       },
*       ...
*     ]
*   }
*
* Security: the API surface is gated by `API_ACTIONS` (SEC-044). The definition-
* file list is restricted by `area_maintenance::get_definitions_files()` via an
* allowlist + realpath confinement check (SEC-069), so operator-supplied file
* names cannot escape the `transform_definition_files/move_to_portal` directory.
*
* WARNING: portalization iterates every record in the source section, creates new
* rows in the target section, rewrites component data, and establishes portal
* relations. It is IRREVERSIBLE and can run for a very long time on large databases.
* Always take a full backup before invoking.
*
* Extended by: nothing (standalone widget class)
* API entry point: dd_area_maintenance_api::widget_request()
*
* @package Dédalo
* @subpackage Core
*/
class move_to_portal {



	/**
	* Allowlist of API action names callable through `dd_area_maintenance_api::widget_request`.
	*
	* SEC-044: only the method names present in this constant may be dispatched by the
	* widget_request gateway. `get_value` is excluded because it is dispatched through
	* the hard-coded `get_widget_value` path and is therefore not listed here.
	*
	* @var array<string> API_ACTIONS
	*/
	public const API_ACTIONS = [
		'move_to_portal'
	];



	/**
	* GET_VALUE
	* Returns the widget's initial display value for the maintenance UI.
	*
	* Called by `area_maintenance::get_widget_value()` (hard-coded, not via
	* `widget_request`) to populate the widget panel before the operator triggers a
	* migration. The response carries:
	*   - `body`  — a human-readable description of what move_to_portal does and
	*               where its definition files are located.
	*   - `files` — the list of available JSON definition files discovered by
	*               `area_maintenance::get_definitions_files('move_to_portal')`.
	*               Each element is `{file_name: string, content: mixed}`.
	*
	* The UI uses the `files` list to render a selection control so the operator
	* can choose which definition file(s) to apply before calling `move_to_portal()`.
	*
	* @return object $response - stdClass with:
	*   result  : object {body: string, files: array<object>}
	*   msg     : string
	*   errors  : array<string>
	*/
	public static function get_value() : object {

		$response = new stdClass();
		$response->result = (object)[
			'body' => 'Move data from a section to another linked section and link together with a portal (e.g. "Use and function" components behind qdp443 to section rsc1340).<br>
					   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_to_portal.<br>
					   Note: this can be a very long process because it has to go through all the records in all the tables.',
			'files' => area_maintenance::get_definitions_files('move_to_portal')
		];
		$response->msg = 'OK. Request done successfully';
		$response->errors = [];


		return $response;
	}//end get_value



	/**
	* MOVE_TO_PORTAL
	* Executes a bulk portalization migration across the full Dédalo matrix.
	*
	* For each JSON definition file selected by the operator, reads the
	* portalization declarations and calls `transform_data::portalize_data()`.
	* That method iterates every record of the source section, creates a new
	* record in the target section for each one, copies the specified component
	* data from the source to the new target record, establishes the portal
	* relation, and clears the original component data from the source record.
	*
	* Dispatched through `dd_area_maintenance_api::widget_request()` (SEC-044).
	*
	* Validation:
	* - Returns early with an error if `files_selected` is empty.
	* - Filters the supplied file names against
	*   `get_definitions_files('move_to_portal')` (allowlist + realpath
	*   confinement, SEC-069) and returns early if none of the supplied names
	*   match an on-disk definition file.
	*
	* Side effects:
	* - Activity logging is suppressed inside `transform_data::portalize_data()`
	*   to prevent the migration from generating spurious audit entries.
	* - Time Machine recording is disabled during source-data cleanup to avoid
	*   leaking intermediate states into the TM history.
	* - The operation is IRREVERSIBLE. New target-section records are created
	*   and source component data is set to null; there is no automated rollback.
	* - (!) Can run for a very long time on large databases — the UI should set
	*   an appropriate HTTP/CLI timeout or run the request asynchronously.
	*
	* @param object $options - Caller-supplied options object:
	*   {
	*     files_selected: array<string>  // e.g. ['qdp_portalize_to_tch.json']
	*   }
	* @return object $response - stdClass with:
	*   result  : bool   — true on success; false on any failure (portalize_data
	*                       returns false on the first unrecoverable error)
	*   msg     : string — human-readable status message
	*   errors  : array<string> — validation or execution error messages
	*/
	public static function move_to_portal(object $options): object
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
		$definitions_files = area_maintenance::get_definitions_files('move_to_portal');

		$json_files = array_filter($definitions_files, function ($el) use ($files_selected) {
			return in_array($el->file_name, $files_selected);
		});
		if (empty($json_files)) {
			$response->errors[] = 'json_files not found';
			return $response;
		}

		// ar_file_name
		// Re-index to a plain 0-based array of bare file names so that
		// transform_data::portalize_data() can build its own full paths.
		$ar_file_name = array_values(
			array_map(function ($el) {
				return $el->file_name;
			}, $json_files)
		);


		require_once DEDALO_CORE_PATH . '/base/upgrade/class.transform_data.php';
		$result = transform_data::portalize_data(
			$ar_file_name
		);

		$response->result = $result;
		$response->msg = ($result === false)
			? 'Error. changes_in_locators failed'
			: 'OK. request done successfully';


		return $response;
	}//end move_to_portal



}//end move_to_portal
