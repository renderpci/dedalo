<?php

	# CONTROLLER TOOL LANG

	$id 					= $this->component_obj->get_id();
	$tipo 					= $this->component_obj->get_tipo();
	$parent 				= $this->component_obj->get_parent();
	$lang 					= $this->component_obj->get_lang();
	$label 					= $this->component_obj->get_label();

	$video_id 				= $this->component_obj->get_video_id();
	$quality 				= $this->component_obj->get_quality();

	$modo 					= $this->get_modo();
	$file_name 				= $modo;	

		#dump($this->component_obj);

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

					# PosterFrameObj		
					$PosterFrameObj 	= new PosterFrameObj($video_id,$quality);
					$maxWidht 			= 125 ;
					$maxHeight 			= 70  ;
					$posterframe_url 	= $PosterFrameObj->get_thumb_url($maxWidht, $maxHeight, $fx='crop').'&t='. start_time();					
										
					break;				
		
	}#end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/component_tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	include($page_html);	
?>