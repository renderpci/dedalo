<?php

	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo 			= $this->get_section_tipo();
	$modo					= $this->get_modo();
	$dato 					= $this->get_dato();
	$traducible 			= $this->get_traducible();
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= $this->get_component_permissions();
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $tipo";
	$valor					= $this->get_valor();
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$widht 					= $this->get_widht();
	$height 				= $this->get_height();

	if($permissions===0) return null;

	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL;

	$file_name				= $modo;
	$image_id 				= $this->get_image_id();
	$quality				= $this->get_quality();
	$aditional_path			= $this->get_aditional_path();
	$initial_media_path		= $this->get_initial_media_path();
	$external_source		= $this->get_external_source();

	switch($modo) {

		case 'edit_in_list':
				// Fix always edit as modo / filename
				$modo 			= 'edit';
				$file_name		= 'edit';

				$wrap_style 	= '';	// 'width:100%'; // Overwrite possible custon component structure css
				// Dont break here. Continue as modo edit

		case 'edit'	:
			#
			# JS includes additionals (!) Moved to init js
				#js::$ar_url[] = PAPER_JS_URL;
				#js::$ar_url[] = DEDALO_LIB_BASE_URL . '/component_image/js/component_image_read.js' ;

			$id_wrapper 	= 'wrapper_'.$identificador_unico;
			$component_info = $this->get_component_info('json');

			#
			# IMAGE FOR CANVAS
				if (!empty($external_source)) {

					$image_url	= $external_source;

					$original_img_width  = '';
					$original_img_height = '';

				}else{
					# ImageObj
					$maxWidht 	= $widht ;
					$maxHeight 	= $height  ;
					$image_url	= $this->ImageObj->get_thumb_url($maxWidht, $maxHeight, 'resize', null, 'height');	#$m $maxWidht, $maxHeight, $fx=null, $p=null, $prop=null
						#dump($ImageObj,'$ImageObj');

					# Force refresh always
					$image_url	.= '&t=' . start_time();

					# IMG : Dimensions w/h
					$image_dimensions 	= $this->ImageObj->get_image_dimensions();
						#dump($image_dimensions, ' image_dimensions ++ '.to_string());

					$original_img_width  = $image_dimensions[0] ?? null;
					$original_img_height = $image_dimensions[1] ?? null;
				}

				# Related components
				$ar_related_component_tipo 		= $this->get_ar_related_component_tipo();
				$ar_related_component_tipo_json = json_encode($ar_related_component_tipo);
				break;

		case 'portal_list':
		case 'portal_list_view_mosaic':

				$file_name		= 'portal_list';
				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$component_info = $this->get_component_info('json');

				if (!empty($external_source)) {

					//$thumb_file_url	= $external_source;
					$thumb_path 	= $external_source;
					$image_full_url = $external_source;

				}else{

					#
					# DEFAULT QUALITY IMAGE URL (onclick go to)
					$this->ImageObj->set_quality(DEDALO_IMAGE_QUALITY_DEFAULT); // Force default quality always
					$image_full_url = $this->ImageObj->get_url();
					#dump($this->ImageObj, ' ImageObj ++ '.to_string());

					#
					# THUMB URL
					$thumb_path 	= $this->get_thumb_path();
					$thumb_file_url = $this->get_thumb_url();
				}
				break;

		case 'player':
				#
				# JS includes additionals
					js::$ar_url[] = PAPER_JS_URL;

				$this->modo 	= 'edit_canvas';
				$file_name		= $this->modo;

		case 'edit_canvas'	:
				$id_wrapper = 'wrapper_'.$identificador_unico;

				$img_src 	= $this->ImageObj->get_url();
					#dump($img_src,'igm-src');

				# IMG : Dimensions w/h
				$image_dimensions 	= $this->ImageObj->get_image_dimensions();
					#dump($image_dimensions,'image_dimensions');
				$img_width  = $image_dimensions[0];
				$img_height = $image_dimensions[1];

				# Related components
				$ar_related_component_tipo 		= $this->get_ar_related_component_tipo();
				$ar_related_component_tipo_json = json_encode($ar_related_component_tipo);
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

		case 'list_tm':
				# THUMB PATH . Is calculated reading deleted folder inside thumb quality
				$image_id   = $this->get_image_id();
				$thumb_path = $this->get_deleted_image($quality='thumb');
					#dump($thumb_path, ' thumb_path ++ '.to_string($image_id));

				# THUMB URL
				$thumb_file_url = str_replace(DEDALO_MEDIA_BASE_PATH, DEDALO_MEDIA_BASE_URL, $thumb_path);
				# IMAGE_FULL_URL
				$image_full_url = str_replace('/'.DEDALO_IMAGE_THUMB_DEFAULT.'/', '/'.DEDALO_IMAGE_QUALITY_DEFAULT.'/', $thumb_file_url);
				break;

		case 'list':
				#
				# DEFAULT QUALITY IMAGE URL (onclick go to)
				$this->ImageObj->set_quality(DEDALO_IMAGE_QUALITY_DEFAULT); // Force default quality always

				if (!empty($external_source)) {

					//$thumb_file_url	= $external_source;
					$thumb_path 	= $external_source;
					$image_full_url = $external_source;
					$thumb_file_url = $external_source;

				}else{

					$image_full_url = $this->ImageObj->get_url();
						#dump($this->ImageObj, ' ImageObj ++ '.to_string());

					#
					# THUMB URL
					$thumb_path = $this->get_thumb_path();
					if (!file_exists($thumb_path)) {
						return null;
					}
					$thumb_file_url = $this->get_thumb_url();
				}
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

		case 'print':
				$image_url = $this->get_image_url();	// With '0.jpg' fallback
				break;
	}

	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}


