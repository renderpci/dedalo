// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global  */
/*eslint no-undef: "error"*/



// imports
	import {view_graph_solved_section} from './view_graph_solved_section.js'



/**
* RENDER_SOLVED_SECTION
* Namespace constructor for the solved-section render module.
* Always returns true; the meaningful logic lives on static method properties.
*
* Solved mode is the read-only, presentation-focused rendering of a section.
* Currently the only supported view variant is the D3 force-directed graph
* (see view_graph_solved_section). The `solved` method dispatches to that view.
*
* Exports:
*   render_solved_section  — namespace/constructor (render mode dispatcher)
*   get_d3_data            — pure data-transform helper: Dédalo datum → D3 nodes+links
* @returns {boolean} true
*/
export const render_solved_section = function() {

	return true
}//end render_solved_section



/**
* SOLVED
* Entry point called by the section lifecycle to produce the DOM node for solved mode.
* Reads `this.context.view` to select a view variant; currently 'graph' and 'default'
* both delegate to view_graph_solved_section.render().
*
* Called as a method on the section instance (`this` = section self), so `self` retains
* the full section context including `self.datum`, `self.properties`, and `self.context`.
*
* @param {Object} options - Render options forwarded verbatim to the active view renderer
* @returns {Promise<HTMLElement>} The rendered wrapper element for the solved section
*/
render_solved_section.solved = async function(options) {

	const self = this

	// view
	// Default to 'default' when no view is set on context; both 'graph' and 'default'
	// currently map to the same D3 graph renderer.
		const view = self.context?.view || 'default'

	// wrapper
	switch(view) {
		case 'graph':
		case 'default':
		default:
			return view_graph_solved_section.render(self, options)
	}
}//end solved



/**
* GET_D3_DATA
* Transforms a resolved Dédalo section datum into the nodes-and-links graph format
* consumed by D3's force-directed simulation in view_graph_solved_section.
*
* Input data shapes:
*   datum.data    — flat array of component rows, one per (nexus_section_id × component_tipo).
*                   Each row: { tipo, section_id, section_tipo, value: Array<locator>, literal }
*                   where locator = { section_tipo, section_id }.
*   datum.context — array of component context objects. The source component's context
*                   carries `request_config`, which includes the SQO. The SQO's
*                   `section_tipo[]` entries have { tipo, label, color } and are used
*                   for node coloring.
*
*   graph_map     — maps semantic role names to component tipos, e.g.:
*                     { source: 'nexus10', target: 'nexus11', source_role: 'nexus12',
*                       target_role: 'nexus13', typology: 'nexus7', connection: 'nexus29' }
*
* Output shape:
*   {
*     nodes: [ { id, name, value, section_tipo, tipo, from: {section_id, section_tipo}, color } ],
*     links: [ { source, target, value: {section_id, section_tipo}, weight, source_role, target_role } ]
*   }
*
* Node IDs are '<section_tipo>_<section_id>' for populated locators, or a synthetic
* fallback 's<i>_s<i>' / 't<i>_t<i>' for empty-value (unresolved) component rows.
* Nodes are deduplicated by ID so multiple nexus records pointing to the same entity
* share a single graph node.
*
* The `from` field on each node records which nexus section owns the component row;
* it is used by view_graph_solved_section's drag-and-drop to assign component data.
*
* Note: `typology` and `connection` rows are retrieved but are NOT currently included
* in the returned link objects. They are available for future expansion.
*
* @param {Object} options
* @param {Object} options.datum     - Resolved section datum: { data: Array, context: Array }
* @param {Object} options.graph_map - Role → component tipo mapping
* @returns {Object} d3_data shape: { nodes: Array, links: Array }
*/
export const get_d3_data = function(options) {

	const datum		= options.datum
	const graph_map	= options.graph_map

	// Collect all component rows for the source and target tipos across every nexus record.
	// Each entry corresponds to one nexus section record (identified by section_id + section_tipo).
	const sources			= datum.data.filter(el => el.tipo === graph_map.source)
	const targets			= datum.data.filter(el => el.tipo === graph_map.target)
	// The source component's context entry carries request_config, which holds the SQO
	// with the section_tipo[] list and their display colors.
	const source_context	= datum.context.find(el => el.tipo === graph_map.source)

	const request_config = source_context?.request_config
	// rqo = the request query object scoped to the 'dedalo' api_engine within request_config
	const rqo = request_config
		? request_config.find(el => el.api_engine === 'dedalo')
		: null
	// sqo.section_tipo[] has entries: { tipo, label, color } used for per-section-type node coloring
	const sqo = rqo
		? rqo.sqo
		: null

	const nodes = []
	const links = []

	// CSS variable fallback for nodes whose section_tipo has no configured color in the SQO
	const default_color = 'var(--color_grey_13)';

	// Iterate reverse so that the last-encountered record wins during node deduplication,
	// preserving a consistent ordering that matches the server's data array order.
	const sources_length = sources.length
	for (let i = sources_length - 1; i >= 0; i--) {
		// source
		// A component row's `value` array holds locator objects: { section_tipo, section_id }.
		// Multiple locators (multi-value component) are joined with '|' into the node ID
		// so a single graph node can represent a compound locator.
			const current_source = sources[i]
			const ar_source_id = current_source.value.map(el => {
				return `${el.section_tipo}_${el.section_id}`
			})

			// Synthetic fallback ID used when the source component has no locator value yet
			const source_id = (current_source.value[0]) ? ar_source_id.join('|') : `s${i}_s${i}`
			const source_found = nodes.find(el => el.id === source_id)

			// Resolve the section_tipo of the first locator to look up the configured node color
			const source_section_tipo = (current_source.value[0])
				? current_source.value[0].section_tipo
				: null
			const source_section = (sqo)
				? sqo.section_tipo.find(el => el.tipo === source_section_tipo)
				: null

			const source = {
				id				: source_id,
				name			: current_source.literal,   // resolved display label for this locator
				value			: current_source.value[0],  // first locator object; null when empty
				section_tipo	: source_section_tipo,
				tipo			: current_source.tipo,
				// `from` records the nexus section owning this row; used by drag-and-drop
				// in view_graph_solved_section to write component data to the correct record
				from			: {
					section_id		: current_source.section_id,
					section_tipo	: current_source.section_tipo
				},
				color 			: (source_section?.color) ? source_section.color : default_color
			}
			// Only add the node once; multiple nexus records may reference the same entity
			if(!source_found){
				nodes.push(source)
			}

		// target
		// Find the target component row belonging to the same nexus record as current_source,
		// matched by the nexus record's own section_id + section_tipo.
			const current_target = datum.data.find(el =>
				el.tipo			=== graph_map.target &&
				el.section_id	=== current_source.section_id &&
				el.section_tipo	=== current_source.section_tipo
			)

			const ar_target_id = current_target.value.map(el => {
				return `${el.section_tipo}_${el.section_id}`
			})
			// Synthetic fallback ID for empty target components
			const target_id = (current_target.value[0]) ?  ar_target_id.join('|') : `t${i}_t${i}`
			const target_found = nodes.find(el => el.id === target_id)

			const target_section_tipo = (current_target.value[0])
				? current_target.value[0].section_tipo
				: null
			const target_color = (sqo)
				? sqo.section_tipo.find(el => el.tipo === target_section_tipo)
				: null

			const target = {
				id				: target_id,
				name			: current_target.literal,
				value			: current_target.value[0],
				section_tipo	: target_section_tipo,
				tipo			: current_target.tipo,
				from			: {
					section_id		: current_target.section_id,
					section_tipo	: current_target.section_tipo
				},
				color 			: (target_color?.color) ? target_color.color : default_color
			}
			if(!target_found){
				nodes.push(target)
			}

		// source role
		// Role label for the source entity in this relation (e.g. "creator", "owner").
		// Matched to the nexus record via section_id + section_tipo of the nexus row.
			const source_role = datum.data.find(el =>
				el.tipo			=== graph_map.source_role &&
				el.section_id	=== current_source.section_id &&
				el.section_tipo	=== current_source.section_tipo
			)

		// target role
		// Role label for the target entity in this relation.
			const target_role = datum.data.find(el =>
				el.tipo			=== graph_map.target_role &&
				el.section_id	=== current_source.section_id &&
				el.section_tipo	=== current_source.section_tipo
			)


		// typology
		// Relation typology/category row. Retrieved but not currently included in the
		// returned link object; reserved for future use (e.g. link styling by typology).
			const typology = datum.data.find(el =>
				el.tipo			=== graph_map.typology &&
				el.section_id	=== current_source.section_id &&
				el.section_tipo	=== current_source.section_tipo
			)

		// connection
		// Connection/link-type row. Retrieved but not currently included in the
		// returned link object; reserved for future use.
			const connection = datum.data.find(el =>
				el.tipo			=== graph_map.connection &&
				el.section_id	=== current_source.section_id &&
				el.section_tipo	=== current_source.section_tipo
			)

			// `value` carries the nexus record locator used by view_graph_solved_section
			// to open the nexus edit window when the user clicks a link path in the graph.
			// `weight` maps to SVG stroke-width via Math.sqrt(weight) px in the D3 renderer.
			const link = {
				source		: source_id,
				target		: target_id,
				value		: {
					section_id		: current_source.section_id,
					section_tipo	: current_source.section_tipo
				},
				weight : 18, // stroke-width
				source_role	: source_role?.literal || '',
				target_role	: target_role?.literal || ''
			}

			links.push(link)
	}//end for (let i = sources_length - 1; i >= 0; i--)

	const d3_data = {
		nodes : nodes,
		links : links
	}

	return d3_data
}//end get_d3_data



// @license-end
