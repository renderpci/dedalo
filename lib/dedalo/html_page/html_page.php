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
	if($modo===false) {
		if(empty($id)) {
			$modo = 'list';
		}else{
			$modo = 'edit';
		}
	}


	
	# Store section tipo
	navigator::set_selected('section', $tipo);


	# SECTION_TIPO
	if (!defined('SECTION_TIPO')) {
		define('SECTION_TIPO', $tipo);
		
		if(SHOW_DEBUG===true) {
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo(SECTION_TIPO, true);
			if ($modelo_name!=='section' && strpos($modelo_name, 'area')===false ) {
				#throw new Exception("DEBUG INFO: Error Processing Request current assigned SECTION_TIPO is not a section ($tipo - $modelo_name)", 1);
				echo "DEBUG INFO: Current requested SECTION_TIPO is not a section.
				<br> tipo: $tipo <br>
					 modelo_name: $modelo_name";
				die();				
			}
		}
	}



	# DEBUG	
	if(SHOW_DEBUG===true) {
		unset($_SESSION['debug_content']);

		if(!empty($_SESSION['dedalo4']['auth']))
		$_SESSION['debug_content']['SESSION AUTH4']	  = $_SESSION['dedalo4']['auth'];
		
		if(!empty($_SESSION['dedalo4']['config']))
		$_SESSION['debug_content']['SESSION CONFIG4'] = $_SESSION['dedalo4']['config'];
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

				$username		= $_SESSION['dedalo4']['auth']['username'];
				$user_id		= $_SESSION['dedalo4']['auth']['user_id'];
				$full_username 	= isset($_SESSION['dedalo4']['auth']['full_username']) ? $_SESSION['dedalo4']['auth']['full_username'] : null;
			
				##############################################################################
				# ACTIVITY : LOG VISIT TO CURRENT PAGE
				html_page::log_page_visit($modo, $id, $tipo, $parent);

				break;
			
	}#end switch (true)



	# SELECTED MODO . Fix navigator modo (needed for buttons)
		navigator::set_selected('modo', $modo);

	# CALLER_TIPO Fix navigator caller_id (needed for relations)
		navigator::set_selected('caller_tipo', $caller_tipo);	#dump($caller_tipo,'caller_tipo');

	# lang tld2
		$lang_tld2 = app_lang_to_tld2(DEDALO_APPLICATION_LANG);

		
	
	#
	# JAVASCRIPT
		# PARENT (JAVASCRIPT VAR) NEEDED FOR TIME MACHINE

		if(isset($_REQUEST['parent'])) {
			$parent = $_REQUEST['parent'];
		}elseif(isset($_REQUEST['id'])) {
			$parent = $_REQUEST['id'];
			$_SESSION['dedalo4']['config']['id'] = $parent;
		}else if(!empty($_SESSION['dedalo4']['config']['id'])) {
			$parent = $_SESSION['dedalo4']['config']['id'];
		}else{
			$parent = NULL;
		}

		# JAVASCRIPT LINKS
		$js_link_code	= js::get_js_link_code();



	#
	# CSS
		# CSS LINKS		
		$css_link_code	= css::get_css_link_code();

	

	# LOG MESSAGES
		global $log_messages;


		
	#
	# PAGE HEADER
		$html_header = '';
		switch (true) {

			case (isset($_REQUEST['menu']) && $_REQUEST['menu']==0):
				$menu_html = null;
				break;

			case (isset($_REQUEST['menu']) && $_REQUEST['menu']==1):
				# MENU
				$menu 		= new menu($modo);
				$menu_html 	= $menu->get_html();			
				ob_start();
				include ( DEDALO_LIB_BASE_PATH . '/' . get_class() . '/html/' . get_class() . '_header.phtml' );
				$html_header = ob_get_clean();
				break;

			case ($context_name==='list_in_portal'):
				$html_header .= '<div class="breadcrumb">';
				$html_header .= strip_tags( tools::get_bc_path() ); // Remove possible <mark> tags
				$html_header .= "<div class=\"icon_bs close_window\" title=\"".label::get_label('cerrar')."\" onclick=\"window.close()\"></div>";
				$html_header .= '</div>';
				$html_header .= '<div class="breadcrumb_spacer"></div>';
				break;

			case (strpos($m, 'tool_')===false): //empty($context_name) && 
				# MENU
				$menu_html = null;
				if(empty($caller_id)) {
					$menu 		= new menu($modo);
					$menu_html 	= $menu->get_html();	
				}
				ob_start();
				include ( DEDALO_LIB_BASE_PATH . '/' . get_class() . '/html/' . get_class() . '_header.phtml' );
				$html_header = ob_get_clean();
				break;			
			
			default:
				$html_header = '';
				break;
		}
		


	#
	# PAGE TITLE
		if (strpos($modo, 'tool_')===0){
			$page_title = label::get_label($modo);
		}else{
			$page_title = RecordObj_dd::get_termino_by_tipo($tipo,DEDALO_APPLICATION_LANG,true);
		}
		
		$page_title = strip_tags($page_title);
		
		if (!empty($id)) {
			$page_title .= " $id";
		}else{
			$page_title .= " $parent";
		}

		if(SHOW_DEBUG===true) {
			$page_title .= ' '.$tipo;
			$page_title = defined('DEDALO_ENTITY_LABEL') ? DEDALO_ENTITY_LABEL.' '.$page_title : DEDALO_ENTITY.' '.$page_title;
		}


	$is_global_admin = (bool)component_security_administrator::is_global_admin(navigator::get_user_id());


	#
	# HTML PAGE
		include(DEDALO_LIB_BASE_PATH . '/' . get_class() .'/html/' . get_class() . '.phtml');


?>