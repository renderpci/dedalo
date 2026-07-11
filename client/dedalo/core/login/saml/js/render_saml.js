// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



// imports
	import {ui} from '../../../common/js/ui.js'



/**
* RENDER_SAML
* Rendering mixin for the SAML SSO login widget.
*
* This module defines `render_saml`, a constructor whose prototype methods are
* mixed into the `saml` class (see saml.js) via direct prototype assignment.
* Its sole responsibility is to build the DOM subtree that renders the SAML
* "Autologin" button inside the main login form.
*
* Architecture note:
*   - render_saml is instantiated only as a mixin source, never directly.
*     The real instance is always a `saml` object created by saml.js.
*   - `self.saml_config` is supplied by `saml.prototype.init` and holds the
*     SAML configuration object sourced from `context.properties.saml_config`
*     on the server side.
*   - Clicking the button delegates to `saml.prototype.saml_login`, which
*     redirects the browser to the IdP entry point at
*     `DEDALO_ROOT_WEB + '/core/login/saml/'`.
*
* Exports: render_saml (constructor / mixin source)
*/
export const render_saml = function() {

	return true
}//end render_saml



/**
* RENDER_SAML_WRAPPER
* Builds and returns the DOM container that holds the SAML login button.
*
* Called by `saml.prototype.render` after the instance has been initialised.
* If `self.saml_config` is absent (e.g. the server returned no SAML settings),
* the method logs an error and returns an empty wrapper so the rest of the
* login form can still render without crashing.
*
* The click handler calls `self.saml_login()`, which performs a full-page
* redirect to the IdP entry point; no async API call is made here.
*
* @returns {HTMLElement} saml_wrapper - a <div class="saml_wrapper"> containing
*   the login button, or an empty wrapper when saml_config is unavailable
*/
render_saml.prototype.render_saml_wrapper = function () {

	const self = this

	const saml_config = self.saml_config

	const saml_wrapper = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'saml_wrapper'
	})

	if (!saml_config) {
		// Guard: saml_config must be provided by init() before rendering.
		// Return an empty wrapper so the surrounding login form degrades gracefully.
		console.error('Error. unable to get saml_config from caller:', self.caller );
		return saml_wrapper
	}

	// button SAML login
	// Clicking triggers a full browser redirect to the IdP; no async work needed here.
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
