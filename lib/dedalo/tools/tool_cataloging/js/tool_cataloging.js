/**
* TOOL_CATALOGUE CLASS
*
*
*
*/
var tool_catalogue = new function() {

	'use strict';


	// LOCAL VARS
	this.trigger_tool_description_url = DEDALO_LIB_BASE_URL + '/tools/tool_description/trigger.tool_description.php'



	/**
	* INIT
	* @return 
	*/
	this.inited = false
	this.init = function(data) {

		const self = this;

		// Set data vars
		self.textarea_lang = data.textarea_lang

		if (self.inited!==true) {

			// READY (EVENT)
			//$(function() {
			window.ready(function(){
			
			});//end ready


			// LOAD (EVENT)			
			window.addEventListener("load", function (event) {				
			
			}, false)//end load

			
			// BEFOREUNLOAD (EVENT)
			window.addEventListener("beforeunload", function (event) {				
				event.preventDefault();

			}, false)//end beforeunload


			// UNLOAD (EVENT)			
			window.addEventListener("unload", function (event) {
				event.preventDefault();
				
			}, false)//end unload


			// RESIZE (EVENT)		
			window.addEventListener("resize", function (event) {
			
			}, false)//end resize
			

		}//end if (this.inited!==true)		

		self.inited = true

		return true
	}//end init



};//end tool_catalogue