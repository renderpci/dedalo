// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'



/**
* RENDER_CONFIG_AREAS
* Client-side render module for the config_areas widget. Builds a list of every
* area/section (from self.value.areas) with an allow/deny toggle each, a writability
* banner, and a Save button. Exported as a constructor; its `list` prototype is assigned
* to config_areas.prototype.edit/list.
*
* Widget value shape (from class.config_areas::get_value):
*   { areas:[{tipo,model,parent,label,denied,allowed}], areas_deny:[], areas_allow:[], writable:bool }
*/
export const render_config_areas = function() {

	return true
}//end render_config_areas



/**
* LIST
* Builds the widget wrapper. Returns an HTMLElement appended to the widget body.
* @param {Object} options
* @returns {Promise<HTMLElement>} wrapper
*/
render_config_areas.prototype.list = async function(options) { // eslint-disable-line no-unused-vars

	const self = this

	const content_data = get_content_data(self)

	const wrapper = ui.widget.build_wrapper_edit(self, {
		content_data : content_data
	})
	wrapper.content_data = content_data

	return wrapper
}//end list



/**
* GET_CONTENT_DATA
* Builds the editable area list + Save button from self.value.
* @param {Object} self - widget instance
* @returns {HTMLElement}
*/
const get_content_data = function(self) {

	const value			= self.value || {}
	const areas			= Array.isArray(value.areas) ? value.areas : []
	const writable		= value.writable !== false // default permissive if undefined

	// in-memory desired deny set, seeded from current state
	const deny_set = new Set(areas.filter(a => a.denied).map(a => a.tipo))
	// allow list is round-tripped unchanged (informational)
	const areas_allow = Array.isArray(value.areas_allow) ? value.areas_allow.slice() : []

	// content_data
	const content_data = ui.create_dom_element({
		element_type : 'div'
	})

	// info text
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'info_text',
		inner_html		: 'Toggle each area/section. Denied areas are hidden from the menu and access for every user. Changes apply on the next page load.',
		parent			: content_data
	})

	// non-writable banner
	if (!writable) {
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text error',
			inner_html		: 'The private directory is not writable by the web server. Saving is disabled; edit ../private/config.local.php by hand.',
			parent			: content_data
		})
	}

	// rows container
	const list_node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'config_areas_list',
		parent			: content_data
	})

	// one row per area/section
	for (let i = 0; i < areas.length; i++) {
		const area = areas[i]

		const row = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'config_areas_row',
			parent			: list_node
		})

		const checkbox = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox',
			class_name		: 'config_areas_toggle',
			parent			: row
		})
		checkbox.checked = !deny_set.has(area.tipo) // checked == allowed
		checkbox.disabled = !writable
		checkbox.addEventListener('change', () => {
			if (checkbox.checked) {
				deny_set.delete(area.tipo)
			} else {
				deny_set.add(area.tipo)
			}
		})

		// inner_html source is trusted server-side ontology data (admin-curated labels/tipos), not end-user input
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'config_areas_label',
			inner_html		: (area.label || '(no label)') + ' <small>' + area.tipo + ' · ' + area.model + '</small>',
			parent			: row
		})
	}

	// response area
	const body_response = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'body_response',
		parent			: content_data
	})

	// save button
	const button_save = ui.create_dom_element({
		element_type	: 'button',
		class_name		: 'light button_submit',
		inner_html		: get_label.save || 'Save',
		parent			: content_data
	})
	button_save.disabled = !writable
	button_save.addEventListener('click', async (e) => {
		e.stopPropagation()
		button_save.classList.add('lock')
		ui.update_node_content(body_response, '')
		try {
			const api_response = await self.save(Array.from(deny_set), areas_allow)
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: api_response && api_response.result ? 'response_node' : 'response_node error',
				inner_html		: (api_response && api_response.msg) ? api_response.msg : 'Unknown error calling API',
				parent			: body_response
			})
		} catch (error) {
			console.error('config_areas save error:', error);
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'response_node error',
				inner_html		: 'Unknown error calling API',
				parent			: body_response
			})
		} finally {
			button_save.classList.remove('lock')
		}
	})

	return content_data
}//end get_content_data



// @license-end
