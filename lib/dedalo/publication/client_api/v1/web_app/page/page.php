<?php

# CONFIG
	#include_once(dirname(dirname(__FILE__)) . '/config/config.php');
	#dump(WEB_AREA_NAME, 'WEB_AREA_NAME ++ '.to_string());


# PAGE
	$cwd = basename(__DIR__);

	$page_title 	= $this->get_page_title();
		
	#
	# header_html
	if (isset($options->header_html)) {
		# Custom precalculated
		$header_html 	= $options->header_html;
	}else{
		# Default option
		$header_html 	= $this->get_header_html();
	}

	#
	# content_html. Received as argument in render_page_html
	if (isset($options->content_html)) {
		# Custom precalculated	
		$content_html 	= $this->sanitize_html($options->content_html);
	}else{
		# Default option
		$content_html 	= "Empty content page";
	}	

	#
	# footer_html
	if (isset($options->footer_html)) {
		# Custom precalculated
		$footer_html 	= $options->footer_html;
	}else{
		# Default option
		$footer_html 	= $this->get_footer_html();
	}

	$css_links 		= $this->get_header_links('css'); 
	$js_links 		= $this->get_header_links('js');

	#
	# HTML PAGE
	include( dirname(__FILE__) .'/html/' . $cwd . '.phtml');

?>