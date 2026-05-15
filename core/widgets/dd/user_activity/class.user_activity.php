<?php declare(strict_types=1);
/**
 * CLASS USER_ACTIVITY
 *
 * DRAFT UNFINISHED! Creates a graphic visualization of whole user activity
 *
 * Widget that generates a graphic visualization of user activity over a date
 * range. It fetches aggregated statistics from the diffusion system for the
 * current user (derived from section_id) and a configurable date window.
 *
 * Key features:
 * - Reads date range from request parameters with sensible defaults
 * - Calls diffusion_section_stats::cross_users_range_data() for aggregated totals
 * - Returns a single keyed output item ("totals") consumed by the client renderer
 * - DRAFT / UNFINISHED: additional transcription tag counting logic is commented out
 *
 * @package Dédalo
 * @subpackage Widgets
 */
class user_activity extends widget_common {



	/**
	* GET_DATA
	* Fetch aggregated user activity statistics for a date range.
	*
	* Expected IPO sample (from ontology properties):
	* {
	*   "input": [],
	*   "output": [
	*     { "id": "totals", "value": "object" }
	*   ]
	* }
	*
	* The date range is controlled by request parameters:
	*   date_in  : optional, defaults to "2000-01-01"
	*   date_out : optional, defaults to today
	*
	* Sample returned data item:
	* {
	*   "widget": "user_activity",
	*   "key": 0,
	*   "widget_id": "totals",
	*   "value": { ...aggregated stats object... }
	* }
	*
	* Usage:
	*   $widget = widget_common::get_instance((object)[
	*       'widget_name'   => 'user_activity',
	*       'path'          => 'dd/user_activity',
	*       'section_tipo'  => 'test1',
	*       'section_id'    => '123',
	*       'mode'          => 'list',
	*       'ipo'           => $ipo_from_ontology
	*   ]);
	*   $data = $widget->get_data();
	*
	* @return array|null $data Array of objects
	*/
	public function get_data() : ?array {

		$section_tipo	= $this->section_tipo;
		$section_id		= $this->section_id;
		$ipo			= $this->ipo ?? [];
		$lang			= $this->lang;
		$mode			= 'list';

		$data = [];
		foreach ($ipo as $ipo_key => $current_ipo) {

			// data
			$date_in	= $_REQUEST['date_in'] ?? '2000-01-01';
			$today		= new DateTime();
			$date_out	= $_REQUEST['date_out'] ?? $today->format("Y-m-d");
			$user_id	= (int)$section_id;
			$lang		= DEDALO_DATA_LANG;
			$totals		= diffusion_section_stats::cross_users_range_data($date_in, $date_out, $user_id, $lang);

			// add data
			$current_data = new stdClass();
				$current_data->widget		= get_class($this);
				$current_data->key			= $ipo_key;
				$current_data->widget_id	= 'totals';
				$current_data->value		= $totals;

			$data[] = $current_data;
		}//end foreach ($ipo as $ipo_key => $current_ipo)


		return $data;
	}//end get_data



}//end user_activity class
