// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/


// import
	import {event_manager} from '../../js/event_manager.js';
	import {data_manager} from '../../js/data_manager.js';



// request_conf_editor
export const request_conf_editor = function () {



}//end request_conf_editor



/**
* INIT
* @param object options
*/
request_conf_editor.init = async function(options) {

	const self = this

	console.log("init options:",options);

	// options
		const main_div	= options.main_div
		const tipo		= options.tipo

	// fix vars
		self.tipo			= tipo
		self.trigger_url	= 'trigger.request_conf_editor.php'

	// debug
		main_div.innerHTML = 'Ok ' + JSON.stringify(options)

	// load properties
		function test_flow(i) {
			self.get_properties()
			.then(function(properties){

				main_div.innerHTML = ''
				const pre = document.createElement("pre")
				pre.innerHTML = JSON.stringify(properties, null, 2)
				main_div.appendChild(pre)

				i++; if (i<=10) {
					setTimeout(function(){
						const new_properties = Object.assign(properties, {"test": i})
						self.save_properties(new_properties)
						.then(function(response){
							test_flow(i)
						})
					}, 1000/4)
				}
			})
		}
		test_flow(1)



}//end init



/**
* GET_PROPERTIES
* Load properties of current tipo from DDBB
* @param object options
*/
request_conf_editor.get_properties = function() {

	const self = this

	return new Promise(function(resolve){

		data_manager.request({
			url		: self.trigger_url,
			body	: {
				mode	: 'get_properties',
				tipo	: self.tipo
			}
		})
		.then(function(response){
			console.log(response)

			const properties = response.result

			resolve(properties)
		})
	})
}//end get_properties



/**
* SAVE_PROPERTIES
* @param object options
*/
request_conf_editor.save_properties = function(value) {

	const self = this

	return new Promise(function(resolve){

		data_manager.request({
			url		: self.trigger_url,
			body	: {
				mode		: 'save_properties',
				tipo		: self.tipo,
				properties	: value
			}
		})
		.then(function(response){
			console.log("save_properties response", response)

			resolve(response)
		})
	})
}//end save_properties



// @license-end
