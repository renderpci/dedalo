// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, Promise, SHOW_DEVELOPER, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {get_section_records} from '../../section/js/section.js'
	import {set_element_css} from '../../page/js/css.js'
	import {when_in_dom} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'
	import * as instances from '../../common/js/instances.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {
		create_source
	} from '../../common/js/common.js'
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
					self 			: self,
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

	// vars
	const content_data	= options.content_data
	const data			= options.data
	const self			= options.self

	// Specify the dimensions of the graph.
	const size		= content_data.getBoundingClientRect()

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

	// Duplicate nodes
	// - Some nodes can be connected with the same target multiple times (duplicate the connection with different contexts),
	// for represent duplicate connections will use an arc path, unique or first duplicate will represent as a line.
	// - Every duplicate path will has a different radius of the arc, to show as different path
	// so, any links with duplicate source and target get an incremented 'link_number',
	// 'link_number' will use to calculate the final radius of the path into 'link_form' function (r=75/link_number).
	// - nodes connected with himself need to be identified as 'self_linked'
	for (let i = links.length - 1; i >= 0; i--) {

		const link = links[i]

		// check the the link is calling to himself
		// if yes, set it as self_linked and use 3 as link_number (small radius)
		if(link.source === link.target){
			link.link_number	= 3
			link.self_linked	= true
		}
		// the the node has link_number assigned by previous link don't touch
		if(link.link_number>=1){
			continue
		}
		// found the links with the same source connected with the same target
		const found_source = links.filter(el => el.source === link.source && el.target === link.target)
		const found_target = links.filter(el => el.source === link.target && el.target === link.source)

		// join all duplicates to count the total
		const duplicates = [...found_source, ...found_target]
		// if the link has a duplicate add link_number, but leave the original without touch
		if(duplicates.length > 1){
			let link_number = 1
			// don't change the original link (i≠0)
			for (let i = 1; i < found_source.length; i++) {
				const current_source		= found_source[i]
				current_source.link_number	= link_number
				link_number++
			}
			//reset the link_number because the duplicate in other direction will represent in the other side of the connection
			link_number = 1
			// in this case add link_number to all nodes (the original has avoided it in previous step)
			for (let i = 0; i < found_target.length; i++) {
				const current_target		= found_target[i]
				current_target.link_number	= link_number
				link_number++
			}
		}
	}

	// Create a simulation with several forces.
	const simulation = d3.forceSimulation(nodes)
		.force("link", d3.forceLink(links).id(d	=> d.id))
		.force("charge", d3.forceManyBody().strength(-4000))
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

 	// Per-type markers
	// Arrow pointer: It will store into the svg and will use in the path as "marker-end" with URL pointed to id
	svg.append("defs")
		.append('marker')
		.attr("id", "arrow")
		.attr("viewBox", "0 -5 10 10")
		.attr("refX", 0)
		.attr("refY", 0)
		.attr("markerWidth", 3)
		.attr("markerHeight", 3)
		.attr("orient", "auto-start-reverse")
		.append("path")
			.attr("fill", color)
			.attr("d", "M0,-5L10,0L0,5");

	// links
	// path between nodes
	// the path will have a arrow pointing to the target
	// use .data array to create all links
	const link = svg.append("g")
		.attr("fill", "none")
		.attr("stroke-opacity", 0.6)
		.selectAll("path")
		.data(links)
		.join("path")
			.attr("stroke", d => color(d.type))
			.attr("marker-end", 'url(#arrow)')
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

		// circle
		// the node representation of the thing
		// the user can drop new thing (people, entity, mint,...) in the node
		// when user drop a thing, create new nexus section, the node will be source and the dropped thing will be the target
		node.append("circle")
			.attr("stroke", "#ffffff") // a stroke around the circle, white as background
			.attr("stroke-width", 1.5) // a tiny stroke use to "cut" the link path
			.attr("r", 10) // fixed radius, if it change, change the r in the "tick" function
			.attr("fill", d => (d.section_tipo) ? color(d.section_tipo) : '#dddddd') // use different color for every section, if the section is empty, use gray
			.on("click", node_clicked) // open the main section of the thing
			.on("dragenter", on_dragenter) // show active the node
			.on("dragover", on_dragover) // show active the node and remove the default behavior to allow drop
			.on("drop", on_drop ) // create new nexus section with the source and target
			.on("dragleave", on_dragleave) // deactivate the node
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
		// links
		// target point will need to be calculated twice;
		// - first the path need a target in the center of the node (d.target)
		// - second when first is done, is possible calculate the path length, the node size (circle) and arrow size
		// with all sizes, creates new point that will be the target point.
		link
			.attr("d", function(d){
				// first, use the target point to create the path
				const x_target	= d.target.x
				const y_target	= d.target.y

				return link_form({
					d: d,
					x_target : x_target,
					y_target : y_target
				})
			})
			.attr("d", function(d){
				// second, with the previous path, calculate his length
				const pl = this.getTotalLength()
				// use the radius of the circle (10) a offset it (*2) and calculate the arrow size √3**2+3**2)
				const r = 10 * 2 + Math.sqrt(3**2 + 3 **2)
				// create new point in the path
				const m = this.getPointAtLength(pl - r);
				const x_target	= m.x
				const y_target	= m.y

				return link_form({
					d: d,
					x_target : x_target,
					y_target : y_target
				})
			});

		node
			.attr("transform", d => `translate(${d.x},${d.y})`);
	});

	// calculate the svg parameters for the paths
	// if the path is duplicated, an arc will created, it will has 'link_number' parameter with an int of the number of the duplicate 1,2,3
	// if the path is not duplicate, it will be a line
	function link_form(options) {

		const d			= options.d
		const x_target	= options.x_target
		const y_target	= options.y_target

		// the path is duplicate; create a arc
		if(d.link_number){
			// the radius of the arc will be different for every duplicate
			const r = 75/d.link_number;
			// if the path point to same node, self_linked, the large of the path need to be 1 else 0
			const large_arc	= (d.self_linked) ? 1 : 0
			// if the path point to same node, self_linked, the source point and target point need to be different
			// if the path has the same source point as target point the path collapse and don't show it.
			const x_source	= (d.self_linked) ? d.source.x + 1 : d.source.x
			const y_source	= (d.self_linked) ? d.source.y + 1 : d.source.y

			return `
					M${x_source},${y_source}
					A${r},${r} 0 ${large_arc},1 ${x_target},${y_target}
				`;
		}else{
			return `M${d.source.x},${d.source.y} L ${x_target},${y_target}`
		}
	}

	// Restore the target alpha so the simulation cools after dragging ends.
	// Unfix the subject position now that it’s no longer being dragged.
	function dragended(event) {
		if (!event.active) simulation.alphaTarget(0);
		event.subject.fx = null;
		event.subject.fy = null;
	}

		// when mouse enter with a drag move, change the node style to show it as activate
		function on_dragenter(event){
			d3.select(this).classed("dragover", true);
		}
		// remove default behavior to allow drop
		function on_dragover(event){
			event.preventDefault(); // allow drop
		}
		// when mouse leave the node, remove the style to show as normal
		function on_dragleave(event){
			d3.select(this).classed("dragover", false);
		}
		// drop
		// when user drop new section_record into a node, create new nexus section and assign the source (node) and target (section_record dragged)
		async function on_drop(event, p){

			event.preventDefault() // Necessary. Allows us to drop.
			event.stopPropagation()

			// remove the style of the node to show it as normal
			d3.select(this).classed("dragover", false);
			// self is the component_portat that call and it has the sort_order function
			const data	= event.dataTransfer.getData('text/plain');// element that's move
			// the drag element will sent the data of the original position, the source_key
			const data_parse = JSON.parse(data)

			// locators for source / target components
			const source_locator = p.locator
			const target_locator = data_parse.locator

			// data_manager. create new section
				const rqo = {
					action	: 'create',
					source	: {
						section_tipo : self.section_tipo
					}
				}
				const api_response = await data_manager.request({
					body : rqo
				})
				// if the server response is ok, it will send the new section_id
				if (api_response.result && api_response.result>0) {

					const section_id = api_response.result
					// source
					// assign the source data for the source component with the node locator
					set_component_data({
						tipo			: self.graph_map.source,
						locator			: source_locator,
						section_tipo	: self.section_tipo,
						section_id		: section_id
					})
					// target
					// assign the target data for the target component with the section_record dragged
					set_component_data({
						tipo			: self.graph_map.target,
						locator			: target_locator,
						section_tipo	: self.section_tipo,
						section_id		: section_id
					})
				}
			/** set_component_data
			* assign and save the data into the specific component (source, target component)
			* @param tipo component tipo
			* @param locator data of the component
			* @param section_tipo
			* @param section_id
			*/
			async function set_component_data(options){

				const tipo			= options.tipo
				const locator		= options.locator
				const section_tipo	= options.section_tipo
				const section_id	= options.section_id

				// create the component source instance
					const source_component = await instances.get_instance({
						section_tipo	: section_tipo,
						section_id		: section_id,
						tipo			: tipo,
						type 			: 'component'
					})

				// create the source (instance source of the component)
					const source = create_source(source_component, null)

				// set the changed_data for replace it in the instance data
				// update_data_value. key is the position in the data array, the value is the new value
					const value = {
						section_id			: locator.section_id,
						section_tipo		: locator.section_tipo,
						from_component_tipo	: tipo
					}
				// set the changed_data for update the component data and send it to the server for change when save
					const data = {}
					data.changed_data = [{
						action	: 'insert',
						key		: 0,
						value	: value
					}]
				// rqo
					const rqo = {
						action	: 'save',
						source	: source,
						data	: data
					}

				// data_manager. create new record
					const api_response = await data_manager.request({
						body : rqo
					})
			}
		}

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
			.attr("dy", "0em")
			.attr("id", "role")
			.text(`(${p.source_role})`);

		target_text_node.append("text")
			.attr("x", 14)
			.attr("y", 20)
			.attr("dy", "0em")
			.attr("id", "role")
			.text(`(${p.target_role})`);
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
const render_left = async (self) => {

	const left_node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'left_node'
	})

	const source					= self.graph_map.source
	const source_component_context	= (self.datum.context.find(el => el.tipo === source))
		? self.datum.context.find(el => el.tipo === source)
		: await get_source_component_context(source)


	async function get_source_component_context(source){

		const component = await instances.get_instance({
			tipo			: source,
			section_tipo	: self.section_tipo,
			section_id		: 'tmp',
			mode 			: 'list'
		})
		return component.context
	}

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
			const new_section_node = await render_source_section({
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
		render_source_section({
			section_tipo	: selected_section,
			rqo				: rqo
		})
		.then(function(section_node){
			section_container.appendChild(section_node)
		})

	return left_node
}//end render_left



const render_source_section = async function(options){

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

	const drag_container = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'drag_container',
		parent 			: fragment
	})
		const drag_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'drag_node draggable',
			parent 			: drag_container
		})
		drag_container.draggable = true
		drag_container.addEventListener('dragstart',function(e){on_dragstart(this, e, options={
				section_record_node	: drag_container,
				paginated_key		: options.paginated_key,
				total_records		: self.total,
				locator 			: options.locator,
				caller 				: self,
				drag_node 			: drag_node
			})
		})

		for (var i = 0; i < options.ar_instances.length; i++) {
			const instace_node = options.ar_instances[i].node.cloneNode(true)
			drag_node.appendChild(instace_node)
		}

	return fragment
}// end render_column_drag



/**
* ON_DRAGSTART
* Get element dataset path as event.dataTransfer from selected component
* @param DOM node
*	Its a section record (only in mosaic mode)
* @param event
* @param object options
* @return bool true
*/
export const on_dragstart = function(node, event, options) {
	// event.preventDefault();
	event.stopPropagation();

	// will be necessary the original locator of the section_record and the paginated_key (the position in the array of data)
	const transfer_data = {
		locator			: options.locator,
		paginated_key	: options.paginated_key
	}

	// the data will be transfer to drop in text format
	const data = JSON.stringify(transfer_data)

	// event.dataTransfer.effectAllowed = 'c';
	event.dataTransfer.setData('text/plain', data);

	// style the drag element to be showed in drag mode
	node.classList.add('dragging')

	event.dataTransfer.setDragImage(options.drag_node, 0, 20);

	return true
}//end ondrag_start




// @license-end