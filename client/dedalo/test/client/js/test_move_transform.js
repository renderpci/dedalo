// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_MOVE_TRANSFORM
 * The run flow of the five move_* maintenance widgets
 * (core/area_maintenance/js/move_transform.js): PREVIEW first, then EXECUTE
 * exactly the previewed selection.
 *
 * MEASURED BUG this file pins (OPS-6/PERF-11 review follow-up, 2026-10-01):
 * every move_* widget sent `{background_running, files_selected}` and NO
 * `dry_run`. The server mutates only on `dry_run` EXACTLY false (WC-025), so the
 * panel could only ever preview — and, the preview answering inline, its
 * `update_process_status(response.pid, response.pfile)` got two undefineds and
 * rendered nothing. No control anywhere reached the execute.
 *
 * WHAT IS ASSERTED. The request body carries `dry_run` explicitly; the final
 * frame that clears a preview (dry_run_cleared — a failed run ends with a coded
 * `error`, ERRORS_SPEC §5.3); and the flow: submit → preview job; Execute hidden
 * until the preview ends clean; Execute refuses a selection that changed since
 * the preview, honours a declined confirm, and runs the SNAPSHOT with
 * dry_run:false — once (a new execute needs a new preview).
 *
 * BACKEND-FREE: init_move_transform_form takes its effects (exec, track,
 * confirm, alert) as injected deps; the caller's init_form is a fake that hands
 * back its on_submit.
 */

import {
	move_transform_request_body,
	dry_run_cleared,
	init_move_transform_form
} from '../../../core/area_maintenance/js/move_transform.js'
import {update_process_status} from '../../../core/common/js/common.js'



// harness — a fake widget + recorded effects
	const make_harness = (confirm_answer=true) => {
		const calls		= { exec: [], track: [], confirm: [], alert: [] }
		let form		= null
		const self		= {
			caller : {
				init_form : (widget_object) => { form = widget_object }
			}
		}
		const files_selected	= []
		const content_data		= document.createElement('div')
		const body_response		= document.createElement('div')
		const deps = {
			exec : (model, files, dry_run) => {
				calls.exec.push({ model, files: [...files], dry_run })
				return Promise.resolve({ ok: true, pid: 4242, pfile: `${model}_${calls.exec.length}.json`, dry_run })
			},
			track : (id, pid, pfile, container, on_done) => {
				calls.track.push({ id, pid, pfile, container, on_done })
			},
			confirm : (text) => { calls.confirm.push(text); return confirm_answer },
			alert : (text) => { calls.alert.push(text) }
		}
		const { execute_button } = init_move_transform_form(self, {
			model			: 'move_tld',
			submit_label	: 'Move TLD terms',
			files_selected	: files_selected,
			content_data	: content_data,
			body_response	: body_response,
			local_db_id		: 'process_move_tld'
		}, deps)

		return { calls, form: () => form, files_selected, execute_button, body_response }
	}

	const clean_preview_frame = {
		is_running : false,
		data : { ok: true, dry_run: true, msg: 'move_tld (no rollback for locator moves — dry run first)', errors: [], counts: {}, sample: [] },
		errors : []
	}



describe('MOVE_TRANSFORM (move_* preview → execute)', function() {

	describe('move_transform_request_body', function() {

		it('sends dry_run EXPLICITLY: true for a preview, false for an execute', function() {
			const preview = move_transform_request_body('move_tld', ['a.json'], true)
			const execute = move_transform_request_body('move_tld', ['a.json'], false)
			assert.strictEqual(preview.options.dry_run, true)
			assert.strictEqual(execute.options.dry_run, false)
			assert.strictEqual(Object.hasOwn(preview.options, 'dry_run'), true)
			assert.deepEqual(execute.source, { type: 'widget', model: 'move_tld', action: 'move_tld' })
			assert.strictEqual(execute.dd_api, 'dd_area_maintenance_api')
			assert.strictEqual(execute.action, 'widget_request')
			assert.deepEqual(execute.options.files_selected, ['a.json'])
		})

		it('anything but false is a preview (the server rule, mirrored)', function() {
			assert.strictEqual(move_transform_request_body('move_tld', ['a'], undefined).options.dry_run, true)
			assert.strictEqual(move_transform_request_body('move_tld', ['a'], 'false').options.dry_run, true)
		})

		it('copies the selection (a later checkbox change cannot alter a sent body)', function() {
			const files = ['a.json']
			const body = move_transform_request_body('move_tld', files, true)
			files.push('b.json')
			assert.deepEqual(body.options.files_selected, ['a.json'])
		})
	})

	describe('dry_run_cleared', function() {

		it('a preview that ended clean clears', function() {
			assert.strictEqual(dry_run_cleared(clean_preview_frame), true)
		})

		it('a failed run (coded error), a not-ok report, a still-running frame, an execute frame and no frame do not', function() {
			assert.strictEqual(dry_run_cleared({ ...clean_preview_frame, error: { code: 'maintenance.action_failed' } }), false)
			assert.strictEqual(dry_run_cleared({ ...clean_preview_frame, data: { ...clean_preview_frame.data, ok: false } }), false)
			assert.strictEqual(dry_run_cleared({ ...clean_preview_frame, is_running: true }), false)
			assert.strictEqual(dry_run_cleared({ ...clean_preview_frame, data: { ...clean_preview_frame.data, dry_run: false } }), false)
			assert.strictEqual(dry_run_cleared({ ...clean_preview_frame, data: { ...clean_preview_frame.data, result: true, ok: undefined } }), false)
			assert.strictEqual(dry_run_cleared(null), false)
		})
	})

	describe('update_process_status (the real tracker the flow uses)', function() {

		it('hands its on_done callback the LAST frame the stream carried', async function() {
			const frames = [
				{ is_running: true, data: { msg: 'running...' }, errors: [] },
				clean_preview_frame
			]
			const sse = new ReadableStream({
				start(controller) {
					const encoder = new TextEncoder()
					for (const frame of frames) {
						controller.enqueue(encoder.encode('data:\n' + JSON.stringify(frame) + '\n\n'))
					}
					controller.close()
				}
			})
			const original = window.fetch
			window.fetch = async () => new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })
			try {
				const container = document.createElement('div')
				const last = await new Promise((resolve, reject) => {
					const timer = setTimeout(() => reject(new Error('on_done never fired')), 5000)
					update_process_status('zz_test_move_transform', 4242, 'zz_test_move_transform.json', container, 1000, (frame) => {
						clearTimeout(timer)
						resolve(frame)
					})
				})
				assert.deepEqual(last, clean_preview_frame)
				assert.isTrue(dry_run_cleared(last))
			} finally {
				window.fetch = original
			}
		})
	})

	describe('init_move_transform_form', function() {

		it('the submit is a PREVIEW of the checked files; nothing is sent with none checked', async function() {
			const h = make_harness()
			assert.isFunction(h.form()?.on_submit)
			assert.include(h.form().submit_label, 'dry run')
			await h.form().on_submit()
			assert.strictEqual(h.calls.exec.length, 0)
			assert.strictEqual(h.calls.alert.length, 1)
			h.files_selected.push('a.json')
			await h.form().on_submit()
			assert.deepEqual(h.calls.exec, [{ model: 'move_tld', files: ['a.json'], dry_run: true }])
			// the job is streamed with the server's handle, into body_response
			assert.strictEqual(h.calls.track.length, 1)
			assert.strictEqual(h.calls.track[0].pid, 4242)
			assert.strictEqual(h.calls.track[0].pfile, 'move_tld_1.json')
			assert.strictEqual(h.calls.track[0].container, h.body_response)
		})

		it('Execute is hidden until the preview ends CLEAN; a failed preview never reveals it', async function() {
			const h = make_harness()
			assert.isTrue(h.execute_button.classList.contains('hide'))
			h.files_selected.push('a.json')
			await h.form().on_submit()
			h.calls.track[0].on_done({ ...clean_preview_frame, error: { code: 'maintenance.action_failed' } })
			assert.isTrue(h.execute_button.classList.contains('hide'))
			await h.form().on_submit()
			h.calls.track[1].on_done(clean_preview_frame)
			assert.isFalse(h.execute_button.classList.contains('hide'))
		})

		it('Execute runs the PREVIEWED snapshot with dry_run:false after a confirm — once', async function() {
			const h = make_harness(true)
			h.files_selected.push('b.json', 'a.json')
			await h.form().on_submit()
			h.calls.track[0].on_done(clean_preview_frame)
			h.execute_button.click()
			await Promise.resolve()
			assert.strictEqual(h.calls.confirm.length, 1)
			assert.deepEqual(h.calls.exec[1], { model: 'move_tld', files: ['b.json', 'a.json'], dry_run: false })
			// a new execute needs a new preview
			assert.isTrue(h.execute_button.classList.contains('hide'))
			h.execute_button.click()
			await Promise.resolve()
			assert.strictEqual(h.calls.exec.length, 2)
		})

		it('Execute REFUSES a selection changed since the preview, and honours a declined confirm', async function() {
			const h = make_harness(false)
			h.files_selected.push('a.json')
			await h.form().on_submit()
			h.calls.track[0].on_done(clean_preview_frame)
			h.files_selected.push('b.json')
			h.execute_button.click()
			await Promise.resolve()
			assert.strictEqual(h.calls.exec.length, 1)
			assert.strictEqual(h.calls.confirm.length, 0)
			assert.strictEqual(h.calls.alert.length, 1)
			// back to the previewed set (order-insensitive): asks, the operator declines
			h.files_selected.splice(1, 1)
			h.execute_button.click()
			await Promise.resolve()
			assert.strictEqual(h.calls.confirm.length, 1)
			assert.strictEqual(h.calls.exec.length, 1)
		})

		it('a new preview hides a previously revealed Execute until it clears', async function() {
			const h = make_harness()
			h.files_selected.push('a.json')
			await h.form().on_submit()
			h.calls.track[0].on_done(clean_preview_frame)
			assert.isFalse(h.execute_button.classList.contains('hide'))
			await h.form().on_submit()
			assert.isTrue(h.execute_button.classList.contains('hide'))
		})
	})
})



// @license-end
