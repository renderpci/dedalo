// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import { ui } from '../../../core/common/js/ui.js'
	import { ai_assistant } from './ai_assistant.js'



/**
 * RENDER_TOOL_ASSISTANT
 * Opens the AI assistant in a modal chat panel.
 */
export const render_tool_assistant = function() {

	return true
}//end render_tool_assistant



/**
 * EDIT
 * Render tool main node using standard tool wrapper.
 * @param object options = {}
 * @return HTMLElement wrapper
 */
render_tool_assistant.prototype.edit = async function(options={}) {

	const self = this

	const render_level = options.render_level || 'full'

	// build chat UI content (returns content_data div)
		if (!self.assistant_instance) {
			self.assistant_instance = new ai_assistant({
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