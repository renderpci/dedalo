<?php

	# CONTROLLER TOOL

	$tool_name 				= get_class($this);
	$modo 					= $this->get_modo();
	$file_name 				= $modo;

	$is_authorized_tool_for_logged_user = component_security_tools::is_authorized_tool_for_logged_user($tool_name);
		#dump($is_authorized_tool_for_logged_user, ' is_authorized_tool_for_logged_user ++ '.to_string($tool_name));

	if (!$is_authorized_tool_for_logged_user) {
		return;
	}



	switch($modo) {

		case 'button':

				break;

		case 'page':

				// tool css / js main files
					css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
					js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";
					# Aditional css / js
					css::$ar_url[] = DEDALO_ROOT_WEB."/lib/jsoneditor/jsoneditor.min.css";
					js::$ar_url[]  = DEDALO_ROOT_WEB."/lib/jsoneditor/jsoneditor.min.js";

				// css includes
					#css::$ar_url[] = BOOTSTRAP_CSS_URL;
					#js::$ar_url[]  = BOOTSTRAP_JS_URL;
					array_unshift(css::$ar_url_basic, BOOTSTRAP_CSS_URL);

				$current_dedalo_version = $this->get_dedalo_version();
				$current_dedalo_version = implode(".", $current_dedalo_version);

				$current_version_in_db = get_current_version_in_db();
				$current_version_in_db = implode(".", $current_version_in_db);

				$update_version = $this->get_update_version();
				if(!empty($update_version)) {
					$update_version = implode(".", $update_version);
				}

				if(SHOW_DEBUG===true) {
					#require(dirname(__FILE__) . '/upgrades/class.dato_v4_to_section_data_v5.php');
					#$old_dato = json_decode('{"label":"Modelos de placas","relations":[{"type":"dd151","section_id":"-1","section_tipo":"dd128","from_component_tipo":"dd200"},{"type":"dd675","section_id":"1","section_tipo":"dd153","from_component_tipo":"mdcat894"},{"type":"dd151","section_id":"-1","section_tipo":"dd128","from_component_tipo":"dd197"}],"components":{"dd199":{"dato":{"lg-nolan":[{"start":{"day":25,"hour":20,"time":64905134514,"year":2019,"month":5,"minute":1,"second":54}}]},"info":{"label":"Fecha de creación","modelo":"component_date"},"valor":{"lg-nolan":[{"start":{"day":25,"hour":20,"time":64905134514,"year":2019,"month":5,"minute":1,"second":54}}]},"dataframe":[],"valor_list":{"lg-nolan":"2019-05-25"}},"dd201":{"dato":{"lg-nolan":[{"start":{"day":25,"hour":20,"time":64905136841,"year":2019,"month":5,"minute":40,"second":41}}]},"info":{"label":"Fecha de modificación","modelo":"component_date"},"valor":{"lg-nolan":[{"start":{"day":25,"hour":20,"time":64905136841,"year":2019,"month":5,"minute":40,"second":41}}]},"dataframe":[],"valor_list":{"lg-nolan":"2019-05-25"}},"mdcat893":{"dato":{"lg-eng":["placa"]},"info":{"label":"Modelo de placa","modelo":"component_input_text"},"valor":{"lg-eng":"placa"},"dataframe":[],"valor_list":{"lg-eng":"placa"}},"mdcat899":{"dato":{"lg-eng":"transcription 1111"},"info":{"label":"Transcripción","modelo":"component_text_area"},"valor":{"lg-eng":"transcription 1111"},"dataframe":[],"valor_list":{"lg-eng":{"0":"transcription 1111"}}},"mdcat1143":{"dato":{"lg-nolan":[{"end":{"day":15,"time":64904198400,"year":2019,"month":5},"start":{"day":1,"time":64902988800,"year":2019,"month":5}}]},"info":{"label":"Cronología","modelo":"component_date"},"valor":{"lg-nolan":[{"end":{"day":15,"time":64904198400,"year":2019,"month":5},"start":{"day":1,"time":64902988800,"year":2019,"month":5}}]},"dataframe":[],"valor_list":{"lg-nolan":"2019-05-01 <> 2019-05-15"}}},"section_id":1,"created_date":"2019-05-25 20:01:54","section_tipo":"mdcat890","modified_date":"2019-05-25 20:40:41","diffusion_info":null,"created_by_userID":-1,"section_real_tipo":"mdcat890","modified_by_userID":-1,"section_creator_top_tipo":"mdcat890","section_creator_portal_tipo":"","section_creator_portal_section_tipo":""}');
					#$new_dato = dato_v4_to_section_data_v5::convert_section_dato_to_data( $old_dato );
					#	dump($new_dato, ' new_dato ++ '.to_string());
					#	$convert = dato_v4_to_section_data_v5::convert_table_data(['matrix']);
				}

				#session_write_close();
				break;

	}#end switch



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}


