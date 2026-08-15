// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, get_label */
/*eslint no-undef: "error"*/
'use strict';



/**
* TEST_THESAURUS_PANE
* The gate for THE picker SURFACE: the thesaurus mounted INLINE inside the caller
* component's own wrapper (`component_portal.toggle_thesaurus_pane` +
* `build_thesaurus_pane`).
*
* WHY A SEPARATE FILE. `test_thesaurus_picker.js` deliberately imports no
* component_portal — that isolation is one of its assertions, and it is what lets a
* second host (edit-in-list) reuse the picker. This file is the opposite side: it
* imports the portal precisely to exercise the surface, so the two never blur.
*
* WHAT IT PINS, and each is a defect that actually shipped:
*
*  - THE LIVENESS RULE. The pane's area is registered in `self.ar_instances`, so the
*    component's own `refresh()` — which EVERY successful pick triggers —
*    destroys it through do_delete_dependencies while the pane DOM survives. A
*    "built once" boolean then reported a tree that no longer existed and the pane
*    was dead for the rest of the wrapper's life. Reuse must therefore be decided by
*    asking the INSTANCE whether it is alive, never by a flag.
*  - THE FAILED BUILD STAYS VISIBLE. The server distinguishes "not authorized"
*    (403, generic by design) from "no active hierarchy is configured for this
*    target" (409, named). Hiding the pane when the build fails throws that reason
*    away and leaves the button looking inert.
*  - THE NAMED REFUSAL for a component that has no pane at all: only the tree view
*    builds one, and six shipped nodes declare `button_tree` without it.
*
* THERE IS A BACKEND. The client runner logs in, so `build_thesaurus_pane` really
* instantiates an area against the server. That is what makes the liveness rule
* testable for real: a rebuild is observed as a NEW instance appearing, not as an
* error path. The failure branch is exercised separately, with a caller address the
* server cannot resolve.
*/

// imports
	import {component_portal} from '../../../core/component_portal/js/component_portal.js'



// ─────────────────────────────────────────────────────────────────────────────
// fixtures
// ─────────────────────────────────────────────────────────────────────────────

// make_portal — a portal instance reduced to what the pane surface reads. Built on
// the REAL prototype (never a hand-written stand-in) so gutting either method fails
// this file instead of a mock agreeing with itself.
	const make_portal = (options={}) => {

		const self = Object.create(component_portal.prototype)

		self.id				= options.id || 'test_pane_portal'
		self.tipo			= 'test111'
		self.section_tipo	= 'test3'
		self.section_id		= options.section_id===undefined ? 1 : options.section_id
		self.lang			= 'lg-spa'
		self.ar_instances	= []
		self.data			= { entries: [] }
		self.context		= { properties: {} }
		self.picker			= null
		self.thesaurus_area	= options.thesaurus_area ?? null

		// the wrapper the tree view builds
		self.node = document.createElement('div')
		if (options.with_pane!==false) {
			const pane = document.createElement('div')
			pane.classList.add('thesaurus_pane','hide')
			if (options.pane_child===true) {
				pane.appendChild(document.createElement('span'))
			}
			self.node.appendChild(pane)
		}

		return self
	}

	const pane_of = (portal) => portal.node.querySelector('.thesaurus_pane')



describe('THESAURUS PANE (the inline picker surface)', function() {

	// ─────────────────────────────────────────────────────────────────────────
	describe('a component with no pane refuses, by name', function() {

		it('toggle on a non-tree view returns false and builds nothing', async function() {
			const portal = make_portal({ with_pane:false })

			const result = await portal.toggle_thesaurus_pane()

			assert.equal(result, false)
			assert.equal(portal.node.querySelector('.thesaurus_pane'), null)
			assert.equal(portal.ar_instances.length, 0, 'nothing may be instantiated')
		})
	})


	// ─────────────────────────────────────────────────────────────────────────
	describe('a failed build stays OPEN and states the reason', function() {

		it('the pane is not hidden, and carries an error node', async function() {
			// FAULT INJECTED AT THE MOUNT. The build's failure modes (a 403 the
			// principal cannot pass, a 409 target with no active hierarchy) need
			// server state this suite must not manufacture, so the throw is induced at
			// the seam the catch exists to protect — the mount into the pane. What is
			// asserted is the CATCH's contract, which is the part that regressed:
			// stay open, and say why.
			const portal = make_portal({ id:'pane_failed_build' })
			const pane = pane_of(portal)
			pane.appendChild = () => { throw new Error('injected mount failure') }

			const result = await portal.toggle_thesaurus_pane()

			assert.equal(result, false, 'the build did not succeed')
			assert.equal(pane.classList.contains('hide'), false,
				'a failed build must leave the pane visible so its reason can be read')
			assert.notEqual(pane.querySelector('.thesaurus_pane_error'), null,
				'the refusal is told to the operator, not only to the console')
		})

		it('a component naming no record declares no picker and still explains itself', async function() {
			// picker_caller refuses without {section_tipo, section_id, tipo}; the
			// surface must not silently do nothing.
			const portal = make_portal({ id:'pane_no_record', section_id:null })
			const pane = pane_of(portal)

			const result = await portal.toggle_thesaurus_pane()

			assert.equal(result, false)
			assert.equal(pane.classList.contains('hide'), false)
		})
	})


	// ─────────────────────────────────────────────────────────────────────────
	describe('reuse is decided by the INSTANCE, never by a flag', function() {

		it('a DESTROYED area is rebuilt, not reused', async function() {
			// the state every successful pick produces: refresh() destroyed the area
			// through ar_instances while this pane node survived.
			const portal = make_portal({
				id				: 'pane_destroyed_area',
				pane_child		: true,
				thesaurus_area	: { status:'destroyed' }
			})
			const pane = pane_of(portal)

			const destroyed = portal.thesaurus_area
			const result = await portal.toggle_thesaurus_pane()

			// A REBUILD must have happened. A flag-based reuse would have skipped it
			// and left the pane pointing at a tree that no longer exists — which is
			// exactly what every successful pick used to produce.
			assert.equal(result, true, 'the pane reopens on a fresh area')
			assert.notEqual(portal.thesaurus_area, destroyed,
				'the destroyed area must be REPLACED, never reused')
			assert.equal(portal.ar_instances.length, 1, 'exactly one new instance was built')
			assert.equal(pane.querySelector('.thesaurus_pane_error'), null)
		})

		it('a LIVE area is reused: no rebuild, and the linked state is re-synced', async function() {
			let synced = 0
			const portal = make_portal({
				id				: 'pane_live_area',
				pane_child		: true,
				thesaurus_area	: { status:'built' }
			})
			portal.picker = { sync_linked: () => { synced++; return true } }
			const pane = pane_of(portal)

			const result = await portal.toggle_thesaurus_pane()

			assert.equal(result, true, 'a live area reopens')
			assert.equal(pane.classList.contains('hide'), false)
			assert.equal(synced, 1,
				'reopening must re-read the caller locators: they may have changed underneath')
			assert.equal(pane.querySelector('.thesaurus_pane_error'), null, 'nothing failed')
			assert.equal(portal.ar_instances.length, 0, 'no second instance was built')
		})

		it('opening the tree turns the AUTOCOMPLETE off: they share one space', async function() {
			// the two input paths overlap in the component, and the autocomplete's
			// datalist/settings panel paints over the tree. The ontology declaration
			// is untouched; this is a runtime exclusion while the tree shows.
			let destroyed = 0
			const portal = make_portal({
				id				: 'pane_autocomplete_off',
				pane_child		: true,
				thesaurus_area	: { status:'built' }
			})
			portal.picker				= { sync_linked: () => true }
			portal.autocomplete_active	= true
			portal.autocomplete			= { destroy: () => { destroyed++; return true } }

			await portal.toggle_thesaurus_pane()

			assert.equal(destroyed, 1, 'the autocomplete service is torn down')
			assert.equal(portal.autocomplete_active, false)
			assert.equal(portal.autocomplete, null)
		})

		it('ESC closes the pane, and stops there', async function() {
			const portal = make_portal({
				id				: 'pane_escape',
				pane_child		: true,
				thesaurus_area	: { status:'built' }
			})
			portal.picker = { sync_linked: () => true }
			const pane = pane_of(portal)

			await portal.toggle_thesaurus_pane()
			assert.equal(pane.classList.contains('hide'), false)

			let propagated = false
			document.addEventListener('keydown', () => { propagated = true })
			document.dispatchEvent(new KeyboardEvent('keydown', {
				key: 'Escape', bubbles: true, cancelable: true
			}))

			assert.equal(pane.classList.contains('hide'), true, 'ESC closes the picker')
			assert.equal(propagated, false,
				'while the tree is open ESC means "close the tree" and nothing else —'
				+ ' the component must not also be deactivated by the same keypress')
		})

		it('the ESC listener is dropped on close: one open must not leak one listener', async function() {
			const portal = make_portal({
				id				: 'pane_escape_cleanup',
				pane_child		: true,
				thesaurus_area	: { status:'built' }
			})
			portal.picker = { sync_linked: () => true }

			await portal.toggle_thesaurus_pane() // open
			assert.equal(typeof portal.thesaurus_pane_escape, 'function')
			await portal.toggle_thesaurus_pane() // close
			assert.equal(portal.thesaurus_pane_escape, null,
				'this surface is opened many times over a record life; each open must'
				+ ' remove its own document listener')
		})

		it('toggling a live pane closes it without destroying the tree', async function() {
			const portal = make_portal({
				id				: 'pane_toggle_close',
				pane_child		: true,
				thesaurus_area	: { status:'built' }
			})
			portal.picker = { sync_linked: () => true }
			const pane = pane_of(portal)

			await portal.toggle_thesaurus_pane() // open
			const closed = await portal.toggle_thesaurus_pane() // close

			assert.equal(closed, false, 'closing answers false')
			assert.equal(pane.classList.contains('hide'), true)
			assert.notEqual(pane.firstChild, null,
				'the tree is kept so reopening is instant and its state survives')
		})
	})
})

// @license-end
