/**
* COMPONENT_CALCULATION
*
*
*
*/
var component_calculation = new function() {

	"use strict"


	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/component_calculation/trigger.component_calculation.php';



	/**
	* INIT
	*/
	this.inited = []
	this.init = function(options) {

		const self = this

		const component_name = options.component_name
		const uid 			 = options.uid

		// Default
		let id_wrapper  = 'wrapper_' + options.uid
		// Overwrited
		if (typeof options.id_wrapper!=="undefined") {
			id_wrapper  = options.wrapper_id
		}
		const wrapper_obj = document.getElementById(id_wrapper)
			if (!wrapper_obj) {
				// Error on find wrapper
				let msg = "[component_calculation:init] ERROR. wrapper_obj not found! ("+id_wrapper+")"
				console.log(msg, "id_wrapper: ",id_wrapper)
				alert(msg)
				return false
			}

		const init_uid = wrapper_obj.dataset.section_tipo +"_"+ wrapper_obj.dataset.parent +"_"+ wrapper_obj.dataset.tipo	
			//console.log("this.inited", init_uid, this.inited, this.inited[init_uid]);

		//this.get_dato(wrapper_obj)
		if (typeof this.inited[init_uid]==="undefined" || this.inited[init_uid]!==true) {

			// LOAD (EVENT)
			window.addEventListener("load", function (event) {				
				component_calculation.get_dato(wrapper_obj)
			});

			const formula   	 	= wrapper_obj.dataset.formula
			const formula_parsed 	= JSON.parse(formula)
			const ar_components_formula	= wrapper_obj.dataset.ar_components_formula
			const data 					= JSON.parse(ar_components_formula)
			//const data 			 		= Object.keys(components_formula_parse)

			console.log(data)

			window.addEventListener('component_save', function(event){
							
				const saved_tipo = event.detail.dataset.tipo				
				if(SHOW_DEBUG===true) {
					console.log("component_calculation init component_save data: ", data, saved_tipo);
				}
						
				if(data.includes(saved_tipo)){
					// Re select wrapper and reload twice
						const current_wrapper = document.getElementById(id_wrapper)
						if (current_wrapper) {
							const js_promise = component_common.load_component_by_wrapper_id(id_wrapper).then(function(response){
								//update the dato 
								const new_component = document.getElementById(id_wrapper)
								const dato_promise  = self.get_dato(new_component)

								dato_promise.then(function(){
									component_common.load_component_by_wrapper_id(id_wrapper)
								},false)
							})
						}
				}								
			},false)

		}//end if (this.inited!==true)

		this.inited[init_uid] = true
	};//end init



	/**
	* GET_DATO
	* @return 
	*/
	this.get_dato = function(wrapper_obj) {

		const self = this

		//console.log(wrapper_obj);
		return new Promise(function(resolve, reject) {
			let saved_dato = wrapper_obj.dataset.dato
			//let uid = wrapper_obj.id.substring(8)
			let content_data = wrapper_obj.querySelector('div.css_calculation')
			let dato = self.solve_the_formula(content_data)

				//console.log("saved_dato", dato);
				//console.log("new dato",dato);
				//console.log("dato != saved_dato", dato != saved_dato);

			if(dato != saved_dato) {
				wrapper_obj.dataset.dato = dato
				content_data.innerHTML = dato
				//wrapper_obj.dataset.formula = content_data.dataset.formula
				self.save_arguments.dato = JSON.stringify(dato);
				let js_promise = self.Save(content_data).then(function(response){
					resolve(dato);
				})
			}else{

				resolve(dato);
			}
		})	
	};//end get_dato



	/**
	* SAVE
	* @return
	*/
	this.save_arguments = {}	
	this.Save = function(component_obj) {

		const self = this
		
		// Exec general save		
		const jsPromise = component_common.Save(component_obj, self.save_arguments);

		jsPromise.then(function(response) {

		}, function(xhrObj) {
		  	console.log(xhrObj);
		});

		return jsPromise;
	};//end Save



	/**
	* SOLVE_THE_FORMULA
	* @return 
	*/
	this.solve_the_formula = function(content_data) {
	
		const data 	 = JSON.parse(content_data.dataset.formula).data
		const rules  = JSON.parse(content_data.dataset.formula).rules

		// Apply rules to data
			const result = jsonLogic.apply(rules, data)

		if(SHOW_DEBUG===true) {
			console.log("rules:",rules);
		}

		return result
	};//end solve_the_formula



	/**
	* REFRESH_DATO
	* @return 
	*/
	this.refresh_dato = function(wrapper_obj) {

		const self = this

		const id_wrapper = wrapper_obj.id
		
		const js_promise = component_common.load_component_by_wrapper_id(id_wrapper).then(function(response){
			//update the dato 
			return new Promise(function(resolve, reject) {
				let new_component = document.getElementById(id_wrapper)
				resolve(self.get_dato(new_component))

			})
		})

		return js_promise		
	};//end refresh_dato



}//end component_calculation