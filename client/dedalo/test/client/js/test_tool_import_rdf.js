// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_IMPORT_RDF
 * Client-side coverage for the RDF import tool.
 *
 * The tool's deeper render/open path needs a host section with a configured
 * component_iri main_element, a live caller locator and a reachable linked-data
 * server, none of which is guaranteed in the headless harness. This
 * suite therefore asserts the reliable, fixture-free contract that every tool
 * shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring),
 * plus the result pane (`render_rdf_payload`), driven with payload literals.
 */

import {render_component_dato, render_rdf_payload} from '../../../tools/tool_import_rdf/js/render_tool_import_rdf.js'
import {tool_import_rdf} from '../../../tools/tool_import_rdf/js/tool_import_rdf.js'



describe('TOOL_IMPORT_RDF CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_import_rdf, 'function', 'expected tool_import_rdf to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_import_rdf()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common + tool-specific properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.ar_instances, null, 'expected ar_instances null')
		assert.equal(instance.events_tokens, null, 'expected events_tokens null')
		assert.equal(instance.caller, null, 'expected caller null')
		assert.equal(instance.tool_contanier, null, 'expected tool_contanier null')
		// files_data is seeded as an empty array (not null)
		assert.equal(Array.isArray(instance.files_data), true, 'expected files_data array')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_import_rdf.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_import_rdf.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_import_rdf.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_import_rdf
		assert.equal(typeof tool_import_rdf.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_import_rdf.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_import_rdf.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_import_rdf.prototype.get_rdf_data, 'function', 'expected get_rdf_data defined')
	})

	// The result pane, driven with the payload shapes get_rdf_data answers
	// (tools/tool_import_rdf/server/rdf_import_run.ts RdfImportResult).
	const robots_refusal = {
		uri		: 'https://ld.test/id/rome',
		error	: {
			code		: 'harvest.robots_disallowed',
			category	: 'permission',
			message		: "The site's robots.txt does not allow automated access to this address",
			label_key	: 'error_harvest_robots_disallowed',
			retryable	: false,
			details		: {site : 'https://ld.test'}
		}
	}

	it('a failed IRI is shown even when no IRI loaded (the form sends one)', function() {
		const wrapper = document.createElement('div')
		render_rdf_payload(wrapper, {rdf : [], errors : [robots_refusal]})
		const error_node = wrapper.querySelector('pre.error')
		assert.ok(error_node, 'expected the per-URI error line')
		assert.ok(error_node.textContent.startsWith('https://ld.test/id/rome: '), 'expected the IRI as the line prefix')
		assert.ok(error_node.textContent.length > 'https://ld.test/id/rome: '.length, 'expected a message after the prefix')
		assert.notOk(wrapper.textContent.includes('Empty results'), 'a failure is not an empty result')
	})

	it('loaded subjects and failures render together (the dump is collapsed)', function() {
		const wrapper = document.createElement('div')
		render_rdf_payload(wrapper, {
			rdf		: [{uri : 'https://ld.test/id/athens', subjects : [{about : 'https://ld.test/id/athens'}]}],
			errors	: [robots_refusal]
		})
		assert.equal(wrapper.querySelector('h4').textContent, 'https://ld.test/id/athens')
		const dump = wrapper.querySelector('details.rdf_dump')
		assert.ok(dump, 'expected the collapsible subject dump')
		assert.notOk(dump.open, 'the dump starts collapsed')
		assert.ok(dump.querySelector('pre.rdf_subjects').textContent.includes('athens'))
		assert.ok(wrapper.querySelector('pre.error'), 'expected the failure line too')
	})

	// The import report (tools/tool_import_rdf/server/rdf_import_run.ts RdfImportResult).
	const import_payload = {
		report : [{
			uri		: 'https://ld.test/id/coin1',
			created	: [{section_tipo : 'test3', section_id : 7, label : 'https://ld.test/id/mint', section_label : 'Mint'}],
			written	: [
				{section_tipo : 'test3', section_id : 1, component_tipo : 'test52', lang : 'lg-eng', value_summary : 'Quinarius', component_label : 'Title'},
				{section_tipo : 'test3', section_id : 1, component_tipo : 'test140', lang : 'lg-nolan', value_summary : '<img src=x onerror=alert(1)>', component_label : null}
			],
			skipped	: [
				{component_tipo : 'test80', reason : 'not fetched — run again', component_label : 'Mint', iri : 'https://ld.test/id/emerita'},
				{component_tipo : '', reason : 'blank_node (nmo:hasX)', component_label : null}
			]
		}],
		rdf				: [{uri : 'https://ld.test/id/coin1', subjects : []}],
		errors			: [],
		bulk_process_id	: 42
	}

	it('the import report lists what was created, written and skipped, per IRI', function() {
		const wrapper = document.createElement('div')
		render_rdf_payload(wrapper, import_payload)
		const blocks = wrapper.querySelectorAll('.rdf_report')
		assert.equal(blocks.length, 1, 'one block per IRI (report and dump share it)')
		assert.equal(blocks[0].querySelector('h4').textContent, 'https://ld.test/id/coin1')
		const created = [...wrapper.querySelectorAll('ul.created li')].map(el => el.textContent)
		assert.deepEqual(created, ['Mint 7 — https://ld.test/id/mint'])
		const written = [...wrapper.querySelectorAll('ul.written li')].map(el => el.textContent)
		assert.equal(written[0], 'Title [lg-eng]: Quinarius (test3 1)', 'the component name and its language')
		assert.ok(written[1].startsWith('test140: '), 'no label: the tipo, and no language for lg-nolan')
		const skipped = [...wrapper.querySelectorAll('ul.skipped li')].map(el => el.textContent)
		assert.deepEqual(skipped, [
			'Mint: not fetched — run again — https://ld.test/id/emerita',
			'blank_node (nmo:hasX)'
		])
		assert.ok(wrapper.querySelector('.rdf_list_title.written').textContent.includes('(2)'), 'the count is in the title')
		assert.ok(wrapper.querySelector('.rdf_bulk_process').textContent.endsWith(': 42'), 'the revert handle is shown')
	})

	it('report values are text, never markup', function() {
		const wrapper = document.createElement('div')
		render_rdf_payload(wrapper, import_payload)
		assert.equal(wrapper.querySelectorAll('img').length, 0, 'a remote value is never parsed as HTML')
		assert.ok(wrapper.textContent.includes('<img src=x onerror=alert(1)>'))
	})

	it('a PARTIALLY applied IRI: written, created and a refused op together — the refusal is a skip, never an IRI failure', function() {
		const wrapper = document.createElement('div')
		render_rdf_payload(wrapper, {
			report	: [{
				uri		: 'https://ld.test/id/coin3',
				created	: [{section_tipo : 'test3', section_id : 9, label : 'https://ld.test/id/mint3', section_label : 'Mint'}],
				written	: [{section_tipo : 'test3', section_id : 1, component_tipo : 'test52', lang : 'lg-eng', value_summary : 'Quinarius', component_label : 'Title'}],
				skipped	: [
					{component_tipo : 'test91', reason : 'ontology zzrdfwire5 maps test3, but test91 targets dd64 — fix the ontology node', code : 'relation.insert_refused', component_label : 'Select'},
					{component_tipo : 'test52', reason : 'not empty in lg-spa — never overwritten', component_label : 'Title'}
				]
			}],
			rdf				: [],
			errors			: [],
			bulk_process_id	: 43
		})
		assert.equal(wrapper.querySelectorAll('ul.created li').length, 1, 'the created record')
		assert.equal(wrapper.querySelectorAll('ul.written li').length, 1, 'the written value')
		const skipped = [...wrapper.querySelectorAll('ul.skipped li')]
		assert.deepEqual(skipped.map(el => el.textContent), [
			'Select: ontology zzrdfwire5 maps test3, but test91 targets dd64 — fix the ontology node',
			'Title: not empty in lg-spa — never overwritten'
		])
		assert.ok(skipped[0].classList.contains('refused'), 'a refused op is marked as such')
		assert.notOk(skipped[1].classList.contains('refused'), 'a fact (never overwritten) is not a refusal')
		assert.equal(wrapper.querySelectorAll('pre.error').length, 0, 'a per-op refusal is not an IRI failure')
		assert.notOk(wrapper.querySelector('.rdf_nothing'), 'the IRI changed things')
	})

	it('an IRI that changed nothing says so, and a rolled-back IRI shows its error', function() {
		const wrapper = document.createElement('div')
		render_rdf_payload(wrapper, {
			report	: [{uri : 'https://ld.test/id/coin2', created : [], written : [], skipped : []}],
			errors	: [{uri : 'https://ld.test/id/coin2', error : {code : 'record.save_failed', message : 'The record could not be saved'}}]
		})
		assert.ok(wrapper.querySelector('.rdf_nothing'), 'expected the no-changes line')
		assert.equal(wrapper.querySelectorAll('ul.rdf_list').length, 0, 'no empty lists')
		assert.ok(wrapper.querySelector('pre.error').textContent.startsWith('https://ld.test/id/coin2: '))
	})

	it('the IRI picker lists the component_iri ENTRIES (the v7 data envelope)', function() {
		const self = {main_element : {data : {entries : [
			{id : 1, iri : 'https://ld.test/id/rome', lang : 'lg-nolan'},
			{id : 2, iri : '<img src=x onerror=alert(1)>', lang : 'lg-nolan'},
			{id : 3, iri : null, lang : 'lg-nolan'}
		]}}}
		const container = render_component_dato(self)
		const radios = container.querySelectorAll('input.component_data')
		assert.equal(radios.length, 2, 'one radio per non-empty IRI')
		assert.equal(radios[0].value, 'https://ld.test/id/rome')
		assert.equal(container.querySelectorAll('img').length, 0, 'an IRI is text, never parsed as HTML')
		assert.equal(container.querySelectorAll('label.error').length, 1, 'the empty IRI is flagged')
	})

	it('a single IRI is pre-checked', function() {
		const self = {main_element : {data : {entries : [{id : 1, iri : 'https://ld.test/id/rome'}]}}}
		const container = render_component_dato(self)
		assert.ok(container.querySelector('input.component_data').checked)
	})

	it('nothing loaded and nothing failed is an empty result', function() {
		const wrapper = document.createElement('div')
		wrapper.textContent = 'previous'
		render_rdf_payload(wrapper, {})
		assert.equal(wrapper.textContent, 'Empty results')
	})

})

// @license-end
