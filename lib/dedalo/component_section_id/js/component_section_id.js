"use strict"
/**
* COMPONENT_SECTION_ID
*
*/
var component_section_id = new function() {


	/**
	* GET_DATO
	* This method is only for search pourposes
	* @return string value
	*/
	this.get_dato = function(wrapper) {
		
		const input = wrapper.getElementsByTagName('input')[0]
		const value = input.value


		return value
	};//end get_dato



	/**
	* IS_NUMBER
	* Used to avoid user insert non numeric chars in field section_id
	* @return bool
	*/
	this.is_number = function(evt) {

		evt = (evt) ? evt : window.event;
	    const charCode = (evt.which) ? evt.which : evt.keyCode;
	    if (charCode > 31 && (charCode < 48 || charCode > 57)) {
	        return false;
	    }
	    return true;
	};//end is_number


}//end component_section_id