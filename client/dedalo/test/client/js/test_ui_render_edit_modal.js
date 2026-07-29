// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';



import {ui} from '../../../core/common/js/ui.js'
import {add_instance, delete_instance, key_instances_builder} from '../../../core/common/js/instances.js'
import {get_caller_by_model} from '../../../core/common/js/utils/index.js'



/**
* TEST_UI_RENDER_EDIT_MODAL
* The caller chain of the per-cell edit modal — the surface that makes component
* TOOLS reachable from a section LIST.
*
* Clicking a list cell opens ui.render_edit_modal, which builds a FRESH instance
* at mode 'edit'. Because that instance does a real read, the server stamps its
* full toolbar (the list-mode exclusion never applies to it). What was missing was
* the CHAIN: the modal instance was built with no caller, so any tool opened from
* its toolbar could not walk up to the owning section — which is why
* tool_propagate_component_data answered "Caller section is unavailable" instead
* of opening.
*
* The modal instance is made a SIBLING of the cell it edits (caller = the cell's
* own caller, the section_record), so the distance to the section matches edit
* mode exactly and tools that still walk a fixed depth keep working.
*
* No backend: a fake instance is pre-registered in the shared registry under the
* exact key render_edit_modal will request, so get_instance returns it from cache
* without a module import or an API call.
*/



// make_chain — a synthetic section ← section_record ← list-cell component
	const make_chain = () => {
		const section = {
			model			: 'section',
			tipo			: 'test3',
			section_tipo	: 'test3',
			section_id		: 1,
			mode			: 'list',
			id				: 'fake_section',
			rqo				: { sqo : { section_tipo:['test3'], limit:10, offset:0 } },
			get_total		: async function(){ return 7 }
		}
		const section_record = {
			model			: 'section_record',
			tipo			: 'test3',
			section_tipo	: 'test3',
			section_id		: 1,
			id				: 'fake_section_record',
			caller			: section
		}
		return {section, section_record}
	}

// make_list_cell — the component instance a list column renders
	const make_list_cell = (section_record) => ({
		model			: 'component_input_text',
		tipo			: 'test52',
		section_tipo	: 'test3',
		section_id		: 1,
		mode			: 'list',
		lang			: 'lg-eng',
		section_lang	: 'lg-eng',
		label			: 'Fake cell',
		id				: 'fake_list_cell',
		permissions		: 2,
		show_interface	: { read_only : false },
		caller			: section_record
	})

// register_fake_modal_instance — the instance render_edit_modal will find in cache
	const register_fake_modal_instance = (cell) => {
		const key = key_instances_builder({
			model			: cell.model,
			tipo			: cell.tipo,
			section_tipo	: cell.section_tipo,
			section_id		: cell.section_id,
			mode			: 'edit',
			lang			: cell.lang
		})
		const fake = {
			id		: key,
			model	: cell.model,
			tipo	: cell.tipo,
			mode	: 'edit',
			node	: document.createElement('div'),
			build	: async function(){ return true },
			render	: async function(){ return this.node }
		}
		add_instance(key, fake)
		return {key, fake}
	}



describe(`UI_RENDER_EDIT_MODAL`, async () => {

	// The core of the fix: the modal instance hangs off the section_record, so a
	// tool opened from its toolbar can reach the section.
	it(`the modal instance is a SIBLING of the cell (caller = the section_record)`, async function() {

		this.timeout(5000)

		const {section, section_record}	= make_chain()
		const cell						= make_list_cell(section_record)
		const {key, fake}				= register_fake_modal_instance(cell)

		const modal = await ui.render_edit_modal({ self : cell })

		assert.strictEqual(fake.caller, section_record,
			'the modal instance must hang off the cell\'s OWN caller, not off the cell')
		assert.strictEqual(get_caller_by_model(fake, 'section'), section,
			'the section must be reachable by model from the modal instance')

		// cleanup
			if (modal && typeof modal.remove==='function') modal.remove()
			delete_instance(key)
	})

	// THE REGRESSION THAT MATTERS. `caller` is not part of the instance key
	// (instances.js key_order) and the cache-hit path returns the stored instance
	// WITHOUT re-running init. So a modal re-opened after a re-search would keep
	// pointing at the caller captured on the first open — an instance the
	// re-search destroyed. Symptom: the tool works once, then silently stops
	// finding the section. Only a second open can catch it.
	it(`re-opening RE-BINDS the caller (the cache-hit path does not re-run init)`, async function() {

		this.timeout(5000)

		const first						= make_chain()
		const cell						= make_list_cell(first.section_record)
		const {key, fake}				= register_fake_modal_instance(cell)

		const modal_1 = await ui.render_edit_modal({ self : cell })
		assert.strictEqual(fake.caller, first.section_record)
		if (modal_1 && typeof modal_1.remove==='function') modal_1.remove()

		// A re-search rebuilds the row: a NEW section_record, and the old one is gone.
		const second	= make_chain()
		cell.caller		= second.section_record

		const modal_2 = await ui.render_edit_modal({ self : cell })

		assert.strictEqual(fake.caller, second.section_record,
			'a reused (cached) modal instance must be re-bound to the CURRENT caller')
		assert.strictEqual(get_caller_by_model(fake, 'section'), second.section,
			'and must therefore resolve the CURRENT section')

		// cleanup
			if (modal_2 && typeof modal_2.remove==='function') modal_2.remove()
			delete_instance(key)
	})

	// The sibling shape must not read as "inside a dataframe" — that would make
	// activate_edit_in_list refuse to open the modal at all.
	it(`the sibling shape is not mistaken for a dataframe`, async function() {

		this.timeout(5000)

		const {section_record}	= make_chain()
		const cell				= make_list_cell(section_record)
		const {key, fake}		= register_fake_modal_instance(cell)

		const modal = await ui.render_edit_modal({ self : cell })

		assert.strictEqual(ui.inside_dataframe(fake), false)

		// cleanup
			if (modal && typeof modal.remove==='function') modal.remove()
			delete_instance(key)
	})
})
