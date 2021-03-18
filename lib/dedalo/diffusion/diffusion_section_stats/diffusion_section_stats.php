<?php
	
	# CONTROLLER
	
	#
	# SHOW GRAPHIC CHARTS
	$caller_section_tipo = $this->caller_section_tipo;

	$options = new stdClass();
		$options->section_tipo = $caller_section_tipo;

	if ($caller_section_tipo===DEDALO_ACTIVITY_SECTION_TIPO) {
		
		// data
			$date_in	= '2000-01-01';
			$today		= new DateTime();
			$date_out	= $today->format("Y-m-d");
			$user_id	= null;
			$lang		= DEDALO_DATA_LANG;
			$totals		= diffusion_section_stats::cross_users_range_data($date_in, $date_out, $user_id, $lang);
		
		if (!$totals || !is_object($totals)) {
			debug_log(__METHOD__." UNABLE TO GET CROSS_USERS_RANGE_DATA FOR USER $user_id - totals: ".to_string($totals), logger::ERROR);
			echo 'No user activity data is available.';
			return null;
		}	

		// parse_totals_for_js
			$ar_js_obj = diffusion_section_stats::parse_totals_for_js($totals);
	
	}else{
		$ar_js_obj = $this->get_stats($options);
	}

	if(empty($ar_js_obj)) {
		echo "<mark>No activity data exists for this section in this date: $this->fecha</mark>";
		echo "<div class=\"stats_close_button\" onclick=\"$('.css_button_stats:first').trigger('click');\">Close</div>";
		return false;
	}

	// html
	$file_name	= 'graphics';
	$page_html	= DEDALO_LIB_BASE_PATH .'/diffusion/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	include($page_html);


