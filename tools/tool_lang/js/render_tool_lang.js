// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals, SHOW_DEBUG, DEDALO_CORE_URL, get_label */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {clone, get_json_langs} from '../../../core/common/js/utils/index.js'



/**
* RENDER_TOOL_LANG
* Manages the component's logic and appearance in client side
*/
export const render_tool_lang = function() {

	return true
}//end render_tool_lang



/**
* EDIT
* Render node for use in edit mode
* @param object options
* @return HTMLElement wrapper
*/
render_tool_lang.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. UI build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data

	// status, render the status components for users and admins to control the process of the tool
		const status_container = await render_status(self)
		wrapper.tool_buttons_container.appendChild(status_container)


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// main_element unavailable case
		if (!self.main_element) {
			const content_data = ui.tool.build_content_data(self)
			content_data.innerHTML = 'Error loosed caller. main_element is not available. Please, try to reopen this tool again.'

			return content_data
		}

	// components container
		const components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'components_container',
			parent			: fragment
		})

	// left_block
		const left_block = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'left_block',
			parent			: components_container
		})

		// top_left
			const top_left = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'top left',
				parent			: left_block
			})

			// source lang select
				const source_select_lang = ui.build_select_lang({
					langs		: self.langs,
					selected	: self.source_lang,
					class_name	: 'source_lang'
				})
				source_select_lang.addEventListener("change", function(e){
					const lang = e.target.value
					change_component_lang({
						self		: self,
						component	: self.main_element,
						lang		: lang
					})
				})
				top_left.appendChild(source_select_lang)

			// source_lang_label
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'lang_label source_lang_label',
					inner_html		: self.get_tool_label('source_lang') || 'Source lang',
					parent			: top_left
				})

		// source component
			const source_component_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'source_component_container',
				parent			: left_block
			})
			// show_interface
			self.main_element.show_interface.read_only = true
			self.main_element.show_interface.tools = false
			self.main_element.render()
			.then(function(node){
				source_component_container.appendChild(node)
			})

	// right_block
		const right_block = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'right_block',
			parent			: components_container
		})

		// top_right
			const top_right = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'top right',
				parent			: right_block
			})

			// target lang select
				const target_select_lang = ui.build_select_lang({
					langs		: self.langs,
					selected	: self.target_lang,
					class_name	: 'target_lang'
				})
				target_select_lang.addEventListener("change", async function(e){
					const lang = e.target.value
					change_component_lang({
						self		: self,
						component	: self.target_component,
						lang		: lang
					})

					const data = {
						id		: 'tool_lang_target_lang',
						value	: lang
					}
					data_manager.set_local_db_data(
						data,
						'status'
					)
				})
				top_right.appendChild(target_select_lang)

			// target_lang_label
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'lang_label target_lang_label',
					inner_html		: self.get_tool_label('target_lang') || 'Target lang',
					parent			: top_right
				})

		// target component
		// if the target component has the same lang than source component block the edition to avoid errors
		// ck-editor can not manage 2 instances of the same component in edit
			if (self.target_component) {
				// show_interface
				self.target_component.show_interface.read_only = (self.target_component.lang===self.source_lang)
				self.target_component.show_interface.tools = false
				const target_component_node = await self.target_component.render()
				const target_component_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'target_component_container',
					parent			: right_block
				})
				target_component_container.appendChild(target_component_node)

				// streaming overlay
				self.streaming_overlay = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'streaming_overlay hide',
					parent			: target_component_container
				})
				self.streaming_overlay_content = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'streaming_overlay_content',
					parent			: self.streaming_overlay
				})
			}

	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: fragment
		})

		// automatic_translation
			const translator_engine = (self.context.config)
				? self.context.config.translator_engine.value
				: false

			if (translator_engine) {
				const automatic_tranlation_node = build_automatic_translation(self, translator_engine, source_select_lang, target_select_lang, components_container)
				buttons_container.appendChild(automatic_tranlation_node)
			}//end if (translator_engine)

		// copy_to_target button
			const copy_to_target = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'secondary copy_to_target',
				inner_html		: self.get_tool_label('copy_to_target') || 'Copy to target',
				parent			: buttons_container
			})
			copy_to_target.addEventListener('click', async function(e){
				e.stopPropagation()

				// user confirmation to overwrite content
					if (self.target_component.data.value && self.target_component.data.value.length>0) {
						if (!confirm( get_label.sure || 'Sure?' )) {
							return false
						}
					}

				// source value
					const source_component	= self.main_element
					const source_value		= source_component.data.value

				// debug
					if(SHOW_DEBUG===true) {
						console.log("--> copy_to_target source_value:", clone(source_value));
						console.log("--> copy_to_target target_value:", clone(self.target_component.data.value));
					}

				// guard: source_value must be an array
					if (!Array.isArray(source_value)) {
						console.error('copy_to_target: source_value is not an array', source_value);
						return;
					}

				// copy value
					self.target_component.data.value = source_value

				// save value. (Expected only one value in the array)
					for (let i = 0; i < source_value.length; i++) {
						self.target_component.save([{
							action	: 'update',
							key		: i,
							value	: source_value[i]
						}])
					}

				// refresh the target component
					self.target_component.refresh({
						build_autoload : false
					})
			})

		// propagate_marks
		// (!) WORKING HERE. Note that this functionality it's not finished in v5
			// const propagate_marks_block = render_propagate_marks_block(self)
			// buttons_container.appendChild(propagate_marks_block)

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* RENDER_PROPAGATE_MARKS_BLOCK
* (!) WORKING HERE. Note that this functionality it's not finished in v5
* @return HTMLElement propagate_marks_container
*/
const render_propagate_marks_block = function(self) {

	const propagate_marks_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'propagate_marks_container'
	})

	// new
		// new_only_label
		const new_only_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: self.get_tool_label('new_only') || 'New only',
			parent			: propagate_marks_container
		})
		// input radio button
		const new_only_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'radio',
			name			: 'propagate_marks',
			value			: 'new_only'
		})
		new_only_input.checked = true // default value is New only
		new_only_label.prepend(new_only_input)

	// recreate all
		// all_label
		const all_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: self.get_tool_label('all') || 'Recreate all',
			parent			: propagate_marks_container
		})
		// input radio button
		const all_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'radio',
			name			: 'propagate_marks',
			value			: 'all'
		})
		all_label.prepend(all_input)

	// propagate_marks button
		const propagate_marks = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light propagate_marks',
			inner_html		: self.get_tool_label('propagate_marks') || 'Propagate marks',
			parent			: propagate_marks_container
		})
		propagate_marks.addEventListener('click', async function(e){
			e.stopPropagation()

			// user confirmation to overwrite content
				if (self.target_component.data.value && self.target_component.data.value.length>0) {
					if (!confirm( get_label.sure || 'Sure?' )) {
						return false
					}
				}

			// source value
				const source_component	= self.main_element
				const source_value		= source_component.data.value

			// (!) WORKING HERE. Note that this functionality it's not finished in v5
		})

	return propagate_marks_container
}//end render_propagate_marks_block



/**
* BUILD_AUTOMATIC_TRANSLATION
*/
const build_automatic_translation = (self, translator_engine, source_select_lang, target_select_lang, components_container) => {

	// container
		const automatic_translation_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'automatic_translation_container'
		})

	// status container
		const status_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'status_container hide',
			parent			: automatic_translation_container
		})

	// button
		const button_automatic_translation = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning button_automatic_translation',
			inner_html		: self.get_tool_label('automatic_translation') || "Automatic translation",
			parent			: automatic_translation_container
		})

		// BUILD_REVIEW_DETAIL
		// Turn a validation report into the specific sentences a user can act on.
		//
		// A bare count ("3 problems") tells them nothing about whether a thesaurus link
		// moved, a marker was thrown away, or a whole paragraph came back untranslated —
		// which are very different things to have to check.
		// @return array of strings, most consequential first
			const build_review_detail = function(report) {

				const detail = []

				// the model looped instead of translating. Listed first because it makes
				// every other line irrelevant — the text itself is garbage.
				if (report.degenerate===true) {
					detail.push(
						self.get_tool_label('translation_degenerate')
						|| 'The model repeated itself instead of translating. Do not save this.'
					)
				}

				// marks that are simply gone, or that we could not find a home for
				const unplaced = report.missing.length + report.unrepairable.length
				if (unplaced>0) {
					detail.push(
						self.get_tool_label('marks_unplaced', unplaced)
						|| `${unplaced} marks could not be placed`
					)
				}

				// marks we re-inserted ourselves: present, but WE chose the position
				if (report.repaired.length>0) {
					detail.push(
						self.get_tool_label('marks_repositioned', report.repaired.length, report.total_marks)
						|| `${report.repaired.length} of ${report.total_marks} marks were repositioned automatically`
					)
				}

				// paired marks the translation reversed, which we put back in open→close order
				if (report.reordered && report.reordered.length>0) {
					detail.push(
						self.get_tool_label('marks_reordered', report.reordered.length)
						|| `${report.reordered.length} linked marks were reversed by the translation and reordered`
					)
				}

				// markers the model invented or duplicated, dropped before saving
				const invalid = report.residual.length + report.added.length + report.duplicated.length
				if (invalid>0) {
					detail.push(
						self.get_tool_label('marks_removed_invalid', invalid)
						|| `${invalid} invalid markers were removed`
					)
				}

				// blocks the model could not translate at all, kept in the source language
				if (report.failed_blocks.length>0) {
					detail.push(
						self.get_tool_label('blocks_untranslated', report.failed_blocks.length)
						|| `${report.failed_blocks.length} blocks were kept in the source language`
					)
				}

				// bold/italic/underline the model dropped. Never the reason the gate fired —
				// it does not count toward uncertain_count — but worth listing once we are
				// showing this panel anyway.
				if (report.emphasis_lost>0) {
					detail.push(
						self.get_tool_label('emphasis_lost', report.emphasis_lost)
						|| `${report.emphasis_lost} text styles (bold, italic) were lost`
					)
				}

				return detail
			}

		// ON_UNCERTAIN
		// Called by the browser engine when it cannot prove the translated value is sound —
		// a mark was dropped and had to be re-inserted by hand, the model invented a marker,
		// a mark went missing altogether, or a block came back untranslated.
		//
		// Nothing has been written to the target component at this point. The translated
		// text is on screen in the streaming overlay, so the user is judging something they
		// can actually see, and the save only happens if they accept it.
		// @return promise<boolean> - true to save anyway
			const on_uncertain = function(report) {

				return new Promise(function(resolve){

					// the run is over — stop the spinner while the user decides
					components_container.classList.remove('loading')
					button_automatic_translation.classList.remove('button_spinner')
					status_container.classList.remove('loading_status')
					status_container.innerHTML = ''

					const review_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'warning translation_review',
						parent			: status_container
					})
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'translation_review_header',
						inner_html		: self.get_tool_label('translation_review_needed')
											|| 'Translation needs review before saving',
						parent			: review_container
					})

					const detail = build_review_detail(report)
					if (detail.length>0) {
						const detail_list = ui.create_dom_element({
							element_type	: 'ul',
							class_name		: 'translation_review_detail',
							parent			: review_container
						})
						for (let i = 0; i < detail.length; i++) {
							ui.create_dom_element({
								element_type	: 'li',
								inner_html		: detail[i],
								parent			: detail_list
							})
						}
					}

					const review_buttons = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'review_buttons',
						parent			: status_container
					})
					const accept_button = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'warning accept_translation',
						inner_html		: self.get_tool_label('accept') || 'Accept',
						parent			: review_buttons
					})
					const discard_button = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'secondary discard_translation',
						inner_html		: self.get_tool_label('discard') || 'Discard',
						parent			: review_buttons
					})

					const decide = function(e, accepted) {
						e.stopPropagation()
						review_buttons.remove()
						resolve(accepted)
					}
					accept_button.addEventListener('click', (e) => decide(e, true))
					discard_button.addEventListener('click', (e) => decide(e, false))
				})
			}

		button_automatic_translation.addEventListener('click', (e) => {
			e.stopPropagation()

			components_container.classList.add('loading')
			button_automatic_translation.classList.add('button_spinner')

			const translator_name	= self.translator_engine_select.value
			const source_lang		= source_select_lang.value
			const target_lang		= target_select_lang.value

			const engine = translator_engine.find(el => el.name===translator_name)
			if (engine && engine.type==='browser') {

				const device = self.translator_device_checkbox && self.translator_device_checkbox.checked
					? 'wasm'
					: 'webgpu'

				const engine = self.translator_engine_model_select
					? self.translator_engine_model_select.value
					: 'translategemma'

				// the q4/q8 choice is TranslateGemma's; the seq2seq engines ship one
				// quantisation and forcing q4 on them would just fail to load
				const dtype = (engine==='translategemma' && self.translator_dtype_select)
					? self.translator_dtype_select.value
					: null

				self.automatic_translation_browser({
					source_lang		: source_lang,
					target_lang		: target_lang,
					device			: device,
					dtype			: dtype,
					engine			: engine,
					status_container: status_container,
					on_uncertain	: on_uncertain
				})
				.then(()=>{
					// the engine owns the status text: it is the only layer that knows whether
					// the result was saved clean, saved with warnings, discarded or cancelled
					components_container.classList.remove('loading')
					button_automatic_translation.classList.remove('button_spinner')
					status_container.classList.remove('loading_status')
				})
				.catch((error)=>{
					components_container.classList.remove('loading')
					button_automatic_translation.classList.remove('button_spinner')
					console.error('automatic_translation_browser error:', error)
				})
			}else{
				self.automatic_translation_server(translator_name, source_lang, target_lang, automatic_translation_container)
				.then(()=>{
					components_container.classList.remove('loading')
					button_automatic_translation.classList.remove('button_spinner')
				})
				.catch((error)=>{
					components_container.classList.remove('loading')
					button_automatic_translation.classList.remove('button_spinner')
					console.error('automatic_translation_server error:', error)
				})
			}
		})

	// select
		self.translator_engine_select = ui.create_dom_element({
			element_type	: 'select',
			parent 			: automatic_translation_container
		})
		for (let i = 0; i < translator_engine.length; i++) {

			const engine = translator_engine[i]

			const option = ui.create_dom_element({
				element_type	: 'option',
				value			: engine.name,
				inner_html		: engine.label,
				parent			: self.translator_engine_select
			})
			if (self.target_translator===engine.name) {
				option.selected = true
			}
		}
		self.translator_engine_select.addEventListener('change', function(){
			data_manager.set_local_db_data({
				id		: 'translator_engine_select',
				value	: self.translator_engine_select.value
			}, 'status')

			// show/hide configuration based on engine type
			const selected_engine = translator_engine.find(el => el.name===self.translator_engine_select.value)
			if (selected_engine && selected_engine.type==='browser') {
				configuration_container.classList.remove('hide')
			}else{
				configuration_container.classList.add('hide')
			}
		})

	// configuration
	// open/close the configuration options
		const show_configuration = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'icon gear',
			parent			: automatic_translation_container
		})
		const show_configuration_click_handler = function (e) {
			configuration_container.classList.toggle('hide')
		}
		show_configuration.addEventListener('click', show_configuration_click_handler)

		const configuration_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'configuration_container hide',
			parent			: automatic_translation_container
		})

		// device checkbox
		const device_container = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'device_container',
			parent 			: configuration_container
		})

		const option_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: self.get_tool_label('cpu_device') || 'More compatible, slower.',
			parent			: device_container
		})

		const translator_device_checkbox = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox'
		})

		self.translator_device_checkbox = translator_device_checkbox

		option_label.prepend(translator_device_checkbox)

		const device_id = 'translator_device_checkbox'
		translator_device_checkbox.addEventListener('change', function(){
			data_manager.set_local_db_data({
				id		: device_id,
				value	: translator_device_checkbox.checked
			}, 'status')
		})

		data_manager.get_local_db_data(
			device_id,
			'status'
		).then(function( device_saved ){
			if(device_saved){
				translator_device_checkbox.checked = device_saved.value
			}
		})

		// translation model.
		//
		// These are here to be COMPARED. The models differ in shape, not just size, and that
		// turns out to matter more: TranslateGemma is a chat model whose template treats its
		// input as a prompt, while NLLB and opus-mt are real seq2seq MT models that just take
		// a sentence and return a sentence.
		//
		// NLLB is the only browser-viable model that covers Basque and Nepali — and it is
		// CC-BY-NC, which the label has to say out loud, because whether that is acceptable is
		// a licensing decision for the deployment and not one this tool can make.
		const model_container = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'model_container',
			parent 			: configuration_container
		})

		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: self.get_tool_label('translation_model') || 'Model',
			parent			: model_container
		})

		const translator_engine_model_select = ui.create_dom_element({
			element_type	: 'select',
			parent			: model_container
		})
		const engine_options = [
			{ value : 'translategemma',	label : self.get_tool_label('engine_translategemma')	|| 'TranslateGemma 4B — all languages, ~2.5 GB' },
			{ value : 'nllb',			label : self.get_tool_label('engine_nllb')			|| 'NLLB-200 600M — all languages, ~700 MB (non-commercial licence)' },
			{ value : 'madlad',			label : self.get_tool_label('engine_madlad')		|| 'MADLAD-400 3B — all languages, ~3 GB (Apache licence)' },
			{ value : 'qwen',			label : self.get_tool_label('engine_qwen')			|| 'Qwen3 4B — instruction model, all languages, ~2.5 GB (Apache licence)' },
			{ value : 'opus',			label : self.get_tool_label('engine_opus')			|| 'Opus-MT — ~75 MB, fast, limited language pairs' }
		]
		for (let i = 0; i < engine_options.length; i++) {
			ui.create_dom_element({
				element_type	: 'option',
				value			: engine_options[i].value,
				inner_html		: engine_options[i].label,
				parent			: translator_engine_model_select
			})
		}

		self.translator_engine_model_select = translator_engine_model_select

		const engine_id = 'translator_engine_model_select'
		translator_engine_model_select.addEventListener('change', function(){
			data_manager.set_local_db_data({
				id		: engine_id,
				value	: translator_engine_model_select.value
			}, 'status')
		})

		data_manager.get_local_db_data(
			engine_id,
			'status'
		).then(function( engine_saved ){
			if(engine_saved && engine_saved.value){
				translator_engine_model_select.value = engine_saved.value
				// the controls were synced against the default; realign them to the restored engine
				if (typeof sync_engine_controls==='function') {
					sync_engine_controls()
				}
			}
		})

		// model quality (quantisation).
		// q4 is what makes a 4B model fit in a browser at all, and it is also a real
		// contributor to the repetition loops seen on long, low-resource translations.
		// q8 buys quality back at roughly double the download and VRAM — which will simply
		// fail to allocate on smaller machines, so it stays opt-in.
		const quality_container = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'quality_container',
			parent 			: configuration_container
		})

		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: self.get_tool_label('model_quality') || 'Model quality',
			parent			: quality_container
		})

		const translator_dtype_select = ui.create_dom_element({
			element_type	: 'select',
			parent			: quality_container
		})
		const dtype_options = [
			{ value : 'q4', label : self.get_tool_label('model_quality_q4') || 'Standard (faster, ~2.5 GB)' },
			{ value : 'q8', label : self.get_tool_label('model_quality_q8') || 'High (better, ~4.5 GB, may not fit)' }
		]
		for (let i = 0; i < dtype_options.length; i++) {
			ui.create_dom_element({
				element_type	: 'option',
				value			: dtype_options[i].value,
				inner_html		: dtype_options[i].label,
				parent			: translator_dtype_select
			})
		}

		self.translator_dtype_select = translator_dtype_select

		const dtype_id = 'translator_dtype_select'
		translator_dtype_select.addEventListener('change', function(){
			data_manager.set_local_db_data({
				id		: dtype_id,
				value	: translator_dtype_select.value
			}, 'status')
		})

		data_manager.get_local_db_data(
			dtype_id,
			'status'
		).then(function( dtype_saved ){
			if(dtype_saved && dtype_saved.value){
				translator_dtype_select.value = dtype_saved.value
			}
		})

		// Engines that only run on WebGPU. A multi-gigabyte model cannot fit in the WASM/CPU
		// backend (4 GB address-space limit), so offering the "CPU" toggle for them just leads
		// to a crash. This set must stay in step with `requires_webgpu` in the worker's ENGINES.
		const WEBGPU_ONLY = ['translategemma', 'qwen', 'madlad']

		const sync_engine_controls = function() {

			const engine = translator_engine_model_select.value

			// q4/q8 is a TranslateGemma choice — the other engines ship a single quantisation,
			// so a control that does nothing is worse than not showing it.
			quality_container.classList.toggle('hide', engine!=='translategemma')

			// the CPU fallback is meaningless for a WebGPU-only model — force GPU and disable
			// the toggle, with a hint, rather than letting the user pick a setting that crashes
			if (WEBGPU_ONLY.includes(engine)) {
				translator_device_checkbox.checked  = false
				translator_device_checkbox.disabled = true
				translator_device_checkbox.title    = self.get_tool_label('requires_webgpu_hint')
					|| 'This model runs on the GPU only'
			} else {
				translator_device_checkbox.disabled = false
				translator_device_checkbox.title    = ''
			}
		}
		translator_engine_model_select.addEventListener('change', sync_engine_controls)
		sync_engine_controls()

		// initial visibility: show config if the default engine is browser type
		const initial_engine = translator_engine.find(el => el.name===self.target_translator)
		if (initial_engine && initial_engine.type==='browser') {
			configuration_container.classList.remove('hide')
		}

	return automatic_translation_container
}//end build_automatic_translation



/**
* CHANGE_COMPONENT_LANG
* Load and render a new component for translate
* @param property object
* 	self		: instance of the tool
* 	component	: instance of the component to change, it could be source or target component
* 	lang		: the lang selected by user
* @return HTMLElement|bool
* 	component wrapper node
*/
export const change_component_lang = async (options) => {

	// options
		const self		= options.self
		const component	= options.component
		const lang		= options.lang

	// check if source component or target component has the lang selected to lock the component edition
	// if not release read_only property
		// if (lang===self.main_element.lang || lang===self.target_component.lang) {
		// 	// node.classList.add('disabled_component')
		// 	component.show_interface.read_only = true
		// }else{
		// 	component.show_interface.read_only = false
		// }

	// id_variant: tool_lang / target_component
		const is_main = component.id_variant==='tool_lang'

	// read_only
		component.show_interface.read_only = is_main || (lang===self.source_lang)

	// render component
		component.lang = lang
		// set auto_init_editor for convenience
		component.auto_init_editor = true

		await component.refresh()
		// const node		= await component.render()

	return true
}//end change_component_lang



/**
* RENDER_STATUS
* Render the status components to get control of the process of the tool
* the components are defined in ontology as tool_config->name_of_the_tool->ddo_map
* @param object self
* 	instance of current tool
* @return HTMLElement fragment
*/
const render_status = async function(self) {

	const fragment = new DocumentFragment()

	// status_user_component
		if (self.status_user_component) {
			self.status_user_component.context.view	= 'mini'
			self.status_user_component.show_interface.tools = false
			self.status_user_component.show_interface.save_animation = false
			const status_user_node = await self.status_user_component.render()
			fragment.appendChild(status_user_node)
		}

	// status_admin_component
		if (self.status_admin_component) {
			self.status_admin_component.context.view = 'mini'
			self.status_admin_component.show_interface.tools = false
			self.status_admin_component.show_interface.save_animation = false
			const status_admin_node	= await self.status_admin_component.render()
			fragment.appendChild(status_admin_node)
		}


	return fragment
}//end render_status



// @license-end
