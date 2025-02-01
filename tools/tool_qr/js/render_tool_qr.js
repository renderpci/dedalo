// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_dummy */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'
	import {dd_request_idle_callback} from '../../../core/common/js/events.js'
	import {get_instance} from '../../../core/common/js/instances.js'
	import {render_footer} from '../../tool_common/js/render_tool_common.js'




/**
* RENDER_TOOL_QR
* Manages the component's logic and appearance in client side
*/
export const render_tool_qr = function() {

	return true
}//end render_qr



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_dummy.js'
* @param object options
* @return HTMLElement wrapper
*/
render_tool_qr.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns a standard built tool wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
* @param instance self
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	const fragment = new DocumentFragment()

	// info_container
		const info_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_container',
			parent			: fragment
		})
		// render_info_container
		info_container.appendChild(
			render_info_container(self)
		)

	// qr_container
		const qr_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'qr_container',
			parent			: fragment
		})
		// render_canvas
		qr_container.appendChild(
			render_canvas(self)
		)

	// footer_node
		const footer_node = render_footer(self)
		fragment.appendChild(footer_node)

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* RENDER_INFO_CONTAINER
* Creates the top section info about records visualized
* @param instance self
* @return DocumentFragment
*/
const render_info_container = (self) => {

	const fragment = new DocumentFragment()

	// section label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'section_label',
			inner_html		: self.section.label,
			parent			: fragment
		})
		// totals
		const totals_value = (get_label.total_records || 'Total records') + `: ${self.section.total}`
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: get_label.active_elements || 'Active elements',
			inner_html		: totals_value,
			parent			: fragment
		})

	// canvas_direction
		const canvas_direction = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'canvas_direction',
			parent			: fragment
		})
		const canvas_selector = ui.create_dom_element({
			element_type	: 'select',
			class_name		: 'canvas_selector',
			parent			: canvas_direction
		})
		// option portrait
		ui.create_dom_element({
			element_type	: 'option',
			value			: 'portrait',
			inner_html		: 'Portrait',
			parent			: canvas_selector
		})
		// option landscape
		ui.create_dom_element({
			element_type	: 'option',
			value			: 'landscape',
			inner_html		: 'Landscape',
			parent			: canvas_selector
		})
		// change event
		const change_handler = (e) => {

			const value = e.target.value

			// reset
			self.qr_canvas.classList.remove('portrait','landscape')

			// add
			self.qr_canvas.classList.add(value)
		}
		canvas_selector.addEventListener('change', change_handler)


	return fragment
}//end render_info_container



/**
* RENDER_CANVAS
* Creates the print canvas A4 and add the QR items
* @param instance self
* @return DocumentFragment
*/
const render_canvas = (self) => {

	const fragment = new DocumentFragment()

	// qr_canvas
		const qr_canvas = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'qr_canvas',
			parent			: fragment
		})
		// fix pointer
		self.qr_canvas = qr_canvas

	// check tool_config
		if (!self.tool_config || !self.section.datum.context) {
			qr_canvas.innerHTML = 'Error: Invalid tool config';
			return fragment
		}

	// image. Could be multiple (note that no context duplicates exists)
		const ar_image_ddo	= self.tool_config.ddo_map.filter(el => el.role==='image')
		const ar_image_tipo	= ar_image_ddo.map( (el) => el.tipo )

	// label. Could be multiple
		const ar_label_ddo	= self.tool_config.ddo_map.filter(el => el.role==='label')
		const ar_label_tipo	= ar_label_ddo.map( (el) => el.tipo )

	// host (could be defined in tool config as {"options":{"host":"https://localhost:8443/",..}})
		const host = self.config?.options?.host
			? self.config.options.host
			: window.location.origin

	// entity_logo (could be defined in tool config as {"options":{"entity_logo":"https://localhost:8443/mylogo.svg",..}})
		const entity_logo = self.config?.options?.entity_logo || null

	// items
		const qr_promises = []

		const value = self.section.data.value || []

		const value_length = value.length
		for (let i = 0; i < value_length; i++) {

			const item = value[i]

			const section_id	= item.section_id
			const section_tipo	= item.section_tipo

			// url compose
			const url = `${host}${DEDALO_CORE_URL}/page/?tipo=${section_tipo}&section_id=${section_id}`

			// item wrapper
				const qr_wrapper = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'qr_wrapper',
					parent			: qr_canvas
				})

			// qr code
				const qr_code = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'qr_code',
					title			: url,
					parent			: qr_wrapper
				})
				// click handler
				const click_handler = (e) => {
					e.stopPropagation()
					window.open(url)
				}
				qr_code.addEventListener('click', click_handler)
				// qr_code create and add
				const qr_promise = generate_qr({
					container	: qr_code,
					text		: url,
					logo		: '../../core/themes/default/dedalo_logo.svg',
					width		: 160,
					height		: 160
				})
				qr_promises.push(qr_promise)

			// qr_info
				const qr_info = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'qr_info',
					parent			: qr_wrapper
				})

				// image_container
				const ar_image_data = self.section.datum.data.filter(el => {
					return ar_image_tipo.includes(el.tipo) && el.row_section_id==section_id
				})
				if (ar_image_data) {
					const image_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'image_container',
						parent			: qr_info
					})
					ar_image_data.map(el_data => {
						render_component(self, el_data)
						.then(function(node){
							image_container.appendChild(node)
						})
					})
				}

				// qr_section_id
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'qr_section_id',
					text_content	: section_id,
					parent			: qr_info
				})

				// label_container
				const label_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'label_container',
					parent			: qr_info
				})
				const ar_label_data = self.section.datum.data.filter(el => {
					return ar_label_tipo.includes(el.tipo) && el.row_section_id==section_id
				})
				if (ar_label_data) {
					ar_label_data.map(el_data => {
						render_component(self, el_data)
						.then(function(node){
							label_container.appendChild(node)
						})
					})
				}

				// qr_logo
				if (entity_logo) {
					ui.create_dom_element({
						element_type	: 'img',
						class_name		: 'qr_logo',
						src				: entity_logo,
						parent			: qr_info
					})
				}
		}//end for (let i = 0; i < value_length; i++)


	return fragment
}//end render_canvas



/**
* RENDER_component
* Creates the component that manage the given context and
* render it to create the final DOM node
* @param object self
* @param int section_id
* @param object component_data
* @return HTMLElement
*/
const render_component = async function (self, component_data) {

	const tipo			= component_data.tipo
	const section_tipo	= component_data.section_tipo
	const section_id	= component_data.section_id
	const context		= self.section.datum.context

	const component_context = context.find( el => {
		return el.tipo===tipo && el.section_tipo===section_tipo
	})

	const component = await get_instance({
		tipo			: component_context.tipo,
		section_tipo	: component_context.section_tipo,
		model			: component_context.model,
		mode			: component_context.mode,
		view			: component_context.view,
		section_id		: section_id
	})

	// inject context from section datum
	component.context = component_context

	// inject data from section datum
	component.data = component_data

	await component.build(false)

	const node = await component.render();


	return node
}//end render_component



/**
* GENERATE_QR
* @see https://github.com/ushelp/EasyQRCodeJS
* @return
*/
const generate_qr = function(options) {

	return new Promise(function(resolve){

		// worker way
			// const current_worker = new Worker('worker_qr.js', {
			// 	type : 'module'
			// })
			// current_worker.onmessage = function(e) {
			// 	resolve( true )
			// }
			// current_worker.onerror = function(e) {
			// 	console.error('Worker error [generate_qr]:', e);
			// }
			// current_worker.postMessage(options)

		// options
			const container = options.container
			const text		= options.text || 'dedalo.dev/dedalo'
			const width		= options.width || 200
			const height	= options.height || 200
			const logo		= options.logo || '../../core/themes/default/dedalo_logo.svg'

		// qr options
			const qr_options = {
				text		: text, // "www.easyproject.cn/donation", // Content
				width		: width, // 240, // Widht
				height		: height, // 240, // Height
				colorDark	: "#000000", // Dark color
				colorLight	: "#ffffff", // Light color

				// Logo
				logo						: logo,
				logoWidth					: 20,
				logoHeight					: 20,
				logoBackgroundColor			: '#ffffff', // Logo background color, Invalid when `logBgTransparent` is true; default is '#ffffff'
				logoBackgroundTransparent	: false, // Whether use transparent image, default is false

				timing_V : '#f78a1c', // orange Dédalo

				correctLevel : QRCode.CorrectLevel.H, // L, M, Q, H

				dotScale : 0.5,

				// quietZone
				quietZone : 10,
				// quietZoneColor: '#00CED1',

				onRenderingEnd : function(options, dataURL){
					// console.info(dataURL);
					resolve(true)
				}
			}

		// Create QRCode Object
			dd_request_idle_callback(
				() => new QRCode(container, qr_options)
			)
	})
}//end generate_qr



// @license-end
