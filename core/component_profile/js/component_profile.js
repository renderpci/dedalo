"use strict"
/**
* component_profile
*
*
*
*/
var component_profile = new function() {

	this.url_trigger 	= DEDALO_LIB_BASE_URL + '/component_profile/trigger.component_profile.php' ;
	this.save_arguments = {}



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		

		return true
	};//end init


	
	/**
	* SAVE
	* @return 
	*/
	this.Save = function( component_obj ) {

		var value = parseInt(component_obj.value)
		
		if (component_obj.value<1) {
			return alert("Please, select one profile")
		}

		this.save_arguments = {
			'dato' : value
		}		

		// Exec general save		
		var jsPromise = component_common.Save(component_obj, this.save_arguments);

	};//end Save



	/**
	* go_to_profile
	* @return 
	*/
	this.go_to_profile = function( button_obj, section_tipo, uid ) {

		var profile_select  = document.getElementById(uid)
		if (profile_select) {
			
			var section_id  = profile_select.value,
				url 		= '?t='+section_tipo+'&id='+section_id+'&m=edit&top_tipo='+page_globals.top_tipo+'&top_id='+page_globals.top_id
			
			//console.log(url);			
			window.location.href = url
		}		

	}//end go_to_profile



}//end component_profile