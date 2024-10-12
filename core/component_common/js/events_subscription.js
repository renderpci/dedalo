// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'



// subscription to events, the events could be fired by itself or other components, section, area, etc...
// Use event_manager to get the publications
// in some cases, events are fired by observable and some events are controlled by ontology, his definition is not in the code, see the ontology.
// wrapper = self.node
export const events_subscription = function(self) {

	// hilite (search mode)
		if (self.mode==='search') {
			const render_handler = () => {
				// set instance as changed or not based on their value
				const instance = self

				dd_request_idle_callback(
					() => {
						if (!instance.node) {
							return
						}
						const hilite = (
							(instance.data.value && instance.data.value.length>0) ||
							(instance.data.q_operator && instance.data.q_operator.length>0)
						)
						ui.hilite({
							instance	: instance, // instance object
							hilite		: hilite // bool
						})
					}
				)
			}
			self.events_tokens.push(
				event_manager.subscribe('render_' + self.id, render_handler)
			)
		}//end if (self.mode==='search')

	// update value
		if (self.mode!=='tm') {

			const sync_data_handler = (options) => {

				// options
					const caller		= options.caller
					const changed_data	= options.changed_data // optional object as:
						// {
						// 	key		: 0,
						// 	value	: input.value,
						// 	action	: 'update'
						// }

				// self case. Ignore
					if(caller.id === self.id){
						return
					}

				// service_time_machine case
					if (self.caller) {
						const callers_avoid_update = [
							'service_time_machine'
						]
						if (callers_avoid_update.includes(self.caller.model) ||
							(self.caller.caller && callers_avoid_update.includes(self.caller.caller.model))
							) {
							return
						}
					}

				// update_data_value
					if (changed_data) {
						const changed_data_item = changed_data
						self.update_data_value(changed_data_item)
					}

				// refresh
					const build_autoload = self.mode==='edit'
						? true // false (changed to true because problems detected in unit_test)
						: true
					const render_level = self.mode==='edit'
						? 'content'
						: 'full'
					self.refresh({
						build_autoload	: build_autoload,
						render_level	: render_level
					})
			}
			// sync data in similar components (same id_base)
			// Subscription to the changes: if the DOM input value was changed,
			// observers DOM elements will be changed own value with the observable value
			const id_base_lang = self.id_base + '_' + self.lang

			self.events_tokens.push(
				event_manager.subscribe('sync_data_'+id_base_lang, sync_data_handler)
			)
		}//end if (self.mode!=='tm')


	return true
}//end events_subscription



// @license-end

