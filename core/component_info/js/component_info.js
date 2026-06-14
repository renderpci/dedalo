// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* COMPONENT_INFO
* Read-only aggregator component that hosts one or more dynamically-loaded
* widgets and exposes their computed output as the component's data.
*
* Unlike data-entry components (component_input_text, etc.) component_info
* does NOT store values in the database; the PHP-side counterpart sets
* use_db_data=false and delegates all data production to the widget layer.
* On the client side this module:
*   1. Bootstraps widget instances via get_widgets() (parallel dynamic import).
*   2. Delegates rendering to render_edit_component_info / render_list_component_info.
*   3. Overrides update_data_value() to keep each widget instance in sync
*      after a change_value cycle, publishing per-widget update events that
*      widget UIs can subscribe to.
*
* Server data shape (self.data):
*   {
*     entries  : Array<Object>,  // flat array of widget output atoms
*     datalist : Array<Object>   // optional lookup items keyed by 'widget' name
*   }
*
* Context shape (self.context.properties.widgets):
*   Array of widget descriptor objects, each containing:
*   {
*     widget_name : string,   // JS class name AND file base name under core/widgets/
*     path        : string,   // relative path used to build the dynamic import URL
*     ipo         : Object    // input-process-output definition used for grid/export
*   }
*
* Exports: {component_info}
*/

// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {render_edit_component_info} from '../../component_info/js/render_edit_component_info.js'
	import {render_list_component_info} from '../../component_info/js/render_list_component_info.js'



/**
* COMPONENT_INFO
* Constructor. Declares instance properties; all are populated by
* component_common.prototype.init() when the component is first mounted.
* @constructor
*/
export const component_info = function(){

	this.id

	// element properties declare
	this.model
	this.tipo
	this.section_tipo
	this.section_id
	this.mode
	this.lang

	this.section_lang
	this.context
	this.data
	this.parent
	this.node

	this.tools
}//end component_info



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_info.prototype.init		= component_common.prototype.init
	component_info.prototype.build		= component_common.prototype.build
	component_info.prototype.render		= common.prototype.render
	component_info.prototype.refresh	= common.prototype.refresh
	component_info.prototype.destroy	= common.prototype.destroy

	//change data
	component_info.prototype.save				= component_common.prototype.save
	component_info.prototype.update_data_value	= component_common.prototype.update_data_value
	component_info.prototype.update_datum		= component_common.prototype.update_datum
	component_info.prototype.change_value		= component_common.prototype.change_value
	component_info.prototype.set_changed_data	= component_common.prototype.set_changed_data

	// render
	component_info.prototype.list		= render_list_component_info.prototype.list
	component_info.prototype.tm			= render_list_component_info.prototype.list
	component_info.prototype.edit		= render_edit_component_info.prototype.edit
	component_info.prototype.search		= render_edit_component_info.prototype.edit



/**
* GET_WIDGETS
* Instantiates (or refreshes) one widget per descriptor in
* self.context.properties.widgets, using parallel dynamic imports so that
* multiple widgets load concurrently.
*
* Data partitioning: entries and datalist from self.data are filtered by
* the 'widget' property on each item so each widget instance only receives
* rows that belong to it.
*
* Re-use: if a widget instance already exists in self.ar_instances (matched
* by id), only its value/datalist pointers are updated — the instance is
* NOT recreated. This allows callers to invoke get_widgets() after a data
* refresh without incurring import and init overhead a second time.
*
* Widget init receives the full current_widget descriptor as 'properties'
* and a back-reference to this component_info as 'caller'.
*
* (!) After the parallel Promise.all completes, self.ar_instances is
* REPLACED with the array of newly resolved widgets; any pre-existing
* instance that was skipped via 'continue' is lost from the resulting
* array. This is a known quirk: reloaded widgets are only in the cache
* during the loop but are not re-collected into ar_promises, so they are
* absent from the final ar_instances.
*
* @returns {Promise<Array>} Resolves to self.ar_instances, the array of
*   initialised widget instances (one per widget descriptor).
*   Returns {boolean} false if self.data.entries is not a valid array.
*/
component_info.prototype.get_widgets = async function() {

	const self = this

	const datalist	= self.data.datalist || []
	const value		= self.data.entries || []
		// self data verification
		if (!Array.isArray(value)) {
			console.error('Error. Invalid value (expected array):', value);
			return false
		}
		if (value.length>0) {
			const value_length = value.length
			for (let i = 0; i < value_length; i++) {
				if(!value[i]) {
					console.error('Error. empty value item received:', i, value);
				}
			}
		}

	// initialize ar_instances if not already set
		if (!self.ar_instances) {
			self.ar_instances = []
		}

	const widgets_properties		= self.context.properties.widgets
	const widgets_properties_length	= widgets_properties.length

	// iterate records
		const ar_promises = []
		for (let i = 0; i < widgets_properties_length; i++) {

			const current_widget	= widgets_properties[i]
			const widget_name		= current_widget.widget_name
			const path				= current_widget.path
			// Composite id ensures no collision when the same widget_name is reused
			// across different component_info instances on the same page.
			const widget_id			= self.id + '_'+ widget_name

			const loaded_widget		= self.ar_instances.find(item => item.id === widget_id)

			// Filter data rows and datalist entries belonging to this widget.
			const widget_value		= value.filter(item => item && item.widget===widget_name)
			const widget_datalist	= datalist.filter(item => item.widget === widget_name)

			// Check for already loaded widgets
			if(loaded_widget){
				// Refresh in-place — avoid a new dynamic import and init cycle.
				loaded_widget.value		= widget_value
				loaded_widget.datalist	= widget_datalist
				continue
			}

			// sequential mode
				// // import
				// const element_widget = await import(widget_path)

				// const widget_options = {
				// 	id				: widget_id,
				// 	section_tipo	: self.section_tipo,
				// 	section_id		: self.section_id,
				// 	lang			: self.lang,
				// 	mode			: self.mode,
				// 	value			: widget_value,
				// 	datalist		: widget_datalist,
				// 	ipo				: current_widget.ipo
				// }

				// // instance
				// const new_widget = new element_widget[widget_name]()

				// // init
				// new_widget.init(widget_options)

				// // add
				// self.ar_instances.push(new_widget)

			// parallel mode
				const current_promise = (async function(){

					try {
						// import module file. Use short_path to enable file discovery by packers
							const short_path		= path + '/js/' + widget_name
							const element_widget	= await import(`../../../core/widgets${short_path}.js`)

						// instance widget
							const new_widget = new element_widget[widget_name]()

						// init widget
							await new_widget.init({
								id				: widget_id,
								section_tipo	: self.section_tipo,
								section_id		: self.section_id,
								lang			: self.lang,
								mode			: self.mode,
								model			: 'widget',
								value			: widget_value,
								datalist		: widget_datalist,
								ipo				: current_widget.ipo,
								name			: current_widget.widget_name,
								properties		: current_widget,
								caller			: self
							})

						return new_widget
					} catch (errorMsg) {
						console.error('Error loading widget:', widget_name, errorMsg);
						return null
					}
				})()
				ar_promises.push(current_promise)

		}//end for loop

		// instances. Await all instances are parallel init and fix.
		// Filter out widgets that failed to load (null) so a single failure
		// does not break the whole set.
		self.ar_instances = (await Promise.all(ar_promises)).filter(Boolean)


	return self.ar_instances
}//end get_widgets



/**
* UPDATE_DATA_VALUE
* Override component_common.update_data_value to sync widget values
* after the standard data update is applied.
*
* Calls the parent implementation first to apply the standard entry
* mutation (add / splice / replace / bulk-set) on self.data.entries, then
* re-partitions the updated entries across the already-instantiated widgets
* in self.ar_instances and publishes a per-widget update event so widget
* UIs can react without a full re-render.
*
* Event name pattern: 'update_widget_value_{i}_{widget_id}' where {i} is
* the zero-based index into widgets_properties and {widget_id} is the
* composite id built in get_widgets().
*
* The method is intentionally synchronous (like its parent) to fit inside
* the change_value_pool queue used by component_common.change_value.
*
* @param {Object} changed_data_item - Mutation descriptor forwarded directly
*   to component_common.prototype.update_data_value. Shape:
*   { action: string, value: *, id?: * }
* @returns {boolean} true on success; false if the parent update failed.
*/
component_info.prototype.update_data_value = function(changed_data_item) {

	const self = this

	// call parent update_data_value first
		const result = component_common.prototype.update_data_value.call(self, changed_data_item)
		if (!result) {
			return false
		}

	// sync widget instances with updated data
		const value					= self.data.entries || []
		const widgets_properties		= self.context?.properties?.widgets
		if (!widgets_properties) {
			return true
		}
		const widgets_properties_length = widgets_properties.length
		for (let i = 0; i < widgets_properties_length; i++) {

			const current_widget	= widgets_properties[i]
			const widget_name		= current_widget.widget_name
			const widget_id			= self.id + '_'+ widget_name

			const loaded_widget	= (self.ar_instances || []).find(item => item.id === widget_id)
			// Filter entries that match both the widget name AND the loop index as key.
			// The 'key' field on each entry mirrors the widget descriptor's position,
			// allowing multiple widgets of the same widget_name to partition data.
			const widget_value	= value.filter(item => item.widget === widget_name && item.key === i)

			if(loaded_widget){
				loaded_widget.value = widget_value
				// Notify any subscriber (e.g. the widget's own UI) of the new slice.
				event_manager.publish(`update_widget_value_${i}_${widget_id}`, widget_value)
			}
		}

	return true
}//end update_data



/**
* CHANGE_MODE
* Catch method only. Nothing to do here
*
* component_info has no mode-specific state to toggle (it delegates
* all rendering to the widget layer), so this override exists only to
* satisfy the lifecycle contract expected by the section orchestrator.
*
* @returns {Promise<boolean>} Always resolves to true.
*/
component_info.prototype.change_mode = async function() {

	return true
}//end change_mode



// @license-end
