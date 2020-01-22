<?php
	
	# CONTROLLER
	/*
	if (SHOW_DEBUG!==true) {
		# Delete current Dédalo session
		unset($_SESSION['dedalo']['auth']);

		#exit();
	}*/
	

	#
	# ONLY SHOW WHEN USER IS NOT ADMIN DEDALO_SUPERUSER
	if (DEDALO_MAINTENANCE_MODE===true && (isset($_SESSION['dedalo']['auth']['user_id']) && $_SESSION['dedalo']['auth']['user_id']!=DEDALO_SUPERUSER)) {
		
		# Delete current Dédalo session
		unset($_SESSION['dedalo']['auth']);
	

		$cwd = basename(__DIR__);
		$page_title = label::get_label('sitio_en_mantenimiento');

		
		# CURRENT CSS / JS MAIN FILES
		css::$ar_url[] = DEDALO_CORE_URL."/$cwd/css/".$cwd.".css";
		#js::$ar_url[]  = DEDALO_CORE_URL."/$cwd/js/".$cwd.".js";


		# JAVASCRIPT LINKS
			$js_link_code	= js::get_js_link_code();

		# CSS LINKS		
			$css_link_code	= css::get_css_link_code();
		

		ob_start();
		include ( DEDALO_CORE_PATH .'/'. $cwd . '/html/' . $cwd . '.phtml' );
		$html = ob_get_clean();

		#$html = html_page::get_html( $html );
		print($html);

		exit(); // Important ! Stop execution for normal users
	}


	# NOTICE TO ADMIN ONLY
	if ( isset($_SESSION['dedalo']['auth']['user_id']) && $_SESSION['dedalo']['auth']['user_id']==DEDALO_SUPERUSER ) {
		$GLOBALS['log_messages'][] = "<span class=\"warning\">".label::get_label('sitio_en_mantenimiento')."</span>";
	}
	

?>