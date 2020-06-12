/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import {common,create_source} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_info} from '../../component_info/js/render_component_info.js'
	import {event_manager} from '../../common/js/event_manager.js'



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

	return true
}//end component_info



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_info.prototype.init					= component_common.prototype.init
	component_info.prototype.build					= component_common.prototype.build
	component_info.prototype.render					= common.prototype.render
	component_info.prototype.refresh				= common.prototype.refresh
	component_info.prototype.destroy				= common.prototype.destroy

	// change data
	// component_info.prototype.save				= component_common.prototype.save
	// component_info.prototype.update_data_value	= component_common.prototype.update_data_value
	// component_info.prototype.update_datum		= component_common.prototype.update_datum
	// component_info.prototype.change_value		= component_common.prototype.change_value
	// component_info.prototype.build_dd_request	= common.prototype.build_dd_request

	// render
	component_info.prototype.list					= render_component_info.prototype.list
	component_info.prototype.edit					= render_component_info.prototype.edit
	// component_info.prototype.edit_in_list		= render_component_info.prototype.edit
	// component_info.prototype.tm					= render_component_info.prototype.edit
	component_info.prototype.search					= render_component_info.prototype.search
	// component_info.prototype.change_mode			= component_common.prototype.change_mode



	/**
	* GET_WIDGETS
	*/
	component_info.prototype.get_widgets = async function(){

		const self = this

		const value = self.data.value
		const datalist = self.data.datalist
		// self data verification
			if (!value || value.length===0) {
				return false
			}

		const widgets_properties = self.context.properties.widgets

		// iterate records
			for (var i = 0; i < widgets_properties.length; i++) {
				const current_widget 	= widgets_properties[i]
				const widget_name 		= current_widget.widget_name
				const path 				= current_widget.path
				const widget_id			= self.id + '_'+ widget_name

				const loaded_widget 	= self.ar_instances.find(item => item.id === widget_id)

				const widget_value 		= value.filter(item => item.widget === widget_name)
				const widget_datalist	= (datalist) ? datalist.filter(item => item.widget === widget_name) : []

				if(loaded_widget){
					loaded_widget.value  = widget_value
					loaded_widget.datalist  = widget_datalist
					continue
				}

				// import widget js file
				const widget_path = "../../widgets" + path  + "/js/" + widget_name + ".js"

				// import
				const element_widget = await import(widget_path)

				const widget_options = {
					id				: widget_id,
					section_tipo	: self.section_tipo,
					section_id		: self.section_id,
					lang			: self.lang,
					mode			: self.mode,
					value			: widget_value,
					datalist 		: widget_datalist,
					ipo				: current_widget.ipo
				}

				// instance
				const new_widget = new element_widget[widget_name]()

				// init
				new_widget.init(widget_options)

				// add
				self.ar_instances.push(new_widget)
			}//end for loop

		return self.ar_instances
	}//end get_widgets


	/**
	* update_data
	*/
	component_info.prototype.update_data = async function(){

		const self = this

		const value = self.data.value || []

		// iterate records
			const widgets_properties = self.context.properties.widgets
			for (var i = 0; i < widgets_properties.length; i++) {
				const current_widget 	= widgets_properties[i]

				const widget_name 		= current_widget.widget_name
				const widget_id			= self.id + '_'+ widget_name

				const loaded_widget = self.ar_instances.find(item => item.id === widget_id)

				const widget_value 	= value.filter(item => item.widget === widget_name && item.key === i)

				if(loaded_widget){
					loaded_widget.value  = widget_value
					event_manager.publish('update_widget_value_'+i+'_'+widget_id, widget_value)
				}
			}
	}
