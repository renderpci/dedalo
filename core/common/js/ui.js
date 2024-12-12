// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, Promise, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {
		strip_tags,
		prevent_open_new_window
	} from '../../common/js/utils/index.js'
	import {when_in_dom,dd_request_idle_callback} from '../../common/js/events.js'
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
*/
export const ui = {



	/**
	* LOCAL VARS
	*/
	tooltip : null,



	/**
	* SHOW_MESSAGE
	* @param HTMLElement wrapper
	*	component wrapper where message is placed
	* @param string message
	*	Text message to show inside message container
	* @param string msg_type = 'error'
	* @param string message_node = 'component_message'
	* @param bool clean = false
	*
	* @return HTMLElement message_wrap
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

		// adjust height
			const computed_styles = getComputedStyle(message_wrap.parentNode);
			if (computed_styles.position!=='fixed') {
				message_wrap.style.top = '-' + message_wrap.offsetHeight + 'px'
			}

		// close button move to bottom when height is too much
			if (message_wrap.offsetHeight>120) {
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
		* Component wrapper unified builder.
		* Constructs an edit node wrapper element for a given instance.
		* @param object instance
		* 	current component instance
		* @param object options = {}
		* 	Specific objects to place into the wrapper, like 'label', 'top', buttons, filter, paginator, content_data)
		* @return HTMLElement wrapper
		*/
		build_wrapper_edit : (instance, options={}) => {

			// short vars
				const model					= instance.model // like 'component_input_text'
				const type					= instance.type // like 'component'
				const tipo					= instance.tipo // like 'rsc26'
				const section_tipo			= instance.section_tipo // like 'rsc26'
				const mode					= instance.mode // like 'edit'
				const view					= instance.view || instance.context.view || 'default'
				const label					= instance.label // instance.context.label
				const ontology_css			= instance.context.css || null // Ontology CSS
				const state_of_component	= instance.context.properties?.state_of_component || null

			// options
				const add_styles = options.add_styles || null

			// fragment
				const fragment = new DocumentFragment()

			// wrapper
				const wrapper = document.createElement('div')

				// CSS
					// base styles
					const ar_css = [
						'wrapper_' + type,
						model,
						tipo,
						section_tipo +'_'+ tipo,
						mode,
						'view_' + view
					]
					// custom added styles
					if (add_styles) {
						ar_css.push(...add_styles)
					}
					// search styles
					if (mode==='search') {
						ar_css.push('tooltip_toggle')
					}
					// set wrapper direct styles
					wrapper.classList.add(...ar_css)

					// Ontology CSS. Apply ontology CSS if available
					// Get the ontology CSS defined into the ontology properties and insert the rules into CSS style set.
					if (ontology_css) {
						const selector = `${section_tipo}_${tipo}.${tipo}.${mode}`
						set_element_css(selector, ontology_css)
					}

				// read only. Add 'disabled_component' class if permissions are less than 2
					if ( !instance.permissions || parseInt(instance.permissions)<2 ) {
						wrapper.classList.add('disabled_component')
					}

				// event click . Activate component on event
					const mousedown_handler = (e)=> {
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
					}//end mousedown_handler
					wrapper.addEventListener('click', (e)=>{
						e.stopPropagation()
					})
					wrapper.addEventListener('mousedown', mousedown_handler)

			// label. If node label received, it is placed at first. Else a new one will be built from scratch (default)
				if (options.label===null) {
					// no label add (line view cases for example)
				}else if(options.label) {
					// add custom label node
					wrapper.appendChild(options.label)
					// set pointer
					wrapper.label = options.label
				}else{
					// default
					const component_label = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'label',
						inner_html		: label
					})
					wrapper.appendChild(component_label)
					// set pointer
					wrapper.label = component_label
					// state_of_component. sample:
						// {
						// "deprecated": {
						// 	"msg": "component_deprecated",
						// 	"target_component": "rsc44"
						// }
					if (state_of_component) {
						for (const [key, value] of Object.entries(state_of_component)) {
							const icon = ui.create_dom_element({
								element_type	: 'span',
								class_name		: 'button icon ' + (value.icon ?? key),
								title			: (value.msg || key)
							})
							component_label.prepend(icon)
						}
					}
				}

			// top
				if (options.top) {
					wrapper.appendChild(options.top)
				}

			// buttons
				if (options.buttons && instance.permissions>1) {
					wrapper.appendChild(options.buttons)
				}

			// filter
				if (instance.filter) {
					const filter = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'filter',
						parent			: fragment
					})
					instance.filter.build()
					.then(function(){
						instance.filter.render()
						.then(filter_wrapper =>{
							filter.appendChild(filter_wrapper)
						})
					})
				}

			// paginator
				if (instance.paginator) {
					const paginator = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'paginator_container',
						parent			: wrapper
					})
					instance.paginator.render()
					.then(paginator_wrapper => {
						paginator.appendChild(paginator_wrapper)
					})
				}

			// list_body
				if (options.list_body) {
					wrapper.appendChild(options.list_body)
				}

			// content_data
				if (options.content_data) {
					wrapper.appendChild(options.content_data)
				}


			return wrapper
		},//end build_wrapper_edit



		/**
		* BUILD_CONTENT_DATA
		* Unified component content_data container render
		* @param object instance
		* @param object options = {}
		* @return HTMLElement content_data
		*/
		build_content_data : (instance, options={}) => {

			// options
				const type			= instance.type
				const component_css	= instance.context.css || {}

			// div container
				const content_data = document.createElement('div')

			// css
				const content_data_structure_css = typeof component_css.content_data!=='undefined'
					? component_css.content_data
					: []
				const ar_css = [
					'content_data',
					type,
					...content_data_structure_css
				]
				content_data.classList.add(...ar_css)


			return content_data
		},//end build_content_data



		/**
		* BUILD_BUTTON_EXIT_EDIT
		* Unified render for component button_exit_edit
		* @param object instance
		* @param object options = {}
		* @return HTMLElement content_data
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
		* Unified component buttons container render
		* @param object instance
		* @return HTMLElement buttons_container
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
		* Render a unified version of component wrapper in list mode
		* @param object instance
		* @param object options = {}
		* @return HTMLElement wrapper
		*/
		build_wrapper_list : (instance, options={}) => {

			// options
				const value_string	= options.value_string
				const add_styles	= options.add_styles || null

			// short vars
				const model			= instance.model 		// like component_input-text
				const type			= instance.type 		// like 'component'
				const tipo			= instance.tipo 		// like 'rsc26'
				const section_tipo	= instance.section_tipo // like 'oh1'
				const view			= instance.view || instance.context.view || 'default'
				const element_css	= instance.context.css || {}

			// wrapper
				const wrapper = document.createElement('div')

				// css
					const ar_css = [
						'wrapper_' + type,
						model,
						tipo,
						section_tipo +'_'+ tipo,
						'list',
						'view_' + view
					]
					// custom added styles
					if (add_styles) {
						ar_css.push(...add_styles)
					}
					wrapper.classList.add(...ar_css)

				// Ontology CSS definition
				// Get the ontology CSS defined into the ontology properties.
				// And insert the rules into CSS style set.
				// this not apply to component_filter (project) use specific CSS because it's inside inspector.
					if (model!=='component_filter') {
						// CSS is moved from properties to specific property in context
						// Into tool time machine visualization case, do not add custom CSS from properties
						if (instance.context.css && instance.context.mode!=='tm') {
							set_element_css(
								`${section_tipo}_${tipo}.${tipo}.${'list'}`, // CSS selector
								element_css // properties CSS object
							)
						}
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
		* Render mini wrapper version of given component
		* @param object instance
		* @param object options = {}
		* @return HTMLElement wrapper
		*/
		build_wrapper_mini : (instance, options={}) => {

			// options
				const value_string = options.value_string

			// wrapper
				const wrapper = document.createElement('span')

				// css
					const ar_css = [
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
		* Component wrapper unified builder
		* @param object instance (self component instance)
		* @param object items
		* 	Specific objects to place into the wrapper, like 'label', 'top', buttons, filter, paginator, content_data)
		* @return HTMLElement wrapper
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
					const component_label = ui.create_dom_element({
						element_type	: 'div',
						inner_html		: label,
						title			: tipo + ' ' + model.substring(10) + ' [' + instance.lang.substring(3) + ']',
						parent			: fragment
					})
					// parent_grouper_label
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
						ui.component.activate(instance)
					})

				wrapper.appendChild(fragment)


			return wrapper
		},//end build_wrapper_search



		/**
		* ACTIVATE
		* Set component state as active/inactive and publish activation event
		* @param object component
		*	Full component instance
		* @param bool focus = true
		* @return bool
		* 	If component is undefined or already active return false, else true
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
								const all_inputs = component.node.content_data && component.node.content_data
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
								const first_input = component.node.content_data && component.node.content_data[0]
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


			return true
		},//end activate



		/**
		* DEACTIVATE
		* Removes component active style and save it
		* if changed_data is different from undefined
		* (!) Note that component changed_data existence provoke the save call (change_value())
		* @param object component
		*	Full component instance
		* @return promise
		* 	Resolve bool false if component it's not active or
		* 	true when deactivation finish
		*/
		deactivate : async (component) => {

			// check already inactive
				if (component.active!==true) {
					return false
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
						await component.change_value({
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


			return true
		},//end deactivate



		/**
		* LOCK
		* Sets component as locked
		* @param object component
		*	Full component instance
		* @return promise
		* 	Resolve bool
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
		* Sets component as unlocked
		* @param object component
		*	Full component instance
		* @return promise
		* 	Resolve bool
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
		* Set component state as valid or error
		* @param boolean error
		*	Boolean value obtained from previous component validation functions
		* @param HTMLElement input_wrap
		*	Component wrapper that has to be set as valid or with data errors
		* @return boolean
		*/
		error : (error, input_wrap) => {

			if (error) {

				input_wrap.classList.add('error')

				const input_node = input_wrap.querySelector('input')
				if(input_node){
					input_node.focus();
				}

			}else{
				input_wrap.classList.remove('error')
			}

			return true
		},//end error



		/**
		* REGENERATE
		* Replace DOM element node from parent node
		* @param HTMLElement current_node
		* @param HTMLElement new_node
		* @return HTMLElement current_node
		*/
		regenerate : (current_node, new_node) => {

			current_node.parentNode.replaceChild(new_node, current_node);

			return current_node
		},//end regenerate



		/**
		* ADD_IMAGE_FALLBACK
		* Unified fallback image adds event listener error and changes the image src when event error is triggered
		* @param HTMLElement img_node
		* @param function callback
		* @return bool
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
		* Builds an alert icon at left of the component wrapper with
		* the message as tooltip
		* @param HTMLElement wrapper_component
		*	component wrapper where message is placed
		* @param string message
		*	Text message to show inside message container
		* @param string msg_type = 'alert'
		* @param bool clean = true
		* 	On true, remove previous icons inside warning_wrap
		* @param function|null on_click
		* 	optional callback to manage on click event
		* @return HTMLElement warning_wrap
		* 	note that warning_wrap node is created once and recycled
		*/
		add_component_warning : (wrapper_component, message, msg_type='alert', clean=true, on_click) => {

			// warning_wrap. always check if already exists, else, create a new one and recycle it
				const warning_wrap = wrapper_component.warning_wrap || (()=>{

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
		* Used on component save successfully
		* @param object self
		* 	Element instance
		* @return promise
		* 	Resolve bool
		*/
		exec_save_successfully_animation : (self) => {

			// save_animation from self.show_interface
				if (self.show_interface.save_animation===false) {
					return Promise.resolve(false)
				}

			// no rendered node exists cases
				if (!self.node) {
					return Promise.resolve(false)
				}

			return new Promise(function(resolve){

				// remove previous save_success classes
					if (self.node.classList.contains('save_success')) {

						// animationPlayState. Allow restart animation. Not set state pause before animation ends (2 secs)
						self.node.style.animationPlayState			= 'paused';
						self.node.style.webkitAnimationPlayState	= 'paused';

						self.node.classList.remove('save_success')
					}

				dd_request_idle_callback(
					() => {
						// success. add save_success class to component wrappers (green line animation)
							if (self.node) {
								self.node.classList.add('save_success')
								// animationPlayState sets
								self.node.style.animationPlayState			= 'running';
								self.node.style.webkitAnimationPlayState	= 'running';
							}

						// remove save_success. after 2000 ms, remove wrapper class to avoid issues on refresh
							setTimeout(()=>{

								if (self.node) {

									// animationPlayState. Allow restart animation. Not set state pause before animation ends (2 secs)
									self.node.style.animationPlayState			= 'paused';
									self.node.style.webkitAnimationPlayState	= 'paused';

									// remove animation style
									if (self.node.classList.contains('save_success')) {
										self.node.classList.remove('save_success')
									}
								}

								resolve(true)
							}, 2000)
					}
				)//end dd_request_idle_callback
			})
		}//end exec_save_successfully_animation



	},//end component



	section : {



	},//end section



	area : {


		/**
		* BUILD_WRAPPER_EDIT
		* Common method to create element wrapper in current mode
		* @param object instance
		* @param object items = {}
		* @return HTMLElement wrapper
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
		* Unified tool content data container render
		* @param object instance
		* @param object options
		* @return HTMLElement content_data
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
		* Generate button element for open the target tool
		* @param object tool_context
		* @param object self
		* @return HTMLElement tool_button
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
		* Generate button element for open the target tool
		* @param object tool_context
		* @param object self
		* @return HTMLElement tool_button
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
		* Render unified wrapper for widgets in edit mode
		* @param object instance
		* @param object items
		* @return HTMLElement wrapper
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
	* Builds a DOM node based on received options
	* @param object options
	* @return HTMLElement element
	*/
	create_dom_element : function(options) {

		// options
			const element_type		= options.element_type
			const type				= options.type
			const id				= options.id
			const parent			= options.parent
			const class_name		= options.class_name
			const style				= options.style
			const data_set			= (typeof options.dataset!=='undefined') ? options.dataset : options.data_set
			const title_label		= options.title_label || options.title
			const text_node			= options.text_node
			const text_content		= options.text_content
			const inner_html		= options.inner_html
			const draggable			= options.draggable
			const value				= options.value
			const src				= options.src
			const contenteditable	= options.contenteditable
			const name				= options.name
			const placeholder		= options.placeholder
			const pattern			= options.pattern
			const href				= options.href

		// DOM node element
			const element = document.createElement(element_type)

		// id. Add id property to element
			if(id) {
				element.id = id
			}

		// element_type. A element. Add default href property to element
			if(element_type==='a') {
				element.href = href || 'javascript:;'
			}

		// type
			if (type && element_type!=='textarea') {
				element.type = type
			}

		// class_name. Add CSS classes property to element
			if(class_name) {
				element.className = class_name
			}

		// style. Add CSS style property to element
			if (style) {
				for(let key in style) {
					element.style.setProperty(key, style[key])
				}
			}

		// title . Add title attribute to element
			if (title_label) {
				element.title = strip_tags(title_label)
			}

		// dataset Add dataset values to element
			if (data_set) {
				for (let key in data_set) {
					element.dataset[key] = data_set[key]
				}
			}

		// value
			if (value!==undefined) {
				element.value = value
			}

		// Text content: + span,
			if(inner_html) {
				element.insertAdjacentHTML('afterbegin', inner_html)
			}else if (text_node) {
				// Parse HTML text as object
				if (element_type==='span') {
					element.textContent = text_node
				}else{
					const el = document.createElement('span')
						  // Note that prepend a space to span to prevent Chrome bug on selection
						  el.insertAdjacentHTML('afterbegin', " "+text_node)
					element.appendChild(el)
				}
			}else if(text_content) {
				element.textContent = text_content
			}

		// draggable
			if(draggable) {
				element.draggable = draggable
			}

		// src. Source for images etc.
			if(src) {
				element.src = src
			}

		// contenteditable
			if (contenteditable) {
				element.contentEditable = contenteditable
			}

		// name
			if(name) {
				element.name = name
			}

		// placeholder
			if(placeholder) {
				element.placeholder = placeholder
			}

		// pattern
			if(pattern) {
				element.pattern = pattern
			}

		// parent. Append created element to parent
			if (parent) {
				parent.appendChild(element)
			}


		return element;
	},//end create_dom_element



	/**
	* UPDATE_NODE_CONTENT
	* Clean node container and add the new content as HTML
	* @param HTMLElement node
	* @param string value
	* @return void
	*/
	update_node_content : function(node, value) {
		while (node.firstChild) {
			node.removeChild(node.firstChild);
		}
		node.insertAdjacentHTML('afterbegin', value)
	},//end update_node_content



	/**
	* ADD_TOOLS
	* Adds all the existent tools for the selected component
	* @param object self
	* @param HTMLElement buttons_container
	* @return array tools
	*/
	add_tools : function(self, buttons_container) {

		const tools			= self.tools || []
		const tools_length	= tools.length

		for (let i = 0; i < tools_length; i++) {

			// avoid self tool inside tool
			if (self.caller && self.caller.model===tools[i].name) {
				continue;
			}

			const tool_node = (self.type==='component')
				? ui.tool.build_component_tool_button(tools[i], self)
				: ui.tool.build_section_tool_button(tools[i], self)

			if (tool_node) {
				buttons_container.appendChild(tool_node)
			}
		}


		return tools
	},//end add_tools



	/**
	* PLACE_ELEMENT
	* Place DOM element inside target instance nodes
	* Used in section_record to send component_filter to inspector
	* @param object options
	* @return bool
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
	* Show/hide the section inspector when it exists
	* @return void
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
	* Used by inspector to collapse information blocks like 'Relations'
	* Manages a persistent view ob content (body) based on user selection
	* Uses local DB to track the state of current element
	* @param object options
	* @return bool
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
	* Render a lang selector with a given array of langs or the default
	* page_globals.dedalo_projects_default_langs list
	* @param object options
	* @return HTMLElement select_lang
	*/
	build_select_lang : (options) => {

		// options
			const id			= options.id || null
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
			const ar_langs_lenght = ar_langs.length
			for (let i = 0; i < ar_langs_lenght; i++) {

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
	* Insert wrapper into a modal box
	* @param object options
	* {
	* 	header	: node|string,
	* 	body	: node|string,
	* 	footer	: node|string,
	* 	size	: string
	* 	remove_overlay : bool
	* }
	* @return HTMLElement modal_container
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
			const remove_overlay	= options.remove_overlay || false
			const minimizable		= options.minimizable ?? true
			const on_close			= options.on_close || null
			const callback			= options.callback || null

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
				modal_container.remove()
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
				const header_blank = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'hide'
				})
				header_blank.slot = 'header'
				modal_container.appendChild(header_blank)
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
			}

		// footer. Add node footer to modal footer and insert it into slot
			if (footer) {
				footer.slot = 'footer'
				if (!footer.classList.contains('footer')) {
					footer.classList.add('footer')
				}
				modal_container.appendChild(footer)
				modal_container.footer = footer
			}

			if(minimizable===false){
				modal_container.remove_miniModal();
			}

		// size. Modal special features based on property 'size'
			switch(size) {
				case 'big' : {
					// hide contents to avoid double scrollbars
						const content_data_page	= document.querySelector('.content_data.page')
						const debug_div			= document.getElementById('debug')

					// show hidden elements again on close
						const modal_close_handler = () => {

							content_data_page.classList.remove('hide')
							if(debug_div) {
								debug_div.classList.remove('hide')
							}

							// scroll window to previous scroll position
							window.scrollTo({
								top			: page_y_offset,
								behavior	: 'auto'
							})
						}
						event_manager.subscribe('modal_close', modal_close_handler)

					modal_container._showModalBig();
					break;
				}
				case 'small' :
					modal_container._showModalSmall();
					break;

				default :
					modal_container._showModal();
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

		// callback
			if (callback && typeof callback=='function') {
				callback(modal_container)
			}

		// modal_container mousedown event
			modal_container.addEventListener('mousedown', deactivate_components)


		return modal_container
	},//end attach_to_modal



	/**
	* ACTIVATE_FIRST_COMPONENT
	* This is used when a new record is created, to focus first component suitable for edit
	* avoiding to select some models like component_publication, component_info...
	* @param object options
	* @return bool
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
	* Unfinished function (!)
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
	* Creates the header nodes needed for portal and section in the same unified way
	* @param array columns_map
	* 	Parsed columns_map array as [{id: 'oh87', label: 'Information'}]
	* @param object self
	* 	Instance of section/component_portal
	* @return HTMLElement header_wrapper
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
							if (self.constructor.name==='section' && current_column.sortable===true) {
								const sort_node = ui.add_column_order_set(self, current_column, header_wrapper)
								sort_nodes.push(sort_node)
								sub_header_item.appendChild(sort_node)
							}
					}
				}else{
					// add sort column icons
						if (self.constructor.name==='section' && column.sortable===true) {
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
	* ADD_COLUMN_ORDER_SET
	* Creates the arrows to sort list by column and
	* place it into the header_item node
	* @param object self
	* 	Instance of section/component_portal
	* @param object column
	* @param HTMLElement header_wrapper
	* 	Container where place the sort buttons
	* @return HTMLElement sort_node
	*/
	add_column_order_set(self, column, header_wrapper) {

		// short vars
			const path				= column.path
			const title_asc			= (get_label.sort || 'Sort') + ' ' + (get_label.ascending || 'ascending')
			const title_desc		= (get_label.sort || 'Sort') + ' ' + (get_label.descending || 'descending')
			let default_direction	= 'DESC'
			let current_direction	= undefined

		// current_direction. current order current_direction check from sqo
		// default is undefined
			const sqo_order = self.rqo.sqo.order || null
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

		// exec_order function
			const exec_order = (direction) => {

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
						direction: direction, // ASC|DESC
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
			sort_node.addEventListener('click', function(e){
				e.stopPropagation()

				const direction = current_direction
					? current_direction==='ASC' ? 'DESC' : 'ASC' // reverse current value
					: default_direction // defaults

				exec_order(direction)
			})


		return sort_node
	},//end add_column_order_set



	/**
	* FLAT_COLUMN_ITEMS
	* Creates the css grid columns to build list items
	* @param array list
	*	Array of column items
	* @param int level_max = 3
	* @param string type = 'fr'
	* @param int level = 1
	* @return array ar_elements
	*/
	flat_column_items : (list, level_max=3, type='fr', level=1) => {

		if (level>level_max) {
			return []
		}

		// defaults definitions by model
		// if ddo width is not defined, use this defaults
			const width_defaults = {
				section_id				: 'minmax(auto, 6rem)',
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
	* @param HTMLElement image
	* @param HTMLElement target_node
	* @return bool
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
	* Used in section_record to add responsive CSS
	* @param object options
	* @return bool
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
	* Hilite/un-hilite and element (usually a component) in the DOM
	* Used mainly by components in search mode
	* @param object options
	* @return bool
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
	* Set element as full screen size
	* To exit, press key 'Escape'
	* @param HTMLElement node
	* 	Usually the component wrapper
	* @param function exit_callback
	* 	optional callback executed on exit from fullscreen
	* @return bool
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
		const click_handler = function(e) {
			e.stopPropagation()

			node.classList.remove('fullscreen')
			menu_wrapper.classList.remove('hide')
			exit_button.remove()
			if(exit_callback){
				exit_callback()
			}
		}
		exit_button.addEventListener('click', click_handler)

		// set exit event
		const exit_fullscreen = function(e) {

			if (e.key==='Escape') {
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
		}
		document.addEventListener('keyup', exit_fullscreen, { passive : true })


		return true
	},//end enter_fullscreen



	/**
	* GET_ONTOLY_TERM_LINK
	* Render a unified DOM node as Ontology link open in new window
	* @param string tipo
	* @return HTMLElement ontoly_term_link
	*/
	get_ontoly_term_link(tipo) {

		const url = DEDALO_CORE_URL + '/ontology/dd_edit.php?terminoID=' + tipo

		const ontoly_term_link = ui.create_dom_element({
			element_type	: 'a',
			href			: url,
			text_content	: tipo,
			title			: 'Local Ontology'
		})
		ontoly_term_link.target	= '_blank'
		ontoly_term_link.rel	= 'noopener'


		return ontoly_term_link
	},//end get_ontoly_term_link



	/**
	* LOAD_ITEM_WITH_SPINNER
	* Render a spinner item while callback function is calculating
	* When is finished, spinner will be replaced by callback result node
	* Usually, callback is a async function that builds and render a element
	* like filter or section
	* @param object options
	* 	{
	* 		container			: HTMLElement,
	* 		preserve_content	: bool false,
	* 		replace_container 	: bool false
	* 		label				: string,
	* 		callback			: function,
	* 		style 				: object
	* 	}
	* @return HTMLElement result_node
	*/
	load_item_with_spinner : async function(options) {

		// options
			const container			= options.container
			const preserve_content	= options.preserve_content || false
			const replace_container = options.replace_container || false
			const label				= options.label || ''
			const model				= options.model || null
			const callback			= options.callback
			const style				= options.style

		// clean container
			if (preserve_content===false) {
				while (container.firstChild) {
					container.removeChild(container.firstChild)
				}
			}

		// placeholder_class
			const placeholder_class = model
				? ` ${model}_placeholder` + (SHOW_DEBUG ? ` placeholder_debug` : '')
				: ''

		// container_placeholder
			const container_placeholder = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'container container_placeholder' + placeholder_class,
				inner_html		: (get_label.loading || 'Loading') + ' ' + label,
				parent			: container
			})
			if (style) {
				Object.assign(container_placeholder.style, style);
			}
			// spinner
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'spinner medium',
				parent			: container_placeholder
			})

		// callback wait (expect promise resolving DOM node) and handle the result
			try {
				const result_node = await callback();

				if (!result_node) {
					console.warn('Callback did not return node.', options);
					container_placeholder.remove();
					return null;
				}

				if (!result_node instanceof HTMLElement && !result_node instanceof DocumentFragment) {
					console.error('Callback did not return a valid DOM node type.', typeof result_node);
					container_placeholder.remove();
					return null;
				}

				// Replace container or placeholder with result_node
				requestAnimationFrame(
					() => {
						if (replace_container) {
							container.replaceWith(result_node);
						} else {
							// default
							container_placeholder.replaceWith(result_node);
						}
					}
				)

				return result_node;
			} catch (error) {
				console.error('Error during callback execution:', error);
				container_placeholder.remove();
				return null;
			}
	},//end load_item_with_spinner



	/**
	* GET_TEXT_COLOR
	* Calculate dynamic text color based on background
	* Always return a black or white color, the most
	* appropriated in current case for good visibility
	* @see https://wunnle.com/dynamic-text-color-based-on-background
	* @param string background_color
	* @return string text_color
	* 	"#ffffff" | "#000000"
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
	* RENDER_EDIT_MODAL
	* Render a component into a modal window
	* Used for section list records to allow users edit inline big
	* components like component_text_area
	* @param object options
	* 	{
	* 		self		: object,
	* 		e			: mouse event,
	* 		callback	: function,
	* 		lang		: string
	* 	}
	* @return HTMLElement modal_node
	*/
	render_edit_modal : async function(options) {

		// options
			const self		= options.self // component instance
			const callback	= options.callback // function optional
			const lang		= options.lang // string optional

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
			body.appendChild(node)
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
				// Nothing to do
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
	* Add tooltip to buttons based on title attribute
	* @param HTMLElement wrapper
	* 	Element (page, section, component, inspector, etc.) wrapper
	* @param string selector = '.button'
	* @return void
	*/
	activate_tooltips : function(wrapper, selector='.button') {

		// mobile do not use tooltip
		if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
			return
		}

		if (!ui.tooltip) {
			ui.tooltip = new Tooltip();
		}
		const tooltip = ui.tooltip

		const buttons = wrapper.querySelectorAll(selector)
		const buttons_length = buttons.length
		for (let i = 0; i < buttons_length; i++) {

			const button = buttons[i]

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
			button.addEventListener('mouseover', function(e) {
				button.title = ''
			})

			// set as active to prevent double activation
			button.active_tooltip = true
		}
	},//end activate_tooltips



	/**
	* FIT_INPUT_WIDTH_TO_VALUE
	* Set input element style width based on number length of chars
	* (!) Use monospace font to preserve char width when fit
	* @param HTMLElement input_node
	* @param int|string value
	* @param int plus = 0
	* @return void
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
	* Check if current component is inside component_dataframe
	* @param object instance
	* 	component instance
	* @return bool
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
