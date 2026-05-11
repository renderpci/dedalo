// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, JSONEditor */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {dd_request_idle_callback, when_in_viewport} from '../../common/js/events.js'
	import {handle_json_change} from './component_json.js'



/**
* VIEW_DEFAULT_EDIT_JSON
* Manage the components logic and appearance in client side
*/
export const view_default_edit_json = function() {

	return true
}//end view_default_edit_json



/**
* RENDER
* Render node for use in edit
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_edit_json.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper_options = {
			content_data	: content_data,
			buttons			: buttons
		}
		if (self.view==='line') {
			wrapper_options.label = null // prevent to create label
		}
		const wrapper = ui.component.build_wrapper_edit(self, wrapper_options)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	const value = self.data.entries || {}

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= value || []
		const value_length	= inputs_value.length || 1
		if (value_length>1) {
			console.warn('More than one value in component_json is not allowed at now. Ignored next values. N values: ', value_length);
		}
		for (let i = 0; i < value_length; i++) {
			// Gets value from inputs_value (note that inputs_value is an array of objects with the property 'value')
			const current_value = inputs_value[i]?.value || null
			const content_value_node = (self.permissions===1)
				? get_content_value_read(i, current_value, self)
				: get_content_value(i, current_value, self)
			content_data.appendChild(content_value_node)
			// set pointers
			content_data[i] = content_value_node
			break; // only one is used for the time being
		}


	return content_data
}//end get_content_data



// Module-level cache for JSONEditor to avoid repeated dynamic import overhead
let editor_module_cache = null;
let editor_module_loading = false;
let css_injected = false;


/**
* PRELOAD_EDITOR_MODULE
* Starts loading the JSONEditor module on idle time, before the component
* scrolls into view. This eliminates the perceived delay when the user
* scrolls to a component_json instance.
* @return void
*/
const preload_editor_module = () => {

	if (editor_module_cache || editor_module_loading) return;

	editor_module_loading = true;
	import('../../../lib/jsoneditor/dist/standalone.js')
		.then(module => {
			if (module && typeof module.createJSONEditor === 'function') {
				editor_module_cache = module;
			}
			editor_module_loading = false;
		})
		.catch(() => {
			editor_module_loading = false;
		});
};//end preload_editor_module


/**
* INJECT_EDITOR_CSS
* One-time CodeMirror 6 CSS injection via a dummy editor instance.
* Only executed once across all component_json instances to avoid
* redundant editor creation/destruction overhead.
* @param object module - The cached JSONEditor module
* @return void
*/
const inject_editor_css = (module) => {

	if (css_injected) return;

	const dummy_node = document.createElement('div');
	try {
		const dummy_editor = module.createJSONEditor({ target: dummy_node, props: { mode: 'text', content: { text: '' } } });
		dummy_editor.destroy();
	} catch (e) {}

	css_injected = true;
};//end inject_editor_css


/**
* GET_CONTENT_VALUE
* Render JSON editor for current value
* @param int key
* @param mixed current_value
* @param object self
* @return HTMLElement content_value
*/
const get_content_value = (key, current_value, self) => {

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// load_editor and init
		const load_editor = async () => {
			// Prevent double initialization
			if (content_value.dataset.editor_loading === 'true' || content_value.dataset.editor_loaded === 'true') {
				return;
			}
			content_value.dataset.editor_loading = 'true';

			try {
				// Use cached module or load on demand
				const module = editor_module_cache || await import('../../../lib/jsoneditor/dist/standalone.js');
				if (!module || typeof module.createJSONEditor !== 'function') {
					throw new Error('createJSONEditor not found in module');
				}
				// Cache for subsequent instances
				if (!editor_module_cache) {
					editor_module_cache = module;
				}

				// One-time CSS injection (skipped if already done by a previous instance)
				inject_editor_css(module);

				// Wait for fonts and one paint frame to ensure CSS OM is settled
				if (document.fonts && typeof document.fonts.ready !== 'undefined') {
					await document.fonts.ready;
				}
				await new Promise(resolve => requestAnimationFrame(resolve));

				// Abort if the modal was closed while we were waiting
				if (!content_value.isConnected) return;

				// value for editor
				const content = current_value !== null
					? {json : current_value}
					: {text : ''};

				// Destroy previous instance to avoid conflicts on jump
				if (self.editors[key] && typeof self.editors[key].destroy === 'function') {
					try { self.editors[key].destroy(); } catch (e) {}
					self.editors[key] = null;
				}

				// Create editor with error handling
				let editor;
				try {
					editor = module.createJSONEditor({
						target	: content_value,
						props	: {
							content		: content,
							mode		: 'text',
							onChange	: (updatedContent, previousContent, { contentErrors, patchResult }) => {
								if (typeof contentErrors === 'undefined') {
									handle_json_change(self, updatedContent, key)
								}
							}
						}
					});
				} catch (create_err) {
					throw new Error(`Failed to create JSONEditor: ${create_err.message}`);
				}

				// Validate editor was created
				if (!editor) {
					throw new Error('JSONEditor returned null/undefined');
				}

				// Mark as loaded
				content_value.dataset.editor_loaded = 'true';
				content_value.dataset.editor_loading = 'false';

				// set pointer
				self.editors[key] = editor;

				// button_save
				const button_save = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'warning save button_save',
					inner_html		: get_label.save || 'Save',
					parent			: content_value
				});
				// click event
				const click_handler = (e) => {
					e.stopPropagation();
					self.save_sequence(editor);
				};
				button_save.addEventListener('click', click_handler);

			} catch (error) {
				content_value.dataset.editor_loading = 'false';
				console.error('component_json: load_editor failed:', error);
				// Show error in UI
				content_value.textContent = `Error loading JSON editor: ${error.message}`;
				content_value.style.padding = '1rem';
				content_value.style.color = 'var(--color_danger)';
			}
		}//end load_editor

	// Preload editor module on idle (before viewport entry) to reduce perceived latency
		dd_request_idle_callback(preload_editor_module);

	// observe in viewport
		when_in_viewport(content_value, load_editor);


	return content_value
}//end get_content_value



/**
* GET_CONTENT_VALUE_READ
* Render JSON editor for current value
* @param int key
* @param mixed current_value
* @param object self
* @return HTMLElement content_value
*/
const get_content_value_read = (key, current_value, self) => {

	const parsed_value = current_value
		? JSON.stringify(current_value, null, 2)
		: ''

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value read_only'
		})

	// value
		ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'value',
			inner_text		: parsed_value,
			parent			: content_value
		})


	return content_value
}//end get_content_value_read



/**
* GET_BUTTONS
* @param object self
* @return HTMLElement buttons_container
*/
const get_buttons = (self) => {

	// short vars
		const show_interface = self.show_interface

	// fragment
		const fragment = new DocumentFragment()

	// buttons tools
		if(show_interface.tools === true){
			ui.add_tools(self, fragment)
		}

	// button_download. Force automatic download of component data value
		const button_download = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button download',
			title			: get_label.download || 'Download data',
			parent			: fragment
		})
		button_download.addEventListener('click', function(e) {
			e.stopPropagation()
			const export_obj  = self.data.entries[0]
			const export_name = self.id
			download_object_as_json(export_obj, export_name)
		})

	// button sample data
		if (self.context?.properties?.sample_data) {
			const button_sample_data = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button code',
				title			: get_label.add_sample_data || 'Add sample data',
				parent			: fragment
			})
			button_sample_data.addEventListener('click', function(e) {
				e.stopPropagation()
				// const export_obj  = self.data.value[0]
				if (self.data.entries && self.data.entries[0] && self.data.entries[0].length) {
					if(!confirm("Current value is not empty. \nOverwrite actual value?")) {
						return
					}
				}
				const key = 0
				const sample_data = self.context.properties.sample_data
				self.editors[key].set(sample_data);
				console.log('self:', self);
			})
		}

	// button_fullscreen
		if(show_interface.button_fullscreen === true){

			const button_fullscreen = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button full_screen',
				title			: get_label.full_screen || 'Full screen',
				parent			: fragment
			})
			// click event
			const click_handler = (e) => {
				e.stopPropagation()
				ui.enter_fullscreen(self.node)
			}
			button_fullscreen.addEventListener('click', click_handler)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
}//end get_buttons



/**
* DOWNLOAD_OBJECT_AS_JSON
* Force automatic download of component data value
* @param object export_obj
* @param string export_name
* @return void
*/
const download_object_as_json = function(export_obj, export_name) {

    const data_str = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(export_obj,undefined,2));

    const download_anchor_node = document.createElement('a');
    	  download_anchor_node.setAttribute("href",     data_str);
    	  download_anchor_node.setAttribute("download", export_name + ".json");

    document.body.appendChild(download_anchor_node); // required for firefox

    download_anchor_node.click();
    download_anchor_node.remove();
}//end download_object_as_json



// @license-end
