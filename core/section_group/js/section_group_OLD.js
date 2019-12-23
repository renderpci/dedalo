/**
* SECTION_GROUP
*
*
*
*/
var section_group = new function() {

	"use strict";

	/**
	* INIT
	* @return 
	*/
	this.init = function( options) {

		const self = this

		// hide unactive tabs
		self.toogle_view(options.wrapper_id)

		// set click event to tab  headers
		self.set_events(options.wrapper_id)

		return true
	}//end init


	/**
	* SET_EVENTS
	*  
	*/
	this.set_events = function( wrapper_id) {

		const self = this

		const wrapper 	  = document.getElementById(wrapper_id)
		const tab_content = wrapper.querySelector('.tab_content')
		const tab_title   = wrapper.querySelector('.tab_title')
		
		// Event click to tab title
		tab_title.addEventListener("click", function(){

			// Store tab state in a cookie
			const tab_id = tab_title.dataset.tab_id

			if(tab_id!==null) {
				const tab_value = get_localStorage(tab_id)				
				// SET TAB
				if(tab_value==='1') {
					tab_content.style.display = 'block'
					remove_localStorage(tab_id)
				}else{
					tab_content.style.display = 'none'
					
					set_localStorage(tab_id, 1)
				}
			}			

		}, false);

		return true
	}//end set_events



	/**
	* TOOGLE_VIEW
	*  
	*/
	this.toogle_view = function(wrapper_id) {
	
		const self = this

		const wrapper 	  = document.getElementById(wrapper_id)	
		const tab_content = wrapper.querySelector('.tab_content')
		const tab_title   = wrapper.querySelector('.tab_title')
	
		// Store tab state in a cookie
		const tab_id = tab_title.dataset.tab_id
		if(tab_id!==null) {
			const tab_value = get_localStorage(tab_id)				
			// SET TAB
			if(tab_value==='1') {
				tab_content.style.display = 'none'
			}else{
				tab_content.style.display = 'block'
			}
		}

		return true
	}//end toogle_view



}//end section_group