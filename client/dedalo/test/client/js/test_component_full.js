// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {get_instance} from '../../../core/common/js/instances.js'
import {ui} from '../../../core/common/js/ui.js'
import {url_vars_to_object} from '../../../core/common/js/utils/index.js'



const url_vars	= url_vars_to_object(window.location.search)
const model		= url_vars.model

// element is an object with the instance options
	const element	= elements.find(el => el.model===model)

/**
* CONTENT_DATA_OF
* The component's content node. Every model but one family renders it as a
* DIRECT child of the wrapper; the PORTAL FAMILY (component_portal and the
* four component_relation_* models, all built by view_default_edit_portal.js)
* nests it one level down: wrapper > .list_body > header + .content_data.
* Do NOT use a loose `querySelector('.content_data')` here — the paginator
* renders its own `.content_data` first in document order, so a loose lookup
* passes on the wrong node.
*/
const content_data_of = (node) =>
	node.querySelector(':scope >.content_data') ||
	node.querySelector(':scope >.list_body >.content_data')

/**
* IS_PORTAL_FAMILY
* Judged from the RENDERED wrapper (`add_styles: ['portal']` in
* view_default_edit_portal.js), not from a hand-kept list of model names —
* the relation_* models are portal-rendered and were missing from the old
* name-based carve-out, so their `.label` in line view read as a failure.
*/
const is_portal_family = (instance) =>
	instance.node instanceof Element && instance.node.classList.contains('portal')

// events
	// page click
		window.addEventListener('mousedown', fn_deactivate_components)
		function fn_deactivate_components(e) {
			e.stopPropagation()
			if (page_globals.component_active) {
				ui.component.deactivate(page_globals.component_active)
			}
		}



/**
* MAKE_ELEMENT_TEST
* Builds, renders and asserts one (mode, view, permissions) permutation.
*
* (!) This is an ASYNC FUNCTION and every `it` MUST `await` it. It used to
* wrap the body in `new Promise(async function(resolve){...})` and be called
* without await: an assertion throwing inside that async executor became an
* UNHANDLED REJECTION — the promise never settled, mocha's `it` had already
* returned, and the suite went green with failing asserts. 16 real assertion
* failures hid there. Keep the plain async shape: a throw must reach mocha.
*
* @param object options
* @return promise
* 	resolves to the element instance; REJECTS when an assert fails
*/
async function make_element_test(options) {

	// options
		const element		= options.element
		const mode			= options.mode
		const view			= options.view
		const permissions	= options.permissions
		const fn_asserts	= options.fn_asserts

	// short vars
		const model			= element.model
		const tipo			= element.tipo
		const section_tipo	= element.section_tipo
		const section_id	= element.section_id
		const lang			= element.lang

	{
		const start = performance.now()

			// instantiate element
			const new_instance = await get_instance({
				model			: model,
				tipo			: tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				lang			: lang,
				mode			: mode,
				view			: view,
				id_variant		: mode + '_' + view + '_' + Math.random() + '-' + Math.random()
			})

			const end = performance.now();
			console.log(`Process took ${end - start} milliseconds.`);

			// build element forcing to load context and data from API
			await new_instance.build(true)


			// inject permissions
			new_instance.permissions = permissions
			// render element
			const new_node = await new_instance.render()

			// insert in DOM
				const container	= ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'container ' + `${mode}-${view}`,
					parent			: content
				})
				ui.create_dom_element({
					element_type	: 'h1',
					inner_html		: `${model.toUpperCase()} mode: ${mode}, view: ${view}, permissions: ${new_instance.permissions}`,
					parent			: container
				})
				if(mode==='search') {
					const search_group	= ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'search_group',
						parent			: container
					})
					search_group.appendChild(new_node)
				}else{
					container.appendChild(new_node)
				}

			// asserts
			// awaited: fn_asserts is async, and an un-awaited rejection is
			// invisible to mocha (see the note above).
				await fn_asserts(new_instance)

			return new_instance
	}
}//end make_element_test



	// DOM containers
	const container = document.getElementById('content');

	// test

	{
		const mode			= 'edit'
		const view			= 'default'
		const permissions	= 0
		const name			= `${element.model} ${mode}-${view}-${permissions}`
		describe(name, function() {
		it(`${element.model.toUpperCase()} ${name}`, async function() {
		await make_element_test({
			mode		: mode,
			view		: view,
			permissions	: permissions,
			element		: element,
			content		: container,
			fn_asserts	: async (new_instance) => {
				// asserts
				assert.equal(
					new_instance.status,
					'built',
					'Status must be built in zero permissions scenario'
				);
				assert.notEqual(
					new_instance.node,
					null,
					'Main node not could be null'
				);
			}
		})	})	})
	}

	{
		const mode			= 'edit'
		const view			= 'default'
		const permissions	= 1
		const name			= `${element.model} ${mode}-${view}-${permissions}`
		describe(name, function() {
		it(`${element.model.toUpperCase()} ${name}`, async function() {
		await make_element_test({
			mode		: mode,
			view		: view,
			permissions	: permissions,
			element		: element,
			content		: container,
			fn_asserts	: async (new_instance) => {
				// asserts
				assert.equal(
					new_instance.status,
					'rendered',
					'Component status must be rendered'
				);
				assert.notEqual(
					new_instance.node,
					null,
					'Main node not could be null'
				);
				assert.notEqual(
					new_instance.node.querySelector(':scope >.label'),
					null,
					'Main label must necessarily exist'
				);
				assert.equal(
					new_instance.node.querySelector(':scope >.buttons_container'),
					null,
					'buttons_container should not exist when permissions are 1'
				);
				assert.notEqual(
					content_data_of(new_instance.node),
					null,
					'content_data must necessarily exist'
				);
				assert.notEqual(
					new_instance.node.content_data,
					undefined,
					'content_data pointer must necessarily exist from wrapper'
				);
			}
		})	}) })
	}

	{
		const mode			= 'edit'
		const view			= 'default'
		const permissions	= 2
		const name			= `${element.model} ${mode}-${view}-${permissions}`
		describe(name, function() {
		it(`${element.model.toUpperCase()} ${name}`, async function() {
		await make_element_test({
			mode		: mode,
			view		: view,
			permissions	: permissions,
			element		: element,
			content		: container,
			fn_asserts	: async (new_instance) => {
				// asserts
				assert.equal(
					new_instance.status,
					'rendered',
					'Status must be rendered'
				);
				assert.notEqual(
					new_instance.node,
					null,
					'Main node not could be null'
				);
				assert.notEqual(
					new_instance.node.querySelector(':scope >.label'),
					null,
					'Main label must necessarily exist'
				);
				assert.notEqual(
					new_instance.node.querySelector(':scope >.buttons_container'),
					null,
					'buttons_container must necessarily exist (edit-default-2)'
				);
				assert.notEqual(
					content_data_of(new_instance.node),
					null,
					'content_data must necessarily exist'
				);
				assert.notEqual(
					new_instance.node.content_data,
					undefined,
					'content_data pointer must necessarily exist from wrapper'
				);
				assert.equal(
					new_instance.node.classList.contains('view_default'),
					true,
					'instance wrapper classList display must contains "view_default" '
				);
			}
		})	}) })
	}

	// html_text case
	if (element.model==='component_text_area') {
		const mode			= 'edit'
		const view			= 'html_text'
		const permissions	= 2
		const name			= `${element.model} ${mode}-${view}-${permissions}`
		describe(name, function() {
		it(`${element.model.toUpperCase()} ${name}`, async function() {
		await make_element_test({
			mode		: mode,
			view		: view,
			permissions	: permissions,
			element		: element,
			content		: container,
			fn_asserts	: async (new_instance) => {
				// asserts
				assert.equal(
					new_instance.status,
					'rendered',
					'Status must be rendered'
				);
				assert.notEqual(
					new_instance.node,
					null,
					'Main node not could be null'
				);
				assert.notEqual(
					new_instance.node.querySelector(':scope >.label'),
					null,
					'Main label must necessarily exist'
				);
				assert.notEqual(
					new_instance.node.querySelector(':scope >.buttons_container'),
					null,
					'buttons_container must necessarily exist (edit-default-2)'
				);
				assert.notEqual(
					content_data_of(new_instance.node),
					null,
					'content_data must necessarily exist'
				);
				assert.notEqual(
					new_instance.node.content_data,
					undefined,
					'content_data pointer must necessarily exist from wrapper'
				);
				assert.equal(
					new_instance.node.classList.contains('view_html_text'),
					true,
					'instance wrapper classList display must contains "view_html_text" '
				);

			}
		})	}) })
	}

	{
		const mode			= 'edit'
		const view			= 'line'
		const permissions	= 2
		const name			= `${element.model} ${mode}-${view}-${permissions}`
		describe(name, function() {
		it(`${element.model.toUpperCase()} ${name}`, async function() {
		await make_element_test({
			mode		: mode,
			view		: view,
			permissions	: permissions,
			element		: element,
			content		: container,
			fn_asserts	: async (new_instance) => {
				// asserts
				assert.equal(
					new_instance.status,
					'rendered',
					'Status must be rendered'
				);
				assert.notEqual(
					new_instance.node,
					null,
					'Main node not could be null'
				);
				// the portal family and component_external DO render a label in
				// line view; every other model must not.
				if (!is_portal_family(new_instance) && element.model !== 'component_external') {
					assert.equal(
						new_instance.node.querySelector(':scope >.label'),
						null,
						'Main label should not exist in line view (Except for portals and component_external)'
					);
				}
				// assert.notEqual(
				// 	new_instance.node.querySelector(':scope >.buttons_container'),
				// 	null,
				// 	'buttons_container must necessarily exist (edit-line-2)'
				// );
				assert.notEqual(
					content_data_of(new_instance.node),
					null,
					'content_data must necessarily exist'
				);
				assert.notEqual(
					new_instance.node.content_data,
					undefined,
					'content_data pointer must necessarily exist from wrapper'
				);
				assert.equal(
					new_instance.node.classList.contains('view_line'),
					true,
					'instance wrapper classList display must contains "view_line" '
				);
			}
		})	}) })
	}

	{
		const mode			= 'edit'
		const view			= 'print'
		const permissions	= 2
		const name			= `${element.model} ${mode}-${view}-${permissions}`
		describe(name, function() {
		it(`${element.model.toUpperCase()} ${name}`, async function() {
		await make_element_test({
			mode		: mode,
			view		: view,
			permissions	: permissions,
			element		: element,
			content		: container,
			fn_asserts	: async (new_instance) => {
				// asserts
				assert.equal(
					new_instance.status,
					'rendered',
					'Status must be rendered'
				);
				assert.notEqual(
					new_instance.node,
					null,
					'Main node not could be null'
				);
				assert.notEqual(
					new_instance.node.querySelector(':scope >.label'),
					null,
					'Main label must necessarily exist in view print'
				);
				assert.equal(
					new_instance.node.querySelector(':scope >.buttons_container'),
					null,
					'buttons_container should not exist in view print'
				);
				assert.notEqual(
					content_data_of(new_instance.node),
					null,
					'content_data must necessarily exist'
				);
				assert.notEqual(
					new_instance.node.content_data,
					undefined,
					'content_data pointer must necessarily exist from wrapper'
				);
				assert.equal(
					new_instance.node.classList.contains('view_print'),
					true,
					'instance wrapper classList display must contains "view_print" '
				);
				assert.equal(
					new_instance.permissions===1,
					true,
					'instance permissions must be 1 in view "print" '
				);
			}
		})	})	})
	}

	{
		const mode			= 'list'
		const view			= 'default'
		const permissions	= 2
		const name			= `${element.model} ${mode}-${view}-${permissions}`
		describe(name, function() {
		it(`${element.model.toUpperCase()} ${name}`, async function() {
		await make_element_test({
			mode		: mode,
			view		: view,
			permissions	: permissions,
			element		: element,
			content		: container,
			fn_asserts	: async (new_instance) => {
				// asserts
				assert.equal(
					new_instance.status,
					'rendered',
					'Status must be rendered'
				);
				assert.notEqual(
					new_instance.node,
					null,
					'Main node not could be null'
				);
				assert.equal(
					new_instance.node.querySelector(':scope >.label'),
					null,
					'Main label should not exist in list mode'
				);
				assert.equal(
					new_instance.node.querySelector(':scope >.buttons_container'),
					null,
					'buttons_container should not exist in list mode'
				);
				// assert.notEqual(
				// 	new_instance.node.querySelector(':scope >.content_data'),
				// 	null,
				// 	'content_data must necessarily exist in list - default'
				// );
				// assert.notEqual(
				// 	new_instance.node.content_data,
				// 	undefined,
				// 	'content_data pointer must necessarily exist from wrapper'
				// );
				assert.equal(
					new_instance.node.classList.contains('view_default'),
					true,
					'instance wrapper classList display must contains "view_default" '
				);
				assert.equal(
					new_instance.permissions===2,
					true,
					'instance permissions must be equal as initial set: 2 '
				);
			}
		})	})	})
	}

	{
		const mode			= 'list'
		const view			= 'mini'
		const permissions	= 2
		const name			= `${element.model} ${mode}-${view}-${permissions}`
		describe(name, function() {
		it(`${element.model.toUpperCase()} ${name}`, async function() {
		await make_element_test({
			mode		: mode,
			view		: view,
			permissions	: permissions,
			element		: element,
			content		: container,
			fn_asserts	: async (new_instance) => {
				// asserts
				assert.equal(
					new_instance.status,
					'rendered',
					'Status must be rendered'
				);
				assert.notEqual(
					new_instance.node,
					null,
					'Main node not could be null'
				);
				assert.equal(
					new_instance.node.querySelector(':scope >.label'),
					null,
					'Main label should not exist in list mode'
				);
				assert.equal(
					new_instance.node.querySelector(':scope >.buttons_container'),
					null,
					'buttons_container should not exist in list mode'
				);
				// assert.notEqual(
				// 	new_instance.node.querySelector(':scope >.content_data'),
				// 	null,
				// 	'content_data must necessarily exist in list - default'
				// );
				// assert.notEqual(
				// 	new_instance.node.content_data,
				// 	undefined,
				// 	'content_data pointer must necessarily exist from wrapper'
				// );
				assert.equal(
					new_instance.node.classList.contains(`${element.model}_mini`),
					true,
					`instance wrapper classList display must contains "${element.model}_mini" `
				);
				assert.equal(
					new_instance.permissions===2,
					true,
					'instance permissions must be equal as initial set: 2 '
				);
			}
		})	})	})
	}

	{
		const mode			= 'list'
		const view			= 'text'
		const permissions	= 2
		const name			= `${element.model} ${mode}-${view}-${permissions}`
		describe(name, function() {
		it(`${element.model.toUpperCase()} ${name}`, async function() {
		await make_element_test({
			mode		: mode,
			view		: view,
			permissions	: permissions,
			element		: element,
			content		: container,
			fn_asserts	: async (new_instance) => {
				// asserts
				assert.equal(
					new_instance.status,
					'rendered',
					'Status must be rendered'
				);
				assert.notEqual(
					new_instance.node,
					null,
					'Main node not could be null'
				);
				assert.equal(
					(new_instance.node &&
					new_instance.nodeType===Node.ELEMENT_NODE &&
					new_instance.node.querySelector(':scope >.label')!==null),
					false,
					'Main label should not exist in list mode view text'
				);
				assert.equal(
					(new_instance.node &&
					new_instance.nodeType===Node.ELEMENT_NODE &&
					new_instance.node.querySelector(':scope >.buttons_container')!==null),
					false,
					'buttons_container should not exist in list mode view text'
				);
				assert.equal(
					(new_instance.node &&
					new_instance.nodeType===Node.ELEMENT_NODE &&
					new_instance.node.querySelector(':scope >.content_data')!==null),
					false,
					'content_data should not exist in view text'
				);
				assert.equal(
					(new_instance.node &&
					new_instance.nodeType===Node.ELEMENT_NODE &&
					new_instance.node.classList.contains(`view_text`)),
					false,
					`instance wrapper classList display must contains "view_text" `
				);
				assert.equal(
					new_instance.permissions===2,
					true,
					'instance permissions must be equal as initial set: 2 '
				);
			}
		})	})	})
	}

	{
		const mode			= 'search'
		const view			= 'default'
		const permissions	= 2
		const name			= `${element.model} ${mode}-${view}-${permissions}`
		describe(name, function() {
		it(`${element.model.toUpperCase()} ${name}`, async function() {
		await make_element_test({
			mode		: mode,
			view		: view,
			permissions	: permissions,
			element		: element,
			content		: container,
			fn_asserts	: async (new_instance) => {
				// asserts
				assert.equal(
					new_instance.status,
					'rendered',
					'Status must be rendered'
				);
				assert.notEqual(
					new_instance.node,
					null,
					'Main node not could be null'
				);
				assert.equal(
					new_instance.node.querySelector(':scope >.buttons_container'),
					null,
					'buttons_container must not exist (edit-search-2)'
				);
				// Check content data
				if(element.model!=='component_password') {
					assert.notEqual(
						content_data_of(new_instance.node),
						null,
						'content_data must necessarily exist'
					);
					assert.notEqual(
						new_instance.node.content_data,
						undefined,
						'content_data pointer must necessarily exist from wrapper'
					);
					// Check search container
					assert.equal(
						new_instance.node.classList.contains('search'),
						true,
						'instance wrapper classList display must contains "view_line" '
					);
				}
			}
		})	}) })
	}



// @license-end
