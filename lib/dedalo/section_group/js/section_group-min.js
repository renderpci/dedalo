"use strict";
/**
* SECTION_GROUP
*
*
*/
var section_group = new function() {

	/**
	* INIT
	* @return 
	*/
	this.init = function( options) {

		let self = this

		self.toogle_view(options)
		self.set_events(options)
	}


	/**
	* SET_EVENTS
	*  
	*/
	this.set_events = function( options) {

		let self = this

		const wrapper_id = options.wrapper_id
		const warp_object = document.getElementById(wrapper_id)
		const tab_content = warp_object.querySelector('.tab_content')
		const tab_title = warp_object.querySelector('.tab_title')
		
		tab_title.addEventListener("click", function(){

			// Store tab state in a cookie
			const tab_id = tab_title.dataset.tab_id

			if(tab_id !== null) {
				const tab_value = get_localStorage(tab_id)				
				// SET TAB
				if(tab_value === '1') {
					tab_content.style.display ='block'
					remove_localStorage(tab_id)
				}else{
					tab_content.style.display ='none'
					
					set_localStorage(tab_id, 1)
				}
			}			

		}, false);
	}

	/**
	* TOOGLE_VIEW
	*  
	*/
	this.toogle_view = function(options) {

		let self = this

		const wrapper_id = options.wrapper_id
		const warp_object = document.getElementById(wrapper_id)
		const tab_content = warp_object.querySelector('.tab_content')
		const tab_title = warp_object.querySelector('.tab_title')
		
		// Store tab state in a cookie
		const tab_id = tab_title.dataset.tab_id

		if(tab_id !== null) {
			const tab_value = get_localStorage(tab_id)				
			// SET TAB
			if(tab_value === '1') {
				tab_content.style.display ='none'
			}else{
				tab_content.style.display ='block'
			}
		}

	}

}//end section_group

