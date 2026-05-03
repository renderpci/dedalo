<?php
/** @var button_delete $this */
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$section_tipo 			= $this->get_section_tipo();
	$target_tipo			= $this->get_target();
	$id 					= $this->get_target();
	$mode					= $this->get_mode();
	$label 					= $this->get_label();
	$properties 			= $this->get_properties();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($section_tipo, $tipo);
	$html_title				= "Info about $tipo";

	$file_name 				= $mode;

	
	switch($mode) {
		
		case 'edit':
					break;
						
		case 'tool_portal':
					$file_name  = 'edit';
					break;
						
		case 'relation':$file_name  = 'edit';
					break;

		case 'tool_time_machine':
					$file_name  = 'edit';
					break;

		case 'selected_fragment':
					$file_name  = 'edit';
					break;

		case 'list':
					break;
						
		case 'list_of_values':
					break;
	}
	
		
	// SEC-054: refuse any $file_name that is not one of the modes the
	// switch above is allowed to set. `$mode` comes from the client via
	// `source.mode` and would otherwise be concatenated into the include
	// path, letting an attacker reach any `.phtml` under DEDALO_CORE_PATH
	// via traversal (e.g. `../../other_class/html/other_class_evil`).
	$allowed_modes = ['edit','list','list_of_values'];
	if (!in_array($file_name, $allowed_modes, true)) {
		debug_log(__METHOD__
			. ' SEC-054 refused button_delete mode: ' . to_string($mode)
			, logger::ERROR
		);
		echo "<div class=\"error\">Invalid mode</div>";
		return;
	}
	$page_html	= DEDALO_CORE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	// Realpath confinement against the class directory. Even with the
	// allowlist above, this catches any future misuse (symlinks, new
	// modes added without updating the list).
	$class_dir = realpath(DEDALO_CORE_PATH .'/'. get_class($this));
	$real_page = realpath($page_html);
	if ($class_dir === false || $real_page === false
		|| strncmp($real_page, $class_dir . DIRECTORY_SEPARATOR, strlen($class_dir) + 1) !== 0) {
		echo "<div class=\"error\">Invalid mode $this->mode</div>";
		return;
	}
	if( !include($real_page) ) {
		echo "<div class=\"error\">Invalid mode $this->mode</div>";
	}
?>