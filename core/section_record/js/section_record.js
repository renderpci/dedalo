// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {clone} from '../../common/js/utils/index.js'
	import * as instances from '../../common/js/instances.js'
	import {render_list_section_record} from './render_list_section_record.js'
	import {render_edit_section_record} from './render_edit_section_record.js'



/**
* SECTION_RECORD
*/
export const section_record = function() {

	this.id				= null

	// element properties declare
	this.model			= null
	this.tipo			= null
	this.section_tipo	= null
	this.section_id		= null
	this.mode			= null
	this.lang			= null

	this.datum			= null
	this.context		= null
	this.data			= null

	this.paginated_key	= null
	this.row_key		= null

	this.node			= null

	this.events_tokens	= null
	this.ar_instances	= null
	this.caller			= null

	this.matrix_id		= null
	this.id_variant		= null

	this.column_id		= null

	this.offset			= null
}//end section



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	section_record.prototype.build		= common.prototype.build
	section_record.prototype.destroy	= common.prototype.destroy
	section_record.prototype.render		= common.prototype.render
	section_record.prototype.list		= render_list_section_record.prototype.list
	section_record.prototype.search		= render_list_section_record.prototype.list
	section_record.prototype.edit		= render_edit_section_record.prototype.edit



/**
* INIT
* @params object options
* @return bool true
*/
section_record.prototype.init = async function(options) {

	const self = this

	// options vars
		self.model						= options.model
		self.tipo						= options.tipo
		self.section_tipo				= options.section_tipo
		self.section_id					= options.section_id
		self.mode						= options.mode
		self.lang						= options.lang
		self.id_variant					= options.id_variant
		self.node						= null
		self.columns_map				= options.columns_map

		self.datum						= options.datum
		self.context					= options.context
		// fields_separator
		self.context.fields_separator	= self.context.fields_separator || ' + '
		self.context.view				= self.context.view || 'line'

		self.paginated_key				= options.paginated_key
		self.row_key					= options.row_key

		self.events_tokens				= []
		self.ar_instances				= []

		self.type						= self.model
		self.label						= null

		self.caller						= options.caller || null

		self.matrix_id					= options.matrix_id || null
		self.column_id					= options.column_id

		self.modification_date			= options.modification_date || null

		self.offset						= options.offset

		self.locator					= options.locator

	// permissions
		self.permissions 				= self.caller.permissions

	// status update
		self.status = 'initialized'


	return self
}//end init



/**
* BUILD_INSTANCE
* Get and build a instance with the context given
* Note that the returned promise await the build of the instance
* @param instance object self
* @param object context
* @param string section_id
* @param object current_data
* @param int column_id
* @param bool autoload
* @return object current_instance
* 	Instance of component / section_group initialized and built
*/
const build_instance = async (self, context, section_id, current_data, column_id, autoload) => {

	// current_context
		const current_context = clone(context)

		// Fix context issues with parent value
		// (!) Note that the API prevents more than one same component in context.
		// For this, only the first one is added and therefore parent value it is not reliable. Use always self.caller.tipo as parent
			current_context.parent = self.tipo

	// mode
		// original fallback
			const mode = (current_context.fixed_mode===true)
				? current_context.mode
				: self.mode

	// component / section group instance_options
		const instance_options = {
			model			: current_context.model,
			tipo			: current_context.tipo,
			section_tipo	: current_context.section_tipo,
			section_id		: section_id,
			mode			: mode,
			lang			: current_context.lang,
			section_lang	: self.lang,
			parent			: current_context.parent,
			type			: current_context.type,
			standalone 		: false,
			context			: current_context,
			data			: current_data,
			datum			: self.datum, // full datum from caller section or portal
			request_config	: current_context.request_config,
			columns_map		: current_context.columns_map,
			caller			: self
		}

		// section case. (!) Force session_save = false to prevent
		// overwrite the main section (thesaurus cases calling to self section as children, etc.)
			if (current_context.model==='section') {
				instance_options.session_save = false
			}

		// id_variant . Propagate a custom instance id to children
			const section_record_id_variant = `${self.tipo}_${section_id}_${self.caller.section_tipo}_${self.caller.section_id}`
			instance_options.id_variant = self.id_variant
				? self.id_variant + '_' + section_record_id_variant
				: section_record_id_variant

		// matrix_id. time machine matrix_id
			if (self.matrix_id) {
				instance_options.matrix_id = self.matrix_id
			}

		// column_id
			if(column_id) {
				instance_options.column_id = column_id
			}

		// dataframe
			instance_options.id_variant = (instance_options.model==='component_dataframe')
				? `${section_record_id_variant}_${current_data.section_id_key}`
				: instance_options.id_variant

	// component / section group. Create the instance options for build it, the instance is reflect of the context and section_id
		const current_instance = await instances.get_instance(instance_options)
		if(!current_instance || typeof current_instance.build!=='function'){
			console.warn(`ERROR on build instance (ignored ${current_context.model}):`, current_instance);
			return
		}

	// build. instance build await
		await current_instance.build(autoload)


	return current_instance
}//end build_instance



/**
* GET_AR_INSTANCES_EDIT (USED IN EDIT MODE)
* @see render_section get_content_data
* @return array self.ar_instances
* 	Resolve: array ar_instances
* 	Initialized and built instances
*/
section_record.prototype.get_ar_instances_edit = async function() {

	const self = this

	// already calculated case
		if (self.ar_instances && self.ar_instances.length>0) {
			return self.ar_instances
		}

	// sort vars
		const mode			= self.mode
		const section_tipo	= self.section_tipo
		const section_id	= self.section_id
		const tipo			= self.tipo

	// items. Get the items inside the section/component of the record to render it
		const items = (self.caller.model === 'section')
			? self.datum.context.filter(el =>
				el.section_tipo===section_tipo
				&& el.parent===tipo
				&& (el.type==='component' || el.type==='grouper')
				&& el.model!=='component_dataframe'
				&& el.mode===mode)
			: self.datum.context.filter(el =>
				el.section_tipo===section_tipo
				&& el.parent===tipo
				&& (el.type==='component' || el.type==='grouper')
				&& el.mode===mode)

	// instances
		const ar_promises	= []
		const items_length	= items.length
		for (let i = 0; i < items_length; i++) {

			// parallel mode
			const current_promise = new Promise(function(resolve){

				const current_context = items[i]

				const current_data = self.get_component_data({
					ddo				: current_context,
					section_tipo	: current_context.section_tipo,
					section_id		: (current_context.model==='component_dataframe')
						? self.caller.section_id
						: self.section_id
				})

				// build_instance
				build_instance(
					self,
					current_context,
					section_id,
					current_data,
					null, // column_id
					false // autoload
				)
				.then(function(current_instance){
					resolve(current_instance)
				})
				.catch((errorMsg) => {
					console.error('build_instance error: ', errorMsg);
				})
			})
			ar_promises.push(current_promise)
		}//end for (let i = 0; i < items_length; i++)

	// instances. Await all instances are parallel built and fix
		await Promise.all(ar_promises)
		.then(function(ar_instances){
			// set self.ar_instances
			self.ar_instances = ar_instances
		})


	return self.ar_instances
}//end get_ar_instances_edit



/**
* GET_AR_COLUMNS_INSTANCES_LIST
* Iterate all request_config building an instance for each ddo_map item
* All instances are stored in self.ar_instances array container
* (Used in list mode and time machine too)
* @see common.get_columns_map for a better overview
* @return array self.ar_instances
* [
* 	{model: "component_input_text", tipo: "dd374", ...} component instance,
* 	{model: "component_select", tipo: "dd375", ...} component instance
* ]
*/
section_record.prototype.get_ar_columns_instances_list = async function() {

	const self = this

	// already calculated case
		if (self.ar_instances && self.ar_instances.length>0) {
			return self.ar_instances
		}

	// matrix_id. Time machine case only
		const matrix_id	= self.matrix_id

	// columns_map. Build from ddo_map
	// @see common.get_columns_map for a better overview
		const columns_map = await self.columns_map || []

	// request config
	// get the request_config with all ddo, it will be use to create the instances
		const request_config		= self.context.request_config || []
		const request_config_length	= request_config.length

	// instances
	// get the columns of the component and match it with the ddo
		const columns_map_length = columns_map.length
		for (let i = 0; i < columns_map_length; i++) {

			const current_column = columns_map[i]

			// request_config could be multiple (Dédalo, Zenon, etc)
			const ar_column_ddo = []
			for (let j = 0; j < request_config_length; j++) {

				const request_config_item = request_config[j]

				// ddo_map. Get the ddo map to be used
				const ddo_map = (self.mode === 'search')
					? (
						request_config_item.search && request_config_item.search.ddo_map && request_config_item.search.ddo_map.length > 0
							? request_config_item.search.ddo_map
							: request_config_item.show.ddo_map
					  )
					: request_config_item.show.ddo_map

				// get the direct components of the caller (component or section)
				const ar_first_level_ddo = ddo_map.filter(item => item.parent === self.tipo)

				// with every child, match it with the column and assign to it.
				const ar_first_level_ddo_len = ar_first_level_ddo.length
				for (let k = 0; k < ar_first_level_ddo_len; k++) {

					const current_ddo = ar_first_level_ddo[k]

					// if the ddo has column_id (normally all component have it, you can see it in common.js get_columns() method)
					if(current_ddo.column_id && current_ddo.column_id===current_column.id){

						// check if the column of the component is already loaded, if exists, don't load it.
							const exists = ar_column_ddo.find(item => item.tipo === current_ddo.tipo)
							if(exists) {
								continue
							}

						// add to the ddo to the column
							ar_column_ddo.push(current_ddo)

							// NOTE: about component_dataframe:
							// By default section_tipo will be the section_tipo of the locator
							// but when ddo is a componet_dataframe (subsection to use as data_frame)
							// the section_tipo need to be the section_tipo of the ddo
							// (section_tipo has not really record in DDBB and his totally dependent of the caller locator section_id)
							// Note: it's not the scenario of multiple section_tipo as fr1, es1 when section_record it depends of
							// the locator that conform the section_record
							const section_tipo		= (current_ddo.model==='component_dataframe')
								? current_ddo.section_tipo
								: self.section_tipo
							const section_id		= (current_ddo.model==='component_dataframe')
								? self.caller.section_id
								: self.section_id

						// current_data. get the component data to assign to it and create the instance
							const current_data = self.get_component_data({
								ddo				: current_ddo,
								section_tipo	: section_tipo,
								section_id		: section_id,
								matrix_id		: matrix_id
							})

						// unify section_tipo as array, to get context when component is inside a virtual section
						// sometimes it will need to be compatible in multiple sections (array > 1) as toponymy sections (es1, fr1, etc)
						// sometimes the component is only for current ddo section (as publication component of media,
						// rsc20 could be in rsc170, rsc167, ... but the context is not shared)
							const current_ddo_section_tipo = Array.isArray(current_ddo.section_tipo)
								? current_ddo.section_tipo
								: [current_ddo.section_tipo]

						// current_context. check if the section_tipo is multiple to use it or not to match component
							const current_context = current_ddo_section_tipo.length > 1
								? self.datum.context.find(el => el.tipo===current_ddo.tipo && el.mode===current_ddo.mode)
								: self.datum.context.find(el => el.tipo===current_ddo.tipo && el.mode===current_ddo.mode && el.section_tipo===current_ddo_section_tipo[0])

								// check is valid context
								if (!current_context) {

									if(SHOW_DEBUG===true) {
										// Note that this message is not an error, but a warning when some columns
										// are defined and not used (like Zenon columns in Bibliography if no Zenon data is added)
										// Remember that subcontext is only calculated when subdata exists !
											// console.groupCollapsed(`+ [get_ar_columns_instances_list] Ignored context not found for model: ${current_ddo.model}, section_tipo: ${current_ddo.section_tipo}, tipo: ${current_ddo.tipo}`);
											// console.warn('Check your hierarchy definitions to make sure it is defined (Remember that subcontext is only calculated when subdata exists)', current_ddo.tipo);
											// console.log('ddo:', current_ddo);
											// console.log("self.datum.context:", self.datum.context);
											// console.log('current_data:', current_data);
											// console.log("self:", self);
											// console.groupEnd()
									}

									// ignore unused context
									continue;
								}

						// new_context. clone the current_context to prevent changes in the original.
							const new_context = clone(current_context)
							new_context.properties = new_context.properties || {}
							new_context.columns_map = (current_column.columns_map)
								? current_column.columns_map
								: false
							// set the fixed_mode when is set by preferences, properties or tools, to maintain the mode defined
							// if not, the ddo will get the mode from current section_record
							if(current_ddo.fixed_mode){
								new_context.fixed_mode		= current_ddo.fixed_mode
								new_context.properties.mode	= current_ddo.fixed_mode
							}
							if(current_ddo.mode){
								new_context.mode			= current_ddo.mode
								new_context.properties.mode	= current_ddo.mode
							}
							// set the view of the column when is defined in ddo, view could be defined in properties of the portals
							// sometimes it need to be changed to adapt ddo view of the parent (mosaic case for images)
							if(current_ddo.view){
								new_context.view			= current_ddo.view
								new_context.properties.view	= current_ddo.view
							}
							// set the children_view when the ddo has defined it, this param will be used to be render the children of the portals
							if(current_ddo.children_view){
								new_context.children_view = current_ddo.children_view
							}
							// set the fields_separator to be assigned to join the components inside the component_portal
							if(current_ddo.fields_separator){
								new_context.fields_separator = current_ddo.fields_separator
							}
							// set the records_separator to be assigned to join the every record(row) inside the component_portal
							if(current_ddo.records_separator){
								new_context.records_separator = current_ddo.records_separator
							}
							// set the hover of the column when is defined in ddo, hover could be defined in properties of the portals
							// hover define the instance not be render as normal only when the mouse will hover of normal nodes (information hover mosaic views)
							if(current_ddo.hover){
								new_context.hover = current_ddo.hover
							}
							// set the view and mode when with_value property has set
							// it change the view and the mode to edit component in lists, if the component has data will render with the definition instead the default
							// take a different mode and view with data.
							if(current_ddo.with_value){
								new_context.properties.with_value	= current_ddo.with_value

								if(current_data.value && current_data.value.length > 0){
									new_context.view = current_ddo.with_value.view
									new_context.mode = current_ddo.with_value.mode
								}
							}

						// instance create and set
							const instance_data = current_ddo.model==='dd_grid'
								? [current_data.value]
								: current_data;

							const current_instance = await build_instance(
								self, // current section_record instance
								new_context, // edit context
								section_id, // current section_id
								instance_data, // already calculated instance data
								current_column.id, // column id
								false // build autoload
							)

							// add built instance
							self.ar_instances.push(current_instance)
					}//end if(current_ddo.column_id..
				}//end for (let k = 0; k < ar_first_level_ddo_len; k++)
			}//end for (let j = 0; j < request_config_length; j++)
		}//end for (let i = 0; i < columns_map_length; i++)


	return self.ar_instances
}//end get_ar_columns_instances_list



/**
* GET_COMPONENT_DATA
* Compares received section_tipo, section_id, matrix_id with elements inside datum.data trying to get match.
* If no elements matches, a empty object is created to prevent gaps
* @param object options
* @return object|null component_data
* 	If no component data is found, a special component data for empty cases is created
*/
section_record.prototype.get_component_data = function(options) {

	const self = this

	// options
		const ddo			= options.ddo
		const section_tipo	= options.section_tipo
		const section_id	= options.section_id
		const matrix_id		= options.matrix_id || null

	// section_id_key
		const section_id_key = (ddo.caller_dataframe)
			? ddo.caller_dataframe.section_id_key
			: self.section_id

	// no data elements case (groupers)
		if (ddo.model==='section_group') {
			return null;
		}

	// component_data. Find in datum: tipo, section_tipo, section_id
		const component_data = self.datum.data.find(function(el) {

			if( el.tipo 					=== ddo.tipo // match tipo
				&& parseInt(el.section_id)	=== parseInt(section_id)  // match section_id
				&& el.section_tipo			=== section_tipo // match section_tipo
				&& el.mode					=== ddo.mode // match mode
				){

				// time machine case
				if (el.matrix_id && matrix_id) {

					if (ddo.model==='component_dataframe') {

						return (
							parseInt(el.matrix_id)		=== parseInt(matrix_id)	&&
							parseInt(el.section_id_key)	=== parseInt(section_id_key)
						)
					}

					return parseInt(el.matrix_id)===parseInt(matrix_id)
				}

				// dataframe case
				// if ddo is inside a dataframe get his data matching row_section_id of ddo with the section_id of the caller and his own section_tipo and section_id
				// ex: portal with section_tipo = numisdata3 and section_id = 1
				// has a dataframe with section_tipo = numisdata_1016 and section_id_8
				// the match for components inside numisdata_1016 has to be ddo row_section_id === caller (portal) section_id
				// data of components inside dataframe sections are conditioned by his caller section_tipo and section_id and his own section_tipo and section_id

				if (ddo.model==='component_dataframe') {

					return parseInt(el.section_id_key)===parseInt(section_id_key)
				}

				return true
			}

			return false
		})

	// undefined case. If the current item don't has data will be instantiated with the current section_id
		if(!component_data) {

			// empty component data build
			const empty_data = {
				tipo			: ddo.tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				info			: 'No data found for this component',
				value			: [],
				fallback_value	: ['']
			}

			if (ddo.model==='component_dataframe') {
				// add section_id_key
				empty_data.section_id_key = section_id_key

			}
			return empty_data
		}


	return component_data
}//end get_component_data



/**
* GET_COMPONENT_INFO
* Find ddinfo item into self.datum.data
* @return object|undefined component_info
*/
section_record.prototype.get_component_info = function() {

	const self = this

	const component_info = self.datum.data.find(item => item.tipo==='ddinfo'
													 && item.section_id===self.section_id
													 && item.section_tipo===self.section_tipo)

	return component_info
}//end get_component_info



// @license-end
