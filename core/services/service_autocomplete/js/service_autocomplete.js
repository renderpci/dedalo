/*global get_label, SHOW_DEBUG, Promise */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../common/js/data_manager.js'
	import {event_manager} from '../../../common/js/event_manager.js'
	import {clone} from '../../../common/js/utils/index.js'
	import {view_default_autocomplete} from './view_default_autocomplete.js'


/**
* SERVICE_AUTOCOMPLETE
* Used as service by component_portal, (old component_autocomplete, component_autocomplete_hi)
* component_relation_parent, component_relation_children, component_relation_related
*
*/
export const service_autocomplete = function() {

}//end service_autocomplete

	/**
	* VARS
	*/
		// sections_without_filter_fields . exclude this section to build dom filter fields
		// this.sections_without_filter_fields = ['zenon1']



/**
* INIT
*
* @param object options
* @return bool
*/
service_autocomplete.prototype.init = async function(options) {

	const self = this

	// options
		self.caller		= options.caller
		self.wrapper	= options.wrapper
		self.view 		= options.view || 'default'

	// set properties
		self.tipo					= self.caller.tipo
		self.id						= 'service_autocomplete' +'_'+ options.caller.tipo +'_'+ options.caller.section_tipo
		self.request_config			= clone(self.caller.context.request_config)
		self.sqo					= {}
		self.dd_request				= self.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
		self.ar_search_section_tipo	= self.dd_request.sqo.section_tipo
		self.ar_filter_by_list		= []
		self.operator				= null
		self.properties				= self.caller.context.properties || {}
		self.list_name				= 's_'+new Date().getUTCMilliseconds()
		self.search_fired			= false

		// self.ar_dd_request			= self.caller.dd_request.search
		// self.dd_request				= self.ar_dd_request[0]
		// self.sqo						= self.dd_request.find(item => item.typo==='sqo')
		// self.ar_search_section_tipo	= self.sqo.section_tipo
		// self.ar_filter_by_list		= []

	// engine. get the search_engine sended or set the default value
		self.search_engine = (self.dd_request) ? self.dd_request.api_engine : 'dedalo';

	// Custom events defined in properties
		self.custom_events = (self.properties.custom_events) ? self.properties.custom_events : []

	// render. Build_autocomplete_input nodes
		self.render()

	// event keys
		document.addEventListener('keydown', fn_service_autocomplete_keys, false)
		function fn_service_autocomplete_keys(e) {
			self.service_autocomplete_keys(e)
		}
		event_manager.subscribe('destroy_'+self.id, ()=>{
			document.removeEventListener('keydown', fn_service_autocomplete_keys, false)
		})

	return true
}//end init



/**
* SERVICE_AUTOCOMPLETE_KEYS
* @param event e
* @return bool true
*/
service_autocomplete.prototype.service_autocomplete_keys = function(e) {

	const self = this

	// console.log("/////////////// e.which:",e.which);

	// down arrow
	if(e.which === 40) {

		const selected_node = self.datalist.querySelector('.selected')
		if (selected_node) {
			selected_node.classList.remove('selected')
			if (selected_node.nextSibling) {
				selected_node.nextSibling.classList.add('selected')
			}
		}else{
			// select the first one
			if (self.datalist.firstChild) {
				self.datalist.firstChild.classList.add('selected')
			}
		}
	}
	// up arrow
	else if (e.which === 38) {

		const selected_node = self.datalist.querySelector('.selected')
		if (selected_node) {
			selected_node.classList.remove('selected')
			if (selected_node.previousSibling) {
				selected_node.previousSibling.classList.add('selected')
			}
		}
	}
	// enter
	else if (e.which === 13) {

		const selected_node = self.datalist.querySelector('.selected')
		if (selected_node) {
			selected_node.click()
		}
	}

	return true
}//end service_autocomplete_keys



/**
* BUILD
* @return bool
*/
service_autocomplete.prototype.build = async function() {

	const self = this


	return true
}//end build



/**
* DESTROY
* @return bool
*/
service_autocomplete.prototype.destroy = async function() {

	const self = this

	self.searh_container.remove()

	event_manager.publish('destroy_'+self.id, this)

	// status update
	self.status = 'destroyed'

	return true
}//end destroy



/**
* RENDER
* Chose the view render module to generate DOM nodes
* based on self.context.view value
* @param object options
* {
* 	render_level : string full|content_data
* }
* @return DOM node wrapper | null
*/
service_autocomplete.prototype.render = async function(options={}) {

	const self = this

	// view
		const view	= self.view

	// wrapper
		switch(view) {

			case 'grid_chooser':
				return view_default_autocomplete.render(self, options)
				break;


			default:
				return view_default_autocomplete.render(self, options)
				break;
		}

	return null
}//end render




/**
* AUTOCOMPLETE_SEARCH
* @param string search_value
* @return promise
*/
service_autocomplete.prototype.autocomplete_search = function(search_value) {

	const self = this

	// debug
		if(SHOW_DEBUG===true) {
			// console.log('[service_autocomplete.autocomplete_search] search_engine:', self.search_engine)
			// console.log('self.dd_request', self.dd_request);
		}

		const engine = self.search_engine+'_engine'

	// check valid function name (defined in component properties search_engine)
		if (typeof self[engine]!=='function') {
			console.error('ERROR. Received search_engine function not exists. Review your component properties source->request_config->search_engine :', self.search_engine);
			return new Promise(()=>{})
		}
	// recombine the select ddo with the search ddo to get the list
		// const select = self.caller.dd_request.select
		// const dd_request = (select)
		// 	? self.dd_request.filter(item => item.typo!=='request_ddo')
		// 	: [...self.dd_request]

		// if(select){
		// 	const ddo_select = select.find(item => item.typo === 'request_ddo')
		// 	const value_with_parents = select.find(item => item.typo === 'value_with_parents')
		// 	dd_request.push(ddo_select)
		// 	if(value_with_parents){
		// 		dd_request.push(value_with_parents)
		// 	}
		// }


	// search options
		const options = {
			q	: search_value
		}

	// exec search self.search_engine = dedalo_engine || zenon_engine, the method that will called
		const js_promise = self[engine]( options )


	return js_promise
}//end autocomplete_search



/**
* REBUILD_SEARCH_QUERY_OBJECT
* Re-combines filter by fields and by sections in one search_query_object
* @param string q
* @return bool
*/
service_autocomplete.prototype.rebuild_search_query_object = async function(q) {

	const self = this

	// search_query_object base stored in wrapper dataset
		const original_rqo_search	= await self.caller.rqo_search
		const rqo_search			= clone(original_rqo_search)
		self.rqo_search				= rqo_search
		self.sqo					= rqo_search.sqo


		const sqo_options = original_rqo_search.sqo_options
	// delete the sqo_options to the final rqo_options
		delete rqo_search.sqo_options

		if(SHOW_DEBUG===true) {
			// console.log('sqo_options:', sqo_options);
		}

	// search_sections. Mandatory. Always are defined, in a custom ul/li list or as default using wrapper dataset 'search_sections'
		const search_sections	= self.ar_search_section_tipo
		self.sqo.section_tipo	= search_sections.map(el=>el.tipo)

		const fixed_filter		= sqo_options.fixed_filter //self.dd_request.find((current_item)=> current_item.typo==='fixed_filter')
		const filter_free		= sqo_options.filter_free	//self.dd_request.find((current_item)=> current_item.typo==='filter_free')
		const filter_by_list	= self.ar_filter_by_list.map(item => item.value)
		// rebuild the filter with the user inputs
		if(filter_free){

			const new_filter = {}
			// Iterate current filter
				for (let operator in filter_free) {
					// get the array of the filters objects, they have the default operator
					const current_filter = filter_free[operator]
					// set the operator with the user selection or the default operator defined in the config_sqo (it comes in the config_rqo)
					const new_operator		= self.operator || operator

					for (let i = 0; i < current_filter.length; i++) {
						// Update q property
						current_filter[i].q	= (q !== "")
							? "*" + q + "*"
							: "false_muyfake_de verdad!"
						current_filter[i].q_split = false
						// create the filter with the operator choosed by the user
						new_filter[new_operator] = current_filter
					}
				}

			// filter re-built
				self.sqo.filter = {
					'$and' : [new_filter]
					// '$and' : [filter_free]
				}
				if (fixed_filter) {
					for (let i = 0; i < fixed_filter.length; i++) {
						self.sqo.filter.$and.push(fixed_filter[i])
					}
				}
				if(filter_by_list){
					self.sqo.filter.$and.push({
						$or:[...filter_by_list]
					})
				}
		}//end if(filter_free)

	// allow_sub_select_by_id set to false to allow select deep fields
		self.sqo.allow_sub_select_by_id = true

	// Debug
		if(SHOW_DEBUG===true) {
			//console.log('... sqo:',sqo, JSON.stringify(sqo));
			//console.log('... sqo filter:',sqo.filter);
			//if(typeof clean_filter!=='undefined') console.log('+++ rebuild_sqo final clean_filter ',clean_filter);
		}


	return rqo_search
}//end rebuild_search_query_object



/**
* DEDALO_ENGINE
* @param object options
* @return promise api_response
*/
service_autocomplete.prototype.dedalo_engine = async function(options) {

	const self = this
	const rqo = await self.rebuild_search_query_object(options.q);
	// const rqo = await options.rqo
		rqo.prevent_lock = true

	if(SHOW_DEBUG===true) {
		// console.log('options', options)
		// console.log('+++ [service_autocomplete.dedalo_engine] rqo:', rqo)
	}

	// verify source is in list mode to allow lang fallback
		const source	= rqo.source
		source.mode		= 'list'

	// API read request
		const load_section_data_promise	= data_manager.request({
			body : rqo
		})

	// render section on load data
		const api_response = load_section_data_promise
		if(SHOW_DEBUG===true) {
			// api_response.then(function(response){
			// 	console.log('[service_autocomplete.dedalo_engine] api_response:', api_response);
			// })
		}

	return api_response
}//end dedalo_engine



/**
* ZENON_ENGINE
* @param object options
* @return promise
*/
service_autocomplete.prototype.zenon_engine = async function(options) {

	const self = this

	// options
		const q			= options.q
		// const rqo	= await options.rqo

	// dd_request
		const dd_request = self.dd_request


	// rqo
		const generate_rqo = async function(){
			// rqo_config. get the rqo_config from context
			// rqo build
			// const action	= (self.mode==='search') ? 'resolve_data' : 'get_data'
			const add_show	= true
			const zenon_rqo	= await self.caller.build_rqo_show(dd_request, 'get_data', add_show)
			self.rqo_search	= self.caller.build_rqo_search(zenon_rqo, 'search')
		}
		generate_rqo()


	// debug
		if(SHOW_DEBUG===true) {
			// console.log('[zenon_engine] rqo:',rqo);
			console.log('[zenon_engine] dd_request:', dd_request);
			// console.log('self.caller-----------------:',self.caller);
		}

	// const request_ddo			= dd_request.find(item => item.typo === 'request_ddo').value
	// const ar_selected_fields		= self.caller.datum.context.filter(el => el.model === 'component_external')
	// const ar_fields				= ar_selected_fields.map(field => field.properties.fields_map[0].remote)

	// fields of Zenon 'title' for zenon4
		const fields		= dd_request.show.ddo_map
		const fields_length	= fields.length
	// section_tipo of Zenon zenon1
		const section_tipo	= fields[0].section_tipo


	// format data
		const format_data = function(data) {
			if(SHOW_DEBUG===true) {
				console.log('[zenon_engine] format_data data 1:',data);
				//console.log('+++ dd_request 1:',dd_request);
				//console.log('+++ source 1:',source);
			}
			const section_data		= []
			const components_data	= []
			const records			= data.records || []
			const records_length	= records.length
			const separator = ' - '
			for (let i = 0; i < records_length; i++) {
				const record 	= records[i]
				for (let j = 0; j < fields_length; j++) {

					const field = fields[j].fields_map[0].remote
					const ar_value 	= []
					const authors_ar_value	= []

					switch(field) {

						case 'authors':
							// console.log("++ authors:",record[field]);
							if(SHOW_DEBUG===true) {
								//console.log("primary:",primary);	console.log("secondary:",secondary);	console.log("corporate:",corporate);
							}

							if (Object.keys(record[field].primary).length > 0) {
								authors_ar_value.push(Object.keys(record[field].primary).join(separator))
							}
							if (Object.keys(record[field].secondary).length > 0) {
								authors_ar_value.push(Object.keys(record[field].secondary).join(separator))
							}
							if (Object.keys(record[field].corporate).length > 0) {
								authors_ar_value.push(Object.keys(record[field].corporate).join(separator))
							}
							ar_value.push(authors_ar_value.join(separator))
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

					// value
						// const fields_separator = self.caller.fields_separator || ' | '
						const value = ar_value.join('')


					// record_data
						const record_data = {
							section_tipo		: section_tipo,
							section_id			: record['id'],
							type				: 'dd687',
							// from_component_tipo	: ar_selected_fields[0].tipo,
							tipo				: fields[j].tipo,
							value				: value
						}

					// insert formatted item
						components_data.push(record_data)
				}//end iterate fields

				//locator
					const locator = {
						section_tipo	: section_tipo,
						section_id		: record['id']
					}

				// insert formatted locator
				section_data.push(locator)
			}//end iterate records
			// create the section and your data
			const section ={
				section_tipo	: section_tipo,
				tipo			: self.caller.tipo,
				value			: section_data,
				typo			: 'sections'
			}

			// mix the section and component_data
			const data_formatted = [section, ...components_data]

			const response = {
				msg		: 'OK. Request done',
				result 	: {
					context	: fields,
					data	: data_formatted
				}
			}

			if(SHOW_DEBUG===true) {
				console.log('+++ data_formatted 2:',response);
			}

			return response
		}

	// trigger vars
		const url_trigger  = 'https://zenon.dainst.org/api/v1/search'
		const trigger_vars = {
				lookfor		: (q==='') ? 'ñññññññ---!!!!!' : q, // when the q is empty, Zenon get the first 10 records of your DDBB, in that case we change the empty with a nonsense q
				type		: "AllFields", // search in all fields
				sort		: "relevance",
				limit		: 20,
				prettyPrint	: false,
				lng			: "de"
			}; // console.log("*** [zenon_engine] trigger_vars", trigger_vars, dd_request)

		const pairs = []
		for (let key in trigger_vars) {
			pairs.push( key+'='+trigger_vars[key] )
		}
		let url_arguments =  pairs.join("&")
		// const fields   = ["id","authors","title","urls","publicationDates"]
		for (let i = 0; i < fields_length; i++) {
			const field_map_remote = fields[i].fields_map[0].remote
			url_arguments += "&field[]=" + field_map_remote
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
					request.open('POST', url_trigger + '?' + url_arguments, true);

				// onload event
					request.onload = function() {
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
					request.onerror = function() {
						// Also deal with the case when the entire request fails to begin with
						// This is probably a network error, so reject the promise with an appropriate message
						reject(Error('There was a network error. data_send: '+url_trigger+"?"+ url_arguments + "statusText:" + request.statusText));
					};

			// send the request
				request.send();

		})//end Promise
}//end zenon_engine




