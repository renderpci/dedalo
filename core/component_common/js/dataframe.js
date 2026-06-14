// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import { clone } from '../../common/js/utils/index.js'
	import { get_instance, get_all_instances } from '../../common/js/instances.js'



/**
* DATAFRAME
* Single JS authority for the dataframe pairing contract.
* See docs/core/components/component_dataframe.md
*
* Pairing contract: a dataframe locator pairs with ONE data item of its main
* component through the item's stable `id` (never the array index).
* Match predicate: (type, from_component_tipo, main_component_tipo, id_key)
* Legacy (pre-migration) locators carry `section_id_key`/`section_tipo_key`
* instead of `type`/`id_key` and are dual-read until the data migration runs.
*/



// DATAFRAME_TYPE. Relation type term marking dataframe pairing locators
// (PHP constant: DEDALO_RELATION_TYPE_DATAFRAME)
export const DATAFRAME_TYPE = 'dd490'



/**
* GET_DATAFRAME_KEYS
* Builds the pairing keys for a main component data item.
* The pairing key is the item's stable `id`; an item without id cannot be
* paired (it is not persisted yet) and calling this with one is a programming
* error: the caller must use the save-then-attach flow.
* @param object self - main component instance
* @param object item - data item of the main component (must carry `id`)
* @return object keys
*/
export const get_dataframe_keys = function(self, item) {

	if (!item || typeof item.id==='undefined' || item.id===null) {
		throw new Error('get_dataframe_keys: item without id. The pairing key is the item id, never the array index. Persist the item before attaching a dataframe.')
	}

	return {
		section_id_key		: item.id,
		section_tipo_key	: self.section_tipo,
		main_component_tipo	: self.tipo
	}
}//end get_dataframe_keys



/**
* IS_DATAFRAME_ENTRY
* Positive detection of dataframe pairing locators, type-first with
* legacy shape fallback (pre-migration data).
* @param object el
* @return bool
*/
export const is_dataframe_entry = function(el) {

	if (!el || typeof el!=='object') {
		return false
	}
	// unified contract: positive marker
	if (el.type===DATAFRAME_TYPE) {
		return true
	}
	// legacy shape fallback (pre-migration data)
	return (typeof el.id_key!=='undefined' || typeof el.section_id_key!=='undefined')
		&& typeof el.main_component_tipo!=='undefined'
}//end is_dataframe_entry



/**
* GET_DATAFRAME
* Builds a component_dataframe instance paired to one data item of the
* caller (main) component, resolving its data from the caller datum.
* @param object options
* {
* 	self: object - main component instance
* 	section_id: int|string|null
* 	section_id_key: int - pairing key: the main data item `id` (id_key accepted as alias)
* 	section_tipo_key: string - legacy, the main component section_tipo
* 	main_component_tipo: string
* 	view: string|null
* 	mode: string|null
* 	lang: string|null
* }
* @return object|null component_dataframe instance
* 	A built component_dataframe instance (status = 'built')
*/
export const get_dataframe = async function(options) {

	// options
	const self					= options.self
	const section_id			= options.section_id
	const section_id_key		= options.id_key ?? options.section_id_key
	const section_tipo_key		= options.section_tipo_key
	const main_component_tipo	= options.main_component_tipo
	const view					= options.view
	const mode					= options.mode
	const lang					= options.lang

	// pairing keys sanity. A dataframe without full pairing keys silently
	// resolves the wrong (or no) data: fail loudly instead
	if (typeof section_id_key==='undefined' || section_id_key===null
		|| typeof section_tipo_key==='undefined'
		|| typeof main_component_tipo==='undefined') {
		console.error('get_dataframe: incomplete pairing keys. Expected section_id_key (item id), section_tipo_key, main_component_tipo. Received:', {
			section_id_key		: section_id_key,
			section_tipo_key	: section_tipo_key,
			main_component_tipo	: main_component_tipo,
			caller_tipo			: self?.tipo
		})
		return null
	}

	const request_config = self.context?.request_config || null

	// original_dataframe_ddo
	const original_dataframe_ddo = request_config
		? request_config[0]?.show?.ddo_map?.find(el => el.model === 'component_dataframe')
		: null;
	// no ddo found case, stop here
	if(!original_dataframe_ddo){
		return null
	}

	// instance_options
	const instance_options = clone(original_dataframe_ddo)
	instance_options.section_id	= section_id
	instance_options.id_variant	= `${instance_options.tipo}_${section_id}_${self.section_tipo}_${self.section_id}_${section_tipo_key}_${section_id_key}_${main_component_tipo}_${Math.random()}`
	instance_options.standalone	= false

	// matrix_id. time machine matrix_id
	if (self.matrix_id) {
		instance_options.matrix_id = self.matrix_id
		instance_options.id_variant = `${instance_options.id_variant}_${self.matrix_id}`
	}

	// add lang if is defined from options
	instance_options.lang = lang

	// component_dataframe init instance
	const component_dataframe = await get_instance(instance_options)

	// data. Get his data from datum
	// it get data from datum as section_record does (see section_record get_component_data() for portals)
	// match predicate is dual-read: id_key (unified contract) or section_id_key (legacy)
	const entry_key = (el) => el.id_key ?? el.section_id_key
	const data = self.datum?.data?.find( function(el) {
		if( el.tipo						=== component_dataframe.tipo
			&& el.section_tipo			=== component_dataframe.section_tipo
			&& parseInt(el.section_id)	=== parseInt(component_dataframe.section_id)
			){
				// time machine case
				if( el.matrix_id && self.matrix_id){
					return (
						parseInt(el.matrix_id)			=== parseInt(self.matrix_id)
						&& parseInt(entry_key(el))		=== parseInt(section_id_key)
						&& el.main_component_tipo		=== main_component_tipo
						&& (typeof el.section_tipo_key==='undefined' || el.section_tipo_key===section_tipo_key)
					)
				}
				// normal case
				else{
					return (
						parseInt(entry_key(el))		=== parseInt(section_id_key)
						&& el.main_component_tipo	=== main_component_tipo
						&& (typeof el.section_tipo_key==='undefined' || el.section_tipo_key===section_tipo_key)
					)
				}
			}
		return false
	})

	const dataframe_data = data
		? data
		: {
			type				: DATAFRAME_TYPE,
			id_key				: section_id_key,
			section_tipo_key	: section_tipo_key,
			section_id_key		: section_id_key,
			main_component_tipo	: main_component_tipo
		}

	// context
	const context = self.datum?.context?.find( el =>
		el.tipo				=== component_dataframe.tipo
		&& el.section_tipo	=== component_dataframe.section_tipo
	)
	if (!context) {
		console.warn(`Context not found for component ${component_dataframe.tipo} in section ${component_dataframe.section_id}. Cannot proceed.`);
		return null;
	}

	// view. Get view from options. If not defined, get from ddo
	context.view = (view)
		? view
		: instance_options.view
			? instance_options.view
			: 'default'

	// mode. Get mode from options. If not defined, get from ddo
	context.mode = (mode)
		? mode
		: instance_options.mode
			? instance_options.mode
			: 'edit'

	// inject properties before build
	component_dataframe.datum	= self.datum
	component_dataframe.data	= dataframe_data
	component_dataframe.context	= context
	component_dataframe.caller	= self

	// build component
	await component_dataframe.build(false)


	return component_dataframe
}//end get_dataframe



/**
* ATTACH_DATAFRAME_NODE
* Render glue shared by main component edit/list views: builds the paired
* dataframe instance, registers it as caller dependency, renders it and
* appends the node to the given container.
* @param object options
* {
* 	self: object - main component instance
* 	item: object - main data item (pairing by item.id)
* 	container: HTMLElement - node to append the dataframe node to
* 	view: string|null
* 	mode: string|null
* 	lang: string|null
* 	class_name: string|null - optional class added to the dataframe node
* }
* @return Promise<object|null> component_dataframe instance
*/
export const attach_dataframe_node = async function(options) {

	const self		= options.self
	const item		= options.item
	const container	= options.container

	const component_dataframe = await get_dataframe({
		self		: self,
		section_id	: self.section_id,
		...get_dataframe_keys(self, item),
		view		: options.view,
		mode		: options.mode,
		lang		: options.lang
	})

	if (!component_dataframe) {
		return null
	}

	// add dataframe instance to component dependencies array
	self.ar_instances.push(component_dataframe)

	// render and append
	const dataframe_node = await component_dataframe.render()
	if (options.class_name) {
		dataframe_node.classList.add(options.class_name)
	}
	container.appendChild(dataframe_node)

	return component_dataframe
}//end attach_dataframe_node



/**
* ATTACH_ITEM_DATAFRAME
* Standard literal-component view glue: renders the dataframe paired with
* one data item and appends it to the given container. No-op unless the
* component declares properties.has_dataframe.
* Persisted items pair by their stable `id`; new blank rows use the next
* counter value (self.data.counter+1) as PROVISIONAL render context only
* (ids are minted server-side on save, see the pairing contract in
* docs/core/components/component_dataframe.md).
* @param object options
* {
* 	self: object - main component instance
* 	item: object|null - data item of the main component (null for blank rows)
* 	container: HTMLElement - node to append the dataframe node to
* 	view: string|null
* 	mode: string|null
* 	lang: string|null
* 	class_name: string|null - optional class added to the dataframe node
* }
* @return Promise<object|null> component_dataframe instance
*/
export const attach_item_dataframe = async function(options) {

	const self		= options.self
	const item		= options.item
	const container	= options.container

	// opt-in: the component instance must declare has_dataframe
	// (self.properties is the init-time alias of context.properties)
	if (!self.context?.properties?.has_dataframe && !self.properties?.has_dataframe) {
		return null
	}

	container.classList.add('has_dataframe')

	// section_id_key. Pairing key is the data item stable `id`, never the
	// array index. New blank rows use the next counter as provisional render
	// context, matching the subdatum locator created by the JSON controller
	// (build_dataframe_subdatum)
	const section_id_key = item?.id ?? (self.data.counter + 1)

	const component_dataframe = await get_dataframe({
		self				: self,
		section_id			: self.section_id,
		section_tipo		: self.section_tipo,
		section_id_key		: section_id_key,
		section_tipo_key	: self.section_tipo,
		main_component_tipo	: self.tipo,
		view				: options.view ?? self.view,
		mode				: options.mode,
		lang				: options.lang
	})

	if (!component_dataframe) {
		return null
	}

	// add dataframe instance to component dependencies array
	self.ar_instances.push(component_dataframe)

	// render and append
	const dataframe_node = await component_dataframe.render()
	if (options.class_name) {
		dataframe_node.classList.add(options.class_name)
	}
	container.appendChild(dataframe_node)

	return component_dataframe
}//end attach_item_dataframe



/**
* DELETE_DATAFRAME
* Remove section in delete_mode 'delete_dataframe'.
* (!) Single-writer rule: the server cascade (update_data_value 'remove')
* is the authority for dataframe cleanup when a main item is removed.
* Use this only for explicit user 'unlink frame' actions.
* @param object options
* {
*	section_id : section_id
* }
* @return bool delete_section_result
*/
export const delete_dataframe = async function(options) {

	const self = options.self

	// options
		const section_id			= options.section_id
		const section_tipo			= options.section_tipo
		const section_id_key		= options.id_key ?? options.section_id_key
		const section_tipo_key		= options.section_tipo_key
		const main_component_tipo	= options.main_component_tipo
		const paginated_key			= options.paginated_key || false
		const row_key				= options.row_key || false
		const delete_instace		= options.delete_instace || false

	// pairing keys sanity
	if (typeof section_id_key==='undefined' || section_id_key===null
		|| typeof main_component_tipo==='undefined') {
		console.error('delete_dataframe: incomplete pairing keys. Expected section_id_key (item id) and main_component_tipo. Received:', {
			section_id_key		: section_id_key,
			section_tipo_key	: section_tipo_key,
			main_component_tipo	: main_component_tipo,
			caller_tipo			: self?.tipo
		})
		return false
	}

	// ddo_dataframe.
	// check if the show has any ddo that call to any dataframe section.
		const ddo_dataframe = self.request_config_object?.show?.ddo_map?.find(el => el.model==='component_dataframe')

		if(!ddo_dataframe){
			return false
		}

		const entry_key = (el) => el.id_key ?? el.section_id_key
		const all_instances = get_all_instances()
		const component_dataframe = all_instances.find(el =>
			el.model							=== 'component_dataframe'
			&& el.tipo							=== ddo_dataframe.tipo
			&& el.section_tipo					=== ddo_dataframe.section_tipo
			&& parseInt(el.section_id)			=== parseInt(section_id)
			&& parseInt(entry_key(el.data))		=== parseInt(section_id_key)
			&& el.data.main_component_tipo		=== main_component_tipo
			&& (typeof el.data.section_tipo_key==='undefined' || el.data.section_tipo_key===section_tipo_key)
		)

	if(!component_dataframe){
		return false
	}

	// soft delete (default)
	// unlink the section, delete the locator from his data, but don't delete the target section
	// (!) the target section record is never hard-deleted here: time machine
	// needs to render previous states. Orphan records are reclaimed by the
	// dataframe GC maintenance task.
		await component_dataframe.unlink_record({
			paginated_key	: row_key,
			row_key			: row_key,
			section_id		: section_id
		})

	// remove the instance
		if(delete_instace===true){
			await component_dataframe.destroy(
				true, // delete_self
				true, // delete_dependencies
				true // remove_dom
			)
		}

	return true
}//end delete_dataframe



// @license-end
