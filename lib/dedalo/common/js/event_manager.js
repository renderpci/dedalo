/**
* EVENT_MANAGER
*/
export const global_event_manager = function(){


	
	this.events = []
	this.last_token = -1



	/**
	* SUBSCRIBE
	*/
	this.subscribe = function(event_name, callback) {

		// no event found case. Init
		//const current_event = this.events.filter(current_event => current_event.event_name === event_name)[0]
		const token = "event_"+String(++this.last_token)
	//console.log("this.events:",this.events);
		//if(!current_event){
			// create new event
				const new_event = {
					event_name 	: event_name,
					token 		: token,
					callback 		: callback
				}
			this.events.push(new_event)

			return token

		//}else{
		//	//set the callback to the event
		//	current_event.callbacks.push(callback)
		//	const token = "event_"+String(++this.last_token)
		//		console.log("resultb:",token);
		//	return token
//
		//}
			
	}//end subscribe


	/**
	* UNSUBSCRIBE
	*/
	this.unsubscribe = function(event_token) {

		const self = this

		//const ar_current_events = this.events.filter(current_event => current_event.token === event_token)

		//if(!current_event){
		//	
		//	return null
//
		//}else{		

			const result = self.events.map( (current_event, key, events) => {
				(current_event.token === event_token) ? events.splice(key, 1) : null
			})

				console.log("this.events:",this.events);

			return result
		//}

		
	}//end unsubscribe





	/**
	* UNSUBSCRIBE
	
	this.unsubscribe = function(event_name, callback) {


		const current_event = this.events.filter(current_event => current_event.event_name === event_name)[0]

		if(!current_event){
			
			return null

		}else{		
			const key = current_event.callbacks.indexOf(callback)

			const result = current_event.callbacks.splice(key, 1)

			return result
		}

		
	}//end unsubscribe

*/


	/**
	* PUBLISH
	*/
	this.publish = function(event_name, data={}) {
		//if(SHOW_DEBUG===true) {
			//console.log("[publish] event_name:",event_name)
			//console.log("[publish] data:",data)
		//}

		const current_events = this.events.filter(current_event => current_event.event_name === event_name)
		
		if(!current_events){
			return []

		}else{
			const result = current_events.map(current_event => current_event.callback(data))

			return result
		}

	}//end publish



	/**
	* GET_EVENTS
	* @return 
	*/
	this.get_events = function() {
		return this.events
	}//end get_events


	/**
	* DELETE_EVENTS
	* @return 
	*/
	this.delete_events = function(selector) {

		const keys = Object.keys(selector)
		const keys_length = keys.length
		const events = this.events

		for (let i = events.length - 1; i >= 0; i--) {
			const current_event = events[i]
			let result = false
			for (let j = keys_length - 1; j >= 0; j--) {
				const key = keys[j]
				const value = current_event.selector[key]
				if (selector[key]===value) {
					result = true
				}else{
					result = false
					break;
				}
			}
			
			if (result===true) {
				events.splice(i,1)
			}
		}
	};//end delete_events



}//end event_manager