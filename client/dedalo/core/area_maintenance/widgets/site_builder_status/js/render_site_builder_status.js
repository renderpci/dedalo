// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'



/**
* RENDER_SITE_BUILDER_STATUS
* Render layer for the site_builder_status maintenance widget: a small status panel plus
* the "Open site builder" launcher. Mirrors render_publication_api (build the content_data,
* wrap it with ui.widget.build_wrapper_edit); the launcher mirrors that widget's
* "Open Swagger UI" button but opens the workspace tool instead of a URL.
*
* @module render_site_builder_status
*/
export const render_site_builder_status = function() {

	return true
}//end render_site_builder_status



/**
* LIST
* Build the widget wrapper. edit and list are identical (display-only widget).
*
* @param {Object} options {render_level}
* @returns {Promise<HTMLElement>}
*/
render_site_builder_status.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	const content_data = await get_content_data(self)
	if (render_level==='content') {
		return content_data
	}

	const wrapper = ui.widget.build_wrapper_edit(self, {
		content_data : content_data
	})
	wrapper.content_data = content_data

	return wrapper
}//end list



/**
* GET_CONTENT_DATA
* Builds the status panel and the launcher button.
*
* @param {Object} self
* @returns {Promise<HTMLElement>}
*/
const get_content_data = async function(self) {

	const value			= self.value || {}
	const configured	= value.configured === true
	const reachable		= value.reachable === true
	const drivers		= Array.isArray(value.drivers) ? value.drivers : []
	const last_publishes= Array.isArray(value.last_publishes) ? value.last_publishes : []

	const content_data = ui.create_dom_element({
		element_type : 'div',
		class_name   : 'content_data site_builder_status_widget'
	})

	// status line
		const status_text = !configured
			? 'Not configured on this server.'
			: (reachable ? ('Reachable' + (value.url_host ? ' — ' + value.url_host : '')) : 'Configured, but not reachable right now.')
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'sb_status_line ' + (reachable ? 'ok' : 'warn'),
			inner_html		: status_text,
			parent			: content_data
		})

	// available drivers
		if (reachable && drivers.length > 0) {
			const available = drivers
				.filter(d => d && d.available)
				.map(d => d.id + (d.version ? ' (' + d.version + ')' : ''))
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'sb_drivers',
				inner_html		: 'Agents: ' + (available.length ? available.join(', ') : 'none available'),
				parent			: content_data
			})
		}

	// open site builder launcher
	// Opens the workspace in its own window via the framework's open_tool (which resolves
	// the registered tool context and honours register.json open_as:'window'). Enabled only
	// when the daemon is reachable; otherwise there is nothing to open.
		const button_open = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light',
			inner_html		: get_label.open_site_builder || 'Open site builder',
			parent			: content_data
		})
		if (!reachable) {
			button_open.disabled = true
		} else {
			const click_handler = async (e) => {
				e.stopPropagation()
				button_open.classList.add('button_spinner')
				try {
					// Dynamic import: only pull tool_common in when the admin actually launches.
					const { open_tool } = await import('../../../../tools_common/js/tool_common.js')
					await open_tool({ tool_context : 'tool_sitebuilder', open_as : 'window' })
				} catch (err) {
					console.error('[site_builder_status] open failed', err)
				} finally {
					button_open.classList.remove('button_spinner')
				}
			}
			button_open.addEventListener('click', click_handler)
		}

	// recent publishes
		if (reachable && last_publishes.length > 0) {
			const list = ui.create_dom_element({
				element_type	: 'ul',
				class_name		: 'sb_publishes',
				parent			: content_data
			})
			for (let i = 0; i < last_publishes.length; i++) {
				const row = last_publishes[i] || {}
				const who = (row.actor && row.actor.username) ? row.actor.username : '?'
				const when = row.ts ? row.ts.replace('T', ' ').slice(0, 19) : ''
				ui.create_dom_element({
					element_type	: 'li',
					inner_html		: (row.site || '?') + ' — ' + who + ' — ' + when,
					parent			: list
				})
			}
		}

	return content_data
}//end get_content_data


// @license-end
