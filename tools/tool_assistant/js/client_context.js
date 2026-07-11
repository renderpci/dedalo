// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, DEDALO_MEDIA_URL, structuredClone*/
/*eslint no-undef: "error"*/



// import
	import { event_manager } from '../../../core/common/js/event_manager.js'
	import { get_all_instances } from '../../../core/common/js/instances.js'



/**
 * CLIENT_CONTEXT
 * Zero-network context layer for the AI assistant tool.
 *
 * Tracks the user's active section, record, and focused component entirely
 * in the browser by subscribing to Dédalo's standard lifecycle events
 * (activate_component, render_instance, user_navigation) and by reading
 * directly from the instances registry populated by get_all_instances().
 *
 * No HTTP requests are ever made by this class.  All data is already present
 * in the browser because Dédalo renders the full record client-side before
 * the assistant UI opens.
 *
 * Public API used by client_tools.js and model_engine.js:
 *   get_context()            — raw context snapshot
 *   get_context_summary()    — formatted multi-line string for the system prompt
 *   get_active_component()   — summary of the focused component
 *   get_active_value()       — truncated value string, safe for prompt injection
 *   get_section_components() — every component in the current record
 *   get_component_value()    — value of a specific component tipo
 *   search_loaded_data()     — text search across loaded field values
 *   get_active_image_url()   — public URL for the current media component
 *   get_active_sqo()         — cloned SQO for bulk browsing tools
 *   summarize_sqo()          — human-readable SQO summary for prompt injection
 *   update_from_events()     — start event subscriptions (call once on init)
 *   destroy()                — unsubscribe all events (call on teardown)
 *
 * Data shape for component summaries:
 *   { tipo, label, model, value, lang, mode, section_tipo, section_id }
 */
export const client_context = class client_context {



	/**
	 * CLIENT_CONTEXT (constructor)
	 * Initialises the internal context object with null sentinels and an empty
	 * token array.  Call update_from_events() immediately after construction to
	 * start receiving live context updates.
	 *
	 * Internal state:
	 *   _context         — tracks the last known section/record/component triple.
	 *                      Fields are deliberately kept nullable so callers can
	 *                      distinguish "not yet seen" from "explicitly cleared".
	 *   _event_tokens    — handles returned by event_manager.subscribe(); stored
	 *                      here so destroy() can unsubscribe cleanly.
	 */
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
	 * section, record, and active component without polling.
	 *
	 * Three events are handled:
	 *   activate_component — fired when the user clicks/focuses a component field.
	 *                        Updates the full context triple (section + component).
	 *   render_instance    — fired after a section or area_section finishes
	 *                        rendering.  Only updates section_tipo / section_id /
	 *                        mode; component fields are intentionally left intact
	 *                        so the last-focused component is still addressable.
	 *   user_navigation    — fired on section-level navigation (back/forward,
	 *                        list click).  Resets all component fields because
	 *                        the previously focused component no longer belongs
	 *                        to the new record.
	 *
	 * Tokens from event_manager.subscribe() are pushed into _event_tokens and
	 * released by destroy().  Safe to call multiple times only if destroy() is
	 * called between invocations; otherwise subscriptions accumulate.
	 *
	 * @returns {void}
	 */
	update_from_events() {

		this._event_tokens.push(
			event_manager.subscribe('activate_component', (data) => {
				if (data && data.tipo) {
					this._context.component_tipo	= data.tipo
					this._context.component_label	= data.label || data.tipo
					this._context.component_model	= data.model || null
					// Preserve existing section context if the event omits it —
					// some activations fire before the section render completes.
					this._context.section_tipo		= data.section_tipo || this._context.section_tipo
					this._context.section_id		= data.section_id || this._context.section_id
					this._context.mode				= data.mode || this._context.mode
					this._context.lang				= data.lang || this._context.lang
				}
			})
		)

		this._event_tokens.push(
			event_manager.subscribe('render_instance', (data) => {
				// Only act on top-level section renders, not nested portal renders.
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
					// Navigation lands on a different record — clear component
					// context so stale tipo references don't bleed across records.
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



	/**
	 * DESTROY
	 * Unsubscribes all event_manager tokens registered by update_from_events()
	 * and clears the token array.  Must be called when the assistant tool is
	 * unmounted to prevent subscription leaks.
	 *
	 * @returns {void}
	 */
	destroy() {
		for (const token of this._event_tokens) {
			event_manager.unsubscribe(token)
		}
		this._event_tokens = []
	}//end destroy



	/**
	 * _MATCH_INSTANCE
	 * Returns true when an instance belongs to the given section record and,
	 * optionally, has the exact tipo requested.
	 *
	 * Matching rules:
	 *   - The instance must pass _is_component() (non-section, non-tool models).
	 *   - section_tipo is compared as strict string equality.
	 *   - section_id is coerced to string before comparison so that numeric IDs
	 *     from the event payload (e.g. 42) match the string stored on the
	 *     instance (e.g. "42").
	 *   - When tipo is provided, the instance must also have that exact tipo.
	 *
	 * @param {Object} inst - an entry from get_all_instances()
	 * @param {string} section_tipo - ontology tipo of the owning section
	 * @param {string|number} section_id - record identifier
	 * @param {string} [tipo] - optional component tipo filter
	 * @returns {boolean} true if the instance matches all supplied criteria
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
	 * Returns a summary of the currently focused component in the active record.
	 *
	 * Two-stage lookup:
	 *   1. Exact match — uses section_tipo + section_id + component_tipo from
	 *      _context.  This is the fast path for normal usage where the user has
	 *      explicitly focused a field.
	 *   2. Tipo-only fallback — when section context is missing (assistant opened
	 *      before the first section render), searches the full instance registry
	 *      for any instance with the right tipo and captures its section from the
	 *      result, updating _context in place so subsequent calls use the fast path.
	 *
	 * @returns {Object|null} component summary { tipo, label, model, value,
	 *   lang, mode, section_tipo, section_id }, or null if no component is active
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
				// Adopt section context from this instance so future calls are exact.
				this._context.section_tipo	= inst.section_tipo
				this._context.section_id	= inst.section_id
				return this._to_component_summary(inst)
			}
		}

		return null
	}//end get_active_component



	/**
	 * GET_SECTION_COMPONENTS
	 * Returns a deduplicated list of component summaries for every component
	 * currently loaded in the active record.
	 *
	 * Two-stage strategy mirrors get_active_component():
	 *   1. Exact match — uses section_tipo + section_id from _context.
	 *   2. Derived section — calls get_active_component() to recover the section
	 *      coordinates from the instance registry, then retries the filter.
	 *
	 * Intentionally returns [] rather than falling back to a site-wide scan:
	 * including components from an unrelated record would silently corrupt the
	 * context injected into the system prompt and tool results.
	 *
	 * @returns {Array} array of component summary objects (may be empty)
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
	 * Low-level helper: iterates the full instance registry, keeps only instances
	 * that belong to the given section record, deduplicates by tipo (taking the
	 * first occurrence), and returns a summary array.
	 *
	 * Deduplication is necessary because Dédalo can render the same component
	 * tipo multiple times (e.g. once in edit and once in a preview portal).  The
	 * first occurrence is preferred because it is typically the primary edit view.
	 *
	 * @param {string} section_tipo - ontology tipo of the owning section
	 * @param {string|number} section_id - record identifier
	 * @returns {Array} array of component summary objects, deduplicated by tipo
	 */
	_filter_components(section_tipo, section_id) {

		const all		= get_all_instances()
		const results	= []
		const seen		= new Set()

		for (const inst of all) {
			if (!this._match_instance(inst, section_tipo, section_id)) continue
			// Skip duplicates — first occurrence wins.
			if (seen.has(inst.tipo)) continue
			seen.add(inst.tipo)
			results.push(this._to_component_summary(inst))
		}

		return results
	}//end _filter_components



	/**
	 * _TO_COMPONENT_SUMMARY
	 * Converts a raw instance from the registry into the portable summary shape
	 * used by all public accessors.
	 *
	 * The `value` field is produced by get_value_string(), which extracts a
	 * human-readable representation from `instance.data.entries` without making
	 * any network calls.  The summary intentionally omits internal instance state
	 * (DOM refs, event listeners, etc.).
	 *
	 * @param {Object} inst - a component instance from the instances registry
	 * @returns {Object} summary { tipo, label, model, value, lang, mode,
	 *   section_tipo, section_id }
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
	 * Returns the display string for a single component identified by its
	 * ontology tipo.
	 *
	 * Lookup strategy matches get_active_component():
	 *   1. Exact section + tipo match within current _context.
	 *   2. Tipo-only fallback for when section context is unavailable.
	 *   When lang is supplied, instances whose lang does not match are skipped
	 *   in both stages, so a language-specific miss in stage 1 does NOT
	 *   automatically retry stage 2 without the lang guard.
	 *
	 * @param {string} tipo - ontology tipo of the component to read
	 * @param {string} [lang] - optional language code (e.g. 'lg-eng'); omit to
	 *   accept any language
	 * @returns {string|null} human-readable value string, or null if not found
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
	 *
	 * Model dispatch table (matched via indexOf on the model name string):
	 *   input_text / text_area   — returns the raw string; strips HTML tags for
	 *                              text_area (rich-text storage uses inline HTML).
	 *                              FULL value is returned — no truncation here.
	 *                              Callers that inject into the system prompt
	 *                              (get_context_summary, get_active_value) truncate
	 *                              independently.
	 *   select / portal /
	 *   relation_* / inverse /
	 *   children / parent /
	 *   index / related          — locator-based models; returns a bracket list of
	 *                              "section_tipo#section_id" references because
	 *                              resolved labels are not stored client-side.
	 *   json                     — JSON-serialised; capped at 5 000 chars because
	 *                              raw JSON blobs can be megabytes.
	 *   date                     — entry.value as string.
	 *   geolocation              — "lat, lng" pair (accepts both lat/latitude and
	 *                              lng/longitude property names).
	 *   check_box / radio_button — raw boolean/string value.
	 *   email / publication      — raw string.
	 *   password                 — always masked as '********'; never exposes the
	 *                              stored hash or plaintext.
	 *   (fallback)               — entry.value if present, else JSON of the entry;
	 *                              handles unknown/future model names gracefully.
	 *
	 * No server calls — reads only from the already-loaded browser data.
	 * Returns '(empty)' rather than null so callers can always concatenate safely.
	 *
	 * @param {Object} instance - component instance from the registry
	 * @returns {string} human-readable value, never null
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
	 * Builds a formatted multi-line string for the AI system prompt and tool
	 * return values that describes the current browser context.
	 *
	 * Output structure:
	 *   Line 1 \u2014 "Context: Section: <tipo> | Record: <id> | Component: <tipo> (<label>)"
	 *   Line 2 \u2014 "Active component \u2014 <label>: "<value truncated to 200 chars>""
	 *   Blank line
	 *   "Loaded data in record #<id> (<N> fields):"
	 *     "  <label>: <value truncated to 150 chars>"   (up to MAX_VISIBLE=20)
	 *     "  (<N> more fields\u2026)"                        (when truncated)
	 *
	 * When get_section_components() returns no results, falls back to listing
	 * the active component alone via get_active_component() (tipo-only lookup).
	 * A loading hint is appended if even that returns nothing.
	 *
	 * Value truncation (_short helper) is intentionally applied here \u2014 not in
	 * get_value_string() \u2014 so raw-value callers still get the full content.
	 *
	 * @returns {string|null} formatted context block, or null when _context
	 *   holds no data at all (assistant opened before any section renders)
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

			// (!) hidden field count may be negative when the active component
			// occupies the MAX_VISIBLE slot: the subtraction here can produce a
			// negative number.  The guard (hidden > 0) prevents the surplus line
			// from appearing, but the count itself may be inaccurate when both
			// an activeLbl and many fields are present.
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
	 * Case-insensitive substring search across the label and value fields of
	 * every component in the current record.
	 *
	 * Uses get_section_components() internally, so the same two-stage lookup
	 * and deduplication rules apply.  Returns an empty array when no context is
	 * available or when no component matches the query.
	 *
	 * @param {string} query - search term (case-insensitive)
	 * @returns {Array} matching lines as "label: value" strings
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
	 * Returns true when the given instance represents a data-entry component
	 * (as opposed to a section, area, portal shell, or tool instance).
	 *
	 * Two-tier heuristic (in priority order):
	 *   1. inst.type === 'component' — authoritative when the instance
	 *      explicitly sets the type property.
	 *   2. inst.model.startsWith('component_') — convention-based fallback;
	 *      Dédalo component models are always prefixed 'component_'.
	 *
	 * Both heuristics are necessary because older instances may not have the
	 * type property set even though they are genuine components.
	 *
	 * @param {Object} inst - an entry from get_all_instances()
	 * @returns {boolean} true if the instance is a data component
	 */
	_is_component(inst) {

		if (!inst) return false
		// type property is authoritative when present
		if (inst.type === 'component') return true
		// fallback: model name convention
		const model = inst.model || ''
		return model.indexOf('component_') === 0
	}//end _is_component



	// (!) Orphaned doc-block: the _GET_INSTANCES method it described was removed
	// from the class but this doc-block was not cleaned up.  Do NOT remove it
	// here — removal is a separate explicit decision.
	/**
	 * _GET_INSTANCES
	 * Returns all instances from the registry.
	 * Tries imported module first; if empty, falls back to window-level API
	 * to handle module singleton mismatches across bundles.
	 * @returns {Array}
	 */
	/**
	 * GET_ACTIVE_VALUE
	 * Returns the display value of the currently focused component, truncated
	 * to 200 characters for safe injection into a single prompt line.
	 *
	 * Delegates to get_active_component() and returns its pre-computed value
	 * string.  The 200-char cap mirrors the inline truncation applied to the
	 * active-component line in get_context_summary().  Full-length values are
	 * always available via get_component_value() or get_value_string().
	 *
	 * @returns {string|null} truncated value string, or null if no component active
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
	 * Returns a shallow copy of the internal _context object.
	 *
	 * The copy prevents callers from mutating _context directly.  Note that
	 * Object.assign() is a shallow clone: nested objects (if any were stored
	 * in _context fields) would still be shared.  In practice all _context
	 * values are primitives (strings/null), so the shallow copy is safe.
	 *
	 * @returns {Object} copy of { section_tipo, section_id, component_tipo,
	 *   component_label, component_model, mode, lang }
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
	 *
	 * Two-stage lookup:
	 *   1. Exact match — iterates instances looking for model 'section' or
	 *      'section_list' whose section_tipo or tipo matches _context.section_tipo.
	 *   2. Any-section fallback — returns the first section instance that has a
	 *      usable rqo.sqo, regardless of tipo.  Used when _context has no
	 *      section_tipo yet (e.g. assistant opened before navigation fires).
	 *
	 * @returns {Object|null} the matching section instance, or null if no
	 *   section is currently loaded
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
	 * Returns a deep clone of the active section's Search Query Object (SQO)
	 * together with the section tipo and the current result total.
	 *
	 * The clone is mandatory — bulk browsing tools mutate limit/offset for
	 * pagination and must not disturb the live UI state stored on the section
	 * instance.  structuredClone() is preferred; JSON round-trip is the
	 * fallback for environments that do not support it or for SQO payloads
	 * that contain non-cloneable types (e.g. Blob, Function).
	 *
	 * This method is kept off the LLM-visible surface (not exposed as a client
	 * tool schema); only the bulk client tools in client_tools.js call it.
	 *
	 * @returns {Object|null} { section_tipo, sqo, total } where sqo is a
	 *   mutable clone, or null if no section with an SQO is currently active
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
	 *
	 * Output format (pipe-separated):
	 *   "section=<tipo> | total=<N> | filter_rules=<count>"
	 * Fields are omitted when their data is unavailable (e.g. total=null).
	 * The filter_rules count is produced by _count_sqo_rules() — it represents
	 * the number of leaf rule objects in the filter tree, not the depth.
	 *
	 * @returns {string|null} compact SQO description, or null if no active section
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
	 * Recursively counts leaf rule objects inside an SQO filter tree.
	 *
	 * SQO filter structure: { $and: [ rule|group, … ] } or { $or: [ … ] }
	 * where a group is itself a { $and|$or: […] } node and a rule is any
	 * plain object that is NOT a group (does not have $and/$or keys).
	 *
	 * The count is best-effort — used only for the summarize_sqo() output.
	 * It does not validate rule shapes or detect malformed trees.
	 *
	 * @param {Object} node - an SQO filter node (root or recursive sub-node)
	 * @returns {number} total number of leaf rule objects in the tree
	 */
	_count_sqo_rules(node) {

		if (!node || typeof node !== 'object') return 0
		let n = 0
		for (const key in node) {
			const value = node[key]
			if (Array.isArray(value)) {
				for (const item of value) {
					if (item && typeof item === 'object' && (item.$and || item.$or)) {
						// nested group — recurse
						n += this._count_sqo_rules(item)
					} else if (item && typeof item === 'object') {
						// leaf rule
						n += 1
					}
				}
			}
		}
		return n
	}//end _count_sqo_rules



	/**
	 * GET_ACTIVE_IMAGE_URL
	 * Resolves the public URL of an image or AV media file in the currently
	 * loaded record by reading from a component_image or component_av instance.
	 *
	 * Three-stage candidate selection:
	 *   1. Explicit component_tipo — locates the named component; returns null
	 *      immediately if that instance is not a media model (prevents silently
	 *      falling through to a different component).
	 *   2. Active component — if the focused component is a media model, its
	 *      instance is used.
	 *   3. First media component in the current record — scans the instance
	 *      registry for the first component_image / component_av that belongs
	 *      to section_tipo + section_id.
	 *
	 * Does NOT hit the network — only inspects already-loaded data.entries.
	 * URL construction is delegated to _resolve_media_url().
	 *
	 * @param {string} [component_tipo] - optional; defaults to the active or
	 *   first media component in the record
	 * @param {string} [quality] - optional quality key (e.g. '1.5MB', 'original');
	 *   defaults to page_globals.dedalo_image_quality_default
	 * @returns {Object|null} { url, tipo, label, model, extension, quality,
	 *   external_source } or null if no media is found
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
				// (!) Returns null (not continues) here: if the caller asked for a
				// specific tipo that turns out to not be a media model, bail out
				// rather than silently switching to a different component.
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
	 *
	 * Two cases:
	 *   external_source — the entry carries a ready-made URL (e.g. YouTube,
	 *     Wikimedia).  Returned as-is with external_source: true.
	 *   Dédalo media   — selects the best files_info entry by quality, then
	 *     constructs an absolute URL from DEDALO_MEDIA_URL + file_path.
	 *     Quality preference: requested → inst.quality → global default →
	 *     '1.5MB' → 'original' → any file_exist entry.
	 *
	 * The cache-busting `?t=` suffix used by the UI is intentionally omitted
	 * because vision API endpoints may reject query strings, and the file
	 * content is stable within a session.
	 *
	 * DEDALO_MEDIA_URL is declared as a /*global* / and injected by Dédalo's
	 * page bootstrap.  When it starts with '/' the origin is prepended to
	 * produce an absolute URL required by vision APIs.
	 *
	 * @param {Object} inst - a component_image or component_av instance
	 * @param {string|null} preferred_quality - caller-requested quality key
	 * @returns {Object|null} { url, tipo, label, model, extension, quality,
	 *   external_source } or null if no usable file_info is found
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
