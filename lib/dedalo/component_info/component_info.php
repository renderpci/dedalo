<?php

	if(SHOW_DEBUG) $start_time=microtime(1);
	
	
	# CONTROLLER
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo 			= $this->get_section_tipo();
	$modo					= $this->get_modo();
	$lang					= $this->get_lang();
	$label 					= $this->get_label();
	$propiedades 			= $this->get_propiedades();
	$permissions			= common::get_permissions($tipo);
	$identificador_unico	= $this->get_identificador_unico();
	$id_wrapper 			= 'wrapper_'.$identificador_unico;
	$component_name			= get_class($this);
	$component_info 		= $this->get_component_info('json');
	$file_name				= $modo;

	if ($permissions<1) {
		return null;
	}

	if ($modo!='list' && !SHOW_DEBUG) {
		return null;
	}

	include_once( dirname(__FILE__) . '/widgets/class.widget.php' );

	$widgets = $propiedades;
	if (empty($widgets) || !is_array($widgets)) {
		debug_log(__METHOD__." Empty defined widgets for $component_name : $label ".to_string($widgets), logger::WARNING);
		return null;
	}

	#dump($widgets, ' widgets ++ '.to_string());
	$ar_widget_html=array();
	foreach ($widgets as $widget_obj) {
		
		$widget_obj->component_info = $this;

		$widget = widget::getInstance();
		$widget->configure($widget_obj);

		# Widget html
		$ar_widget_html[] = $widget->get_html();

	}//end foreach ($widgets as $widget)
	
	
	$page_html = dirname(__FILE__) . '/html/' . $component_name . '_' . $file_name . '.phtml';	
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}

	
	
?>