

// lock_components CLASS
var lock_components = new function() {

	this.trigger_url = '../lock_components/trigger.lock_components.php'
	this.msg_url 	 = '../lock_components/msg.lock_components.php'
	this.sse_source	
	

	// ON LOAD
	window.addEventListener("load", function (event) {
		lock_components.init_node_msg();
	});
	// ON UNLOAD
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
	* INIT_NODE
	*/
	this.init_node_msg = function() {

		if (page_globals.DEDALO_NOTIFICATIONS<1) {
			if(DEBUG) console.log("->init_node_msg : DEDALO_NOTIFICATIONS is disabled");
			return false;
		}else{
			if(DEBUG) console.log("->init_node_msg : DEDALO_NOTIFICATIONS is active");
		}

		//var node_url = 'http://localhost:8000/notifications'  
		var node_url = window.location.origin + '/dd_node/notifications';
		var source = new EventSource(node_url);

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

		//return false;	// DESACTIVE		
		

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
			if (DEBUG) {
				console.log("->lock_components: opened EventSource conection succesufully");
				//console.log(e);
			}
		}, false);

		// ERROR
		lock_components.sse_source.addEventListener('error', function(e) {			
			console.log("Error [lock_components:init] on addEventListener to lock_components msg: "+lock_components.msg_url);
			if (DEBUG) {console.log(e);}			
		}, false);
		

	}//end init_php



	/**
	* PROCCES_MSG
	*/
	var msgi = 0;
	this.procces_msg = function(e) {
		//console.log(e.data);
		var data = JSON.parse(e.data);

		// Reset all locked
		var all_objects_wrap = document.querySelectorAll("[data-section_tipo='"+page_globals.section_tipo+"']");
		for (var i = 0; i < all_objects_wrap.length; i++) {			
			component_common.unlock_component( all_objects_wrap[i] )
		}

		for (var i = 0; i < data.length; i++) {
			var element = data[i];
			//console.log(element);

			if (element.user_id != page_globals.user_id && element.section_id==page_globals._parent) {

				// Lock elements
				var objs_wrap = document.querySelectorAll("[data-tipo='"+element.component_tipo+"']");
					//console.log(objs_wrap[0]);
				if (objs_wrap && objs_wrap[0]) {
					component_common.lock_component( objs_wrap[0] )
					//console.log("locket element "+element.tipo);
				}				
			}			
		}
		if (DEBUG) {
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
	* UPDATE_EVENTS_STATE
	*/
	this.update_lock_components_state = function( obj_wrap, action ) {

		var start = new Date().getTime();

		if (obj_wrap===null || typeof obj_wrap.dataset.parent=='undefined') {
			if (DEBUG) {
				//console.log("Error[update_lock_components_state]: empty or invalid obj_wrap received: ")
				//console.log(obj_wrap);
			}
			return false;
		}
	
		var section_id 	   = obj_wrap.dataset.parent,
			section_tipo   = obj_wrap.dataset.section_tipo,
			component_tipo = obj_wrap.dataset.tipo

		if (DEBUG) {
			//console.log("->update_lock_components_state: [start] "+section_id +" - "+section_tipo +" - "+component_tipo+" - "+action);
		}

		var mydata	= { 'mode' 			: 'update_lock_components_state',
						'section_id' 	: section_id,
						'section_tipo'	: section_tipo,
						'component_tipo': component_tipo,
						'action'		: action
					  };
					//if (DEBUG) console.log(mydata);
	

		// AJAX REQUEST
		$.ajax({
			url		: this.trigger_url ,
			data	: mydata ,
			type 	: "POST"
		})
		// DONE
		.done(function(received_data) {					

			try {
				received_data = JSON.parse(received_data)
			}catch (e) {
			   if (DEBUG) {
					//console.log(e); // pass exception object to error handler
					console.log("->update_lock_components_state : Sorry. received data is not JSON valid. Review trigger response is a valid JSON string");
			   }
			}			

			if (received_data.result===false) {				
				// First, Unselect current component
				component_common.unselect_component(obj_wrap)
				//component_common.lock_component(obj_wrap)							
				alert( received_data.msg )
				
			}else{
				// Unlock current component
				//component_common.unlock_component(obj_wrap);									
			}

			// Update all components lock state
			lock_components.update_locks_state(obj_wrap, received_data);

			if (DEBUG) {
				var end  = new Date().getTime();
				var time = end - start;
				console.log("->update_lock_components_state: [done] "+section_id+" - "+section_tipo+" - "+component_tipo+" - "+action+" - execution time: " +time+' ms');
			}
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			if (DEBUG) console.log('->update_lock_components_state: '+error_data);	
		})
		// ALWAYS
		.always(function() {
			//if (DEBUG) console.log("Sended update_lock_components_state values");	
		})
	};



	/**
	* UPDATE_LOCKS_STATE
	* Iterate all components and compare lock state with actual data state in DB
	* When user select a component, this method is called (manually istead by automatic notifications) 
	*/
	this.update_locks_state = function( obj_wrap, received_data ) {

		// WORKING HERE
		//return false;

		if (typeof received_data.dato=='undefined' || !received_data.dato) {
			return false;
		}

		var dato 					 = received_data.dato,
			user_id 				 = page_globals.user_id,
			current_section_tipo 	 = obj_wrap.dataset.section_tipo,
			current_section_id 		 = obj_wrap.dataset.parent,
			ar_component_tipo_locked = [],
			obj_component_tipo_locked= {}

		// Store locked components tipo from other users in current section
		for (var i in dato) {
			var row = dato[i];
			if ( row.section_tipo==current_section_tipo && row.section_id==current_section_id && row.user_id!=user_id ) {
				//ar_component_tipo_locked.push(row.component_tipo)
				obj_component_tipo_locked[row.component_tipo] = row.full_username || "user_id "+row.user_id;
			}
		}

		// Unlok all others
		var all_components = document.querySelectorAll('div.wrap_component');
		for (var i = 0; i < all_components.length; i++) {
			//console.log( all_components[i] )
			var wrap = all_components[i]			
			var tipo = wrap.dataset.tipo
				//console.log(ar_component_tipo_locked.indexOf(tipo));
				//console.log(obj_component_tipo_locked[tipo]);
	
			//if ( ar_component_tipo_locked.indexOf(tipo) === -1 ) {
			if ( typeof obj_component_tipo_locked[tipo]=='undefined' ) {
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

		if (DEBUG!==true) {
			//return false;	// DESACTIVE
		}

		var mydata	= { 'mode' 			: 'update_lock_components_state',
						'section_id' 	: page_globals._parent,
						'section_tipo'	: page_globals.section_tipo,
						'component_tipo': 'all',
						'action'		: 'delete_user_section_locks'
					  };
					//console.log(mydata);
	

		// AJAX REQUEST
		$.ajax({
			url		: this.trigger_url ,
			data	: mydata ,
			type 	: "POST"
		})
		// DONE
		.done(function(received_data) {
			component_common.reset_all_selected_wraps()
			//if (DEBUG) console.log("->delete_user_section_locks: [done] "+received_data);
		})
		/*
		// FAIL ERROR 
		.fail(function(error_data) {
			if (DEBUG) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			if (DEBUG) console.log("Sended update_lock_components_state values");	
		})
		*/	
	}








}
	