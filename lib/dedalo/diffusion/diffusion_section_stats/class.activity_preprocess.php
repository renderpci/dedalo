<?php
/*
* CLASS ACTIVITY_PREPROCESS
*/

# ADD_ONE
function add_one(&$var){$var++;}


abstract class activity_preprocess {	


	/**
	* ACTIVITY_PREPROCESS
	*
	* @param matrix_section_data (array)
	*
	* FORMAT
	*	[46495] => Array
    *   (
    *        [dd544] => 127.0.0.1
    *        [dd543] => 1
    *        [dd545] => dd696
    *        [dd546] => dd229
    *        [dd547] => 2013-12-21 10:30:22
    *        [dd550] => 
    *    )
	*    [46502] => Array
	*        (
	*            [dd544] => 127.0.0.1
	*            [dd543] => 1
	*            [dd545] => dd693
	*            [dd546] => dd13
	*            [dd547] => 2013-12-21 10:30:23
	*            [dd550] => 
	*        )
	*/
	public static function preprocess_data( $matrix_section_data ) {

		#dump($matrix_section_data ,'$matrix_section_data ');		

		# ACTIVIDAD_POR_USUARIO
		$ar_data['actividad_por_usuario']  = self::get_activity_by_element( $matrix_section_data, $group_by_element='userID' );
			#dump($ar_data,'$ar_data');

		# ACTIVIDAD_POR_PROYECTO
		#$ar_data['actividad_por_proyecto'] = self::get_activity_by_proyect( $matrix_section_data );
			#dump($ar_data,'$ar_data')
		
		return $ar_data;
	}



	
	/**
	* GET_ACTIVITY_BY_ELEMENT
	*
	* @param matrix_section_data (array)
	* @param group_by_element (string)
	*/
	public static function get_activity_by_element( array $matrix_section_data, $group_by_element='userID' ) {
		
		$ar_map  = array();
		$ar_final= array();
		# Recorremos todos los registros (id_matrix) recibidos para un periodo dado desde activity
		foreach ($matrix_section_data as $section_id => $ar_components_values) {

			# Elementos
			$element_tipo 	= $ar_components_values['dd546'];
			$userID 		= $ar_components_values['dd543'];
			$ip 			= $ar_components_values['dd544'];
			$que 			= $ar_components_values['dd545'];
			$donde 			= $ar_components_values['dd546'];
			$ar_proyectos	= $ar_components_values['dd550'];	#dump($ar_proyectos,'ar_proyectos');
			$timestamp		= $ar_components_values['dd547'];
			$dato			= $ar_components_values['dd551'];	#dump($dato,'dato');			

			# Hora en formato 0-24 (G)
			$hora = date("G", strtotime($timestamp));
		    	#dump($hora, " $timestamp ");	

			# Group by element
		    $group_by = $group_by_element.':'.$$group_by_element;

			# Totales : define TOTALES array now to get first key
			#if(!isset($ar_map[$group_by]['TOTALES'])) $ar_map[$group_by]['TOTALES']=array();

			#$ar_map[$group_by]['TOTALES']['fechas'] = array( 'timestamp' => date("Y-m-d", strtotime($timestamp)) );			

		    # Control de salida
		    $out_area 		= true;
		    $out_section 	= true;
		    $out_component 	= true;
		    $out_login 		= true;
			    
			# GROUP BY MODELO (AREA,SECTION,COMPONENT,LOGIN)
			$current_modelo = RecordObj_ts::get_modelo_name_by_tipo($element_tipo);
			switch (true) {
				
				# AREA
				case (strpos($current_modelo, 'area')===0 && $out_area) :

						# Current group
			    		#$current_group = &$ar_map['area_tipo:'.$element_tipo]['userID:'.$userID];
			    		$current_group = &$ar_map['area_tipo:'.$element_tipo]['userID:'.$userID];
			    		#$current_group = &$ar_map[$group_by]['AREAS']['area_tipo:'.$element_tipo];

							# ip
				    		add_one( $current_group['ip'][$ip] );
				    		#add_one( $ar_map[$group_by]['TOTALES']['origen_acceso'][$ip] );

				    		# quien
				    		#add_one( $current_group['quien'][$userID] );

				    		# que
				    		add_one( $current_group['que'][array_search($que, logger_backend_activity::$que).':'.$que] );

			    			# proyecto
				    		if(is_array($ar_proyectos)) foreach ($ar_proyectos as $proyecto => $permiso) {		    		
				    			if($permiso==2) {
				    				add_one( $current_group['proyecto'][$proyecto] );
				    			}		    			
				    		}

				    		# registro_visualizado
			    			#if(isset($dato['top_id']))
			    			#add_one( $current_group['registro_visualizado'][$dato['top_id']] );
			    		
				    		# actividad_horaria
			    			add_one( $current_group['actividad_horaria'][$hora] );
			    			#add_one( $ar_map[$group_by]['TOTALES']['actividad_horaria'][$hora] );

						break;
				
				# SECTION
				case (strpos($current_modelo, 'section')===0 && $out_section):
						
						$parent_area = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($element_tipo, $modelo_name='area', $relation_type='parent');

			    		if(empty($parent_area[0])) {
			    			$element_namme = RecordObj_ts::get_termino_by_tipo($element_tipo);
			    			error_log("Warning: parent_area of $element_tipo ($element_namme) is empty. Skiping element_tipo $element_tipo");
			    			continue;
			    			//throw new Exception("Error Processing Request. parent_area of $element_tipo is empty", 1);
			    		}
			    		$parent_area = $parent_area[0];
			    		
			    		# Current group
			    		#$current_group = &$ar_map['area_tipo:'.$parent_area]['section_tipo:'.$element_tipo]['userID:'.$userID];
			    		$current_group = &$ar_map['area_tipo:'.$parent_area]['section_tipo:'.$element_tipo]['userID:'.$userID];
			    		#$current_group = &$ar_map[$group_by]['SECCIONES']['area_tipo:'.$parent_area]['section_tipo:'.$element_tipo];
			    		
				    		# ip
				    		add_one( $current_group['ip'][$ip] );
				    		#add_one( $ar_map[$group_by]['TOTALES']['origen_acceso'][$ip] );

				    		# quien
				    		#add_one( $current_group['quien'][$userID] );

				    		# que
				    		add_one( $current_group['que'][array_search($que, logger_backend_activity::$que).':'.$que] );

			    			# proyecto
				    		if(is_array($ar_proyectos)) foreach ($ar_proyectos as $proyecto => $permiso) {
				    			if($permiso==2) {
				    				add_one( $current_group['proyecto'][$proyecto] );
				    				#add_one( $ar_map[$group_by]['TOTALES']['proyectos'][$proyecto] );
				    			}
				    		}

				    		# 'LOG IN'			=>'dd696',	# login module
							# 'LOG OUT'			=>'dd697',	# login module
							# 'SAVE'			=>'dd700',	# component
							# 'SEARCH'			=>'dd699',	# component
							# 'LOAD EDIT'		=>'dd694',	# page
							# 'LOAD LIST'		=>'dd693',	# page
							# 'DELETE'			=>'dd698',	# section
							# 'NEW'				=>'dd695', 	# section
							# 'DOWNLOAD'		=>'dd1080', # download file by tool av / image / pdf
							# 'UPLOAD'			=>'dd1090', # upload file by tool upload
							# 'UPLOAD COMPLETE'	=>'dd1094', # upload file by tool upload
							# 'DELETE FILE'		=>'dd1095', # delete file by tool
							# 'NEW VERSION'		=>'dd1081', # new version file
							# 'RECOVER COMPONENT'=>'dd1091',# recuperar componente
							# 'RECOVER SECTION'	=>'dd1092', # recuperar sección
							# 'STATS'			=>'dd1098', # estadisticas

				    		# registros acciones
			    			if(isset($dato['top_id'])) {
			    				switch ($que) {

			    					case 'dd698': # DELETE
			    						add_one( $current_group['registros_eliminados'][$dato['top_id']] );
			    						#add_one( $ar_map[$group_by]['TOTALES']['registros_eliminados'][$dato['top_id']] );
			    						break;

			    					case 'dd1092': # RECOVER SECTION
			    						add_one( $current_group['registros_recuperados'][$dato['top_id']] );
			    						#add_one( $ar_map[$group_by]['TOTALES']['registros_recuperados'][$dato['top_id']] );
			    						break;

			    					case 'dd695': # NEW
			    						add_one( $current_group['registros_creados'][$dato['top_id']] );
			    						#add_one( $ar_map[$group_by]['TOTALES']['registros_creados'][$dato['top_id']] );
			    						break;

			    					case 'dd694': # LOAD EDIT
			    						add_one( $current_group['registros_visualizados'][$dato['top_id']] );
			    						#add_one( $ar_map[$group_by]['TOTALES']['registros_visualizados'][$dato['top_id']] );
			    						break;

			    					case 'dd1098': # STATS CRON
			    						# Nothing to do
			    						break;

			    					default:
			    						add_one( $current_group['registros_otros'][$dato['top_id']] );
			    						break;
			    				}			    				
			    				#add_one( $ar_map[$group_by]['TOTALES']['registros_visualizados'] );
			    			}

			    			# busquedas
			    			if($que=='dd699') { # SEARCH
			    				add_one( $current_group['busquedas'][$donde] );
								#add_one( $ar_map[$group_by]['TOTALES']['busquedas'][$donde] );
			    			}
			    		
				    		# actividad_horaria
			    			add_one( $current_group['actividad_horaria'][$hora] );
			    			#add_one( $ar_map[$group_by]['TOTALES']['actividad_horaria'][$hora] );
				    		
			    		break;				
				

				# COMPONENT
				case (strpos($current_modelo, 'component_')===0 && $out_component):

					$parent_section = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($element_tipo, $modelo_name='section', $relation_type='parent')[0];
					$parent_area 	= RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($parent_section, $modelo_name='area', $relation_type='parent')[0];

						# Current group
			    		#$current_group = &$ar_map['area_tipo:'.$parent_area]['section_tipo:'.$parent_section]['component_tipo:'.$element_tipo]['userID:'.$userID];
			    		$current_group = &$ar_map['area_tipo:'.$parent_area]['section_tipo:'.$parent_section]['userID:'.$userID];
			    		#$current_group = &$ar_map[$group_by]['COMPONENTES']['area_tipo:'.$parent_area]['section_tipo:'.$parent_section]['component_tipo:'.$element_tipo];

				    		# ip
				    		#add_one( $current_group['ip'][$ip] );

				    		# quien
				    		#add_one( $current_group['quien'][$userID] );

				    		# que
				    		add_one( $current_group['que'][array_search($que, logger_backend_activity::$que).':'.$que] );

				    		# donde
				    		add_one( $current_group['donde'][$element_tipo] );

				    		

			    			# proyecto
				    		if(is_array($ar_proyectos)) foreach ($ar_proyectos as $proyecto => $permiso) {
				    			if($permiso==2) add_one( $current_group['proyecto'][$proyecto] );
				    		}

				    		# registro_modificado
			    			if(isset($dato['top_id'])) {
			    				switch ($que) {

			    					case 'dd700': # SAVE
										add_one( $current_group['registros_modificados'][$dato['top_id']] );
					    				#add_one( $ar_map[$group_by]['TOTALES']['registros_modificados'][$dato['top_id']] );
				    					break;

				    				case 'dd1091': # RECOVER COMPONENT
										add_one( $current_group['componentes_recuperados'][$dato['top_id']] );
					    				#add_one( $ar_map[$group_by]['TOTALES']['componentes_recuperados'][$dato['top_id']] );
				    					break;
	

				    				case 'dd1094': # UPLOAD COMPLETE
				    					add_one( $current_group['archivos_cargados'][$dato['top_id']] );
				    					#add_one( $ar_map[$group_by]['TOTALES']['archivos_cargados'][$dato['top_id']] );
				    					break;

				    				case 'dd1080': # DOWNLOAD
				    					add_one( $current_group['archivos_descargados'][$dato['top_id']] );
				    					#add_one( $ar_map[$group_by]['TOTALES']['archivos_descargados'][$dato['top_id']] );
				    					break;

				    				case 'dd1095': # DELETE FILE
				    					add_one( $current_group['archivos_eliminados'][$dato['top_id']] );
				    					#add_one( $ar_map[$group_by]['TOTALES']['archivos_eliminados'][$dato['top_id']] );
				    					break;

				    				case 'dd1081': # NEW VERSION
				    					add_one( $current_group['versiones_generadas'][$dato['top_id']] );
				    					#add_one( $ar_map[$group_by]['TOTALES']['versiones_generadas'][$dato['top_id']] );
				    					break;				    					
			    				}			    				
			    			}			    			
			    		
				    		# actividad_horaria
			    			add_one( $current_group['actividad_horaria'][$hora] );
			    			#add_one( $ar_map[$group_by]['TOTALES']['actividad_horaria'][$hora] );

						break;

				# LOGIN
				case (strpos($current_modelo, 'login')===0 && $out_login):

						# Current group
						$current_group = &$ar_map['login_tipo:'.$element_tipo]['userID:'.$userID];
			    		#$current_group = &$ar_map[$group_by]['LOGIN']['login_tipo:'.$element_tipo];

							# ip
				    		add_one( $current_group['ip'][$ip] );
				    		#add_one( $ar_map[$group_by]['TOTALES']['origen_acceso'][$ip] );

				    		# que
				    		add_one( $current_group['que'][array_search($que, logger_backend_activity::$que).':'.$que] );

				    		# login
				    		switch ($que) {
				    			case 'dd696': # LOG IN
			    					add_one( $current_group['entradas_al_sistema'][$ip] );
			    					#add_one( $ar_map[$group_by]['TOTALES']['entradas_al_sistema'][$ip] );
			    					break;
				    		}
			    		
				    		# actividad_horaria
			    			add_one( $current_group['actividad_horaria'][$hora] );
			    			#add_one( $ar_map[$group_by]['TOTALES']['actividad_horaria'][$hora] );

						break;
				
			}#end switch (true) {

		}#end foreach ($matrix_section_data as $section_id => $ar_components_values) {
		#dump($ar_map,'ar_map');	
		
		
		# AR_FINAL CLEAN
		foreach ($ar_map as $key => $ar_value) {		
			#$ar_final[$key]['TOTALES'] = $ar_map[$key]['TOTALES'];
			#unset($ar_final[$key]['TOTALES']);
		}

		$ar_final = $ar_map;
		#dump($ar_map,'ar_map');
		
		return $ar_final;

	}#end get_activity_by_element




	/**
	* GET_ACTIVITY_BY_PROYECT
	*
	* @param $matrix_section_data (array)
	*/	
	public static function get_activity_by_proyect_UNDER_CONSTRUCTION( array $matrix_section_data ) {
		
		/* UNDER_CONSTRUCTION ++++++++
		# Recorremos todos los registros (id_matrix) recibidos para un periodo dado desde activity
		foreach ($matrix_section_data as $section_id => $ar_components_values) {

			# Elementos
			$element_tipo 	= $ar_components_values['dd546'];
			$userID 		= $ar_components_values['dd543'];
			$ip 			= $ar_components_values['dd544'];
			$que 			= $ar_components_values['dd545'];
			$donde 			= $ar_components_values['dd546'];
			$ar_proyectos	= $ar_components_values['dd550'];	#dump($ar_proyectos,'ar_proyectos');
			$timestamp		= $ar_components_values['dd547'];
			$dato			= $ar_components_values['dd551'];	#dump($dato,'dato');				

			# Hora en formato 0-24 (G)
			$hora = date("G", strtotime($timestamp));
		    	#dump($hora, " $timestamp ");

			if(is_array($ar_proyectos)) foreach ($ar_proyectos as $current_proyecto => $current_permiso) {				
				
				if ($current_permiso!=2) continue;

				# Group by element
			    $group_by = 'project:'.$current_proyecto;	

				# Totales : define TOTALES array now to get first key
				if(!isset($ar_map[$group_by]['TOTALES'])) $ar_map[$group_by]['TOTALES']=array();

				$ar_map[$group_by]['TOTALES']['fechas'] = array( 'timestamp' => date("Y-m-d", strtotime($timestamp)) );	

			    # Control de salida
			    $out_area 		= true;
			    $out_section 	= true;
			    $out_component 	= true;
				    
				# GROUP BY MODELO (AREA,SECTION,COMPONENT)
				$current_modelo = RecordObj_ts::get_modelo_name_by_tipo($element_tipo);
				switch (true) {
					
					# AREA
					case (strpos($current_modelo, 'area')===0 && $out_area) :

							# Current group
				    		#$current_group = &$ar_map['area_tipo:'.$element_tipo]['userID:'.$userID];
				    		#$current_group = &$ar_map['AREAS']['area_tipo:'.$element_tipo]['userID:'.$userID];
				    		$current_group = &$ar_map[$group_by]['AREAS']['area_tipo:'.$element_tipo];

								# ip
					    		add_one( $current_group['ip'][$ip] );
					    		add_one( $ar_map[$group_by]['TOTALES']['origen_acceso'][$ip] );

					    		# quien
					    		add_one( $current_group['quien'][$userID] );
					    		add_one( $ar_map[$group_by]['TOTALES']['actividad_usuarios'][$userID] );

					    		# que
					    		add_one( $current_group['que'][array_search($que, logger_backend_activity::$que).':'.$que] );

				    			# proyecto
					    		if(is_array($ar_proyectos)) foreach ($ar_proyectos as $proyecto => $permiso) {		    		
					    			if($permiso==2) {
					    				add_one( $current_group['proyecto'][$proyecto] );
					    			}
					    		}

					    		# registro_visualizado
				    			#if(isset($dato['top_id']))
				    			#add_one( $current_group['registro_visualizado'][$dato['top_id']] );
				    		
					    		# actividad_horaria
				    			add_one( $current_group['actividad_horaria'][$hora] );
				    			add_one( $ar_map[$group_by]['TOTALES']['actividad_horaria'][$hora] );

							break;
					
					# SECTION
					case (strpos($current_modelo, 'section')===0 && $out_section):

				   		$parent_area = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($element_tipo, $modelo_name='area', $relation_type='parent')[0];
				    		
				    		# Current group
				    		#$current_group = &$ar_map['area_tipo:'.$parent_area]['section_tipo:'.$element_tipo]['userID:'.$userID];
				    		#$current_group = &$ar_map['SECCIONES']['section_tipo:'.$element_tipo]['userID:'.$userID];
				    		$current_group = &$ar_map[$group_by]['SECCIONES']['area_tipo:'.$parent_area]['section_tipo:'.$element_tipo];
				    		
					    		# ip
					    		add_one( $current_group['ip'][$ip] );
					    		add_one( $ar_map[$group_by]['TOTALES']['origen_acceso'][$ip] );

					    		# quien
					    		add_one( $current_group['quien'][$userID] );
					    		add_one( $ar_map[$group_by]['TOTALES']['actividad_usuarios'][$userID] );

					    		# que
					    		add_one( $current_group['que'][array_search($que, logger_backend_activity::$que).':'.$que] );

				    			# proyecto
					    		if(is_array($ar_proyectos)) foreach ($ar_proyectos as $proyecto => $permiso) {
					    			if($permiso==2) {
					    				add_one( $current_group['proyecto'][$proyecto] );
					    				#add_one( $ar_map[$group_by]['TOTALES']['proyectos'][$proyecto] );
					    			}
					    		}

					    		# 'LOG IN'			=>'dd696',	# login module
								# 'LOG OUT'			=>'dd697',	# login module
								# 'SAVE'			=>'dd700',	# component
								# 'SEARCH'			=>'dd699',	# component
								# 'LOAD EDIT'		=>'dd694',	# page
								# 'LOAD LIST'		=>'dd693',	# page
								# 'DELETE'			=>'dd698',	# section
								# 'NEW'				=>'dd695', 	# section
								# 'DOWNLOAD'		=>'dd1080', # download file by tool av / image / pdf
								# 'UPLOAD'			=>'dd1090', # upload file by tool upload
								# 'UPLOAD COMPLETE'	=>'dd1094', # upload file by tool upload
								# 'DELETE FILE'		=>'dd1095', # delete file by tool
								# 'NEW VERSION'		=>'dd1081', # new version file
								# 'RECOVER COMPONENT'=>'dd1091', # recuperar componente
								# 'RECOVER SECTION'	=>'dd1092', # recuperar sección

					    		# registros acciones
				    			if(isset($dato['top_id'])) {
				    				switch ($que) {

				    					case 'dd698': # DELETE
				    						add_one( $current_group['registros_eliminados'][$dato['top_id']] );
				    						add_one( $ar_map[$group_by]['TOTALES']['registros_eliminados'][$dato['top_id']] );
				    						break;

				    					case 'dd1092': # RECOVER SECTION
				    						add_one( $current_group['registros_recuperados'][$dato['top_id']] );
				    						add_one( $ar_map[$group_by]['TOTALES']['registros_recuperados'][$dato['top_id']] );
				    						break;

				    					case 'dd695': # NEW
				    						add_one( $current_group['registros_creados'][$dato['top_id']] );
				    						add_one( $ar_map[$group_by]['TOTALES']['registros_creados'][$dato['top_id']] );
				    						break;

				    					case 'dd694': # LOAD EDIT
				    						add_one( $current_group['registros_visualizados'][$dato['top_id']] );
				    						add_one( $ar_map[$group_by]['TOTALES']['registros_visualizados'][$dato['top_id']] );
				    						break;

				    					default:
				    						add_one( $current_group['registros_otros'][$dato['top_id']] );
				    						break;
				    				}			    				
				    				#add_one( $ar_map[$group_by]['TOTALES']['registros_visualizados'] );
				    			}

				    			# busquedas
				    			if($que=='dd699') { # SEARCH
				    				add_one( $current_group['busquedas'][$donde] );
									add_one( $ar_map[$group_by]['TOTALES']['busquedas'][$donde] );
				    			}
				    		
					    		# actividad_horaria
				    			add_one( $current_group['actividad_horaria'][$hora] );
				    			add_one( $ar_map[$group_by]['TOTALES']['actividad_horaria'][$hora] );
					    		
				    		break;				
					

					# COMPONENT
					case (strpos($current_modelo, 'component_')===0 && $out_component):

						$parent_section = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($element_tipo, $modelo_name='section', $relation_type='parent')[0];
						$parent_area 	= RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($parent_section, $modelo_name='area', $relation_type='parent')[0];

							# Current group
				    		#$current_group = &$ar_map['area_tipo:'.$parent_area]['section_tipo:'.$parent_section]['component_tipo:'.$element_tipo]['userID:'.$userID];
				    		#$current_group = &$ar_map['COMPONENTES']['component_tipo:'.$element_tipo]['userID:'.$userID];
				    		$current_group = &$ar_map[$group_by]['COMPONENTES']['area_tipo:'.$parent_area]['section_tipo:'.$parent_section]['component_tipo:'.$element_tipo];

					    		# ip
					    		#add_one( $current_group['ip'][$ip] );

					    		# quien
					    		add_one( $current_group['quien'][$userID] );
					    		add_one( $ar_map[$group_by]['TOTALES']['actividad_usuarios'][$userID] );

					    		# que
					    		add_one( $current_group['que'][array_search($que, logger_backend_activity::$que).':'.$que] );

				    			# proyecto
					    		if(is_array($ar_proyectos)) foreach ($ar_proyectos as $proyecto => $permiso) {
					    			if($permiso==2) add_one( $current_group['proyecto'][$proyecto] );
					    		}

					    		# registro_modificado
				    			if(isset($dato['top_id'])) {
				    				switch ($que) {

				    					case 'dd700': # SAVE
											add_one( $current_group['registros_modificados'][$dato['top_id']] );
						    				add_one( $ar_map[$group_by]['TOTALES']['registros_modificados'][$dato['top_id']] );
					    					break;

					    				case 'dd1091': # RECOVER COMPONENT
											add_one( $current_group['componentes_recuperados'][$dato['top_id']] );
						    				add_one( $ar_map[$group_by]['TOTALES']['componentes_recuperados'][$dato['top_id']] );
					    					break;
		

					    				case 'dd1094': # UPLOAD COMPLETE
					    					add_one( $current_group['archivos_cargados'][$dato['top_id']] );
					    					add_one( $ar_map[$group_by]['TOTALES']['archivos_cargados'][$dato['top_id']] );
					    					break;

					    				case 'dd1080': # DOWNLOAD
					    					add_one( $current_group['archivos_descargados'][$dato['top_id']] );
					    					add_one( $ar_map[$group_by]['TOTALES']['archivos_descargados'][$dato['top_id']] );
					    					break;

					    				case 'dd1095': # DELETE FILE
					    					add_one( $current_group['archivos_eliminados'][$dato['top_id']] );
					    					add_one( $ar_map[$group_by]['TOTALES']['archivos_eliminados'][$dato['top_id']] );
					    					break;

					    				case 'dd1081': # NEW VERSION
					    					add_one( $current_group['versiones_generadas'][$dato['top_id']] );
					    					add_one( $ar_map[$group_by]['TOTALES']['versiones_generadas'][$dato['top_id']] );
					    					break;				    					
				    				}			    				
				    			}			    			
				    		
					    		# actividad_horaria
				    			add_one( $current_group['actividad_horaria'][$hora] );
				    			add_one( $ar_map[$group_by]['TOTALES']['actividad_horaria'][$hora] );

							break;
					
					
				}#end switch (true) {

			}#end if(is_array($ar_proyectos)) foreach ($ar_proyectos as $current_proyecto => $current_permiso) {

		}#end foreach ($matrix_section_data as $section_id => $ar_components_values) {
		#dump($ar_map,'ar_map');	
		
		# AR_FINAL CLEAN
		foreach ($ar_map as $key => $ar_value) {
			$ar_final[$key]['TOTALES'] = $ar_map[$key]['TOTALES'];
		}		
		#dump($ar_final,'ar_final');
		
		return $ar_final;
		*/
	}#end get_activity_by_proyect

}