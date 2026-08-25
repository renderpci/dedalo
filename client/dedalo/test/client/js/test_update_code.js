// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals */
/*eslint no-undef: "error"*/

/**
* TEST_UPDATE_CODE
* First area_maintenance browser suite: the update_code widget panel and the
* shared server picker's cross-widget contract.
*
* The regression this suite exists for (2026-08-23): `render_servers_list` used
* to publish `ontology_server_select_change` on EVERY radio change. update_code
* reuses that picker on the same dashboard as update_ontology, so selecting a
* CODE server reset the ontology widget's reference row while its own radio
* stayed checked. The picker now publishes NOTHING itself — selection travels
* through the caller's `on_change` callback, which only update_ontology's own
* caller wires to the event.
*
* Backend-free: fake `value.servers` descriptors (a reachable server is
* `response_code:200` + a result whose `data` is truthy), test-only
* localStorage keys (cleaned up), no widget get_value round-trip.
*/

import {ui} from '../../../core/common/js/ui.js'
import {event_manager} from '../../../core/common/js/event_manager.js'
import {render_servers_list} from '../../../core/area_maintenance/widgets/update_ontology/js/render_update_ontology.js'
import {update_code} from '../../../core/area_maintenance/widgets/update_code/js/update_code.js'
import {render_info_modal, render_restore_modal} from '../../../core/area_maintenance/widgets/update_code/js/render_update_code.js'
import {render_consumer_status} from '../../../core/area_maintenance/widgets/update_code/js/render_update_status.js'
import {
	UPDATE_PHASES,
	init_phase_state,
	apply_phase_frame
} from '../../../core/area_maintenance/widgets/update_code/js/update_code_phases.js'



// DOM container
	const container = document.getElementById('content');

// fixtures
	const CODE_STORAGE_KEY		= 'dedalo.test.update_code.server'
	const ONTOLOGY_STORAGE_KEY	= 'dedalo.test.update_ontology.server'

	const build_server = (name, url) => {
		return {
			name			: name,
			url				: url,
			code			: 'test_code',
			response_code	: 200,
			result			: { data : true } // response_data(result) truthy → reachable
		}
	}



describe('UPDATE_CODE WIDGET', function() {

	this.timeout(10000);

	after(function() {
		// test-only storage keys never leak into the app's remembered choices
		try {
			localStorage.removeItem(CODE_STORAGE_KEY)
			localStorage.removeItem(ONTOLOGY_STORAGE_KEY)
		} catch (_error) { /* private mode */ }
	})


	describe('panel render', function() {

		it('renders the version readout and the server picker (no staging path, no beta toggle)', async function() {

			const self = new update_code()
			self.id				= 'test_update_code'
			self.value			= {
				servers				: [build_server('code server A', 'https://a.example.test/api')],
				is_a_code_server	: false
			}
			self.caller			= null
			self.events_tokens	= []

			const content_data = await self.list({ render_level : 'content' })
			container.appendChild(content_data)

			// version/build readout (shared widget kit)
			const readout = content_data.querySelector('.dd_readout')
			assert.ok(readout, 'the panel renders a dd_readout')
			assert.strictEqual(readout.querySelectorAll('.dd_row').length, 2, 'current version + current build rows')

			// the shared server picker markup
			assert.ok(content_data.querySelector('.server_picker'), 'the panel renders the shared server picker')
			assert.ok(content_data.querySelector('.server_picker input[type="radio"]'), 'the picker renders a radio row')

			// dead surfaces stay dead
			assert.strictEqual(content_data.querySelector('.beta_updates_container'), null, 'no beta toggle')
			assert.notInclude(content_data.textContent, 'dedalo_source_version_local_dir', 'no staging path line')

			content_data.remove()
		})
	})


	describe('server picker cross-widget contract', function() {

		it('selecting a CODE server publishes nothing and leaves a co-mounted ontology row alone', function() {

			let published = 0
			let last_payload
			const token = event_manager.subscribe('ontology_server_select_change', (payload) => {
				published++
				last_payload = payload
			})

			// the ontology widget's reference row stand-in: the subscriber the
			// bleed used to reset (set_server(null) on every foreign click)
			let reference_server = { name : 'kept' }
			const reference_token = event_manager.subscribe('ontology_server_select_change', () => {
				reference_server = null
			})

			try {
				// CODE picker: update_code passes NO on_change
				const code_servers = [build_server('code server', 'https://code.example.test/api')]
				const code_picker = render_servers_list({ servers : code_servers }, 'CODE_SERVERS', CODE_STORAGE_KEY)
				container.appendChild(code_picker)

				const code_radio = code_picker.querySelector('input[type="radio"]')
				code_radio.checked = true
				code_radio.dispatchEvent(new Event('change'))

				assert.strictEqual(published, 0, 'a CODE selection publishes no ontology event')
				assert.ok(reference_server, 'the ontology reference row is untouched by a CODE selection')
				assert.strictEqual(code_servers[0].active, true, 'the CODE picker still marks its own selection')

				// ontology-style picker: its caller's on_change publishes, as before
				const onto_servers = [build_server('master', 'https://master.example.test/api')]
				onto_servers[0].tld = ['test']
				const onto_picker = render_servers_list(
					{ servers : onto_servers },
					'ONTOLOGY_SERVERS',
					ONTOLOGY_STORAGE_KEY,
					(server) => {
						event_manager.publish('ontology_server_select_change', server ? (server.tld || null) : null)
					}
				)
				container.appendChild(onto_picker)

				const onto_radio = onto_picker.querySelector('input[type="radio"]')
				onto_radio.checked = true
				onto_radio.dispatchEvent(new Event('change'))

				assert.strictEqual(published, 1, 'an ONTOLOGY selection still publishes exactly once')
				assert.deepEqual(last_payload, ['test'], 'the payload is still the tld list')

				code_picker.remove()
				onto_picker.remove()
			} finally {
				event_manager.unsubscribe(token)
				event_manager.unsubscribe(reference_token)
			}
		})
	})



	describe('waive-backup control', function() {

		// The panel value the modal reads. `checks` is the server's readiness
		// vocabulary (core/update/status.ts): {id, state, detail}, where the
		// state is 'ok' exactly when the pipeline will not refuse on that account.
		const build_self = (backup_state, detail) => {
			const self = new update_code()
			self.id		= 'test_update_code_modal'
			self.value	= {
				servers				: [],
				is_a_code_server	: false,
				consumer			: {
					ready	: true,
					checks	: [
						{ id : 'superuser', state : 'ok' },
						{ id : 'backup_fresh', state : backup_state, detail : detail }
					]
				}
			}
			self.caller			= null
			self.events_tokens	= []
			return self
		}
		const versions_info = {
			info	: { version : '9.9.9', host : 'code.example.test', entity : 'Test' },
			files	: [{ version : '9.9.10', url : 'https://code.example.test/9.9.10.zip', date : '2026-08-25' }]
		}
		const open_modal = (self) => {
			const body_response = ui.create_dom_element({ element_type : 'div', parent : container })
			const modal = render_info_modal(self, versions_info, body_response)
			return { modal : modal, body_response : body_response }
		}
		const close = (opened) => {
			if (opened.modal && typeof opened.modal.close==='function') {
				opened.modal.close()
			}
			opened.body_response.remove()
		}

		it('a STALE backup offers the waiver, with the age fact and the caution', function() {

			const opened = open_modal(build_self('warn', '73'))
			try {
				// scoped to THIS modal: a previous test's node may still be closing
				const row = opened.modal.querySelector('.waive_backup_row')
				assert.ok(row, 'a stale backup renders the waive row')

				// the <label> WRAPS the input (no id/for pair to keep in sync)
				const input = row.querySelector('input[type="checkbox"].waive_backup_check')
				assert.ok(input, 'the row carries a checkbox')
				assert.strictEqual(input.parentElement.className, 'waive_backup_label', 'the label wraps the input')
				assert.strictEqual(input.checked, false, 'it is never pre-armed')

				// the server sends a FACT, the client the wording
				const note = row.querySelector('.waive_backup_note')
				assert.ok(note, 'the row carries its caution note')
				assert.include(note.textContent, '73', 'the measured age is stated')
				assert.include(note.className, 'state_warning', 'in the shared severity vocabulary')

				// it sits ABOVE the Update button: read before pressed
				const button = row.parentElement.querySelector('button.success')
				assert.ok(button, 'the modal renders the Update button')
				assert.strictEqual(
					row.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
					Node.DOCUMENT_POSITION_FOLLOWING,
					'the waive row precedes the Update button'
				)
			} finally {
				close(opened)
			}
		})

		it('NO backup at all still offers it (detail "none", no age to state)', function() {

			const opened = open_modal(build_self('warn', 'none'))
			try {
				const row = opened.modal.querySelector('.waive_backup_row')
				assert.ok(row, 'a missing backup renders the waive row too')
				// the raw server FACT ('none') is never shown; only a measured age is
				assert.notMatch(row.querySelector('.waive_backup_note').textContent, /\bnone\b|NaN/, 'the raw fact is never rendered')
			} finally {
				close(opened)
			}
		})

		it('a FRESH backup renders no waiver at all', function() {

			// Nothing to waive → no invitation to disarm a guard that is not in
			// the way. This is the assertion that makes the control honest.
			const opened = open_modal(build_self('ok', '2'))
			try {
				assert.strictEqual(opened.modal.querySelector('.waive_backup_row'), null, 'a fresh backup renders no waive row')
			} finally {
				close(opened)
			}
		})

		it('the ticked box is what the wire body carries', async function() {

			// The model layer is the wire: a checkbox the server never hears
			// about is decoration. Both states, through the real method.
			const self = build_self('warn', '73')
			const sent = []
			const original = window.fetch
			// update_code.prototype.update_code goes through data_manager; drive
			// the method directly and read the options bag it assembles by
			// intercepting at the transport.
			assert.strictEqual(typeof self.update_code, 'function', 'the model exposes update_code')
			window.fetch = async (url, options) => {
				sent.push(JSON.parse(options.body))
				return new Response(JSON.stringify({ ok : true, data : null }), { headers : { 'Content-Type' : 'application/json' } })
			}
			try {
				await self.update_code({ info : versions_info.info, file_active : versions_info.files[0], waive_backup : true })
				await self.update_code({ info : versions_info.info, file_active : versions_info.files[0] })
				assert.isAtLeast(sent.length, 2, 'both calls reached the transport')
				assert.strictEqual(sent[0].options.waive_backup, true, 'a ticked box travels as true')
				assert.strictEqual(sent[sent.length-1].options.waive_backup, false, 'an untouched box travels as false, never absent')
			} finally {
				window.fetch = original
			}
		})
	})


	describe('readiness headline vs the request the button sends', function() {

		// `ready` is `!checks.some(blocked)`, and the ONE waivable gate reports
		// `warn`. So a stale backup is `ready:true` while the DEFAULT request
		// (waive_backup:false) is still refused on exactly that account. A bare
		// "Ready to update" there over-reports as loudly as the "Update blocked"
		// it replaced — the headline has to name the waiver.
		const render = (consumer) => {
			const wrapper = ui.create_dom_element({ element_type : 'div', parent : container })
			render_consumer_status(wrapper, consumer)
			return wrapper
		}
		const consumer_with = (backup_state) => {
			return {
				ready	: true,
				engine	: {},
				tree	: {},
				checks	: [
					{ id : 'superuser', state : 'ok' },
					{ id : 'backup_fresh', state : backup_state, detail : backup_state==='ok' ? '2' : '73' }
				]
			}
		}

		it('a waivable warning is named in the headline, in the warning voice', function() {

			const wrapper = render(consumer_with('warn'))
			try {
				const headline = wrapper.querySelector('.status_verdict')
				assert.ok(headline, 'the consumer half renders a headline verdict')
				assert.include(headline.className, 'state_warning', 'neither green nor red')
				assert.notInclude(headline.className, 'state_ok', 'it must not read as plainly ready')
			} finally {
				wrapper.remove()
			}
		})

		it('with nothing waivable outstanding it is plainly ready', function() {

			const wrapper = render(consumer_with('ok'))
			try {
				const headline = wrapper.querySelector('.status_verdict')
				assert.include(headline.className, 'state_ok', 'a clean install still headlines ready')
				assert.notInclude(headline.className, 'state_warning')
			} finally {
				wrapper.remove()
			}
		})

		it('a blocked check still headlines blocked, waiver or not', function() {

			const blocked = consumer_with('warn')
			blocked.ready = false
			blocked.checks.push({ id : 'maintenance_mode', state : 'blocked' })
			const wrapper = render(blocked)
			try {
				const headline = wrapper.querySelector('.status_verdict')
				assert.include(headline.className, 'state_danger', 'a hard gate outranks the waiver wording')
			} finally {
				wrapper.remove()
			}
		})
	})

	describe('restore modal — the downgrade waiver', function() {

		// The DECISION the source-shape gate cannot see (test/unit/
		// client_update_code_render.test.ts says so): the submit unlocks only
		// when the checkbox is ticked, and the checkbox is asked for only when
		// the versions actually differ — measured against the SERVER's bare
		// version triple, never the page global's '.dev'-tagged string.
		const point_of = (version) => {
			return {
				name				: 'dedalo_' + version + '_abc1234_2026-08-25T10-00-00',
				stamp				: Date.now(),
				bootable			: true,
				version				: version,
				bun_pin				: null,
				digest				: 'a'.repeat(64),
				restorable			: true,
				restorable_reason	: null
			}
		}
		const open_restore = (point, running_version) => {
			const self = new update_code()
			self.id				= 'test_update_code_restore_modal'
			self.value			= {}
			self.caller			= null
			self.events_tokens	= []
			const body_response = ui.create_dom_element({ element_type : 'div', parent : container })
			return {
				modal			: render_restore_modal(self, point, body_response, running_version),
				body_response	: body_response
			}
		}
		const close = (opened) => {
			if (opened.modal && typeof opened.modal.close==='function') {
				opened.modal.close()
			}
			opened.body_response.remove()
		}

		it('the SAME version asks for no waiver and the submit is live', function() {

			// The developer-channel case: a branch build installed over its own
			// release. page_globals.dedalo_version reads '…​.dev' here and the
			// point declares the bare triple, so a page-global comparison would
			// draw a waiver for a version change that is not one.
			const running = String(page_globals.dedalo_version || '7.0.0').replace('.dev', '')
			const opened = open_restore(point_of(running), running)
			try {
				assert.strictEqual(opened.modal.querySelector('.confirm_downgrade_row'), null, 'no waiver where nothing changes')
				const button = opened.modal.querySelector('button.button_restore_submit')
				assert.ok(button, 'the modal renders the Restore button')
				assert.strictEqual(button.disabled, false, 'and it is not gated')
			} finally {
				close(opened)
			}
		})

		it('a DIFFERENT version locks the submit until the waiver is ticked', function() {

			const running = String(page_globals.dedalo_version || '7.0.0').replace('.dev', '')
			const opened = open_restore(point_of('6.9.9'), running)
			try {
				const row = opened.modal.querySelector('.confirm_downgrade_row')
				assert.ok(row, 'a version change renders the waiver row')
				// the <label> WRAPS the input (the house pattern), and names the target
				const input = row.querySelector('input[type="checkbox"].confirm_downgrade_check')
				assert.ok(input, 'the row carries a checkbox')
				assert.strictEqual(input.parentElement.className, 'confirm_downgrade_label', 'the label wraps the input')
				assert.strictEqual(input.checked, false, 'it is never pre-armed')
				assert.include(input.parentElement.textContent, '6.9.9', 'the waiver names the version it waives to')

				const button = opened.modal.querySelector('button.button_restore_submit')
				assert.strictEqual(button.disabled, true, 'the submit is locked while the waiver is not given')
				input.checked = true
				input.dispatchEvent(new Event('change'))
				assert.strictEqual(button.disabled, false, 'ticking it unlocks the submit')
				input.checked = false
				input.dispatchEvent(new Event('change'))
				assert.strictEqual(button.disabled, true, 'un-ticking it locks it again')
			} finally {
				close(opened)
			}
		})

		it('a point whose version cannot be read always asks for the waiver', function() {

			// version:null means the compare cannot be made; the hazard is then
			// assumed, never waived away by silence.
			const opened = open_restore(point_of(null), '7.0.0')
			try {
				assert.ok(opened.modal.querySelector('.confirm_downgrade_row'), 'an unreadable version still asks')
			} finally {
				close(opened)
			}
		})
	})


	describe('phase reducer (served module)', function() {

		it('a restart-phase interruption switches to health polling; a pre-swap one is indeterminate', function() {

			assert.strictEqual(UPDATE_PHASES[UPDATE_PHASES.length-1], 'health')

			let state = init_phase_state('9.9.9')
			state = apply_phase_frame(state, { phase : 'restart', phases : [{ id : 'swap', status : 'done' }, { id : 'restart', status : 'running' }] })
			state = apply_phase_frame(state, { interrupted : true })
			assert.strictEqual(state.mode, 'polling')

			// pre-swap the stream's death says nothing about the job: the server
			// side may still be running → 'interrupted', never 'failed'
			let dead = init_phase_state('9.9.9')
			dead = apply_phase_frame(dead, { phase : 'extract', phases : [{ id : 'extract', status : 'running' }] })
			dead = apply_phase_frame(dead, { interrupted : true })
			assert.strictEqual(dead.mode, 'interrupted')

			// only a frame that actually reports a failed phase says failed
			let failed = init_phase_state('9.9.9')
			failed = apply_phase_frame(failed, { phase : 'verify', phases : [{ id : 'verify', status : 'failed' }], message : 'checksum mismatch' })
			assert.strictEqual(failed.mode, 'failed')
		})
	})

	// keep the ui import honest (build_wrapper_edit path is exercised elsewhere)
	void ui
})



// @license-end
