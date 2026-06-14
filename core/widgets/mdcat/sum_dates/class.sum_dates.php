<?php declare(strict_types=1);
/**
 * CLASS SUM_DATES
 *
 * Widget that reads a sequence of date pairs (date_in / date_out) from linked
 * records (via a source portal), computes the interval for each pair, and sums
 * all intervals into a total duration. It also tracks estimated additions and
 * indeterminate gaps caused by missing or partial dates.
 *
 * Key features:
 * - Reads date_in and date_out components from each linked record
 * - Computes DateInterval between each date pair, handling partial dates
 * - When a date is missing, estimates a default interval ("1 day") and flags it
 * - Sums all intervals into a total duration object (sum_intervals)
 * - Separately sums estimated additions (sum_estitmated_time_add)
 * - Flags indeterminate intermediate gaps (estitmated_time_undefined)
 * - get_data_parsed() overrides to format intervals into human-readable localized text
 * - Consumed by render_sum_dates.js which formats year/month/day labels
 *
 * @package Dédalo
 * @subpackage Widgets
 */
class sum_dates extends widget_common {



	/**
	* GET_DATA
	* Resolve the widget IPO configuration into summed date intervals from linked
	* records, including raw interval objects and estimation flags.
	*
	* Expected IPO sample (from ontology properties):
	* {
	*   "input": [
	*     { "type": "source",   "section_tipo": "current", "component_tipo": "mdcat1" },
	*     { "type": "date_in",  "section_tipo": "current", "component_tipo": "mdcat2" },
	*     { "type": "date_out", "section_tipo": "current", "component_tipo": "mdcat3" }
	*   ],
	*   "output": [
	*     { "id": "sum_intervals" },
	*     { "id": "sum_estitmated_time_add" },
	*     { "id": "estitmated_time_undefined" }
	*   ]
	* }
	*
	* Sample returned data items:
	* {
	*   "widget": "sum_dates",
	*   "key": 0,
	*   "widget_id": "sum_intervals",
	*   "value": { "y": 2, "m": 3, "d": 15, "h": 0, "i": 0, "s": 0 }
	* }
	* {
	*   "widget": "sum_dates",
	*   "key": 0,
	*   "widget_id": "estitmated_time_undefined",
	*   "value": true
	* }
	*
	* Usage:
	*   $widget = widget_common::get_instance((object)[
	*       'widget_name'   => 'sum_dates',
	*       'path'          => 'mdcat/sum_dates',
	*       'section_tipo'  => 'mdcat1',
	*       'section_id'    => '123',
	*       'mode'          => 'edit',
	*       'ipo'           => $ipo_from_ontology
	*   ]);
	*   $data = $widget->get_data();
	*
	* @return array|null $data
	*/
	public function get_data() : ?array {

		$section_tipo 	= $this->section_tipo;
		$section_id 	= $this->section_id;
		$ipo 			= $this->ipo ?? [];

		// auxiliary functions
		// Defined inside a function_exists() guard because PHP global functions are
		// process-scoped: declaring them unconditionally would cause a fatal redeclaration
		// error on the second request served by a persistent worker (FPM/CLI).
		if (!function_exists('sum_intervals')) {


			/**
			* SUM_INTERVALS
			* Accumulates an array of DateInterval objects into a single total DateInterval.
			*
			* Strategy: anchors two DateTime instances at midnight, adds every interval to
			* the first, then diffs it against the original to produce a canonical
			* DateInterval that carries y/m/d/h/i/s fields.
			*
			* @param DateInterval[] $ar_interval Array of DateInterval objects to add together.
			* @return DateInterval $sum_intervals Combined interval representing the total duration.
			*/
			function sum_intervals($ar_interval) {
				$e = new DateTime('00:00');
				$f = clone $e;

				foreach ($ar_interval as $key => $interval) {
					$e->add($interval);
				}
				$sum_intervals = $f->diff($e);

				return $sum_intervals;
			}//end sum_intervals


			/**
			* IS_LAST_DATE
			* Returns true when no date after $offset_key in the flat $ar_dates_all array
			* has a populated 'year' field, meaning the given pair is the last real record.
			*
			* Used to decide whether a missing date_out should be replaced with a "+1 day"
			* estimate or whether there is a later date that can close the gap instead.
			*
			* @param array  $ar_dates_all Flat interleaved array of date_in/date_out dd_date-like objects.
			* @param int    $offset_key   Index of the date_out slot for the current pair (key_dates * 2 + 1).
			* @return bool True when every subsequent slot has an empty year.
			*/
			function is_last_date($ar_dates_all, $offset_key){
				foreach ($ar_dates_all as $key => $current_date) {
					if ($key<=$offset_key) continue; // Ignore previous
					if (!empty($current_date->year)) {
						return false;
					}
				}

				return true;
			}//end is_last_date


			/**
			* DATE_INTERVAL
			* Computes the DateInterval between two dates, accepting either a raw
			* dd_date-like object or an already-constructed DateTime instance.
			*
			* When the resulting interval contains a non-zero hour component (which can
			* arise from DST transitions in PHP's DateTime arithmetic), an extra "1 day"
			* is added via sum_intervals() to absorb the fractional day and keep totals
			* in whole-day units.
			*
			* @param object|DateTime $date_in  Start date: a dd_date-like object (with 'year') or a DateTime.
			* @param object|DateTime $date_out End date: a dd_date-like object (with 'year') or a DateTime.
			* @return DateInterval $interval Interval from $date_in to $date_out, DST-corrected.
			*/
			function date_interval($date_in, $date_out) {
				if(get_class($date_in)=='DateTime') {
					$date1 = $date_in;
				}else{
					$dd_date = new dd_date($date_in);
					$timestamp_in = $dd_date->get_dd_timestamp("Y-m-d");
					$date1 = new DateTime($timestamp_in);
				}

				if(get_class($date_out)=='DateTime') {
					$date2 = $date_out;
				}else{
					$dd_date = new dd_date($date_out);
					$timestamp_out = $dd_date->get_dd_timestamp("Y-m-d");
					$date2 = new DateTime($timestamp_out);
				}

				$interval = $date1->diff($date2);

				// DST correction
				// PHP DateTime::diff() can produce h > 0 for midnight-to-midnight spans that
				// cross a DST boundary. Adding a full day compensates and keeps all durations
				// expressed in whole days.
				if ($interval->h >0) {
					$ar_interval[] = $interval;
					$ar_interval[] = date_interval_create_from_date_string("1 day");
					$interval = sum_intervals($ar_interval);
				}

				return $interval;
			}//end date_interval


			/**
			* CUSTOM_DATE_ADD_SUB
			* Applies a named DateInterval string to a dd_date object, performing either
			* addition or subtraction, and returns the resulting PHP DateTime.
			*
			* Used to synthesize a substitute date_in or date_out when one side of a pair
			* is missing: e.g. date_out - "1 day" to estimate a missing date_in.
			*
			* @param object $date_in   Source dd_date-like object to start from.
			* @param string $interval  Interval string accepted by date_interval_create_from_date_string(),
			*                          e.g. "1 day", "10 days". (!) Must not be empty.
			* @param string $type      DateTime method to invoke: 'add' or 'sub'.
			* @return DateTime $add    Result of applying the interval to the base date.
			*/
			function custom_date_add_sub($date_in, $interval, $type) {
				$dd_date = new dd_date($date_in);
				$timestamp_in = $dd_date->get_dd_timestamp("Y-m-d");
				$date1 = new DateTime($timestamp_in);

				$interval_time = date_interval_create_from_date_string($interval); // ref'10 days'

				$add = $date1->{$type}($interval_time);

				return $add;
			}//end custom_date_add_sub


			/**
			* IS_OUT
			* Returns true when $key refers to a date_out slot in the flat $ar_dates_all array.
			*
			* The interleaved array alternates date_in (even index) / date_out (odd index),
			* so odd keys belong to date_out. Used when computing key_jump to skip forward
			* to the record that closed an indeterminate gap.
			*
			* @param int  $key Flat index into $ar_dates_all.
			* @return bool True for odd (date_out) slots, false for even (date_in) slots.
			*/
			function is_out($key) {
				if ($key % 2 == 0) return false;
				return true;
			}//end is_out
		}//end if (!function_exists('sum_intervals'))


		$data = [];
		foreach ($ipo as $key => $current_ipo) {

			$input 		= $current_ipo->input;
			$output		= $current_ipo->output;

			// Resolve the three typed input slots: 'source' (portal), 'date_in', 'date_out'.
			// array_reduce is used rather than array_filter+reset so a single pass is made
			// and the result is a scalar (the matching item) rather than an array slice.
			$component_source = array_reduce($input, function ($carry, $item){
				if ($item->type==='source') {
					return $item;
				}
				return $carry;
			});

			$current_component_tipo = $component_source->component_tipo;
			$current_section_tipo 	= $component_source->section_tipo;

			$date_in_component 		= array_reduce($input, function ($carry, $item){
				if ($item->type==='date_in') {
					return $item;
				}
				return $carry;
			});
			$date_out_component 	= array_reduce($input, function ($carry, $item){
				if ($item->type==='date_out') {
					return $item;
				}
				return $carry;
			});

			$date_in_component_tipo		= $date_in_component->component_tipo;
			$date_out_component_tipo	= $date_out_component->component_tipo;
			// (!) $lang is tested against itself: if $lang was already set in a previous
			// IPO iteration it is kept; otherwise falls back to the platform default.
			// This is effectively a one-time initialisation guard across loop iterations.
			$lang = isset($lang) ? $lang : DEDALO_DATA_LANG;



			// PORTAL ROWS
			// Load the source portal component to obtain the list of linked record locators.
			// The portal component returns an array of locator objects, each carrying
			// section_tipo and section_id of a linked record.
				$model_name 	  = ontology_node::get_model_by_tipo($current_component_tipo,true); // Expected portal
				$component_portal = component_common::get_instance(
					$model_name,
					$current_component_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$current_section_tipo
				);
				$component_data = $component_portal->get_data();

				if (empty($component_data)) {
					return $data;
				}


			// CALCULATING FIRST AND LAST LOCATOR
			// The first and last locators are read upfront to obtain the global date_in
			// and date_out boundaries (used to compute $timestamp_in / $timestamp_out).
			// These boundary timestamps are currently unused by the interval loop below
			// (see the commented-out "Total" block) but are kept as orientation anchors.
			//
			// FIRST_LOCATOR
			$first_locator = reset($component_data);

				$locator_section_tipo = $first_locator->section_tipo;
				$locator_section_id   = $first_locator->section_id;

				$model_name 	  = ontology_node::get_model_by_tipo($date_in_component_tipo,true); // Expected component date

				$component_date_in= component_common::get_instance(
					$model_name,
					$date_in_component_tipo,
					$locator_section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$locator_section_tipo
				);
				$date_in = (array)$component_date_in->get_data();
				$date_in = reset($date_in); // Now date is an array
				// Compatible new date format 01-10-2018
				// component_date wraps its datum in a {start, end} object since late 2018;
				// unwrap to the 'start' dd_date sub-object when the wrapper is present.
				if (isset($date_in->start)) {
					$date_in = $date_in->start;
				}
				if(!empty($date_in)) {
					$dd_date = new dd_date($date_in);
					$timestamp_in = $dd_date->get_dd_timestamp("Y-m-d");
				}else{
					$timestamp_in = "0000-00-00";
				}

			// LAST_LOCATOR
			$last_locator  = end($component_data);

				$locator_section_tipo = $last_locator->section_tipo;
				$locator_section_id   = $last_locator->section_id;

				$model_name 	    = ontology_node::get_model_by_tipo($date_out_component_tipo,true); // Expected component date
				$component_date_out = component_common::get_instance(
					$model_name,
					$date_out_component_tipo,
					$locator_section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$locator_section_tipo
				);
				$date_out = (array)$component_date_out->get_data();
				$date_out = reset($date_out); // Now date is an array
				// Compatible new date format 01-10-2018
				if (isset($date_out->start)) {
					$date_out = $date_out->start;
				}
				if (!empty($date_out)) {
					$dd_date = new dd_date($date_out);
					$timestamp_out = $dd_date->get_dd_timestamp("Y-m-d");
				}else{
					$timestamp_out = "0000-00-00";
				}



			// Total
			// $date1 = new DateTime($timestamp_in);
			// $date2 = new DateTime($timestamp_out);
			// $interval = $date1->diff($date2);

			// Calculating all locators
			// Build three parallel arrays from every linked locator:
			//   $ar_dates_in   — indexed by locator key, holds the date_in dd_date for each record.
			//   $ar_dates_out  — indexed by locator key, holds the date_out dd_date for each record.
			//   $ar_dates_all  — flat interleaved array (date_in0, date_out0, date_in1, date_out1, …)
			//                    used by is_last_date() and the gap-bridging forward scan.
			$total_seconds = 0;
			$ar_dates_in=array();
			$ar_dates_out=array();
			$ar_dates_all=array();
			foreach ((array)$component_data as $key_data => $current_locator) {

				$locator_section_tipo = $current_locator->section_tipo;
				$locator_section_id   = $current_locator->section_id;

				// Date in
				$model_name 	  = ontology_node::get_model_by_tipo($date_in_component_tipo,true); // Expected component date
				$component_date_in= component_common::get_instance(
					$model_name,
					$date_in_component_tipo,
					$locator_section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$locator_section_tipo
				);
				$date_in = (array)$component_date_in->get_data();
				$date_in = reset($date_in);
				// Compatible new date format 01-10-2018
				if (isset($date_in->start)) {
					$date_in = $date_in->start;
				}

				$ar_dates_in[] = $date_in;
				$ar_dates_all[]= $date_in;

				// Date out
				$model_name 	   = ontology_node::get_model_by_tipo($date_out_component_tipo,true); // Expected component date
				$component_date_out= component_common::get_instance(
					$model_name,
					$date_out_component_tipo,
					$locator_section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$locator_section_tipo
				);
				$date_out = (array)$component_date_out->get_data();
				$date_out = reset($date_out);
				// Compatible new date format 01-10-2018
				if (isset($date_out->start)) {
					$date_out = $date_out->start;
				}

				$ar_dates_out[] = $date_out;
				$ar_dates_all[] = $date_out;
			}

			// INTERVALS — iterate locators and calculate intervals of time.
			// Four cases handled per pair:
			//   1. Both dates present    → compute exact interval.
			//   2. Both dates missing    → skip, contributes nothing.
			//   3. date_in missing only  → synthesize date_in = date_out − 1 day; flag as estimated.
			//   4. date_out missing only → two sub-cases:
			//      a. No later date available (last pair or next date_in is present) →
			//         synthesize date_out = date_in + 1 day; flag as estimated.
			//      b. A later date exists to bridge the gap →
			//         span forward to that date, set $key_jump to skip the bridged records,
			//         and flag as 'estitmated_time_undefined' (indeterminate).
			$ar_interval=array();
			$key_jump=0;
			$default_interval="1 day"; // used to add to the first or last row with incomplete data
			$estitmated_time_add=array(); // used to notify to user added periods when do
			$estitmated_time_undefined=false; // used to notify user added intermediate times calculated
			foreach ($ar_dates_in as $key_dates => $date_in) {

				if ($key_dates<$key_jump) {
					continue; // skip empty or already calculated dates
				}

				$date_out = $ar_dates_out[$key_dates];

				switch (true) {

					case ( !empty($date_in->year) && !empty($date_out->year) ):
						$interval = date_interval($date_in, $date_out);
						break;

					case ( empty($date_in->year) && empty($date_out->year) ):
						// Nothing to do
						$interval = null;
						break;

					case ( empty($date_in->year) && !empty($date_out->year) ):
						// date_in missing: estimate by subtracting $default_interval from date_out.
						$date_in_default  = custom_date_add_sub($date_out, $default_interval, 'sub');
						$interval 		  = date_interval($date_in_default, $date_out);
						$estitmated_time_add[] = $interval;
						break;

					case ( !empty($date_in->year) && empty($date_out->year) ):
						// date_out missing: check whether a bridging date exists further ahead.
						// $key_dates*2 is the flat index of this date_in in $ar_dates_all.
						// ($key_dates*2)+2 is the flat index of the next date_in (one row ahead).
						if (is_last_date($ar_dates_all, $key_dates*2)===true || !empty($ar_dates_all[($key_dates*2)+2]->year)) {
							// No later date available, or the very next date_in is populated:
							// use the +1 day estimate instead of spanning forward.
							$date_out_default = custom_date_add_sub($date_in, $default_interval, 'add');
							$interval 		  = date_interval($date_in, $date_out_default);
							$estitmated_time_add[] = $interval;
						}else{
							// A later date closes the gap: span from this date_in to that date,
							// accumulate as a single interval, and advance $key_jump so the
							// bridged records are not counted again.
							$estitmated_time_undefined=true;
							foreach ($ar_dates_all as $key2 => $current_date_all) {
								if( $key2 <= $key_dates*2 ) continue; // ignore previous keys
								if(!empty($current_date_all->year)) {
									$interval = date_interval($date_in, $current_date_all);
									$key_jump = (int)floor($key2/2);
									if (is_out($key2)) {
										$key_jump++;
									}
									break;
								}
							}//end foreach ($ar_dates_all as $key2 => $current_date_all)
						}
						break;
				}

				if (!is_null($interval )) {
					$ar_interval[] = $interval;
				}
			}//end foreach ($ar_dates_in as $key => $value)

			// Intervals summatory
			$sum_intervals = sum_intervals($ar_interval);

			// Estimated time add total
			$sum_estitmated_time_add = sum_intervals($estitmated_time_add);

			// Map each output slot to its corresponding local variable using variable
			// variables ($$current_id). The variable name in $output must exactly match
			// one of: $sum_intervals, $sum_estitmated_time_add, $estitmated_time_undefined.
			foreach ($output as $data_map) {
				$current_id = $data_map->id;
				$current_data = new stdClass();
					$current_data->widget 		= get_class($this);
					$current_data->key  		= $key;
					$current_data->widget_id 	= $current_id;
					$current_data->value 		= $$current_id ?? null;
				$data[] = $current_data;
			}

		}//foreach ipo

		return $data;
	}//end get_data



	/**
	* GET_DATA_PARSED
	* Override of widget_common::get_data_parsed(). Formats the raw interval
	* objects returned by get_data() into human-readable localized text strings.
	*
	* - sum_intervals is formatted as "{y} years {m} months {d} days" using
	*   singular/plural labels from the ontology (label::get_label)
	* - sum_estitmated_time_add is formatted with the same pattern and combined
	*   with an "indeterminat" suffix when estitmated_time_undefined is true
	* - Returns three keyed items: sum_intervals, sum_estitmated_time_add,
	*   and estitmated_time_undefined
	*
	* @return array $data_parsed Array of formatted text items
	*/
	public function get_data_parsed() : ?array  {

		$data = $this->get_data() ?? [];
		$data_parsed = [];

		$found_sum_intervals =  array_find( $data, function($item){
			return $item->widget_id === 'sum_intervals';
		}) ?? new stdClass();
		$sum_intervals = $found_sum_intervals->value ?? new stdClass();

		$found_sum_estitmated_time_add =  array_find( $data, function($item){
			return $item->widget_id === 'sum_estitmated_time_add';
		}) ?? new stdClass();
		$sum_estitmated_time_add = $found_sum_estitmated_time_add->value ?? null;

		$found_estitmated_time_undefined =  array_find( $data, function($item){
			return $item->widget_id === 'estitmated_time_undefined';
		}) ?? new stdClass();
		$estitmated_time_undefined = $found_estitmated_time_undefined->value ?? null;

		// get the text of the sum_interval
			$ar_sum_intervals = [];

			if( isset($sum_intervals->y) && $sum_intervals->y > 0 ){
				$year_label = ($sum_intervals->y > 1)
					? label::get_label( 'years' )
					: label::get_label( 'year' );
				$year_text = $sum_intervals->y.' '.$year_label;
				$ar_sum_intervals[] = $year_text;
			}
			if( isset($sum_intervals->m) && $sum_intervals->m > 0 ){
				$month_label = ($sum_intervals->m > 1)
					? label::get_label( 'months' )
					: label::get_label( 'month' );
				$month_text = $sum_intervals->m.' '.$month_label;
				$ar_sum_intervals[] = $month_text;
			}
			if( isset($sum_intervals->d) && $sum_intervals->d > 0){
				$day_label = ($sum_intervals->d > 1)
					? label::get_label( 'days' )
					: label::get_label( 'day' );
				$day_text = $sum_intervals->d.' '.$day_label;
				$ar_sum_intervals[] = $day_text;
			}

			$sum_intervals = implode(' ', $ar_sum_intervals);
			$intervals_data = new stdClass();
				$intervals_data->widget_id = 'sum_intervals';
				$intervals_data->value = $sum_intervals;
			$data_parsed[] = $intervals_data;

		// get the text of the sum_estitmated_time_add
			$ar_sum_estitmated_time_add = [];

			if( isset($sum_estitmated_time_add->y) && $sum_estitmated_time_add->y > 0 ){
				$estimated_year_label = ($sum_estitmated_time_add->y > 1)
					? label::get_label( 'years' )
					: label::get_label( 'year' );
				$estimated_year_text = $sum_estitmated_time_add->y.' '.$estimated_year_label;
				$ar_sum_estitmated_time_add[] = $estimated_year_text;
			}
			if( isset($sum_estitmated_time_add->m) && $sum_estitmated_time_add->m > 0 ){
				$estimated_month_label = ($sum_estitmated_time_add->m > 1)
					? label::get_label( 'months' )
					: label::get_label( 'month' );
				$estimated_month_text = $estimated_year_text = $sum_estitmated_time_add->m.' '.$estimated_month_label;
				$ar_sum_estitmated_time_add[] = $estimated_month_text;
			}
			if( isset($sum_estitmated_time_add->d) && $sum_estitmated_time_add->d > 0 ){
				$estimated_day_label = ($sum_estitmated_time_add->d > 1)
					? label::get_label( 'days' )
					: label::get_label( 'day' );
				$estimated_day_text = $sum_estitmated_time_add->d.' '.$estimated_day_label;
				$ar_sum_estitmated_time_add[] = $estimated_day_text;
			}

			$ar_indeterminate = [];
			if( !empty($ar_sum_estitmated_time_add) || $estitmated_time_undefined === true){

				if( !empty($ar_sum_estitmated_time_add) ){
					$ar_indeterminate[] = implode(' ', $ar_sum_estitmated_time_add);
				}
				if( $estitmated_time_undefined === true ){

					if( !empty($ar_sum_estitmated_time_add) ){
						$ar_indeterminate[] = ' + ';
					}
					$ar_indeterminate[] = 'indeterminat';
				}
			}

			$sum_estitmated = implode('', $ar_indeterminate);
			$estitmated_data = new stdClass();
				$estitmated_data->widget_id = 'sum_estitmated_time_add';
				$estitmated_data->value = $sum_estitmated;
			$data_parsed[] = $estitmated_data;

		// add estimated time undefined
			$time_undefined_data = new stdClass();
				$time_undefined_data->widget_id = 'estitmated_time_undefined';
				$time_undefined_data->value = $estitmated_time_undefined;
			$data_parsed[] = $time_undefined_data;

		return $data_parsed;
	}//end get_data_parsed



}//end sum_dates
