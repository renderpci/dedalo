<?php
/**
* INDEXATION_NODE
* Object like indexation
*
*/
class indexation_node {
	

	
	# Version. Important!
	static $version = "1.0.0"; // 05-06-2017


	public $term_id; 	// string like ts52
	public $locator; 	// object
	public $options;	// object
	


	/**
	* GET_INSTANCE
	* Singleton pattern
	* @returns array array of component objects by key
	*/
	public static function get_indexation_node_instance( $term_id, $locator, $request_options=null ) {

		if (!isset($locator->section_top_id) || !isset($locator->section_id) || !isset($locator->tag_id)) {
			return false;
		}
		
		return new indexation_node($term_id, $locator, $request_options);    	
	}//end get_ts_term_instance



	/**
	* __CONSTRUCT
	*/
	private function __construct( $term_id, $locator, $request_options ) {

		$this->term_id 	 = $term_id;
		$this->node_id 	 = $locator->section_top_id ;	//.'_'. $locator->section_id .'_'. $locator->tag_id;
		$this->locator 	 = $locator;
		$this->options 	 = $request_options;		
	}//end __construct



	/**
	* LOAD_DATA
	* @return bool
	*/
	public function load_data() {
		
		# Load image
		$this->image_url 	  = $this->get_image_url();
		# Create group locators used as param for link to video
		$this->group_locators = $this->get_group_locators(); /// UNACTIVE IN TEST MODE !!!! 
	}//end load_data



	/**
	* GET_IMAGE_URL
	* @return string 
	*/
	public function get_image_url() {
	
		$image_url = null;	//'../images/bg_foto_search_free.png'; // Default

		switch (true) {
			case (isset($this->image_type) && $this->image_type==='identify_image'):
				# IDENTIFY_IMAGE
				$identify_image_url = $this->get_identify_image_url();
				$image_url = $identify_image_url;
				break;
			
			case (isset($this->image_type) && $this->image_type==='posterframe'):
			default:
				# POSTERFRAME
				$path = DEDALO_MEDIA_BASE_URL . DEDALO_AV_FOLDER .'/posterframe/'; // __CONTENT_BASE_URL__ .
				$name = DEDALO_COMPONENT_RESOURCES_AV_TIPO .'_'. $this->locator->section_tipo .'_'. $this->locator->section_id .'.'.DEDALO_AV_POSTERFRAME_EXTENSION; 
				$image_url = $path . $name;
				break;
		}

		return $image_url;
	}//end get_image_url



	/**
	* GET_IDENTIFY_IMAGE_url
	* @return array of objects rows_data
	*/
	public function get_identify_image_url() {
		
		# Get interview 
		$row_interview_data = $this->get_row_interview_data();
			#dump($row_interview_data, ' row_interview_data ++ '.to_string());

		$ar_image = reset($row_interview_data->result)[FIELD_IMAGE];
		$ar_image = json_decode($ar_image);
			#dump($ar_image, ' ar_image ++ '.to_string());

		if (!$ar_image || empty($ar_image)) {
			return array();
		}

		$identify_image_url='';
		foreach ($ar_image as $section_id) {

			$options = new stdClass();
				$options->table 		= (string)TABLE_IMAGE;
				$options->ar_fields 	= array(FIELD_IMAGE);
				$options->order 		= null;
				$options->sql_filter 	= "section_id = ".$section_id . PUBLICACION_FILTER_SQL; // 				

			$rows_data = (object)web_data::get_rows_data( $options );
			if (!empty($rows_data->result)) {
				$identify_image_url = reset($rows_data->result)[FIELD_IMAGE];
			}
			break; // Only first is used
		}
		#dump($identify_image_url, ' identify_image_url ++ '.to_string()); die();

		return (string)$identify_image_url;
	}//end get_identify_image_url

	

	/**
	* GET_ROW_INTERVIEW_data
	* @return object rows_data
	*/
	public function get_row_interview_data() {
		
		$locator = $this->locator;

		$options = new stdClass();
			$options->table 		= (string)TABLE_INTERVIEW;
			$options->ar_fields 	= array(FIELD_IMAGE);
			$options->order 		= null;
			$options->sql_filter 	= "section_id = " . $locator->section_top_id . PUBLICACION_FILTER_SQL;

		$row_interview_data	= (object)web_data::get_rows_data( $options );
			#dump($row_interview_data, ' row_interview_data ++ '.to_string($options)); die();
		

		return $row_interview_data;
	}//end get_row_interview_data
	


	/**
	* GET_GROUP_LOCATORS
	* Select all locators cof current interview and sort with actual as first
	* @return array
	*/
	public function get_group_locators() {
		
		if (!isset($this->indexations)) {
			return array();
		}

		$indexations 	  = $this->indexations;		
		$locator 			  = $this->locator;
		$interview_section_id = $locator->section_top_id;

		$ar_locators_grouped=array();
		foreach ($indexations as $current_locator) {
			if ($current_locator->section_top_id == $interview_section_id) {
				/*
				if ($current_locator->section_top_tipo == $locator->section_top_tipo &&
					$current_locator->section_tipo == $locator->section_tipo &&
					$current_locator->section_id == $locator->section_id &&
					$current_locator->component_tipo == $locator->component_tipo &&
					$current_locator->tag_id == $locator->tag_id
					) {
					# Skip self locator
				}else{
					$ar_locators_grouped[] = $current_locator;
				}
				*/
				$ar_locators_grouped[] = $current_locator;			
			}
		}
		// Prepend main locatoer at begining of array
		#array_unshift($ar_locators_grouped, $locator);
			#dump($ar_locators_grouped, ' ar_locators_grouped ++ '.to_string());

		return $ar_locators_grouped;
	}//end get_group_locators	



}//end class indexation_node
?>