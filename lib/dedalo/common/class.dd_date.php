<?php
/**
* DD_DATE CLASS
* Build dd_date objects like common dates but without restrictions/limitations of
* negative dates and similar issues of timestamps
*/
class dd_date extends stdClass {

	// Errors Optional
	#public $errors;
	// Separator when format output
	static $separator = '-';
	// Separator when format output
	static $time_separator = ':';
	// Virtual year days
	static $virtual_year_days  = 372;
	// Virtual month days
	static $virtual_month_days = 31;



	/**
	* __CONSTRUCT
	* @param object $data optional
	* @param bool $constrain optional (default is false)
	*/
	public function __construct( $data=null, $constrain=false ) {

		#$this->constrain = $constrain; // Fix constrain mode
		if (is_null($data)) return;

		# Nothing to do on construct (for now)
		if (!is_object($data)) {
			#trigger_error("wrong data format. object expected. Given type: ".gettype($data));
		#	throw new Exception("Error Processing Request", 1);

			debug_log(__METHOD__." wrong data format. object expected. Given type: ".gettype($data).' - '.to_string($data), logger::ERROR);
			if(SHOW_DEBUG===true) {
				dump(debug_backtrace()[0], " wrong data format. object expected. Given type:".gettype($data).' - data:'.to_string($data)." from:");
			}
			return false;
		}

		foreach ($data as $key => $value) {
			//if ($key!=="year" && empty($value)) continue; // Skip empty values
			if (!isset($value) || is_null($value)) continue; // Skip empty values

			$method = 'set_'.$key;
			if (method_exists($this, $method)) {
				$this->$method($value, $constrain);
			}else{
				debug_log(__METHOD__." Ignored received property: $key not defined as set metohd. Data: ".to_string($data), logger::DEBUG);
			}
		}

		return true;
	}//end __construct



	/**
	* SET_ERRORS
	* @return bool true
	*/
	public function set_errors($value) {
		debug_log(__METHOD__." Date error found. value: ".to_string($value), logger::WARNING);
		#$this->errors = $value;

		return true;
	}//end set_errors



	/**
	* SET_TIME
	* Store absolute date value in seconds
	* @return bool true
	*/
	public function set_time($value) {
		$this->time = (int)$value;

		return true;
	}//end set_time



	/**
	* SET_YEAR
	* @return bool true
	*/
	public function set_year($value) {
		/*
		if( !is_int($value) ) {
		  #throw new Exception("Error Processing Request. Invalid year: $value", 1);
		  $this->errors[] = "Error on set year. Value is invalid: ".to_string($value)." - type:".gettype($value);
		  return false;
		}
		*/
		$this->year = (int)$value;

		return true;
	}//end set_year



	/**
	* SET_MONTH
	* @return bool true
	*/
	public function set_month($value, $constrain=false) {

		// check valid value (constrain)
			if( (int)$value<1 || (int)$value>12 ) {
			  #throw new Exception("Error Processing Request. Invalid month: $value", 1);
			  #$this->errors[] = "Error on set month. Value is not standard: ".to_string($value);
			  debug_log(__METHOD__." Error on set month. Value is not standard ".to_string($value), logger::WARNING);
			  if ($constrain===true) return false;
			}

		// set value
			$this->month = (int)$value;

		return true;
	}//end set_month



	/**
	* SET_DAY
	* @return bool true
	*/
	public function set_day($value, $constrain=false) {

		// check valid value (constrain)
			if( (int)$value<1 || (int)$value>31 ) {
				# throw new Exception("Error Processing Request. Invalid day: $value", 1);
				#$this->errors[] = "Error on set day. Value is not standard: ".to_string($value);
				debug_log(__METHOD__." Error on set day. Value is not standard ".to_string($value), logger::WARNING);
				if ($constrain===true) return false;
			}

		// set value
			$this->day = (int)$value;

		return true;
	}//end set_day



	/**
	* SET_HOUR
	* @return bool true
	*/
	public function set_hour($value, $constrain=false) {

		// check valid value (constrain)
			if( (int)$value<0 || (int)$value>23 ) {
				#throw new Exception("Error Processing Request. Invalid hour: $value", 1);
				#$this->errors[] = "Error on set hour. Value is invalid: ".to_string($value);
				debug_log(__METHOD__." Error on set hour. Value is invalid: ".to_string($value), logger::WARNING);
				if ($constrain===true) return false;
			}

		// set value
			$this->hour = (int)$value;

		return true;
	}//end set_hour



	/**
	* SET_MINUTE
	* @return bool
	*/
	public function set_minute($value, $constrain=false) {

		// check valid value (constrain)
			if( (int)$value<0 || (int)$value>59 ) {
				#throw new Exception("Error Processing Request. Invalid minute: $value", 1);
				#$this->errors[] = "Error on set minute. Value is invalid: ".to_string($value);
				debug_log(__METHOD__." Error on set minute. Value is invalid: ".to_string($value), logger::WARNING);
				if ($constrain===true) return false;
			}

		// set value
			$this->minute = (int)$value;

		return true;
	}//end set_minute
	#public function set_min($value, $constrain=false) {	return $this->set_minute($value, $constrain); }


	/**
	* SET_SECOND
	* @return bool true
	*/
	public function set_second($value, $constrain=false) {

		// check valid value (constrain)
			if( (int)$value<0 || (int)$value>59 ) {
				#throw new Exception("Error Processing Request. Invalid second: $value", 1);
				#$this->errors[] = "Error on set second. Value is invalid: ".to_string($value);
				debug_log(__METHOD__." Error on set second. Value is invalid: ".to_string($value), logger::WARNING);
				if ($constrain===true) return false;
			}

		// set value
			$this->second = (int)$value;

		return true;
	}//end set_second



	/**
	* SET_MS
	* @return bool true
	*/
	public function set_ms($value, $constrain=false) {

		// check valid value (constrain)
			if( (int)$value<0 || (int)$value>999 ) {
				#throw new Exception("Error Processing Request. Invalid ms: $value", 1);
				#$this->errors[] = "Error on set ms. Value is invalid: ".to_string($value);
				debug_log(__METHOD__." Error on set ms. Value is invalid: ".to_string($value), logger::WARNING);
				if ($constrain===true) return false;
			}

		// set value
			$this->ms = (int)$value;

		return true;
	}//end set_ms



	/**
	* SET_OP
	* Only for search purposes
	* @return bool true
	*/
	public function set_op($value) {
		// set value
			$this->op = (string)$value;

		return true;
	}//end set_op



	/**
	* GET_DD_TIMESTAMP
	* Format default 'Y-m-d H:i:s'
	* When any value if empty, default values are used, like 01 for month
	* @return string $dd_timestamp
	*/
	public function get_dd_timestamp($date_format="Y-m-d H:i:s", $padding=true) {

		if (isset($this->year)) {
		$year   = $this->year;
		}

		if (isset($this->month)) {
		$month  = $this->month;
		}

		if (isset($this->day)) {
		$day    = $this->day;
		}

		if (isset($this->hour)) {
		$hour   = $this->hour;
		}

		if (isset($this->minute)) {
		$minute = $this->minute;
		}

		if (isset($this->second)) {
		$second = $this->second;
		}

		if (isset($this->ms)) {
		$ms     = $this->ms;
		}


		# year
		if (!isset($year)) {
		  $year = '';
		}
		if($padding===true)
		$year = sprintf("%04d", $year);

		# month
		if (!isset($month) || $month<1) {
		  $month = 0;
		}
		if($padding===true)
		$month = sprintf("%02d", $month);

		# day
		if (!isset($day) || $day<1) {
		  $day = 0;
		}
		if($padding===true)
		$day = sprintf("%02d", $day);

		# hour
		if (!isset($hour)) {
			$hour = 0;
		}
		if($padding===true)
		$hour = sprintf("%02d", $hour);

		# minute
		if (!isset($minute)) {
			$minute = 0;
		}
		if($padding===true)
		$minute = sprintf("%02d", $minute);

		# second
		if (!isset($second)) {
			$second = 0;
		}
		if($padding===true)
		$second = sprintf("%02d", $second);

		# ms
		if (isset($ms)) {
			if($padding===true)
			$ms = sprintf("%03d", $ms);
		}else{
			$ms=null;
		}

		/* OLD WORLD no compatible with negative years, etc..
		$time       	= mktime($hour,$minute,$second,$month,$day,$year);
		$dd_timestamp   = date($date_format, $time);
		*/

		$dd_timestamp = str_replace( array('Y','m','d','H','i','s','u'),
									 array($year,$month,$day,$hour,$minute,$second,$ms),
									 $date_format);


		return (string)$dd_timestamp;
	}//end get_dd_timestamp



	/**
	* GET_DATE_FROM_TIMESTAMP
	* @return dd_date object $this
	*/
	public function get_date_from_timestamp( $timestamp ) {

		$regex   = "/^(-?[0-9]+)-?([0-9]+)?-?([0-9]+)? ?([0-9]+)?:?([0-9]+)?:?([0-9]+)?/";
		preg_match($regex, $timestamp, $matches);

		if(isset($matches[1])) $this->set_year((int)$matches[1]);
		if(isset($matches[2])) $this->set_month((int)$matches[2]);
		if(isset($matches[3])) $this->set_day((int)$matches[3]);
		if(isset($matches[4])) $this->set_hour((int)$matches[4]);
		if(isset($matches[5])) $this->set_minute((int)$matches[5]);
		if(isset($matches[6])) $this->set_second((int)$matches[6]);

		#if (!empty($this->year)) {
		#	$this->correct_date();
		#}

		return $this;
	}//end get_date_from_timestamp



	/**
	* SET_DATE_FROM_INPUT_FIELD
	* @return dd_date object $this
	*/
	public function set_date_from_input_field( $search_field_value ) {

		#$regex   = "/^(-?[0-9]+)-?([0-9]+)?-?([0-9]+)? ?([0-9]+)?:?([0-9]+)?:?([0-9]+)?/";
		$regex   = "/^(([0-9]{1,2})-)?(([0-9]{1,2})-)?(-?[0-9]{1,12}) ?([0-9]+)?:?([0-9]+)?:?([0-9]+)?$/";
		preg_match($regex, $search_field_value, $matches);
			#$elements = count($matches)-1;

			# Year is mandatory
			if (isset($matches[5])) {
				$this->set_year((int)$matches[5]);
			}

			# Month
			if (!empty($matches[4])) {
				$this->set_month((int)$matches[4]);
				# Day (only when month exists)
				if (!empty($matches[2])) {
					$this->set_day((int)$matches[2]);
				}
			}else if(!empty($matches[2])) {
				$this->set_month((int)$matches[2]);
			}

			# Hours
			if (!empty($matches[6])) {
				$this->set_hour((int)$matches[6]);
			}

			# Minutes
			if (!empty($matches[7])) {
				$this->set_minute((int)$matches[7]);
			}

			# Seconds
			if (!empty($matches[8])) {
				$this->set_second((int)$matches[8]);
			}


		return $this;
	}//end set_date_from_input_field



	/**
	* CORRECT_DATE
	* Convert actual date to mktime and set params to corrected values.
	* Example: day 31 of month 11, is corrected to day 1 of month 12
	*//*
	protected function correct_date() {

		$hour 	= isset($this->hour) ? $this->hour : 0;
		$minute = isset($this->minute) ? $this->minute : 0;
		$second = isset($this->second) ? $this->second : 0;
		$month 	= isset($this->month) ? $this->month : 1;
		$day 	= isset($this->day) ? $this->day : 1;
		$year 	= isset($this->year) ? $this->year : 0;

		$time = mktime($hour,$minute,$second,$month,$day,$year);
		$this->set_year( (int)date('Y',$time) );
		$this->set_month( (int)date('m',$time) );
		$this->set_day ( (int)date('d',$time) );
		$this->set_hour( (int)date('H',$time) );
		$this->set_minute( (int)date('i',$time) );
		$this->set_second( (int)date('s',$time) );
	}//end correct_date
	*/



	/**
	* GET_DATE_WITH_FORMAT
	* Format a date as is desired
	* @param string $date
	* @param string $format
	* @return string $date_with_format
	*/
	public static function get_date_with_format( $date, $format="Y-m-d H:i:s" ) {
		$date_with_format = date($format, strtotime($date));
		return $date_with_format;
	}//end get_date_with_format



	/**
	* CONVERT_DATE_TO_SECONDS
	* Calculate absolute "time" from dd_date object
	* This operation is not reversible and is only for reference purposes
	* @return int $seconds
	*/
	public static function convert_date_to_seconds( $source_dd_date, $mode=false ) {

		$time = 0;

		$dd_date = clone $source_dd_date; // IMPORTANT : Clone always dd_date whe you manipulate it

		$year  	= !empty($dd_date->year)   ? (int)$dd_date->year	: 0;
		$month 	= !empty($dd_date->month)  ? (int)$dd_date->month  	: 0;
		$day 	= !empty($dd_date->day)    ? (int)$dd_date->day    	: 0;
		$hour 	= !empty($dd_date->hour)   ? (int)$dd_date->hour    : 0;
		$minute = !empty($dd_date->minute) ? (int)$dd_date->minute  : 0;
		$second = !empty($dd_date->second) ? (int)$dd_date->second  : 0;

			# Rectified 25-11-2017
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
	* CONVERT_SECONDS_TO_PERIOD
	* Calculate current seconds in minutes, hours, days, totals and approximate partials.
	* Note that non total values are approximations because we need use
	* a reference year of 365 days and a reference month of 30 days
	* @param int $seconds
	* @return object $response
	*/
	public static function convert_seconds_to_period( $seconds ) {

		$response = new stdClass();
			$response->result 	= new stdClass();
			$response->msg 		= '';

		# minutes (reliable measurement)
		$minutes_total = ceil( (int)$seconds / 60 ); // Round to up

		# hours_total (reliable measurement)
		$hours_total = ceil( (int)$seconds / 60 / 60 ); // Round to up

		# days_total (reliable measurement)
		$days_total = ceil( (int)$seconds / 60 / 60 / 24 ); // Round to up

		# years (aproximate measurement)
		$years  	= $days_total/365;
		$years_int  = floor($years); // Round to bottom
		$rest_days 	= ceil( ($years - $years_int) *365);

		# months (aproximate measurement)
		$months 	= $rest_days/30;
		$months_int = floor($months); // Round to bottom
		$rest_days 	= ceil( ($months - $months_int)*30 );

		# days (aproximate measurement)
		$days_int 	= $rest_days;


		# Absolute values
		$response->result->seconds_total = (int)$seconds;
		$response->result->minutes_total = (int)$minutes_total;
		$response->result->days_total 	 = (int)$days_total;

		# Aproximations
		$response->result->years 		 = (int)$years_int;
		$response->result->months 		 = (int)$months_int;
		$response->result->days 		 = (int)$days_int;

		return (object)$response;
	}//end convert_seconds_to_period



	/**
	* CONVERT_DATE_TO_UNIT
	* Change the date to the unit (day, month, year)
	*/
	public function convert_date_to_unix_timestamp(){

		$time = $this->get_dd_timestamp();

		$datetime		= new DateTime($time);
		$unix_timestamp	= $datetime->getTimestamp();


		return $unix_timestamp;
	}//end convert_date_to_unit



	/**
	* __DESTRUCT
	*//*
	public function __destruct() {

		#$this->correct_date();

		if (!empty($this->errors)) {
			//trigger_error( to_string($this->errors) );
			debug_log(__METHOD__." Errors foud in dd_date ".to_string($this), logger::WARNING);
		}
	}//end __destruct */



}//end class dd_date
