// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
 * RENDER_TOOL_ASSISTANT
 * Client-side render module for tool_assistant.
 *
 * Provides the `edit` view for the AI assistant tool: it creates or reuses a
 * single `assistant_controller` instance, delegates DOM construction to that instance's
 * `build_chat_ui()`, and wraps the result in the standard tool scaffold supplied
 * by `ui.tool.build_wrapper_edit`.
 *
 * Lifecycle (called by tool_assistant.prototype.edit via prototype delegation):
 *   1. `tool_assistant.build()` populates `self.assistant_config` from the
 *      dd1633 component value (model list, engine list, active model defaults).
 *   2. `render_tool_assistant.prototype.edit` is invoked by `tool_common.render`.
 *   3. A single `ai_assistant` instance is created lazily on `self` and kept for
 *      the lifetime of the tool mount so conversation state is preserved across
 *      UI re-renders.
 *   4. `build_chat_ui()` performs the async boot sequence (thread restore +
 *      agent_models capabilities) and returns a `content_data` DOM element.
 *   5. When `render_level === 'content'` the raw `content_data` element is
 *      returned (e.g. for modal body injection); otherwise the full tool wrapper
 *      including header is returned.
 *
 * Exports: `render_tool_assistant` constructor (mixed into tool_assistant via
 * prototype delegation — see tool_assistant.js).
 *
 * Dependencies: ui (common/js/ui.js), assistant_controller (./assistant_controller.js).
 */

// import
	import { ui } from '../../../core/common/js/ui.js'
	import { assistant_controller } from './assistant_controller.js'



/**
 * RENDER_TOOL_ASSISTANT
 * Constructor function used solely as a prototype carrier for the `edit` method.
 * No instance state is initialised here; all state lives on the `tool_assistant`
 * instance that inherits this prototype (see tool_assistant.prototype.edit).
 * @returns {boolean} Always true (Dédalo constructor convention).
 */
export const render_tool_assistant = function() {

	return true
}//end render_tool_assistant



/**
 * EDIT
 * Builds and returns the AI assistant tool DOM tree.
 *
 * Called by `tool_common.prototype.render` with `mode === 'edit'`. The method
 * is mixed into `tool_assistant` via prototype delegation, so `this` / `self`
 * refers to the live `tool_assistant` instance with `self.assistant_config`
 * already populated by `tool_assistant.prototype.build`.
 *
 * The controller instance is created once and cached on `self.assistant_instance`
 * so that reloading the tool panel does not tear down an in-progress conversation.
 *
 * `render_level` values:
 *   - `'full'` (default): returns the complete tool wrapper node (header + body).
 *   - `'content'`: returns only the inner `content_data` element — used when
 *     the caller (e.g. a modal) injects the body directly without the wrapper.
 *
 * @param {Object} [options={}] - Render options forwarded by tool_common.
 * @param {string} [options.render_level='full'] - Controls what DOM depth is returned.
 * @returns {Promise<HTMLElement>} The wrapper element (full) or content_data element (content).
 */
render_tool_assistant.prototype.edit = async function(options={}) {

	const self = this

	const render_level = options.render_level || 'full'

	// build chat UI content (returns content_data div)
		if (!self.assistant_instance) {
			// Lazy-create: keep a single controller alive across re-renders so
			// the conversation and capabilities are preserved.
			self.assistant_instance = new assistant_controller({
				tool_config	: self.assistant_config || {},
				tool_self	: self
			})
		}

		const content_data = await self.assistant_instance.build_chat_ui()

		if (render_level === 'content') {
			return content_data
		}

	// wrapper. ui.tool.build_wrapper_edit returns tool wrapper with header
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})

	return wrapper
}//end edit
