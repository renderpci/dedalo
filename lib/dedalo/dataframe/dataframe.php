<?php

	

	$modo 					= $this->get_modo();
	$file_name 				= $modo;
	$type					= $this->type;
	$ar_components_obj 		= $this->build_components($type);


	switch($modo) {

			case 'dataframe_edit' :
				
				break;

	}


	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>