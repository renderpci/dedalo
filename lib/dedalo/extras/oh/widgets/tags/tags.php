<?php

	# CONTROLLER
	

		$widget_name 				= $this->widget_name;
		$modo 						= $this->component_info->get_modo();
		$parent 					= $this->component_info->get_parent();		
		$section_tipo 				= $this->component_info->get_section_tipo();
		$lang 						= DEDALO_DATA_LANG;
		$data_source 				= $this->data_source;	
		$component_text_area_tipo 	= $data_source;
		$filename 					= $modo;

		/*
		if(!SHOW_DEBUG) {
			echo "Working here..";
			return null;
		}
		*/


		switch ($modo) {

			case 'list':			
				$filename = 'edit';
			
			case 'edit':
				#
				# RAW TEXT
					$original_lang 	= component_text_area::force_change_lang($component_text_area_tipo, $parent, $modo, $lang, $section_tipo);
					$component 		= component_common::get_instance('component_text_area',
																$component_text_area_tipo,
																$parent,
																$modo,
																$original_lang,
																$section_tipo);
					$raw_text = $component->get_dato();
						#dump($raw_text, ' raw_text ++ '.to_string($component_text_area_tipo .'-'. $parent.' - '.$lang ));

				#
				# TC'S'				
					$pattern = TR::get_mark_pattern($mark='tc',$standalone=false);
					# Search math patern tags
					preg_match_all($pattern,  $raw_text,  $matches_tc, PREG_PATTERN_ORDER);
						#dump($matches_tc[0],"matches_tc ".to_string($pattern));
					$total_tc = 0;
					if (isset($matches_tc[0])) {
						$total_tc = count($matches_tc[0]);
					}
					#dump($total_tc, ' total_tc ++ '.to_string());					
					#dump($matches_tc[1], '$matches_tc[1] ++ '.to_string());

					# TC WRONG
					require_once(DEDALO_LIB_BASE_PATH.'/media_engine/class.OptimizeTC.php');
					$ar_secs 	 = [];
					$ar_tc_wrong = [];
					foreach ($matches_tc[1] as $key => $value) {
						#dump($value, ' value ++ '.to_string($key));
						$secs 		= OptimizeTC::TC2seg($value);
						$ar_secs[$key] 	= $secs;
							#dump($secs, ' secs ++ '.to_string());
						if ($key>0 && $secs<$ar_secs[$key-1]) {
							$ar_tc_wrong[] = $value;
								#dump($secs, ' $secs ++ ERROR '.to_string($value));
						}
					}
					#dump($ar_tc_wrong, ' $ar_tc_wrong ++ '.to_string());

				#
				# INDEX
					# INDEX IN
					$pattern = TR::get_mark_pattern($mark='indexIn',$standalone=false);
					preg_match_all($pattern,  $raw_text,  $matches_indexIn, PREG_PATTERN_ORDER);
						#dump($matches_indexIn,"matches_indexIn ".to_string($pattern));
					$total_indexIn = 0;
					if (isset($matches_indexIn[0])) {
						$total_indexIn = count($matches_indexIn[0]);
					}
					#dump($total_indexIn, ' total_indexIn ++ '.to_string());

					# INDEX OUT
					$pattern = TR::get_mark_pattern($mark='indexOut',$standalone=false);
					preg_match_all($pattern,  $raw_text,  $matches_indexOut, PREG_PATTERN_ORDER);
						#dump($matches_indexOut,"matches_indexOut ".to_string($pattern));
					$total_indexOut = 0;
					if (isset($matches_indexOut[0])) {
						$total_indexOut = count($matches_indexOut[0]);
					}
					#dump($total_indexOut, ' total_indexOut ++ '.to_string());

					# INDEX MISSING IN
					$ar_missing_indexIn=array();
					foreach ($matches_indexOut[2] as $key => $value) {
						if (!in_array($value, $matches_indexIn[2])) {
							$tag_in = $matches_indexOut[0][$key];
							$tag_in = str_replace('[/', '[', $tag_in);
							$ar_missing_indexIn[] = $tag_in;
						}
					}
					#dump($ar_missing_indexIn, ' ar_missing_indexIn ++ '.to_string());

					# INDEX MISSING OUT
					$ar_missing_indexOut=array();
					foreach ($matches_indexIn[2] as $key => $value) {
						if (!in_array($value, $matches_indexOut[2])) {
							$tag_out = $matches_indexIn[0][$key];	// As we only have the in tag, we create out tag
							$tag_out = str_replace('[', '[/', $tag_out);
							$ar_missing_indexOut[] = $tag_out;
						}
					}
					#dump($ar_missing_indexOut, ' ar_missing_indexOut ++ '.to_string());

					
					$ar_different_index = array();			
					if(isset($matches_indexIn[2])) foreach ($matches_indexIn[2] as $value) {						
						$ar_different_index[] = $value;
					}
					if(isset($matches_indexOut[2])) foreach ($matches_indexOut[2] as $value) {
						$ar_different_index[] = $value;
					}
					$ar_different_index = array_unique($ar_different_index);
					$total_index = count($ar_different_index);
						#dump($ar_different_index, ' $ar_different_index ++ '.to_string($total_index));			
					

					#
					# BLUE TAGS (DELETED)
					$pattern = "/\[\/{0,1}index-d-([0-9]+)\]/";
					preg_match_all($pattern,  $raw_text,  $matches_deleted, PREG_PATTERN_ORDER);
						#dump($matches_deleted, ' matches_deleted ++ '.to_string());
					$ar_deleted = array_unique( $matches_deleted[1] );
					

					# Contabilizamos las etiquetas rotas encontradas + las etiquetas azules existentes en el texto
					# No se contabilizan aquí las posibles 'perdidas' referenciadas en el tesauro pero que no están en el texto actual (por velocidad)
					# estas se añadirán automáticamente al entrar en modo edit al principio del texto
					$total_missing_tags = count($ar_missing_indexIn) + count($ar_missing_indexOut) + count($ar_deleted);


					#
					# RED TAGS (TO REVIEW)
					$pattern = "/\[\/{0,1}index-r-([0-9]+)\]/";
					preg_match_all($pattern,  $raw_text,  $matches_to_review, PREG_PATTERN_ORDER);
						#dump($matches_to_review, ' matches_to_review ++ '.to_string());
					$ar_to_review = array_unique( $matches_to_review[1] );
					$total_to_review_tags = count($ar_to_review);


					#
					# TOTAL CHARS
					$total_chars = mb_strlen($raw_text,'UTF-8');


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