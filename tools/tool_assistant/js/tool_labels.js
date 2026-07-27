// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label*/
/*eslint no-undef: "error"*/



/**
 * TOOL_LABELS
 * Shared label resolution for the tool_assistant ES modules.
 *
 * The chat modules (`chat_render`, `assistant_controller`) are plain modules with
 * no reference to the tool instance, so they cannot call `self.get_tool_label()`
 * directly. `set_label_resolver()` injects the instance once (from the
 * assistant_controller constructor) and `t()` then resolves through it.
 *
 * Resolution order:
 *   1. the tool's OWN labels (register.json `misc.dd1372`, served in
 *      `context.labels` for the active application lang) — where every
 *      tool_assistant string lives;
 *   2. the global `get_label` dictionary (src/core/labels/master.json) — for the
 *      handful of generic keys (`apply`, `cancel`, `copy`, …) that are shared
 *      vocabulary rather than tool-specific;
 *   3. the call-site English literal.
 */



/** @type {Object|null} The tool_assistant instance, once injected. */
let tool_instance = null



/**
 * SET_LABEL_RESOLVER
 * Register the tool instance whose `get_tool_label` resolves this tool's labels.
 * Called once, from the assistant_controller constructor.
 * @param {Object|null} instance - the tool_assistant instance (exposes get_tool_label)
 * @returns {void}
 */
export const set_label_resolver = function(instance) {

	tool_instance = instance || null
}//end set_label_resolver



/**
 * T
 * Localised label helper. Resolves `key` against the tool's own labels first,
 * then the global label dictionary, then returns `fallback`.
 *
 * `get_label` is declared via /*global*\/ so ESLint does not flag it as
 * undefined; it is injected into the page at render time and is not imported as
 * an ES module. Access is guarded by a typeof check so this module is safe to
 * import in environments where the global is absent.
 *
 * @param {string} key      - Label identifier (register.json label `name`).
 * @param {string} fallback - English default used when the key is not found.
 * @returns {string} Translated label or fallback.
 */
export const t = function(key, fallback) {

	if (tool_instance && typeof tool_instance.get_tool_label === 'function') {
		const value = tool_instance.get_tool_label(key)
		if (value) return value
	}

	if (typeof get_label !== 'undefined' && get_label && get_label[key]) {
		return get_label[key]
	}

	return fallback
}//end t



// @license-end
