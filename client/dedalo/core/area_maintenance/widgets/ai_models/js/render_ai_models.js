// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {dd_request_idle_callback} from '../../../../common/js/events.js'



/**
* RENDER_AI_MODELS
* Client-side view layer for the ai_models area_maintenance widget.
*
* It answers one question without opening a record: can this install transcribe
* at all? A store readout (where it is, whether it is reachable, whether missing
* models may still be downloaded) sits above one row per catalog model with its
* verdict and its size on disk.
*
* Widget value shape (set on self.value by widget_common.load → get_value):
*   {
*     store_path      : string   // absolute filesystem path of the model store
*     store_available : boolean  // the store directory is present and readable
*     hub_allowed     : boolean  // missing models may be fetched from the model hub
*     models          : Array<{
*        name  : string          // catalog id (machine string)
*        label : string          // human name from the transcriber catalog
*        state : 'ready'|'unverified'|'incomplete'|'damaged'|'missing'
*        bytes : number          // bytes on disk for this model's required files
*     }>
*     usable_count    : number   // models the browser may attempt (ready + unverified)
*     total_bytes     : number   // bytes on disk for the whole store
*   }
*
* The five states, exactly as the server means them (src/core/ai/model_store.ts):
*   ready       every required file present, and its size matches what was
*               recorded when it was downloaded.
*   unverified  present and plausible, but never size-checked — the NORMAL state
*               of any store seeded before the manifest existed. It RUNS, and is
*               never painted as a problem.
*   incomplete  a required file is absent, or its size contradicts the record:
*               the truncated-download case.
*   damaged     a file's leading bytes are not a plausible ONNX or JSON payload
*               (typically an HTML error page written to disk).
*   missing     nothing of this model is on disk.
*
* DISPLAY-ONLY: download / verify / repair live in the transcription tool's own
* admin-gated server module, so a model that is not usable gets a named remedy
* and the place to perform it — never a button that would be a second copy of
* that machinery (and a second gate to keep right).
*
* SEC-031: store_path and every model name/label are server strings and reach
* the DOM as TEXT NODES only — never inner_html.
*
* Entry point: render_ai_models.prototype.list (assigned to both `.edit` and
* `.list` on the ai_models instance by ai_models.js).
*/



/**
* RENDER_AI_MODELS
* Constructor stub for the render module. Exists solely to anchor the prototype
* method `list`, which ai_models.js assigns to both `.edit` and `.list` on the
* main ai_models instance (prototype-mixin pattern used throughout Dédalo
* area_maintenance widgets). The constructor itself performs no work.
* @returns {boolean} Always true
*/
export const render_ai_models = function() {

	return true
}//end render_ai_models



/**
* LIST
* Entry point for both 'edit' and 'list' render modes. Builds the full widget
* DOM from the pre-loaded `self.value` snapshot.
*
* When `options.render_level` is 'content' the inner content_data node is
* returned directly, bypassing the outer wrapper shell — the fast path
* widget_common.load() uses to repaint the body after the value arrives.
*
* @param {Object} options - render options forwarded by widget_common
* @param {string} [options.render_level='full'] - 'full' = wrapper+content; 'content' = content only
* @returns {Promise<HTMLElement>} wrapper (render_level 'full') or content_data (render_level 'content')
*/
render_ai_models.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end list



/**
* STATE_LABELS
* Display text for each server state, and the remedy for the states that are not
* usable. `unverified` deliberately carries NO remedy: it is the normal state of
* a store seeded before the manifest existed and it runs — a remedy line there
* would teach admins that a healthy install needs fixing.
*/
	const STATE_LABELS = {
		ready		: 'Ready',
		unverified	: 'Installed, not verified',
		incomplete	: 'Incomplete',
		damaged		: 'Damaged',
		missing		: 'Not installed'
	}
	const STATE_REMEDIES = {
		// `unverified` RUNS — it is the normal state of a store seeded before the
		// manifest existed — but it is also the one state a verification can
		// resolve, and the only person allowed to verify is the administrator
		// reading this widget. Saying nothing here left them the one person never
		// told they could check. It is phrased as an offer, not a fault.
		unverified	: 'It runs, but its files were never size-checked — "Check the model files" in the transcription tool confirms them.',
		incomplete	: 'A required file is missing or truncated — repair this model.',
		damaged		: 'A file on disk is not a valid model payload — repair this model (downloading it again does not fix it).',
		missing		: 'Nothing of this model is on disk — download it before it can be used.'
	}
	// the browser may attempt these two; everything else needs the remedy above
	const USABLE_STATES = ['ready', 'unverified']
	// the ONE place the remedies are performed (this widget has no actions)
	const REMEDY_PLACE = 'Download, verify and repair are performed in the transcription tool, in its settings panel.'



/**
* GET_CONTENT_DATA_EDIT
* Assembles the widget content node from the current `self.value` snapshot.
*
* Layout order (top to bottom):
*   1. Store readout   — path, reachability, hub-download policy, usable count
*                        and total size on disk.
*   2. Model table     — one row per catalog model: name, state chip (+ remedy
*                        when it is not usable), size in MB.
*   3. Remedy note     — where the remedy is performed, shown only when
*                        something actually needs one.
*   4. Refresh button  — re-reads the panel from the server (the store changes
*                        under the widget while the operator downloads a model
*                        in the transcription tool).
*
* @param {Object} self - the ai_models widget instance (carries self.value)
* @returns {Promise<HTMLElement>} the populated content_data div
*/
const get_content_data_edit = async function(self) {

	// short vars
		const value		= self.value || {}
		const models	= Array.isArray(value.models) ? value.models : []

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data ai_models_content'
		})

	// store readout
		build_store_block(value, models, content_data)

	// models table (or the honest empty state)
		build_models_block(value, models, content_data)

	// where the remedies are performed. Shown only when something needs one, so a
	// healthy install carries no instruction it cannot act on
		const needs_remedy = value.store_available===false
			|| models.some((model) => STATE_REMEDIES[model.state]!==undefined)
		if (needs_remedy) {
			const remedy_note = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'dd_note ai_models_remedy',
				parent			: content_data
			})
			remedy_note.textContent = REMEDY_PLACE
		}

	// refresh button (re-reads the panel: the store changes while the operator
	// works in the transcription tool)
		const footer = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'ai_models_footer',
			parent			: content_data
		})
		const button_refresh = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_refresh',
			inner_html		: get_label.refresh || 'Refresh',
			parent			: footer
		})
		button_refresh.addEventListener('click', async (e) => {
			e.stopPropagation()
			button_refresh.classList.add('button_spinner')
			try {
				try {
					self.value = await self.get_value()
				} catch (error) {
					console.error(error)
				}
				dd_request_idle_callback(
					() => {
						self.refresh({
							build_autoload	: false, // value is already updated
							destroy			: true
						})
					}
				)
			} finally {
				button_refresh.classList.remove('button_spinner')
			}
		})


	return content_data
}//end get_content_data_edit



/**
* BUILD_STORE_BLOCK
* Renders the key/value readout describing the store itself.
*
* Rows rendered (in order):
*   - Store path       — absolute filesystem path (machine string, mono).
*   - Store            — reachable, or not (an unreachable store means NOTHING
*                        can transcribe, so it is a danger chip, not a warning).
*   - Hub downloads    — whether a missing model may still be fetched. Blocked is
*                        a legitimate configuration (an offline install), so it
*                        only warns when something is actually missing.
*   - Models           — usable of total, plus the size on disk.
*
* Labels are fixed widget text (inner_html); every server-sourced value is
* written with textContent (SEC-031).
*
* @param {Object}      value  - the full widget value snapshot (see module header)
* @param {Array}       models - value.models, already normalized to an array
* @param {HTMLElement} parent - container to append the readout to
* @returns {HTMLElement} the populated readout div
*/
const build_store_block = function(value, models, parent) {

	const store_block = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_readout',
		parent			: parent
	})

	// row helper. label is fixed widget text; row_value goes in as textContent
	// (SEC-031: server strings are never parsed as HTML). class_name is a state
	// token on the inner badge, so the chip hugs its own text.
	const add_row = (label, row_value, class_name='') => {
		const row = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dd_row',
			parent			: store_block
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'dd_k',
			inner_html		: label,
			parent			: row
		})
		const value_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'dd_v',
			parent			: row
		})
		const value_badge = ui.create_dom_element({
			element_type	: 'span',
			class_name		: ('dd_badge ' + class_name).trim(),
			parent			: value_node
		})
		value_badge.textContent = row_value
		return row
	}

	// store path + reachability
		add_row('Store path', value.store_path || 'unknown', 'mono')
		add_row('Store',
			value.store_available===true
				? 'Reachable'
				: 'Not reachable — no model can be loaded until it exists',
			value.store_available===true ? 'state_ok' : 'state_danger'
		)

	// hub downloads. Blocked is a valid offline configuration; it only matters
	// when a model is actually absent from the store
		const any_absent = models.some((model) => !USABLE_STATES.includes(model.state))
		add_row('Hub downloads',
			value.hub_allowed===true
				? 'Allowed — a missing model can be downloaded from the model hub'
				: 'Blocked — models must already be in this store',
			value.hub_allowed===true ? 'state_ok' : (any_absent ? 'state_warning' : '')
		)

	// usable count + size on disk
		const total_bytes = Number(value.total_bytes) || 0
		const usable = Number(value.usable_count) || 0
		// GREEN MEANS ALL OF THEM. `usable > 0` painted 1 ready + 4 damaged as a
		// healthy install on the dashboard's aggregate — the single glance this
		// widget exists to make honest. The headline claim is only true when every
		// listed model is usable.
		add_row('Models',
			usable + ' of ' + models.length + ' usable · ' + format_mb(total_bytes) + ' on disk',
			(models.length > 0 && usable===models.length) ? 'state_ok' : 'state_warning'
		)


	return store_block
}//end build_store_block



/**
* BUILD_MODELS_BLOCK
* Renders one row per catalog model: name, state chip (with the remedy under it
* when the model is not usable), and size on disk.
*
* The state chip uses this widget's own `state_<state>` classes (ai_models.less)
* rather than the generic severity chips, because these five states are not a
* three-level severity: `unverified` runs and must read as calm, while
* `incomplete` and `damaged` are different failures with different remedies.
*
* @param {Object}      value  - the full widget value snapshot
* @param {Array}       models - value.models, already normalized to an array
* @param {HTMLElement} parent - container to append the table to
* @returns {HTMLElement} the table div, or the empty-state note when there is nothing to list
*/
const build_models_block = function(value, models, parent) {

	// empty state: the honest reason, distinguishing "store gone" from
	// "catalog declares no browser model"
		if (!models.length) {
			const empty_note = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'dd_note state_warning ai_models_empty',
				parent			: parent
			})
			empty_note.textContent = value.store_available===true
				? 'The transcription tool declares no in-browser speech model.'
				: 'The model store is not reachable, so no model can be listed.'
			return empty_note
		}

	const table = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_table ai_models_table',
		parent			: parent
	})

	// header
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dd_tr',
			parent			: table
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'dd_th',
			inner_html		: 'Model',
			parent			: header
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'dd_th',
			inner_html		: 'State',
			parent			: header
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'dd_th num',
			inner_html		: 'Size',
			parent			: header
		})

	// one row per model
		for (let i = 0; i < models.length; i++) {

			const model	= models[i] || {}
			const state	= typeof model.state==='string' ? model.state : 'missing'

			const row = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'dd_tr',
				parent			: table
			})

			// name. label is the catalog's human name; the machine id goes under
			// it, because that is what the transcription tool's panel lists
			const name_cell = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'dd_td ai_models_name',
				parent			: row
			})
			const name_label = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'ai_models_label',
				parent			: name_cell
			})
			name_label.textContent = model.label || model.name || ''
			if (model.name && model.name!==model.label) {
				const name_id = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'ai_models_id',
					parent			: name_cell
				})
				name_id.textContent = model.name
			}

			// state chip + remedy (remedy only for the states that need one)
			const state_cell = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'dd_td ai_models_state',
				parent			: row
			})
			const chip = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'model_state state_' + state,
				parent			: state_cell
			})
			chip.textContent = STATE_LABELS[state] || state
			const remedy = STATE_REMEDIES[state]
			if (remedy) {
				const remedy_node = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'ai_models_row_remedy',
					parent			: state_cell
				})
				remedy_node.textContent = remedy
			}

			// size on disk
			const size_cell = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'dd_td num',
				parent			: row
			})
			size_cell.textContent = format_mb(Number(model.bytes) || 0)
		}


	return table
}//end build_models_block



/**
* FORMAT_MB
* Bytes as whole megabytes. Zero renders as an em dash: a model with nothing on
* disk has no size to report, and "0 MB" reads like a measurement.
* @param {number} bytes
* @returns {string}
*/
const format_mb = function(bytes) {

	const value = Number(bytes) || 0
	if (value<=0) {
		return '—'
	}


	return Math.round(value / 1048576) + ' MB'
}//end format_mb



// @license-end
