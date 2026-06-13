// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {when_in_dom, when_in_viewport, dd_request_idle_callback} from '../../common/js/events.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {render_tree_data} from '../../common/js/common.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_AREA_MAINTENANCE
* Manages the area appearance in client side
*/
export const render_area_maintenance = function() {

	return true
}//end render_area_maintenance



/**
* EDIT
* Render node for use in edit
* @param object options
* @return HTMLElement wrapper
*/
render_area_maintenance.prototype.edit = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper =	ui.area.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* LIST
* Alias of edit
* @param object options
* @return HTMLElement
*/
render_area_maintenance.prototype.list = async function(options) {

	return this.edit(options)
}//end list



/**
* CATEGORY_DEFS
* Presentation order and labels for the maintenance widget categories.
* The category key is set server-side on every widget (see class.area_maintenance.php
* widget_factory). Labels fall back to the literal English string when no translation
* exists, matching the pattern used in get_ar_widgets().
* @return array
*/
const get_category_defs = function() {

	return [
		{ key:'data',		label: get_label.maintenance_cat_data		|| 'Backup & data' },
		{ key:'migration',	label: get_label.maintenance_cat_migration	|| 'Migration & transform' },
		{ key:'config',		label: get_label.maintenance_cat_config		|| 'Configuration & code' },
		{ key:'integrity',	label: get_label.maintenance_cat_integrity	|| 'Integrity & monitoring' },
		{ key:'system',		label: get_label.maintenance_cat_system		|| 'System & environment' },
		{ key:'diffusion',	label: get_label.maintenance_cat_diffusion	|| 'Diffusion' },
		{ key:'dev',		label: get_label.maintenance_cat_dev		|| 'Developer & testing' },
		{ key:'general',	label: get_label.others						|| 'Other' }
	]
}//end get_category_defs



/**
* CONTENT_DATA
* Builds the maintenance dashboard: a sticky toolbar (live search + category chips)
* over widgets grouped into category sections. Each widget card is still lazy-loaded
* via render_widget exactly as before; only the surrounding layout/chrome changed.
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	const widgets = self.widgets || []

	// bucket widgets by category, preserving definition order within each bucket
		const buckets = {}
		for (let i = 0; i < widgets.length; i++) {
			const widget	= widgets[i]
			const cat		= widget.category || 'general'
			if (!buckets[cat]) {
				buckets[cat] = []
			}
			buckets[cat].push(widget)
		}

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data maintenance_v2 ' + (self.type || '')
		})

	// filter state
		let active_category	= '' // '' === all
		let search_term		= ''

	// toolbar (sticky)
		const toolbar = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'maintenance_toolbar',
			parent			: content_data
		})
		const search_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'maintenance_search_wrap',
			parent			: toolbar
		})
		const search_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'search',
			class_name		: 'maintenance_search dd_input',
			placeholder		: (get_label.buscar || 'Search') + '…',
			parent			: search_wrap
		})
		const filters = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'maintenance_filters',
			parent			: toolbar
		})

	// groups container
		const groups = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'maintenance_groups',
			parent			: content_data
		})

	// filter chips ('All' + one per non-empty category)
		const chips = []
		const make_chip = (key, label) => {
			const chip = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'maintenance_chip' + (key==='' ? ' active' : ''),
				inner_html		: label,
				dataset			: { category: key },
				parent			: filters
			})
			chip.addEventListener('click', (e) => {
				e.preventDefault()
				active_category = key
				chips.forEach(c => c.classList.toggle('active', c===chip))
				apply_filters()
			})
			chips.push(chip)
		}
		make_chip('', get_label.todos || 'All')

	// build one section per non-empty category, in defined order
		const category_defs	= get_category_defs()
		const group_nodes	= []
		for (let c = 0; c < category_defs.length; c++) {

			const def	= category_defs[c]
			const list	= buckets[def.key]
			if (!list || !list.length) {
				continue
			}

			make_chip(def.key, def.label)

			// group
			const group = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'maintenance_group',
				dataset			: { category: def.key },
				parent			: groups
			})

			// group header (icon + label + count)
			const header = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'group_header',
				parent			: group
			})
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'group_icon',
				parent			: header
			})
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'group_label',
				inner_html		: def.label,
				parent			: header
			})
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'group_count',
				inner_html		: list.length,
				parent			: header
			})

			// grid of cards
			const grid = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'group_grid',
				parent			: group
			})

			for (let i = 0; i < list.length; i++) {

				const widget = list[i]

				// container (same structure/lifecycle as before; data-attrs added for filtering + category icon)
				const container = ui.create_dom_element({
					id				: widget.id,
					element_type	: 'div',
					dataset			: {
						category	: widget.category || 'general',
						label		: (widget.label || '').toLowerCase()
					},
					class_name		: 'widget_container ' + (widget.class || ''),
					parent			: grid
				})

				ui.load_item_with_spinner({
					container			: container,
					replace_container	: false,
					label				: widget.label,
					callback			: async () => {
						const node = await render_widget(widget, self)
						setTimeout(()=>{
							container.classList.add('loaded')
						}, 3)
						return node
					}
				})
			}

			group_nodes.push(group)
		}

	// empty state (shown when nothing matches the current filters)
		const empty_state = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'maintenance_empty hide',
			inner_html		: get_label.sin_resultados || 'No tools match your search',
			parent			: groups
		})

	// apply_filters. Combines active category chip + search term (AND)
		const apply_filters = () => {
			let any_visible = false
			for (let g = 0; g < group_nodes.length; g++) {

				const group		= group_nodes[g]
				const cat_ok	= !active_category || active_category===group.dataset.category

				let visible_in_group = 0
				const cards = group.querySelectorAll('.widget_container')
				for (let k = 0; k < cards.length; k++) {
					const card			= cards[k]
					const match_search	= !search_term || (card.dataset.label || '').includes(search_term)
					const show			= cat_ok && match_search
					card.classList.toggle('filtered_out', !show)
					if (show) {
						visible_in_group++
					}
				}

				group.classList.toggle('hide', visible_in_group===0)
				if (visible_in_group>0) {
					any_visible = true
				}
			}
			empty_state.classList.toggle('hide', any_visible)
		}

	// live search (debounced via idle callback)
		search_input.addEventListener('input', () => {
			dd_request_idle_callback(() => {
				search_term = search_input.value.trim().toLowerCase()
				apply_filters()
			})
		})


	return content_data
}//end content_data



/**
* RENDER_WIDGET
* Renders widget DOM nodes
* @param object item
* 	Widget object definitions
* @param object self
* 	Instance of current area
* @return DocumentFragment fragment
*/
const render_widget = async (item, self) => {

	const fragment = new DocumentFragment()

	// Validate item.id early to prevent issues with path construction and module loading.
	if (!item || !item.id) {
		console.error('RENDER_WIDGET Error: Widget item or item.id is missing.', item);
		return fragment; // Return an empty fragment or handle as appropriate
	}

	let widget_instance = null

	// label
		const label = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'widget_label icon_arrow',
			inner_html		: item.label || '',
			parent			: fragment,
		})

	// body
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'widget_body hide',
			parent			: fragment
		})
		const click_handler = (e) => {
			e.stopPropagation()
			if(e.altKey) {
				widget_instance.refresh()
			}
		}
		body.addEventListener('click', click_handler)

	// collapse_toggle_track
		const collapse = () => {
			label.classList.remove('up')
		}
		const expose = () => {
			label.classList.add('up')
		}
		ui.collapse_toggle_track({
			toggler				: label,
			container			: body,
			collapsed_id		: 'collapsed_' + item.id,
			collapse_callback	: collapse,
			expose_callback		: expose,
			default_state		: 'closed'
		})

	// widget module check. Use if exists
		try {

			const path = `../widgets/${item.id}/js/${item.id}.js`

			const module = await import(path)

			// Ensure the module exports a constructor with the item.id name
			if (typeof module[item.id] !== 'function') {
				throw new Error(`Widget module for ID '${item.id}' found, but does not export a constructor named '${item.id}'.`);
			}

			// instance widget
			const widget = new module[item.id]()

			// init widget
			await widget.init({
				id				: item.id,
				section_tipo	: self.section_tipo,
				section_id		: self.section_id,
				lang			: self.lang,
				mode			: self.mode, // list
				model			: 'widget',
				name			: item.label,
				value			: item.value,
				caller			: self
			})

			// render and append widget node

			const autoload = (item.value)
				? false
				: true

			// build
			await widget.build( autoload )

			// render
			const node = await widget.render()

			 // Ensure the rendered node is an element before adding class
			if (node instanceof Element) {
				// add CSS class for selection
				node.classList.add('body_info');

				body.appendChild(node)
			} else {
				console.warn(`Widget '${item.id}' render() did not return an HTML element. Cannot add 'body_info' class.`);
			}

			widget_instance = widget

		} catch (error) {
			if (error.message.includes('Failed to fetch dynamically imported module') || error.message.includes('Cannot find module')) {
				console.error(`RENDER_WIDGET Error: Widget module for '${item.id}' could not be loaded or found. Path: ../widgets/${item.id}/js/${item.id}.js`, error);
			} else {
				console.error(`RENDER_WIDGET Error during widget '${item.id}' processing:`, error);
			}
		}


	return fragment
}//end render_widget



/**
* PRINT_RESPONSE
* Render API response result message and result
* Note that api_response is returned by the delegated worker
* @param DOM node container
* @param object api_response
* @return DON node container
*/
export const print_response = (container, api_response) => {

	// clean container
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}

	// button_eraser
		const button_eraser = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button reset eraser',
			parent			: container
		})
		button_eraser.addEventListener('mouseup', function(e){
			e.stopPropagation();

			while (container.firstChild) {
				container.removeChild(container.firstChild);
			}
		})

	// errors
		if (api_response.errors && api_response.errors.length) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'api_response error',
				parent			: container,
				inner_html		: api_response.errors.join('<br>')
			})
		}

	// msg
		const api_msg = api_response && api_response.msg
			? Array.isArray(api_response.msg)
				? api_response.msg.join('<br>')
				: api_response.msg.replace(/\\n/g, '<br>')
			: 'Unknown API response error'
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'api_response',
			parent			: container,
			inner_html		: api_msg
		})

	// JSON response result
		const result = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'pre',
			parent			: container
		})
		render_tree_data(api_response, result)


	return container
}//end print_response



/**
* BUILD_FORM
* Render a form for given widget_object
* @param object widget_object
* @return HTMLElement form_container
*/
export const build_form = function(widget_object) {

	// widget_object
		const body_info		= widget_object.body_info
		const body_response	= widget_object.body_response
		const confirm_text	= widget_object.confirm_text || get_label.sure || 'Sure?'
		const inputs		= widget_object.inputs || []
		const submit_label	= widget_object.submit_label || 'OK'
		const trigger		= widget_object.trigger || {}
		const on_submit		= widget_object.on_submit // optional replacement function to exec on submit
		const on_done		= widget_object.on_done // optional function to exec on API response
		const on_render		= widget_object.on_render // optional function to exec on render is complete

	// create the form
		const form_container = ui.create_dom_element({
			element_type	: 'form',
			class_name		: 'form_container',
			parent			: body_info
		})
		form_container.addEventListener('submit', async function(e){
			e.preventDefault()

			// blur button
				document.activeElement.blur()

			// collect values from inputs
				const values = input_nodes.map((el)=>{
					return {
						name	: el.name,
						value	: el.value
					}
				})

			if ( confirm(confirm_text) ) {

				// check mandatory values
					for (let i = 0; i < input_nodes.length; i++) {
						if(input_nodes[i].classList.contains('mandatory') && input_nodes[i].value.length<1) {
							input_nodes[i].focus()
							input_nodes[i].classList.add('empty')
							return
						}
					}

				// on_submit. Overwrites default submit action
					if (on_submit) {
						return on_submit(e, values)
					}

				// submit data
					form_container.classList.add('lock')

					// spinner
					const spinner = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'spinner'
					})
					body_response.prepend(spinner)

					const options = (trigger.options)
						? Object.assign(trigger.options, values)
						: values

					// data_manager
						const api_response = await data_manager.request({
							use_worker	: true,
							body		: {
								dd_api			: trigger.dd_api,
								action			: trigger.action,
								prevent_lock	: true,
								source			: trigger.source || null,
								options			: options
							},
							retries : 1, // one try only
							timeout : 3600 * 1000 // 1 hour waiting response
						})
						print_response(body_response, api_response)
						form_container.classList.remove('lock')
						spinner.remove()

					// on_submit. Execute function after request
						if (on_done) {
							return on_done(api_response)
						}
			}
		})

	// form inputs
		const input_nodes = []
		for (let i = 0; i < inputs.length; i++) {

			const input = inputs[i]

			const class_name = input.mandatory
				? 'mandatory'
				: ''

			let input_node

			// select type
			if (input.type === 'select') {
				input_node = ui.create_dom_element({
					element_type	: 'select',
					name			: input.name,
					title			: input.label,
					class_name		: class_name,
					parent			: form_container
				})
				// add placeholder option
				ui.create_dom_element({
					element_type	: 'option',
					value			: '',
					text_content	: input.label || 'Select...',
					disabled		: true,
					selected		: !input.value,
					parent			: input_node
				})
				// add options
				if (input.options && Array.isArray(input.options)) {
					for (const option_value of input.options) {
						ui.create_dom_element({
							element_type	: 'option',
							value			: option_value,
							text_content	: option_value,
							selected		: input.value === option_value,
							parent			: input_node
						})
					}
				}
			}else{
				// default input type
				input_node = ui.create_dom_element({
					element_type	: 'input',
					type			: input.type,
					name			: input.name,
					placeholder		: input.label,
					title			: input.label,
					class_name		: class_name,
					parent			: form_container
				})
				if (input.value) {
					input_node.value = input.value
				}
			}

			input_node.addEventListener('change', function(){
				if (this.value.length>0) {
					this.classList.remove('empty')
				}
			})

			input_nodes.push(input_node)
		}

	// button submit
		const button_submit = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_submit',
			inner_html		: submit_label,
			parent			: form_container
		})
		form_container.button_submit = button_submit
		button_submit.addEventListener('click', function(e){
			e.stopPropagation()
		})

	// on_render
		if (on_render) {
			on_render({form_container, input_nodes})
		}


	return form_container
}//end build_form



/**
* SET_WIDGET_LABEL_STYLE
* Locate widget_container and set (add/remove) the given style
* If the node is not ready, wait until is available in the DOM
* @param object self
* @param string style (as 'danger')
* @param mode string add|remove
* @param HTMLElement ref_node (to observe node)
* @return void
*/
export const set_widget_label_style = function (self, style, mode, ref_node) {

	if (!self.node) {
		const when_in_dom_handler = () => {
			set_widget_label_style(self, style, mode, ref_node)
		}
		when_in_dom(ref_node, when_in_dom_handler)
		return
	}

	const wrapper = self.node
	const widget_container = wrapper.parentNode?.parentNode
	if (widget_container) {
		requestAnimationFrame(()=>{
			if (mode==='remove') {
				widget_container.classList.remove(style)
			}else{
				widget_container.classList.add(style)
			}
		})
	}
}//end set_widget_label_style



// @license-end
