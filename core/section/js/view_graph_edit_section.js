// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {dd_request_idle_callback, when_in_dom} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'
	import {open_window, object_to_url_vars} from '../../common/js/utils/index.js'
	import {
		datum_to_graph,
		fetch_node_relations,
		fetch_section_datum,
		build_model_map,
		extract_node_fields
	} from './build_graph_data.js'



/**
* VIEW_GRAPH_EDIT_SECTION
* Interactive node graph of a record and its relations (edit mode).
* - Central node: current edit record (data already in client).
* - Edges: relation components pointing to other records.
* - Click a node to expand (lazy load via rqo) / collapse its relations.
*/
export const view_graph_edit_section = function() {

	return true
}//end view_graph_edit_section



/**
* RENDER
* Render node for use in edit graph view
* @param object self section instance
* @param object options
* @return HTMLElement wrapper
*/
view_graph_edit_section.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data (graph canvas)
		const content_data = get_content_data(self)

		if (render_level === 'content') {
			return content_data
		}

	// fragment
		const fragment = new DocumentFragment()

	// toolbar
		fragment.appendChild(get_toolbar(self))

	// content_data append
		fragment.appendChild(content_data)

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'section',
			id				: self.id,
			class_name		: `wrapper_${self.type} ${self.model} ${self.section_tipo}_${self.tipo} ${self.tipo} ${self.mode} view_${self.view}`
		})
		wrapper.appendChild(fragment)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_TOOLBAR
* Toolbar with the action to return to the standard form view.
* @param object self
* @return HTMLElement toolbar
*/
const get_toolbar = function(self) {

	const toolbar = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'graph_toolbar'
	})

	// back to form
		const back_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light graph_back_button',
			inner_html		: get_label.form || get_label.back || 'Form',
			parent			: toolbar
		})
		back_button.addEventListener('click', async (e) => {
			e.stopPropagation()
			await switch_view(self, 'default')
		})

	// hint
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'graph_hint',
			inner_html		: get_label.graph_hint || 'Click a node to expand or collapse its relations. Ctrl/Cmd + click opens the record.',
			parent			: toolbar
		})


	return toolbar
}//end get_toolbar



/**
* SWITCH_VIEW
* Toggle the section view (graph <-> default) reusing already-loaded data
* (build_autoload:false avoids an extra API call when leaving the graph).
* @param object self
* @param string view
* @return promise
*/
const switch_view = async function(self, view) {

	self.view = view
	if (self.context) {
		self.context.view = view
	}

	return self.refresh({
		build_autoload	: false,
		render_level	: 'full'
	})
}//end switch_view



/**
* GET_CONTENT_DATA
* Build the graph canvas and lazily mount the D3 visualization once in DOM.
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	const content_data = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'content_data ' + self.mode
	})

	// empty record case (new / unsaved)
		if (!self.section_id) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'graph_empty',
				inner_html		: get_label.no_data || 'No record to display',
				parent			: content_data
			})
			return content_data
		}

	// graph canvas (left)
		const graph_canvas = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'graph_canvas',
			parent			: content_data
		})

	// node detail panel (right)
		const node_detail = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'node_detail',
			parent			: content_data
		})
		content_data.node_detail = node_detail

	// mount d3 when in DOM
		when_in_dom(graph_canvas, () => {
			dd_request_idle_callback(async () => {
				try {
					await build_graph(self, graph_canvas, node_detail)
				} catch (error) {
					console.error('[view_graph_edit_section] build_graph error:', error)
				}
			})
		})


	return content_data
}//end get_content_data



/**
* BUILD_GRAPH
* Create the D3 force graph and wire up expand/collapse + node detail interaction.
* @param object self
* @param HTMLElement graph_canvas
* @param HTMLElement node_detail
* @return promise
*/
const build_graph = async function(self, graph_canvas, node_detail) {

	// load d3 lib only when needed
	// Note: d3.min.js is a UMD bundle that populates globalThis.d3
	// rather than providing named ESM exports, so import() returns
	// an empty namespace and the actual API lives on globalThis.d3
		if (self.node) {
			self.node.classList.add('loading')
		}
		await import('../../../lib/d3/d3-7.9.0/dist/d3.min.js')
		const d3 = globalThis.d3
		if (self.node) {
			self.node.classList.remove('loading')
		}

	// initial graph data (central record + direct relations) from client datum
		const graph = datum_to_graph(self)

	// dimensions
		const get_size = () => {
			const size = graph_canvas.getBoundingClientRect()
			return {
				width	: size.width || 800,
				height	: size.height || 600
			}
		}
		let { width, height } = get_size()

	// color scale per section_tipo
		const color = d3.scaleOrdinal(d3.schemeCategory10)

	// svg + zoom container
		const svg = d3.create('svg')
			.attr('viewBox', [0, 0, width, height])
			.classed('svg_content', true)

		const container = svg.append('g').classed('zoom_container', true)

		const zoom = d3.zoom()
			.scaleExtent([0.2, 4])
			.on('zoom', (event) => {
				container.attr('transform', event.transform)
			})
		svg.call(zoom)

	// layers
		const link_layer = container.append('g').classed('links_layer', true)
		const node_layer = container.append('g').classed('nodes_layer', true)

	// d3 selections (rebound on every update)
		let link_sel = link_layer.selectAll('line.graph_link')
		let link_label_sel = link_layer.selectAll('text.graph_link_label')
		let node_sel = node_layer.selectAll('g.graph_node')

	// simulation
		const simulation = d3.forceSimulation(graph.nodes)
			.force('link', d3.forceLink(graph.links).id(d => d.id).distance(140).strength(0.4))
			.force('charge', d3.forceManyBody().strength(-700))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force('collide', d3.forceCollide().radius(40))
			.on('tick', ticked)

	// helpers to read link endpoint ids regardless of resolved state
		const endpoint_id = (endpoint) => (typeof endpoint === 'object' && endpoint !== null) ? endpoint.id : endpoint
		const link_key = (l) => endpoint_id(l.source) + '__' + endpoint_id(l.target) + '__' + l.relation_tipo

	// re-entrancy guard for async expansion per node
		const processing = new Set()

	// selected node for detail panel
		let selected_node = null

	/**
	* UPDATE
	* Rebind selections to the current graph arrays and restart the simulation.
	*/
	function update() {

		// links
			link_sel = link_sel.data(graph.links, link_key)
			link_sel.exit().remove()
			link_sel = link_sel.enter()
				.append('line')
				.classed('graph_link', true)
				.merge(link_sel)

		// link labels
			link_label_sel = link_label_sel.data(graph.links, link_key)
			link_label_sel.exit().remove()
			link_label_sel = link_label_sel.enter()
				.append('text')
				.classed('graph_link_label', true)
				.attr('text-anchor', 'middle')
				.text(d => d.relation_label || '')
				.merge(link_label_sel)

		// nodes
			node_sel = node_sel.data(graph.nodes, d => d.id)
			node_sel.exit().remove()

			const node_enter = node_sel.enter()
				.append('g')
				.classed('graph_node', true)
				.call(drag(simulation))
				.on('click', node_clicked)

			node_enter.append('circle')
				.attr('r', d => d.is_root ? 16 : 11)

			node_enter.append('text')
				.attr('x', 16)
				.attr('y', '0.31em')
				.text(d => d.label)
				.clone(true).lower()
					.attr('class', 'graph_node_label_bg')
					.attr('fill', 'none')
					.attr('stroke', 'var(--color_white, #fff)')
					.attr('stroke-width', 3)

			node_sel = node_enter.merge(node_sel)

		// refresh visual state (classes, colors, labels) on the merged selection
			node_sel.classed('is_root', d => d.is_root)
				.classed('expandable', d => !d.is_root && !d.expanded)
				.classed('expanded', d => d.expanded && !d.is_root)
				.classed('selected', d => selected_node && d.id===selected_node.id)
			node_sel.select('circle')
				.attr('fill', d => d.is_root ? 'var(--color_hilite, #7092e0)' : color(d.section_tipo))
			node_sel.selectAll('text')
				.filter(function(){ return !this.classList.contains('graph_node_label_bg') })
				.text(d => d.label)

		// restart simulation
			simulation.nodes(graph.nodes)
			simulation.force('link').links(graph.links)
			simulation.alpha(0.6).restart()
	}//end update

	/**
	* TICKED
	* Position links and nodes on every simulation tick.
	*/
	function ticked() {
		link_sel
			.attr('x1', d => d.source.x)
			.attr('y1', d => d.source.y)
			.attr('x2', d => d.target.x)
			.attr('y2', d => d.target.y)

		link_label_sel
			.attr('x', d => (d.source.x + d.target.x) / 2)
			.attr('y', d => (d.source.y + d.target.y) / 2)

		node_sel
			.attr('transform', d => `translate(${d.x},${d.y})`)
	}//end ticked

	/**
	* DRAG
	* Standard d3 drag behavior for nodes.
	*/
	function drag(simulation) {
		return d3.drag()
			.on('start', (event) => {
				if (!event.active) simulation.alphaTarget(0.3).restart()
				event.subject.fx = event.subject.x
				event.subject.fy = event.subject.y
			})
			.on('drag', (event) => {
				event.subject.fx = event.x
				event.subject.fy = event.y
			})
			.on('end', (event) => {
				if (!event.active) simulation.alphaTarget(0)
				event.subject.fx = null
				event.subject.fy = null
			})
	}//end drag

	/**
	* NODE_CLICKED
	* Ctrl/Cmd + click opens the record in a new window.
	* Plain click toggles expand / collapse of the node relations.
	*/
	async function node_clicked(event, node) {

		event.stopPropagation()

		// open record in a new window
			if (event.ctrlKey || event.metaKey) {
				open_record_window(node)
				return
			}

		// if clicking a different node → select + show detail (no expand/collapse)
		// if clicking the already-selected node → toggle expand/collapse
			const was_selected = selected_node && selected_node.id===node.id

			selected_node = node
			show_node_detail(node)
			update()

		// toggle expand/collapse only when clicking the already-selected node
			if (!was_selected) {
				return
			}

		// re-entrancy guard
			if (processing.has(node.id)) {
				return
			}

		if (node.expanded) {
			collapse_node(node)
			node.expanded = false
			update()
			return
		}

		// expand
			if (node.loaded) {
				// cached children are re-attached by re-fetch only if missing; mark expanded
				node.expanded = true
				if (has_children(node)) {
					update()
					return
				}
			}

			processing.add(node.id)
			d3.select(this).classed('loading_node', true)
			try {
				const result = await fetch_node_relations(self, node)
				add_children(node, result)
				node.loaded = true
				node.expanded = true
				update()
			} catch (error) {
				console.error('[view_graph_edit_section] expand error:', error)
			} finally {
				processing.delete(node.id)
				d3.select(this).classed('loading_node', false)
			}
	}//end node_clicked

	/**
	* HAS_CHILDREN
	* Whether the node already has child links in the current graph.
	*/
	function has_children(node) {
		return graph.links.some(l => endpoint_id(l.source)===node.id && l.parent_id===node.id)
	}//end has_children

	/**
	* ADD_CHILDREN
	* Merge fetched child nodes/links into the graph, deduping by id / key.
	*/
	function add_children(node, result) {

		const existing_link_keys = new Set(graph.links.map(link_key))

		// nodes (dedupe by id)
			const result_nodes_len = result.nodes.length
			for (let i = 0; i < result_nodes_len; i++) {
				const child = result.nodes[i]
				if (!graph.nodes.find(n => n.id===child.id)) {
					// spawn near parent for a nicer layout
					child.x = (node.x || width / 2) + (Math.random() - 0.5) * 80
					child.y = (node.y || height / 2) + (Math.random() - 0.5) * 80
					graph.nodes.push(child)
				}
			}

		// links (dedupe by key)
			const result_links_len = result.links.length
			for (let i = 0; i < result_links_len; i++) {
				const link = result.links[i]
				const key = link.source + '__' + link.target + '__' + link.relation_tipo
				if (!existing_link_keys.has(key)) {
					graph.links.push(link)
					existing_link_keys.add(key)
				}
			}
	}//end add_children

	/**
	* COLLAPSE_NODE
	* Remove the subtree spawned by a node. A descendant is removed only when it
	* is not still referenced by another retained link (safe prune, cycle proof).
	*/
	function collapse_node(node) {

		// child links owned by this node
			const child_links = graph.links.filter(l => l.parent_id===node.id)
			if (child_links.length===0) {
				return
			}

			const child_target_ids = child_links.map(l => endpoint_id(l.target))

		// remove the owned links
			graph.links = graph.links.filter(l => l.parent_id!==node.id)

		// remove now-orphan descendants recursively
			const child_ids_len = child_target_ids.length
			for (let i = 0; i < child_ids_len; i++) {
				const tid = child_target_ids[i]
				prune_if_orphan(tid)
			}
	}//end collapse_node

	/**
	* PRUNE_IF_ORPHAN
	* Remove a node (and its own subtree) when no remaining link points to it.
	*/
	function prune_if_orphan(node_id) {

		const target_node = graph.nodes.find(n => n.id===node_id)
		if (!target_node || target_node.is_root) {
			return
		}

		// still referenced by any remaining link ? keep it
			const referenced = graph.links.some(l =>
				endpoint_id(l.source)===node_id || endpoint_id(l.target)===node_id
			)
			if (referenced) {
				return
			}

		// collapse its own children first
			const own_child_links = graph.links.filter(l => l.parent_id===node_id)
			const own_child_ids = own_child_links.map(l => endpoint_id(l.target))
			graph.links = graph.links.filter(l => l.parent_id!==node_id)

		// remove the node
			graph.nodes = graph.nodes.filter(n => n.id!==node_id)

		// recurse
			const own_child_ids_len = own_child_ids.length
			for (let i = 0; i < own_child_ids_len; i++) {
				prune_if_orphan(own_child_ids[i])
			}
	}//end prune_if_orphan

	/**
	* SHOW_NODE_DETAIL
	* Populate the detail panel with node information.
	* Metadata is shown immediately; component fields are lazy-fetched.
	* @param object node
	*/
	async function show_node_detail(node) {

		// clear panel
			node_detail.innerHTML = ''

		// header: label
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'node_label',
				inner_html		: node.label,
				parent			: node_detail
			})

		// meta: section_tipo + section_id (secondary info)
			const meta = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'node_meta',
				parent			: node_detail
			})
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'node_meta_item',
				inner_html		: node.section_tipo + ' · ' + node.section_id,
				parent			: meta
			})

		// open record link
			const open_link = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'light node_open_link',
				inner_html		: get_label.open || 'Open record',
				parent			: node_detail
			})
			open_link.addEventListener('click', (e) => {
				e.stopPropagation()
				open_record_window(node)
			})

		// fields container (lazy)
			const fields_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'node_fields',
				parent			: node_detail
			})

		// loading indicator
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'node_fields_loading',
				inner_html		: '…',
				parent			: fields_container
			})

		// resolve fields
			try {
				let datum = null
				if (node.is_root) {
					// root node: datum is already in self
					datum = self.datum
				} else {
					// non-root: fetch via API
					datum = await fetch_section_datum(self, node.section_tipo, node.section_id)
				}
				if (datum) {
					const model_map = build_model_map(datum)
					const fields = extract_node_fields(datum, node.section_tipo, node.section_id, model_map)
					// clear loading
						fields_container.innerHTML = ''
					const fields_len = fields.length
					for (let i = 0; i < fields_len; i++) {
						const field = fields[i]
						const row = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'node_field',
							parent			: fields_container
						})
						ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'node_field_label',
							inner_html		: field.label,
							parent			: row
						})
						ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'node_field_value',
							inner_html		: field.value,
							parent			: row
						})
						ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'node_field_tipo',
							inner_html		: field.tipo,
							parent			: row
						})
					}
					if (fields_len===0) {
						ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'node_fields_empty',
							inner_html		: get_label.no_data || 'No data',
							parent			: fields_container
						})
					}
				} else {
					fields_container.innerHTML = ''
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'node_fields_empty',
						inner_html		: get_label.no_data || 'No data',
						parent			: fields_container
					})
				}
			} catch (error) {
				console.error('[view_graph_edit_section] show_node_detail error:', error)
				fields_container.innerHTML = ''
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'node_fields_empty',
					inner_html		: 'Error loading data',
					parent			: fields_container
				})
			}
	}//end show_node_detail

	/**
	* OPEN_RECORD_WINDOW
	* Open a node record in a new edit window.
	*/
	function open_record_window(node) {
		const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
			tipo			: node.section_tipo,
			section_tipo	: node.section_tipo,
			id				: node.section_id,
			mode			: 'edit',
			session_save	: false,
			menu			: true
		})
		open_window({
			url		: url,
			name	: 'record_view_' + node.section_tipo + '_' + node.section_id
		})
	}//end open_record_window

	// resize handling
		const on_resize = () => {
			const size = get_size()
			width	= size.width
			height	= size.height
			svg.attr('viewBox', [0, 0, width, height])
			simulation.force('center', d3.forceCenter(width / 2, height / 2))
			simulation.alpha(0.3).restart()
		}
		window.addEventListener('resize', on_resize)

	// first paint
		update()
		graph_canvas.appendChild(svg.node())

	// click on canvas background deselects node
		svg.on('click', (event) => {
			if (event.target===svg.node()) {
				selected_node = null
				node_detail.innerHTML = ''
				update()
			}
		})

	if (SHOW_DEBUG===true) {
		console.log('[view_graph_edit_section] graph built:', graph)
	}
}//end build_graph



// @license-end
