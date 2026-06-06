// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import {clone} from '../../common/js/utils/index.js'



/**
* RELATION_MODELS
* Client side mirror of `component_relation_common::get_components_with_relations()`.
* Components whose data are locators pointing to other section records.
* Used to detect which datum items become graph edges.
*/
export const RELATION_MODELS = [
	'component_autocomplete',
	'component_autocomplete_hi',
	'component_check_box',
	'component_dataframe',
	'component_filter',
	'component_filter_master',
	'component_inverse',
	'component_portal',
	'component_publication',
	'component_radio_button',
	'component_relation_children',
	'component_relation_index',
	'component_relation_model',
	'component_relation_parent',
	'component_relation_related',
	'component_relation_struct',
	'component_select',
	'component_select_lang'
]



/**
* BUILD_MODEL_MAP
* Index datum.context by `section_tipo_tipo` to resolve a component model/label quickly.
* @param object datum
* @return object map
*/
export const build_model_map = function(datum) {

	const map = {}

	const context = datum?.context || []
	const context_length = context.length
	for (let i = 0; i < context_length; i++) {
		const ctx = context[i]
		if (!ctx || !ctx.tipo) {
			continue
		}
		map[ctx.section_tipo + '_' + ctx.tipo] = ctx
	}

	return map
}//end build_model_map



/**
* EXTRACT_TEXT
* Best effort flattening of a component `entries` value into a readable string.
* Handles arrays of strings and arrays of objects (value|literal|term|label).
* @param mixed entries
* @return string
*/
const extract_text = function(entries) {

	if (entries===null || entries===undefined) {
		return ''
	}

	const arr = Array.isArray(entries) ? entries : [entries]
	const parts = []
	const arr_length = arr.length
	for (let i = 0; i < arr_length; i++) {
		const el = arr[i]
		if (el===null || el===undefined) {
			continue
		}
		if (typeof el === 'string' || typeof el === 'number') {
			parts.push(String(el))
		}else if (typeof el === 'object') {
			const value = el.value ?? el.literal ?? el.term ?? el.label ?? null
			if (value!==null && (typeof value === 'string' || typeof value === 'number')) {
				parts.push(String(value))
			}
		}
	}

	return parts.filter(Boolean).join(', ').trim()
}//end extract_text



/**
* RESOLVE_LABEL
* Find a readable label for a record (section_tipo + section_id) using the
* non-relation component data items already present in datum.
* Falls back to `section_tipo · section_id` when no literal is found.
* @param object datum
* @param string section_tipo
* @param string section_id
* @param object model_map
* @return string
*/
export const resolve_label = function(datum, section_tipo, section_id, model_map) {

	const fallback	= section_tipo + ' · ' + section_id
	const data		= datum?.data || []
	const data_length = data.length

	// 1. try to find a readable value from the data items of the target record
		for (let i = 0; i < data_length; i++) {
			const item = data[i]
			if (item.section_tipo!==section_tipo || String(item.section_id)!==String(section_id)) {
				continue
			}
			const ctx	= model_map[item.section_tipo + '_' + item.tipo]
			const model	= ctx?.model || item.debug_model || ''
			// skip relation components and structural id components
			if (RELATION_MODELS.includes(model) || model==='component_section_id') {
				continue
			}
			const label = extract_text(item.entries)
			if (label) {
				return label
			}
		}

	// 2. try the context section label (e.g. "Cecas", "Bibliografía")
		const context = datum?.context || []
		const context_length = context.length
		for (let i = 0; i < context_length; i++) {
			const ctx = context[i]
			if (ctx.section_tipo===section_tipo && ctx.tipo===section_tipo && ctx.label) {
				return ctx.label
			}
		}

	return fallback
}//end resolve_label



/**
* IS_FALLBACK_LABEL
* Detect provisional labels (no literal resolved yet) so they can be upgraded later.
* @param string label
* @param string section_tipo
* @return bool
*/
export const is_fallback_label = function(label, section_tipo) {
	return !label || label.indexOf(section_tipo + ' · ')===0
}//end is_fallback_label



/**
* EXTRACT_RELATIONS
* Collect every relation (locator) declared by the relation components of a
* given root record inside the provided datum.
* @param object datum
* @param string root_section_tipo
* @param string root_section_id
* @param object model_map
* @return array relations [{ locator:{section_tipo, section_id}, relation_tipo, relation_label }]
*/
export const extract_relations = function(datum, root_section_tipo, root_section_id, model_map) {

	const relations	= []
	const data		= datum?.data || []
	const data_length = data.length

	for (let i = 0; i < data_length; i++) {
		const item = data[i]
		// only components belonging to the root record itself
		if (item.section_tipo!==root_section_tipo || String(item.section_id)!==String(root_section_id)) {
			continue
		}
		const ctx	= model_map[item.section_tipo + '_' + item.tipo]
		const model	= ctx?.model || item.debug_model || ''
		if (!RELATION_MODELS.includes(model)) {
			continue
		}
		const entries = Array.isArray(item.entries) ? item.entries : []
		const entries_length = entries.length
		for (let j = 0; j < entries_length; j++) {
			const loc = entries[j]
			if (!loc || !loc.section_tipo || !loc.section_id) {
				continue
			}
			relations.push({
				locator			: {
					section_tipo	: loc.section_tipo,
					section_id		: String(loc.section_id)
				},
				relation_tipo	: item.tipo,
				relation_label	: ctx?.label || item.debug_label || item.tipo
			})
		}
	}

	return relations
}//end extract_relations



/**
* BUILD_NODE
* Factory for a graph node object.
* @param object options
* @return object node
*/
const build_node = function(options) {
	return {
		id				: options.section_tipo + '_' + options.section_id,
		section_tipo	: options.section_tipo,
		section_id		: String(options.section_id),
		label			: options.label,
		is_root			: options.is_root === true,
		expanded		: options.is_root === true, // root starts expanded
		loaded			: options.is_root === true  // root data already in client
	}
}//end build_node



/**
* DATUM_TO_GRAPH
* Build the initial graph (central record + its direct relations) reusing the
* data already loaded in the edit client (no API call needed here).
* @param object self section instance in edit mode
* @return object { nodes, links }
*/
export const datum_to_graph = function(self) {

	const datum			= self.datum
	const model_map		= build_model_map(datum)
	const root_tipo		= self.section_tipo
	const root_id_value	= String(self.section_id)
	const root_id		= root_tipo + '_' + root_id_value

	// root node
		const root_label = resolve_label(datum, root_tipo, root_id_value, model_map)
		const nodes = [
			build_node({
				section_tipo	: root_tipo,
				section_id		: root_id_value,
				label			: root_label,
				is_root			: true
			})
		]

	// direct relations
		const links			= []
		const relations		= extract_relations(datum, root_tipo, root_id_value, model_map)
		const relations_len	= relations.length
		for (let i = 0; i < relations_len; i++) {
			const rel = relations[i]
			const tid = rel.locator.section_tipo + '_' + rel.locator.section_id
			if (tid===root_id) {
				continue // skip self reference
			}
			if (!nodes.find(n => n.id===tid)) {
				nodes.push(build_node({
					section_tipo	: rel.locator.section_tipo,
					section_id		: rel.locator.section_id,
					label			: resolve_label(datum, rel.locator.section_tipo, rel.locator.section_id, model_map)
				}))
			}
			links.push({
				source			: root_id,
				target			: tid,
				parent_id		: root_id,
				relation_tipo	: rel.relation_tipo,
				relation_label	: rel.relation_label
			})
		}

	return { nodes, links }
}//end datum_to_graph



/**
* FETCH_SECTION_DATUM
* Read a single record full datum (context + data) reusing the standard Dédalo
* `read` rqo. Cloned from the central section rqo as a template and constrained
* to the requested record via filter_by_locators.
* @param object self central section instance (rqo template source)
* @param string section_tipo
* @param string section_id
* @return object|null datum
*/
export const fetch_section_datum = async function(self, section_tipo, section_id) {

	try {
		// rqo template from the central section
			const rqo = self.rqo ? clone(self.rqo) : { source:{} }

			rqo.action			= 'read'
			rqo.source			= rqo.source || {}
			rqo.source.tipo			= section_tipo
			rqo.source.section_tipo	= section_tipo
			rqo.source.model		= 'section'
			rqo.source.typo			= 'sections'
			rqo.source.mode			= 'edit'
			rqo.source.view			= 'default' // avoid graph view dispatch on the server
			delete rqo.source.section_id
			delete rqo.id
			delete rqo.show

			rqo.sqo = {
				section_tipo		: [section_tipo],
				limit				: 1,
				offset				: 0,
				filter_by_locators	: [{
					section_tipo	: section_tipo,
					section_id		: section_id
				}]
			}

		// api request
			const api_response = await data_manager.request({
				body : rqo
			})

			if (SHOW_DEBUG===true && api_response?.errors?.length) {
				console.warn('[build_graph_data.fetch_section_datum] errors:', api_response.errors)
			}

		return api_response?.result || null

	} catch (error) {
		console.error('[build_graph_data.fetch_section_datum] error:', error)
		return null
	}
}//end fetch_section_datum



/**
* FETCH_NODE_RELATIONS
* Lazily resolve the relations of a node not yet loaded in the client, using the
* standard read rqo. Also upgrades the node label if a better literal is found.
* @param object self central section instance (rqo template)
* @param object node graph node to expand
* @return object { nodes, links } children to add (deduped by caller)
*/
export const fetch_node_relations = async function(self, node) {

	const datum = await fetch_section_datum(self, node.section_tipo, node.section_id)
	if (!datum) {
		return { nodes: [], links: [] }
	}

	const model_map = build_model_map(datum)

	// upgrade node label if it was a fallback
		if (is_fallback_label(node.label, node.section_tipo)) {
			const better = resolve_label(datum, node.section_tipo, node.section_id, model_map)
			if (better && !is_fallback_label(better, node.section_tipo)) {
				node.label = better
			}
		}

	const nodes		= []
	const links		= []
	const relations	= extract_relations(datum, node.section_tipo, node.section_id, model_map)
	const relations_len = relations.length
	for (let i = 0; i < relations_len; i++) {
		const rel = relations[i]
		const tid = rel.locator.section_tipo + '_' + rel.locator.section_id
		if (tid===node.id) {
			continue // skip self reference
		}
		nodes.push(build_node({
			section_tipo	: rel.locator.section_tipo,
			section_id		: rel.locator.section_id,
			label			: resolve_label(datum, rel.locator.section_tipo, rel.locator.section_id, model_map)
		}))
		links.push({
			source			: node.id,
			target			: tid,
			parent_id		: node.id,
			relation_tipo	: rel.relation_tipo,
			relation_label	: rel.relation_label
		})
	}

	return { nodes, links }
}//end fetch_node_relations



/**
* UPGRADE_FALLBACK_LABELS
* For every graph node whose label is still a fallback ("tipo · id"),
* fetch its section datum and resolve a better label.
* Calls `update_callback` after each batch so the graph can refresh.
* @param object self section instance (rqo template)
* @param array nodes graph.nodes array (mutated in place)
* @param function update_callback called after labels change
*/
export const upgrade_fallback_labels = async function(self, nodes, update_callback) {

	// collect unique section_tipos that need resolution
		const pending = {}
		const nodes_length = nodes.length
		for (let i = 0; i < nodes_length; i++) {
			const node = nodes[i]
			if (is_fallback_label(node.label, node.section_tipo)) {
				pending[node.section_tipo] = pending[node.section_tipo] || []
				pending[node.section_tipo].push(node)
			}
		}

		const tipos = Object.keys(pending)
		const tipos_length = tipos.length
		if (tipos_length===0) return
		for (let i = 0; i < tipos_length; i++) {

			const section_tipo	= tipos[i]
			const group		= pending[section_tipo]
			// fetch datum for the first node of this tipo (same section structure)
			const sample		= group[0]
			const datum		= await fetch_section_datum(self, section_tipo, sample.section_id)

			if (!datum) {
				continue
			}

			const model_map = build_model_map(datum)

			// upgrade every node of this section_tipo
			const group_length = group.length
			for (let j = 0; j < group_length; j++) {
				const node	= group[j]
				const better	= resolve_label(datum, node.section_tipo, node.section_id, model_map)
				if (better && !is_fallback_label(better, node.section_tipo)) {
					node.label = better
				}
			}

			// let the graph refresh after each tipo batch
			if (typeof update_callback==='function') {
				update_callback()
			}
		}
}//end upgrade_fallback_labels



/**
* EXTRACT_NODE_FIELDS
* Collect the displayable field values of a record from its datum.
* Relation components and section_id are excluded (relations are shown as edges).
* @param object datum
* @param string section_tipo
* @param string section_id
* @param object model_map
* @return array fields [{ label, value, tipo }]
*/
export const extract_node_fields = function(datum, section_tipo, section_id, model_map) {

	const fields	= []
	const data		= datum?.data || []
	const data_length = data.length

	for (let i = 0; i < data_length; i++) {
		const item = data[i]
		if (item.section_tipo!==section_tipo || String(item.section_id)!==String(section_id)) {
			continue
		}
		const ctx	= model_map[item.section_tipo + '_' + item.tipo]
		const model	= ctx?.model || item.debug_model || ''
		// skip relation components (shown as edges) and structural id
		if (RELATION_MODELS.includes(model) || model==='component_section_id') {
			continue
		}
		const label	= ctx?.label || item.debug_label || item.tipo
		const value	= extract_text(item.entries)
		fields.push({
			label	: label,
			value	: value || '—',
			tipo	: item.tipo
		})
	}

	return fields
}//end extract_node_fields



// @license-end
