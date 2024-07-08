// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



// imports
	import {render_saml} from './render_saml.js'



/**
* SAML
*/
export const saml = function() {

}//end saml



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	saml.prototype.render_saml_wrapper	= render_saml.prototype.render_saml_wrapper



/**
* INIT
* @param object options
* {
* 	caller: object (login instance),
* 	saml_config: object
* }
* @return bool
*/
saml.prototype.init = async function (options) {

	const self = this

	// status update
		self.status = 'initializing'

	// set options
		self.caller			= options.caller || null
		self.saml_config	= options.saml_config || null

	// status update
		self.status = 'initialized'


	return true
}//end init



/**
* RENDER
* @return HTMLElement|bool result_node
*/
saml.prototype.render = async function () {

	const self = this

	const result_node = self.render_saml_wrapper()

	// status update
		self.status = 'rendered'

	return result_node
}//end render



/**
* SAML_LOGIN
* @return object api_response
*/
saml.prototype.saml_login = async function () {

	// redirect to login SAML URL
	window.location.href = DEDALO_CORE_URL + '/login/saml/';

	return api_response
}//end saml_login



// @license-end
