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
					$ckey=3;		
					if(isset($matches_indexIn[$ckey])) foreach ($matches_indexIn[$ckey] as $value) {						
						$ar_different_index[] = $value;
					}
					if(isset($matches_indexOut[$ckey])) foreach ($matches_indexOut[$ckey] as $value) {
						$ar_different_index[] = $value;
					}
					$ar_different_index = array_unique($ar_different_index);
					$total_index = count($ar_different_index);
						#dump($ar_different_index, ' $ar_different_index ++ '.to_string($total_index));			
					

					#
					# BLUE TAGS (DELETED)
					$ckey=2;
					#$pattern = "/\[\/{0,1}index-d-([0-9]+)\]/";
					$pattern = TR::get_mark_pattern($mark='index',$standalone=true,false,false,'d');
					preg_match_all($pattern,  $raw_text,  $matches_deleted, PREG_PATTERN_ORDER);
						#dump($matches_deleted, ' matches_deleted ++ '.to_string($pattern));
					$ar_deleted = array_unique( $matches_deleted[$ckey] );
					

					# Contabilizamos las etiquetas rotas encontradas + las etiquetas azules existentes en el texto
					# No se contabilizan aquí las posibles 'perdidas' referenciadas en el tesauro pero que no están en el texto actual (por velocidad)
					# estas se añadirán automáticamente al entrar en modo edit al principio del texto
					$total_missing_tags = count($ar_missing_indexIn) + count($ar_missing_indexOut) + count($ar_deleted);


					#
					# RED TAGS (TO REVIEW)
					$ckey=2;
					#$pattern = "/\[\/{0,1}index-r-([0-9]+)\]/";
					$pattern = TR::get_mark_pattern($mark='index',$standalone=true,false,false,'r');
					preg_match_all($pattern,  $raw_text,  $matches_to_review, PREG_PATTERN_ORDER);
						#dump($matches_to_review, ' matches_to_review ++ '.to_string());
					$ar_to_review = array_unique( $matches_to_review[1] );
					$total_to_review_tags = count($ar_to_review);


				#
				# STRUCT
					# STRUCT IN
					$pattern = TR::get_mark_pattern($mark='structIn',$standalone=false);
					preg_match_all($pattern,  $raw_text,  $matches_structIn, PREG_PATTERN_ORDER);
						#dump($matches_structIn,"matches_structIn ".to_string($pattern));
					$total_structIn = 0;
					if (isset($matches_structIn[0])) {
						$total_structIn = count($matches_structIn[0]);
					}
					#dump($total_structIn, ' total_structIn ++ '.to_string());

					# struct OUT
					$pattern = TR::get_mark_pattern($mark='structOut',$standalone=false);
					preg_match_all($pattern,  $raw_text,  $matches_structOut, PREG_PATTERN_ORDER);
						#dump($matches_structOut,"matches_structOut ".to_string($pattern));
					$total_structOut = 0;
					if (isset($matches_structOut[0])) {
						$total_structOut = count($matches_structOut[0]);
					}
					#dump($total_structOut, ' total_structOut ++ '.to_string());

					# struct MISSING IN
					$ar_missing_structIn=array();
					foreach ($matches_structOut[2] as $key => $value) {
						if (!in_array($value, $matches_structIn[2])) {
							$tag_in = $matches_structOut[0][$key];
							$tag_in = str_replace('[/', '[', $tag_in);
							$ar_missing_structIn[] = $tag_in;
						}
					}
					#dump($ar_missing_structIn, ' ar_missing_structIn ++ '.to_string());

					# struct MISSING OUT
					$ar_missing_structOut=array();
					foreach ($matches_structIn[2] as $key => $value) {
						if (!in_array($value, $matches_structOut[2])) {
							$tag_out = $matches_structIn[0][$key];	// As we only have the in tag, we create out tag
							$tag_out = str_replace('[', '[/', $tag_out);
							$ar_missing_structOut[] = $tag_out;
						}
					}
					#dump($ar_missing_structOut, ' ar_missing_structOut ++ '.to_string());

					
					$ar_different_struct = array();
					$ckey=3;
					if(isset($matches_structIn[$ckey])) foreach ($matches_structIn[$ckey] as $value) {						
						$ar_different_struct[] = $value;
					}
					if(isset($matches_structOut[$ckey])) foreach ($matches_structOut[$ckey] as $value) {
						$ar_different_struct[] = $value;
					}
					$ar_different_struct = array_unique($ar_different_struct);
					$total_struct = count($ar_different_struct);
						#dump($ar_different_struct, ' $ar_different_struct ++ '.to_string($total_struct));			
					

					#
					# BLUE TAGS (DELETED)
					$ckey=2;
					#$pattern = "/\[\/{0,1}struct-d-([0-9]+)\]/";
					$pattern = TR::get_mark_pattern($mark='struct',$standalone=true,false,false,'d');
					preg_match_all($pattern,  $raw_text,  $matches_deleted, PREG_PATTERN_ORDER);
						#dump($matches_deleted, ' matches_deleted ++ '.to_string($pattern));
					$ar_deleted = array_unique( $matches_deleted[$ckey] );
					

					# Contabilizamos las etiquetas rotas encontradas + las etiquetas azules existentes en el texto
					# No se contabilizan aquí las posibles 'perdidas' referenciadas en el tesauro pero que no están en el texto actual (por velocidad)
					# estas se añadirán automáticamente al entrar en modo edit al principio del texto
					$struct_total_missing_tags = count($ar_missing_structIn) + count($ar_missing_structOut) + count($ar_deleted);


					#
					# RED TAGS (TO REVIEW)
					$ckey=2;
					#$pattern = "/\[\/{0,1}struct-r-([0-9]+)\]/";
					$pattern = TR::get_mark_pattern($mark='struct',$standalone=true,false,false,'r');
					preg_match_all($pattern,  $raw_text,  $matches_to_review, PREG_PATTERN_ORDER);
						#dump($matches_to_review, ' matches_to_review ++ '.to_string());
					$ar_to_review = array_unique( $matches_to_review[1] );
					$struct_total_to_review_tags = count($ar_to_review);

				#
				# ANNOTATIONS

					#PRIVATE annotations
					$pattern = TR::get_mark_pattern($mark='note',$standalone=false,false,false,'a');
					preg_match_all($pattern,  $raw_text,  $private_notes, PREG_PATTERN_ORDER);
						#dump($private_notes,"private_notes ".to_string($pattern));
					$total_private_notes = 0;
					if (isset($private_notes[0])) {
						$total_private_notes = count($private_notes[0]);
					}
					#dump($total_private_notes, ' total_private_notes ++ '.to_string());

					#PUBLIC annotations
					$pattern = TR::get_mark_pattern($mark='note',$standalone=false,false,false,'b');
					preg_match_all($pattern,  $raw_text,  $public_notes, PREG_PATTERN_ORDER);
						#dump($public_notes,"public_notes ".to_string($pattern));
					$total_public_notes = 0;
					if (isset($public_notes[0])) {
						$total_public_notes = count($public_notes[0]);
					}
					#dump($total_public_notes, ' total_public_notes ++ '.to_string());

				#
				# CHARS INFO
					$chars_info = TR::get_chars_info($raw_text);

					$total_chars  			= $chars_info->total_chars;
					$total_chars_no_spaces  = $chars_info->total_chars_no_spaces;
				/*
				#
				# TOTAL CHARS (Without marks)
					$text_clean = trim($raw_text);
					# Remove Dédalo marks
					$text_clean =  TR::deleteMarks($text_clean);
					# Remove html tags like strong, br, etc.
					
					$text_clean = strip_tags($text_clean);$text_clean = htmlspecialchars_decode($text_clean);
					# Count chars
					$total_chars  = mb_strlen($text_clean,'UTF-8');


				#
				# TOTAL CHARS (NO SPACES)
						#dump($text_clean, ' text_clean 1++ '.to_string());					
						#dump($text_clean, ' text_clean 2++ '.to_string());
					# Remove spaces and returns
					#$text_clean = preg_replace("/\s/", "", $text_clean);#  &nbsp;
					$text_clean = str_replace(array("&nbsp;"," ","\n"),"",$text_clean);
					# Count chars
					$total_chars_no_spaces = mb_strlen($text_clean,'UTF-8');
					#$total_chars_no_spaces = strlen( utf8_decode($text_clean) );			
						#dump($text_clean, ' text_clean ++ '.to_string($total_chars_no_spaces));
				*/
				#
				# TOTAL REAL CHARS
					if(SHOW_DEBUG===true) {
						$total_real_chars = mb_strlen($raw_text,'UTF-8');;
					}

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