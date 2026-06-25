<?php declare(strict_types=1);
/**
* CLASS REGISTER_TOOLS
* Area-maintenance widget that scans the filesystem for tool directories and
* imports their metadata into the Dédalo database.
*
* Responsibilities:
* - Provide a read-only refresh of the discoverable-tools list via get_value(),
*   including a pre-flight guard that confirms the ontology term 'dd1644'
*   (Developer field in matrix_tools) exists before the list is rendered.
* - Trigger a full tool import/re-registration cycle via register_tools(),
*   delegating all filesystem scanning and database persistence to
*   tools_register::import_tools().
*
* Widget contract:
* This class is registered in the area_maintenance widget system and is
* invoked by dd_area_maintenance_api::widget_request (for API_ACTIONS
* methods) and dd_area_maintenance_api::get_widget_value (for get_value,
* which is hard-coded in the API and therefore intentionally absent from
* API_ACTIONS). Both call paths enforce the SEC-044 two-layer security gate.
*
* Data flow:
* 1. get_value()       → tools_register::get_tools_files_list() → datalist array
* 2. register_tools()  → tools_register::import_tools()         → array of import-result objects
*
* @package Dédalo
* @subpackage Core
*/
class register_tools {

	/**
	* Allowlist of public API actions callable through widget_request.
	* Enforces SEC-044: only these method names may be dispatched by
	* dd_area_maintenance_api::widget_request. Any other method name is
	* rejected before execution.
	*
	* Note: get_value() is intentionally excluded. It is invoked via the
	* dedicated dd_area_maintenance_api::get_widget_value path, which
	* hard-codes the method name and applies its own security checks.
	* @var array<int,string>
	*/
	public const API_ACTIONS = [
		'register_tools'
	];



	/**
	* GET_VALUE
	* Returns a snapshot of the currently discoverable tools for the widget UI.
	* Called by dd_area_maintenance_api::get_widget_value (hard-coded method name;
	* therefore not listed in API_ACTIONS).
	*
	* Delegates filesystem discovery to tools_register::get_tools_files_list(),
	* which walks all registered tool roots and returns one object per tool
	* directory (name, version, developer, installed_version, warning).
	*
	* Pre-flight guard: checks that the ontology term 'dd1644' (the Developer
	* column in the matrix_tools table) is present in the loaded ontology. If
	* absent, the datalist is returned alongside an error message so the UI can
	* warn the user to update their ontology before proceeding.
	* @return object $response
	*   result->datalist  : array  - list of tool-info objects from the filesystem scan
	*   result->errors    : ?array - null when no errors; array of strings otherwise
	*   msg               : string
	*   errors            : array
	*/
	public static function get_value() : object {

		$tools_files_list = tools_register::get_tools_files_list();

		$result = (object)[
			'datalist'	=> $tools_files_list,
			'errors'	=> null
		];

		// matrix_tools field 'Developer' check
		// (!) If dd1644 is missing the entire matrix_tools schema is outdated;
		// the import will fail to store developer metadata, so warn early.
		if (empty(ontology_node::get_model_by_tipo('dd1644',true))) {
			$result->errors = ['Your Ontology is outdated. Term \'dd1644\' (Developer) do not exists'];
		}

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end get_value



	/**
	 * REGISTER_TOOLS
	 * Triggers a full tool import/re-registration cycle by delegating to
	 * tools_register::import_tools(). This is the primary write action of
	 * the widget; it re-scans all tool roots, parses each register.json,
	 * updates the 'Registered Tools' section (dd1324), and merges ontology
	 * definitions. The dd1324 section is fully re-created on each call.
	 *
	 * Error aggregation: import_tools() returns one result object per
	 * processed tool directory. Each object may carry an 'errors' property
	 * listing per-tool failures (e.g. missing register.json, schema
	 * conflicts, collision across tool roots). This method collects all
	 * per-tool errors into a flat array so the caller gets a unified view.
	 *
	 * The response msg is degraded to a warning string when any per-tool
	 * error is found, even if the overall import partially succeeded.
	 * @return object $response
	 *   result  : array|false - array of per-tool import-result objects on success, false on failure
	 *   msg     : string      - 'OK. Request done successfully' or 'Warning! Request done with errors'
	 *   errors  : array       - flat list of all per-tool error strings (empty when clean)
	 */
	public static function register_tools(): object
	{

		$response = new stdClass();
		$response->result = false;
		$response->msg = 'Error. Request failed [' . __METHOD__ . ']';

		// import_tools
		$response->result = tools_register::import_tools();

		// check results errors
		// Flatten per-tool error arrays from the import report into a single list.
		$errors = [];
		if (!empty($response->result)) {
			foreach ($response->result as $item) {
				if (!empty($item->errors)) {
					$errors = array_merge($errors, (array) $item->errors);
				}
			}
		}
		$response->errors = $errors;

		// msg
		$response->msg = empty($errors)
			? 'OK. Request done successfully'
			: 'Warning! Request done with errors';


		return $response;
	}//end register_tools



}//end register_tools
