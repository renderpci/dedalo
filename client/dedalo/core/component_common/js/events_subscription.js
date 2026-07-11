// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/


/**
* EVENTS_SUBSCRIPTION
* Common cross-cutting event subscriptions wired into every component instance at
* construction time, regardless of component type.
*
* This module is the first of two subscription layers called from component_common's
* constructor:
*   1. events_subscription(self)   — this file; mode-gated, shared across all components.
*   2. self.events_subscription()  — optional per-component override defined on the
*                                    concrete component prototype.
*
* Two subscriptions are registered here:
*
*   render_{id}          (search mode only)
*     Fired after any render cycle of this component. Evaluates whether the instance
*     carries an active search value or query-operator and toggles the 'hilite_element'
*     CSS class on the wrapper node via ui.hilite(). The evaluation is deferred through
*     dd_request_idle_callback so it does not block the render paint.
*
*   sync_data_{id_base}_{lang}     (all modes except 'tm')
*     Fired by component_common.change_value() after a successful save to propagate the
*     new datum to every other rendered copy of the same component (same section_tipo +
*     section_id + component_tipo + lang). Sibling instances that share id_base but hold
*     a separate DOM node call update_data_value() to absorb the change, then re-render.
*     The time-machine service (service_time_machine) is explicitly excluded from this
*     sync path to prevent it from overwriting historical snapshots with live edits.
*
* Tokens returned by event_manager.subscribe() are stored in self.events_tokens so that
* component_common.destroy() can unsubscribe them all in one pass.
*
* Exports: {Function} events_subscription
*/

// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'
	import {is_empty} from '../../component_common/js/component_common.js'



/**
* EVENTS_SUBSCRIPTION
* Registers mode-sensitive event_manager subscriptions on a component instance.
*
* Called once from component_common's constructor before the component's own
* events_subscription() override (if any). All tokens are pushed into
* self.events_tokens so destroy() can cleanly unsubscribe them.
*
* Events registered:
*   - 'render_{self.id}'           — search-mode hilite toggle (deferred, idle)
*   - 'sync_data_{id_base}_{lang}' — cross-DOM datum sync (skipped in 'tm' mode)
*
* @param {Object} self - The component instance being initialised. Expected properties:
*   {string}        self.id              - Unique component DOM id (tipo+section+id).
*   {string}        self.id_base         - id without language suffix (section_tipo + '_' + section_id + '_' + component_tipo).
*   {string}        self.lang            - Active language code (e.g. 'lg-spa').
*   {string}        self.mode            - Component render mode: 'edit', 'search', 'list', 'tm', etc.
*   {Object|null}   self.caller          - Parent instance that created this component, or null.
*   {HTMLElement}   self.node            - Wrapper DOM node; may be null before first render.
*   {Object}        self.data            - Component datum object; may include entries and q_operator.
*   {Array}         self.events_tokens   - Accumulator array for subscription tokens.
*   {Function}      self.update_data_value - Updates in-memory datum from a changed_data descriptor.
*   {Function}      self.refresh         - Re-renders the component at a given render_level.
* @returns {boolean} Always true; return value is not used by the caller.
*/
export const events_subscription = function(self) {

	// hilite (search mode)
	// Toggles a visual highlight on the wrapper node whenever the component re-renders
	// in search mode, signalling that the user has entered a search value or operator.
		if (self.mode==='search') {
			const render_handler = () => {
				// set instance as changed or not based on their value
				const instance = self

				// Defer the DOM class change until the browser is idle to avoid
				// blocking the render that just fired this event.
				dd_request_idle_callback(
					() => {
						if (!instance.node) {
							// Node has been removed from the DOM (e.g. component destroyed
							// mid-render); bail out silently to avoid a null-reference error.
							return
						}

						// Check for first entry value
						// Delegates to the component's own is_empty() if defined,
						// otherwise falls back to the shared module-level is_empty().
						const is_empty_value = is_empty(instance)

						// Check for operator
						// q_operator is set by search UI controls (e.g. AND/OR selectors);
						// an explicit operator on an otherwise-empty field is still a search intent.
						const is_empty_operator = !instance.data?.q_operator

						// Highlight if either is present
						// The component should be highlighted whenever it carries either a
						// non-empty search value OR an explicit query operator.
						const hilite = ( !is_empty_value || !is_empty_operator )

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
	// Keeps sibling DOM copies of the same component in sync after a save.
	// Not registered in 'tm' mode because the time-machine view is read-only
	// and its data must not be overwritten by live edits published on this channel.
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
				// The publisher (component_common.change_value) always includes itself
				// in the broadcast; skip the echo so the originating instance does not
				// re-render from its own published event.
					if(caller.id === self.id){
						return
					}

				// service_time_machine case
				// The time-machine service may host sibling component instances that share
				// the same id_base. Allowing sync_data to reach them would overwrite the
				// historical snapshot being displayed with the current live value.
				// Guard both direct parent and grandparent to cover nested tm structures.
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
				// Merge the incoming changed_data descriptor into self.data.entries
				// before refreshing so the re-render reflects the persisted state.
					if (changed_data) {
						const changed_data_item = changed_data
						self.update_data_value(changed_data_item)
					}

				// refresh
				// build_autoload is always true here regardless of mode. The original
				// false value for 'edit' caused failures in unit_test and was changed.
				// render_level 'content' avoids rebuilding the outer chrome in edit mode;
				// 'full' is required in other modes (e.g. list, label) so the displayed
				// value is recalculated from scratch.
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
			// The channel key combines id_base with lang so that components displaying
			// different language variants of the same field do not interfere with each other.
			const id_base_lang = self.id_base + '_' + self.lang

			self.events_tokens.push(
				event_manager.subscribe('sync_data_'+id_base_lang, sync_data_handler)
			)
		}//end if (self.mode!=='tm')


	return true
}//end events_subscription



// @license-end

