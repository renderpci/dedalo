<?php

	# CONTROLLER TOOL LANG

	$id 					= $this->component_obj->get_id();
	$tipo 					= $this->component_obj->get_tipo();
	$parent 				= $this->component_obj->get_parent();
	$section_tipo 			= $this->component_obj->get_section_tipo();
	$lang 					= $this->component_obj->get_lang();
	$label 					= $this->component_obj->get_label();
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$component_name			= get_class($this->component_obj);
	$tool_name 				= get_class($this);
	$image_id 				= $this->component_obj->get_image_id();
	$quality 				= $this->component_obj->get_quality();
	$aditional_path 		= $this->component_obj->get_aditional_path();
	$initial_media_path 	= $this->component_obj->get_initial_media_path();
	$external_source 		= $this->component_obj->get_external_source();
	$modo 					= $this->get_modo();
	$file_name 				= $modo;	

	# TOOL CSS / JS MAIN FILES
	css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

	
	switch($modo) {	
		
		case 'button':
					#if (!file_exists( $this->component_obj->get_image_path() )) {
					#	return null;
					#}
					break;

		case 'page':

					# Because components are loaded by ajax, we need prepare js/css elements from tool
					#					
					# CSS
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/$component_name/css/$component_name.css";
						
					#
					# JS includes
						js::$ar_url[] = DEDALO_LIB_BASE_URL."/$component_name/js/$component_name.js";

					$this->component_obj->set_modo('edit');
					$thumb_html = $this->component_obj->get_html();

					$properties =  $this->component_obj->get_propiedades();

					$external_source_html = false;
					$external_source_active = false;
					if (isset($properties->external_source)) {
						
						$component_tipo 	= $properties->external_source;
						$component_model 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);

						$component 	= component_common::get_instance(	$component_model,
																	 	$component_tipo,
																	 	$parent,
																	 	'edit',
																	 	DEDALO_DATA_NOLAN,
																		$section_tipo);

						$external_source_html	= $component->get_html();

						$dato	= $component->get_dato();
						if($dato){
							$dato = reset($dato);
						}

						#dump(empty($dato->dataframe));
						if(!empty($dato->dataframe)){
							if(isset($dato->iri) && !empty($dato->iri)){
								$external_source_active = true;
							}
						}
			
					}
					
					$ar_quality			= unserialize(DEDALO_IMAGE_AR_QUALITY);

					$media_base_path 	= DEDALO_MEDIA_BASE_URL . DEDALO_IMAGE_FOLDER 	; //$this->component_obj->get_media_base_path(); //			
					$media_extension 	= DEDALO_IMAGE_EXTENSION ;
					break;				
		
	}#end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}	
?>