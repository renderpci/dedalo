// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* EVENT_MANAGER
* the event_manager is created by the page and used by all instances: section, section_group, components, etc
* the event manager is a observable-observer pattern but we implement connection with the instances with tokens
* The token is stored in the instances and the events is a array of objects. Each event is auto-explained
* The instances has control to create news and destroy it.
*
* events format:
* 	[{
*		event_name 	: string. The common name of the events for fired by publish/changes as 'activate_component'
*		token 		: string. Unique id stored in the instance for control the event as 'event_19'
*		callback 	: function. The function that will fired when publish/change will fired
*	}]
*/
const event_manager_class = function(){



	this.events		= []
	this.last_token	= -1



	/**
	* SUBSCRIBE
	* Add received event to the events list array
	* @param string event_name
	* 	Like: 'activate_component'
	* @param function callback
	* 	Like: 'fn_activate_component'
	* @return string|null token
	* 	custom string incremental like: 'event_270'
	*/
	this.subscribe = function(event_name, callback) {

		// new event. Init. Create the unique token
			const token = "event_"+String(++this.last_token)

		// check if already exists
			const exists = this.event_exists(event_name, callback)
			if (exists===true) {
				console.error(')))) Found duplicated subscription: ' + event_name);
				if(SHOW_DEBUG===true) {
					alert("Found duplicated subscription " + event_name);
				}
				// We will not return yet (only debug detection for now)
			}

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
	}//end subscribe



	/**
	* UNSUBSCRIBE
	* Removes event subscriptions based on token value
	* event_token is a unique string returned on each subscription
	* @param string event_token
	* 	custom string incremental like: 'event_270'
	* @return bool
	*/
	this.unsubscribe = function(event_token) {

		const self = this

		if (!event_token) {
			if(SHOW_DEBUG===true) {
				console.error('Ignored empty event_token from unsubscribe:', event_token);
			}
			return false
		}

		// find the event in the global events and remove it
			const events_length = self.events.length
			for (let i = 0; i < events_length; i++) {
				const event = self.events[i]
				if (event.token===event_token) {
					self.events.splice(i, 1)
					return true
				}
			}


		return false
	}//end unsubscribe



	/**
	* PUBLISH
	* Exec the callback of all subscriptions
	* When the publication event is fired, it is necessary to propagate it to the subscribers' events.
	* @param string event_name
	* 	Like: 'activate_component'
	* @param array|false data
	* 	A new array with each element being the result of the callback function.
	* 	Sample: [undefined, undefined]
	*/
	this.publish = function(event_name, data={}) {

		// find the events that has the same event_name for exec
		const current_events = this.events.filter(current_event => current_event.event_name===event_name)

		// if don't find events, don't run
		if (current_events.length<1) {
			return false
		}

		// exec the subscribed events callbacks
		const result = current_events.map(current_event => current_event.callback(data))


		return result
	}//end publish



	/**
	* GET_EVENTS
	* @return array this.events
	* 	list of registered events (objects) as
	* [{
	* 	callback: ƒ fn_activate_component(actived_component)
	*	event_name: "activate_component"
	*	token: "event_270"
	* }]
	*/
	this.get_events = function() {

		return this.events
	}//end get_events



	/**
	* EVENT_EXISTS
	* Check if given event already exists in the main events register array
	* @param string event_name
	* @param callable callback
	* @return bool
	*/
	this.event_exists = function(event_name, callback) {

		// iterate events
		const events = this.get_events()
		const events_length = events.length
		for (let i = 0; i < events_length; i++) {

			const event = events[i]

			if (event_name===event.event_name && callback===event.callback) {
				return true
			}
		}


		return false
	}//end event_exists



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



// @license-end
