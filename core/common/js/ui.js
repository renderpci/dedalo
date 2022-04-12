/*global get_label, page_globals, SHOW_DEBUG, Promise */
/*eslint no-undef: "error"*/



// imports
	import {strip_tags} from '../../common/js/utils/index.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {set_element_css} from '../../page/js/css.js'
	// import {get_instance, delete_instance} from '../../common/js/instances.js'
	import '../../common/js/dd-modal.js'



/**
* UI
*/
export const ui = {

	message_timeout : null,
	/**
	* SHOW_MESSAGE
	* @param element wrapper
	*	component wrapper where message is placed
	* @param text message
	*	Text message to show inside message container
	*/
	show_message : (wrapper, message, msg_type='error', message_node='component_message', clean=false) => {

		// message_wrap. always check if already exists
			const message_wrap = wrapper.querySelector("."+message_node) || (()=>{

				const new_message_wrap = ui.create_dom_element({
					element_type	: 'div',
					class_name		: message_node, // + msg_type,
					parent			: wrapper
				})

				const close_button = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'close',
					text_content	: ' x ',
					parent			: new_message_wrap
				})
				close_button.addEventListener("click", (e) => {
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
				const items = message_wrap.querySelectorAll(".text")
				for (let i = items.length - 1; i >= 0; i--) {
					items[i].remove()
				}
			}

		// add msg text
			const text = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'text',
				text_content	: message,
				parent			: message_wrap
			})

		// adjust height
			message_wrap.style.top = "-" + message_wrap.offsetHeight + "px"

		// close button move to bottom when height is too much
			if (message_wrap.offsetHeight>120) {
				const close_button			= message_wrap.querySelector('.close')
				close_button.style.top		= 'unset';
				close_button.style.bottom	= '0px';
			}

		// remove msg after time
			clearTimeout(ui.message_timeout);
			if (msg_type==='ok') {
				ui.message_timeout = setTimeout(()=>{
					message_wrap.remove()
				}, 7000)
			}


		return message_wrap
	},//end show_message



	component : {



		/**
		* BUILD_WRAPPER_EDIT
		* Component wrapper unified builder
		* @param object instance (self component instance)
		* @param object items
		* 	Specific objects to place into the wrapper, like 'label', 'top', buttons, filter, paginator, content_data)
		*/
		build_wrapper_edit : (instance, items={}) => {
			if(SHOW_DEBUG===true) {
				// console.log("[ui.build_wrapper_edit] instance:",instance)
				// console.log(`build_wrapper_edit items ${instance.tipo}:`,items);
				// console.log("instance:",instance);
			}

			// short vars
				// const id			= instance.id || 'id is not set'
				const model			= instance.model 	// like component_input-text
				const type			= instance.type 	// like 'component'
				const tipo			= instance.tipo 	// like 'rsc26'
				const section_tipo	= instance.section_tipo 	// like 'rsc26'
				const mode			= instance.mode 	// like 'edit'
				const view			= instance.view || null
				const label			= (mode==='edit_in_list') ? null : instance.label // instance.context.label
				const element_css	= instance.context.css || {}

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
						inner_html		: label // + ' [' + instance.lang.substring(3) + ']' + ' ' + tipo + ' ' + (model.substring(10)) + ' [' + instance.permissions + ']'
					})
					fragment.appendChild(component_label)
					// css
		 				const label_structure_css = typeof element_css.label!=="undefined" ? element_css.label : []
						const ar_css = ['label', ...label_structure_css]
						component_label.classList.add(...ar_css)
				}

			// top
				if (items.top) {
					fragment.appendChild(items.top)
				}

			// buttons
				if (items.buttons && instance.permissions>1) { // && instance.permissions>1
					fragment.appendChild(items.buttons)
				}

			// filter
				if (instance.filter) {
					const filter = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'filter',
						parent			: fragment
					})
					instance.filter.build().then(function(){
						instance.filter.render().then(filter_wrapper =>{
							filter.appendChild(filter_wrapper)
						})
					})
				}

			// paginator
				if (instance.paginator) {
					const paginator = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'paginator_container',
						parent			: fragment
					})
					instance.paginator.render().then(paginator_wrapper => {
						paginator.appendChild(paginator_wrapper)
					})
				}

			// header
				// if (items.header) {
				// 	fragment.appendChild(items.header)
				// }

			// list_body
				if (items.list_body) {
					fragment.appendChild(items.list_body)
				}

			// content_data
				if (items.content_data) {
					// const content_data = items.content_data
					// // css
					// 	const content_data_structure_css = typeof element_css.content_data!=="undefined" ? element_css.content_data : []
					// 	const ar_css = ["content_data", type, ...content_data_structure_css]
					// 	content_data.classList.add(...ar_css)
					fragment.appendChild(items.content_data)
				}

			// tooltip
				// if (mode==="search" && instance.context.search_options_title) {
				// 	//fragment.classList.add("tooltip_toggle")
				// 	const tooltip = ui.create_dom_element({
				// 		element_type	: 'div',
				// 		class_name		: 'tooltip hidden_tooltip',
				// 		inner_html		: instance.context.search_options_title || '',
				// 		parent			: fragment
				// 	})
				// }

			// wrapper
				const wrapper = ui.create_dom_element({
					element_type : 'div'
 				})
 				// CSS
					const wrapper_structure_css = typeof element_css.wrapper!=="undefined" ? element_css.wrapper : []
					const ar_css = ['wrapper_'+type, model, tipo, section_tipo+'_'+tipo, mode, ...wrapper_structure_css]
					if (view) {ar_css.push(view)}
					if (mode==="search") ar_css.push("tooltip_toggle")
					if (mode==="tm") ar_css.push("edit")
					wrapper.classList.add(...ar_css)

				// legacy CSS
					if (model!=='component_filter') {
						// const legacy_selector = '.wrap_component'
						// if (element_css[legacy_selector]) {
						// 	// mixin
						// 		if (element_css[legacy_selector].mixin){
						// 			// width from mixin
						// 			const found = element_css[legacy_selector].mixin.find(el=> el.substring(0,7)==='.width_') // like .width_33
						// 			if (found) { //  && found!=='.width_50'
						// 				// wrapper.style['flex-basis'] = found.substring(7) + '%'
						// 				// wrapper.style['--width'] = found.substring(7) + '%'
						// 				wrapper.style.setProperty('--component_width', found.substring(7) + '%');
						// 			}
						// 		}
						// 	// style
						// 		if (element_css[legacy_selector].style) {
						// 			// width from style
						// 			if (element_css[legacy_selector].style.width) {
						// 				// wrapper.style['flex-basis'] = element_css[legacy_selector].style.width;
						// 				// wrapper.style['--width'] = element_css[legacy_selector].style.width
						// 				wrapper.style.setProperty('--component_width', element_css[legacy_selector].style.width);
						// 			}
						// 			// display none from style
						// 			if (element_css[legacy_selector].style.display && element_css[legacy_selector].style.display==='none') {
						// 				wrapper.classList.add('display_none')
						// 			}
						// 		}
						// }
						// const legacy_selector_content_data = '.content_data'
						// if (element_css[legacy_selector_content_data] && items.content_data) {
						// 	// style
						// 		if (element_css[legacy_selector_content_data].style) {
						// 			// height from style
						// 			if (element_css[legacy_selector_content_data].style.height) {
						// 				items.content_data.style.setProperty('height', element_css[legacy_selector_content_data].style.height);
						// 			}
						// 		}
						// }
						set_element_css(section_tipo+'_'+tipo, element_css)
					}//end if (model!=='component_filter')

				// event click . Activate component on event
					wrapper.addEventListener("click", e => {
						e.stopPropagation()
						if (mode.indexOf('edit')===-1) {
							return
						}
						if (!wrapper.classList.contains('active')) {
							event_manager.publish('active_component', instance)
						}
					})

				wrapper.appendChild(fragment)

				// read only. Disable events on permissions <2
					if (instance.permissions<2) {
						wrapper.classList.add("disabled_component")
					}

			// debug
				if(SHOW_DEBUG===true) {
					wrapper.addEventListener("click", function(e){
						if (e.altKey) {
							e.stopPropagation()
							e.preventDefault()
							// common.render_tree_data(instance, document.getElementById('debug'))
							console.log("/// selected instance:", instance);
						}
					})
				}

			// test css
				// const my_css = {
				//    '.cssinjs-btn': {
				//       "color": "white",
				//       "background": "black"
				//     }
				// }
				// const toCssString = css => {
				//   let result = ''
				//   for (const selector in css) {
				//     result += selector + ' {' // .cssinjs-btn {
				//     for (const property in css[selector]) {
				//       // color: white;
				//       result += property + ': ' + css[selector][property] + ';'
				//     }
				//     result += '}'
				//   }
				//   return result
				// }
				// // Render styles.
				// let style = document.querySelector("#el_id_del_style")
				// if (!style) {
				// 	style = document.createElement('style')
				// 	style.id = 'el_id_del_style'
				// 	document.head.appendChild(style)
				// }
				// style.textContent += toCssString(my_css) + '\n'


			return wrapper
		},//end build_wrapper_edit



		/**
		* BUILD_CONTENT_DATA
		* @param object component instance
		* @return DOM node content_data
		*/
		build_content_data : (instance, options={}) => {

			// options
				const button_close	= options.button_close
				const autoload		= typeof options.autoload!=="undefined" ? options.autoload : false
				const type			= instance.type
				const component_css	= instance.context.css || {}

			const content_data = document.createElement("div")

			// css
				const content_data_structure_css = typeof component_css.content_data!=="undefined" ? component_css.content_data : []
				const ar_css = ["content_data", type, ...content_data_structure_css]
				content_data.classList.add(...ar_css)

			// button close
				if(button_close!==null && instance.mode==='edit_in_list' && !instance.is_inside_tool){
					const button_close = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'button close',
						parent			: content_data
					})
					button_close.addEventListener("click", function(){
						instance.change_mode('list', autoload)
					})
				}

			return content_data
		},//end build_content_data



		/**
		* BUILD_BUTTONS_CONTAINER
		* @param object component instance
		* @return DOM node buttons_container
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
		*/
		build_wrapper_list : (instance, options={}) => {
			if(SHOW_DEBUG===true) {
				//console.log("[ui.build_wrapper_list] instance:",instance)
			}

			// const id			= instance.id || 'id is not set'
			// const mode		= instance.mode 	// like 'edit'
			const model			= instance.model 	// like component_input-text
			const type			= instance.type 	// like 'component'
			const tipo			= instance.tipo 	// like 'rsc26'
			const edit_in_list	= (instance.section_tipo === 'dd542') ? false : true // dd542-> activity section

			// options
				const autoload		= typeof options.autoload!=="undefined" ? options.autoload : false
				const value_string	= options.value_string

			// wrapper
				const wrapper = ui.create_dom_element({
					element_type	: 'div',
					class_name		: `wrapper_${type} ${model} ${tipo} list` //  + mode
 				})

 			// span value. Add span if value_string is received
 				if (value_string) {
 					ui.create_dom_element({
						element_type	: 'span',
						inner_html		: value_string,
						parent			: wrapper
					})
 				}

 			// event dblclick change component mode
	 			if(edit_in_list) {

	 				wrapper.addEventListener("dblclick", function(e){
						e.stopPropagation()

						// change mode (from 'list' to 'edit_in_list')
						instance.change_mode('edit_in_list', autoload)
					})
	 			}

	 		// debug
				if(SHOW_DEBUG===true) {
					wrapper.addEventListener("click", function(e){
						if (e.altKey) {
							e.stopPropagation()
							e.preventDefault()
							// common.render_tree_data(instance, document.getElementById('debug'))
							console.log("/// selected instance:", instance);
						}
					})
					wrapper.classList.add('_'+instance.id)
				}

			return wrapper
		},//end build_wrapper_list



		/**
		* BUILD_WRAPPER_MINI
		*/
		build_wrapper_mini : (instance, options={}) => {

			// options
				const value_string = options.value_string

			// wrapper
				const wrapper = ui.create_dom_element({
					element_type	: 'span'
 				})

 			// value_string
 				if (value_string) {
 					wrapper.insertAdjacentHTML('afterbegin', value_string)
 				}

			return wrapper
		},//end build_wrapper_mini



		/**
		* BUILD_WRAPPER_search
		* Component wrapper unified builder
		* @param object instance (self component instance)
		* @param object items
		* 	Specific objects to place into the wrapper, like 'label', 'top', buttons, filter, paginator, content_data)
		*/
		build_wrapper_search : (instance, items={}) => {
			if(SHOW_DEBUG===true) {
				// console.log("[ui.build_wrapper_search] instance:",instance)
				// console.log(`build_wrapper_search items ${instance.tipo}:`,items);
				// console.log("instance:",instance);
			}

			// short vars
				const id			= instance.id || 'id is not set'
				const model			= instance.model 	// like component_input-text
				const type			= instance.type 	// like 'component'
				const tipo			= instance.tipo 	// like 'rsc26'
				const mode			= instance.mode 	// like 'edit'
				const view			= instance.view || null
				const label			= instance.label // instance.context.label
				const element_css	= instance.context.css || {}

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
						//class_name	: 'label'  + tipo + (label_structure_css ? ' ' + label_structure_css : ''),
						inner_html		: label + ' [' + instance.lang.substring(3) + ']' + ' ' + tipo + ' ' + (model.substring(10)) + ' [' + instance.permissions + ']'
					})
					fragment.appendChild(component_label)
					// css
		 				const label_structure_css = typeof element_css.label!=="undefined" ? element_css.label : []
						const ar_css = ['label', ...label_structure_css]
						component_label.classList.add(...ar_css)
				}

			// top
				// if (items.top) {
				// 	fragment.appendChild(items.top)
				// }

			// buttons
				// if (items.buttons) {
				// 	fragment.appendChild(items.buttons)
				// }

			// filter
				// if (instance.filter) {
				// 	const filter = ui.create_dom_element({
				// 		element_type	: 'div',
				// 		class_name		: 'filter',
				// 		parent			: fragment
				// 	})
				// 	instance.filter.render().then(filter_wrapper =>{
				// 		filter.appendChild(filter_wrapper)
				// 	})
				// }

			// paginator
				// if (instance.paginator) {
				// 	const paginator = ui.create_dom_element({
				// 		element_type	: 'div',
				// 		class_name		: 'paginator',
				// 		parent			: fragment
				// 	})
				// 	instance.paginator.render().then(paginator_wrapper =>{
				// 		paginator.appendChild(paginator_wrapper)
				// 	})
				// }

			// content_data
				if (items.content_data) {
					fragment.appendChild(items.content_data)
				}

			// tooltip
				if (instance.context.search_options_title) {
					//fragment.classList.add("tooltip_toggle")
					const tooltip = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'tooltip hidden_tooltip',
						inner_html		: instance.context.search_options_title || '',
						parent			: items.content_data // fragment
					})
				}

			// wrapper
				const wrapper = ui.create_dom_element({
					element_type	: 'div',
					id				: id // (!) set id
 				})
 				// CSS
	 				const wrapper_structure_css = typeof element_css.wrapper!=="undefined" ? element_css.wrapper : []
					const ar_css = ['wrapper_'+type, model, tipo, mode, ...wrapper_structure_css]
					if (view) {ar_css.push(view)}
					if (mode==="search") ar_css.push("tooltip_toggle")
					wrapper.classList.add(...ar_css)

				// legacy CSS
					// if (mode==='edit') {
					// 	const legacy_selector = '.wrap_component'
					// 	if (element_css[legacy_selector]) {
					// 		// mixin
					// 			if (element_css[legacy_selector].mixin){
					// 				// width from mixin
					// 				const found = element_css[legacy_selector].mixin.find(el=> el.substring(0,7)==='.width_') // like .width_33
					// 				if (found) { //  && found!=='.width_50'
					// 					// wrapper.style['flex-basis'] = found.substring(7) + '%'
					// 					// wrapper.style['--width'] = found.substring(7) + '%'
					// 					wrapper.style.setProperty('--component_width', found.substring(7) + '%');
					// 				}
					// 			}
					// 		// style
					// 			if (element_css[legacy_selector].style) {
					// 				// width from style
					// 				if (element_css[legacy_selector].style.width) {
					// 					// wrapper.style['flex-basis'] = element_css[legacy_selector].style.width;
					// 					// wrapper.style['--width'] = element_css[legacy_selector].style.width
					// 					wrapper.style.setProperty('--component_width', element_css[legacy_selector].style.width);
					// 				}
					// 				// display none from style
					// 				if (element_css[legacy_selector].style.display && element_css[legacy_selector].style.display==='none') {
					// 					wrapper.classList.add('display_none')
					// 				}
					// 			}
					// 	}
					// }

				// event click . Activate component on event
					// wrapper.addEventListener("click", e => {
					// 	e.stopPropagation()
					// 	event_manager.publish('active_component', instance)
					// })

				wrapper.appendChild(fragment)

			return wrapper
		},//end build_wrapper_search



		/**
		* ACTIVE
		* Set component state as active by callback event
		* @see util.events event_manage.publish
		*
		* @param object component
		*	Full component instance
		* @param string id
		*	ID of clicked component
		* @return async promise
		*	Note that this function return always a promise to allow the caller
		*	continue applying another custom actions
		*/
		active : (component, actived_component) => {

			if (typeof actived_component==="undefined") {
				console.warn("[ui.component.active]: WARNING. Received undefined actived_component!");
				return false
			}

			// match case
				if (component.id===actived_component.id) {

					// match . Add wrapper css active
						component.node.map(function(item_node) {
							item_node.classList.add("active")
						})

					// fix nearby inspector overlapping
						const el = component.node[0]
						if (el) {
							const el_rect	= el.getBoundingClientRect();
							const inspector	= document.getElementById('inspector')
							if (inspector) {
								const inspector_rect = inspector.getBoundingClientRect();
								// console.log("/// inspector_rect:",inspector_rect);
								if (inspector_rect.left > 50 // prevent affects responsive mobile view
									&& el_rect.right > inspector_rect.left-20
									) {
									el.classList.add('inside')
								}
							}
						}

					return true
				}

			// not match cases. Remove wrapper css active if exists
				component.node.map(function(item_node) {
					item_node.classList.remove("active")
				})

			// service autocomplete remove if active
				if(component.autocomplete_active===true){
					component.autocomplete.destroy()
					component.autocomplete_active = false
					component.autocomplete = null
				}


			return false
		},//end active



		/**
		* ERROR
		* Set component state as valid or error
		*
		* @param boolean error
		*	Boolean value obtained from previous component validation functions
		* @param object component
		*	Component that has to be set as valid or with data errors
		* @return boolean
		*/
		error : (error, component) => {

			if (error) {
				component.classList.add("error")

			}else{
				component.classList.remove("error")
			}

			return true
		},//end error



		/**
		* REGENERATE
		*/
		regenerate : (current_node, new_node) => {

			//// clean
			//	while (current_node.firstChild) {
			//		current_node.removeChild(current_node.firstChild)
			//	}
			//// set children nodes
			//	while (new_node.firstChild) {
			//		current_node.appendChild(new_node.firstChild)
			//	}

			current_node.parentNode.replaceChild(new_node, current_node);

			return current_node
		},//end regenerate



		/**
		* ADD_IMAGE_FALLBACK
		* Unified fallback image adds event listener error and changes the image src when event error is triggered
		*/
		add_image_fallback : (img_node) => {

			img_node.addEventListener("error", change_src, true)

			function change_src(item) {

				// remove onerror listener to avoid infinite loop (!)
				item.target.removeEventListener("error", change_src, true);

				// set fallback src to the image
				item.target.src = page_globals.fallback_image

				return true
			}


			return true
		},//end  add_image_fallback



		/**
		* EXEC_SAVE_SUCCESSFULLY_ANIMATION
		* Used on component save successfully
		* @return promise
		*/
		exec_save_successfully_animation : (self) => {

			return new Promise(function(resolve){

				// remove previous save_success classes
					self.node.map(item => {
						if (item.classList.contains("save_success")) {
							item.classList.remove("save_success")
						}
					})

				setTimeout(()=>{

					// success. add save_success class to component wrappers (green line animation)
						self.node.map(item => {
							item.classList.add("save_success")
						})

					// remove save_success. after 2000ms, remove wrapper class to avoid issues on refresh
						setTimeout(()=>{
							self.node.map(item => {
								// item.classList.remove("save_success")
								// allow restart animation. Not set state pause before animation ends (2 secs)
								item.style.animationPlayState = "paused";
								item.style.webkitAnimationPlayState = "paused";
							})

							resolve(true)
						},2000)
				},50)
			})
		}//end exec_save_successfully_animation



	},//end component



	section : {



		/**
		* BUILD_WRAPPER_EDIT
		*/
			// build_wrapper_edit : (instance, items={}) => {
			// 	if(SHOW_DEBUG===true) {
			// 		//console.log("[ui.build_wrapper_edit] instance:",instance)
			// 	}

			// 	const id 			= instance.id || 'id is not set'
			// 	const model 		= instance.model 	// like component_input-text
			// 	const type 			= instance.type 	// like 'component'
			// 	const tipo 			= instance.tipo 	// like 'rsc26'
			// 	const mode 			= instance.mode 	// like 'edit'
			// 	const label 		= mode === 'edit_in_list' ? null : instance.label // instance.context.label
			// 	const main_context 	= instance.context
			// 	const element_css 	= main_context.css || {}

	 	// 		const fragment = new DocumentFragment()

			// 	// label
			// 		if (label===null || items.label===null) {
			// 			// no label add
			// 		}else if(items.label) {
			// 			// add custom label
			// 			fragment.appendChild(items.label)
			// 		}else{
			// 			// default
			// 			// const component_label = ui.create_dom_element({
			// 			// 	element_type	: 'div',
			// 			// 	class_name		: 'label',
			// 			// 	inner_html		: label + ' [' + instance.lang.substring(3) + '] [' + instance.permissions +']',
			// 			// 	parent			: fragment
			// 			// })
			// 		}

			// 	// inspector
			// 		if (items.inspector_div) {
			// 			fragment.appendChild(items.inspector_div)
			// 		}

			// 	// buttons
			// 		if (items.buttons) {
			// 			const buttons = ui.create_dom_element({
			// 				element_type	: 'div',
			// 				class_name		: 'buttons',
			// 				parent			: fragment
			// 			})
			// 			const items_buttons_length = items.buttons.length
			// 			for (let i = 0; i < items_buttons_length; i++) {
			// 				buttons.appendChild(items.buttons[i])
			// 			}
			// 		}

			// 	// filter
			// 		// if (instance.filter) {
			// 		// 	const filter = ui.create_dom_element({
			// 		// 		element_type	: 'div',
			// 		// 		class_name		: 'filter',
			// 		// 		parent			: fragment
			// 		// 	})
			// 		// 	instance.filter.build().then(()=>{
			// 		// 		instance.filter.render().then(filter_wrapper =>{
			// 		// 			filter.appendChild(filter_wrapper)
			// 		// 		})
			// 		// 	})
			// 		// }

			// 	// paginator
			// 		if (items.paginator_div) {
			// 			// place paginator in inspector
			// 			ui.place_element({
			// 				source_node			: items.paginator_div,
			// 				source_instance		: instance,
			// 				target_instance		: instance.inspector,
			// 				container_selector	: ".paginator_container",
			// 				target_selector		: ".wrapper_paginator"
			// 			})
			// 		}

			// 	// content_data
			// 		if (items.content_data) {
			// 			const content_data = items.content_data
			// 			// css
			// 				const content_data_structure_css = typeof element_css.content_data!=="undefined" ? element_css.content_data : []
			// 				const ar_css = ["content_data", type, ...content_data_structure_css]
			// 				content_data.classList.add(...ar_css)
			// 			// add to fragment
			// 				fragment.appendChild(content_data)
			// 		}


			// 	// wrapper
			// 		const wrapper = ui.create_dom_element({
			// 			element_type	: 'div',
			// 			class_name		: 'wrapper_' + type + ' ' + model + ' ' + tipo + ' ' + mode
	 	// 			})
	 	// 			// css
		 // 				const wrapper_structure_css = typeof element_css.wrapper!=="undefined" ? element_css.wrapper : []
			// 			const ar_css = ['wrapper_'+type, model, tipo, mode,	...wrapper_structure_css]
			// 			wrapper.classList.add(...ar_css)

	 	// 			// append fragment
	 	// 				wrapper.appendChild(fragment)



			// 	return wrapper
			// }//end  build_wrapper_edit



	},//end section



	area : {


		/**
		* BUILD_WRAPPER_EDIT
		*/
		build_wrapper_edit : (instance, items={}) => {
			if(SHOW_DEBUG===true) {
				//console.log("[ui.build_wrapper_edit] instance:",instance)
			}

			const id	= instance.id || 'id is not set'
			const model	= instance.model 	// like component_input-text
			const type	= instance.type 	// like 'component'
			const tipo	= instance.tipo 	// like 'rsc26'
			const mode	= instance.mode 	// like 'edit'
			const label	= instance.label 	// instance.context.label

			const fragment = new DocumentFragment()

			// label
				if (label===null || items.label===null) {
					// no label add
				}else if(items.label) {
					// add custom label
					fragment.appendChild(items.label)
				}else{
					// default
					const component_label = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'label',
						inner_html		: label + ' [' + instance.lang.substring(3) + ']',
						parent			: fragment
					})
				}

			// buttons
				// if (items.buttons) {
				// 	const buttons = ui.create_dom_element({
				// 		element_type	: 'div',
				// 		class_name		: 'buttons',
				// 		parent			: fragment
				// 	})
				// 	const items_buttons_length = items.buttons.length
				// 	for (let i = 0; i < items_buttons_length; i++) {
				// 		buttons.appendChild(items.buttons[i])
				// 	}
				// }

			// filter
				// if (instance.filter) {
				// 	const filter = ui.create_dom_element({
				// 		element_type	: 'div',
				// 		class_name		: 'filter',
				// 		parent			: fragment
				// 	})
				// 	instance.filter.render().then(filter_wrapper =>{
				// 		filter.appendChild(filter_wrapper)
				// 	})
				// }

			// content_data
				if (items.content_data) {
					const content_data = items.content_data
					content_data.classList.add("content_data", type)
					fragment.appendChild(content_data)
				}

			// wrapper
				const wrapper = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'wrapper_' + type + ' area ' + model + ' ' + tipo + ' ' + mode
 				})
 				wrapper.appendChild(fragment)


			return wrapper
		}//end  build_wrapper_edit



	},//end area



	tool : {



		build_wrapper_edit : (instance, items={})=>{

			const id			= instance.id || 'id is not set'
			const model			= instance.model 	// like component_input_text
			const type			= instance.type 	// like 'component'
			const tipo			= instance.tipo 	// like 'rsc26'
			const mode			= instance.mode 	// like 'edit'
			const context		= instance.context || {}
			const label			= context.label || ''
			const description	= context.description || ''
			const name			= instance.constructor.name

			const fragment = new DocumentFragment()

			if (mode!=='mini') {
				// header
					const tool_header = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'tool_header ' + name,
						parent			: fragment
					})

				// label
					if (label!==null) {
						// default
						const component_label = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'label',
							inner_html		: label,
							parent			: tool_header
						})

						// icon (optional)
						if (context.icon) {
							const icon = ui.create_dom_element({
								element_type	: 'span',
								class_name		: 'button white', // gear
								style : {
									"-webkit-mask"	: "url('" +context.icon +"')",
									"mask"			: "url('" +context.icon +"')"
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
							parent			: tool_header
						})
					}
			}//end if (mode!=='mini')

			// buttons
				if (items.buttons) {
					const buttons = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'buttons',
						parent			: fragment
					})
					const items_buttons_length = items.buttons.length
					for (let i = 0; i < items_buttons_length; i++) {
						buttons.appendChild(items.buttons[i])
					}
				}

			// content_data
				if (items.content_data) {
					const content_data = items.content_data
					content_data.classList.add("content_data", type)
					fragment.appendChild(content_data)
				}

			// wrapper
				const wrapper = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'wrapper_' + type + ' ' + model + ' ' + mode
 				})
 				wrapper.appendChild(fragment)


			return wrapper
		},//end build_wrapper_edit





		/**
		* BUILD_SECTION_TOOL_BUTTON
		* Generate button element for open the target tool
		* @return DOM element tool_button
		*/
		build_section_tool_button : (tool_context, self) => {

			// button
				const tool_button = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'warning ' + tool_context.model,
					// text_content	: tool_context.label,
					dataset			: {
						tool : tool_context.name
					}
					// style			: {
					// 	"background-image"		: "url('" +tool_context.icon +"')"
					// }
				})
				// icon inside
				const tool_icon = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button white tool',
					style			: {
						"-webkit-mask"		: "url('" +tool_context.icon +"')",
						"mask"				: "url('" +tool_context.icon +"')"
					},
					parent : tool_button
				})
				tool_button.insertAdjacentHTML('beforeend', tool_context.label)


			// Events
				tool_button.addEventListener('mousedown', publish_load_tool)
				function publish_load_tool(e) {
					e.stopPropagation();

					//common.prototype.load_tool(self, tool_context)
					event_manager.publish('load_tool', {
						tool_context	: tool_context,
						caller			: self
					})
				}


			return tool_button
		},//build_section_tool_button




		/**
		* BUILD_COMPONENT_TOOL_BUTTON
		* Generate button element for open the target tool
		* @return DOM element tool_button
		*/
		build_component_tool_button : (tool_context, self) => {

			if (tool_context.show_in_component===false) {
				return null
			}

			// button
				const tool_button = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button tool',
					title_label		: tool_context.label,
					style			: {
						"-webkit-mask"	: "url('" +tool_context.icon +"')",
						"mask"			: "url('" +tool_context.icon +"')"
					},
					dataset			: {
						tool : tool_context.name
					}
				})
				// const tool_button = ui.create_dom_element({
				// 	element_type	: 'img',
				// 	class_name		: 'button tool',
				// 	// style		: { "background-image": "url('" +tool_context.icon +"')" },
				// 	src				: tool_context.icon,
				// 	dataset			: { tool : tool_context.name },
				// 	title_label		: tool_context.label
				// })

			// Events
				tool_button.addEventListener('click', publish_load_tool)

				function publish_load_tool(e) {
					e.stopPropagation();

					//common.prototype.load_tool(self, tool_context)
					event_manager.publish('load_tool', {
						tool_context	: tool_context,
						caller			: self
					})
				}
			return tool_button
		}//build_component_tool_button



	},//end tool



	widget : {



		build_wrapper_edit : (instance, items)=>{

			const id	= instance.id || 'id is not set'
			const mode	= instance.mode 	// like 'edit'
			const type	= "widget"
			const name	= instance.constructor.name

			const fragment = new DocumentFragment()

			// content_data
				if (items.content_data) {
					const content_data = items.content_data
					content_data.classList.add("content_data", type)
					fragment.appendChild(content_data)
				}

			// wrapper
				const wrapper = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'wrapper_' + type + ' ' + name + ' ' + mode
 				})
 				wrapper.appendChild(fragment)


			return wrapper
		}//end build_wrapper_edit
	},//end widget



	// DES
		// button : {



		// 	/**
		// 	* BUILD_BUTTON
		// 	* Generate button element for open the target tool
		// 	* @return dom element tool_button
		// 	*/
		// 	build_button : (options) => {

		// 		const class_name = 'button' + (options.class_name ? (' ' + options.class_name) : '')
		// 		const label 	 = options.label || "undefined"

		// 		// button
		// 			const button = ui.create_dom_element({
		// 				element_type	: 'span',
		// 				class_name		: class_name,
		// 				text_content	: label
		// 				//style			: { "background-image": "url('" +tool_object.icon +"')" },
		// 			})

		// 		// Events
		// 			//button.addEventListener('mouseup', (e) => {
		// 			//	e.stopPropagation()
		// 			//	alert("Click here! "+label)
		// 			//})

		// 		return button
		// 	}//build_button



		// },//end button



	/**
	* CREATE_DOM_ELEMENT
	* Builds a DOM node based on received options
	*/
	create_dom_element : function(options){

		// options
			const element_type				= options.element_type
			const type						= options.type
			const id						= options.id
			const parent					= options.parent
			const class_name				= options.class_name
			const style						= options.style
			const data_set					= (typeof options.dataset!=="undefined") ? options.dataset : options.data_set
			// const custom_function_events	= options.custom_function_events
			const title_label				= options.title_label || options.title
			const text_node					= options.text_node
			const text_content				= options.text_content
			const inner_html				= options.inner_html
			const draggable					= options.draggable
			const value						= options.value
			const src						= options.src
			const contenteditable			= options.contenteditable
			const name						= options.name
			const placeholder				= options.placeholder
			const pattern					= options.pattern
			const href						= options.href

		// DOM node element
			const element = document.createElement(element_type)

		// id. Add id property to element
			if(id){
				element.id = id
			}

		// element_type. A element. Add default href property to element
			if(element_type==='a'){
				element.href = href || 'javascript:;'
			}

		// type
			if (type && element_type!=='textarea') {
				element.type = type
			}

		// class_name. Add CSS classes property to element
			if(class_name){
				element.className = class_name
			}

		// style. Add CSS style property to element
			if(style){
				for(let key in style) {
					element.style[key] = style[key]
					//element.setAttribute("style", key +":"+ style[key]+";");
				}
			}

		// title . Add title attribute to element
			if(title_label){
				element.title = title_label
			}

		// dataset Add dataset values to element
			if(data_set){
				for (let key in data_set) {
					element.dataset[key] = data_set[key]
				}
			}

		// value
			if(value!==undefined){
				element.value = value
			}

		// Text content: + span,
			if(text_node){
				//element.appendChild(document.createTextNode(TextNode));
				// Parse HTML text as object
				if (element_type==='span') {
					element.textContent = text_node
				}else{
					const el = document.createElement('span')
						  // Note that prepend a space to span to prevent Chrome bug on selection
						  // el.innerHTML = " "+text_node
						  el.insertAdjacentHTML('afterbegin', " "+text_node)
					element.appendChild(el)
				}
			}else if(text_content) {
				element.textContent = text_content
			}else if(inner_html) {
				// element.innerHTML = inner_html
				element.insertAdjacentHTML('afterbegin', inner_html)
			}


		// draggable
			if(draggable){
				element.draggable = draggable
			}

		// src
			if(src){
				element.src = src
			}

		// contenteditable
			if (contenteditable) {
				element.contentEditable = contenteditable
			}

		// name
			if(name){
				element.name = name
			}

		// placeholder
			if(placeholder){
				element.placeholder = placeholder
			}

		// pattern
			if(pattern){
				element.pattern = pattern
			}

		// parent. Append created element to parent
			if (parent) {
				parent.appendChild(element)
			}

		return element;
	},//end create_dom_element



	/**
	* UPDATE_DOM_NODES
	*/
	update_dom_nodes : function(ar_nodes, new_node) {

		const ar_nodes_length = ar_nodes.length
		// replace content data node in each element dom node
		for (let i = 0, l = ar_nodes_length; i < l; i++) {

			const current_dom_node = ar_nodes[i]

			// move node on first appearance and move a clone in next
			const current_new_node = (i===0) ? new_node : new_node.cloneNode(true)

			// replace the node with the new render
			current_dom_node.parentNode.replaceChild(current_new_node, current_dom_node)
		}

		return true
	},//end update_dom_nodes



	/**
	* INSIDE_TOOL
	* Check if instance is inside tool
	* @return bool | string tool name
	*/
	inside_tool : function(self) {

		if (self.caller && self.caller.type==='tool') {
			return self.caller.constructor.name
		}

		return false
	},//end inside_tool



	/**
	* ADD_TOOLS
	* Adds all the existent tools for the selected component
	* @return bool
	*/
	add_tools : function(self, buttons_container) {

		const tools			= self.tools || []
		const tools_length	= tools.length

		for (let i = 0; i < tools_length; i++) {

			const tool_node = (self.type==='component')
				? ui.tool.build_component_tool_button(tools[i], self)
				: ui.tool.build_section_tool_button(tools[i], self)

			if (tool_node) {
				buttons_container.appendChild(tool_node)
			}

			// if(self.type === 'component' && tools[i].show_in_component){
			// 	buttons_container.appendChild( ui.tool.build_component_tool_button(tools[i], self) )
			// }else if(self.type === 'section'){
			// 	buttons_container.appendChild( ui.tool.build_section_tool_button(tools[i], self) )
			// }
		}

		return tools
	},//end add_tools



	/**
	* PLACE_ELEMENT
	* Place DOM element inside target instance nodes
	* Used in section_record to send component_filter to inspector
	* @return bool | string tool name
	*/
	place_element : function(options) {

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

		if (target_instance.status==="rendered") {

			if (typeof target_instance.node[0]==="undefined") {
				console.error("Error. Instance node not found:", target_instance);
			}

			// instance node already exists case
			const node_length = target_instance.node.length;
			for (let i = 0; i < node_length; i++) {

				const target_container	= target_instance.node[i].querySelector(container_selector)
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
			}
		}else{

			// target_instance node not ready case
			source_instance.events_tokens.push(
				event_manager.subscribe('render_'+target_instance.id , fn_render_target)
			)
			function fn_render_target(instance_wrapper) {
				const target_container = instance_wrapper.querySelector(container_selector)
				if (target_container) {
					target_container.appendChild(source_node)
				}
			}
		}


		return true
	},//end place_element



	/**
	* TOGGLE_INSPECTOR
	*/
	toggle_inspector : () => {

		const inspector_wrapper = document.querySelector(".inspector")
		if (inspector_wrapper) {

			const wrapper_section = document.querySelector(".wrapper_section.edit")

			if (inspector_wrapper.classList.contains("hide")) {
				inspector_wrapper.classList.remove("hide")
				wrapper_section.classList.remove("full_width")
			}else{
				inspector_wrapper.classList.add("hide")
				wrapper_section.classList.add("full_width")
			}
		}

		return true
	},//end toggle_inspector



	/**
	* COLLAPSE_TOGGLE_TRACK
	* Used by inspector to collapse information blocks like 'Relations'
	* Manages a persistent view ob content (body) based on user selection
	* Uses local DB to track the state of current element
	* @param object options
	*/
	collapse_toggle_track : (options) => {

		// options
			const header			= options.header // DOM item (usually label)
			const content_data		= options.content_data // DOM item (usually the body)
			const collapsed_id		= options.collapsed_id // id to set DDBB record id
			const collapse_callback	= options.collapse_callback // function
			const expose_callback	= options.expose_callback // function
			const default_state		= options.default_state || 'opened' // opened | closed . default body is exposed (open)


		// local DDBB table
			const collapsed_table = 'status'

		// content data state
			data_manager.prototype.get_local_db_data(collapsed_id, collapsed_table, true)
			.then(function(ui_status){

				// (!) Note that ui_status only exists when element is collapsed
				const is_collapsed = typeof ui_status==='undefined' || ui_status.value===false
					? false
					: true

				// console.log(default_state, "ui_status:", ui_status, 'is_collapsed', is_collapsed);

				if (is_collapsed) {

					if (!content_data.classList.contains('hide')) {
						content_data.classList.add('hide')
					}

					// exec function
					if (typeof collapse_callback==='function') {
						collapse_callback()
					}

				}else{

					if (default_state==='closed' && !ui_status) {

						// Nothing to do. Is the first time access. Not is set the local_db_data yet
						// console.log("stopped open:",default_state, collapsed_id);

					}else{

						content_data.classList.remove('hide')
						// exec function
						if (typeof expose_callback==='function') {
							expose_callback()
						}
					}
				}
			})

		// event attach
			header.addEventListener('click', fn_toggle_collapse)

		// fn_toggle_collapse
			function fn_toggle_collapse(e) {
				e.stopPropagation()

				const collapsed	= content_data.classList.contains('hide')
				if (!collapsed) {

					// close

					// add record to local DB
					data_manager.prototype.set_local_db_data({
						id		: collapsed_id,
						value	: true
					}, collapsed_table)

					content_data.classList.add('hide')

					// exec function
					if (typeof collapse_callback==='function') {
						collapse_callback()
					}
				}else{

					// open

					// remove record from local DB (or set value=false)
					if (default_state==='opened') {
						// default case for section_group, inspector_project, etc.
						data_manager.prototype.delete_local_db_data(collapsed_id, collapsed_table)
					}else{
						// when default is closed, we need to store the state as NOT collapsed
						// to prevent an infinite loop
						data_manager.prototype.set_local_db_data({
							id		: collapsed_id,
							value	: false
						}, collapsed_table)
					}

					content_data.classList.remove('hide')

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
	*/
	build_select_lang : (options) => {

		// options
			const id			= options.id || null
			const langs			= options.langs || page_globals.dedalo_projects_default_langs
			const selected		= options.selected || page_globals.dedalo_application_lang
			const action		= options.action
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

				const option = ui.create_dom_element({
					element_type	: 'option',
					value			: ar_langs[i].value,
					text_content	: ar_langs[i].label,
					parent			: fragment
				})
				// selected options set on match
				if (ar_langs[i].value===selected) {
					option.selected = true
				}
			}

		// des
			// for (const lang in langs) {
			// 	const option = ui.create_dom_element({
			// 		element_type	: 'option',
			// 		value			: lang,
			// 		text_content	: langs[lang],
			// 		parent			: fragment
			// 	})
			// 	// selected options set on match
			// 	if (lang===reference_lang) {
			// 		option.selected = true
			// 	}
			// }

		const select_lang = ui.create_dom_element({
			id				: id,
			element_type	: 'select',
			class_name		: class_name
		})
		select_lang.addEventListener("change", action)
		select_lang.appendChild(fragment)


		return select_lang
	},//end build_select_lang



	/**
	* GET_CONTENTEDITABLE_BUTTONS
	*/
	get_contenteditable_buttons : () => {

		const fragment = new DocumentFragment()

		// bold
			const button_bold = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'button bold',
				text_content	: "Bold",
				parent			: fragment
			})
			button_bold.addEventListener("click", (e)=>{
				e.stopPropagation()
				ui.do_command('bold', null)
			})
		// italic
			const button_italic = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'button italic',
				text_content	: "Italic",
				parent			: fragment
			})
			button_italic.addEventListener("click", (e)=>{
				e.stopPropagation()
				ui.do_command('italic', null)
			})
		// underline
			const button_underline = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'button underline',
				text_content	: "Underline",
				parent			: fragment
			})
			button_underline.addEventListener("click", (e)=>{
				e.stopPropagation()
				ui.do_command('underline', null)
			})
		// find and replace
			const button_replace = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'button replace',
				text_content	: "Replace",
				parent			: fragment
			})
			button_replace.addEventListener("click", (e)=>{
				e.stopPropagation()

				//replace_selected_text('nuevooooo')
				//const editor = document.activeElement.innerHTML
				//.textContent
				//.inner
				console.log("editor:",contenteditable_buttons.target);
					//console.log("editor:",editor);

				ui.do_search('palabras',contenteditable_buttons.target)

				ui.do_command('insertText', 'nuevoooooXXX')
			})

		// contenteditable_buttons
			const contenteditable_buttons = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'contenteditable_buttons'
			})
			contenteditable_buttons.addEventListener("mousedown", (e)=>{
				e.preventDefault()
			})
			contenteditable_buttons.appendChild(fragment)


		return contenteditable_buttons
	},//end get_contenteditable_buttons



	/**
	* ATTACH_TO_MODAL
	* Insert wrapper into a modal box
	* @return DOM element modal_container
	*/
	attach_to_modal : (header, body, footer, size='normal') => {

		// page_y_offset. Current window scroll position (used to restore later)
			const page_y_offset = window.pageYOffset || 0

		// modal container select from DOM (created hidden when page is builded)
			// const modal_container = document.querySelector('dd-modal')
		// modal container build new DOM on each call and remove on close
			// const previous_modal  	= document.querySelector('dd-modal')
			// if (previous_modal) {
			// 	previous_modal.remove()
			// }
			const modal_container	= document.createElement('dd-modal')
			// document.body.appendChild(modal_container)
			const wrapper_page		= document.querySelector('.wrapper_page')
			wrapper_page.appendChild(modal_container)


		// publish close event
			modal_container.publish_close = function(e) {
				event_manager.publish('modal_close', e)
				modal_container.remove()
			}

		// header . Add node header to modal header and insert it into slot
			if (header) {
				header.slot = 'header'
				header.classList.add('header')
				modal_container.appendChild(header)
			}

		// body . Add  wrapper to modal body and insert it into slot
			if (body) {
				body.slot = 'body'
				modal_container.appendChild(body)
			}

		// footer . Add node footer to modal footer and insert it into slot
			if (footer) {
				footer.slot = 'footer'
				modal_container.appendChild(footer)
			}

		// size. Modal special features based on property 'size'
			switch(size) {
				case 'big' :
					// hide contents to avoid double scrollbars
						const content_data_page = document.querySelector(".content_data.page")
							  // content_data_page.classList.add("hide")
						// const menu_wrapper = document.querySelector(".menu_wrapper")
							  // menu_wrapper.classList.add("hide")
						const debug_div = document.getElementById("debug")
							  // if(debug_div) debug_div.classList.add("hide")

					// show hidden elements again on close
						event_manager.subscribe('modal_close', () => {
							content_data_page.classList.remove("hide")
							// menu_wrapper.classList.remove("hide")
							if(debug_div) debug_div.classList.remove("hide")

							// scroll window to previous scroll position
								window.scrollTo({
									top			: page_y_offset,
									behavior	: "auto"
								})
						})

					modal_container._showModalBig();
					break;
				default :
					modal_container._showModal();
					break;
			}

		// navigation
			// const state	= {
			// 	event_in_history : false
			// }
			// const title	= 'modal'
			// const url	= null // 'Modal url'
			// 	console.log("history:",history, this);
			// history.pushState(state, title, url)

		// remove on close
			modal_container.on_close = () => {
				modal_container.remove()
			}


		return modal_container
	},//end attach_to_modal



	/**
	* DO_COMMAND
	* Exec document 'execCommand' https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand
	* Obsolete (!)
	*/
	do_command : (command, val) => {
		document.execCommand(command, false, (val || ""));
	},



	/**
	* DO_SEARCH
	* Unfinished function (!)
	*/
	do_search : (search_text, contenteditable) =>{
		//get the regext

		const regext_text = search_text.replace(/([.*+?^=!:${}()|[\]\/\\])/g, '\\$1');
		const regext = RegExp(regext_text, 'g')


		//const regext_text = search_text.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&').replace(/\s/g, '[^\\S\\r\\n]');

		//const regext_text = search_text.replace(/([.*+?^=!:${}()|[\]\/\\])/g, '\\$1');

		//const regext = new RegExp(regext_text)

		const text = getText(contenteditable)

		let match = regext.exec(text)

		console.log(match[0])

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

				if (node = node.firstChild) do {

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

				} while (node = node.nextSibling);

				return txt;
			}
	},//end do_search



	/**
	* CREATE_DIALOG
	* format:
	* dialog_options =
	*	{
	*		title			: 'Delete...',
	*		msg				: 'Are you sure?',
	*		header_class	: 'light',
	*		body_class 		: 'light',
	*		footer_class 	: 'light',
	*		user_options	:[{
	*			id 			: 1,
	*			label 		: 'Yes',
	*			class_name 	: 'success'
	*		},{
	*			id 			: 2,
	*			label 		: 'No',
	*			class_name 	: 'warning'
	*		},{
	*			id 			:3,
	*			label 		: 'Cancel',
	*			class_name 	: 'light'
	*		}]
	*	}
	*/
	create_dialog : (options) =>{

		const element_id	= options.element_id
		const title			= options.title 		|| ''
		const msg			= options.msg 			|| ''
		const header_class	= options.header_class 	|| 'light'
		const body_class	= options.body_class 	|| 'light'
		const footer_class	= options.footer_class 	|| 'light'
		const user_options	= options.user_options 	|| [{
									id			: 1,
									label		: get_label.ok,
									class_name	: 'light'
								}]

		// header
			const header = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'header ' + header_class,
			})
			// title
				const title_dialog = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'title',
					parent			: header,
					text_node		: title
				})

		// body
			const body = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'body ' + body_class,
			})
			// msg
				const msg_dialog = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'msg',
					parent			: body,
					text_node		: msg
				})

		// footer
			const footer = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'footer ' + footer_class
			})
			const on_option_mouseup = function (e){
				event_manager.publish('user_option_'+element_id, this.option_id)
				// modal.remove()
				modal._closeModal()
			}
			const user_options_len = user_options.length
			for (let i = 0; i < user_options_len; i++) {

				const option = user_options[i]

				//user_option
					const user_option = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'user_option ' + option.class_name,
						inner_html		: option.label,
						parent			: footer
					})
					// add option_id property
					user_option.option_id = option.id
					user_option.addEventListener("mouseup", on_option_mouseup);
			}

		// modal open
			const modal = ui.attach_to_modal(header, body, footer)


		return footer
	},//end create_dialog



	/**
	* RENDER_LIST_HEADER
	* Creates the header nodes needed for portal and section in the same unified way
	* @param array columns_map
	* 	Parsed columns_map array as [{id: 'oh87', label: 'Information'}]
	* @param object self
	* 	Instance of section/component_portal
	* @return DOM node header_wrapper
	*/
	render_list_header : (columns_map, self) =>{

		const ar_nodes				= []
		const columns_map_length	= columns_map.length
		for (let i = 0; i < columns_map_length; i++) {

			const column = columns_map[i]

			if (!column) {
				console.warn("ignored empty component: [key, columns_map]", i, columns_map);
				continue;
			}

			// label
				const label = []
				const current_label = SHOW_DEBUG
					? column.label //+ " [" + component.tipo + "]"
					: column.label
				label.push(current_label)

			// node header_item
				const id			= column.id //component.tipo + "_" + component.section_tipo +  "_"+ component.parent
				const header_item	= ui.create_dom_element({
					element_type	: "div",
					id				: id,
					inner_html		: label.join(' ')
				})

			// sub header items
				if(column.columns_map){

					header_item.classList.add("with_sub_header")
					header_item.innerHTML = '<span>' + label.join(' ') + '</span>'

					const sub_header	= ui.create_dom_element({
						element_type	: "div",
						class_name		: 'sub_header',
						parent			: header_item
					})

					const current_column_map	= column.columns_map
					const columns_map_length	= current_column_map.length
					for (let j = 0; j < columns_map_length; j++) {
						const current_column  = current_column_map[j]
						// node header_item
						const id				=  current_column.id //component.tipo + "_" + component.section_tipo +  "_"+ component.parent
						const sub_header_item	= ui.create_dom_element({
							element_type	: "div",
							id				: id,
							inner_html		: current_column.label,
							parent			: sub_header
						})
					}
				}

			ar_nodes.push(header_item)
		}//end for (let i = 0; i < columns_length; i++)

		// header_wrapper
			const header_wrapper = ui.create_dom_element({
				element_type	: "div",
				class_name		: "header_wrapper_list " + self.model
			})

			const searchParams = new URLSearchParams(window.location.href);
			const initiator = searchParams.has("initiator")
				? searchParams.get("initiator")
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

		// css calculation
			// Object.assign(
			// 	header_wrapper.style,
			// 	{
			// 		//display: 'grid',
			// 		//"grid-template-columns": "1fr ".repeat(ar_nodes_length),
			// 		"grid-template-columns": self.id_column_width + " repeat("+(ar_nodes_length)+", 1fr)",
			// 	}
			// )

		return header_wrapper
	},//end render_list_header



	/**
	* FLAT_COLUMN_ITEMS
	* create the css grid columns to build list items
	* @param array list
	*	Array of column items
	* @return array ar_elements
	*/
	flat_column_items : (list, level_max=3, type='fr', level=1) => {

		if (level>level_max) {
			return []
		}

		let ar_elements = []
		const list_length = list.length
		for (let i = 0; i < list_length; i++) {

			const item = list[i]

			if (item.width) {
				// defined width cases
				ar_elements.push(item.width)
			}else{
				// non defined width cases, uses default grid measure like '1fr'
				const unit = (item.columns_map && item.columns_map.length>0)
					? ui.flat_column_items(item.columns_map, level_max, type, level++).length || 1
					: 1
				ar_elements.push(unit+type) // like '1fr'
			}
		}
		return ar_elements
	},//end flat_column_items



	/**
	* SET_BACKGROUND_IMAGE
	*/
	set_background_image : (image, target_node) => {

		const canvas	= document.createElement('canvas');
		canvas.width	= image.width;
		canvas.height	= image.height;

		try {
			canvas.getContext('2d').drawImage(image, 0, 0, image.width, image.height);
			const rgb = canvas.getContext('2d').getImageData(0, 0, 1, 1).data;

			// round rgb values
				function correction(value) {

					const factor = 1.016

					const result = (value>127)
						? Math.floor(value * factor)
						: Math.floor(value / factor)

					return result
				}

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

		canvas.remove()
		image.classList.remove('loading')

		return image
	},//end set_background_image



	/**
	* MAKE_COLUMN_RESPONSIVE
	* @return bool
	*/
	make_column_responsive : function(options) {

		// options
			const selector	= options.selector // as '#column_id_rsc3652'
			const label		= options.label

		// strip label HTML tags
			const label_text = strip_tags(label);

		// const add_css_rule = function (selector, css) {

		// 	// css_style_sheet
		// 		// create new styleSheet if not already exists
		// 		// if (!window.css_style_sheet) {
		// 		// 	const style = document.createElement("style");
		// 		// 	style.type = 'text/css'
		// 		// 	document.head.appendChild(style);
		// 		// 	window.css_style_sheet = style.sheet;
		// 		// }
		// 		// const css_style_sheet	= window.css_style_sheet
		// 		const css_style_sheet		= get_elements_style_sheet()

		// 	const rules			= css_style_sheet.rules
		// 	const rules_length	= rules.length
		// 	for (let i = rules_length - 1; i >= 0; i--) {

		// 		const current_selector = rules[i].selectorText
		// 		if(current_selector===selector) {
		// 			// already exists
		// 			// console.warn("/// stop current_selector:",current_selector);
		// 			return false
		// 		}
		// 	}

		// 	const propText = typeof css==='string'
		// 		? css
		// 		: Object.keys(css).map(function (p) {
		// 			return p + ':' + (p==='content' ? "'" + css[p] + "'" : css[p]);
		// 		  }).join(';');
		// 	css_style_sheet.insertRule(selector + '{' + propText + '}', css_style_sheet.cssRules.length);

		// 	return true
		// };

		// const width  = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
		// if (width<960) {
			// return add_css_rule(`#column_id_${column_id}::before`, {
			// return add_css_rule(`${selector}::before`, {
			// 	content	: label_text
			// });

			const css_object = {
				[`${selector}::before`] : {
					style : function() {
						return {
							selector : `${selector}::before`,
							value : {
								content : label_text
							}
						}
					}
				}
			}
			set_element_css(selector.replace('#',''), css_object)
		// }
	},//end make_column_responsive



	/**
	* SET_PARENT_CHECKED_VALUE
	* Set input check value based on direct children checked values
	* Could be checked, unchecked or indeterminate
	* @return bool
	*/
		// set_parent_checked_value : (input_node, all_direct_children, callback) => {

		// 	// look children status until find checked value false
		// 		const all_children_checked = (()=>{

		// 			const all_direct_children_length = all_direct_children.length
		// 			for (let i = 0; i < all_direct_children_length; i++) {
		// 				if(all_direct_children[i].checked!==true) {
		// 					return false
		// 				}
		// 			}

		// 			return true
		// 		})()

		// 	// set checked value
		// 		if (all_children_checked===true) {
		// 			// full checked
		// 			input_node.indeterminate	= false
		// 			input_node.checked			= true
		// 		}else{
		// 			// intermediate
		// 			input_node.checked			= false
		// 			input_node.indeterminate	= true
		// 		}

		// 	// callback
		// 		if (callback) {
		// 			callback(input_node)
		// 		}

		// 	return true
		// },//end set_parent_checked_value



	/**
	* EXEC_SCRIPTS_INSIDE
	* @return js promise
	*/
		// exec_scripts_inside( element ) {
		// 	console.log("context:",context);

		// 	const scripts 		 = Array.prototype.slice.call(element.getElementsByTagName("script"))
		// 	const scripts_length = scripts.length
		// 	if (scripts_length<1) return false

		// 	const js_promise = new Promise((resolve, reject) => {

		// 		const start = new Date().getTime()

		// 		for (let i = 0; i < scripts_length; i++) {

		// 			if(SHOW_DEBUG===true) {
		// 				var partial_in = new Date().getTime()
		// 			}

		// 			if (scripts[i].src!=="") {
		// 				const tag 	  = document.createElement("script")
		// 					  tag.src = scripts[i].src
		// 				document.getElementsByTagName("head")[0].appendChild(tag)

		// 			}else{
		// 				//eval(scripts[i].innerHTML);
		// 				console.log(scripts[i].innerHTML); //continue;

		// 				// Encapsulate code in a function and execute as well
		// 				const my_func = new Function(scripts[i].innerHTML)
		// 					//console.log("my_func:",my_func); continue;
		// 					my_func() // Exec
		// 			}

		// 			if(SHOW_DEBUG===true) {
		// 				const end  	= new Date().getTime()
		// 				const time 	= end - start
		// 				const partial = end - partial_in
		// 				//console.log("->insertAndExecute: [done] "+" - script time: " +time+' ms' + ' (partial:'+ partial +')')
		// 			}
		// 		}

		// 	});//end js_promise


		// 	return js_promise;
		// };//end  exec_scripts_inside



};//end ui



/**
* EXECUTE_FUNCTION_BY_NAME
*
*//*
export const execute_function_by_name = function(functionName, context /*, args *\/) {

	const args 		 = Array.prototype.slice.call(arguments, 2);
	const namespaces = functionName.split(".");
	const func = namespaces.pop();
	for(let i = 0; i < namespaces.length; i++) {
		context = context[namespaces[i]];
	}

	return context[func].apply(context, args);
}//end execute_function_by_name
*/
