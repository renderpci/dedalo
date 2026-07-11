// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, SHOW_DEBUG */
/*eslint no-undef: 'error'*/
import { ts_object } from '../../../core/ts_object/js/ts_object.js'
import { ui } from '../../../core/common/js/ui.js'
import { data_manager } from '../../../core/common/js/data_manager.js'

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

describe('TS_OBJECT EXTENDED : ', function() {

    // DOM container
    const container = document.getElementById('content');

    const component_container = ui.create_dom_element({
        element_type: 'div',
        class_name: 'container_extended',
        parent: container
    })

    const message_label_container = ui.create_dom_element({
        element_type: 'div',
        class_name: 'container_extended_messages',
        inner_html: '<hr>',
        parent: container
    })

    // Mocking data_manager.request
    const original_request = data_manager.request;
    const mock_responses = new Map();

    before(async function() {
        data_manager.request = async (options) => {
            const body = options.body;
            const action = body.action;
            const key = `${action}_${body.source?.section_tipo || ''}_${body.source?.section_id || ''}`;

            if (mock_responses.has(key)) {
                return mock_responses.get(key);
            }

            // Fallback for actions without specific key
            if (mock_responses.has(action)) {
                return mock_responses.get(action);
            }

            console.warn(`[Mock] No response for action: ${action}, key: ${key}. Using original request.`);
            // return original_request(options);
            return { result: true }; // Default success
        };
    });

    after(async function() {
        data_manager.request = original_request;
    });

    const section_tipo = 'test3';
    const section_id = '1';

    const caller = {
        model: 'area_thesaurus',
        thesaurus_view_mode: 'default'
    }

    const instance_options = {
        area_model: 'area_thesaurus',
        caller: caller,
        children_tipo: 'hierarchy49',
        is_ontology: false,
        is_root_node: true,
        section_id: section_id,
        section_tipo: section_tipo,
        thesaurus_mode: 'default',
        thesaurus_view_mode: 'default'
    }

    let main_instance;

    describe('Children Management', function() {

        it('INIT AND BUILD', async function() {
            // Mock responses must be set BEFORE actions that trigger them
            mock_responses.set(`get_node_data_${section_tipo}_${section_id}`, {
                result: {
                    ts_id: `${section_tipo}_${section_id}`,
                    section_tipo: section_tipo,
                    section_id: section_id,
                    order: 1,
                    is_descriptor: true,
                    is_indexable: true,
                    has_descriptor_children: false,
                    permissions_button_new: 3,
                    permissions_button_delete: 3,
                    permissions_indexation: 3,
                    ar_elements: [
                        {
                            type: 'term',
                            tipo: 'test_tipo',
                            value: 'Test Term',
                            model: 'component_input_text'
                        }
                    ]
                }
            });

            main_instance = await ts_object.get_instance(instance_options);
            assert.ok(main_instance, 'ts_object.get_instance should return an instance');

            const build_result = await main_instance.build(true);
            assert.strictEqual(build_result, true, 'Build should return true');
            assert.strictEqual(main_instance.status, 'built', 'Status should be built');
            assert.strictEqual(main_instance.is_descriptor, true, 'is_descriptor should be true from mock');
        });

        it('ADD_CHILDREN_ITEM', async function() {
            assert.ok(main_instance, 'main_instance should be defined');
            const child_data = {
                ts_id: 'child_1',
                section_tipo: 'child_tipo',
                section_id: '1',
                order: 1
            };

            const result = main_instance.add_children_item(child_data);
            assert.strictEqual(result, true, 'add_children_item should return true');
            assert.strictEqual(main_instance.children_data.ar_children_data.length, 1, 'Should have 1 child');
            assert.strictEqual(main_instance.has_descriptor_children, true, 'has_descriptor_children should be true after adding');
        });

        it('REMOVE_CHILDREN_ITEM', async function() {
            assert.ok(main_instance, 'main_instance should be defined');
            const child_data = { ts_id: 'child_1' };
            const result = main_instance.remove_children_item(child_data);
            assert.strictEqual(result, true, 'remove_children_item should return true');
            assert.strictEqual(main_instance.children_data.ar_children_data.length, 0, 'Should have 0 children');
            assert.strictEqual(main_instance.has_descriptor_children, false, 'has_descriptor_children should be false after removing all');
        });
    });

    describe('State Updates and UI', function() {

        it('RENDER', async function() {
            assert.ok(main_instance, 'main_instance should be defined');
            const wrapper = await main_instance.render({ render_level: 'full' });
            component_container.appendChild(wrapper);
            assert.ok(main_instance.node, 'Instance node should be set');
            assert.ok(main_instance.children_container, 'children_container should be set');
        });

        it('UPDATE_CHILDREN_STATE (Mocked Fetch)', async function() {
            assert.ok(main_instance, 'main_instance should be defined');
            // Mock get_children_data
            mock_responses.set('get_children_data', {
                result: {
                    ar_children_data: [
                        {
                            ts_id: 'child_101', section_tipo: 'test3', section_id: '101', order: 1,
                            ar_elements: [{ type: 'term', tipo: 'test', value: 'Child 101', model: 'component_input_text' }]
                        },
                        {
                            ts_id: 'child_102', section_tipo: 'test3', section_id: '102', order: 2,
                            ar_elements: [{ type: 'term', tipo: 'test', value: 'Child 102', model: 'component_input_text' }]
                        }
                    ],
                    pagination: { total: 2 }
                }
            });

            const result = await main_instance.update_children_state({ fetch_data: true, render: true });
            assert.strictEqual(result, true, 'update_children_state should return true');
            assert.strictEqual(main_instance.children_data.ar_children_data.length, 2, 'Should have 2 children from mock');

            // Allow animation frames and render_children (async) to complete
            await delay(100);

            assert.strictEqual(main_instance.is_open, true, 'Instance should be open after showing children');
            assert.strictEqual(main_instance.children_container.classList.contains('hide'), false, 'Container should not be hidden');
        });

        it('HILITE_ELEMENT', async function() {
            assert.ok(main_instance, 'main_instance should be defined');
            const result = main_instance.hilite_element(main_instance.term_node);
            assert.strictEqual(result, 1, 'Should hilite 1 element');
            assert.ok(main_instance.term_node.classList.contains('element_hilite'), 'term_node should have hilite class');
        });

        it('RESET_HILITES', async function() {
            assert.ok(main_instance, 'main_instance should be defined');
            main_instance.reset_hilites();
            assert.strictEqual(main_instance.term_node.classList.contains('element_hilite'), false, 'hilite class should be removed');
        });
    });

    describe('Complex Operations', function() {

        it('SWAP_PARENT (Manual Trigger)', async function() {
            assert.ok(main_instance, 'main_instance should be defined');
            const moving_child_data = {
                ts_id: '300', section_tipo: section_tipo, section_id: '300',
                is_descriptor: true,
                ar_elements: [{ type: 'term', tipo: 'test', value: 'Moving Child', model: 'component_input_text' }]
            };
            const moving_child = await ts_object.get_instance({
                ...instance_options,
                section_id: '300',
                data: moving_child_data
            });
            await moving_child.build(false);
            await moving_child.render();

            const old_parent_data = {
                ts_id: '200', section_tipo: section_tipo, section_id: '200',
                is_descriptor: true,
                ar_elements: [{ type: 'term', tipo: 'test', value: 'Old Parent', model: 'component_input_text' }]
            };
            const old_parent = await ts_object.get_instance({
                ...instance_options,
                section_id: '200',
                data: old_parent_data
            });
            await old_parent.build(false);
            await old_parent.render();

            // Mock update_parent_data
            mock_responses.set('update_parent_data', { result: true, msg: 'Updated' });

            // Set up initial state
            old_parent.add_children_item(moving_child.data);
            old_parent.children_container.appendChild(moving_child.node);

            // Trigger swap
            const result = await main_instance.swap_parent({
                moving_instance: moving_child,
                old_parent_instance: old_parent
            });

            assert.strictEqual(result, true, 'swap_parent should return true');

            // Wait for idle callback
            await delay(200);

            assert.strictEqual(moving_child.caller, main_instance, 'moving_child caller should be the new parent');
            assert.ok(main_instance.children_container.contains(moving_child.node), 'node should be moved to new container');
        });
    });

    it('FINALIZE', async function() {
        await delay(1000);
        if (main_instance) {
            await main_instance.destroy(true, true, true);
        }
        message_label_container.innerHTML += 'Extended tests complete.<br>';
    });


});
// @license-end
