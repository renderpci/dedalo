// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, Promise, SHOW_DEVELOPER, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {get_section_records} from '../../section/js/section.js'
	import {set_element_css} from '../../page/js/css.js'
	import {when_in_dom} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'
	import * as instances from '../../common/js/instances.js'
	import {open_window, object_to_url_vars} from '../../common/js/utils/index.js'
	import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm' //'../../../lib/d3/dist/d3.v7.min.js'
	import {
		get_d3_data
	} from './render_solved_section.js'


/**
* VIEW_GRAPH_SOLVED_SECTION
* Manages the component's logic and appearance in client side
*/
export const view_graph_solved_section = function() {

	return true
}//end view_graph_solved_section



/**
* RENDER
* Render node for use in edit
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_graph_solved_section.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'


	// set graph_map if it is defined in the properties of the section
	// else use default configuration
		self.graph_map =  (self.properties.graph_map)
			? self.properties.graph_map
			: {
				source		: 'nexus10',
				target		: 'nexus11',
				source_role	: 'nexus12',
				target_role	: 'nexus13',
				typology	: 'nexus7',
				connection	: 'nexus29'
			}

	// right side
		const right_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'right_node'
		})

	// content_data
		const content_data = await get_content_data(self)
		// fix last content_data (for pagination selection)
		self.node_body = content_data
		if (render_level==='content') {
			return content_data
		}

	// left side
		const left_node = await render_left(self)

	// buttons
		const buttons_node = get_buttons(self);
		if(buttons_node){
			right_node.appendChild(buttons_node)
		}

	// search filter
		// if (self.filter) {
			const search_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'search_container',
				parent			: right_node
			})
			self.search_container = search_container
		// }

	// content_data add to fragment
		right_node.appendChild(content_data)

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'section',
			id				: self.id,
			class_name		: `wrapper_${self.type} ${self.model} ${self.section_tipo}_${self.tipo} ${self.tipo} ${self.mode} view_${self.view}`
		})
		if (self.inspector===false) {
			wrapper.classList.add('no_inspector')
		}
		wrapper.appendChild(left_node)
		// append fragment
		wrapper.appendChild(right_node)
		// set pointers
		wrapper.content_data = content_data

	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {
	// const t0 = performance.now()

	// const fragment = new DocumentFragment()

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data', self.mode) // ,'nowrap','full_width'
			  // content_data.appendChild(fragment)


		when_in_dom(content_data, ()=>{

			// get d3 data
				const d3_data = get_d3_data({
					graph_map	: self.graph_map,
					data		: self.data,
					datum		: self.datum
				})

				const d3_node = get_graph({
					content_data	: content_data,
					data			: d3_data
				})

				content_data.appendChild(d3_node)
		})


	// debug
		if(SHOW_DEVELOPER===true) {
			// const total = (performance.now()-t0).toFixed(3)
			// dd_console(`__Time [view_graph_solved_section.get_content_data]: ${total} ms`,'DEBUG', [ar_section_record, total/ar_section_record_length])
		}


	return content_data
}//end get_content_data




const get_graph = function(options){


	const content_data = options.content_data
	const size = content_data.getBoundingClientRect()

	const data = options.data

	// Specify the dimensions of the chart.
	const width		= size.width;
	const height	= size.height;

	// Specify the color scale.
	const color = d3.scaleOrdinal(d3.schemeCategory10);

	// The force simulation mutates links and nodes, so create a copy
	// so that re-evaluating this cell produces the same result.
	const links			= data.links.map(d => ({...d}));
	const nodes			= data.nodes.map(d => ({...d}));

	// Create a simulation with several forces.
	const simulation = d3.forceSimulation(nodes)
		.force("link", d3.forceLink(links).id(d => d.id))
		.force("charge", d3.forceManyBody().strength(-800))
		.force("x", d3.forceX())
		.force("y", d3.forceY());

	// Create the SVG container.
	const svg = d3.create("svg")
		// .attr("width", width)
		// .attr("height", height)
		.attr("viewBox", [-width / 2, -height / 2, width, height])
		// .attr("preserveAspectRatio", "xMinYMin meet")
		// .attr("style", "max-width: 100%; height: auto;")
		.classed("svg_content", true);;

		window.addEventListener("resize", function(){
			const new_size 		= content_data.getBoundingClientRect()
			const new_width		= new_size.width;
			const new_height	= new_size.height;
			svg.attr("viewBox", [-new_width / 2, -new_height / 2, new_width, new_height])
		});

	// Add a line for each link, and a circle for each node.
	const link = svg.append("g")
		.attr("stroke", "#999")
		.attr("stroke-opacity", 0.6)
		.selectAll("line")
		.data(links)
		.join("line")
			.attr("stroke-width", d => Math.sqrt(d.value))
			.on("click", link_clicked)
			.on("mouseenter", link_mouse_enter)
			.on("mouseleave", link_mouse_leave);


	// const link = svg.append("g")
	// 	.attr("fill", "none")
	// 	.attr("stroke-width", 1.5)
	// 	.selectAll("path")
	// 	.data(links)
	// 	.join("path")
	// 		.attr("stroke", d => color(d.type))
	// 		.attr("marker-end", d => `url(${new URL(`#arrow-${d.type}`, location)})`);


	const node = svg.append("g")
		.attr("fill", "currentColor")
		.attr("stroke-linecap", "round")
		.attr("stroke-linejoin", "round")
		.selectAll("g")
			.data(nodes)
			.join("g");

	// add id to the node
		node
			.attr("id", d => d.id)

	node.append("circle")
		.attr("stroke", "#ffffff")
		.attr("stroke-width", 1.5)
		.attr("r", 9)
		.attr("fill", d => color(d.section_tipo))
		.on("click", node_clicked);

	// node.append("title")
	// 	.text(d => d.id);

	node.append("text")
		.attr("x", 14)
		.attr("y", "0.31em")

		.text(d => d.name)
		.clone(true).lower()
			.attr("fill", "none")
			.attr("stroke", "white")
			.attr("stroke-width", 3);

	// Add a drag behavior.
	node.call(d3.drag()
		.on("start", dragstarted)
		.on("drag", dragged)
		.on("end", dragended));

	// Set the position attributes of links and nodes each time the simulation ticks.
	simulation.on("tick", () => {
		link
			//.attr("d", linkArc);
			.attr("x1", d => d.source.x)
			.attr("y1", d => d.source.y)
			.attr("x2", d => d.target.x)
			.attr("y2", d => d.target.y);

		node
			.attr("transform", d => `translate(${d.x},${d.y})`);
	});


	// function linkArc(d) {
	// 	const r = Math.hypot(d.target.x - d.source.x, d.target.y - d.source.y);
	// 	return `
	// 			M${d.source.x},${d.source.y}
	// 			A${r},${r} 0 0,1 ${d.target.x},${d.target.y}
	// 		`;
	// }

	// Reheat the simulation when drag starts, and fix the subject position.
	function dragstarted(event) {
		if (!event.active) simulation.alphaTarget(0.3).restart();
		event.subject.fx = event.subject.x;
		event.subject.fy = event.subject.y;
	}

	// Update the subject (dragged node) position during drag.
	function dragged(event) {
		event.subject.fx = event.x;
		event.subject.fy = event.y;
	}

	// Restore the target alpha so the simulation cools after dragging ends.
	// Unfix the subject position now that it’s no longer being dragged.
	function dragended(event) {
		if (!event.active) simulation.alphaTarget(0);
		event.subject.fx = null;
		event.subject.fy = null;
	}

	// When this cell is re-run, stop the previous simulation. (This doesn’t
	// really matter since the target alpha is zero and the simulation will
	// stop naturally, but it’s a good practice.)
	// invalidation.then(() => simulation.stop());


	function node_clicked(event, p) {

		const section_tipo	= p.locator.section_tipo
		const section_id	= p.locator.section_id

		// open a new window
			const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
				tipo			: section_tipo,
				section_tipo	: section_tipo,
				id				: section_id,
				mode			: 'edit',
				session_save	: false, // prevent to overwrite current section session
				menu			: true
			})
			open_window({
				url			: url,
				name		: 'record_view_' + section_id,
			})
	}


	function link_clicked(event, p) {

		const section_tipo	= p.locator.section_tipo
		const section_id	= p.locator.section_id

		// open a new window
			const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
				tipo			: section_tipo,
				section_tipo	: section_tipo,
				id				: section_id,
				mode			: 'edit',
				session_save	: false, // prevent to overwrite current section session
				menu			: true
			})
			open_window({
				url			: url,
				name		: 'record_view_' + section_id,
			})
	}

	function link_mouse_enter(event, p) {

		const source_text_node = d3.select("#" + p.source.id);
		const target_text_node = d3.select("#" + p.target.id);
			// p.source.name = p.source_role

		source_text_node.append("text")
			.attr("x", 14)
			.attr("y", 20)
			.attr("dy", ".35em")
			.attr("id", "role")
			.text(p.source_role);

		target_text_node.append("text")
			.attr("x", 14)
			.attr("y", 20)
			.attr("dy", ".35em")
			.attr("id", "role")
			.text(p.target_role);
	}

	function link_mouse_leave(event, p) {

		const source_text_node = d3.selectAll("#role").remove();;
	}

	return svg.node();
}



/**
* GET_BUTTONS
* @return HTMLElement buttons
*/
const get_buttons = function(self) {

	// DocumentFragment
		const fragment = new DocumentFragment()

	// buttons_container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: fragment
		})

	// filter button (search) . Show and hide all search elements
		const filter_button	= ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning search',
			inner_html		: get_label.find || 'Search',
			parent			: buttons_container
		})
		filter_button.addEventListener('mousedown', function(e) {
			e.stopPropagation()
			// Note that self section is who is observing this event (init)
			event_manager.publish('toggle_search_panel_'+self.id)
		})


	return fragment
}//end get_buttons



/**
* render_left
* @return HTMLElement node
*/
const render_left = (self) => {

	const left_node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'left_node'
	})

	const source					= self.graph_map.source
	const source_component_context	= self.datum.context.find(el => el.tipo === source)

	const request_config = source_component_context.request_config

	const rqo = request_config.find(el => el.api_engine === 'dedalo')

	const sqo = rqo.sqo

	// section_selector_container
		const section_selector_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'section_selector_container',
			parent			: left_node
		})
		const section_select = ui.create_dom_element({
			element_type	: 'select',
			class_name		: 'section_select',
			parent			: section_selector_container
		})

		const section_tipo_length = sqo.section_tipo.length
		for (let i = 0; i < section_tipo_length; i++) {
			const section = sqo.section_tipo[i]

			const section_option = ui.create_dom_element({
				element_type	: 'option',
				class_name		: 'section_option',
				inner_html 		: section.label,
				parent			: section_select
			})
			section_option.section_tipo = section.tipo
		}
		section_select.addEventListener('change', async function(e) {

			while (section_container.hasChildNodes()) {
				section_container.removeChild(section_container.lastChild);
			}
			const selected = e.target.options[e.target.selectedIndex]
			const section_tipo = selected.section_tipo;
			const new_section_node = await render_section({
				section_tipo	: section_tipo,
				rqo				: rqo
			})
			section_container.appendChild(new_section_node)
		})

	// section_container
		const section_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'section_container',
			parent			: left_node
		})
		// render first selection
		const selected_section = section_select[section_select.selectedIndex].section_tipo
		render_section({
			section_tipo	: selected_section,
			rqo				: rqo
		})
		.then(function(section_node){
			section_container.appendChild(section_node)
		})


	return left_node
}//end render_left



const render_section = async function(options){

	const section_tipo = options.section_tipo
	const rqo = options.rqo

	const old_ddo_map = rqo.show.ddo_map.filter(el => el.section_tipo === section_tipo)

	const ddo_map = old_ddo_map.map(el =>{
			el.parent = section_tipo
		return el
	})

	// request_config
		const request_config = [{
			api_engine	: 'dedalo',
			type		: 'main',
			sqo			: {
				section_tipo	: [{tipo:section_tipo}],
				limit			: 10,
				offset			: 0
			},
			show		: {
				ddo_map : ddo_map
			}
		}]


	const section_options = {
		model			: 'section',
		tipo			: section_tipo,
		section_tipo	: section_tipo,
		mode			: 'list',
		request_config	: request_config,
		add_show		: true
	}

	const section = await instances.get_instance(section_options)
	await section.build(true)
	// section.fixed_columns_map = true

	// section.columns_map = await rebuild_columns_map(section)
	section.rebuild_columns_map = rebuild_columns_map;

	// view
		section.view = 'base'

	const section_node = await section.render()

	return section_node
}


/**
* REBUILD_COLUMNS_MAP
* Adding control columns to the columns_map that will processed by section_recods
* @param object self
* @return obj columns_map
*/
const rebuild_columns_map = async function(self) {

	// columns_map already rebuilt case
		if (self.fixed_columns_map===true) {
			return self.columns_map
		}

	const columns_map = []

	// column section_id check
		columns_map.push({
			id			: 'section_id',
			label		: 'Id',
			tipo		: 'section_id', // used to sort only
			sortable	: true,
			width		: 'minmax(auto, 6rem)',
			path		: [{
				// note that component_tipo=section_id is valid here
				// because section_id is a direct column in search
				component_tipo	: 'section_id',
				// optional. Just added for aesthetics
				model			: 'component_section_id',
				name			: 'ID',
				section_tipo	: self.section_tipo
			}],
			callback	: view_graph_solved_section.render_column_id
		})

	// columns base
		const base_columns_map = await self.columns_map
		columns_map.push(...base_columns_map)


	columns_map.push({
			id			: 'drag',
			label		: '',
			tipo		: '', // used to sort only
			sortable	: false,
			width		: '3rem',
			callback	: view_graph_solved_section.render_column_drag
		})


	// fixed as calculated
		self.fixed_columns_map = true

	return columns_map
}//end rebuild_columns_map


/**
* RENDER_COLUMN_ID
* It is called by section_record to create the column id with custom options
* @param object options
* @return DocumentFragment
*/
view_graph_solved_section.render_column_id = function(options) {

	// options
		const self			= options.caller
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo

	const fragment = new DocumentFragment()

	// button_edit
		const button_edit = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_edit button_view_' + self.context.view,
			parent			: fragment
		})
		button_edit.addEventListener('click', function(e) {
			e.stopPropagation()
			e.preventDefault();

			// open a new window
			const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
				tipo			: section_tipo,
				section_tipo	: section_tipo,
				id				: section_id,
				mode			: 'edit',
				session_save	: false, // prevent to overwrite current section session
				menu			: true
			})
			open_window({
				url			: url,
				name		: 'record_view_' + section_id,
				on_blur : () => {
					// refresh current instance
					self.refresh({
						build_autoload : true
					})
				}
			})
		})

	// edit icon
		ui.create_dom_element({
			element_type	: 'span',
			// class_name	: 'button pen icon grey',
			class_name		: 'button pen icon grey',
			parent			: button_edit
		})


	return fragment
}//end render_column_id


/**
* RENDER_COLUMN_DRAG
* It is called by section_record to create the column id with custom options
* @param object options
* @return DocumentFragment
*/
view_graph_solved_section.render_column_drag = function(options){

	// options
		const self			= options.caller
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo

	const fragment = new DocumentFragment()

	// button_drag
		const button_drag = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button move icon grey',
			parent			: fragment
		})


	return fragment
}// end render_column_drag

























// @license-end
