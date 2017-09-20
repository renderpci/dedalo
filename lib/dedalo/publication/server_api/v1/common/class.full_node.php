<?php
/**
* FULL_NODE
* Object like free node results
* Every search free row generates an array of audiovisual rows. Each row is a free node
*/
class full_node {



	# Version. Important!
	static $version = "1.0.0"; //12-06-2017


	public $av_section_id; 	// int like 46
	#public $fragments;	// object



	/**
	* GET_INSTANCE
	* Singleton pattern
	* @returns array array of component objects by key
	*//*
	public static function get_full_node_instance( $term_id, $locator, $request_options=null ) {

		if (!isset($locator->section_top_id) || !isset($locator->section_id) || !isset($locator->tag_id)) {
			return false;
		}
		
		return new full_node($term_id, $locator, $request_options);    	
	}//end get_ts_term_instance */
	


	/**
	* __CONSTRUCT
	*/
	public function __construct( $av_section_id, $request_options ) {

		$this->av_section_id = $av_section_id;

		foreach ($request_options as $key => $value) {
			$this->$key = $value;
		}		
	}//end __construct



	/**
	* LOAD_DATA
	* @return bool
	*/
	public function load_data() {

		# REEL
		$row_audiovisual_data = $this->get_row_audiovisual_data( $this->av_section_id );
		$row_audiovisual 	  = reset($row_audiovisual_data->result);
			#dump($row_audiovisual, ' $row_audiovisual_data ++ '.to_string());
		# General info
		foreach ((array)$row_audiovisual as $field_name => $value) {			
			$this->$field_name = $value;
		}

		# INTERVIEW
		# Get interviews that contains this av_section_id as value in json_encoded column 'audiovisual'
		$row_interview_data = $this->get_row_interview_data( $this->av_section_id );
		$interview_data 	= reset($row_interview_data->result);
			#dump($row_interview_data, ' $row_interview_data ++ '.to_string());

		# General info
		foreach ((array)$interview_data as $field_name => $value) {
			if($field_name==='table' || $field_name==='lang' || $field_name==='publication' || $field_name==='images') continue;
			if ($field_name==='section_id') {
				$field_name = 'interview_section_id';
			}
			$this->$field_name = $value;
		}

		# IMAGE_URL
		$this->image_url = $this->get_image_url();

		# Restricted fragments
		$this->ar_restricted_fragments = web_data::get_ar_restricted_fragments( $this->av_section_id );

		# FRAGMENTS
		$FIELD_TRANSCRIPTION = FIELD_TRANSCRIPTION;
		$raw_text 			 = $this->$FIELD_TRANSCRIPTION;		
		$fragments 			 = $this->get_full_fragments( $raw_text );
		$this->fragments 	 = $fragments;

		# Terms
		if ($this->terms===true) {
			$this->terms = $this->get_fragment_terms( $this->av_section_id, $raw_text );
		}

		# Result for compatibility
		$this->result = true;
			dump($this, ' this ++ '.to_string());

		# ar key for compatibility
		$this->ar_key 	= json_decode($this->audiovisual);
		$this->key 		= $this->av_section_id;

		return true;
	}//end load_data



	/**
	* GET_ROW_AUDIOVISUAL_data
	* @return object $rows_data
	*/
	public function get_row_audiovisual_data( $av_section_id ) {

		$options = new stdClass();
			$options->table 		= (string)TABLE_AUDIOVISUAL;
			$options->ar_fields 	= array(FIELD_VIDEO, FIELD_TRANSCRIPTION, FIELD_DURATION);
			$options->sql_filter 	= "section_id = $av_section_id ";
			$options->lang 			= $this->lang;
			$options->order 		= null;
			$options->limit 		= 1;	
			
			$rows_data = (object)web_data::get_rows_data( $options );


		return $rows_data;
	}//end get_row_audiovisual_data



	/**
	* GET_ROW_INTERVIEW_data
	* @return object rows_data
	*/
	public function get_row_interview_data( $av_section_id ) {

		$ar_fields = array('*'); 	//array('section_id',code,title,abstract,country,autonomous_community,province,comarca);
		
		$options = new stdClass();
			$options->table 		 = (string)TABLE_INTERVIEW;
			$options->ar_fields 	 = $ar_fields;
			$options->lang 		 	 = $this->lang;
			$options->order 		 = null;
			$options->sql_filter 	 = FIELD_AUDIOVISUAL . " LIKE '%\"" . $av_section_id ."\"%'". PUBLICACION_FILTER_SQL;
			$options->limit 		 = 1;
			# Resolve only some needed portals
			$options->resolve_portals_custom = json_decode('{
				"image" 	:"image",
				"informant" :"informant"
			}');

		$row_interview_data	= (object)web_data::get_rows_data( $options );
			#dump(reset($row_interview_data->result), ' row_interview_data ++ '.to_string($options)); #die();


		return $row_interview_data;
	}//end get_row_interview_data



	/**
	* GET_FULL_FRAGMENTS
	* Resturns an array for maintain format, but only one fragment can exists
	* @return array $full_fragments
	*/
	public function get_full_fragments( $raw_text ) {
		
		# REMOVE_RESTRICTED_TEXT
		$raw_text_sure = web_data::remove_restricted_text( $raw_text, $this->av_section_id );
			#dump($raw_text_sure, ' $raw_text_sure ++ '.to_string());

		$fragm = TR::deleteMarks($raw_text_sure);
		
		$full_fragments = array();
		$obj = new stdClass();
			$obj->video_url = $this->video;
			$obj->fragm 	= $fragm;
			
		$full_fragments[] = $obj;


		return $full_fragments;
	}//end get_full_fragments



	/**
	* GET_FRAGMENT_TERMS
	* Search index tags intersected with current word position
	* @return 
	*/
	public function get_fragment_terms( $av_section_id, $raw_text ) {


		# FRAGMENT AFTER . Find index out tags on fragment_after text. 
		# For speed, is used fragment_after because normally is more short than fragment_before, but the result is the same
		$indexIn_pattern  = TR::get_mark_pattern('indexIn', $standalone=true, $id=false, $data=false);
		$indexOut_pattern = TR::get_mark_pattern('indexOut', $standalone=true, $id=false, $data=false);
			#dump($indexOut_pattern, ' indexOut_pattern ++ '.to_string());

		preg_match_all($indexIn_pattern, $raw_text, $indexIn_mathches);
			#dump($indexIn_mathches, ' indexIn_mathches ++ '.to_string($indexIn_pattern));

		preg_match_all($indexOut_pattern, $raw_text, $indexOut_mathches);
			#dump($indexOut_mathches, ' indexOut matches ++ '.to_string($indexOut_pattern));		

		$tag_number_key = 4;
		if (empty($indexIn_mathches[$tag_number_key]) || empty($indexOut_mathches[$tag_number_key])) {
			return array();
		}		
		$ar_indexIn_tag_id 	= $indexIn_mathches[$tag_number_key];
		$ar_indexOut_tag_id = $indexOut_mathches[$tag_number_key];
			#dump($ar_indexIn_tag_id, ' ar_indexIn_tag_id ++ '.to_string());
			#dump($ar_indexOut_tag_id, ' ar_indexOut_tag_id ++ '.to_string());

		$result = array_intersect($ar_indexIn_tag_id, $ar_indexOut_tag_id);
			#dump($result, ' array_intersect result ++ '.to_string());

		# Locator sample: {"section_top_tipo":"oh1","section_top_id":"1","section_tipo":"rsc167","section_id":"1","component_tipo":"rsc36","tag_id":"25"}
		$TRANSCRIPTION_TIPO 		= TRANSCRIPTION_TIPO;
		$AUDIOVISUAL_SECTION_TIPO 	= AUDIOVISUAL_SECTION_TIPO;
		$ar_termns = array();

		
		$ar_filter= array();
		foreach ($result as $tag_id) {
			$line = "`indexation` LIKE '%\"type\":\"dd96\",\"tag_id\":\"$tag_id\",\"section_id\":\"$av_section_id\",\"section_tipo\":\"$AUDIOVISUAL_SECTION_TIPO\"%' ";
			$ar_filter[] = $line;
		}
		$filter = "(".implode(" OR ", $ar_filter).")";

		$options = new stdClass();
				$options->table 		= (string)TABLE_THESAURUS;
				$options->ar_fields 	= array('term_id',FIELD_TERM);
				$options->lang 			= $this->lang;
				$options->order 		= null;
				$options->sql_filter 	= $filter;

		$rows_data	= (object)web_data::get_rows_data( $options );
				#dump($rows_data, ' rows_data ++ '.to_string($tag_id));

		foreach ($rows_data->result as $key => $value) {
			$term_id  	= $value['term_id'];
			if($term_id===TERM_ID_RESTRICTED) continue;
			$term 		= $value[FIELD_TERM];
			$ar_termns[$term_id] = $term;
		}
			

		/*
		foreach ($result as $key => $tag_id) {
			
			$options = new stdClass();
				$options->table 		= (string)TABLE_THESAURUS;
				$options->ar_fields 	= array('term_id',FIELD_TERM);
				$options->lang 			= WEB_CURRENT_LANG_CODE;
				$options->order 		= null;
				# {"type":"dd96","tag_id":"10","section_id":"9","section_tipo":"rsc167","component_tipo":"rsc36","section_top_id":"9","section_top_tipo":"oh1","from_component_tipo":"hierarchy40"}
				$options->sql_filter 	= (string)"`indexation` LIKE '%\"type\":\"dd96\",\"tag_id\":\"$tag_id\",\"section_id\":\"$av_section_id\",\"section_tipo\":\"$AUDIOVISUAL_SECTION_TIPO\"%' " . PUBLICACION_FILTER_SQL;

			$rows_data	= (object)web_data::get_rows_data( $options );
				#dump($rows_data, ' rows_data ++ '.to_string($tag_id));

			foreach ($rows_data->result as $key => $value) {
				$term_id  	= $value['term_id'];
				if($term_id===TERM_ID_RESTRICTED) continue;
				$term 		= $value[FIELD_TERM];
				$ar_termns[$term_id] = $term;
			}			
		
		}//end if (!empty($indexOut_mathches[0])) foreach ($indexOut_mathches as $key => $value) {
		#dump($ar_termns, ' ar_termns ++ '.to_string($options->sql_filter));
		*/

		# Sort terms
		natsort($ar_termns);


		return $ar_termns;
	}//end get_fragment_terms



	/**
	* GET_IMAGE_URL
	* @return string
	*/
	public function get_image_url() {
	
		$image_url = null;	//'../images/bg_foto_search_free.png'; // Default

		switch (true) {
			case (isset($this->image_type) && $this->image_type==='identify_image'):
				# IDENTIFY_IMAGE
				if (isset($this->image[0])) {
					$identify_image_url = $this->image[0][FIELD_IMAGE];
					$image_url = $identify_image_url;
				}				
				break;
			
			case (isset($this->image_type) && $this->image_type==='posterframe'):
			default:
				# POSTERFRAME
				$path = DEDALO_MEDIA_BASE_URL . DEDALO_AV_FOLDER .'/posterframe/'; // __CONTENT_BASE_URL__ .
				$name = DEDALO_COMPONENT_RESOURCES_AV_TIPO .'_'. AUDIOVISUAL_SECTION_TIPO .'_'. $this->av_section_id .'.'.DEDALO_AV_POSTERFRAME_EXTENSION; 
				$image_url = $path . $name;
				break;
		}

		return $image_url;
	}//end get_image_url

	

}//end class full_node
?>