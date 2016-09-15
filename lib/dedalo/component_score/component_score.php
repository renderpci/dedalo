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
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $tipo";
	$valor					= $this->get_valor();
	$lang					= $this->get_lang();
	#$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);

	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;

	$file_name = $modo;


	

	switch($modo) {

		case 'edit':
					# JS includes
						# MIDI
						js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/vexflow/MIDI/MIDI.min.js';
						# MIDI BYNARY
						js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/vexflow/MIDI/inc/base64binary.js';
						# VEXFLOW
						js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/vexflow/vexflow/vexflow-min.js';
						# UNDERSCORE
						js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/vexflow/vextab/support/underscore-min.js';
						# TAB-DIV
						js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/vexflow/vextab/tabdiv-min.js';
						# PLAYER
						js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/vexflow/vextab/output/player.js';


					#dump($this);
					$textarea_rel_tipo = $this->get_rel_textarea();

					$id_wrapper 	= 'wrapper_'.$identificador_unico;
					$canvas_id  	= 'canvas_'.$identificador_unico;
					$div_error_id 	= 'div_error_'.$identificador_unico;
					$aditional_css  = '';
					$component_info 	= $this->get_component_info('json');
					break;

		case 'player':						
					break;
		
		case 'portal_list':
		case 'list_tm':						
		case 'list':
					$file_name = 'list';
					break;

		case 'search':
					# Search input name
					$search_input_name = $section_tipo.'_'.$tipo;
					return null;
					break;

	}

	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}


?>