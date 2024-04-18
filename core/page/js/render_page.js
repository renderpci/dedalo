// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_NOTIFICATION, Promise, DEDALO_ROOT_WEB, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {render_server_response_error} from '../../common/js/render_common.js'
	import {instantiate_page_element} from './page.js'
	// import {clone} from '../../common/js/utils/index.js'



/**
* RENDER_PAGE
* Manages the component's logic and appearance in client side
*/
export const render_page = function() {

	return true
}//end render_page



/**
* EDIT
* Render node for use in section
* @param object options
* @return HTMLElement wrapper
*/
render_page.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content data
		const content_data = await get_content_data(self) // result is a promise
		if (render_level==='content') {
			return content_data
		}

	// wrapper
		const wrapper = document.createElement('div')
		wrapper.classList.add('wrapper', self.type)
		wrapper.appendChild(content_data)
		// set pointers
		wrapper.content_data = content_data
		// fix node before finish render to allow select by render_notification_msg
		self.node = wrapper


 	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	// const fragment = new DocumentFragment()

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data', self.type)

	// check page context is valid
		if (!self.context) {

			// running_with_errors.
			// It's important to set instance as running_with_errors because this
			// generates a temporal wrapper. Once solved the problem, (usually a not login scenario)
			// the instance could be built and rendered again replacing the temporal wrapper
				self.running_with_errors = [
					{
						msg		: 'Invalid context',
						error	: 'invalid_context'
					}
				]

			const wrapper_page = render_server_response_error(
				self.running_with_errors
			)

			return wrapper_page
		}

	// dedalo_maintenance_mode. maintenance_msg (defined in config and get from environment.js.php)
		if(page_globals.maintenance_mode===true){
			const maintenance_container = render_maintenance_msg()
			content_data.prepend(maintenance_container)
		}

	// dedalo_notification. notification_msg (defined in config and get from environment.js.php)
		if(typeof page_globals.dedalo_notification!=='undefined' && page_globals.is_logged===true) {
			event_manager.publish('dedalo_notification', page_globals.dedalo_notification)
		}

	// add all instance rendered nodes
		// const ar_instances_length = self.ar_instances.length;

		// sequential mode
			// for (let i = 0; i < ar_instances_length; i++) {

			// 	const current_instance = self.ar_instances[i]

			// 	// exclude menu already added
			// 	if(current_instance.model==='menu') continue;

			// 	const child_item = current_instance.render({
			// 		render_level : 'full'
			// 	})

			// 	content_data.appendChild(await child_item)
			// }

		// parallel mode
			// const ar_promises = []
			// for (let i = 0; i < ar_instances_length; i++) {

			// 	const current_instance = self.ar_instances[i]

			// 	// exclude menu already added to wrapper
			// 	if(current_instance.model==='menu') continue;

			// 	const render_promise = current_instance.render()
			// 	ar_promises.push(render_promise)
			// }
			// await Promise.all(ar_promises).then(function(child_items) {
			//   for (let i = 0; i < child_items.length; i++) {
			//   	content_data.appendChild(child_items[i])
			//   }
			// });

		// async mode
			const render_promises = []
			const context_length = self.context.length
			for (let i = 0; i < context_length; i++) {

				const current_context = self.context[i]

				// component check
					// if (current_context.type==='component') {
					// 	console.log('Ignored component context in page:', current_context);
					// 	self.running_with_errors = [
					// 		{
					// 			msg		: 'Invalid page element: ' + current_context.type + ' - ' + current_context.label,
					// 			error	: 'invalid_page_element'
					// 		}
					// 	]
					// 	const error_node = render_server_response_error(
					// 		self.running_with_errors
					// 	)
					// 	content_data.appendChild(error_node)
					// 	continue;
					// }

				// menu case. Prevent to render again on refresh page
					// const non_destroyable_instance = self.ar_instances.find(el => el.model===current_context.model)
					const non_destroyable_instance = self.ar_instances.find(el => el.model===current_context.model && el.destroyable===false)
					if (non_destroyable_instance) {
						content_data.appendChild(non_destroyable_instance.node)
						continue;
					}

				// load_item_with_spinner
					const render_promise = ui.load_item_with_spinner({
						container			: content_data,
						preserve_content	: true,
						label				: current_context.label || current_context.model,
						model				: current_context.model,
						callback			: async () => {
							// instance
							const current_instance = await instantiate_page_element(
								self, // object page instance
								current_context // object is used as source
							)

							// store instance to locate on destroy
							self.ar_instances.push(current_instance)

							// build (load data)
							const autoload = true // Note that it's necessary to load data here (in addition to context)
							await current_instance.build(autoload)

							// render node
							const node = await current_instance.render()

							// debug
							// console.log('))) PAGE RENDERED NODE )))', node);

							return node || ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'error',
								inner_html		: 'Error on render element ' + current_instance.model
							})
						}
					})
					render_promises.push(render_promise)
			}//end for (let i = 0; i < elements_length; i++)

	// render is complete
		Promise.all(render_promises)
		.then(function(response){
			// event publish
			// event_manager.publish('render_'+self.id, wrapper)
			event_manager.publish('render_page')
		})


	return content_data
}//end get_content_data



/**
* RENDER_MAINTENANCE_MSG
* Render HTML based in environment.js.php page_globals.maintenance_mode value
* @return HTMLElement maintenance_container
*/
const render_maintenance_msg = function() {

	// maintenance_container
	const maintenance_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'maintenance_container'
	})

	// maintenance_msg
	const maintenance_msg = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'maintenance_msg',
		inner_html		: '<span style="font-size:2rem"> 👩🏽‍💻 </span> ' + (get_label.site_under_maintenance || 'System in maintenance'),
		parent			: maintenance_container
	})


	return maintenance_container
}//end render_maintenance_msg



/**
* RENDER_NOTIFICATION_MSG
* Render HTML from environment.js.php notification data
* @param object dedalo_notification
* 	Sample
* 	{
* 		msg: "Testing the notification system",
        class_name: "warning"
* 	}
* (!) DEDALO_NOTIFICATION is defined in 'environment.js.php' or
* could be received from update_lock_components_state event
* @return HTMLElement|null notification_msg
*/
export const render_notification_msg = function( self, dedalo_notification ) {

	const wrapper = self.node

	// empty case
		if (!dedalo_notification) {
			if (wrapper.notification_container) {
				wrapper.notification_container.remove() // remove node
				wrapper.notification_container = null // set pointer
				if(SHOW_DEBUG===true) {
					console.warn('))) Removed wrapper.notification_container:', dedalo_notification);
				}
			}
			// fix to compare with next requests
			self.last_dedalo_notification = null

			return null
		}


	// check for real changes. If is the same value, ignore it
		if (self.last_dedalo_notification &&
			self.last_dedalo_notification.msg===dedalo_notification.msg &&
			self.last_dedalo_notification.class_name===dedalo_notification.class_name
			) {
			if(SHOW_DEBUG===true) {
				console.warn('))) Ignored dedalo_notification unchanged:', dedalo_notification);
			}
			return null
		}

	// notification_container
		if (!wrapper.notification_container) {
			// create a new one
			wrapper.notification_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'notification_container'
			})
			// prepend to main node
			wrapper.prepend(wrapper.notification_container)
		}else{
			// clean already existing container
			while (wrapper.notification_container.firstChild) {
				wrapper.notification_container.removeChild(wrapper.notification_container.firstChild);
			}
		}

	// dedalo_notification
		const msg			= dedalo_notification.msg || 'Unknown notification'
		const class_name	= dedalo_notification.class_name || ''

	// notification_msg
		const notification_msg = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'notification_msg ' + class_name,
			inner_html		: msg,
			parent			: wrapper.notification_container
		})
		// css animation fade
		setTimeout(()=>{
			notification_msg.style.setProperty('--speed', '1s');
			notification_msg.classList.add('fade-in')
		}, 0)

	// fix to compare with next requests
	self.last_dedalo_notification = dedalo_notification


	return notification_msg
}//end render_notification_msg



/**
* RENDER_MENU
* @return HTMLElement render_menu
*/
	// const render_menu = async function(self) {

	// 	const menu_instance = self.ar_instances.find( instance => instance.model==='menu' )
	// 	if(menu_instance){

	// 		const menu_item = menu_instance.render({
	// 			render_level : 'full'
	// 		})
	// 		return menu_item
	// 	}

	// 	return null
	// }//end render_menu



/**
* RENDER_SERVER_RESPONSE_ERROR
* Render generic page error (Raspa background)
* @param string msg
* @return HTMLElement wrapper|error_container
*/
	// render_page.render_server_response_error = function(msg, add_wrapper=true) {

	// 	// wrapper
	// 		const wrapper = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name		: 'wrapper page'
	// 		})

	// 	// error_container
	// 		const error_container = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name		: 'page_error_container',
	// 			parent			: wrapper
	// 		})

	// 	// icon_dedalo
	// 		ui.create_dom_element({
	// 			element_type	: 'img',
	// 			class_name		: 'icon_dedalo',
	// 			src				: DEDALO_CORE_URL + '/themes/default/dedalo_logo.svg',
	// 			parent			: error_container
	// 		})

	// 	// server_response_error h1
	// 		ui.create_dom_element({
	// 			element_type	: 'h1',
	// 			class_name		: 'server_response_error',
	// 			inner_html		: 'Server response error: <br>' + msg,
	// 			parent			: error_container
	// 		})

	// 	// more_info
	// 		ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name		: 'more_info',
	// 			inner_html		: 'Received data format is not as expected. See your server log for details',
	// 			parent			: error_container
	// 		})

	// 	// add_wrapper false  case
	// 		if (add_wrapper===false) {
	// 			return error_container
	// 		}


	// 	return wrapper
	// }//end render_server_response_error



// @license-end
