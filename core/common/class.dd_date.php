<?php declare(strict_types=1);
/**
* CLASS DD_DATE
* A locale-aware, timestamp-free date/time value object for Dédalo.
*
* PHP's native DateTime and Unix timestamps cannot represent dates outside the
* range of a 32-/64-bit integer, making BCE dates, very large CE years, and
* partial dates (year-only, year+month) awkward or impossible. dd_date solves
* this by storing each calendar field as a plain nullable integer and supplying
* its own arithmetic for sorting and serialization.
*
* Responsibilities:
* - Hold individual date/time fields (year, month, day, hour, minute, second, ms)
*   without requiring all fields to be populated.
* - Validate fields on assignment, with a `$constrain` mode that rejects out-of-
*   range values outright (used when strict parsing is required).
* - Serialize to Dédalo's internal "dd_timestamp" string format (Y-m-d H:i:s),
*   which is aware of BCE (negative year) values that PHP's date() cannot handle.
* - Convert to/from Unix timestamps for interop with PHP's DateTime when the date
*   is within the representable range.
* - Provide a monotonic "seconds" value (convert_date_to_seconds) for sorting and
*   time-range queries without relying on PHP's mktime().
* - Carry an optional `$op` field used only during search operations to attach a
*   comparison operator to the date value.
*
* Implements JsonSerializable so that json_encode() emits only the non-null
* fields, matching the sparse data shape expected by component_date.
*
* Extended by: nothing (concrete value object).
* Used by: component_date, trait.search_component_date.php, and any code
*          that must handle dates outside the Unix epoch range.
*
* @package Dédalo
* @subpackage Core
*/
class dd_date implements JsonSerializable {



	/**
	* Date component separator for formatted output.
	* Used by display/export routines that need a localized separator character.
	* @var string $separator
	*/
	static string $separator = '/';

	/**
	* Time component separator for formatted output.
	* @var string $time_separator
	*/
	static string $time_separator = ':';

	/**
	* Number of days assigned to one virtual year in the sort-seconds model.
	* Uses 372 (= 31 × 12) rather than 365 so that every month can contribute
	* exactly 31 days without fractional carry-over, making the arithmetic
	* symmetric and predictable even for partial dates.
	* @var int $virtual_year_days
	*/
	static int $virtual_year_days  = 372;

	/**
	* Number of days assigned to one virtual month in the sort-seconds model.
	* See $virtual_year_days for the rationale behind using 31 instead of 30/28.
	* @var int $virtual_month_days
	*/
	static int $virtual_month_days = 31;

	/**
	* Day of month (1–31), or null if not specified.
	* @var ?int $day
	*/
	public ?int $day = null;

	/**
	* Month of year (1–12), or null if not specified.
	* @var ?int $month
	*/
	public ?int $month = null;

	/**
	* Calendar year, including BCE years as negative integers (e.g. -44 = 44 BCE).
	* Null when not specified.
	* @var ?int $year
	*/
	public ?int $year = null;

	/**
	* Pre-computed monotonic sort value in seconds, as produced by
	* convert_date_to_seconds(). Stored so callers can retrieve it without
	* recomputing. Null until explicitly set via set_time().
	* @var ?int $time
	*/
	public ?int $time = null;

	/**
	* Hour of day (0–23), or null if not specified.
	* @var ?int $hour
	*/
	public ?int $hour = null;

	/**
	* Minute of hour (0–59), or null if not specified.
	* @var ?int $minute
	*/
	public ?int $minute = null;

	/**
	* Second of minute (0–59), or null if not specified.
	* @var ?int $second
	*/
	public ?int $second = null;

	/**
	* Milliseconds (0–999), or null if not specified.
	* Private because sub-second precision is rarely needed and should only be
	* accessed via get_ms() / set_ms().
	* @var ?int $ms
	*/
	private ?int $ms = null;

	/**
	* Validation errors accumulated during construction or individual set_*() calls.
	* Populated by the constructor and by set_* methods when $constrain is true.
	* Check with get_errors() before trusting the object's state.
	* @var array $errors
	*/
	private array $errors = [];

	/**
	* Comparison operator string attached to this date for search use only.
	* Examples: '>', '<', '>=', '<=', '='.
	* Null when the instance is used as a plain value, not a search filter.
	* @var ?string $op
	*/
	private ?string $op = null;

	/**
	* Raw timestamp string as received from the client or database, preserved for
	* round-trip fidelity. Populated via set_timestamp(); not derived automatically.
	* @var ?string $timestamp
	*/
	private ?string $timestamp = null;




	/**
	* __CONSTRUCT
	* Hydrate a dd_date from a plain object whose keys match set_* method names.
	*
	* Each property on $data is dispatched to the corresponding set_<key>() method.
	* Unknown keys are logged and recorded in $errors. The 'format' key from
	* component_date data payloads is intentionally skipped here.
	* After hydration, check_day() validates day-in-month consistency.
	*
	* @param object|null $data = null - source object; null produces an empty instance
	* @param bool $constrain = false - when true, out-of-range field values are
	*   rejected and recorded in $errors instead of being stored with a warning
	* @return void
	*/
	public function __construct( ?object $data=null, bool $constrain=false ) {

		// null case
			if (is_null($data)) {
				return;
			}

		// Nothing to do on construct (for now)
			if (!is_object($data)) {

				$msg = " wrong data format. object expected. Given type: ".gettype($data);
				debug_log(__METHOD__
					. $msg
					.' data: ' . to_string($data)
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					dump(debug_backtrace()[0], $msg);
				}

				$this->errors[] = $msg;
				return;
			}

		// set properties
			foreach ($data as $key => $value) {

				if (!isset($value) || is_null($value))  continue; // Skip empty non zero values
				if($key==='format') continue; //  skip format from component_date data

				$method = 'set_'.$key;
				if (method_exists($this, $method)) {

					$set_value = $this->{$method}($value, $constrain);
					if($set_value===false && empty($this->errors)) {
						$this->errors[] = 'Invalid value for: '.$key.' . value: '.to_string($value);
					}

				}else{

					debug_log(__METHOD__
						.' Ignored received property: "'.$key.'". Is not defined as set method.'. PHP_EOL
						.' property: ' . to_string($key) . PHP_EOL
						.' data: ' . to_string($data)
						, logger::ERROR
					);
					$this->errors[] = 'Ignored received property: '.$key.' not defined as set method. Data: '. json_encode($data, JSON_PRETTY_PRINT);
				}
			}

		// check day
			$check_day = $this->check_day();
			if($check_day === false){
				debug_log(__METHOD__
					.' Invalid value for day value: '.to_string($this->day)
					, logger::ERROR
				);
				$this->errors[] = 'Invalid value for day value: '.$this->day;
			}
	}//end __construct


	/**
	* SET_ERRORS
	* Replace the errors list with the given value or values.
	* Accepts either a single error message (string/int/any scalar) or an array
	* of messages. Callers that need to inject pre-built error lists from upstream
	* validation can use this instead of constructing a new instance.
	* @param mixed $value - a single error value or an array of error values
	* @return void
	*/
	public function set_errors(mixed $value) : void {

		$this->errors = is_array($value)
			? $value
			: [$value];
	}//end set_errors



	/**
	* GET_ERRORS
	* Return the list of validation errors accumulated since construction.
	* An empty array means the instance is valid.
	* @return array
	*/
	public function get_errors() : array {

		return $this->errors;
	}//end get_errors



	/**
	* SET_TIME
	* Store the pre-computed monotonic sort value (seconds since the virtual epoch).
	* This value is produced by convert_date_to_seconds() and stored for cheap
	* retrieval without recomputing. It is NOT a Unix timestamp.
	* @param int $value - absolute seconds value from convert_date_to_seconds()
	* @return void
	*/
	public function set_time(int $value) : void {

		$this->time = (int)$value;
	}//end set_time



	/**
	* GET_TIME
	* Return the stored monotonic sort value in seconds, or null if not yet set.
	* @return int|null $this->time
	*/
	public function get_time() : ?int {

		return $this->time ?? null;
	}//end get_time



	/**
	* SET_YEAR
	* Set the calendar year. Accepts negative integers for BCE years (e.g. -44).
	* No range constraint is applied; any integer is valid for archaeological dates.
	* @param int|string $value - year as integer or numeric string
	* @param bool $constrain = false - ignored for year (no valid range to enforce)
	* @return bool - always true
	*/
	public function set_year(int|string $value, bool $constrain=false) : bool {

		$this->year = (int)$value;

		return true;
	}//end set_year



	/**
	* GET_YEAR
	* Return the stored year, or null if not set.
	* @return int|null $this->year
	*/
	public function get_year() : ?int {

		return $this->year ?? null;
	}//end get_year



	/**
	* SET_MONTH
	* Set the calendar month (1–12).
	* Values outside this range log a warning. When $constrain is true, an
	* out-of-range value additionally pushes an error to $errors and returns false
	* so the caller can detect rejection.
	* @param int|string $value - month number (1 = January … 12 = December)
	* @param bool $constrain = false - reject and record error if out of 1–12 range
	* @return bool - false when constrain rejects the value, true otherwise
	*/
	public function set_month(int|string $value, bool $constrain=false) : bool {

		// check valid value (constrain)
			if( (int)$value<1 || (int)$value>12 ) {

				$msg = 'Value is not standard (1 to 12) : '.to_string($value);

				if ($constrain===true) {
					debug_log(__METHOD__
						.' Error on set month. ' . $msg
						, logger::ERROR
					);
					$this->errors[] = 'Ignored set month. '. $msg;

					return false;
				}

				debug_log(__METHOD__
					.' Warning on set month. ' . $msg
					, logger::WARNING
				);
			}

		// set value
			$this->month = (int)$value;

		return true;
	}//end set_month



	/**
	* GET_MONTH
	* Return the stored month (1–12), or null if not set.
	* @return int|null $this->month
	*/
	public function get_month() : ?int {

		return $this->month ?? null;
	}//end get_month



	/**
	* SET_DAY
	* Set the day of the month (1–31).
	* Out-of-range values log a warning; with $constrain=true they are rejected.
	* Note: this only enforces the 1–31 outer bound. Finer validation against the
	* specific month and leap-year status is performed separately by check_day().
	* @param int|string $value - day number (1–31)
	* @param bool $constrain = false - reject and record error if outside 1–31
	* @return bool - false when constrain rejects the value, true otherwise
	*/
	public function set_day(int|string $value, bool $constrain=false) : bool {

		// check valid value (constrain)
			if( (int)$value<1 || (int)$value>31 ) {

				$msg = 'Value is not standard (1 to 31) : '.to_string($value);

				if ($constrain===true) {
					debug_log(__METHOD__
						.' Error on set day. ' . $msg
						, logger::ERROR
					);
					$this->errors[] = 'Ignored set day. '. $msg;

					return false;
				}

				debug_log(__METHOD__
					.' Warning on set day. ' . $msg
					, logger::WARNING
				);
			}

		// set value
			$this->day = (int)$value;

		return true;
	}//end set_day



	/**
	* GET_DAY
	* Return the stored day of month (1–31), or null if not set.
	* @return int|null $this->day
	*/
	public function get_day() : ?int {

		return $this->day ?? null;
	}//end get_day



	/**
	* CHECK_DAY
	* Validate the stored day against the stored month, including leap-year logic.
	* Called automatically at the end of __construct(). Returns true when:
	* - day is null (not set) — nothing to validate,
	* - the month is unknown — cannot perform month-specific check,
	* - the day is within the valid range for the given month and year.
	*
	* Returns false when the day exceeds the maximum for the month, e.g. day=30
	* in February, day=31 in April, etc.
	* @return bool - false when the day is out of range for the current month/year
	*/
	public function check_day() : bool {

		$day = $this->day ?? null;
		if(empty($day)){
			return true;
		}

		$year	= $this->get_year();
		$month	= $this->get_month();

		// February case
			if ($month===2 && !is_null($year)) {
				// check if the year is leap
				$leap = ((0 == $year % 4) && (0 != $year % 100) || (0 == $year % 400))
					? true
					: false;

				// check if the day is in leap year
				if($leap === true && $day > 29){
					return false;
				}
				if($leap === false && $day > 28){
					return false;
				}
			}

		// months with 30 days
			$months_with_30_days = [4,6,9,11];
			if(in_array($month, $months_with_30_days) && $day > 30){
				return false;
			}

		// moths with 31 days
			$months_with_31_days = [1,3,5,7,8,10,12];
			if(in_array($month, $months_with_31_days) && $day > 31){
				return false;
			}


		return true;
	}//end check_day



	/**
	* SET_HOUR
	* Set the hour of day (0–23).
	* Out-of-range values log a warning; with $constrain=true they are rejected.
	* @param int|string $value - hour (0–23)
	* @param bool $constrain = false - reject and record error if outside 0–23
	* @return bool - false when constrain rejects the value, true otherwise
	*/
	public function set_hour(int|string $value, bool $constrain=false) : bool {

		// check valid value (constrain)
			if( (int)$value<0 || (int)$value>23 ) {

				$msg = 'Value is not standard (0 to 23) : '.to_string($value);

				if ($constrain===true) {
					debug_log(__METHOD__
						.' Error on set hour. '. $msg
						, logger::ERROR
					);
					$this->errors[] = 'Ignored set hour. '. $msg;

					return false;
				}

				debug_log(__METHOD__
					.' Warning on set hour. ' . $msg
					, logger::WARNING
				);
			}

		// set value
			$this->hour = (int)$value;

		return true;
	}//end set_hour



	/**
	* GET_HOUR
	* Return the stored hour (0–23), or null if not set.
	* @return int|null $this->hour
	*/
	public function get_hour() : ?int {

		return $this->hour ?? null;
	}//end get_hour



	/**
	* SET_MINUTE
	* Set the minute of the hour (0–59).
	* Out-of-range values log a warning; with $constrain=true they are rejected.
	* @param int|string $value - minute (0–59)
	* @param bool $constrain = false - reject and record error if outside 0–59
	* @return bool - false when constrain rejects the value, true otherwise
	*/
	public function set_minute(int|string $value, bool $constrain=false) : bool {

		// check valid value (constrain)
			if( (int)$value<0 || (int)$value>59 ) {

				$msg = 'Value is not standard (0 to 59) : '.to_string($value);

				if ($constrain===true) {
					debug_log(__METHOD__
						.' Error on set minute. '. $msg
						, logger::ERROR
					);
					$this->errors[] = 'Ignored set minute. '. $msg;

					return false;
				}

				debug_log(__METHOD__
					.' Warning on set minute. ' . $msg
					, logger::WARNING
				);
			}

		// set value
			$this->minute = (int)$value;

		return true;
	}//end set_minute



	/**
	* GET_MINUTE
	* Return the stored minute (0–59), or null if not set.
	* @return int|null $this->minute
	*/
	public function get_minute() : ?int {

		return $this->minute ?? null;
	}//end get_minute



	/**
	* SET_SECOND
	* Set the second of the minute (0–59).
	* Out-of-range values log a warning; with $constrain=true they are rejected.
	* @param int|string $value - second (0–59)
	* @param bool $constrain = false - reject and record error if outside 0–59
	* @return bool - false when constrain rejects the value, true otherwise
	*/
	public function set_second(int|string $value, bool $constrain=false) : bool {

		// check valid value (constrain)
			if( (int)$value<0 || (int)$value>59 ) {

				$msg = 'Value is not standard (0 to 59) : '.to_string($value);

				if ($constrain===true) {
					debug_log(__METHOD__
						.' Error on set second. '. $msg
						, logger::ERROR
					);
					$this->errors[] = 'Ignored set second. '. $msg;

					return false;
				}

				debug_log(__METHOD__
					.' Warning on set second. ' . $msg
					, logger::WARNING
				);
			}

		// set value
			$this->second = (int)$value;

		return true;
	}//end set_second



	/**
	* GET_SECOND
	* Return the stored second (0–59), or null if not set.
	* @return int|null $this->second
	*/
	public function get_second() : ?int {

		return $this->second ?? null;
	}//end get_second



	/**
	* SET_MS
	* Set the millisecond component (0–999).
	* Out-of-range values log a warning; with $constrain=true they are rejected.
	* @param int|string $value - milliseconds (0–999)
	* @param bool $constrain = false - reject and record error if outside 0–999
	* @return bool - false when constrain rejects the value, true otherwise
	*/
	public function set_ms(int|string $value, bool $constrain=false) : bool {

		// check valid value (constrain)
			if( (int)$value<0 || (int)$value>999 ) {

				$msg = 'Value is not standard (0 to 999) : '.to_string($value);

				if ($constrain===true) {
					debug_log(__METHOD__
						.' Error on set ms. '. $msg
						, logger::ERROR
					);
					$this->errors[] = 'Ignored set ms. '. $msg;

					return false;
				}

				debug_log(__METHOD__
					.' Warning on set ms. ' . $msg
					, logger::WARNING
				);

			}

		// set value
			$this->ms = (int)$value;

		return true;
	}//end set_ms



	/**
	* GET_MS
	* Return the stored millisecond component (0–999), or null if not set.
	* @return int|null $this->ms
	*/
	public function get_ms() : ?int {

		return $this->ms ?? null;
	}//end get_ms



	/**
	* SET_OP
	* Store a search comparison operator string (e.g. '>', '<', '>=', '=').
	* This field is only meaningful when the dd_date instance is used as a search
	* filter operand, not as a standalone date value.
	* @param string $value - comparison operator
	* @return bool - always true
	*/
	public function set_op(string $value) : bool {
		// set value
			$this->op = (string)$value;

		return true;
	}//end set_op



	/**
	* GET_OP
	* Return the stored comparison operator, or null if not set.
	* @return string|null $this->op
	*/
	public function get_op() : ?string {

		return $this->op ?? null;
	}//end get_op



	/**
	* GET_DD_TIMESTAMP
	* Serialize this date to a formatted timestamp string.
	*
	* This is Dédalo's own formatter: it does NOT use PHP's date() or mktime(), so
	* it works correctly with BCE (negative) years and very large year values that
	* fall outside the Unix timestamp range.
	*
	* Missing fields default to 0 (displayed as "00" when $padding is true). Any
	* negative field value that is not zero is silently replaced with 0 and logged
	* as an error, since negative sub-year components are never valid.
	*
	* The $date_format string uses the same placeholder letters as PHP's date():
	*   Y = year, m = month, d = day, H = hour, i = minute, s = second, u = ms
	* but the replacement is a simple string substitution, not PHP's date engine.
	*
	* @param string $date_format = "Y-m-d H:i:s" - output template using date() letters
	* @param bool $padding = true - zero-pad each component (year→4 digits, rest→2, ms→3)
	* @return string $dd_timestamp - the formatted date string
	*/
	public function get_dd_timestamp(string $date_format="Y-m-d H:i:s", bool $padding=true) : string {

		// year
			$year = $this->year ?? '';
			if($padding===true){
				$year = sprintf("%04d", $year);
			}

		// month
			$month = $this->month ?? 0;
			// fix negative wrong value
				if ($month!==0 && (int)$month<1) {
					debug_log(__METHOD__
						. " Fixed to '0' invalid negative month value: " . PHP_EOL
						. to_string($month)
						, logger::ERROR
					);
					$month = 0;
				}
			if($padding===true) {
				$month = sprintf("%02d", $month);
			}

		// day
			$day = $this->day ?? 0;
			// fix negative wrong value
				if ($day!==0 && (int)$day<1) {
					debug_log(__METHOD__
						. " Fixed to '0' invalid negative day value: " . PHP_EOL
						. to_string($day)
						, logger::ERROR
					);
					$day = 0;
				}
			if($padding===true) {
				$day = sprintf("%02d", $day);
			}

		// hour
			$hour = $this->hour ?? 0;
			// fix negative wrong value
				if ($hour!==0 && (int)$hour<1) {
					debug_log(__METHOD__
						. " Fixed to '0' invalid negative hour value: " . PHP_EOL
						. to_string($hour)
						, logger::ERROR
					);
					$hour = 0;
				}
			if($padding===true) {
				$hour = sprintf("%02d", $hour);
			}

		// minute
			$minute = $this->minute ?? 0;
			// fix negative wrong value
				if ($minute!==0 && (int)$minute<1) {
					debug_log(__METHOD__
						. " Fixed to '0' invalid negative minute value: " . PHP_EOL
						. to_string($minute)
						, logger::ERROR
					);
					$minute = 0;
				}
			if($padding===true) {
				$minute = sprintf("%02d", $minute);
			}

		// second
			$second = $this->second ?? 0;
			// fix negative wrong value
				if ($second!==0 && (int)$second<1) {
					debug_log(__METHOD__
						. " Fixed to '0' invalid negative second value: " . PHP_EOL
						. to_string($second)
						, logger::ERROR
					);
					$second = 0;
				}
			if($padding===true) {
				$second = sprintf("%02d", $second);
			}

		// ms
			$ms = $this->get_ms();
			if(!is_null($ms) && $padding===true) {
				$ms = sprintf("%03d", $ms);
			}

		// OLD WORLD no compatible with negative years, etc..
			// $time			= mktime($hour,$minute,$second,$month,$day,$year);
			// $dd_timestamp	= date($date_format, $time);

		$dd_timestamp = str_replace(
			['Y','m','d','H','i','s','u'],
			[$year,$month,$day,$hour,$minute,$second,$ms],
			$date_format
		);


		return (string)$dd_timestamp;
	}//end get_dd_timestamp



	/**
	* GET_DD_DATE_FROM_TIMESTAMP
	* Parse a timestamp string into a new dd_date instance.
	* Accepts standard ISO-like strings including negative year prefixes for BCE dates.
	* Example inputs: "2024-06-01 14:30:00", "-44-03-15" (44 BCE March 15).
	* Parsing is performed with constrain=true so invalid field values are rejected.
	* @param string $timestamp - date/time string in "Y-m-d H:i:s" or partial form
	* @return dd_date - a new dd_date hydrated from the parsed fields
	*/
	public static function get_dd_date_from_timestamp( string $timestamp ) : object {

		$dd_date = new dd_date();

		$regex = "/^(-?[0-9]+)-?([0-9]+)?-?([0-9]+)? ?([0-9]+)?:?([0-9]+)?:?([0-9]+)?/";
		preg_match($regex, $timestamp, $matches);

		if(isset($matches[1])) {
			$dd_date->set_year( (int)$matches[1], true );
		}

		if(isset($matches[2])) {
			$dd_date->set_month( (int)$matches[2], true );
		}

		if(isset($matches[3])) {
			$dd_date->set_day( (int)$matches[3], true );
		}

		if(isset($matches[4])) {
			$dd_date->set_hour( (int)$matches[4], true );
		}

		if(isset($matches[5])) {
			$dd_date->set_minute( (int)$matches[5], true );
		}

		if(isset($matches[6])) {
			$dd_date->set_second( (int)$matches[6], true );
		}


		return $dd_date;
	}//end get_dd_date_from_timestamp



	/**
	* SET_FROM_TIMESTAMP
	* Parse a timestamp string and populate this instance's fields in-place.
	* Unlike get_dd_date_from_timestamp(), this mutates the current object rather
	* than creating a new one. Constrain mode is always enabled during parsing.
	* @param string $timestamp - date/time string in "Y-m-d H:i:s" or partial form
	* @return bool - always true
	*/
	public function set_from_timestamp( string $timestamp ) : bool {

		$regex = "/^(-?[0-9]+)-?([0-9]+)?-?([0-9]+)? ?([0-9]+)?:?([0-9]+)?:?([0-9]+)?/";
		preg_match($regex, $timestamp, $matches);

		if(isset($matches[1])) {
			$this->set_year( (int)$matches[1], true );
		}

		if(isset($matches[2])) {
			$this->set_month( (int)$matches[2], true );
		}

		if(isset($matches[3])) {
			$this->set_day( (int)$matches[3], true );
		}

		if(isset($matches[4])) {
			$this->set_hour( (int)$matches[4], true );
		}

		if(isset($matches[5])) {
			$this->set_minute( (int)$matches[5], true );
		}

		if(isset($matches[6])) {
			$this->set_second( (int)$matches[6], true );
		}

		return true;
	}//end set_from_timestamp



	/**
	* TIMESTAMP_TO_DATE
	* Convert a database timestamp string to a European (day-month-year) date string.
	* Input format: "YYYY-MM-DD HH:MM:SS" (as stored in SQL timestamp columns).
	* Output format: "DD-MM-YYYY" or "DD-MM-YYYY HH:MM:SS" when $full=true.
	*
	* Returns null for empty or too-short input to avoid misleading partial output.
	* @param string $timestamp - SQL timestamp string (minimum 10 chars: "YYYY-MM-DD")
	* @param bool $full = true - when true, append the time portion (HH:MM:SS)
	* @return string|null - formatted date string, or null if $timestamp is invalid
	*/
	public static function timestamp_to_date(string $timestamp, bool $full=true) : ?string {

		if (empty($timestamp) || strlen($timestamp)<10) {
			return null;
		}

		$year  	= substr($timestamp, 0, 4);
		$month 	= substr($timestamp, 5, 2);
		$day   	= substr($timestamp, 8, 2);
		$hour 	= substr($timestamp, 11, 2);
		$min 	= substr($timestamp, 14, 2);
		$sec 	= substr($timestamp, 17, 2);
		/*
		if (in_array(DEDALO_APPLICATION_LANG, self::$ar_american)) {
			# American format month/day/year
			$date	= $mes . '-' .$day . '-' .$year ;
		}else{
			# European format day.month.year
			$date	= $day . '-' .$mes . '-' .$year ;
		}
		*/
		$date = $day . '-' .$month . '-' .$year ;

		if($full===true) {
			$date .= ' ' .$hour . ':' .$min . ':' .$sec ;
		}


		return $date;
	}//end timestamp_to_date



	/**
	* GET_TIMESTAMP_NOW_FOR_DB
	* Return the current server date/time as a SQL-ready timestamp string.
	* The output format is always 'Y-m-d H:i:s', which is what MariaDB/MySQL
	* expects for DATETIME and TIMESTAMP column types.
	*
	* An optional $offset array can shift the current time forward or backward:
	*   ['sub' => 'PT1M']  subtract 1 minute
	*   ['add' => 'PT1H']  add 1 hour
	*   ['add' => 'P1D']   add 1 day
	* The key must be a valid DateTime method name ('add' or 'sub') and the value
	* must be a valid DateInterval spec string.
	*
	* @param array|null $offset = null - optional offset spec as ['add'|'sub' => 'interval_spec']
	* @return string $timestamp - current time formatted as 'Y-m-d H:i:s'
	*/
	public static function get_timestamp_now_for_db( ?array $offset=null ) : string {

		$date = new DateTime();

		switch (true) {

			case !empty($offset):

				$offset_key 	= key($offset); // sub | add
				$offset_value 	= $offset[$offset_key]; // P1D (+/- one day)
				$date->$offset_key(new DateInterval($offset_value)); // Formatted like: P10D (10 days)
				$timestamp = $date->format('Y-m-d H:i:s'); 	// Default as DB format
				break;

			default:
				$timestamp = $date->format('Y-m-d H:i:s'); // Default as DB format
				break;
		}

		return $timestamp;
	}//end get_timestamp_now_for_db



	/**
	* CONVERT_DATE_TO_SECONDS
	* Compute a monotonic integer value (in seconds) for the given dd_date.
	* This is used for sorting and time-range arithmetic, NOT as a Unix timestamp.
	*
	* The calculation uses virtual units to avoid real calendar irregularities:
	*   virtual year  = 372 days (31 × 12), matching $virtual_year_days
	*   virtual month = 31 days, matching $virtual_month_days
	* Month and day are decremented by 1 before multiplication so that the epoch
	* (year 0, month 1, day 1) maps cleanly to 0 seconds. This decrement means
	* "January 1st of year N" and "year N alone" produce the same value, allowing
	* partial dates to sort correctly alongside full dates.
	*
	* (!) The result is NOT reversible back to a wall-clock date. It is an
	* ordinal position, not an absolute time. Do not pass the result to PHP's
	* date() or DateTime APIs.
	*
	* (!) Always clone the source object before passing it here; the function
	* operates on a clone internally to prevent caller-side mutation.
	*
	* @param object $source_dd_date - a dd_date instance to convert
	* @return int $seconds - monotonic sort value; comparable across dd_dates
	*/
	public static function convert_date_to_seconds( object $source_dd_date ) : int {

		$time = 0;

		$dd_date = clone $source_dd_date; // IMPORTANT : Clone always dd_date when you manipulate it

		$year	= $dd_date->get_year()   ?? 0;
		$month	= $dd_date->get_month()  ?? 0;
		$day	= $dd_date->get_day()    ?? 0;
		$hour	= $dd_date->get_hour()   ?? 0;
		$minute	= $dd_date->get_minute() ?? 0;
		$second	= $dd_date->get_second() ?? 0;

			// Rectified 25-11-2017
			if(!empty($month)) {
				$month--; // Remove 1
			}
			if(!empty($day)) {
				$day--; // Remove 1
			}

			$month 	= $month  >= 0 ? $month  : 0;
			$day 	= $day 	  >= 0 ? $day 	 : 0;
			$hour 	= $hour   >= 0 ? $hour 	 : 0;
			$minute = $minute >= 0 ? $minute : 0;
			$second = $second >= 0 ? $second : 0;

			// Add years (using virtual years of 372 days (31*12))
			$time +=  ($year * 372 * 24 * 60 * 60);

			// Add months (using virtual months of 31 days)
			$time += ($month * 31 * 24 * 60 * 60);

			// Add days
			$time += ($day * 24 * 60 * 60);

			// Add hours
			$time += ($hour * 60 * 60);

			// Add minutes
			$time += ($minute * 60);

			// Add seconds
			$time += $second;


		return (int)$time;
	}//end convert_date_to_seconds



	/**
	* CONVERT_SECONDS_TO_PERIOD (!) NOT USED !
	* Calculate current seconds in minutes, hours, days, totals and approximate partials.
	* Note that non total values are approximations because we need use
	* a reference year of 365 days and a reference month of 30 days
	* @param int $seconds
	* @return object $response
	*/
		// public static function convert_seconds_to_period( int $seconds ) : object {

		// 	$response = new stdClass();
		// 		$response->result	= new stdClass();
		// 		$response->msg		= '';

		// 	// minutes (reliable measurement)
		// 	$minutes_total = ceil( (int)$seconds / 60 ); // Round to up

		// 	// hours_total (reliable measurement)
		// 	$hours_total = ceil( (int)$seconds / 60 / 60 ); // Round to up

		// 	// days_total (reliable measurement)
		// 	$days_total = ceil( (int)$seconds / 60 / 60 / 24 ); // Round to up

		// 	// years (approximated measurement)
		// 	$years		= $days_total/365;
		// 	$years_int	= floor($years); // Round to bottom
		// 	$rest_days	= ceil( ($years - $years_int) *365);

		// 	// months (approximated measurement)
		// 	$months 	= $rest_days/30;
		// 	$months_int = floor($months); // Round to bottom
		// 	$rest_days 	= ceil( ($months - $months_int)*30 );

		// 	// days (approximated measurement)
		// 	$days_int 	= $rest_days;

		// 	// Absolute values
		// 	$response->result->seconds_total	= (int)$seconds;
		// 	$response->result->minutes_total	= (int)$minutes_total;
		// 	$response->result->days_total		= (int)$days_total;

		// 	// Approximations
		// 	$response->result->years	= (int)$years_int;
		// 	$response->result->months	= (int)$months_int;
		// 	$response->result->days		= (int)$days_int;


		// 	return (object)$response;
		// }//end convert_seconds_to_period



	/**
	* GET_UNIX_TIMESTAMP
	* Convert this dd_date to a Unix timestamp using PHP's DateTime.
	* Useful for interop with PHP APIs that require Unix timestamps (e.g. sorting
	* library data, display formatting).
	*
	* (!) This method only works correctly for dates within the representable Unix
	* range. BCE or very large CE dates will produce invalid or platform-dependent
	* results. Use convert_date_to_seconds() for cross-era date arithmetic instead.
	*
	* When month or day is not set, 1 is substituted (not 0) because PHP's
	* DateTime::setDate() treats month=0 or day=0 as an underflow into the previous
	* month/year, yielding a wrong result.
	*
	* @return int $unix_timestamp - Unix timestamp for this date's year/month/day
	*/
	public function get_unix_timestamp() : int {

		$datetime = new DateTime();

		$datetime->setDate(
			$this->get_year(),
			$this->get_month() ?? 1, // if month is not set, use 1 (not 0!, if 0 is used the seconds are wrong)
			$this->get_day() ?? 1 // if day is not set, use 1 (not 0!, if 0 is used the seconds are wrong)
		);
		$unix_timestamp	= $datetime->getTimestamp();

		return $unix_timestamp;
	}//end get_unix_timestamp



	/**
	* GET_DD_DATE_FROM_UNIX_TIMESTAMP
	* Build a dd_date from a Unix timestamp integer.
	* All six components (day, month, year, hour, minute, second) are extracted
	* using PHP's date() function and stored. The monotonic sort value ($time) is
	* also computed and stored via set_time().
	*
	* (!) Inherits all Unix timestamp limitations: dates before 1 January 1970 or
	* outside the platform's integer range are not supported.
	*
	* @param int $unix_timestamp - seconds since 1970-01-01 00:00:00 UTC
	* @return dd_date $dd_date - a fully populated dd_date instance
	*/
	public static function get_dd_date_from_unix_timestamp( int $unix_timestamp) : dd_date {

		$day		= date('d', $unix_timestamp); // 1-31
		$month		= date('m', $unix_timestamp); // 1-12
		$year		= date('Y', $unix_timestamp); // 1973
		$hour		= date('H', $unix_timestamp); // 22
		$minute		= date('i', $unix_timestamp); // 58
		$second		= date('s', $unix_timestamp); // 33

		$dd_date = new dd_date();
			$dd_date->set_day($day);
			$dd_date->set_month($month);
			$dd_date->set_year($year);
			$dd_date->set_hour($hour);
			$dd_date->set_minute($minute);
			$dd_date->set_second($second);

		$time = dd_date::convert_date_to_seconds($dd_date);
		$dd_date->set_time($time);

		return $dd_date;
	}//end get_dd_date_from_unix_timestamp



	/**
	* GET_SHAPE
	* Return a summary object describing which date components are present.
	* Used to distinguish a year-only date from a full day/month/year date without
	* inspecting each field individually.
	*
	* Output shape:
	*   { year: bool, month: bool, day: bool }
	* Each property is true when the corresponding field is non-null, false when null.
	*
	* @return object $shape - stdClass with year, month, day boolean properties
	*/
	public function get_shape() : object {

		$shape = new stdClass();

		$shape->year 	= ( $this->get_year() !== null )
			? true
			: false;
		$shape->month 	= ( $this->get_month() !== null  )
			? true
			: false;
		$shape->day 	= ( $this->get_day() !== null )
			? true
			: false;

		return $shape;
	}//end get_shape



	/**
	* GET_NOW_AS_UNIX_TIMESTAMP
	* Return the current moment as a Unix timestamp integer.
	* A convenience wrapper around PHP's DateTime that avoids the global
	* time() function, making it easier to mock in tests.
	* @return int $unix_timestamp - seconds since 1970-01-01 00:00:00 UTC
	*/
	public static function get_now_as_unix_timestamp() : int {

		$datetime = new DateTime();
		$unix_timestamp	= $datetime->getTimestamp();

		return $unix_timestamp;
	}//end get_now_as_unix_timestamp



	/**
	* GET_NOW_AS_ISO_TIMESTAMP
	* Return the current moment as an ISO 8601 timestamp string.
	* Output includes timezone offset, e.g. "2024-12-04T10:57:57+01:00".
	* Suitable for HTTP headers, JSON-LD, and any context that requires RFC 3339.
	* @return string $iso_timestamp - ISO 8601 / RFC 3339 formatted current time
	*/
	public static function get_now_as_iso_timestamp() : string {

		$datetime = new DateTime();
		$iso_timestamp	= $datetime->format('c');

		return $iso_timestamp;
	}//end get_now_as_iso_timestamp



	/**
	* SET_TIMESTAMP
	* Store a raw timestamp string for round-trip preservation.
	* This field is not derived from the individual date components; it holds
	* whatever string was passed in by the client or read from the database,
	* so it can be returned verbatim if the fields have not changed.
	* @param string|null $value - raw timestamp string, or null to clear
	* @return bool - always true
	*/
	public function set_timestamp(?string $value) : bool {
		$this->timestamp = $value;
		return true;
	}//end set_timestamp



	/**
	* GET_TIMESTAMP
	* Return the stored raw timestamp string, or null if not set.
	* @return string|null $this->timestamp
	*/
	public function get_timestamp() : ?string {
		return $this->timestamp ?? null;
	}//end get_timestamp



	/**
	* JSON_SERIALIZE
	* Implement JsonSerializable so json_encode() emits a sparse key/value map
	* containing only the non-null fields of this instance.
	* The $errors array is excluded from serialization because it is an internal
	* validation artifact, not part of the date data payload.
	* @return mixed - associative array of non-null date properties
	*/
	public function jsonSerialize() : mixed {
		$vars = get_object_vars($this);
		unset($vars['errors']); // non-serializable property
		return array_filter($vars, function($val) {
			return $val !== null;
		});
	}//end jsonSerialize



}//end class dd_date
