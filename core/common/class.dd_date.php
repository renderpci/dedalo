<?php
declare(strict_types=1);
/**
* DD_DATE CLASS
* Build dd_date objects like common dates but without restrictions/limitations of
* negative dates and similar issues of timestamps
*/
class dd_date extends stdClass {



	// Separator when format output
	static $separator = '/';
	// Separator when format output
	static $time_separator = ':';
	// Virtual year days
	static $virtual_year_days  = 372;
	// Virtual month days
	static $virtual_month_days = 31;
	// errors status
	// public $errors;
	// day
	// protected $day;
	// // month
	// protected $month;
	// // year
	// protected $year;
	// // time
	// protected $time;
	// // hour
	// protected $hour;
	// // minute
	// protected $minute;
	// // second
	// protected $second;
	// // ms
	// protected $ms;



	/**
	* __CONSTRUCT
	* @param object $data = null
	* @param bool $constrain = false
	* @return object dd_date
	*/
	public function __construct( object $data=null, bool $constrain=false ) {

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
				if($key==='format') continue; //  skip format from comopnent_date data

				$method = 'set_'.$key;
				if (method_exists($this, $method)) {

					$set_value = $this->{$method}($value, $constrain);
					if($set_value===false && empty($this->errors)) {
						$this->errors[] = 'Invalid value for: '.$key.' . value: '.to_string($value);
					}

				}else{

					debug_log(__METHOD__
						.' Ignored received property: '.$key.' not defined as set method.'. PHP_EOL
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
	* SET_TIME
	* Store absolute date value in seconds
	* @param int $value
	* @return void
	*/
	public function set_time(int $value) : void {

		$this->time = (int)$value;
	}//end set_time



	/**
	* GET_TIME
	* Return property value
	* @return int|null $this->time
	*/
	public function get_time() : ?int {

		return $this->time ?? null;
	}//end get_time



	/**
	* SET_YEAR
	* @param int|string $value
	* @param bool $constrain = false
	* @return bool
	*/
	public function set_year($value, bool $constrain=false) : bool {

		$this->year = (int)$value;

		return true;
	}//end set_year



	/**
	* GET_YEAR
	* Return property value
	* @return int|null $this->year
	*/
	public function get_year() : ?int {

		return $this->year ?? null;
	}//end get_year



	/**
	* SET_MONTH
	* @param int|string $value
	* @param bool $constrain = false
	* @return bool
	*/
	public function set_month($value, bool $constrain=false) : bool {

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
	* Return property value
	* @return int|null $this->month
	*/
	public function get_month() : ?int {

		return $this->month ?? null;
	}//end get_month



	/**
	* SET_DAY
	* @param int|string $value
	* @param bool $constrain = false
	* @return bool
	*/
	public function set_day($value, bool $constrain=false) : bool {

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
	* Return property value
	* @return int|null $this->day
	*/
	public function get_day() : ?int {

		return $this->day ?? null;
	}//end get_day



	/**
	* CHECK_DAY
	* Check if the max day value for specific month and leap years.
	* @return bool
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
	* @param int|string $value
	* @param bool $constrain = false
	* @return bool
	*/
	public function set_hour($value, bool $constrain=false) : bool {

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
	* Return property value
	* @return int|null $this->hour
	*/
	public function get_hour() : ?int {

		return $this->hour ?? null;
	}//end get_hour



	/**
	* SET_MINUTE
	* @param int|string $value
	* @param bool $constrain = false
	* @return bool
	*/
	public function set_minute($value, bool $constrain=false) : bool {

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
	* Return property value
	* @return int|null $this->minute
	*/
	public function get_minute() : ?int {

		return $this->minute ?? null;
	}//end get_minute



	/**
	* SET_SECOND
	* @param int|string $value
	* @param bool $constrain = false
	* @return bool
	*/
	public function set_second($value, bool $constrain=false) : bool {

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
	* Return property value
	* @return int|null $this->second
	*/
	public function get_second() : ?int {

		return $this->second ?? null;
	}//end get_second



	/**
	* SET_MS
	* @param int|string $value
	* @param bool $constrain = false
	* @return bool
	*/
	public function set_ms($value, bool $constrain=false) : bool {

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
	* Return property value
	* @return int|null $this->ms
	*/
	public function get_ms() : ?int {

		return $this->ms ?? null;
	}//end get_ms



	/**
	* SET_OP
	* Only for search purposes
	* @param string $value
	* @return bool
	*/
	public function set_op(string $value) : bool {
		// set value
			$this->op = (string)$value;

		return true;
	}//end set_op



	/**
	* GET_OP
	* Return property value
	* @return string|null $this->op
	*/
	public function get_op() : ?string {

		return $this->op ?? null;
	}//end get_op



	/**
	* GET_DD_TIMESTAMP
	* Format default 'Y-m-d H:i:s'
	* When any value if empty, default values are used, like 01 for month
	* @param string $date_format = "Y-m-d H:i:s"
	* @param bool $padding = true
	* @return string $dd_timestamp
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
	* @param string $timestamp
	* @return dd_date object
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
	* set_from_timestamp
	* @param string $timestamp
	* @return dd_date object
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
	* timestamp to European date
	* @param $timestamp
	* @param $seconds (default false)
	* Convert DB timestamp to date (American or European date) like '2013-04-23 19:47:05' to 23-04-2013 19:47:05
	*/
	public static function timestamp_to_date($timestamp, $full=true) : ?string {

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
	* Build current time ready to save to SQL as timestamp field
	* @param array $offset
	* @return string $timestamp
	* 	current time formatted for saved to SQL timestamp field
	*	like 2013-01-22 22:33:29 ('Y-m-d H:i:s')
	*	DateTime is available for PHP >=5.3.0
	*/
	public static function get_timestamp_now_for_db( $offset=null ) : string {

		$date = new DateTime();

		switch (true) {

			case !empty($offset):

				$offset_key 	= key($offset);
				$offset_value 	= $offset[$offset_key];
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
	* Calculate absolute "time" from dd_date object
	* This operation is not reversible and is only for reference purposes
	* @param object $source_dd_date
	* @return int $seconds
	*/
	public static function convert_date_to_seconds( object $source_dd_date ) : int {

		$time = 0;

		$dd_date = clone $source_dd_date; // IMPORTANT : Clone always dd_date when you manipulate it

		$year  	= !empty($dd_date->year)   ? (int)$dd_date->year	: 0;
		$month 	= !empty($dd_date->month)  ? (int)$dd_date->month  	: 0;
		$day 	= !empty($dd_date->day)    ? (int)$dd_date->day    	: 0;
		$hour 	= !empty($dd_date->hour)   ? (int)$dd_date->hour    : 0;
		$minute = !empty($dd_date->minute) ? (int)$dd_date->minute  : 0;
		$second = !empty($dd_date->second) ? (int)$dd_date->second  : 0;

			// Rectified 25-11-2017
			if(!empty($month)) {
				$month--; // Remove 1
			}
			if(!empty($day)) {
				$day--; // Remove 1
			}

			$year 	= $year   >= 0 ? $year   : 0;
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
	* Change the date to the unit (day, month, year)
	* @return int $unix_timestamp
	*/
	public function get_unix_timestamp() : int {

		$datetime		= new DateTime();

		$datetime->setDate(
			$this->get_year(),
			$this->get_month() ?? 1, // if month is not set use 1 (not 0!, if 0 is used the second are wrong)
			$this->get_day() ?? 1 // if day is not set use 1 (not 0!, if 0 is used the second are wrong)
		);
		$unix_timestamp	= $datetime->getTimestamp();

		return $unix_timestamp;
	}//end get_unix_timestamp



	/**
	* GET_DD_DATE_FROM_UNIX_TIMESTAMP
	* Change the date to the unit (day, month, year)
	* @param int $unix_timestamp
	* @return dd_date $dd_date
	*/
	public static function get_dd_date_from_unix_timestamp( int $unix_timestamp) : dd_date {

		$day		= date('d', $unix_timestamp); // 1-31
		$month		= date('m', $unix_timestamp); // 1-12
		$year		= date('Y', $unix_timestamp); // 1973
		$hour		= date('H', $unix_timestamp); // 22
		$minute		= date('i', $unix_timestamp); // 58
		$second		= date('s', $unix_timestamp); // 33

		$dd_date	= new dd_date();
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
	* Get the structure of the date. Using for check if any of his values is set or not.
	* if dd_date has a full date will return : {year: true, month: true, day:true}
	* if dd_date doesn't has any of his properties it will be set as false.
	* @return object $shape
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





}//end class dd_date
