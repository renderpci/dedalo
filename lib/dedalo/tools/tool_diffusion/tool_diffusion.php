<?php

	# CONTROLLER
	$tool_name = get_class($this);

	# TOOL CSS / JS MAIN FILES
	#css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";
	
	
	switch ($this->modo) {
		case 'button':
			# Show tool button
			$options = new stdClass();
				$options->section_tipo  = $this->section_tipo;
				$options->mode 			='export_list';
			$options_json = json_encode($options);
			break;
		case 'button_inspector';
			# Show tool button
			$options = new stdClass();
				$options->section_tipo  = $this->section_tipo;
				$options->mode 			='export_record';
			$options_json = json_encode($options);
			break;
		case 'button_thesaurus';
			# Show tool button
			$options = new stdClass();
				$options->section_tipo  = $this->section_tipo;
				$options->mode 			='export_thesaurus';
			$options_json = json_encode($options);
			# ar_thesaurus_tables
			$ar_thesaurus_tables = (array)$this->get_ar_thesaurus_tables();			
			break;
		case 'list':
			# All list records selected

			break;
		case 'edit':
			# Current section only

			break;
		default:
			return null;
			break;
	}

	$page_html = DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this) . '/html/' . get_class($this) . '_' . $this->modo . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>