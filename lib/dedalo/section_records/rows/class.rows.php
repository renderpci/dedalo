<?php
/**
* ROWS
*/
class rows {


	public $section_records_obj;



	function __construct( section_records $section_records_obj ) {

		$this->section_records_obj = $section_records_obj;
	}//end __construct



	/**
	* GET_HTML
	*/
	public function get_html() {

		$start_time=microtime(1);

		ob_start();
		include ( get_called_class().'.php' );
		$html =  ob_get_clean();
		#$this->section_records_obj->rows_obj->generated_time['rows'] = round(microtime(1)-$start_time,6);

		return $html;
	}//end get_html



}// rows
