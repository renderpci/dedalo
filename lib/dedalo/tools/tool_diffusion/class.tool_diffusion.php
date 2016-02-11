<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

/**
* tool_diffusion
* Export current section data to mysql database with defined 'difission' options
*/

class tool_diffusion {


	public $section_tipo;
	public $section_id;
	public $modo;
	public $options;
	public static $debug_response;

	
	function __construct( $section_tipo=null, $modo='button' ) {

		if (empty($section_tipo)) {
			throw new Exception("Error Processing Request. Var section_tipo is empty", 1);			
		}
		$this->section_tipo = $section_tipo;
		$this->modo 		= $modo;	
	}

	/** 
	* HTML
	* @return string
	*/
	public function get_html() {
		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/tools/'.get_called_class().'/'.get_called_class().'.php' );
		return  ob_get_clean();
	}


	/**
	* GET_AR_THESAURUS_TABLES
	* @return array Formated array as prefix => name
	*/
	public function get_ar_thesaurus_tables() {		
	
		$ar_tables = (array)$this->options->ar_tables;
			#dump($ar_tables, ' ar_tables ++ '.to_string());
		
		$ar_thesaurus_tables = array();
		$i=0;foreach ($ar_tables['prefijo'] as $key => $prefix) {

			if (isset($ar_tables['tipo'][$i-1]) && $ar_tables['tipo'][$i] != $ar_tables['tipo'][$i-1]) { // separator
				$ar_thesaurus_tables[$prefix.'_'.$ar_tables['tipo'][$i]] = 'separator';				
			}
			
			# Do not include langs never
			if ($prefix!='lg') {
				$ar_thesaurus_tables[$prefix] = $ar_tables['nombre'][$i];
			}
			
		$i++;}
		#dump($ar_thesaurus_tables, ' ar_thesaurus_tables ++ '.to_string());

		return $ar_thesaurus_tables;

	}#end get_ar_thesaurus_tables







}//end tool_diffusion
?>