// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {render_section_group} from './render_section_group.js'



/**
* SECTION_GROUP
* Visual grouping container for Dédalo section components.
*
* A section_group is a layout-only element that bundles a set of components
* within a section under a collapsible labelled block. It carries no independent
* data of its own — its sole purpose is UI organisation: it controls how its
* child components are grouped and whether they are initially visible or collapsed.
*
* The constructor only declares instance property slots to ensure a consistent
* object shape across all instances. Real values are written by `init()`.
*
* Lifecycle (inherits from common):
*   init → build → render → (refresh: destroy deps → build → render) → destroy
*
* Prototype chain:
*   build, render, destroy  ← common.prototype
*   list, edit              ← render_section_group.prototype
*   init                    ← defined in this file
*/
export const section_group = function(){

	this.id				= null

	// element properties declare
	this.model			= null
	this.tipo			= null
	this.section_tipo	= null
	this.section_id		= null
	this.mode			= null
	this.lang			= null

	this.context		= null
	this.parent			= null
	this.type			= null
	this.label			= null

	this.node			= null

	this.id_variant		= null
}//end section_group



/**
* COMMON FUNCTIONS
* Extend section_group with shared prototype methods from common and
* render_section_group. Individual prototype assignments are not
* doc-blocked; documentation lives at each source definition.
*/
// prototypes assign
	section_group.prototype.build	= common.prototype.build
	section_group.prototype.render	= common.prototype.render
	section_group.prototype.destroy	= common.prototype.destroy
	section_group.prototype.list	= render_section_group.prototype.list
	section_group.prototype.edit	= render_section_group.prototype.edit



/**
* INIT
* Seeds every well-known property from `options` onto the instance and advances
* the lifecycle status from 'initializing' to 'initialized'.
*
* Mirrors the shape of `common.prototype.init` but is intentionally synchronous
* (returns a plain boolean) because section_group requires no async bootstrap:
* it carries no independent data and defers all rendering to `build`/`render`.
*
* The one-shot `is_init` guard prevents double-initialisation (e.g. from
* duplicated event bindings). A second call logs an error and, when SHOW_DEBUG
* is active, opens a browser alert so the issue is impossible to miss during
* development. The guard uses a typeof check rather than a value check so that
* even a falsy value would still trigger the guard correctly.
*
* After `init` completes:
*   - `self.label`         is set from `options.context.label` (! context must be present)
*   - `self.events_tokens` is an empty array ready for event subscriptions
*   - `self.ar_instances`  is an empty array ready to collect child instances
*   - `self.node`          is null; it is populated by `render()`
*
* @param {Object} options - Initialisation options bag
* @param {string} options.model - Class name of this element, e.g. 'section_group'
* @param {string} options.tipo - Ontology tipo of this group, e.g. 'dd789'
* @param {string} options.section_tipo - Ontology tipo of the owning section, e.g. 'oh1'
* @param {string|number} options.section_id - Record identifier within the section
* @param {string} options.mode - Render mode: 'edit', 'list', 'search', etc.
* @param {string} options.lang - Active language tag, e.g. 'lg-eng'
* @param {Object} options.context - Server-resolved context object; must contain a `label` property
* @param {*} options.parent - Parent instance that owns this group
* @param {string} options.type - Instance type classifier, typically 'section_group'
* @returns {boolean} true on successful initialisation; false if already initialised
*/
section_group.prototype.init = function(options) {

	const self = this

	// safe init double control. To detect duplicated events cases
		if (typeof this.is_init!=='undefined') {
			console.error('Duplicated init for element:', this);
			if(SHOW_DEBUG===true) {
				// (!) alert() is intentional here: forces the duplicate-init problem
				// to surface visibly during development. Do not replace with console.warn.
				alert('Duplicated init element');
			}
			return false
		}
		this.is_init = true

	// status update
		self.status = 'initializing'

	self.model			= options.model
	self.tipo			= options.tipo
	self.section_tipo	= options.section_tipo
	self.section_id		= options.section_id
	self.mode			= options.mode
	self.lang			= options.lang

	self.context		= options.context || null
	self.parent			= options.parent
	self.type			= options.type
	// Empty arrays seeded here so build/render can push without null-checks.
	self.events_tokens	= []
	self.ar_instances	= []

	self.node			= null

	// Pull the human-readable label straight from context rather than from
	// a separate options key, keeping section_group consistent with section_tab.
	self.label			= self.context.label

	// status update
		self.status = 'initialized'


	return true
}//end init



// @license-end
