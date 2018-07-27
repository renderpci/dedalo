
"use strict";
/**
* PAGE JS
*/
var page = {

	trigger_url : page_globals.__WEB_ROOT_WEB__ + "/web/trigger.web.php",

	setup : function() {
			var self = this
			window.ready(function(){
				self.hilite_lang(page_globals.WEB_CURRENT_LANG_CODE)
			})
	},

	hilite_lang : function(lang) {
		//console.log("hilite_lang lang:",lang);
		
		// Lang selected
		var page_lang_selector = document.getElementById("page_lang_selector")
		if (page_lang_selector) {
			var nodes = page_lang_selector.querySelectorAll("a")
			for (var i = 0; i < nodes.length; i++) {
				if ( nodes[i].href.indexOf(lang) !== -1 ) {
					nodes[i].classList.add("selected")
				}
			}
		}
	},

	load_more_items : function(button_obj) {

		var template_map = JSON.parse(button_obj.dataset.template_map)
			//console.log(template_map);

		var target_div = document.getElementById(button_obj.dataset.target)

		var spinner = document.createElement("div")
			spinner.classList.add("spinner_list")
			target_div.appendChild(spinner)

		var trigger_vars = {
			mode 		 : 'load_more_items',
			template_map : template_map
		}

		common.get_json_data(this.trigger_url, trigger_vars, true).then(function(response){
				console.log("[page.load_more_items] response", response);

				if (response===null) {
					console.log("[page.load_more_items] Error. Null response");
				}else{
					var list_rows = document.createElement("div")
						list_rows.innerHTML = response.html
					
					var ar_childrens = list_rows.children

					// Add loaded elements to the end of current container
					while(ar_childrens.length>0) {
						// Note that when appendChild is done, element is removed from array ar_childrens
						target_div.appendChild(ar_childrens[0])
					}

					// Update button template_map
					template_map.offset = template_map.offset + template_map.max_records
					button_obj.dataset.template_map = JSON.stringify(template_map)

					// Hide button on arrive to max
					if (template_map.offset >= template_map.total_records) {
						button_obj.style.display = "none"
					}
				}
				spinner.remove()
		})
	},

	/**
	* ADJUST_IMAGE_SIZE
	* Verticalize properties of vertical images (default is horizontal)
	*/
	adjust_image_size : function(image_obj) {

		image_obj.style.opacity = 0;
		var actual_image = document.createElement("img")
			actual_image.src = image_obj.style.backgroundImage.replace(/"/g,"").replace(/url\(|\)$/ig, "")
			actual_image.addEventListener("load", function(e){
				//console.log(e);
				var width  = this.width;
				var height  = this.height;
				//console.log(width, height);

				// Vertical case
				if (height>width) {
					image_obj.classList.add("vertical")

					// Adjust title and body text ?				
				}
				image_obj.style.opacity = 1;
			}, false)
	},	



}//end page

page.setup()