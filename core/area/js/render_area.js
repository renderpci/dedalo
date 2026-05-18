// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {set_element_css} from '../../page/js/css.js'
	import {build_dashboard} from '../../area_common/js/dashboard.js'



/**
* RENDER_AREA
* Manages the area appearance in client side
*/
export const render_area = function() {

	return true
}//end render_area



/**
* EDIT
* Render node for use in edit
* @param object options
* {
* 	render_level : string
* }
* @return HTMLElement wrapper
*/
render_area.prototype.edit = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		// const current_buttons = await buttons(self);

	// wrapper. ui build_edit returns component wrapper
		const wrapper =	ui.area.build_wrapper_edit(self, {
			content_data : content_data
			// buttons 	 : current_buttons
		})

	// css v6
		if (self.context.css) {
			const selector = `${self.section_tipo}_${self.tipo}.edit`
			set_element_css(selector, self.context.css)
			// add_class
				// sample
				// "add_class": {
				// "wrapper": [
				// 	"bg_warning"
				// ]
				// }
				if (self.context.css.add_class) {

					for(const selector in self.context.css.add_class) {
						const values = self.context.css.add_class[selector]
						const element = selector==='wrapper'
							? wrapper
							: selector==='content_data'
								? content_data
								: null

						if (element) {
							element.classList.add(values)
						}else{
							console.warn("Invalid css class selector was ignored:", selector);
						}
					}
				}
		}


	return wrapper
}//end edit



/**
* LIST
* Alias of edit
* @param object options
* {
* 	render_level : string 'full'
* }
* @return HTMLElement
*/
render_area.prototype.list = async function(options={render_level:'full'}) {

	return this.edit(options)
}//end list



/**
* CONTENT_DATA
* Render content data DOM node.
* When the server payload includes `dashboard` data (provided by area_common::get_dashboard_data),
* the shared dashboard renderer (D3 charts + KPI cards) is injected. Otherwise an empty node is
* returned to preserve current behaviour.
* @param object self
* 	area instance
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	// content_data
	const content_data = document.createElement('div')
		  content_data.classList.add('content_data', self.type)

	// dashboard. Injected when the area JSON controller returned dashboard data.
	const dashboard_data = self.data && self.data.dashboard
	if (dashboard_data) {
		const dashboard_node = build_dashboard(self, dashboard_data)
		content_data.appendChild(dashboard_node)
	}


	return content_data
}//end content_data



// @license-end
