// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'



/**
* RENDER_CONFIG_AREAS
* Deny-list editor for the config_areas widget.
*
* A real config_areas is a SHORT deny list (a handful of areas/sections), so the UI shows
* the current areas.deny entries as removable chips plus a type-to-search box to add more.
* The full area catalogue (self.value.areas) is used only as the client-side search SOURCE
* for the typeahead — it is never rendered as a wall of rows.
*
* areas.allow is config-only today (enforcement uses areas.deny); it is round-tripped
* unchanged on save and not shown in this UI.
*
* Exported as a constructor; its `list` prototype is assigned to config_areas.prototype.edit/list.
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
* Builds the deny-list editor (chips + search-to-add + Save) from self.value.
* @param {Object} self - widget instance
* @returns {HTMLElement}
*/
const get_content_data = function(self) {

	const value		= self.value || {}
	const areas		= Array.isArray(value.areas) ? value.areas : []
	const writable	= value.writable !== false // default permissive if undefined

	// working deny list (array of tipos) seeded from current config
	const deny_list		= Array.isArray(value.areas_deny) ? value.areas_deny.slice() : []
	// allow list is round-tripped unchanged (config-only, not edited here)
	const areas_allow	= Array.isArray(value.areas_allow) ? value.areas_allow.slice() : []

	// tipo -> node lookup, used for chip labels and the add-search source
	const by_tipo = new Map()
	for (let i = 0; i < areas.length; i++) {
		by_tipo.set(areas[i].tipo, areas[i])
	}
	const label_for	= (tipo) => (by_tipo.get(tipo) ? by_tipo.get(tipo).label : '(unknown tipo)')
	const meta_for	= (tipo) => (by_tipo.get(tipo) ? (tipo + ' · ' + by_tipo.get(tipo).model) : tipo)

	// content_data
	const content_data = ui.create_dom_element({
		element_type : 'div'
	})

	// info text
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'info_text',
		inner_html		: 'Denied areas/sections are hidden from the menu and from access for every user. Changes apply on the next page load.',
		parent			: content_data
	})

	// non-writable banner
	if (writable===false) {
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text error',
			inner_html		: 'The private directory is not writable by the web server. Saving is disabled; edit ../private/config.local.php by hand.',
			parent			: content_data
		})
	}

	// denied chips container
	const chips_node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'config_areas_deny_chips',
		parent			: content_data
	})

	// (re)build the chip list from deny_list
	const render_chips = () => {
		ui.update_node_content(chips_node, '')

		if (deny_list.length===0) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'info_text comment',
				inner_html		: 'No areas denied — every area is visible.',
				parent			: chips_node
			})
			return
		}

		for (let i = 0; i < deny_list.length; i++) {
			const tipo = deny_list[i]

			const chip = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'config_areas_chip',
				parent			: chips_node
			})

			// inner_html source is trusted server-side ontology data (admin-curated labels/tipos), not end-user input
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'config_areas_chip_label',
				inner_html		: label_for(tipo) + ' <small>' + meta_for(tipo) + '</small>',
				parent			: chip
			})

			const button_remove = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'config_areas_chip_remove',
				inner_html		: '×',
				title			: 'Remove from deny list',
				parent			: chip
			})
			button_remove.disabled = (writable===false)
			button_remove.addEventListener('click', (e) => {
				e.stopPropagation()
				const idx = deny_list.indexOf(tipo)
				if (idx!==-1) {
					deny_list.splice(idx, 1)
				}
				render_chips()
			})
		}
	}
	render_chips()

	// add-to-deny: search box + client-side typeahead over the area catalogue
	const add_wrap = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'config_areas_add',
		parent			: content_data
	})
	const search_input = ui.create_dom_element({
		element_type	: 'input',
		type			: 'text',
		class_name		: 'config_areas_search',
		placeholder		: 'Add to deny — type a name or tipo (e.g. Activities or dd69)',
		parent			: add_wrap
	})
	search_input.disabled = (writable===false)
	const suggestions = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'config_areas_suggestions hide',
		parent			: add_wrap
	})

	const add_tipo = (tipo) => {
		if (!deny_list.includes(tipo)) {
			deny_list.push(tipo)
		}
		search_input.value = ''
		ui.update_node_content(suggestions, '')
		suggestions.classList.add('hide')
		render_chips()
	}

	search_input.addEventListener('input', () => {
		const q = search_input.value.trim().toLowerCase()
		ui.update_node_content(suggestions, '')
		if (q.length===0) {
			suggestions.classList.add('hide')
			return
		}
		// match by label, tipo or model; skip already-denied; cap the list
		const matches = []
		for (let i = 0; i < areas.length && matches.length < 12; i++) {
			const a = areas[i]
			if (deny_list.includes(a.tipo)) {
				continue
			}
			const hay = ((a.label || '') + ' ' + a.tipo + ' ' + a.model).toLowerCase()
			if (hay.includes(q)) {
				matches.push(a)
			}
		}
		if (matches.length===0) {
			suggestions.classList.add('hide')
			return
		}
		suggestions.classList.remove('hide')
		for (let i = 0; i < matches.length; i++) {
			const a = matches[i]
			// inner_html source is trusted server-side ontology data, not end-user input
			const row = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'config_areas_suggestion',
				inner_html		: (a.label || '(no label)') + ' <small>' + a.tipo + ' · ' + a.model + '</small>',
				parent			: suggestions
			})
			row.addEventListener('mousedown', (e) => {
				// mousedown (not click) so it fires before the input's blur hides the list
				e.preventDefault()
				e.stopPropagation()
				add_tipo(a.tipo)
			})
		}
	})
	// hide the suggestions shortly after the input loses focus
	search_input.addEventListener('blur', () => {
		setTimeout(() => suggestions.classList.add('hide'), 150)
	})

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
	button_save.disabled = (writable===false)
	button_save.addEventListener('click', async (e) => {
		e.stopPropagation()
		button_save.classList.add('lock')
		ui.update_node_content(body_response, '')
		try {
			const api_response = await self.save(deny_list.slice(), areas_allow)
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: (api_response && api_response.result) ? 'response_node' : 'response_node error',
				inner_html		: (api_response && api_response.msg) ? api_response.msg : 'Unknown error calling API',
				parent			: body_response
			})
			// reflect what the server actually persisted (it strips guarded/invalid + dedupes)
			if (api_response && api_response.result && Array.isArray(api_response.result.areas_deny)) {
				deny_list.length = 0
				for (let i = 0; i < api_response.result.areas_deny.length; i++) {
					deny_list.push(api_response.result.areas_deny[i])
				}
				render_chips()
			}
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
