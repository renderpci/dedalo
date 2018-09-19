<?php
	
	# CONTROLLER
	
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$dato_reference_lang 	= null;
	$traducible 			= $this->get_traducible();
	$label 					= $this->get_label();	
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= $this->get_component_permissions();
	$html_title				= "Info about $tipo";
	$lang					= $this->get_lang();
	$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$ejemplo 				= $this->get_ejemplo();
	$propiedades 			= $this->get_propiedades();
	$status 				= $this->get_status();	
		

	$file_name 				= $modo;
	$from_modo				= $modo;

	if($permissions===0) return null;
	
	switch($modo) {
		
		case 'edit' :
		case 'search' :
				#$valor = $this->get_valor();
				#dump($valor, ' valor'.to_string());
				# Verify component content record is inside section record filter
				if ($this->get_filter_authorized_record()===false) return NULL;

				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$dato_json 		= json_encode($this->dato);
				$component_info = $this->get_component_info('json');

				#get the change modo from portal list to edit
				$var_requested = common::get_request_var('from_modo');
				if (!empty($var_requested)) {
					$from_modo = $var_requested;
				}

				$ar_dato = $dato;
				$date_mode = $this->get_date_mode();

				//create the array varibles for the modo
				switch ($date_mode) {
					case 'range':
						$uid_start	= $uid_end	=	$input_name_start	=	$input_name_end	= array();
						$valor_start = array();
						$valor_end = array();
						break;
					case 'period':	
						$uid_year	= $uid_month	=	$uid_day	= array();
						$input_name_year	=	$input_name_month	=	$input_name_day	= array();
						$valor_year	= $valor_month = $valor_day = array();
					default:
						$uid_start	=	$input_name_start	= array();
						$valor_start = array();

						// PREVIOUS TO 4.9.1
						//$input_name = array();
						//$valor		= array();
						break;
				}
				$ar_dato = empty($dato) ? array("") : $dato;
				
				foreach ($ar_dato as $key => $current_dato) {
					switch ($date_mode) {
						case 'range':

							$uid_start[$key] 		  	= 'start_'.$key.'_'.$identificador_unico;
							$uid_end[$key]  		  	= 'end_'.$key.'_'.$identificador_unico;
							$input_name_start[$key] 	= 'start_'.$key.'_'."{$tipo}_{$parent}";
							$input_name_end[$key] 		= 'end_'.$key.'_'."{$tipo}_{$parent}";

							# Start
							if(isset($current_dato->start)) {
								$dd_date	= new dd_date($current_dato->start);
								$valor_start[$key]= isset($propiedades->method->get_valor_local) 
											? component_date::get_valor_local( $dd_date, reset($propiedades->method->get_valor_local) ) 
											: component_date::get_valor_local( $dd_date, false );
							}
												

							# End
							if(isset($current_dato->end)) {
								$dd_date	= new dd_date($current_dato->end);
								$valor_end[$key] 	= isset($propiedades->method->get_valor_local) 
											? component_date::get_valor_local( $dd_date, reset($propiedades->method->get_valor_local) ) 
											: component_date::get_valor_local( $dd_date, false );
							}
							break;
						case 'period':
							
							$placeholder_year 	= 'Y';//labeL::get_label('anyos');
							$placeholder_month 	= 'M';//labeL::get_label('meses');
							$placeholder_day 	= 'D';//labeL::get_label('dias');

							$uid_year[$key] 		  	= 'year_'.$key.'_'.$identificador_unico;
							$uid_month[$key]  		  	= 'month_'.$key.'_'.$identificador_unico;
							$uid_day[$key]  		  	= 'day_'.$key.'_'.$identificador_unico;

							$input_name_year[$key] 	= "year_".$key."_{$tipo}_{$parent}";
							$input_name_month[$key]	= "month_".$key."_{$tipo}_{$parent}";
							$input_name_day[$key]	= "day_".$key."_{$tipo}_{$parent}";

							
							if(!empty($current_dato->period)) {
								$dd_date = new dd_date($current_dato->period);
								# Year							
								$valor_year[$key] 	= isset($dd_date->year) ? $dd_date->year : '';

								# Month							
								$valor_month[$key] 	= isset($dd_date->month) ? $dd_date->month : '';							
								# Day							
								$valor_day[$key] 	= isset($dd_date->day) ? $dd_date->day : '';							
							}						
							break;
						case 'time':
							$input_name[$key] 	= $key."_{$tipo}_{$parent}";

							if(!empty($current_dato)) {
								$dd_date 	= new dd_date($current_dato);

								$separator_time = ':';
								$hour  	 = isset($dd_date->hour)	? sprintf("%02d", $dd_date->hour)   : '';
								$minute  = isset($dd_date->minute)	? $separator_time . sprintf("%02d", $dd_date->minute) : '';
								$second  = isset($dd_date->second)	? $separator_time . sprintf("%02d", $dd_date->second) : '';								

								$valor[$key] = $hour . $minute . $second;
							}
							break;
						case 'date':
						default:
							$uid_start[$key] 		  	= 'start_'.$key.'_'.$identificador_unico;
							$input_name_start[$key] 	= 'start_'.$key.'_'."{$tipo}_{$parent}";

							# Start
							if(isset($current_dato->start)) {
								$dd_date	= new dd_date($current_dato->start);
								$valor_start[$key]= isset($propiedades->method->get_valor_local) 
											? component_date::get_valor_local( $dd_date, reset($propiedades->method->get_valor_local) ) 
											: component_date::get_valor_local( $dd_date, false );
							}

							//REVIOUS TO 4.9.1
							/*
							$input_name[$key]	= $key."_{$tipo}_{$parent}";
							if(!empty($current_dato)) {								
								$dd_date 	= new dd_date($current_dato);

								if (isset($propiedades->method->get_valor_local)) {
									$valor[$key] = component_date::get_valor_local( $dd_date, reset($propiedades->method->get_valor_local) );
								}else{
									$valor[$key] = component_date::get_valor_local( $dd_date, false );
										#dump($valor[$key], '$valor[$key] ++ '.to_string());

								}
							}
							*/
							break;
					}

					#
					# DATAFRAME MANAGER	
					$ar_dataframe_obj = array();
					$ar_dataframe = isset($propiedades->dataframe) ? $propiedades->dataframe : false;
					if($ar_dataframe !==false){
						foreach ($ar_dataframe as $current_dataframe) {
							if ($current_dataframe->tipo!==false) {
								$dataframe_obj = new dataframe($current_dataframe->tipo, $current_dataframe->type, $this, 'dataframe_edit', $key);
								$ar_dataframe_obj[] = $dataframe_obj;
							}	
						}
					}					

				}//end foreach ($ar_dato as $key => $current_dato)

				$mandatory 		= (isset($propiedades->mandatory) && $propiedades->mandatory===true) ? true : false;
				$mandatory_json = json_encode($mandatory);

				if ($modo==="search") {
					$file_name = 'search';
					# dato is injected by trigger search wen is needed
					$dato = isset($this->dato) ? $this->dato : [''];
					$ar_comparison_operators 	= $this->build_search_comparison_operators();
					$ar_logical_operators 		= $this->build_search_logical_operators();
				}
				break;
		
		case 'portal_list'	:
				$file_name = 'list';

		case 'list_tm' :
				$file_name = 'list';

		case 'print':
		case 'list'	:

				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$dato_json 		= json_encode($this->dato);
				$component_info = $this->get_component_info('json');
				$ar_dato 		= $dato;
				$date_mode 		= $this->get_date_mode();
				
				switch ($date_mode) {
					case 'range':
						$valor_start = array();
						$valor_end = array();
						break;
					case 'period':	
						$valor_year	= $valor_month = $valor_day = array();
					default:
						$valor_start = array();
						//PRECIOUS 4.9.1
						//$valor	= array();
						break;
				}

				foreach ($ar_dato as $key => $current_dato) {
					switch ($date_mode) {
						case 'range':
							
							# Start
							if(isset($current_dato->start)) {
								$dd_date	= new dd_date($current_dato->start);
								$valor_start[]= isset($propiedades->method->get_valor_local) 
											? component_date::get_valor_local( $dd_date, reset($propiedades->method->get_valor_local) ) 
											: component_date::get_valor_local( $dd_date, false );
							}				

							# End
							if(isset($current_dato->end)) {
								$dd_date	= new dd_date($current_dato->end);
								$valor_end[] 	= isset($propiedades->method->get_valor_local) 
											? component_date::get_valor_local( $dd_date, reset($propiedades->method->get_valor_local) ) 
											: component_date::get_valor_local( $dd_date, false );
							}
							break;
						case 'period':
							if(!empty($current_dato->period)) {
								$dd_date = new dd_date($current_dato->period);
								# Year
								$valor_year[]	= isset($dd_date->year) ? $dd_date->year : '';
								# Month
								$valor_month[]	= isset($dd_date->month) ? $dd_date->month : '';
								# Day
								$valor_day[]	= isset($dd_date->day) ? $dd_date->day : '';
							}
							break;
						case 'date':
						default:

							# Start
							if(isset($current_dato->start)) {
								$dd_date	= new dd_date($current_dato->start);
								$valor_start[]= isset($propiedades->method->get_valor_local) 
											? component_date::get_valor_local( $dd_date, reset($propiedades->method->get_valor_local) ) 
											: component_date::get_valor_local( $dd_date, false );
							}

							//PREVIUOS 4.9.1
							/*
							if(!empty($current_dato)) {
								$dd_date 	= new dd_date($current_dato);

								if (isset($propiedades->method->get_valor_local)) {
									$valor[]	= component_date::get_valor_local( $dd_date, reset($propiedades->method->get_valor_local) );
								}else{
									$valor[]	= component_date::get_valor_local( $dd_date, false );
								}
							}
							*/
							break;
					}
				}

				switch ($date_mode) {
					case 'range':
						$valor_start	= implode(' | ', $valor_start);
						$valor_end		= implode(' | ', $valor_end);
						break;
					case 'period':	
						$valor_year		= implode(' | ', $valor_year);
						$valor_month	= implode(' | ', $valor_month);
						$valor_day		= implode(' | ', $valor_day);
					default:
						$valor_start	= implode(' | ', $valor_start);
						//PREVIUOS 4.9.1
						//$valor			= implode(' | ', $valor);
						break;
				}
				break;

		case 'tool_time_machine' :
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";	
				# Force file_name
				$file_name  = 'edit';
				break;
				
		case 'search__DES':
				# dato is injected by trigger search wen is needed
				$dato = isset($this->dato) ? $this->dato : [''];

				$date_mode = $this->get_date_mode();
				
				$ar_comparison_operators 	= $this->build_search_comparison_operators();
				$ar_logical_operators 		= $this->build_search_logical_operators();

				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();
				break;					
	}
	
	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>