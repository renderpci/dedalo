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

				# TOOL CSS / JS MAIN FILES
				css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
				js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

				# Get all hierarchies with target section tipo info
				$ar_hierachies = area_thesaurus::get_all_hierarchy_sections();
				// Sort by term
				function cmp($a, $b) {
					return strcmp($a->{DEDALO_HIERARCHY_TERM_TIPO}, $b->{DEDALO_HIERARCHY_TERM_TIPO});
				}
				usort($ar_hierachies, "cmp");

				// debug
					#$ar_hierachies2 = array_filter($ar_hierachies, function($item){
					#	if ($item->hierarchy53==='ts1') {
					#		return $item;
					#	}
					#});
					#$ar_hierachies = array_values($ar_hierachies2);

				# First section. Select first hierarchy target section for draw initial data
				$first_hierarchy 	= reset($ar_hierachies);				
				$first_section_tipo = $first_hierarchy->{DEDALO_HIERARCHY_TARGET_SECTION_TIPO};	

				# ts_data . Build ts_data object with all section info 
				$ts_data = tool_ts_print::build_ts_data($first_section_tipo);
				
				# Ecode options JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES 
				#$ts_data_json = json_encode($ts_data, JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_TAG | JSON_HEX_AMP );
							
				break;		
	}#end switch modo
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}	
?>