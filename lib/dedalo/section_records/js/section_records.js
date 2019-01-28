/**
* SECTION_RECORDS
*
*
*
*/
var section_records = new function() {


	"use strict";
	

	this.initied = false


	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {

		if (self.initied===true) {
			if(SHOW_DEBUG===true) {
				console.log("[section_records.init] Already initied: ",options);
			}
			return false
		}

	
		// Load js files
		if (options.ar_js) {
			let ar_js_len = options.ar_js.length
			for (let i = ar_js_len - 1; i >= 0; i--) {
				let src = options.ar_js[i]
				// Load js file
				common.load_script(src, function(e){
					//console.log("loaded : "+src);
				})
			}
		}

		// Load css files
		if (options.ar_css) {
			let ar_css_len = options.ar_css.length
			for (let i = ar_css_len - 1; i >= 0; i--) {
				let src = options.ar_css[i]
				// Load js file
				common.load_style(src, function(e){
					//console.log("loaded : "+src);
				})
			}
		}

		// Set as initied
		self.initied = true

		if(SHOW_DEBUG===true) {
			console.log("[section_records.init] Init successuful: ",options);
		}

		return true
	};//end init
	


}//end section_list