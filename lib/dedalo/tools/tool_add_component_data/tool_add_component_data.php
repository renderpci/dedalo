<?php

	# CONTROLLER TOOL_ADD_COMPONENT_DATA

	$component_tipo	= $this->component_obj->get_tipo();
	$section_id		= $this->component_obj->get_parent();
	$section_tipo	= $this->component_obj->get_section_tipo();
	$lang			= $this->component_obj->get_lang();
	$label			= $this->component_obj->get_label();
	$traducible		= $this->component_obj->get_traducible();
	$tool_name		= get_class($this);
	$modo			= $this->get_modo();
	// $valor			= $this->component_obj->get_valor();
	$file_name		= $modo;


	# TOOL CSS / JS MAIN FILES
	css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";


	switch($modo) {
		
	
		case 'button':
					
			$line_lenght = 90;	// Default value is 90
			break;
		
		case 'page':

			$user_id	= navigator::get_user_id();
			$temp_id	= DEDALO_SECTION_ID_TEMP.'_'.$section_id.'_'.$user_id;

			if (empty($this->search_options)) {
				
				// total records
					$total_records = 0;

				// component
					$component_html = 'Empty section records selection';
			
			}else{

				// total records
					$total_records = (int)$this->search_options->search_query_object->full_count;

				// component
					$model		= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
					$component	= component_common::get_instance($model,
																 $component_tipo,
																 $temp_id,
																 'edit',
																 $lang,
																 $section_tipo);
					$component_html = $component->get_html();
			}
			break;		
	}//end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}