<?php declare(strict_types=1);
include_once 'trait.search_component_date.php';
include_once 'trait.search_component_date_tm.php';
/**
* CLASS COMPONENT_DATE
* Literal-direct component that stores structured date and time values for cultural-heritage records.
*
* Dates are language-independent: the constructor always forces $this->lang to DEDALO_DATA_NOLAN
* ('lg-nolan') regardless of the caller's language, and the component is never marked translatable.
* The raw value is an array of dd_date container objects, each holding only the sub-fields that
* are relevant for the chosen date_mode (start, end, period). All numeric sub-fields are optional,
* allowing partial dates such as a bare year (-238) or a year+month (1238/10).
*
* The ontology property 'date_mode' governs which containers and fields are used:
*   - date       : single 'start' container (year, month, day)
*   - range      : 'start' + 'end' containers
*   - period     : a 'period' container representing a duration (years / months / days)
*   - time       : 'start' container with clock fields only (hour, minute, second)
*   - time_range : 'start' + 'end' clock containers
*   - date_time  : 'start' container with full year→second fields
*
* The computed property 'time' (absolute seconds since epoch, supporting negative values for BCE
* dates) is injected into every container by add_time() / build_dd_date_with_time() on each save.
* This absolute-seconds value drives efficient range queries in the database without string parsing.
*
* Data shape stored per record array item (range example):
* [
*   {
*     "start": { "year":2012, "month":11, "day":7, "hour":17, "minute":33, "second":49, "time":64638475292 },
*     "end":   { "year":2012, "month":12, "day":8, "hour":22, "minute":15, "second":35, "time":64641254135 }
*   }
* ]
*
* Search is provided by two included traits:
*   - search_component_date    : standard date SQO → SQL resolution
*   - search_component_date_tm : Time Machine variant
*
* Special case: when tipo === DEDALO_TIME_MACHINE_COLUMN_TIMESTAMP ('dd559'), get_order_path()
* overrides the path to use the literal 'timestamp' column instead of the JSONB matrix path.
*
* Extends component_common.
* Uses traits: search_component_date, search_component_date_tm.
*
* @package Dédalo
* @subpackage Core
*/
class component_date extends component_common {

	// traits. Files added to current class file to split the large code.
	use search_component_date;
	use search_component_date_tm;



	// American data format
	// Language codes whose locale convention places month before day (M/D/Y, i.e. 'mdy' order).
	// Used by the client render layer to adjust the displayed date order; not consumed server-side.
	/** @var array<string> $ar_american List of language codes that use American (month-first) date ordering. */
	public static array $ar_american = ['lg-eng','lg-angl','lg-ango','lg-meng'];

	// default date mode
	// Fallback when no 'date_mode' is set in the ontology node properties.
	/** @var string $default_date_mode Ontology date_mode used when the node defines none. */
	public static string $default_date_mode = 'date';



	/**
	* __CONSTRUCT
	* Instantiates the component and enforces non-translatability.
	*
	* Date values are language-independent. To guarantee the correct data slot is
	* read from the matrix, $this->lang is overwritten with DEDALO_DATA_NOLAN
	* ('lg-nolan') before the parent constructor runs, so it is always passed
	* through regardless of what the caller supplied in $lang.
	*
	* In debug mode, a configuration error is logged if the ontology node is
	* accidentally marked as translatable — dates must never be translatable.
	*
	* @param string|null $tipo        = null  Ontology term identifier (e.g. 'rsc85').
	* @param mixed       $section_id  = null  Section record id that owns this component.
	* @param string      $mode        = 'list' Render/operation mode (edit|list|tm|search).
	* @param string      $lang        = DEDALO_DATA_NOLAN Ignored — always forced to DEDALO_DATA_NOLAN.
	* @param string|null $section_tipo = null Ontology term of the parent section.
	* @param bool        $cache       = true  Whether to use the component instance cache.
	*/
	protected function __construct( ?string $tipo=null, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, ?string $section_tipo=null, bool $cache=true ) {

		// Force always DEDALO_DATA_NOLAN
		// (!) Dates are never per-language. Override whatever the caller passed so
		// parent::__construct reads from the correct 'lg-nolan' data slot.
		$this->lang = DEDALO_DATA_NOLAN;

		// We create the component normally
		parent::__construct($tipo, $section_id, $mode, $this->lang, $section_tipo, $cache);

		if(SHOW_DEBUG===true) {
			// Configuration guard: an ontology node marked translatable for a date
			// component indicates a setup error. Log loudly so it can be fixed.
			if ($this->ontology_node->get_is_translatable()===true) {
				debug_log(__METHOD__
					." Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is NOT 'translatable'. Please fix this ASAP"
					, logger::ERROR);
			}
		}
	}//end __construct



	/**
	* SAVE OVERRIDE
	* Validates data shape and injects computed absolute-seconds 'time' before persisting.
	*
	* Overrides component_common::save(). The sequence is:
	*   1. Empty data → delegate immediately (date deletion case).
	*   2. Non-array data → log error and return false (guard against corrupt client payloads).
	*   3. Call add_time() on every non-empty item to (re)compute the absolute-seconds 'time'
	*      property for each dd_date container. This ensures the search index is always fresh,
	*      even if the client sent a stale or missing 'time'.
	*   4. Delegate to parent::save() for the actual DB write.
	*
	* @return bool True on successful save, false if data is malformed.
	*/
	public function save() : bool {

		// data
			$data = $this->get_data();

		// deleting date case
			if (empty($data)) {
				// saving empty value
				return parent::save();
			}

		// data format verify
			if ( !is_array($data) ) {
				if(SHOW_DEBUG===true) {
					dump($data, ' component_date data +++++++++++++++++++++++++++ '.to_string($this->tipo));
					debug_log(__METHOD__
						." Bad date format. Expected array, got ".gettype($data)
						, logger::ERROR
					);
				}
				return false;
			}

		// add_time to data (always)
		// Add/replace property 'time' in each data item.
		// The recalculated absolute-seconds value drives range queries; always recompute
		// on save rather than trusting whatever the client sent.
			foreach ($data as $key => $current_data) {
				if(!empty($current_data)){
					$data[$key] = self::add_time( $current_data );
				}
			}

		// from here, save normally
			$result = parent::save();


		return $result;
	}//end save



	/**
	* GET_DATE_MODE
	* Returns the date_mode configured for this component instance in the ontology.
	*
	* Reads the 'date_mode' property from the ontology node properties object.
	* Falls back to component_date::$default_date_mode ('date') when the property
	* is absent, which is common for legacy or minimally-configured nodes.
	*
	* @return string One of: 'date' | 'range' | 'period' | 'time' | 'time_range' | 'date_time'.
	*/
	public function get_date_mode() {

		$properties	= $this->get_properties();
		$date_mode	= $properties->date_mode ?? component_date::$default_date_mode;

		return $date_mode;
	}//end get_date_mode



	/**
	* GET_DATE_MODE_STATIC
	* Returns the date_mode for any given ontology term without instantiating the full component.
	*
	* Useful in contexts where only the tipo is known (e.g. search trait initialization,
	* diffusion resolvers) and creating a full component instance would be expensive.
	* Reads the ontology node directly via ontology_node::get_instance().
	*
	* @param string $tipo Ontology term identifier (e.g. 'rsc85').
	* @return string One of: 'date' | 'range' | 'period' | 'time' | 'time_range' | 'date_time'.
	*/
	public static function get_date_mode_static( string $tipo ) : string {

		$ontology_node = ontology_node::get_instance($tipo);
		$properties	= $ontology_node->get_properties();
		$date_mode	= $properties->date_mode ?? component_date::$default_date_mode;

		return $date_mode;
	}//end get_date_mode_static



	/**
	* GET_DATE_NOW
	* Builds a fully populated dd_date representing the current wall-clock moment.
	*
	* Uses PHP's DateTime to read year, month, day, hour, minute, and second, then
	* computes the absolute-seconds 'time' value via dd_date::convert_date_to_seconds()
	* and injects it. The resulting dd_date object is suitable for immediate storage
	* or for stamping an activity log entry.
	*
	* Note: millisecond is not set; the returned dd_date has precision only to seconds.
	*
	* @return dd_date A dd_date instance for the current date and time, with 'time' set.
	*/
	public static function get_date_now() : dd_date {

		$date = new DateTime();

		// dd_date
			$dd_date = new dd_date();
				$dd_date->set_year( 	$date->format('Y') ); // $date->format('Y-m-d H:i:s'); # Default as DB format
				$dd_date->set_month( 	$date->format('m') );
				$dd_date->set_day( 		$date->format('d') );
				$dd_date->set_hour( 	$date->format('H') );
				$dd_date->set_minute(	$date->format('i') );
				$dd_date->set_second( 	$date->format('s') );

		// add time
			$time = dd_date::convert_date_to_seconds($dd_date);
			$dd_date->set_time( $time );


		return $dd_date;
	}//end get_date_now



	/**
	* GET_EXPORT_VALUE
	* Atoms-based export contract — one export_atom per stored data record.
	*
	* Implements the export_value atom contract defined in component_common::get_export_value().
	* Each array item in the component's data is resolved to a human-readable string via
	* data_item_to_value() for the current date_mode, then wrapped in an export_atom and
	* appended to the export_value result.
	*
	* The leaf segment's fields_separator is set to records_separator (not fields_separator)
	* because the legacy grid pre-joined the items with records_separator for flat output parity.
	* Empty items produce an empty string atom (not skipped) so the atom index stays aligned
	* with the source data array; the export joiner drops empty slots.
	*
	* records_separator resolution order:
	*   1. $context->ddo->records_separator (caller override)
	*   2. $properties->records_separator (ontology node)
	*   3. ' | ' (hard default)
	*
	* @param export_context|null $context = null Optional caller-supplied export context.
	* @return export_value Populated atom list; empty (zero atoms) when data is null/empty.
	*/
	public function get_export_value( ?export_context $context=null ) : export_value {

		$context = $context ?? new export_context();

		// records_separator. resolved as the legacy get_grid_value
			$properties			= $this->get_properties();
			$records_separator	= $context->ddo?->records_separator
				?? $properties?->records_separator
				?? ' | ';

		// own segment. items join with records_separator (legacy pre-join parity)
			$segment = new export_path_segment($this->section_tipo, $this->tipo, (object)[
				'model'				=> $this->get_model(),
				'fields_separator'	=> $records_separator,
				'records_separator'	=> $records_separator,
				// relation traversal position (set by the calling relation via descend)
				'item_index'		=> $context->item_index,
				'section_id'		=> $context->item_section_id
			]);
			$path = [...$context->path_prefix, $segment];

		// export_value
			$export_value = new export_value([], $this->get_label(), get_called_class());

		// data items
			$data = $this->get_data();
			if (empty($data)) {
				return $export_value;
			}

			$date_mode = $this->get_date_mode();
			foreach ($data as $key => $current_data) {
				$item_value = empty($current_data)
					? ''
					: self::data_item_to_value($current_data, $date_mode);

				$export_value->add_atom( new export_atom($path, $item_value, (object)[
					'value_index' => (int)$key
				]) );
			}


		return $export_value;
	}//end get_export_value



	/**
	* DATA_ITEM_TO_VALUE
	* Converts a single stored data-item object to a human-readable date string.
	*
	* Dispatches on $date_mode to choose the correct rendering strategy:
	*   - 'range'      : "start <> end" using Y/m/d precision (fields omitted when absent,
	*                     e.g. year-only produces just the year without trailing separator)
	*   - 'time_range' : "HH:MM:SS <> HH:MM:SS"
	*   - 'period'     : "N years N months N days" (localized via label::get_label())
	*   - 'time'       : "HH:MM:SS" (reads from $data_item->start if present, otherwise root)
	*   - 'datetime'   : deprecated alias for 'date_time'; logs an ERROR and falls through
	*   - 'date_time'  : "Y/m/d HH:MM:SS"
	*   - 'date' (default): "Y/m/d" with graceful degradation to "Y/m" or "Y" for partial dates
	*
	* Partial date support: for 'date' and 'range', if 'day' is absent the format drops to
	* Y/m; if 'month' is also absent only the year is rendered (with padding disabled for
	* negative/short years).
	*
	* The $sep parameter is the character placed between year, month, and day fields.
	* It defaults to '/' but callers may pass '-' for ISO-like output.
	*
	* @param object $data_item  A single stored date record, e.g. { "start": { "year":2011, ... } }.
	* @param string $date_mode  One of: 'date'|'range'|'period'|'time'|'time_range'|'date_time'|'datetime'.
	* @param string $sep        = '/' Field separator between year, month, and day components.
	* @return string Formatted date string; empty string on unrecognised mode or invalid input.
	*/
	public static function data_item_to_value(object $data_item, string $date_mode, string $sep='/') : string {

		$item_value = '';

		switch ($date_mode) {

			case 'range':
				// start
				if(isset($data_item->start) && is_object($data_item->start)) {
					$dd_date = new dd_date($data_item->start);
					if(isset($data_item->start->day)) {
						$valor_start = $dd_date->get_dd_timestamp('Y'.$sep.'m'.$sep.'d');
					}else{
						$valor_start = isset($data_item->start->month)
							? $dd_date->get_dd_timestamp('Y'.$sep.'m')
							: $dd_date->get_dd_timestamp('Y', $padding=false);
					}
					$item_value .= $valor_start;
				}
				// end
				if(isset($data_item->end) && is_object($data_item->end)) {
					$dd_date = new dd_date($data_item->end);
					if(isset($data_item->end->day)) {
						$valor_end = $dd_date->get_dd_timestamp('Y'.$sep.'m'.$sep.'d');
					}else{
						$valor_end = isset($data_item->end->month)
							? $dd_date->get_dd_timestamp('Y'.$sep.'m')
							: $dd_date->get_dd_timestamp('Y', $padding=false);
					}
					$item_value .= ' <> '. $valor_end;
				}
				break;

			case 'time_range':
				// start
				if(isset($data_item->start) && is_object($data_item->start)) {
					$dd_date = new dd_date($data_item->start);
					$valor_start = $dd_date->get_dd_timestamp('H:i:s', true);
					$item_value .= $valor_start;
				}
				// end
				if(isset($data_item->end) && is_object($data_item->end)) {
					$dd_date = new dd_date($data_item->end);
					$valor_end = $dd_date->get_dd_timestamp('H:i:s', true);
					$item_value .= ' <> '. $valor_end;
				}
				break;

			case 'period':
				if(!empty($data_item->period)) {

					$ar_string_period = [];

					$dd_date = new dd_date($data_item->period);

					// year
					$ar_string_period[] = $dd_date->get_year() !== null
						? $dd_date->get_year() .' '. label::get_label('years')
						: '';
					// month
					$ar_string_period[] = $dd_date->get_month() !== null
						? $dd_date->get_month() .' '. label::get_label('months')
						: '';
					// day
					$ar_string_period[] = $dd_date->get_day() !== null
						? $dd_date->get_day() .' '. label::get_label('days')
						: '';

					$item_value = implode(' ', $ar_string_period);
				}
				break;

			case 'time':
				$data_item_object = isset($data_item->start)
					? $data_item->start
					: $data_item;
				if (is_object($data_item_object)) {
					$dd_date	= new dd_date($data_item_object);
					$item_value	= $dd_date->get_dd_timestamp('H:i:s', true);
				}else{
					debug_log(__METHOD__
						. " Ignored invalid date. Expected data_item_object is object " . PHP_EOL
						.' type: '. gettype($data_item_object) . PHP_EOL
						.' data_item_object: '. to_string($data_item_object) . PHP_EOL
						.' data_item: '. to_string($data_item)
						, logger::ERROR
					);
				}
				break;

			case 'datetime':
				debug_log(__METHOD__
					. " Received wrong mode 'datetime'. Fix the date mode to 'date_time' " . PHP_EOL
					. to_string( debug_backtrace()[0] )
					, logger::ERROR
				);
				// (!) Intentional fall-through: 'datetime' is a misspelling of 'date_time'.
				// Log the misconfiguration above, then let execution continue into 'date_time'
				// so a usable value is still returned. Do NOT insert a break here.
			case 'date_time':
				$data_item_object = isset($data_item->start)
					? $data_item->start
					: $data_item;
				if (is_object($data_item_object)) {
					$dd_date	= new dd_date($data_item_object);
					$item_value	= $dd_date->get_dd_timestamp('Y'.$sep.'m'.$sep.'d H:i:s', true);
				}else{
					debug_log(__METHOD__
						. " Ignored invalid date. Expected data_item_object is object " . PHP_EOL
						.' type: '. gettype($data_item_object) . PHP_EOL
						.' data_item_object: '. to_string($data_item_object) . PHP_EOL
						.' data_item: '. to_string($data_item)
						, logger::ERROR
					);
				}
				break;

			case 'date':
			default:
				$data_item_object = isset($data_item->start)
					? $data_item->start
					: $data_item;
				if (is_object($data_item_object)) {
					$dd_date = new dd_date($data_item_object);

					if(isset($data_item_object->day)) {
						$item_value = $dd_date->get_dd_timestamp('Y'.$sep.'m'.$sep.'d');
					}else{
						$item_value = isset($data_item_object->month)
							? $dd_date->get_dd_timestamp('Y'.$sep.'m')
							: $dd_date->get_dd_timestamp('Y', $padding=false);
					}
				}else{
					debug_log(__METHOD__
						. " Ignored invalid date. Expected data_item_object is object " . PHP_EOL
						.' type: '. gettype($data_item_object) . PHP_EOL
						.' data_item_object: '. to_string($data_item_object) . PHP_EOL
						.' data_item: '. to_string($data_item)
						, logger::ERROR
					);
				}
				break;
		}//end switch ($date_mode)


		return $item_value;
	}//end data_item_to_value



	/**
	* GET_FINAL_SEARCH_RANGE_SECONDS
	* Computes the upper bound (in absolute seconds) for a partial date search.
	*
	* When a user searches for "1930" the stored data may contain fully specified
	* dates such as 1930-01-15 or 1930-11. Without range expansion the equality
	* search would only match records whose 'time' equals exactly the start of 1930.
	* This method widens the query by advancing the least-significant set field by
	* one unit and returning seconds-1, giving an inclusive upper bound:
	*
	*   year 2000 alone  → advance year by 1 → start-of-2001 in seconds − 1
	*   month 1930/03    → advance month by 1 → start-of-1930/04 in seconds − 1
	*   day 1930/03/15   → advance day by 1   → start-of-1930/03/16 in seconds − 1
	*
	* For time components the rule is different: the upper bound fills missing finer
	* fields with their maximum values (minute → :59, hour → :59:59) rather than
	* advancing a coarser field, because the database stores time as absolute seconds
	* and a 'second' value is already exact.
	*
	* (!) Both a Date and a Time block may apply to the same dd_date when the mode
	* is 'date_time'. The Time block runs first (setting the initial value); the Date
	* block then overwrites it with the day/month/year-expanded upper bound.
	*
	* @param object|null $dd_date  A dd_date instance representing the lower bound of the search.
	* @return int Upper bound in absolute seconds; 0 if $dd_date is null or has no fields set.
	*/
	public static function get_final_search_range_seconds(?object $dd_date) : int {

		$final_search_range_seconds = 0;

		if (is_null($dd_date)) {
			return $final_search_range_seconds;
		}

		# Time
		if ($dd_date->get_second() !== null) {

			// Second is the finest time field: the value is already exact, no expansion needed.
			$final_search_range_seconds = dd_date::convert_date_to_seconds($dd_date);

		}
		elseif ($dd_date->get_minute() !== null) {

			// Minute set but no second: fill second to 59 to cover the full minute.
			$dd_date_clone = clone $dd_date;
			$dd_date_clone->set_second(59);
			$final_search_range_seconds = dd_date::convert_date_to_seconds($dd_date_clone);
		}
		elseif ($dd_date->get_hour() !== null) {

			// Hour set but no minute/second: fill both to their maxima to cover the full hour.
			$dd_date_clone = clone $dd_date;
			$dd_date_clone->set_minute(59);
			$dd_date_clone->set_second(59);
			$final_search_range_seconds = dd_date::convert_date_to_seconds($dd_date_clone);
		}

		# Date
		# the calculation of the seconds for the end of the period always need to be seconds -1
		# ex: year 2000 in seconds is: start = 64281600000 end = 64313740800 -1 or 64313740799
		# because 64313740800 = 2001
		// Strategy: advance the least-significant calendar field by 1, convert to seconds,
		// then subtract 1 so the result is the last second inside the requested period.
		// This works for negative (BCE) years because convert_date_to_seconds handles them.
		if ($dd_date->get_day() !== null) {

			$dd_date_clone = clone $dd_date;
			$dd_date_clone->set_day( ($dd_date_clone->get_day() ?? 0) + 1 );
			$final_search_range_seconds = dd_date::convert_date_to_seconds($dd_date_clone)-1;

		}elseif ($dd_date->get_month() !== null) {

			$dd_date_clone = clone $dd_date;
			$dd_date_clone->set_month( ($dd_date_clone->get_month() ?? 0) + 1 );
			$final_search_range_seconds = dd_date::convert_date_to_seconds($dd_date_clone)-1;

		}elseif ($dd_date->get_year() !== null) {

			$dd_date_clone = clone $dd_date;
			$dd_date_clone->set_year( ($dd_date_clone->get_year() ?? 0) + 1 );
			$final_search_range_seconds = dd_date::convert_date_to_seconds($dd_date_clone)-1;

		}


		return $final_search_range_seconds;
	}//end get_final_search_range_seconds



	/**
	* BUILD_DD_DATE_WITH_TIME
	* Internal helper: constructs a dd_date from a plain object and injects the computed 'time'.
	*
	* Used exclusively by add_time() to avoid repeating the same three-step pattern
	* (construct → compute seconds → inject) for every container in a data item.
	*
	* If the source already carries a 'time' field that differs from the freshly computed
	* value, a WARNING is logged and the calculated value wins. This can happen when a
	* record is imported or manually edited without recomputing the 'time' field.
	*
	* (!) The server-computed 'time' always overrides the client-supplied one; the client
	* must never be trusted to supply a correct absolute-seconds value.
	*
	* @param object $source  A plain dd_date-shaped object (year, month, day, ...).
	* @return dd_date        A typed dd_date with 'time' freshly set.
	*/
	private static function build_dd_date_with_time( object $source ) : dd_date {

		$dd_date = new dd_date($source);
		$time    = dd_date::convert_date_to_seconds($dd_date);

		if (isset($source->time) && $source->time !== $time) {
			debug_log(__METHOD__
				.' Unequal time seconds value: current: '.to_string($source->time).', calculated: '.$time.'. Used calculated time.'
				, logger::WARNING
			);
		}

		$dd_date->set_time($time);

		return $dd_date;
	}//end build_dd_date_with_time



	/**
	* ADD_TIME
	* Injects (or recomputes) the absolute-seconds 'time' property for each dd_date container
	* inside a single stored data-item object.
	*
	* The detection of which mode applies is done by inspecting which top-level key is present
	* in $current_data, since the modes are mutually exclusive:
	*   - 'period' key present  → period mode (duration container)
	*   - 'start' key present   → date / range / time_range / date_time mode
	*       additionally processes 'end' when present for range modes
	*   - 'hour' key at root    → bare time mode (the item itself is the dd_date)
	*   - none of the above     → item is returned unchanged (unknown/empty shape)
	*
	* This method is called by save() for every non-empty item in the data array. It is
	* also public so that data-migration and import tools can call it standalone.
	*
	* @param object $current_data A single stored date record (one array entry from get_data()).
	* @return object              The same object with 'time' set/updated on each container.
	*/
	public static function add_time( object $current_data ) : object {

		// Period mode
			if( isset($current_data->period) ) {
				$current_data->period = self::build_dd_date_with_time($current_data->period);
				return $current_data;
			}

		// Date / Range mode
			if( isset($current_data->start) ) {
				$current_data->start = self::build_dd_date_with_time($current_data->start);
				if( isset($current_data->end) ) {
					$current_data->end = self::build_dd_date_with_time($current_data->end);
				}
				return $current_data;
			}

		// Time mode (hour at root level, or bare dd_date with hour set)
		// When the item itself is the dd_date (no 'start' wrapper), 'hour' acts as the
		// discriminator. The whole $current_data object is replaced by a typed dd_date.
			if( isset($current_data->hour) ) {
				return self::build_dd_date_with_time($current_data);
			}

		return $current_data;
	}//end add_time



	/**
	* UPDATE_DATA_VERSION
	* Handles schema/data migration requests for this component type across stored records.
	*
	* Called by the data-version update tool when the platform needs to migrate all records
	* of a given component type to a new format. The $update_version string identifies the
	* target schema version (e.g. "7.0" assembled from the array passed in $request_options).
	*
	* component_date currently has no pending migrations. The default branch returns result=0
	* to signal "no migration applicable for this version", so the caller can skip.
	*
	* Response result codes:
	*   0 — no applicable migration; action ignored
	*   1 — migration was applied successfully
	*   2 — migration was attempted but the stored data was already up-to-date
	*
	* @param object $request_options  Options object with keys:
	*   - update_version array  Target version parts (joined with '.').
	*   - data_unchanged mixed  Current unchanged data snapshot.
	*   - reference_id mixed    Identifier for the record being updated.
	*   - tipo string           Ontology term of the component.
	*   - section_id mixed      Section record id.
	*   - section_tipo string   Ontology term of the parent section.
	*   - context string        'update_component_data' (default).
	* @return object $response  stdClass with ->result (int), ->msg (string).
	*/
	public static function update_data_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version 	= null;
			$options->data_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_data';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version = $options->update_version;
			$data_unchanged = $options->data_unchanged;
			$reference_id 	= $options->reference_id;
			$section_tipo 	= $options->section_tipo ?? '';

		$update_version = implode(".", $update_version);
		switch ($update_version) {

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}


		return $response;
	}//end update_data_version



	/**
	* GET_CALCULATION_DATA
	* Returns date data in a form suitable for numeric calculations (info/calculation components).
	*
	* Used by section/record calculation fields that need a number they can apply arithmetic to.
	* Supports two output formats controlled by $options->format:
	*
	*   'unix_timestamp' (default) — returns the sum of unix timestamps (seconds since 1970-01-01)
	*                                across all stored records. Suitable for arithmetic comparisons.
	*   'dd_date'                  — returns the raw sub-object (dd_date-shaped) for the first
	*                                record only, with a 'format' hint ('period' or 'date') added.
	*                                Useful when the caller needs field-level access (year, month…).
	*
	* The sub-object to read is selected by $options->select (default 'start'). To read a period
	* duration pass select='period'. If the selected key is absent in any record, the method
	* returns false immediately.
	*
	* @param object|null $options = null  Options object with optional keys:
	*   - select string  Sub-object key to extract ('start' | 'end' | 'period'). Default 'start'.
	*   - format string  Output format ('unix_timestamp' | 'dd_date'). Default 'unix_timestamp'.
	* @return mixed  int (sum of unix timestamps), object (dd_date sub-object), or false on error.
	*/
	public function get_calculation_data( ?object $options=null ) : mixed {

		$ar_data = [];

		// options
			$select	= $options->select ?? 'start';
			$format	= $options->format ?? 'unix_timestamp';

		$data = $this->get_data();
		if (!empty($data)) {
			foreach ($data as $current_data) {

				if (isset($current_data->{$select})){
					$data_obj =	$current_data->{$select};
				}else{
					return false;
				}

				if($format==='dd_date'){
					// Annotate the returned sub-object with a 'format' hint so the caller
					// knows how to interpret its fields without re-reading the ontology.
					$data_obj->format = ($select==='period') ? 'period' : 'date';
					return $data_obj; // Only one expected
				}

				// value to seconds
				if (!empty($data_obj)) {
					$dd_date		= new dd_date($data_obj);
					$unix_timestamp	= $dd_date->get_unix_timestamp();

					$ar_data[] = $unix_timestamp ;
				}
			}
		}

		$data = array_sum($ar_data);


		return (int)$data;
	}//end get_calculation_data



	/**
	* GET_STATS_VALUE_WITH_VALOR_ARGUMENTS
	* Extracts a named field from a JSON-encoded date value for statistics purposes.
	*
	* Accepts a raw JSON string (as stored in the database date column), decodes it, and
	* returns the value of $valor_arguments from the 'start' container of the first record.
	* Falls back to $value itself when the JSON decode fails or the field is absent.
	*
	* @param mixed  $value            Raw JSON string or fallback scalar.
	* @param string $valor_arguments  Name of the dd_date field to extract (e.g. 'year').
	* @return string|int              The extracted field value, or $value on decode failure.
	* @deprecated Do not use this method (diffusion v6 ?)
	*/
	public static function get_stats_value_with_valor_arguments($value, $valor_arguments) : string|int {

		$value_decoded = json_decode($value);
		if (!empty($value_decoded)) {
			$date = reset($value_decoded);
			if (isset($date->start->{$valor_arguments})) {
				$label = $date->start->{$valor_arguments}; // Overwrite value
			}
		}else{
			$label = $value;
		}

		return $label;
	}//end get_stats_value_with_valor_arguments



	/**
	* DATA_TO_TEXT
	* Converts a single data-entry object to a searchable date string in "Y-m-d" format.
	*
	* Intended for full-text indexing. Reads 'start' and 'end' containers if present,
	* formats each as "Y-m-d" via dd_date::get_dd_timestamp(), and joins them with '/'.
	* Only 'start' and 'end' are considered; 'period' and bare time containers are ignored.
	*
	* @param object|null $data_entry  A single stored date record, or null.
	* @return string                  A "/" joined date string, or empty string if $data_entry is empty.
	* @deprecated Do not use this method
	*/
	public static function data_to_text( ?object $data_entry ) : string {

		if (empty($data_entry)) {
			$text = '';
		}else{
			$to_timestamp = function($item) {
				$dd_date = new dd_date($item);
				return $dd_date->get_dd_timestamp(
					"Y-m-d", // date_format
					true // padding
				);
			};
			$ar_text = [];
			if (isset($data_entry->start)) {
				$ar_text[] = $to_timestamp($data_entry->start);
			}
			if (isset($data_entry->end)) {
				$ar_text[] = $to_timestamp($data_entry->end);
			}
			$text = implode('/', $ar_text);
		}

		return $text;
	}//end data_to_text



	/**
	* GET_ORDER_PATH
	* Resolves the JSONB path descriptor used to ORDER BY this date column in SQL queries.
	*
	* Overrides component_common::get_order_path() to handle the special case of the
	* Time Machine timestamp component (tipo = DEDALO_TIME_MACHINE_COLUMN_TIMESTAMP, 'dd559').
	* That component's data is stored in a dedicated 'timestamp' column rather than in the
	* JSONB matrix, so instead of building a JSONB path the path object is given a literal
	* 'column' property that the SQL builder will use directly without further parsing.
	*
	* For all other date components, the parent implementation generates the standard
	* JSONB accessor path (e.g. '0->"start"->"time"') used to order by absolute seconds.
	*
	* @see https://habr.com/en/company/postgrespro/blog/500440/   (JSONB path ordering)
	* @see https://www.postgresql.org/docs/current/functions-json.html
	* @see https://www.postgresql.org/docs/current/datatype-json.html#TYPE-JSONPATH-ACCESSORS
	*
	* @param string $component_tipo  Ontology term of the component being ordered.
	* @param string $section_tipo    Ontology term of the parent section.
	* @return array<object>          Order path descriptor array; first element may carry a
	*                                literal 'column' override when tipo is dd559.
	*/
	public function get_order_path( string $component_tipo, string $section_tipo ) : array {

		// self path
		$path = parent::get_order_path($component_tipo, $section_tipo);

		// time machine cases. Do not resolve ddo_map. Tipo 'dd559' is column `timestamp`
		// (!) Special case: the Time Machine timestamp is a real DB column, not a JSONB field.
		// Setting 'column' on the path segment tells the SQL builder to use it literally.
		if($this->tipo===DEDALO_TIME_MACHINE_COLUMN_TIMESTAMP) {
			// When `column` property is set, it will be used literally instead of parsing the path.
			$path[0]->column = 'timestamp';
		}

		return $path;
	}//end get_order_path



	/**
	* GET_LIST_VALUE
	* Returns the component's data as an array of human-readable date strings for list display.
	*
	* Overrides component_common::get_list_value() to convert each raw dd_date container
	* object into a plain string using data_item_to_value() for the component's date_mode.
	* Empty data-items within the array are mapped to null to preserve index alignment
	* with the source array.
	*
	* Returns null (not an empty array) when the component holds no data, following the
	* component_common convention that empty array or string → null.
	*
	* @return array<string|null>|null  Array of formatted date strings, one per record; null if empty.
	*/
	public function get_list_value() : ?array {

		$data = $this->get_data();
		if (empty($data)) {
			return null;
		}

		$date_mode = $this->get_date_mode();

		$list_value = [];
		foreach ($data as $data_item) {
			$list_value[] = !empty($data_item)
				? self::data_item_to_value($data_item, $date_mode, '/')
				: null;
		}


		return $list_value;
	}//end get_list_value



	/**
	* CONFORM_IMPORT_DATA
	* Parses a raw import string (from a CSV cell) or JSON blob into the component's stored array format.
	*
	* The method is the import contract entry point for component_date (see dedalo-import-data skill).
	* It accepts multiple input shapes in order of precedence:
	*
	*   1. JSON-encoded dd_date array (full structured form):
	*        '[{"start":{"year":2012,"month":11,"day":7,...},"end":{...}}]'
	*      The JSON is decoded and the parsed value array is used directly.
	*
	*   2. Flat string date (year alone, year/month, or full y/m/d):
	*        '-205/05/21'          → { start: { year:-205, month:5, day:21 } }
	*        '2022/04'             → { start: { year:2022, month:4 } }
	*        '1930'                → { start: { year:1930 } }
	*
	*   3. Flat range with '<>' separator:
	*        '-205/05/21 <> 185/01/30'  → { start:{...}, end:{...} }
	*
	*   4. Multi-value with '|' separator:
	*        '1852/12/22 | 1853/02/18'  → [ { start:{...} }, { start:{...} } ]
	*
	*   5. Range + multi-value combined (both '<>' and '|'):
	*        '1852/12/22 <> 1852/12/25 | 1853/02/18'
	*
	*   6. Alternative field-order via $column_name suffix:
	*        column_name 'rsc85_dmy' → day/month/year parsing ('22/12/2023')
	*        column_name 'rsc85_mdy' → month/day/year parsing ('12/22/2023') (US dates)
	*        column_name 'rsc85'     → default year/month/day ('ymd')
	*
	*   7. Alternative separators: '-' and '.' are normalised to '/' before parsing.
	*        '2012-12-22', '2012.12.22'
	*
	*   8. Negative (BCE) years at either position:
	*        '-200/05/01'  or  '01/05/-200'
	*
	* Malformed items are not stored: they are recorded in $response->errors and skipped.
	* A dd_date validation pass (dd_date($obj, true)) catches field range violations.
	*
	* Note: for 'mdy' with only two parts (month/year without day) the date is rejected
	* and added to $response->errors because the order is ambiguous without a day component.
	*
	* @param string $import_value  Raw CSV cell value or JSON string.
	* @param string $column_name   CSV column header; format: '<tipo>' or '<tipo>_<order>'.
	*                              The optional suffix '_dmy' / '_mdy' / '_ymd' controls
	*                              the field parsing order. Default 'ymd'.
	* @return object $response     stdClass with:
	*   - result  array|null  Parsed date array ready for save(), or null on complete failure.
	*   - errors  array       Array of error stdClass objects (may be non-empty even when result is set).
	*   - msg     string      'OK' on success, or error description.
	*/
	public function conform_import_data( string $import_value, string $column_name ) : object {

		// Response
		$response = new stdClass();
			$response->result	= null;
			$response->errors	= [];
			$response->msg		= 'Error. Request failed';

		// Check if is a JSON string. Is yes, decode
			if(json_handler::is_json($import_value)){
				// try to JSON decode (null on not decode)
				$data_from_json = json_handler::decode($import_value); // , false, 512, JSON_INVALID_UTF8_SUBSTITUTE
				$lang = $this->lang;
				$value = (is_object($data_from_json) && property_exists($data_from_json, $lang))
					? $data_from_json->$lang
					: $data_from_json;
			}else{

				// column name could be only the tipo as "rsc89" or a date order as "rsc85_dmy"
				// the component tipo are always the first tipo in the column name
				// by default the date order will be year/month/day ymd
				$ar_tipos	= explode(locator::DELIMITER, $column_name);
				$order		= $ar_tipos[1] ?? 'ymd';

				$value = [];
				// explode the possibles rows of the date
				$ar_date_rows	= explode('|', $import_value);

				foreach ($ar_date_rows as $key => $date_row) {

					$date_range	= explode('<>',$date_row);
					$date_obj = new stdClass();
					foreach ($date_range as $key => $current_date) {

						// remove empty spaces and check if the current date has information else continue to next one
						// avoid empty information
						$current_date = trim($current_date);
						if(empty($current_date)){
							continue;
						}
						// set the mode of date dependent of the length of the date 0=start / 1=end
						$mode = ($key===0) ? 'start' : 'end';

						// replace all accepted separators -. by /
						$current_date = preg_replace('/[-.]/', '/', $current_date);

						// replace the negative year situations
						// year can to be at beginning or at end of the date
						// -200-05-01 or 01-05--200
						// -200/05/01 or 01/05/-200
						//
						// After the earlier preg_replace('/[-.]/', '/') the leading minus
						// of a negative year is gone because '-' was treated as a separator.
						// Restore it in two steps:
						//   Step A: if the string now starts with '/' the first char was a '-'
						//           that belonged to the year sign, not a separator.
						//   Step B: a trailing negative year becomes '//200' after the replace;
						//           collapse '//' back to '/-' to restore the sign.
							// if negative year is at begin replace the / for the -
							$begins	= substr($current_date, 0, 1);
							if($begins==='/'){
								$current_date = '-'.substr($current_date, 1);
							}
							// if the negative year is the last position the previous preg_replace was changed it as //200
							// this replace will change it to /-200
							$current_date = preg_replace('/\/\//', '/-', $current_date);

						// explode the string into parts
						$ar_date_parts	= explode('/',$current_date);
						$lenght			= count($ar_date_parts);

						$dd_date = new dd_date();

						// if the length of the parts has only 1 item it will be the year
						// and end the loop
						if($lenght === 1){
							$dd_date->set_year((int)$ar_date_parts[0]);
							$date_obj->$mode = $dd_date;
							continue;
						}

						switch ($order) {
							case 'dmy':
								// month and year : 04/2022
								if($lenght === 2){
									if(isset($ar_date_parts[0])){
										$dd_date->set_month((int)$ar_date_parts[0]);
									}
									if(isset($ar_date_parts[1])){
										$dd_date->set_year((int)$ar_date_parts[1]);
									}
								}
								// day, moth, year (other countries dates) : 25/04/2022
								elseif($lenght === 3){
									if(isset($ar_date_parts[0])) {
										$dd_date->set_day((int)$ar_date_parts[0]);
									}
									if(isset($ar_date_parts[1])){
										$dd_date->set_month((int)$ar_date_parts[1]);
									}
									if(isset($ar_date_parts[2])){
										$dd_date->set_year((int)$ar_date_parts[2]);
									}
								}
								break;
							case 'mdy':
								// month and year (USA dates): 04/2022
								if($lenght === 2){
									// if(isset($ar_date_parts[0])){
									// 	$dd_date->set_month((int)$ar_date_parts[0]);
									// }
									// if(isset($ar_date_parts[1])){
									// 	$dd_date->set_year((int)$ar_date_parts[1]);
									// }
									// Do not resolve date in this case because day without month is not valid
									$failed = new stdClass();
										$failed->section_id		= $this->section_id;
										$failed->data			= stripslashes( $import_value );
										$failed->component_tipo	= $this->get_tipo();
										$failed->msg			= 'IGNORED: Invalid mdy date format for current_date: ' . to_string($current_date);
									$response->errors[] = $failed;
								}
								// moth, day, year (USA dates) : 04/25/2022
								elseif($lenght === 3){
									if(isset($ar_date_parts[0])) {
										$dd_date->set_month((int)$ar_date_parts[0]);
									}
									if(isset($ar_date_parts[1])){
										$dd_date->set_day((int)$ar_date_parts[1]);
									}
									if(isset($ar_date_parts[2])){
										$dd_date->set_year((int)$ar_date_parts[2]);
									}
								}
								break;
							case 'ymd':
							default:
								// year and month  : 2022/04
								if($lenght === 2){
									if(isset($ar_date_parts[0])){
										$dd_date->set_year((int)$ar_date_parts[0]);
									}
									if(isset($ar_date_parts[1])){
										$dd_date->set_month((int)$ar_date_parts[1]);
									}
								}
								// year, month, date (China, Korean, Japan, Iran dates) : 2022/04/25
								elseif($lenght === 3){
									if(isset($ar_date_parts[0])) {
										$dd_date->set_year((int)$ar_date_parts[0]);
									}
									if(isset($ar_date_parts[1])){
										$dd_date->set_month((int)$ar_date_parts[1]);
									}
									if(isset($ar_date_parts[2])){
										$dd_date->set_day((int)$ar_date_parts[2]);
									}
								}
								break;
						}
						$date_obj->$mode = $dd_date;
					}

					// Cast to array: an empty stdClass becomes []; a populated one is non-empty.
					// Only append non-empty date containers so the stored array has no null slots.
					$is_empty_object = !(array)$date_obj;
					if (!$is_empty_object) {
						$value[] = $date_obj;
					}
				}
			}

		// check values (informative of errors)
		// value is expected to be an array of date objects with start/end properties;
		// JSON input could decode to other shapes (scalar, object): skip them safely
			if(!empty($value) && is_array($value)){

				foreach ($value as $current_date) {

					// expected object items only. Reject malformed items as plain strings
					// to prevent storing invalid date data
						if (!is_object($current_date)) {

							$failed = new stdClass();
								$failed->section_id		= $this->section_id;
								$failed->data			= stripslashes( $import_value );
								$failed->component_tipo	= $this->get_tipo();
								$failed->msg			= 'IGNORED: malformed data, expected date object and get: '.gettype($current_date);
							$response->errors[] = $failed;

							return $response;
						}

					foreach ($current_date as $key => $current_dd_date) {

						// only check date properties (skip 'id', 'lang' and other non date properties)
							if ($key!=='start' && $key!=='end') {
								continue;
							}

						// don't check null values
							if (is_null($current_dd_date)) {
								continue;
							}

						// expected object only
							if (!is_object($current_dd_date)) {
								debug_log(__METHOD__
									. " Wrong var type current_dd_date" . PHP_EOL
									. ' type: ' . gettype($current_dd_date) . PHP_EOL
									. ' current_dd_date: ' . to_string($current_dd_date) . PHP_EOL
									. ' import_value: ' . to_string($import_value) . PHP_EOL
									. ' column_name: ' . to_string($column_name) . PHP_EOL
									. ' tipo: ' . $this->tipo . PHP_EOL
									. ' section_tipo: ' . $this->section_tipo . PHP_EOL
									. ' model: ' . get_class($this)
									, logger::ERROR
								);
								continue;
							}

						// normalize dd_date instances to plain objects: dd_date properties
						// are private and would not iterate in the validation constructor.
						// json_encode + json_decode round-trip is the fastest way to produce
						// a plain stdClass from an object with only private properties.
						$current_date_obj = ($current_dd_date instanceof dd_date)
							? json_decode(json_encode($current_dd_date))
							: $current_dd_date;

						// Pass true as the second argument to enable validation mode:
						// dd_date will populate its ->errors property with any out-of-range
						// field values instead of silently clamping them.
						$dd_date = new dd_date($current_date_obj, true);

						// errors check
						// note that dd_date errors property is private: use the getter
						$dd_date_errors = $dd_date->get_errors();
						if(!empty($dd_date_errors)){

							$failed = new stdClass();
								$failed->section_id		= $this->section_id;
								$failed->data			= stripslashes( $import_value );
								$failed->component_tipo	= $this->get_tipo();
								$failed->msg			= 'IGNORED: malformed data '. to_string($import_value);
								$failed->errors			= $dd_date_errors;

							$response->errors[] = $failed;
						}
					}
				}
			}//end if(!empty($value))

		// to null when is empty
			if (!is_null($value) && empty($value)) {
				$value = null;
			}

		// values are array except for null
			if (is_object($value)) {
				$value = [$value];
			}

		$response->result	= $value;
		$response->msg		= 'OK';


		return $response;
	}//end conform_import_data



	/**
	* GET_DIFFUSION_VALUE
	* Produces the MySQL-ready string representation of the first stored date record.
	*
	* Overrides component_common::get_diffusion_value() to render date values as
	* "Y-m-d H:i:s" strings (MySQL DATETIME format) rather than the generic JSON blob.
	* Called by diffusion_mysql to populate a MYSQL DATE or DATETIME column.
	*
	* Per-mode output format:
	*   'range' / 'time_range' : "Y-m-d H:i:s,Y-m-d H:i:s" (start and end joined with ',')
	*   'period'               : "N years N months N days" (localised human string via label::get_label())
	*   'date' (default)       : "Y-m-d H:i:s" for the 'start' container only
	*
	* (!) Only the first element of $ar_diffusion_values is returned even when the component
	* holds multiple date records. The comment below ('Temporal !!') marks this as a known
	* limitation: multi-record diffusion is not yet solved. Do not rely on records beyond [0].
	*
	* The return value is forced to null when the formatted string is empty, to prevent
	* MySQL from receiving an empty string for a DATE/DATETIME column (which would cause
	* a type error or store '0000-00-00').
	*
	* @see diffusion_mysql (class.diffusion_mysql.php)
	* @param string|null $lang       = null  Target language (used for period label localisation).
	* @param object|null $option_obj = null  Reserved for future caller-supplied options.
	* @return string|null  MySQL-formatted date string, or null when data is empty or formats to blank.
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		$diffusion_value = null;

		// ar_dato
			$ar_data = $this->get_data();
			if(empty($ar_data)){
				return $diffusion_value;
			}

		// date mode
			$date_mode = $this->get_date_mode();

		$ar_diffusion_values = array();
		foreach($ar_data as $data) {

			// $ar_diffusion_values[] = self::data_item_to_value($data, $date_mode);

			// DES
			switch ($date_mode) {
				case 'range':
				case 'time_range':
					$ar_date=array();
					// start
					if (isset($data->start) && isset($data->start->year)) {
						$dd_date 		= new dd_date($data->start);
						$timestamp 		= $dd_date->get_dd_timestamp("Y-m-d H:i:s");
						$ar_date[] 		= $timestamp;
					}
					// end
					if (isset($data->end) && isset($data->end->year)) {
						$dd_date 		= new dd_date($data->end);
						$timestamp 		= $dd_date->get_dd_timestamp("Y-m-d H:i:s");
						$ar_date[] 		= $timestamp;
					}
					$ar_diffusion_values[] = implode(',',$ar_date);
					break;

				case 'period':
					// Compute days
					if (isset($data->period)) {
						# $seconds = $data->period->time;
						# $days = ceil($seconds/3600/24);
						$ar_string_period = [];
						if (isset($data->period->year)) {
							$ar_string_period[] = $data->period->year .' '. label::get_label('years', $lang);
						}
						if (isset($data->period->month)) {
							$ar_string_period[] = $data->period->month .' '. label::get_label('months', $lang);
						}
						if (isset($data->period->day)) {
							$ar_string_period[] = $data->period->day .' '. label::get_label('days', $lang);
						}
						$ar_diffusion_values[] = implode(' ',$ar_string_period);
					}
					break;

				case 'date':
				default:
					if (isset($data->start) && isset($data->start->year)) {
						$dd_date 		 		= new dd_date($data->start);
						$timestamp 				= $dd_date->get_dd_timestamp("Y-m-d H:i:s");
						$ar_diffusion_values[] 	= $timestamp;
					}
					break;
			}
		}//end foreach($ar_data as $data)

		if (empty($ar_diffusion_values)) {
			return null;
		}

		# NOTE
		# For publication, the case in which a component holds more than one date record is not yet solved — needs evaluation.
		$diffusion_value = $ar_diffusion_values[0] ?? null; // Temporal !!

		// Force null on empty value to avoid errors on MYSQL save value invalid format
		// Only valid dates or null area accepted
		if (empty($diffusion_value)) {
			$diffusion_value = null;
		}


		return $diffusion_value;
	}//end get_diffusion_value



}//end class component_date
