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



	this.events = []
	this.last_token = -1



	/**
	* SUBSCRIBE
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

		// return the token to save into the events_tokens properties inside the caller instance
			return token
	};//end  subscribe



	/**
	* UNSUBSCRIBE
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
			const result = self.events.map( (current_event, key, events) => {
				(current_event.token === event_token) ? events.splice(key, 1) : null
			})

		// return the new array without the events
			return result
	};//end  unsubscribe



	/**
	* PUBLISH
	* when the publish event is fired it need propagated to the subscribers events
	*/
	this.publish = function(event_name, data={}) {
		//if(SHOW_DEBUG===true) {
			//console.log("[publish] event_name:",event_name)
			//console.log("[publish] data:",data)
		//}

		// find the events that has the same event_name for exec
		const current_events = this.events.filter(current_event => current_event.event_name === event_name)

		// if don't find events don't exec
		if(!current_events){
			return false

		}else{
			// exec the subscribed events callbacks
			const result = current_events.map(current_event => current_event.callback(data))
			return result
		}
	};//end  publish



	/**
	* GET_EVENTS
	* @return
	*/
	this.get_events = function() {

		return this.events
	};//end  get_events



	/**
	* WHEN_IN_DOM
	* Exec a callback when node element is placed in the DOM (then is possible to know their size, etc.)
	* Useful to render leaflet maps and so forth
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
	};//end  when_in_dom



};//end event_manager_class



/**
* Create and export a new instance of event_manager_class
*/
export const event_manager = new event_manager_class()



/**
* WINDOW.EVENT_MANAGER
* Set as global window var to be available for all, included
* iframes calling as parent.window
*/
window.event_manager = event_manager


