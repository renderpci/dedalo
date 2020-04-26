/**
* TOOL_COMMON CLASS
*
*
*
*/
var tool_common = new function() {

	'use strict';
			
	// Global var. Set when load fragment info
	this.selected_tag;
	this.selected_rel_locator;
	this.selected_tipo;
	this.tool_dialog_id = "tool_dialog"

	this.add_url_globals = '&top_tipo='+page_globals.top_tipo+'&top_id='+page_globals.top_id  //+'&section_tipo='+page_globals.section_tipo

	// TOOL_MAIN_WINDOW . Global var to store current tool window object
	var tool_main_window = null



	/**
	* OPEN_TOOL_MAIN_WINDOW
	* Use this method to call open window for each tool instead call diectly to window method
	* @return bool true
	*/
	this.open_tool_main_window = function(window_url, window_name, window_options) {
	
		if (typeof window_options==="undefined") {
			/*
			var	w_width			= screen.width //1320,
			var	w_height		= screen.height //678;
			var window_options = 'status=yes,scrollbars=yes,resizable=yes,width='+w_width+',height='+w_height */
			window_options = null // Override options. Use a new browser tab
		}

		if (tool_main_window === null || tool_main_window.closed || tool_main_window.name!==window_name) {
			// Open new tap / window
			tool_main_window=window.open(window_url,window_name,window_options)
		}else{
			// Uddate url in existing windod
			tool_main_window.location = window_url
			tool_main_window.focus()
		}

		return true
	}//end open_tool_main_window


	
    /**
    * UPDATE_TRACKING_STATUS
    * @return 
    */
    this.update_tracking_status = function(e, data) {

    	if(SHOW_DEBUG===true) {
			console.warn("[tool_common.update_tracking_status] data:", data);
		}

    	// When document is showed (like focus..)
    	if (document.hidden===false) {

    		const locator 	 = data.locator    		
    		const data_track = component_common.get_save_track(locator)
    		if(SHOW_DEBUG===true) {
    			//console.log("[tool_common.update_tracking_status] data.locator", data.locator,"data_track:",data_track);
    			//console.log("data_track: ",data_track);
    		}
    		if (!data_track) {
    			console.log("[tool_common.update_tracking_status] Warning: data_track not found. update_tracking_status stopped");
    			return false;
    		}   			

    		const wrapper = document.querySelector(".wrap_component[data-tipo='"+locator.component_tipo+"'][data-parent='"+locator.section_id+"'][data-section_tipo='"+locator.section_tipo+"'][data-lang='"+locator.lang+"']")
    		if (wrapper && data_track) {
    			
    			const component_init_time 	= parseInt(wrapper.dataset.init_time)
    			const save_time 			= data_track.time

    			if (save_time>component_init_time) {
    				   				
    				//setTimeout(function() { alert("Synchronizing tool data.."); }, 300);
    				let dialog_body = document.createElement("h4")
    					dialog_body.appendChild( document.createTextNode(get_label.sync_last_version) )
    				let h4 			= document.createElement("h4")
    					h4.appendChild( document.createTextNode(get_label.por_favor_espere) )
    					dialog_body.appendChild( h4 )
    					//console.log(dialog_body);
    				let modal_dialog = common.build_modal_dialog({
    					id 	 	: tool_common.tool_dialog_id,
    					body 	: dialog_body,
    					footer 	: h4
    				})
    				document.body.appendChild(modal_dialog);
    				// Open dialog
    				/*
					$('#'+tool_common.tool_dialog_id).modal({
						show 	 : true,
						keyboard : true
					})*/					
						
					// Open Bootstrap modal					
					//$('#'+tool_common.tool_dialog_id).modal({
					$(modal_dialog).modal({	
						show 	  : true,
						keyboard  : true,
						cssClass  : 'modal'
					}).on('shown.bs.modal', function (e) {
						component_common.load_component_by_wrapper_id(wrapper.id).then(function(response){
							// On finish load component, close dialog
							$('#'+tool_common.tool_dialog_id).modal('hide')
						})
					}).on('hidden.bs.modal', function (e) {
						// Removes modal element from DOM on close
						this.remove()
					}) 				
    			}
    		}else{
    			console.warn("[tool_common.update_tracking_status] WARNING wrapper not found for this locator:",locator," in data_track:",data_track)
    		}

    	}//end if (document.hidden===false)
    	//console.log("update_tracking_status ",document.hidden);

    	return true;
    };//end update_tracking_status	
	


	/**
	* OPEN TOOL TIME MACHINE
	* Open time machine dialog window (from time machine tool button in inspector)
	*/
	this.open_tool_time_machine = function ( button_obj ) {
	
		switch(page_globals.modo){

			case 'edit':
			case 'tool_transcription':
			case 'tool_structuration':
			case 'tool_indexation':

				const tipo				= button_obj.dataset.tipo
				const parent			= button_obj.dataset.parent					
				const section_tipo		= button_obj.dataset.section_tipo
				const lang				= button_obj.dataset.lang
				const target_modo 		= 'tool_time_machine'
				const iframe_src		= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&parent='+parent+'&section_tipo='+section_tipo+'&lang='+lang +tool_common.add_url_globals

				// REFRESH_COMPONENTS
				// Calculate wrapper_id and ad to page global var 'components_to_refresh'
				// Note that when tool window is closed, main page is focused and trigger refresh elements added 
				const wrapper = component_common.get_component_wrapper(tipo, parent, section_tipo);
					if (wrapper) {
						html_page.add_component_to_refresh(wrapper.id)
					}

				// Open and focus window
				const window_url		= iframe_src
				const window_name		= "Time machine "+section_tipo+' -> '+tipo					
				const window_options 	= null; // 'status=yes,scrollbars=yes,resizable=yes,width='+screen.width+',height='+screen.height;
				// OPEN_TOOL_MAIN_WINDOW
				tool_common.open_tool_main_window(window_url, window_name, window_options)													
				break;

			case 'list':

				tool_time_machine.section_records_load_rows_history(button_obj);				
				break;
		}//end switch(page_globals.modo)

		return true;
	}//end open_tool_time_machine	



	/**
	* LOAD TOOL POSTERFRAME (OPEN DIALOG WINDOW)
	* Open tool dialog window (from tool button in inspector)
	*/
	this.open_tool_posterframe = function ( button_obj ) {
		
		const tipo 			= button_obj.dataset.tipo
		const parent		= button_obj.dataset.parent		
		const section_tipo 	= button_obj.dataset.section_tipo
		const target_modo 	= 'tool_posterframe'
		const iframe_src	= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&parent='+parent +'&section_tipo='+section_tipo +tool_common.add_url_globals
		
		// REFRESH_COMPONENTS
		// Calculate wrapper_id and ad to page global var 'components_to_refresh'
		// Note that when tool window is closed, main page is focused and trigger refresh elements added 
		const wrapper = component_common.get_component_wrapper(tipo, parent, section_tipo);
			if (wrapper) {
				html_page.add_component_to_refresh(wrapper.id)
			}
		
		// Dialog
		const title_div = document.createElement("h3")
			title_div.appendChild( document.createTextNode("Tool Posterframe "+tipo+" "+parent) )
		
		const iframe = document.createElement("iframe")
			iframe.src = iframe_src
			iframe.style.width = "100%"
			iframe.style.height = 700 + "px" // (screen.height -80) + "px"

		const dialog = common.build_modal_dialog({
			"header" 	  	: title_div,
			"body" 			: iframe,
			"footer"		: null,
			animation 		: false,
			modal_dialog_class : ["modal-dialog-big"],
		})
		// Open dialog
		$(dialog).modal({
			show 	  : true,
			keyboard  : true,
			cssClass  : 'modal_big'
		}).on('shown.bs.modal', function (e) {

		}).on('hidden.bs.modal', function (e) {
			// Removes modal element from DOM on close
			this.remove()
		})

		return true		
	}//end open_tool_posterframe


	
	/**
	* OPEN TOOL AV VERSIONS (OPEN DIALOG WINDOW)
	* Open tool dialog window (from tool button in inspector)
	*/
	this.open_tool_av_versions = function ( button_obj ) {
		
		const parent		= button_obj.dataset.parent
		const tipo 			= button_obj.dataset.tipo
		const section_tipo 	= button_obj.dataset.section_tipo
		const target_modo 	= 'tool_av_versions'
		const iframe_src	= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&parent='+parent+'&section_tipo='+section_tipo +tool_common.add_url_globals


		// REFRESH_COMPONENTS
		// Calculate wrapper_id and ad to page global var 'components_to_refresh'
		// Note that when tool window is closed, main page is focused and trigger refresh elements added 
		const wrapper = component_common.get_component_wrapper(tipo, parent, section_tipo);
			if (wrapper) {
				html_page.add_component_to_refresh(wrapper.id)
			}
		
		// Dialog
		const title_div = document.createElement("h3")
			title_div.appendChild( document.createTextNode("Tool AV versions "+tipo+" "+parent) )
		const iframe = document.createElement("iframe")
			iframe.src = iframe_src
			iframe.style.width = "100%"
			iframe.style.height = 730 + "px" // (screen.height -80) + "px"

		const dialog = common.build_modal_dialog({
			"header" 	  	: title_div,
			"body" 			: iframe,
			"footer"		: null,
			animation 		: false,
			modal_dialog_class : ["modal-dialog-big"],
		})
		// Open dialog
		$(dialog).modal({
			show 	  : true,
			keyboard  : true,
			cssClass  : 'modal_big'
		}).on('shown.bs.modal', function (e) {

		}).on('hidden.bs.modal', function (e) {
			// Removes modal element from DOM on close
			this.remove()
		})
		
		return true		
	}//end open_tool_av_versions



	/**
	* OPEN TOOL IMAGE VERSIONS (OPEN DIALOG WINDOW)
	* Open tool dialog window (from tool button in inspector)
	*/
	this.open_tool_image_versions = function ( button_obj ) {
		
		const tipo 			= button_obj.dataset.tipo
		const parent		= button_obj.dataset.parent		
		const section_tipo 	= button_obj.dataset.section_tipo
		const target_modo 	= 'tool_image_versions'
		const iframe_src	= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&parent='+parent +'&section_tipo='+section_tipo +tool_common.add_url_globals

		// REFRESH_COMPONENTS
		// Calculate wrapper_id and ad to page global var 'components_to_refresh'
		// Note that when tool window is closed, main page is focused and trigger refresh elements added 
		const wrapper = component_common.get_component_wrapper(tipo, parent, section_tipo);
			if (wrapper) {
				html_page.add_component_to_refresh(wrapper.id)
			}else{
				console.error("Error on locate dom wrapper element :",tipo, parent, section_tipo);
			}
		
		// Dialog
		const title_div = document.createElement("h3")
			  title_div.appendChild( document.createTextNode("Tool Image versions "+tipo+" "+parent) )

		const iframe = document.createElement("iframe")
			iframe.src = iframe_src
			iframe.style.width = "100%"
			iframe.style.height = "84vh" // 880 + "px" // (screen.height -80) + "px"

		const dialog = common.build_modal_dialog({
			"header" 	  	: title_div,
			"body" 			: iframe,
			"footer"		: null,
			animation 		: false,
			modal_dialog_class : ["modal-dialog-big"],
		})
		// Open dialog
		$(dialog).modal({
			show 	  : true,
			keyboard  : true,
			cssClass  : 'modal_big'
		}).on('shown.bs.modal', function (e) {

		}).on('hidden.bs.modal', function (e) {
			// Removes modal element from DOM on close
			this.remove()
		})

		return true
	}//end open_tool_image_versions



	/**
	* OPEN TOOL PDF VERSIONS (OPEN DIALOG WINDOW)
	* Open tool dialog window (from tool button in inspector)
	*/
	this.open_tool_pdf_versions = function ( button_obj ) {
		
		const parent		= button_obj.dataset.parent
		const tipo 			= button_obj.dataset.tipo
		const section_tipo 	= button_obj.dataset.section_tipo
		const parent_matrix	= button_obj.dataset.parent_matrix
		const target_modo 	= 'tool_pdf_versions';						
		const iframe_src	= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&parent='+parent+'&section_tipo='+section_tipo +tool_common.add_url_globals


		// REFRESH_COMPONENTS
		// Calculate wrapper_id and ad to page global var 'components_to_refresh'
		// Note that when tool window is closed, main page is focused and trigger refresh elements added 
		const wrapper = component_common.get_component_wrapper(tipo, parent, section_tipo);
			if (wrapper) {
				html_page.add_component_to_refresh(wrapper.id)
			}
		
		// Dialog
		const title_div = document.createElement("h3")
			title_div.appendChild( document.createTextNode("Tool PDF versions "+tipo+" "+parent) )
		const iframe = document.createElement("iframe")
			iframe.src = iframe_src
			iframe.style.width = "100%"
			iframe.style.height = 370 + "px" // (screen.height -80) + "px"

		const dialog = common.build_modal_dialog({
			"header" 	  	: title_div,
			"body" 			: iframe,
			"footer"		: null,
			animation 		: false
		})
		// Open dialog
		$(dialog).modal({
			show 	  : true,
			keyboard  : true,
			cssClass  : 'modal_big'
		}).on('shown.bs.modal', function (e) {

		}).on('hidden.bs.modal', function (e) {
			// Removes modal element from DOM on close
			this.remove()
		})

		return true;		
	}//end open_tool_pdf_versions



	/**
	* OPEN TOOL UPLOAD (OPEN NEW WINDOW)
	*/
	this.open_tool_upload = function ( button_obj ) {
		
		const tipo				= button_obj.dataset.tipo
		const parent			= button_obj.dataset.parent
		const section_tipo		= button_obj.dataset.section_tipo		
		const quality			= button_obj.dataset.quality || null

		// REFRESH_COMPONENTS
		// Calculate wrapper_id and ad to page global let 'components_to_refresh'
		// Note that when tool window is closed, main page is focused and trigger refresh elements added 
		const wrapper = component_common.get_component_wrapper(tipo, parent, section_tipo);
			if (wrapper) {
				html_page.add_component_to_refresh(wrapper.id)
			}		

		const window_url		= DEDALO_LIB_BASE_URL + '/main/?m=tool_upload&t='+tipo+'&parent='+parent+'&section_tipo='+section_tipo+'&quality='+quality + tool_common.add_url_globals	
		const window_name		= "Tool Upload " + parent + ' ' + tipo +' '+ quality
		const w_width			= 500
		const w_height			= 390
		const window_options 	= 'status=yes,scrollbars=yes,resizable=yes,width='+w_width+',height='+w_height
		// OPEN_TOOL_MAIN_WINDOW
		tool_common.open_tool_main_window(window_url, window_name, window_options)
		
		return true;
	}//end open_tool_upload



	/**
	* OPEN TOOL transcription (OPEN DIALOG WINDOW)
	* Open TOOL transcription dialog window (from TOOL transcription button in inspector)
	*/
	this.open_tool_transcription = function ( button_obj ) {
		
		const tipo			= button_obj.dataset.tipo
		const parent		= button_obj.dataset.parent
		const section_tipo	= button_obj.dataset.section_tipo		
		const context_name	= button_obj.dataset.context_name

		const url_vars = {
				m 				: "tool_transcription",
				t 				: tipo,
				section_tipo 	: section_tipo,
				parent 			: parent,
				top_tipo 		: button_obj.dataset.top_tipo || page_globals.top_tipo,
				top_id 			: button_obj.dataset.top_id || page_globals.top_id,
				context_name 	: context_name
			}; //return console.log(url_vars);

		let url  = DEDALO_LIB_BASE_URL + '/main/?'
			url += build_url_arguments_from_vars(url_vars)

		const window_url	 = url; //DEDALO_LIB_BASE_URL + '/main/?m=tool_transcription&t='+tipo+'&section_tipo='+section_tipo+'&parent='+parent+'&context_name='+context_name + tool_common.add_url_globals
		const window_name	 = "Tool Transcription "+tipo+" "+parent
		const window_options = null		
		// OPEN_TOOL_MAIN_WINDOW
		tool_common.open_tool_main_window(window_url, window_name, window_options)
	
		return false;
	}//end open_tool_transcription
	


	/**
	* OPEN_TOOL_INDEXATION (OPEN WINDOW)
	*/
	this.open_tool_indexation = function ( button_obj ) {
		
		const tipo 			= button_obj.dataset.tipo
		const parent		= button_obj.dataset.parent
		const lang 			= button_obj.dataset.lang
		const section_tipo 	= button_obj.dataset.section_tipo

		// REFRESH_COMPONENTS
		// Calculate wrapper_id and ad to page global var 'components_to_refresh'
		// Note that when tool window is closed, main page is focused and trigger refresh elements added 
		if(page_globals.modo==='edit') {
			const wrapper = component_common.get_component_wrapper(tipo, parent, section_tipo);
				if (wrapper) {
					html_page.add_component_to_refresh(wrapper.id)
				}
		}

		const url_vars = {
				m 				: "tool_indexation",
				t 				: tipo,
				section_tipo 	: section_tipo,
				parent 			: parent,
				top_tipo 		: button_obj.dataset.top_tipo || page_globals.top_tipo,
				top_id 			: button_obj.dataset.top_id || page_globals.top_id,
			}; //return console.log(url_vars);

		let url  = DEDALO_LIB_BASE_URL + '/main/?'
			url += build_url_arguments_from_vars(url_vars)

		const window_url	 = url; //DEDALO_LIB_BASE_URL + '/main/?m=tool_indexation&t='+tipo+'&section_tipo='+section_tipo+'&parent='+parent +tool_common.add_url_globals
		const window_name	 = "Tool Indexation "+tipo+' '+parent
		const window_options = null
		// OPEN_TOOL_MAIN_WINDOW
		tool_common.open_tool_main_window(window_url, window_name, window_options)

		return false;		
	}//end open_tool_indexation



	/**
	* OPEN_TOOL_STRUCTURATION (OPEN DIALOG WINDOW)
	*/
	this.open_tool_structuration = function ( button_obj ) {
		
		const tipo 			= button_obj.dataset.tipo
		const parent		= button_obj.dataset.parent		
		const section_tipo 	= button_obj.dataset.section_tipo

		// REFRESH_COMPONENTS
		// Calculate wrapper_id and ad to page global let 'components_to_refresh'
		// Note that when tool window is closed, main page is focused and trigger refresh elements added
		if(page_globals.modo==='edit') {
			const wrapper = component_common.get_component_wrapper(tipo, parent, section_tipo);
			if (wrapper) {
				html_page.add_component_to_refresh(wrapper.id)
			}
		}

		const url_vars = {
				m 				: "tool_structuration",
				t 				: tipo,
				section_tipo 	: section_tipo,
				parent 			: parent,
				top_tipo 		: button_obj.dataset.top_tipo || page_globals.top_tipo,
				top_id 			: button_obj.dataset.top_id || page_globals.top_id,
			}; //return console.log(url_vars);

		let url  = DEDALO_LIB_BASE_URL + '/main/?'
			url += build_url_arguments_from_vars(url_vars)
			
		
		const window_url	 = url
		const window_name	 = "Tool structuration "+tipo+' '+parent		
		const window_options = null
		// OPEN_TOOL_MAIN_WINDOW
		tool_common.open_tool_main_window(window_url, window_name, window_options)
		
		return false;		
	}//end open_tool_structuration



	/**
	* OPEN TOOL LANG (OPEN DIALOG WINDOW)
	* Open tool lang dialog window (from tool lang button in inspector)
	*/
	this.open_tool_lang = function ( button_obj ) {		
		
		const parent			= button_obj.dataset.parent
		const tipo				= button_obj.dataset.tipo
		const section_tipo		= button_obj.dataset.section_tipo
		const lang				= button_obj.dataset.lang || page_globals.dedalo_data_lang
		
		switch(page_globals.modo){
			case "edit":
				// REFRESH_COMPONENTS
				// Calculate wrapper_id and ad to page global let 'components_to_refresh'
				// Note that when tool window is closed, main page is focused and trigger refresh elements added 
				const wrapper = component_common.get_component_wrapper(tipo, parent, section_tipo);
				if (wrapper) {
					html_page.add_component_to_refresh(wrapper.id)
				}
				break;
			default:
				break;
		}

		const url_vars = {
				m 				: "tool_lang",
				t 				: tipo,
				section_tipo 	: section_tipo,
				parent 			: parent,
				lang 			: lang,
				top_tipo 		: button_obj.dataset.top_tipo || page_globals.top_tipo,
				top_id 			: button_obj.dataset.top_id || page_globals.top_id,
			}; //return console.log(url_vars);

		let url  = DEDALO_LIB_BASE_URL + '/main/?'
			url += build_url_arguments_from_vars(url_vars)

		const window_url	 = url; //DEDALO_LIB_BASE_URL + '/main/?m=tool_lang&t='+tipo+'&parent='+parent+'&section_tipo='+section_tipo+'&lang='+lang +tool_common.add_url_globals 	//return alert(iframe_src)
		const window_name	 = "Tool Lang "+tipo+" "+parent
		const window_options = null
		// OPEN_TOOL_MAIN_WINDOW
		tool_common.open_tool_main_window(window_url, window_name, window_options)
		
		return false;
	}//end open_tool_lang



	/**
	* OPEN_TOOL_PORTAL
	*/
	this.open_tool_portal = function ( button_obj ) {
		
		const parent				= button_obj.dataset.parent
		const tipo 					= button_obj.dataset.tipo
		const top_tipo 				= button_obj.dataset.top_tipo
		const section_tipo 			= button_obj.dataset.section_tipo
		const target_section_tipo 	= button_obj.dataset.target_section_tipo
		const modo 					= 'tool_portal'

		const url_vars = {
				m 					: modo,
				t 					: tipo,
				portal_tipo 		: tipo, // Important!
				portal_section_tipo : section_tipo, // Important!
				portal_parent 		: parent, // Important!
				section_tipo 		: section_tipo,
				parent 				: parent,
				target_section_tipo : target_section_tipo,
				hierarchy_sections 	: button_obj.dataset.hierarchy_sections
			}; //return console.log(url_vars);

		let url  = DEDALO_LIB_BASE_URL + '/main/?'
			url += build_url_arguments_from_vars(url_vars)
			url += tool_common.add_url_globals

		// NOTA: portal_tipo y portal_parent son 't' y 'parent' respectivamente.
		//var iframe_src = DEDALO_LIB_BASE_URL + '/main/?m='+modo+'&t='+tipo+'&parent='+parent +'&section_tipo='+section_tipo +'&target_section_tipo='+target_section_tipo+ tool_common.add_url_globals; //return alert(iframe_src)
				
		// Build modal window
		const dialog = component_portal.build_select_dialog({
			"url" 	  	: url,
			"dialog_id" : section_tipo +"_"+ tipo +"_"+ parent+"_dialog",
			"height" 	: ((window.innerHeight * 90) / 100) -32 -56 +26 +"px",
			})
			// Open dialog
			$(dialog).modal({
				show 	  : true,
				keyboard  : true,
				cssClass  : 'modal'
			}).on('hidden.bs.modal', function (e) {
				// Removes modal element from DOM on close
				this.remove()
			})		

		// REFRESH_COMPONENTS ADD PORTAL
		// Calculate wrapper_id and ad to page global var 'components_to_refresh'
		// Note that when tool window is closed, main page is focused and trigger refresh elements added 
		const wrapper_id = component_common.get_wrapper_id_from_element(button_obj);
			if (wrapper_id) {
				html_page.add_component_to_refresh(wrapper_id)				
			}

		return false	
	}//end open_tool_portal



	/**
	* OPEN TOOL IMPORT IMAGES (OPEN NEW WINDOW)
	*/
	this.open_tool_layout_print = function ( button_obj ) {		
		
		const button_tipo			= button_obj.dataset.tipo
		const target_section_tipo	= button_obj.dataset.target_section_tipo

		const window_url	 = DEDALO_LIB_BASE_URL + '/main/?m=tool_layout_print&t='+target_section_tipo+'&button_tipo='+button_tipo+'&context_name=list' +tool_common.add_url_globals
		const window_name	 = "Tool print records"
		const window_options = null
		// OPEN_TOOL_MAIN_WINDOW
		tool_common.open_tool_main_window(window_url, window_name, window_options)

		return true
	}//end open_tool_layout_print



	/**
	* OPEN_PLAYER 
	* To do: Integrar en un modalbox para imagen con control de zoom y demás y para vídeo el equivalente
	* @params (dom object)button_obj , (object)options 
	*/
	this.open_player = function(button_obj, options) {

		let current_url
		let current_window
		
		switch(options.type) {

			case 'component_av':
				current_url = DEDALO_LIB_BASE_URL + "/media_engine/av_media_player.php?reelID="+options.reelID+"&quality="+options.quality +tool_common.add_url_globals
				// Note: Window player is auto resize because current dimensions are testimonial only
				current_window = window.open(current_url,"player_window","width=735,height=535")
				current_window.focus()				
				break;

			case 'component_image':				
				
				current_url = DEDALO_LIB_BASE_URL + "/component_image/html/component_image_viewer.php?f="+options.image_full_url
				/*
				if(SHOW_DEBUG===true) {
					var url = DEDALO_LIB_BASE_URL + "/component_image/html/component_image_viewer.php?f="+options.image_full_url
				}else{
					var url = options.image_full_url + '?t=' + (new Date()).getTime();
				}
				*/
				// Note: For the moment we use a normal new window instead a player
				current_window = window.open(current_url,"player_window","width=1100,height=830")
					  //v.addEventListener("click", function(){
						//this.close()
					  //}, false)
				current_window.focus()
				break;

			default:
				// Nothing to do
				if(SHOW_DEBUG===true) {
					console.log("Invalid options type for tool_common:open_player: "+options.type)
				}
		}


		return true
	}//end open_player



	/**
	* OPEN_TOOL_REPLACE_COMPONENT_DATA
	* @param object button_obj
	*/
	this.open_tool_replace_component_data = function(button_obj) {

		const 	parent		= button_obj.dataset.parent
		const	tipo 		= button_obj.dataset.tipo
		const	section_tipo= button_obj.dataset.section_tipo
		const	modo 		= 'tool_replace_component_data'

		// NOTA: portal_tipo y portal_parent son 't' y 'parent' respectivamente.
		const iframe_src 	= DEDALO_LIB_BASE_URL + '/main/?m='+modo+'&t='+tipo+'&parent='+parent +'&section_tipo='+section_tipo + tool_common.add_url_globals; //return alert(iframe_src)
			
		const title_div 	= document.createElement('h4')
		const title 		= get_label.herramienta +": " + get_label.tool_replace_component_data +" (ID: "+parent+")"
		title_div.appendChild(document.createTextNode(title));

		const iframe = document.createElement('iframe')
			iframe.src = iframe_src
			iframe.style.width = "100%"
			iframe.style.height = "335px"
		/*
		let	footer = document.createElement('button')
			footer.dataset.dismiss= "modal"
			footer.className += "button_cancel css_button_generic"
			footer.innerHTML = get_label.cancelar*/
		
		const dialog = common.build_modal_dialog({
				header 		: title_div,
				body 		: iframe,
				footer		: null,
				animation 	: false
			})
			// Open dialog
			$(dialog).modal({
				show 	  : true,
				keyboard  : true,
				cssClass  : 'modal'
			}).on('shown.bs.modal', function (e) {
	
			}).on('hidden.bs.modal', function (e) {
				// Removes modal element from DOM on close
				this.remove()
			})			


		return false;
	}//end open_tool_replace_component_data



	/**
	* OPEN_TOOL_ADD_COMPONENT_DATA
	* @param object button_obj
	*/
	this.open_tool_add_component_data = function(button_obj) {

		const 	parent		= button_obj.dataset.parent
		const	tipo 		= button_obj.dataset.tipo
		const	section_tipo= button_obj.dataset.section_tipo
		const	modo 		= 'tool_add_component_data'

		// NOTA: portal_tipo y portal_parent son 't' y 'parent' respectivamente.
		const iframe_src 	= DEDALO_LIB_BASE_URL + '/main/?m='+modo+'&t='+tipo+'&parent='+parent +'&section_tipo='+section_tipo + tool_common.add_url_globals; //return alert(iframe_src)
			
		const title_div 	= document.createElement('h4')
		const title 		= get_label.herramienta +": " + get_label.tool_add_component_data +" (ID: "+parent+")"
		title_div.appendChild(document.createTextNode(title));

		const iframe = document.createElement('iframe')
			iframe.src = iframe_src
			iframe.style.width = "100%"
			iframe.style.height = "750px"
		/*
		let	footer = document.createElement('button')
			footer.dataset.dismiss= "modal"
			footer.className += "button_cancel css_button_generic"
			footer.innerHTML = get_label.cancelar*/
		
		const dialog = common.build_modal_dialog({
				header 				: title_div,
				body 				: iframe,
				modal_dialog_class 	: ["modal-lg"],
				footer				: null,
				animation 			: false
			})
			// Open dialog
			$(dialog).modal({
				show 	  : true,
				keyboard  : true,
				cssClass  : 'modal'
			}).on('shown.bs.modal', function (e) {
	
			}).on('hidden.bs.modal', function (e) {
				// Removes modal element from DOM on close
				this.remove()
			})			


		return false;
	}//end open_tool_add_component_data



	/**
	* OPEN_TOOL_lang_multi
	* @param object button_obj
	*/
	this.open_tool_lang_multi = function(button_obj) {
	
		// Force close possible source modal dialog
		button_obj.dataset.dismiss = "modal"

		//return console.log("[tool_common.open_tool_lang_multi] button_obj",button_obj);

		const parent		= button_obj.dataset.parent
		const tipo 			= button_obj.dataset.tipo
		const section_tipo 	= button_obj.dataset.section_tipo
		const modo 			= 'tool_lang_multi'
		const wrapper 		= component_common.get_wrapper_from_element(button_obj)
		const label 		= wrapper.querySelector(".css_label")

		// NOTA: portal_tipo y portal_parent son 't' y 'parent' respectivamente.
		const iframe_src = DEDALO_LIB_BASE_URL + '/main/?m='+modo+'&t='+tipo+'&parent='+parent +'&section_tipo='+section_tipo + tool_common.add_url_globals; //return alert(iframe_src)
		
		let	title 	= get_label.herramienta +": " + get_label.tool_lang_multi
		if(label) title	+= " - " + label.innerHTML
		if(SHOW_DEBUG===true) {
			title 	+= " ["+tipo+"_"+section_tipo+"_"+parent+"]"
		}
		const	header 	= document.createElement('h4')
			header.classList.add('modal-title')	
			header.appendChild(document.createTextNode(title));	//modal-title

		const body = document.createElement('iframe')
			body.src = iframe_src
			body.style.width  = "100%"
			body.style.height = "468px"	//"600px"		

		const	footer 		= document.createElement('button')
			footer.dataset.dismiss= "modal"
			footer.className += "button_cancel css_button_generic"
			footer.innerHTML = get_label.cancelar
		
		const dialog = common.build_modal_dialog({
				//"height" 	: ((window.innerHeight * 90) / 100) -32 -56 +26 +"px",
				id 			: "tool_lang_multi",
				header 		: header,
				body 		: body,
				footer 		: false,
				animation 	: false,
				modal_dialog_class : ["modal-dialog-big"],
			})			
			// Open dialog
			$(dialog).modal({
				show 	  : true,
				keyboard  : true,
				cssClass  : 'modal'
			}).on('hidden.bs.modal', function (e) {
				// Removes modal element from DOM on close
				this.remove()
				/*
				// Delete init property to force reinit on new click over note
				// UID for init object tracking (not add lang never here!)
				var init_uid = section_tipo +"_"+ parent +"_"+ tipo
				delete component_text_area.inited[init_uid]
				if(SHOW_DEBUG===true) {
					console.log("[tool_common.open_tool_lang_multi] Deleted property inited:", init_uid);
				}*/
			})

		// REFRESH_COMPONENTS
		// Calculate wrapper_id and ad to page global var 'components_to_refresh'
		// Note that when tool window is closed, main page is focused and trigger refresh elements added 
		//let component_wrapper = component_common.get_component_wrapper(tipo, parent, section_tipo);
		//	if (component_wrapper) {
				html_page.add_component_to_refresh(wrapper.id)
		//	}
		
			
		return true;
	}//end open_tool_lang_multi



	/**
	* OPEN TOOL IMPORT (OPEN NEW WINDOW) GENERIC TO USE WITH SECTION LIST BUTTON (LIKE MUPREVA)
	*/
	this.open_tool_import = function ( button_obj ) {		

		const url_vars = {
				m 			 	: button_obj.dataset.tool_name,
				t			 	: button_obj.dataset.t,
				section_tipo 	: button_obj.dataset.target_section_tipo,
				button_tipo	 	: button_obj.dataset.tipo,
				context_name 	: button_obj.dataset.context_name,
				custom_params  	: button_obj.dataset.custom_params // optional config from propiedades
			}

		// URL
		let window_url  = DEDALO_LIB_BASE_URL + '/main/?'
			window_url += build_url_arguments_from_vars(url_vars)
			window_url += tool_common.add_url_globals
		// Window name
		const window_name = "Tool import " + button_obj.dataset.tool_name
		const window_options = null
		// OPEN_TOOL_MAIN_WINDOW
		tool_common.open_tool_main_window(window_url, window_name, window_options)


		return true
	}//end open_tool_import



	/**
	* OPEN_TOOL_IMPORT_IMAGES
	*/
	this.open_tool_import_files = function(button_obj) {		

		const component_tipo	= button_obj.dataset.tipo
		const section_tipo		= button_obj.dataset.section_tipo
		const parent			= button_obj.dataset.parent
		const tool_name			= 'tool_import_files'
		const context_name		= 'files'

		// Set component to refresh
		// Find wrap from component tipo, parent, section_tipo
		const wrap_div = document.querySelector('.wrap_component[data-tipo="'+component_tipo+'"][data-parent="'+parent+'"][data-section_tipo="'+section_tipo+'"]');
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(button_obj);
				return alert("tool_common:open_tool_import_files: Sorry: wrap_div dom element not found")
			}
			const wrapper_id = wrap_div.id

		// Add to array of component to refresh
		html_page.add_component_to_refresh(wrapper_id)

		// URL
		let window_url  = DEDALO_LIB_BASE_URL + '/main/?'
			window_url += 'm='+tool_name+'&t='+component_tipo+'&parent='+parent+'&section_tipo='+section_tipo+'&context_name='+context_name 
			window_url += tool_common.add_url_globals
		// Window name
		const window_name 	 = "Tool import " + tool_name + " " + component_tipo + " " + parent
		const window_options = null
		// OPEN_TOOL_MAIN_WINDOW
		tool_common.open_tool_main_window(window_url, window_name, window_options)
		

		return true;
	}//end open_tool_import_images



	/**
	* OPEN TOOL EXPORT
	*/
	this.open_tool_export = function ( button_obj ) {		
		
		const section_tipo		= button_obj.dataset.section_tipo
		const	tool_name		= button_obj.dataset.tool_name
		const	context_name	= button_obj.dataset.context_name
		
		const window_url	 	= DEDALO_LIB_BASE_URL + '/main/?m='+tool_name+'&t='+section_tipo+'&context_name='+context_name +tool_common.add_url_globals	
		const window_name	 	= "Tool export "+tool_name
		const window_options 	= null
		// OPEN_TOOL_MAIN_WINDOW
		tool_common.open_tool_main_window(window_url, window_name, window_options)	


		return true;
	}//end open_tool_export



	/**
	* OPEN_TOOL_TC
	* @return 
	*/
	this.open_tool_tc = function( button_obj ) {		

		const tipo			= button_obj.dataset.tipo
		const section_tipo	= button_obj.dataset.section_tipo
		const parent		= button_obj.dataset.parent
		const lang			= button_obj.dataset.lang
		const tool_name		= 'tool_tc'
		const context_name	= button_obj.dataset.context_name

		// REFRESH_COMPONENTS
		// Calculate wrapper_id and ad to page global var 'components_to_refresh'
		// Note that when tool window is closed, main page is focused and trigger refresh elements added 
		const wrapper = component_common.get_component_wrapper(tipo, parent, section_tipo);
			if (wrapper) {
				html_page.add_component_to_refresh(wrapper.id)
			}
		
		const window_url	 = DEDALO_LIB_BASE_URL + '/main/?m='+tool_name+'&t='+tipo+'&section_tipo='+section_tipo+'&parent='+parent+'&lang='+lang+'&context_name='+context_name +tool_common.add_url_globals	
		const window_name	 = "Tool TC "+tool_name
		const window_options = null
		// OPEN_TOOL_MAIN_WINDOW
		tool_common.open_tool_main_window(window_url, window_name, window_options)	
	

		return true;
	}//end open_tool_tc



	/**
	* OPEN_TOOL_tr_print
	* @return 
	*/
	this.open_tool_tr_print = function( button_obj ) {		

		const tipo			= button_obj.dataset.tipo
		const section_tipo	= button_obj.dataset.section_tipo
		const parent		= button_obj.dataset.parent
		const lang			= button_obj.dataset.lang
		const tool_name		= 'tool_tr_print'
		const context_name	= button_obj.dataset.context_name

		// REFRESH_COMPONENTS
		// Calculate wrapper_id and ad to page global let 'components_to_refresh'
		// Note that when tool window is closed, main page is focused and trigger refresh elements added 
		const wrapper = component_common.get_component_wrapper(tipo, parent, section_tipo);
			if (wrapper) {
				html_page.add_component_to_refresh(wrapper.id)
			}		

		const window_url	 = DEDALO_LIB_BASE_URL + '/main/?m='+tool_name+'&t='+tipo+'&section_tipo='+section_tipo+'&parent='+parent+'&lang='+lang+'&context_name='+context_name +tool_common.add_url_globals	
		const window_name	 = "Tool TC "+tool_name
		const window_options = null
		// OPEN_TOOL_MAIN_WINDOW
		tool_common.open_tool_main_window(window_url, window_name, window_options)			


		return true;	
	}//end open_tool_tr_print



	/**
	* OPEN_TOOL_TS_PRINT
	* @return 
	*/
	this.open_tool_ts_print = function() {
		
		const tool_name		= 'tool_ts_print'
		const section_tipo	= page_globals.section_tipo

		const window_url	 = DEDALO_LIB_BASE_URL + '/main/?m=' + tool_name + '&t=' + section_tipo
		const window_name	 = "Tool TC "+tool_name
		const window_options = null

		// OPEN_TOOL_MAIN_WINDOW
		tool_common.open_tool_main_window(window_url, window_name, window_options)			


		return true;
	};//end open_tool_ts_print



	/**
	* OPEN TOOL DESCRIPTION (OPEN DIALOG WINDOW)
	* Open TOOL DESCRIPTION dialog window (from TOOL DESCRIPTION button in inspector)
	*/
	//this.transcription_window = null
	this.open_tool_description = function ( button_obj ) {
		
		const url_vars = {
				m 			 : button_obj.dataset.tool_name || "tool_description",
				t			 : button_obj.dataset.section_tipo,
				tool_tipo 	 : button_obj.dataset.tool_tipo,
				id	 		 : button_obj.dataset.section_id,
				//context_name : button_obj.dataset.context_name || null,				
			}
		
		// URL
		let window_url  = DEDALO_LIB_BASE_URL + '/main/?'
			window_url += build_url_arguments_from_vars(url_vars)
			window_url += tool_common.add_url_globals
		// Window name
		const window_name = "Tool description " + button_obj.dataset.tool_name
		const window_options = null
		// OPEN_TOOL_MAIN_WINDOW
		tool_common.open_tool_main_window(window_url, window_name, window_options)

		return true		
	}//end open_tool_description
	


	/**
	* OPEN TOOL CATALOGING (OPEN DIALOG WINDOW)
	* Open TOOL CATALOGING dialog window (from TOOL CATALOGING button in inspector)
	*/
	this.open_tool_cataloging = function ( button_obj ) {
		
		const url_vars = {
				m 			 : button_obj.dataset.tool_name || "tool_cataloging",
				t			 : button_obj.dataset.section_tipo,
				button_tipo  : button_obj.dataset.tipo,
				//tool_tipo 	 : button_obj.dataset.tool_tipo,
				//id	 		 : button_obj.dataset.section_id,
				//context_name : button_obj.dataset.context_name || null,				
			}
		
		// URL
		let window_url  = DEDALO_LIB_BASE_URL + '/main/?'
			window_url += build_url_arguments_from_vars(url_vars)
			//window_url += tool_common.add_url_globals
		// Window name
		const window_name = "Tool catalogue " + button_obj.dataset.tool_name
		const window_options = null
		// OPEN_TOOL_MAIN_WINDOW
		tool_common.open_tool_main_window(window_url, window_name, window_options)

		return true		
	}//end open_tool_cataloging



	/**
	* OPEN_TOOL_SORT
	* Open tool_sort dialog window (from tool_sort button in inspector)
	*/
	this.open_tool_sort = function ( button_obj ) {
		
		const url_vars = {
			m 			 : button_obj.dataset.tool_name || "tool_sort",
			section_tipo : button_obj.dataset.section_tipo,
			t  		 	 : button_obj.dataset.tipo,
			section_id   : button_obj.dataset.parent
			//lang  		: button_obj.dataset.lang,
			//tool_tipo 	: button_obj.dataset.tool_tipo,
			//id	 		: button_obj.dataset.section_id,
			//context_name  : button_obj.dataset.context_name || null,				
		}
		
		// URL
		let window_url  = DEDALO_LIB_BASE_URL + '/main/?'
			window_url += build_url_arguments_from_vars(url_vars)
			//window_url += tool_common.add_url_globals
		// Window name
		const window_name = "Tool sort " + button_obj.dataset.tool_name
		const window_options = null
		// OPEN_TOOL_MAIN_WINDOW
		tool_common.open_tool_main_window(window_url, window_name, window_options)

		return true		
	}//end open_tool_sort
	


	/**
	* CHANGE_VIEW_SELECTOR
	* @return 
	*/
	this.media_frame_url 	   = null
	this.media_frame_is_loaded = false
	this.change_view_selector = function(button_obj, type, content_frame_id) {
		
		const media_frame   = document.getElementById('videoFrame')
		const content_frame = document.getElementById(content_frame_id)

		// Remove previous selection 
		const ar_li = document.querySelectorAll('.header_tool_tabs>li')
		const len 	= ar_li.length
			for (var i = len - 1; i >= 0; i--) {				
				if (ar_li[i]!==button_obj) {
					ar_li[i].classList.remove('tab_active')
				}
			}

		if (type==='media') {
			if (this.media_frame_is_loaded===false && this.media_frame_url) {
				media_frame.src = this.media_frame_url
				this.media_frame_is_loaded = true
			}
			media_frame.style.display = 'block'
			content_frame.style.display = 'none'
			button_obj.classList.add('tab_active')			
		}else{
			media_frame.style.display = 'none'
			content_frame.style.display = 'block'
			button_obj.classList.add('tab_active')
		}

		return true;
	}//end change_view_selector



	/**
	* OPEN_TOOL_USER_ADMIN (OPEN DIALOG WINDOW)
	* Open tool dialog window (from tool button in inspector)
	*/
	this.open_tool_user_admin = function ( button_obj ) {		
		
		const section_tipo 	= 'dd128'
		const target_modo 	= 'tool_user_admin'
		const iframe_src	= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+section_tipo +tool_common.add_url_globals
		
		// Dialog
		const title_div = document.createElement("h3")
			title_div.appendChild( document.createTextNode("Tool user admin") )
		const iframe = document.createElement("iframe")
			iframe.src = iframe_src
			iframe.style.width  = "100%"
			iframe.style.height = "84vh" // (screen.height -80) + "px" // 880 + "px" // (screen.height -80) + "px"

		const dialog = common.build_modal_dialog({
			"header" 	  	: title_div,
			"body" 			: iframe,
			"footer"		: null,
			animation 		: false,
			modal_dialog_class : ["modal-dialog-big"],
		})
		// Open dialog
		$(dialog).modal({
			show 	  : true,
			keyboard  : true,
			cssClass  : 'modal_big'
		}).on('shown.bs.modal', function (e) {

		}).on('hidden.bs.modal', function (e) {
			// Removes modal element from DOM on close
			this.remove()
		})

		return true
	}//end open_tool_user_admin


	
}//end class tool_common