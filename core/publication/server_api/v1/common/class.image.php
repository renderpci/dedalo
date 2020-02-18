<?php
/**
* image
* Object like free node results
* Every search free row generates an array of audiovisual rows. Each row is a free node
*/
class image {



	# Version. Important!
	static $version = "1.0.0"; //17-09-2018


	public $section_id; 	// int like 46
	public $description_with_images; 	// string 


	/**
	* __CONSTRUCT
	*/
	public function __construct( $section_id, $request_options ) {

		$this->section_id = $section_id;

		foreach ($request_options as $key => $value) {
			$this->$key = $value;
		}		
	}//end __construct



	/**
	* LOAD_DATA
	* @return bool
	*/
	public function load_data() {

		# IMAGE
		$row_image_data = $this->get_row_image_data( $this->section_id );
		$row_image 	  	= reset($row_image_data->result);
			#dump($row_image_data, ' row_image_data ++ '.to_string());
				
		# Set direct values
		foreach ($row_image as $key => $value) {
			$key = ($key==='description') ? 'description_raw' : $key;

			$this->{$key} = $value;
		}

		$description_raw = $this->description_raw;

		# Notes
		if ($this->add_notes===true) {
			// Remove non public notes only
			// $raw-text, $private=true, $public=true
			$description_raw = notes::remove_notes($description_raw, $private=true, $public=false);

			// Calculate notes info
			$this->notes_data = notes::get_notes_data($description_raw, $this->lang);

		}else{
			// Remove all notes
			// $raw-text, $private=true, $public=true
			$description_raw = notes::remove_notes($description_raw, $private=true, $public=true);
		}

		# Description with images
		if ($this->description_with_images===true) {			

			$options = new stdClass();
				$options->tag_url = $this->tag_url; //__CONTENT_BASE_URL__ . '/core/component_text_area/tag.php';
			$this->description_with_images = TR::addTagImgOnTheFly($description_raw, $options);
		}
		
		# Description clean text
		if ($this->description_clean===true) {
			$this->description_clean = TR::deleteMarks($description_raw);
		}
		

		return true;
	}//end load_data



	/**
	* GET_ROW_IMAGE_DATA
	* @return object $rows_data
	*/
	public function get_row_image_data( $section_id ) {

		$options = new stdClass();
			$options->table 		= (string)TABLE_IMAGE;
			#$options->ar_fields 	= array('image','title','footprint','description','dating');
			$options->ar_fields 	= array('*');
			$options->sql_filter 	= 'section_id = ' . (int)$section_id;
			$options->lang 			= $this->lang;
			$options->order 		= null;
			$options->limit 		= 1;	
			
			$rows_data = (object)web_data::get_rows_data( $options );


		return $rows_data;
	}//end get_row_image_data



	/**
	* GET_FULL_FRAGMENTS
	* Resturns an array for maintain format, but only one fragment can exists
	* @return array $full_fragments
	*/
	public function get_full_fragments( $raw_text ) {
		
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
		$draw_pattern  = TR::get_mark_pattern('draw', $standalone=true, $id=false, $data=false);
		
		preg_match_all($draw_pattern, $raw_text, $indexIn_mathches);		

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
				$path = DEDALO_MEDIA_URL . DEDALO_AV_FOLDER .'/posterframe/'; // __CONTENT_BASE_URL__ .
				$name = DEDALO_COMPONENT_RESOURCES_AV_TIPO .'_'. AUDIOVISUAL_SECTION_TIPO .'_'. $this->av_section_id .'.'.DEDALO_AV_POSTERFRAME_EXTENSION; 
				$image_url = $path . $name;
				break;
		}

		return $image_url;
	}//end get_image_url

	

}//end class image