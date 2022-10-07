/*global get_label, page_globals, SHOW_DEBUG, DEDALO_ROOT_WEB */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'



/**
* EVENTS_SUBSCRIPTION
* subscription to events, the events could be fired by itself or other components, section, area, etc...
* Use event_manager to get the publications
* in some cases, events are fired by observable elements and some events are controlled
* by ontology, his definition is not in the code, see the Ontology.
* wrapper = self.node
*/
export const events_subscription = function() {

	const self = this

	// update value
		// sync data on similar components (same id_base)
		// Subscription to the changes: if the DOM input value was changed,
		// observers DOM elements will be changed own value with the observable value
		self.events_tokens.push(
			event_manager.subscribe('update_value_'+self.id_base, fn_update_value)
		)
		function fn_update_value (options) {

			if(options.caller.id === self.id){
				return
			}

			const changed_data_item = options.changed_data

			self.update_data_value(changed_data_item)
			self.refresh({
				build_autoload	: self.mode==='edit'
					? false
					: true,
				render_level	: self.mode==='edit'
					? 'content'
					: 'full'
			})
		}

	// activate. Nothing to do. Only as example of manage
		// self.events_tokens.push(
		// 	event_manager.subscribe('activate_component', fn_activate)
		// )
		// function fn_activate (component) {
		// 	if ( component.id === self.id ) {
		// 		console.log('fn_activate component:', self.id, component);
		// 		return
		// 	}
		// }

	// deactivate. Nothing to do. Only as example of manage
		// self.events_tokens.push(
		// 	event_manager.subscribe('deactivate_component', fn_deactivate)
		// )
		// function fn_deactivate (component) {
		// 	if ( component.id === self.id ) {
		// 		console.log('self.changed_data:', self.changed_data);
		// 		// self.save()
		// 		return
		// 	}
		// }

}//end events_subscription
