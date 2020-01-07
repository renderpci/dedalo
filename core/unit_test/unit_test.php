<?php
// PAGE CONTROLLER



// not logged
	if (login::is_logged()!==true) {
		exit("Error: Login please");
	}//end if (login::is_logged()!==true)



// load base html
	$page_html = dirname(__FILE__) . '/html/unit_test.phtml';
	if( !include($page_html) ) echo "<div class=\"error\">Invalid page file</div>";
