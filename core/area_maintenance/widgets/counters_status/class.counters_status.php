<?php declare(strict_types=1);
/**
* COUNTERS_STATUS
* Maintenance widget that surfaces the current state of all PostgreSQL
* section-ID counters stored in matrix_counter.
*
* Responsibilities:
* - Providing the server-side data probe that the browser widget polls via
*   dd_area_maintenance_api::get_widget_value(). The single public method
*   get_value() delegates all heavy lifting to counter::check_counters() and
*   returns a normalised response object the JS layer can render directly.
*
* How it fits in area_maintenance:
*   area_maintenance::get_ar_widgets() registers an item with id='counters_status'
*   in the 'integrity' category. The browser calls get_widget_value with
*   source.model='counters_status', which dynamically includes this file and
*   invokes get_value() through call_user_func (SEC-050 path-confinement applies).
*
* Related classes:
*   counter              — abstract class owning matrix_counter logic; supplies
*                          check_counters() which does the actual DB audit
*   dd_area_maintenance_api — routes API calls; get_widget_value() is the entry
*                          point for this class's only public method
*   counters_status (JS) — browser widget (js/counters_status.js); renders the
*                          datalist and exposes reset / fix actions via modify_counter
*
* Data shape returned by get_value():
*   result   array|false  — { datalist: item_info[], errors: string[] }
*                           where item_info = { section_tipo, label,
*                           counter_value, last_section_id }
*   msg      string       — human-readable summary
*   errors   array        — empty on success; populated only when get_value()
*                           itself encounters an unexpected state (distinct from
*                           counter-audit errors inside $result)
*
* @package Dédalo
* @subpackage Core
*/
class counters_status {



	/**
	* Allowlist of public API actions callable through widget_request (SEC-044).
	* get_value is also used as the read-only probe via get_widget_value.
	* @var array<int,string>
	*/
	const API_ACTIONS = [
		'get_value',
		'modify_counter'
	];



	/**
	* GET_VALUE
	* Runs the full matrix_counter audit and returns the result for the widget.
	*
	* This is the only public method. It is invoked by dd_area_maintenance_api::get_widget_value()
	* with no arguments via call_user_func; it must therefore be a no-argument static method
	* that is safe to call at any time as a read-only probe.
	*
	* Delegates entirely to counter::check_counters(), which:
	*   - reads every row in matrix_counter,
	*   - verifies each tipo is a 'section' model,
	*   - queries the corresponding data matrix table for the real maximum section_id,
	*   - collects both values so the UI can highlight drift (counter_value ≠ last_section_id).
	*
	* The datalist and errors arrays from check_counters are forwarded verbatim into
	* $response->result so the JS widget can inspect them without an extra unwrap.
	*
	* @return object - {
	*   result: array|false  { datalist: object[], errors: string[] },
	*   msg:    string,
	*   errors: array        top-level transport errors (normally empty)
	* }
	*/
	public static function get_value() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		$check_counters_response = counter::check_counters();

		$result = [
			'datalist' => $check_counters_response->datalist ?? [],
			'errors' => $check_counters_response->errors ?? []
		];

		// response
		$response->result	= $result;
		$response->msg		= empty($response->errors)
			? 'OK. Request done successfully'
			: 'Warning. Request done with errors';


		return $response;
	}//end get_value



	/**
	* MODIFY_COUNTER
	* Repairs ('fix') or resets ('reset') the section_id counter for a given section
	* tipo, then re-reads all counters so the client receives a fresh snapshot.
	*
	* Delegates to counter::modify_counter() (which enforces Global Admin internally)
	* and counter::check_counters(). session_write_close() is called at entry because
	* a 'fix' can scan a large matrix table and would otherwise block concurrent
	* requests from the same browser session.
	*
	* @param object $rqo - {
	*   options: {
	*     section_tipo:   string,  // ontology tipo of the section whose counter to repair
	*     counter_action: string   // 'reset' | 'fix'
	*   }
	* }
	* @return object - {result: bool, msg: string, datalist: array} (full counter status)
	*/
	public static function modify_counter( object $rqo ) : object {

		session_write_close();

		// options
			$options = $rqo->options;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__METHOD__.']';

		// short vars
			$section_tipo = $options->section_tipo;
			if (empty($section_tipo)) {
				$response->msg = 'Error: empty mandatory section_tipo';
				return $response;
			}
			$counter_action = $options->counter_action; // reset|fix

		// modify_counter
			// Returns false if the caller is not a Global Admin or if the action
			// is unknown; counter::modify_counter() logs its own error internally.
			$result = counter::modify_counter(
				$section_tipo,
				$counter_action
			);

		// check_counters
			// Always re-read all counters after the repair so the client receives a
			// fresh snapshot regardless of whether the repair succeeded or failed.
			$result_check_counters	= counter::check_counters();

		// response
			$response->result	= $result;
			$response->msg		= $result===true
				? 'OK. '.$counter_action.' counter successfully ' . $section_tipo
				: 'Error on '.$counter_action.' counter ' . $section_tipo;
			$response->datalist	= $result_check_counters->datalist ?? [];


		return $response;
	}//end modify_counter



}//end counters_status
