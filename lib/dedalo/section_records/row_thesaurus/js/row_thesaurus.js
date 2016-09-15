





var row_thesaurus = new function() {



	/**
	* ADD_CHILDREN
	* @return 
	*/
	this.add_children = function(button_obj) {
		
		alert("Working here!")
	};//end add_children



	/**
	* EDIT
	*/
	this.edit = function() {

		alert("Working here!")
	};//end edit



	/**
	* delete
	*/
	this.delete = function() {

		alert("Working here!")
	};//end delete


	
	/**
	* SHOW_LIST_THESAURUS_DATA
	* @return 
	*/
	this.show_list_thesaurus_data = function( button_obj, html_data, role, callback ) {
		
		// Locate current row_thesaurus container
		var wrap_row_thesaurus = find_ancestor(button_obj, 'wrap_row_thesaurus')
			//console.log(wrap_row_thesaurus);

		var data_container = wrap_row_thesaurus.getElementsByClassName('data_container')[0]
			//console.log(data_container);
			if (typeof data_container==='undefined' ) {
				console.log("Error on locate data_container div");
				return false;
			}
			//data_container.style.minHeight = "42px"; // avoid flash on load elements			

		var element_data_div = data_container.querySelectorAll('[data-role="'+role+'"]')[0]
			//console.log(element_data_div);

		if (element_data_div) {
			//console.log("Founded!!");

			if (element_data_div.style.display=='none') {
				// Hide all
				var all_element_data_div = data_container.childNodes
					for (var i = all_element_data_div.length - 1; i >= 0; i--) {
						all_element_data_div[i].style.display = 'none'
					}					
				// Show current
				element_data_div.style.display='table-cell'
			}else{
				element_data_div.style.display='none'
			}

		}else{
			//console.log("Not found");

			data_container.classList.add("loading_list_thesaurus_data")	

			element_data_div 	= document.createElement("div");
			element_data_div.dataset.role = role;	//'related_terms'
			element_data_div.style.display='table-cell'

			// Hide all
			var all_element_data_div = data_container.childNodes
				for (var i = all_element_data_div.length - 1; i >= 0; i--) {
					all_element_data_div[i].style.display = 'none'
				}

			// Callback optional
			if (callback && typeof(callback) === "function") {			

				// Exec callback
				var jsPromise = callback();

					jsPromise.then(function(response) {
					  	//console.log(response);

					  	// Parse html text as object
						var el = document.createElement('div')
					  	el.innerHTML = response

						// Pure javascript option (replace content and exec javascript code inside)
						insertAndExecute(element_data_div, el)

						data_container.classList.remove("loading_list_thesaurus_data")	

						// Add element to DOM
						data_container.appendChild(element_data_div);

					}, function(xhrObj) {
					  	console.log(xhrObj);
					});				

			}else{

				// Parse html text as object
				var el = document.createElement('div')
				el.innerHTML = html_data

				// Pure javascript option (replace content and exec javascript code inside)
				insertAndExecute(element_data_div, el)

				// Add element to DOM
				data_container.appendChild(element_data_div);

			}//end if (callback && typeof(callback) === "function")
			
		}//end if (element_data_div)

	};//end show_list_thesaurus_data



}//end row_thesaurus