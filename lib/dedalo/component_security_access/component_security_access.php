<?php
	
	# CONTROLLER
	
	$id 					= $this->get_id();				
	$tipo 					= $this->get_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$dato_string 			= substr($this->get_dato_as_string(),0,150);
	$lang 					= $this->get_lang();			
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($tipo);
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $id";
		
	$html_tools				= '';	
	$tree_html				= '';
	$html					= '';
	$caller_id 				= $this->get_caller_id();		
	$parent 				= $caller_id;
	$identificador_unico	= $this->get_identificador_unico();

	$component_name			= get_class($this);

	#$ar_tools_obj			= $this->get_ar_tools_obj();
	
	$file_name				= $modo;
		
		
	switch($modo) {
		
		case 'tool_time_machine'	:	
						$ar_css		= false;
						die("Dead here tm ");	
						break;
		
		case 'edit':	$id_wrapper 			= 'wrapper_'.$identificador_unico;
						$input_name 			= "{$tipo}_{$id}";

						$user_areas				= $this->get_user_authorized_areas();		#dump($user_areas,'user_areas',"",true); #die();	
						$ar_ts_childrens		= array();	
						if( is_array($user_areas)) foreach($user_areas as $terminoID ) {							
							
							$ar_ts_childrens[$terminoID] = component_security_access::get_ar_ts_childrens_recursive($terminoID);
								
							#$current[$terminoID] =	$ar_ts_childrens[$terminoID];
							#array_unshift($ar_ts_childrens[$terminoID], $current);	
							
							#	$ar_ts_childrens[$terminoID] = array($terminoID => $ar_ts_childrens);							
						}
						#dump($ar_ts_childrens,'ar_ts_childrens',"",true); #die();	

						#array_unshift($ar_ts_childrens[$terminoID], $terminoID);
						#dump($ar_ts_childrens); 
						#die();
						
						# Añadimos el propio termino como padre del arbol
						#$ar_ts_childrens = array($tipo => $ar_ts_childrens);
						

						#dump($ar_ts_childrens);	#die();	

						if( is_array($ar_ts_childrens)) foreach($ar_ts_childrens as $terminoID => $ar_tesauro ) {
							
							#print_r($ar_tesauro);
							#print_r($dato);
							
							$arguments['terminoID']			= $terminoID;
							$arguments['dato']				= $dato;
							$arguments['caller_id']			= $caller_id;
							$arguments['caller_tipo']		= $this->tipo;
							$arguments['id']				= $id;					#dump($arguments,'arguments');
							
							# TIME MACHINE VERSION
							$arguments['is_time_machine']	= false;
							$name_tm						= '';	
							if($modo=='tool_time_machine') {
								$arguments['is_time_machine']	= true;
								$name_tm						= '_tm';			
							}
							
							$arguments['open_group']		= "\n\n<ul class=\"menu\">";
							$arguments['open_term']			= "\n <!-- li $tipo -->\n <li class=\"expanded\">";
							
							$arguments['close_term']		= "\n </li>";
							$arguments['close_group']		= "\n</ul>";

							
							$termino = RecordObj_ts::get_termino_by_tipo($terminoID);
							$tree_html .= "\n <h3>$termino [$terminoID]</h3>";
							$tree_html .= "\n<ul class=\"security_access_column_view\" id=\"security_access_column_view{$name_tm}\">";
							$tree_html .= component_security_access::walk_ar_ts_childrens_recursive($ar_tesauro, $arguments);
							$tree_html .= "</ul><!-- /ul general -->";
							#$tree_html .= "<hr>";	
						}
						$ar_css		= $this->get_ar_css();
						#foreach($ar_tools_obj as $tool_obj) $html_tools .= $tool_obj->get_html();	

						#dump($tree_html,'','',true);
						break;

		
		case 'search' :	$ar_css		= false;		
						break;
						
		case 'list'	:	$ar_css		= false;
						break;
						
		
	}
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';	
	include($page_html);	
?>