<?php
/**
 * CLASS TOOL_TR_PRINT
 *
 * This tool manages the generation of printable versions of interview transcripts.
 * It provides functionality to process transcription text, handle embedded tags
 * (timecodes, descriptors, indexation), and generate formatted outputs such as
 * VTT (Web Video Text Tracks) for subtitles or custom printable layouts.
 *
 * @package    Dédalo
 * @subpackage Tools
 */
class tool_tr_print extends tool_common {



	protected $component_obj;



	/**
	* GET_AR_TC_TEXT
	* Apply a offset timecode to all timecode tags in the transcription
	* @return object $response
	*/
	public function get_ar_tc_text( $request_options ) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		$options = new stdClass();
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		# Source text
		$data = $this->component_obj->get_data_lang();
		$raw_text = $data[0]->value ?? '';

		# Get all timecodes
		#$pattern = TR::get_mark_pattern($mark='tc',$standalone=false);
		# Search math pattern tags
		#preg_match_all($pattern,  $raw_text,  $matches_tc, PREG_PATTERN_ORDER);
			#dump($matches_tc,"matches_tc ".to_string($pattern));


		# explode by tc pattern
		$pattern_tc   = TR::get_mark_pattern('tc_full',$standalone=true);
		#$pattern_tc  = "/(\[TC_[0-9][0-9]:[0-9][0-9]:[0-9][0-9]\.[0-9]{1,3}_TC\])/";
		$ar_fragments = preg_split($pattern_tc, $raw_text, -1, PREG_SPLIT_NO_EMPTY | PREG_SPLIT_DELIM_CAPTURE);

			if (!isset($ar_fragments[0])) {
				$response->msg = 'No fragments are found';
				return $response;
			}

			# First element. Test if is time code
			# If not, add 00 time code
			preg_match($pattern_tc, $ar_fragments[0], $matches);
				#dump($matches, ' matches ++ '.to_string());
			if (empty($matches)) {
				$tc_init = '[TC_00:00:00.000_TC]';
				array_unshift($ar_fragments, $tc_init);
			}
			#dump($ar_fragments, ' ar_fragments 2 ++ '.to_string());

			# Fix consecutive tc case
			foreach ($ar_fragments as $key => $value) {
				if ( $key>0 && strpos($value, '[TC_')!==false && isset($ar_fragments[$key-1]) && strpos($ar_fragments[$key-1], '[TC_')!==false ) {
					// Remove second tc appearance
					unset($ar_fragments[$key]);
				}
			}
			$ar_fragments = array_values($ar_fragments);


		$ar_final = array();
		$pattern  = TR::get_mark_pattern($mark='tc',$standalone=false);
		foreach ($ar_fragments as $key => $value) {
			if ($key % 2 == 0) {
				# It's even
				if (isset($ar_fragments[$key+1])) {
					$tc_tag 	= $value;
					$fragment 	= $ar_fragments[$key+1];

					# tc
					preg_match($pattern, $tc_tag, $matches);
					$tc = isset($matches[1]) ? $matches[1] : null;

					# Descriptors
					$descriptors = $this->get_descriptors($fragment, 'index');

					# Descriptors structure
					$descriptors_struct = $this->get_descriptors($fragment, 'struct');

					$value_obj = new stdClass();
						$value_obj->tc 		 			= $tc;
						$value_obj->fragment 			= $fragment;
						$value_obj->descriptors 		= $descriptors;
						$value_obj->descriptors_struct 	= $descriptors_struct;

					$ar_final[$tc_tag] = $value_obj;
				}
			}
		}//foreach ($ar_fragments as $key => $value)

		if(SHOW_DEBUG===true) {
			#dump($ar_final, ' $ar_final ++ '.to_string()); die();
		}

		#$response->result = self::format_text_for_tool( $raw_text );
		$response->result = true;
		$response->result = $ar_final;

		return (object)$response;
	}//end get_ar_tc_text



	/**
	* BUILD_PSEUDO_VTT
	* @return string $vtt_text
	*/
	public static function build_pseudo_vtt( $ar_tc_text, $duration ) {
		$vtt_text = '';

		if (empty($ar_tc_text)) {
			return $vtt_text;
		}

		$ar_lines = [];

		// Remove array keys
		$ar_tc_base = array_values($ar_tc_text);

		foreach ($ar_tc_base as $key => $obj_value) {

			$current_tc = $obj_value->tc;
			$next_tc 	= isset($ar_tc_base[$key+1]) ? $ar_tc_base[$key+1]->tc : $duration;
			$text 		= tool_tr_print::clean_vtt_text($obj_value->fragment);

			$ar_lines[] =  $key+1 .PHP_EOL . $current_tc . htmlentities(' --> ') . $next_tc . PHP_EOL . $text . PHP_EOL;
		}

		$vtt_text = 'WEBVTT' . PHP_EOL . PHP_EOL . implode(PHP_EOL, $ar_lines);


		return $vtt_text;
	}//end build_pseudo_vtt



	/**
	* GET_AV_DURATION
	* @return string $av_duration
	*	Time code like '00:01:55.680'
	*/
	public function get_av_duration() {

		# Actually rsc35
		$related_component_av_tipo = $this->component_obj->get_related_component_av_tipo();

		$model_name		= ontology_node::get_model_by_tipo($related_component_av_tipo,true);
		$parent			= $this->component_obj->get_parent();
		$section_tipo	= $this->component_obj->get_section_tipo();
		$component_av	= component_common::get_instance(
			$model_name,
			$related_component_av_tipo,
			$parent,
			'list',
			DEDALO_DATA_NOLAN,
			$section_tipo
		);

		$duration_seconds	= $component_av->get_duration();
		$tc					= OptimizeTC::seg2tc($duration_seconds);
		$av_duration		= $tc;


		return $av_duration;
	}//end get_av_duration



	/**
	* CLEAN_VTT_TEXT
	* @return string $text
	*/
	public static function clean_vtt_text($text) {

		#$text = subtitles::clean_text_for_subtitles($text);

		# CONVERT ENCODING (Traducciones mal formadas provinientes de Babel)
		$text = html_entity_decode($text);

		$text	= strip_tags($text, '<br><strong><em>');

		$text = str_replace(['<br />','<br>'], "\n", $text);
		$text = str_replace('<strong>', '<b>', $text);
		$text = str_replace('</strong>', '</b>', $text);
		$text = str_replace('<em>', '<i>', $text);
		$text = str_replace('</em>', '</i>', $text);
		$text = str_replace(['&nbsp;'], [' '], $text);
		$text = str_replace(['  ',"\n\n"], [' ',"\n"], $text);
		$text = str_replace(['  ',"\n\n"], [' ',"\n"], $text);
		$text = str_replace(["\n</b>"], ['<b>'], $text);

		$text = TR::deleteMarks($text);

		$text = preg_replace("/^:[ ]?/", "", $text);

		$text = subtitles::revise_tag_in_line($text,'b');
		$text = subtitles::revise_tag_in_line($text,'i');

		$text = trim($text);

		return $text;
	}//end clean_vtt_text



	/**
	* GET_DESCRIPTORS
	* @return array $descriptors
	*/
	public function get_descriptors( $fragment, $type ) {

		$descriptors = array();

		// Check valid types in TR class
		if (!in_array($type, TR::$tag_types)) {
			// 'struct' or other legacy types are ignored to avoid errors
			return $descriptors;
		}

		$ar_tags = TR::get_tags_of_type_in_text($fragment, [$type]);

		foreach($ar_tags as $tag_info) {
			$tag = $tag_info->tag;
			// Parse tag to get label
			// For 'index' pattern: \[/{0,1}(index)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\]
			// Group 5 is the label
			$pattern = TR::get_mark_pattern($type, false);
			if (preg_match("/$pattern/", $tag, $matches)) {
				$label = $matches[5] ?? '';
				if (!empty($label)) {
					$descriptors[] = $label;
				}
			}
		}

		return $descriptors;
	}//end get_descriptors



	/**
	* GET_RAW_TEXT
	* @return string $raw_text
	*/
	public function get_raw_text() : string {

		$data = $this->component_obj->get_data_lang();

		$raw_text = $data[0]->value ?? '';

		return $raw_text;
	}//end get_raw_text



	/**
	* GET_ORIGINAL_TEXT
	* @return
	*/
	public function get_original_text() : string {

		$data = $this->component_obj->get_data_lang();
		$raw_text = $data[0]->value ?? '';

		$raw_text = self::format_text_for_tool( $raw_text );

		return $raw_text;
	}//end get_original_text



	/**
	* GET_SOURCE_TEXT
	* @return
	*/
	public function get_source_text() {

		$data = $this->component_obj->get_data_lang();
		$raw_text = $data[0]->value ?? '';

		$raw_text = htmlentities($raw_text);

		return $raw_text;
	}//end get_source_text



	/**
	* FORMAT_TEXT_FOR_TOOL
	* @return
	*/
	public static function format_text_for_tool( $raw_text ) {
		$raw_text = TR::add_tag_img_on_the_fly($raw_text);

		return $raw_text;
	}//end format_text_for_tool



	/**
	* GET_TR_DATA
	* @return
	*/
	public function get_tr_data() {

		$tr_data = new stdClass();

		$tipo 		  = $this->component_obj->get_tipo();
		$parent 	  = $this->component_obj->get_parent();
		$section_tipo = $this->component_obj->get_section_tipo();
		$lang 		  = $this->component_obj->get_lang();


		# ID
			$tr_data->ID = $parent;

		# source lang
			$model_name = 'component_select_lang';
			$ar_related = common::get_ar_related_by_model( $model_name, $tipo );
			if (isset($ar_related[0])) {
				$component_select_lang = $ar_related[0];
				$component = component_common::get_instance(
					$model_name,
					$component_select_lang,
					$parent,
					'edit',
					$lang,
					$section_tipo
				);
				$value = $component->get_value();
				$tr_data->source_lang = $value;
			}else{
				$tr_data->source_lang = DEDALO_DATA_LANG;
			}

		# date
			$current_tipo	= 'rsc44';
			$model_name		= ontology_node::get_model_by_tipo($current_tipo, true); // 'component_date';
			$component		= component_common::get_instance(
				$model_name,
				$current_tipo,
				$parent,
				'edit',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$data    = $component->get_data();
			$value 	 = null;
			if (!empty($data[0])) {
				$dd_date = new dd_date($data[0]);
				$value   = $dd_date->get_dd_timestamp($date_format="d-m-Y");
			}
			$tr_data->date = $value;

		# municipality
			$current_tipo	= 'rsc46';
			$model_name		= ontology_node::get_model_by_tipo($current_tipo, true); // component_autocomplete_ts
			$component		= component_common::get_instance(
				$model_name,
				$current_tipo,
				$parent,
				'edit',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$value = $component->get_value();
			$tr_data->municipality = $value;

		# code
			$current_tipo	= 'rsc21';
			$model_name		= ontology_node::get_model_by_tipo($current_tipo, true); // component_autocomplete_ts
			$component		= component_common::get_instance(
				$model_name,
				$current_tipo,
				$parent,
				'edit',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$value = $component->get_value();
			$tr_data->code = $value;

		# posterframe
			$current_tipo	= 'rsc35';
			$model_name		= ontology_node::get_model_by_tipo($current_tipo, true); // component_autocomplete_ts
			$component		= component_common::get_instance(
				$model_name,
				$current_tipo,
				$parent,
				'edit',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$value = $component->get_posterframe_url($test_file=true, $absolute=false);
			$tr_data->posterframe = $value;

		# interview
			$tr_data->interview = $this->get_interview_data();


		return (object)$tr_data;
	}//end get_tr_data



	/**
	* GET_INTERVIEW_DATA
	* @return array $ar_interviews
	*/
	public function get_interview_data() {

		$tipo 		  = $this->component_obj->get_tipo();
		$parent 	  = $this->component_obj->get_parent();
		$section_tipo = $this->component_obj->get_section_tipo();
		$lang 		  = $this->component_obj->get_lang();

		$section = section::get_instance($parent, $section_tipo);
		$inverse_locators = $section->get_inverse_references();

		$ar_interviews = [];
		foreach ($inverse_locators as $current_locator) {

			$current_section_tipo = $current_locator->from_section_tipo;
			$current_section_id   = $current_locator->from_section_id;

			if ($current_section_tipo==='oh1') {

				# Informants
					$current_tipo	= 'oh24';
					$model_name		= ontology_node::get_model_by_tipo($current_tipo, true); // component_portal
					$component		= component_common::get_instance(
						$model_name,
						$current_tipo,
						$current_section_id,
						'edit',
						DEDALO_DATA_NOLAN,
						$current_section_tipo
					);
					$data = $component->get_data();
					$informants = $this->get_informants_data( $data );

				# interview
				$interview = new stdClass();
					$interview->ID 		   = $current_section_id;
					$interview->informants = $informants;

				$ar_interviews[] = $interview;
			}
		}

		return (array)$ar_interviews;
	}//end get_interview_data



	/**
	* GET_INFORMANTS_DATA
	* @return array $informants_data
	*/
	public function get_informants_data( $ar_locators ) {

		$informants_data = array();

		foreach ($ar_locators as $current_locator) {

			# name
				$current_tipo	= 'rsc85';
				$model_name		= ontology_node::get_model_by_tipo($current_tipo, true); // component_input_text
				$component		= component_common::get_instance(
					$model_name,
					$current_tipo,
					$current_locator->section_id,
					'edit',
					DEDALO_DATA_NOLAN,
					$current_locator->section_tipo
				);
				$name = $component->get_value();

			# surname
				$current_tipo	= 'rsc86';
				$model_name		= ontology_node::get_model_by_tipo($current_tipo, true); // component_input_text
				$component		= component_common::get_instance(
					$model_name,
					$current_tipo,
					$current_locator->section_id,
					'edit',
					DEDALO_DATA_NOLAN,
					$current_locator->section_tipo
				);
				$surname = $component->get_value();


			$informants_data[] = "$name $surname";
		}

		return (array)$informants_data;
	}//end get_informants_data



}//end tool_tr_print
