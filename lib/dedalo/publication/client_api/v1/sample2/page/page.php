<?php

# CONFIG
	#include(dirname(dirname(__FILE__)) . '/config/config.php');



# PAGE
	$cwd = basename(__DIR__);

	$page_title 	= $this->get_page_title();
	$css_links 		= $this->get_header_links('css'); 
	$js_links 		= $this->get_header_links('js');

	# header_html	
	ob_start();
	include ( dirname(__FILE__) .'/html/header.phtml' );
	$header_html = ob_get_clean();


	# content_html. Received as argument in render_page_html
	$content_html 	= $this->sanitize_html($content_html);

	# footer_html
	ob_start();
	include ( dirname(__FILE__) .'/html/footer.phtml' );
	$footer_html = ob_get_clean();

	#
	# HTML PAGE
	include( dirname(__FILE__) .'/html/' . $cwd . '.phtml');

?>