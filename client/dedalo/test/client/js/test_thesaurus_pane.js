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
	import {buttons} from '../../../core/component_portal/js/buttons.js'



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

		// the component wrapper. The pane is NOT inside it — toggle_thesaurus_pane
		// creates it on document.body, which is the point of the design.
		self.node = document.createElement('div')
		document.body.appendChild(self.node)

		self.thesaurus_pane = null
		if (options.with_pane===true) {
			const pane = document.createElement('div')
			pane.classList.add('thesaurus_pane','hide')
			if (options.pane_child===true) {
				pane.appendChild(document.createElement('span'))
			}
			document.body.appendChild(pane)
			self.thesaurus_pane = pane
		}

		return self
	}

	const pane_of = (portal) => portal.thesaurus_pane



describe('THESAURUS PANE (the inline picker surface)', function() {

	// ─────────────────────────────────────────────────────────────────────────
	describe('the pane is created OUTSIDE the component DOM', function() {

		it('the pane is a body child, never a descendant of the component', async function() {
			// THE load-bearing assertion of this whole surface. Inside the component
			// wrapper the area inherited the portal's drag handling (its dragover
			// claimed the filter's field drags and died on a `tmp.data` only the
			// portal's own dragstart writes), the autocomplete's box, the component's
			// height and its stacking context. tool_indexation — the working
			// reference — renders its thesaurus into a SIBLING container for exactly
			// this reason.
			const portal = make_portal({ id:'pane_outside_dom' })

			await portal.toggle_thesaurus_pane()

			const pane = portal.thesaurus_pane
			assert.notEqual(pane, null, 'a pane was created')
			assert.equal(pane.parentNode, document.body, 'it hangs off body')
			assert.equal(portal.node.contains(pane), false,
				'it must NOT be inside the component wrapper')
		})

		it('destroying the component removes its body-level pane', async function() {
			const portal = make_portal({ id:'pane_destroy_cleanup' })
			await portal.toggle_thesaurus_pane()
			const pane = portal.thesaurus_pane
			assert.equal(pane.parentNode, document.body)

			await portal.destroy(true, true, true)

			assert.equal(pane.parentNode, null,
				'the generic destroy only removes self.node; this pane is not inside it')
		})
	})


	// ─────────────────────────────────────────────────────────────────────────
	describe('the tree button reaches the PANE, and the browse window declares nothing', function() {

		it('a tree-view portal button opens the pane, not the separate window', async function() {
			// The button used to look for a `.thesaurus_pane` INSIDE the wrapper. The
			// pane is created on demand on document.body, so that query found nothing
			// and every click took the separate-window fallback — a window that then
			// declared the caller, was granted relation mode, and had no picker wired.
			const portal = make_portal({ id:'pane_button_route' })
			portal.context.view = 'tree'
			let toggled = 0
			let windowed = 0
			portal.toggle_thesaurus_pane	= async () => { toggled++; return true }
			portal.open_ontology_window		= () => { windowed++; return null }

			const button = buttons.render_button_tree_selector(portal)
			button.dispatchEvent(new MouseEvent('mousedown', { bubbles:true }))
			await new Promise(resolve => setTimeout(resolve, 0))

			assert.equal(toggled, 1, 'the pane is the picker surface')
			assert.equal(windowed, 0, 'the separate window is not the picker surface')
		})

		it('a NON-tree portal button keeps the browse window', async function() {
			const portal = make_portal({ id:'pane_button_browse' })
			portal.context.view = 'default'
			let toggled = 0
			let windowed = 0
			portal.toggle_thesaurus_pane	= async () => { toggled++; return true }
			portal.open_ontology_window		= () => { windowed++; return null }

			const button = buttons.render_button_tree_selector(portal)
			button.dispatchEvent(new MouseEvent('mousedown', { bubbles:true }))
			await new Promise(resolve => setTimeout(resolve, 0))

			assert.equal(toggled, 0)
			assert.equal(windowed, 1, 'six shipped nodes declare button_tree without a tree view')
		})

		it('the browse window carries NO picker_caller', function() {
			// A separately-opened area page has nothing that calls attach_picker. A
			// caller declared there makes the server grant relation mode to a tree with
			// no picker: every node reports "No picker is attached to this tree".
			const portal = make_portal({ id:'pane_window_no_caller' })
			let opened_url = null
			const original = window.open
			window.open = (url) => { opened_url = String(url); return null }
			try {
				portal.open_ontology_window(null, null)
			} finally {
				window.open = original
			}

			assert.notEqual(opened_url, null, 'a window was requested')
			assert.equal(opened_url.includes('picker_caller'), false,
				'the browse window must not declare a caller it cannot wire')
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
			// with_pane so the node exists before the fault is injected into it
			const portal = make_portal({ id:'pane_failed_build', with_pane:true })
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

			const result = await portal.toggle_thesaurus_pane()
			const pane = pane_of(portal)

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
				with_pane		: true,
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
				with_pane		: true,
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

		it('the AUTOCOMPLETE is HIDDEN while the tree is open, and restored on close', async function() {
			// The two input paths overlap in the component and the autocomplete's
			// datalist/settings panel paints over the tree, so one of them must step
			// aside. It must be HIDDEN, never destroyed: activate_autocomplete's fast
			// path is `autocomplete_active===true → show()`, so a teardown leaves the
			// component with no autocomplete on the next activation. The ontology
			// declaration is untouched; this is a runtime exclusion, and it is
			// REVERSIBLE.
			let hidden = 0
			let shown = 0
			const portal = make_portal({
				id				: 'pane_autocomplete_off',
				with_pane		: true,
				pane_child		: true,
				thesaurus_area	: { status:'built' }
			})
			portal.picker				= { sync_linked: () => true }
			portal.autocomplete_active	= true
			portal.autocomplete			= {
				hide: () => { hidden++; return true },
				show: () => { shown++;  return true }
			}

			await portal.toggle_thesaurus_pane() // open

			assert.equal(hidden, 1, 'the input steps aside for the tree')
			assert.equal(shown, 0)
			assert.equal(portal.autocomplete_active, true,
				'the service stays ACTIVE: destroying it breaks the next activation')
			assert.notEqual(portal.autocomplete, null, 'the instance survives')

			await portal.toggle_thesaurus_pane() // close

			assert.equal(shown, 1, 'closing the tree gives the input straight back')
		})

		it('ESC closes the pane, and stops there', async function() {
			const portal = make_portal({
				id				: 'pane_escape',
				with_pane		: true,
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
				with_pane		: true,
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

		it('opening a SECOND picker closes the first: they would share one area', async function() {
			// The area instance key is (model, tipo, section_tipo, section_id, mode,
			// lang) — none of which varies between two callers on one record — so two
			// open panes resolve the SAME area and the second steals the first's tree
			// and linker. `id_variant` cannot be the fix: it CASCADES into every
			// section_record and component built under the area (section.js:1191),
			// which is what made the search panel's components build wrong.
			const first = make_portal({
				id:'pane_first',  with_pane:true, pane_child:true, thesaurus_area:{ status:'built' }
			})
			const second = make_portal({
				id:'pane_second', with_pane:true, pane_child:true, thesaurus_area:{ status:'built' }
			})
			first.picker	= { sync_linked: () => true }
			second.picker	= { sync_linked: () => true }

			await first.toggle_thesaurus_pane()
			assert.equal(pane_of(first).classList.contains('hide'), false)

			await second.toggle_thesaurus_pane()

			assert.equal(pane_of(second).classList.contains('hide'), false, 'the second opens')
			assert.equal(pane_of(first).classList.contains('hide'), true,
				'the first must be closed, not left sharing the area')
			assert.equal(first.thesaurus_pane_escape, null,
				'the closed picker also released its document listener')
		})

		it('toggling a live pane closes it without destroying the tree', async function() {
			const portal = make_portal({
				id				: 'pane_toggle_close',
				with_pane		: true,
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
