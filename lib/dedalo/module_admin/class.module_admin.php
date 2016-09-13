<?php
/*
* CLASS MODULE ADMIN
*/

class module_admin extends zona {
	
	
	protected $ar_section ;
	
	
	public function get_ar_section() {
	
		#print_r($this->tipo);	
	
		$ar_list =array();
		
		$ar_relaciones	= RecordObj_dd::get_ar_terminos_relacionados($this->tipo, $cache=true, $simple=true);
		
		if( is_array($ar_relaciones) ) foreach($ar_relaciones as $terminoID) {	
			
			$RecordObj_dd		= new RecordObj_dd($terminoID);
			$modeloID			= $RecordObj_dd->get_modelo();
			$modelo_name		= RecordObj_dd::get_termino_by_tipo($modeloID,null,true);
			
			switch($modelo_name) {
				
				# STORE BUTTONS OF SECTION
				case (strpos($modelo_name, 'module') !== false)	: $this->tipo = $terminoID;	$this->load_structure_data();  break;					
			}
		}
	
		# GENERATE EDIT LAYOUT
	
		#print_r($this->tipo);
		
		#$ar_zonas = $this->get_ar_zonas('section');	var_dump($ar_zonas);
		return $this->get_ar_zonas('section');
	}







}
?>