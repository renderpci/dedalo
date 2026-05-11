// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

import {
	elements
} from './elements.js'
import {get_instance} from '../../../core/common/js/instances.js'



// test matrix: mode → views to test for that mode
const test_matrix = {
	edit   : ['default', 'line_edit', 'print'],
	list   : ['default', 'mini', 'text'],
	search : ['default']
}

/**
* BUILD_OPTIONS
* Builds instance options from element, mode and view
* @param object element - element definition from elements.js
* @param string mode - edit | list | search
* @param string view - default | line_edit | print | mini | text
* @return object options for get_instance
*/
const build_options = (element, mode, view) => ({
	id_variant    : Math.random() + '-' + Math.random(),
	lang          : element.lang,
	mode          : mode,
	model         : element.model,
	section_id    : element.section_id,
	section_tipo  : element.section_tipo,
	tipo          : element.tipo,
	view          : view
})



describe(`COMPONENTS LIFE-CYCLE`, function() {

	this.timeout(5000);

	// iterate all elements
	for (let i = 0; i < elements.length; i++) {

		const element = elements[i]

		// (!) component_external uses network connection, this makes very variable the response time
		// Its intencionally excluded to have a more estable test completion time metrics.
		if(element.model === 'component_external') {
			continue
		}

		describe(`${element.model.toUpperCase()}`, function() {

			this.timeout(15000);

			// iterate mode → view combinations from test_matrix
			for (const mode of Object.keys(test_matrix)) {
				for (const view of test_matrix[mode]) {
					const options = build_options(element, mode, view)
					life_cycle_test(options, view)
				}
			}
		});
	}
});//end describe(`COMPONENTS LIFE-CYCLE`)



// models that render content_data in list mode (skip content_data=null check)
const LIST_SKIP_CONTENT_DATA = [
	'component_inverse',
	'component_portal',
	'component_relation',
	'component_3d',
	'component_av',
	'component_image',
	'component_pdf',
	'component_svg',
	'component_relation_children',
	'component_relation_index',
	'component_relation_related',
	'component_relation_parent',
	'component_text_area',
	'component_json',
	'component_info'
]

// models that may render labels in list mode (skip label=null check)
const LIST_SKIP_LABEL = [
	'component_info'
]

/**
* LIFE_CYCLE_TEST
* Runs the full init → build → render → destroy cycle for one mode/view combination
* @param object options - instance options (from build_options)
* @param string view - view name for descriptions
* @return void
*/
function life_cycle_test(options, view) {

	let new_instance = null

	const tag = `${options.model} [${options.mode}/${view}]`

	describe(tag, function() {

		this.timeout(15000);

		it(`INIT ${options.mode}/${view}`, async function() {

			new_instance = await get_instance(options)

			// status and core properties
			assert.equal(new_instance.status, 'initialized', 'status must be initialized');
			assert.equal(new_instance.mode, options.mode);
			assert.equal(new_instance.context, null);
			assert.equal(new_instance.node, null);
			assert.equal(new_instance.active, false);
			assert.equal(new_instance.is_data_changed, false);

			// identity properties must be set
			assert.notEqual(new_instance.model, null);
			assert.notEqual(new_instance.tipo, null);
			assert.notEqual(new_instance.section_tipo, null);
			assert.notEqual(new_instance.mode, null);
			assert.notEqual(new_instance.lang, null);
			assert.notEqual(new_instance.standalone, null);
		});

		it(`BUILD ${options.mode}/${view}`, async function() {

			await new_instance.build(true)

			assert.equal(new_instance.status, 'built');
			assert.notEqual(new_instance.context, null, 'context must not be null after build');
			assert.notEqual(new_instance.type, null, 'type must not be null');
			assert.notEqual(new_instance.label, null, 'label must not be null');
			assert.notEqual(new_instance.tools, null, 'tools must not be null');
			assert.notEqual(new_instance.permissions, null, 'permissions must not be null');
			assert.notEqual(new_instance.rqo_test, null, 'rqo_test must not be null');
			assert.notEqual(new_instance.data, null, 'data must not be null');
			assert.notEqual(new_instance.db_data, null, 'db_data must not be null');
		});

		it(`RENDER ${options.mode}/${view}`, async function() {

			const node = await new_instance.render()

			assert.equal(new_instance.status, 'rendered', 'status must be rendered');
			assert.notEqual(new_instance.node, null, 'node must not be null after render');

			// edit mode: label, buttons_container, content_data expected
			if (new_instance.mode === 'edit' && new_instance.view !== 'line_edit' && new_instance.view !== 'mini' && new_instance.view !== 'print') {
				assert.notEqual(
					new_instance.node.querySelector('.label'),
					null,
					`label must exist in edit mode (view: ${new_instance.view})`
				);
				assert.notEqual(
					new_instance.node.querySelector('.buttons_container'),
					null,
					'buttons_container must exist in edit mode'
				);
				assert.notEqual(
					new_instance.node.querySelector('.content_data'),
					null,
					'content_data must exist in edit mode'
				);
			}

			// list mode (non-text view): no label, no buttons, no content_data (for most models)
			if (new_instance.mode === 'list' && new_instance.view !== 'text') {
				if (!LIST_SKIP_CONTENT_DATA.includes(new_instance.model)) {
					assert.equal(
						new_instance.node.querySelector('.content_data'),
						null,
						'content_data must be null in list mode'
					);
				}
				if (!LIST_SKIP_LABEL.includes(new_instance.model)) {
					assert.equal(
						new_instance.node.querySelector('.label'),
						null,
						'label must be null in list mode'
					);
				}
				assert.equal(
					new_instance.node.querySelector('.buttons_container'),
					null,
					'buttons_container must be null in list mode'
				);
			}

			// search mode: node must be a valid DOM element
			if (new_instance.mode === 'search') {
				assert.ok(
					new_instance.node instanceof Element,
					'rendered node must be a DOM Element in search mode'
				);
			}
		});

		it(`DESTROY ${options.mode}/${view}`, async function() {

			const result = await new_instance.destroy(
				true,  // delete_self
				true,  // delete_dependencies
				true   // remove_dom
			);

			assert.equal(result.delete_dependencies, true, 'delete_dependencies must succeed');
			assert.equal(result.delete_self, true, 'delete_self must succeed');
			assert.equal(new_instance.status, 'destroyed');
			assert.deepEqual(new_instance.ar_instances, []);
			assert.deepEqual(new_instance.node, null);
			assert.deepEqual(new_instance.events_tokens, []);
		});

	});
}//end life_cycle_test



// @license-end
