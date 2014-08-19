<?php

	# CONTROLLER TOOL LANG

	$id 					= $this->source_component->get_id();
	$tipo 					= $this->source_component->get_tipo();
	$parent 				= $this->source_component->get_parent();
	$lang 					= $this->source_component->get_lang();
	$label 					= $this->source_component->get_label();
	$traducible 			= $this->source_component->get_traducible();
	$exists_dato_in_any_lang= $this->source_component->get_exists_dato_in_any_lang();

	$modo 					= $this->get_modo();
	$file_name 				= $modo;	


	switch($modo) {
		
		case 'button_inline':

					break;
		case 'button':
					# Si el component no tiene id, y no hay registross en ningún idioma,  NO se crea el html de tool 
					if($id==0 && $exists_dato_in_any_lang==false) return NULL;
					if ($traducible=='no') return NULL;				
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
					$this->get_ar_source_components();
					$this->get_ar_target_components();

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
					
					break;							
		
	}#end switch
		


		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/component_tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	include($page_html);
	
?>