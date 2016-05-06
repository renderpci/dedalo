<?php
	
	# CONTROLLER
	if ($this->modo=='list') {
		return null;
	}
					
	$tipo 					= $this->get_tipo();
	$modo					= $this->get_modo();
	#$parent 				= $this->get_parent();
	$section_tipo 			= $this->get_section_tipo();
	$dato 					= $this->get_dato();	
	$lang 					= $this->get_lang();			
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($tipo);
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $tipo";
	$tree_html				= '';
	$html					= '';
	$caller_id 				= $this->get_caller_id();		
	$parent 				= $caller_id;
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	
	$file_name				= $modo;
		
		
	switch($modo) {
		
		case 'tool_time_machine'	:
						die("Dead here tm ");	
						break;
		
		case 'edit':	

						if ($section_tipo==DEDALO_SECTION_USERS_TIPO) {
						if(SHOW_DEBUG) {
								echo "DEBUG MODE ONLY:";
							}else{
								return null;
							}							
						}


						$dato_string 		= substr($this->get_dato_as_string(),0,150);		#dump($dato_string,"dato");
						
						$id_wrapper 		= 'wrapper_'.$identificador_unico;
						$input_name 		= "{$tipo}_{$parent}";
						$component_info 	= $this->get_component_info('json');
						

						# Context : calculate current context (editing users, profiles, etc.)
						$parent_section_tipo = component_common::get_section_tipo_from_component_tipo($tipo);
						$ar_ts_childrens	= array();
						switch (true) {
							case ($parent_section_tipo==DEDALO_SECTION_USERS_TIPO):
								# We are in Users
								$user_areas = (array)$this->get_user_authorized_areas();
									#dump($user_areas,'user_areas',"",true); #die();	
								foreach($user_areas as $current_terminoID) {							
									$ar_ts_childrens[$current_terminoID] = component_security_access::get_ar_ts_childrens_recursive($current_terminoID);															
								}
								break;			
							case ($parent_section_tipo==DEDALO_SECTION_PROFILES_TIPO):
								# We are in Profiles
								# Extraemos el array de areas activas en el dato del 'component_security_areas' de esta sección. Lo usaremos como base para recorrer y generar
								# nuestro listado de radio buttons actual. Si cambia el dato del 'component_security_areas', se reconstruirá este listado de nuevo.
								# Nota: Sólo secciones serán usadas. Excluiremos las áreas que ustiliza 'component_security_areas' para "abrir el camino" a las secciones.
								$security_access 	  = component_common::get_instance('component_security_areas', DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO, $this->get_parent(), 'edit', DEDALO_DATA_NOLAN, DEDALO_SECTION_PROFILES_TIPO );
								$security_access_dato = (array)$security_access->get_dato();
									#dump($security_access_dato," security_access_dato");							
								foreach($security_access_dato as $current_terminoID => $state) {
									if (strpos($current_terminoID, '-admin')!==false) continue; # Skip admin areas like 'dd12-admin'
									$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_terminoID,true);
									if ($modelo_name!='section') continue; # Skip
									$ar_ts_childrens[$current_terminoID] = component_security_access::get_ar_ts_childrens_recursive($current_terminoID);																																
								}
								break;			
							default:
								die("Security problem detected: Current parent_section_tipo is not valid ($parent_section_tipo)");
								break;
						}
						#dump($ar_ts_childrens,'ar_ts_childrens',"",true); #die();
					
						if(SHOW_DEBUG) {
							#dump($ar_ts_childrens, '$ar_ts_childrens');;
						}						
						if( is_array($ar_ts_childrens)) foreach($ar_ts_childrens as $terminoID => $ar_tesauro ) {
														
							$arguments['terminoID']			= $terminoID;
							$arguments['dato']				= $dato;
							$arguments['caller_id']			= $caller_id;
							$arguments['caller_tipo']		= $this->tipo;
							$arguments['parent']			= $parent;					#dump($arguments,'arguments');
							
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

							
							$termino 	= RecordObj_dd::get_termino_by_tipo($terminoID,DEDALO_APPLICATION_LANG,true);
							$tree_html .= "\n <h3>$termino [$terminoID]</h3>";
							$tree_html .= "\n<ul class=\"security_access_column_view\" id=\"security_access_column_view{$name_tm}\">";
							$tree_html .= component_security_access::walk_ar_ts_childrens_recursive($ar_tesauro, $arguments);
							$tree_html .= "</ul><!-- /ul general -->";
							#$tree_html .= "<hr>";

						}

						#dump($tree_html,'','',true);
						break;

		
		case 'search' :	
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