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
	#dump($_SESSION['auth4']);

	# LOAD TIME INIT	
	#$start = microtime(TRUE);
	#global $start;
		
	# set vars
	$vars = array('caller_id','caller_tipo','id','t','tipo','m','modo');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}
	if($t) $tipo = $t;
	if($m) $modo = $m;

	# Modos autointerpretados
	if(!$modo && !empty($id)) $modo = 'edit';
	if(!$modo && empty($id) && !empty($tipo) ) $modo = 'list';

	#$modo = navigator::get_selected('modo');
	
	# Store section tipo
	navigator::set_selected('section', $tipo);


	# DEBUG
	unset($_SESSION['debug_content']);
	if(SHOW_DEBUG===true) {
		
		if(!empty($_SESSION['auth4']))
		$_SESSION['debug_content']['SESSION AUTH4']		= $_SESSION['auth4'];
		
		if(!empty($_SESSION['config4']))
		$_SESSION['debug_content']['SESSION CONFIG4']	= $_SESSION['config4'];
	}

	
	#dump( navigator::get_selected('section'),'navigator::set_selected(section)');

	
	# POR REFORMULAR EN NAVIGATOR......... !!!!!!!
	# TOP_TIPO / TOP_ID
	/*
	if(isset($_REQUEST['m']) && $_REQUEST['m']=='edit') {
		$_SESSION['config4']['top_tipo'] = $top_tipo	= $tipo;
		$_SESSION['config4']['top_id'] 	 = $top_id 		= $id;
			#dump("FIXED TOP VARS ", "top_tipo:$top_tipo - top_id:$top_id");
	}else{
		if(isset($_SESSION['config4']['top_tipo'])) $top_tipo 	= $_SESSION['config4']['top_tipo'];
		if(isset($_SESSION['config4']['top_id'])) 	$top_id 	= $_SESSION['config4']['top_id'];
	}
	if( isset($_REQUEST['t']) ) {
		$_SESSION['config4']['top_tipo'] = $top_tipo	= $tipo;
	}
	*/
	switch (true) {
		
		case ( $modo=='edit' ) :
			$_SESSION['config4']['top_id'] 		= $id;
			$_SESSION['config4']['top_tipo'] 	= $tipo;
			break;

		case ( $modo=='list' ) :
			#$_SESSION['config4']['top_id'] 	= null;
			$_SESSION['config4']['top_tipo'] 	= $tipo;
			break;

		case ( strpos($modo,'tool_')!==false ) :			
			#$_SESSION['config4']['top_id'] 	= null;#$caller_id;
			#$_SESSION['config4']['top_tipo'] 	= $tipo;
			break;
		
		default:
			# Case list ()
			#$_SESSION['config4']['top_id'] 	= $id;
			#$_SESSION['config4']['top_tipo'] 	= $tipo;
			break;
	}
	#dump($_SESSION['config4']['top_tipo'], $_REQUEST['m']);
	#dump($_SESSION['config4']['top_id'],$_REQUEST['m']);
	#error_log("top_id:".$_SESSION['config4']['top_id']." - top_tipo:".$_SESSION['config4']['top_tipo']);

	# Fix to be global var javascript accesible
	if(isset($_SESSION['config4']['top_id']))
		$top_id 	= $_SESSION['config4']['top_id'];
	if(isset($_SESSION['config4']['top_tipo']))
		$top_tipo 	= $_SESSION['config4']['top_tipo'];

	
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

			$username		= NULL;
			$userID_matrix	= NULL;	
			
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

			$username		= $_SESSION['auth4']['username'];
			$userID_matrix	= $_SESSION['auth4']['userID_matrix'];			

			
			# ACTIVITY
			# Prevent infinite loop saving self
			if (!in_array($tipo, logger_backend_activity::$ar_elements_activity_tipo)) {
				
				# Siempre y cuando el tipo a salvar no sea de un elemento de 'logger_backend_activity', calculamos los proyectos de su sección
				# Esto permitirá filtrar la actividad por proyectos autorizados al usuario que consulta
				#try {
					$projects = NULL;
					if($modo=='edit') {
						$projects = filter::get_section_projects($id, $tipo, 0);
							#dump($projects, "projects for vars: id:$id, tipo:$tipo"); #$projects = NULL;
					}
					if($modo=='list') {
						$projects = filter::get_section_projects(NULL, $tipo, 0);
							#dump($projects, "projects for vars: id:$id, tipo:$tipo"); #$projects = NULL;
					}
				
					# Modo activity.
					# En casos como 'tool_transcription' el modo pasado no es 'edit' ni 'list' por lo que forzaremos 'edit' en el logger ya que
					# sólo existen 2 opciones de carga de página definidas: 'LOAD EDIT' y 'LOAD LIST'
					$modo_to_activity = $modo;
					if ( strpos($modo, 'edit')===false && strpos($modo, 'list')===false ) {
						$modo_to_activity = 'edit';
					}
					
					# ACTIVITY DATO
						# Array data
						$dato_activity['msg']	= "Page is loaded in mode: ".$modo_to_activity ." [$modo]";
						
						switch (true) {

							case ($modo=='edit') :
								$dato_activity['id']		= $id;
								$dato_activity['tipo']		= $tipo;
								$dato_activity['top_id'] 	= $_SESSION['config4']['top_id'];
								$dato_activity['top_tipo'] 	= $_SESSION['config4']['top_tipo'];
								break;

							case ($modo=='list') :
								#$dato_activity['id']		= null;
								$dato_activity['tipo']		= $tipo;
								#$dato_activity['top_id'] 	= null;
								$dato_activity['top_tipo'] 	= $tipo;
								break;	

							case ( strpos($modo, 'tool_portal')!==false ) :
								$dato_activity['id']		= $id;
								$dato_activity['tipo']		= $tipo;
								$dato_activity['top_id'] 	= $_SESSION['config4']['top_id'];
								$dato_activity['top_tipo'] 	= $_SESSION['config4']['top_tipo'];
								break;

							case ( strpos($modo, 'tool_')!==false ) :
								$dato_activity['id']		= $id;
								$dato_activity['tipo']		= $tipo;
								$dato_activity['top_id'] 	= $_SESSION['config4']['top_id'];
								$dato_activity['top_tipo'] 	= $_SESSION['config4']['top_tipo'];
								break;

							default:
								#$dato_activity['top_id'] 	= $_SESSION['config4']['top_id'];
								#$dato_activity['top_tipo'] = $_SESSION['config4']['top_tipo'];
								break;
						}
						#dump($dato_activity,'$dato_activity');
					
					# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)	
					logger::$obj['activity']->log_message(
						'LOAD'.' '.strtoupper($modo_to_activity),
						logger::INFO,
						$tipo,
						$projects,
						$dato_activity
					);								

				/*
				} catch (Exception $e) {
				    if(SHOW_DEBUG) {
				    	$msg = 'Exception: ' . $e->getMessage();
				    	trigger_error($msg);
				    }
				}#end try catch
				*/
			}#end if (!in_array($tipo, logger_backend_activity::$ar_elements_activity_tipo))
			break;

	}#end switch (true) 




	# Fix navigator modo (needed for buttons)
	navigator::set_selected('modo', $modo);

	# Fix navigator caller_id (needed for relations)
	navigator::set_selected('caller_id', $caller_id);
	navigator::set_selected('caller_tipo', $caller_tipo);	#dump($caller_tipo,'caller_tipo');
	

	
	
	
	/**
	* JAVASCRIPT 
	*/
		# PARENT (JAVASCRIPT VAR) NEEDED FOR TIME MACHINE
		if(isset($_REQUEST['id'])) {
			$parent = $_REQUEST['id'];
			$_SESSION['config4']['id'] = $parent;
		}else if(!empty($_SESSION['config4']['id'])) {
			$parent = $_SESSION['config4']['id'];
		}else{
			$parent = NULL;
		}

		if( empty($parent) && !empty($caller_id) )
			$parent = $caller_id;

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
		$html_header = NULL;
		$dedalo_aplication_langs_selector_html = html_page::get_dedalo_aplication_langs_selector_html();
		if(empty($caller_id)) {
			
			switch( true ) {
			
				case $modo=='relation':	# No head. Nothing to do
									break;

				case $modo=='tool_time_machine': # No head. Nothing to do
									break;

				case $modo=='portal_edit':	# No head. Nothing to do
									break;

				case (strpos($modo, 'tool_')!==false) :
									# No head. Nothing to do
									break;				

				default :			# MENU
									$menu_html = NULL;
									if(empty($caller_id)) {
										$menu 		= new menu($modo);
										$menu_html 	= $menu->get_html();	
									}
									ob_start();
									include ( DEDALO_LIB_BASE_PATH . '/' . get_class() .'/html/' . get_class() . '_header.phtml' );
									$html_header =  ob_get_contents();
									ob_get_clean();
			}
		}		
		#dump($modo,'modo');	
		#echo "top_tipo ".$_SESSION['config4']['top_tipo'];

		$page_title = RecordObj_ts::get_termino_by_tipo($tipo);
		
	
	# HTML PAGE
		include('html/' . get_class() . '.phtml');
	


	# CLOSE DB CONNECTION
	# dump(DBi::_getConnection());
	DBi::_getConnection()->close();



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