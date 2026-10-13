// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_TOOL_PDF_EXTRACTOR
 * Client-side coverage for the PDF content extractor tool.
 *
 * The tool's deeper render/open path needs a host component_pdf caller, a target
 * text-area component and the XPDF-backed server action (get_pdf_data), none of
 * which is guaranteed in the headless harness. This suite therefore asserts the
 * reliable, fixture-free contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 *
 * LAYER 2 — THE PREVIEW RENDERS BY THE SERVER'S RENDER CLASS (CLIENT-2,
 * 2026-10-11). `get_pdf_data` answers `{value, render_class}`: the text method
 * is the PDF's characters verbatim (render_class 'text' — `CAES<A>R` is an
 * epigraphic edition, not a tag), the html method is shaped and sanitized on the
 * server (render_class 'html'). The preview goes through the ONE render-boundary
 * escaper (render_value), so an absent or unknown class ESCAPES. It used to be
 * `preview.innerHTML = <payload>` whatever the method, after a client-side
 * DOMParser round trip, and it broadcast the payload on `set_pdf_data_<id_base>`
 * to a subscriber that does not exist. Driven for real: the rendered panel, a
 * real mouseup on the submit button, the transport stubbed on the shared
 * data_manager singleton (the options it captures are part of the contract).
 */

import {data_manager} from '../../../core/common/js/data_manager.js'
import {event_manager} from '../../../core/common/js/event_manager.js'
import {tool_pdf_extractor} from '../../../tools/tool_pdf_extractor/js/tool_pdf_extractor.js'



describe('TOOL_PDF_EXTRACTOR CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_pdf_extractor, 'function', 'expected tool_pdf_extractor to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_pdf_extractor()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common + tool-specific properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.ar_instances, null, 'expected ar_instances null')
		assert.equal(instance.status, null, 'expected status null')
		assert.equal(instance.events_tokens, null, 'expected events_tokens null')
		assert.equal(instance.type, null, 'expected type null')
		assert.equal(instance.caller, null, 'expected caller null')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_pdf_extractor.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_pdf_extractor.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_pdf_extractor.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_pdf_extractor
		assert.equal(typeof tool_pdf_extractor.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_pdf_extractor.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_pdf_extractor.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_pdf_extractor.prototype.get_pdf_data, 'function', 'expected get_pdf_data defined')
	})

})



describe('TOOL_PDF_EXTRACTOR PREVIEW — rendered by the server\'s render_class', function() {

	this.timeout(15000)

	const HOSTILE_TEXT = 'IMP CAES<A>R <img src=x onerror="window.__pdfx=1">'

	/**
	* RUN_EXTRACTION
	* Renders the real panel for a fake component_pdf caller, answers the
	* extraction with `payload`, clicks the submit button and waits for the
	* preview. Returns what the preview shows and what the transport was sent.
	*/
	const run_extraction = async (payload, {method=null, caller_data=undefined}={}) => {

		const caller = {
			model			: 'component_pdf',
			tipo			: 'test85',
			section_tipo	: 'test3',
			section_id		: 1,
			lang			: page_globals?.dedalo_data_nolan ?? 'lg-nolan',
			tools			: []
		}
		const id_base = caller.section_tipo + '_' + caller.section_id + '_' + caller.tipo

		const instance = new tool_pdf_extractor()
		if (caller_data!==undefined) {
			// THE REAL init(): the offset comes from what the caller component_pdf
			// stores, read exactly as the tool reads it on a page
			caller.data = caller_data
			await instance.init({
				model			: 'tool_pdf_extractor',
				mode			: 'edit',
				caller			: caller,
				section_tipo	: caller.section_tipo,
				section_id		: caller.section_id,
				lang			: caller.lang
			})
		}else{
			instance.model	= 'tool_pdf_extractor'
			instance.type	= 'tool'
			instance.mode	= 'edit'
			instance.caller	= caller
			instance.config	= {method:'text', page_in:false, page_out:false, offset:1}
		}
		instance.id				= 'tool_pdf_extractor_preview_' + Date.now()
		instance.get_tool_label	= (key) => key

		const captured		= []
		const published		= []
		const original		= data_manager.request
		const token			= event_manager.subscribe('set_pdf_data_' + id_base, (value) => published.push(value))
		window.__pdfx = undefined

		data_manager.request = async function(options) {
			if (options?.body?.source?.action==='get_pdf_data' || options?.body?.options?.method!==undefined) {
				captured.push(options.body)
				return payload
			}
			return original.call(this, options)
		}

		const host = document.createElement('div')
		document.body.appendChild(host)
		try {
			const content_data = await instance.edit({render_level:'content'})
			host.appendChild(content_data)

			if (method) {
				const radio = content_data.querySelector(`input[type="radio"][value="${method}"]`)
				radio.checked = true
				radio.dispatchEvent(new Event('change', {bubbles:true}))
			}

			const preview	= content_data.querySelector('.preview')
			const submit	= content_data.querySelector('.button_submit')
			submit.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}))

			const started = Date.now()
			while (preview.classList.contains('hide')) {
				if (Date.now() - started > 8000) throw new Error('the preview never showed')
				await new Promise(resolve => setTimeout(resolve, 25))
			}
			// let any img the preview created try to load / fire
			await new Promise(resolve => setTimeout(resolve, 150))

			return {
				img			: preview.querySelector('img'),
				bold		: preview.querySelector('b'),
				html		: preview.innerHTML,
				text		: preview.textContent,
				pdfx		: window.__pdfx,
				captured,
				published
			}
		} finally {
			data_manager.request = original
			event_manager.unsubscribe(token)
			host.remove()
			window.__pdfx = undefined
		}
	}

	it('(a) text: the PDF\'s characters are shown VERBATIM, never parsed as markup', async function() {
		const out = await run_extraction({ok:true, data:{value:HOSTILE_TEXT, render_class:'text'}})
		assert.isNull(out.img, 'no <img> element is created from the extracted text')
		assert.strictEqual(out.pdfx, undefined, 'nothing in the extracted text executed')
		assert.strictEqual(out.text, HOSTILE_TEXT, 'CAES<A>R and the rest arrive character for character')
	})

	it('the request carries method and offset', async function() {
		const out = await run_extraction({ok:true, data:{value:'x', render_class:'text'}})
		assert.strictEqual(out.captured.length, 1, 'one extraction request')
		const options = out.captured[0].options
		assert.strictEqual(options.method, 'text')
		assert.strictEqual(options.offset, 1, 'the page offset travels to the server, which shapes the page tags')
	})

	it('init() reads the offset the component_pdf stores (data.entries[0].lib_data) and the request carries it', async function() {
		const out = await run_extraction(
			{ok:true, data:{value:'x', render_class:'text'}},
			{caller_data:{entries:[{id:1, lib_data:{offset:5}}]}}
		)
		assert.strictEqual(out.captured.length, 1, 'one extraction request')
		assert.strictEqual(out.captured[0].options.offset, 5, 'the editor\'s stored offset keys the page tags')
	})

	it('init() with no stored offset sends 1 (no shift), not a v6 data.value[0].offset', async function() {
		const out = await run_extraction(
			{ok:true, data:{value:'x', render_class:'text'}},
			{caller_data:{entries:[{id:1}], value:[{offset:5}]}}
		)
		assert.strictEqual(out.captured[0].options.offset, 1, 'the v6 shape is not read; unset means 1')
	})

	it('(b) html positive control: the server-shaped markup renders as markup', async function() {
		const value	= '<p>[page-n-1-1-data:[1]:data]</p><b>x</b>'
		const out	= await run_extraction({ok:true, data:{value, render_class:'html'}}, {method:'html'})
		assert.strictEqual(out.captured[0]?.options?.method, 'html', 'the html radio sets the method')
		assert.isNotNull(out.bold, 'the sanitized html renders its formatting')
		assert.include(out.text, '[page-n-1-1-data:[1]:data]', 'the page tag paragraph is present')
	})

	it('(c) a payload with NO render_class is escaped (fail closed)', async function() {
		const value	= '<b>x</b>' + HOSTILE_TEXT
		const out	= await run_extraction({ok:true, data:{value}})
		assert.isNull(out.img, 'no element is created from an unclassified payload')
		assert.isNull(out.bold)
		assert.strictEqual(out.text, value)
	})

	it('(c2) a bare-string payload (the pre-2026-10-11 wire) never becomes markup', async function() {
		const out = await run_extraction({ok:true, data:HOSTILE_TEXT})
		assert.isNull(out.img, 'a payload without {value, render_class} is not rendered as html')
		assert.strictEqual(out.pdfx, undefined)
	})

	it('(d) nothing is broadcast on set_pdf_data_<id_base> (no subscriber exists)', async function() {
		const out = await run_extraction({ok:true, data:{value:'x', render_class:'text'}})
		assert.strictEqual(out.published.length, 0, 'the dead set_pdf_data_ publish is gone')
	})
})

// @license-end
