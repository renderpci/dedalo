// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

import {
	section_tipo,
	section_id,
	lang
} from './elements.js'
import {get_instance, get_instance_by_id} from '../../../core/common/js/instances.js'
import {service_autocomplete} from '../../../core/services/service_autocomplete/js/service_autocomplete.js'
import {
	render_datalist,
	execute_search_render
} from '../../../core/services/service_autocomplete/js/view_default_autocomplete.js'



describe("SERVICE_AUTOCOMPLETE", function() {

	this.timeout(30000)



	// ───────────────────────────────────────────────────────────
	// HIGH-SEVERITY #1 — instance registry leak on re-render
	// render_datalist must destroy the previous batch of section_record
	// instances (unique timestamp id_variant ⇒ never reused) instead of
	// dropping them, which would leave them forever in the global registry.
	// ───────────────────────────────────────────────────────────

	describe("render_datalist cleans up the previous instance batch", function() {

		it("destroys prior ar_instances and removes them from the registry", async function() {

			// create two real instances registered in the global instances_map
			const make = async (suffix) => get_instance({
				model			: 'component_input_text',
				tipo			: 'test52',
				section_tipo	: section_tipo,
				section_id		: section_id,
				mode			: 'list',
				lang			: lang,
				id_variant		: 'sa_leak_' + suffix
			})
			const i1 = await make('a')
			const i2 = await make('b')
			const id1 = i1.id
			const id2 = i2.id

			// sanity: both are in the registry
			assert.notEqual(get_instance_by_id(id1), null, 'precondition: i1 registered')
			assert.notEqual(get_instance_by_id(id2), null, 'precondition: i2 registered')

			// minimal service-like object holding the previous batch
			const self = {
				datalist		: document.createElement('ul'),
				ar_instances	: [i1, i2]
			}

			try {
				// empty result ⇒ render returns early, but the previous batch must
				// still be destroyed before the early-return
				await render_datalist(self, { data: [] })

				assert.equal(self.ar_instances.length, 0, 'ar_instances must be emptied')
				assert.equal(get_instance_by_id(id1), null, 'prior instance i1 must be removed from registry')
				assert.equal(get_instance_by_id(id2), null, 'prior instance i2 must be removed from registry')
			} finally {
				// safety net: if the fix is not in place, destroy survivors so the
				// registry is not polluted for other suites
				if (get_instance_by_id(id1)) { await i1.destroy(true, true, true) }
				if (get_instance_by_id(id2)) { await i2.destroy(true, true, true) }
			}
		})
	})//end describe render_datalist cleanup



	// ───────────────────────────────────────────────────────────
	// HIGH-SEVERITY #2 — Zenon query string not URL-encoded
	// zenon_engine must percent-encode the user query (lookfor) so special
	// characters (&, =, %, spaces) cannot corrupt the request.
	// ───────────────────────────────────────────────────────────

	describe("zenon_engine percent-encodes the search query", function() {

		it("encodes the lookfor value in the request URL", async function() {

			const dirty_q = 'Smith & Co = 100%'

			const self = new service_autocomplete()
			self.operator				= '$and'
			self.request_config_object	= {
				api_config : { api_url_search : 'https://zenon.example/api/v1/search' }
			}
			self.rqo_search = {
				show : {
					ddo_map : [
						{ section_tipo: 'zenon1', tipo: 'zt1', fields_map: [{ remote: 'title' }] }
					]
				},
				sqo_options : {
					filter_free : { $and: [ { q: dirty_q } ] }
				}
			}

			// stub XMLHttpRequest to capture the URL without hitting the network
			const real_xhr = window.XMLHttpRequest
			let captured_url = null
			window.XMLHttpRequest = function() {
				this.open	= function(method, url) { captured_url = url }
				this.send	= function() { /* never completes; we only inspect the URL */ }
			}

			try {
				// do NOT await: the returned promise never resolves (send is stubbed).
				// The URL is built synchronously inside the executor.
				self.zenon_engine()
				await Promise.resolve()
			} finally {
				window.XMLHttpRequest = real_xhr
			}

			assert.notEqual(captured_url, null, 'XHR url must be captured')
			assert.ok(
				captured_url.includes(encodeURIComponent(dirty_q)),
				'lookfor must be percent-encoded; got: ' + captured_url
			)
			assert.ok(
				captured_url.indexOf('lookfor=' + dirty_q) === -1,
				'raw unencoded query must not appear in the URL; got: ' + captured_url
			)
		})
	})//end describe zenon_engine encoding



	// ───────────────────────────────────────────────────────────
	// HIGH-SEVERITY #3 — a failed search leaves the widget stuck on "Searching.."
	// execute_search_render must clear the loading UI and never raise an
	// unhandled rejection when the underlying search throws.
	// ───────────────────────────────────────────────────────────

	describe("execute_search_render survives a rejected search", function() {

		it("clears the loading UI and does not throw when the search rejects", async function() {

			const datalist = document.createElement('ul')
			const loading_label = document.createElement('div')
			loading_label.className = 'loading_label'
			datalist.appendChild(loading_label)

			const search_input = document.createElement('input')
			search_input.classList.add('searching')

			const spinner = document.createElement('div')
			spinner.className = 'spinner'

			const self = {
				_search_seq	: 7,
				search_cache: {},
				datalist	: datalist,
				autocomplete_search : async function() {
					throw new Error('simulated network failure')
				}
			}

			let threw = false
			try {
				await execute_search_render(self, {
					q				: 'abc',
					my_seq			: 7,
					loading_label	: loading_label,
					spinner			: spinner,
					search_input	: search_input
				})
			} catch (e) {
				threw = true
			}

			assert.equal(threw, false, 'execute_search_render must not throw on a failed search')
			assert.equal(loading_label.parentNode, null, 'loading_label must be removed (no stuck "Searching..")')
			assert.equal(search_input.classList.contains('searching'), false, 'searching class must be cleared')
		})
	})//end describe execute_search_render rejection

})//end describe SERVICE_AUTOCOMPLETE



// @license-end
