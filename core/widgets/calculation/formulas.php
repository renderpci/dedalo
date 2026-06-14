<?php declare(strict_types=1);
/**
 * CALCULATION FORMULAS
 *
 * Collection of standalone PHP functions loaded and invoked by the
 * `calculation` widget class via `resolve_logic()` (class.calculation.php).
 * Each function receives a unified request_options object that bundles
 * the pre-resolved component data together with the per-IPO-block options
 * defined in the ontology, and returns a structured result array consumed
 * by render_calculation.js on the client.
 *
 * Invocation model:
 * - The widget's IPO "process" block references this file by path and names
 *   the function to call (e.g. { "file": "/mdcat/calculation/formulas.php",
 *   "fn": "summarize" }).
 * - resolve_logic() (SEC-052) confines the include to DEDALO_WIDGETS_PATH and
 *   validates the function name, then calls $fn($arg) where $arg carries:
 *     $arg->data    — stdClass keyed by component var_name, values from
 *                     resolve_data() (current record, all records, or search session)
 *     $arg->options — options object from the IPO process block (type, precision, …)
 *     $arg->caller_section_tipo — tipo of the section that owns the widget
 * - The return value must be an array of stdClass objects, each with at least
 *   'id' and 'value' properties, matching the ids listed in the IPO output map.
 *
 * Currently bundled functions:
 * - summarize() — numeric (int/float) or date aggregation across all input vars
 *
 * @package Dédalo
 * @subpackage Widgets
 */



/**
* SUMMARIZE
* Aggregate numeric or date values from the input data object and return a
* single total keyed as "total". Supports three data types: date, float, and int.
*
* The function is called by resolve_logic() via $fn($arg); $arg is the unified
* object described in the file header. Internally $request_options is re-used as
* the local alias for $arg because the function was designed before the unified
* arg shape was introduced — the fields data and options are identical.
*
* Date handling:
* - Values whose format is 'date' are converted to Unix timestamps via
*   dd_date::get_unix_timestamp() and accumulated in $ar_values.
* - A shape object (year/month/day booleans) is tracked across all date values;
*   the most "complete" shape is kept — a property that is true in any input
*   date remains true in the shape so the result is never truncated below the
*   most informative input.
* - Values whose format is 'period' (a relative interval, not a specific date)
*   are applied via DateInterval to the running sum, then $ar_values is replaced
*   with the single adjusted timestamp so subsequent periods compound correctly.
*   Periods are silently skipped if no specific date has been accumulated yet,
*   because a relative offset has no anchor.
* - After summation the total timestamp is converted back to a dd_date via
*   get_dd_date_from_unix_timestamp(), then only the properties enabled by the
*   merged shape are copied, so a year-only input yields a year-only result.
*
* Numeric handling:
* - float: each data value is itself treated as an array and summed with
*   array_sum() (component_number stores values as arrays internally), then all
*   per-var sums are added. Rounded to $options->precision (default 2).
* - int: same as float but rounded to 0 decimal places.
*
* Expected request_options / $arg structure (see file header for the unified form):
* {
*   "data":    { "var_name": <value> … },   // component data keyed by var_name
*   "options": { "type": "float|int|date", "precision": 2 }
* }
*
* Sample float input data:
* {
*   "au": "1",
*   "ag": "2.1",
*   "cu": "8.4",
*   "pb": "",
*   "sn": "0.34"
* }
*
* Sample returned result:
* [
*   { "id": "total", "value": 65 }
* ]
*
* Usage:
*   $result = summarize((object)[
*       'data'    => (object)[ 'number' => 23.5, 'extra' => 41.5 ],
*       'options' => (object)[ 'type' => 'float', 'precision' => 2 ]
*   ]);
*
* @param string|object $request_options JSON string or object; when called from
*                                       resolve_logic() this is the unified $arg
*                                       object with data, options, and
*                                       caller_section_tipo properties.
* @return array $result Array of stdClass objects each with 'id' and 'value'
*                       properties matching the IPO output map.
*/
function summarize( string|object $request_options) : array {

	$options = is_string($request_options)
		? json_decode($request_options)
		: $request_options;

	$data	 = $options->data;
	$options = $options->options;
	$type	 = $options->type;

	switch ($type) {

		case 'date':
			$shape		= null;
			$ar_values	= [];
			foreach ($data as $key => $value) {
				if (empty($value)) {
					continue;
				}
				// Dispatch on dd_date format
				// A dd_date object always carries a 'format' property ('date' or 'period').
				// The format drives which branch of the inner switch handles the value.
				$format = $value->format;

				switch ($format) {
					case 'period':
						// Skip period when no specific date has been accumulated yet
						// A period (relative interval: e.g. {year:1}, {month:5}, {day:452})
						// must have an anchor timestamp to add to. If no concrete date has
						// been seen yet, applying a period would be meaningless.
						// 'continue 2' breaks out of the inner switch AND the outer foreach,
						// advancing to the next $data value.
						if(empty($ar_values)) continue 2;
						$current_time = array_sum($ar_values);
						// Build a DateTime at the running total, then add interval components
						// DateInterval strings follow ISO 8601 duration format (P<n>D, P<n>M, P<n>Y).
						// Each component is applied separately because PHP does not support combining
						// day+month+year into a single DateInterval without going through PnYnMnDTnHnMnS.
						$DateTime = new DateTime();
						$new_date = $DateTime->setTimestamp( $current_time );
						// add interval of every property of the period
						if(isset($value->day)){
							$day_string = 'P'.$value->day.'D';
							$day_interval = new DateInterval($day_string);
							$new_date->add($day_interval);
						}
						if(isset($value->month)){
							$month_string = 'P'.$value->month.'M';
							$month_interval = new DateInterval($month_string);
							$new_date->add($month_interval);
						}
						if(isset($value->year)){
							$year_string = 'P'.$value->year.'Y';
							$year_interval = new DateInterval($year_string);
							$new_date->add($year_interval);
						}
						// Replace the accumulated array with the single adjusted timestamp
						// so any subsequent period values compound from the new total rather
						// than re-adding the original timestamps.
						$ar_values = [$new_date->getTimestamp()];
						break;

					// Specific-date accumulation (format 'date' or anything else)
					// A 'date' value defines a specific point in time and may be partial
					// (year-only, month+year, or full day/month/year). The shape object
					// tracks which components are present; the union of all input shapes
					// determines which components appear in the final result so that a
					// year-only input always produces a year-only output regardless of
					// what dd_date::get_dd_date_from_unix_timestamp() fills in.
					// dd_date::get_unix_timestamp() substitutes 1 (not 0) for absent
					// month/day to avoid PHP DateTime underflow into the previous period.
					case 'date':
					default:
						$dd_date		= new dd_date($value);
						$current_shape	= $dd_date->get_shape();
						// Shape merge: keep a property true if it is true in either
						// the accumulated shape or the current value's shape.
						// This ensures the most informative shape wins and the result
						// is never more truncated than the most complete input date.
						if(isset($shape)){
							foreach ($current_shape as $key => $value) {
								$shape->$key = ($value === true)
									? true
									: ( ($shape->$key === true)
										? true
										: false);
							}
						}else{
							$shape = $current_shape;
						}
						// Accumulate the Unix timestamp for summation
						// Partial dates are anchored at 1 for absent fields (see dd_date docs).
						$unix_timestamp	= $dd_date->get_unix_timestamp();
						$ar_values[]	= $unix_timestamp;
						break;
				}
			}

			$total_sum	= array_sum($ar_values);
			// Convert the summed timestamp back to a fully-populated dd_date,
			// then copy only the components allowed by the merged shape.
			// get_dd_date_from_unix_timestamp() always sets all six fields (day,
			// month, year, hour, minute, second), but presenting fields that were
			// absent in every input would misrepresent the data precision.
			$total_full	= (!empty($ar_values))
				? dd_date::get_dd_date_from_unix_timestamp( $total_sum )
				: null;
			if(isset($total_full)){
				$total = new dd_date();
				foreach ($shape as $key => $value) {
					if($value === true){
						$method_get = 'get_' . $key;
						$method_set = 'set_' . $key;
						if (method_exists($total_full, $method_get) && method_exists($total, $method_set)) {
							$total->$method_set($total_full->$method_get());
						}
					}
				}
			}else{
				$total = $total_full;
			}

			break;
		case 'float':
			// Sample data (values arrive as arrays from component_number resolution):
			//	{
			//		"au": "1",
			//		"ag": "2.1",
			//		"cu": "8.4",
			//		"pb": "",
			//		"sn": "0.34"
			//	}

			$ar_values = [];
			foreach ($data as $key => $value) {
				if (empty($value)) {
					continue;
				}
				// Each component value is itself an array; array_sum() aggregates it.
				$ar_values[] = array_sum($value);
			}
			$total_sum = array_sum($ar_values);

			// Precision defaults to 2 decimal places when not specified in options.
			$precision = $options->precision ?? 2;
			$total = round($total_sum, $precision);
			break;

		case 'int':
		default:
			$ar_values = [];
			foreach ($data as $key => $value) {
				if (empty($value)) {
					continue;
				}
				$ar_values[] = array_sum($value);
			}
			$total_sum = array_sum($ar_values);

			// Round to 0 decimal places; result is still a float returned by round(),
			// not a native int, which is consistent with how the client receives it.
			$total = round($total_sum, 0);
			break;
	}

	// Build the output array expected by the IPO output map
	// The result array must contain one object per output id declared in the IPO.
	// Here summarize() always produces exactly one item keyed 'total'; the caller
	// (resolve_logic / get_data) picks it up via array_find() matching on ->id.
	// (!) $result is first assigned here — PHP implicitly creates the array via [].
	//     If the switch falls through without setting $total (not currently possible
	//     with the default branch, but worth noting), $total would be undefined.
	$result[] = (object)[
		'id'	=> 'total',
		'value'	=> $total
	];


	return $result;
}//end summarize
