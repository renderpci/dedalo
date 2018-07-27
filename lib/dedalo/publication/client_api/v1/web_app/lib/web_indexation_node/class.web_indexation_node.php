<?php
/**
* WEB_INDEXATION_NODE
* Object like indexation
*
*/
class web_indexation_node {
	

	
	# Version. Important!
	#static $version = "1.0.0"; // 05-06-2017
	static $version = "1.0.1"; // 03-03-2018


	/**
	* GET_INSTANCE
	* Singleton pattern
	* @returns array array of component objects by key
	*//*
	public static function get_index_node_instance( $term_id, $locator, $request_options=null ) {

		if (!isset($locator->section_top_id) || !isset($locator->section_id) || !isset($locator->tag_id)) {
			return false;
		}
		
		return new index_node($term_id, $locator, $request_options);    	
	}//end get_ts_term_instance
	*/



	/**
	* __CONSTRUCT
	*/
	public function __construct( $data ) {

		if (is_object($data)) {
			foreach ($data as $key => $value) {
				$this->$key = $value;
			}
		}else{
			dump($data, ' data ++ '.to_string());
		}

	}//end __construct



	/**
	* GET_HTML
	* @return string
	*/
	public function get_html( $mode ) {

		$this->mode = $mode;

		#
		# HTML BUFFER
		ob_start();
		include ( dirname(__FILE__) .'/web_indexation_node.php' );
		$html =  ob_get_clean();

		return $html;
	}//end get_html



	/**
	* GROUP_LOCATORS
	* Select all locators of current interview and sort with actual as first
	* @return null | array $ar_locators_grouped
	*//*
	public function group_locators() {

		if (!isset($this->options->group_locators)) {
			return null;
		}

		$group_locators = $this->options->group_locators;
		
		$locator 			  = $this->locator;
		$interview_section_id = $locator->section_top_id;

		$ar_locators_grouped=array();
		foreach ($group_locators as $current_locator) {
			if ($current_locator->section_top_id == $interview_section_id) {
				
				$ar_locators_grouped[] = $current_locator;			
			}
		}
		// Prepend main locatoer at begining of array
		#array_unshift($ar_locators_grouped, $locator);
			#dump($ar_locators_grouped, ' ar_locators_grouped ++ '.to_string());

		return $ar_locators_grouped;
	}//end group_locators	
	*/
	


	/**
	* GET_ROW_INTERVIEW
	* @return object rows_data
	*//*
	public function get_row_interview() {
		
		if (isset($this->row_interview)) {
			return $this->row_interview;
		}

		$locator = $this->locator;

		$options = new \stdClass();
			$options->table 		= (string)TABLE_INTERVIEW;
			$options->ar_fields 	= array('*');
			$options->order 		= null;
			$options->sql_filter 	= "section_id = $locator->section_top_id ". PUBLICACION_FILTER_SQL; // 				

			$rows_data	= (object)web_data::get_rows_data( $options );
				#dump($rows_data, ' rows_data ++ '.to_string());

		return $this->row_interview = $rows_data;
	}//end get_row_interview
	*/
	


	/**
	* GET_AR_ROW_IMAGE
	* @return array of objects rows_data
	*//*
	public function get_ar_row_image() {

		if (isset($this->ar_row_image)) {
			return $this->ar_row_image;
		}
		
		$row_interview = $this->get_row_interview();
			#dump($row_interview, ' row_interview ++ '.to_string());

		$ar_image = reset($row_interview->result)[COLUMN_IMAGE];
		$ar_image = json_decode($ar_image);
			#dump($ar_image, ' ar_image ++ '.to_string());

		if (!$ar_image || empty($ar_image)) {
			return array();
		}

		$ar_row_image=array();
		foreach ($ar_image as $section_id) {

			$options = new stdClass();
				$options->table 		= (string)TABLE_IMAGE;
				$options->ar_fields 	= array('*');
				$options->order 		= null;
				$options->sql_filter 	= "section_id = $section_id " . PUBLICACION_FILTER_SQL; // 				

			$ar_row_image[]	= (object)web_data::get_rows_data( $options );
		}

		return $this->ar_row_image = $ar_row_image;
	}//end get_ar_row_image
	*/



	/**
	* GET_IMAGE_URL
	* @return string 
	*//*
	public function get_image_url() {
		
		$image_url = null;	//'../images/bg_foto_search_free.png'; // Default

		$ar_row_image = $this->get_ar_row_image();
		foreach ($ar_row_image as $row_image) {

			if (!empty($row_image->result)) {
				$image_url = reset($row_image->result)[COLUMN_IMAGE];
				break; # first element
			}			
		}
		#dump($image_url, ' image_url ++ '.to_string($this->locator->section_top_id));

		return $image_url;
	}//end get_image_url
	*/



}//end class web_indexation_node
?>