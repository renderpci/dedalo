<?php
/**
* VIDEO_VIEW_DATA
* Object for get all player data
*
*/
class video_view_data {



	# Version. Important!
	#static $version = "1.0.1"; // 08-06-2017
	static $version = "1.0.2"; // 14-06-2017



	/**
	* __CONSTRUCT
	*/
	public function __construct( $request_options=null ) {

		if(is_object($request_options)) foreach ($request_options as $key => $value) {
			$this->$key = $value;
		}
	}//end __construct




	/**
	* LOAD_THESAURUS_VIDEO_VIEW_DATA
	* Used for search thematic
	* @param string term_id like 'ts156'
	* @param string locators array of locators as json string
	* @return object video_view_data
	*/
	public function load_thesaurus_video_view_data( $term_id, $locators, $locator_key ) {

		$video_view_data = new stdClass();

		$term_id 	= (string)$term_id;
		$ar_locator = json_decode($locators);
					if(!$ar_locator || !isset($ar_locator[$locator_key])) {
						return null;
					}

		$locator 		= $ar_locator[$locator_key];
		$interview_id 	= $locator->section_top_id;
		$av_section_id 	= $locator->section_id;
		$tag_id   		= $locator->tag_id;


		#
		# INTERVIEW DATA
			$row_interview = $this->get_row_interview( $av_section_id, $interview_id );
				#dump($row_interview, ' $row_interview ++ '."av_section_id:$av_section_id, interview_id:$interview_id".to_string()); die();

			# If interview is empy, stop get data 
			if (empty($row_interview->result)) {
				$response = new stdClass();
					$response->result 	= false;
					$response->msg 		= 'Empty results';
				return $response;
			}

			# vars
			$interview_result 	= reset($row_interview->result);
			$interview_id 		= $interview_result['section_id'];
			$summary 	  		= $interview_result[FIELD_SUMMARY];
			$interview_date 	= $interview_result[FIELD_INTERVIEW_DATE];
			$interview_code 	= $interview_result[FIELD_CODE];

		#
		# AUDIOVISUAL DATA
			$row_audiovisual = $this->get_row_audiovisual( $av_section_id );
							if (empty($row_audiovisual->result)) {
								$video_view_data->result = false;
								return $video_view_data;
							}
							#dump($row_audiovisual, ' row_audiovisual ++ '.to_string( $av_section_id)); die();

			# vars
			$raw_text  = reset($row_audiovisual->result)[FIELD_TRANSCRIPTION];
			$video_url = reset($row_audiovisual->result)[FIELD_VIDEO];
				#dump($raw_text, ' raw_text ++ '.to_string($video_id)); die()

			#
			# raw_text_unrestricted
			$raw_text_unrestricted = $raw_text;

			#
			# Remove restricted fragments
			$raw_text = web_data::remove_restricted_text( $raw_text, $av_section_id );
				#dump($raw_text, ' $raw_text ++ '.to_string()); die();

		#
		# INFORMANT DATA
			#$ar_informant  = (array)json_decode( reset($row_interview->result)[FIELD_INFORMANT] );
			#$row_informant = !empty($ar_informant) ? $this->get_row_informant( reset($row_interview->result)['section_id'], $ar_informant ) : false;
						
			# vars
			/*
			$informant 	= '';
			if($row_informant) foreach ($row_informant->result as $key => $current_informant) {
				#dump($current_informant, ' current_informant ++ '.to_string());

				$informant .= isset($current_informant[FIELD_NAME]) ? $current_informant[FIELD_NAME] : '';
				$informant .= isset($current_informant[FIELD_SURNAME]) ? ' '.$current_informant[FIELD_SURNAME] : '';

				if($current_informant!=end($row_informant->result)) $informant .= ", ";
			}
			#dump($informant, ' current_informant ++ '.to_string()); die();
			*/
			#$informant = isset($row_informant->result) ? $row_informant->result : null;
			$informant = reset($row_interview->result)[FIELD_INFORMANT];

		#
		# IMAGE DATA
			#$ar_image  = (array)json_decode( reset($row_interview->result)[FIELD_IMAGE] );
			#$row_image = !empty($ar_image) ? $this->get_row_image( reset($row_interview->result)['section_id'], $ar_image ) : false;
			#$this->image = $row_interview->result
			#dump($row_image, ' row_image ++ '.to_string()); die();

			# vars
			$image_data = reset($row_interview->result)[FIELD_IMAGE];
			$image_url  = $this->get_image_url($image_data, $av_section_id);

		#
		# FRAGMENT DATA 
		# Create fragment and tesaurus associated
			$options = new stdClass();
				$options->tag_id 			 	= $tag_id;
				$options->av_section_id  	 	= $av_section_id;
				$options->component_tipo 	 	= DEDALO_COMPONENT_RESOURCES_AV_TIPO;
				$options->section_tipo 	 	 	= DEDALO_SECTION_RESOURCES_AV_TIPO;
				$options->video_url 	 	 	= $video_url; # Like 'http://mydomain.org/dedalo/media/av/404/'
				$options->margin_seconds_in  	= null;
				$options->margin_seconds_out 	= null;
				$options->raw_text 			 	= $raw_text;
				$options->fragment_terms_inside = false; # If true, calculate terms indexed inide this fragment 
				$options->indexation_terms 		= true; # If true, calculate all terms used in this indexation
			$fragments_obj = web_data::build_fragment( $options );				
				#dump($fragments_obj, ' fragments_obj ++ '.to_string( )); #die();		

		#
		# TS_TERM DATA
			$ts_term = ts_term::get_ts_term_instance($term_id);
			$ts_term->load_data(); // Force load db data
				#dump($ts_term, ' ts_term ++ '.to_string());
			$term = $ts_term->term;
				#dump($term, ' term ++ '.to_string()); die();

		#
		# SUBTITLES
			if ($this->add_subtitles===true) {
				$this->subtitles = $this->get_subtitles();				
			}


		#
		# AR_RESTRICTED_FRAGMENTS
			$ar_restricted_fragments = null;
			if (defined('TERM_ID_RESTRICTED') && !empty(TERM_ID_RESTRICTED)) {
				$ar_restricted_fragments = web_data::get_ar_restricted_fragments($av_section_id);
			}

		#
		# AR_KEY . For create nav elements
			$total 	= count($ar_locator);
			$key 	= (int)$locator_key;
			$ar_key = range(0, $total-1);


		# Add to object	self
			$this->result 			= true;
			$this->interview_id 	= $interview_id;	
			$this->av_section_id 	= $av_section_id;	
			#$this->video_url 		= $fragments_obj->video_url;
			$this->image_url 		= $image_url;
			#$this->tcin 			= $fragments_obj->tcin;
			#$this->tcout 			= $fragments_obj->tcout;
			#$this->tc_offset 		= 0;
			$this->terms 			= array();//$fragments_obj->terms;
			$this->informant 		= $informant;			
			$this->summary 			= $summary;
			$this->interview_date 	= $interview_date;
			$this->interview_code 	= $interview_code;
			$this->total 			= $total;
			$this->key 				= $key;
			$this->ar_key 			= $ar_key;
			$this->term_id 			= $term_id;
			$this->term 			= $term;
			#$this->fragment 			= TR::deleteMarks($fragments_obj->fragm, $deleteTC=true, $deleteIndex=true); //$fragments_obj->fragm;
			$options = new stdClass();
				$options->deleteTC 	  = true ;
				$options->deleteIndex = true ;
			#$this->fragment 				= $fragments_obj->fragment;	//TR::deleteMarks($fragments_obj->fragment); //$fragments_obj->fragm;
			$this->fragments 				= array($fragments_obj);	
			$this->ar_restricted_fragments 	= $ar_restricted_fragments;
			$this->raw_text 				= $raw_text;	
			$this->raw_text_unrestricted   	= $raw_text_unrestricted;


		return true;		
	}//end load_thesaurus_video_view_data



	/**
	* GET_SUBTITLES
	* @return array $ar_subtitles
	*/
	public function get_subtitles($av_section_id) {

		$ar_subtitles = array();
		
		// Get all diffusion langs
		$ar_langs = unserialize(DEDALO_DIFFUSION_LANGS);
		foreach ($ar_langs as $current_lang) {

			$name = DEDALO_COMPONENT_RESOURCES_AV_TIPO .'_'. AUDIOVISUAL_SECTION_TIPO .'_'. $av_section_id .'_'. $current_lang .'.'.DEDALO_AV_SUBTITLES_EXTENSION;
			
			$file_full_path = DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER . DEDALO_SUBTITLES_FOLDER . '/' . $name;
			if (!file_exists($file_full_path)) {
				# Force create file ??
			}else{
				$file_url 	= DEDALO_MEDIA_BASE_URL  . DEDALO_AV_FOLDER . DEDALO_SUBTITLES_FOLDER . '/' . $name;

				$lang_name = lang::get_name_from_code($current_lang, 'lg-eng');

				// Add to array
				$ar_subtitles[] = array(
					"url"  		=> $file_url,
					"lang" 		=> $current_lang,
					"lang_name" => $lang_name,
				);
			}
		}//end foreach ($ar_langs as $current_lang)


		return $ar_subtitles;
	}//end get_subtitles



	/**
	* GET_ROW_INTERVIEW
	* @return object $rows_data
	*/
	public function get_row_interview( $av_section_id, $interview_section_id=false ) {
		
		$options = new stdClass();
			$options->table 		= (string)TABLE_INTERVIEW;
			$options->ar_fields 	= array('*');
			$options->order 		= null;
			$options->lang 			= $this->lang;
			if ($interview_section_id) {
				$options->sql_filter = (string)"section_id = $interview_section_id" . PUBLICACION_FILTER_SQL;
			}else{
				$options->sql_filter = (string)"audiovisual LIKE '%\"$av_section_id\"%'" . PUBLICACION_FILTER_SQL;
			}

			// AND lang = '".$options->lang."' 
			// AND lang = '".$options->lang."' 

			# Resolve only some needed portals
			$options->resolve_portals_custom = json_decode('{
				"image" 	:"image",
				"informant" :"informant"
			}');	

			$rows_data	= (object)web_data::get_rows_data( $options );
				#dump($rows_data, ' rows_data ++ '.to_string());

		return $rows_data;
	}//end get_row_interview



	/**
	* GET_ROW_AUDIOVISUAL
	* @return object $rows_data
	*/
	public function get_row_audiovisual( $av_section_id ) {

		$options = new stdClass();
			$options->table 		= (string)TABLE_AUDIOVISUAL;
			$options->ar_fields 	= array(FIELD_VIDEO, FIELD_TRANSCRIPTION);
			$options->sql_filter 	= "section_id = $av_section_id". PUBLICACION_FILTER_SQL;
			$options->lang 			= $this->lang;
			$options->order 		= null;
			$options->limit 		= 1;	
			
			$rows_data = (object)web_data::get_rows_data( $options );

		return $rows_data;
	}//end get_row_audiovisual



	/**
	* GET_ROW_INFORMANT
	* @return object $rows_data
	*//*
	public function get_row_informant( $interview_section_id, $ar_informant) {

		$filter='';
		foreach ( (array)$ar_informant as $current_informate_id) {
			$filter .= " section_id = $current_informate_id OR";
		}
		$filter = '('.substr($filter, 0, -2) .')';

		$options = new stdClass();
			$options->table 		= (string)TABLE_INFORMANT;
			$options->ar_fields 	= array(FIELD_NAME,FIELD_SURNAME,FIELD_BIRTHDATE,FIELD_BIRTHPLACE);
			$options->lang 			= WEB_CURRENT_LANG_CODE;
			$options->order 		= null;
			$options->sql_filter 	= (string)$filter . PUBLICACION_FILTER_SQL;			

			$rows_data	= (object)web_data::get_rows_data( $options );			

		return $rows_data;
	}#end get_row_informant
	*/


	/**
	* GET_ROW_IMAGE
	* @return object $rows_data
	*//*
	public function get_row_image( $interview_section_id, $ar_image ) {	

		$options = new stdClass();
			$options->table 		= (string)TABLE_IMAGE;
			$options->ar_fields 	= array(FIELD_IMAGE);
			$options->sql_filter 	= (string)'section_id = '. reset($ar_image);
			$options->lang 			= WEB_CURRENT_LANG_CODE;
			$options->order 		= null;				
			#$options->limit 		= 1;
			
			$rows_data	= (object)web_data::get_rows_data( $options );

		return $rows_data;
	}#end get_row_image
	*/


	/**
	* GET_IMAGE_URL
	* @return string 
	*/
	public function get_image_url($image_data, $av_section_id) {
	
		$image_url = null;	//'../images/bg_foto_search_free.png'; // Default

		switch (true) {
			case (isset($this->image_type) && $this->image_type==='identify_image'):
				# IDENTIFY_IMAGE
				if (isset($image_data[0])) {
					$identify_image_url = $image_data[0][FIELD_IMAGE];
					$image_url = $identify_image_url;
				}				
				break;
			
			case (isset($this->image_type) && $this->image_type==='posterframe'):
			default:
				# POSTERFRAME
				$path = DEDALO_MEDIA_BASE_URL . DEDALO_AV_FOLDER .'/posterframe/'; // __CONTENT_BASE_URL__ .
				$name = DEDALO_COMPONENT_RESOURCES_AV_TIPO .'_'. AUDIOVISUAL_SECTION_TIPO .'_'. $av_section_id .'.'.DEDALO_AV_POSTERFRAME_EXTENSION; 
				$image_url = $path . $name;
				break;
		}
		#dump($image_url, ' $image_url ++ '.to_string());

		return $image_url;
	}//end get_image_url
	



}//end class video_view_data
?>