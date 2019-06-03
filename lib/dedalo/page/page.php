<?php

	# PAGE CONTROLLER

	$page_options_json = json_encode($page_options);

	$page_html	= dirname(__FILE__) . '/html/page.phtml';	
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid page file</div>";
	}
