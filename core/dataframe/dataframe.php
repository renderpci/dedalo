<?php

	

	$mode 					= $this->get_mode();
	$file_name 				= $mode;
	$type					= $this->type;
	$ar_components_obj 		= $this->build_components($type);


	switch($mode) {

			case 'dataframe_edit' :
				
				break;

	}


	$page_html	= DEDALO_CORE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->mode</div>";
	}
?>