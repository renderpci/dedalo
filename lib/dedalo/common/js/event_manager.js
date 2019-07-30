/**
* EVENT_MANAGER
*/
export const event_manager = function(){


	
	this.events = {}



	/**
	* SUBSCRIBE
	*/
	this.subscribe = function(event_name, callback) {

		// no event found case. Init
			if (!this.events.hasOwnProperty(event_name)) {
				this.events[event_name] = []
			}

		const result = this.events[event_name].push(callback)		
			console.log("subscribe event_name:", event_name, "events:", this.events[event_name])
		
		return result
	}//end subscribe



	/**
	* UNSUBSCRIBE
	*/
	this.unsubscribe = function(event_name, callback) {

		// no event found case. Init
			if (!this.events.hasOwnProperty(event_name)) {
				this.events[event_name] = []
			}

		const key = this.events[event_name].indexOf(callback)
			//console.log("unsubscribe key:",event_name, key, callback)

		const result = this.events[event_name].splice(key, 1)

		return result
	}//end unsubscribe



	/**
	* PUBLISH
	*/
	this.publish = function(event_name, data={}) {
		if(SHOW_DEBUG===true) {
			//console.log("[publish] event_name:",event_name)
			//console.log("[publish] data:",data)
		}

		// no event found case. Return empty
			if (!this.events.hasOwnProperty(event_name)) {
				return []
			}

		const result = this.events[event_name].map(callback => callback(data))

		return result
	}//end publish



	/**
	* GET_EVENTS
	* @return 
	*/
	this.get_events = function() {
		return this.events
	}//end get_events



}//end event_manager