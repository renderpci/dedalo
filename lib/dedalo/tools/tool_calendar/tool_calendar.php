<?php


	# CONTROLLER TOOL

	$section_obj 		= $this->section_obj; 
	$tipo 				= $section_obj->get_tipo();
	$modo 				= $this->get_modo();
	$tool_name 			= get_class($this);
	//$context_name		= $_REQUEST['context_name'];
	$context_name 		= common::get_request_var('context_name');
	$section_name 		= RecordObj_dd::get_termino_by_tipo($tipo,DEDALO_DATA_LANG,true);
	

	$lang_tld2 	= tools::convert_d4_to_d3_lang(DEDALO_DATA_LANG);
	$button 	= $section_obj->get_button('button_import');
	#dump($button->propiedades," button");


	# Fix tool general vars
	$ar_tool_data = array();
	$ar_tool_data['tipo'] = $tipo;
	foreach ($button->propiedades as $key => $value) { 
	$ar_tool_data[$key] = $value;
	}
	#dump($ar_tool_data,"ar_tool_data ");

	if (isset($ar_tool_data['backgound_events_tipo'])) {
		# Calculate button
		$backgound_events_section = section::get_instance(null,$ar_tool_data['backgound_events_tipo']);
		$backgound_events_button  = $backgound_events_section->get_button('button_import');
		foreach ($backgound_events_button->propiedades->event as $key => $value) {

			$ar_tool_data['backgound_event_'.$key] = $value;
			
		}
	}
	//dump($ar_tool_data," ar_tool_data");

	# STORE CURRENT ar_tool_data
	$_SESSION['dedalo4'][$tool_name][$tipo] = $ar_tool_data;


	$file_name	= $modo;

	# TOOL CSS / JS MAIN FILES
	#css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	#js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";
	

	switch($modo) {

		case 'page': # Default called from main page.
				
				#
				# CSS includes
					css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/fullcalendar/fullcalendar.min.css';					

					#css::$ar_url[] = DEDALO_LIB_BASE_URL.'/inspector/css/inspector.css';
					#css::$ar_url[] = DEDALO_LIB_BASE_URL.'/section/css/section.css';
					#css::$ar_url[] = DEDALO_LIB_BASE_URL.'/section_group/css/section_group.css';
					#css::$ar_url[] = DEDALO_LIB_BASE_URL.'/tools/tool_common/css/tool_common.css';	
					css::$ar_url[] = DEDALO_LIB_BASE_URL.'/tools/'.$tool_name.'/css/'.$tool_name.'.css';				
					
					# HOOK CUSTOM TOOL AFTER IF EXISTS
					if( isset($ar_tool_data['custom_script']) ) {
						$custom_script = $ar_tool_data['custom_script'] .'/css/'. pathinfo($ar_tool_data['custom_script'])['basename'] .'.css';
						if ( file_exists(DEDALO_LIB_BASE_PATH . $custom_script) ) {
							css::$ar_url[] = DEDALO_LIB_BASE_URL . $custom_script;
						}
					}

				#
				# JS includes
					js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/fullcalendar/lib/moment.min.js';
					js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/fullcalendar/fullcalendar.min.js';
					js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/fullcalendar/lang-all.js';

					#js::$ar_url[] = DEDALO_LIB_BASE_URL.'/tools/tool_common/js/tool_common.js';
					js::$ar_url[] = DEDALO_LIB_BASE_URL.'/tools/'.$tool_name.'/js/'.$tool_name.'.js';
					
					# HOOK CUSTOM TOOL AFTER IF EXISTS
					if( isset($ar_tool_data['custom_script']) ) {
						$custom_script = $ar_tool_data['custom_script'] .'/js/'. pathinfo($ar_tool_data['custom_script'])['basename'] .'.js';
						if ( file_exists(DEDALO_LIB_BASE_PATH . $custom_script) ) {
							js::$ar_url[] = DEDALO_LIB_BASE_URL . $custom_script;	
						}
					}
					

				#
				# PAGE
				#ob_start();
				#include ( DEDALO_LIB_BASE_PATH .'/tools/'.get_called_class().'/html/tool_calendar_page.php' );
				#$html_upload = ob_get_clean();

				break;
		
	}#end switch modo

	

	# HOOK CUSTOM TOOL AFTER IF EXISTS
	if( isset($ar_tool_data['custom_script']) ) {
		$custom_script = $ar_tool_data['custom_script'] .'/html/'. pathinfo($ar_tool_data['custom_script'])['basename'] .'_'.$file_name.'.phtml';
		if ( file_exists(DEDALO_LIB_BASE_PATH . $custom_script) ) {			
			ob_start();
			include (DEDALO_LIB_BASE_PATH . $custom_script);
			$custom_script_html = ob_get_clean();
		}
	}

	# INCLUDE FILE HTML
	$page_html	= dirname(__FILE__) .  '/html/' . get_class($this) . '_' . $file_name .'.phtml'; 
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>