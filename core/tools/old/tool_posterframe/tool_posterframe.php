<?php

	# CONTROLLER TOOL LANG

	#$id 					= $this->component_obj->get_id();
	$tipo 					= $this->component_obj->get_tipo();
	$parent 				= $this->component_obj->get_parent();
	$lang 					= $this->component_obj->get_lang();
	$label 					= $this->component_obj->get_label();
	$component_name			= get_class($this->component_obj);
	$tool_name 				= get_class($this);

	$video_id 				= $this->component_obj->get_video_id();
	$quality 				= $this->component_obj->get_quality();

	$modo 					= $this->get_modo();
	$file_name 				= $modo;	

	# TOOL CSS / JS MAIN FILES
	css::$ar_url[] = DEDALO_CORE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_CORE_URL."/tools/".$tool_name."/js/".$tool_name.".js";
	

	switch($modo) {	
		
		case 'button':
					if (!file_exists( $this->component_obj->get_video_path() )) {
						return null;
					}	
					break;

		case 'page':
					# MEDIA (PLAYER)
					$this->component_obj->set_modo('player_posterframe');
					$html_media_player_posterframe = $this->component_obj->get_html();

					# Because components are loaded by ajax, we need prepare js/css elements from tool
					#					
					# CSS
						css::$ar_url[] = DEDALO_CORE_URL."/$component_name/css/$component_name.css";
						
					#
					# JS includes
						js::$ar_url[] = DEDALO_CORE_URL."/$component_name/js/$component_name.js";

					# PosterFrameObj		
					$PosterFrameObj 	= new PosterFrameObj($video_id,$quality);
					$maxWidht 			= 125 ;
					$maxHeight 			= 70  ;
					#$posterframe_url 	= $PosterFrameObj->get_thumb_url($maxWidht, $maxHeight, $fx='crop').'&t='. start_time();
					$posterframe_url 	= $PosterFrameObj->get_url() . '?&t='.start_time();

					#
					# INDENTIFYING IMAGE
					$ar_identifying_image = $this->get_ar_identifying_image();										
					break;				
		
	}#end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_CORE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}	
?>