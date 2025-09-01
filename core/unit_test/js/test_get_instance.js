// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	mode,
	lang
} from './elements.js'
import {get_instance,get_all_instances,delete_instance,delete_instances,find_instances,key_instances_builder} from '../../common/js/instances.js'
import {page} from '../../page/js/page.js'
import {component_input_text} from '../../component_input_text/js/component_input_text.js'



describe("INSTANCES : GET_INSTANCE (PAGE/COMPONENT/TOOL)", function() {

	this.timeout(5000);

	function make_test(options, expected) {
		it(`${JSON.stringify(options)} => '${expected.name}'`, async function() {

			if (options.model.indexOf('tool_')!==-1) {
				try {
					const module_path = `../../../tools/${options.model}/js/${options.model}.js`
					const module = await import(module_path);

					const instance = await get_instance(options)
					assert.instanceOf(instance, module[options.model], 'result is an instance of expected: '+ instance.name);
				} catch (error) {
					console.error(error)
				}
				return
			}

			if (options.model.indexOf('service_')!==-1) {
				try {
					const module_path = `../../../core/services/${options.model}/js/${options.model}.js`
					const module = await import(module_path);

					// service_ckeditor do not follow the Dédalo services model yet..
					if (options.model==='service_ckeditor') {
						console.warn('Ignored service_ckeditor instance creation because do not follow the Dédalo services model yet.');
						return
					}
					const instance = await get_instance(options)
					assert.instanceOf(instance, module[options.model], 'result is an instance of expected: '+ instance.name);
				} catch (error) {
					console.error(error)
				}
				return
			}

			const instance = await get_instance(options)
			assert.instanceOf(instance, expected, 'result is an instance of expected '+ instance.name);
		});
	}

	// page instance
		describe("Builds page instance from options", function() {
			make_test(
				{
					model : 'page'
				},
				page
			);
		});

	// component_input_text instance
		describe("Builds component_input_text instance from options", function() {
			make_test(
				{
					model			: 'component_input_text',
					tipo			: 'test52',
					section_tipo	: 'test3',
					mode			: 'tm',
					lang			: 'lg-eng'
				},
				component_input_text
			);
		});

	// tools instance
		describe("Builds tools instance from options", function() {

			const tools = [
				'tool_cataloging',
				'tool_common',
				'tool_dd_label',
				'tool_dev_template',
				'tool_diffusion',
				'tool_export',
				'tool_hierarchy',
				'tool_image_rotation',
				'tool_import_dedalo_csv',
				'tool_import_files',
				'tool_import_marc21',
				'tool_import_rdf',
				'tool_import_zotero',
				'tool_indexation',
				'tool_lang',
				'tool_lang_multi',
				'tool_leaflet_special_tools',
				'tool_media_versions',
				'tool_numisdata_epigraphy',
				'tool_numisdata_order_coins',
				'tool_ontology',
				'tool_ontology_parser',
				'tool_pdf_extractor',
				'tool_posterframe',
				'tool_propagate_component_data',
				'tool_qr',
				'tool_subtitles',
				'tool_tc',
				'tool_time_machine',
				'tool_tr_print',
				'tool_transcription',
				'tool_update_cache',
				'tool_upload',
				'tool_user_admin'
			];

			const tools_length = tools.length
			for (let i = 0; i < tools_length; i++) {

				const model = tools[i]

					make_test(
					{
						model		: model,
						mode		: mode,
						lang		: lang,
						tool_object	: {},
						caller		: {}
					},
					model
				);
			}
		});

	// services instance
		describe("Builds services instance from options", function() {

			const services = [
				'service_autocomplete',
				'service_ckeditor', // @todo: Unify service model using prototypes
				'service_dropzone',
				// 'service_subtitles', // not finished
				'service_time_machine',
				'service_tmp_section',
				'service_upload',
			];

			const services_length = services.length
			for (let i = 0; i < services_length; i++) {

				const model = services[i]

					make_test(
					{
						model	: model,
						mode	: mode,
						lang	: lang,
						caller	: {
							build : () => {}
						}
					},
					model
				);
			}
		});

	// instances operations
		describe("Instances operations", function() {

			it(`get_instance`, async function() {
				const instance = await get_instance({
					model			: 'component_input_text',
					tipo			: 'test52',
					section_tipo	: 'test3',
					mode			: 'edit',
					lang			: 'lg-eng'
				})
				console.log('instance:', typeof instance, instance);
				assert.equal(typeof instance, 'object', 'instance type must be object');
				assert.equal(instance.model, 'component_input_text', 'instance model must be component_input_text');
				assert.equal(instance.mode, 'edit', 'instance mode must be edit');

				const instance2 = await get_instance({
					model			: 'component_input_text',
					tipo			: 'test52',
					section_tipo	: 'test3',
					mode			: 'list',
					lang			: 'lg-eng'
				})
				console.log('instance2:', typeof instance2, instance2);
				assert.equal(typeof instance2, 'object', 'instance2 type must be object');
				assert.equal(instance2.mode, 'list', 'instance2 mode must be list');
			});

			it(`get_all_instances`, async function() {
				const instances = get_all_instances()
				console.log('instances:', typeof instances, instances);
				assert.equal(typeof instances, 'object', 'instances type must be object');
			});

			it(`find_instances`, async function() {
				const instances = find_instances({
					model			: 'component_input_text',
					tipo			: 'test52',
					section_tipo	: 'test3',
					mode			: 'edit',
					lang			: 'lg-eng'
				})
				console.log('find_instances:', typeof instances, instances);
				assert.equal(typeof instances, 'object', 'instances type must be object');
				assert.equal(instances.length, 1, 'instances length must be 1');
			});

			it(`delete_instance`, async function() {
				const instances_n1 = get_all_instances().length
				const key = 'component_input_text_test52_test3_list_lg-eng'
				const deleted = delete_instance(key)
				console.log('deleted:', typeof deleted, deleted);
				assert.equal(typeof deleted, 'boolean', 'deleted type must be boolean');
				assert.equal(deleted, true, 'deleted must be true');
				const instances_n2 = get_all_instances().length
				assert.equal(instances_n2 === (instances_n1 - 1), true, 'Total is not as expected');

				const deleted2 = delete_instance('fake_key')
				console.log('deleted2:', typeof deleted2, deleted2);
				assert.equal(deleted2, false, 'deleted2 must be false');
				const instances_n3 = get_all_instances().length
				assert.equal(instances_n3 === instances_n2, true, 'Total is not as expected');
			});

			it(`delete_instances`, async function() {
				const instances_n1 = get_all_instances().length
				const deleted_count = delete_instances({
					model			: 'component_input_text',
					tipo			: 'test52',
					section_tipo	: 'test3',
					mode			: 'edit',
					lang			: 'lg-eng'
				})
				console.log('deleted_count:', typeof deleted_count, deleted_count);
				assert.equal(typeof deleted_count, 'number', 'instances type must be number');
				assert.equal(deleted_count, 1, 'deleted_count must be 1');
				const instances_n2 = get_all_instances().length
				assert.equal(instances_n2 === (instances_n1 - 1), true, 'Total is not as expected');
			});

			it(`key_instances_builder`, async function() {
				const key = key_instances_builder({
					model			: 'component_input_text',
					tipo			: 'test52',
					section_tipo	: 'test3',
					mode			: 'edit',
					lang			: 'lg-eng'
				})
				console.log('key_instances_builder:', typeof key, key);
				assert.equal(key, 'component_input_text_test52_test3_edit_lg-eng', "key don't match ");
			});
		});
});



// @license-end
