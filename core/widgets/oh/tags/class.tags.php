<?php
/*
* CLASS TAGS
* Compute transcription text tags info and statistics
* Configuration is defined in component info ontology properties
* NOTE: Text used is always from the 'original' lang (!)
*/
class tags extends widget_common {



	/**
	* GET_DATO
	* @return array $dato
	* 	Array of objects
	*/
	public function get_dato() : array {

		$section_tipo	= $this->section_tipo;
		$section_id		= $this->section_id;
		$ipo			= $this->ipo;
		$lang			= $this->lang;
		$mode			= 'list';

		$dato = [];

		foreach ($ipo as $ipo_key => $current_ipo) {

			$input	= $current_ipo->input;
			$output	= $current_ipo->output;
			$source	= $input->source;

			$transcription_source = array_find($source, function($item){
				return ($item->var_name==='transcription');
			});
			if (!is_object($transcription_source)) {
				debug_log(__METHOD__
					. " Ignored current_ipo because transcription source was not found " . PHP_EOL
					. ' source: ' . to_string($source)
					, logger::ERROR
				);
				continue;
			}

			$current_component_tipo = $transcription_source->component_tipo;

			// raw_text. From the original lang always (!)
				$component = component_common::get_instance(
					'component_text_area',
					$current_component_tipo,
					$section_id,
					$mode,
					$lang,
					$section_tipo
				);
				$original_lang = $component->get_original_lang();
				if (!empty($original_lang) && $original_lang!==$lang) {
					$component->set_lang($original_lang);
				}

				$dato = $component->get_dato();
				$raw_text = isset($dato[0])
					? $dato[0]
					: '';

			// tc's
				$pattern = TR::get_mark_pattern($mark='tc',$standalone=false);
				# Search math pattern tags
				preg_match_all($pattern,  $raw_text,  $matches_tc, PREG_PATTERN_ORDER);
				$total_tc = isset($matches_tc[0])
					? count($matches_tc[0])
					: 0;

				// tc wrong case
				$ar_secs 	 = [];
				$ar_tc_wrong = [];
				foreach ($matches_tc[1] as $tc_key => $tc_value) {
					$secs				= OptimizeTC::TC2seg($tc_value);
					$ar_secs[$tc_key]	= $secs;
					if ($tc_key>0 && $secs<$ar_secs[$tc_key-1]) {
						$ar_tc_wrong[] = $tc_value;
					}
				}

			// index
				// index in
				$pattern = TR::get_mark_pattern($mark='indexIn',$standalone=false);
				preg_match_all($pattern,  $raw_text,  $matches_indexIn, PREG_PATTERN_ORDER);
				$total_indexIn = isset($matches_indexIn[0])
					? count($matches_indexIn[0])
					: 0;

				// index out
				$pattern = TR::get_mark_pattern($mark='indexOut',$standalone=false);
				preg_match_all($pattern,  $raw_text,  $matches_indexOut, PREG_PATTERN_ORDER);
				$total_indexOut = isset($matches_indexOut[0])
					? count($matches_indexOut[0])
					: 0;

				// index missing in
				$ar_missing_indexIn=array();
				foreach ($matches_indexOut[2] as $index_in_key => $index_invalue) {
					if (!in_array($index_invalue, $matches_indexIn[2])) {
						$tag_in = $matches_indexOut[0][$index_in_key];
						$tag_in = str_replace('[/', '[', $tag_in);
						$ar_missing_indexIn[] = $tag_in;
					}
				}

				// index missing out
				$ar_missing_indexOut=array();
				foreach ($matches_indexIn[2] as $index_out_key => $index_out_value) {
					if (!in_array($index_out_value, $matches_indexOut[2])) {
						$tag_out = $matches_indexIn[0][$index_out_key];	// As we only have the in tag, we create out tag
						$tag_out = str_replace('[', '[/', $tag_out);
						$ar_missing_indexOut[] = $tag_out;
					}
				}

				$ar_different_index = array();
				$ckey=3;
				if(isset($matches_indexIn[$ckey])) foreach ($matches_indexIn[$ckey] as $matches_in_value) {
					$ar_different_index[] = $matches_in_value;
				}
				if(isset($matches_indexOut[$ckey])) foreach ($matches_indexOut[$ckey] as $matches_out_value) {
					$ar_different_index[] = $matches_out_value;
				}
				$ar_different_index = array_unique($ar_different_index);
				$total_index = count($ar_different_index);

				// blue tags (deleted)
				$ckey=2;
				#$pattern = "/\[\/{0,1}index-d-([0-9]+)\]/";
				$pattern = TR::get_mark_pattern($mark='index',$standalone=true,false,false,'d');
				preg_match_all($pattern,  $raw_text,  $matches_deleted, PREG_PATTERN_ORDER);
				$ar_deleted = array_unique( $matches_deleted[$ckey] );

				# Contabilizamos las etiquetas rotas encontradas + las etiquetas azules existentes en el texto
				# No se contabilizan aquí las posibles 'perdidas' referenciadas en el tesauro pero que no están en el texto actual (por velocidad)
				# estas se añadirán automáticamente al entrar en modo edit al principio del texto
				$total_missing_tags = count($ar_missing_indexIn) + count($ar_missing_indexOut) + count($ar_deleted);

				// red tags (to review)
				$ckey=2;
				#$pattern = "/\[\/{0,1}index-r-([0-9]+)\]/";
				$pattern = TR::get_mark_pattern($mark='index',$standalone=true,false,false,'r');
				preg_match_all($pattern,  $raw_text,  $matches_to_review, PREG_PATTERN_ORDER);
				$ar_to_review			= array_unique( $matches_to_review[1] );
				$total_to_review_tags	= count($ar_to_review);


			// annotations

				// private annotations
				$pattern = TR::get_mark_pattern($mark='note',$standalone=false,false,false,'a');
				preg_match_all($pattern, $raw_text, $private_notes, PREG_PATTERN_ORDER);
				$total_private_notes = isset($private_notes[0])
					? count($private_notes[0])
					: 0;

				// public annotations
				$pattern = TR::get_mark_pattern($mark='note',$standalone=false,false,false,'b');
				preg_match_all($pattern,  $raw_text,  $public_notes, PREG_PATTERN_ORDER);
				$total_public_notes = 0;
				$total_public_notes = isset($public_notes[0])
					? count($public_notes[0])
					: 0;

			// chars info
				$chars_info				= TR::get_chars_info($raw_text);
				$total_chars			= $chars_info->total_chars;
				$total_chars_no_spaces	= $chars_info->total_chars_no_spaces;

			// total real chars
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



}//end tags class
