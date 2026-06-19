<?php declare(strict_types=1);
/**
* EXPORT_HIERARCHY
* Area-maintenance widget that surfaces hierarchy dump and sync operations to the UI.
*
* This class is the thin widget adapter layer between `dd_area_maintenance_api`
* (HTTP gateway) and `hierarchy` (business logic). It implements the two-method
* widget contract expected by `dd_area_maintenance_api::widget_request` /
* `get_widget_value`:
*
*   - get_value()                  — read-only probe; returns the configured
*                                    EXPORT_HIERARCHY_PATH so the browser widget
*                                    can display the destination directory.
*   - export_hierarchy()           — triggers hierarchy::export_hierarchy() to dump
*                                    one or more thesaurus matrix tables to
*                                    gzip-compressed psql COPY files on disk.
*   - sync_hierarchy_active_status() — delegates to hierarchy::sync_hierarchy_active_status()
*                                    to bring the "Active" flag in sync with the
*                                    "Active in thesaurus" field for each hierarchy section.
*
* Security model (SEC-044):
*   API_ACTIONS enumerates every method that `dd_area_maintenance_api::widget_request`
*   may dispatch to this class. Methods not listed are invisible to remote callers.
*   `get_value` is invoked via the separate `get_widget_value` path (which hard-codes
*   the method name) and therefore does NOT need to appear in API_ACTIONS.
*
* @see hierarchy::export_hierarchy()             — performs the actual psql dump
* @see hierarchy::sync_hierarchy_active_status() — performs the active-flag sweep
* @see dd_area_maintenance_api::widget_request() — dispatcher that enforces SEC-044
* @see dd_area_maintenance_api::get_widget_value() — dispatcher for the polling probe
*
* @package Dédalo
* @subpackage Core
*/
class export_hierarchy {



	/**
	* SEC-044: methods callable through `dd_area_maintenance_api::widget_request`.
	* `get_value` is invoked through `get_widget_value` (hard-coded method) and
	* therefore not listed here.
	* @var array<string>
	*/
	public const API_ACTIONS = [
		'export_hierarchy',
		'sync_hierarchy_active_status'
	];



	/**
	* GET_VALUE
	* Read-only probe that returns the widget's current configuration state.
	*
	* Called by `dd_area_maintenance_api::get_widget_value` (which hard-codes the
	* method name to 'get_value') whenever the browser widget polls for a refresh.
	* The result object is consumed by the JS render layer to display the target
	* export directory to the operator.
	*
	* Return shape:
	*   result->export_hierarchy_path  string|null  Value of EXPORT_HIERARCHY_PATH
	*                                               if the constant is defined;
	*                                               null otherwise (signals that
	*                                               the server is not configured).
	*
	* (!) The first $response initialisation block is overwritten immediately below
	* without being returned — it is dead code. The method always reaches the second
	* assignment and returns the success response.
	*
	* @return object $response  stdClass {result: object, msg: string, errors: array}
	*/
	public static function get_value() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		$result = (object)[
			'export_hierarchy_path' => (defined('EXPORT_HIERARCHY_PATH')
				? EXPORT_HIERARCHY_PATH
				: null)
		];

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end get_value



	/**
	* EXPORT_HIERARCHY
	* Widget entry-point that validates options and delegates to hierarchy::export_hierarchy().
	*
	* Accepts a $options object from the RQO carrying the target section tipo(s).
	* After validating that section_tipo is non-empty, the call is forwarded verbatim
	* to hierarchy::export_hierarchy(), which:
	*   - Accepts '*'  — all currently active hierarchies (one file per tipo).
	*   - Accepts 'all' — every row in matrix_hierarchy into one timestamped file.
	*   - Accepts a comma-separated list of specific section tipos.
	*
	* The underlying method writes gzip-compressed psql COPY files to the directory
	* defined by the EXPORT_HIERARCHY_PATH server constant, then returns download
	* links in the response message.
	*
	* (!) If EXPORT_HIERARCHY_PATH is not defined on the server, hierarchy::export_hierarchy()
	* will return an error response. This widget layer does not re-check that constant.
	*
	* @param object $options  stdClass carrying:
	*   - section_tipo  string  Export scope: '*', 'all', or comma-separated tipo list.
	* @return object $response  stdClass {result: bool, msg: string, errors: array}
	*   Passes through the response from hierarchy::export_hierarchy() unchanged.
	*/
	public static function export_hierarchy(object $options) : object {

		// options
			$section_tipo = $options->section_tipo ?? null;

			if (empty($section_tipo)) {
				return (object)[
					'result'	=> false,
					'msg'		=> 'Empty section tipo',
					'errors'	=> ['Empty section tipo']
				];
			}

		// export_hierarchy
			$response = hierarchy::export_hierarchy($section_tipo);


		return $response;
	}//end export_hierarchy




	/**
	* SYNC_HIERARCHY_ACTIVE_STATUS
	* Widget entry-point that delegates to hierarchy::sync_hierarchy_active_status().
	*
	* The underlying method iterates every active hierarchy section and, for any
	* that are NOT marked "active in thesaurus", sets their "Active" component to
	* the "No" value — keeping the two flags consistent. Certain hierarchies
	* (e.g. 'rsc197' People) are excluded by a hard-coded ignore list inside the
	* delegate.
	*
	* The bool return value from hierarchy::sync_hierarchy_active_status() (true if
	* all saves succeeded, false if one or more failed) is wrapped in the standard
	* widget response envelope so the caller receives a uniform shape.
	*
	* @return object $response  stdClass {result: bool, msg: string, errors: array}
	*   - result  bool  true when all active-flag saves succeeded (or nothing to do);
	*                   false if at least one save failed.
	*/
	public static function sync_hierarchy_active_status() : object {

		$result = hierarchy::sync_hierarchy_active_status();

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end sync_hierarchy_active_status



}//end export_hierarchy
