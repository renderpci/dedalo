<?php
/*
* CLASS TOOL_LAYOUT_PRINT
* Manage presets and layout print
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

# COMPONENT SECTION
define('DEDALO_LAYOUT_PUBLIC_COMPONENT_SECTION_TIPO'	, 'dd67'); # pública
define('DEDALO_LAYOUT_TEMPLATES_COMPONENT_SECTION_TIPO' , 'dd61'); # Privada

# COMPONENT LAYOUT
define('DEDALO_LAYOUT_PUBLIC_COMPONENT_LAYOUT_TIPO'		, 'dd39'); # pública
define('DEDALO_LAYOUT_TEMPLATES_COMPONENT_LAYOUT_TIPO'	, 'dd23'); # Privada

# COMPONENT TEXT (LABEL / TEMPLATE NAME) Like 'Template One'
define('DEDALO_LAYOUT_PUBLIC_COMPONENT_LABEL_TIPO'		, 'dd38'); # pública
define('DEDALO_LAYOUT_TEMPLATES_COMPONENT_LABEL_TIPO'	, 'dd29'); # Privada



class tool_layout_print extends tool_common {

	
	protected $section_obj;	# received section
	
	public $templates_default;	# Private default templates (matrix_layout_dd)
	public $templates_public;	# Public editable templates (matrix_layout)

	/**
	* __CONSTRUCT
	* @param obj $section_obj section object full
	* @param string $modo like 'page' (default)
	*/
	public function __construct($section_obj, $modo) {
		
		# Verify type section object
		if ( get_class($section_obj) !== 'section') {
			throw new Exception("Error Processing Request. Only sections are accepted in this tool", 1);			
		}

		# Fix current component/section
		$this->section_obj = $section_obj;

		# Fix modo
		$this->modo = $modo;		
			
	}



	/**
	* GET_TEMPLATES_PUBLIC
	* @param string $type like 'public' / 'private'
	* @return array $ar_layout_obj
	*/
	protected function get_ar_templates($type){

		switch ($type) {
			case 'public':
				$component_section_tipo = DEDALO_LAYOUT_PUBLIC_COMPONENT_SECTION_TIPO; 	
				$component_label_tipo 	= DEDALO_LAYOUT_PUBLIC_COMPONENT_LABEL_TIPO;	//'dd38';
				$component_layout_tipo	= DEDALO_LAYOUT_PUBLIC_COMPONENT_LAYOUT_TIPO;	
				$matrix_table 			= 'matrix_layout';				
				$section_layout_tipo 	= DEDALO_SECTION_LAYOUT_PUBLIC_TIPO;
				break;
			
			case 'private':
				$component_section_tipo = DEDALO_LAYOUT_TEMPLATES_COMPONENT_SECTION_TIPO;
				$component_label_tipo 	= DEDALO_LAYOUT_TEMPLATES_COMPONENT_LABEL_TIPO;	//'dd29';
				$component_layout_tipo	= DEDALO_LAYOUT_TEMPLATES_COMPONENT_LAYOUT_TIPO;
				$matrix_table 			= 'matrix_layout_dd';
				$section_layout_tipo 	= DEDALO_SECTION_LAYOUT_TEMPLATES_TIPO;
				break;
		}
		$section_tipo	= $this->section_obj->get_tipo();
		$layout_records = self::search_layout_records($component_section_tipo, $section_tipo, $matrix_table);

		$ar_layout_obj=array();
		foreach ($layout_records as $id_matrix) {

			$component_label  = component_common::get_instance('component_input_text', $component_label_tipo, $id_matrix, 'list', DEDALO_DATA_LANG); 
			$component_layout = component_common::get_instance('component_layout', $component_layout_tipo, $id_matrix, 'list', DEDALO_DATA_NOLAN);
			
			$layout_obj = new stdClass();
				$layout_obj->id 					= $id_matrix;
				$layout_obj->type 					= $type;
				$layout_obj->section_layout_tipo 	= $section_layout_tipo;		
				$layout_obj->label 					= $component_label->get_dato();				
				$layout_obj->section_layout_dato 	= $component_layout->get_dato();
				$layout_obj->component_layout_tipo  = $component_layout_tipo;				

			$ar_layout_obj[$id_matrix] = $layout_obj;
		}
		return $ar_layout_obj;
	}


	/**
	* SEARCH_LAYOUT_RECORDS
	* @param string $section_tipo like oh1
	* @param string $component_section_tipo like dd67	
	* @return array $ar_id array of int id matrix
	*/
	protected static function search_layout_records($component_section_tipo, $section_tipo, $matrix_table) {

		$filter = JSON_RecordObj_matrix::build_pg_filter('gin','datos',$component_section_tipo,DEDALO_DATA_NOLAN,$section_tipo);
		
		$strQuery  = '';
		$strQuery .= ' SELECT id ';
		$strQuery .= ' FROM ' . $matrix_table;
		$strQuery .= ' WHERE ' . $filter;
			#dump($strQuery," ");die();
		$result	= JSON_RecordObj_matrix::search_free($strQuery);
		
		$ar_id=array();
		while ($rows = pg_fetch_assoc($result)) {
			$ar_id[] = $rows['id'];
		}#end while
		return $ar_id;
	}


	/**
	* GET_AR_COMPONENTS
	* Get array of all components of received section
	* @param string $section_tipo like dd20
	* @param array $ar_id_matrix range of records selected in list view
	* @return array $ar_section_resolved array of components in modo print
	*/
	protected function get_ar_components($section_tipo, $ar_id_matrix, $resolve_virtual=false){
		
		$ar_components_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, 'component_', true, $resolve_virtual);
		//dump($ar_components_tipo,"ar_components_tipo");
		
		if(SHOW_DEBUG) {
			//dump($ar_components_tipo,"ar_components_tipo");
		}
		$ar_include_components = array(
			'component_input_text',
			'component_text_area',
			'component_filter',
			'component_check_box',
			'component_autocomplete',
			'component_autocomplete_ts',
			'component_date',
			'component_radio_button',
			'component_select',
			'component_select_lang',
			'component_portal',
			);

		$i=1;
		foreach ($ar_components_tipo as $key => $component_tipo) {
			
			if ($i>10) { // TEMPORAL LIMIT FOR SIMPLICITY
				#continue;
			}

			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
				#error_log($modelo_name);
			
			if (!in_array($modelo_name, $ar_include_components)) {
				continue;
			}
			if($modelo_name =='component_portal'){
			
				$RecordObj_dd = new RecordObj_dd($component_tipo);
				$ar_relaciones = $RecordObj_dd->get_relaciones();
				//dump($ar_relaciones,"ar_relaciones");
				$parent    = reset($ar_id_matrix);			
				$component = component_common::get_instance($modelo_name, $component_tipo, $parent, 'print');
				$ar_section_resolved[$section_tipo][$component_tipo]['portal'] = $component;
				$ar_component_dato = $component->get_dato();
				$component_dato = Array();
				foreach ($ar_component_dato as $key => $dato) {
					$component_dato[] = $dato->section_id_matrix;
				}
				//dump($ar_component_dato,"ar_component_dato");
				//$component_dato    = get_object_vars($ar_component_dato);

				//dump($component_dato,"component_dato");
				foreach ($ar_relaciones as $key => $relaciones) {
					foreach ($relaciones as $modelo => $componente_tipo_relationed) {
						$modelo_name = RecordObj_dd::get_termino_by_tipo($modelo, null, true);
						if($modelo_name =='section'){
							//$section_real_tipo = section::get_section_real_tipo_static($componente_tipo);
							$ar_section_resolved[$section_tipo][$component_tipo]['section'] = $this->get_ar_components($componente_tipo_relationed, $component_dato, $resolve_virtual=true);
							#$ar_section_resolved['all_sections'][]=$componente_tipo_relationed; 
						};			
					}
					//dump($value,"value");
					//$modeloID 	 = key($value);
					//$modelo_name = RecordObj_dd::get_termino_by_tipo($key, null, true);
					//dump($modelo_name,"modelo_name $key");
				}
				

			}else{
				$parent    = reset($ar_id_matrix);			
				$component = component_common::get_instance($modelo_name, $component_tipo, $parent, 'print');
				
				$ar_section_resolved[$section_tipo][$component_tipo] = $component;
				#$ar_components[$value] = RecordObj_dd::get_termino_by_tipo($value);
			}

			//$i++;
		}
		//dump($ar_components,"ar_components");
		//die();
		return $ar_section_resolved;
	}




	
	
};#end tool_layout_print
?>