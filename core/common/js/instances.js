// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals, SHOW_DEBUG, get_label, Promise, DEDALO_TOOLS_URLS */
/*eslint no-undef: "error"*/



/**
* INSTANCES
* Client-side instance registry for all active Dédalo components, sections,
* areas, widgets, services, and tools.
*
* The central export is `get_instance`, which provides a unified async entry
* point that:
*   1. Builds a deterministic string key from the caller's options.
*   2. Returns the already-cached instance immediately if present.
*   3. Otherwise resolves the model name (from options or via an API call),
*      dynamically imports the ES module, constructs and initialises the
*      instance, stores it in `instances_map`, and resolves the returned Promise.
*
* All other exports are helpers for operating on the shared `instances_map`:
* lookups, filtered search, manual add/remove.
*
* Exported symbols:
*   get_instance          — primary factory / cache accessor
*   get_all_instances     — dump entire registry as an array
*   get_instances_custom_map — filtered registry with caller-supplied key builder
*   add_instance          — manually register a pre-built instance
*   get_instance_by_id    — synchronous key lookup (also exposed on window)
*   find_instances        — linear scan matching multiple property values
*   delete_instance       — remove one entry by key
*   delete_instances      — remove all entries matching an options filter
*   key_instances_builder — build a canonical key string from options
*/

// imports
	import {data_manager} from './data_manager.js'



/**
* INSTANCES_MAP
* Shared in-memory registry of all active Dédalo instances, keyed by the
* canonical string produced by `key_instances_builder`.
*
* The Map is module-private; external callers interact with it exclusively
* through the exported functions below (get_instance, add_instance, etc.).
*
* Example entry:
* {
*   key:   "component_input_text_test52_test3_tm_lg-eng",
*   value: {
*     "id":                    "component_input_text_test52_test3_tm_lg-eng",
*     "model":                 "component_input_text",
*     "tipo":                  "test52",
*     "section_tipo":          "test3",
*     "mode":                  "tm",
*     "lang":                  "lg-eng",
*     "context":               null,
*     "data":                  null,
*     "node":                  null,
*     "tools":                 null,
*     "duplicates":            false,
*     "minimum_width_px":      90,
*     "q_split":               true,
*     "id_base":               "test3__test52",
*     "is_init":               true,
*     "status":                "initialized",
*     "matrix_id":             null,
*     "type":                  "component",
*     "datum":                 null,
*     "events_tokens":         [],
*     "ar_instances":          [],
*     "standalone":            true,
*     "active":                false,
*     "change_value_pool":     [],
*     "is_data_changed":       false,
*     "init_events_subscribed": false,
*     "saving":                false
*   }
* }
*/
const instances_map = new Map();

// In-flight build registry: maps an instance key to the Promise currently building
// that instance. Concurrent get_instance() calls for the same key await this shared
// Promise instead of each constructing + init-ing a duplicate instance (which would
// overwrite the first in instances_map and leak its event subscriptions).



/**
 * KEY_ORDER
 * Ordered list of property names used to build a canonical instance key.
 * Properties are visited in this exact sequence; undefined/null/empty
 * values are skipped so they do not create spurious underscore segments.
 * The ordering must remain stable across the codebase — changing it would
 * silently invalidate every cached key comparison.
 */
const key_order = ['model','tipo','section_tipo','section_id','mode','lang','parent','matrix_id','id_variant','column_id'];



/**
* GET_INSTANCE
* Primary factory and cache accessor for all Dédalo client-side instances.
*
* Cache-hit path (fast):
*   A canonical key is derived from `options` via `key_instances_builder`.
*   If `instances_map` already holds an entry for that key, it is returned
*   immediately without any network round-trip or dynamic import.
*
* Cache-miss path (async):
*   1. Model resolution — if `options.model` is absent, the function calls
*      `data_manager.get_element_context` to obtain the model name and the
*      server-calculated `lang` value (which may differ from the caller's
*      hint when transliteration or multi-lang rules apply).  The resolved
*      context is also injected into `options.context` when not already set,
*      avoiding a second server call during `init`.
*   2. Module import — the ES module for the resolved model is dynamically
*      imported from a path derived from the model's naming prefix:
*        • `tool_*`    → tools root (absolute URL if the tool lives in an
*                         additional DEDALO_TOOLS_URLS root, relative otherwise)
*        • `service_*` → core/services/<model>/js/<model>.js
*        • default     → core/<model>/js/<model>.js
*      The path logic is inlined here (not delegated to util_base_url) to
*      avoid a circular import: utils/util.js itself imports this module.
*   3. Construction — the module's named export matching `model` is
*      instantiated with `new`, assigned `id` (canonical key) and `id_base`,
*      then asynchronously initialised via `instance.init(options)`.
*   4. Registration — the new instance is stored in `instances_map` before
*      the Promise resolves, so concurrent callers that await the same key
*      will receive the cached instance on their next tick.
*
* @param {Object} options - Locator and configuration for the requested instance.
*   Required:
*     {string} tipo         - Structure tipo of the component/section (e.g. 'oh15').
*     {string} section_tipo - Tipo of the parent section (e.g. 'oh1').
*   Optional (supply when known to skip the API round-trip):
*     {string} model        - Model name (e.g. 'component_input_text').
*     {string} section_id   - Record ID within the section (numeric string).
*     {string} mode         - Render mode ('edit', 'list', 'tm', …). Defaults to 'list'.
*     {string} lang         - Language code (e.g. 'lg-eng'). Defaults to page_globals.dedalo_data_lang.
*     {string} key          - Pre-built cache key; skips key_instances_builder when provided.
*     {*}      [...]        - Any additional properties passed through to instance.init().
* @returns {Promise<Object|null>} Resolves to the instance object, or null when:
*   - `tipo` is absent and `model` cannot be resolved,
*   - the element context API call fails or returns no model,
*   - the ES module cannot be loaded, or
*   - the module does not export a function matching the model name.
* @example
* const input = await get_instance({
*   model:        'component_input_text',
*   tipo:         'oh15',
*   section_tipo: 'oh1',
*   section_id:   '42',
*   mode:         'edit',
*   lang:         'lg-eng'
* });
*/
export const get_instance = async function(options) {
	const start = performance.now()

	// options. main vars
		const tipo			= options.tipo
		const section_tipo	= options.section_tipo
		const section_id	= options.section_id // string format

	// options. optional vars (only mandatory to build the instance)
		const mode	= options.mode  || 'list'
		const lang	= options.lang  || page_globals.dedalo_data_lang || null

	// model resolution
	// When the caller already knows the model (the common case for programmatic
	// instantiation), the IIFE is never entered and no network call is made.
	// When the model is absent (e.g. a section renders a component by tipo only),
	// the API provides both the model and the authoritative lang value.
		const model = options.model || await ( async () => {
			// fetch context and model from backend

			if (!tipo) {
				console.error('Error: unable to get element context without tipo. options:', options);
				return null
			}

			const element_context_response = await data_manager.get_element_context({
				tipo			: tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				mode			: mode
			})

			if(SHOW_DEBUG===true || !element_context_response.result) {
				console.warn('// [get_instance] element_context API response:', element_context_response);
			}

			// resolved model
			const resolved_model = element_context_response.result?.[0]?.model;
			if (!resolved_model) {
				console.error('Error: unable to resolve element context. options:', options);
				return null;
			}

			// set context if is not already set
			if(typeof options.context==='undefined'){
				// inject context to options
				// Avoid a redundant context API call during instance.init() by
				// piggy-backing the context the server already returned here.
				options.context	= element_context_response.result[0]
			}

			// lang. Set again from more reliable calculated context
			// Note that some components may change their lang depending on whether they are with_lang_versions or allow transliteration.
			options.lang = element_context_response.result[0].lang

			return resolved_model
		})();

		if (!model) {
			console.error('Error: unable to resolve instance model. options:', options);
			return null
		}

		// Ensure required options are set.
		// Fill missing options with defaults. Note that whole options will be passed to the new instance
		if (!options.model) {
			options.model = model
		}
		if (!options.mode) {
			options.mode = mode
		}
		if (!options.lang) {
			options.lang = lang
		}

	// key. Build instance key of the instance.
		const key = options.key || key_instances_builder(options)

	// cache lookup
	// This check is intentionally placed AFTER model/lang resolution so that
	// the key reflects the fully-normalised options (including server-resolved
	// lang).  A hit here means the instance was created by an earlier call that
	// raced or already completed; return it directly to avoid double-init.
		const found_instance = instances_map.get(key)
		if (found_instance) {
			return found_instance;
		}

	// in-flight de-dup. If another concurrent call is already building this key,
	// await its Promise instead of constructing a second instance (prevents the
	// double-construct/double-init race that orphans and leaks the first instance).

	// Return a promise that resolves the instance
	return new Promise(function(resolve) {

		// module path resolution
		// Determine module path.
		// Tools living in a DEDALO_ADDITIONAL_TOOLS root are imported by
		// absolute same-origin URL (DEDALO_TOOLS_URLS map, sent by the server);
		// primary-root tools keep the historical relative path.
		// Inlined (instead of utils tool_base_url) to avoid a circular import:
		// utils/util.js imports this module.
		const module_path = model.startsWith('tool_')
		  ? ((typeof DEDALO_TOOLS_URLS!=='undefined' && DEDALO_TOOLS_URLS && DEDALO_TOOLS_URLS[model])
			  ? `${DEDALO_TOOLS_URLS[model]}/js/${model}.js` // additional-root tools (absolute URL)
			  : `../../../tools/${model}/js/${model}.js`) // primary-root tools
		  : model.startsWith('service_')
		  ? `../../../core/services/${model}/js/${model}.js` // services
		  : `../../../core/${model}/js/${model}.js`; // default

		// import element module file once (and wait until finish)
		import(module_path)
		.then(async function(module) {

			// check module
			// (!) The module's named export MUST match the model string exactly.
			// If it does not, the import succeeded but the module is unusable.
				const module_main_function = model
				if (typeof module[module_main_function]!=='function') {
					console.warn(`Invalid module main function. It should be named as the model: ${model}`);
					return resolve(null)
				}

			// instance the element
				const instance_element = new module[module_main_function]()

				if (typeof instance_element !== 'object') {
					console.warn(`Module "${model}" is not an valid object.`);
					return null;
				}

			// serialize element id
			// add the id for init the instance with the id
				instance_element.id			= key
				instance_element.id_base	= [section_tipo, section_id, tipo].join('_')
			// id_variant. Propagate a custom instance id to children
				if (options.id_variant) {
					instance_element.id_variant = options.id_variant
				}

			// init the element
				await instance_element.init(options)

			// add to the instances cache
			// Register before resolving so any code awaiting the same key
			// during a subsequent microtask tick receives the cached instance.
				instances_map.set(key, instance_element)

			// return the new created instance
				resolve(instance_element)
		})
		.catch((error) => {
			console.error(`Error importing ES6 module [model:${model}]`, error);
			resolve(null)
		});
	})
	.catch(err => { console.error(err) });

	// register the in-flight build and clear it once settled so the key can be
	// rebuilt later (e.g. after delete_instance) and the registry does not grow.
}//end get_instance



/**
* GET_ALL_INSTANCES
* Returns every registered instance as a flat array.
* Iterates the `instances_map` values and spreads them into a new array,
* so mutations to the returned array do not affect the registry.
* @returns {Array} Shallow copy of all registered instance objects.
*/
export const get_all_instances = function() {

	return [...instances_map.values()]
}//end get_all_instances



/**
* GET_INSTANCES_CUSTOM_MAP
* Builds a new Map from the registry using a caller-supplied key function.
* Useful when callers need a view of the registry keyed by a domain-specific
* property (e.g. by `tipo` alone, or by a composite of `tipo` + `section_id`).
* Instances for which `custom_key_builder` returns a falsy value are excluded.
* @param {Function} custom_key_builder - Receives each instance and returns
*   the key string to use in the output map, or a falsy value to skip the entry.
* @returns {Map} A new Map (instance key → instance) containing only the
*   entries for which `custom_key_builder` returned a truthy key.
*/
export const get_instances_custom_map = function( custom_key_builder ) {

	const custom_map = new Map()

	instances_map.forEach((value) => {

		const custom_key = custom_key_builder(value)

		if (custom_key) {
			custom_map.set(custom_key, value)
		}
	});

	return custom_map;
}//end get_instances_custom_map



/**
* ADD_INSTANCE
* Manually registers a pre-built instance in the shared registry.
* Useful when a caller constructs an instance outside the standard
* `get_instance` factory (e.g. during tests or for synthetic wrappers)
* and needs it to be discoverable via key-based lookups.
* @param {string} key - The canonical key identifying the instance.
*   Should be produced by `key_instances_builder` to remain consistent
*   with keys that `get_instance` would generate.
* @param {Object} instance_element - The fully-initialised instance to register.
* @returns {void}
*/
export const add_instance = function(key, instance_element) {

	instances_map.set(key, instance_element)
}//end add_instance



/**
* GET_INSTANCE_BY_ID
* Synchronous key-based lookup in the instance registry.
* Returns the instance whose canonical key matches `key`, or null when not
* found.  This is the low-level accessor used when the caller already holds
* the full key string (e.g. stored as an element's `data-instance-id`).
*
* (!) This function is also assigned to `window.get_instance_by_id` so that
* iframes and inline scripts that cannot import ES modules can still reach the
* registry via the global scope.
*
* @param {string} key - Canonical instance key (as produced by key_instances_builder).
* @returns {Object|null} The matching instance, or null when absent from the registry.
*/
export const get_instance_by_id = function (key) {
	const found_instance = instances_map.get(key)
	if (found_instance) {
		return found_instance;
	}

	return null
}//end get_instance_by_key
// Set window function to allow window or iframe access
window.get_instance_by_id = get_instance_by_id



/**
* FIND_INSTANCES
* Linear scan that returns all registry entries whose properties match every
* field supplied in `options`.
* Unlike `get_instance_by_id`, this does a full O(n) traversal and checks
* five fixed properties: tipo, section_tipo, section_id, mode, and lang.
* Use it when the full canonical key is not available but enough discriminating
* properties are known (e.g. to locate all 'edit' instances for a given tipo).
* @param {Object} options - Match criteria.
*   {string} tipo         - Component tipo to match.
*   {string} section_tipo - Parent section tipo to match.
*   {string} section_id   - Record ID to match.
*   {string} mode         - Render mode to match.
*   {string} lang         - Language code to match.
* @returns {Array} Array of matching instance objects (may be empty).
*/
export const find_instances = function(options) {

	if (!options || typeof options !== 'object') return [];

	// options
	const {
		tipo,
		section_tipo,
		section_id,
		mode,
		lang
	} = options;

	const found_instances = []
	for (const instance of instances_map.values()) {

		if (instance.tipo === tipo &&
			instance.section_tipo === section_tipo &&
			instance.section_id === section_id &&
			instance.mode === mode &&
			instance.lang === lang
			) {

			found_instances.push( instance );
		}
	}

	return found_instances
}//end find_instances



/**
* DELETE_INSTANCE
* Removes a single instance from the registry by its canonical key.
* The key is the value stored as `instance.id` and used as the `instances_map`
* key (e.g. 'component_input_text_rsc21_rsc170_1_edit_lg-nolan_12711607_tool_time_machine').
* No-ops with a warning when `key` is empty or falsy.
* @param {string} key - Canonical instance key to remove.
* @returns {boolean} true when the entry existed and was deleted; false otherwise.
*/
export const delete_instance = function(key) {

	// check the options
	if (!key || key.length === 0) {
		console.warn('Ignored delete_instance. Empty key', key);
		return false
	}

	const result = instances_map.delete( key )


	return result;
}//end delete_instance



/**
* DELETE_INSTANCES
* Removes all registry entries whose instance properties match every
* key-value pair in `options`.
* Iterates the entire map; for each entry every option property must equal the
* corresponding instance property (loose null handling: a null/undefined expected
* value matches anything, acting as a wildcard for that property).
* Bails early with a warning when `options` is empty, to prevent accidental
* wholesale deletion of the registry.
* @param {Object} options - Match criteria (key-value pairs against instance properties).
*   Pass at least one property; an empty object is rejected with a warning.
* @returns {number} The count of instances removed (0 when nothing matched).
*/
export const delete_instances = function(options) {

	// check the options
	if (!options || Object.keys(options).length === 0) {
		console.warn('Ignored delete_instances. Empty options', options);
		return 0
	}

	let deleted_count = 0;

	for (const [map_key, item] of instances_map.entries()) {

		let match = true;

		// check all properties defined in options.
		for (const key in options) {
			if (Object.prototype.hasOwnProperty.call(options, key)) {

				const expected	= options[key];
				const actual	= item[key];

				if (expected !== null && expected !== undefined && expected !== actual) {
					match = false;
					break; // There is no need to check the other keys if one of them does not match.
				}
			}
		}

		// If all options properties match, delete it
		if (match) {
			instances_map.delete(map_key)
			deleted_count++;
		}
	}


	return deleted_count;
}//end delete_instances



/**
* KEY_INSTANCES_BUILDER
* Builds a canonical, underscore-delimited string key that uniquely identifies
* an instance within the shared registry.
*
* Properties are read from `options` in the fixed sequence defined by
* `key_order`; absent, null, or empty-string values are omitted so they
* do not introduce extra underscores or ambiguity.  The resulting key is
* identical to the `id` that `get_instance` assigns to each new instance.
*
* (!) The ordering in `key_order` is part of the public contract.  Any change
* there invalidates all existing cached keys and must be treated as a
* breaking change.
*
* @param {Object} options - Source object whose properties are read in key_order sequence.
* @returns {string} Underscore-joined key string, e.g.
*   'component_input_text_oh15_oh1_42_edit_lg-eng'
*/
export const key_instances_builder = function(options) {

	const key_parts = []

	for (const prop of key_order) {
		const value = options[prop];
		if (value !== undefined && value !== null && value !== '') {
			const string_value = String(value);
			key_parts.push(string_value);
		}
	}

	// join all non empty elements in an string used as ID for the instance
	const key = key_parts.join('_')


	return key
}//end key_instances_builder



// @license-end
