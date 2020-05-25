<?php
/**
* NOTES
*
*
*/
abstract class notes {



	/**
	* REMOVE_NOTES
	* Delete notes tags from text
	* @return string $text_clean
	*/
	public static function remove_notes($raw_text, $private=true, $public=true) {
		
		// $mark, $standalone=true, $id=false, $data=false, $state=false
		// state a = private, b = public

		$text_clean = $raw_text;

		if ($private===true) {
			$pattern = TR::get_mark_pattern('note', true, false, false, 'a');
			$text_clean = preg_replace($pattern, '', $text_clean);
		}
			
		if ($public===true) {
			$pattern = TR::get_mark_pattern('note', true, false, false, 'b');
			$text_clean = preg_replace($pattern, '', $text_clean);
		}
				

		return $text_clean;
	}//end remove_notes



	/**
	* GET_NOTES_DATA
	* @return array $ar_notes
	*/
	public static function get_notes_data($raw_text, $lang) {
		
		// state a = private, b = public
		$pattern = TR::get_mark_pattern('note', true, false, false, 'b');

		$ar_notes = [];

		return $notes;

		// En curso (Necesita RecordObj_dd de momento)..........................


		preg_match_all($pattern, $raw_text, $matches);
			#dump($matches, ' matches ++ '.to_string());		
		$key_locator = 7;
		$key_id 	 = 4;
		$component_tipo = DEDALO_NOTES_TEXT_TIPO;
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		foreach ($matches[$key_locator] as $key => $locator) {
			$locator = str_replace('\'', '"', $locator);
			$locator = json_decode($locator);

			$component 		= component_common::get_instance($modelo_name,
															 $component_tipo,
															 $locator->section_id,
															 'list',
															 $lang,
															 $locator->section_tipo);
			$note_obj = new stdClass();
				$note_obj->label 		= $component->get_valor();
				$note_obj->id 			= $matches[$key_id][$key];
				$note_obj->section_id 	= $locator->section_id;				

			$ar_notes[] = $note_obj;
		}
		#dump($ar_notes, ' ar_notes ++ '.to_string());


		return $ar_notes;
	}//end get_notes_data



}//end class notes