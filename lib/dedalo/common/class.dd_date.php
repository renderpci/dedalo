<?php
/**
* DD_DATE CLASS
* Build dd_date objects like common dates but without restictions/limitations of 
* negative dates and similar issues of timestamps
*/
class dd_date extends stdClass {

	// Errors Optional
 	#public $errors;
 	// Separator when format output
	static $separator = '-';
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
			#dump($data, ' data ++ '.to_string());
			#trigger_error("wrong data format. object expected. Given type: ".gettype($data));
			debug_log(__METHOD__." wrong data format. object expected. Given type: ".gettype($data).' - '.to_string($data), logger::ERROR);
			return false;
		}

		foreach ($data as $key => $value) {
			if (empty($value)) continue; // Skip empty values			

			$method = 'set_'.$key;
			$this->$method($value, $constrain);		
		}
	}//end __construct



	/**
	* SET_ERRORS
	*/
	public function set_errors($value) {
		$this->errors = $value;
	}#end set_errors



	/**
	* SET_TIME
	* Store absolute date value in seconds
	* @return 
	*/
	public function set_time($value) {
		$this->time = (int)$value;
	}#end set_time



	/**
	* SET_YEAR
	* @return bool 
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
	}

	/**
	* SET_MONTH
	* @return bool 
	*/
	public function set_month($value, $constrain=false) {
		if( (int)$value<1 || (int)$value>12 ) {
		  #throw new Exception("Error Processing Request. Invalid month: $value", 1);
		  $this->errors[] = "Error on set month. Value is not standar: ".to_string($value);
		  if ($constrain===true) return false;
		}
		$this->month = (int)$value;
		return true;
	}#end set_month



	/**
	* SET_DAY
	* @return bool 
	*/
	public function set_day($value, $constrain=false) {
		if( (int)$value<1 || (int)$value>31 ) {
		 # throw new Exception("Error Processing Request. Invalid day: $value", 1);
		  $this->errors[] = "Error on set day. Value is not standar: ".to_string($value);
		  if ($constrain===true) return false;
		}
		$this->day = (int)$value;
		return true;
	}#end set_day



	/**
	* SET_HOUR
	* @return bool 
	*/
	public function set_hour($value, $constrain=false) {
		if( (int)$value<0 || (int)$value>23 ) {
		  #throw new Exception("Error Processing Request. Invalid hour: $value", 1);
		  $this->errors[] = "Error on set hour. Value is invalid: ".to_string($value);
		  if ($constrain===true) return false;
		}
		$this->hour = (int)$value;
		return true;
	}#end set_hour



	/**
	* SET_MINUTE
	* @return bool 
	*/
	public function set_minute($value, $constrain=false) {
		if( (int)$value<0 || (int)$value>59 ) {
		  #throw new Exception("Error Processing Request. Invalid minute: $value", 1);
		  $this->errors[] = "Error on set minute. Value is invalid: ".to_string($value);
		  if ($constrain===true) return false;
		}
		$this->minute = (int)$value;
		return true;
	}#end set_minute
	#public function set_min($value, $constrain=false) {	return $this->set_minute($value, $constrain); }


	/**
	* SET_SECOND
	* @return bool 
	*/
	public function set_second($value, $constrain=false) {
		if( (int)$value<0 || (int)$value>59 ) {
			#throw new Exception("Error Processing Request. Invalid second: $value", 1);
			$this->errors[] = "Error on set second. Value is invalid: ".to_string($value);
			if ($constrain===true) return false;
		}
		$this->second = (int)$value;
		return true;
	}#end set_second



	/**
	* SET_MS
	* @return bool 
	*/
	public function set_ms($value, $constrain=false) {
		if( (int)$value<0 || (int)$value>999 ) {
			#throw new Exception("Error Processing Request. Invalid ms: $value", 1);
			$this->errors[] = "Error on set ms. Value is invalid: ".to_string($value);
			if ($constrain===true) return false;
		}
		$this->ms = (int)$value;
		return true;
	}#end set_ms



	/**
	* GET_DD_TIMESTAMP
	* Format default 'Y-m-d H:i:s'
	* When any value if empty, default values are used, like 01 for month
	* @return string $dd_timestamp
	*/
	public function get_dd_timestamp($date_format="Y-m-d H:i:s") {

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
		if (!isset($year) || empty($year)) {
		  $year = 0;
		}
		$year = sprintf("%04d", $year);

		# month
		if (!isset($month) || $month<1) {
		  $month = 1;
		}
		$month = sprintf("%02d", $month);

		# day
		if (!isset($day) || $day<1) {
		  $day = 1;
		}
		$day = sprintf("%02d", $day);

		# hour
		if (!isset($hour)) {
			$hour = 0;
		}
		$hour = sprintf("%02d", $hour);	

		# minute
		if (!isset($minute)) {
			$minute = 0;
		}
		$minute = sprintf("%02d", $minute);

		# second
		if (!isset($second)) {
			$second = 0;
		}
		$second = sprintf("%02d", $second);

		# ms	
		if (isset($ms)) {
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
	}#end get_dd_timestamp



	/**
	* GET_DATE_FROM_TIMESTAMP
	* @return dd_date object $this
	*/
	public function get_date_from_timestamp( $timestamp ) {

		$regex   = "/^(-?[0-9]+)-?([0-9]+)?-?([0-9]+)? ?([0-9]+)?:?([0-9]+)?:?([0-9]+)?/";
		preg_match($regex, $timestamp, $matches);    
			#dump($matches, ' matches');

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
	}#end get_date_from_timestamp



	/**
	* set_date_from_input_field
	* @return dd_date object $this
	*/
	public function set_date_from_input_field( $search_field_value ) {

		$regex   = "/^(-?[0-9]+)-?([0-9]+)?-?([0-9]+)? ?([0-9]+)?:?([0-9]+)?:?([0-9]+)?/";
		preg_match($regex, $search_field_value, $matches);    
			#dump($matches, ' matches - ' .count($matches));

			$elements = count($matches)-1;
		

			if($elements>=1) {
				$this->set_year((int)$matches[1]); 
			} 
		
			if($elements>=2) {
				$this->set_month((int)$matches[2]);
			}
			
			if($elements>=3) {
				$this->set_day((int)$matches[3]);
			}

			if($elements>=4) {
				$this->set_hour((int)$matches[4]);
			}

			if($elements>=5) {
				$this->set_minute((int)$matches[5]);
			}

			if($elements>=6) {
				$this->set_second((int)$matches[6]);	
			}			
		
		/*
		if(isset($matches[1])) $this->set_day((int)$matches[1]);
		if(isset($matches[2])) $this->set_month((int)$matches[2]);
		if(isset($matches[3])) $this->set_year((int)$matches[3]);		
		
		if(isset($matches[4])) $this->set_hour((int)$matches[4]);
		if(isset($matches[5])) $this->set_minute((int)$matches[5]);
		if(isset($matches[6])) $this->set_second((int)$matches[6]);	
		*/
		#if (!empty($this->year)) {
			//$this->correct_date();
		#}
		#dump($this, ' this ++ '.to_string());

		return $this;
	}#end set_date_from_input_field



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
	}#end correct_date
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
	}#end get_date_with_format



	/**
	* CONVERT_DATE_TO_SECONDS	
	* Calculate absolute "time" from dd_date object
	* This operation is not reversible and is only for reference pourposes
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

			if($mode!=='period') {
				if(!empty($dd_date->month)) {
					$dd_date->month--; // Remove 1
				}
				if(!empty($dd_date->day)) {
					$dd_date->day--; // Remove 1
				}
			}
			/*
			// In periods, year can be empty
			if(!empty($year) && !empty($dd_date->month)) {
				$dd_date->month--; // Remove 1
			}
			// In periods, month can be empty
			if(!empty($month) && !empty($dd_date->day)) {
				$dd_date->day--; // Remove 1
			}
			*/
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
	}#end convert_date_to_seconds



	/**
	* CONVERT_SECONDS_TO_PERIOD
	* Calculate current seconds in minutes, hours, days, totals and aproximative prtials.
	* Note that non total values are aproximations because we need use 
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


		#dump($days_total, ' days_total ++ '." years:$years_int, months:$months_int, days:$rest_days ".to_string());

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
	* __DESTRUCT
	*/
	public function __destruct() {

		#$this->correct_date();

		if (!empty($this->errors)) {
			//trigger_error( to_string($this->errors) );
			debug_log(__METHOD__." Errors foud in dd_date ".to_string($this->errors), logger::WARNING);
		}
	}#end __destruct



}//end class dd_date
?>