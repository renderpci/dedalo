<?php

	# CONTROLLER

	#$id 					= $this->get_id();
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo 			= $this->get_section_tipo();
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
	#$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$widht 					= $this->get_widht();
	$height 				= $this->get_height();


	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;

	$file_name				= $modo;
	$image_id 				= $this->get_image_id();
	$quality				= $this->get_quality();
	$aditional_path			= $this->get_aditional_path();
	$initial_media_path		= $this->get_initial_media_path();
	$image_url				= $this->get_image_url();

	#dump("$id,$tipo,$parent");

	switch($modo) {

		case 'edit'	:	
				#
				# JS includes additionals
				#	js::$ar_url[] = DEDALO_LIB_BASE_URL.'/component_image/js/component_image_read.js';
					js::$ar_url[] = PAPER_JS_URL;
					js::$ar_url[] = DEDALO_LIB_BASE_URL . '/component_image/js/component_image_read.js' ;
				
				$ar_css			= $this->get_ar_css();
				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$component_info = $this->get_component_info('json');

				#
				# THUMB . Change temporally modo to get html
					$this->modo 	  = 'thumb';
					$image_thumb_html = $this->get_html();					
					$this->modo 	  = 'edit'; # restore modo

				break;

		case 'player':
				#
				# JS includes additionals
					js::$ar_url[] = PAPER_JS_URL;

				$this->modo 	= 'edit_canvas';
				$file_name		= $this->modo;				

		case 'edit_canvas'	:
				$ar_css		= $this->get_ar_css();
				$id_wrapper = 'wrapper_'.$identificador_unico;
				
				$img_src 	= $this->ImageObj->get_url();
					#dump($img_src,'igm-src');

				# IMG : Dimensions w/h
				$image_dimensions 	= $this->ImageObj->get_image_dimensions();
					#dump($image_dimensions,'image_dimensions');
				$img_width  = $image_dimensions[0];
				$img_height = $image_dimensions[1];

				break;

		case 'thumb':
				# ImageObj				
				$maxWidht 	= $widht ;
				$maxHeight 	= $height  ;
				$image_url	= $this->ImageObj->get_thumb_url($maxWidht, $maxHeight, 'resize', null, 'height');	#$m $maxWidht, $maxHeight, $fx=null, $p=null, $prop=null
					#dump($ImageObj,'$ImageObj');
				
				# Force refresh always 
				$image_url	.= '&t=' . start_time();

				# IMG : Dimensions w/h
				$image_dimensions 	= $this->ImageObj->get_image_dimensions();
					#dump($image_dimensions,'image_dimensions');
				$img_width  = $image_dimensions[0];
				$img_height = $image_dimensions[1];
					#dump($image_dimensions ,'$image_dimensions ');

				break;

		case 'portal_list':
				# JS includes
					js::$ar_url[] = DEDALO_LIB_BASE_URL.'/component_image/js/component_image_read.js';

		case 'list_tm':
				$file_name = 'list';
		case 'list':
	
				# ImageObj				
				$maxWidht 	= 102 ;
				$maxHeight 	= 57  ; # 57
				#$image_url	= $this->ImageObj->get_thumb_url($maxWidht, $maxHeight, $fx='crop');
					#die($aditional_path.'/'.$image_id.'.'.DEDALO_IMAGE_EXTENSION);
				$f = $aditional_path.'/'.$image_id.'.'.DEDALO_IMAGE_EXTENSION;
				if(strpos($f, '/')===0) $f = substr($f, 1);	
				$image_url		= ImageMagick::get_thumb('list',$f, true, $initial_media_path);	// $mode, $f, $verify=true, $initial_media_path
				$image_full_url = $this->ImageObj->get_url();

				# Url del thumb si estuviera creado (si no lo está se redirecciona a 'themes/default/0.jpg')
				$thumb_file_url 	= DEDALO_MEDIA_BASE_URL.DEDALO_IMAGE_FOLDER.'/'.DEDALO_IMAGE_THUMB_DEFAULT.'/'.$f;
				$objetive_thumb_url = $thumb_file_url;
					#dump($objetive_thumb_url," objetive_thumb_url");
				
				#if (!file_exists(DEDALO_ROOT.'/'.$thumb_file_url)) {
				#	return null;
				#}

				break;

		case 'list_ts':
				# ImageObj				
				$maxWidht 	= 74 ;
				$maxHeight 	= 42  ;
				$image_url	= $this->ImageObj->get_thumb_url($maxWidht, $maxHeight, $fx='crop');
				break;

		case 'search':
				return NULL;
				break;

	}

	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';	
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>
