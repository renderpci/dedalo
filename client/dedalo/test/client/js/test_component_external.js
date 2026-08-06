// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {get_instance} from '../../../core/common/js/instances.js'
import {event_manager} from '../../../core/common/js/event_manager.js'
import {is_empty} from '../../../core/component_common/js/component_common.js'
import {ui} from '../../../core/common/js/ui.js'
import {view_default_edit_component_external} from '../../../core/component_external/js/view_default_edit_component_external.js'
import {view_default_list_component_external} from '../../../core/component_external/js/view_default_list_component_external.js'
import {view_text_list_component_external} from '../../../core/component_external/js/view_text_list_component_external.js'
import {view_mini_list_external} from '../../../core/component_external/js/view_mini_list_external.js'
import {render_search_component_external} from '../../../core/component_external/js/render_search_component_external.js'



// element options for component_external
	const element = elements.find(el => el.model==='component_external')
	if (!element) {
		console.error('Error: component_external not found in elements');
	}

	const section_tipo	= element.section_tipo
	const section_id	= element.section_id
	const tipo			= element.tipo  // test215
	const lang			= element.lang



// DOM containers
const container = document.getElementById('content');

const component_container = ui.create_dom_element({
	element_type	: 'div',
	class_name		: 'component_container',
	parent			: container
})



// mode/view matrix for component_external
// edit: default, line, mini
// list: default, line, text
	const mode_view_pairs = [
		{ mode: 'edit',	view: 'default'	},
		{ mode: 'edit',	view: 'line'	},
		{ mode: 'edit',	view: 'mini'	},
		{ mode: 'list',	view: 'default'	},
		{ mode: 'list',	view: 'line'	},
		{ mode: 'list',	view: 'text'	}
	]



describe(`COMPONENT_EXTERNAL LIFECYCLE`, function() {

	this.timeout(15000);



	// LIFECYCLE TESTS: init, build, render, destroy across all mode/view pairs
	for (let i = 0; i < mode_view_pairs.length; i++) {

		const pair = mode_view_pairs[i]

		describe(`${pair.mode} / ${pair.view}`, function() {

			let instance = null
			let node	 = null

			it(`init → build → render`, async function() {

				const options = {
					model			: 'component_external',
					tipo			: tipo,
					section_tipo	: section_tipo,
					section_id		: section_id,
					lang			: lang,
					mode			: pair.mode,
					view			: pair.view,
					id_variant		: pair.mode + '_' + pair.view + '_' + Math.random()
				}

				// init
					instance = await get_instance(options)

					assert.equal(instance.model, 'component_external', 'model expected component_external')
					assert.equal(instance.tipo, tipo, `tipo expected ${tipo}`)
					assert.equal(instance.section_tipo, section_tipo, `section_tipo expected ${section_tipo}`)
					assert.equal(instance.section_id, section_id, `section_id expected ${section_id}`)
					assert.equal(instance.mode, pair.mode, `mode expected ${pair.mode}`)
					assert.equal(instance.lang, lang, `lang expected ${lang}`)

				// build
					await instance.build(true)
					assert.equal(instance.status, 'built', 'status expected built after build')
					assert.isOk(instance.datum, 'datum expected after build')
					assert.isOk(instance.context, 'context expected after build')

				// render
					node = await instance.render()
					assert.equal(instance.status, 'rendered', 'status expected rendered after render')
					assert.isOk(node instanceof Element, 'node expected DOM Element')
			});



			it(`render output structure for ${pair.mode}/${pair.view}`, async function() {

				component_container.appendChild(node)

				// mode-specific assertions
					if (pair.mode==='edit' && pair.view==='default') {
						// edit default: content_data exists
						assert.isOk(node.querySelector('.content_data'), 'expected content_data in edit/default')
					}

					if (pair.mode==='edit' && pair.view==='line') {
						// edit line: content_data exists, view_line class
						assert.isOk(node.querySelector('.content_data'), 'expected content_data in edit/line')
						assert.isOk(node.classList.contains('view_line'), 'expected view_line class')
					}

					if (pair.mode==='edit' && pair.view==='mini') {
						// edit mini: same as default (no special mini class)
						assert.isOk(node.querySelector('.content_data'), 'expected content_data in edit/mini')
					}

					if (pair.mode==='list' && pair.view==='default') {
						// list default: wrapper with list mode class
						assert.isOk(node.classList.contains('list'), 'expected list class in list/default')
					}

					if (pair.mode==='list' && pair.view==='line') {
						// list line: span element
						assert.equal(node.nodeName, 'SPAN', 'expected SPAN node in list/line')
					}

					if (pair.mode==='list' && pair.view==='text') {
						// list text: span element
						assert.equal(node.nodeName, 'SPAN', 'expected SPAN node in list/text')
					}
			});



			it(`destroy`, async function() {

				if (instance) {
					await instance.destroy(true)
				}

				assert.equal(instance.status, 'destroyed', 'status expected destroyed after destroy')
				assert.equal(instance.node, null, 'node expected null after destroy')
			});
		});
	}//end for (mode_view_pairs)
});



describe(`COMPONENT_EXTERNAL DATA OPERATIONS`, function() {

	this.timeout(15000);

	let instance	= null
	let node		= null



	it(`init → build → render (edit mode, permissions=2)`, async function() {

		const options = {
			model			: 'component_external',
			tipo			: tipo,
			section_tipo	: section_tipo,
			section_id		: section_id,
			lang			: lang,
			mode			: 'edit',
			view			: 'default',
			id_variant		: 'data_ops_' + Math.random()
		}

		instance = await get_instance(options)
		await instance.build(true)
		node = await instance.render()

		component_container.appendChild(node)

		assert.equal(instance.model, 'component_external', 'model expected component_external')
		assert.equal(instance.status, 'rendered', 'status expected rendered')
		assert.isOk(instance.datum, 'datum expected')
		assert.isOk(instance.context, 'context expected')
		assert.isOk(instance.data, 'data expected')
		// entries may be empty array or undefined if remote API is unavailable
		if (instance.data.entries) {
			assert.isOk(Array.isArray(instance.data.entries), 'data.entries expected array')
		}
	});



	it(`data structure`, async function() {

		const data		= instance.data || {}
		const entries	= data.entries || []

		// component_external entries are strings
		if (entries.length > 0) {
			assert.isOk(typeof entries[0] === 'string', 'entry expected string type')
		}
	});



	it(`is_empty returns boolean`, async function() {

		const result = is_empty(instance)

		assert.equal(typeof result, 'boolean', 'is_empty expected boolean')
	});



	it(`instance id is set`, async function() {

		assert.isOk(instance.id, 'instance.id expected to be set')
		assert.equal(typeof instance.id, 'string', 'instance.id expected string')
	});



	it(`refresh rebuilds component`, async function() {

		await instance.refresh()

		assert.equal(instance.status, 'rendered', 'status expected rendered after refresh')
		assert.isOk(instance.node instanceof Element, 'node expected DOM Element after refresh')
	});



	it(`destroy after data operations`, async function() {

		if (instance) {
			await instance.destroy(true)
		}

		assert.equal(instance.status, 'destroyed', 'status expected destroyed')
		assert.equal(instance.node, null, 'node expected null after destroy')

		// clean DOM
			while (component_container.firstChild) {
				component_container.removeChild(component_container.firstChild)
			}
	});
});



/**
* COMPONENT_EXTERNAL RENDER CONTRACT (2026-08-06, WC-2026-08-06-external-client-render)
*
* These drive the four view renderers DIRECTLY, over fabricated `self` objects,
* because the two rules under test are about values a live server cannot be
* asked to produce: a hostile string from a third-party service, and each
* degradation state in turn. Nothing here touches the network or the database.
*
* Rule 1 — an entry is TEXT. Until this change all four views injected remote
* strings as parsed HTML on a contract that said the server sanitised them; it
* did not, so it was live stored XSS against a curator's session. The one
* exception is an entry the server DECLARED `markup`, which it emits only for
* values its allowlist sanitizer produced.
*
* Rule 2 — a degraded source is VISIBLE. The server emits `entries: []` plus a
* `source_status`; a view that renders the empty array and drops the status
* makes "the source did not answer" look exactly like "this work has no author".
*/

// The payload a compromised (or merely sloppy) remote service can return.
	const HOSTILE = '<img src=x onerror="window.__external_xss=true">pwn'

// A fabricated component instance — the minimum every view reads.
	const fake_self = function(data, options={}) {
		return {
			model			: 'component_external',
			type			: 'component',
			tipo			: 'test215',
			section_tipo	: 'test3',
			section_id		: '001338683',
			mode			: options.mode || 'list',
			view			: options.view || 'default',
			permissions		: 1,
			context			: {
				view	: options.view || 'default',
				mode	: options.mode || 'list',
				css		: {}
			},
			data			: data,
			show_interface	: {}
		}
	}

// The four value views, by the name the dispatcher uses for each.
	const value_views = [
		// render_level 'content' returns the content_data subtree only: the outer
		// wrapper needs a full server context, and the rules under test live
		// entirely inside the content area.
		{ name: 'edit / default',	render: (self) => view_default_edit_component_external.render(self, {render_level:'content'}) },
		{ name: 'list / default',	render: (self) => view_default_list_component_external.render(self, {}) },
		{ name: 'list / text',		render: (self) => view_text_list_component_external.render(self, {}) },
		{ name: 'list / mini',		render: (self) => view_mini_list_external.render(self) }
	]



describe(`COMPONENT_EXTERNAL RENDER CONTRACT`, function() {

	this.timeout(15000);



	describe(`rule 1 — an entry is text, never parsed as HTML`, function() {

		for (let i = 0; i < value_views.length; i++) {

			const view = value_views[i]

			it(`${view.name} renders a hostile entry as characters`, async function() {

				window.__external_xss = false

				const self	= fake_self({ entries: [HOSTILE] }, { mode: 'list', view: 'default' })
				const node	= await view.render(self)

				// The string is PRESENT, as text…
				assert.isOk(
					node.textContent.indexOf(HOSTILE) !== -1,
					`${view.name}: the entry must render as its own characters`
				)
				// …and nothing was parsed out of it.
				assert.equal(node.querySelectorAll('img').length, 0, `${view.name}: no element parsed from the entry`)
				assert.equal(window.__external_xss, false, `${view.name}: the entry executed`)
			});


			it(`${view.name} renders a server-declared markup entry as markup`, async function() {

				// What the server's allowlist sanitizer produces: bare tags, no attributes.
				const self	= fake_self(
					{ entries: ['<em>Ostraka</em>'], entries_kind: ['markup'] },
					{ mode: 'list', view: 'default' }
				)
				const node	= await view.render(self)

				assert.equal(node.querySelectorAll('em').length, 1, `${view.name}: declared markup must be parsed`)
				assert.equal(node.textContent.indexOf('<em>'), -1, `${view.name}: markup must not double-escape`)
			});


			it(`${view.name} fails closed on a malformed entries_kind`, async function() {

				window.__external_xss = false

				// Not an array, wrong length, wrong token: every one of these must
				// mean 'text'. The failure mode of the other default is execution.
				const malformed = [
					{ entries: [HOSTILE], entries_kind: 'markup' },
					{ entries: [HOSTILE], entries_kind: [] },
					{ entries: [HOSTILE], entries_kind: ['MARKUP'] },
					{ entries: [HOSTILE], entries_kind: [true] }
				]

				for (let j = 0; j < malformed.length; j++) {
					const node = await view.render(fake_self(malformed[j]))
					assert.equal(node.querySelectorAll('img').length, 0, `${view.name}: parsed on malformed kind #${j}`)
				}

				assert.equal(window.__external_xss, false, `${view.name}: an entry executed`)
			});


			it(`${view.name} keeps entries separate — no cross-entry markup`, async function() {

				// Entries used to be joined into ONE string and parsed together, so
				// an unclosed tag in entry 0 swallowed entry 1.
				const self	= fake_self({ entries: ['<b>one', 'two'] })
				const node	= await view.render(self)

				assert.isOk(node.textContent.indexOf('<b>one') !== -1, `${view.name}: entry 0 verbatim`)
				assert.isOk(node.textContent.indexOf('two') !== -1, `${view.name}: entry 1 present`)
				assert.equal(node.querySelectorAll('b').length, 0, `${view.name}: nothing parsed`)
			});
		}
	});



	describe(`rule 2 — a degraded source is visible`, function() {

		// Every state the server can emit (src/core/components/component_external/
		// value.ts EXTERNAL_STATE_LABEL_KEY), minus 'ok', which never reaches the
		// wire on its own.
		const states = [
			'stale', 'unavailable', 'timeout', 'not_found',
			'circuit_open', 'disabled', 'misconfigured'
		]

		for (let i = 0; i < value_views.length; i++) {

			const view = value_views[i]

			it(`${view.name} marks every degraded state`, async function() {

				for (let j = 0; j < states.length; j++) {

					const state	= states[j]
					const self	= fake_self({
						entries			: [],
						source_status	: {
							service		: 'zenon',
							state		: state,
							label_key	: 'external_source_' + state,
							retryable	: false
						}
					})
					const node	= await view.render(self)
					const marker = node.querySelector('.external_source_status')

					assert.isOk(marker, `${view.name}: no marker for state '${state}' — an empty component with no marker is indistinguishable from a record with no value`)
					assert.isOk(marker.classList.contains('state_' + state), `${view.name}: marker missing state_${state} class`)
					assert.isOk(marker.textContent.length > 0, `${view.name}: marker for '${state}' has no text`)
				}
			});


			it(`${view.name} shows NO marker on a clean success`, async function() {

				// The happy path must stay clean: a marker on every component would
				// train the curator to ignore it.
				const node = await view.render(fake_self({ entries: ['Meyer, P.'] }))

				assert.isNotOk(node.querySelector('.external_source_status'), `${view.name}: unexpected marker`)
			});
		}


		it(`the search renderer survives a missing entries array`, async function() {

			// `data.entries[0]` was read unguarded: on a degraded component (the
			// server emits the status and no entries) it threw a TypeError that
			// took the whole search inspector's render down.
			const self = fake_self({
				q_operator		: null,
				source_status	: {
					service		: 'zenon',
					state		: 'unavailable',
					label_key	: 'external_source_unavailable',
					retryable	: true
				}
			}, { mode: 'search', view: 'default' })
			self.search = render_search_component_external.prototype.search

			const node = await self.search({ render_level: 'content' })

			assert.isOk(node instanceof Element, 'search content_data expected DOM Element')
			assert.isOk(node.querySelector('input.value'), 'search value input expected')
			assert.isOk(node.querySelector('.external_source_status'), 'search must show the degraded source too')
		});
	});
});



// @license-end
