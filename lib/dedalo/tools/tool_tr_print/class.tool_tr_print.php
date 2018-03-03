<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/media_engine/class.OptimizeTC.php');
require_once( dirname(dirname(dirname(__FILE__))) .'/tools/tool_subtitles/class.subtitles.php');

/*
* CLASS tool_tr_print
*/
class tool_tr_print extends tool_common {
	
	protected $component_obj;

	
	
	/**
	* __CONSTRUCT
	*/
	public function __construct($component_obj, $modo='button') {

		# Fix modo
		$this->modo = $modo;

		# Fix current media component
		$this->component_obj = $component_obj;
	}



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
		$raw_text = $this->component_obj->get_dato();
			#dump($raw_text, ' raw_text ++ '.to_string());
		
		# Get all timecodes
		#$pattern = TR::get_mark_pattern($mark='tc',$standalone=false);
		# Search math patern tags
		#preg_match_all($pattern,  $raw_text,  $matches_tc, PREG_PATTERN_ORDER);
			#dump($matches_tc,"matches_tc ".to_string($pattern));


		# explode by tc pattern
		$pattern_tc   = TR::get_mark_pattern('tc_full',$standalone=true);
		#$pattern_tc  = "/(\[TC_[0-9][0-9]:[0-9][0-9]:[0-9][0-9]\.[0-9]{1,3}_TC\])/";
		$ar_fragments = preg_split($pattern_tc, $raw_text, -1, PREG_SPLIT_NO_EMPTY | PREG_SPLIT_DELIM_CAPTURE);			

			if (!isset($ar_fragments[0])) {
				$response->msg = 'No fragements are found';
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
					// Remove second tc apperance
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
		}//foreach ($ar_fragments as $key => $value) {
		#dump($ar_final, ' $ar_final ++ '.to_string());
		
		#$response->result = self::format_text_for_tool( $raw_text );
		$response->result = true;
		$response->result = $ar_final;

		return (object)$response;
	}//end get_ar_tc_text



	/**
	* GET_DESCRIPTORS
	* @return 
	*/
	public function get_descriptors( $fragment, $type ) {
		
		$section_tipo 	= $this->component_obj->get_section_tipo();
		$section_id 	= $this->component_obj->get_parent();
		$component_tipo = $this->component_obj->get_tipo();

		$descriptors 	= component_text_area::get_descriptors( $fragment, $section_tipo, $section_id, $component_tipo, $type );
			#dump($descriptors, ' $descriptors ++ '.to_string());

		return (array)$descriptors;
	}//end get_descriptors



	/**
	* GET_RAW_TEXT
	* @return string $raw_text
	*/
	public function get_raw_text() {
		$raw_text = $this->component_obj->get_dato();

		return $raw_text;
	}//end get_raw_text



	/**
	* GET_ORIGINAL_TEXT
	* @return 
	*/
	public function get_original_text() {
		
		$raw_text = $this->component_obj->get_dato();	
		$raw_text = self::format_text_for_tool( $raw_text );

		return $raw_text;
	}//end get_original_text



	/**
	* GET_SOURCE_TEXT
	* @return 
	*/
	public function get_source_text() {
		
		$raw_text = $this->component_obj->get_dato();

		$raw_text = htmlentities($raw_text);
		
		return $raw_text;
	}//end get_source_text



	/**
	* FORMAT_TEXT_FOR_TOOL
	* @return 
	*/
	public static function format_text_for_tool( $raw_text ) {
		$raw_text = TR::addTagImgOnTheFly($raw_text);
	
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
			$modelo_name 			= 'component_select_lang';
			$ar_related 			= common::get_ar_related_by_model( $modelo_name, $tipo );
			if (isset($ar_related[0])) {
				$component_select_lang 	= $ar_related[0];
				#dump($component_select_lang, ' $component_select_lang ++ '.to_string());
				$component 	 = component_common::get_instance($modelo_name,
															  $component_select_lang,
															  $parent,
															  'edit',
															  $lang,
															  $section_tipo);
				$value = $component->get_valor( $lang );
				$tr_data->source_lang = $value;
			}else{
				$tr_data->source_lang = DEDALO_DATA_LANG;
			}
			
				

		# date
			$current_tipo= 'rsc44';
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo, true); // 'component_date';
			$component 	 = component_common::get_instance($modelo_name,
														  $current_tipo,
														  $parent,
														  'edit',
														  DEDALO_DATA_NOLAN,
														  $section_tipo);
			$dato    = $component->get_dato();
			$value 	 = null;
			if (!empty($dato)) {			
			$dd_date = new dd_date($dato);	 // dd_date::get_date_with_format( $dato, $format="Y-m-d" );			
			$value   = $dd_date->get_dd_timestamp($date_format="d-m-Y");
			}
			$tr_data->date = $value;

		# municipality
			$current_tipo= 'rsc46';
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo, true); // component_autocomplete_ts
			$component 	 = component_common::get_instance($modelo_name,
														  $current_tipo,
														  $parent,
														  'edit',
														  DEDALO_DATA_NOLAN,
														  $section_tipo);
			$value = $component->get_valor( $lang );
			$tr_data->municipality = $value;

		# code
			$current_tipo= 'rsc21';
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo, true); // component_autocomplete_ts
			$component 	 = component_common::get_instance($modelo_name,
														  $current_tipo,
														  $parent,
														  'edit',
														  DEDALO_DATA_NOLAN,
														  $section_tipo);
			$value = $component->get_valor( $lang );
			$tr_data->code = $value;

		# posterframe
			$current_tipo= 'rsc35';
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo, true); // component_autocomplete_ts
			$component 	 = component_common::get_instance($modelo_name,
														  $current_tipo,
														  $parent,
														  'edit',
														  DEDALO_DATA_NOLAN,
														  $section_tipo);
			$value = $component->get_posterframe_url($test_file=true, $absolute=false);
			$tr_data->posterframe = $value;

		# interview
			$tr_data->interview = $this->get_interview_data();


		#dump($tr_data, ' tr_data ++ '.to_string());

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
		$inverse_locators = $section->get_inverse_locators();
			#dump($inverse_locators, ' $inverse_locators ++ '.to_string());
		
		$ar_interviews = array();
		foreach ($inverse_locators as $current_locator) {

			$current_section_tipo = $current_locator->from_section_tipo;
			$current_section_id   = $current_locator->from_section_id;

			if ($current_section_tipo==='oh1') {				

				# Informants
					$current_tipo= 'oh24';
					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo, true); // component_portal
					$component 	 = component_common::get_instance($modelo_name,
																  $current_tipo,
																  $current_section_id,
																  'edit',
																  DEDALO_DATA_NOLAN,
																  $current_section_tipo);
					$dato = $component->get_dato();
					$informants = $this->get_informants_data( $dato );

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
				$current_tipo= 'rsc85';
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo, true); // component_input_text
				$component 	 = component_common::get_instance($modelo_name,
															  $current_tipo,
															  $current_locator->section_id,
															  'edit',
															  DEDALO_DATA_NOLAN,
															  $current_locator->section_tipo);
				$name = $component->get_valor(0);

			# surname
				$current_tipo= 'rsc86';
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo, true); // component_input_text
				$component 	 = component_common::get_instance($modelo_name,
															  $current_tipo,
															  $current_locator->section_id,
															  'edit',
															  DEDALO_DATA_NOLAN,
															  $current_locator->section_tipo);
				$surname = $component->get_valor(0);


			$informants_data[] = "$name $surname";
		}

		return (array)$informants_data;
	}//end get_informants_data




}//end tool_tr_print
?>