// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, before, after, assert, window, page_globals, DD_TIPOS */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_INDEXATION
 * Client-side coverage for the indexation tool.
 *
 * The tool's deeper init/build/render path needs a host section with a configured
 * tool_config ddo_map (transcription_component, indexing_component, area_thesaurus,
 * etc.), live component/section instances and event_manager subscriptions, none of
 * which is guaranteed in the headless harness. This suite therefore asserts the
 * reliable, fixture-free contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_indexation} from '../../../tools/tool_indexation/js/tool_indexation.js'
import {add_instance, delete_instance, key_instances_builder} from '../../../core/common/js/instances.js'
import {data_manager} from '../../../core/common/js/data_manager.js'
import {ApiError, CLIENT_ERROR} from '../../../core/common/js/api_error.js'



describe('TOOL_INDEXATION CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_indexation, 'function', 'expected tool_indexation to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_indexation()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common + tool-specific properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.ar_instances, null, 'expected ar_instances null')
		assert.equal(instance.status, null, 'expected status null')
		assert.equal(instance.caller, null, 'expected caller null')
		assert.equal(instance.transcription_component, null, 'expected transcription_component null')
		assert.equal(instance.indexing_component, null, 'expected indexing_component null')
		assert.equal(instance.related_sections_list, null, 'expected related_sections_list null')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_indexation.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_indexation.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_indexation.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_indexation
		assert.equal(typeof tool_indexation.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_indexation.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_indexation.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_indexation.prototype.get_component, 'function', 'expected get_component defined')
		assert.equal(typeof tool_indexation.prototype.load_related_sections_list, 'function', 'expected load_related_sections_list defined')
		assert.equal(typeof tool_indexation.prototype.active_value, 'function', 'expected active_value defined')
		assert.equal(typeof tool_indexation.prototype.update_active_values, 'function', 'expected update_active_values defined')
		assert.equal(typeof tool_indexation.prototype.delete_tag, 'function', 'expected delete_tag defined')
		// tag_note mixin methods
		assert.equal(typeof tool_indexation.prototype.render_indexation_note, 'function', 'expected render_indexation_note wired')
		assert.equal(typeof tool_indexation.prototype.render_empty_note, 'function', 'expected render_empty_note wired')
		assert.equal(typeof tool_indexation.prototype.render_note, 'function', 'expected render_note wired')
		// the mixin is EXACTLY those three (tool_indexation.js:182-184). `new_tag_note`
		// is a module-private helper inside tag_note.js and must NOT leak onto the
		// prototype — asserting it did was asserting the opposite of the contract.
		assert.equal(typeof tool_indexation.prototype.new_tag_note, 'undefined', 'new_tag_note expected module-private, not on the prototype')
	})

})

/**
* TOOL_INDEXATION — BEHAVIOUR
* Layer 2 on top of the template above: the parts of the tool that CAN be driven
* without a host section, live components or a backend.
*
*   active_value / update_active_values — the tag-info panel's pub/sub fan-out
*   _ensure_lazy_instance               — the deferred left-pane viewers
*   load_related_sections_list          — the "Approach" selector's RQO shape
*   delete_tag                          — the two-confirm destructive path
*   render_indexation_note              — the tag `data` pseudo-JSON contract
*
* Fixture-free by construction:
*   - the instance is built with `new` and its fields are assigned by hand (init
*     needs a tool_config, page_globals langs and event subscriptions),
*   - lazy children are FAKE instances pre-registered in the shared registry under
*     the exact key `get_instance` will ask for, so a recovered child PROVES the
*     option contract (model, tipo, section_tipo, section_id, mode, lang, id_variant),
*   - `data_manager.request` is patched on the shared singleton,
*   - `confirm` / `alert` are stubbed: a REAL dialog blocks the headless renderer
*     and every later CDP call times out, so the suite would not just fail, it would
*     hang the whole run.
*/

// registered_keys — cleaned from the shared registry after the suite
	const registered_keys = []

// make_tool — a constructed (not init'ed) tool with the fields the method under test reads
	const make_tool = (extra={}) => Object.assign(new tool_indexation(), {
		model			: 'tool_indexation',
		ar_instances	: [],
		// get_tool_label comes from tool_common via init; every label read has a
		// documented literal fallback, so a stub returning null exercises THAT path
		get_tool_label	: () => null
	}, extra)

// fake_component — the minimum a lazy child needs to be built and wired
	const fake_component = (id) => ({
		id				: id,
		build_calls		: [],
		show_interface	: { tools:true },
		build			: async function(autoload){ this.build_calls.push(autoload); return true }
	})

// with_stubbed_request — patch the shared data_manager, run fn, ALWAYS restore
	const with_stubbed_request = async (response, fn) => {
		const original	= data_manager.request
		const captured	= []
		data_manager.request = async (options) => {
			captured.push(options?.body)
			return response
		}
		try {
			await fn(captured)
		} finally {
			data_manager.request = original
		}
	}

// with_dialogs — stub confirm/alert (a real one FREEZES the headless renderer)
	const with_dialogs = async ({ confirms=[], on_alert=()=>{} }, fn) => {
		const confirm_backup	= window.confirm
		const alert_backup		= window.alert
		const answers			= [...confirms]
		const asked				= []
		window.confirm = (msg) => { asked.push(msg); return answers.length ? answers.shift() : false }
		window.alert = (msg) => { on_alert(msg) }
		try {
			await fn(asked)
		} finally {
			window.confirm	= confirm_backup
			window.alert	= alert_backup
		}
	}

// failed_envelope — an envelope request_failed() actually recognises (an ApiError under `error`)
	const failed_envelope = (message) => ({
		ok		: false,
		error	: new ApiError({ code: CLIENT_ERROR.BAD_RESPONSE, message: message })
	})



describe('TOOL_INDEXATION BEHAVIOUR', function() {

	this.timeout(10000)

	after(function(){
		// registry hygiene — the instances map is shared with every other suite
		for (const key of registered_keys) {
			delete_instance(key)
		}
		registered_keys.length = 0
	})


	// ------------------------------------ active_value / update_active_values

	it('active_value initialises active_elements lazily and registers the slot', function() {

		const tool = make_tool()
		assert.equal(tool.active_elements, undefined, 'active_elements is NOT seeded by the constructor')

		const fn = () => {}
		assert.equal(tool.active_value('tag_id', fn), true, 'first registration returns true')
		assert.equal(tool.active_elements.length, 1, 'the slot is stored')
		assert.equal(tool.active_elements[0].name, 'tag_id', 'stored under its name')
		assert.equal(tool.active_elements[0].callback, fn, 'the callback reference is kept as given')
	})


	it('active_value dedups on name+callback, but the SAME name with another callback is a new subscriber', function() {

		const tool	= make_tool()
		const fn_a	= () => {}
		const fn_b	= () => {}

		assert.equal(tool.active_value('state', fn_a), true, 'first')
		assert.equal(tool.active_value('state', fn_a), false, 'the identical pair is refused')
		assert.equal(tool.active_value('state', fn_b), true, 'a different callback on the same slot IS added')
		assert.equal(tool.active_value('tag_id', fn_a), true, 'the same callback on another slot IS added')
		assert.equal(tool.active_elements.length, 3, 'exactly the three accepted registrations are stored')
	})


	it('update_active_values fans one value out to every subscriber of that slot, in registration order', function() {

		const tool	= make_tool()
		const calls	= []

		tool.active_value('tag_id', v => calls.push(['a', v]))
		tool.active_value('tag_id', v => calls.push(['b', v]))
		tool.active_value('state',  v => calls.push(['state', v]))

		const result = tool.update_active_values([
			{ name:'tag_id', value:'42' },
			{ name:'state',  value:'n' }
		])

		assert.equal(result, true, 'always returns true')
		assert.deepEqual(calls, [['a','42'], ['b','42'], ['state','n']], 'one-to-many per slot, batch order preserved')
	})


	it('update_active_values is a no-op for an unknown slot and before any registration', function() {

		const tool = make_tool()

		// no active_elements at all — the `|| []` guard is what keeps this from throwing
		assert.equal(tool.update_active_values([{ name:'tag_id', value:'1' }]), true, 'no registrations: no throw')

		let fired = 0
		tool.active_value('tag_id', () => fired++)
		tool.update_active_values([{ name:'nope', value:'x' }])
		assert.equal(fired, 0, 'an unknown slot fires nothing')

		// empty batch
		assert.equal(tool.update_active_values([]), true, 'empty batch is legal')
		assert.equal(fired, 0, 'and fires nothing')
	})


	it('update_active_values skips an entry with no callback and still serves the rest', function() {

		const tool = make_tool()
		let fired = 0

		tool.active_elements = [
			{ name:'tag_id', callback:null },
			{ name:'tag_id', callback:() => fired++ }
		]

		assert.equal(tool.update_active_values([{ name:'tag_id', value:'7' }]), true, 'no throw on the null callback')
		assert.equal(fired, 1, 'the valid subscriber still fires')
	})


	it('update_active_values delivers a falsy value unchanged (empty string / null are legal tag states)', function() {

		const tool	= make_tool()
		const seen	= []
		tool.active_value('state', v => seen.push(v))

		tool.update_active_values([{ name:'state', value:'' }, { name:'state', value:null }, { name:'state', value:0 }])

		assert.deepEqual(seen, ['', null, 0], 'no truthiness filter on the value')
	})


	// ------------------------------------------------- _ensure_lazy_instance

	it('_ensure_lazy_instance returns an already-created role without consulting _lazy_ddos', async function() {

		const existing	= fake_component('already_there')
		const tool		= make_tool({ media_component:existing, _lazy_ddos:{} })

		const instance = await tool._ensure_lazy_instance('media_component')

		assert.equal(instance, existing, 'the live instance is returned as-is')
		assert.equal(existing.build_calls.length, 0, 'it is NOT rebuilt')
		assert.equal(tool.ar_instances.length, 0, 'and not pushed a second time')
	})


	it('_ensure_lazy_instance throws for a role with no deferred config', async function() {

		const tool = make_tool({ _lazy_ddos:{} })

		let error = null
		try {
			await tool._ensure_lazy_instance('references_component')
		} catch (e) {
			error = e
		}

		assert.ok(error, 'an unconfigured role must throw, not resolve undefined')
		assert.ok(String(error.message).indexOf('references_component')!==-1, 'the message names the role')

		// and the same for a tool that never ran build (no _lazy_ddos at all)
		let error2 = null
		try {
			await make_tool()._ensure_lazy_instance('media_component')
		} catch (e) {
			error2 = e
		}
		assert.ok(error2, 'optional chaining on a missing _lazy_ddos still throws the named error')
	})


	it('_ensure_lazy_instance builds media_component, wires it, and publishes it on the tool', async function() {

		const ddo = {
			role			: 'media_component',
			model			: 'component_media_fake',
			mode			: 'edit',
			tipo			: 'lazy_media',
			section_tipo	: 'st_lazy',
			section_id		: 5,
			lang			: 'lg-eng',
			type			: 'component'
		}
		const tool = make_tool({ _lazy_ddos:{ media_component:ddo } })

		const key	= key_instances_builder({
			model			: ddo.model,
			tipo			: ddo.tipo,
			section_tipo	: ddo.section_tipo,
			section_id		: ddo.section_id,
			mode			: ddo.mode,
			lang			: ddo.lang,
			id_variant		: tool.model // the tool sets id_variant to its own model
		})
		const fake	= fake_component('lazy_media')
		registered_keys.push(key)
		add_instance(key, fake)

		const instance = await tool._ensure_lazy_instance('media_component')

		assert.equal(instance, fake, 'recovered under the documented option contract')
		assert.deepEqual(fake.build_calls, [true], 'a lazy child is built with autoload=true (nothing pre-loaded it)')
		assert.equal(fake.show_interface.tools, false, 'media_component gets its own toolbar suppressed')
		assert.equal(tool.media_component, fake, 'published on the tool under the role name')
		assert.equal(tool.ar_instances.length, 1, 'pushed into ar_instances so the rest of the tool sees it')
		assert.equal(tool.ar_instances[0], fake, 'and it is the same instance')

		// second call short-circuits on self[role]
		const again = await tool._ensure_lazy_instance('media_component')
		assert.equal(again, fake, 'idempotent')
		assert.equal(fake.build_calls.length, 1, 'never built twice')
		assert.equal(tool.ar_instances.length, 1, 'never pushed twice')
	})


	it('_ensure_lazy_instance links people_section to the indexing component', async function() {

		const ddo = {
			role			: 'people_section',
			model			: 'section_fake',
			mode			: 'list',
			tipo			: 'lazy_people',
			section_tipo	: 'st_lazy',
			section_id		: 6,
			lang			: 'lg-eng'
		}
		const indexing_component	= { id:'indexer' }
		const tool					= make_tool({ _lazy_ddos:{ people_section:ddo }, indexing_component:indexing_component })

		const key	= key_instances_builder({
			model:ddo.model, tipo:ddo.tipo, section_tipo:ddo.section_tipo,
			section_id:ddo.section_id, mode:ddo.mode, lang:ddo.lang, id_variant:tool.model
		})
		const fake	= fake_component('lazy_people')
		registered_keys.push(key)
		add_instance(key, fake)

		const instance = await tool._ensure_lazy_instance('people_section')

		assert.equal(instance, fake, 'built')
		assert.equal(fake.linker, indexing_component, 'people_section picks terms INTO the indexing component')
		assert.equal(fake.show_interface.tools, true, 'the media-only toolbar suppression is not applied here')
	})


	it('_ensure_lazy_instance resolves the lang: ddo.lang wins, else nolan when not translatable, else the data lang', async function() {

		const base = {
			model			: 'component_lang_fake',
			mode			: 'list',
			section_tipo	: 'st_lang',
			section_id		: 7
		}

		// 1) explicit ddo.lang wins even when translatable is false
			const ddo_explicit	= { ...base, tipo:'lang_a', lang:'lg-fra', translatable:false }
		// 2) translatable===false and no lang -> the no-lang value
			const ddo_nolan		= { ...base, tipo:'lang_b', translatable:false }
		// 3) anything else -> the active data lang
			const ddo_default	= { ...base, tipo:'lang_c' }

		const tool = make_tool({ _lazy_ddos:{
			media_component			: ddo_explicit,
			people_section			: ddo_nolan,
			references_component	: ddo_default
		} })

		const expected = [
			{ ddo:ddo_explicit,	role:'media_component',			lang:'lg-fra' },
			{ ddo:ddo_nolan,	role:'people_section',			lang:page_globals.dedalo_data_nolan },
			{ ddo:ddo_default,	role:'references_component',	lang:page_globals.dedalo_data_lang }
		]

		for (const item of expected) {
			const key = key_instances_builder({
				model:item.ddo.model, tipo:item.ddo.tipo, section_tipo:item.ddo.section_tipo,
				section_id:item.ddo.section_id, mode:item.ddo.mode, lang:item.lang, id_variant:tool.model
			})
			registered_keys.push(key)
			add_instance(key, fake_component(item.ddo.tipo))
		}

		for (const item of expected) {
			const instance = await tool._ensure_lazy_instance(item.role)
			assert.equal(instance.id, item.ddo.tipo, `role ${item.role} must resolve lang ${item.lang}`)
		}
	})


	// -------------------------------------------- load_related_sections_list

	it('load_related_sections_list asks for the parents of THIS transcript and returns the payload', async function() {

		const tool = make_tool({
			transcription_component : {
				model			: 'component_text_area',
				tipo			: 'rsc36',
				section_tipo	: 'rsc167',
				section_id		: 12,
				lang			: 'lg-spa'
			}
		})

		const payload = { context:[], data:[{ typo:'sections', value:[{ section_tipo:'oh1', section_id:3 }] }] }

		await with_stubbed_request({ ok:true, data:payload }, async (captured) => {

			const datum = await tool.load_related_sections_list()

			assert.equal(datum, payload, 'returns the envelope payload (response_data), not the envelope')
			assert.equal(captured.length, 1, 'exactly one request')

			const rqo = captured[0]
			assert.equal(rqo.action, 'read', 'a read RQO')
			// source — a REVERSE lookup on the transcription component, not a normal data read
			assert.equal(rqo.source.action, 'related_search', 'source.action related_search')
			assert.equal(rqo.source.mode, 'related_list', 'source.mode related_list')
			assert.equal(rqo.source.model, 'component_text_area', 'source carries the component identity')
			assert.equal(rqo.source.tipo, 'rsc36', 'source tipo')
			assert.equal(rqo.source.section_tipo, 'rsc167', 'source section_tipo')
			assert.equal(rqo.source.section_id, 12, 'source section_id')
			assert.equal(rqo.source.lang, 'lg-spa', 'source lang follows the component, not the tool')
			// sqo — every section type, constrained to the parents of this record
			assert.deepEqual(rqo.sqo.section_tipo, ['all'], 'search across all sections')
			assert.equal(rqo.sqo.mode, 'related', 'sqo.mode related')
			assert.equal(rqo.sqo.limit, 10, 'capped at 10 parents')
			assert.equal(rqo.sqo.offset, 0, 'no offset')
			assert.equal(rqo.sqo.full_count, false, 'no count needed for a selector')
			assert.deepEqual(rqo.sqo.filter_by_locators, [{ section_tipo:'rsc167', section_id:12 }], 'scoped to THIS record')
		})
	})


	it('load_related_sections_list returns undefined on a failed envelope (no payload to read)', async function() {

		const tool = make_tool({
			transcription_component : { model:'component_text_area', tipo:'rsc36', section_tipo:'rsc167', section_id:12, lang:'lg-spa' }
		})

		await with_stubbed_request(failed_envelope('boom'), async () => {
			const datum = await tool.load_related_sections_list()
			assert.equal(datum, undefined, 'a failure has no data — the caller must not read a payload out of it')
		})
	})


	// --------------------------------------------------------- delete_tag

	it('delete_tag aborts on either confirmation and touches nothing', async function() {

		const calls	= []
		const tool	= make_tool({
			transcription_component	: { delete_tag: async () => { calls.push('delete_tag'); return {ok:true} } },
			indexing_component		: { delete_locator: async () => { calls.push('delete_locator'); return {ok:true} }, refresh: () => calls.push('refresh') }
		})

		// first dialog declined
		await with_dialogs({ confirms:[false] }, async (asked) => {
			assert.equal(await tool.delete_tag('42'), false, 'declining the first confirm returns false')
			assert.equal(asked.length, 1, 'the second dialog is never shown')
			assert.ok(String(asked[0]).indexOf('42')!==-1, 'the dialog names the tag id being destroyed')
		})
		assert.deepEqual(calls, [], 'nothing was deleted')

		// second dialog declined
		await with_dialogs({ confirms:[true, false] }, async (asked) => {
			assert.equal(await tool.delete_tag('42'), false, 'declining the second confirm returns false')
			assert.equal(asked.length, 2, 'both dialogs were shown')
		})
		assert.deepEqual(calls, [], 'still nothing was deleted')
	})


	it('delete_tag deletes the span in every lang, then the index locator, then forces a re-fetch', async function() {

		const calls		= []
		const indexing	= {
			data	: { stale:true },
			datum	: { stale:true },
			delete_locator : async (locator, ar_properties) => {
				calls.push({ locator:locator, ar_properties:ar_properties })
				return { ok:true }
			},
			refresh : function(){ calls.push('refresh') }
		}
		const tool = make_tool({
			transcription_component : {
				delete_tag : async (tag_id, type) => { calls.push({ tag_id:tag_id, type:type }); return { ok:true } }
			},
			indexing_component : indexing
		})

		let response = null
		await with_dialogs({ confirms:[true, true] }, async () => {
			response = await tool.delete_tag('42')
		})

		assert.deepEqual(calls[0], { tag_id:'42', type:'index' }, 'step 1: the text_area removes the index-type tag in all langs')
		assert.deepEqual(calls[1].locator, { tag_id:'42', type:DD_TIPOS.DEDALO_RELATION_TYPE_INDEX_TIPO }, 'step 2: the locator is matched by tag_id + the index relation type')
		assert.deepEqual(calls[1].ar_properties, ['tag_id','type'], 'the composite key is declared to the portal')
		assert.equal(calls[2], 'refresh', 'the portal is refreshed last')
		assert.equal(indexing.data, null, 'data nulled BEFORE refresh or the portal serves its cached response')
		assert.equal(indexing.datum, null, 'datum nulled too')
		assert.ok(response && response.delete_tag && response.delete_locator, 'both responses are handed back to the caller')
	})


	it('delete_tag reports a failed locator delete and does NOT wipe the cache or refresh', async function() {

		const calls		= []
		const alerts	= []
		const indexing	= {
			data			: { stale:true },
			datum			: { stale:true },
			delete_locator	: async () => failed_envelope('locator gone'),
			refresh			: () => calls.push('refresh')
		}
		const tool = make_tool({
			transcription_component	: { delete_tag: async () => ({ ok:true }) },
			indexing_component		: indexing
		})

		await with_dialogs({ confirms:[true, true], on_alert:(msg) => alerts.push(msg) }, async () => {
			const response = await tool.delete_tag('42')
			assert.ok(response.delete_locator, 'the failed envelope is still returned for inspection')
		})

		assert.equal(alerts.length, 1, 'the editor is told')
		// the text is the tool label (literal fallback here) + error_text(); error_text
		// renders the CODE's label, not the raw message, so assert the surface, not the wording
		assert.ok(String(alerts[0]).indexOf('Error on delete locator')!==-1, 'the alert names the failed operation')
		assert.deepEqual(calls, [], 'no refresh on the failure branch')
		assert.deepEqual(indexing.data, { stale:true }, 'the cache is left alone when the delete did not happen')
	})


	it('delete_tag survives a THROWN text_area failure and still deletes the locator', async function() {

		const calls		= []
		const alerts	= []
		const tool		= make_tool({
			transcription_component	: { delete_tag: async () => { throw new Error('editor exploded') } },
			indexing_component		: {
				delete_locator	: async () => { calls.push('delete_locator'); return { ok:true } },
				refresh			: () => calls.push('refresh')
			}
		})

		let response = null
		await with_dialogs({ confirms:[true, true], on_alert:(msg) => alerts.push(msg) }, async () => {
			response = await tool.delete_tag('42')
		})

		// step 1 failed, but step 2 is documented to run anyway: the locator must not
		// outlive the tag it points at
		assert.deepEqual(calls, ['delete_locator','refresh'], 'step 2 still ran')
		assert.equal(response.delete_tag.ok, false, 'the throw became THE client error model (envelope v2)')
		assert.ok(response.delete_tag.error instanceof ApiError, 'an ApiError, not a raw Error')
		assert.equal(alerts.length, 1, 'and the editor was told about step 1')
	})


	// --------------------------------------------- render_indexation_note

	it('render_indexation_note renders the create-note button when the tag has no usable data', async function() {

		const tool = make_tool()

		for (const data of [null, undefined, '', '{}']) {
			const node = await tool.render_indexation_note({ tag_id:'1', data:data })
			assert.ok(node instanceof HTMLElement, `data ${JSON.stringify(data)} must yield the empty-note node`)
			assert.ok(node.classList.contains('empty_note'), 'it is the empty_note container')
			const button = node.querySelector('button')
			assert.ok(button, 'it offers the create button')
			assert.equal(button.textContent, 'Create tag info note', 'the literal fallback label is used when the tool has no label')
		}
	})


	it('render_indexation_note parses the single-quoted dataset locator and renders the note', async function() {

		const seen	= []
		const tool	= make_tool({ render_note: async (options) => { seen.push(options); return document.createElement('div') } })

		const node = await tool.render_indexation_note({
			tag_id	: '1',
			// stored single-quoted because it lives in an HTML dataset attribute
			data	: "{'section_tipo':'rsc377','section_id':42}"
		})

		assert.ok(node, 'a note node is returned')
		assert.equal(seen.length, 1, 'render_note is called once')
		assert.deepEqual(seen[0].locator, { section_tipo:'rsc377', section_id:42 }, 'the quotes are normalised before parsing')
	})


	it('render_indexation_note returns null for a locator it cannot use', async function() {

		let render_note_calls = 0
		const tool = make_tool({ render_note: async () => { render_note_calls++; return document.createElement('div') } })

		// long enough to pass the length guard, but not a usable locator
		const cases = [
			"{'section_tipo':'rsc377'}",           // no section_id
			"{'section_id':42,'other':'x'}",       // no section_tipo
			"{'section_tipo':'rsc377',,,}",        // unparseable — JSON_parse_safely yields the error string
			"not json at all"
		]

		for (const data of cases) {
			const node = await tool.render_indexation_note({ tag_id:'1', data:data })
			assert.equal(node, null, `unusable data must return null, not throw: ${data}`)
		}
		assert.equal(render_note_calls, 0, 'and the note is never rendered')
	})

})


// @license-end
