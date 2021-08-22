<?php
/*
* CLASS tool_export
*
*
*/
class tool_export { // extends tool_common

	public $section_tipo;
	public $section_obj;	# received section
	public $ar_records;		# Array of records to export (section_id) or null
	public $data_format;  	# string 'standard', 'dedalo'

	public static $quotes 	 		  = '"';
	public static $delimiter 		  = ';';
	public static $internal_separator = PHP_EOL;

	public $section_list_custom;



	/**
	* __CONSTRUCT
	*/
	public function __construct($section_tipo, $modo, $data_format='standard') {

		// Fix modo
		$this->modo = 'tool_export';

		// fix section_tipo
		$this->section_tipo = $section_tipo;

		// Fix data_format
		$this->data_format = $data_format;

		// Fix records
		$this->ar_records = null;

		return true;
	}//end __construct


	

}//end class tool_export
