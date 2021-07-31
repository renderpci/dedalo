<?php
/*
* CLASS DIFUSSION_INDEX_TS
* Genera la visualización de los fragmentos indexados con el término actual. Se muestra en el Tesauro, al pulsar sobre los botones 'U'
* Recupera los locators que apuntan al término actual, los agrupa por tipo y los muestra en un listado con diversa información (Código,Proyecto,Título,Municipio,etc)
*/
class diffusion_index_ts extends diffusion {

	#public $terminoID;
	public $ar_locators;
	public $ar_id_section;

	// Term section tipo section id
	public $section_tipo;
	public $section_id;
	public $component_tipo;

	/**
	* CONSTRUCT
	* @param string $terminoID Like 'ts53'
	*/
	#function __construct( $terminoID=null ) {
	function __construct( $section_tipo, $section_id, $component_tipo ) {

		#if (empty($terminoID)) {
		#	debug_log(__METHOD__." Error Processing Request. empty terminoID ".to_string($terminoID), logger::DEBUG);
		#	return false;
		#}

		$this->section_tipo 	= $section_tipo;
		$this->section_id 		= $section_id;
		$this->component_tipo 	= $component_tipo;

		# Fix ar_locators
		#$this->ar_locators = $this->get_ar_locators();

		$this->domain = 'dedalo';
	}



	/**
	* GET_AR_DIFFUSION_MAP_INDEX_TS : Overrides diffusion method
	* Specific for thesaurus only
	*/
	public function get_ar_diffusion_map_index_ts( $ar_section_top_tipo=array() ) {

		if (isset($this->ar_diffusion_map)) {
			return $this->ar_diffusion_map;
		}

		if(SHOW_DEBUG===true) $start_time = start_time();

		$ar_diffusion_map = array();

		# DIFFUSION STRUCTURE

			# DIFFUSION_DOMAIN : Get structure tipo of current ('dedalo') diffusion_index_ts
			$diffusion_domain = diffusion::get_my_diffusion_domain($this->domain, get_called_class());
				#dump($diffusion_domain,'$diffusion_domain');

			# DIFFUSION_SECTIONS : Get sections defined in structure to view
			$ar_diffusion_section = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_domain, 'diffusion_section', 'children');
				#dump($ar_diffusion_section,'$ar_diffusion_section');

			# DIFFUSION_SECTIONS : Go through the diffusion sections to find the coincidences with the types of section of the indexing
			foreach ($ar_diffusion_section as $diffusion_section_tipo) {

				# diffusion_section_tipo ar_relateds_terms
				$ar_current_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_section_tipo, 'section', 'termino_relacionado');
					#dump($ar_current_section_tipo,'$ar_current_section_tipo');

				# ar_current_section_tipo : Verify
				if ( empty($ar_current_section_tipo[0]) ) {
					if(SHOW_DEBUG===true) {
						$ar_related = (array)RecordObj_dd::get_ar_terminos_relacionados($diffusion_section_tipo);
						#dump($ar_related, 'ar_related termns');
						foreach ($ar_related as $value)
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

						$ar_diffusion_row_related 	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_row_tipo, $modelo_name='diffusion_component', $relation_type='children');
							#dump($ar_diffusion_row_related,'$ar_diffusion_row_related');

						$ar_diffusion_map['row'][$current_section_tipo] =  $ar_diffusion_row_related ;
							#dump($ar_diffusion_map,'$ar_diffusion_map');
					}

				}#end if ( array_key_exists($current_section_tipo, $ar_section_top_tipo) )

			}#end foreach ($ar_diffusion_section as $diffusion_section_tipo

		if(SHOW_DEBUG===true) {
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

		#if (isset($this->ar_locators)) {
		#	return $this->ar_locators;
		#}

		#$ar_indexations = Tesauro::get_ar_indexations( $this->terminoID );
			#dump($ar_indexations,'$ar_indexations');

		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($this->component_tipo, true);

		# INDEXATIONS
		$component 		= component_common::get_instance($modelo_name, //'component_relation_index',
														 $this->component_tipo,
														 $this->section_id,
														 'list',
														 DEDALO_DATA_NOLAN,
														 $this->section_tipo);

		$ar_locators = $component->get_dato();

		return (array)$ar_locators;
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
			// dump($current_locator,"current_locator");
			# ID SECTION

			$section_tipo			= $current_locator->section_tipo;
			$section_id				= $current_locator->section_id;

			// if the locator couldn't has section_top_tipo or section_top_id, because it's a direct locator, copy the section_tipo and section_id to the top_* properties

			$section_top_tipo		= $current_locator->section_top_tipo ?? $current_locator->section_tipo;
			$section_top_id			= $current_locator->section_top_id ?? $current_locator->section_id;
			$component_tipo			= $current_locator->component_tipo ?? null;
			$tag_id					= $current_locator->tag_id ?? null;

			# SECTION_TOP_ID recalculate
			# Como un recurso puede cambiar de 'bien', el locator 'section_top_id' de la indexación NO ES FIABLE !!
			# Hacemos un cálculo inverso para evitar inconsistencias
			#$section = section::get_instance($section_id=null, $tipo=false, $modo='edit') {;


			# AR_SECTION_TOP_TIPO MAP
			$ar_section_top_tipo[$section_top_tipo][$section_top_id][] = $current_locator;	#$current_locator ;#substr($current_locator, strlen($id_section)+1);


		}
		// dump($ar_section_top_tipo,'$ar_section_top_tipo');

		#
		# FILTER RESULT BY USER PROJECTS
		if( false===security::is_global_admin($user_id) ) {

			# USER PROJECTS : All projects that current user can view
			$ar_user_projects = (array)filter::get_user_projects( $user_id );
				#dump($ar_user_projects, ' ar_user_projects ++ '.to_string());

			# Filter
			foreach ($ar_section_top_tipo as $section_top_tipo => $ar_values) {

				# COMPONENT FILTER BY SECTION TIPO
				$section_real_tipo 		= section::get_section_real_tipo_static($section_top_tipo);
				$component_filter_tipo  = section::get_ar_children_tipo_by_modelo_name_in_section($section_real_tipo, 'component_filter')[0];
				if (empty($component_filter_tipo)) {
					if(SHOW_DEBUG===true) {
						throw new Exception("Error Processing Request. component_filter_tipo not found in section tipo: $section_top_tipo", 1);
					}
					continue;	// Skip this
				}

				# ar_keys are section_id of current section tipo records
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
					$component_filter_dato = (array)$component_filter->get_dato();

					$in_user_projects = false;
					foreach ($ar_user_projects as $user_project_locator) {
						if (true===locator::in_array_locator($user_project_locator, $component_filter_dato, $ar_properties=['section_id','section_tipo'])) {
							$in_user_projects = true;
							break;
						}
					}
					if ($in_user_projects===false) {
						debug_log(__METHOD__." Removed row from thesaurus index_ts list (project not mathc with user projects) ".to_string($ar_section_top_tipo[$section_top_tipo][$current_id_section]), logger::DEBUG);
						unset($ar_section_top_tipo[$section_top_tipo][$current_id_section]);
					}
				}
			}
			# DELETE EMPTY TOP TIPOS ARRAYS
			#$ar_section_top_tipo = array_filter($ar_section_top_tipo);


		}//end if( ($is_global_admin = security::is_global_admin($user_id))!==true ) {

		if(SHOW_DEBUG===true) {
			$total=round(microtime(1)-$start_time,3);
			$slow = 0.125;
			if ($total>$slow) {
				dump($total,"SLOW METHOD (>$slow): total secs $total");
			}
		}

		return $ar_section_top_tipo;
	}//end get_ar_section_top_tipo



	/**
	* BUILD_INDEXATION_GRID
	* @return
	*/
	public function build_indexation_grid() {


		require_once(DEDALO_CORE_PATH .'/media_engine/class.OptimizeTC.php');

		#$terminoID 				= $this->terminoID;
		$ar_section_top_tipo 	= $this->get_ar_section_top_tipo();
			#dump($ar_section_top_tipo,'$ar_section_top_tipo'); die();
		$ar_diffusion_map 		= $this->get_ar_diffusion_map_index_ts($ar_section_top_tipo);
			// dump($ar_diffusion_map,'$ar_diffusion_map'); die();


		foreach ($ar_section_top_tipo as $current_section_tipo => $ar_values) {

			$section_name 	= RecordObj_dd::get_termino_by_tipo($current_section_tipo,null,true);

			#
			# HEAD ELEMENTS (diffusion map)
			if(!isset($ar_diffusion_map['head'][$current_section_tipo])) {
				if(SHOW_DEBUG) {
					debug_log(__METHOD__." Warning: current_section_tipo: $current_section_tipo ($section_name) is not defined in structure to be showed. <br>
					This section have indexations but will be not displayed in these results. Please fix this ASAP ".to_string(), logger::WARNING);
					echo "<div class=\"warning\">".end($GLOBALS['log_messages'])."</div>";
				}
				continue;
			}
			$current_head_elements = $ar_diffusion_map['head'][$current_section_tipo];
				#dump($current_head_elements,'$current_head_elements');

			#
			# SECTION
			# dump($ar_values,'$ar_values');
			foreach ($ar_values as $current_section_id => $ar_head) {
				#dump($current_section_id, ' current_section_id ++ '.to_string());
				/**/
				#
				# SECTION HEAD
					# HEAD ELEMENTS
					# ar_diffusion_obj_head reset array on every iteration
					$ar_diffusion_obj_head = [];

		  			# HEAD COMPONENTS : Iterate head components
					foreach ($current_head_elements as $head_element_tipo) {
						// dump($current_head_elements,'$current_head_elements');

						$RecordObj_dd	= new RecordObj_dd($head_element_tipo);
						$current_lang	= $RecordObj_dd->get_traducible()==='si' ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
						$properties		= $RecordObj_dd->get_properties();

						$related_component_tipo = RecordObj_dd::get_ar_terminos_relacionados($head_element_tipo, $cache=true, $simple=true)[0];
							// dump($related_component_tipo,'$related_component_tipo');

						$component_modelo 	= RecordObj_dd::get_modelo_name_by_tipo($related_component_tipo,true);
						// dump($component_modelo,'$component_modelo');
						$current_component 	= component_common::get_instance($component_modelo,
																			 $related_component_tipo,
																			 $current_section_id,
																			 'list',
																			 $current_lang,
																			 $current_section_tipo);
						#dump($current_component,'$current_component');

						// $ar_diffusion_obj_head[] = $current_component->get_diffusion_obj( $properties );
						$ar_diffusion_obj_head[] = $current_component->get_value( );

					}
					dump($ar_diffusion_obj_head,'ar_diffusion_obj_head '.to_string($current_section_id));
					// include DEDALO_CORE_PATH .'/diffusion/'. get_class($this) . '/html/' . get_class($this) . '_head.phtml';
					// $html_group .= $html_head;

				#
				# SECTION ROWS
					# ROWS ELEMENTS
					#$ar_components_text_area = array();
					$ar_row_elements = $ar_values[$current_section_id];
					/*
					foreach ($ar_values[$current_section_id] as $key => $rel_locator_obj) {
						#dump($rel_locator_obj,'$rel_locator_obj');

						# COMPONENT_TEXT_AREA
						#$ar_components_text_area[$rel_locator] = component_common::get_instance('component_text_area', $rel_locator_obj->component_tipo,$rel_locator_obj->section_id,'list');
							#dump($ar_components_text_area[$rel_locator],'$ar_components_text_area[$rel_locator]');

					}
					*/
					// include DEDALO_CORE_PATH .'/diffusion/'. get_class($this) . '/html/' . get_class($this) . '_row.phtml';
					// $html_group .= $html_row;

			}//end foreach ($ar_values as $current_section_id => $ar_head) {


			// include DEDALO_CORE_PATH .'/diffusion/'. get_class($this) . '/html/' . get_class($this) . '_table.phtml';
		}


	}//end build_indexation_grid



}
