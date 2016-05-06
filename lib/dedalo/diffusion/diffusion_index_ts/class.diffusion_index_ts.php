<?php
/*
* CLASS DIFUSSION_INDEX_TS
* Genera la visualización de los fragmentos indexados con el término actual. Se muestra en el Tesauro, al pulsar sobre los botones 'U'
* Recupera los locators que apuntan al término actual, los agrupa por tipo y los muestra en un listado con diversa información (Código,Proyecto,Título,Municipio,etc)
*/


class diffusion_index_ts extends diffusion {
	
	public $terminoID;
	public $ar_locators;
	public $ar_id_section;

	/**
	* CONSTRUCT
	* @param string $terminoID Like 'ts53'
	*/
	function __construct( $terminoID=null ) {

		if (empty($terminoID)) {
			debug_log(__METHOD__." Error Processing Request. empty terminoID ".to_string($terminoID), logger::DEBUG);
			return false;			
		}

		$this->terminoID = $terminoID;

		# Fix ar_locators
		#$this->ar_locators = $this->get_ar_locators();

		$this->domain = 'dedalo';
	}



	/**
	* get_ar_diffusion_map_index_ts : Overrides diffusion method
	* Specific for thesaurus only
	*/
	public function get_ar_diffusion_map_index_ts( $ar_section_top_tipo=array() ) {
				
		if (isset($this->ar_diffusion_map)) {
			return $this->ar_diffusion_map;
		}

		if(SHOW_DEBUG) $start_time = start_time();

		$ar_diffusion_map = array();

		# DIFFUSION STRUCTURE

			# DIFFUSION_DOMAIN : Get structure tipo of current ('dedalo') diffusion_index_ts
			$diffusion_domain = diffusion::get_my_diffusion_domain($this->domain, get_called_class());
				#dump($diffusion_domain,'$diffusion_domain');

			# DIFFUSION_SECTIONS : Get sections defined in structure to view
			$ar_diffusion_section = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_domain, 'diffusion_section', 'children');
				#dump($ar_diffusion_section,'$ar_diffusion_section');

			# DIFFUSION_SECTIONS : Recorremos las secciones de difusión para localizar las coincidencias con los tipos de sección de las indexaciones
			foreach ($ar_diffusion_section as $diffusion_section_tipo) {

				# diffusion_section_tipo ar_relateds_terms
				$ar_current_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_section_tipo, 'section', 'termino_relacionado');
					#dump($ar_current_section_tipo,'$ar_current_section_tipo');
				
				# ar_current_section_tipo : Verify
				if ( empty($ar_current_section_tipo[0]) ) {
					if(SHOW_DEBUG) {
						$ar_related = (array)RecordObj_dd::get_ar_terminos_relacionados($diffusion_section_tipo);
						#dump($ar_related, 'ar_related termns');
						foreach ($ar_related as $key => $value)
						foreach ($value as $current_modelo => $terminoID) {
							#echo " $current_modelo - $terminoID ";
							$RecordObj_dd = new RecordObj_dd($terminoID);
							$modelo 	  = $RecordObj_dd->get_modelo();	
							if ($current_modelo!=$modelo) {
								throw new Exception("Error Processing Request. Inconsistency detected: relation model ($current_modelo) and target real model ($modelo) are differents!", 1);								
							}
						}						
					}
					$msg  = "Error Processing Request get_ar_diffusion_map_index_ts: diffusion section related is empty. Please configure structure with one true diffusion section related ($diffusion_section_tipo) ";
					$msg .= "Please check the consistency and model of related term. diffusion_section_tipo:$diffusion_section_tipo must be a section (verify target element too) ";
					throw new Exception($msg, 1);
				}else{
					$current_section_tipo = $ar_current_section_tipo[0];
						#dump($current_section_tipo, ' current_section_tipo');
				}
				#dump($ar_section_top_tipo, '$ar_section_top_tipo');
				
				# IN ARRAY ?					
				if ( array_key_exists($current_section_tipo, $ar_section_top_tipo) ) {
					
					#
					# HEAD 
					$diffusion_head_tipo 		= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_section_tipo, $modelo_name='diffusion_head', $relation_type='children')[0];
						#dump($diffusion_section_tipo,'$diffusion_section_tipo');
					#$ar_diffusion_head_related 	= RecordObj_dd::get_ar_terminos_relacionados($diffusion_head_tipo, $cache=false, $simple=true);
					$ar_diffusion_head_childrens 	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_head_tipo, $modelo_name='diffusion_component', $relation_type='children');
						#dump($ar_diffusion_head_childrens,'$ar_diffusion_head_childrens');

					$ar_diffusion_map['head'][$current_section_tipo] =  $ar_diffusion_head_childrens ;
						#dump($ar_diffusion_map,'$ar_diffusion_map');

					#
					# ROW
					$ar_diffusion_row_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_section_tipo, $modelo_name='diffusion_row', $relation_type='children');
					if (!empty($ar_diffusion_row_tipo[0])) {

						$diffusion_row_tipo = $ar_diffusion_row_tipo[0];

						$ar_diffusion_row_related 	= RecordObj_dd::get_ar_terminos_relacionados($diffusion_row_tipo, $cache=false, $simple=true);
							#dump($ar_diffusion_row_related,'$ar_diffusion_row_related');

						$ar_diffusion_map['row'][$current_section_tipo] =  $ar_diffusion_row_related ;
							#dump($ar_diffusion_map,'$ar_diffusion_map');
					}					

				}#end if ( array_key_exists($current_section_tipo, $ar_section_top_tipo) )
				
			}#end foreach ($ar_diffusion_section as $diffusion_section_tipo

		if(SHOW_DEBUG) {
			#dump( $ar_diffusion_map, 'ar_diffusion_map' );
			#echo "<span style=\"position:absolute;right:30px;margin-top:-25px\">".exec_time($start_time)."</span>";
		}

		return $this->ar_diffusion_map = $ar_diffusion_map;
		
	}//end get_ar_diffusion_map_index_ts



	/**
	* GET_AR_LOCATORS
	* Get all indexations (locators) of current termino (terminoID like ts574)
	* @return array of locator objects $ar_locators 
	*/
	public function get_ar_locators() {

		if (isset($this->ar_locators)) {
			return $this->ar_locators;
		}

		/* Es un poco más rápido a través de la búsqueda
			$matrix_table 			= RecordObj_descriptors::get_matrix_table_from_tipo( $this->terminoID );
			$RecordObj_descriptors 	= new RecordObj_descriptors($matrix_table, null, $this->terminoID, DEDALO_DATA_NOLAN, 'index', false);	//($matrix_table=null, $id=NULL, $parent=NULL, $lang=NULL, $tipo='termino', $fallback=false) { 
			$ar_indexations 		= json_decode( $RecordObj_descriptors->get_dato() );
				#dump($ar_indexations, ' ar_indexations ++ '.to_string());
			*/

		$ar_indexations = Tesauro::get_ar_indexations( $this->terminoID );
			#dump($ar_indexations,'$ar_indexations');

		return $this->ar_locators = $ar_indexations;
	}



	/**
	* GET_AR_SECTION_TOP_TIPO
	* Map/group ar_locators (indexations of current term) as formated array section[id] = ar_data
	* Filter locators for current user (by project)
	* @return array $ar_section_top_tipo
	*/
	protected function get_ar_section_top_tipo() {

		$start_time=microtime(1);
		
		$ar_section_top_tipo= array();		
		$user_id 			= navigator::get_user_id();
		$ar_locators 		= $this->get_ar_locators();

		foreach ((array)$ar_locators as $current_locator) {
			#dump($current_locator,"current_locator");
			# ID SECTION
			$section_top_tipo		= $current_locator->section_top_tipo;	#dump($section_top_tipo,'$section_top_tipo')
			$section_top_id			= $current_locator->section_top_id;
			$section_tipo			= $current_locator->section_tipo;
			$section_id				= $current_locator->section_id;
			$component_tipo			= $current_locator->component_tipo;
			$tag_id					= $current_locator->tag_id;

			# SECTION_TOP_ID recalculate
			# Como un recurso puede cambiar de 'bien', el locator 'section_top_id' de la indexación NO ES FIABLE !!
			# Hacemos un cálculo inverso para evitar inconsistencias
			#$section = section::get_instance($section_id=null, $tipo=false, $modo='edit') {;


			# AR_SECTION_TOP_TIPO MAP
			$ar_section_top_tipo[$section_top_tipo][$section_top_id][] = $current_locator;	#$current_locator ;#substr($current_locator, strlen($id_section)+1);
		}
		#dump($ar_section_top_tipo,'$ar_section_top_tipo');

		#
		# FILTER RESULT BY USER PROJECTS
		if( ($is_global_admin = component_security_administrator::is_global_admin($user_id))!==true ) {

			# USER PROJECTS : All projects that current user can view
			$ar_user_projects = (array)filter::get_user_projects( $user_id );
			$ar_user_projects = array_keys($ar_user_projects);
				#dump($ar_user_projects,"ar_user_projects"); die();
			
			# Filter
			foreach ($ar_section_top_tipo as $section_top_tipo => $ar_values) {

				# COMPONENT FILTER BY SECTION TIPO
				$section_real_tipo 		= section::get_section_real_tipo_static($section_top_tipo);
				$component_filter_tipo  = section::get_ar_children_tipo_by_modelo_name_in_section($section_real_tipo, 'component_filter')[0];
				
				if (empty($component_filter_tipo)) {
					if(SHOW_DEBUG) {
						throw new Exception("Error Processing Request. component_filter_tipo not found in section tipo: $section_top_tipo", 1);
					}
					continue;	// Skip this				
				}

				# ar_keys are section id_matrix of current section tipo
				$ar_keys = array_keys($ar_values);
					#dump($ar_keys,"ar_keys for $section_top_tipo , $component_filter_tipo");

				foreach ($ar_keys as $current_id_section) {
					
					$component_filter 	= component_common::get_instance('component_filter',
																		$component_filter_tipo,
																		$current_id_section,
																		'edit',
																		DEDALO_DATA_NOLAN,
																		$section_top_tipo
																		);
					$dato 				= (array)$component_filter->get_dato();
					# Projects of current record (stored in his component_filter dato)
					$ar_filter_projects = array_keys($dato);
						#dump($ar_filter_projects,"dato $component_filter_tipo,$section_top_tipo");
						$ar_intersect 	= (array)array_intersect($ar_filter_projects,$ar_user_projects);
							#dump($result,"result");
						if (count($ar_intersect)<1) {
							unset($ar_section_top_tipo[$section_top_tipo][$current_id_section]);
						}
				}				
			}
			# DELETE EMPTY TOP TIPOS ARRAYS
			#$ar_section_top_tipo = array_filter($ar_section_top_tipo);
		

		}//end if( ($is_global_admin = component_security_administrator::is_global_admin($user_id))!==true ) {
		
		if(SHOW_DEBUG) {
			$total=round(microtime(1)-$start_time,3);
			$slow = 0.125;
			if ($total>$slow) {
				dump($total,"SLOW METHOD (>$slow): total secs $total");
			}			
		}	

		return $ar_section_top_tipo;

	}//end get_ar_section_top_tipo



	/**
	* GET_LIST_DATA
	* @return 
	*/
	public function get_list_data__WORKING_HERE( $section_tipo, $section_tipo_locators ) {
		
		$search_options_session_key = 'ts_list_'.$section_tipo;

		if (isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key])) {						
			$options = clone($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]);		
			$options->full_count = false; # Force update count records on non ajax call						
			# Set context
			$context = $options->context;
		}else{
			
			# LAYOUT_MAP : Calculate list for layout map
			# All related terms are selected except section that is unset from the array
			$layout_map_virtual  	= $this->get_layout_map();
			$ar_target_section_tipo = $this->get_ar_target_section_tipo();
				#dump( $layout_map_virtual,"layout_map_virtual - $ar_target_section_tipo"); #die();

			# OPTIONS
			$options = new stdClass();
				$options->section_tipo  	= reset($ar_target_section_tipo);
				$options->filter_by_locator = (array)$dato;
				$options->layout_map  		= $layout_map_virtual;
				$options->modo  			= 'portal_list';
				$options->limit 			= false; # IMPORTANT : No limit is applicated to portal list. All records are viewed always
				$options->search_options_session_key = $search_options_session_key;
					#dump($options," options");					

				# OPTIONS CONTEXT : Configure section context
				$context = new stdClass();
					$context->context_name 	= 'list_in_portal';
					$context->portal_tipo 	= $tipo;
					$context->portal_parent = $parent;

				$options->context = $context;
					#dump($options,"options");									
		}//end if (!empty($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]))		

		$rows_data = search::get_records_data($options);

	}#end get_list_data




}
?>