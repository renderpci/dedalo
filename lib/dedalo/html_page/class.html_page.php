<?php
/*
* CLASS HTML PAGE

	CREATE A FULL HTML PAGE AND INSERT HTMLOBJECT IN THE BODY

*/


abstract class html_page {

		
	/**
	* STATIC METHOD GET_HTML
	* @param $content (String or Obj)
	*/
	public static function get_html($content, $html_raw=false) {

		if(SHOW_DEBUG) $start_time = start_time();
		
		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/'. get_class() . '/' . get_class() . '.php' );
		$html = ob_get_clean();

		# sanitize_output html
		#ob_start("sanitize_output");
		
		if(SHOW_DEBUG) {
			#$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' ' );
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.microtime(1)]=microtime(1);
		}
		
		return $html;
	}



	/**
	* GET_DEDALO_APLICATION_LANGS_SELECTOR_HTML
	*/
	public static function get_dedalo_aplication_langs_selector_html() {

		# Aplication langs
		$dedalo_application_langs = unserialize(DEDALO_APPLICATION_LANGS);
		
		# Include controller
		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/'. get_class() . '/html/' . get_class() . '_aplication_lang_selector.phtml' );
		$html = ob_get_contents();
		ob_get_clean();		
		
		return $html;
	}




	//pg_close(DBi::_getConnection());


		
		
}
?>