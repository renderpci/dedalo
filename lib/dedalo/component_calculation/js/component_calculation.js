"use strict"
/**
* COMPONENT_CALCULATION
*
*
*/
var component_calculation = new function() {


	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/component_calculation/trigger.component_calculation.php';



	/**
	* INIT
	*/
	this.inited = []
	this.init = function(data) {

		let self = this	

		// Default
		let id_wrapper  = 'wrapper_' + data.uid
		// Overwrited
		if (typeof data.id_wrapper!="undefined") {
			id_wrapper  = data.id_wrapper
		}
		let wrapper_obj = document.getElementById(id_wrapper)
			if (!wrapper_obj) {
				// Error on find wrapper
				let msg = "[component_calculation:init] ERROR. wrapper_obj not found! ("+id_wrapper+")"
				console.log(msg, "id_wrapper: ",id_wrapper)
				alert(msg)
				return false
			}

		let init_uid = wrapper_obj.dataset.section_tipo +"_"+ wrapper_obj.dataset.parent +"_"+ wrapper_obj.dataset.tipo	
			//console.log("this.inited", init_uid, this.inited, this.inited[init_uid]);

		//this.get_dato(wrapper_obj)
		if (typeof this.inited[init_uid]=="undefined" || this.inited[init_uid]!=true) {

			// LOAD (EVENT)
			//window.addEventListener("load", function (event) {				
			//	component_calculation.get_dato(wrapper_obj)
			//});

			window.addEventListener('component_save', function(event){
			//console.log("component_save event", event);
				//console.log("se salvo" ,event.detail.dataset.tipo);
				//console.log("lo llama" ,wrapper_obj.dataset.tipo);
			//	if (typeof event.detail!="undefined" && event.detail!=null && typeof event.detail.dataset!="undefined") {
					let save_tipo = event.detail.dataset.tipo
					let formula   = wrapper_obj.dataset.formula
						//console.log(formula);
					let formula_parsed = JSON.parse(formula);
						//console.log(formula_parsed);
					//let data = Object.keys(JSON.parse(wrapper_obj.dataset.formula).data)
					let data = Object.keys(formula_parsed.data)
					
					if(SHOW_DEBUG===true) {
						//console.log("component_calculation init component_save data: ", data);
					}
							
					if(data.includes(save_tipo)){
							//console.log("se va a refrescar",wrapper_obj.dataset.tipo);
							let js_promise = component_common.load_component_by_wrapper_id(id_wrapper).then(function(response){
								//console.log("js_promise:",js_promise);
								//update the dato 
								let new_component = document.getElementById(id_wrapper)
								self.get_dato(new_component)
							})
				
						//let pepe = component_calculation.refresh_dato(wrapper_obj)
					}
			//	}else{
			//			alert("component_save event BAD");
			//		console.log("component_save event BAD", event);
			//	}					
			})

		}//end if (this.inited!==true)

		this.inited[init_uid] = true
	};//end init



	/**
	* GET_DATO
	* @return 
	*/
	this.get_dato = function(wrapper_obj) {

		let self = this

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

		let self = this
		
		// Exec general save		
		let jsPromise = component_common.Save(component_obj, self.save_arguments);

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

		let data 	= JSON.parse(content_data.dataset.formula).data
		let rules 	= JSON.parse(content_data.dataset.formula).rules
		let result 	= jsonLogic.apply(rules, data)

		return result
	};//end solve_the_formula



	/**
	* REFRESH_DATO
	* @return 
	*/
	this.refresh_dato = function(wrapper_obj) {

		let self = this

		let id_wrapper = wrapper_obj.id
		
		let js_promise = component_common.load_component_by_wrapper_id(id_wrapper).then(function(response){
			//update the dato 
			return new Promise(function(resolve, reject) {
				let new_component = document.getElementById(id_wrapper)
				resolve(self.get_dato(new_component))

			})
		})

		return js_promise		
	};//end refresh_dato



}//end component_calculation