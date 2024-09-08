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
			// console.log('this:', this);

		// return the token to save into the events_tokens properties inside the caller instance
			return token
	}//end subscribe



	/**
	* UNSUBSCRIBE
	* Removes event subscriptions based on token value
	* event_token is a unique string returned on each subscription
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
