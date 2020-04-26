<?php

	# CONTROLLER TOOL TIME MACHINE

	$id 					= $this->source_component->get_id();
	$tipo 					= $this->source_component->get_tipo();
	$parent 				= $this->source_component->get_parent();
	$section_tipo			= $this->source_component->get_section_tipo();
	$lang 					= $this->source_component->get_lang();
	if (!empty($_REQUEST['lang'])) {
	$lang 					= safe_lang($_REQUEST['lang']);
	}
	$lang_name 				= lang::get_name_from_code( $lang, 'lg-eng' );
	$label 					= $this->source_component->get_label();
	$traducible 			= $this->source_component->get_traducible();
	$component_name			= get_class($this->component_obj);
	$tool_name 				= get_class($this);

	# SOURCE COMPONENT
	$source_component 		= $this->source_component;	
	$modo 					= $this->get_modo();
	

	switch($modo) {

		# ROWS . Records of current componet existing in 'matrix_time_machine'
		case 'rows':

			$limit  = isset($this->limit) ? $this->limit   : 100;
			$offset = isset($this->offset) ? $this->offset : 0;
			
			# ROWS ARRAY 
			$ar_component_time_machine	= tool_time_machine::get_ar_component_time_machine($tipo, $parent, $lang, $section_tipo, $limit, $offset);

			$ar_rows_obj = [];
			foreach((array)$ar_component_time_machine as $tm_obj) {
				
				$date					= component_date::timestamp_to_date($tm_obj->get_timestamp(), $seconds=true);
				$userID					= $tm_obj->get_userID();
				$mod_user_name			= section::get_user_name_by_userID($userID);
				$id_time_machine		= $tm_obj->get_ID();
				$component_tipo 		= $tm_obj->get_tipo();
				$lang					= $tm_obj->get_lang();
				$dato					= $tm_obj->get_dato();
				$uid 					= $tm_obj->get_identificador_unico();
				$show_row 		 		= false;

				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				switch ($modelo_name) {
					case 'component_text_area':
						$dato_string	= component_text_area::clean_raw_text_for_preview($dato);
						$dato_string 	= strip_tags($dato_string);						
						break;		
					default:
						if (!is_string($dato)) {
							$dato_string = json_encode($dato, JSON_UNESCAPED_UNICODE);
						}else{
							$dato_string = $dato;
							$dato_string = strip_tags($dato_string);
						}
						#$dato_string	= to_string($dato);
						break;
				}				

				$max_long = 290;
				if (strlen($dato_string)>$max_long) {
					$dato_string = mb_substr($dato_string, 0, $max_long) . '..';	
				}				

				// Row object
				$row_obj = new stdClass();
					$row_obj->date 					= $date;
					$row_obj->userID 				= $userID;
					$row_obj->mod_user_name 		= $mod_user_name;
					$row_obj->id_time_machine 		= $id_time_machine;
					$row_obj->component_tipo 		= $component_tipo;
					$row_obj->parent 				= $parent;
					$row_obj->current_tipo_section  = $this->section_tipo;
					$row_obj->lang 					= $lang;
					$row_obj->dato_string 			= $dato_string;
					$row_obj->uid 					= $uid;

				$ar_rows_obj[] = $row_obj;
				
			}//end foreach((array)$ar_component_time_machine as $tm_obj)


			// JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
			$json = json_encode($ar_rows_obj, JSON_HEX_QUOT);
			
			break;
		
	}//end switch


