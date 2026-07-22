// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'



/**
* RENDER_MENU_SKIP_TIPOS
* Editor for the menu-skip tipo list. Shows the current DEDALO_ENTITY_MENU_SKIP_TIPOS entries
* as removable chips plus a type-to-search box to add more (client-side typeahead over the
* area catalogue in self.value.areas — the catalogue is the search SOURCE, never a wall of rows).
*
* Widget value shape (from class.menu_skip_tipos::get_value):
*   { areas:[{tipo,model,parent,label,denied,allowed}], skip_tipos:[], writable:bool, env_override:bool }
*/
export const render_menu_skip_tipos = function() {

	return true
}//end render_menu_skip_tipos



/**
* LIST
* Builds the widget wrapper. Returns an HTMLElement appended to the widget body.
* @param {Object} options
* @returns {Promise<HTMLElement>} wrapper
*/
render_menu_skip_tipos.prototype.list = async function(options) { // eslint-disable-line no-unused-vars

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
* Builds the skip-list editor (chips + search-to-add + Save) from self.value.
* @param {Object} self - widget instance
* @returns {HTMLElement}
*/
const get_content_data = function(self) {

	const value			= self.value || {}
	const areas			= Array.isArray(value.areas) ? value.areas : []
	const writable		= value.writable !== false // default permissive if undefined

	// working skip list (array of tipos) seeded from current config
	const skip_list = Array.isArray(value.skip_tipos) ? value.skip_tipos.slice() : []

	// tipo -> node lookup, used for chip labels and the add-search source
	const by_tipo = new Map()
	for (let i = 0; i < areas.length; i++) {
		by_tipo.set(areas[i].tipo, areas[i])
	}
	const label_for	= (tipo) => (by_tipo.get(tipo) ? by_tipo.get(tipo).label : '(unknown tipo)')
	const meta_for	= (tipo) => (by_tipo.get(tipo) ? (tipo + ' · ' + by_tipo.get(tipo).model) : tipo)

	// content_data
	const content_data = ui.create_dom_element({
		element_type : 'div',
		class_name	 : 'content_data'
	})

	// info text
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'info_text',
		inner_html		: 'These grouping tipos are removed from the menu tree (their children move up to the grandparent). This is menu layout only — it does not change access. Changes apply on the next page load.',
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

	// skip chips container
	const chips_node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'menu_skip_chips',
		parent			: content_data
	})

	const render_chips = () => {
		ui.update_node_content(chips_node, '')

		if (skip_list.length===0) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'info_text comment',
				inner_html		: 'No grouping tipos skipped — the menu shows the full tree.',
				parent			: chips_node
			})
			return
		}

		for (let i = 0; i < skip_list.length; i++) {
			const tipo = skip_list[i]

			const chip = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'menu_skip_chip',
				parent			: chips_node
			})

			// inner_html source is trusted server-side ontology data (admin-curated labels/tipos), not end-user input
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'menu_skip_chip_label',
				inner_html		: label_for(tipo) + ' <small>' + meta_for(tipo) + '</small>',
				parent			: chip
			})

			const button_remove = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'menu_skip_chip_remove',
				inner_html		: '×',
				title			: 'Remove from skip list',
				parent			: chip
			})
			button_remove.disabled = (writable===false)
			button_remove.addEventListener('click', (e) => {
				e.stopPropagation()
				const idx = skip_list.indexOf(tipo)
				if (idx!==-1) {
					skip_list.splice(idx, 1)
				}
				render_chips()
			})
		}
	}
	render_chips()

	// add-to-skip: search box + client-side typeahead over the area catalogue
	const add_wrap = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'menu_skip_add',
		parent			: content_data
	})
	const search_input = ui.create_dom_element({
		element_type	: 'input',
		type			: 'text',
		class_name		: 'menu_skip_search',
		placeholder		: 'Add a grouping to skip — type a name or tipo',
		parent			: add_wrap
	})
	search_input.disabled = (writable===false)
	const suggestions = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'menu_skip_suggestions hide',
		parent			: add_wrap
	})

	const add_tipo = (tipo) => {
		if (!skip_list.includes(tipo)) {
			skip_list.push(tipo)
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
		const matches = []
		for (let i = 0; i < areas.length && matches.length < 12; i++) {
			const a = areas[i]
			if (skip_list.includes(a.tipo)) {
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
				class_name		: 'menu_skip_suggestion',
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
		button_save.classList.add('button_spinner')
		ui.update_node_content(body_response, '')
		try {
			const api_response = await self.save(skip_list.slice())
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: (api_response && api_response.result) ? 'response_node' : 'response_node error',
				inner_html		: (api_response && api_response.msg) ? api_response.msg : 'Unknown error calling API',
				parent			: body_response
			})
			// reflect what the server actually persisted (strips invalid / area_root + dedupes)
			if (api_response && api_response.result && Array.isArray(api_response.result.tipos)) {
				skip_list.length = 0
				for (let i = 0; i < api_response.result.tipos.length; i++) {
					skip_list.push(api_response.result.tipos[i])
				}
				render_chips()
			}
		} catch (error) {
			console.error('menu_skip_tipos save error:', error);
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'response_node error',
				inner_html		: 'Unknown error calling API',
				parent			: body_response
			})
		} finally {
			button_save.classList.remove('button_spinner')
		}
	})

	return content_data
}//end get_content_data



// @license-end
