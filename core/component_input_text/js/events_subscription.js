// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_ROOT_WEB */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'



/**
* EVENTS_SUBSCRIPTION (component_input_text override)
* Component-specific event subscription hook for component_input_text instances.
*
* This module is the second of two subscription layers called for every
* component_input_text instance during initialisation:
*
*   1. events_subscription(self)   — shared layer defined in
*        core/component_common/js/events_subscription.js.
*        Registers the 'render_{id}' hilite subscription (search mode) and the
*        'sync_data_{id_base}_{lang}' cross-DOM sync subscription (all modes
*        except 'tm'). That shared function receives `self` as an explicit
*        argument and is called from component_common.prototype.init.
*
*   2. self.events_subscription()  — this file; assigned to
*        component_input_text.prototype.events_subscription and invoked as a
*        method on the instance (so `this` would be the component instance).
*        Currently a deliberate no-op: component_input_text relies entirely on
*        the shared subscriptions provided by the common layer and requires no
*        additional component-specific event wiring.
*
* The commented-out blocks below are earlier prototype implementations of
* cross-sibling sync ('update_value_{id_base}'), activate/deactivate
* component examples that predate the unified common-layer approach. They are
* preserved as reference. Do NOT un-comment them: the equivalent logic now
* lives in core/component_common/js/events_subscription.js (the 'sync_data'
* channel replaced the older 'update_value' channel; the activate/deactivate
* examples have no functional use in this component).
*
* event_manager is imported here because it was required by the prototype code.
* It is not referenced by the live function body and can be removed together
* with any dead blocks if they are cleaned up.
*
* @module events_subscription (component_input_text)
* @see core/component_common/js/events_subscription.js — shared subscription layer
* @see core/component_input_text/js/component_input_text.js — prototype assignment
*/

/**
* EVENTS_SUBSCRIPTION
* Component-specific event subscription hook — currently a no-op for
* component_input_text; all required subscriptions are handled by the shared
* layer in core/component_common/js/events_subscription.js.
*
* Called by component_common.prototype.init as `self.events_subscription()`
* (i.e. with the component instance as `this`) after the common subscriptions
* have already been registered. Return value is not used by the caller.
*
* To add component_input_text-specific event subscriptions in the future,
* push tokens into `this.events_tokens` here following the same pattern used
* in the shared layer so that component_common.prototype.destroy() can
* unsubscribe them automatically.
*
* @returns {undefined} No return value; the function body is empty by design.
*/
export const events_subscription = function() {

	// const self = this

	// update value
		// // sync data on similar components (same id_base)
		// // Subscription to the changes: if the DOM input value was changed,
		// // observers DOM elements will be changed own value with the observable value
		// self.events_tokens.push(
		// 	event_manager.subscribe('update_value_'+self.id_base, fn_update_value)
		// )
		// function fn_update_value (options) {

		// 	if (self.mode==='tm') {
		// 		return
		// 	}
		// 	console.log('self.mode:', self.mode);
		// 	console.log('self:', self);

		// 	if(options.caller.id === self.id){
		// 		return
		// 	}

		// 	const changed_data_item = options.changed_data

		// 	self.update_data_value(changed_data_item)
		// 	self.refresh({
		// 		build_autoload	: self.mode==='edit'
		// 			? false
		// 			: true,
		// 		render_level	: self.mode==='edit'
		// 			? 'content'
		// 			: 'full'
		// 	})
		// }

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
		// 		console.log('self.data.changed_data:', self.data.changed_data);
		// 		// self.save()
		// 		return
		// 	}
		// }

}//end events_subscription



// @license-end

