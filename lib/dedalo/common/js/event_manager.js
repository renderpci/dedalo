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

		// already existing event prevent duplicate
			//console.log("event_name:",event_name);	
			
			//console.log("[event_manager.subscribe] event_name:", event_name)
			//console.log("[event_manager.subscribe] callback:", callback)
		const result = this.events[event_name].push(callback)
		
		console.log("subscribe event_name:", event_name, "events:", this.events[event_name]);
		
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
			//console.log("unsubscribe key:",event_name, key, callback);


	   return this.events[event_name].splice(key, 1)
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

		//console.log("[publish] this.events:",this.events)
		//console.log("[event_manager.publish] event,data:", event, data)

		return this.events[event_name].map(callback => callback(data))
	}//end publish



}//end event_manager