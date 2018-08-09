<?php

	# CONTROLLER	

		$widget_name 				 	= $this->widget_name;
		$modo 						 	= $this->component_info->get_modo();
		$parent 					 	= $this->component_info->get_parent();		
		$section_tipo 				 	= $this->component_info->get_section_tipo();
		$data_source 				 	= $this->data_source;
		$current_section_tipo  			= key($data_source);
		$current_component_tipo 		= key(reset($data_source));
		$portal_target_section_tipo 	= key($data_source->$current_section_tipo->$current_component_tipo);
		#$portal_target_component_tipo 	= $data_source->$current_section_tipo->$current_component_tipo->$portal_target_section_tipo;
		$date_in_component_tipo 		= $data_source->$current_section_tipo->$current_component_tipo->$portal_target_section_tipo->date_in;
		$date_out_component_tipo 		= $data_source->$current_section_tipo->$current_component_tipo->$portal_target_section_tipo->date_out;
		$filename 					 	= $modo;

		$lang = isset($lang) ? $lang : DEDALO_DATA_LANG;

		if (!function_exists('sum_intervals')) {


			/** sum_intervals */
			function sum_intervals($ar_interval) {
				$e = new DateTime('00:00');
				$f = clone $e;
				
				foreach ($ar_interval as $key => $interval) {
					$e->add($interval);
				}	
				$sum_intervals = $f->diff($e);
				
				return $sum_intervals;			
			}//end sum_intervals


			function is_last_date($ar_dates_all, $offset_key){
				foreach ($ar_dates_all as $key => $current_date) {
					if ($key<=$offset_key) continue; // Ignore previous
					if (!empty($current_date->year)) {
						return false;
					}
				}

				return true;
			}//end is_last_date


			function date_interval($date_in, $date_out) {
				if(get_class($date_in)=='DateTime') {
					$date1 = $date_in;
				}else{
					$dd_date = new dd_date($date_in);
					$timestamp_in = $dd_date->get_dd_timestamp("Y-m-d");
					$date1 = new DateTime($timestamp_in);
				}
		
				if(get_class($date_out)=='DateTime') {
					$date2 = $date_out;
				}else{
					$dd_date = new dd_date($date_out);
					$timestamp_out = $dd_date->get_dd_timestamp("Y-m-d");
					$date2 = new DateTime($timestamp_out);
				}				

				$interval = $date1->diff($date2);
				#dump($interval, ' var ++ '.to_string($date1).to_string($date2));

				if ($interval->h >0) {
					$ar_interval[] = $interval;
					$ar_interval[] = date_interval_create_from_date_string("1 day");
					#$add = $interval->add( date_interval_create_from_date_string("1 day") );
						#dump($add, ' add ++ '.to_string());
					$interval = sum_intervals($ar_interval);
				}

				return $interval;
			}//end date_interval


			function custom_date_add_sub($date_in, $interval, $type) {
				$dd_date = new dd_date($date_in);
				$timestamp_in = $dd_date->get_dd_timestamp("Y-m-d");
				$date1 = new DateTime($timestamp_in);

				$interval_time = date_interval_create_from_date_string($interval); // ref'10 days'			
				
				$add = $date1->{$type}($interval_time);

				return $add;
			}//end custom_date_add_sub


			function is_out($key) {
				if ($key % 2 == 0) return false;
				return true;
			}//end is_out
		}//end if (!function_exists('sum_intervals'))



		switch ($modo) {

			case 'list':
				$filename = 'edit';
			case 'edit':

				$widget_base_url = $this->get_widget_base_url();
				css::$ar_url[] 	 = $widget_base_url ."/css/".$widget_name.".css";

				if($modo==='edit') {
					js::$ar_url[]    = $widget_base_url ."/js/".$widget_name.".js";	
				}

				#
				# PORTAL ROWS
				$component_target_tipo = $current_component_tipo;
						#dump($component_target_tipo, ' $component_target_tipo ++ '.to_string());		

					$modelo_name 	  = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true); // Expected portal
					$component_portal = component_common::get_instance($modelo_name,
																	   $current_component_tipo,
																	   $parent,
																	   $modo,
																	   DEDALO_DATA_NOLAN,
																	   $current_section_tipo);
					$dato = $component_portal->get_dato();
					# dump($dato, ' dato ++ '.to_string());
					if (empty($dato)) {
						return 'Empty portal data';
					}

			
				# MODO CALCULANDO PRIMER Y ÚLTIMO LOCATOR
				#
				# FIRST_LOCATOR
				$first_locator = reset($dato);

					$locator_section_tipo = $first_locator->section_tipo;
					$locator_section_id   = $first_locator->section_id;

					$modelo_name 	  = RecordObj_dd::get_modelo_name_by_tipo($date_in_component_tipo,true); // Expected component date
					$component_date_in= component_common::get_instance($modelo_name,
																	   $date_in_component_tipo,
																	   $locator_section_id,
																	   $modo,
																	   DEDALO_DATA_NOLAN,
																	   $locator_section_tipo);
					$date_in = (array)$component_date_in->get_dato();
						#dump($date_in, ' date_in ++ in 1 - '.$date_in_component_tipo.' - '.to_string($locator_section_id));
					$date_in = reset($date_in); # Now date is an array
					if(!empty($date_in)) {
						$dd_date = new dd_date($date_in);
						$timestamp_in = $dd_date->get_dd_timestamp("Y-m-d");
					}else{
						$timestamp_in = "0000-00-00";
					}

				#
				# LAST_LOCATOR
				$last_locator  = end($dato);

					$locator_section_tipo = $last_locator->section_tipo;
					$locator_section_id   = $last_locator->section_id;

					$modelo_name 	    = RecordObj_dd::get_modelo_name_by_tipo($date_out_component_tipo,true); // Expected component date
					$component_date_out = component_common::get_instance($modelo_name,
																	     $date_out_component_tipo,
																	     $locator_section_id,
																	     $modo,
																	     DEDALO_DATA_NOLAN,
																	     $locator_section_tipo);
					$date_out = (array)$component_date_out->get_dato();
						#dump($date_out, ' date_out ++ out 2- '.$date_out_component_tipo.' - '.to_string($locator_section_id));
					$date_out = reset($date_out); # Now date is an array
					if (!empty($date_out)) {
						$dd_date = new dd_date($date_out);
						$timestamp_out = $dd_date->get_dd_timestamp("Y-m-d");
							#dump($timestamp_out, ' $timestamp_out ++ '.to_string());
					}else{
						$timestamp_out = "0000-00-00";
					}
					
				
				# MODO CALCULANDO PRIMERO Y ÚLTIMO
				/*	
				# Total				
				$date1 = new DateTime($timestamp_in);
				$date2 = new DateTime($timestamp_out);
				$interval = $date1->diff($date2);
				*/
				
	
				# MODO CALCULANDO TODOS LOS LOCATORS
				$total_seconds = 0;
				$ar_dates_in=array();
				$ar_dates_out=array();
				$ar_dates_all=array();
				foreach ((array)$dato as $key => $current_locator) {

					$locator_section_tipo = $current_locator->section_tipo;
					$locator_section_id   = $current_locator->section_id;

					# Date in
					$modelo_name 	  = RecordObj_dd::get_modelo_name_by_tipo($date_in_component_tipo,true); // Expected component date
					$component_date_in= component_common::get_instance($modelo_name,
																	   $date_in_component_tipo,
																	   $locator_section_id,
																	   $modo,
																	   DEDALO_DATA_NOLAN,
																	   $locator_section_tipo);
					$date_in = (array)$component_date_in->get_dato();	
					$date_in = reset($date_in);					

					$ar_dates_in[] = $date_in;
					$ar_dates_all[]= $date_in;

					# Date out
					$modelo_name 	   = RecordObj_dd::get_modelo_name_by_tipo($date_out_component_tipo,true); // Expected component date
					$component_date_out= component_common::get_instance($modelo_name,
																	   $date_out_component_tipo,
																	   $locator_section_id,
																	   $modo,
																	   DEDALO_DATA_NOLAN,
																	   $locator_section_tipo);
					$date_out = (array)$component_date_out->get_dato();
					$date_out = reset($date_out);
						#dump($date_out, ' date_out ++ '.to_string());
					#if (empty($date_out)) continue; // Skip empty dates

					$ar_dates_out[] = $date_out;
					$ar_dates_all[] = $date_out;
				}
				#dump($ar_dates_in, ' ar_dates_in ++ '.to_string());
				#dump($ar_dates_out, ' ar_dates_out ++ '.to_string());
				#dump($ar_dates_all, ' ar_dates_all ++ '.to_string());

				# INTERVALS . iterate loCators and calculate intervals of time
				$ar_interval=array();
				$key_jump=0;
				$default_interval="1 day"; // used to add to the first or last row with incomplete data
				$estitmated_time_add=array(); // used to notify to user added periods when do
				$estitmated_time_undefined=false; // used to notify user added intermediate times calculated
				foreach ($ar_dates_in as $key => $date_in) {

					if ($key<$key_jump) {
						continue; // skip empty or already calculated dates
					}
					
					$date_out = $ar_dates_out[$key];

					switch (true) {

						case ( !empty($date_in->year) && !empty($date_out->year) ):
							$interval = date_interval($date_in, $date_out);							
							break;

						case ( empty($date_in->year) && empty($date_out->year) ):
							// Nothing to do
							$interval = null;
							break;		

						case ( empty($date_in->year) && !empty($date_out->year) ):
							$date_in_default  = custom_date_add_sub($date_out, $default_interval, 'sub');
							$interval 		  = date_interval($date_in_default, $date_out);
							$estitmated_time_add[] = $interval;
							break;										
						
						case ( !empty($date_in->year) && empty($date_out->year) ):

							if (is_last_date($ar_dates_all, $key*2)===true || !empty($ar_dates_all[($key*2)+2]->year)) {
								$date_out_default = custom_date_add_sub($date_in, $default_interval, 'add');
								$interval 		  = date_interval($date_in, $date_out_default);
								$estitmated_time_add[] = $interval;
							}else{
								$estitmated_time_undefined=true;
								foreach ($ar_dates_all as $key2 => $current_date_all) {
									if( $key2 <= $key*2 ) continue; // ignore previous keys					
									if(!empty($current_date_all->year)) {
										$interval = date_interval($date_in, $current_date_all);									
										$key_jump = (int)floor($key2/2);
										if (is_out($key2)) {
											$key_jump++;
										}
										break;
									}
								}//end foreach ($ar_dates_all as $key2 => $current_date_all)								
							}							
							break;
					}

					if (!is_null($interval )) {
						$ar_interval[] = $interval;
					}					
				}//end foreach ($ar_dates_in as $key => $value)
				#dump($ar_interval, ' $ar_interval full ++ '.to_string());

				// Intervals summatory
				$sum_intervals = sum_intervals($ar_interval);
					#dump($sum_intervals, ' $sum_intervals ++ '.to_string());
				
				// Estimated time add total
				$sum_estitmated_time_add = sum_intervals($estitmated_time_add);
					#dump($sum_estitmated_time_add, ' $sum_estitmated_time_add ++ '.count($estitmated_time_add));

				#dump($total_seconds, ' $total_seconds ++ '.to_string());
				/*
				$period = dd_date::convert_seconds_to_period($total_seconds);
				if (empty($period->result)) {
					return 'Impossible calculate period';
				}else{
					$period = (object)$period->result;
				}
				#dump($period, ' period ++ '.to_string());
				*/					
				break;				

			default:
				return "Sorry. Mode: $modo is not supported";
		}//end switch ($modo)


		
				
	
		
	$page_html = dirname(__FILE__) . '/html/' . $widget_name . '_' . $filename . '.phtml';	
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid widget mode $modo</div>";
	}

?>