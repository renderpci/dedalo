<?php
# COMPONENT TOOLS (ABSTRACT CLASS)
# MÉTODOS COMPARTIDOS POR TODOS LOS COMPONENTES

abstract class tool_common extends common {

	public $modo;

	/**
	* __CONSTRUCT 
	* @param object $element_obj (can be 'component' or 'section')
	* @param string $modo (default is 'page' when is called from main page)
	*/
	abstract function __construct($element_obj, $modo);



	/**
	* HTML
	* @return string $html (final html code)
	*/
	public function get_html() {

		if(SHOW_DEBUG) {
			#global$TIMER;$TIMER[get_called_class().'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/tools/'.get_called_class().'/'.get_called_class().'.php' );
		$html = ob_get_clean();		
		

		if(SHOW_DEBUG) {
			#global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		return $html;
	}



	



}#end class
?>