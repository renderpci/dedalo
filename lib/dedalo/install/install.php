<?php

	// css / js files
		css::$ar_url[] = DEDALO_LIB_BASE_URL."/install/css/install.css";
		js::$ar_url[]  = DEDALO_LIB_BASE_URL."/install/js/install.js";

	// config
		$config = install::get_config();

	// sources
		$install_db_file			= $config->target_file_path_compress;
		$hierarchy_files_path		= $config->hierarchy_files_dir_path;
		$install_checked_default	= $config->install_checked_default;

	// hierarchies
		$hierarchies = install::get_available_hierarchy_files();

	// db info
		$db_config = [
			'DEDALO_HOSTNAME_CONN'	=> DEDALO_HOSTNAME_CONN,
			'DEDALO_DB_PORT_CONN'	=> DEDALO_DB_PORT_CONN,
			'DEDALO_SOCKET_CONN'	=> DEDALO_SOCKET_CONN,
			'DEDALO_DATABASE_CONN'	=> DEDALO_DATABASE_CONN,
			'DEDALO_USERNAME_CONN'	=> DEDALO_USERNAME_CONN
		];

	// install status. It will be set as constant in the file 'config_auto.php' when the installation is complete
		// $config_auto_path = DEDALO_LIB_BASE_PATH.'/config/config_auto.php';
		$dedalo_install_status = defined('DEDALO_INSTALL_STATUS')
			? DEDALO_INSTALL_STATUS
			: null;
		// to prevent malicious attacks stop execution some seconds when alredy installed
		if ($dedalo_install_status==='installed') {
			sleep(5);
		}

	// db is already imported check 'matrix_users' table
		$db_tables		= backup::get_tables(); // returns array empty if not is imported
		$db_is_imported	= (bool)in_array('matrix_users', $db_tables);

	// init test
		require(DEDALO_LIB_BASE_PATH.'/config/dd_init_test.php');
		if ($init_response->result===false) {
			debug_log(__METHOD__." Init test error: ".$init_response->msg.to_string(), logger::ERROR);
		}

	// html
		echo '<div class="install_wrapper">';
		include dirname(__FILE__) . '/html/install.phtml';
		echo '</div>';

	/*
	// controller vars
		$id						= NULL;
		$modo					= $this->get_modo();
		$tipo 					= $this->get_tipo();	
		$ar_tools_obj			= false;					
		$tipo_active_account	= $this->tipo_active_account;
		$tipo_button_login 		= $this->tipo_button_login;
		$component_name			= get_class($this);
		$file_name				= $modo;

	// basic system files check
		// langs js
			# Generate js files with all labels (if not extist current lang file)
			$folder_path = DEDALO_LIB_BASE_PATH.'/common/js/lang';
			if( !is_dir($folder_path) ) {
				if(!mkdir($folder_path, 0777,true)) {
					$msg = 'Error on read or create js/lang directory. Permission denied';
					return $msg;
				}
				error_log("[Login page] Created dir: $folder_path");
			}
			$ar_langs 	 = (array)unserialize(DEDALO_APPLICATION_LANGS);
			foreach ($ar_langs as $lang => $label) {
				$label_path  = '/common/js/lang/' . $lang . '.js';
				if (!file_exists(DEDALO_LIB_BASE_PATH.$label_path)) {
					$ar_label = label::get_ar_label($lang); // Get all properties					
					file_put_contents( DEDALO_LIB_BASE_PATH.$label_path, 'var get_label='.json_encode($ar_label,JSON_UNESCAPED_UNICODE).'');				
					error_log("[Login page] Generated js labels file for lang: $lang - $label_path");
				}
			}
		// structure css
			# Generate css structure file (if not extist)	
			$file_path = DEDALO_LIB_BASE_PATH.'/common/css/structure.css';
			if (!file_exists($file_path)) {			
				$response = (object)css::build_structure_css();
				#debug_log(__METHOD__." Generated structure css file: ".$response->msg, logger::WARNING);
				error_log("[Login page] Generated structure css file: ".$response->msg);
			}
	

	// verify database is ok
		try {
			// Create connection to force check databsae connection
			$conn = DBi::_getConnection();
		} catch (Exception $e) {
			echo 'Caught exception: ',  $e->getMessage(), "\n";
			die();
		}

	
	// Verify current URL tipo exists as DEDALO_ROOT_TIPO children before login. If not, redirect to MAIN_FALLBACK_SECTION tipo
		$RecordObj_dd 	= new RecordObj_dd(TOP_TIPO);
		$ar_parents 	= $RecordObj_dd->get_ar_parents_of_this();
		if (!in_array(DEDALO_ROOT_TIPO, $ar_parents)) {		
			header("Location: ".DEDALO_LIB_BASE_URL."/main/?t=".MAIN_FALLBACK_SECTION);
			exit();
		}


	// Test su password
		$su_default_password = (bool)$this->test_su_default_password();


	// Test if superuser psw is default
		if( defined('DEDALO_TEST_INSTALL') && defined('DEDALO_TEST_INSTALL')===true && $su_default_password===true ) {
				
			# CSS includes
			array_unshift(css::$ar_url_basic, BOOTSTRAP_CSS_URL);

			$page_html	= 'html/' . get_class($this) . '_set_psw.phtml';
			include($page_html);
			return;
		}
	

	// lang jump . builds lang selector html
		$dedalo_aplication_langs_selector_html = html_page::get_dedalo_aplication_langs_selector_html();

	
	// username
		$tipo_username	= DEDALO_USER_NAME_TIPO;
		$username_label = RecordObj_dd::get_termino_by_tipo($tipo_username, DEDALO_DATA_LANG, true);
		$username_value = (DEDALO_ENTITY==='dedalo4_demo') ? "dedalo" : null;

		
	// password	
		$tipo_password	= DEDALO_USER_PASSWORD_TIPO;
		$password_label = RecordObj_dd::get_termino_by_tipo($tipo_password, DEDALO_DATA_LANG, true);
		$password_value = (DEDALO_ENTITY==='dedalo4_demo') ? "dedalo4Demo" : null;
	

	// button login (send) 
		$button_login 		= new button_login($tipo_button_login, null,  null);
		$html_button_login	= $button_login->get_html();
	

	// modo 
		switch($modo) {

			case 'edit':
			case 'simple':
					$file_name  = 'edit';
					break;
			case 'recover':
					return false;
					break;
		}
	

	// include html
		$page_html	= dirname(__FILE__) . '/html/' . $component_name . '_' . $file_name . '.phtml';
		if( !include($page_html) ) {
			echo "<div class=\"error\">Invalid mode $this->modo</div>";
		}
	*/