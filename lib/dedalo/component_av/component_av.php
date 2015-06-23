<?php
	
	# CONTROLLER

	#$id 					= $this->get_id();
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$dato_reference_lang 	= NULL;
	$traducible 			= $this->get_traducible(); 
	$label 					= $this->get_label();			
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();	
	$permissions			= common::get_permissions($tipo);
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $tipo";		
	$html_tools				= '';
	$valor					= $this->get_valor();				
	$lang					= $this->get_lang();
	$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);

	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;

	$file_name				= $modo;
	$video_id 				= $this->get_video_id();
	$quality				= $this->get_quality();
	$video_url				= $this->get_video_url();
	
	#$coef 					= "2.3";
	#$video_width			= round(720/$coef) ;#.'px';
	#$video_height			= round(404/$coef) ;#.'px';

		#dump($video_width,$video_height);#round

	switch($modo) {	

		#case 'portal_edit'	:
		case 'edit'	:	$ar_css			= $this->get_ar_css();
						$id_wrapper 	= 'wrapper_'.$identificador_unico;
						$input_name 	= "{$tipo}_{$parent}";
						$component_info = $this->get_component_info('json');
											
						# POSTERFRAME HTML . Change temporally modo to get html
						#$this->modo 		= 'posterframe';
						#$posterframe_html 	= $this->get_html();
						$posterframe_html 	= '';
						
						# PLAYER HTML . Change temporally modo to get html
						#$this->modo 		= 'player_stand_alone';
						#$player_html 		= $this->get_html();

						# PLAYER HTML . Change temporally modo to get html
						$this->modo 		= 'posterframe';
						$player_html 		= $this->get_html();
						
						# restore modo
						$this->modo 	= 'edit';														
						break;

		case 'posterframe':
						# $posterframe_url 	= $this->get_posterframe_url();

						# PosterFrameObj		
						$PosterFrameObj 	= new PosterFrameObj($video_id);
						#$maxWidht 			= 313 ;
						#$maxHeight 		= 176 ;
						#$maxWidht 			= 720 ;
						#$maxHeight 		= 404 ;
						$maxWidht 			= 540 ;
						$maxHeight 			= 303 ;


						$posterframe_url 	= $PosterFrameObj->get_thumb_url($maxWidht, $maxHeight, $fx='crop').'&t='.start_time();									
						break;
		
		case 'player_posterframe':
						# LOAD MEDIA PLAYER ON IFRAME
						$reelID 	= $video_id;		#dump($reelID);
						if(empty($quality)) $quality = DEDALO_AV_QUALITY_DEFAULT;
						$iframe_url = DEDALO_LIB_BASE_URL . '/media_engine/av_media_player.php?reelID=' . $reelID .'&quality=' . $quality .'&modo=posterframe' ;
						$file_name = 'player';
						break;

		case 'player':	# LOAD MEDIA PLAYER ON IFRAME
						$reelID 	= $video_id;		#dump($reelID);
						if(empty($quality)) $quality = DEDALO_AV_QUALITY_DEFAULT;
						$iframe_url = DEDALO_LIB_BASE_URL . '/media_engine/av_media_player.php?reelID='.$reelID.'&quality='.$quality ;
						break;

		case 'player_stand_alone':

						$posterframe_url 	= $this->get_posterframe_url().'?&t='.start_time();					
						$player_id			= 'player_'.$video_id;

						
						$video_path = $this->get_video_path();
						#dump($video_path, ' video_path');

						# AUDIO FALLBACK

						$falback_quality = 'audio';
						if (!file_exists($video_path)) {
							$video_path = $this->get_video_path($falback_quality);
							if (file_exists($video_path)) {
								$this->set_quality($falback_quality);								
								// Update vars
								$video_url  	= $this->get_video_url();
								$quality		= $this->get_quality();
								$posterframe_url= DEDALO_LIB_BASE_URL.'/themes/default/0_audio.jpg';
							}
						}						
						break;
		
		case 'portal_list':
						$file_name 			= 'list';
		case 'list_tm':
						$file_name			= 'list';
		case 'list':	#$video_width		= intval(720/7) .'px';
						#$video_height		= intval(404/7) .'px';
						#$posterframe_url 	= $this->get_posterframe_url();

						# PosterFrameObj		
						$PosterFrameObj 	= new PosterFrameObj($video_id);
						$maxWidht 			= 102 ;
						$maxHeight 			= 57  ; # 90
						$posterframe_url 	= $PosterFrameObj->get_thumb_url($maxWidht, $maxHeight, $fx='crop');#.'&t='.start_time();
							#dump($posterframe_url,$video_id);
						break;

		case 'search':	return NULL;		
						break;
											
	}

	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>