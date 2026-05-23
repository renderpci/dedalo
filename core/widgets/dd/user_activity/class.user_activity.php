<?php declare(strict_types=1);
/**
 * CLASS USER_ACTIVITY
 *
 * Widget that generates a graphic visualization of user activity over a date
 * range. It fetches aggregated statistics from the diffusion system for the
 * current user (derived from section_id) and a configurable date window.
 *
 * Key features:
 * - Reads date range from widget options (date_in, date_out) with sensible defaults
 * - Calls diffusion_section_stats::cross_users_range_data() for aggregated totals
 * - Supplements today live (1-day matrix_activity scan, fast)
 * - Falls back to live aggregation when cache is empty
 * - Returns a single keyed output item ("totals") consumed by the client renderer
 *
 * @package Dédalo
 * @subpackage Widgets
 */
class user_activity extends widget_common {

	/**
	 * Optional date range start. Configured via widget options.
	 * When null, defaults to '-1 year'.
	 * @var string|null
	 */
	protected ?string $date_in = null;

	/**
	 * Optional date range end. Configured via widget options.
	 * When null, defaults to today.
	 * @var string|null
	 */
	protected ?string $date_out = null;

	/**
	* __CONSTRUCT
	* Capture widget-specific options from the caller.
	* @param object $options
	*/
	public function __construct(object $options) {

		parent::__construct($options);

		if (isset($options->date_in)) {
			$this->date_in = $options->date_in;
		}
		if (isset($options->date_out)) {
			$this->date_out = $options->date_out;
		}
	}//end __construct



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
	* The date range is configured via widget options:
	*   date_in  : optional, defaults to "-1 year" (only last year to bound matrix_activity scans)
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
	*       'ipo'           => $ipo_from_ontology,
	*       'date_in'       => '2024-01-01',  // optional
	*       'date_out'      => '2024-12-31'   // optional
	*   ]);
	*   $data = $widget->get_data();
	*
	* @return array|null $data Array of objects
	*/
	public function get_data() : ?array {

		$ipo			= $this->ipo ?? [];
		$user_id		= $this->section_id;
		$user_id_int	= (int)$user_id;

		// today / tomorrow strings used for today supplement
		$today_dt		= new DateTime();
		$today_str		= $today_dt->format('Y-m-d');
		$tomorrow_str	= (clone $today_dt)->modify('+1 day')->format('Y-m-d');

		// date range from widget options. Defaults to last year (not 2000-01-01)
		// to bound matrix_activity scans on the fallback path.
		$date_in	= $this->date_in ?? (clone $today_dt)->modify('-1 year')->format('Y-m-d');
		$date_out	= $this->date_out ?? $today_str;
		$lang		= DEDALO_DATA_LANG;

		// NOTE: catch-up (update_user_activity_stats) is intentionally NOT called
		// here — it runs at user logout via a dedicated hook. Calling it on every
		// widget access would scan matrix_activity across the full unprocessed gap
		// (potentially years), blocking the HTTP response. The widget relies on:
		//   1) saved stats (from logout runs)
		//   2) today's live supplement (bounded to 1 day)
		//   3) fallback to live aggregation when cache is empty

		$data = [];
		foreach ($ipo as $ipo_key => $current_ipo) {

			// saved range upper bound is yesterday (today is never persisted)
			$end_saved = ($date_out >= $today_str)
				? (clone $today_dt)->modify('-1 day')->format('Y-m-d')
				: $date_out;

			// 2) Read aggregated saved range with a single SQL.
			$totals = ($end_saved >= $date_in)
				? diffusion_section_stats::cross_users_range_data(
					$date_in,
					$end_saved,
					$user_id_int,
					$lang
				)
				: null;

			// 3) Supplement today's slice live (bounded: 1 day of matrix_activity).
			if ($date_out >= $today_str) {
				$raw_today = diffusion_section_stats::get_interval_raw_activity_data(
					$user_id_int,
					$today_str,
					$tomorrow_str
				);
				if (!empty($raw_today)) {
					$totals = diffusion_section_stats::merge_raw_into_canonical(
						$totals,
						$raw_today,
						$lang
					);
				}
			}

			// 4) Last-resort live fallback: if cache-driven path produced nothing
			//    (typically: catch-up couldn't run, or matrix_stats has no record
			//    yet for this user), aggregate the FULL requested range live so
			//    the widget never goes blank when activity actually exists.
			$is_empty = self::is_canonical_empty($totals);
			if ($is_empty) {
				debug_log(__METHOD__
					." Cache-driven path empty for user $user_id_int, range $date_in..$date_out — falling back to live full-range aggregation."
					, logger::WARNING
				);
				$raw_full = diffusion_section_stats::get_interval_raw_activity_data(
					$user_id_int,
					$date_in,
					$tomorrow_str // include today
				);
				if (!empty($raw_full)) {
					$totals = diffusion_section_stats::merge_raw_into_canonical(
						null,
						$raw_full,
						$lang
					);
				}
			}

			// add data (always canonical {who,what,where,when,publish} or null)
			$current_data = new stdClass();
				$current_data->widget		= get_class($this);
				$current_data->key			= $ipo_key;
				$current_data->widget_id	= 'totals';
				$current_data->value		= $totals;

			$data[] = $current_data;
		}//end foreach ($ipo as $ipo_key => $current_ipo)


		return $data;
	}//end get_data



	/**
	* IS_CANONICAL_EMPTY
	* True when a totals object has no actionable data in any dimension.
	* Treats a null/non-object input as empty. The `when` array is treated
	* as empty when every entry has `value === 0` (a 24-slot prefilled array
	* with all zeros counts as no activity).
	*
	* @param mixed $totals
	* @return bool
	*/
	private static function is_canonical_empty(mixed $totals) : bool {

		if ($totals === null || !is_object($totals)) {
			return true;
		}
		if (!empty($totals->what ?? null))    return false;
		if (!empty($totals->where ?? null))   return false;
		if (!empty($totals->publish ?? null)) return false;
		if (!empty($totals->who ?? null))     return false;
		if (!empty($totals->when ?? null)) {
			foreach ($totals->when as $entry) {
				if (is_object($entry) && (int)($entry->value ?? 0) > 0) {
					return false;
				}
			}
		}

		return true;
	}//end is_canonical_empty



	/**
	* IS_ASYNC
	* True when the widget loads its data asynchronously via API.
	* When true, component_info skips synchronous get_data() calls.
	* The widget JS fetches data using the dd_component_info API endpoint.
	* @return bool
	*/
	public function is_async() : bool {

		return true;
	}//end is_async



}//end user_activity class
