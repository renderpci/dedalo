// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_IMPORT_RDF
 * Client-side coverage for the RDF import tool.
 *
 * The tool's deeper render/open path needs a host section with a configured
 * component_iri main_element plus a live caller locator and the server-side
 * EasyRdf dependency, none of which is guaranteed in the headless harness. This
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
	// (tools/tool_import_rdf/server/index.ts loadRdfBatch).
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

	it('loaded subjects and failures render together', function() {
		const wrapper = document.createElement('div')
		render_rdf_payload(wrapper, {
			rdf		: [{uri : 'https://ld.test/id/athens', subjects : [{about : 'https://ld.test/id/athens'}]}],
			errors	: [robots_refusal]
		})
		assert.equal(wrapper.querySelector('h4').textContent, 'https://ld.test/id/athens')
		assert.ok(wrapper.querySelector('pre.rdf_subjects').textContent.includes('athens'))
		assert.ok(wrapper.querySelector('pre.error'), 'expected the failure line too')
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
