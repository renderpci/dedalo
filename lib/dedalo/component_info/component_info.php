<?php

	if(SHOW_DEBUG===true) $start_time=microtime(1);
	
	
	# CONTROLLER
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo 			= $this->get_section_tipo();
	$modo					= $this->get_modo();
	$lang					= $this->get_lang();
	$label 					= $this->get_label();
	$propiedades 			= $this->get_propiedades();
	$permissions			= $this->get_component_permissions();
	$identificador_unico	= $this->get_identificador_unico();
	$id_wrapper 			= 'wrapper_'.$identificador_unico;
	$component_name			= get_class($this);
	$component_info 		= $this->get_component_info('json');
	$file_name				= $modo;

	if($permissions===0) {
		debug_log(__METHOD__." Denied access to widget. Invalid permissions ".to_string($permissions), logger::DEBUG);
		return null;
	}

	
	# SHOW IN MODES
	$show_in_modes = isset($propiedades->show_in_modes) ? (array)$propiedades->show_in_modes : false;	
	if ($show_in_modes!==false && !in_array($modo, $show_in_modes)) {
		debug_log(__METHOD__." Prevented showing the widget. Ignored modo: ".to_string($modo), logger::DEBUG);
		return null;
	}	

	# CLASS WIDGETS
	include_once( dirname(__FILE__) . '/widgets/class.widget.php' );
	
	$widgets = isset($propiedades->widgets) ? $propiedades->widgets : null;
	if (empty($widgets) || !is_array($widgets)) {
		debug_log(__METHOD__." Empty defined widgets for $component_name : $label [$tipo] ".to_string($widgets), logger::WARNING);
		return null;
	}
	#dump($widgets, ' widgets ++ '.to_string());

	$widget_lang = isset($this->widget_lang) ? $this->widget_lang : DEDALO_DATA_LANG;
	$widget_mode = isset($this->widget_mode) ? $this->widget_mode : null;
	
	$ar_widget_html=array();
	$this->widgets = [];
	foreach ($widgets as $widget_obj) {
		#$start_time=microtime(1);
		
		$widget_obj->component_info = $this;

		$widget = widget::getInstance();
		$widget->configure($widget_obj);

		# Widget html
		$ar_widget_html[] = $widget->get_html( $widget_lang, $widget_mode );

		// store current widget
		$this->widgets[] = $widget;


		#$total = exec_time_unit($start_time);
		#debug_log(__METHOD__." total: $total - widget_name: ".to_string($widget_obj->widget_name), logger::WARNING);
	}//end foreach ($widgets as $widget)
	
	
	$page_html = dirname(__FILE__) . '/html/' . $component_name . '_' . $file_name . '.phtml';	
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}