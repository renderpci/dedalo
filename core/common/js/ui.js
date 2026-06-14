// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, Promise, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {
		strip_tags,
		prevent_open_new_window
	} from '../../common/js/utils/index.js'
	import {when_in_dom,dd_request_idle_callback,set_tool_event} from '../../common/js/events.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {get_instance, get_all_instances} from '../../common/js/instances.js'
	import '../../common/js/dd-modal.js'
	import {check_unsaved_data, deactivate_components} from '../../component_common/js/component_common.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {set_element_css} from '../../page/js/css.js'
	import '../../../lib/codex-tooltip/tooltip.js';



/**
* UI
* Central UI factory and helper namespace for the Dédalo v7 front-end.
*
* Provides:
*   - Namespaced sub-objects for building DOM wrappers per Dédalo entity type:
*       ui.component — component wrappers (edit / list / mini / search modes),
*                      lifecycle helpers (activate / deactivate / lock / unlock),
*                      image fallbacks, warning badges, save animation.
*       ui.section   — (reserved; currently empty; section-specific helpers live in
*                      section files and delegate back here for shared DOM patterns)
*       ui.area      — area wrappers (edit mode)
*       ui.tool      — tool wrappers, content-data containers, tool-button builders
*       ui.widget    — widget wrappers (edit mode)
*   - Top-level utility methods:
*       create_dom_element — generic DOM node factory (the most-called helper in the codebase)
*       update_node_content — efficient replaceChildren + insertAdjacentHTML
*       add_tools — attach tool buttons from instance.tools[] to a buttons container
*       place_element — deferred DOM placement with event subscription fallback
*       toggle_inspector — show/hide the section inspector sidebar
*       collapse_toggle_track — persistent open/closed state via local DB
*       build_select_lang — language <select> builder
*       attach_to_modal — full-featured <dd-modal> Web Component wrapper
*       activate_first_component — auto-focus the first editable component on record create
*       render_list_header — unified portal/section list column headers with sort arrows
*       allow_column_order / add_column_order_set — column-sort logic
*       flat_column_items — CSS grid-template-columns builder from columns_map
*       set_background_image — canvas-based dominant-color background for images
*       make_column_responsive — CSS ::before responsive label injection
*       hilite — toggle 'hilite_element' class on a component node
*       enter_fullscreen — CSS fullscreen + Escape-key exit handler
*       get_ontology_term_link — hyperlink to the ontology term viewer
*       load_item_with_spinner — async spinner-then-replace pattern
*       show_message — dismissible status/error message banner
*       get_text_color — WCAG-contrast-aware black/white text color picker
*       css_var — resolves a CSS custom property to its computed value
*       render_edit_modal — builds an inline component edit modal
*       activate_tooltips — registers codex-tooltip on .button elements
*       fit_input_width_to_value — auto-sizes an <input> to its character count
*       inside_dataframe — caller-chain check for component_dataframe context
*
* All wrapper builders follow the same contract:
*   - Accept an `instance` (the Dédalo entity object) and an optional `options`/`items` map.
*   - Return a single HTMLElement that the caller appends to the DOM.
*   - Never mutate `instance` directly (pointer properties like `instance.node` are set
*     by the caller after the returned node is placed, not by these builders).
*
* Exported as a plain object literal so callers can import individual sub-namespaces
* or the whole object without instantiation.
*/
export const ui = {



	/**
	* LOCAL VARS
	* @var {Object|null} tooltip - Singleton Tooltip instance (codex-tooltip).
	*   Lazily initialized on first call to activate_tooltips; null means not yet
	*   created or running on a mobile device (tooltips are suppressed on touch).
	* @var {number|null} message_timeout - Handle returned by setTimeout for the
	*   auto-dismiss timer on 'ok'-type messages. Cleared before each new message
	*   to allow consecutive successes to reset the countdown correctly.
	*/
	tooltip : null,



	/**
	* SHOW_MESSAGE
	* Displays a dismissible status/error/warning banner inside a component wrapper.
	* The message container is created once and reused on subsequent calls (the node
	* is looked up by its CSS class and recycled rather than duplicated). Multiple
	* text items may be stacked; pass clean=true to remove previous items first.
	* 'ok'-type messages auto-dismiss after 10 seconds via a shared timeout handle.
	*
	* @param {HTMLElement} wrapper - The component wrapper that will host the banner.
	* @param {string} message - Plain-text message to display.
	* @param {string} [msg_type='error'] - Severity class: 'error' | 'warning' | 'ok'.
	* @param {string} [message_node='component_message'] - CSS class for the container node;
	*   callers may pass a custom class to scope messages to a specific sub-element.
	* @param {boolean} [clean=false] - When true, removes all existing .text nodes
	*   before adding the new message (useful for replacing a previous error).
	* @returns {HTMLElement} message_wrap - The message container element (created or recycled).
	*/
	message_timeout : null,
	show_message : (wrapper, message, msg_type='error', message_node='component_message', clean=false) => {

		// message_wrap. always check if already exists, else, create a new one and recycle it
			const message_wrap = wrapper.querySelector('.'+message_node) || (()=>{

				const new_message_wrap = ui.create_dom_element({
					element_type	: 'div',
					class_name		: message_node,
					parent			: wrapper
				})

				const close_button = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'close',
					text_content	: ' x ',
					parent			: new_message_wrap
				})
				close_button.addEventListener('click', (e) => {
					e.stopPropagation()
					message_wrap.remove()
				})

				return new_message_wrap
			})()

		// set style
			message_wrap.classList.remove('error','warning','ok')
			message_wrap.classList.add(msg_type)

		// clean messages
			if (clean===true) {
				// clean
				const items = message_wrap.querySelectorAll('.text')
				for (let i = items.length - 1; i >= 0; i--) {
					items[i].remove()
				}
			}

		// add message text
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'text',
				text_content	: message,
				parent			: message_wrap
			})

		// adjust height. Read layout once to avoid repeated forced reflows
			const message_height = message_wrap.offsetHeight
			const computed_styles = getComputedStyle(message_wrap.parentNode);
			if (computed_styles.position!=='fixed') {
				message_wrap.style.top = '-' + message_height + 'px'
			}

		// close button move to bottom when height is too much
			if (message_height>120) {
				const close_button			= message_wrap.querySelector('.close')
				close_button.style.top		= 'unset';
				close_button.style.bottom	= '0px';
			}

		// remove message after time
			clearTimeout(ui.message_timeout);
			if (msg_type==='ok') {
				ui.message_timeout = setTimeout(()=>{
					message_wrap.remove()
				}, 10000)
			}


		return message_wrap
	},//end show_message



	component : {



		/**
		* BUILD_WRAPPER_EDIT
		* Unified builder for component wrappers in 'edit' or 'search' modes.
		* Constructs the main DOM structure, applies CSS classes (including ontology-defined CSS),
		* handles activation events, and appends sub-elements (label, buttons, paginators, etc.).
		* @param {Object} instance - The component instance.
		* @param {Object} [options={}] - Configuration options.
		* @param {HTMLElement} [options.label] - Optional custom label node.
		* @param {HTMLElement} [options.top] - Node to place at the top.
		* @param {HTMLElement} [options.buttons] - Container for action buttons.
		* @param {HTMLElement} [options.list_body] - Body node for list-type components.
		* @param {HTMLElement} [options.content_data] - Main data container node.
		* @param {string[]} [options.add_styles] - Array of extra CSS classes to add.
		* @returns {HTMLElement} wrapper - The constructed wrapper element.
		*/
		build_wrapper_edit : (instance, options={}) => {

			// Destructure instance properties for clarity
			const {
				model,
				type,
				tipo,
				section_tipo,
				mode,
				label,
				show_interface,
				permissions,
				context,
				active,
				filter,
				paginator
			} = instance

			const view					= instance.view || context.view || 'default'
			const ontology_css			= context.css || null
			const state_of_component	= context.properties?.state_of_component || null
			const show_label			= show_interface.label
			const add_styles			= options.add_styles || null

			// Main wrapper element
				const wrapper = document.createElement('div')

				// CSS Configuration
					const ar_css = [
						`wrapper_${type}`,
						model,
						tipo,
						`${section_tipo}_${tipo}`,
						mode,
						`view_${view}`
					]

					if (add_styles) ar_css.push(...add_styles)
					if (mode === 'search') ar_css.push('tooltip_toggle')

					wrapper.classList.add(...ar_css)

					// Apply ontology CSS if available
					if (ontology_css) {
						const selector = `${section_tipo}_${tipo}.${tipo}.${mode}`
						set_element_css(selector, ontology_css)
					}

				// Read-only state
					if (!permissions || parseInt(permissions) < 2) {
						wrapper.classList.add('disabled_component')
					}

				// Event Listeners
					const mousedown_handler = (e) => {
						e.stopPropagation()

						if (!instance.active) {
							ui.component.activate(instance)
						}

						if (typeof SHOW_DEBUG !== 'undefined' && SHOW_DEBUG === true) {
							if (e.metaKey && e.altKey) {
								e.preventDefault()
								console.log('/// refreshing instance (build_autoload=true, render_level=content):', instance);
								instance.refresh({ build_autoload: true, render_level: 'content' })
								return
							}
							if (e.altKey) {
								e.preventDefault()
								console.log(`/// selected instance ${model}:`, instance);
								return
							}
						}
					}

					wrapper.addEventListener('click', (e) => e.stopPropagation())
					wrapper.addEventListener('mousedown', mousedown_handler)

			// Use DocumentFragment to batch synchronous appends
				const fragment = new DocumentFragment()

				// Label handling
				if (options.label === null || show_label === false) {
					// Skip label
				} else if (options.label) {
					fragment.appendChild(options.label)
					wrapper.label = options.label // Pointer reference
				} else {
					const component_label = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'label',
						inner_html		: label
					})
					fragment.appendChild(component_label)
					wrapper.label = component_label

					// State indicators (e.g., deprecated)
					if (state_of_component) {
						for (const [key, value] of Object.entries(state_of_component)) {
							const icon = ui.create_dom_element({
								element_type	: 'span',
								class_name		: `button icon ${value.icon ?? key}`,
								title			: value.msg || key
							})
							component_label.prepend(icon)
						}
					}
				}

				// Synchronous sections
				if (options.top) fragment.appendChild(options.top)
				if (options.buttons && permissions > 1) fragment.appendChild(options.buttons)

				// Async Sub-components (Filter/Paginator)
				// Note: These append themselves to the wrapper once resolved.
				if (filter) {
					const filter_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'filter',
						parent			: wrapper // Append to wrapper directly as it's async
					})
					filter.build()
						.then(() => filter.render())
						.then(filter_node => filter_container.appendChild(filter_node))
						.catch(err => console.error("Error with filter:", err))
				}

				if (paginator) {
					const paginator_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'paginator_container',
						parent			: wrapper // Append to wrapper directly
					})
					paginator.render()
						.then(paginator_node => paginator_container.appendChild(paginator_node))
						.catch(err => console.error("Error with paginator:", err))
				}

				// Final synchronous appends
				if (options.list_body) fragment.appendChild(options.list_body)
				if (options.content_data) fragment.appendChild(options.content_data)

				// Commit fragment to wrapper
				wrapper.appendChild(fragment)

			return wrapper
		},//end build_wrapper_edit



		/**
		* BUILD_CONTENT_DATA
		* Creates the main content container element for a component in any mode.
		* Applies the component's ontology-defined CSS classes (from context.css.content_data)
		* alongside the standard 'content_data' and type classes. The returned element is
		* meant to be populated by the caller before being appended to the wrapper.
		*
		* @param {Object} instance - The component instance; must expose instance.type and
		*   instance.context.css (may be an empty object when no ontology CSS is defined).
		* @param {Object} [options={}] - Reserved for future configuration; currently unused.
		* @returns {HTMLElement} content_data - The created <div> element.
		*/
		build_content_data : (instance, options={}) => {

			// options
			const type			= instance.type
			const component_css	= instance.context.css || {}

			// div container
			const content_data = document.createElement('div')

			 // Get content_data specific CSS classes, defaulting to an empty array.
			const content_data_structure_css = component_css.content_data || []

			// Combine all CSS classes to be added.
			const css_classes_to_add = [
				'content_data',
				type,
				...content_data_structure_css
			]

			// Add classes to the content_data element.
			content_data.classList.add(...css_classes_to_add)


			return content_data
		},//end build_content_data



		/**
		* BUILD_BUTTON_EXIT_EDIT
		* Creates the close/exit-edit button that appears on an active component.
		* On click it deactivates the component and transitions it to the target mode
		* (default 'list') by calling instance.change_mode, which destroys the current
		* node and renders a fresh one in the new mode.
		*
		* @param {Object} instance - The component instance to deactivate and change mode on.
		* @param {Object} [options={}] - Configuration overrides.
		* @param {boolean} [options.autoload=true] - Passed to instance.change_mode.
		* @param {string} [options.target_mode='list'] - The mode to switch to on close.
		* @returns {HTMLElement} button_close_node - The rendered close <span> button element.
		*/
		build_button_exit_edit : (instance, options={}) => {

			// options
				const autoload		= options.autoload || true
				const target_mode	= options.target_mode || 'list'

			const button_close_node = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button close button_exit_edit show_on_active'
			})
			// click event
			const click_handler = async function(e) {
				e.stopPropagation()

				await ui.component.deactivate(instance)

				// change mode destroy current instance and render a fresh full element node in the new mode
				instance.change_mode({
					mode		: target_mode,
					autoload	: autoload
				})
			}
			button_close_node.addEventListener('click', click_handler)


			return button_close_node;
		},//end build_button_exit_edit



		/**
		* BUILD_BUTTONS_CONTAINER
		* Creates the empty <div> container that holds action/tool buttons for a component.
		* Callers append individual buttons (save, close, tool shortcuts, etc.) to the
		* returned element before placing it into the wrapper.
		*
		* @param {Object} instance - The component instance (currently unused; reserved for
		*   future per-instance customisation of the container).
		* @returns {HTMLElement} buttons_container - The created <div class="buttons_container"> element.
		*/
		build_buttons_container : (instance) => {

			const buttons_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'buttons_container'
			})

			return buttons_container
		},//end build_buttons_container



		/**
		* BUILD_WRAPPER_LIST
		* Builds the component wrapper element for 'list' (read-only display) mode.
		* Applies the standard CSS class set (wrapper_<type>, model, tipo, section_tipo_tipo,
		* 'list', view_<view>) and injects ontology-defined CSS rules via set_element_css.
		* If options.value_string is provided, a <span> with the pre-formatted value is
		* appended immediately (used by simple single-value components to avoid an extra render pass).
		* When SHOW_DEBUG is true, Alt+click logs the full instance to the console without
		* triggering navigation.
		*
		* @param {Object} instance - The component instance.
		* @param {Object} [options={}] - Configuration overrides.
		* @param {string} [options.value_string] - Pre-rendered HTML string to display inside the wrapper.
		* @param {string[]} [options.add_styles] - Extra CSS classes to add to the wrapper.
		* @returns {HTMLElement} wrapper - The constructed wrapper <div> element.
		*/
		build_wrapper_list : (instance, options={}) => {

			// Options destructuring with defaults
				const {
					value_string,
					add_styles = null
				} = options;

			// Instance properties
				const model			= instance.model 		// e.g., 'component_input_text'
				const type			= instance.type 		// e.g., 'component'
				const tipo			= instance.tipo 		// e.g., 'rsc26'
				const section_tipo	= instance.section_tipo // e.g., 'oh1'
				const view			= instance.view || instance.context.view || 'default'
				const element_css	= instance.context.css || {}
				const mode			= instance.context.mode

			// wrapper
				const wrapper = document.createElement('div')

				// css
				const classes_to_add = [
					'wrapper_' + type,
					model,
					tipo,
					section_tipo +'_'+ tipo,
					'list',
					'view_' + view
				]
				// Add custom styles if provided
			    if (add_styles && Array.isArray(add_styles)) {
			        classes_to_add.push(...add_styles);
			    }
				wrapper.classList.add(...classes_to_add)

				// Ontology CSS definition
				// Get the ontology CSS defined into the ontology properties.
				// And insert the rules into CSS style set.
				// this not apply to component_filter (project) use specific CSS because it's inside inspector.
				if (model !== 'component_filter' && mode !== 'tm' && Object.keys(element_css).length > 0) {
					// CSS is moved from properties to specific property in context
					// Into tool time machine visualization case, do not add custom CSS from properties
					set_element_css(
						`${section_tipo}_${tipo}.${tipo}.list`, // CSS selector
						element_css // properties CSS object
					)
				}

			// value_string. span value. Add span if value_string is received
				if (value_string) {
					ui.create_dom_element({
						element_type	: 'span',
						inner_html		: value_string,
						parent			: wrapper
					})
				}

			// debug
				if(SHOW_DEBUG===true) {
					wrapper.addEventListener('contextmenu', function(e){
						e.stopPropagation()
					})
					wrapper.addEventListener('mousedown', function(e){
						if (e.altKey) {
							e.stopPropagation()
							e.preventDefault()
							console.log('/// selected instance:', instance);
						}
					})
				}


			return wrapper
		},//end build_wrapper_list



		/**
		* BUILD_WRAPPER_MINI
		* Builds a compact inline <span> wrapper for a component rendered in 'mini' mode.
		* Mini mode is used when a component value is displayed as a small inline badge
		* (e.g., inside a relation locator chip or a tooltip preview).
		* The wrapper receives the classes 'mini' and '<model>_mini'.
		*
		* @param {Object} instance - The component instance; instance.model is used for the class.
		* @param {Object} [options={}] - Configuration overrides.
		* @param {string} [options.value_string] - Pre-rendered HTML string inserted via insertAdjacentHTML.
		* @returns {HTMLElement} wrapper - The constructed <span> element.
		*/
		build_wrapper_mini : (instance, options={}) => {

			// options
				const value_string = options.value_string

			// wrapper
				const wrapper = document.createElement('span')

				// css
					const ar_css = [
						'mini',
						instance.model + '_mini' // add suffix '_mini'
					]
					wrapper.classList.add(...ar_css)

			// value_string
				if (value_string) {
					wrapper.insertAdjacentHTML('afterbegin', value_string)
				}

			return wrapper
		},//end build_wrapper_mini



		/**
		* BUILD_WRAPPER_SEARCH
		* Builds the component wrapper element for 'search' mode (used inside the search inspector).
		* Differences from build_wrapper_edit:
		*   - The label is prefixed with '>' characters proportional to the ddo path depth,
		*     so users can visually identify nested search components.
		*   - The title attribute on the label shows the full section path (section_tipo chain).
		*   - A tooltip div (.hidden_tooltip) is conditionally added if context.search_options_title
		*     is defined (enables a hover info panel about available search operators).
		*   - Activation is triggered on the 'click' event rather than 'mousedown'.
		*   - The 'tooltip_toggle' class is always added (search wrappers always have a tooltip).
		*
		* @param {Object} instance - The component instance; must expose id, model, type, tipo,
		*   mode, view, label, context, path, and an activate-capable node.
		* @param {Object} [items={}] - Sub-elements to slot into the wrapper.
		* @param {HTMLElement|null} [items.label] - Custom label node; null suppresses the label entirely.
		* @param {HTMLElement} [items.content_data] - The main data container node.
		* @returns {HTMLElement} wrapper - The constructed wrapper <div> element.
		*/
		build_wrapper_search : (instance, items={}) => {

			// short vars
				const id			= instance.id || 'id is not set'
				const model			= instance.model 	// like component_input-text
				const type			= instance.type 	// like 'component'
				const tipo			= instance.tipo 	// like 'rsc26'
				const mode			= instance.mode 	// like 'edit'
				const view			= instance.view || null
				const label			= instance.label // instance.context.label
				const element_css	= instance.context.css || {}
				const path			= instance.path || []
				const content_data	= items.content_data || null

			// DocumentFragment
				const fragment = new DocumentFragment()

			// label. If node label received, it is placed at first. Else a new one will be built from scratch (default)
				if (label===null || items.label===null) {
					// no label add
				}else if(items.label) {
					// add custom label
					fragment.appendChild(items.label)
				}else{
					// default

					// label: add > symbol to easily identify items with depth (more than one level)
					const final_label = path.length>1
						? ('>').repeat(path.length-1) + ' ' + label
						: label

					// title : add section depth path for easy location
					const base_title = tipo + ' ' + model.substring(10) + ' [' + instance.lang.substring(3) + ']'
					const title = path.length>0
						? path.map(el => el.section_tipo).join(' > ') +' : '+ base_title
						: base_title

					const component_label = ui.create_dom_element({
						element_type	: 'div',
						inner_html		: final_label,
						title			: title,
						parent			: fragment
					})

					// parent_grouper_label. Add parent grouper info to the component view
						const parent_grouper_label = instance.context.config?.parent_grouper_label
						if (parent_grouper_label) {
							ui.create_dom_element({
								element_type	: 'span',
								class_name		: 'label_info',
								text_content	: instance.context.config?.parent_grouper_label,
								parent			: component_label
							})
						}
					// css
						const label_structure_css = typeof element_css.label!=="undefined" ? element_css.label : []
						const ar_css = ['label', ...label_structure_css]
						component_label.classList.add(...ar_css)
				}

			// content_data
				if (content_data) {
					fragment.appendChild(content_data)
				}

			// tooltip
				if (instance.context.search_options_title) {
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'tooltip hidden_tooltip',
						inner_html		: instance.context.search_options_title || '',
						parent			: fragment
					})
				}

			// wrapper
				const wrapper = document.createElement('div')
					  wrapper.id = id
				// css
					const wrapper_structure_css = typeof element_css.wrapper!=='undefined' ? element_css.wrapper : []
					const ar_css = [
						'wrapper_' + type,
						model,
						tipo,
						mode,
						...wrapper_structure_css
					]
					if (view) {
						ar_css.push('view_'+view)
					}
					if (mode==='search') {
						ar_css.push('tooltip_toggle')
					}
					wrapper.classList.add(...ar_css)

				// event click . Activate component on event
					wrapper.addEventListener('click', e => {
						e.stopPropagation()
						if (!instance.active) {
							ui.component.activate(instance)
						}

						if(SHOW_DEBUG===true) {
							if (e.metaKey && e.altKey) {
								e.preventDefault()
								console.log('/// refreshing instance (build_autoload=true, render_level=content):', instance);
								instance.refresh({
									build_autoload	: true,
									render_level	: 'content'
								})
								return
							}
							if (e.altKey) {
								e.preventDefault()
								console.log(`/// selected instance ${instance.model}:`, instance);
								return
							}
						}
					})

				wrapper.appendChild(fragment)


			return wrapper
		},//end build_wrapper_search



		/**
		* ACTIVATE
		* Marks a component as the currently active (focused/editing) component.
		* This is the single authoritative path for component activation — callers must
		* NOT set component.active = true directly.
		*
		* Side effects (in order):
		*  1. Guards: no-ops if component is undefined or already active.
		*  2. Sets component.active = true immediately (before the deactivate await) to
		*     prevent duplicate events from concurrent mousedown/focus chains.
		*  3. Deactivates the previously active component (page_globals.component_active)
		*     if it is a different instance; this saves any pending changed_data.
		*  4. Adds the 'active' CSS class to component.node; also adds 'inside' when the
		*     component overlaps the inspector panel (avoids visual overlap on wide screens).
		*  5. Attempts to focus the first focusable input inside content_data (unless
		*     component.focus_first_input is defined — components like component_text_area
		*     override this to handle cursor placement themselves).
		*  6. Updates page_globals.component_active.
		*  7. Publishes the 'activate_component' event via event_manager.
		*  8. Calls check_unsaved_data so that a pending mousedown on another component
		*     triggers a save-before-navigate prompt.
		*  9. Persists the last selected component tipo for this section in the local DB
		*     (used to restore the selection on back-navigation).
		*
		* @param {Object} component - The full component instance to activate.
		* @param {boolean} [focus=true] - Whether to auto-focus the first input inside the component.
		* @returns {Promise<boolean>} Resolves false if the component was undefined or already active;
		*   true when activation completed successfully.
		*/
		activate : async (component, focus=true) => {

			// component mandatory check
				if (typeof component==='undefined') {
					console.warn('[ui.component.active]: WARNING. Received undefined component!');
					return false
				}

			// already active case
				if (component.active===true) {
					return false
				}

			// component active status update
			// Its important to fix the value here because prevents duplicate events like component_text_area focus
				component.active = true

			// deactivate current active if exists
				if (page_globals.component_active &&
					page_globals.component_active.id!==component.id
					) {
					await ui.component.deactivate(page_globals.component_active)
				}

			// inspector. fix nearby inspector overlapping
				const wrapper = component.node
				if (wrapper) {
					wrapper.classList.add('active')

					const el_rect	= wrapper.getBoundingClientRect();
					const inspector	= document.getElementById('inspector')
					if (inspector) {
						const inspector_rect = inspector.getBoundingClientRect();
						if (inspector_rect.left > 50 // prevent affects responsive mobile view
							&& el_rect.right > inspector_rect.left-20
							) {
							wrapper.classList.add('inside')
						}
					}
				}

			// try to focus first input
				if (focus===true) {
					if (typeof component.focus_first_input==='function') {
						// custom function from component like component_text_area
						component.focus_first_input()
					}else{

						// check if any component input is already focused
							const already_focus = (()=>{
								if (!document.activeElement) {
									return false
								}
								const all_inputs = component.node?.content_data
									? component.node.content_data.querySelectorAll('input, select')
									: [];
								const all_inputs_length = all_inputs.length
								for (let i = 0; i < all_inputs_length; i++) {
									if (document.activeElement === all_inputs[i]) {
										return true
									}
								}
								return false
							})()

						// auto-focus first input
							if (!already_focus) {
								// generic try of first input node
								const first_input = component.node?.content_data && component.node.content_data[0]
										? component.node.content_data[0].querySelector('input, select')
										: null;
								if (first_input) {
									dd_request_idle_callback(
										() => {
											if (component.active && first_input !== document.activeElement) {

												// check another focus elements like q_operator
												if (document.activeElement && document.activeElement.classList.contains('q_operator')) {
													return
												}

												first_input.focus()
											}
										}
									)
								}else if (wrapper) {
									// components without a focusable input/select (e.g. component_svg) never
									// received the implicit scroll that first_input.focus() performs, so
									// restore_section_selection selected them without bringing them on screen.
									// Scroll the wrapper into view instead. block:'nearest' is a no-op when the
									// element is already visible, matching the focus() behavior on a normal click.
									dd_request_idle_callback(
										() => {
											if (component.active) {
												wrapper.scrollIntoView({ block: 'nearest', inline: 'nearest' })
											}
										}
									)
								}
							}//end if (!already_focus)
					}
				}

			// fix component as active
				page_globals.component_active = component

			// publish activate_component event
				event_manager.publish('activate_component', component)

			// unsaved_data case
			// This allow catch page mousedown event (inside any component) and check for unsaved components
			// usually happens in component_text_area editions because the delay (500 ms) to set as changed
				check_unsaved_data()

			// section last selection store
				data_manager.set_local_db_data(
					{
						id		: 'last_section_selection_' + component.section_tipo,
						value	: {
							tipo : component.tipo
						}
					},
					'status' // string table
				);


			return true
		},//end activate



		/**
		* DEACTIVATE
		* Removes the active state from a component, optionally auto-saving pending edits.
		*
		* (!) If component.data.changed_data is non-empty and component.save_on_deactivate
		*     is true (or undefined, which defaults to true), this calls component.change_value()
		*     synchronously — meaning a server save request is dispatched as a side effect.
		*
		* Side effects (in order):
		*  1. No-op if component.active !== true.
		*  2. Blurs the currently focused DOM element to flush any pending input events
		*     (e.g., the 500 ms debounce in component_text_area).
		*  3. Removes the 'active' CSS class from component.node.
		*  4. Saves changed_data via component.change_value if applicable (see above).
		*  5. Sets component.active = false.
		*  6. Clears page_globals.component_active if it points to this component.
		*  7. Publishes the 'deactivate_component' event via event_manager.
		*  8. Deletes the last-selection record for this section from the local DB.
		*
		* @param {Object} component - The full component instance to deactivate.
		* @returns {Promise<boolean>} Resolves false if the component was already inactive;
		*   true when deactivation completed successfully.
		*/
		deactivate : async (component) => {

			// check already inactive
				if (component.active!==true) {
					return false
				}

			// blur active Element. This forces the component update changed_data
				const input_active = document.activeElement
				if (input_active) {
					input_active.blur()
				}

			// styles. Remove wrapper css active if exists
				if(component.node && component.node.classList.contains('active')) {
					component.node.classList.remove('active')
				}

			// changed_data check. This action saves changed_data
			// and reset component changed_data to empty array []
				if (component.data && component.data.changed_data && component.data.changed_data.length>0) {
					const save_on_deactivate = typeof component.save_on_deactivate!=='undefined'
						? component.save_on_deactivate
						: true
					if (save_on_deactivate===true) {
						// saves the unsaved value
						component.change_value({
							changed_data	: component.data.changed_data,
							refresh			: false
						})
					}
				}

			// component active status
				component.active = false

			// fix component_active as null
				if (page_globals.component_active && page_globals.component_active.id===component.id) {
					page_globals.component_active = null
				}

			// publish event deactivate_component
				event_manager.publish('deactivate_component', component)

			// section last selection delete
				data_manager.delete_local_db_data(
					'last_section_selection_' + component.section_tipo,
					'status' // string table
				);


			return true
		},//end deactivate



		/**
		* LOCK
		* Marks a component as locked, adding the 'lock' CSS class to its node.
		* Locked components display a visual indicator and typically disable interaction.
		* The locked state is tracked via component.lock (boolean), distinct from
		* component.active which tracks the editing-focus state.
		*
		* @param {Object} component - The full component instance to lock; must have a .node property.
		* @returns {Promise<boolean>} Resolves false if already locked; true when lock was applied.
		*/
		lock : async (component) => {

			// check already lock
				if (component.lock===true) {
					return false
				}

			// styles. Remove wrapper css active if exists
				component.node.classList.add('lock')

			// component lock status
				component.lock = true


			return true
		},//end lock



		/**
		* UNLOCK
		* Removes the locked state from a component by clearing the 'lock' CSS class
		* and setting component.lock = false.
		*
		* @param {Object} component - The full component instance to unlock; must have a .node property.
		* @returns {Promise<boolean>} Resolves false if the component was not locked; true when unlocked.
		*/
		unlock : async (component) => {

			// check already lock
				if (component.lock!==true) {
					return false
				}

			// styles. Remove wrapper css active if exists
				component.node.classList.remove('lock')

			// component lock status
				component.lock = false


			return true
		},//end lock



		/**
		* ERROR
		* Applies or removes the 'error' CSS class on a component wrapper to reflect
		* validation state, and moves focus to the problematic input when error=true.
		*
		* UIUX-05 tolerance: the second argument may be either the component wrapper itself
		* OR a child field element (input/textarea/select). When a field is passed the method
		* climbs the DOM to locate the enclosing wrapper before applying the class, and uses
		* the original element as the focus target. Null / elements without .classList are
		* safely ignored (returns false without throwing).
		*
		* @param {boolean} error - True to mark as errored; false to clear the error state.
		* @param {HTMLElement} input_wrap - The component wrapper OR a field element inside it.
		* @returns {boolean} False if input_wrap is null/invalid; true otherwise.
		*/
		error : (error, input_wrap) => {

			// UIUX-05: tolerate callers that pass the input element itself instead of
			// the wrapper. Resolve the wrapper (climb to it when given a field) and
			// the focusable field in both cases, and no-op safely on a null arg.
			if (!input_wrap || !input_wrap.classList) {
				return false
			}
			const is_field = typeof input_wrap.matches === 'function'
				&& input_wrap.matches('input, textarea, select')
			const wrapper = is_field
				? (input_wrap.closest('.wrapper_component, .input_component, .component') || input_wrap)
				: input_wrap

			if (error) {

				wrapper.classList.add('error')

				const input_node = is_field
					? input_wrap
					: wrapper.querySelector('input, textarea, select')
				if(input_node){
					input_node.focus();
				}

			}else{
				wrapper.classList.remove('error')
			}

			return true
		},//end error



		/**
		* REGENERATE
		* Swaps an existing DOM node in-place by replacing it with new_node inside
		* the same parent. This is the canonical "hot-replace" helper used when a
		* component re-renders: the old node is detached and the new one takes its slot
		* without disturbing siblings or requiring knowledge of the parent's structure.
		*
		* @param {HTMLElement} current_node - The node currently in the DOM to be replaced.
		* @param {HTMLElement} new_node - The new node to insert in its place.
		* @returns {HTMLElement} current_node - The detached (old) node; callers may inspect
		*   it but should not re-attach it since the instance has moved on.
		*/
		regenerate : (current_node, new_node) => {

			current_node.parentNode.replaceChild(new_node, current_node);

			return current_node
		},//end regenerate



		/**
		* ADD_IMAGE_FALLBACK
		* Attaches a one-shot 'error' listener to an <img> element so that when the image
		* fails to load (broken URL, missing file, CORS block) it is replaced with the
		* global page_globals.fallback_image URL.
		* The listener removes itself after firing to prevent an infinite error loop in
		* case the fallback image itself is also unavailable.
		*
		* @param {HTMLElement} img_node - The <img> element to protect with a fallback.
		* @param {Function} [callback] - Optional function called after the fallback src is set.
		* @returns {boolean} Always returns true.
		*/
		add_image_fallback : (img_node, callback) => {

			img_node.addEventListener('error', change_src, true)

			function change_src(item) {

				// remove onerror listener to avoid infinite loop (!)
				item.target.removeEventListener('error', change_src, true);

				// set fallback src to the image
				item.target.src = page_globals.fallback_image

				if(typeof callback==='function'){
					callback()
				}

				return true
			}


			return true
		},//end  add_image_fallback



		/**
		* ADD_COMPONENT_WARNING
		* Adds a small icon badge to the left of a component wrapper to surface a
		* validation or data-quality warning to the editor. The badge container is
		* created once and stored as wrapper_component.warning_wrap; subsequent calls
		* recycle the same container (isConnected guard ensures a disconnected node is
		* not reused after the component was re-rendered).
		*
		* The icon title is shown as a codex-tooltip when the badge enters the DOM.
		* When the badge appears near the left viewport edge, 'right_side' is added so
		* it does not overflow off-screen.
		* Double-clicking the badge removes it from the DOM.
		*
		* @param {HTMLElement} wrapper_component - The component wrapper that will host the badge.
		* @param {string} message - Tooltip text describing the warning.
		* @param {string} [msg_type='alert'] - Icon type: 'alert' renders an exclamation icon;
		*   any other value is used directly as the icon CSS class name.
		* @param {boolean} [clean=true] - When true, removes existing icon buttons before adding
		*   the new one (prevents stacking multiple warnings for the same issue).
		* @param {Function|undefined} [on_click] - Optional click handler attached to the icon button.
		* @returns {HTMLElement} warning_wrap - The badge container element (created or recycled).
		*/
		add_component_warning : (wrapper_component, message, msg_type='alert', clean=true, on_click) => {

			// warning_wrap. always check if already exists and is still in the DOM, else, create a new one and recycle it
				const existing_wrap = wrapper_component.warning_wrap
				const warning_wrap = (existing_wrap && existing_wrap.isConnected)
					? existing_wrap
					: (()=>{

						const new_warning_wrap = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'component_warning fade-in-fast',
							parent			: wrapper_component
						})
						new_warning_wrap.addEventListener('dblclick', (e) => {
							e.stopPropagation()
							warning_wrap.remove()
						})

						// set pointer to component wrapper
						wrapper_component.warning_wrap = new_warning_wrap

						return new_warning_wrap
					})()

			// clean previous buttons
				if (clean===true) {
					// clean
					const items = warning_wrap.querySelectorAll('.button')
					for (let i = items.length - 1; i >= 0; i--) {
						items[i].remove()
					}
				}

			// icon_name. class name of button (defines the icon)
				const icon_name = msg_type==='alert'
					? 'exclamation'
					: msg_type

			// add icon with message text
				const button = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button ' + icon_name,
					title			: message,
					parent			: warning_wrap
				})
				if (on_click) {
					button.addEventListener('click', on_click)
				}

			// when_in_dom event actions
				when_in_dom(button, () => {

					// activate_tooltips title message
					ui.activate_tooltips(warning_wrap)

					// adjust position
					const el_rect = wrapper_component.getBoundingClientRect();
					if (el_rect.left<50) {
						// move from left (default) to right side
						warning_wrap.classList.add('right_side')
					}
				})


			return warning_wrap
		},//end add_component_warning



		/**
		* EXEC_SAVE_SUCCESSFULLY_ANIMATION
		* Triggers a visual feedback animation (usually a green glow/line) on a component's node after a successful save.
		* Handles resets to allow consecutive executions and cleans up state after completion.
		* @param {Object} self - The component instance.
		* @param {HTMLElement} self.node - The DOM element to animate.
		* @returns {Promise<boolean>} Resolves when the animation cycle is complete or skipped.
		*/
		exec_save_successfully_animation : async (self) => {

			const node = self.node

			// Safety checks
			if (self.show_interface?.save_animation === false || !node) {
				return false
			}

			// Reset previous state to allow restarting the animation
			node.classList.remove('save_success')
			node.style.animationPlayState = 'paused'
			node.style.webkitAnimationPlayState = 'paused'

			// Restart logic using idle callback to avoid blocking
			return new Promise((resolve) => {
				dd_request_idle_callback(() => {
					// Check if node still exists after idle delay
					if (!self.node) {
						return resolve(false)
					}

					const active_node = self.node

					// Force a reflow to ensure the browser registers the class removal/addition as a new animation start
					void active_node.offsetWidth

					// Start success animation
					active_node.classList.add('save_success')
					active_node.style.animationPlayState = 'running'
					active_node.style.webkitAnimationPlayState = 'running'

					// Cleanup and resolve after animation duration (2s)
					setTimeout(() => {
						if (self.node) {
							active_node.style.animationPlayState = 'paused'
							active_node.style.webkitAnimationPlayState = 'paused'
							active_node.classList.remove('save_success')
						}
						resolve(true)
					}, 2000)
				})
			})
		},//end exec_save_successfully_animation



	},//end component



	section : {



	},//end section



	area : {


		/**
		* BUILD_WRAPPER_EDIT
		* Builds the area wrapper element for 'edit' mode.
		* Areas are top-level entity containers (e.g., area_thesaurus, area_multimedia);
		* their wrappers differ from component wrappers in that they include the current
		* language abbreviation in the default label and do not carry activation events.
		* Ontology-defined CSS from context.css is applied via set_element_css; the
		* add_class sub-property allows arbitrary classes to be pushed onto 'wrapper' or
		* 'content_data' elements directly from the ontology definition.
		*
		* @param {Object} instance - The area instance; must expose model, type, tipo,
		*   section_tipo, mode, view, label, lang, and context.
		* @param {Object} [items={}] - Sub-elements to slot into the wrapper.
		* @param {HTMLElement|null} [items.label] - Custom label node; null suppresses the label.
		* @param {HTMLElement} [items.content_data] - The main data container node.
		* @returns {HTMLElement} wrapper - The constructed wrapper <div> element.
		*/
		build_wrapper_edit : (instance, items={}) => {

			// short vars
				const model			= instance.model 	// like component_input-text
				const type			= instance.type 	// like 'component'
				const tipo			= instance.tipo 	// like 'rsc26'
				const section_tipo	= instance.section_tipo 	// like 'rsc26'
				const mode			= instance.mode 	// like 'edit'
				const view			= instance.view || null
				const label			= instance.label 	// instance.context.label
				const content_data	= items.content_data || null

			// fragment
				const fragment = new DocumentFragment()

			// label
				if (label===null || items.label===null) {
					// no label add
				}else if(items.label) {
					// add custom label
					fragment.appendChild(items.label)
				}else{
					// default
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'label',
						inner_html		: label + ' [' + instance.lang.substring(3) + ']',
						parent			: fragment
					})
				}

			// content_data
				if (content_data) {
					fragment.appendChild(content_data)
				}

			// wrapper
				const wrapper = document.createElement('div')
				// css
					const ar_css = [
						'wrapper_' + type,
						model,
						tipo,
						section_tipo +'_'+ tipo,
						mode
					]
					if (view) {ar_css.push('view_'+view)}
					wrapper.classList.add(...ar_css)

				// context css new way v6
					if (instance.context && instance.context.css) {
						const selector = `${section_tipo}_${tipo}.edit`
						set_element_css(selector, instance.context.css)
						// add_class
							// sample
							// "add_class": {
							// "wrapper": [
							// 	"bg_warning"
							// ]
							// }
							if (instance.context.css.add_class) {

								for(const selector in instance.context.css.add_class) {
									const values = instance.context.css.add_class[selector]
									const element = selector==='wrapper'
										? wrapper
										: selector==='content_data'
											? content_data
											: null

									if (element) {
										element.classList.add(values)
									}else{
										console.warn("Invalid css class selector was ignored:", selector);
									}
								}
							}
					}
				// append fragment
					wrapper.appendChild(fragment)


			return wrapper
		}//end build_wrapper_edit



	},//end area



	tool : {



		/**
		* BUILD_WRAPPER_EDIT
		* Builds the tool wrapper element with its standard header structure.
		* In all modes except 'mini', a tool_header is created containing:
		*   - A tool_name_container with the tool label (optionally prefixed by the caller's label)
		*     and an optional SVG icon rendered as a CSS mask button.
		*   - An optional description sub-element below the label.
		*   - A tool_buttons_container for action buttons (populated by the tool itself).
		*   - An activity_info_container for status/progress indicators.
		*   - A close button that either calls history.back() (when inside an opener window)
		*     or window.close() (standalone window).
		* Pointer properties (tool_header, tool_buttons_container, activity_info_container,
		* content_data) are stored directly on the wrapper element for fast access by the
		* tool's render pass.
		*
		* @param {Object} instance - The tool instance; must expose model, type, mode, view,
		*   context (with label, description, icon), and constructor.name.
		* @param {Object} [items={}] - Sub-elements to slot into the wrapper.
		* @param {HTMLElement} [items.content_data] - The main data container node.
		* @returns {HTMLElement} wrapper - The constructed wrapper <div> element with header
		*   pointers attached as properties.
		*/
		build_wrapper_edit : (instance, items={})=>{

			// short vars
				const model			= instance.model // like 'tool_lang'
				const type			= instance.type || 'tool' // like 'tool'
				const mode			= instance.mode // like 'edit'
				const view			= instance.view || instance.context.view || null
				const context		= instance.context || {}
				const label			= context.label || ''
				const description	= context.description || ''
				const name			= instance.constructor.name

			// wrapper
				const wrapper = document.createElement('div')
				// css
					const ar_css = [
						'wrapper_' + type,
						model,
						mode
					]
					if (view) {ar_css.push('view_'+view)}
					wrapper.classList.add(...ar_css)

			// fragment
				const fragment = new DocumentFragment()

			if (mode!=='mini') {
				// header
					const tool_header = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'tool_header ' + name,
						parent			: fragment
					})
					// pointer
					wrapper.tool_header = tool_header

				// tool_name_container
					const tool_name_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'tool_name_container',
						parent			: tool_header
					})

					// label
					if (label!==null) {

						// get the string label of the tool with the caller name
						const string_label = (instance.caller?.label)
							? `${label} | ${instance.caller.label}`
							: label

						// default
						const component_label = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'label',
							inner_html		: string_label,
							parent			: tool_name_container
						})

						// icon (optional)
						if (context.icon) {
							const icon = ui.create_dom_element({
								element_type	: 'span',
								class_name		: 'button white',
								style : {
									'-webkit-mask'	: "url('" +context.icon +"')",
									'mask'			: "url('" +context.icon +"')"
								}
							})
							component_label.prepend(icon)
						}
					}

					// description
					if (description!==null) {
						// component_description
						ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'description',
							inner_html		: description,
							parent			: tool_name_container
						})
					}

				// tool_buttons_container
					const tool_buttons_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'tool_buttons_container',
						parent			: tool_header
					})
					// pointer
					wrapper.tool_buttons_container = tool_buttons_container

				// activity_info_container
					const activity_info_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'activity_info_container',
						parent			: tool_header
					})
					// pointer
					wrapper.activity_info_container = activity_info_container

				// button_close (hidden inside modal)
					const button_close = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'button close white',
						parent			: tool_header
					})
					const click_handler = (e) => {
						e.stopPropagation()

						if (prevent_open_new_window()===true) {
							history.back();
						}else{
							window.close();
						}
					}
					button_close.addEventListener('click', click_handler)
			}//end if (mode!=='mini')

			// content_data
				if (items.content_data) {
					fragment.appendChild(items.content_data)
					// set pointers
					wrapper.content_data = items.content_data
				}

			// wrapper
				wrapper.appendChild(fragment)


			return wrapper
		},//end build_wrapper_edit



		/**
		* BUILD_CONTENT_DATA
		* Creates the main content container element for a tool in any mode.
		* Applies the standard 'content_data', type ('tool'), and mode classes so that
		* each tool's CSS rules can target .content_data.tool.<mode> without specificity conflicts.
		*
		* @param {Object} instance - The tool instance; must expose type ('tool') and mode.
		* @param {Object} [options] - Reserved for future use; currently unused.
		* @returns {HTMLElement} content_data - The created <div> element.
		*/
		build_content_data : (instance, options) => {

			// short vars
				const type = instance.type // expected 'tool'
				const mode = instance.mode

			// node
				const content_data = document.createElement('div')

			// css
				content_data.classList.add('content_data', type, mode)


			return content_data
		},//end build_content_data



		/**
		* BUILD_SECTION_TOOL_BUTTON
		* Builds a <button> element that opens a given tool in the context of a section.
		* The button renders a mask-based SVG icon and the tool label; it stores the tool
		* name in data-tool for potential external targeting. On mousedown it calls
		* open_tool (tool_common) with the tool_context and the section as caller.
		* Used by section-level tool slots (distinct from component tool buttons which are
		* smaller icon-only spans; see build_component_tool_button).
		*
		* @param {Object} tool_context - The tool descriptor object from section.tools[];
		*   must include model, name, icon, and label.
		* @param {Object} self - The section instance acting as the tool caller.
		* @returns {HTMLElement} tool_button - The constructed <button> element.
		*/
		build_section_tool_button : (tool_context, self) => {

			// button
				const tool_button = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'warning ' + tool_context.model,
					dataset			: {
						tool : tool_context.name
					}
				})
				// tool_icon (icon inside)
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button white tool',
					style			: {
						'-webkit-mask'	: "url('" +tool_context.icon +"')",
						'mask'			: "url('" +tool_context.icon +"')"
					},
					parent : tool_button
				})
				tool_button.insertAdjacentHTML('beforeend', tool_context.label)

			// Events
				const mousedown_handler = (e) => {
					e.stopPropagation()

					// open_tool (tool_common)
						open_tool({
							tool_context	: tool_context,
							caller			: self
						})
				}
				tool_button.addEventListener('mousedown', mousedown_handler)


			return tool_button
		},//build_section_tool_button



		/**
		* BUILD_COMPONENT_TOOL_BUTTON
		* Builds a small icon <span> button that opens a tool in the context of a component.
		* Unlike build_section_tool_button, this renders only a mask-based SVG icon (no text
		* label) and is sized to fit inline in a component's buttons_container.
		* If tool_context.show_in_component === false the method returns null so that the
		* caller skips appending anything (the tool simply does not appear in that component).
		* The tool name in data-tool allows CSS/JS selectors to target specific tool buttons.
		*
		* @param {Object} tool_context - The tool descriptor from component.tools[];
		*   must include name, icon, and label (used as the tooltip title); show_in_component
		*   controls whether the button is rendered at all.
		* @param {Object} self - The component instance acting as the tool caller.
		* @returns {HTMLElement|null} tool_button - The icon <span> element, or null when
		*   show_in_component is false.
		*/
		build_component_tool_button : (tool_context, self) => {

			// prevent to display into component
				if (tool_context.show_in_component===false) {
					return null
				}

			// button
				const tool_button = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button tool',
					title_label		: tool_context.label,
					style			: {
						'-webkit-mask'	: "url('" +tool_context.icon +"')",
						'mask'			: "url('" +tool_context.icon +"')"
					},
					dataset			: {
						tool : tool_context.name
					}
				})

			// Events
				const mousedown_handler = (e) => {
					e.stopPropagation();

					// open_tool (tool_common)
						open_tool({
							tool_context	: tool_context,
							caller			: self
						})
				}
				tool_button.addEventListener('mousedown', mousedown_handler)


			return tool_button
		}//build_component_tool_button
	},//end tool



	widget : {



		/**
		* BUILD_WRAPPER_EDIT
		* Builds the wrapper element for a widget in edit mode.
		* Widgets are standalone UI units (e.g., calendar pickers, color selectors) that
		* live inside component or tool DOMs but follow their own lifecycle. The wrapper
		* carries the classes 'wrapper_widget', the widget constructor name, and the mode.
		* If items.content_data is provided, 'content_data' and 'widget' classes are added
		* to it before it is placed inside the wrapper (this avoids a separate call to
		* build_content_data in the widget's render method).
		*
		* @param {Object} instance - The widget instance; must expose mode and constructor.name.
		* @param {Object} items - Sub-elements to slot into the wrapper.
		* @param {HTMLElement} [items.content_data] - The widget's main content container.
		* @returns {HTMLElement} wrapper - The constructed wrapper <div> element.
		*/
		build_wrapper_edit : (instance, items)=>{

			// short vars
				const mode	= instance.mode // like 'edit'
				const type	= 'widget'
				const name	= instance.constructor.name

			// fragment
				const fragment = new DocumentFragment()

			// content_data
				if (items.content_data) {
					const content_data = items.content_data
					content_data.classList.add('content_data', type)
					fragment.appendChild(content_data)
				}

			// wrapper
				const wrapper = document.createElement('div')
				// css
					const ar_css = [
						'wrapper_' + type,
						name,
						mode
					]
					wrapper.classList.add(...ar_css)
				// append fragment
				wrapper.appendChild(fragment)


			return wrapper
		}//end build_wrapper_edit
	},//end widget



	/**
	* CREATE_DOM_ELEMENT
	* Generic DOM node factory — the most-called helper in the Dédalo front-end.
	* Accepts a flat options object and returns a fully configured HTMLElement, optionally
	* appended to a parent in the same call. All properties are set only when the
	* corresponding option key is present (no defaults are forced onto the element).
	*
	* Supported options:
	*   element_type {string}      — tag name (default 'div')
	*   id           {string}      — element.id
	*   type         {string}      — element.type (skipped for <textarea>)
	*   href         {string}      — for <a>; omit to leave href unset (CSP-safe; no navigation)
	*   src          {string}      — element.src (images, iframes, etc.)
	*   class_name   {string}      — element.className (space-separated class list)
	*   style        {Object}      — key/value pairs applied via element.style.setProperty
	*   title_label  {string}      — alias for title; HTML tags are stripped before assignment
	*   title        {string}      — same as title_label (title_label takes precedence)
	*   dataset      {Object}      — key/value pairs written to element.dataset
	*   data_set     {Object}      — alias for dataset
	*   value        {*}           — element.value (set when !== undefined)
	*   inner_html   {string}      — inserted via insertAdjacentHTML('afterbegin') — HTML is parsed
	*   text_node    {string}      — plain-text content; SEC-XSS-001: uses textContent not innerHTML
	*                               (for non-span elements, wraps in a <span> with a leading space
	*                               to work around a Chrome text-selection bug)
	*   text_content {string}      — element.textContent (lowest-precedence text setter)
	*   draggable    {boolean}     — element.draggable
	*   contenteditable {string}   — element.contentEditable
	*   name         {string}      — element.name
	*   placeholder  {string}      — element.placeholder
	*   pattern      {string}      — element.pattern
	*   parent       {HTMLElement} — when provided, the new element is appended to this node
	*
	* Text-content priority (mutually exclusive; first match wins):
	*   inner_html > text_node > text_content
	*
	* @param {Object} options - Configuration map (see above).
	* @returns {HTMLElement} element - The newly created and configured DOM element.
	*/
	create_dom_element : function(options) {

		// DOM node element
			const element_type	= options.element_type || 'div'
			const element		= document.createElement(element_type)

		// id. Add id property to element
			if(options.id) {
				element.id = options.id
			}

		// type
			if (options.type && element_type!=='textarea') {
				element.type = options.type
			}

		// element_type. A element. Set href only when explicitly provided.
		// SEC-CSP-001: 'javascript:' URLs are blocked by script-src without
		// 'unsafe-hashes'; omitting href entirely is the CSP-safe default.
			if(element_type==='a') {
				element.href = options.href || 'javascript:;'
			}

		// src. Source for images etc.
			if(options.src) {
				element.src = options.src
			}

		// class_name. Add CSS classes property to element
			if(options.class_name) {
				element.className = options.class_name
			}

		// style. Add CSS style property to element
			if (options.style) {
				for(let key in options.style) {
					element.style.setProperty(key, options.style[key])
				}
			}

		// title . Add title attribute to element
			const title_label = options.title_label || options.title
			if (title_label) {
				element.title = title_label.indexOf('<') !== -1
					? strip_tags(title_label)
					: title_label
			}

		// dataset Add dataset values to element
			const data_set = options.dataset ?? options.data_set
			if (data_set) {
				for (let key in data_set) {
					element.dataset[key] = data_set[key]
				}
			}

		// value
			if (options.value!==undefined) {
				element.value = options.value
			}

		// Text content: + span,
			if(options.inner_html) {
				element.insertAdjacentHTML('afterbegin', options.inner_html)
			}else if (options.text_node) {
				// SEC-XSS-001: text_node is meant to be plain text, not HTML.
				// The old path used insertAdjacentHTML which would parse and execute
				// any HTML markup (including <script>) in what the caller intended
				// as a text label. Both span and non-span branches now use textContent.
				if (element_type==='span') {
					element.textContent = options.text_node
				}else{
					const el = document.createElement('span')
						  // Note that prepend a space to span to prevent Chrome bug on selection
						  el.textContent = " " + options.text_node
					element.appendChild(el)
				}
			}else if(options.text_content) {
				element.textContent = options.text_content
			}

		// draggable
			if(options.draggable) {
				element.draggable = options.draggable
			}

		// contenteditable
			if (options.contenteditable) {
				element.contentEditable = options.contenteditable
			}

		// name
			if(options.name) {
				element.name = options.name
			}

		// placeholder
			if(options.placeholder) {
				element.placeholder = options.placeholder
			}

		// pattern
			if(options.pattern) {
				element.pattern = options.pattern
			}

		// parent. Append created element to parent
			if (options.parent) {
				options.parent.appendChild(element)
			}


		return element;
	},//end create_dom_element



	/**
	* UPDATE_NODE_CONTENT
	* Efficiently replaces all children of a DOM node with new HTML content.
	* Uses the modern replaceChildren() API (O(1) child removal) instead of
	* innerHTML = '' to avoid layout thrash from repeated DOM access. The value
	* is coerced to string via String() so callers may pass numbers or other
	* primitives without pre-conversion. Null/undefined values leave the node
	* empty (only the old children are cleared).
	*
	* @param {HTMLElement} node - The target container to update; no-ops if falsy.
	* @param {string|number|null|undefined} value - HTML string (or coercible value)
	*   to insert via insertAdjacentHTML('afterbegin').
	* @returns {void}
	*/
	update_node_content : function(node, value) {
		if (!node) return
		// Modern and efficient way to clear all children
		node.replaceChildren()
		// Insert new content
		if (value !== null && value !== undefined) {
			node.insertAdjacentHTML('afterbegin', String(value))
		}
	},//end update_node_content



	/**
	* ADD_TOOLS
	* Iterates the instance's tools[] array and appends a button for each tool
	* to the given buttons_container. Tool buttons are built by:
	*   - ui.tool.build_component_tool_button  (when self.type === 'component')
	*   - ui.tool.build_section_tool_button    (for sections and other types)
	* Tools whose model matches the current caller's model are skipped to prevent
	* a tool from embedding itself recursively (e.g., tool_lang inside tool_lang).
	* For each appended button, ontology-defined keyboard shortcuts declared in
	* tool_context.properties.events are wired up via set_tool_event.
	*
	* @param {Object} self - The component or section instance whose tools[] to render;
	*   must expose tools (array), type, and optionally caller (for self-exclusion).
	* @param {HTMLElement} buttons_container - The container to append tool buttons into.
	* @returns {Array} tools - The original self.tools array (or [] if none); callers
	*   may inspect the array but the return value is rarely needed.
	*/
	add_tools : function(self, buttons_container) {

		const tools			= self.tools || []
		const tools_length	= tools.length

		for (let i = 0; i < tools_length; i++) {

			const tool_context = tools[i]

			// avoid self tool inside tool
			if (self.caller && self.caller.model===tool_context.name) {
				continue;
			}

			const tool_button = (self.type==='component')
				? ui.tool.build_component_tool_button(tool_context, self)
				: ui.tool.build_section_tool_button(tool_context, self)

			if (tool_button) {
				buttons_container.appendChild(tool_button)

				// button events. Configured in tool properties. See tool_ontology definition
					// sample:
					// "events": [
					// 	{
					// 	  "type": "keyup",
					// 	  "action": "click",
					// 	  "validate": [
					// 		{
					// 		  "key": "ctrlKey",
					// 		  "value": true
					// 		},
					// 		{
					// 		  "key": "key",
					// 		  "value": "s"
					// 		}
					// 	  ]
					// 	}
					// ]
					if (tool_context.properties?.events) {
						const tool_events_length = tool_context.properties.events.length
						for (let i = 0; i < tool_events_length; i++) {

							const tool_event = tool_context.properties.events[i]

							set_tool_event({
								tool_event	: tool_event,
								tool_button	: tool_button
							})
						}
					}
			}
		}


		return tools
	},//end add_tools



	/**
	* PLACE_ELEMENT
	* Places a source DOM node into a target instance's rendered DOM, with graceful
	* deferral when the target instance has not yet been rendered.
	*
	* Two execution paths:
	*  1. Target already rendered (target_instance.status === 'rendered'):
	*     Locates container_selector inside target_instance.node and either appends
	*     (place_mode === 'add') or replaces (default 'replace') the existing node
	*     matching target_selector.
	*  2. Target not yet rendered:
	*     Subscribes to the 'render_<target_instance.id>' event (published by the
	*     target instance when its wrapper is ready) and appends source_node then.
	*     The subscription token is pushed onto source_instance.events_tokens so it
	*     is cleaned up with the rest of the source instance's event subscriptions.
	*
	* Primary use-case: section_record sends component_filter nodes to the inspector
	* panel, which may not yet be in the DOM when the component builds.
	*
	* @param {Object} options - Placement configuration.
	* @param {HTMLElement} options.source_node - The DOM node to move/place.
	* @param {Object} options.source_instance - The instance that owns source_node
	*   (used to register deferred event tokens).
	* @param {Object} options.target_instance - The instance whose DOM will receive source_node.
	* @param {string} options.container_selector - CSS selector for the container inside target.
	* @param {string} options.target_selector - CSS selector for the element to replace inside container.
	* @param {string} [options.place_mode='replace'] - 'replace' swaps the existing node;
	*   'add' appends source_node alongside any existing node.
	* @returns {boolean} False if target_instance is missing; true otherwise.
	*/
	place_element : function(options) {

		// options
			const source_node			= options.source_node // like node of component_filter
			const source_instance		= options.source_instance // like section
			const target_instance		= options.target_instance // like inspector instance
			const container_selector	= options.container_selector // like .project_container
			const target_selector		= options.target_selector // like .wrapper_component.component_filter
			const place_mode			= options.place_mode || 'replace' // like 'add' | 'replace'

		if (!target_instance) {
			console.error("[ui.place_element] Error on get target instance:", options);
			return false
		}

		if (target_instance.status==='rendered') {

			if (target_instance.node===null) {
				console.error('Error. Instance node not found:', target_instance);
			}

			const target_container	= target_instance.node.querySelector(container_selector)
			const target_node		= target_container.querySelector(target_selector)
			if (!target_node) {
				// first set inside container. Append
				target_container.appendChild(source_node)
			}else{
				// already exist target node like 'wrapper_x'. Replace or add
				if (place_mode==='add') {
					target_container.appendChild(source_node)
				}else{
					target_node.parentNode.replaceChild(source_node, target_node)
				}
			}

		}else{

			// target_instance node not ready case
			let token
			const render_handler = (instance_wrapper) => {
				const target_container = instance_wrapper.querySelector(container_selector)
				if (target_container) {
					target_container.appendChild(source_node)
				}
				event_manager.unsubscribe(token)
			}
			token = event_manager.subscribe('render_'+target_instance.id, render_handler)
			source_instance.events_tokens.push(token)
		}


		return true
	},//end place_element



	/**
	* TOGGLE_INSPECTOR
	* Toggles the visibility of the section inspector panel.
	* When hiding, adds 'full_width' to the section wrapper so that the content
	* area expands to fill the space the inspector occupied. When showing, both
	* classes are reversed. No-ops gracefully when there is no inspector in the
	* DOM or when there is no section wrapper in edit mode.
	*
	* @returns {void}
	*/
	toggle_inspector : () => {

		const inspector_wrapper = document.querySelector('.inspector')
		if (inspector_wrapper) {

			const wrapper_section = document.querySelector('.wrapper_section.edit')
			if (!wrapper_section) {
				return
			}

			if (inspector_wrapper.classList.contains('hide')) {
				inspector_wrapper.classList.remove('hide')
				wrapper_section.classList.remove('full_width')
			}else{
				inspector_wrapper.classList.add('hide')
				wrapper_section.classList.add('full_width')
			}
		}
	},//end toggle_inspector



	/**
	* COLLAPSE_TOGGLE_TRACK
	* Attaches a persistent open/closed toggle to an inspector block (e.g., the
	* 'Relations' or 'Properties' panels). The state is stored in the local IndexedDB
	* ('status' table) under collapsed_id so it survives page reloads.
	*
	* Persistence contract:
	*   - default_state === 'opened' (default): a record in the DB means "collapsed".
	*     Deletion == open state. Avoids writing anything for the common open case.
	*   - default_state === 'closed': absence means "never toggled" (stay closed).
	*     A value=false record means "user explicitly opened it".
	*
	* On initial render, get_local_db_data is called to read the saved state and
	* apply it immediately. The toggler element then receives a click listener
	* (fn_toggle_collapse) that flips the state and persists the change.
	*
	* @param {Object} options - Configuration.
	* @param {HTMLElement} options.toggler - The clickable element (usually a label/header).
	* @param {HTMLElement} options.container - The body element to show/hide.
	* @param {string} options.collapsed_id - Unique key for the local DB record.
	* @param {Function} [options.collapse_callback] - Called whenever the container is hidden.
	* @param {Function} [options.expose_callback] - Called whenever the container is shown.
	* @param {string} [options.default_state='opened'] - Initial state when no DB record exists:
	*   'opened' (visible by default) or 'closed' (hidden by default).
	* @returns {boolean} Always returns true.
	*/
	collapse_toggle_track : (options) => {

		// options
			const toggler			= options.toggler // DOM item (usually label)
			const container			= options.container // DOM item (usually the body)
			const collapsed_id		= options.collapsed_id // id to set DDBB record id
			const collapse_callback	= options.collapse_callback // function
			const expose_callback	= options.expose_callback // function
			const default_state		= options.default_state || 'opened' // opened | closed . default body is exposed (open)


		// local DDBB table
			const collapsed_table = 'status'

		// content data state
			data_manager.get_local_db_data(collapsed_id, collapsed_table, true)
			.then(function(ui_status){

				// (!) Note that ui_status only exists when element is collapsed
				const is_collapsed = typeof ui_status==='undefined' || ui_status.value===false
					? false
					: true

				if (is_collapsed) {

					if (!container.classList.contains('hide')) {
						container.classList.add('hide')
					}

					// exec function
					if (typeof collapse_callback==='function') {
						collapse_callback()
					}

				}else{

					if (default_state==='closed' && !ui_status) {

						// Nothing to do. Is the first time access. Not is set the local_db_data yet

					}else{

						container.classList.remove('hide')
						// exec function
						if (typeof expose_callback==='function') {
							expose_callback()
						}
					}
				}
			})

		// event attach
			toggler.addEventListener('click', fn_toggle_collapse)

		// fn_toggle_collapse
			function fn_toggle_collapse(e) {
				e.stopPropagation()

				const collapsed	= container.classList.contains('hide')
				if (!collapsed) {

					// close

					// add record to local DB
						const data = {
							id		: collapsed_id,
							value	: true
						}
						data_manager.set_local_db_data(
							data,
							collapsed_table
						)

					container.classList.add('hide')

					// exec function
					if (typeof collapse_callback==='function') {
						collapse_callback()
					}
				}else{

					// open

					// remove record from local DB (or set value=false)
					if (default_state==='opened') {
						// default case for section_group, inspector_project, etc.
						data_manager.delete_local_db_data(
							collapsed_id,
							collapsed_table
						)
					}else{
						// when default is closed, we need to store the state as NOT collapsed
						// to prevent an infinite loop
						const data = {
							id		: collapsed_id,
							value	: false
						}
						data_manager.set_local_db_data(
							data,
							collapsed_table
						)
					}

					container.classList.remove('hide')

					// exec function
					if (typeof expose_callback==='function') {
						expose_callback()
					}
				}
			}


		return true
	},//end collapse_toggle_track



	/**
	* BUILD_SELECT_LANG
	* Builds a <select> element populated with language options.
	* The language list may be provided as an array of {value, label} objects or as an
	* associative object ({lang_code: label_string}); both formats are normalised to the
	* array form internally. Falls back to page_globals.dedalo_projects_default_langs, and
	* then to a hard-coded English entry if neither is available.
	* The option matching options.selected (or page_globals.dedalo_application_lang) is
	* pre-selected. If options.action is provided it is wired to the 'change' event.
	*
	* @param {Object} options - Configuration.
	* @param {string|null} [options.id] - id attribute for the <select>.
	* @param {string|null} [options.name] - name attribute for the <select>.
	* @param {Array|Object} [options.langs] - Language list; see format notes above.
	* @param {string} [options.selected] - The lang code to pre-select (e.g. 'lg-eng').
	* @param {Function|null} [options.action] - onChange handler.
	* @param {string} [options.class_name='select_lang'] - CSS class for the <select>.
	* @returns {HTMLElement} select_lang - The constructed <select> element with <option> children.
	*/
	build_select_lang : (options) => {

		// options
			const id			= options.id || null
			const name			= options.name || null
			const langs			= options.langs ||
								  page_globals.dedalo_projects_default_langs ||
								  [{
									label : 'English',
									value : 'lg-eng'
								  }]
			const selected		= options.selected || page_globals.dedalo_application_lang || 'lg-eng'
			const action		= options.action || null
			const class_name	= options.class_name || 'select_lang'

		const fragment = new DocumentFragment()

		// unify format from object to array
			const ar_langs = (!Array.isArray(langs))
				// object case (associative array)
				? (()=>{
					const ar_langs = []
					for (const lang in langs) {
						ar_langs.push({
							value : lang,
							label : langs[lang]
						})
					}
					return ar_langs
				})()
				// default array of objects case
				: langs

		// iterate array of langs and create option for each one
			const ar_langs_length = ar_langs.length
			for (let i = 0; i < ar_langs_length; i++) {

				const current_option = ui.create_dom_element({
					element_type	: 'option',
					value			: ar_langs[i].value,
					inner_html		: ar_langs[i].label,
					parent			: fragment
				})
				// selected options set on match
				if (ar_langs[i].value===selected) {
					current_option.selected = true
				}
			}

		// select
			const select_lang = ui.create_dom_element({
				id				: id,
				name			: name,
				element_type	: 'select',
				class_name		: class_name
			})
			if (action) {
				select_lang.addEventListener('change', action)
			}
			select_lang.appendChild(fragment)


		return select_lang
	},//end build_select_lang



	/**
	* ATTACH_TO_MODAL
	* Insert content into a dd-modal custom element (Web Component).
	* Generic point for rendering modals across the application. Used by components,
	* sections, widgets and tools to display temporary information such as options,
	* validation, confirmation dialogs, etc.
	*
	* Lifecycle:
	* 1. Creates a <dd-modal> element and appends it to modal_parent
	* 2. Slots header/body/footer into the shadow DOM (blank hidden divs fill empty slots)
	* 3. Sets data-size attribute which triggers attributeChangedCallback → _showModal*()
	* 4. On close: publish_close fires 'modal_close' event, then on_close removes the element
	*    and restores the previously active component selection.
	*
	* Drag: the modal header is draggable. On first mousedown the CSS-centered position
	* is pinned to inline styles (position:absolute, margin:0) so the modal stays under
	* the cursor without jumping.
	*
	* @param {Object} options - Configuration.
	* @param {HTMLElement|string} options.header - Slotted into the header slot. A string is auto-wrapped in a div.
	* @param {HTMLElement|string} options.body - Slotted into the body slot. A string is auto-wrapped in a div.
	* @param {HTMLElement|string} options.footer - Slotted into the footer slot. A string is auto-wrapped in a div.
	* @param {string} [options.size='normal'] - Modal size variant: 'normal' | 'big' | 'small'.
	* @param {HTMLElement} [options.modal_parent] - Container for the <dd-modal> element
	*   (default: .wrapper.page or document.body).
	* @param {boolean} [options.remove_overlay=false] - When true, weakens the overlay background.
	* @param {boolean} [options.minimizable=true] - Shows or hides the minimize button.
	* @param {Function|null} [options.on_close] - Called after the modal is removed from the DOM.
	* @param {Function|null} [options.callback] - Called with the <dd-modal> element when it is ready
	*   for custom styling. To set a custom width:
	*   callback: (dd_modal) => { dd_modal.modal_content.style.width = '34rem' }
	* @returns {HTMLElement} modal_container - The <dd-modal> element.
	*/
	attach_to_modal : (options) => {

		// options
			const header = options.header
				? (typeof options.header==='string')
					? ui.create_dom_element({ // string case. auto-create the header node
						element_type	: 'div',
						class_name		: 'header content',
						inner_html		: options.header
					  })
					: options.header // DOM node
				: null
			const body = options.body
				? (typeof options.body==='string')
					? ui.create_dom_element({ // string case. auto-create the body node
						element_type	: 'div',
						class_name		: 'body content',
						inner_html		: options.body
					  })
					: options.body // DOM node
				: null
			const footer = options.footer
				? (typeof options.footer==='string')
					? ui.create_dom_element({ // string case. auto-create the footer node
						element_type	: 'div',
						class_name		: 'footer content',
						inner_html		: options.footer
					  })
					: options.footer // DOM node
				: null
			const size				= options.size || 'normal' // string size='normal'
			const modal_parent		= options.modal_parent || document.querySelector('.wrapper.page') || document.body
			const remove_overlay	= options.remove_overlay ?? false
			const minimizable		= options.minimizable ?? true
			const on_close			= options.on_close ?? null
			const callback			= options.callback ?? null

		// previous_component_selection. Current active component before open the modal
			const previous_component_selection = page_globals.component_active || null

		// page_y_offset. Current window scroll position (used to restore later)
			const page_y_offset = window.scrollY || 0

		// modal container build new DOM on each call and remove on close
			const modal_container = document.createElement('dd-modal')
			modal_parent.appendChild(modal_container)

		// modal_node
			const modal_node = modal_container.get_modal_node()

		// remove_overlay
			if (remove_overlay===true) {
				modal_node.classList.add("remove_overlay")
			}

		// publish close event
			modal_container.publish_close = function(e) {
				event_manager.publish('modal_close', e)
			}

		// header. Add node header to modal header and insert it into slot
			if (header) {
				header.slot = 'header'
				if (!header.classList.contains('header')) {
					header.classList.add('header')
				}
				modal_container.appendChild(header)
				modal_container.header = header
			}else{
				const header = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'hide'
				})
				header.slot = 'header'
				modal_container.appendChild(header)
				modal_container.header = header
			}

		// body. Add  wrapper to modal body and insert it into slot
			if (body) {
				body.slot = 'body'
				if (!body.classList.contains('body')) {
					body.classList.add('body')
				}
				modal_container.appendChild(body)
				modal_container.body = body
			}else{
				const body = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'hide'
				})
				body.slot = 'body'
				modal_container.appendChild(body)
				modal_container.body = body
			}

		// footer. Add node footer to modal footer and insert it into slot
			if (footer) {
				footer.slot = 'footer'
				if (!footer.classList.contains('footer')) {
					footer.classList.add('footer')
				}
				modal_container.appendChild(footer)
				modal_container.footer = footer
			}else{
				const footer = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'hide'
				})
				footer.slot = 'footer'
				modal_container.appendChild(footer)
				modal_container.footer = footer
			}

		// remove_miniModal
			if(minimizable===false){
				modal_container.remove_miniModal();
			}

		// size. Modal special features based on property 'size'
			// If you need a custom size, set options callback (when node is really accessible) as
			// callback	: (dd_modal) => {
			//		dd_modal.modal_content.style.width = '20rem'
			// }
			switch(size) {
				case 'big' : {
					// hide contents to avoid double scrollbars
					const content_data_page	= document.querySelector('.content_data.page')
					const debug_div			= document.getElementById('debug')

					// show hidden elements again on close
					const modal_close_handler = () => {

						if(content_data_page) {
							content_data_page.classList.remove('hide')
						}

						if(debug_div) {
							debug_div.classList.remove('hide')
						}

						// scroll window to previous scroll position
						window.scrollTo({
							top			: page_y_offset,
							behavior	: 'auto'
						})
					}
					event_manager.subscribe_once('modal_close', modal_close_handler)

					modal_container.dataset.size = 'big';
					break;
				}
				case 'small' :
					modal_container.dataset.size = 'small';
					break;

				case 'normal' :
				default :
					modal_container.dataset.size = 'normal';
					break;
			}

		// remove on close
			modal_container.on_close = () => {

				modal_container.remove()

				if (typeof on_close==='function') {
					// exec callback
					on_close()
				}

				// re-activate previous component selection
				if (previous_component_selection) {
					ui.component.activate(previous_component_selection)
				}
			}

		// callback. Here the modal_container is ready and you can set styles safely
			if (callback && typeof callback==='function') {
				callback(modal_container)
			}

		// modal_container mousedown event
			modal_container.addEventListener('mousedown', deactivate_components)


		return modal_container
	},//end attach_to_modal



	/**
	* ACTIVATE_FIRST_COMPONENT
	* After a new record is created, finds and activates the first editable component
	* in the section so the user can start typing without having to click.
	* Skips display-only models (component_publication, component_info,
	* component_radio_button, component_section_id, component_dataframe) and any
	* additional models supplied in options.avoid_models.
	*
	* Search strategy:
	*  1. Find the first ddo_map entry whose model starts with 'component_' and is not
	*     in the avoid_models list.
	*  2. Locate the corresponding instance in get_all_instances() by matching tipo,
	*     section_tipo, section_id, and parent.
	*  3. When the component node is ready in the DOM (when_in_dom), call ui.component.activate.
	*
	* @param {Object} options - Configuration.
	* @param {Object} options.section - The section instance (must expose
	*   request_config_object.show.ddo_map, section_tipo, and section_id).
	* @param {string[]} [options.avoid_models] - Additional component model names to skip.
	* @returns {boolean} False if no suitable first component was found; true otherwise.
	*/
	activate_first_component : (options) => {

		// options
			const section		= options.section // section instance
			const avoid_models	= options.avoid_models || [
				'component_publication',
				'component_info',
				'component_radio_button',
				'component_section_id',
				'component_dataframe'
			]

		// short vars
			const ddo_map		= section.request_config_object.show.ddo_map
			const section_tipo	= section.section_tipo
			const section_id	= section.section_id

		// first_ddo
			const first_ddo = ddo_map.find(el =>
				el.model.indexOf('component_')!==-1 &&
				!avoid_models.includes(el.model)
			)
			if (!first_ddo) {
				if(SHOW_DEBUG===true) {
					console.log('Ignored first_dd not found in ddo_map:', ddo_map)
				}
				return false
			}

		// instance search. Get the instance of the component that was created by the section in build-render process
			const all_instances	= get_all_instances()
			const component		= all_instances.find( el =>
				el.tipo === first_ddo.tipo &&
				el.section_tipo === section_tipo &&
				el.section_id === section_id &&
				el.parent === section_tipo
			)

		// activate component
		// If the component is ready and the section is in DOM, activate it and focus his input node.
			if(component && component.node) {
				when_in_dom(component.node, function() {
					// activate the component in DOM
					ui.component.activate(component)
				})
			}


		return true
	},//end activate_first_component



	/**
	* DO_SEARCH
	* (!) UNFINISHED / DEAD CODE — This function is not called anywhere in production.
	* Intended to highlight a search term inside a contenteditable element by building
	* a DOM Range from the matched text offset, but the implementation is incomplete:
	* the sel variable is commented out, the range is hardcoded to [0,3], and getText()
	* has a bug in its do-while loop condition (node == node.firstChild / nextSibling).
	* Do not use. Retained per project policy (never delete commented-out code).
	*
	* @param {string} search_text - The text to search for (regex-escaped internally).
	* @param {HTMLElement} contenteditable - The contenteditable element to search within.
	* @returns {void}
	*/
	do_search : (search_text, contenteditable) =>{

		// get the regex
		const regext_text	= search_text.replace(/([.*+?^=!:${}()|[\]\/\\])/g, '\\$1');
		const regext		= RegExp(regext_text, 'g')

		// const regext_text = search_text.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&').replace(/\s/g, '[^\\S\\r\\n]');
		// const regext_text = search_text.replace(/([.*+?^=!:${}()|[\]\/\\])/g, '\\$1');
		// const regex = new RegExp(regext_text)

		const text = getText(contenteditable)

		let match = regext.exec(text)

			const endIndex = match.index + match[0].length;
			const startIndex = match.index;
				console.log("endIndex:",endIndex);
				console.log("startIndex:",startIndex);

			const range = document.createRange();
			range.setStart(contenteditable, 0);
			range.setEnd(contenteditable, 3);
			// const sel = window.getSelection();

		// const regext = (text, full_word) => {
		// 	const regext_text = text.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&').replace(/\s/g, '[^\\S\\r\\n]');
		// 	return wholeWord ? '\\b' + escapedText + '\\b' : escapedText;
		// };

			function getText(node) {

				// if node === text_node (3), text inside an Element or Attr. don't has other nodes and return the full data
				if (node.nodeType === Node.TEXT_NODE) {
					return [node.data];
				}

				var txt = [''];
				var i = 0;

				if (node == node.firstChild) do {

					if (node.nodeType === Node.TEXT_NODE) {
						txt[i] += node.data;
						continue;
					}

					var innerText = getText(node);

					if (typeof innerText[0] === 'string') {
						// Bridge nested text-node data so that they're
						// not considered their own contexts:
						// I.e. ['some', ['thing']] -> ['something']
						txt[i] += innerText.shift();
					}
					if (innerText.length) {
						txt[++i] = innerText;
						txt[++i] = '';
					}

				} while (node == node.nextSibling);

				return txt;
			}
	},//end do_search



	/**
	* RENDER_LIST_HEADER
	* Builds the column-header row for section list views and component_portal tables.
	* Handles both flat column maps and nested (sub-header) column maps:
	*   - Flat: one .head_column div per entry with an optional sort arrow.
	*   - Nested: when column.columns_map exists, a .sub_header div is added beneath the
	*     parent header cell and the CSS grid-template-columns for the sub-row is computed
	*     via flat_column_items then injected with set_element_css.
	*
	* Sort arrows (add_column_order_set) are attached only when allow_column_order returns
	* true for the column. All created sort_node elements are stored in header_wrapper.sort_nodes
	* so that exec_order can reset their active styles when a new sort is applied.
	*
	* Extra context classes are added to header_wrapper:
	*   - 'with_initiator' when the URL contains an 'initiator' query parameter.
	*   - 'with_debug_info_bar' when SHOW_DEBUG is true (adds a developer info strip).
	*
	* @param {Array} columns_map - Array of column descriptor objects; each must include
	*   at least { id, label } and optionally { sortable, columns_map, tipo, path, width }.
	* @param {Object} self - The section or component_portal instance.
	* @returns {HTMLElement} header_wrapper - The .header_wrapper_list element with all
	*   column headers and sort_nodes pointer array attached.
	*/
	render_list_header : (columns_map, self) =>{

		// header_wrapper
			const header_wrapper = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'header_wrapper_list ' + self.model
			})

		const ar_nodes				= []
		const sort_nodes			= []
		const columns_map_length	= columns_map.length
		for (let i = 0; i < columns_map_length; i++) {

			// column
				const column = columns_map[i]
				if (!column) {
					console.warn("ignored empty component: [key, columns_map]", i, columns_map);
					continue;
				}

			// label
				const label = []
				const current_label = SHOW_DEBUG
					? column.label
					: column.label
				label.push(current_label)

			// node header_item
				const id			= column.id
				const header_item	= ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'head_column ' + id
				})
				// item_text
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'name',
					title			: label.join(' '),
					inner_html		: label.join(' '),
					parent			: header_item
				})

			// sub header items
				if(column.columns_map){

					header_item.classList.add('with_sub_header')
					if (!header_item.hasChildNodes()) {
						// item_text include once
						ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'name',
							title			: label.join(' '),
							inner_html		: label.join(' '),
							parent			: header_item
						})
					}

					const sub_header = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'sub_header',
						parent			: header_item
					})

					// grid column calculate
						const items				= ui.flat_column_items(column.columns_map)
						const template_columns	= items.join(' ')
						const css_object = {
							'.sub_header' : {
								'grid-template-columns' : template_columns
							}
						}
						const selector = 'head_column.'+id
						set_element_css(selector, css_object)

					const current_column_map	= column.columns_map
					const columns_map_length	= current_column_map.length
					for (let j = 0; j < columns_map_length; j++) {
						const current_column  = current_column_map[j]
						// node header_item
						const id				= current_column.id
						const sub_header_item	= ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'head_column ' + id,
							parent			: sub_header
						})
						// item_text
						ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'name',
							title			: current_column.label,
							inner_html		: current_column.label,
							parent			: sub_header_item
						})

						// add sort column icons
							if (ui.allow_column_order(self, current_column)===true) {
								const sort_node = ui.add_column_order_set(self, current_column, header_wrapper)
								sort_nodes.push(sort_node)
								sub_header_item.appendChild(sort_node)
							}
					}
				}else{
					// add sort column icons
						if (ui.allow_column_order(self, column)===true) {
							const sort_node = ui.add_column_order_set(self, column, header_wrapper)
							sort_nodes.push(sort_node)
							header_item.appendChild(sort_node)
						}
				}

			ar_nodes.push(header_item)
		}//end for (let i = 0; i < columns_length; i++)

		// header_wrapper pointers add
			header_wrapper.sort_nodes = sort_nodes

		// header_wrapper
			const searchParams = new URLSearchParams(window.location.href);
			const initiator = searchParams.has('initiator')
				? searchParams.get('initiator')
				: false

			if (initiator!==false) {
				header_wrapper.classList.add('with_initiator')
			}else if (SHOW_DEBUG===true) {
				header_wrapper.classList.add('with_debug_info_bar')
			}

		// regular columns append
			const ar_nodes_length = ar_nodes.length
			for (let i = 0; i < ar_nodes_length; i++) {
				header_wrapper.appendChild(ar_nodes[i])
			}


		return header_wrapper
	},//end render_list_header



	/**
	* ALLOW_COLUMN_ORDER
	* Determines whether a sort arrow should be rendered for the given column in the
	* list header. Two distinct behaviours depending on the caller type:
	*
	*   Section lists: any column marked sortable=true in the context can be ordered;
	*     the sort is applied to the SQO (view-time only, not persisted to storage).
	*
	*   component_portal: ordering is a persistent server-side reorder of the stored
	*     locator array. It is gated by three additional guards:
	*       1. The portal must be in 'edit' mode with write permissions (> 1).
	*       2. The portal source must not be 'external' (external portals are read-only).
	*       3. The ontology property sort_by_column must be either true (allow all) or
	*          an array of column tipos that explicitly includes column.tipo.
	*
	* @see add_column_order_set
	* @param {Object} self - The section or component_portal instance.
	* @param {Object} column - A columns_map item; must expose sortable (boolean) and tipo.
	* @returns {boolean} True when a sort button should be rendered for this column.
	*/
	allow_column_order(self, column) {

		// column must be sortable in any case (calculated from context 'sortable')
			if (column.sortable!==true) {
				return false
			}

		// section case. All sortable columns are orderable
			if (self.constructor.name==='section') {
				return true
			}

		// component_portal case. Edit mode with edit permissions and
		// non external source only, gated by the 'sort_by_column' property
			if (self.model==='component_portal'
				&& self.mode==='edit'
				&& self.permissions > 1
				&& self.context?.properties?.source?.mode!=='external'
				) {
				const sort_by_column = self.context?.properties?.sort_by_column
				return sort_by_column===true
					|| (Array.isArray(sort_by_column) && sort_by_column.includes(column.tipo))
			}


		return false
	},//end allow_column_order



	/**
	* ADD_COLUMN_ORDER_SET
	* Creates and returns a sort-arrow <span> for a column header cell.
	* The span's active direction class ('asc' or 'desc') reflects the current sort
	* state read from self.column_order_state (portal) or self.rqo.sqo.order (section).
	*
	* Interaction model:
	*   - mouseenter: if no column in header_wrapper.sort_nodes is active and another
	*     sort is already applied, the default_direction flips from DESC to ASC (so the
	*     first click on a new column sorts ascending when another is already descending).
	*   - click: toggles the direction (ASC↔DESC) and calls exec_order(direction).
	*     FEJS-01: a 'loading' guard class prevents double-clicks during async portal
	*     reorders. Errors are caught and surfaced via ui.notification.create if available.
	*
	* exec_order (internal closure):
	*   - Portal: calls self.sort_by_column(column, direction) — server round-trip.
	*   - Section: builds an SQO order array and calls self.navigate() with a callback
	*     that updates request_config_object.sqo.order and rqo.sqo.order in sync.
	*   After either path, resets all sort_nodes styles and applies the new direction class.
	*
	* @param {Object} self - The section or component_portal instance.
	* @param {Object} column - The column descriptor; must expose path (section case),
	*   tipo (portal case), and sortable.
	* @param {HTMLElement} header_wrapper - The header container; must have a sort_nodes
	*   array attached (populated by render_list_header) for cross-column style resets.
	* @returns {HTMLElement} sort_node - The sort-arrow <span> element (callers append it
	*   to the appropriate header_item node).
	*/
	add_column_order_set(self, column, header_wrapper) {

		// short vars
			const path				= column.path
			const is_portal			= self.model==='component_portal'
			const title_asc			= (get_label.sort || 'Sort') + ' ' + (get_label.ascending || 'ascending')
			const title_desc		= (get_label.sort || 'Sort') + ' ' + (get_label.descending || 'descending')
			let default_direction	= 'DESC'
			let current_direction	= undefined

		// current_direction. default is undefined
			if (is_portal) {
				// portal case. Last applied column order (ephemeral, advisory only:
				// manual drag and drop can change the stored order at any time)
				if (self.column_order_state && self.column_order_state.tipo===column.tipo) {
					current_direction = self.column_order_state.direction
				}
			}else{
				// section case. current order current_direction check from sqo
				const sqo_order = self.rqo?.sqo?.order || null
				if (sqo_order) {

					const sqo_order_length = sqo_order.length
					for (let i = 0; i < sqo_order_length; i++) {

						const item = sqo_order[i]

						const last_path	= item.path[item.path.length-1]
						if (last_path.component_tipo===column.tipo) {
							current_direction = item.direction
							break;
						}
					}
				}
			}

		// exec_order function
			const exec_order = (direction) => {

				// FEJS-01: capture the portal re-order promise so the click handler
				// can await it (loading state + error surfacing). undefined for the
				// section case (navigate handles its own lifecycle).
				let order_promise = null
				if (is_portal) {

					// portal case. Persistently re-order the stored locator array
					// by the column value (the order is resolved and saved in the server)
						order_promise = self.sort_by_column(column, direction)
				}else{

					// sample
						// [
						//    {
						//        "direction": "DESC",
						//        "path": [
						//            {
						//                "name": "Code",
						//                "model": "component_input_text",
						//                "section_tipo": "oh1",
						//                "component_tipo": "oh14"
						//            }
						//        ]
						//    }
						// ]

					// order sqo build
						const order = [{
							direction : direction, // ASC|DESC
							path : path
						}]

					// update rqo (removed way. navigate from page directly wit a user_navigation event bellow)
					// note that navigate only refresh current instance content_data, not the whole page
						self.navigate({
							callback : async () => { // callback
								self.request_config_object.sqo.order	= order
								self.rqo.sqo.order						= order
							},
							navigation_history : true // bool navigation_history save
						})
				}

				// update current_direction
					current_direction = direction

				// reset all other sort nodes styles
					const sort_nodes		= header_wrapper.sort_nodes
					const sort_nodes_length	= sort_nodes.length
					for (let i = 0; i < sort_nodes_length; i++) {
						sort_nodes[i].classList.remove('asc','desc')
					}

				// set current class
					sort_node.classList.add( direction.toLowerCase() )

				// update title
					sort_node.title = direction==='DESC'
						? title_asc
						: title_desc

				return order_promise
			}

		// title
			const title = current_direction && current_direction==='DESC'
				? title_asc
				: title_desc

		// sort_node
			const sort_node = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'order',
				title			: title
			})
			// set current style
			if (current_direction) {
				sort_node.classList.add( current_direction.toLowerCase() )
			}
			// mouseenter
			sort_node.addEventListener('mouseenter', function(){
				// selected is self. Nothing to do
				if (current_direction) {
					return
				}

				// check if any other sort item is used
				// if true, change default action from desc to asc
				const sort_nodes		= header_wrapper.sort_nodes
				const sort_nodes_length	= sort_nodes.length
				for (let i = 0; i < sort_nodes_length; i++) {
					if (sort_nodes[i].classList.contains('asc') || sort_nodes[i].classList.contains('desc')) {
						default_direction = 'ASC'
						sort_node.title = title_asc
						break;
					}
				}
			})
			// click
			sort_node.addEventListener('click', async function(e){
				e.stopPropagation()

				// FEJS-01: the portal re-order is a server round-trip. Guard against
				// double-clicks while it runs, show a loading state, and surface
				// errors instead of discarding the (previously unawaited) promise.
				if (sort_node.classList.contains('loading')) {
					return
				}

				const direction = current_direction
					? current_direction==='ASC' ? 'DESC' : 'ASC' // reverse current value
					: default_direction // defaults

				sort_node.classList.add('loading')
				try {
					await exec_order(direction)
				} catch (err) {
					console.error('Error sorting by column', err)
					if (typeof ui.notification?.create === 'function') {
						ui.notification.create({
							msg		: 'Error sorting by column',
							type	: 'error'
						})
					}
				} finally {
					sort_node.classList.remove('loading')
				}
			})


		return sort_node
	},//end add_column_order_set



	/**
	* FLAT_COLUMN_ITEMS
	* Recursively flattens a columns_map array into a CSS grid-template-columns value list.
	* Each item produces one entry:
	*   - item.width defined      → use the explicit width string (e.g. '12rem').
	*   - item.model in defaults  → use the model-specific default (e.g. '102px' for media).
	*   - item.columns_map        → recurse and use the sub-column count as the fr unit
	*                               (e.g. 3 sub-columns → '3fr').
	*   - otherwise               → '1fr'.
	*
	* The level/level_max guards prevent infinite recursion on malformed column maps.
	* Default widths are defined inline for section_id and media component models.
	*
	* @param {Array} list - Array of column descriptor objects.
	* @param {number} [level_max=3] - Maximum recursion depth.
	* @param {string} [type='fr'] - CSS fraction unit suffix (appended to numeric values).
	* @param {number} [level=1] - Current recursion level (callers should not pass this).
	* @returns {Array} ar_elements - Array of CSS column width strings suitable for
	*   joining into a grid-template-columns value (e.g. ['1fr', '102px', '2fr']).
	*/
	flat_column_items : (list, level_max=3, type='fr', level=1) => {

		if (level>level_max) {
			return []
		}

		// defaults definitions by model
		// if ddo width is not defined, use this defaults
			const width_defaults = {
				section_id				: 'minmax(auto, var(--column_id_width))', // 6rem default from var.less root
				component_publication	: '5rem',
				component_info			: 'minmax(9rem, 1fr)',
				component_3d			: '102px',
				component_av			: '102px',
				component_image			: '102px',
				component_pdf			: '102px',
				component_svg			: '102px'
			}

		let ar_elements = []
		const list_length = list.length
		for (let i = 0; i < list_length; i++) {

			const item = list[i]

			if (item.width) {
				// already defined width cases
				ar_elements.push(item.width)

			}else{
				// default defined by model
				if (width_defaults[item.model]) {
					ar_elements.push(width_defaults[item.model])
				}else{
					// non defined width cases, uses default grid measure like '1fr'
					const unit = (item.columns_map && item.columns_map.length>0)
						? ui.flat_column_items(item.columns_map, level_max, type, level++).length || 1
						: 1
					ar_elements.push(unit+type) // like '1fr'
				}
			}
		}


		return ar_elements
	},//end flat_column_items



	/**
	* SET_BACKGROUND_IMAGE
	* Extracts the dominant color of an image by drawing it onto an off-screen canvas
	* and reading the first pixel's RGB value, then applies that color as the
	* backgroundColor of target_node. This creates a visually cohesive background
	* that matches the image's edge color (typically used for media thumbnails in list rows).
	*
	* A gamma correction factor (currently 1.0, configurable via the `factor` variable)
	* is applied to avoid washout: dark pixels are darkened further, light pixels
	* are lightened, so the background contrasts with both light and dark image edges.
	*
	* (!) Skipped on Firefox to prevent erratic canvas behavior with background color.
	* Canvas security errors (cross-origin image) are caught and logged as warnings;
	* the background is simply not set in that case.
	* The canvas is removed from memory after extraction.
	*
	* @param {HTMLElement} image - The <img> element to sample (must be loaded and same-origin
	*   or CORS-enabled, otherwise a security error is silently caught).
	* @param {HTMLElement} target_node - The element whose backgroundColor will be set.
	* @returns {boolean} False on Firefox (skipped); true otherwise (even on canvas error).
	*/
	set_background_image : (image, target_node) => {

		// Firefox skip. (prevents erratic Firefox behavior about canvas bg color)
		if(navigator.userAgent.toLowerCase().indexOf('firefox') > -1){
			return false
		}

		// dominant color way
			// function getAverageRGB(imgEl) {

			// 	var blockSize = 5, // only visit every 5 pixels
			// 		defaultRGB = {r:0,g:0,b:0}, // for non-supporting envs
			// 		canvas = document.createElement('canvas'),
			// 		context = canvas.getContext && canvas.getContext('2d'),
			// 		data, width, height,
			// 		i = -4,
			// 		length,
			// 		rgb = {r:0,g:0,b:0},
			// 		count = 0;

			// 	if (!context) {
			// 		return defaultRGB;
			// 	}

			// 	height = canvas.height = imgEl.naturalHeight || imgEl.offsetHeight || imgEl.height;
			// 	width = canvas.width = imgEl.naturalWidth || imgEl.offsetWidth || imgEl.width;

			// 	context.drawImage(imgEl, 0, 0);

			// 	try {
			// 		data = context.getImageData(0, 0, width, height);
			// 	} catch(e) {
			// 		/* security error, img on diff domain */alert('x');
			// 		return defaultRGB;
			// 	}

			// 	length = data.data.length;

			// 	while ( (i += blockSize * 4) < length ) {
			// 		++count;
			// 		rgb.r += data.data[i];
			// 		rgb.g += data.data[i+1];
			// 		rgb.b += data.data[i+2];
			// 	}

			// 	// ~~ used to floor values
			// 	rgb.r = ~~(rgb.r/count);
			// 	rgb.g = ~~(rgb.g/count);
			// 	rgb.b = ~~(rgb.b/count);

			// 	return rgb;
			// }
			// const rgb = getAverageRGB(image)
			// const bg_color_rgb = 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b +')';
			// target_node.style.backgroundColor = bg_color_rgb

		// first pixel way
			const canvas	= document.createElement('canvas');
			canvas.width	= image.width;
			canvas.height	= image.height;

			function correction(value) {

				const factor = 1 // 1.016

				const result = (value>127)
					? Math.floor(value * factor)
					: Math.floor(value / factor)

				return result
			}

			try {
				// canvas context 2d
					const ctx = canvas.getContext("2d");

				// draw image into canvas
					ctx.drawImage(image, 0, 0, image.width, image.height);

				// get RGB data from canvas
					const rgb = ctx.getImageData(0, 0, 1, 1).data;

				// round RGB values
					const r = correction(rgb[0])
					const g = correction(rgb[1])
					const b = correction(rgb[2])

				// build backgroundColor style string
					const bg_color_rgb = 'rgb(' + r + ',' + g + ',' + b +')';

				// set background color style (both container and image)
					target_node.style.backgroundColor = bg_color_rgb

			}catch(error){
				console.warn("ui.set_background_image . Unable to get image canvas: ", image);
			}

			// remove canvas on finish
				canvas.remove()


		return true
	},//end set_background_image



	/**
	* MAKE_COLUMN_RESPONSIVE
	* Injects a CSS ::before pseudo-element rule for a column cell selector so that
	* on narrow viewports (where the column headers are hidden) each cell shows the
	* column label as a generated content prefix, enabling the "stacked" responsive
	* list layout used in section_record.
	* The label is stripped of HTML tags via strip_tags before being set as the
	* CSS content property to avoid injection of markup into stylesheet rules.
	*
	* Note: the commented-out width-check block was intentionally left in place to
	* document a previous approach of conditionaling on window.innerWidth < 960.
	*
	* @param {Object} options - Configuration.
	* @param {string} options.selector - CSS selector for the column cell (e.g. '#column_id_rsc3652').
	* @param {string} options.label - The column label HTML string (HTML tags will be stripped).
	* @returns {void}
	*/
	make_column_responsive : function(options) {

		// options
			const selector	= options.selector // as '#column_id_rsc3652'
			const label		= options.label

		// strip label HTML tags
			const label_text = strip_tags(label);

		// const width  = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
		// if (width<960) {
			// return add_css_rule(`#column_id_${column_id}::before`, {
			// return add_css_rule(`${selector}::before`, {
			// 	content	: label_text
			// });

			// const css_object = {
			// 	[`${selector}::before`] : {
			// 		style : function() {
			// 			return {
			// 				selector : `${selector}::before`,
			// 				value : {
			// 					content : label_text
			// 				}
			// 			}
			// 		}
			// 	}
			// }
			const css_object = {
				[`${selector}::before`] : function() {
					return {
						selector : `${selector}::before`,
						value : {
							content : label_text
						}
					}
				}
			}
			set_element_css(selector.replace('#',''), css_object)
		// }
	},//end make_column_responsive



	/**
	* HILITE
	* Adds or removes the 'hilite_element' CSS class from a component's wrapper node
	* to visually highlight or de-highlight it. Used primarily by search-mode components
	* to indicate which component is currently matched or focused within the search inspector.
	*
	* @param {Object} options - Configuration.
	* @param {boolean} options.hilite - True to add the highlight class; false to remove it.
	* @param {Object} options.instance - The component instance; must have a .node property.
	* @returns {boolean} True when the class was toggled; undefined (no explicit return)
	*   if the node is missing (after a console warning).
	*/
	hilite : function(options) {

		// options
			const hilite	= options.hilite // bool
			const instance	= options.instance // object instance

		// check wrapper node
			if (!instance.node) {
				console.warn('Skip hilite! Invalid instance node. instance :', instance);
				return
			}

		// add/remove wrapper class
			const wrapper_node = instance.node

			if (hilite===true) {
				if (!wrapper_node.classList.contains('hilite_element')) {
					wrapper_node.classList.add('hilite_element')
				}
			}else{
				if (wrapper_node.classList.contains('hilite_element')) {
					wrapper_node.classList.remove('hilite_element')
				}
			}


		return true
	},//end hilite



	/**
	* ENTER_FULLSCREEN
	* Toggles a CSS fullscreen state on a node by adding/removing the 'fullscreen' class.
	* Additionally hides the main navigation menu (.menu_wrapper) and appends a visible
	* close button to the node. Exit is triggered either by pressing Escape (global keyup
	* listener, passive) or by clicking the exit button.
	*
	* When the node is inside a <dd-modal> ancestor, the modal's 'center' CSS class is
	* removed before entering fullscreen to prevent the modal from fighting the layout.
	*
	* The exit_callback (optional) is invoked after the fullscreen class is removed and
	* the menu is restored, useful for components that need to re-render at the normal size.
	*
	* @param {HTMLElement} node - The element to fullscreen (usually a component wrapper).
	* @param {Function} [exit_callback] - Optional function called after fullscreen exits.
	* @returns {boolean} Always returns true.
	*/
	enter_fullscreen : function(node, exit_callback) {

		// check if node is inside modal
		// Remove dd-modal class list 'center' in this case
			let parent = node.parentNode
			while(parent) {
				parent = parent.parentNode
				if (parent && parent.nodeName==='DD-MODAL') {
					// remove class center if exits
					if (parent.modal_content.classList.contains('center')) {
						parent.modal_content.classList.remove('center')
					}
					break;
				}
			}

		// apply style fullscreen
		node.classList.toggle('fullscreen')

		// hide menu
		const menu_wrapper = document.querySelector('.menu_wrapper')
		if (menu_wrapper) {
			menu_wrapper.classList.add('hide')
		}

		const exit_button = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'exit_button',
			parent			: node
		})
		// set exit event
		const exit_fullscreen = function(e) {
			if (e && e.key !== 'Escape') {
				return
			}
			document.removeEventListener('keyup', exit_fullscreen, { passive : true })
			node.classList.remove('fullscreen')
			if (menu_wrapper) {
				menu_wrapper.classList.remove('hide')
			}
			exit_button.remove()
			if(exit_callback){
				exit_callback()
			}
		}
		document.addEventListener('keyup', exit_fullscreen, { passive : true })

		const click_handler = function(e) {
			e.stopPropagation()
			exit_fullscreen()
		}
		exit_button.addEventListener('click', click_handler)

		return true
	},//end enter_fullscreen



	/**
	* GET_ONTOLOGY_TERM_LINK
	* Builds an <a> element that opens the Dédalo ontology term viewer for the given tipo
	* in a new browser tab (rel="noopener" for security). The link text is the tipo string
	* itself, making it easy to identify the term in debugging panels or error overlays.
	* The URL points to the ontology area (dd5) filtered to the specific tipo.
	*
	* @param {string} tipo - The ontology term identifier (e.g. 'oh1', 'rsc26').
	* @returns {HTMLElement} ontology_term_link - The constructed <a> element.
	*/
	get_ontology_term_link(tipo) {

		const url = DEDALO_CORE_URL + `/page/?tipo=dd5&menu=false&search_tipos=${tipo}`

		const ontology_term_link = ui.create_dom_element({
			element_type	: 'a',
			href			: url,
			text_content	: tipo,
			title			: 'Local Ontology'
		})
		ontology_term_link.target = '_blank'
		ontology_term_link.rel = 'noopener'


		return ontology_term_link
	},//end get_ontology_term_link



	/**
	* LOAD_ITEM_WITH_SPINNER
	* Render a spinner item while callback function is calculating.
	* When finished, the spinner/placeholder will be replaced by the callback's result node.
	* Usually, the callback is an async function that builds and renders an element like a filter or section.
	* @param {Object} options
	* @param {HTMLElement} options.container - The target element to place the spinner in.
	* @param {boolean} [options.preserve_content=false] - If true, existing content won't be cleared.
	* @param {boolean} [options.replace_container=false] - If true, replaces the container itself with the result.
	* @param {string} [options.label=''] - Text label to show next to "Loading".
	* @param {string} [options.model] - Optional model name for specific CSS targeting.
	* @param {Function} options.callback - Async function that must return an HTMLElement or DocumentFragment.
	* @param {Object} [options.style] - Optional inline styles for the placeholder.
	* @returns {Promise<HTMLElement|DocumentFragment|null>} result_node
	*/
	load_item_with_spinner : async function(options) {

		// options
		const {
			container,
			preserve_content = false,
			replace_container = false,
			label = '',
			model = null,
			callback,
			style
		} = options

		// Validate container (Fixed precedence bug: !(a instanceof b))
		if (!(container instanceof HTMLElement)) {
			console.error('Container is not a valid HTMLElement.', container);
			return null;
		}

		// Validate callback
		if (typeof callback !== 'function') {
			console.error('Callback is not a function.', callback);
			return null;
		}

		// Clean container if content should not be preserved
		if (!preserve_content) {
			container.replaceChildren()
		}

		// Prepare placeholder classes
	    const placeholder_class_names = ['container', 'container_placeholder'];
	    if (model) {
	        placeholder_class_names.push(`${model}_placeholder`);
	    }
	    if (typeof SHOW_DEBUG !== 'undefined' && SHOW_DEBUG) {
	        placeholder_class_names.push('placeholder_debug');
	    }

		// Create container placeholder with spinner
			const container_placeholder = ui.create_dom_element({
				element_type	: 'div',
				class_name		: placeholder_class_names.join(' '),
				text_content	: (get_label.loading || 'Loading') + (label ? ' ' + label : ''),
				parent			: container
			})

			if (style) {
				Object.assign(container_placeholder.style, style);
			}

			// Spinner element
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'spinner medium',
				parent			: container_placeholder
			})

		// Execute callback and handle the result.
			try {
				const result_node = await callback();

				if (!result_node) {
					console.warn('Callback did not return a node.', options);
					container_placeholder.remove();
					return null;
				}

				if (!(result_node instanceof HTMLElement || result_node instanceof DocumentFragment)) {
					console.error('Callback did not return a valid DOM node type.', typeof result_node);
					container_placeholder.remove();
					return null;
				}

				// Replace container or placeholder with result_node
				requestAnimationFrame(() => {
					if (replace_container) {
						container.replaceWith(result_node);
					} else if (container_placeholder.parentNode) {
						container_placeholder.replaceWith(result_node);
					}
				})

				return result_node;

			} catch (error) {
				console.error('Error during callback execution:', error);
				if (container_placeholder.parentNode) {
					container_placeholder.remove();
				}
				return null;
			}
	},//end load_item_with_spinner



	/**
	* GET_TEXT_COLOR
	* Returns either '#ffffff' or '#000000' — whichever achieves better WCAG contrast
	* against the given background_color hex value.
	* Uses the relative luminance formula (IEC 61966-2-1 sRGB linearisation followed
	* by ITU-R BT.709 luminance coefficients) and WCAG 2.1 contrast ratio.
	*
	* Helper functions (inner closures, not exported):
	*   getRGB(c)           — parses a 2-char hex fragment to an integer.
	*   getsRGB(c)          — applies sRGB gamma expansion (linearises the channel).
	*   getLuminance(hex)   — computes relative luminance from a #rrggbb string.
	*   getContrast(f,b)    — WCAG contrast ratio between two luminance values.
	*   getTextColor(bg)    — compares white vs black contrast and returns the winner.
	*
	* @see https://wunnle.com/dynamic-text-color-based-on-background
	* @param {string} background_color - A CSS hex color string (e.g. '#2b77c7' or '#fff').
	* @returns {string} text_color - '#ffffff' for dark backgrounds, '#000000' for light ones.
	*/
	get_text_color : function(background_color) {

		function getRGB(c) {
		  return parseInt(c, 16) || c;
		}

		function getsRGB(c) {
		  return getRGB(c) / 255 <= 0.03928
			? getRGB(c) / 255 / 12.92
			: Math.pow((getRGB(c) / 255 + 0.055) / 1.055, 2.4);
		}

		function getLuminance(hexColor) {
		  return (
			0.2126 * getsRGB(hexColor.substr(1, 2)) +
			0.7152 * getsRGB(hexColor.substr(3, 2)) +
			0.0722 * getsRGB(hexColor.substr(-2))
		  );
		}

		function getContrast(f, b) {
		  const L1 = getLuminance(f);
		  const L2 = getLuminance(b);
		  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
		}

		function getTextColor(bgColor) {
		  const whiteContrast = getContrast(bgColor, "#ffffff");
		  const blackContrast = getContrast(bgColor, "#000000");

		  return whiteContrast > blackContrast ? "#ffffff" : "#000000";
		}

		const text_color = getTextColor(background_color)


		return text_color;
	},//end get_text_color



	/**
	* CSS_VAR
	* Resolves a CSS custom property declared on :root to its concrete computed value
	* for the active theme, returning a literal fallback when the property is unset or empty.
	* Useful when a color value must be passed to code that cannot accept a var(...) string,
	* such as get_text_color, canvas fillStyle, or SVG attribute setters.
	*
	* @param {string} name - The CSS custom property name including the '--' prefix
	*   (e.g. '--color_primary').
	* @param {string} fallback - Literal value to return if the property is unset or empty
	*   (e.g. '#2b77c7').
	* @returns {string} The resolved CSS value (whitespace-trimmed) or the fallback.
	*/
	css_var : function(name, fallback) {

		const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()

		return value || fallback;
	},//end css_var



	/**
	* RENDER_EDIT_MODAL
	* Opens a fresh component instance in a modal window for inline editing,
	* without navigating away from the current list view. Used in section list rows
	* where the list-mode value is too small to edit comfortably (e.g., component_text_area).
	*
	* The function:
	*  1. Creates a header with the component label and the current record ID.
	*  2. Gets a fresh component instance via get_instance (same tipo/section/section_id,
	*     mode='edit', optionally in a different lang).
	*  3. Builds and renders the instance, activating it so the user can type immediately.
	*  4. Creates an empty footer container (callers may populate via options.callback).
	*  5. Opens the modal via ui.attach_to_modal with size='normal', centered at 30rem.
	*  6. Calls options.on_close after the modal is dismissed (if provided).
	*  7. Calls options.callback with the dd_modal reference for custom sizing/content.
	*
	* @param {Object} options - Configuration.
	* @param {Object} options.self - The list-mode component instance to open for editing.
	* @param {Function} [options.callback] - Called with the dd_modal element when ready;
	*   use to adjust modal size or add footer buttons.
	* @param {string} [options.lang] - Override language; defaults to self.lang.
	* @param {Function} [options.on_close] - Called after the modal is removed from the DOM.
	* @returns {Promise<HTMLElement>} modal_node - The <dd-modal> element.
	*/
	render_edit_modal : async function(options) {

		// options
			const self		= options.self // component instance
			const callback	= options.callback // function optional
			const lang		= options.lang // string optional
			const on_close	= options.on_close // function optional

		// header
			const header = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'header'
			})
			// header_label_node
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'label',
				inner_html		: (get_label.edit || 'Edit') + ' ' + self.label + ' - ID: ' + self.section_id,
				parent			: header
			})

		// body
			const body = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'body content'
			})
			// component instance
			const instance = await get_instance({
				model			: self.model,
				tipo			: self.tipo,
				section_tipo	: self.section_tipo || self.tipo,
				section_id		: self.section_id,
				mode			: 'edit',
				view			: null,
				lang			: lang || self.lang
			})
			await instance.build(true)
			const node = await instance.render()
			if(node) {
				body.appendChild(node)
			}
			ui.component.activate(instance)

		// footer
			const footer = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'footer content distribute'
			})

		const modal_node = ui.attach_to_modal({
			header	 : header,
			body	 : body,
			footer	 : footer,
			on_close : () => {
				if (on_close) {
					on_close()
				}
			},
			callback : (dd_modal) => {

				// re-size and position the modal content
				dd_modal.modal_content.classList.add('center')
				dd_modal.modal_content.style.width = '30rem'

				if (callback) {
					callback(dd_modal)
				}
			},
			size : 'normal' // string size: big|normal|small
		})


		return modal_node
	},//end render_edit_modal



	/**
	* ACTIVATE_TOOLTIPS
	* Registers the codex-tooltip library on all matching button elements within a wrapper,
	* using each button's title attribute as the tooltip text. Skips mobile user agents
	* (Android/iPhone/iPad/iPod) since touch devices do not have hover states.
	*
	* The singleton ui.tooltip instance is created lazily on the first call. Subsequent
	* calls reuse it, so the library is only initialised once per page load.
	*
	* Each processed button has its active_tooltip flag set to true after registration to
	* prevent double-registration on re-renders (e.g., after a partial refresh). The title
	* attribute is cleared on mouseover (mouseover_handler) because the tooltip library
	* reads it at registration time and native title tooltips would appear underneath.
	*
	* Reset mode (reset=true): forces re-registration of already-active buttons by clearing
	* their active_tooltip flag and dispatching synthetic mouseleave/mouseenter events.
	* Used when a button's tooltip text changes after initial render.
	*
	* @param {HTMLElement} wrapper - The element (page, section, component, etc.) to search within.
	* @param {string|null} [selector='.button'] - CSS selector to find tooltip targets.
	*   Pass null to treat wrapper itself as the sole tooltip target.
	* @param {boolean} [reset=false] - When true, forces re-registration even for already-active buttons.
	* @returns {void}
	*/
	activate_tooltips : function(wrapper, selector='.button', reset=false) {

		if (!ui.tooltip) {

			// mobile do not use tooltip
			if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
				return
			}

			ui.tooltip = new Tooltip();
		}

		const tooltip = ui.tooltip

		const mouseover_handler = (e) => {
			e.target.title = ''
		}

		const buttons = selector
			? wrapper.querySelectorAll(selector)
			: [wrapper]
		const buttons_length = buttons.length
		for (let i = 0; i < buttons_length; i++) {

			const button = buttons[i]

			// reset case
			if (reset) {
				button.active_tooltip = false
				button.dispatchEvent(new Event('mouseleave'));
			}

			if (button.active_tooltip) {
				continue;
			}

			if (!button.title || !button.title.length) {
				continue;
			}

			tooltip.onHover(button, button.title, {
				placement: 'top',
				delay: 150
			})
			button.addEventListener('mouseover', mouseover_handler)

			// set as active to prevent double activation
			button.active_tooltip = true

			// reset case
			if (reset) {
				button.dispatchEvent(new Event('mouseenter'));
			}
		}
	},//end activate_tooltips



	/**
	* FIT_INPUT_WIDTH_TO_VALUE
	* Sizes an <input> element's width to exactly fit its value by setting width in
	* CSS 'ch' units (one 'ch' ≈ the width of the '0' character in the current font).
	* The optional plus argument adds extra characters of padding (e.g. to leave room
	* for a trailing cursor).
	*
	* (!) Requires a monospace or fixed-pitch font on the input element; proportional
	*     fonts have variable glyph widths so 'ch'-based sizing will be approximate.
	*
	* @param {HTMLElement} input_node - The <input> element to resize.
	* @param {number|string} value - The current value; its string length determines the width.
	* @param {number} [plus=0] - Additional characters to add to the measured length.
	* @returns {void}
	*/
	fit_input_width_to_value : function(input_node, value, plus=0) {

		const chars = value
			? value.toString().length + plus
			: 0 + plus

		if (chars>0) {
			input_node.style.width = chars + 'ch';
		}
	},//end fit_input_width_to_value



	/**
	* INSIDE_DATAFRAME
	* Checks whether a component was instantiated inside a component_dataframe cell
	* by inspecting two levels of the caller chain:
	*   instance.caller           → must be a section_record
	*   instance.caller.caller    → must be a component_dataframe
	* This two-level check is necessary because section_record always mediates between
	* dataframe and its child components.
	* Used by components that need to adjust their behaviour (e.g., suppress auto-save,
	* change layout) when rendered inside a dataframe rather than a standalone section.
	*
	* @param {Object} instance - The component instance to check.
	* @returns {boolean} True if instance is a direct child of a component_dataframe cell.
	*/
	inside_dataframe : function (instance) {

		if (instance.caller?.model==='section_record') {
			if (instance.caller?.caller?.model==='component_dataframe') {
				return true
			}
		}

		return false
	}//end inside_dataframe



}//end ui



// @license-end
