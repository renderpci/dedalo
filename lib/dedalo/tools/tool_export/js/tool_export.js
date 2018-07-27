/**
* TOOL_UPLOAD CLASS
*
*
*
*/ 
var tool_export = new function() {

	this.url_trigger 	= DEDALO_LIB_BASE_URL + '/tools/tool_export/trigger.tool_export.php?top_tipo='+page_globals.top_tipo ;
	this.source_columns = {};
	this.target_columns = {};
	this.target_ul 		= null;
	this.section_tipo 	= null;



	/**
	* INIT
	* Activate drag and drop behaviour for two columns of elements
	*/
	this.init = function() {

		// Select ul target_list and store
		tool_export.target_ul 	 = document.getElementById('target_list');
		tool_export.section_tipo = tool_export.target_ul.dataset.section_tipo;

		// Read and parse cookie export_stored_columns if esits
		var export_stored_columns = JSON.parse(readCookie('export_stored_columns'));		
		if (export_stored_columns) {			

			var i=0;for(var tipo in export_stored_columns) {
		        //console.log(tipo);
		        // Select element from left column
		        var li = document.querySelectorAll('[data-tipo="'+tipo+'"]')[0];
		        	//console.log(li);
		        // Move li element from source to target ul
		        if(li) {
		        	tool_export.target_ul.appendChild(li); i++;
		        } 
		    }
		   	if(SHOW_DEBUG===true) console.log("Moved li elements: "+i);

		    // Set var tool_export.target_columns with cookie value
			tool_export.target_columns = export_stored_columns;
		}		

		// Start sortable
		$(function() {
			$( "#source_list, #target_list" ).sortable({
			  connectWith : ".connectedSortable",			  
			  	stop 	  : function( event, ui ) {
			  					// Update var target_columns
			  					tool_export.update_export_stored_columns_cookie(event, ui);			  					
			  				},
			  	receive   : function(event, ui) {
			  					$('.col').equalHeight();
			  					//console.log("equalHeight receive");
			  				},
			  	create    : function(event, ui) {
			  					$('.col').equalHeight();
			  					//console.log("equalHeight create");
			  				},
			}).disableSelection();
		});
	}//end init



	/**
	* UPDATE_EXPORT_STORED_COLUMNS_COOKIE
	* Iterate all target ul childNodes and update cookie value
	* Triggered on drag elements and on sort elements
	*/
	this.update_export_stored_columns_cookie = function( event, ui ) {
		
		// TARGET : Read all target container and store elements ordered as vieweved now
		tool_export.target_columns = {}; // Reset always
		var len = tool_export.target_ul.childNodes.length	
		for (var i = 0; i < len; i++) {		
			
			//console.log( tool_export.target_ul.childNodes[i] )
			var tipo = tool_export.target_ul.childNodes[i].dataset.tipo;
				//console.log(tipo);
			tool_export.target_columns[tipo] = 1;
		}
		//console.log(tool_export.target_columns);
		
		createCookie( 'export_stored_columns', JSON.stringify(tool_export.target_columns), 365 );
			//console.log("export_stored_columns cookie: "+readCookie('export_stored_columns'));
	}//end update_export_stored_columns_cookie



	/**
	* EXPORT_DATA
	*/
	this.export_data = function(button) {

		var table_data_preview  		= document.getElementById('table_data_preview')
		var	download_file 				= document.getElementById('download_file')
		var	download_file_link 			= document.getElementById('download_file_link')
		var	download_file_link_excel 	= document.getElementById('download_file_link_excel')
		var select_encoding 			= document.getElementById('select_encoding_export')
		var select_data_format 			= document.getElementById('select_data_format_export')
		var wrap_div 					= document.getElementById('wrap_tool_export')

		var trigger_vars = {
			mode 			: 'export_data',
			columns 		: readCookie('export_stored_columns'),
			section_tipo 	: tool_export.section_tipo,
			encoding  	 	: 'UTF-8',// select_encoding.value,
			data_format 	: select_data_format.value,
		}
		//console.log(trigger_vars)
		
		// Add overlay
		html_page.loading_content( wrap_div, 1 );
		
		// AJAX request
		var js_promise = common.get_json_data(tool_export.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
						console.log("[tool_export.export_data] response",response);
				}

				if (response && response.result) {
					if (response.result===true) {

						// Download link
						download_file_link.setAttribute('href', response.url);
						download_file.style.display = 'block'

						//Donload link excel
						download_file_link_excel.setAttribute('href', response.url_excel);
						
						// Table preview
						table_data_preview.innerHTML = response.table;
										
					}else{
						table_data_preview.innerHTML = "Error on export data. \n"+response.msg;
					}
				}else{

				}				

				// Remove overlay
				html_page.loading_content( wrap_div, 0 );

				// Scrool to preview table
				$('html, body').animate({
								        scrollTop: $(download_file).offset().top -5
								    }, 400);

		}, function(error) {			
				console.log("[tool_export.export_data] Error",error)
				// Remove overlay
				html_page.loading_content( wrap_div, 0 );
		});


		return js_promise;
	}//end export_data




}//end class