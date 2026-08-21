// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

/**
* UNSAVED-WORK GUARD — COVERAGE GATE
*
* WHY THIS SUITE EXISTS. `window.unsaved_data` is the one flag between a
* half-typed record and a reloaded tab. Its REGISTRY is unit-tested
* (test/unit/client_unsaved_registry.test.ts); what broke in production was
* COVERAGE: components only reach that registry when their view COMMITS a
* value, and every view built on the native 'change' event
* (component_input_text, component_date, select, …) commits only on BLUR — a
* reload never blurs the focused field. So the component never registered, the
* flag stayed false, `beforeunload` returned early, and the typing was dropped
* with no prompt, no save and no log line. component_text_area was immune only
* because it debounces on keystrokes, which is why the bug read as "it works
* for text_area, it fails for input_text and others".
*
* The fix is a CENTRAL guard: one document-level, capture-phase 'input'
* listener (events.js → events_init) that arms the flag for any field inside an
* edit-mode component wrapper, before any commit. This suite pins the property
* that fix delivers, END TO END and PER MODEL:
*
*     typing into an edit-mode field of model X arms window.unsaved_data,
*     before any commit or blur.
*
* It is driven off `elements.js`, so a NEW component model inherits the gate
* with no edit here — which is the point: the defect was a model class nobody
* remembered to protect.
*
* WHAT THIS SUITE DOES NOT ASSERT. That Chrome actually paints the native
* "Leave site?" dialog: headless Chrome suppresses it and `returnValue`
* semantics belong to the browser. The wiring that reaches it (capture-phase
* listeners; `beforeunload` blurring the active element BEFORE reading the
* flag) is pinned by source-shape assertions in
* test/unit/client_unsaved_registry.test.ts. Nothing here fakes that last hop.
*/

import {elements} from './elements.js'
import {get_instance} from '../../../core/common/js/instances.js'
import {ui} from '../../../core/common/js/ui.js'
import {events_init, reset_unsaved_data} from '../../../core/common/js/events.js'



// events_init. The guard's listeners are attached here. The full application
// calls it from core/page/js/index.js, which the test runner page never boots,
// so the suite attaches them itself — testing the REAL wiring, not a copy.
	events_init()



// MODELS WITH NO TYPABLE EDIT FIELD.
// A model reaching the sweep with no typable field is RED unless it is named
// here with a reason (never silently narrowed). Shrink-only: a listed model
// that DOES render a typable field is red too, so the list cannot outlive the
// reason it names.
	const no_typable_field = {
		// (a) COMMIT-ON-CLICK controls. A checkbox/radio/select has no
		// intermediate uncommitted state: the click IS the commit, 'change'
		// fires with it, and the component registry owns the verdict from that
		// instant. There is nothing for a pre-commit guard to protect.
		component_check_box			: 'checkbox only — the click is the commit',
		component_filter			: 'checkbox only — the click is the commit',
		component_filter_master		: 'checkbox only — the click is the commit',
		component_publication		: 'checkbox only — the click is the commit',
		component_radio_button		: 'radio only — the click is the commit',
		component_image				: 'select only — the click is the commit',
		component_relation_model	: 'select only — the click is the commit',
		component_select			: 'select only — the click is the commit',
		component_select_lang		: 'select only — the click is the commit',
		component_security_access	: 'select + checkbox only — the click is the commit',

		// (b) NO FORM FIELD in edit/default. The value is set through a dialog,
		// a picker, an upload, a map or a tool window — never by typing into the
		// component itself.
		component_3d				: 'media component — value set by upload, no typable field',
		component_av				: 'media component — value set by upload, no typable field',
		component_external			: 'value set through the external-service dialog',
		component_info				: 'read-only computed display',
		component_inverse			: 'read-only inverse listing',
		component_iri				: 'value set through its own dialog/tool',
		component_json				: 'value rendered read-only; edited through a tool',
		component_portal			: 'record links only — its typable box is the NESTED search-mode autocomplete, which is not record data',
		component_relation_children	: 'record links only, no typable field',
		component_relation_index	: 'built from the text_area tags, no typable field',
		component_relation_parent	: 'record links only, no typable field',
		component_relation_related	: 'record links only, no typable field',
		component_section_id		: 'read-only record id',
		component_svg				: 'value set through the drawing tool',

		// (c) ASYNC EDITOR. component_text_area builds its editable surface only
		// after an 'editor_ready' event, so nothing typable exists at render
		// time and this synchronous sweep cannot reach it. It is ALSO the one
		// model the defect never touched: it debounces on keystrokes (500ms) and
		// registers itself without waiting for a blur — which is exactly why the
		// bug read as "text_area is fine, input_text is not". Its own gate is
		// test_component_text_area.
		component_text_area			: 'editable surface built asynchronously (editor_ready); keystroke-debounced, registers itself — see test_component_text_area'
	}

// TYPABLE. What a user can type into. Checkboxes/radios/buttons are excluded on
// purpose: they carry no uncommitted intermediate state — their 'change' fires
// with the click, so the component registry already owns them.
	const typable_selector = [
		'textarea',
		'[contenteditable="true"]',
		'input:not([type])',
		'input[type="text"]',
		'input[type="number"]',
		'input[type="email"]',
		'input[type="url"]',
		'input[type="password"]',
		'input[type="color"]',
		'input[type="date"]',
		'input[type="time"]',
		'input[type="datetime-local"]'
	].join(', ')

/**
* FIND_TYPABLE_FIELDS
* Fields a user can type into whose NEAREST component wrapper is this edit-mode
* wrapper. The nearest-wrapper rule is the guard's own scoping rule: a lookup /
* autocomplete box nested inside an edit component lives in its own search-mode
* wrapper and is NOT unsaved record data.
* @param {HTMLElement} wrapper
* @return {array} HTMLElement[]
*/
const find_typable_fields = function(wrapper) {

	const all = Array.from(wrapper.querySelectorAll(typable_selector))

	return all.filter(node =>
		node.disabled!==true &&
		node.readOnly!==true &&
		node.closest('.wrapper_component')===wrapper
	)
}//end find_typable_fields

/**
* TYPE_INTO
* Simulate the user typing one character: the value changes and the browser's
* own 'input' event fires. NO 'change', NO blur — exactly the state a reload
* catches, and exactly the state the old code lost.
* @param {HTMLElement} node
* @param {bool} [focus=true] false to type without moving focus — moving focus
*   fires a real 'focusout' on the PREVIOUS field, which is itself part of the
*   contract and would retire it.
* @return {void}
*/
const type_into = function(node, focus=true) {

	if (focus===true) {
		node.focus()
	}
	if (node.isContentEditable===true) {
		node.textContent = (node.textContent || '') + 'Z'
	}else{
		node.value = (node.value || '') + 'Z'
	}
	node.dispatchEvent(new Event('input', {bubbles:true}))
}//end type_into



describe('UNSAVED GUARD — scoping (synthetic DOM)', function() {

	this.timeout(10000)

	// Synthetic wrappers: the scoping rules are about CLASSES on the wrapper, so
	// they are asserted without building a component — deterministic, no backend.
	const make_field = function(wrapper_class, field_attrs={}) {
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: wrapper_class,
			parent			: document.getElementById('content')
		})
		const field = ui.create_dom_element({
			element_type	: 'input',
			parent			: wrapper
		})
		for (const key in field_attrs) {
			field[key] = field_attrs[key]
		}
		return {wrapper, field}
	}

	afterEach(function() {
		reset_unsaved_data()
	})

	it('typing into an edit-mode field arms the guard before any commit', function() {

		reset_unsaved_data()
		assert.strictEqual(window.unsaved_data, false, 'guard armed before the test typed anything')

		const {wrapper, field} = make_field('wrapper_component component_input_text edit')
		type_into(field)

		assert.strictEqual(window.unsaved_data, true,
			'typing did not arm the guard: a reload here loses the typed value silently')

		wrapper.remove()
	})

	it('committing one field cannot disarm another still being typed into', function() {

		reset_unsaved_data()
		const a = make_field('wrapper_component component_input_text edit')
		const b = make_field('wrapper_component component_number edit')
		// no focus moves: a real focus change fires focusout on the previous
		// field, and retiring it there is correct — what must NOT happen is b's
		// commit retiring a.
		type_into(a.field, false)
		type_into(b.field, false)

		// b commits and is back at its stored value: only b retires
		b.field.dispatchEvent(new Event('change', {bubbles:true}))
		b.field.dispatchEvent(new Event('focusout', {bubbles:true}))

		assert.strictEqual(window.unsaved_data, true,
			'one field committing disarmed the guard for another dirty field')

		a.wrapper.remove()
		b.wrapper.remove()
	})

	it('focusout retires the field — type-then-revert leaves no false prompt', function() {

		reset_unsaved_data()
		const {wrapper, field} = make_field('wrapper_component component_input_text edit')
		type_into(field)
		field.dispatchEvent(new Event('focusout', {bubbles:true}))

		assert.strictEqual(window.unsaved_data, false,
			'a field that lost focus still pins the guard: every navigation would prompt')

		wrapper.remove()
	})

	it('a re-rendered (detached) field cannot pin the guard forever', function() {

		reset_unsaved_data()
		const {wrapper, field} = make_field('wrapper_component component_input_text edit')
		type_into(field)
		assert.strictEqual(window.unsaved_data, true)

		// a save/refresh throws the old input away
		wrapper.remove()

		// any recompute must prune it
		reset_unsaved_data()
		const other = make_field('wrapper_component component_input_text edit')
		type_into(other.field)
		other.field.dispatchEvent(new Event('focusout', {bubbles:true}))

		assert.strictEqual(window.unsaved_data, false,
			'a detached field kept the guard armed: the prompt would never stop appearing')

		other.wrapper.remove()
	})

	it('list, search and non-component fields are NOT record data', function() {

		const cases = [
			['wrapper_component component_input_text list',	'list-mode cell'],
			['wrapper_component component_input_text search','search form field'],
			['some_tool_box',								'field outside any component']
		]
		for (let i = 0; i < cases.length; i++) {
			reset_unsaved_data()
			const {wrapper, field} = make_field(cases[i][0])
			type_into(field)
			assert.strictEqual(window.unsaved_data, false,
				`${cases[i][1]} armed the unsaved-record guard`)
			wrapper.remove()
		}
	})

	it('a read-only or disabled field never arms the guard', function() {

		reset_unsaved_data()
		const ro = make_field('wrapper_component component_input_text edit', {readOnly:true})
		type_into(ro.field)
		assert.strictEqual(window.unsaved_data, false, 'a read-only field armed the guard')
		ro.wrapper.remove()

		reset_unsaved_data()
		const dis = make_field('wrapper_component component_input_text edit', {disabled:true})
		type_into(dis.field)
		assert.strictEqual(window.unsaved_data, false, 'a disabled field armed the guard')
		dis.wrapper.remove()
	})

	it('a lookup box nested in an edit component is not unsaved record data', function() {

		reset_unsaved_data()
		const outer = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'wrapper_component component_portal edit',
			parent			: document.getElementById('content')
		})
		const inner = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'wrapper_component component_input_text search',
			parent			: outer
		})
		const field = ui.create_dom_element({
			element_type	: 'input',
			parent			: inner
		})
		type_into(field)

		assert.strictEqual(window.unsaved_data, false,
			'typing in a nested autocomplete armed the record guard: every lookup would prompt on reload')

		outer.remove()
	})
})



describe('UNSAVED GUARD — per-model coverage (real components, edit mode)', function() {

	this.timeout(30000)

	const container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'unsaved_guard_container',
		parent			: document.getElementById('content')
	})

	for (let i = 0; i < elements.length; i++) {

		const element = elements[i]
		const model = element.model

		it(`${model} — typing arms the unsaved guard`, async function() {

			const instance = await get_instance({
				model			: model,
				tipo			: element.tipo,
				section_tipo	: element.section_tipo,
				section_id		: element.section_id,
				lang			: element.lang,
				mode			: 'edit',
				view			: 'default',
				id_variant		: 'unsaved_guard_' + model
			})
			await instance.build(true)
			instance.permissions = 2
			const node = await instance.render()
			container.appendChild(node)

			// the guard's scope depends on these two classes being on the wrapper
			assert.isTrue(node.classList.contains('wrapper_component'),
				`${model} wrapper lost the 'wrapper_component' class — the unsaved guard cannot see its fields`)
			assert.isTrue(node.classList.contains('edit'),
				`${model} wrapper lost the 'edit' mode class — the unsaved guard cannot see its fields`)

			const fields = find_typable_fields(node)

			if (fields.length===0) {
				assert.property(no_typable_field, model,
					`${model} renders no typable field in edit mode and is not declared in no_typable_field — declare it with a reason or fix the render`)
				this.skip()
				return
			}

			assert.notProperty(no_typable_field, model,
				`${model} IS typable in edit mode but is declared in no_typable_field — the declaration outlived its reason`)

			reset_unsaved_data()
			assert.strictEqual(window.unsaved_data, false, 'guard armed before typing')

			type_into(fields[0])

			assert.strictEqual(window.unsaved_data, true,
				`typing into ${model} did not arm the unsaved guard: a page reload here drops the typed value with no prompt`)

			reset_unsaved_data()
		})
	}

	afterEach(function() {
		reset_unsaved_data()
		container.innerHTML = ''
	})
})

// @license-end
