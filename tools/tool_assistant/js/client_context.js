// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, DEDALO_MEDIA_URL, structuredClone*/
/*eslint no-undef: "error"*/



// import
	import { event_manager } from '../../../core/common/js/event_manager.js'
	import { get_all_instances } from '../../../core/common/js/instances.js'



/**
 * CLIENT_CONTEXT
 * Direct access to the browser's component instances registry.
 * Reads loaded component data without any server round-trip.
 */
export const client_context = class client_context {



	constructor() {

		this._context = {
			section_tipo	: null,
			section_id		: null,
			component_tipo	: null,
			component_label	: null,
			component_model	: null,
			mode			: null,
			lang			: null
		}
		this._event_tokens = []
	}//end constructor



	/**
	 * UPDATE_FROM_EVENTS
	 * Subscribe to Dédalo's standard lifecycle events to track the current
	 * section, record, and active component without polling. Tokens are kept
	 * internally and released by destroy(). Returns nothing.
	 * @return void
	 */
	update_from_events() {

		this._event_tokens.push(
			event_manager.subscribe('activate_component', (data) => {
				if (data && data.tipo) {
					this._context.component_tipo	= data.tipo
					this._context.component_label	= data.label || data.tipo
					this._context.component_model	= data.model || null
					this._context.section_tipo		= data.section_tipo || this._context.section_tipo
					this._context.section_id		= data.section_id || this._context.section_id
					this._context.mode				= data.mode || this._context.mode
					this._context.lang				= data.lang || this._context.lang
				}
			})
		)

		this._event_tokens.push(
			event_manager.subscribe('render_instance', (data) => {
				if (data && (data.model === 'section' || data.model === 'area_section')) {
					this._context.section_tipo	= data.tipo || this._context.section_tipo
					this._context.section_id	= data.section_id || this._context.section_id
					this._context.mode			= data.mode || this._context.mode
				}
			})
		)

		this._event_tokens.push(
			event_manager.subscribe('user_navigation', (data) => {
				if (data && data.section_tipo) {
					this._context.section_tipo		= data.section_tipo
					this._context.section_id		= data.section_id
					this._context.component_tipo	= null
					this._context.component_label	= null
					this._context.component_model	= null
					this._context.mode				= null
					this._context.lang				= null
				}
			})
		)
	}//end update_from_events



	destroy() {
		for (const token of this._event_tokens) {
			event_manager.unsubscribe(token)
		}
		this._event_tokens = []
	}//end destroy



	/**
	 * _MATCH_INSTANCE
	 * Checks whether an instance matches the given section_tipo, section_id, and optional tipo.
	 * Comparison is loose: section_id compared as string, null-safe.
	 * @param object inst
	 * @param string section_tipo
	 * @param string|number section_id
	 * @param string tipo Optional tipo filter
	 * @return bool
	 */
	_match_instance(inst, section_tipo, section_id, tipo) {

		if (!inst || !this._is_component(inst)) return false
		if (tipo && inst.tipo !== tipo) return false
		if (inst.section_tipo !== section_tipo) return false
		if (String(inst.section_id) !== String(section_id)) return false
		return true
	}//end _match_instance



	/**
	 * GET_ACTIVE_COMPONENT
	 * Returns the currently focused component's label, model, and value string.
	 * @return object|null { tipo, label, model, value, entries, lang, mode }
	 */
	get_active_component() {

		const { section_tipo, section_id, component_tipo } = this._context
		if (!component_tipo) return null

		const all = get_all_instances()

		// 1. Try exact match with current context
		if (section_tipo && section_id !== null) {
			for (const inst of all) {
				if (this._match_instance(inst, section_tipo, section_id, component_tipo)) {
					return this._to_component_summary(inst)
				}
			}
		}

		// 2. Fallback: find by tipo alone (ignoring section context)
		for (const inst of all) {
			if (this._is_component(inst) && inst.tipo === component_tipo) {
				this._context.section_tipo	= inst.section_tipo
				this._context.section_id	= inst.section_id
				return this._to_component_summary(inst)
			}
		}

		return null
	}//end get_active_component



	/**
	 * GET_SECTION_COMPONENTS
	 * Returns every component instance loaded for the current section record.
	 * Deduplicates by tipo. Tries multiple match strategies.
	 * @return array [{ tipo, label, model, value, lang }]
	 */
	get_section_components() {

		let section_tipo	= this._context.section_tipo
		let section_id		= this._context.section_id

		// 1. Try exact match with current context
		if (section_tipo && section_id !== null) {
			const results = this._filter_components(section_tipo, section_id)
			if (results.length > 0) return results
		}

		// 2. Try deriving section from the active component's own data
		const active = this.get_active_component()
		if (active && active.section_tipo && active.section_id !== undefined) {
			section_tipo	= active.section_tipo
			section_id		= active.section_id
			this._context.section_tipo = section_tipo
			this._context.section_id   = section_id

			const results = this._filter_components(section_tipo, section_id)
			if (results.length > 0) return results
		}

		// No unsafe site-wide fallback: returning components from a different
		// record would leak unrelated data to the model. Caller (system prompt
		// or tool result) renders a "(no data loaded)" hint when this is empty.
		return []
	}//end get_section_components



	/**
	 * _FILTER_COMPONENTS
	 * Filter all instances by section_tipo and section_id, dedup by tipo.
	 * @param string section_tipo
	 * @param string|number section_id
	 * @return array
	 */
	_filter_components(section_tipo, section_id) {

		const all		= get_all_instances()
		const results	= []
		const seen		= new Set()

		for (const inst of all) {
			if (!this._match_instance(inst, section_tipo, section_id)) continue
			if (seen.has(inst.tipo)) continue
			seen.add(inst.tipo)
			results.push(this._to_component_summary(inst))
		}

		return results
	}//end _filter_components



	/**
	 * _TO_COMPONENT_SUMMARY
	 * Normalizes an instance into a portable summary object.
	 * @param object inst
	 * @return object
	 */
	_to_component_summary(inst) {

		return {
			tipo	: inst.tipo,
			label	: inst.label || inst.tipo,
			model	: inst.model,
			value	: this.get_value_string(inst),
			lang	: inst.lang,
			mode	: inst.mode,
			section_tipo	: inst.section_tipo,
			section_id		: inst.section_id
		}
	}//end _to_component_summary



	/**
	 * GET_COMPONENT_VALUE
	 * Read a single component's display value by its ontology tipo.
	 * Falls back to tipo-only match if section context fails.
	 * @param string tipo
	 * @param string lang Optional language filter
	 * @return string|null
	 */
	get_component_value(tipo, lang) {

		if (!tipo) return null
		const all = get_all_instances()

		// 1. Try exact match with current context
		const { section_tipo, section_id } = this._context
		if (section_tipo && section_id !== null) {
			for (const inst of all) {
				if (this._match_instance(inst, section_tipo, section_id, tipo)) {
					if (lang && inst.lang !== lang) continue
					return this.get_value_string(inst)
				}
			}
		}

		// 2. Fallback: find by tipo alone
		for (const inst of all) {
			if (this._is_component(inst) && inst.tipo === tipo) {
				if (lang && inst.lang !== lang) continue
				return this.get_value_string(inst)
			}
		}

		return null
	}//end get_component_value



	/**
	 * GET_VALUE_STRING
	 * Extracts a human-readable string from a component instance based on its model.
	 * No truncation for text components — returns FULL value so the model can
	 * translate, summarize, or manipulate it. Callers that inject into the system
	 * prompt (get_context_summary, get_active_value) truncate independently.
	 * No server calls — reads only from the loaded browser data.
	 * @param object instance
	 * @return string
	 */
	get_value_string(instance) {

		if (!instance || !instance.data || !Array.isArray(instance.data.entries)) {
			return '(empty)'
		}

		const entries	= instance.data.entries
		const model		= instance.model || ''
		const entry		= entries[0]
		if (!entry) return '(empty)'

		// --- text-based (FULL value, no truncation) ---
		if (model.indexOf('input_text') !== -1 || model.indexOf('text_area') !== -1) {
			const value = entry.value
			if (typeof value === 'string') {
				return model.indexOf('text_area') !== -1
					? value.replace(/<[^>]*>/g, '')
					: value
			}
			return String(value)
		}

		// --- relation / portal / select (locator-based) ---
		if (model.indexOf('select') !== -1 || model.indexOf('portal') !== -1 ||
			model.indexOf('relation_') !== -1 || model.indexOf('inverse') !== -1 ||
			model.indexOf('children') !== -1 || model.indexOf('parent') !== -1 ||
			model.indexOf('index') !== -1 || model.indexOf('related') !== -1) {
			const labels = entries.map(function(e) {
				return (e.section_tipo || '?') + '#' + (e.section_id || '?')
			})
			return '[' + labels.join(', ') + ']'
		}

		// --- JSON (truncate, can be huge) ---
		if (model.indexOf('json') !== -1) {
			const json = JSON.stringify(entry.value || entry)
			return json.length > 5000 ? json.substring(0, 5000) + '...' : json
		}

		// --- date ---
		if (model.indexOf('date') !== -1) {
			return String(entry.value || '')
		}

		// --- geolocation ---
		if (model.indexOf('geolocation') !== -1) {
			const val = entry.value || {}
			return (val.lat || val.latitude || '?') + ', ' + (val.lng || val.longitude || '?')
		}

		// --- checkbox / radio ---
		if (model.indexOf('check_box') !== -1 || model.indexOf('radio_button') !== -1) {
			return String(entry.value || '')
		}

		// --- email / publication / other simple text ---
		if (model.indexOf('email') !== -1 || model.indexOf('publication') !== -1) {
			return String(entry.value || '')
		}

		// --- password (never reveal) ---
		if (model.indexOf('password') !== -1) {
			return '********'
		}

		// --- fallback ---
		const fallback = entry.value !== undefined ? entry.value : entry
		const str = typeof fallback === 'string' ? fallback : JSON.stringify(fallback)
		return str
	}//end get_value_string



	/**
	 * GET_CONTEXT_SUMMARY
	 * Builds a formatted multi-line string for the system prompt and tools.
	 * Always returns a string (never null) when context has any data.
	 * Falls back to listing the active component alone when section matching fails.
	 * @return string|null null only when no context at all is available
	 */
	get_context_summary() {

		const { section_tipo, section_id, component_tipo, component_label, component_model } = this._context

		// no context at all
		if (!section_tipo && !section_id && !component_tipo) return null

		const lines		= []
		const _short	= function(str, max) {
			if (typeof str !== 'string' || str.length <= max) return str
			return str.substring(0, max) + '[...]'
		}

		// context line
		const ctxParts = []
		if (section_tipo) ctxParts.push('Section: ' + section_tipo)
		if (section_id !== null && section_id !== undefined) ctxParts.push('Record: ' + section_id)
		if (component_tipo) {
			let c = component_tipo
			if (component_label) c += ' (' + component_label + ')'
			ctxParts.push('Component: ' + c)
		}
		lines.push('Context: ' + ctxParts.join(' | '))

		// components
		const components = this.get_section_components()

		if (components.length > 0) {
			const activeLbl = component_label || component_tipo || null

			// active component (highlighted)
			if (activeLbl) {
				const active = components.find(function(c) { return c.tipo === component_tipo })
				if (active) {
					lines.push('Active component \u2014 ' + (active.label || active.tipo) + ': "' + _short(active.value, 200) + '"')
				}
			}

			// all fields (excluding active component)
			lines.push('')
			lines.push('Loaded data in record' + (section_id !== null && section_id !== undefined ? ' #' + section_id : '') + ' (' + components.length + ' fields):')
			const MAX_VISIBLE = 20
			let count = 0
			for (const comp of components) {
				if (comp.tipo === component_tipo) continue
				if (count >= MAX_VISIBLE) break
				lines.push('  ' + (comp.label || comp.tipo) + ': ' + _short(comp.value, 150))
				count++
			}

			const hidden = components.length - MAX_VISIBLE - (activeLbl ? 1 : 0)
			if (hidden > 0) {
				lines.push('  (' + hidden + ' more fields\u2026)')
			}
		} else {
			// try at least the active component via tipo-only lookup
			const active = this.get_active_component()
			if (active) {
				lines.push('Active component \u2014 ' + (active.label || active.tipo) + ': "' + _short(active.value, 200) + '"')
				lines.push('')
				lines.push('(No sibling components found in this record.)')
			} else {
				lines.push('')
				lines.push('(No component instances found. The section may still be loading.)')
			}
		}

		return lines.join('\n')
	}//end get_context_summary



	/**
	 * SEARCH_LOADED_DATA
	 * Case-insensitive text search across all component values in the current record.
	 * @param string query
	 * @return array Matching lines "label: value"
	 */
	search_loaded_data(query) {

		if (!query || typeof query !== 'string') return []
		const q = query.toLowerCase()

		return this.get_section_components().filter(function(c) {
			return (c.value || '').toLowerCase().indexOf(q) !== -1
				|| (c.label || '').toLowerCase().indexOf(q) !== -1
		}).map(function(c) {
			return (c.label || c.tipo) + ': ' + c.value
		})
	}//end search_loaded_data



	/**
	 * _IS_COMPONENT
	 * Checks whether an instance is a data component (not section, tool, etc.).
	 * Uses the model name as primary signal since `type` may not always be set.
	 * @param object inst
	 * @return bool
	 */
	_is_component(inst) {

		if (!inst) return false
		// type property is authoritative when present
		if (inst.type === 'component') return true
		// fallback: model name convention
		const model = inst.model || ''
		return model.indexOf('component_') === 0
	}//end _is_component



	/**
	 * _GET_INSTANCES
	 * Returns all instances from the registry.
	 * Tries imported module first; if empty, falls back to window-level API
	 * to handle module singleton mismatches across bundles.
	 * @return array
	 */
	/**
	 * GET_ACTIVE_VALUE
	 * Returns the value string of the active component directly, for prompt injection.
	 * Truncated to 200 chars to keep the context line compact.
	 * @return string|null
	 */
	get_active_value() {

		const active = this.get_active_component()
		if (!active) return null
		const v = active.value
		if (typeof v !== 'string' || v.length <= 200) return v
		return v.substring(0, 200) + '[...]'
	}//end get_active_value



	/**
	 * GET_CONTEXT
	 * Returns a shallow copy of the internal context object.
	 * @return object
	 */
	get_context() {
		return Object.assign({}, this._context)
	}//end get_context



	/**
	 * GET_ACTIVE_SECTION
	 * Finds the topmost loaded section instance, preferring the one that
	 * matches the current `_context.section_tipo`. Mirrors the pattern used
	 * by `tool_propagate_component_data` (`section.rqo.sqo` is the source of
	 * truth for the user's current search).
	 * @return object|null section instance
	 */
	get_active_section() {

		const all = get_all_instances()
		const section_tipo = this._context.section_tipo

		// prefer exact match with active context
		if (section_tipo) {
			for (const inst of all) {
				if (!inst) continue
				if (inst.model !== 'section' && inst.model !== 'section_list') continue
				if (inst.section_tipo === section_tipo || inst.tipo === section_tipo) {
					return inst
				}
			}
		}

		// fallback: any section instance with a usable SQO
		for (const inst of all) {
			if (!inst) continue
			if (inst.model !== 'section' && inst.model !== 'section_list') continue
			if (inst.rqo && inst.rqo.sqo) return inst
		}

		return null
	}//end get_active_section



	/**
	 * GET_ACTIVE_SQO
	 * Returns a *clone* of the current section's SQO so callers can mutate
	 * pagination (limit/offset) without disturbing the user's UI state.
	 * Kept off the LLM-visible surface — only the bulk client tools touch it.
	 * @return object|null { section_tipo, sqo, total }
	 */
	get_active_sqo() {

		const section = this.get_active_section()
		if (!section || !section.rqo || !section.rqo.sqo) return null

		// Structured clone is available in all supported browsers; falls back
		// to JSON round-trip in case of unsupported types inside the SQO.
		let sqo_clone
		try {
			sqo_clone = structuredClone(section.rqo.sqo)
		} catch (e) {
			sqo_clone = JSON.parse(JSON.stringify(section.rqo.sqo))
		}

		return {
			section_tipo	: section.section_tipo || section.tipo,
			sqo				: sqo_clone,
			total			: typeof section.total === 'number' ? section.total : null
		}
	}//end get_active_sqo



	/**
	 * SUMMARIZE_SQO
	 * Builds a compact, human-readable description of the active search so
	 * the model can refer to "the current N records" without ever seeing raw
	 * tipos. Returns null when no section is active.
	 * @return string|null
	 */
	summarize_sqo() {

		const info = this.get_active_sqo()
		if (!info) return null

		const parts = []
		parts.push('section=' + info.section_tipo)
		if (info.total !== null) parts.push('total=' + info.total)

		const filter = info.sqo && info.sqo.filter
		if (filter && typeof filter === 'object') {
			// best-effort: count rules without exposing tipos
			const rules_count = this._count_sqo_rules(filter)
			if (rules_count > 0) parts.push('filter_rules=' + rules_count)
		}

		return parts.join(' | ')
	}//end summarize_sqo



	/**
	 * _COUNT_SQO_RULES
	 * Recursively counts leaf rules inside an SQO filter tree ($and/$or arrays
	 * of rules or nested groups). Best-effort, used only for the summary.
	 * @param object node
	 * @return number
	 */
	_count_sqo_rules(node) {

		if (!node || typeof node !== 'object') return 0
		let n = 0
		for (const key in node) {
			const value = node[key]
			if (Array.isArray(value)) {
				for (const item of value) {
					if (item && typeof item === 'object' && (item.$and || item.$or)) {
						n += this._count_sqo_rules(item)
					} else if (item && typeof item === 'object') {
						n += 1
					}
				}
			}
		}
		return n
	}//end _count_sqo_rules



	/**
	 * GET_ACTIVE_IMAGE_URL
	 * Resolves the public URL of an image in the currently loaded record by
	 * reading directly from a `component_image` / `component_av` instance.
	 * Does NOT hit the network — only inspects already-loaded `data.entries`.
	 *
	 * @param string component_tipo  Optional. Defaults to the active component
	 *	when it is a media model; otherwise the first media component in the
	 *	current record.
	 * @param string quality  Optional. Defaults to page_globals.dedalo_image_quality_default.
	 * @return object|null { url, tipo, label, model, extension, external_source }
	 */
	get_active_image_url(component_tipo, quality) {

		const all = get_all_instances()
		const { section_tipo, section_id } = this._context

		// candidate filter: media components in current record
		const is_media_model = function(m) {
			if (!m) return false
			return m.indexOf('component_image') === 0
				|| m.indexOf('component_av') === 0
		}

		// 1. explicit tipo
		let target = null
		if (component_tipo) {
			for (const inst of all) {
				if (!this._is_component(inst)) continue
				if (inst.tipo !== component_tipo) continue
				if (section_tipo && inst.section_tipo !== section_tipo) continue
				if (section_id !== null && section_id !== undefined && String(inst.section_id) !== String(section_id)) continue
				if (!is_media_model(inst.model)) return null
				target = inst
				break
			}
		}

		// 2. active component (if it's a media model)
		if (!target) {
			const active = this.get_active_component()
			if (active && is_media_model(active.model)) {
				for (const inst of all) {
					if (this._match_instance(inst, active.section_tipo, active.section_id, active.tipo)) {
						target = inst
						break
					}
				}
			}
		}

		// 3. first media component in current record
		if (!target && section_tipo && section_id !== null && section_id !== undefined) {
			for (const inst of all) {
				if (!this._is_component(inst)) continue
				if (!is_media_model(inst.model)) continue
				if (this._match_instance(inst, section_tipo, section_id, inst.tipo)) {
					target = inst
					break
				}
			}
		}

		if (!target) return null

		return this._resolve_media_url(target, quality)
	}//end get_active_image_url



	/**
	 * _RESOLVE_MEDIA_URL
	 * Extracts the public URL from a loaded media component instance.
	 * Mirrors the logic used by `view_default_edit_image.js` /
	 * `render_edit_component_image.js`.
	 * @param object inst
	 * @param string|null preferred_quality
	 * @return object|null
	 */
	_resolve_media_url(inst, preferred_quality) {

		const data				= inst.data || {}
		const entries			= Array.isArray(data.entries) ? data.entries : []
		const external_source	= data.external_source
			|| (entries[0] && entries[0].external_source)
			|| null
		const extension			= (inst.context && inst.context.features && inst.context.features.extension)
			|| (entries[0] && entries[0].extension)
			|| null
		const files_info		= (entries[0] && Array.isArray(entries[0].files_info))
			? entries[0].files_info
			: []

		// case 1: external source — return as-is
		if (external_source && typeof external_source === 'string' && external_source.length > 0) {
			return {
				url				: external_source,
				tipo			: inst.tipo,
				label			: inst.label || inst.tipo,
				model			: inst.model,
				extension		: extension,
				quality			: null,
				external_source	: true
			}
		}

		// case 2: dedalo media — pick the best file_info
		// preference order: requested quality → global default → component default → first available
		const default_quality = (typeof page_globals !== 'undefined' && page_globals.dedalo_image_quality_default)
			? page_globals.dedalo_image_quality_default
			: null
		const quality_candidates = [preferred_quality, inst.quality, default_quality, '1.5MB', 'original']
		let file_info = null
		for (const q of quality_candidates) {
			if (!q) continue
			file_info = files_info.find(function(el) {
				return el && el.file_exist === true && el.quality === q
					&& (!extension || el.extension === extension)
			})
			if (file_info) break
		}
		if (!file_info) {
			// last resort: any existing file
			file_info = files_info.find(function(el) { return el && el.file_exist === true })
		}
		if (!file_info) return null

		// DEDALO_MEDIA_URL is exposed as a global by Dédalo's page bootstrap
		const base = (typeof DEDALO_MEDIA_URL !== 'undefined' && DEDALO_MEDIA_URL)
			? DEDALO_MEDIA_URL
			: ''
		// Vision APIs require an absolute URL — prepend origin if relative
		const absolute_base = (base.startsWith('/'))
			? window.location.origin + base
			: base
		// Skip the cache-busting `?t=` suffix used by the UI — irrelevant for
		// vision endpoints, and some upstreams reject query strings.
		const url = absolute_base + file_info.file_path

		return {
			url				: url,
			tipo			: inst.tipo,
			label			: inst.label || inst.tipo,
			model			: inst.model,
			extension		: file_info.extension,
			quality			: file_info.quality,
			external_source	: false
		}
	}//end _resolve_media_url



}//end client_context class

// @license-end
