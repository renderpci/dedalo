<?php
/*
* CLASS DIFFUSION_SECTION_STATS
*/
require_once 'class.activity_preprocess.php';
require_once 'class.section_preprocess.php';

# tipo de las secciones de estadísticas diarias
define('DEDALO_DAILY_STATS_SECTION_TIPO', 'dd70');

class diffusion_section_stats extends diffusion {
	
	protected $section_tipo;
	protected $caller_section_tipo;
	protected $section_stats_tipo;
	protected $fecha;

	static $geoip_mm;

	/**
	* CONSTRUCT
	*/
	function __construct( $caller_section_tipo=NULL, $fecha ) {

		if (empty($caller_section_tipo)) {
			#throw new Exception("Error Processing Request. Empty caller_section_tipo", 1);
		}		
		$this->caller_section_tipo = $caller_section_tipo;
		$this->fecha = $fecha;
	}


	/**
	* GET_AR_DIFFUSION_SECTION_MAP
	* Recupera la configuración definida en el tesauro (estructura) para estadísticas de la sección dada (ar_section_top_tipo)
	*/
	protected function get_ar_diffusion_section_map( $ar_section_top_tipo=NULL ) {
		
		#dump($ar_section_top_tipo,'$ar_section_top_tipo');
		#if(SHOW_DEBUG) $start_time = start_time();

		$ar_diffusion_map = array();

		# DIFFUSION STRUCTURE

			# DIFFUSION_DOMAIN : Get structure tipo of current ('dedalo') diffusion_section_stats
			$diffusion_domain = diffusion::get_my_diffusion_domain('dedalo',get_called_class())[0];
				#dump($diffusion_domain,'$diffusion_domain');

			# SECTION_STATS_TIPO
			$section_stats_tipo = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($diffusion_domain, $modelo_name='section', $relation_type='children')[0];
				#dump($section_stats_tipo,'$section_stats_tipo');

			# FIX $section_stats_tipo
			$this->section_stats_tipo = $section_stats_tipo;

			# DIFFUSION_SECTIONS : Get sections defined in structure to view
			$ar_diffusion_section = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($section_stats_tipo, $modelo_name='component_stats', $relation_type='children');
				#dump($ar_diffusion_section,'$ar_diffusion_section');

			# DIFFUSION_SECTIONS : Recorremos las secciones de difusión para localizar las coincidencias con los tipos de sección de las indexaciones
			foreach ($ar_diffusion_section as $diffusion_section_tipo) {

				# diffusion_section_tipo ar_relateds_terms
				$current_section_tipo = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($diffusion_section_tipo, $modelo_name='section', $relation_type='termino_relacionado')[0];
					#dump($current_section_tipo,'$current_section_tipo');
				
				# current_section_tipo : Verify
				if (empty($current_section_tipo)) {
					throw new Exception("Error Processing Request get_ar_diffusion_section_map: diffusion section related is empty. Please configure structure with one diffusion section related", 1);
				}

				# NO FILTRAMOS
				if(empty($ar_section_top_tipo)) {

					# LIST 
					$RecordObj_ts = new RecordObj_ts($diffusion_section_tipo);
					$ar_childrens = $RecordObj_ts->get_ar_childrens_of_this();
						#dump($ar_childrens,'$ar_childrens');

					$ar_diffusion_map[$diffusion_section_tipo] = $ar_childrens;	

				}else	
				# FILTRADO POR $ar_section_top_tipo :  IN ARRAY ?	
				if ( array_key_exists($current_section_tipo, $ar_section_top_tipo) ) {					

					#dump($diffusion_section_tipo,'$diffusion_section_tipo - '.$current_section_tipo);
					
					# LIST 
					$RecordObj_ts = new RecordObj_ts($diffusion_section_tipo);
					$ar_childrens = $RecordObj_ts->get_ar_childrens_of_this();
						#dump($ar_childrens,'$ar_childrens');

					$ar_diffusion_map[$diffusion_section_tipo] = $ar_childrens;					
				
				}#end if ( array_key_exists($current_section_tipo, $ar_section_top_tipo) )
				
			}#end foreach ($ar_diffusion_section as $diffusion_section_tipo

		#if(SHOW_DEBUG) dump( exec_time($start_time, __METHOD__) );
		#dump($ar_diffusion_map,'$ar_diffusion_map'); die();

		return $ar_diffusion_map;
	}




	/**
	*
	* SET_MATRIX_STATS
	*
	* Guarda en db 'matrix_stats' los datos actuales de secciones y actividad a modo de 'snap-shot'
	* Este es el método lanzado pr el trigger del cron
	* @param $fecha_de_los_datos_custom . default false. Fecha específica opcional para procesar las estadisticas. Si no se le pasa ninguna, se usará la por defecto:
	* @see Para tener el histórico completo del día, se ejecuta cron a partir de las 00:01 y se almacenan los registros del día completo de ayer (por defecto)
	* En lo posible intentar hacerla a primera hora del día siguiente (00:01 por ejemplo) para asegurarnos de que está el día completo y aprovechar horas de bajo uso del servidor
	* ya que el script puede consumir muchos recursos en el procesado de inventarios grandes
	*/
	public function set_matrix_stats( $fecha_de_los_datos_custom=false, $delete_previous_versions=true ) {

		if ($fecha_de_los_datos_custom!==false) {
			# CUSTOM DATE
			# Se le pasa una fecha específica
			# Verificamos el formato de fecha
			preg_match("/\d{4}-\d{2}-\d{2}/", $fecha_de_los_datos_custom, $output_array);
			if (empty($output_array[0])) {
				throw new Exception("Error Processing Request. Wrong date format. Use YYY-MM-DD", 1);
			}
			$fecha_de_los_datos = $fecha_de_los_datos_custom;
		}else{
			# YESTERDAY DATE
			# Para tener el histórico completo del día, se ejecuta cron a las 00:01 y se almacenan
			# los registros del día completo de ayer (por defecto)
			$date_yesterday		= component_date::get_timestamp_now_for_db( array('sub'=>'P1D') );
			$fecha_de_los_datos	= date("Y-m-d", strtotime($date_yesterday));				
		}

		# AR_DIFFUSION_MAP : Full map
		$ar_diffusion_map = $this->get_ar_diffusion_section_map( null );
			#dump($ar_diffusion_map,'$ar_diffusion_map');			

		
		# ITERATE ALL SECTIONS (included activity)
		foreach ($ar_diffusion_map as $section_tipo => $ar_childrens) {
			
			$matrix_section_data = section_preprocess::get_matrix_section_data( $section_tipo, $ar_diffusion_map[$section_tipo], $fecha_de_los_datos );
				#dump($matrix_section_data,'matrix_section_data '.$section_tipo);

			# REAL SECTION TIPO
			$related_section_tipo = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($section_tipo, $modelo_name='section', $relation_type='termino_relacionado')[0];
				#dump($related_section_tipo,"ar_data - $section_tipo ".DEDALO_ACTIVITY_SECTION_TIPO);

				#$current_section_name = RecordObj_ts::get_termino_by_tipo($section_tipo);

			if($related_section_tipo==DEDALO_ACTIVITY_SECTION_TIPO) {
			# SECTION DEDALO_ACTIVITY_SECTION_TIPO
				$ar_data["ACTIVITY"][$related_section_tipo.":".$section_tipo] = array( $related_section_tipo => activity_preprocess::preprocess_data( $matrix_section_data ) );
			}else{
			# STANDAR SECTION STATS
				$ar_data["SECTIONS"][$related_section_tipo.":".$section_tipo] = array( $related_section_tipo => $matrix_section_data );
			}
		}
		#dump($ar_data,'$ar_data');
		#return 'not saved. Test only';

				# DELETE PREVIOUS VERSIONS OF STATS FOR THIS DATE
				# Eliminamos posibles versiones de estadísticas para este día (evita redundancia innecesaria ya que los datos se pueden regenerar en cualquier momento)
				# true por defecto
				if($delete_previous_versions) {
					$arguments=array();
					$arguments['strPrimaryKeyName']	= 'parent';
					$arguments['dato:%like%']		= $fecha_de_los_datos ;	#date("Y-m-d", strtotime($timestamp));
					$arguments['parent:not_like']	= 0;
					$matrix_table 					= common::get_matrix_table_from_tipo(DEDALO_DAILY_STATS_SECTION_TIPO);
					$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
					$ar_records						= $RecordObj_matrix->search($arguments);
					if(!empty($ar_records)) {
						foreach ($ar_records as $current_section_id) {
							# Creamos una sección con el id encontrado y ella ya se encarga de eliminar todos sus hijos
							$section = new section($current_section_id,DEDALO_DAILY_STATS_SECTION_TIPO);	# ($id=NULL, $tipo=false, $modo='edit')
							$section->Delete('delete_record');
						}
					}
				}
				

				#
				# NEW SECTION
				# Save collected data into new section 
				# date component saves always yesterday date (today -1 day)
				$section 	= new section(NULL, $this->section_stats_tipo);
				$section_id = $section->Save();
					#dump($section_id,'$section_id');

				if( intval($section_id)<1 ) throw new Exception("Error Processing Request. Error on create new section ($this->section_stats_tipo)", 1);


				# COMPONENT_DATE : TIMESTAMP NOW
				# Guarda la fecha de los datos del 'snap-shot', no confundir confundir con la fecha de creación del registro
				$component_timestamp_tipo 	= RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($this->section_stats_tipo, $modelo_name='component_date', $relation_type='children')[0];
				$current_component 			= new component_date(NULL, $component_timestamp_tipo, 'stats', $section_id);
				$timestamp 					= $fecha_de_los_datos." 00:00:00";	#component_date::get_timestamp_now_for_db( array('sub'=>'P1D') ); # Date of yesterday !important
				$current_component->set_dato( $timestamp );

				$current_component->Save();

				# COMPONENT_STATS : ONE FOR SECTION TIPO
				foreach ($ar_data as $stat_name => $ar_data_section) 
				foreach ($ar_data_section as $component_tipo => $component_dato) {

					$component_tipo = explode(':', $component_tipo)[1];
					
					$current_component = new component_stats(NULL, $component_tipo, 'stats', $section_id);
					$current_component->set_dato($component_dato);
						#dump($current_component,'$current_component' );
					$current_component->Save();
				}
				
				return $section_id;
	}

	

	/**
	* GET_MATRIX_STATS
	* Recupera los datos completos de estadísticas de 'matrix_stats' que ya se guardaron con el trigger del cron
	*/
	protected function get_matrix_stats( $caller_section_tipo, $fecha_de_los_datos_custom=false ) {

		 #$fecha_de_los_datos_custom = "2014-04-26";

		if ($fecha_de_los_datos_custom!==false) {
			# CUSTOM DATE
			# Se le pasa una fecha específica
			# Verificamos el formato de fecha
			preg_match("/\d{4}-\d{2}-\d{2}/", $fecha_de_los_datos_custom, $output_array);
			if (empty($output_array[0])) {
				throw new Exception("Error Processing Request. Wrong date format. Use YYY-MM-DD", 1);
			}
			$fecha_de_los_datos = $fecha_de_los_datos_custom;
		}else{
			# YESTERDAY DATE
			# Por defecto
			$date_yesterday		= component_date::get_timestamp_now_for_db( array('sub'=>'P1D') );
			$fecha_de_los_datos	= date("Y-m-d", strtotime($date_yesterday));				
		}

		# DIFFUSION_DOMAIN : Get structure tipo of current ('dedalo') diffusion_section_stats
			$diffusion_domain = diffusion::get_my_diffusion_domain('dedalo',get_called_class())[0];
				#dump($diffusion_domain,'$diffusion_domain');

			# SECTION_STATS_TIPO
			$section_stats_tipo = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($diffusion_domain, $modelo_name='section', $relation_type='children')[0];
				#dump($section_stats_tipo,'$section_stats_tipo');

			# FIX $section_stats_tipo
			$this->section_stats_tipo = $section_stats_tipo;

			# COMPONENT_DATE
			#$component_date = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($section_stats_tipo, $modelo_name='component_date', $relation_type='children')[0];

			# BUSCAMOS CON LA FECHA DADA
			$arguments=array();
			$arguments['strPrimaryKeyName']	= 'parent';
			$arguments['dato:%like%']		= $fecha_de_los_datos ;	#date("Y-m-d", strtotime($timestamp));
			$arguments['parent:not_like']	= 0;
			$matrix_table 					= common::get_matrix_table_from_tipo($section_stats_tipo);
			$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
			$ar_records						= $RecordObj_matrix->search($arguments);
				#dump($ar_records,"ar_records ".print_r($arguments,true),array('arguments'=>$arguments)); dump(end($ar_records)); return;


			if( empty($ar_records[0]) ) {
				if(SHOW_DEBUG) dump($arguments,'$arguments '.$matrix_table.' '.print_r($ar_records,true));
				$msg = "<div class=\"warning\">Warning. Date $fecha_de_los_datos not found [$matrix_table]</div>";
				#throw new Exception($msg, 1);
				#echo $msg;
				return ;
			} 
			#dump( $ar_records ,'$ar_records');

			# Si hay varios, cogeremos el mas moderno que estará más actualizado
			$parent = end($ar_records);

			# AR_DIFFUSION_MAP : Full map
			$ar_diffusion_map = $this->get_ar_diffusion_section_map( null );
				#dump($ar_diffusion_map,'$ar_diffusion_map');
			
			$ar_final=array();

			foreach ($ar_diffusion_map as $key => $ar_value) {
				
				$related_section_tipo = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($key, $modelo_name='section', $relation_type='termino_relacionado')[0];
					#dump($related_section_tipo,'$related_section_tipo');
				
				$ar_map_related = array();
				foreach ($ar_value as $stats_tipo) {
					
					$related_component_tipo = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($stats_tipo, $modelo_name='component_', $relation_type='termino_relacionado')[0];
						#dump($related_component_tipo,'related_component_tipo ' );
						
						$related_component_modelo = RecordObj_ts::get_modelo_name_by_tipo($related_component_tipo);

						# PORTAL : CASO PORTALES (El tipo es referido por 'portal_list' y definido en propiedades del puntero)
						if ($related_component_modelo=='component_portal') {
							$RecordObj_ts 	= new RecordObj_ts($stats_tipo);
							$propiedades 	= $RecordObj_ts->get_propiedades();
							$propiedades 	= json_decode($propiedades);

							$related_component_tipo = $propiedades->portal_list[0];
								#dump($related_component_tipo,'$related_component_tipo');
						}
					
					$current_modelo = RecordObj_ts::get_modelo_name_by_tipo($stats_tipo);
						#dump($current_modelo,'current_modelo '." $key - ". print_r($stats_tipo,true ) );

					$RecordObj_ts 	= new RecordObj_ts($stats_tipo);
					$propiedades 	= $RecordObj_ts->get_propiedades();
					$propiedades 	= json_decode($propiedades);	
						#dump($propiedades,'propiedades');

					$ar_map_related[$related_component_tipo] = array( 'modelo' => $current_modelo, 'propiedades' => $propiedades );	
				}

				
				##########
				# SECTION : Current section stats from matrix_stats
				if ($related_section_tipo==$caller_section_tipo  ) {
					
					# COMPONENT_STATS
					$component_stats = new component_stats(NULL,$key,'stats',$parent);
						#dump($component_stats,'component_stats');

					$dato = $component_stats->get_dato()[$related_section_tipo];
						#dump($dato,'dato');

					# FILTER : Apply filter to result
						# Filter records
						$ar_records_filtered = array();
						$ar_records = filter::get_ar_filter($related_section_tipo);
							#dump($ar_records,'ar_records');

						foreach ($ar_records as $key => $current_section_id) {
							if (array_key_exists($current_section_id, $dato)) {
								$ar_records_filtered[$current_section_id] = $dato[$current_section_id];
							}							
						}
						#dump($ar_records_filtered,'$ar_records_filtered');

					
					# PRIMERA PASADA (Suma los valores)
						$results=array();
						$total_records = count($ar_records_filtered);
						foreach ($ar_records_filtered as $ar_value) 
						foreach ($ar_value as $current_component_tipo => $value) {
							
							#dump($current_component_tipo,'$current_component_tipo '.$current_component_tipo);

							$component_modelo_name = RecordObj_ts::get_modelo_name_by_tipo($current_component_tipo);
								#dump($component_modelo_name,'$component_modelo_name');
							$results[$current_component_tipo] = $component_modelo_name::get_stats_value($current_component_tipo, $value);

						}
						#dump($results,'$results');


					# SEGUNDA PASADA (Resuelve los keys)
						$ar_resolved=array();
						foreach ($results as $current_component_tipo => $value) {

							$component_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($current_component_tipo);

							# RECUPERA EL MODELO DE GRÁFICO A MOSTRAR (PIE, BAR ...) Y LAS PROPIEDADES
							if ( array_key_exists($current_component_tipo, $ar_map_related) ) {
								$stats_model 		= $ar_map_related[$current_component_tipo]['modelo'];		
								$stats_propiedades 	= $ar_map_related[$current_component_tipo]['propiedades'];
									#dump($stats_model,'stats_model');	
							}
							#dump($component_modelo_name,'component_modelo_name - $current_component_tipo:'.$current_component_tipo." key:".$key);						

							$valor 					= $component_modelo_name::get_stats_value_resolved($current_component_tipo, $results[$current_component_tipo], $stats_model ,$stats_propiedades);
							#$ar_final[] 			= $valor;
							$ar_resolved = array_merge($ar_resolved, $valor);
						}
						$ar_final = array_merge($ar_final, $ar_resolved);
						#dump($ar_final,'$ar_final');

					
				}#end if ($related_section_tipo==$caller_section_tipo) 


				###########
				# ACTIVITY
				if($related_section_tipo==DEDALO_ACTIVITY_SECTION_TIPO ) {

					# COMPONENT_STATS
					$component_stats = new component_stats(NULL,$key,'stats',$parent);
						#dump($component_stats,'component_stats');

					$dato = $component_stats->get_dato();
						#dump($dato,'dato');

					$path = array_key_path('section_tipo:'.$caller_section_tipo, $dato);
						#dump($path,'$path');

					if (!$path) {
						#return "No activity data exists for this section";
						return null;
					}

					$ar_section_activity =& array_path($dato, $path);
						#dump($ar_section_activity,'$ar_section_activity section '.$caller_section_tipo);					

					# FILTER
					# Filter records
						$ar_records_filtered = array();
						$ar_records = filter::get_ar_filter(DEDALO_SECTION_USERS_TIPO);
							#dump($ar_records,'ar_records');

						foreach ($ar_records as $key => $current_section_id) {

							if (array_key_exists('userID:'.$current_section_id, $ar_section_activity)) {
								$ar_records_filtered[$current_section_id] = $ar_section_activity['userID:'.$current_section_id];								
							}							
						}
						#dump($ar_records_filtered,'$ar_records_filtered');


					# PRIMERA PASADA (Suma los valores)
						$ar_results=array();
						$total_records 	= count($ar_records_filtered);						
						foreach ($ar_records_filtered as $userID => $ar_value1)
						foreach ($ar_value1 as $key => $ar_value) 
						foreach ($ar_value as $name => $value) {

							if(isset($ar_results[$key][$name]))
								$ar_results[$key][$name] = $ar_results[$key][$name] + $value;
							else
								$ar_results[$key][$name] = $value;
							#dump($value,'value name:'.$name." key:$key");
						}
						#dump($ar_results,'$ar_results');


					# SEGUNDA PASADA (Resuelve los keys)
						$ar_resolved=array();
						foreach ($ar_results as $current_action => $ar_value) {

							$current_action_resolved = label::get_label($current_action);

							switch (true) {
								case ($current_action=='que') :
									foreach ($ar_value as $key => $value) {
										$key_resolved = RecordObj_ts::get_termino_by_tipo( explode(':', $key)[1] );
										$ar_resolved[$current_action_resolved.':stats_pie'][$key_resolved] = $value;
									}
									break;
								case ($current_action=='ip') :
									foreach ($ar_value as $key => $value) {
										
										# GEOIP LIB
										if (empty(self::$geoip_mm)) {
											require_once(DEDALO_ROOT."/lib/geoip/geoipcity.inc");
											require_once(DEDALO_ROOT."/lib/geoip/geoipregionvars.php");
											self::$geoip_mm = geoip_open(DEDALO_ROOT."/lib/geoip/data/GeoLiteCity.dat",GEOIP_STANDARD);
										}
										$record 			= geoip_record_by_addr(self::$geoip_mm,$key);
										if($record) {
											$code 			= $record->country_code ;		
											$city			= utf8_encode($record->city) ;
											$country_name 	= $record->country_name ;
											#$region 		= $record->region ;
											#if($code && $region)
											#$region_name	= $GEOIP_REGION_NAME[$code][$region];
											#$continent_code	= $record->continent_code ;

											$key_resolved = "$key - $city ($country_name)";
										}else{
											$key_resolved = $key;
										}
										#dump($record ,'$record ip '.$key);
										
										$ar_resolved[$current_action_resolved.':stats_bar_horizontal'][$key_resolved] = $value;
											#dump($ar_resolved[$current_action_resolved.':stats_bar'][$key_resolved], " -$key ");
									}
									break;
								case ($current_action=='donde') :
									foreach ($ar_value as $key => $value) {
										$key_resolved = RecordObj_ts::get_termino_by_tipo( $key );
										$ar_resolved[$current_action_resolved.':stats_pie'][$key_resolved] = $value;
									}
									break;
								case ($current_action=='proyecto') :									
									foreach ($ar_value as $key => $value) {
										$key_resolved = component_filter::get_stats_value_resolved_activity( $key );
											#dump($key_resolved,'key_resolved '.$key);
										$ar_resolved[$current_action_resolved.':stats_pie'][$key_resolved] = $value;
									}									
									break;
								case ($current_action=='registros_modificados') :
								case ($current_action=='registros_visualizados') :
									foreach ($ar_value as $key => $value) {
										$section 		= new section($key,$caller_section_tipo);
										$key_resolved 	= $section->get_section_id();

										$ar_resolved[$current_action_resolved.':stats_pie'][$key_resolved] = $value;
									}
									break;
								case ($current_action=='actividad_horaria') :
									$range = range(0,23);
									foreach ($range as $current_hour) {

										$key_resolved 	= $current_hour.'h';

										if( array_key_exists($current_hour, $ar_value) ) {
											$value = $ar_value[$current_hour];
										}else{
											$value = null;
										}
										$ar_resolved[$current_action_resolved.':stats_bar'][$key_resolved] = $value;
									}																			
									break;	
								default:
									foreach ($ar_value as $key => $value) {
										$key_resolved 	= $key;
										$ar_resolved[$current_action_resolved.':stats_pie'][$key_resolved] = $value;	
									}
									break;
							}							
							$ar_final = array_merge($ar_final, $ar_resolved);
														
						}
						#$ar_final = $results;
						#dump($ar_final,'$ar_final');



				}#end if($related_section_tipo==$this->caller_section_tipo) {


			}#end foreach ($ar_diffusion_map as $key => $value) {

			


			return $ar_final;
	}


	/**
	* GET_MATRIX_SECTION_DATA
	* Recoge los datos originales de los componentes (matrix) 
	*//*
	protected function get_matrix_section_data($section_tipo, $ar_diffusion_map) {
		
		#$ar_diffusion_map 		= $this->get_ar_diffusion_section_map( array($section_tipo=>null) );
			#dump($ar_diffusion_map ,'$ar_diffusion_map ');

		# AR_DIFFUSION_MAP :  Iterate
		foreach ($ar_diffusion_map as  $key => $current_tipo) {

				$related_component_tipo = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($current_tipo, $modelo_name='component_', $relation_type='termino_relacionado')[0];
					#dump($related_component_tipo,'$related_component_tipo '.$current_tipo);
				
				$RecordObj_ts = new RecordObj_ts($current_tipo);
				$propiedades  = $RecordObj_ts->get_propiedades();
				$ar_stats_map[$current_tipo] = array(
					'tipo'=>$related_component_tipo,
					'propiedades'=>$propiedades
					);						
		}		
		#dump($ar_stats_map,'$ar_stats_map');

		# TARGET_SECTION_TIPO : Real target section tipo (like dd12)
		$target_section_tipo = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($section_tipo, $modelo_name='section', $relation_type='termino_relacionado')[0];
		

		# SECTION : DIRECT SEARCH
		$arguments=array();
		$arguments['tipo']				= $target_section_tipo;
		$arguments['parent']			= 0;
		
		# DEDALO_ACTIVITY_SECTION_TIPO : Filter only one day (prev day)
		if($target_section_tipo==DEDALO_ACTIVITY_SECTION_TIPO) {
			$timestamp = component_date::get_timestamp_now_for_db( array('sub'=>'P1D') );
			$timestamp = component_date::get_timestamp_now_for_db( );
			#$timestamp = "2013-12-28";
			$arguments['dato:%like%']	=  date("Y-m-d", strtotime($timestamp));
				#dump( $arguments ,'$arguments'); die();
		}

		$matrix_table 					= common::get_matrix_table_from_tipo($target_section_tipo);
		$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
		$ar_records						= $RecordObj_matrix->search($arguments);
			#dump($ar_records,"ar_records - $matrix_table - ". print_r($arguments,true)); die();

		$object  = new stdClass();
		$ar_dato = array();
		foreach ($ar_records as $current_section_id) {
			
			#$current_section = new section($current_section_id, $target_section_tipo);
				#dump($current_section,'$current_section');
			
			foreach ($ar_stats_map as $key => $ar_value) {
				
				$component_tipo 		= $ar_value['tipo'];
				$component_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($component_tipo);
				$current_component 		= new $component_modelo_name(NULL, $component_tipo, 'stats', $current_section_id);

				# PROPIEDAES
				$propiedades = json_decode($ar_value['propiedades']);
					#dump($propiedades->portal_list[0],'$propiedades');
				if( !empty($propiedades->portal_list) && !empty($propiedades->portal_list[0]) ) {
					$component_tipo = $propiedades->portal_list[0];
				}

				# CURRENT_DATO WITH PROPIEDADES				
				$current_dato = $current_component->get_stats_obj( $propiedades );

				
				# FINAL ARRAY STORED
				$ar_dato[$current_section_id][$component_tipo] = $current_dato;

			
				# $object dummy
				#if( $component_tipo=='dd867' ) {
				#	$component_test = new $component_modelo_name('dummy',$component_tipo);
				#	$component_test->set_dato($current_dato[0]);
				#	$valor = $component_test->get_valor();
				#		#dump($valor,'$component_test ' . $current_dato[0] . " $component_modelo_name");
				#}
								
			}#end foreach ($ar_stats_map as $key => $ar_value) 
			
		}#end foreach ($ar_records as $current_section_id)
		#dump($ar_dato,'$ar_dato');

		return $ar_dato;
	}
	*/


	


	
	
}
?>