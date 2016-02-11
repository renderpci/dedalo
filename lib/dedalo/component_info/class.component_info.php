
<?php
/*
* CLASS COMPONENT_INFO
*/


class component_info extends component_common {
	
	

	/**
	* GET_DATO
	* @return 
	*/
	public function get_dato() {
		return null;
	}#end get_dato

	/**
	* GET_VALOR
	* @return 
	*/
	public function get_valor() {
		return null;
	}#end get_valor


	/**
	* GET_AR_TOOLS_OBJ
	*/
	public function get_ar_tools_obj() {
		
		# Remove all tools 
		#unset($this->ar_tools_name);
		$this->ar_tools_name = array();
	
		return parent::get_ar_tools_obj();
	}




















	
}//end component_info
?>