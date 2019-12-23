<?php
/*
* class COMPONENT_ORDER
*
*
*/
class component_order extends component_common {
	
	# GET DATO
	public function get_dato() {
		$dato = parent::get_dato();
		$format_dato = $this->set_format_form_type($dato);

		return $format_dato;
	}//end get_dato



	# SET_DATO
	public function set_dato($dato) {
		$format_dato = $this->set_format_form_type($dato);

		parent::set_dato( $format_dato );			
	}//end set_dato
	


	/*
	* SET_FORMAT_FORM_TYPE
	* Format the dato into the standar format or the propiedades format of the current intance of the component
	*/
	public function set_format_form_type ($dato){

		$propiedades = $this->get_propiedades();
		
		if(empty($propiedades->type)){
			return (float)$dato;
		}else{
			# Iterate object once
			foreach ($propiedades->type as $key => $value) {

				switch ($key) {
					case 'int':
						if($value === 0 || empty($value)){
							return (int)$dato;
						}
						if ( strpos($dato, '-')===0 )  {
							$dato = '-'.substr($dato,1,$value);
							$dato = (int)$dato;

						}else{
							$dato = (int)substr($dato,0,$value);
						}						
						break;					
					default:
						$dato = (float)number_format($dato,$value);
						break;
				}

				break;
			}
		}//end if(empty($propiedades->type))

		return $dato;
	}//end set_format_form_type



	/**
	* GET_SEARCH_ORDER
	* Overwrite as needed
	* @return string $order_direction
	*/
	public static function get_search_order($json_field, $search_tipo, $tipo_de_dato_order, $current_lang, $order_direction) {
		$order_by_resolved = "a.$json_field#>'{components, $search_tipo, $tipo_de_dato_order, $current_lang}' ".$order_direction;
		
		return (string)$order_by_resolved;
	}//end get_search_order



	/**
	* GET_DIFFUSION_VALUE
	* Calculate current component diffsuion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( $lang ) {
		$dato = $this->get_dato();

		return $dato;
	}//end get_diffusion_value


	
}//end component_order
?>