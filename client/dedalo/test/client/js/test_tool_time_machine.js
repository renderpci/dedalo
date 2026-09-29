// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, afterEach, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_TOOL_TIME_MACHINE
 * Client-side coverage for the Time Machine tool.
 *
 * The tool's deeper render/open path needs a host section with a configured
 * caller component plus a live dd15 section list + API dispatch, none of
 * which is guaranteed in the headless harness. This suite therefore asserts the
 * reliable, fixture-free contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {add_instance, delete_instance, get_instance_by_id, key_instances_builder} from '../../../core/common/js/instances.js'
import {printf} from '../../../core/common/js/utils/util.js'
import {load_component} from '../../../core/tools_common/js/tool_common.js'
import {bulk_revert_summary_message} from '../../../tools/tool_time_machine/js/render_tool_time_machine.js'
import {tool_time_machine} from '../../../tools/tool_time_machine/js/tool_time_machine.js'



describe('TOOL_TIME_MACHINE CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_time_machine, 'function', 'expected tool_time_machine to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_time_machine()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common + tool-specific properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.caller, null, 'expected caller null')
		assert.equal(instance.tm_list, null, 'expected tm_list null')
		assert.equal(instance.button_apply, null, 'expected button_apply null')
		assert.equal(instance.selected_matrix_id, null, 'expected selected_matrix_id null')
		assert.equal(instance.modal_container, null, 'expected modal_container null')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_time_machine.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_time_machine.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_time_machine.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_time_machine
		assert.equal(typeof tool_time_machine.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_time_machine.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_time_machine.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_time_machine.prototype.get_component, 'function', 'expected get_component defined')
		assert.equal(typeof tool_time_machine.prototype.apply_value, 'function', 'expected apply_value defined')
		assert.equal(typeof tool_time_machine.prototype.bulk_revert_process, 'function', 'expected bulk_revert_process defined')
		assert.equal(typeof tool_time_machine.prototype.get_bulk_process_label, 'function', 'expected get_bulk_process_label defined')
		assert.equal(typeof tool_time_machine.prototype.history_lang, 'function', 'expected history_lang defined')
	})

	// THE LANE LAW is the server's (dd15 context tm_main, decision 2026-09-29):
	// a relation flagged translatable has ONE lane, lg-nolan — no language
	// selector, and the restore confirm names lg-nolan (replaced whole).
	describe('history_lang', function() {

		const with_state = function(main_element, tm_main) {
			const instance = new tool_time_machine()
			instance.main_element	= main_element
			instance.tm_list		= tm_main===undefined ? null : {context : {tipo : 'dd15', tm_main}}
			return instance
		}

		it('an unsliced main (server: lang_sliced false) reads lg-nolan whatever its context lang', function() {
			const instance = with_state({tipo : 'test80', lang : 'lg-spa'}, {tipo : 'test80', lang_sliced : false})
			assert.equal(instance.history_lang(), 'lg-nolan')
		})

		it('a lang-sliced main keeps its own lang', function() {
			const instance = with_state({tipo : 'test52', lang : 'lg-spa'}, {tipo : 'test52', lang_sliced : true})
			assert.equal(instance.history_lang(), 'lg-spa')
		})

		it('no server statement (or one about another tipo) keeps the context lang', function() {
			assert.equal(with_state({tipo : 'test52', lang : 'lg-eng'}).history_lang(), 'lg-eng')
			const other = with_state({tipo : 'test52', lang : 'lg-eng'}, {tipo : 'test80', lang_sliced : false})
			assert.equal(other.history_lang(), 'lg-eng')
		})
	})

	// PREVIEW SWITCHING (get_component). Each TM row's preview is its own
	// instance (keyed by matrix_id). Switching rows must destroy the superseded
	// preview DEEP (its section_records / dataframes hold that row's data and
	// would otherwise stay registered), and must never destroy the instance of
	// the row being (re)built — a same-row re-click is served from the cache.
	// Backend-free: the previews are fakes pre-registered under the exact key
	// load_component asks for, so no module import and no API call happen.
	describe('get_component preview switching', function() {

		const MAIN = {
			tipo			: 'test_tm_main',
			section_tipo	: 'test3',
			section_id		: 1,
			context			: {
				model			: 'component_portal',
				tipo			: 'test_tm_main',
				section_tipo	: 'test3',
				lang			: 'lg-nolan',
				type			: 'component'
			}
		}
		const ROW_A = 51581270 // a row WITH frame 585
		const ROW_B = 51581272 // a row with NO frame

		const registered = []

		const preview_key = (matrix_id) => key_instances_builder({
			model			: MAIN.context.model,
			tipo			: MAIN.tipo,
			section_tipo	: MAIN.section_tipo,
			section_id		: MAIN.section_id,
			mode			: 'edit',
			lang			: 'lg-nolan',
			matrix_id		: matrix_id,
			id_variant		: 'tool_time_machine'
		})

		// fake preview: the row's frames in data, build/destroy spies. destroy
		// deregisters like the real one (common do_delete_self)
		const register_preview = (matrix_id, frames) => {
			const key = preview_key(matrix_id)
			const preview = {
				id				: key,
				tipo			: MAIN.tipo,
				matrix_id		: matrix_id,
				data			: { entries:frames },
				status			: 'initialized',
				build_calls		: 0,
				destroy_calls	: [],
				build			: async function(){ this.build_calls++; this.status = 'built'; return true },
				destroy			: async function(...args){ this.destroy_calls.push(args); this.status = 'destroyed'; delete_instance(this.id); return {} }
			}
			registered.push(key)
			add_instance(key, preview)
			return preview
		}

		const make_tool = () => {
			const tool = new tool_time_machine()
			tool.model			= 'tool_time_machine'
			tool.ar_instances	= []
			tool.main_element	= MAIN
			return tool
		}

		afterEach(function(){
			for (const key of registered) {
				delete_instance(key)
			}
			registered.length = 0
		})

		it('A -> B -> A: each row gets its own preview, the superseded one is destroyed deep', async function() {

			const tool = make_tool()

			// A (frame)
				const a1 = register_preview(ROW_A, [{ section_tipo:'test_tm_frame', section_id:585 }])
				const got_a1 = await tool.get_component('lg-nolan', 'edit', ROW_A)
				assert.strictEqual(got_a1, a1, 'row A preview')
				assert.equal(a1.build_calls, 1, 'A built')
				assert.deepEqual(tool.ar_instances, [a1], 'A is the only preview')

			// B (no frame)
				const b = register_preview(ROW_B, [])
				const got_b = await tool.get_component('lg-nolan', 'edit', ROW_B)
				assert.strictEqual(got_b, b, 'row B preview, not A reused')
				assert.deepEqual(got_b.data.entries, [], 'B shows no frame')
				assert.deepEqual(a1.destroy_calls, [[true, true, false]], 'A destroyed DEEP (delete_self, delete_dependencies, keep DOM)')
				assert.notOk(get_instance_by_id(a1.id), 'A deregistered')
				assert.deepEqual(tool.ar_instances, [b], 'only B remains')

			// A again (frame): a FRESH instance, never the stale destroyed one
				const a2 = register_preview(ROW_A, [{ section_tipo:'test_tm_frame', section_id:585 }])
				const got_a2 = await tool.get_component('lg-nolan', 'edit', ROW_A)
				assert.strictEqual(got_a2, a2, 'row A preview rebuilt fresh')
				assert.notStrictEqual(got_a2, a1, 'the destroyed A is not reused')
				assert.equal(got_a2.data.entries[0].section_id, 585, 'A shows its frame again')
				assert.deepEqual(b.destroy_calls, [[true, true, false]], 'B destroyed deep')
				assert.deepEqual(tool.ar_instances, [a2], 'only the new A remains')
		})

		it('a same-row re-click rebuilds the cached preview and never destroys it', async function() {

			const tool = make_tool()

			const a = register_preview(ROW_A, [{ section_tipo:'test_tm_frame', section_id:585 }])
			await tool.get_component('lg-nolan', 'edit', ROW_A)
			const again = await tool.get_component('lg-nolan', 'edit', ROW_A)

			assert.strictEqual(again, a, 'the same row is served from the cache')
			assert.deepEqual(a.destroy_calls, [], 'the instance being (re)built must NOT be destroyed')
			assert.notEqual(a.status, 'destroyed', 'still alive')
			assert.strictEqual(get_instance_by_id(a.id), a, 'still registered')
			assert.equal(a.build_calls, 2, 'rebuilt on the re-click')
			assert.deepEqual(tool.ar_instances, [a], 'present once')
		})

		it('load_component keeps its shared SHALLOW destroy by default (other tools)', async function() {

			const tool	= make_tool()
			const old	= register_preview(ROW_B, [])
			tool.ar_instances.push(old)
			register_preview(ROW_A, [])

			await load_component(Object.assign({}, MAIN.context, {
				self				: tool,
				mode				: 'edit',
				section_id			: MAIN.section_id,
				matrix_id			: ROW_A,
				data_source			: 'tm',
				to_delete_instances	: [old]
			}))

			assert.deepEqual(old.destroy_calls, [[true, false, false]], 'default: delete_self only, no dependencies')
		})
	})


	// A bulk revert that SKIPS or INFERS items still answers ok; the success
	// branch must surface the summary (WC-2026-09-27-bulk-revert-undo-log §2.7)
	// instead of silently closing the window.
	describe('bulk_revert_summary_message', function() {

		it('returns null when there is no payload', function() {
			assert.equal(bulk_revert_summary_message(undefined), null)
			assert.equal(bulk_revert_summary_message(null), null)
			assert.equal(bulk_revert_summary_message('x'), null)
		})

		it('an exact, clean revert names the counts and the new bulk id only', function() {
			const msg = bulk_revert_summary_message({
				counter: 3, unchanged: 1, bulk_process_id: 77, exact: 'full', skipped: [], inexact: []
			})
			assert.equal(
				msg,
				'Bulk revert finished. Reverted: 3. Already at their pre-run value: 1. This revert is recorded as bulk process 77, so it can itself be reverted.'
			)
		})

		it('counts skipped items per reason and inexact items per basis', function() {
			const msg = bulk_revert_summary_message({
				counter: 1,
				unchanged: 0,
				bulk_process_id: 9,
				exact: 'partial',
				skipped: [
					{reason: 'changed_since_run', section_tipo: 'test3', tipo: 'test52', section_id: 1},
					{reason: 'changed_since_run', section_tipo: 'test3', tipo: 'test52', section_id: 2},
					{reason: 'out_of_scope'},
					{reason: 'created_record_kept', section_tipo: 'test3', section_id: 5}
				],
				inexact: [
					{basis: 'legacy_inference', section_tipo: 'test3', tipo: 'test52', section_id: 3},
					{basis: 'cascade_undelete', section_tipo: 'test3', section_id: 4}
				]
			})
			const lines = msg.split('\n')
			assert.include(lines, 'This revert is NOT exact: check the items listed below.')
			assert.include(lines, '4 item(s) were NOT reverted and were left unchanged (details in the server log):')
			assert.include(lines, '- changed_since_run: 2')
			assert.include(lines, '- out_of_scope: 1')
			assert.include(lines, '- created_record_kept: 1')
			assert.include(lines, '2 item(s) were restored by inference or with side effects; check them:')
			assert.include(lines, '- legacy_inference: 1')
			assert.include(lines, '- cascade_undelete: 1')
			// the skipped block precedes the inexact block
			assert.isBelow(lines.indexOf('- out_of_scope: 1'), lines.indexOf('- legacy_inference: 1'))
		})

		it('a missing exact flag is never reported as exact', function() {
			const msg = bulk_revert_summary_message({counter: 0, unchanged: 0, bulk_process_id: 1})
			assert.include(msg, 'This revert is NOT exact')
		})

		it('uses the translated tool labels with positional tokens when present', function() {
			const catalog = {
				bulk_revert_summary			: 'Revertidos: {0}. Sin cambios: {1}. Proceso {2}.',
				bulk_revert_not_exact		: 'NO exacta.',
				bulk_revert_skipped_heading	: '{0} NO revertidos:',
				bulk_revert_inexact_heading	: '{0} inexactos:'
			}
			const get_label = (name, ...args) => catalog[name] ? printf(catalog[name], ...args) : null
			const msg = bulk_revert_summary_message({
				counter: 2, unchanged: 5, bulk_process_id: 40, exact: 'none',
				skipped: [{reason: 'interleaved_write'}],
				inexact: [{basis: 'legacy_born_in_run'}]
			}, get_label)
			assert.equal(
				msg,
				'Revertidos: 2. Sin cambios: 5. Proceso 40.\n\nNO exacta.\n\n1 NO revertidos:\n- interleaved_write: 1\n\n1 inexactos:\n- legacy_born_in_run: 1'
			)
		})
	})

})

// @license-end
