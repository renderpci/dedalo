// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, SHOW_DEBUG, Promise */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../common/js/data_manager.js'
	import {clone} from '../../../common/js/utils/index.js'
	import {common, get_columns_map} from '../../../common/js/common.js'
	import {view_default_autocomplete} from './view_default_autocomplete.js'
	import {
		render_column_component_info
	} from '../../../component_portal/js/render_edit_component_portal.js'



/**
* SERVICE_AUTOCOMPLETE
* Used as service by component_portal, (old component_autocomplete, component_autocomplete_hi)
* component_relation_parent, component_relation_children, component_relation_related
*/
export const service_autocomplete = function() {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.lang			= null
	this.node			= null
	this.ar_instances	= null
	this.status			= null
	this.events_tokens	= []
	this.type			= null
	this.caller			= null
	this.search_cache	= {}
	this.limit			= 30
}//end service_autocomplete



/**
* COMMON FUNCTIONS
* extend config functions from common
*/
// prototypes assign
	// life-cycle
	service_autocomplete.prototype.destroy	= common.prototype.destroy
	// others
	service_autocomplete.prototype.hide		= view_default_autocomplete.hide
	service_autocomplete.prototype.show		= view_default_autocomplete.show



/**
* INIT
* @param object options
* @return bool
*/
service_autocomplete.prototype.init = async function(options) {

	const self = this

	// options
		self.caller			= options.caller
		self.view			= options.view || 'text'
		self.children_view	= options.children_view || null
		self.properties		= options.properties || {}
		self.tipo			= options.tipo
		self.section_tipo	= options.section_tipo
		self.request_config	= clone(options.request_config)
		self.id_variant		= options.id_variant || self.model

	// set properties
		self.model			= 'service_autocomplete'
		self.id				= 'service_autocomplete' +'_'+ self.tipo +'_'+ self.section_tipo
		self.mode			= 'search'
		self.context		= {
			tipo			: self.tipo,
			section_tipo	: self.section_tipo,
			model			: self.model,
			view			: self.view,
			children_view	: self.children_view,
			request_config	: self.request_config,
			mode			: self.mode,
			type			: 'autocomplete'
		}
		self.filter_free_nodes = []

	self.node			= null
	self.ar_instances	= [];

	// event keys
		// document.addEventListener('keydown', fn_service_autocomplete_keys, false)
		// function fn_service_autocomplete_keys(e) {
		// 	self.service_autocomplete_keys(e)
		// }
		// event_manager.subscribe('destroy_'+self.id, ()=>{
		// 	document.removeEventListener('keydown', fn_service_autocomplete_keys, false)
		// })

	// fix service instance as global
		window.page_globals.service_autocomplete = self

	// status update
		self.status = 'initialized'


	return true
}//end init



/**
* BUILD
* @param object options = {}
* @return bool
*/
service_autocomplete.prototype.build = async function(options={}) {

	const self = this

	// status update
		self.status = 'building'

	// options vars
		self.request_config_object =  (options.request_config_object)
			? options.request_config_object
			: self.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')

	// reset search options
		self.sqo				= {}
		self.ar_filter_by_list	= []
		self.ar_instances		= []
		self.list_name			= 's_'+new Date().getUTCMilliseconds()
		self.search_fired		= false

	// operator
		self.operator = self.request_config_object.search && self.request_config_object.search.sqo_config && self.request_config_object.search.sqo_config.operator
			? self.request_config_object.search.sqo_config.operator
			: self.request_config_object.show && self.request_config_object.show.sqo_config && self.request_config_object.show.sqo_config.operator
				? self.request_config_object.show.sqo_config.operator
				: '$and'

	// engine. get the search_engine sent or set the default value
		self.search_engine = (self.request_config_object) ? self.request_config_object.api_engine : 'dedalo';

	// rqo_search, it's necessary do it by caller, because rqo is dependent of the source.
	// API get rqo to do the search as the caller.
		self.rqo_search	= await self.caller.build_rqo_search(self.request_config_object, 'search')

	// set the section_tipo to be searched
		self.ar_search_section_tipo	= self.rqo_search.sqo.section_tipo

	// columns_map
	// use the rqo_search as request_config, and the columns of rqo_search as columns_maps
		self.columns_map = get_columns_map({
			context				: self.context,
			ddo_map_sequence	: ['choose','search','show'] // array ddo_map_source
		})

	// column component_info
		if (self.caller.add_component_info===true) {
			self.columns_map.push({
				id			: 'ddinfo',
				label		: 'Info',
				callback	: render_column_component_info
			})
		}

	// limit. Get from localStorage if exists
		const service_autocomplete_limit = localStorage.getItem('service_autocomplete_limit')
		if (service_autocomplete_limit) {
			const limit = parseInt(service_autocomplete_limit)
			if (limit>0) {
				self.limit = limit
			}
		}

	// status update
		self.status = 'built'


	return true
}//end build



/**
* SERVICE_AUTOCOMPLETE_KEYS
* @param event e
* @return bool true
*/
service_autocomplete.prototype.service_autocomplete_keys = function(e) {
	e.stopPropagation()

	const self = this

	// down arrow
	if(e.which === 40) {
		e.preventDefault()

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
		e.preventDefault()

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
		e.preventDefault()

		const selected_node = self.datalist.querySelector('.selected')
		if (selected_node) {
			selected_node.click()
		}
	}

	return true
}//end service_autocomplete_keys



/**
* DESTROY
* @return bool
*/
	// service_autocomplete.prototype.destroy = async function() {

	// 	const self = this

	// 	self.node.remove()

	// 	event_manager.publish('destroy_'+self.id, this)

	// 	// status update
	// 	self.status = 'destroyed'

	// 	return true
	// }//end destroy



/**
* RENDER
* Chose the view render module to generate DOM nodes
* based on self.context.view value
* @param object options
* {
* 	render_level : string full|autocomplete_wrapper
* }
* @return HTMLElement wrapper
*/
service_autocomplete.prototype.render = async function(options={}) {

	const self = this

	// view
		const view	= self.view

	// wrapper
		switch(view) {

			case 'grid_chooser':
				return view_default_autocomplete.render(self, options)

			default:
				return view_default_autocomplete.render(self, options)
		}
}//end render



/**
* AUTOCOMPLETE_SEARCH
* @return object
* 	promise js_promise
*/
service_autocomplete.prototype.autocomplete_search = async function() {

	const self = this

	// debug
		if(SHOW_DEBUG===true) {
			// console.log('[service_autocomplete.autocomplete_search] search_engine:', self.search_engine)
			// console.log('self.request_config_object', self.request_config_object);
		}

	// engine name
		const engine = self.search_engine + '_engine'

	// check valid function name (defined in component properties search_engine)
		if (typeof self[engine]!=='function') {
			console.error('ERROR. Received search_engine function not exists. Review your component properties source->request_config->search_engine :', self.search_engine);
			return {
				result: false
			}
		}

	// check valid filters_selector
		if (self.ar_search_section_tipo.length<1) {
			// const label = get_label.select_search_section || 'Select a search section'
			// alert(label);
			return {
				result: false
			}
		}

	// exec search self.search_engine = dedalo_engine || zenon_engine, the method that will called
		const js_promise = self[engine]()


	return js_promise
}//end autocomplete_search



/**
* REBUILD_SEARCH_QUERY_OBJECT
* Re-combines filter by fields and by sections in one search_query_object
* @param object options
* @return object rqo_search
*/
service_autocomplete.prototype.rebuild_search_query_object = async function(options) {

	const self = this

	// options
		const rqo_search		= options.rqo_search
		const search_sections	= options.search_sections || []
		const filter_by_list	= options.filter_by_list || null

	// no section selected case
		if(search_sections.length===0){
			return null
		}

		const sqo			= rqo_search.sqo
		const sqo_options	= rqo_search.sqo_options
		const fixed_filter	= sqo_options.fixed_filter //self.request_config_object.find((current_item)=> current_item.typo==='fixed_filter')
		const filter_free	= sqo_options.filter_free	//self.request_config_object.find((current_item)=> current_item.typo==='filter_free')

	// delete the sqo_options to the final rqo_options
		delete rqo_search.sqo_options

	// sqo filter
		sqo.filter = {
			$and : []
		}

		// rebuild the filter with the user inputs
			const filter_free_parse	= {}

			// Iterate current filter
			for (let operator in filter_free) {

				// set the operator with the user selection or the default operator defined in the config_sqo (it comes in the config_rqo)
				const new_operator				= self.operator || operator
				filter_free_parse[new_operator]	= []

				// get the array of the filters objects, they have the default operator
				const current_filter		= filter_free[operator]
				const current_filter_length	= current_filter.length
				for (let i = 0; i < current_filter_length; i++) {

					const filter_item = current_filter[i]

					const q = filter_item.q

					if(!q || q==='') {
						continue
					}

					filter_item.q = q
					filter_item.q_split = true

					// create the filter with the operator selected by the user
					filter_free_parse[new_operator].push(filter_item)
				}

				const filter_empty = filter_free_parse[new_operator].length === 0
				if(filter_empty) {
					return null
				}
			}

			sqo.filter.$and.push(filter_free_parse)

		// fixed_filter
			if (fixed_filter) {
				for (let i = 0; i < fixed_filter.length; i++) {
					sqo.filter.$and.push(fixed_filter[i])
				}
			}

			if(filter_by_list && filter_by_list.length > 0) {
				sqo.filter.$and.push({
					$or:[...filter_by_list]
					// $and:[...filter_by_list] // filter_by_list_inverse case
				})
			}

	// allow_sub_select_by_id set to false to allow select deep fields
		sqo.allow_sub_select_by_id = true

	// limit
		sqo.limit = self.limit

	// filter. Note that no project filter should be applied here. The user can
	// select any target record as read. Only editing has project restriction
		sqo.skip_projects_filter = true


	return rqo_search
}//end rebuild_search_query_object



/**
* DEDALO_ENGINE
* @return promise api_response
*/
service_autocomplete.prototype.dedalo_engine = async function() {

	const self = this

	// search_query_object base stored in wrapper dataset
		const rqo_search	= await clone(self.rqo_search)

		// const rqo_search			= clone(original_rqo_search)
		// self.rqo_search			= rqo_search
		// self.sqo					= rqo_search.sqo

	// search_sections. Mandatory. Always are defined, in a custom ul/li list or as default using wrapper dataset 'search_sections'
		const search_sections = self.ar_search_section_tipo

		rqo_search.sqo.section_tipo	= search_sections

	// filter_by_list, modify by user
		const filter_by_list = self.ar_filter_by_list.map(item => item.value)
		// filter_by_list optimized version.
		// A full selection of the list is equivalent to none. Remove useless list from search in these cases
		const datalist = self.rqo_search.sqo_options.filter_by_list && self.rqo_search.sqo_options.filter_by_list[0]
			? self.rqo_search.sqo_options.filter_by_list[0].datalist
			: []
		const filter_by_list_fast = filter_by_list.length === datalist.length
			? []
			: filter_by_list

		// filter_by_list_inverse (experimental)
			// const context = self.rqo_search.sqo_options.filter_by_list && self.rqo_search.sqo_options.filter_by_list[0]
			// 	? self.rqo_search.sqo_options.filter_by_list[0].context
			// 	: null
			// const component_tipo = context.tipo

			// const filter_by_list_inverse	= []
			// const datalist_length			= datalist.length
			// for (let i = 0; i < datalist_length; i++) {

			// 	const item	= datalist[i]

			// 	const q = '"' + component_tipo +'_'+ item.value.section_tipo +'_'+ item.value.section_id + '"'

			// 	const found = filter_by_list.find(el => {
			// 		return el.q ===  q
			// 	})
			// 	if (!found) {
			// 		const path = [{
			// 			section_tipo	: context.section_tipo,
			// 			component_tipo	: component_tipo
			// 		}]
			// 		filter_by_list_inverse.push({
			// 			q				: q,
			// 			q_operator		: '!*',
			// 			path			: path,
			// 			format			: 'function',
			// 			use_function	: 'relations_flat_fct_st_si'
			// 		})
			// 	}
			// }

	// rqo
		const rqo = await self.rebuild_search_query_object({
			rqo_search		: rqo_search,
			search_sections	: search_sections,
			filter_by_list	: filter_by_list_fast
		})

	// empty filter_free values case. Nothing to search
		if(rqo===null){
			return {
				result : {
					data : []
				},
				msg	: 'Empty result'
			}
		}

	// const rqo = await options.rqo
		rqo.prevent_lock = true

	// verify source is in list mode to allow lang fallback
		const source	= rqo.source
		source.mode		= 'list'
	// set the autocomplete to true, it will used to assign permissions to at least 1 in the target section and components.
		source.autocomplete	= true

	// API read request
		const load_section_data_promise	= data_manager.request({
			body		: rqo,
			use_worker	: true
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
* SPLIT_Q
* @return string q
* @return object result
*/
service_autocomplete.prototype.split_q = function(q) {

	const ar_q = []

	const regex = /[^|]+/g // /"[^"]+"|'[^']+'|[^|\s]+|[^\s|]+/ug;
	const str 	= q
	let m;

	while ((m = regex.exec(str)) !== null) {
	    // This is necessary to avoid infinite loops with zero-width matches
	    if (m.index === regex.lastIndex) {
	        regex.lastIndex++;
	    }

	    // The result can be accessed through the `m`-variable.
	    m.forEach((match, groupIndex) => {
	        //console.log(`Found match, group ${groupIndex}: ${match}`);
	        ar_q.push(match.trim())
	    });
	}

	const divisor = (q.indexOf('|')!==-1) ? '|' : false

	const result = {
		ar_q 	: ar_q,
		divisor : divisor
	}

	return result
}//end split_q



/**
* ZENON_ENGINE
* @param object|null options
* @return promise
*/
service_autocomplete.prototype.zenon_engine = async function(options) {

	const self = this

	// dd_request
		const rqo_search = clone(self.rqo_search)

	// rqo
		// const generate_rqo = async function(){
		// 	// request_config_object. get the request_config_object from context
		// 	// rqo build
		// 	// const action	= (self.mode==='search') ? 'resolve_data' : 'get_data'
		// 	const add_show	= true
		// 	const zenon_rqo	= await self.caller.build_rqo_show(dd_request, 'get_data', add_show)
		// 	self.rqo_search	= self.caller.build_rqo_search(zenon_rqo, 'search')
		// }
		// generate_rqo()

	// debug
		if(SHOW_DEBUG===true) {
			// console.log('[zenon_engine] rqo:',rqo);
			console.log('[zenon_engine] dd_request:', rqo_search);
			// console.log('self.caller-----------------:',self.caller);
		}

	// const request_ddo			= dd_request.find(item => item.typo === 'request_ddo').value
	// const ar_selected_fields		= self.caller.datum.context.filter(el => el.model === 'component_external')
	// const ar_fields				= ar_selected_fields.map(field => field.properties.fields_map[0].remote)

	// fields of Zenon 'title' for zenon4
		const fields		= rqo_search.show.ddo_map
		const fields_length	= fields.length

	// section_tipo of Zenon zenon1
		const section_tipo	= fields[0].section_tipo

	// format data function
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

				const record = records[i]

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
						const value = ar_value

					// record_data
						const record_data = {
							section_tipo	: section_tipo,
							section_id		: record['id'],
							type			: 'dd687',
							tipo			: fields[j].tipo,
							mode			: 'list',
							value			: value
						}

					// insert formatted item
						components_data.push(record_data)
				}//end iterate fields

				// locator
					const locator = {
						section_tipo	: section_tipo,
						section_id		: record['id']
					}

				// insert formatted locator
				section_data.push(locator)
			}//end iterate records

			// create the section and your data
			const section = {
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
		}//end format_data function

	// trigger vars

		// Iterate current filter
		let q = ''
		const filter_free = rqo_search.sqo_options.filter_free
		for (let operator in filter_free) {

			// set the operator with the user selection or the default operator defined in the config_sqo (it comes in the config_rqo)
			const new_operator = self.operator || operator

			// get the array of the filters objects, they have the default operator
			const current_filter = filter_free[operator]
			const current_filter_length = current_filter.length
			for (let i = 0; i < current_filter_length; i++) {

				const filter_item = current_filter[i]

				const q_check =  filter_item.q

				if( !q_check || q_check === "" ){
					continue
				}
				// wildcards
					q = q_check
			}
		}

		// trigger
		const url_trigger	= self.request_config_object.api_config.api_url_search || 'https://zenon.dainst.org/api/v1/search'
		const trigger_vars	= {
			lookfor		: (q==='') ? 'ñññññññ---!!!!!' : q, // when the q is empty, Zenon get the first 10 records of your DDBB, in that case we change the empty with a nonsense q
			type		: "AllFields", // search in all fields
			sort		: "relevance",
			limit		: 20,
			prettyPrint	: false,
			lng			: "de"
		};

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



/**
* GET_TOTAL
* Only for paginator compatibility
* @return int total
*/
service_autocomplete.prototype.get_total = function() {

	const total = self.limit

	return total
}//end get_total



// @license-end
