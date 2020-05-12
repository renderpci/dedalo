/**
* COMPONENT_CALCULATION
*
*
*
*/
var component_calculation = new function() {

	"use strict"


	// LOCAL VARS
	this.url_trigger = DEDALO_CORE_URL + '/component_calculation/trigger.component_calculation.php';



	/**
	* INIT
	*/
	this.inited = []
	this.init = function(options) {

		const self = this
	
		const component_name 		= options.component_name
		const uid 			 		= options.uid
		const aditional_save_event 	= options.aditional_save_event

		// id_wrapper. Overwrited when is set in options
		const id_wrapper  = (typeof options.id_wrapper!=="undefined") ? options.id_wrapper : 'wrapper_' + options.uid
		const wrapper_obj = document.getElementById(id_wrapper)
			if (!wrapper_obj) {
				// Error on find wrapper
				let msg = "[component_calculation:init] ERROR. wrapper_obj not found! ("+id_wrapper+")"
				console.warn(msg, "id_wrapper: ",id_wrapper)
				alert(msg)
				return false
			}

		const init_uid = wrapper_obj.dataset.section_tipo +"_"+ wrapper_obj.dataset.parent +"_"+ wrapper_obj.dataset.tipo	
			//console.log("this.inited", init_uid, this.inited, this.inited[init_uid]);

		//this.get_dato(wrapper_obj)
		if (typeof component_calculation.inited[init_uid]==="undefined" || component_calculation.inited[init_uid]!==true) {

			const formula   	 		= wrapper_obj.dataset.formula
			const formula_parsed 		= JSON.parse(formula)
			const ar_components_formula	= wrapper_obj.dataset.ar_components_formula
			const data 					= JSON.parse(ar_components_formula)
			const custom  				= formula_parsed.custom
			// Merge and remove duplicates
			const ar_component_save 	= Array.from(new Set(data.concat(aditional_save_event))); //data.concat(aditional_save_event)
				
			// Load custom script for do calculations ex: in ../extra/mdcat/calulation/expresos.js
				if(custom){
					common.load_script(DEDALO_CORE_URL +"/extras"+custom.file, {"async":false})
				}	

			// Load page event
				window.addEventListener("load", function (event) {
					component_calculation.get_dato(wrapper_obj)
				});			

			// Save component event. Triggerred on save component with tipo inckuded in formula
				window.addEventListener('component_save', function(event){
					// console.log("event:",event.detail.dataset.tipo, event.detail.dataset.component_name, event.detail.dataset.label);
					const saved_tipo = event.detail.dataset.tipo
					if(SHOW_DEBUG===true) {
						console.log("[component_calculation.init] event component_save saved_tipo, ar_component_save tipo: ", saved_tipo, ar_component_save, uid);
					}
					if(ar_component_save.includes(saved_tipo)){
						
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

		// Set as initied
		component_calculation.inited[init_uid] = true

		return true
	};//end init



	/**
	* GET_DATO
	* @return 
	*/
	this.get_dato = function(wrapper_obj) {

		const self = this

		if (wrapper_obj.dataset.modo === 'search'){
			return  wrapper_obj.querySelector('input.css_calculation').value	
		}
		
		//console.log(wrapper_obj);
		return new Promise(function(resolve, reject) {

			const saved_dato 	= wrapper_obj.dataset.dato			
			const content_data 	= wrapper_obj.querySelector('div.css_calculation')
			self.solve_the_formula(content_data).then(function(dato_solved){

				// unify numbers format				
					const saved_dato_sure = common.safe_number(saved_dato)
					
				//console.log("saved_dato", dato);
				//console.log("new dato",dato);
				//console.log("dato != saved_dato", dato != saved_dato);
				//console.log("+++ dato_solved", dato_solved, typeof dato_solved,"saved_dato_sure:", saved_dato_sure, typeof saved_dato_sure, "!=", dato_solved!=saved_dato_sure, "!==", dato_solved!==saved_dato_sure);

				if(dato_solved!==saved_dato_sure) {
					// Fix dato
						wrapper_obj.dataset.dato = dato_solved
						content_data.innerHTML   = dato_solved
						//wrapper_obj.dataset.formula = content_data.dataset.formula

					//self.save_arguments.dato = JSON.stringify(dato);
					self.save_arguments.dato = dato_solved;
					// Save changed dato
					self.Save(content_data).then(function(response){
						resolve(dato_solved);
					})
				}else{
					// Fix dato
						wrapper_obj.dataset.dato = dato_solved
						content_data.innerHTML   = dato_solved

					resolve(dato_solved);
				}

			})				
				
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

		const self = this

		const data 	 		 = JSON.parse(content_data.dataset.formula).data
		const custom  		 = JSON.parse(content_data.dataset.formula).custom
		const rules  		 = JSON.parse(content_data.dataset.formula).rules || ""
		const formula_result = JSON.parse(content_data.dataset.formula).result

		return new Promise(function(resolve, reject) {

			// custom formula rules
				if(custom){
					const options = custom.options
					      options.data = data
				
					const ar_paths 	= custom.process.split('.')

					if (typeof window[ar_paths[0]][ar_paths[1]]==="undefined") {

						console.warn("custom.process is not function:",custom.process, typeof window[custom.process]);
					
						resolve(false)

					}else{

						const result = window[ar_paths[0]][ar_paths[1]](options)		
						
						resolve(result)
					}				
				}	
			
			// standard way

				console.log("formula_result:",formula_result);
				if(formula_result === 'date'){
					const result = self.preproces_data_date(data, rules)
					resolve(result)
				}

			jsonLogic.add_operation("Math", Math);

			// Apply rules to data
				let result = jsonLogic.apply(rules, data)


			if(formula_result === 'int'){
				result = Math.round(result)
			}

			if(formula_result && formula_result.number_type === 'float'){
				const precision = formula_result.precision

				let multipicator = "1"
				for (var i = precision - 1; i >= 0; i--) {
					multipicator = multipicator + "0"
				}

				multipicator = parseInt(multipicator)


				result = Math.round(result * multipicator) / multipicator
			}

			if(formula_result && formula_result.process){
				const proces_result = self[formula_result.process]({
					result:	result, 
					options: formula_result.options})
				result = proces_result
			}

			if(SHOW_DEBUG===true) {
				console.log("[solve_the_formula] rules:",rules);
			}

			resolve(result)
		})
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



	/**
	* PREPROCES_DATA_DATE
	* @return 
	*/
	this.preproces_data_date = function(data, rules, options) {

		var result
		for(var operator in rules){

			for (var i = 0; i < rules[operator].length; i++) {

				const item = rules[operator][i].var
				const dd_date = data[item]
				const date = {}
			
				if (data[item].format==='date'){					
					date[item] = new Date(dd_date.year, dd_date.month -1, dd_date.day);
				}else{
					date[item] = dd_date
				}
				
				if (i===0) {
					result = date[item]					
				}else{
	
					if (data[item].format==='period') {

						if(data[item].day && result){							
							const day = parseInt(operator + data[item].day);
							result.setDate(result.getDate() + day )
						}

						if(data[item].month && result){
							const month = parseInt(operator + data[item].month);
							result.setMonth(result.getMonth() + month)
						}

						if(data[item].year && result){
							const year = parseInt(operator + data[item].year);
							result.setFullYear(result.getFullYear() + year)
						}
					
					}else{
						// TO DEFINE WHEN THE CASE WIL DONE
						if (date[item] ===0){
							result = result
						}else{
							result = result + date[item]
						}
						
					}
				}
			}
		}//end for(var operator in rules)
		

		// Format date using locale format
			const locale = common.get_locale_from_code(page_globals.dedalo_data_lang)
			result = result.toLocaleString(locale, {year:"numeric",month:"numeric",day:"numeric"});

		return result
	}//end preproces_data_date



	/**
	* PROCES_SECONS_TO_PERIOD
	* @return 
	*/
	this.proces_secons_to_period = function(request_options){

		const seconds = request_options.result
		const options = request_options.options

		const minutes 		= Math.floor(seconds / 60)
		const hours 		= Math.floor(seconds / 60 / 60)
		const total_days 	= Math.floor(seconds / 60 / 60 / 24)
		const years 		= Math.floor(total_days / 365)
		const years_days 	= total_days - (years * 365)
		const total_months 	= Math.floor(total_days / 30.42)

		let months 	= 0
		let days 	= 0

		switch(true){
			//decembre + 30
			case years_days >= 334 :
				months 		= 11
				days 		= years_days - 334
			break;
			//novembre + 31
			case years_days >= 304 :
				months 		= 10
				days 		= years_days - 304
			break;
			//october + 30
			case years_days >= 272 :
				months 		= 9
				days 		= years_days - 272
			break;
			//septembre + 31
			case years_days >= 242 :
				months 		= 8
				days 		= years_days - 242
			break;
			//agost + 31
			case years_days >= 211 :
				months 		= 7
				days 		= years_days - 211
			break;
			//july + 30
			case years_days >= 180 :
				months 		= 6
				days 		= years_days - 180
			break;
			//juny + 31
			case years_days >= 150 :
				months 		= 5
				days 		= years_days - 150
			break;
			//may + 30
			case years_days >= 119 :
				months 		= 4
				days 		= years_days - 119
			break;
			//april + 31
			case years_days >= 89 :
				months 		= 3
				days 		= years_days - 89
			break;
			//march + 28
			case years_days >= 59 :
				months 		= 2
				days 		= years_days - 59
			break;
			//february + 31
			case years_days >= 31 :
				months 		= 1
				days 		= years_days - 31
			break;
			//January + 0
			case years_days >= 0 :
				months 		= 0
				days 		= years_days
			break;

		}
			
		let period = []

		if(years > 0 && options.years === true){
			const year_label = years == 1 ? get_label["anyo"] : get_label["anyos"]
			const year_value = (options.label===true) ? years + ' ' + year_label : years
			period.push(year_value)	
		}

		if(months > 0 && options.months === true){
			const months_label = months == 1 ? get_label["mes"] : get_label["meses"]
			let months_value = ""
			if(options.total === true){
				months_value = (options.label===true) ? total_months + ' ' + months_label : total_months
			}else{
				months_value = (options.label===true) ? months + ' ' + months_label : months
			}
			period.push(months_value)	
		}

		if(days > 0 && options.days === true){
			const days_label = days == 1 ? get_label["dia"] : get_label["dias"]
			let days_value = ""
			if(options.total === true){
				days_value = (options.label===true) ? total_days + ' ' + days_label : total_days
			}else{
				days_value = (options.label===true) ? days + ' ' + days_label : days
				
			}
			period.push(days_value)	
		}

		const result = period.join(', ')

		return result

	}//end proces_secons_to_period



}//end component_calculation