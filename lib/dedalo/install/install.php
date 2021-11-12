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

	// install status. It will set as constant in the file 'config_auto.php' when the installation is complete
		// $config_auto_path = DEDALO_LIB_BASE_PATH.'/config/config_auto.php';
		$dedalo_install_status = defined('DEDALO_INSTALL_STATUS')
			? DEDALO_INSTALL_STATUS
			: null;
		// prevents legacy systems from being exposed to unwanted installation
			if ($dedalo_install_status===null) {

				// check system_is_already_installed (get users in database)
				$already_installed = install::system_is_already_installed();
				if ($already_installed->result===true) {

					// update config_auto_file
					$file		= $config->config_auto_file_path;
					$content	= file_get_contents($file);
					// set as 'installed' by default for security
					if (strpos($content, 'DEDALO_INSTALL_STATUS')===false) {
						// line
						$line = PHP_EOL . 'define(\'DEDALO_INSTALL_STATUS\', \'installed\');';
						// Write the contents to the file,
						// using the FILE_APPEND flag to append the content to the end of the file
						// and the LOCK_EX flag to prevent anyone else writing to the file at the same time
						file_put_contents($file, $line, FILE_APPEND | LOCK_EX);
						debug_log(__METHOD__." Added config_auto line with constant: DEDALO_INSTALL_STATUS as 'installed' ".to_string(), logger::ERROR);
					}
					// overwrite status
					$dedalo_install_status = 'installed';
				}

				// set temporal constant value (until next load of 'config_auto.php')
				define('DEDALO_INSTALL_STATUS', $dedalo_install_status);
			}
		// to prevent malicious attacks stop execution some seconds when already installed
			if (DEDALO_INSTALL_STATUS==='installed') {
				sleep(5);
			}

	// db is already imported check 'matrix_users' table
		$db_tables		= backup::get_tables(); // returns array empty if not is imported
		$db_is_imported	= (bool)in_array('matrix_users', $db_tables);


	// html
		echo '<div class="install_wrapper">';
		include dirname(__FILE__) . '/html/install.phtml';
		echo '</div>';


