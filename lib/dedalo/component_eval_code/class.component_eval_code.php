<?php
/*
* CLASS COMPONENT EVAL_CODE
*/


class component_eval_code extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	# GET DATO
	public function get_dato() {
		$dato = parent::get_dato();
		return (string)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (string)$dato );
	}

	
	# OVERWRITE GET VALOR
	public function get_valor() {		
		
		# Get php code for evaluate from filed 'obs' in tesauro
		$obs = RecordObj_dd::get_obs_by_tipo( self::get_tipo() );		#dump($obs);
		
		$id = 1;
		
		# Set buffer, evaluate php code and store result in a var 'evaluated_code' to return final html
		try{
			ob_start();
			
			eval(" echo $obs ; ");
					
			$evaluated_code = ob_get_contents();
			ob_get_clean();
		
		} catch (Exception $e) {
			echo 'Caught exception: ',  $e->getMessage(), "\n";
		}
		
		#$evaluated_code = $$obs ;
		
		return $evaluated_code;
	}


	# Override component_common method
	public function get_ar_tools_obj() {
		return NULL;
	}
	

}

?>