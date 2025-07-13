// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global  */
/*eslint no-undef: "error"*/



// imports
	import {view_graph_solved_section} from './view_graph_solved_section.js'



/**
* RENDER_SOLVED_SECTION
* Manages the component's logic and appearance in client side
*/
export const render_solved_section = function() {

	return true
}//end render_solved_section



/**
* SOLVED
* Render node for use in solved
* @param object options
* @return HTMLElement wrapper
*/
render_solved_section.prototype.solved = async function(options) {

	const self = this

	// view
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
* transform dedalo data into d3 format
* @param object options
* @return object d3_data
*/
export const get_d3_data = function(options) {

	const datum		= options.datum
	const graph_map	= options.graph_map

	const sources			= datum.data.filter(el => el.tipo === graph_map.source)
	const targets			= datum.data.filter(el => el.tipo === graph_map.target)
	const source_context	= datum.context.find(el => el.tipo === graph_map.source)

	const request_config = source_context?.request_config
	const rqo = request_config
		? request_config.find(el => el.api_engine === 'dedalo')
		: null
	const sqo = rqo
		? rqo.sqo
		: null

	const nodes = []
	const links = []

	const default_color = '#dddddd';

	const sources_length = sources.length
	for (let i = sources_length - 1; i >= 0; i--) {
		// source
			const current_souce = sources[i]
			const ar_source_id = current_souce.value.map(el => {
				return `${el.section_tipo}_${el.section_id}`
			})

			const source_id = (current_souce.value[0]) ? ar_source_id.join('|') : `s${i}_s${i}`
			const source_found = nodes.find(el => el.id === source_id)

			const source_section_tipo = (current_souce.value[0])
				? current_souce.value[0].section_tipo
				: null
			const source_section = (sqo)
				? sqo.section_tipo.find(el => el.tipo === source_section_tipo)
				: null

			const source = {
				id				: source_id,
				name			: current_souce.literal,
				value			: current_souce.value[0],
				section_tipo	: source_section_tipo,
				tipo			: current_souce.tipo,
				from			: {
					section_id		: current_souce.section_id,
					section_tipo	: current_souce.section_tipo
				},
				color 			: (source_section?.color) ? source_section.color : default_color
			}
			if(!source_found){
				nodes.push(source)
			}

		// target
			const current_target = datum.data.find(el =>
				el.tipo			=== graph_map.target &&
				el.section_id	=== current_souce.section_id &&
				el.section_tipo	=== current_souce.section_tipo
			)

			const ar_target_id = current_target.value.map(el => {
				return `${el.section_tipo}_${el.section_id}`
			})
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
			const source_role = datum.data.find(el =>
				el.tipo			=== graph_map.source_role &&
				el.section_id	=== current_souce.section_id &&
				el.section_tipo	=== current_souce.section_tipo
			)

		// target role
			const target_role = datum.data.find(el =>
				el.tipo			=== graph_map.target_role &&
				el.section_id	=== current_souce.section_id &&
				el.section_tipo	=== current_souce.section_tipo
			)


		// typology
			const typology = datum.data.find(el =>
				el.tipo			=== graph_map.typology &&
				el.section_id	=== current_souce.section_id &&
				el.section_tipo	=== current_souce.section_tipo
			)

		// connection
			const conection = datum.data.find(el =>
				el.tipo			=== graph_map.connection &&
				el.section_id	=== current_souce.section_id &&
				el.section_tipo	=== current_souce.section_tipo
			)

			const link = {
				source		: source_id,
				target		: target_id,
				value		: {
					section_id		: current_souce.section_id,
					section_tipo	: current_souce.section_tipo
				},
				weight : 18, // stroke-width
				source_role	: source_role.literal || '',
				target_role	: target_role.literal || ''
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
