<?php

	#CONTROLER

	$tipo			= $this->tipo;
	$section_tipo 	= $this->section_tipo;
	$section_id 	= $this->section_id;
	$modo 			= $this->modo;
	$value_resolved	= $this->value_resolved;
	$limit			= $this->limit;
	$offset			= $this->offset;
	$count			= $this->count;
	$permissions	= common::get_permissions($section_tipo, $tipo);
	$json 			= null;

	if($permissions===0) return false;

	$file_name = $modo;

		switch($modo) {
			
			case 'button':

				break;	
		}

	$page_html	= dirname(__FILE__) . '/html/time_machine_list'  . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>