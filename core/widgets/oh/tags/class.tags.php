<?php
/*
* CLASS TAGS
*
*
*/
class tags extends widget_common {

	/**
	* get_dato
	* @return
	*/
	public function get_dato() {

		$section_tipo 	= $this->section_tipo;
		$section_id 	= $this->section_id;
		$ipo 			= $this->ipo;
		$lang			= $this->lang;
		$mode 			= 'list';

		$dato = [];
		foreach ($ipo as $ipo_key => $current_ipo) {

			$input 		= $current_ipo->input;
			$output		= $current_ipo->output;
			$source 	= $input->source;

			$transcription_source = array_reduce($source, function ($carry, $item){
				if ($item->var_name==='transcription') {
					return $item;
				}
				return $carry;
			});

			$current_component_tipo = $transcription_source->component_tipo;
			// $current_section_tipo 	= $component_source->section_tipo;

			#
			# RAW TEXT
				$original_lang 	= component_text_area::force_change_lang($current_component_tipo, $section_id, $mode, $lang, $section_tipo);
				$component 		= component_common::get_instance('component_text_area',
															$current_component_tipo,
															$section_id,
															$mode,
															$original_lang,
															$section_tipo);
				$raw_text = $component->get_dato()[0];

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
				require_once(DEDALO_CORE_PATH.'/media_engine/class.OptimizeTC.php');
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

			#
			# TOTAL REAL CHARS
				$total_real_chars = mb_strlen($raw_text,'UTF-8');

			// final data object, get the output map to create it.
			foreach ($output as $data_map) {
				$current_id = $data_map->id;
				$current_data = new stdClass();
					$current_data->widget	= get_class($this);
					$current_data->key		= $ipo_key;
					$current_data->id		= $current_id;
					$current_data->value	= $$current_id ?? null;
				$dato[] = $current_data;
			}
		}
		return $dato;
	}//end get_dato
}
