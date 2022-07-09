/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* EVENT_MANAGER
* the event_manager is created by the page and used by all instances: section, section_group, components, etc
* the event manager is a observable-observer pattern but we implement connection with the instances with tokens
* The token is stored in the instances and the events is a array of objects. Each event is auto-explained
* The instances has control to create news and destroy it.
*
* events format:[{
*					event_name 	: the common name of the events for fired by publish/changes,
*					token 		: unique id stored in the instance for control the event,
*					callback 	: the function that will fired when publish/change will fired
*				}]
*
*/
const event_manager_class = function(){



	this.events		= []
	this.last_token	= -1



	/**
	* SUBSCRIBE
	* Add received event to the events list array
	* @param string event_name
	* 	Like: 'active_component'
	* @param function callback
	* 	Like: 'fn_active_component'
	* @return string token
	* 	custom string incremental like: 'event_270'
	*/
	this.subscribe = function(event_name, callback) {

		// new event. Init. Create the unique token
			const token = "event_"+String(++this.last_token)

		// create the event
			const new_event = {
				event_name	: event_name,
				token		: token,
				callback	: callback
			}

		// add the event to the global events of the page
			this.events.push(new_event)

		// duplicates check debug
			// const lookup = this.events.reduce((a, e) => {
			// 	a[e.event_name] = ++a[e.event_name] || 0;
			// 	return a;
			// }, {});
			// console.log('subscribe duplicates:', this.events.filter(e => lookup[e.event_name]));

		// return the token to save into the events_tokens properties inside the caller instance
			return token
	}//end subscribe



	/**
	* UNSUBSCRIBE
	* @param string event_token
	* 	custom string incremental like: 'event_270'
	* @return array new_events_list
	* 	A new array without the removed event
	*/
	this.unsubscribe = function(event_token) {

		const self = this

		// removeEventListener
			// console.log("event_token:",event_token,self.events);
			// const found = self.events.find(el => el.token===event_token)
			// if (found) {
			// 	removeEventListener(found.event_name, found.callback)
			// 	console.log("removed listener to :", found);
			// }

		// find the event in the global events and remove it
			const new_events_list = self.events.map( (current_event, key, events) => {
				(current_event.token === event_token) ? events.splice(key, 1) : null
			})

		return new_events_list
	}//end unsubscribe



	/**
	* PUBLISH
	* when the publish event is fired it need propagated to the subscribers events
	* @param string event_name
	* 	Like: 'active_component'
	* @param object data
	* 	object container to pass data ta to the target callback
	*/
	this.publish = function(event_name, data={}) {
		// if(SHOW_DEBUG===true) {
		// 	console.log("[publish] event_name:",event_name)
		// 	console.log("[publish] data:",data)
		// }

		// find the events that has the same event_name for exec
		const current_events = this.events.filter(current_event => current_event.event_name===event_name)

		const result = (current_events)
			? current_events.map(current_event => current_event.callback(data)) // exec the subscribed events callbacks
			: false // if don't find events, don't run

		return result
	}//end  publish



	/**
	* GET_EVENTS
	* @return array this.events
	* 	list of registered events (objects) as
	* [{
	* 	callback: ƒ fn_active_component(actived_component)
	*	event_name: "active_component"
	*	token: "event_270"
	* }]
	*/
	this.get_events = function() {

		return this.events
	}//end  get_events



	/**
	* WHEN_IN_DOM
	* Exec a callback when node element is placed in the DOM (then is possible to know their size, etc.)
	* Useful to render leaflet maps and so forth
	* @param DOM node 'node'
	* @param function callback
	*
	* @return mutation observer
	*/
	this.when_in_dom = function(node, callback) {

		if (document.contains(node)) {
			return callback()
		}

		const observer = new MutationObserver(function(mutations) {
			if (document.contains(node)) {
				// console.log("It's in the DOM!");
				observer.disconnect();

				callback()
			}
		});

		observer.observe(document, {attributes: false, childList: true, characterData: false, subtree:true});

		return observer
	}//end when_in_dom



	/**
	* WHEN_IN_VIEWPORT
	* Exec a callback when node element is visible in document viewport
	* @param DOM node 'node'
	* @param function callback
	* @param bool once
	*
	* @return mutation observer
	*/
	this.when_in_viewport = function(node, callback, once=true) {

		// observer. Exec the callback when element is in viewport
		const observer = new IntersectionObserver(function(entries) {
			// if(entries[0].isIntersecting === true) {}
			const entry = entries[1] || entries[0]
			if (entry.isIntersecting===true || entry.intersectionRatio > 0) {

				// default is true (executes the callback once)
				if (once===true) {
					observer.disconnect();
				}

				callback()
			}
		}, { threshold: [0] });
		observer.observe(node);

		return observer
	}//end when_in_viewport



	/**
	* SET_BEFORE_UNLOAD
	* On true, attach a event listener to the window to prevent that user loose changed data on reload
	* On false, the listener is removed to allow reload the page normally
	* Note that this function is triggered as true when component input or editor data changes and
	* with false when the component saves the data
	* @param bool value
	* @return bool
	*/
	this.set_before_unload = function(value) {
		if(SHOW_DEBUG===true) {
			console.log("///////////////////// set_before_unload value:",value);
		}

		if (value===true) {
			// window dialog will be shown when user leaves the page
			addEventListener('beforeunload', this.beforeUnloadListener, {capture: true});
			window.unsaved_data = true
		}else{
			// restore the normal page exit status
			removeEventListener('beforeunload', this.beforeUnloadListener, {capture: true});
			window.unsaved_data = false
		}

		return true
	}//end set_before_unload



	/**
	* BEFOREUNLOADLISTENER
	* Prevent to accidentally user leaves the page with unsaved changes
	* @param object event
	*/
	this.beforeUnloadListener = function(event) {
		event.preventDefault();

		return event.returnValue = 'Are you sure you want to exit with unsaved changes?';
	}//end beforeUnloadListener



}//end event_manager_class



/**
* Create and export a new instance of event_manager_class
*/
export const event_manager = new event_manager_class()



/**
* WINDOW.EVENT_MANAGER
* Set as global window var to be available for all, included
* iframes calling as parent.window
*/
if (typeof window!=='undefined') {
	window.event_manager = event_manager
}


/**
* unsaved_data set default
*/
if (typeof window.unsaved_data==='undefined') {
	window.unsaved_data = false
}
