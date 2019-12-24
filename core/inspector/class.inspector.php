<?php
/*
* CLASS INSPECTOR
*
*
*/
class inspector {



	protected $modo;
	protected $tipo;
	protected $section;



	public function __construct($modo, $tipo, $section) {

		$this->modo		= $modo;
		$this->tipo		= $tipo;
		$this->section	= $section;
	}//end __construct



	/**
	* GET_HTML
	* @return string $html
	*/
	public function get_html() {

		if(SHOW_DEBUG) $start_time = start_time();

		ob_start();
		include ( DEDALO_CORE_PATH .'/'. __CLASS__ .'/'. __CLASS__ .'.php' );
		$html =  ob_get_clean();
		
		if(SHOW_DEBUG) {
			#$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' ' );
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		return $html;
	}//end get_html


}//end inspector
?>