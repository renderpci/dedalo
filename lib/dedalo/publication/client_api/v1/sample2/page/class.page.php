<?php
/**
* PAGE
* Html page object. Render all pages
*
*/
class page {


	# Version. Important!
	static $version = "1.0.0"; // 14-09-2017

	# css_ar_url : css files to include on render page
	static $css_ar_url = array();

	# JS_AR_URL : js files to include on render page
	static $js_ar_url = array();

	# TEMPLATE_AR_PATH : Templates to include on render page
	static $template_ar_path = array();

	# row
	public $row = false;

	# main_menu_data
	public $main_menu_data = false;

	# breadcrumb
	public $breadcrumb = false;

	# template_map
	public $template_map = false;


	/**
	* __CONSTRUCT
	* @return 
	*/
	public function __construct() {		
		$this->set_up();
	}//end __construct()



	/**
	* SET_UP
	* @return bool true
	*/
	private function set_up() {
		
		# CSS main
		page::$css_ar_url[] = __WEB_ROOT_WEB__ . '/page/css/page.css';

		# JS main
		page::$js_ar_url[] = __WEB_ROOT_WEB__ . '/common/js/common.js';
		#page::$js_ar_url[] = __WEB_ROOT_WEB__ . '/page/js/page.js';
		page::$js_ar_url[] = __WEB_ROOT_WEB__ . '/page/js/page.js.php';

		// Video js
		page::$css_ar_url[] = 'http://vjs.zencdn.net/6.2.7/video-js.css';
		page::$js_ar_url[]  = 'http://vjs.zencdn.net/6.2.7/video.js';

		$template_map 		= file_get_contents(WEB_TEMPLATE_MAP);
		$this->template_map = json_decode($template_map);
			#dump($template_map, ' $template_map ++ '.to_string());

		return true;
	}//end set_up



	/**
	* RENDER_PAGE_HTML
	* Render page
	* @return string $html
	*/
	public function render_page_html( $content_html ) {
		
		ob_start();
		include ( __WEB_BASE_PATH__ . '/page/page.php');
		$html = ob_get_clean();		
		
		return $html;
	}//end render_page_html



	/**
	* CONTENT_HTML
	* @return 
	*//*
	public function content_html() {
		$html = '';
		foreach (page::$template_ar_path as $template_path) {
			ob_start();
			if(!include( $template_path) ){
				error_log("Error on oad template: $template_path");
			}
			$html .= ob_get_clean();
		}

		return $html;
	}//end content_html*/



	/**
	* SANITIZE_HTML
	* @return string $html
	*/
	public function sanitize_html( $html ) {
		

		return $html;
	}//end sanitize_html



	/**
	* GET_HEADER_LINKS
	* @return string $html
	*/
	public function get_header_links($type) {
		
		$html = '';
		switch ($type) {
			case 'css':
				foreach (page::$css_ar_url as $url) {
					$html .= self::build_css_tag($url);
				}
				break;
			
			case 'js':
				foreach (page::$js_ar_url as $url) {
					$html .= self::build_js_tag($url);
				}
				break;
		}
		

		return $html;
	}//end get_header_links



	/**
	* BUILD_CSS_TAG
	* @return string $tag
	*/
	static function build_css_tag($url, $media=null) {

		if (defined('USE_CDN') && USE_CDN!==false) {
			$url = USE_CDN . $url;
		}

		# Add version
		$url = $url.'?'.WEB_VERSION;


		$media_attr='';
		if (!is_null($media)) {
			$media_attr = " media=\"$media\"";  // Like screen
		}	

		$tag = "\n<link href=\"$url\" rel=\"stylesheet\"{$media_attr}>";

		return $tag;
	}//edn build_css_tag



	/**
	* BUILD_JS_TAG
	* @return string $tag
	*/
	static function build_js_tag($url, $media=null) {

		if (defined('USE_CDN') && USE_CDN!==false) {
			$url = USE_CDN . $url;
		}

		# Add version
		$url = $url.'?'.WEB_VERSION;


		$media_attr='';
		if (!is_null($media)) {
			$media_attr = " media=\"$media\"";  // Like screen
		}	

		$tag = "\n<script src=\"$url\"></script>";

		return $tag;
	}//edn build_js_tag



	/**
	* GET_PAGE_TITLE
	* @return string $title
	*/
	public function get_page_title($title='No title') {
		
		return $title;
	}//end get_page_title



	


	/**
	* GET_MENU_TERMS
	* @return 
	*/
	public function get_menu_terms( $parent=null ) {

		if ($this->row===false) {
			return false;
		}
	
		$parent = $this->row->term_id;
		/*		
			# Search ccurrent term
			$options = new stdClass();
				$options->dedalo_get 		= 'records';
				$options->lang 				= WEB_CURRENT_LANG_CODE;
				$options->table 			= $table;
				$options->ar_fields 		= array('term_id');
				$options->sql_filter 		= "web_path = '{$web_path}'";
				$options->limit 			= 1;

				# Http request in php to the API
				$term_data = json_web_data::get_data($options);
				if (empty($term_data->result)) {
					return false;
				}else{
					$parent = reset($term_data->result)->term_id;
				}
				#dump($parent, ' parent ++ '.to_string());
				*/
		# Search childrens
		$ar_fields = array(		
        	//"section_id",
        	"term_id",
        	"term",
        	"web_path",
        	"titulo",
        	"parent",
        	//"childrens",
        	//"norder"           
		);

		$options = new stdClass();
			$options->dedalo_get 	= 'records';
			$options->lang 			= WEB_CURRENT_LANG_CODE;
			$options->table 		= WEB_MENU_TABLE;
			$options->ar_fields 	= $ar_fields;
			$options->sql_filter 	= "parent = '{$parent}'";
			$options->order 		= 'norder ASC';	

		# Http request in php to the API
		$data = json_web_data::get_data($options);
			#dump($data, ' data ++ '.to_string($options));
		
		$main_menu_data = (array)$data->result;
		#$main_menu_data = reset($main_menu_data);
			#dump($main_menu_data, ' main_menu_data ++ '.to_string());

		return $main_menu_data;
	}//end get_menu_terms



	/**
	* GET_TEMPLATE_NAME
	* @return string $template_name
	*/
	public static function get_template_name($web_path) {
		
		$template_name = null;

		// Modelo name
		switch ($web_path) {
			case null:
				$template_name = 'error';
				break;				
			case 'main_home':
				$template_name = 'main_home';
				break;
			default:
				$template_name = 'site_home';
				break;
		}
		

		return $template_name;
	}//end get_template_name



	/**
	* GET_BREADCRUMB
	* @return 
	*/
	public function get_breadcrumb() {

		if (!isset($this->row->term_id)) {
			return false;
		}

		$term_id = $this->row->term_id;
		
		$options = new stdClass();
			$options->dedalo_get 	= 'thesaurus_parents';
			$options->term_id 		= $term_id;
			$options->recursive 	= true;
			$options->lang 			= WEB_CURRENT_LANG_CODE;
			$options->ar_fields		= array(
				"term_id",
	        	"term",
	        	"web_path",
	        	"titulo",
	        	"parent"
			);
			#$options->ar_fields		= array('*');
			
		# Http request in php to the API
		$data = json_web_data::get_data($options);
			#dump($data, ' data ++ '.to_string($options));

		$breadcrumb = array_reverse($data->result);

		
		$object = new stdClass();
		foreach ($options->ar_fields as $key => $name) {
			$object->{$name} = $this->row->{$name};
		}

		# Add self
		$breadcrumb[] = $object;
			#dump($options->ar_fields, ' options->ar_fields ++ '.to_string($this->row));


		return $breadcrumb;
	}//end get_breadcrumb



	/**
	* GET_COLUMN_VALUE
	* @return 
	*/
	public function get_column_value( $column_obj ) {
		$value = false;

		if (property_exists($this->row, $column_obj->colname)) {
			$value = $this->row->{$column_obj->colname};	
		}

		# Postprocess some complex elements
		switch ($column_obj->type) {
			case 'image':
				$value = $this->get_image_value($value, $column_obj);
				break;
			case 'portal':
				#$value = $this->get_portal_value($value, $column_obj);
				break;	
		}
		

		return $value;
	}//end get_column_value




	/**
	* GET_IMAGE_VALUE
	* @return 
	*/
	public function get_image_value($value, $column_obj) {

		$image_url = false;

		if ($value==='[]' || !$ar_value=json_decode($value)) {
			return $image_url;
		}
		#dump($ar_value, ' ar_value ++ '.to_string());
		#dump($column_obj, ' column_obj ++ '.to_string());		

		$options = new stdClass();
			$options->dedalo_get 		= 'records';
			$options->lang 				= WEB_CURRENT_LANG_CODE;
			$options->table 			= $column_obj->target->table;
			$options->ar_fields 		= array($column_obj->target->colname);
			$options->sql_filter 		= "section_id = '".reset($ar_value)."'";
			$options->limit 			= 1;

		# Http request in php to API
		$data = json_web_data::get_data($options);
			#dump($data, ' data ++ '.to_string($options));
		if (!empty($data->result)) {
			$image_url = reset($data->result)->{$column_obj->target->colname};
		}
		#dump($data->result, ' image_url ++ '.to_string());
		
		return $image_url;
	}//end get_image_value



	/**
	* GET_portal_VALUE
	* @return 
	*/
	public function get_portal_value($value, $column_obj) {

		$image_url = false;

		if ($value==='[]' || !$ar_value=json_decode($value)) {
			return $image_url;
		}
		#dump($ar_value, ' ar_value ++ '.to_string());
		#dump($column_obj, ' column_obj ++ '.to_string());		

		$options = new stdClass();
			$options->dedalo_get 		= 'records';
			$options->lang 				= WEB_CURRENT_LANG_CODE;
			$options->table 			= $column_obj->target->table;
			$options->ar_fields 		= array($column_obj->target->colname);
			$options->sql_filter 		= "section_id = '".reset($ar_value)."'";
			#$options->limit 			= 1;

		# Http request in php to API
		$data = json_web_data::get_data($options);
			dump($data, ' data ++ '.to_string($options));
		if (!empty($data->result)) {
			$image_url = reset($data->result)->{$column_obj->target->colname};
		}
		#dump($data->result, ' image_url ++ '.to_string());
		
		return $image_url;
	}//end get_portal_value





}//end page
?>