/**
* LOCK_COMPONENTS
*
*
*
*/
var lock_components = new function() {

	var base_url 	= DEDALO_LIB_BASE_URL

	this.trigger_url = base_url + '/lock_components/trigger.lock_components.php'
	this.msg_url 	 = base_url + '/lock_components/msg.lock_components.php'
	this.sse_source	
	

	// ON LOAD window
	window.addEventListener("load", function (event) {
		lock_components.init_node_msg();
	});
	// ON UNLOAD window
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
	});



	/**
	* INIT_NODE_MSG
	*/
	this.init_node_msg = function() {

		if (page_globals.DEDALO_NOTIFICATIONS<1) {
			if(SHOW_DEBUG===true) console.log("-> init_node_msg : DEDALO_NOTIFICATIONS is disabled");
			return false;
		}else{
			if(SHOW_DEBUG===true) console.log("-> init_node_msg : DEDALO_NOTIFICATIONS is active");
		}

		//var node_url = 'http://localhost:8000/notifications'  
		var node_url = window.location.origin + '/dd_node/notifications';
		var source 	 = new EventSource(node_url);

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

		if (!!window.EventSource) {
			lock_components.sse_source = new EventSource( lock_components.msg_url ); 
		}else{
		  // Result to xhr polling :(
		  return alert("Error [lock_components:init] unable to set EventSource")
		}
		
		
	   	// MESSAGE
		lock_components.sse_source.addEventListener('message', function(e) {		
			lock_components.procces_msg(e)			
		}, false);

		// OPEN
		lock_components.sse_source.addEventListener('open', function(e) {	
			if(SHOW_DEBUG===true) {
				console.log("->lock_components: opened EventSource connection successfully");
				//console.log(e);
			}
		}, false);

		// ERROR
		lock_components.sse_source.addEventListener('error', function(e) {			
			console.log("Error [lock_components:init] on addEventListener to lock_components msg: "+lock_components.msg_url);
			if(SHOW_DEBUG===true) {console.log(e);}			
		}, false);		
	}//end init_php



	/**
	* PROCCES_MSG
	*/
	var msgi = 0;
	this.procces_msg = function(e) {
		//console.log(e.data);
		var data = JSON.parse(e.data);

		// Reset all locked component wraps
		var all_objects_wrap = document.querySelectorAll("[data-section_tipo='"+page_globals.section_tipo+"']");
		var len = all_objects_wrap.length
		for (var i = len - 1; i >= 0; i--) {		
			component_common.unlock_component( all_objects_wrap[i] )
		}

		var data_len = data.length
		for (var i = data_len - 1; i >= 0; i--) {
		
			var element = data[i];
			if (element.user_id != page_globals.user_id && element.section_id==page_globals._parent) {

				// Lock elements
				var objs_wrap = document.querySelectorAll("[data-tipo='"+element.component_tipo+"']");
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

		var start = new Date().getTime();

		if (obj_wrap===null || typeof obj_wrap.dataset.parent==='undefined') {
			if (DEBUG) {
				//console.log("Error[update_lock_components_state]: empty or invalid obj_wrap received: ")
				//console.log(obj_wrap);
			}
			return false;
		}
	
		var section_id 	   = obj_wrap.dataset.parent
		var section_tipo   = obj_wrap.dataset.section_tipo
		var component_tipo = obj_wrap.dataset.tipo

		var trigger_vars = {
			mode 			: 'update_lock_components_state',
			section_id 		: section_id,
			section_tipo	: section_tipo,
			component_tipo 	: component_tipo,
			action			: action
		}

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.trigger_url, trigger_vars).then(function(response) {
							//console.log(response); return;
							
							if (response===null) {
								// Error on response
								console.log("->update_lock_components_state : Error. received data null. Review trigger response is a valid JSON string");
							}else if(response.result===false){
								// Current component is locked
								// First, Unselect current component
								component_common.unselect_component(obj_wrap)
								//component_common.lock_component(obj_wrap)							
								alert( response.msg )
							}else{
								// All is alright

							}

							// Update all components lock state
							lock_components.update_locks_state(obj_wrap, response);

							if(SHOW_DEBUG===true) {
								var end = new Date().getTime(), time = end - start;
								console.log("->update_lock_components_state:["+action+"][done] "+section_id+" - "+section_tipo+" - "+component_tipo+" - "+action+" - execution time: " +time+' ms');
							}

						}, function(error) {
							console.error("[update_lock_components_state] Failed get_json!", error);				
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

		if (typeof received_data.dato==='undefined' || !received_data.dato) {
			return false;
		}

		var dato 					 = received_data.dato
		var user_id 				 = page_globals.user_id
		var	current_section_tipo 	 = obj_wrap.dataset.section_tipo
		var	current_section_id 		 = obj_wrap.dataset.parent
		var	ar_component_tipo_locked = []
		var	obj_component_tipo_locked= {}

		// Store locked components tipo from other users in current section
		for (var i in dato) {
			var row = dato[i];
			if ( row.section_tipo===current_section_tipo && row.section_id==current_section_id && row.user_id!=user_id ) {
				//ar_component_tipo_locked.push(row.component_tipo)
				obj_component_tipo_locked[row.component_tipo] = row.full_username || "user_id "+row.user_id;
			}
		}

		// Unlok all others
		var all_components = document.querySelectorAll('div.wrap_component');
		var all_len = all_components.length
		for (var i = all_len - 1; i >= 0; i--) {
			
			//console.log( all_components[i] )
			var wrap = all_components[i]			
			var tipo = wrap.dataset.tipo
				//console.log(ar_component_tipo_locked.indexOf(tipo));
				//console.log(obj_component_tipo_locked[tipo]);
	
			//if ( ar_component_tipo_locked.indexOf(tipo) === -1 ) {
			if ( typeof obj_component_tipo_locked[tipo]==='undefined' ) {
				component_common.unlock_component( wrap ); // El componente ya ha sido liberado
				//console.log("unlocking free component "+tipo);
			}else{
				var full_username = obj_component_tipo_locked[tipo];
				component_common.lock_component( wrap, full_username )
			}		
		}
	}//end update_locks_state



	/**
	* DELETE_USER_SECTION_EVENTS
	* Remove all locks from current user in this section
	*/
	this.delete_user_section_locks = function() {

		var trigger_vars = {
			mode 			: 'update_lock_components_state',
			section_id 		: page_globals._parent,
			section_tipo	: page_globals.section_tipo,
			component_tipo 	: 'all',
			action			: 'delete_user_section_locks'
		}

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.trigger_url, trigger_vars).then(function(response) {
							//console.log(response);

							// Reset all selected wraps
							component_common.reset_all_selected_wraps()
						})

		return js_promise
	}//end delete_user_section_locks



}//end lock_components