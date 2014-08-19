<?php
/*
* CLASS DIFUSSION_INDEX_TS
* Genera la visualización de los fragmentos indexados con el termino actual. Se muestra en el Tesauro, al pulsar sobre los botones 'U'
* Recupera los locators que apuntan al término actual, los agrupa por tipo y los muestra en un listado con diversa información (Código,Proyecto,Título,Municipio,etc)
*/


class diffusion_index_ts extends diffusion {
	
	public $terminoID;
	public $ar_locators;
	public $ar_id_section;

	/**
	* CONSTRUCT
	*/
	function __construct( $terminoID=null ) {

		if (empty($terminoID)) {
			throw new Exception("Error Processing Request. empty terminoID", 1);
		}

		$this->terminoID = $terminoID;

		# Fix ar_locators
		$this->ar_locators = $this->get_ar_locators();
		#if(empty($this->ar_locators)) return null;

		#$this->ar_locators = $this->filter_ar_id_section();
	}

	# GET_AR_LOCATORS
	public function get_ar_locators() {

		$terminoID 		= $this->terminoID;
		$ar_indexations = Tesauro::get_ar_indexations($terminoID);
			#dump($ar_indexations,'$ar_indexations');

		return $ar_indexations;
	}

	# GET_AR_SECTION_TOP_TIPO
	protected function get_ar_section_top_tipo() {
		
		$ar_id_section 		= array();
		$ar_final 			= array();
		$userID_matrix 		= navigator::get_userID_matrix();
		$ar_locators 		= $this->ar_locators;

		if (is_array($ar_locators)) foreach ($ar_locators as $key => $current_locator) {
			
			$locator_as_obj 		= component_common::get_locator_as_obj($current_locator);

			# ID SECTION
			$section_top_tipo		= $locator_as_obj->section_top_tipo;	#dump($section_top_tipo,'$section_top_tipo')
			$section_top_id_matrix	= $locator_as_obj->section_top_id_matrix;
			$section_id_matrix		= $locator_as_obj->section_id_matrix;
			$component_tipo			= $locator_as_obj->component_tipo;
			$tag_id					= $locator_as_obj->tag_id;

			# SECTION_TOP_TIPO
			$ar_section_top_tipo[$section_top_tipo][$section_top_id_matrix][] = $locator_as_obj;	#$current_locator ;#substr($current_locator, strlen($id_section)+1);
		}
		#dump($ar_section_top_tipo,'$ar_section_top_tipo');


		# GLOBAL ADMIN
		$is_global_admin = component_security_administrator::is_global_admin($userID_matrix);
			#dump($is_global_admin,'$is_global_admin '.$userID_matrix);

		if($is_global_admin!==true) {
			
			# Filter
			foreach ($ar_section_top_tipo as $section_top_tipo => $ar_values) {

				# TIPO : Filter for current top tipo
				$ar_filter_id = filter::get_ar_filter($section_top_tipo);
					#dump($ar_filter_id ,'$ar_filter_id '.$section_top_tipo);
				
				# REMOVE : Remove not authorized id's
				foreach ($ar_section_top_tipo[$section_top_tipo] as $section_top_id_matrix => $locator_as_obj) {
					if ( !in_array($section_top_id_matrix, $ar_filter_id) ) {		
						unset($ar_section_top_tipo[$section_top_tipo][$section_top_id_matrix]);
					}
				}
			}			

			# DELETE EMPTY TOP TIPOS ARRAYS
			$ar_section_top_tipo = array_filter($ar_section_top_tipo);

		#dump($ar_section_top_tipo,'$ar_section_top_tipo FILTERED');
		}
		#print "<pre>";	
		#print_r($ar_section_top_tipo).'';
		#print "</pre>";	

		return $ar_section_top_tipo;
	}



	# GET_AR_DIFFUSION_MAP : 
	protected function get_ar_diffusion_map(array $ar_section_top_tipo) {
		
		#if(SHOW_DEBUG) $start_time = start_time();

		$ar_diffusion_map = array();

		# DIFFUSION STRUCTURE

			# DIFFUSION_DOMAIN : Get structure tipo of current ('dedalo') diffusion_index_ts
			$diffusion_domain = diffusion::get_my_diffusion_domain('dedalo',get_called_class());
				#dump($diffusion_domain,'$diffusion_domain');

			# DIFFUSION_SECTIONS : Get sections defined in structure to view
			$ar_diffusion_section = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($diffusion_domain, $modelo_name='diffusion_section', $relation_type='children');
				#dump($ar_diffusion_section,'$ar_diffusion_section');

			# DIFFUSION_SECTIONS : Recorremos las secciones de difusión para localizar las coincidencias con los tipos de sección de las indexaciones
			foreach ($ar_diffusion_section as $diffusion_section_tipo) {

				# diffusion_section_tipo ar_relateds_terms
				$current_section_tipo = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($diffusion_section_tipo, $modelo_name='section', $relation_type='termino_relacionado')[0];
					#dump($current_section_tipo,'$current_section_tipo');
				
				# current_section_tipo : Verify
				if (empty($current_section_tipo)) {
					throw new Exception("Error Processing Request get_ar_diffusion_map: diffusion section related is empty. Please configure structure with one diffusion section related", 1);
				}

				# IN ARRAY ?					
				if ( array_key_exists($current_section_tipo, $ar_section_top_tipo) ) {
					
					# HEAD 
					$diffusion_head_tipo 		= RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($diffusion_section_tipo, $modelo_name='diffusion_head', $relation_type='children')[0];
						#dump($diffusion_section_tipo,'$diffusion_section_tipo');
					#$ar_diffusion_head_related 	= RecordObj_ts::get_ar_terminos_relacionados($diffusion_head_tipo, $cache=false, $simple=true);
					$ar_diffusion_head_childrens 	= RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($diffusion_head_tipo, $modelo_name='diffusion_component', $relation_type='children');
						#dump($ar_diffusion_head_childrens,'$ar_diffusion_head_childrens');

					$ar_diffusion_map['head'][$current_section_tipo] =  $ar_diffusion_head_childrens ;
						#dump($ar_diffusion_map,'$ar_diffusion_map');

					
					# ROW
					$diffusion_row_tipo 		= RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($diffusion_section_tipo, $modelo_name='diffusion_row', $relation_type='children')[0];
						#dump($diffusion_section_tipo,'$diffusion_section_tipo');

					if(!empty($diffusion_row_tipo)) {
						$ar_diffusion_row_related 	= RecordObj_ts::get_ar_terminos_relacionados($diffusion_row_tipo, $cache=false, $simple=true);
							#dump($ar_diffusion_row_related,'$ar_diffusion_row_related');

						$ar_diffusion_map['row'][$current_section_tipo] =  $ar_diffusion_row_related ;
							#dump($ar_diffusion_map,'$ar_diffusion_map');
					}

				}#end if ( array_key_exists($current_section_tipo, $ar_section_top_tipo) )
				
			}#end foreach ($ar_diffusion_section as $diffusion_section_tipo

		#if(SHOW_DEBUG) dump( exec_time($start_time, __METHOD__) );

		return $ar_diffusion_map;
	}




}
?>