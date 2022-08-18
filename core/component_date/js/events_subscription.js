/*global get_label, page_globals, SHOW_DEBUG, DEDALO_ROOT_WEB */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'



// subscription to events, the events could be fired by itself or other components, section, area, etc...
// Use event_manager to get the publications
// in some cases, events are fired by observables and some events are controlled by ontology, his definition is not in the code, see the ontology.
// wrapper = self.node
export const events_subscription = function() {

	const self = this

	// const date_mode = self.get_date_mode()

	// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
	self.events_tokens.push(
		event_manager.subscribe('update_value_'+self.id, fn_update_value)
	)
	function fn_update_value (changed_data) {

		self.update_data_value(changed_data)
		self.refresh({
			build_autoload : false,
			render_level : self.mode === 'edit'
				? 'content'
				: 'full'
		})
	}

}//end events_subscription