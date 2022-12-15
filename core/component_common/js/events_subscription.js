/*global get_label, page_globals, SHOW_DEBUG, DEDALO_ROOT_WEB */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



// subscription to events, the events could be fired by itself or other components, section, area, etc...
// Use event_manager to get the publications
// in some cases, events are fired by observable and some events are controlled by ontology, his definition is not in the code, see the ontology.
// wrapper = self.node
export const events_subscription = function(self) {

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
		}//end if (self.mode==='search')

	// update value
		if (self.mode!=='tm') {
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
		}//end if (self.mode!=='tm')


	return true
}//end events_subscription
