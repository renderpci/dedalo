<?php

class dd_date extends stdClass {


 # public $errors; // Optional

  /**
  * __CONSTRUCT
  * @param object $data optional
  */
  public function __construct( $data=null ) {

	if (is_null($data)) return;

	# Nothing to do on construct (for now)
	if (!is_object($data)) {
	  trigger_error("wrong data format. Object expected. Given: ".gettype($data));
	  return false;
	}
	
	foreach ($data as $key => $value) {
		if (empty($value)) continue; // Skip empty values
		$method = 'set_'.$key;
		$this->$method($value);
	}
	
  }//end __construct

  /**
  * SET_ERRORS
  */
  public function set_errors($value) {
	$this->errors = $value;
  }#end set_errors


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
  public function set_month($value) {
	if( (int)$value<1 || (int)$value>12 ) {
	  #throw new Exception("Error Processing Request. Invalid month: $value", 1);
	  $this->errors[] = "Error on set month. Value is invalid: ".to_string($value);
	  return false;
	}
	$this->month = (int)$value;
	return true;
  }#end set_month

  /**
  * SET_DAY
  * @return bool 
  */
  public function set_day($value) {
	if( (int)$value<1 || (int)$value>31 ) {
	 # throw new Exception("Error Processing Request. Invalid day: $value", 1);
	  $this->errors[] = "Error on set day. Value is invalid: ".to_string($value);
	  return false;
	}
	$this->day = (int)$value;
	return true;
  }#end set_day

  /**
  * SET_HOUR
  * @return bool 
  */
  public function set_hour($value) {
	if( (int)$value<0 || (int)$value>23 ) {
	  #throw new Exception("Error Processing Request. Invalid hour: $value", 1);
	  $this->errors[] = "Error on set hour. Value is invalid: ".to_string($value);
	  return false;
	}
	$this->hour = (int)$value;
	return true;
  }#end set_hour

  /**
  * SET_MINUTE
  * @return bool 
  */
  public function set_minute($value) {
	if( (int)$value<0 || (int)$value>59 ) {
	  #throw new Exception("Error Processing Request. Invalid minute: $value", 1);
	  $this->errors[] = "Error on set minute. Value is invalid: ".to_string($value);
	  return false;
	}
	$this->minute = (int)$value;
	return true;
  }#end set_minute

  /**
  * SET_SECOND
  * @return bool 
  */
  public function set_second($value) {
	if( (int)$value<0 || (int)$value>59 ) {
	  #throw new Exception("Error Processing Request. Invalid second: $value", 1);
	  $this->errors[] = "Error on set second. Value is invalid: ".to_string($value);
	  return false;
	}
	$this->second = (int)$value;
	return true;
  }#end set_second

  /**
  * SET_MS
  * @return bool 
  */
  public function set_ms($value) {
	if( (int)$value<0 || (int)$value>999 ) {
	  #throw new Exception("Error Processing Request. Invalid ms: $value", 1);
	  $this->errors[] = "Error on set ms. Value is invalid: ".to_string($value);
	  return false;
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

	$this->correct_date();

	return $this;
  }#end get_date_from_timestamp

  /**
  * CORRECT_DATE
  * Convert actual date to mktime and set params to corrected values. 
  * Example: day 31 of month 11, is corrected to day 1 of month 12
  */
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
  }



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
  * __DESTRUCT
  */
  public function __destruct() {

	$this->correct_date();
 
	if (!empty($this->errors)) {
		//trigger_error( to_string($this->errors) );
	}
  }#end __destruct


}//end class dd_date 

?>