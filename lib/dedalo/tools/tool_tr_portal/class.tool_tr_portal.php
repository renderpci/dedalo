<?php
/*
* CLASS TOOL_TR_PORTAL
*/
class tool_tr_portal extends tool_common {
	

	# media component
	protected $component_obj ;

	# text component
	protected $component_related_obj;



	public function __construct($component_obj, $modo='button') {
		
		# Fix modo
		$this->modo = $modo;

		# Fix current media component
		$this->component_obj = $component_obj;

		# Fix lang
		$this->lang = $this->component_obj->get_lang();

		# Fix related component (text)
		#$this->component_related_obj = $this->get_component_related_obj();
	}//end __construct



	/**
	* GET_COMPONENT_RELATED_OBJ
	*/
	protected function get_component_related_obj() {

		if(isset($this->component_related_obj)) return $this->component_related_obj;

		# media tipo
		$tipo = $this->component_obj->get_tipo();

		# media parent
		$parent = $this->component_obj->get_parent();

		$section_tipo = $this->component_obj->get_section_tipo();
			

		# media related terms
		/*
		$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($tipo, $cache=false, $simple=true);
			dump($ar_terminos_relacionados,'$ar_terminos_relacionados');

		# Verify is set in structure
		if (empty($ar_terminos_relacionados[0])) {
			throw new Exception("Component related not exists. Please configure dependencies", 1);			
		}
		*/
		# Verify modelo
		/*
		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($ar_terminos_relacionados[0],true);
		if ($modelo_name!='component_text_area') {
			throw new Exception("Component related tipo is invalid (only 'component_text_area' is accepted). Please configure dependencies", 1);			
		}
		*/
		# método acceso directo al componente. buscamos probablemente el componente text_area para transcripbir (pude no haber)
		$ar_terminos_relacionados = $this->component_obj->RecordObj_dd->get_relaciones();
			#dump($ar_terminos_relacionados,'$ar_terminos_relacionados');
		
		if(empty($ar_terminos_relacionados)) {
			#throw new Exception("Component related not exists. Please configure dependencies", 1);
			return null;
		}
			
		foreach ($ar_terminos_relacionados as $modelo => $termino_relacionado_tipo) {
			$termino_relacionado_tipo = reset($termino_relacionado_tipo);
			break;
		}

		# Create final related component
		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($termino_relacionado_tipo,true);
		$modo 		 = 'edit';	// 'tool_tr_portal' | 'edit'
		$component_text_area = component_common::get_instance($modelo_name,
															  $termino_relacionado_tipo,
															  $parent,
															  $modo,
															  DEDALO_DATA_LANG,
															  $section_tipo);


		$this->component_related_obj = $component_text_area;

		return $this->component_related_obj;
	}//end get_component_related_obj


	
}//end class tool_tr_portal
?>