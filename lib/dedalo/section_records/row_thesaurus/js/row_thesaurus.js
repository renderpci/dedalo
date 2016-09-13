





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
			

		var related_terms_div = data_container.querySelectorAll('[data-role="'+role+'"]')[0]
			//console.log(related_terms_div);

		if (related_terms_div) {
			//console.log("Founded!!");

			if (related_terms_div.style.display=='none') {
				// Hide all
				var all_related_terms_div = data_container.childNodes
					for (var i = all_related_terms_div.length - 1; i >= 0; i--) {
						all_related_terms_div[i].style.display = 'none'
					}					
				// Show current
				related_terms_div.style.display='table-cell'
			}else{
				related_terms_div.style.display='none'
			}

		}else{
			//console.log("Not found");

			data_container.classList.add("loading_list_thesaurus_data")	

			related_terms_div 	= document.createElement("div");
			related_terms_div.dataset.role = role;	//'related_terms'
			related_terms_div.style.display='table-cell'

			// Hide all
			var all_related_terms_div = data_container.childNodes
				for (var i = all_related_terms_div.length - 1; i >= 0; i--) {
					all_related_terms_div[i].style.display = 'none'
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
						insertAndExecute(related_terms_div, el)

						data_container.classList.remove("loading_list_thesaurus_data")	

						// Add element to DOM
						data_container.appendChild(related_terms_div);

					}, function(xhrObj) {
					  	console.log(xhrObj);
					});				

			}else{

				// Parse html text as object
				var el = document.createElement('div')
				el.innerHTML = html_data

				// Pure javascript option (replace content and exec javascript code inside)
				insertAndExecute(related_terms_div, el)

				// Add element to DOM
				data_container.appendChild(related_terms_div);

			}//end if (callback && typeof(callback) === "function")
			
		}//end if (related_terms_div)

	};//end show_list_thesaurus_data



}//end row_thesaurus