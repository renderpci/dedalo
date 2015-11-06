<?php
/*
* CLASS COMPONENT RADIO BUTTON
*/


class component_radio_button extends component_common {

	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;
	
	
	
	# GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	public function get_valor( $format='html' ) {

		switch ($this->modo) {
			case 'diffusion':
				$dato = $this->get_dato();
				if ($dato==1) {
					return 'si';
				}else{
					return 'no';
				}
				break;
			
			default:				
				$ar_list_of_values	= $this->get_ar_list_of_values();
				$dato_string 		= $this->get_dato();
					#dump($dato,'dato '.$this->id);
				
				if (is_array ($ar_list_of_values)) foreach ($ar_list_of_values as $value => $rotulo) {								
					if( $value == $dato_string ) {						
						$this->valor = $rotulo;						
						return $this->valor;
					}
				}
				break;
		}#end switch
		

	}#end get_valor

	#Josetxo 20/01/2015
	public function ger_ar_link_fields(){
		
		$ar_link_fields = array();

		$tipo 			= $this->get_tipo();
		$RecordObj_ts 	= new RecordObj_ts($tipo);
		$relaciones 	= $RecordObj_ts->get_relaciones();

		if (!empty($relaciones) && is_array($relaciones)) foreach($relaciones as $ar_relaciones) {

			foreach($ar_relaciones as $tipo_modelo => $current_link_fields) {
				#dump($ar_referenced_tipo,'$ar_referenced_tipo');
				$modelo_name = RecordObj_ts::get_termino_by_tipo($tipo_modelo);

				$ar_link_fields[$modelo_name] = $current_link_fields;
			}			
		}
		//dump($ar_link_fields,'$ar_link_fields');

		return $ar_link_fields;

	}
	#Fin Josetxo 20/01/2015


}
?>