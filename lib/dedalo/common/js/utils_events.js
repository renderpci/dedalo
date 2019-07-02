/**
* EVENT_MANAGER
*/
export const event_manager = function(){


	
	this.events = {}



	/**
	* SUBSCRIBE
	*/
	this.subscribe = function(event, callback) {

		// no event found case
			if (!this.events.hasOwnProperty(event)) {
				this.events[event] = []
			}

		console.log("[subscribe] event:",event)
		return this.events[event].push(callback)
	}//end subscribe



	/**
	* UNSUBSCRIBE
	*/
	this.unsubscribe = function(event, callback) {

		// no event found case
			if (!this.events.hasOwnProperty(event)) {
				this.events[event] = []
			}

	   return this.events[event].splice( this.events[event].indexOf(callback), 1 )
	}//end unsubscribe



	/**
	* PUBLISH
	*/
	this.publish = function(event, data={}) {
		if(SHOW_DEBUG===true) {
			console.log("[publish] event:",event)
			console.log("[publish] data:",data)
		}

		// no event found case
			if (!this.events.hasOwnProperty(event)) {
				return []
			}

		console.log("[publish] this.events:",this.events)
		console.log("[publish] data:",data)

		return this.events[event].map(callback => callback(data))
	}//end publish



}//end event_manager