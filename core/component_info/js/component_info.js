// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {data_manager} from '../../common/js/data_manager.js'
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {render_edit_component_info} from '../../component_info/js/render_edit_component_info.js'
	import {render_list_component_info} from '../../component_info/js/render_list_component_info.js'



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
	component_info.prototype.update_datum	= component_common.prototype.update_datum

	// render
	component_info.prototype.list		= render_list_component_info.prototype.list
	component_info.prototype.tm			= render_edit_component_info.prototype.list
	component_info.prototype.edit		= render_edit_component_info.prototype.edit
	component_info.prototype.search		= render_edit_component_info.prototype.edit



/**
* GET_WIDGETS
* @return array|bool self.ar_instances
* 	Resolve: array|false self.ar_instances
*/
component_info.prototype.get_widgets = async function() {

	const self = this

	const datalist	= self.data.datalist
	const value		= self.data.value
		// self data verification
		if (!value || value.length===0) {
			return false
		}
		if (!Array.isArray(value)) {
			console.error('Error. Invalid value (expected array):', value);
			return false
		}
		const value_length = value.length
		for (let i = 0; i < value_length; i++) {
			if(!value[i]) {
				console.error('Error. empty value item received:', i, value);
			}
		}

	const widgets_properties		= self.context.properties.widgets
	const widgets_properties_length	= widgets_properties.length

	// iterate records
		const ar_promises = []
		for (let i = 0; i < widgets_properties_length; i++) {

			const current_widget	= widgets_properties[i]
			const widget_name		= current_widget.widget_name
			const path				= current_widget.path
			const widget_id			= self.id + '_'+ widget_name

			const loaded_widget		= self.ar_instances.find(item => item.id === widget_id)

			const widget_value		= value.filter(item => item && item.widget===widget_name)
			const widget_datalist	= (datalist) ? datalist.filter(item => item.widget === widget_name) : []

			if(loaded_widget){
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
				const current_promise = new Promise(async function(resolve){

					// import module file. Use short_path to enable file discovery by packers
						const short_path		= path + '/js/' + widget_name
						const element_widget	= await import(`../../../core/widgets${short_path}.js`)

					// instance widget
						const new_widget = new element_widget[widget_name]()

					// init widget
						new_widget.init({
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
						.then(function(){
							resolve(new_widget)
						}).catch((errorMsg) => {
							console.error(errorMsg);
						})
				})
				ar_promises.push(current_promise)

		}//end for loop

		// instances. Await all instances are parallel init and fix
			await Promise.all(ar_promises).then(function(ar_instances){
				self.ar_instances = ar_instances
			})


	return self.ar_instances
}//end get_widgets



/**
* UPDATE_DATA
* @return bool
*/
component_info.prototype.update_data = async function() {

	const self = this

	const value = self.data.value || []

	// iterate records
		const widgets_properties		= self.context.properties.widgets
		const widgets_properties_length	= widgets_properties.length
		for (let i = 0; i < widgets_properties_length; i++) {

			const current_widget = widgets_properties[i]

			const widget_name	= current_widget.widget_name
			const widget_id		= self.id + '_'+ widget_name

			const loaded_widget	= self.ar_instances.find(item => item.id === widget_id)
			const widget_value	= value.filter(item => item.widget === widget_name && item.key === i)

			if(loaded_widget){
				loaded_widget.value = widget_value
				event_manager.publish(`update_widget_value_${i}_${widget_id}`, widget_value)
			}
		}


	return true
}//end update_data



/**
* CHANGE_MODE
* Catch method only. Nothing to do here
* @return bool
*/
component_info.prototype.change_mode = async function() {

	return true
}//end change_mode



// @license-end

