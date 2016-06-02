<?php


	return null;
	

	
	# CONTROLLER						
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$modo					= $this->get_modo();	
	$section_tipo 			= $this->get_section_tipo();		
	$lang 					= $this->get_lang();			
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $tipo";
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);	
	$file_name				= $modo;


	switch($modo) {
				
		case 'edit':	

				$dato 				= $this->get_dato();
				$dato_string 		= substr( json_encode($dato) ,0,150);				
				$id_wrapper 		= 'wrapper_'.$identificador_unico;
				$input_name 		= "{$tipo}_{$parent}";
				$component_info 	= $this->get_component_info('json');
				/*
				# We are in Profiles
				# Extraemos el dato de areas activas en el dato del 'component_security_areas' de esta sección. Lo usaremos como base para recorrer y generar
				# nuestro listado de radio buttons actual. Si cambia el dato del 'component_security_areas', se reconstruirá este listado de nuevo.
				# Nota: Sólo secciones serán usadas. Excluiremos las áreas que ustiliza 'component_security_areas' para "abrir el camino" a las secciones.
				$component_security_areas 	 = component_common::get_instance('component_security_areas',
																		DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO,
																		$parent,
																		'edit',
																		DEDALO_DATA_NOLAN,
																		DEDALO_SECTION_PROFILES_TIPO );
				$security_access_dato = (object)$security_access->get_dato();
					#dump($security_access_dato," security_access_dato");
				$ar_ts_childrens	= array();						
				foreach($security_access_dato as $current_terminoID => $state) {
					if (strpos($current_terminoID, '-admin')!==false) continue; # Skip admin areas like 'dd12-admin'
					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_terminoID,true);
					if ($modelo_name!='section') continue; # Skip
					$ar_ts_childrens[$current_terminoID] = component_security_access::get_ar_ts_childrens_recursive($current_terminoID);																																
				}
				*/
				#dump($dato, ' dato ++ '.to_string());



					/* DESACTIVO
					$sections_obj = $this->get_security_areas_sections();				
							
					
					$tree_html='';
					foreach($sections_obj as $dato_section_tipo => $ar_elements ) {

						#dump($dato, ' dato ++ '.to_string($dato_section_tipo));

						$arguments['dato']				= isset($dato->$dato_section_tipo) ? $dato->$dato_section_tipo : new stdClass();
						$arguments['parent']			= $parent;
						$arguments['dato_section_tipo']	= $dato_section_tipo;	

						
						$termino 	= RecordObj_dd::get_termino_by_tipo($dato_section_tipo,DEDALO_APPLICATION_LANG,true);
						$tree_html .= "\n<h3>$termino [$dato_section_tipo]</h3>";
						$tree_html .= "\n<ul class=\"security_access_column_view\" id=\"security_access_column_view{$dato_section_tipo}\">";
						$tree_html .= component_security_access::walk_ar_elements_recursive($ar_elements, $arguments);
						$tree_html .= "</ul><!-- /ul general -->";
						#$tree_html .= "<hr>";
					}
					*/

				$tree_html = '';
/*
				$ar_children_elements = component_security_access::get_ar_children_elements(DEDALO_ROOT_TIPO);
					dump($ar_children_elements, ' ar_children_elements ++ '.to_string(DEDALO_ROOT_TIPO));
				foreach ($ar_children_elements as $current_tipo) {

					$termino 	  = RecordObj_dd::get_termino_by_tipo($current_tipo);
					$ar_childrens = component_security_access::get_ar_children_elements($current_tipo);

					#
					# HTML BUFFER
					ob_start();
					include ( 'html/node.phtml' );
					$tree_html .=  ob_get_clean();
				}
*/
				break;
						
		case 'list'	:
				return null;
				break;		
	}
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';	
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}	
?>