/**
* WEB_TS_TERM
*
*
*
*/
var web_ts_term = new function() {


	this.url_trigger 		 = page_globals.__WEB_ROOT_WEB__ + "/lib/web_ts_term/trigger.web_ts_term.php"
	this.ar_childrens_loaded = {}
	this.ar_index_loaded 	 = {}



	$( document ).ready(function() {
	
		var ar_childrens_loaded = JSON.parse(localStorage.getItem('ar_loaded_web_ts_term'));
		//console.log(ar_childrens_loaded);

		// Cuando exista la variable 'web_ts_term_to_open', es porque estamos buscando (thesaurus search)
		// y la hemos generado en 'web_ts_term_list.phtml'
		// console.log(web_ts_term_to_open);
		if (typeof web_ts_term_to_open !== 'undefined') {
			ar_childrens_loaded = web_ts_term_to_open
			//console.log( ar_childrens_loaded )
		}
		
		for (var prop in ar_childrens_loaded) {
			//console.log("obj." + prop + " = " + ar_childrens_loaded[prop]);

			if (ar_childrens_loaded[prop]=='loaded') {
				// Case value is 'loaded'
				var button_obj = document.querySelectorAll('div.icon_show_childrens[data-term_id="'+prop+'"]')[0];
					//console.log( prop );		
				if (button_obj) {
					web_ts_term.toggle_childrens( button_obj, false )
				}
			}else{
				// Case value is 'closed', remove from object
				//delete web_ts_term.ar_childrens_loaded[prop]
			}
		}

		web_ts_term.highlight_terms()
	});



	/**
	* TOGGLE_CHILDRENS
	* @param dom object button_obj
	*/
	this.toggle_childrens = function( button_obj, async ) {
	
		//var ar_highlight = window.ar_highlight ? JSON.parse(window.ar_highlight) : [];		
		//console.log(ar_highlight);

		//var trigger = page_globals.__WEB_ROOT_WEB__ + "/lib/web_ts_term/trigger.web_ts_term.php"
		
		var tree_mode = typeof(window.tree_mode)!="undefined" ? window.tree_mode : false
			//console.log("tree_mode: ",tree_mode);
		
		var term_id  = button_obj.dataset.term_id
		var	mydata   = { 
					mode 			: 'toggle_childrens',
					term_id 		: button_obj.dataset.term_id,
					ar_childrens  	: JSON.parse(button_obj.dataset.ar_childrens),
					tree_mode 		: tree_mode
					}; //console.log("mydata",mydata,this.url_trigger);
	
		if (async!==false) { async = true };		

		// if visible is set remove it, otherwise add it
		button_obj.classList.toggle("arrow_dow");

		// childrens_wrapper
		var wrapper  = document.getElementById('childrens_wrapper_'+term_id)
		if (!wrapper) {return alert('Error')};

		if (wrapper.style.display=='none' && web_ts_term.ar_childrens_loaded[term_id]=='closed') {
			wrapper.style.display = 'block';		//console.log("Load is not necessary 1");	

			web_ts_term.ar_childrens_loaded[term_id] = 'loaded'
			localStorage.setItem('ar_loaded_web_ts_term', JSON.stringify(web_ts_term.ar_childrens_loaded))	
			return false;
		}

		if (wrapper.style.display==='block') {
			wrapper.style.display='none'

				// Delete element on close and update local storage
				//delete web_ts_term.ar_childrens_loaded[term_id]
				web_ts_term.ar_childrens_loaded[term_id] = 'closed'
				localStorage.setItem('ar_loaded_web_ts_term', JSON.stringify(web_ts_term.ar_childrens_loaded))	
			return false;
		}else{

		}

		/*
		if (web_ts_term.ar_childrens_loaded[term_id]) {
			wrapper.style.display = 'block';		console.log("Load is not necessary 2");		
			return false;
		}
		*/

		wrapper.classList.add("loading");
		wrapper.style.display = 'block';

		//var jsPromise = Promise.resolve(

			// AJAX CALL
			$.ajax({
				'url'	: this.url_trigger,
				'data'  : mydata,
				'type'	: "POST",
				'async' : async    
			})
			// DONE
			.done(function(data_response) {

				// If data_response contain 'error' show alert error with (data_response) else reload the page
				if(/Error/.test(data_response)) {
					// Alert error
					wrapper.innerHTML = "[toggle_childrens] Request failed: \n" + data_response;
					if(SHOW_DEBUG===true) {
						console.log(data_response);
					}					
				}else{
					
					wrapper.innerHTML = data_response

					// Add element on open and update local storage
					web_ts_term.ar_childrens_loaded[term_id] = 'loaded'//term_id				
					localStorage.setItem('ar_loaded_web_ts_term', JSON.stringify(web_ts_term.ar_childrens_loaded))
					//console.log(web_ts_term.ar_childrens_loaded);
					//console.log(JSON.stringify(web_ts_term.ar_childrens_loaded));
					
					// AR_HIGHLIGHT terms 
					//web_ts_term.highlight_terms()
					/*
					var len = ar_highlight.length
					if(len>0) {
						for (var i = len - 1; i >= 0; i--) {
							var current_term_id = ar_highlight[i]

							// WEB_TS_TERM
							if (document.getElementById('web_ts_term_'+current_term_id)) {								
								document.getElementById('web_ts_term_'+current_term_id).classList.add("highlight_term")
							}

							// WEB_INDEXATION_NODE
							// console.log(current_term_id);
							// console.log( document.getElementById('button_toggle_indexation_'+current_term_id) );
							if (document.getElementById('button_toggle_indexation_'+current_term_id)) {								
								web_ts_term.toggle_indexation( document.getElementById('button_toggle_indexation_'+current_term_id) )
							}
						}						
					}
					*/					
				}
			})
			.fail( function(jqXHR, textStatus) {				
				console.log("Error: " + jqXHR.statusText+ " (" + textStatus + ")" );
				wrapper.innerHTML = "Sorry. Failed load"
			})
			.always(function() {
				wrapper.classList.remove("loading");
			})

		//)//end promise

		//return jsPromise;
	}//end toggle_childrens



	/**
	* HIGHLIGHT_TERMS
	* @return 
	*/
	this.highlight_terms = function() {
		var ar_highlight = window.ar_highlight ? JSON.parse(window.ar_highlight) : [];		
		//console.log(ar_highlight);

		var len = ar_highlight.length
		if(len>0) {
			for (var i = len - 1; i >= 0; i--) {
				var current_term_id = ar_highlight[i]

				// WEB_TS_TERM
				if (document.getElementById('web_ts_term_'+current_term_id)) {								
					document.getElementById('web_ts_term_'+current_term_id).classList.add("highlight_term")
				}

				// WEB_INDEXATION_NODE
				// console.log(current_term_id);
				// console.log( document.getElementById('button_toggle_indexation_'+current_term_id) );
				if (document.getElementById('button_toggle_indexation_'+current_term_id)) {								
					web_ts_term.toggle_indexation( document.getElementById('button_toggle_indexation_'+current_term_id) )
				}
			}
		}
	};//end highlight_terms




	/**
	* TOGGLE_INDEXATION
	* @param dom object button_obj
	*/
	this.toggle_indexation = function( button_obj ) {

		var term_id = button_obj.dataset.term_id
		var	mydata  = {
				mode 		 	: 'toggle_indexation',
				term_id 		: button_obj.dataset.term_id,
				term 		 	: button_obj.dataset.term,
				ar_indexation  	: JSON.parse(button_obj.dataset.ar_indexation)
			}; //console.log(mydata);

		// index_wrapper
		var wrapper  = document.getElementById('index_wrapper_'+term_id)

		if (wrapper.style.display=='table') {
			wrapper.style.display='none'			
			return false;
		}

		if (web_ts_term.ar_index_loaded[term_id]) {
			wrapper.style.display = 'table';
			return false; //TEMPORAL DEACTIVATED !!!!!!!!!!!!!!!!!!!!!!!!!
		}

		wrapper.classList.add("loading");
		wrapper.style.display = 'table';

		// AJAX CALL
		$.ajax({
			url     : this.url_trigger,
			data    : mydata,
			type    : "POST",     
		})
		// DONE
		.done(function(data_response) {

			// If data_response contain 'error' show alert error with (data_response) else reload the page
			if(/Error/.test(data_response)) {
				// Alert error
				wrapper.innerHTML = "[toggle_indexation] Request failed: \n" + data_response;
				console.log(data_response);
			}else{
				
				wrapper.innerHTML = data_response

				// Set as loaded
				web_ts_term.ar_index_loaded[term_id] = true
			}
		})
		.fail( function(jqXHR, textStatus) {			
			console.log("Error: " + jqXHR.statusText+ " (" + textStatus + ")" );
			wrapper.innerHTML = "Sorry. Failed load"
		})
		.always(function() {
			wrapper.classList.remove("loading");
		})
	}//end toggle_indexation



	/*
	* RESET_TREE
	*/
	this.reset_tree = function() {

		localStorage.removeItem('ar_loaded_web_ts_term');		
	}



};//end web_ts_term