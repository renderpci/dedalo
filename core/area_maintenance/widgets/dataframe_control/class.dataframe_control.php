<?php declare(strict_types=1);
/**
* DATAFRAME_CONTROL
* Maintenance widget for the dataframe pairing integrity:
* - reports frame locators whose main data item no longer exists (orphans)
* - reports legacy (pre-migration) frames pending the v7 unification
* - optionally removes orphan frame locators (frame TARGET records are never
*   touched: time machine needs them)
* Logic lives in dataframe_v7_migration::integrity_check (shared with CLI
* and the update pipeline).
*/

require_once DEDALO_CORE_PATH . '/base/upgrade/class.dataframe_v7_migration.php';


/**
* CLASS DATAFRAME_CONTROL
* Area-maintenance widget that audits and optionally repairs dataframe
* pairing-locator integrity.
*
* Responsibilities:
* - Expose an area_maintenance widget API for checking and fixing dataframe
*   locator integrity without requiring CLI access.
* - Delegate all scanning and repair logic to dataframe_v7_migration::integrity_check,
*   keeping this class thin: it only drives the call and shapes the response.
*
* Context:
* Dataframe pairing locators live in the relation column of the same section
* record as the main component (under the frame-slot tipo key). Each locator
* carries an id_key referencing the stable, server-minted item id of the paired
* main datum. An "orphan" locator is one whose id_key no longer matches any item
* in the main component's dato array (the main value was deleted). A "legacy"
* locator predates the v7 migration and has not yet been re-keyed (it lacks
* the DEDALO_RELATION_TYPE_DATAFRAME marker and the id_key field).
*
* Orphan cleanup:
* run_fix removes the orphan locators only; it never deletes the frame TARGET
* records (e.g. a dd1706 label section) because the Time Machine must be able
* to render past states that referenced them.
*
* Registered in the area_maintenance widget system. The three API_ACTIONS map
* 1-to-1 to widget_request calls from the browser.
*
* @package Dédalo
* @subpackage Core
*/
class dataframe_control {



	/**
	* Allowlist of public API actions callable through widget_request.
	* Enforces SEC-044: only these method names may be dispatched by the
	* widget request handler; any other name is rejected before execution.
	*
	* - 'get_value'  : read-only refresh of the widget's displayed value
	* - 'run_check'  : dry-run integrity scan (no writes)
	* - 'run_fix'    : destructive scan that removes orphan locators
	* @var array<int,string>
	*/
	// API_ACTIONS. Allowlist of methods callable through widget_request (SEC-044)
	const API_ACTIONS = [
		'get_value',
		'run_check',
		'run_fix'
	];



	/**
	* GET_VALUE
	* Returns the widget's current display value by running a read-only
	* integrity scan and returning its formatted response object.
	*
	* Called by the area_maintenance widget renderer to populate the widget
	* tile on first load or after a manual refresh. Delegates entirely to
	* run_check with a fresh (empty) request object.
	* @return object $response - same shape as run_check / build_response
	*/
	public static function get_value() : object {

		return self::run_check( new stdClass() );
	}//end get_value



	/**
	* RUN_CHECK
	* Performs a read-only integrity scan of all dataframe pairing locators
	* and returns a structured report without modifying any data.
	*
	* Delegates to dataframe_v7_migration::integrity_check with $save=false.
	* The scan covers matrix tables, matrix_time_machine, and matrix_activity.
	* Counts are always exact; detail item lists are capped by
	* dataframe_v7_migration::$max_report_items.
	*
	* Typical use: run before run_fix to preview the scope of orphan removal.
	* @param object $rqo - widget request object (fields unused; signature required by widget API)
	* @return object $response - see build_response for the full response shape
	*/
	public static function run_check( object $rqo ) : object {

		$report = dataframe_v7_migration::integrity_check( null, false );

		return self::build_response( $report, false );
	}//end run_check



	/**
	* RUN_FIX
	* Performs a live integrity scan that removes orphan frame locators and
	* returns a report of what was changed.
	*
	* Delegates to dataframe_v7_migration::integrity_check with $save=true.
	* Only the orphan pairing LOCATOR entries (the small stdClass objects inside
	* the relation column of the main component's section record) are deleted.
	* The frame TARGET records (e.g. rows in a dd1706 section) are never touched,
	* ensuring the Time Machine can still render past states that referenced them.
	* @param object $rqo - widget request object (fields unused; signature required by widget API)
	* @return object $response - see build_response for the full response shape
	*/
	public static function run_fix( object $rqo ) : object {

		$report = dataframe_v7_migration::integrity_check( null, true );

		return self::build_response( $report, true );
	}//end run_fix



	/**
	* BUILD_RESPONSE
	* Converts the raw report object from dataframe_v7_migration::integrity_check
	* into the normalised widget API response shape expected by the browser client.
	*
	* The response shape:
	* - result   : flat object with renamed counters and item lists (see below)
	* - msg      : human-readable summary string; indicates errors, orphan counts
	*              or (when $fixed=true) the number of removed orphan locators;
	*              also appends legacy-frame count when > 0 in read-only mode
	* - errors   : array of error strings from the scan, if any
	*
	* Result property mapping from the raw report:
	* - scanned           : number of section records examined
	* - frames_checked    : number of individual frame locator entries evaluated
	* - orphans           : $report->unresolved (locators with no matching main item)
	* - orphan_items      : $report->unresolved_items (detail strings, capped at max_report_items)
	* - legacy_unmigrated : locators that still carry the pre-v7 shape (no id_key / no dd490 type)
	* - orphans_fixed     : number of orphan locators actually removed ($fixed=true only)
	* - errors            : array of error strings from the scan
	*
	* (!) $report->result===false signals a hard scan failure, not just "no orphans found".
	*     Check this property before trusting the counters.
	* @param object $report - raw response object from dataframe_v7_migration::integrity_check
	* @param bool $fixed    - true when the scan ran in write mode (run_fix); false for dry-run
	* @return object $response
	*/
	private static function build_response( object $report, bool $fixed ) : object {

		$response = new stdClass();
			$response->result	= (object)[
				'scanned'			=> $report->scanned,
				'frames_checked'	=> $report->frames_checked,
				'orphans'			=> $report->unresolved,
				'orphan_items'		=> $report->unresolved_items,
				'legacy_unmigrated'	=> $report->legacy_unmigrated,
				'orphans_fixed'		=> $report->orphans_fixed,
				'errors'			=> $report->errors
			];
			$response->msg = $report->result===false
				? 'Error. Integrity scan finished with errors'
				: ($fixed
					? 'OK. Integrity scan done. Orphans removed: '.$report->orphans_fixed
					: 'OK. Integrity scan done. Orphans found: '.$report->unresolved
					 .($report->legacy_unmigrated>0 ? ' - legacy (pre-migration) frames: '.$report->legacy_unmigrated : ''));
			$response->errors = $report->errors;


		return $response;
	}//end build_response



}//end dataframe_control
