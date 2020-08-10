/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../common/js/data_manager.js'
	import {ui} from '../../../common/js/ui.js'



/**
* SERVICE_AUTOCOMPLETE
* Used as service by component_portal, (old component_autocomplete, component_autocomplete_hi)
* component_relation_parent, component_relation_children, component_relation_related
*
*/
export const service_autocomplete = function() {


	this.external_relation_type = 'dd687'

	// sections_without_filter_fields . exclude this section to build dom filter fields
	this.sections_without_filter_fields = ['zenon1']



	/**
	* INIT
	* @return bool
	*/
	this.init = function(options) {

		const self = this

		self.instance_caller		= options.caller
		self.id						= 'service_autocomplete' +'_'+ options.caller.tipo +'_'+ options.caller.section_tipo
		self.wrapper				= options.wrapper
		self.divisor 				= self.instance_caller.divisor || ' | '
		self.ar_dd_request			= self.instance_caller.dd_request.search
		self.dd_request				= self.ar_dd_request[0]
		self.sqo					= self.dd_request.find((current_item)=> current_item.typo==='sqo')
		self.ar_search_section_tipo	= self.sqo.section_tipo
		const engine				= self.dd_request.find((current_item)=> current_item.typo==='search_engine').value
		self.search_engine 			= (engine !== null) ? engine : 'dedalo_engine';

		// Vars
			self.tipo		= self.instance_caller.tipo
			self.properties	= self.instance_caller.context.properties || {}
			self.list_name	= 's_'+new Date().getUTCMilliseconds()

		// Custom events defined in properties
			self.custom_events = (self.properties.custom_events) ? self.properties.custom_events : []

		// Build_autocomplete_input
		self.render()

		return true
	}//end init



	/**
	* DESTROY
	* @return bool
	*/
	this.destroy = function(){

		const self = this
		self.searh_container.remove()

		return true
	}// end destroy



	/**
	* RENDER
	* @return bool
	*/
	this.render = function(){

		const self = this

		// search container
			const searh_container = ui.create_dom_element({
				element_type	: "div",
				class_name		: "autocomplete_searh_container", // css_autocomplete_hi_search_field
				parent			: self.wrapper
			})

		// options container
			const options_container = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'options_hidden',
				parent			: searh_container
			})

		// build operator selector
		const source_selector = self.render_source_selector()
		options_container.appendChild(source_selector)
		// sections select
		const sections_selector = self.render_sections_selector()
		options_container.appendChild(sections_selector)
		// components fields for inputs_list
		const inputs_list = self.render_inputs_list()
		options_container.appendChild(inputs_list)
		// build operator selector
		const operator_selector = self.render_operator_selector()
		options_container.appendChild(operator_selector)

		// button options
			const button_options = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button_options button gear',
				parent			: searh_container
			})
			// add listener to the select
			button_options.addEventListener('mouseup',function(e){
				options_container.classList.toggle('visible');
			},false)

		// search_input
			const search_input = self.render_search_input()
			searh_container.appendChild(search_input)

		// datalist
			const datalist = ui.create_dom_element({
				element_type	: 'ul',
				id				: self.list_name,
				class_name		: "autocomplete_data",
				parent			: searh_container
			})

		self.searh_container 	= searh_container
		self.search_input 		= search_input
		self.datalist 			= datalist

		return true
	}// end render



	/**
	* RENDER_SOURCE_SELECTOR
	* @return
	*/
	this.render_source_selector = function() {

		const self = this

		// source elements
			const ar_source 	= self.ar_dd_request

		// switcher source
			const source_selector = ui.create_dom_element({
				element_type 	: "div",
				class_name 	 	: "source_selector"
			})

			const label_select = ui.create_dom_element({
						element_type 	: "label",
						class_name 		: "css_label label",
						text_content 	: get_label["origen"] || "Source",
						parent 			: source_selector
					})

			const select = ui.create_dom_element({
						element_type 	: "select",
						class_name 		: "select_source_selector",
						parent 			: source_selector
					})

			// others
				const ar_search_length = ar_source.length
				for (let i = 0; i < ar_search_length; i++) {

					const source		= ar_source[i]
					const current_sqo	= source.find((item) => item.typo === 'sqo')
					const ar_section	= current_sqo.section_tipo
					const ddo_section	= source.find((item) => item.type === 'section' && item.typo === 'ddo')
					const search_engine	= source.find((current_item)=> current_item.typo==='search_engine').value

					const swicher_source = ui.create_dom_element({
						element_type	: "option",
						parent			: select,
						value			: i+'',
						inner_html		: ar_section.length > 1
							? ddo_section.label + ", etc."
							: ddo_section.label
					})
					if (search_engine===self.search_engine) {
						swicher_source.setAttribute("selected", true)
					}

				}

			// add listener to the select
			select.addEventListener('change',function(e){
				const key = e.target.value

				self.dd_request				= self.ar_dd_request[key]
				self.sqo					= self.dd_request.find((current_item)=> current_item.typo==='sqo')
				self.ar_search_section_tipo	= self.sqo.section_tipo
				self.search_engine			= self.dd_request.find((current_item)=> current_item.typo==='search_engine').value
				console.log("self.ar_search_section_tipo", self.ar_search_section_tipo);
				self.destroy()
				self.render()
			},false)

		// set default value
			// self.build_filter_fields(select.value, options)

		return source_selector
	}//end render_source_selector



	/**
	* BUILD_AUTOCOMPLETE_INPUT
	* Create the html of input search autocomplete
	* @return
	*/
	this.render_search_input = function() {

		const self = this

		// search field
			const search_input = ui.create_dom_element({
				element_type	: "input",
				type			: 'text',
				class_name		: "autocomplete_input",
			})
			search_input.setAttribute("list", self.list_name)
			search_input.setAttribute("placeholder", get_label.buscar + '...')
			// search_input.setAttribute("autocomplete", "off")
			search_input.setAttribute("autocorrect", "off")

			// event input. changes the input value fire the search
				search_input.addEventListener('input', async function(e){
					const api_response	= await self.autocomplete_search(this.value)
					const options		= self.render_datalist(api_response)
				}, false);

		return search_input
	}//end get_input



	/**
	* BUILD_SECTIONS_SELECTOR
	* @return
	*/
	this.render_sections_selector = function(){

		const self = this

		const ar_section_nodes = []

		const sections_list = ui.create_dom_element({
			element_type	: "ul",
			class_name		: "sections_list", // css_autocomplete_hi_search_field
		})
			const all_selector = ui.create_dom_element({
				element_type	: "li",
				class_name		: "all_selector", // css_autocomplete_hi_search_field
				parent			: sections_list
			})
				const all_section_label = ui.create_dom_element({
					element_type	: "label",
					inner_html		: get_label.todos, //ddo_section.label ||
					parent			: all_selector
				})
				all_section_label.setAttribute("for", self.list_name + "_all")

				const all_section_input = ui.create_dom_element({
					element_type	: "input",
					id				: self.list_name + "_all",
					type			: "checkbox",
					parent			: all_selector
				})
				all_section_input.checked = false

				all_section_input.addEventListener('change', async function(e){
					for (let i = ar_section_nodes.length - 1; i >= 0; i--) {
						ar_section_nodes[i].checked = e.target.checked
						ar_section_nodes[i].dispatchEvent(new Event('change'));
					}
				}, false);


			const ar_sections = self.ar_search_section_tipo
			const local_storage = JSON.parse(localStorage.getItem(self.id)) || ar_sections

			for (let i = 0; i < ar_sections.length; i++) {
				const section		= ar_sections[i]
				const ddo_section	= self.dd_request.find((item) => item.type === 'section' && item.tipo === section && item.typo === 'ddo')

				const li_section = ui.create_dom_element({
					element_type	: "li",
					parent			: sections_list
				})

					const section_label = ui.create_dom_element({
						element_type	: "label",
						inner_html		: ddo_section.label +' '+ ddo_section.tipo, //ddo_section.label ||
						parent			: li_section
					})
					section_label.setAttribute("for", self.list_name + '_'+ ddo_section.tipo)

					const section_input = ui.create_dom_element({
						element_type	: "input",
						type			: "checkbox",
						id				: self.list_name + '_'+ ddo_section.tipo,
						value			: ddo_section.tipo,
						parent			: li_section
					})

					if(local_storage.indexOf(ddo_section.tipo)>=0){
						section_input.checked = true
					}else{
						const index = ar_sections.indexOf(ddo_section.tipo)
						section_input.checked = false
						ar_sections.splice(index, 1);
					}

					section_input.addEventListener('change', async function(e){
						const in_array_index = ar_sections.indexOf(e.target.value)
						if(in_array_index === -1 && e.target.checked){
							ar_sections.push(e.target.value)
						}else{
							ar_sections.splice(in_array_index, 1);
						}
						localStorage.setItem(self.id, JSON.stringify(ar_sections) )
					}, false);

				ar_section_nodes.push(section_input)
			}

		return sections_list
	}//end render_sections_selector



	/**
	* BUILD_INPUTS_LIST
	* @return
	*/
	this.render_inputs_list = function(){
		const self = this

		const inputs_list = ui.create_dom_element({
			element_type	: "div",
			class_name		: "inputs_list", // css_autocomplete_hi_search_field
		})

			const ar_components = []
			const sqo_length = self.dd_request.length


			for (let i = sqo_length - 1; i >= 0; i--) {
				const item = self.dd_request[i]
				if(item.type==='component' && item.typo==='ddo' && ar_components.indexOf(item.tipo)===-1){
					ar_components.push(item.tipo)
				}
			}

			for (let i = ar_components.length - 1; i >= 0; i--) {
				const compoment		= ar_components[i]
				const ddo_component	= self.dd_request.find((item) => item.type === 'component' && item.typo === 'ddo'&& item.tipo === compoment)

				const component_input = ui.create_dom_element({
					element_type	: "input",
					type			: "text",
					parent			: inputs_list
				})
				const component_label = ddo_component.label.replace(/(<([^>]+)>)/ig,"");
				component_input.setAttribute("placeholder", component_label )
			}


		return inputs_list
	}//end render_inputs_list



	/**
	* BUILD_OPERATOR_SELECTOR
	* @return
	*/
	this.render_operator_selector = function(){
		const self = this
		// operator selector
		const filter_free 	= self.dd_request.find(item => item.typo ==='filter_free')
		const operator 		= filter_free.operator
			const operator_selector = ui.create_dom_element({
				element_type 	: "div",
				class_name 	 	: "search_operators_div"
			})
				const label = ui.create_dom_element({
					element_type	: "label",
					class_name		: "css_label label",
					parent			: operator_selector,
					text_content	: get_label["operadores_de_busqueda"] || "Search operators"
					})
				const select = ui.create_dom_element({
					element_type	: "select",
					class_name		: "operator_selector",
					parent			: operator_selector
					})
					select.addEventListener("change",function(e){
						// get the new operator selected
						const new_operator	= e.target.value
						const sqo_filter	= self.sqo.filter
						// get the old operator
						const ar_operators	= Object.keys(sqo_filter)
						const op_length		= ar_operators.length
						// change the operator with the new selected
						for (let i = op_length - 1; i >= 0; i--) {
							sqo_filter[new_operator] = sqo_filter[ar_operators[i]]
							delete sqo_filter[ar_operators[i]]
						}
					},false)
					const option_or = ui.create_dom_element({
						element_type	: "option",
						parent			: select,
						value			: "$or",
						text_content	: get_label.o
						})
					const option_and = ui.create_dom_element({
						element_type	: "option",
						parent			: select,
						value			: "$and",
						text_content	: get_label.y
						})
					if (operator==='$or') {
						option_or.setAttribute("selected", true)
					}else{
						option_and.setAttribute("selected", true)
					}

		return operator_selector
	}//end render_operator_selector



	/**
	* AUTOCOMPLETE_BUILD_OPTIONS
	* @return
	*/
	this.render_datalist = function(api_response) {

		const self = this

		const datalist = self.datalist
			console.log("render_datalist datalist", datalist);

		//delete the last list
		while (datalist.firstChild) {
			datalist.removeChild(datalist.firstChild)
		}
		// get the result from the api response
		const result	= api_response.result
		const data		= result.data
		// get the sections that was searched
		// const ar_search_sections = self.ar_search_section_tipo

		// get the ar_locator founded in section
		const data_locator	= data.find((item)=> item.tipo === item.section_tipo);
		const ar_locator	= (data_locator) ? data_locator.value : []
		const current_section_length = ar_locator.length

		// itterate the sections
		for (const current_locator of ar_locator) {

			const section_tipo	= current_locator.section_tipo
			const section_id	= current_locator.section_id

			// get data that mach with the current section from the global data sended by the api
			// get the full row with all items in the ddo that mach with the section_id
			const current_row = data.filter((item)=> item.section_tipo === section_tipo && item.section_id === section_id )
			// get dd objects from the context that will be used to build the lists in correct order
			const show		 	= self.instance_caller.dd_request.show
			// const current_ddo = self.dd_request.filter((item) => item.typo === 'ddo'&& item.section_tipo === section_tipo)
			const current_ddo = show.filter((item) => item.typo === 'ddo'&& item.section_tipo === section_tipo)

			// create the li node container
			const li_node = ui.create_dom_element({
				element_type	: 'li',
				class_name		: "autocomplete_data_li",
				dataset			: {value : JSON.stringify(current_locator)},
				parent			: self.datalist
			})
			// when the user do click in one row send the data to the caller_instance for save it.
			li_node.addEventListener('click', function(e){
				e.stopPropagation()
				const value = JSON.parse(this.dataset.value)
				self.instance_caller.add_value(value)
			}, false);

			// build the text of the row with label nodes in correct order (the ddo order in context).
			for(const ddo_item of current_ddo){
				// value_element
					const current_value_element = current_row.find((item)=> item.tipo===ddo_item.tipo)
					if (typeof current_value_element==="undefined") {
						console.warn("[render_datalist] Ignored tipo not found in row:", ddo_item.tipo, ddo_item);
						continue
					}

				// span node
					const current_value = current_value_element.value
					ui.create_dom_element({
						element_type	: 'span',
						text_content	: current_value,
						parent			: li_node
					})// end create dom node
			}// enf for ddo_item

			// dd_info: information about the row, like parents, model, etc, that help to identify the data.
			const current_dd_info 	= current_row.find((item)=> item.tipo==='ddinfo')
				if(current_dd_info){
					const current_dd_info_value = current_dd_info.value
					ui.create_dom_element({
						element_type	: 'span',
						inner_html		: current_dd_info_value,
						parent			: li_node
					})// end create dom node
				}// end if of check current_dd_info


		}// end for of current_section (section_tipo)
	}//end render_datalist



	/**
	* AUTOCOMPLETE_SEARCH
	* @param object options {
	* 	component_tipo, section_tipo, divisor, search_query_object
	* }
	*/
	this.autocomplete_search = function(search_value){

		const self = this

		// Request term
			const q						= search_value
			const search_query_object	= self.rebuild_search_query_object(q);

			if(SHOW_DEBUG===true) {
				console.log("[service_autocomplete.autocomplete_search] search_engine:", self.search_engine)
				console.log("self.dd_request", self.dd_request);
			}

			const options = {
				dd_request 	: self.dd_request,
				q 			: q
			}

		// exec search self.search_engine = dedalo_engine || zenon_engine, the method that will called
			const js_promise = self[self.search_engine]( options )


		return js_promise
	}//end autocomplete_search



	/**
	* REBUILD_SEARCH_QUERY_OBJECT
	* Re-combines filter by fields and by sections in one search_query_object
	* @return bool
	*/
	this.rebuild_search_query_object = function(q) {

		const self = this

		// search_query_object base stored in wrapper dataset
			const sqo = self.sqo

			if(SHOW_DEBUG===true) {
				//console.log("sqo:",sqo);
			}

		// search_sections. Mandatory. Always are defined, in a custom ul/li list or as default using wrapper dataset 'search_sections'
			const search_sections = self.ar_search_section_tipo

			const fixed_filter	= self.dd_request.find((current_item)=> current_item.typo==='fixed_filter')
			const filter_free	= self.dd_request.find((current_item)=> current_item.typo==='filter_free')
			// const filter_element[Object.keys(filter_element)[0]]
			if(filter_free){
				const filter_free_value = filter_free.value

				// Iterate current filter
					for (let operator in filter_free_value) {

						const current_filter = filter_free_value[operator]
						for (let i = 0; i < current_filter.length; i++) {

							// Update q property
							current_filter[i].q	= (q !== "")
								? "*" + q + "*"
								: "false_muyflase_de verdad"
							current_filter[i].q_split = false
						}
					}

				// filter rebuilded
					self.sqo.filter = {
						"$and" : [filter_free_value]
						// "$and" : []
					}
					if (fixed_filter) {
						for (let i = 0; i < fixed_filter.value.length; i++) {
							sqo.filter.$and.push(fixed_filter.value[i])
						}
					}
			}//end if(filter_free)


		// allow_sub_select_by_id set to false to allow select deep fields
			sqo.allow_sub_select_by_id = false

		// Debug
			if(SHOW_DEBUG===true) {
				//console.log("... sqo:",sqo, JSON.stringify(sqo));
				//console.log("... sqo filter:",sqo.filter);
				//if(typeof clean_filter!=="undefined") console.log("+++ rebuild_sqo final clean_filter ",clean_filter);
			}


		return sqo
	}//end rebuild_search_query_object



	/**
	* DEDALO_ENGINE
	* @return promise
	*/
	this.dedalo_engine = async function(options) {

		const dd_request 	= options.dd_request
		const q 			= options.q

		if(SHOW_DEBUG===true) {
			console.log("+++ [service_autocomplete.dedalo_engine] dd_request:", dd_request)
		}

		// verify source is in list mode to allow lang fallback
			const source	= dd_request.find(item => item.typo==="source")
			source.mode		= "list"

		// API read request
			const current_data_manager		= new data_manager()
			const load_section_data_promise	= current_data_manager.read(dd_request)

		// render section on load data
	 		const api_response = load_section_data_promise
	 		if(SHOW_DEBUG===true) {
	 			console.log("[service_autocomplete.dedalo_engine] api_response:", api_response);
	 		}

		return api_response
	}//end dedalo_engine



	/**
	* ZENON_ENGINE
	* @return
	*/
	this.zenon_engine = function(options) {

		const self = this

		const dd_request 	= options.dd_request
		const q 			= options.q

		if(SHOW_DEBUG===true) {
			//console.log("[zenon_engine] dd_request:",dd_request);
			console.log("[zenon_engine] source:", dd_request);
		}

		const ar_selected_fields		= dd_request.filter(item => item.model === 'component_external');
		const ar_fields					= ar_selected_fields.map(field => field.properties.fields_map[0].remote)

		// fields of Zenon "title" for zenon4
			const fields		= ar_fields
			const fields_length	= fields.length
		// section_tipo of Zenon zenon1
			const section_tipo	= ar_selected_fields[0].section_tipo
			const relation_type	= self.external_relation_type

	  	// format data
	  		const format_data = function(data){
	  			if(SHOW_DEBUG===true) {
	  				console.log("+++ data 1:",data);
					//console.log("+++ dd_request 1:",dd_request);
					//console.log("+++ source 1:",source);
	  			}
				const section_data 		= []
				const components_data	= []
				const records			= data.records || []
				const records_length	= records.length
				for (let i = 0; i < records_length; i++) {
					const record 	= records[i]
					const ar_value 	= []
					for (let j = 0; j < fields_length; j++) {

						const field = fields[j]
						switch(field) {
							case 'authors':
								// console.log("++ authors:",record[field]);
								const authors_ar_value	= []
								const primary			= record[field].primary
								const secondary			= record[field].secondary
								const corporate			= record[field].corporate
								const authors_separator	= " - "

								if(SHOW_DEBUG===true) {
									//console.log("primary:",primary);	console.log("secondary:",secondary);	console.log("corporate:",corporate);
								}

								if (Object.keys(primary).length > 0) {
									authors_ar_value.push(Object.keys(primary).join(authors_separator))
								}
								if (Object.keys(secondary).length > 0) {
									authors_ar_value.push(Object.keys(secondary).join(authors_separator))
								}
								if (Object.keys(corporate).length > 0) {
									authors_ar_value.push(Object.keys(corporate).join(authors_separator))
								}
								ar_value.push(authors_ar_value.join(authors_separator))
								break;
							default:
								if (Array.isArray(record[field])) {
									if (record[field].length>0) {
										ar_value.push(record[field].join(', '))
									}
								}else{
									if (record[field].length>0) {
										ar_value.push(record[field])
									}
								}
								break;
						}
					}//end iterate fields

					// value
						const value = ar_value.join(self.divisor)

					//locator
					const locator = {
						section_tipo		: section_tipo,
						section_id			: record['id'],
					}
					// record_data
						const record_data = {
							section_tipo		: section_tipo,
							section_id			: record['id'],
							type				: self.external_relation_type,
							// from_component_tipo	: ar_selected_fields[0].tipo,
							tipo				: ar_selected_fields[0].tipo,
							value				: value
						}


					// insert fomatted item
						section_data.push(locator)
						components_data.push(record_data)
				}//end iterate recoords
				// create the section and your data
				const section ={
					section_tipo	: section_tipo,
					tipo			: section_tipo,
					value 			: section_data
				}

				// mix the section and component_data
				const data_formatted = [section, ...components_data]

				const response = {
					msg		: "Ok. Request done",
					result 	: {
						context : ar_selected_fields,
						data 	: data_formatted,
					}
				}

				if(SHOW_DEBUG===true) {
					console.log("+++ data_formatted 2:",response);
				}

				return response
			}

		// trigger vars
			const url_trigger  = "https://zenon.dainst.org/api/v1/search"
			const trigger_vars = {
					lookfor		: (q==='') ? 'ñññññññ---!!!!!' : q, // when the q is empty, Zenon get the first 10 records of your DDBB, in that case we change the empty with a nonsense q
					type		: "AllFields", // search in all fields
					sort		: "relevance",
					limit		: 20,
					prettyPrint	: false,
					lng			: "de"
				}; // console.log("*** [zenon_engine] trigger_vars", trigger_vars, dd_request)

			const pairs = []
			for (var key in trigger_vars) {
				pairs.push( key+'='+trigger_vars[key] )
			}
			let url_arguments =  pairs.join("&")
			// const fields   = ["id","authors","title","urls","publicationDates"]
			for (let i = 0; i < fields_length; i++) {
				url_arguments += "&field[]=" + fields[i]
			}

		// XMLHttpRequest promise
			return new Promise(function(resolve, reject) {

				const request = new XMLHttpRequest();

					// ready state change event
						// request.onreadystatechange = function() {
						// 	if (request.readyState == 4 && request.status == 200) {
						// 		//console.dir(request.response)
						// 		//console.dir(request.responseText);
						// 	}
						// }

					// open xmlhttprequest
						//request.open("POST", "https://zenon.dainst.org/api/v1/search?type=AllFields&sort=relevance&page=1&limit=20&prettyPrint=false&lng=de&lookfor=david", true);
						request.responseType = 'json';
						request.open("POST", url_trigger + "?" + url_arguments, true);

					// onload event
						request.onload = function(e) {
							if (request.status === 200) {

								// data format
									const data = format_data(request.response)

								// If successful, resolve the promise by passing back the request response
									resolve(data);

							}else{
								// If it fails, reject the promise with a error message
								reject(Error('Reject error don\'t load successfully; error code: ' + request.statusText));
							}
						};

					// request error
						request.onerror = function(e) {
							// Also deal with the case when the entire request fails to begin with
							// This is probably a network error, so reject the promise with an appropriate message
							reject(Error('There was a network error. data_send: '+url+"?"+ data_send + "statusText:" + request.statusText));
						};

				// send the request
					request.send();

			})//end Promise
	}//end zenon_engine

}//end service_autocomplete
