<?php

// controller tool_cataloging


// controller vars
	$modo 			= $this->modo;
	$file_name		= $modo;


// mode switch
	switch($modo) {

		case 'page':

			// section info
				$section_tipo = DEDALO_SECTION_USERS_TIPO; 
				$section_id   = navigator::get_user_id(); // current logged user

			// user section components
				$ar_components = [
					['tipo' => 'dd330', 					'permissions' => 1],	// section id . read only (!)
					['tipo' => DEDALO_USER_PROFILE_TIPO, 	'permissions' => 1],	// user profile . read only (!)
					['tipo' => DEDALO_USER_NAME_TIPO, 		'permissions' => 1],	// username . read only (!)
					['tipo' => DEDALO_USER_PASSWORD_TIPO, 	'permissions' => 2],	// password
					['tipo' => DEDALO_FULL_USER_NAME_TIPO, 	'permissions' => 2],	// user full name
					['tipo' => DEDALO_USER_EMAIL_TIPO, 		'permissions' => 2],	// email
					['tipo' => DEDALO_FILTER_MASTER_TIPO,	'permissions' => 1],	// projects . read only (!)
					['tipo' => DEDALO_USER_IMAGE_TIPO, 		'permissions' => 2]		// user image					
				];

			// css / js
				css::$ar_url[] = DEDALO_LIB_BASE_URL . '/tools/' . get_class($this).  '/css/' . get_class($this) . '.css';
				js::$ar_url[]  = DEDALO_LIB_BASE_URL . '/tools/' . get_class($this).  '/js/' . get_class($this) . '.js';

				js::$ar_url[] = DEDALO_LIB_BASE_URL."/section/js/section.js";


			break;
	}//end switch	


// include file html
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}