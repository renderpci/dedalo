/*
	tool_metadata
*/


// tool_metadata CLASS
var tool_metadata = new function() {



	// properties
	this.container
	this.metadata_options
	this.path
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_metadata/trigger.tool_metadata.php';


	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		
		// debug
			if(SHOW_DEBUG===true) {
				console.log("->tool_metadata init options:",options);
			}
		
		const self = this

		// set options
			self.container			= options.container
			self.metadata_options	= options.metadata_options
			self.path				= options.path
			self.extensions			= options.extensions


		return new Promise(function(resolve){
			
			self.render()
			.then(function(response){
				self.container.appendChild(response)
			})

			resolve(self)
		})
	};//end init



	/**
	* RENDER
	* @return 
	*/
	this.render = function() {

		const self = this

		return new Promise(function(resolve){		

			const fragment = new DocumentFragment()

			// form
				const metadata_form = common.create_dom_element({
					element_type	: 'div',
					class_name		: 'metadata_form',
					parent			: fragment
				})

			// title
				common.create_dom_element({
					element_type	: 'h3',
					class_name		: 'title',
					inner_html		: get_label["properties"] || "Properties",
					parent			: metadata_form
				})

			// metadata options
				const options_list = common.create_dom_element({
					element_type	: 'ul',
					class_name		: 'options_list',
					parent			: metadata_form
				})
				const inputs = []
				for (let i = 0; i < self.metadata_options.length; i++) {

					const li = common.create_dom_element({
						element_type	: 'li',
						parent			: options_list
					})

					const property_name = common.create_dom_element({
						element_type	: 'label',
						class_name		: 'title',
						inner_html		: self.metadata_options[i].name,
						parent			: li
					})

					const property_value = common.create_dom_element({
						element_type	: 'input',
						type			: 'text',
						name			: self.metadata_options[i].name,
						value			: self.metadata_options[i].value,
						class_name		: 'input',
						parent			: li
					})					
					inputs.push(property_value)
				}

			// path
				// title
					common.create_dom_element({
						element_type	: 'h3',
						class_name		: 'title',
						inner_html		: get_label["path"] || "Path",
						parent			: metadata_form
					})
				// options
					const path_list = common.create_dom_element({
						element_type	: 'ul',
						class_name		: 'options_list',
						parent			: metadata_form
					})

					const path_li = common.create_dom_element({
						element_type	: 'li',
						parent			: path_list
					})

					const property_name = common.create_dom_element({
						element_type	: 'label',
						class_name		: 'title',
						inner_html		: 'Root dir (recursive)',
						parent			: path_li
					})

					const path_input = common.create_dom_element({
						element_type	: 'input',
						type			: 'text',
						value			: self.path,
						parent			: path_li
					})

					const count_files = function(path_value){

						// clean
							while (response_path_info.firstChild) {
								response_path_info.removeChild(response_path_info.firstChild)
							}

						// spinner
							const spinner = common.create_dom_element({
								element_type	: 'div',
								class_name		: 'spinner',
								parent			: response_path_info
							})

						self.count_files({
							path	: path_value
						})
						.then(function(reponse){
							spinner.remove()
							const class_name = (reponse<1) ? 'red' : 'green'
							common.create_dom_element({
								element_type	: 'span',
								class_name		: class_name,
								inner_html		: 'Total files: ' + reponse.toLocaleString() + " [" + self.extensions.join(", ") + "]" ,
								parent			: response_path_info
							})
						})
					} 
					// onchange count
						path_input.addEventListener("keyup", function(e){

							const path_value = this.value
							if (path_value===self.path) {
								console.log("Ignored non changed path value:", path_value);
								return
							}

							return count_files(path_value)
						})
					// first count when placed in DOM
						when_in_dom(path_input, function(){
							count_files(path_input.value)
						})


					const response_path_info = common.create_dom_element({
						element_type	: 'div',
						class_name		: 'response_path_info',
						parent			: metadata_form
					})
				
			// button submit
				const button_submit = common.create_dom_element({
					element_type	: 'button',
					class_name		: 'btn btn-default',
					inner_html		: 'Process',
					parent			: metadata_form
				})
				button_submit.addEventListener("click", function(){

					if (!confirm(get_label.seguro)) {
						return false
					}

					// clean
						while (response_element.firstChild) {
							response_element.removeChild(response_element.firstChild)
						}

					// spinner
						const spinner = common.create_dom_element({
							element_type	: 'div',
							class_name		: 'spinner',
							parent			: response_element
						})						
					
					const data = inputs.map(function(item){
						return {
							key		: item.name,
							value	: item.value
						}
					})
					const path = path_input.value

					self.process_files({
						data	: data,
						path	: path
					})
					.then(function(result){
						
						spinner.remove()						

						const info = common.create_dom_element({
							element_type	: 'div',
							class_name		: 'info',
							inner_html		: 'Total edited files: ' + (result ? result.length : 0),
							parent			: response_element
						})

						const show_detail = common.create_dom_element({
							element_type	: 'button',
							class_name		: 'btn btn-default btn-sm',
							inner_html		: 'detail',
							parent			: response_element
						})
						show_detail.addEventListener("click", function(){
							// response detail
							detail.classList.toggle("hide")
						})

						const detail = common.create_dom_element({
							element_type	: 'pre',
							class_name		: 'hide',
							inner_html		: JSON.stringify(result, null, 2),
							parent			: response_element
						})						
					})
				})

			// response
				const response_element = common.create_dom_element({
					element_type	: 'div',
					class_name		: 'response_element',
					parent			: metadata_form
				})


			resolve(fragment)
		})
	};//end render



	/**
	* COUNT_FILES
	* @return promise
	*/
	this.count_files = function(options) {

		const self = this

		return new Promise(function(resolve){
		
			const trigger_vars = {
				mode		: 'count_files',				
				path		: options.path,
				extensions	: self.extensions
			}
			const url_trigger = self.url_trigger

			// XMLHttpRequest
			common.get_json_data(url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_metadata.count_files] response",response)
				}

				resolve(response.result)
			}, function(error) {
				console.log("[tool_metadata.count_files] error", error)
			})
		})
	};//end count_files



	/**
	* PROCESS_FILES
	* @return promise
	*/
	this.process_files = function(options) {

		const self = this		

		return new Promise(function(resolve){

			const trigger_vars = {
				mode		: 'process_files',
				data		: options.data,
				path		: options.path,
				extensions	: self.extensions
			}
			const url_trigger = self.url_trigger

			// XMLHttpRequest
			common.get_json_data(url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_metadata.process_files] response",response)
				}

				resolve(response.result)
			}, function(error) {
				console.log("[tool_metadata.process_files] error", error)
			})
		})
	};//end process_files



};//end tool_metadata