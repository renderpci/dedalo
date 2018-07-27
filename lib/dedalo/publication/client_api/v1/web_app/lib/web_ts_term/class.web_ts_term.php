<?php
/**
* TS_TERM
* Object like tesaurus term
*
*/
class web_ts_term {


	static $version = "1.0.1"; // 03-03-2018



	/**
	* __CONSTRUCT
	* Private. Call using static web_ts_term::get_web_ts_term_instance($terminoID, $lang, $request_options)
	*/
	public function __construct( $data ) {
		
		if (is_object($data)) {
			foreach ($data as $key => $value) {
				$this->$key = $value;
			}
		}else{
			dump($data, ' data ++ '.to_string());
		}
	}//end __construct



	/**
	* GET_HTML
	* @return string $html
	*/
	public function get_html( $mode='list' ) {

		$class_name = 'web_ts_term';	//(new \ReflectionClass($this))->getShortName();

		#
		# HTML BUFFER
		ob_start();
		include ( dirname(__FILE__) .'/html/'. $class_name .'_'. $mode .'.phtml' );
		$html =  ob_get_clean();


		return $html;
	}//end get_html


	
}//end class ts_term
?>