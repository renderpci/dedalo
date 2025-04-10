// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



// imports
	import {ui} from '../../../common/js/ui.js'



/**
* RENDER_SAML
* Manages the component's logic and appearance in client side
*/
export const render_saml = function() {

	return true
}//end render_saml



/**
* RENDER_SAML_WRAPPER
* Render SAML buttons to allow SAML login
* @return HTMLElement saml_wrapper
*/
render_saml.prototype.render_saml_wrapper = function () {

	const self = this

	const saml_config = self.saml_config

	const saml_wrapper = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'saml_wrapper'
	})

	if (!saml_config) {
		console.error('Error. unable to get saml_config from caller:', self.caller );
		return saml_wrapper
	}

	// button SAML login
		const button_enter = ui.create_dom_element({
			element_type	: 'button',
			inner_html		: 'Autologin',
			class_name		: 'button_enter success',
			parent			: saml_wrapper
		})
		const click_handler = (e) => {
			e.stopPropagation()
			// exec login action
			self.saml_login()
		}
		button_enter.addEventListener('click', click_handler)


	return saml_wrapper
}//end render_saml_wrapper



// @license-end
