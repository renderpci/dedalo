/**
* INSTALL
*
*
*
*/
var install = new function() {

	'use strict';


	this.hierarchies_list	= null;
	this.url_trigger		= DEDALO_LIB_BASE_URL + '/install/trigger.install.php';



	/**
	* INIT
	* @return
	*/
	this.init = function(options) {

		const self = this

		// options
			const hierarchies_list	= options.hierarchies_list // DOM ul element

		//set
			self.hierarchies_list = hierarchies_list


		return true
	};//end init



	/**
	* INSTALL_DB_FROM_DEFAULT_FILE
	* Call trigger and exec install_db_from_default_file function
	* @param DOM object button
	*/
	this.install_db_from_default_file = function(button) {

		const self = this

		if (!confirm(get_label.seguro)) {
			return false;
		}

		// loading
			html_page.loading_content( document.body, 1 );


		// trigger_vars
			const trigger_vars = {
				mode : 'install_db_from_default_file'
			}

		// HTTPX Request
			const js_promise = common.get_json_data(self.url_trigger, trigger_vars)
			.then(function(response){
				console.log("[install.install_db_from_default_file] response: ", response);

				if (response.result===false) {
					const msg = response.msg || 'Undefined'
					alert('Error [install db] ' + msg)
					html_page.loading_content( document.body, 0 );
					return
				}

				location.reload()
			})


		return js_promise
	};//end install_db_from_default_file



	/**
	* INSTALL_HIERARCHIES
	* Call trigger and exec install_hierarchies function
	* @param DOM object button
	*/
	this.install_hierarchies = function(button) {

		const self = this

		if (!confirm(get_label.seguro)) {
			return false;
		}

		// input checkboxes
			const checkboxes = self.hierarchies_list.querySelectorAll("input")

		// checked values
			const hierarchies = [...checkboxes].filter(el => {
				return (el.checked)
			}).map(el => el.value)

		// trigger_vars
			const trigger_vars = {
				mode		: 'install_hierarchies',
				hierarchies	: hierarchies
			}

		// loading
			html_page.loading_content( document.body, 1 );

		// HTTPX Request
			const js_promise = common.get_json_data(self.url_trigger, trigger_vars)
			.then(function(response){
				console.log("[install.install_hierarchies] response: ", response);

				if (response.result===false) {
					const msg = response.msg || 'Undefined'
					alert('Error install get_json_data: ' + msg)
					html_page.loading_content( document.body, 0 );
					return
				}

				setTimeout(function(){
					location.reload()
				}, 2000)
			})


		return js_promise
	};//end install_hierarchies



}//end install class