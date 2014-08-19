<?php
	
	# CONTROLLER

	
	# AR_SECTION_TOP_TIPO : ARRAY FORMATED
	#$ar_section_top_tipo 	= $this->get_ar_section_top_tipo();

	#$ar_top_tipo 			= array( $this->caller_section_tipo => null);
	#$ar_diffusion_map 		= $this->get_ar_diffusion_map( $ar_top_tipo  );
		#dump($ar_diffusion_map,'$ar_diffusion_map - '.$this->caller_section_tipo);

	

	#$matrix_stats_id = $this->set_matrix_stats();
	#	dump($matrix_stats_id,'$matrix_stats_id');
	#die();

	
	#
	# SHOW GRAPHIC CHARTS
	$caller_section_tipo 	= $this->caller_section_tipo;
	$matrix_stats 			= $this->get_matrix_stats( $caller_section_tipo, $this->fecha );
		#dump($matrix_stats,'$matrix_stats');

	$matrix_stats_json 		= json_encode($matrix_stats);
		#dump($matrix_stats_json,'$matrix_stats_json');

	if($matrix_stats_json=='null') {
		
		echo "<mark>No activity data exists for this section in this date: $this->fecha</mark>";
		echo "<div onclick=\"diffusion_section_stats.hide_stats_content(this)\">Close</div>";
		return false;
	}
	

	$file_name	= 'graphics';
	/*
	switch($modo) {
		
		case 'show_stats'	:
						
						break;

		case 'build_stats' :
						
						break;		
	}
	*/


	

	




	# HTML	
	$page_html	= DEDALO_LIB_BASE_PATH .'/diffusion/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	include($page_html);	
?>