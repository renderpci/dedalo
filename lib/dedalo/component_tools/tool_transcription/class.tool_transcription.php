<?php
/*
* CLASS TOOL LANG
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');


class tool_transcription extends tool_common {
	
	# media component
	protected $component_obj ;

	# text component
	protected $component_related_obj ;


	
	public function __construct($component_obj, $modo='button') {
		
		# Fix modo
		$this->modo = $modo;

		# Fix current media component
		$this->component_obj = $component_obj;

		# Fix related component (text)
		#$this->component_related_obj = $this->get_component_related_obj();
	}


	/**
	* GET_COMPONENT_RELATED_OBJ
	*/
	protected function get_component_related_obj() {

		if(isset($this->component_related_obj)) return $this->component_related_obj;

		# media tipo
		$tipo = $this->component_obj->get_tipo();

		# media parent
		$parent = $this->component_obj->get_parent();


		# media related terms
		/*
		$ar_terminos_relacionados = RecordObj_ts::get_ar_terminos_relacionados($tipo, $cache=false, $simple=true);
			dump($ar_terminos_relacionados,'$ar_terminos_relacionados');

		# Verify is set in structure
		if (empty($ar_terminos_relacionados[0])) {
			throw new Exception("Component related not exists. Please configure dependencies", 1);			
		}
		*/
		# Verify modelo
		/*
		$modelo_name = RecordObj_ts::get_modelo_name_by_tipo($ar_terminos_relacionados[0]);
		if ($modelo_name!='component_text_area') {
			throw new Exception("Component related tipo is invalid (only 'component_text_area' is accepted). Please configure dependencies", 1);			
		}
		*/
		# método acceso directo al componente. buscamos probablemente el componente text_area para transcripbir (pude no haber)
		$ar_terminos_relacionados = $this->component_obj->get_relaciones();
			#dump($ar_terminos_relacionados,'$ar_terminos_relacionados');
		
		if(empty($ar_terminos_relacionados)) {
			#throw new Exception("Component related not exists. Please configure dependencies", 1);
			return null;
		}
			
		foreach ($ar_terminos_relacionados as $modelo => $termino_relacionado_tipo) {
			break;
		}


		# Create final related component
		$component_text_area = new component_text_area(NULL,$termino_relacionado_tipo,'edit',$parent,DEDALO_DATA_LANG);	#$id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG


		$this->component_related_obj = $component_text_area;

		return $this->component_related_obj;
	}


	
	

	
	













	
	
}

?>