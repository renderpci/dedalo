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


	/**
	* __CONSTRUCT
	* @return 
	*/
	public function __construct() {
		
		# CSS main
		page::$css_ar_url[] = __WEB_ROOT_WEB__ . '/page/css/page.css';

		# JS main
		page::$js_ar_url[] = __WEB_ROOT_WEB__ . '/common/js/common.js';
		#page::$js_ar_url[] = __WEB_ROOT_WEB__ . '/page/js/page.js';
		page::$js_ar_url[] = __WEB_ROOT_WEB__ . '/page/js/page.js.php';

		// Video js
		page::$css_ar_url[] = 'http://vjs.zencdn.net/6.2.7/video-js.css';
		page::$js_ar_url[]  = 'http://vjs.zencdn.net/6.2.7/video.js';

	}//end __construct()



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



}//end page
?>