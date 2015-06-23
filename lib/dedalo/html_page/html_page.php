<?php

	# CONTROLLER	
	#dump($GLOBALS);
	#dump($_SESSION);
	/*
	* @ id
	* @ tipo
	# @ lang
	# @ h (header) 
	*/
	#dump($_SESSION['dedalo4']['auth']);

	# LOAD TIME INIT	
	#$start = microtime(TRUE);
	#global $start;
		
	# set vars
	$vars = array('caller_tipo','id','t','tipo','m','modo','context_name','parent');
	foreach($vars as $name) $$name = common::setVar($name);
	if($t) $tipo = $t;
	if($m) $modo = $m;

	# Modos autointerpretados
	if(!$modo && !empty($id)) $modo = 'edit';
	if(!$modo && empty($id) && !empty($tipo) ) $modo = 'list';

	#$modo = navigator::get_selected('modo');
	
	# Store section tipo
	navigator::set_selected('section', $tipo);

	if (!defined('SECTION_TIPO')) {
		define('SECTION_TIPO', $tipo);
		
		if(SHOW_DEBUG) {
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo(SECTION_TIPO, true);
			if ($modelo_name!='section' && strpos($modelo_name, 'area')===false ) {
				throw new Exception("Error Processing Request current assigned SECTION_TIPO is not a section ($tipo - $modelo_name)", 1);				
			}
		}
	}


	# DEBUG
	unset($_SESSION['debug_content']);
	if(SHOW_DEBUG===true) {
		
		if(!empty($_SESSION['dedalo4']['auth']))
		$_SESSION['debug_content']['SESSION AUTH4']		= $_SESSION['dedalo4']['auth'];
		
		if(!empty($_SESSION['dedalo4']['config']))
		$_SESSION['debug_content']['SESSION CONFIG4']	= $_SESSION['dedalo4']['config'];

		if (!defined('SECTION_TIPO')) {
			#trigger_error("Error Processing Request. SECTION_TIPO is not defined", 1);
			#echo "SECTION_TIPO is not defined";
		}
		#dump(SECTION_TIPO," SECTION_TIPO ".SECTION_TIPO." - ".trim($_SERVER['REQUEST_URI']) );
	}

	
	
	#######################
	# SWITCH HTML CONTENT
	#######################
	switch (true) {

		#
		# HTML_RAW : RECEIVED CONTENT IS HTML
		#
		case ($html_raw===true) :
			
			# CONTENT HTML RAW
			$html = $content;
			break;

		#
		# LOGIN : Test user is logged
		#
		case (login::is_logged()!==true) :
			
				# CONTENT HTML IS LOGIN FORM

				$username	= NULL;
				$user_id	= NULL;	
				
				# BUILD LOGIN HTML		
				$login	= new login($modo='edit');
				$html	= $login->get_html();
				break;
		
		#
		# DEFAULT : normal case (user is logged)
		#
		default:
			
				# CONTENT HTML FROM OBJECT
			
				# BUILD RECEIVED OBJ HTML
				if(is_object($content)) {
					$html	= $content->get_html();
					$modo 	= $content->get_modo();
				}else{
					if(empty($content)) {
						$html 	= "Error on create content. Not received any content! ";
					}else if(is_string($content)) {
						$html 	= $content;
					}
				}

				$username	= $_SESSION['dedalo4']['auth']['username'];
				$user_id	= $_SESSION['dedalo4']['auth']['user_id'];

			
				##############################################################################
				# ACTIVITY
				# Prevent infinite loop saving self
				if (in_array($tipo, logger_backend_activity::$ar_elements_activity_tipo)) break;
					
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

						case ($modo=='edit'):
							
							$dato_activity['id']		= $id;
							$dato_activity['tipo']		= $tipo;
							$dato_activity['top_id'] 	= TOP_ID;	#$_SESSION['dedalo4']['config']['top_id'];
							$dato_activity['top_tipo'] 	= TOP_TIPO;	#$_SESSION['dedalo4']['config']['top_tipo'];
							break;

						case ($modo=='list') :
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
				break;
			
	}#end switch (true) 




	# Fix navigator modo (needed for buttons)
	navigator::set_selected('modo', $modo);

	# Fix navigator caller_id (needed for relations)
	navigator::set_selected('caller_tipo', $caller_tipo);	#dump($caller_tipo,'caller_tipo');
	

	
	
	
	/**
	* JAVASCRIPT 
	*/
		# PARENT (JAVASCRIPT VAR) NEEDED FOR TIME MACHINE
		if(isset($_REQUEST['id'])) {
			$parent = $_REQUEST['id'];
			$_SESSION['dedalo4']['config']['id'] = $parent;
		}else if(!empty($_SESSION['dedalo4']['config']['id'])) {
			$parent = $_SESSION['dedalo4']['config']['id'];
		}else{
			$parent = NULL;
		}

		

		# JAVASCRIPT LINKS
		$js_link_code	= js::get_js_link_code();		#dump($js_link_code,'js_link_code');


	/**
	* CSS 
	*/
		# CSS LINKS		
		$css_link_code	= css::get_css_link_code();

	

	# LOG MESSAGES
		global $log_messages;							#dump($log_messages.'$log_messages');


		
	/**
	* PAGE HEADER
	*/		
		$html_header = '';		
		if (empty($context_name) && strpos($m, 'tool_')===false) {
			# MENU
			$menu_html = NULL;
			if(empty($caller_id)) {
				$menu 		= new menu($modo);
				$menu_html 	= $menu->get_html();	
			}
			ob_start();
			include ( DEDALO_LIB_BASE_PATH . '/' . get_class() .'/html/' . get_class() . '_header.phtml' );
			$html_header =  ob_get_contents();
			ob_get_clean();
		}else if ($context_name=='list_in_portal') {			

			$html_header .= "<div class=\"breadcrumb\">";

			$html_header .= strip_tags( tools::get_bc_path() ); // Remove possible <mark> tags
			#dump(tools::get_bc_path(), 'tools::get_bc_path()');
			$html_header .= "<div class=\"icon_bs close_window\" title=\"".label::get_label('cerrar')."\"></div>";
			$html_header .= "</div>";
			$html_header .= "<div class=\"breadcrumb_spacer\"></div>";
		}		

		$page_title = (string)RecordObj_dd::get_termino_by_tipo($tipo,DEDALO_APPLICATION_LANG,true);
		$page_title = strip_tags($page_title);


	# HTML PAGE
		include('html/' . get_class() . '.phtml');
	


	# CLOSE DB CONNECTION
	# dump(DBi::_getConnection());
	#DBi::_getConnection()->close();
	pg_close(DBi::_getConnection());



/*
function myfunction_A($var='8888') {
	$response = "La respuesta es $var";
		dump($response, 'var', array());
	return $response;
}
// listen
mThread::listen();
// start time
$time = time() ;
//start thread 
mThread::start( 'myfunction_A', "leche ") ;
// running till completed
//while ( mThread::runing () ) ;	
*/
?>