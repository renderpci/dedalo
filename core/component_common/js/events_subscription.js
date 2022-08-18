/*global get_label, page_globals, SHOW_DEBUG, DEDALO_ROOT_WEB */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'


// subscription to events, the events could be fired by itself or other components, section, area, etc...
// Use event_manager to get the publications
// in some cases, events are fired by observables and some events are controlled by ontology, his definition is not in the code, see the ontology.
// wrapper = self.node
export const events_subscription = function(self) {

	// active_component (when user focus it in DOM)
		self.events_tokens.push(
			event_manager.subscribe('active_component', fn_active_component)
		)
		function fn_active_component(actived_component) {
			// call ui.component
			const response = ui.component.active(self, actived_component) // response is bool value
			if (response===true && typeof self.active==="function") {
				self.active()
			}
		}

	// hilite (search mode)
		if (self.mode==='search') {
			self.events_tokens.push(
				event_manager.subscribe('render_' + self.id, fn_hilite_element)
			)
			function fn_hilite_element() {
				// set instance as changed or not based on their value
				const instance = self
				const hilite = (
					(instance.data.value && instance.data.value.length>0) ||
					(instance.data.q_operator && instance.data.q_operator.length>0)
				)
				setTimeout(function(){ // used timeout to allow css background transition occurs
					ui.hilite({
						instance	: instance, // instance object
						hilite		: hilite // bool
					})
				}, 150)
			}
		}

	return true
}//end events_subscription

