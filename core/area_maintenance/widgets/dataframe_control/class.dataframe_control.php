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


class dataframe_control {



	// API_ACTIONS. Allowlist of methods callable through widget_request (SEC-044)
	const API_ACTIONS = [
		'get_value',
		'run_check',
		'run_fix'
	];



	/**
	* GET_VALUE
	* Returns updated widget value (report-only integrity scan)
	* @return object $response
	*/
	public static function get_value() : object {

		return self::run_check( new stdClass() );
	}//end get_value



	/**
	* RUN_CHECK
	* Report-only integrity scan of the dataframe pairing locators
	* @param object $rqo
	* @return object $response
	*/
	public static function run_check( object $rqo ) : object {

		$report = dataframe_v7_migration::integrity_check( null, false );

		return self::build_response( $report, false );
	}//end run_check



	/**
	* RUN_FIX
	* Integrity scan removing the orphan frame locators
	* (frame target records are never deleted)
	* @param object $rqo
	* @return object $response
	*/
	public static function run_fix( object $rqo ) : object {

		$report = dataframe_v7_migration::integrity_check( null, true );

		return self::build_response( $report, true );
	}//end run_fix



	/**
	* BUILD_RESPONSE
	* @param object $report - integrity_check step response
	* @param bool $fixed
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
