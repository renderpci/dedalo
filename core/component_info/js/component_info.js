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
	component_info.prototype.init 	 			= component_common.prototype.init
	component_info.prototype.build 	 			= component_common.prototype.build
	component_info.prototype.render 			= common.prototype.render
	component_info.prototype.refresh 			= common.prototype.refresh
	component_info.prototype.destroy 	 		= common.prototype.destroy

	// change data
	// component_info.prototype.save 	 			= component_common.prototype.save
	// component_info.prototype.update_data_value	= component_common.prototype.update_data_value
	// component_info.prototype.update_datum 		= component_common.prototype.update_datum
	// component_info.prototype.change_value 		= component_common.prototype.change_value

	// render
	component_info.prototype.list 				= render_component_info.prototype.list
	component_info.prototype.edit 				= render_component_info.prototype.edit
	// component_info.prototype.edit_in_list	= render_component_info.prototype.edit
	// component_info.prototype.tm				= render_component_info.prototype.edit
	component_info.prototype.search 			= render_component_info.prototype.search
	// component_info.prototype.change_mode 	= component_common.prototype.change_mode



	/**
	* GET_WIDGETS
	*/
	component_info.prototype.get_widgets = async function(){

		const self = this

		const value = self.data.value

		// self data veification
			if (!value || value.length===0) {
				return false
			}

		const widgets_properties = self.context.properties.widgets

		// iterate records
			const value_length 	= value.length
			for (let i = value_length - 1; i >= 0; i--) {

				const widget_item = value[i]

				const widget_name 		= widget_item.name
				const widget_properties = widgets_properties.find(item => item.widget_name===widget_name)
				const widget_path 		= widget_properties.widget_path
				const widget_id			= self.id + '_'+ widget_name

				const loaded_widget = self.ar_instances.find(item => item.id === widget_id)

				if(loaded_widget){
					loaded_widget.value  = widget_item.value
					continue
				}

				// import widget js file
				const path = "../../extras" + widget_path + "/" + widget_name + "/js/" + widget_name + ".js"

				// import
				const element_widget = await import(path)

				const widget_options = {
					id				: widget_id,
					section_tipo	: self.section_tipo,
					section_id		: self.section_id,
					lang			: self.lang,
					mode			: self.mode,
					value			: widget_item.value
				}

				// instance
				const current_widget = new element_widget[widget_name]()
				// init
				current_widget.init(widget_options)

				// add
				self.ar_instances.push(current_widget)
			}//end for loop


		return self.ar_instances
	}//end get_widgets


	/**
	* update_data
	*/
	component_info.prototype.update_data = async function(){

		const self = this

		const value = self.data.value

		// iterate records
			const value_length 	= value.length
			for (let i = value_length - 1; i >= 0; i--) {

				const widget_item = value[i]

				const widget_name 		= widget_item.name
				const widget_id			= self.id + '_'+ widget_name

				const loaded_widget = self.ar_instances.find(item => item.id === widget_id)

				if(loaded_widget){
					loaded_widget.value  = widget_item.value
					event_manager.publish('update_widget_value_'+widget_id, widget_item.value)
					continue
				}
			}

	}
