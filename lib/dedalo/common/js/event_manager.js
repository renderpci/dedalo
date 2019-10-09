/**
* EVENT_MANAGER
* the event_manager is created by the page and used by all instances: section, section_group, compnents, etc
* the event manager is a observable-observer pattern but we implement connection with the instances with tokens
* the token is stored in the instances and the events is a array of objects every event is auto-explained
* the ionstances has control to create news and detroy it.
*
* events format:[{
*					event_name 	: the common name of the events for fired by publish/changes,
*					token 		: unique id stored in the instance for contol the event,
*					callback 	: the function that will fired when publish/change will fired
*				}]
*
*/
export const event_manager = function(){

	
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
					event_name 	: event_name,
					token 		: token,
					callback 	: callback
				}
		// add the event to the global events of the page
			this.events.push(new_event)

		// return the token to save into the events_tokens propertie inside the caller instance
			return token
			
	}//end subscribe


	/**
	* UNSUBSCRIBE
	*/
	this.unsubscribe = function(event_token) {

		const self = this

		// find the event in the global events and remove it
			const result = self.events.map( (current_event, key, events) => {
				(current_event.token === event_token) ? events.splice(key, 1) : null
			})

		// return the new array without the events
			return result
		
	}//end unsubscribe



	/**
	* PUBLISH
	* when the publish event is fired it need propagated to the suscribers events
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
			// exec the suscribed events callbacks 
			const result = current_events.map(current_event => current_event.callback(data))
			return true
		}

	}//end publish



	/**
	* GET_EVENTS
	* @return 
	*/
	this.get_events = function() {
		return this.events
	}//end get_events


}//end event_manager