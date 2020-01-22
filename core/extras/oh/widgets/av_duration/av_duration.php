<?php

















	TO DELETE !!! NOT USED

































	# CONTROLLER
	

		$widget_name 			= $this->widget_name;
		$modo 					= $this->component_info->get_modo();
		$parent 				= $this->component_info->get_parent();		
		$section_tipo 			= $this->component_info->get_section_tipo();
		$data_source 			= $this->data_source;
		$component_portal_tipo 	= key($data_source);
		$component_av_tipo 		= reset($data_source);
		$filename 				= $modo;


		switch ($modo) {

			case 'list':
				$filename = 'edit';
			case 'edit':				

				#
				# DATA_SOURCE
				# Format : 
				# stdClass Object
				# (
				#    [oh25] => rsc35
				# )
				#dump($data_source, ' data_source ++ '.to_string());
				
				if (isset($this->ar_locators)) {
					
					$ar_locators = $this->ar_locators;	// When we are in list, injected from portal data
				
				}else{

					#
					# COMPONENT PORTAL (calculate when in edit normally)				
					$component 	 = component_common::get_instance('component_portal',
																  $component_portal_tipo,
																  $parent,
																  'list',
																  DEDALO_DATA_NOLAN,
																  $section_tipo);
					$ar_locators = $component->get_dato();						
				}
				#dump($ar_locators, ' ar_locators ++ '.to_string());

				if (empty($ar_locators)) {
					return null;
				}

				require_once( DEDALO_CORE_PATH . '/media_engine/class.Ffmpeg.php');
				require_once( DEDALO_CORE_PATH . '/media_engine/class.OptimizeTC.php');

				$total_duration = 0;
				$ar_duration 	= array();
				$ar_resolved 	= array();
				$use_cache 		= true;
				
				foreach ($ar_locators as $current_locator) {


					$duration_secs = 0;
					
					
					$cache_key = $current_locator->section_tipo.'_'.$current_locator->section_id;
					if (in_array($cache_key, $ar_resolved)) {
						continue;
					}
					if ($use_cache && isset($_SESSION['dedalo']['config']['av_duration'][$cache_key])) {

						$duration_secs = $_SESSION['dedalo']['config']['av_duration'][$cache_key];						
						#debug_log(__METHOD__." GET DUTARION FROM SESSION $current_locator->section_id ".to_string($duration_secs), logger::DEBUG);

					}else{
						/* DEACTIVATED
						$modelo_name = RecordObj_dd::get_modelo_name_by_tipo(DEDALO_COMPONENT_RESOURCES_AV_DURATION_TIPO,true);
						$component 	 = component_common::get_instance($modelo_name,
																	  DEDALO_COMPONENT_RESOURCES_AV_DURATION_TIPO,
																	  $current_locator->section_id,
																	  'edit',
																	  DEDALO_DATA_NOLAN,
																	  $current_locator->section_tipo);

						$dato = $component->get_dato();
						*/
						if (!empty($dato)) {
							
							$duration_secs = $dato;
							if($use_cache) $_SESSION['dedalo']['config']['av_duration'][$cache_key] = $duration_secs;
							#debug_log(__METHOD__." GET DUTARION FROM DEDALO_COMPONENT_RESOURCES_AV_DURATION_TIPO $current_locator->section_id ".to_string($duration_secs), logger::DEBUG);
						
						}else{													

							$component_av = component_common::get_instance('component_av',
																		   $component_av_tipo,
																		   $current_locator->section_id,
																		   'list',
																		   DEDALO_DATA_NOLAN,
																		   $current_locator->section_tipo);					
							$video_path   = $component_av->get_video_path(DEDALO_AV_QUALITY_DEFAULT);
							if ( file_exists( $video_path) ) {

								$media_attributes = ffmpeg::get_media_attributes($video_path);
									#dump($media_attributes, ' media_attributes ++ '.to_string());							
								if (isset($media_attributes->format->duration)) {
									$duration_secs = $media_attributes->format->duration;

									if($use_cache) $_SESSION['dedalo']['config']['av_duration'][$cache_key] = $duration_secs;
								}							
							}//end if (file_exists
							#debug_log(__METHOD__." GET DUTARION FROM FILE MEDIA_ATTRIBUTES $current_locator->section_id ".to_string($duration_secs), logger::DEBUG);
						}//end if (empty($dato)) {
					}					
					
					$ar_duration[$current_locator->section_id] = $duration_secs;
					
					$total_duration += (int)$duration_secs;

					$ar_resolved[] = $cache_key;
				}
				$total_duration_tc = OptimizeTC::seg2tc($total_duration);
					#dump($ar_duration, ' ar_duration ++ '.to_string($total_duration_tc));

				$widget_base_url = $this->get_widget_base_url();
				css::$ar_url[] 	 = $widget_base_url ."/css/".$widget_name.".css";
				#js::$ar_url[]   = $widget_base_url ."/js/".$widget_name.".js";						

				break;				

			default:
				return "Sorry. Mode: $modo is not supported";
		}


		
		
		$page_html = dirname(__FILE__) . '/html/' . $widget_name . '_' . $filename . '.phtml';	
		if( !include($page_html) ) {
			echo "<div class=\"error\">Invalid widget mode $modo</div>";
		}

?>