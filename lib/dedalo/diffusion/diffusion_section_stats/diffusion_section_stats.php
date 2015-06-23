<?php
	
	# CONTROLLER
	
	#
	# SHOW GRAPHIC CHARTS
	$caller_section_tipo 	= $this->caller_section_tipo;

	$options = new stdClass();
		$options->section_tipo  = $this->caller_section_tipo;	

	$ar_js_obj = $this->get_stats($options);
		#dump($ar_js_obj,"ar_js_obj");#die();
	

	if(empty($ar_js_obj)) {
		
		echo "<mark>No activity data exists for this section in this date: $this->fecha</mark>";
		echo "<div onclick=\"diffusion_section_stats.hide_stats_content(this)\">Close</div>";
		return false;
	}

	#$ar_stats_json 		= json_encode($ar_stats);
		#dump($matrix_stats_json,'$matrix_stats_json');#die();
	

	$file_name	= 'graphics';


	# HTML	
	$page_html	= DEDALO_LIB_BASE_PATH .'/diffusion/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	include($page_html);	
?>