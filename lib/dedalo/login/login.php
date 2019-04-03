<?php
	
	// controller vars
		$id						= NULL;
		$modo					= $this->get_modo();
		$tipo 					= $this->get_tipo();	
		$ar_tools_obj			= false;					
		$tipo_active_account	= $this->tipo_active_account;
		$tipo_button_login 		= $this->tipo_button_login;
		$component_name			= get_class($this);
		$file_name				= $modo;

	
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
