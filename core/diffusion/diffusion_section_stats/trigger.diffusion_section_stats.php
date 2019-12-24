<?php
require_once( DEDALO_CONFIG_PATH.'/config.php');


#if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','launcher','date');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* SAVE_STATS_DATA
* @param $mode : mandatory
* @param $launcher : mandatory
* @param $date : Optional
* Puede ser lanzado por cron (launcher=dedalo_cron) o por el button_stats 'Generate' (launcher=dedalo_generate) en los listados (sólo global admin) 
*/
if($mode=='save_stats_data') {

	# DATA VERIFY
	if($launcher != 'dedalo_cron' && $launcher != 'dedalo_generate') exit("Trigger Error: launcher '$launcher' unauthorized!");

	# Verificamos el formato de fecha
	$custom_activity_date = false;
	if(!empty($date)) {
		preg_match("/\d{4}-\d{2}-\d{2}/", $date, $output_array);
		if (empty($output_array[0])) {
			throw new Exception("Error Processing Request. Wrong date format. Use YYY-MM-DD", 1);					
		}
		$custom_activity_date = $date;
	}
	
	# Maximum execution time
	set_time_limit(600);
	

	# DIFFUSION_SECTION_STATS
	$diffusion_section_stats 	= new diffusion_section_stats(null);

	# Return new created section id
	$result 					= $diffusion_section_stats->set_matrix_stats($custom_activity_date);


		# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
		logger::$obj['activity']->log_message(
			'STATS',
			logger::INFO,
			DEDALO_DIFFUSION_TIPO,
			NULL,
			array(	"msg"		=> "launched save_stats_data from dedalo_cron",
					"id" 		=> $result						
				)
		);
		
		
		if (SHOW_DEBUG===true) {		
			$date = component_date::get_timestamp_now_for_db();
			error_log("-> launched save_stats_data from dedalo_cron $date");
		}


	exit($result);

}#end save_stats_data






?>