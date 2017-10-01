<?php

# CONFIG
	include_once(dirname(dirname(__FILE__)) . '/config/config.php');
	#dump(WEB_AREA_NAME, 'WEB_AREA_NAME ++ '.to_string());


# PAGE
	$cwd = basename(__DIR__);

	$page_title 	= $this->get_page_title();
	$css_links 		= $this->get_header_links('css'); 
	$js_links 		= $this->get_header_links('js');

	# menu_html
	$menu_html = '';
	if ($this->row!==false) {

		$this->main_menu_data = $this->get_menu_terms();
		#dump($main_menu_data, ' $main_menu_data ++ '.to_string($this->term_id)); //die();

		ob_start();
		include ( dirname(__FILE__) .'/html/menu.phtml' );
		$menu_html = ob_get_clean();
	}


	# header_html
	$this->breadcrumb = $this->get_breadcrumb();	
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