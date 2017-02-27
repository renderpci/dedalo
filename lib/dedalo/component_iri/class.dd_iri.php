<?php
/*
* CLASS DD_IRI
*
*
*/
class dd_iri extends stdClass {


	/**
	* __CONSTRUCT
	* @param object $data optional
	*/

	public function __construct( $data=null) {

			if (is_null($data)) return;

			# Nothing to do on construct
			if (!is_object($data)) {
				#dump($data, ' data ++ '.to_string());
				#trigger_error("wrong data format. object expected. Given type: ".gettype($data));
				debug_log(__METHOD__." wrong data format. object expected. Given type: ".gettype($data).' - '.to_string($data), logger::ERROR);
				return false;
			}

			foreach ($data as $key => $value) {
				if (empty($value)) continue; // Skip empty values			

				$method = 'set_'.$key;
				$this->$method($value);		
			}

		}//end __construct


	/**
	* SET_IRI
	* Store absolute iri value
	* @return 
	*/
	public function set_iri($value) {
		$this->iri = (string)$value;
	}#end set_iri


	/**
	* SET_DISPLAY
	* Store absolute iri value
	* @return 
	*/
	public function set_display($value) {
		$this->iri = (string)$value;
	}#end set_display


	/**
	* __DESTRUCT
	*/
	public function __destruct() {

		if (!empty($this->errors)) {
			//trigger_error( to_string($this->errors) );
			debug_log(__METHOD__." Errors foud in dd_iri ".to_string($this->errors), logger::WARNING);
		}
	}#end __destruct

}//end class iri

?>