<?php declare(strict_types=1);
/**
* CLASS USER_ACTIVITY
* Widget that generates a graphic visualization of user activity over a date range.
*
* Responsibilities:
* - Reads optional date range from widget options (date_in, date_out); defaults to the
*   last year through today when options are absent.
* - Builds a three-tier data pipeline for the requested user (identified by section_id):
*     1. Saved aggregated stats from matrix_stats (via
*        diffusion_section_stats::cross_users_range_data()) — covers date_in..yesterday.
*     2. A live today-supplement bounded to 1 day of matrix_activity so today's work
*        is always reflected without waiting for the next logout catch-up.
*     3. A full-range live fallback when the saved-stats path returns nothing (e.g. on
*        first login before any catch-up has run), so the widget never appears blank
*        when activity actually exists.
* - Returns a single output item keyed "totals" that the client renderer consumes to
*   draw the activity charts.
*
* Data shape returned per IPO entry (wrapped in a stdClass):
*   { widget: string, key: int, widget_id: 'totals', value: object|null }
* The `value` object is canonical: { who, what, where, when, publish } — see
* diffusion_section_stats::cross_users_range_data() and ::merge_raw_into_canonical().
*
* NOTE: The catch-up recalculation (update_user_activity_stats) is intentionally NOT
* triggered here; it runs at user logout via a dedicated hook to avoid blocking HTTP
* responses with potentially years-long matrix_activity scans.
*
* Extends widget_common; consumed by component_info when is_async() returns true.
*
* @package Dédalo
* @subpackage Widgets
*/
class user_activity extends widget_common {

	/**
	* ISO 8601 date string (Y-m-d) marking the start of the activity window.
	* Populated from widget options if provided; otherwise get_data() falls back to
	* one year before today, bounding matrix_activity scans to a manageable range.
	* @var string|null $date_in
	*/
	protected ?string $date_in = null;

	/**
	* ISO 8601 date string (Y-m-d) marking the end of the activity window (inclusive).
	* Populated from widget options if provided; otherwise get_data() defaults to today.
	* Note that activity for today is always fetched live — the saved-stats cache never
	* includes the current day because it is not yet complete.
	* @var string|null $date_out
	*/
	protected ?string $date_out = null;

	/**
	* __CONSTRUCT
	* Initialises the widget by delegating common properties to widget_common and
	* extracting optional date-range override keys from the caller's options object.
	* @param object $options - widget instantiation options; must satisfy the
	*   widget_common::__construct() contract (section_tipo, section_id, mode, lang, ipo)
	*   and may additionally carry:
	*     date_in  (string|null) — ISO 8601 start of the activity window
	*     date_out (string|null) — ISO 8601 end of the activity window
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
	* Fetch aggregated user activity statistics for the configured date range and
	* return them as a structured array consumable by the client renderer.
	*
	* The method implements a three-tier strategy to ensure the widget always shows
	* current data without blocking on long matrix_activity scans:
	*
	*   Tier 1 — Saved range (date_in .. yesterday):
	*     Calls diffusion_section_stats::cross_users_range_data() which reads the
	*     pre-aggregated matrix_stats records accumulated by the logout catch-up hook.
	*     Fast: single SQL against matrix_stats, not matrix_activity.
	*
	*   Tier 2 — Today supplement:
	*     When the requested window includes today, calls
	*     diffusion_section_stats::get_interval_raw_activity_data() for a single day
	*     (today..tomorrow) and merges it into the saved-range result.
	*     This is bounded and cheap: at most one day of raw rows.
	*
	*   Tier 3 — Live full-range fallback:
	*     When tiers 1+2 produced nothing (first login before catch-up, or the stats
	*     table has no record for this user yet), re-aggregates the full requested window
	*     directly from matrix_activity. Logs a WARNING so operators can investigate.
	*
	* Expected IPO shape (from ontology properties):
	* {
	*   "input":  [],
	*   "output": [{ "id": "totals", "value": "object" }]
	* }
	*
	* Sample returned array element:
	* {
	*   "widget":    "user_activity",
	*   "key":       0,
	*   "widget_id": "totals",
	*   "value":     { who: {...}, what: {...}, where: {...}, when: [...], publish: {...} }
	* }
	*
	* @return array|null $data - One stdClass item per IPO entry, or null if IPO is empty.
	*   Each item has: widget (string), key (int), widget_id (string), value (?object).
	*   value is null when no activity was found on any tier.
	*/
	public function get_data() : ?array {

		$ipo			= $this->ipo ?? [];
		$user_id		= $this->section_id;
		$user_id_int	= (int)$user_id;

		// today / tomorrow strings
		// A single DateTime instance is cloned for every derived string so all
		// date calculations stay consistent within this request.
		$today_dt		= new DateTime();
		$today_str		= $today_dt->format('Y-m-d');
		$tomorrow_str	= (clone $today_dt)->modify('+1 day')->format('Y-m-d');

		// date range — resolve from widget options or apply safe defaults
		// Default date_in is '-1 year' (not epoch) to keep matrix_activity fallback
		// scans bounded; scanning from year 2000 forward would be prohibitively slow
		// for active users.
		$date_in	= $this->date_in ?? (clone $today_dt)->modify('-1 year')->format('Y-m-d');
		$date_out	= $this->date_out ?? $today_str;
		$lang		= DEDALO_DATA_LANG; // passed to stat helpers for label localisation

		// NOTE: catch-up intentionally skipped here
		// update_user_activity_stats() runs at user logout via a dedicated hook —
		// NOT on every widget load. Calling it here would trigger a potentially
		// years-long matrix_activity scan and block the HTTP response.
		// Instead this method uses the three-tier pipeline documented in the doc-block above.

		$data = [];
		foreach ($ipo as $ipo_key => $current_ipo) {

			// Tier 1 — saved range upper bound is yesterday
			// Today is never written to matrix_stats (the catch-up hook always stops
			// at yesterday, because the current day is not yet complete).
			// When the caller's date_out is in the past, honour it as-is.
			$end_saved = ($date_out >= $today_str)
				? (clone $today_dt)->modify('-1 day')->format('Y-m-d')
				: $date_out;

			// 2) Read aggregated saved range with a single SQL against matrix_stats.
			// Guard: if end_saved has fallen before date_in (e.g. date_in is today),
			// skip the saved-stats query entirely; there is nothing to aggregate.
			$totals = ($end_saved >= $date_in)
				? diffusion_section_stats::cross_users_range_data(
					$date_in,
					$end_saved,
					$user_id_int,
					$lang
				)
				: null;

			// 3) Supplement today's slice live (bounded: 1 day of matrix_activity).
			// This runs only when the window includes today; it merges the raw rows
			// from the current day on top of whatever the saved-stats query returned.
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

			// 4) Last-resort live fallback
			// When tiers 1+2 still produced nothing (catch-up hasn't run yet, or
			// matrix_stats has no record for this user), re-aggregate the full
			// requested window directly from matrix_activity so the widget is never
			// blank when activity actually exists.  Logs a WARNING so operators can
			// detect users whose stats need a manual catch-up run.
			$is_empty = self::is_canonical_empty($totals);
			if ($is_empty) {
				debug_log(__METHOD__
					." Cache-driven path empty for user $user_id_int, range $date_in..$date_out — falling back to live full-range aggregation."
					, logger::WARNING
				);
				$raw_full = diffusion_section_stats::get_interval_raw_activity_data(
					$user_id_int,
					$date_in,
					$tomorrow_str // include today by using tomorrow as the exclusive upper bound
				);
				if (!empty($raw_full)) {
					$totals = diffusion_section_stats::merge_raw_into_canonical(
						null,
						$raw_full,
						$lang
					);
				}
			}

			// Build output item. value is the canonical stats object or null when
			// no activity was found on any tier.
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
	* Returns true when a canonical stats object contains no actionable activity data.
	*
	* The canonical shape produced by diffusion_section_stats::cross_users_range_data()
	* and ::merge_raw_into_canonical() is:
	*   {
	*     who     : object  — counts by user section_id
	*     what    : object  — counts by action tipo (dd545 values)
	*     where   : object  — counts by location tipo (dd546 values, e.g. which section)
	*     when    : array   — 24 entries, one per hour, each { hour: int, value: int }
	*     publish : object  — counts by published section_tipo (dd1223 rows only)
	*   }
	*
	* Rules:
	* - null or a non-object input is unconditionally empty.
	* - `what`, `where`, `publish`, and `who` are empty when the property is absent or falsy.
	* - `when` is empty only when EVERY entry has value === 0. The helper pre-fills a
	*   24-slot array with zeroes, so a non-empty `when` array with all-zero values
	*   still counts as empty (no real activity logged yet).
	*
	* @param mixed $totals - Canonical stats object, or null/non-object for trivially empty.
	* @return bool - true when the object contains no activity data in any dimension.
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
	* Declares that this widget fetches its data asynchronously.
	*
	* When true, the hosting component_info skips any synchronous get_data() call
	* during server-side rendering and instead signals the client to perform an
	* API request after page load. The widget JavaScript uses the dd_component_info
	* API endpoint to retrieve the data returned by get_data().
	*
	* user_activity is always async because its data pipeline (matrix_stats + optional
	* matrix_activity live queries) can be slow and must not delay the initial page render.
	*
	* @return bool - always true
	*/
	public function is_async() : bool {

		return true;
	}//end is_async



}//end user_activity class
