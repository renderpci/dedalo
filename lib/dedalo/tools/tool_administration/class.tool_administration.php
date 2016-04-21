<?php
/*
* CLASS TOOL_ADMINISTRATION
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');


class tool_administration extends tool_common {
	
	protected $section_obj ;

	
	public function __construct($section_obj, $modo='button') {
		
		# Fix modo
		$this->modo = $modo;

		# Fix current media component
		$this->section_obj = $section_obj;
	}


	
	
	

	/**
	* SHOW_INFO
	* @return string $html
	*/
	public function show_info($name, $value, $body) {

		$html='';
		$html .= "<li class=\"list-group-item\">";
		$html .= "<span class=\"glyphicon glyphicon-info-sign\" aria-hidden=\"true\"></span> ";
		$html .= "$name: <b>$value</b>";
		$html .= "<pre>";
		$html .= print_r($body,true);
		$html .= "</pre>";
		$html .= "</li>";
		#$html .= "<br>";

		return $html;
		
	}#end show_info
	




	








	
	
}
?>