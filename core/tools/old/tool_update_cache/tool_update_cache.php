<?php

	# CONTROLLER
	$tool_name 	  = get_class($this);
	$button_title = label::get_label('tool_update_cache');

	# TOOL CSS / JS MAIN FILES
	css::$ar_url[] = DEDALO_CORE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_CORE_URL."/tools/".$tool_name."/js/".$tool_name.".js";



	if(!SHOW_DEBUG) {
		return ;
	}
	

	switch ($this->modo) {
		case 'button':
			# Continue
			break;
		
		default:
			return null;
			break;
	}

	$page_html = DEDALO_CORE_PATH . '/tools/' . get_class($this) . '/html/' . get_class($this) . '_' . $this->modo . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>