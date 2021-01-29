"use strict";
/**
* LOCK_COMPONENTS
*
*
*/
var lock_components = new function() {


	this.trigger_url = DEDALO_LIB_BASE_URL + '/lock_components/trigger.lock_components.php'
	this.msg_url 	 = DEDALO_LIB_BASE_URL + '/lock_components/msg.lock_components.php'
	this.sse_source	
	

	// ON LOAD window
	window.addEventListener("load", function (event) {
		if (page_globals.DEDALO_NOTIFICATIONS>0) {
			lock_components.init_node_msg();
		}
	});

	// ON UNLOAD window
	/* Moved to html_page.js
	window.addEventListener("beforeunload", function (event) {
		// MODO SWITCH
		switch(page_globals.modo) {	
			case 'edit' :
				event.preventDefault();
				// DELETE_USER_SECTION_EVENTS
				lock_components.delete_user_section_locks();
				break;
			default :			
				break;
		}
	});*/



	/**
	* INIT_NODE_MSG
	*/
	this.init_node_msg = function() {

		// DEDALO_NOTIFICATIONS is the js node system. Activated or not in dedalo config4 file
		if (page_globals.DEDALO_NOTIFICATIONS<1) {
			if(SHOW_DEBUG===true) {
				//console.log("[lock_components.init_node_msg]-> init_node_msg : DEDALO_NOTIFICATIONS is disabled", page_globals.DEDALO_NOTIFICATIONS);
			}
			return false;

		}else{
			if(SHOW_DEBUG===true) {
				//console.log("[lock_components.init_node_msg]-> init_node_msg : DEDALO_NOTIFICATIONS is active", page_globals.DEDALO_NOTIFICATIONS);
			}
		}

		//var node_url = 'http://localhost:8000/notifications'  
		let node_url = window.location.origin + '/dd_node/notifications';
		let source 	 = new EventSource(node_url);

		source.addEventListener('message', function(e) {
			/*
			if (e.origin != 'http://localhost:8000') {
				alert('Origin was not http://localhost:8000');
				return;
			}
			*/

			//console.log(JSON.parse(e.data));
			//var dato = JSON.stringify(e.data)
			lock_components.procces_msg(e)

		}, false);
	}//end init_node_msg

	

	/**
	* INIT_PHP
	*/
	this.init_php = function() {

		// EventSource
			if (!!window.EventSource) {
				lock_components.sse_source = new EventSource( lock_components.msg_url ); 
			}else{
				// Result to xhr polling :(
				return alert("[lock_components.init_php] Error. Unable to set EventSource")
			}		
		
		// message
			lock_components.sse_source.addEventListener('message', function(e) {
				lock_components.procces_msg(e)
			}, false);

		// open
			lock_components.sse_source.addEventListener('open', function(e) {
				if(SHOW_DEBUG===true) {
					console.log("[lock_components.init_php]->lock_components: opened EventSource connection successfully");
				}
			}, false);

		// error
			lock_components.sse_source.addEventListener('error', function(e) {
				console.log("[lock_components.init_php] Error [lock_components:init] on addEventListener to lock_components msg: ", lock_components.msg_url);
				if(SHOW_DEBUG===true) {
					console.log("[lock_components.init_php] Error:", e);
				}
			}, false);

		return true
	}//end init_php



	/**
	* PROCCES_MSG
	*/
	var msgi = 0;
	this.procces_msg = function(e) {
		//console.log(e.data);		

		// Reset all locked component wraps
		const all_objects_wrap	= document.querySelectorAll("[data-section_tipo='"+page_globals.section_tipo+"']")
		const wrap_len			= all_objects_wrap.length
		for (let i = wrap_len - 1; i >= 0; i--) {		
			component_common.unlock_component( all_objects_wrap[i] )
		}

		const data		= JSON.parse(e.data)
		const data_len	= data.length
		for (let i = data_len - 1; i >= 0; i--) {
		
			const element = data[i];
			if (element.user_id != page_globals.user_id && element.section_id==page_globals._parent) {

				// Lock elements
				const objs_wrap = document.querySelectorAll("[data-tipo='"+element.component_tipo+"']");
				if (objs_wrap && objs_wrap[0]) {
					component_common.lock_component( objs_wrap[0] )
				}
			}
		}
		if(SHOW_DEBUG===true) {
			//console.log(e);
			msgi++;
			if (msgi<=10) {
				//console.log("->lock_components: procces_msg succesufully ["+msgi+"] "+e.lastEventId );
			}else{
				//console.log("->lock_components: procces_msg succesufully more..");
			}
		}
	}//end procces_msg



	/**
	* UPDATE_LOCK_COMPONENTS_STATE
	*/
	this.update_lock_components_state = function( obj_wrap, action ) {
	
		//let start = new Date().getTime();

		if (obj_wrap===null || typeof obj_wrap.dataset.parent==='undefined') {
			if(SHOW_DEBUG===true) {
				//console.log("Error[update_lock_components_state]: empty or invalid obj_wrap received: ")
				//console.log(obj_wrap);
			}
			return false;
		}
	
		const section_id		= obj_wrap.dataset.parent
		const section_tipo		= obj_wrap.dataset.section_tipo
		const component_tipo	= obj_wrap.dataset.tipo

		const trigger_vars = {
			mode			: 'update_lock_components_state',
			section_id		: section_id,
			section_tipo	: section_tipo,
			component_tipo	: component_tipo,
			action			: action
		}

		// Return a promise of XMLHttpRequest
		const js_promise = common.get_json_data(this.trigger_url, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) {
				console.log("[lock_components.update_lock_components_state] response", response); 
			}

			if (response===null) {
				// Error on response
				console.log("[lock_components.update_lock_components_state] Error. received data null. Review trigger response is a valid JSON string");
			
			}else{

				if(response.result===false){
					
					// Current component is locked
					
					// First, deselect current component (remove selected class, hide component buttons and additions)
						component_common.unselect_component(obj_wrap)

					// lock component. Add 'locked_wrap' class
						component_common.lock_component(obj_wrap)

					// update value (the value has probably changed)
						component_common.load_component_by_wrapper_id(obj_wrap.id, null, function(e){
							// re-select and re-apply lock_component
							const current = document.getElementById(obj_wrap.id)
							if (current) {
								component_common.lock_component(current)
							}
						})

					// inform to user 
						alert( response.msg )

				}else{
					// All is alright
				}

				// Update all components lock state always
				lock_components.update_locks_state(obj_wrap, response.result);
			}

			if(SHOW_DEBUG===true) {
				//let time = new Date().getTime() - start;
				//console.log("->update_lock_components_state:["+action+"][done] "+section_id+" - "+section_tipo+" - "+component_tipo+" - "+action+" - execution time: " +time+' ms');
			}
		}, function(error) {
			console.error("[lock_components.update_lock_components_state] Failed get_json!", error);
		})//end js_promise


		return js_promise
	}//end update_lock_components_state



	/**
	* UPDATE_LOCKS_STATE
	* Iterate all components and compare lock state with actual data state in DB
	* When user select a component, this method is called (manually istead by automatic notifications) 
	*/
	this.update_locks_state = function( obj_wrap, received_data ) {

		// WORKING HERE
		//return false;

		if (received_data && typeof received_data.dato==='undefined' || !received_data.dato) {
			return false;
		}

		const dato						= received_data.dato
		const user_id					= page_globals.user_id
		const current_section_tipo		= obj_wrap.dataset.section_tipo
		const current_section_id		= obj_wrap.dataset.parent
		const ar_component_tipo_locked	= []
		const obj_component_tipo_locked	= {}

		// Store locked components tipo from other users in current section
		for (let i in dato) {
			
			const row = dato[i];
			if ( row.section_tipo===current_section_tipo && row.section_id==current_section_id && row.user_id!=user_id ) {
				// ar_component_tipo_locked.push(row.component_tipo)
				obj_component_tipo_locked[row.component_tipo] = row.full_username || "user_id "+row.user_id;
			}
		}

		// Unlok all others
		const all_components	= document.querySelectorAll('div.wrap_component');
		const all_len			= all_components.length
		for (let i = all_len - 1; i >= 0; i--) {
			
			const wrap	= all_components[i]
			const tipo	= wrap.dataset.tipo
			
			if ( typeof obj_component_tipo_locked[tipo]==='undefined' ) {
				component_common.unlock_component( wrap ); // El componente ya ha sido liberado
			}else{
				const full_username = obj_component_tipo_locked[tipo];
				component_common.lock_component( wrap, full_username )
			}		
		}

		return true
	}//end update_locks_state



	/**
	* DELETE_USER_SECTION_EVENTS
	* Remove all locks from current user in this section
	*/
	this.delete_user_section_locks = function( options ) {

		if (typeof options==="undefined") {
			options = {}
		}

		const trigger_vars = {
			mode			: 'update_lock_components_state',
			section_id		: options.section_id || page_globals._parent,
			section_tipo	: options.section_tipo || page_globals.section_tipo,
			component_tipo	: 'all',
			action			: 'delete_user_section_locks'
		}

		// Return a promise of XMLHttpRequest
		const js_promise = common.get_json_data(this.trigger_url, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) {
				console.log("[lock_components.delete_user_section_locks] Remove all locks from current user in this section", response);
			}			

			if (options.skip_reset_wraps && options.skip_reset_wraps===false) {
				// Nothing to do
			}else{
				// Reset all selected wraps
				component_common.reset_all_selected_wraps()
			}
			
		}, function(error) {
			console.error("[lock_components.delete_user_section_locks] Failed get_json!", error)
			//console.error("[lock_components.delete_user_section_locks] Failed get_json!")
		})//end js_promise


		return js_promise
	}//end delete_user_section_locks



}//end lock_components