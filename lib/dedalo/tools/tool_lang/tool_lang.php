<?php

	# CONTROLLER TOOL LANG

	#$id 					= $this->source_component->get_id();
	$tipo 					= $this->source_component->get_tipo();
	$parent 				= $this->source_component->get_parent();
	$section_id 			= $parent;
	$section_tipo 			= $this->source_component->get_section_tipo();
	$lang 					= $this->source_component->get_lang();
	$label 					= $this->source_component->get_label();
	$traducible 			= $this->source_component->get_traducible();	
	$tool_locator			= DEDALO_TOOL_INVESTIGATION_SECTION_TIPO.'_'.DEDALO_TOOL_TRANSLATE_ID;//
	$tool_name 				= get_class($this);
	$modo 					= $this->get_modo();
	$file_name 				= $modo;


	# TOOL CSS / JS MAIN FILES
	css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";


	switch($modo) {
		
		case 'button_inline':

					break;
		case 'button':
					# Si el component no tiene id, y no hay registros en ningún idioma,  NO se crea el html de tool 
					$component_ar_langs = $this->source_component->get_component_ar_langs();
						#dump($component_ar_langs,"component_ar_langs");

					if(empty($component_ar_langs)) {
						echo "";
						return NULL;
					}
					if ($traducible=='no') {
						return NULL;
					}				
					break;

		case 'selector_source':
					$ar_source_langs = $this->get_source_langs();				
					break;

		case 'selector_target':
					$target_lang 	 = $this->last_target_lang;	
					$ar_target_langs = $this->get_target_langs();	#dump($target_lang,'$target_lang');				
					break;
						
		case 'page':
					# SET SOURCE AND TARGET ARRRAY OF COMPONENTS
					#$this->get_ar_source_components();
					#$this->get_ar_target_components();
					
					# Because components are loaded by ajax, we need prepare js/css elements from tool
					#
					# CSS
						css::$ar_url[] = DEDALO_LIB_BASE_URL.'/component_text_area/css/component_text_area.css';
					#
					# JS includes
						js::$ar_url[] = DEDALO_LIB_BASE_URL.'/component_text_area/js/component_text_area.js';
					
					# COMPONENT SOURCE
					$component_obj_source_html = $this->source_component->get_html();
					
					# COMPONENT TARGET					
					$target_component 			= $this->get_target_component();

					# Fix current media component
					#$this->component_obj = $this->get_target_component();
						#dump($this->component_obj,'$this->component_obj');
								
					$component_obj_target_html 	= NULL;
					
					#if (!empty($target_component)) {
					#	# Set variant to configure 'identificador_unico' of current component
					#	$target_component->set_variant( tool_lang::$target_variant );
					#	$component_obj_target_html = $target_component->get_html();
					#}					

					# SOURCE SELECTOR
					$this->modo = 'selector_source';
					$selector_source_lang_html = $this->get_html();

					# TARGET SELECTOR
					$this->modo = 'selector_target';
					$selector_target_lang_html = $this->get_html();

					$this->modo = 'page';

					# HEADER TOOL
					#$this->set_modo('header');
					#$header_html 	= $this->get_html();
					#$this->set_modo('page');
					$header_html 	= '';

					$permissions = common::get_permissions($tipo);
						#dump($permissions," $tipo");

					#
					# STATE
					# Note: component_state is loaded by ajax because when target lang is changed (on change target lang selector),
					# component_state options tool lang must be updated to new lang					

					break;							
		
	}#end switch
		


		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
	
?>