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
	public static function get_html( $content, $html_raw=false ) {

		if(SHOW_DEBUG===true) $start_time = start_time();
		
		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/'. get_class() . '/' . get_class() . '.php' );
		$html = ob_get_clean();

		# sanitize_output html
		#ob_start("sanitize_output");
		
		if(SHOW_DEBUG===true) {
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

		$type_of_lang = 'dedalo_application_lang';
		
		# Include controller
		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/'. get_class() . '/html/' . get_class() . '_aplication_lang_selector.phtml' );
		$html = ob_get_contents();
		ob_get_clean();
		
		return $html;
	}//end get_dedalo_aplication_langs_selector_html



	/**
	* GET_DEDALO_DATA_LANGS_SELECTOR_HTML
	*/
	public static function get_dedalo_data_langs_selector_html() {

		# Aplication langs
		$dedalo_application_langs = unserialize(DEDALO_APPLICATION_LANGS);

		$type_of_lang = 'dedalo_data_lang';
		
		# Include controller
		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/'. get_class() . '/html/' . get_class() . '_aplication_lang_selector.phtml' );
		$html = ob_get_contents();
		ob_get_clean();
		
		return $html;
	}//end get_dedalo_data_langs_selector_html




	/**
	* LOG_PAGE_VISIT
	* @return bool
	*/
	public static function log_page_visit($modo, $id, $tipo, $parent) {
		
		# Prevent infinite loop saving self
		if (!in_array($tipo, logger_backend_activity::$ar_elements_activity_tipo)) {

			# Modo activity.
			# En casos como 'tool_transcription' el modo pasado no es 'edit' ni 'list' por lo que forzaremos 'edit' en el logger ya que
			# sólo existen 2 opciones de carga de página definidas: 'LOAD EDIT' y 'LOAD LIST'
			$modo_to_activity = $modo;
			if ( strpos($modo, 'edit')===false && strpos($modo, 'list')===false ) {
				$modo_to_activity = 'edit';
			}
		
			# ACTIVITY DATO
				# Array data
				$dato_activity['msg']	= "HTML Page is loaded in mode: ".$modo_to_activity ." [$modo]";
				
				switch (true) {

					case ($modo==='edit'):
						
						$dato_activity['id']		= $id;
						$dato_activity['tipo']		= $tipo;
						$dato_activity['top_id'] 	= TOP_ID;	#$_SESSION['dedalo4']['config']['top_id'];
						$dato_activity['top_tipo'] 	= TOP_TIPO;	#$_SESSION['dedalo4']['config']['top_tipo'];
						break;

					case ($modo==='list') :
						#$dato_activity['id']		= null;
						$dato_activity['tipo']		= $tipo;
						#$dato_activity['top_id'] 	= null;
						$dato_activity['top_tipo'] 	= TOP_TIPO;	#$tipo;
						break;	

					case ( strpos($modo, 'tool_portal')!==false ) :
						#$dato_activity['id']		= $id;
						$dato_activity['tipo']		= $tipo;
						$dato_activity['top_id'] 	= $parent;	#$_SESSION['dedalo4']['config']['top_id'];
						$dato_activity['top_tipo'] 	= TOP_TIPO;	#$_SESSION['dedalo4']['config']['top_tipo'];
						break;

					case ( strpos($modo, 'tool_')!==false ) :
						#$dato_activity['id']		= $id;
						$dato_activity['tipo']		= $tipo;
						$dato_activity['top_id'] 	= $parent;	#$_SESSION['dedalo4']['config']['top_id'];
						$dato_activity['top_tipo'] 	= TOP_TIPO;	#$_SESSION['dedalo4']['config']['top_tipo'];
						break;

					default:
						break;
				}
				#dump($dato_activity,'$dato_activity');
			
			# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)	
			logger::$obj['activity']->log_message(
				'LOAD'.' '.strtoupper($modo_to_activity),
				logger::INFO,
				$tipo,
				null,
				$dato_activity
			);

			return true;

		}//end if (in_array($tipo, logger_backend_activity::$ar_elements_activity_tipo))

		return false;
		
	}#end log_page_visit



	//pg_close(DBi::_getConnection());


		
		
}
?>