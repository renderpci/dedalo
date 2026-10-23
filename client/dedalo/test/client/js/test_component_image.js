// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {get_instance} from '../../../core/common/js/instances.js'
import {event_manager} from '../../../core/common/js/event_manager.js'
import {is_empty} from '../../../core/component_common/js/component_common.js'
import {ui} from '../../../core/common/js/ui.js'
import {response_data} from '../../../core/common/js/api_error.js'



// element options for component_image
	const element = elements.find(el => el.model==='component_image')
	if (!element) {
		console.error('Error: component_image not found in elements');
	}

	const section_tipo	= element.section_tipo
	const section_id	= element.section_id
	const tipo			= element.tipo
	const lang			= element.lang



// DOM containers
	const container = document.getElementById('content');

	const component_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'component_container',
		parent			: container
	})



// mode/view matrix for component_image
// edit: default, mini, viewer, print
// list: default, mini, text, mosaic, viewer
// search: default
	const mode_view_pairs = [
		{ mode: 'edit',	view: 'default'	},
		{ mode: 'edit',	view: 'mini'	},
		{ mode: 'edit',	view: 'viewer'	},
		{ mode: 'edit',	view: 'print'	},
		{ mode: 'list',	view: 'default'	},
		{ mode: 'list',	view: 'mini'	},
		{ mode: 'list',	view: 'text'	},
		{ mode: 'list',	view: 'mosaic'	},
		{ mode: 'list',	view: 'viewer'	},
		{ mode: 'search',view: 'default'	}
	]



describe(`COMPONENT_IMAGE LIFECYCLE`, function() {

	this.timeout(10000);



	// LIFECYCLE TESTS: init, build, render, destroy across all mode/view pairs
	for (let i = 0; i < mode_view_pairs.length; i++) {

		const pair = mode_view_pairs[i]

		describe(`${pair.mode} / ${pair.view}`, function() {

			let instance = null
			let node	 = null

			it(`init → build → render`, async function() {

				const options = {
					model			: 'component_image',
					tipo			: tipo,
					section_tipo	: section_tipo,
					section_id		: section_id,
					lang			: lang,
					mode			: pair.mode,
					view			: pair.view,
					id_variant		: pair.mode + '_' + pair.view + '_' + Math.random()
				}

				// init
					instance = await get_instance(options)

					assert.equal(instance.model, 'component_image', 'model expected component_image')
					assert.equal(instance.tipo, tipo, `tipo expected ${tipo}`)
					assert.equal(instance.section_tipo, section_tipo, `section_tipo expected ${section_tipo}`)
					assert.equal(instance.section_id, section_id, `section_id expected ${section_id}`)
					assert.equal(instance.mode, pair.mode, `mode expected ${pair.mode}`)
					assert.equal(instance.lang, lang, `lang expected ${lang}`)

				// build
					await instance.build(true)
					assert.equal(instance.status, 'built', 'status expected built after build')
					assert.isOk(instance.datum, 'datum expected after build')
					assert.isOk(instance.context, 'context expected after build')

				// render
					node = await instance.render()
					assert.equal(instance.status, 'rendered', 'status expected rendered after render')
					assert.isOk(node instanceof Element, 'node expected DOM Element')
			});



			it(`render output structure for ${pair.mode}/${pair.view}`, async function() {

				// insert in DOM for search mode
					if (pair.mode==='search') {
						const search_component = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'search_component',
							parent			: component_container
						})
						search_component.appendChild(node)
					}else{
						component_container.appendChild(node)
					}

				// mode-specific assertions
					if (pair.mode==='edit' && pair.view==='default') {
						// edit default: content_data with image container
						const content_data = node.querySelector('.content_data')
						assert.isOk(content_data, 'expected content_data in edit/default')
						// media_wrapper class (edit uses add_styles: ['media_wrapper'])
						assert.isOk(node.classList.contains('media_wrapper'), 'expected media_wrapper class in edit/default')
						// media_content_data class
						const media_content_data = node.querySelector('.media_content_data')
						assert.isOk(media_content_data, 'expected media_content_data in edit/default')
					}

					if (pair.mode==='edit' && pair.view==='mini') {
						// edit mini: mini wrapper
						assert.isOk(node.classList.contains('mini'), 'expected mini class in edit/mini')
					}

					if (pair.mode==='edit' && pair.view==='viewer') {
						// edit viewer: plain div with view_viewer class, no content_data
						assert.isOk(node.classList.contains('view_viewer'), 'expected view_viewer class in edit/viewer')
						assert.isOk(node.classList.contains('component_image'), 'expected component_image class in edit/viewer')
					}

					if (pair.mode==='edit' && pair.view==='print') {
						// edit print: permissions forced to 1, wrapper gets disabled_component class
						assert.isOk(node.classList.contains('disabled_component'), 'expected disabled_component class in edit/print')
					}

					if (pair.mode==='list' && pair.view==='default') {
						// list default: wrapper with list mode class
						assert.isOk(node.classList.contains('list'), 'expected list class in list/default')
						// media + media_wrapper classes (list adds both)
						assert.isOk(node.classList.contains('media'), 'expected media class in list/default')
						assert.isOk(node.classList.contains('media_wrapper'), 'expected media_wrapper class in list/default')
					}

					if (pair.mode==='list' && pair.view==='mini') {
						// list mini: mini wrapper
						assert.isOk(node.classList.contains('mini'), 'expected mini class in list/mini')
					}

					if (pair.mode==='list' && pair.view==='text') {
						// list text: span element
						assert.equal(node.nodeName, 'SPAN', 'expected SPAN node in list/text')
					}

					if (pair.mode==='list' && pair.view==='mosaic') {
						// list mosaic: wrapper with media + media_wrapper classes (no explicit mosaic class)
						assert.isOk(node.classList.contains('media'), 'expected media class in list/mosaic')
						assert.isOk(node.classList.contains('media_wrapper'), 'expected media_wrapper class in list/mosaic')
					}

					if (pair.mode==='list' && pair.view==='viewer') {
						// list viewer: plain div with view_viewer class, no content_data
						assert.isOk(node.classList.contains('view_viewer'), 'expected view_viewer class in list/viewer')
						assert.isOk(node.classList.contains('component_image'), 'expected component_image class in list/viewer')
					}

					if (pair.mode==='search') {
						// search: content_data with search container
						const content_data = node.querySelector('.content_data')
						assert.isOk(content_data, 'expected content_data in search/default')
					}
			});



			it(`destroy`, async function() {

				if (instance) {
					await instance.destroy(true)
				}

				assert.equal(instance.status, 'destroyed', 'status expected destroyed after destroy')
				assert.equal(instance.node, null, 'node expected null after destroy')
			});
		});
	}//end for (mode_view_pairs)
});



describe(`COMPONENT_IMAGE DATA OPERATIONS`, function() {

	this.timeout(10000);

	let instance	= null
	let node		= null



	it(`init → build → render (edit mode, permissions=2)`, async function() {

		const options = {
			model			: 'component_image',
			tipo			: tipo,
			section_tipo	: section_tipo,
			section_id		: section_id,
			lang			: lang,
			mode			: 'edit',
			view			: 'default',
			id_variant		: 'data_ops_' + Math.random()
		}

		instance = await get_instance(options)
		await instance.build(true)
		node = await instance.render()

		component_container.appendChild(node)

		assert.equal(instance.model, 'component_image', 'model expected component_image')
		assert.equal(instance.status, 'rendered', 'status expected rendered')
		assert.isOk(instance.datum, 'datum expected')
		assert.isOk(instance.context, 'context expected')
		assert.isOk(instance.data, 'data expected')
		assert.isOk(Array.isArray(instance.data.entries), 'data.entries expected array')
	});



	it(`data structure has files_info`, async function() {

		const entries = instance.data.entries || []

		if (entries.length > 0) {
			const entry = entries[0]
			assert.isOk(entry.files_info, 'entry expected files_info property')
			assert.isOk(Array.isArray(entry.files_info), 'files_info expected array')

			// each file_info should have quality and extension
			for (const file_info of entry.files_info) {
				assert.isOk(file_info.quality, 'file_info expected quality property')
				assert.isOk(file_info.extension, 'file_info expected extension property')
			}
		}
	});



	it(`add data via change_value (set_data)`, async function() {

		// backup original data
		const original_entries = instance.data.entries || []

		// new image data value
		const new_value = element.new_value(element.new_value_params)

		const changed_data = [Object.freeze({
			action	: 'set_data',
			value	: new_value
		})]

		const response = await instance.change_value({
			changed_data	: changed_data,
			refresh			: false
		})

		assert.isOk(response, 'change_value expected response')
		const saved = response_data(response)
		if (saved) {
			assert.isOk(saved, 'change_value payload expected ok')
		}

		// verify data was updated
		assert.isOk(instance.data, 'data expected after change_value')
	});



	it(`change data via change_value (update)`, async function() {

		const entries = instance.data.entries || []

		if (entries.length > 0) {
			// modify existing entry
			const updated_entry = {...entries[0]}
			updated_entry.original_file_name = 'updated_test_file.jpg'

			const changed_data = [Object.freeze({
				action	: 'update',
				id		: updated_entry.id || 1,
				value	: updated_entry
			})]

			const response = await instance.change_value({
				changed_data	: changed_data,
				refresh			: false
			})

			assert.isOk(response, 'change_value update expected response')
		}
	});



	it(`remove data via change_value (remove)`, async function() {

		const entries = instance.data.entries || []

		if (entries.length > 0) {
			const entry_to_remove = entries[entries.length - 1]

			const changed_data = [Object.freeze({
				action	: 'remove',
				id		: entry_to_remove.id || 1,
				value	: null
			})]

			const response = await instance.change_value({
				changed_data	: changed_data,
				refresh			: false,
				remove_dialog 	: () => true
			})

			assert.isOk(response, 'change_value remove expected response')
		}
	});



	it(`refresh rebuilds component from saved state`, async function() {

		const result = await instance.refresh()

		assert.equal(result, true, 'refresh expected true')
		assert.equal(instance.status, 'rendered', 'status expected rendered after refresh')
		assert.isOk(instance.data, 'data expected after refresh')
	});



	it(`is_empty returns boolean`, async function() {

		const result = is_empty(instance)

		assert.equal(typeof result, 'boolean', 'is_empty expected boolean')
	});



	it(`instance id is set`, async function() {

		assert.isOk(instance.id, 'instance id expected to be set')
		assert.equal(typeof instance.id, 'string', 'instance id expected string')
	});



	it(`quality available via context`, async function() {

		// quality is not always set as direct property, fallback to context.features.quality
		const quality = instance.quality || instance.context?.features?.quality
		assert.isOk(quality, 'quality expected to be available via instance or context.features')
	});



	it(`destroy after data operations`, async function() {

		if (instance) {
			await instance.destroy(true)
		}

		assert.equal(instance.status, 'destroyed', 'status expected destroyed')
		assert.equal(instance.node, null, 'node expected null after destroy')

		// clean DOM
			while (component_container.firstChild) {
				component_container.removeChild(component_container.firstChild)
			}
	});
});



describe(`COMPONENT_IMAGE SEARCH DATA OPERATIONS`, function() {

	this.timeout(10000);

	let instance	= null
	let node		= null



	it(`init → build → render (search mode)`, async function() {

		const options = {
			model			: 'component_image',
			tipo			: tipo,
			section_tipo	: section_tipo,
			section_id		: section_id,
			lang			: lang,
			mode			: 'search',
			view			: 'default',
			id_variant		: 'search_ops_' + Math.random()
		}

		instance = await get_instance(options)
		await instance.build(true)
		node = await instance.render()

		const search_component = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'search_component',
			parent			: component_container
		})
		search_component.appendChild(node)

		assert.equal(instance.model, 'component_image', 'model expected component_image')
		assert.equal(instance.status, 'rendered', 'status expected rendered')
	});



	it(`search mode data structure`, async function() {

		assert.isOk(instance.data, 'data expected in search mode')
		assert.isOk(Array.isArray(instance.data.entries), 'data.entries expected array in search mode')
	});



	it(`destroy search instance`, async function() {

		if (instance) {
			await instance.destroy(true)
		}

		assert.equal(instance.status, 'destroyed', 'status expected destroyed')

		// clean DOM
			while (component_container.firstChild) {
				component_container.removeChild(component_container.firstChild)
			}
	});
});


describe(`COMPONENT_IMAGE VECTOR EDITOR`, function() {

	this.timeout(10000);



	it(`load_data reads the SVG2 href of the raster (SVG-Edit 7 export)`, async function() {

		// lazy import: the svgcanvas bundle is heavy and only needed here
		const {vector_editor} = await import('../../../core/component_image/js/vector_editor.js')

		const href = '/dedalo/media/image/1.5MB/0/rsc29_rsc170_1.jpg'

		// an editor export links the raster with SVG2 href (no xmlns:xlink)
		const image_node = document.createElementNS('http://www.w3.org/2000/svg', 'image')
		image_node.setAttribute('href', href)

		const editor = new vector_editor()
		editor.image_definition = {}
		editor.stage = {
			getCurrentDrawing : () => ({
				createLayer			: () => ({}),
				getCurrentLayer		: () => ({})
			}),
			renameCurrentLayer		: () => {},
			addSVGElementsFromJson	: () => image_node
		}

		editor.load_data({
			ar_layers		: [],
			get_lib_data	: () => ([{
				layer_id	: 0,
				name		: 'layer_0',
				layer_data	: [{ element: 'image', attr: { href } }]
			}])
		})

		// src null here made the save handler "restore" it as href="null"
		assert.equal(editor.image_definition.src, href, 'image_definition.src expected the raster href')
	})



	it(`Delete shortcut removes single and multiple selections, ignores text fields`, async function() {

		const {vector_editor} = await import('../../../core/component_image/js/vector_editor.js')

		let deleted = 0
		let selection = []
		const editor = new vector_editor()
		editor.stage = {
			getSelectedElements		: () => selection,
			deleteSelectedElements	: () => { deleted++ }
		}
		editor.keyboard_shortcuts()

		const keydown = (target) => target.dispatchEvent(
			new KeyboardEvent('keydown', { key:'Delete', bubbles:true })
		)

		// single selection (what one click leaves on the stage)
		selection = [{}]
		keydown(document.body)
		assert.equal(deleted, 1, 'single selection expected deleted')

		// multi-selection: selected_element is null, the stage selection is not
		selection = [{}, {}]
		keydown(document.body)
		assert.equal(deleted, 2, 'multi selection expected deleted')

		// focus on the image quality select must not block Delete
		const select = document.createElement('select')
		document.body.appendChild(select)
		keydown(select)
		assert.equal(deleted, 3, 'Delete expected with focus on a select')

		// a text field keeps its own Delete key
		const input = document.createElement('input')
		document.body.appendChild(input)
		keydown(input)
		assert.equal(deleted, 3, 'Delete must not fire from an input')

		input.remove()
		select.remove()
		editor.destroy()
	})



	it(`reset_raster keeps the image and drops only the annotations`, async function() {

		const {vector_editor} = await import('../../../core/component_image/js/vector_editor.js')

		const make_node = (nodeName) => document.createElementNS('http://www.w3.org/2000/svg', nodeName)
		const title	= make_node('title')
		const image	= make_node('image')
		const rect	= make_node('rect')

		const calls = { selected:null, deleted:0, added:0, current:[], layer_deleted:false, add_attrs:null }
		const group = {
			children		: [title, image, rect],
			querySelector	: (selector) => selector==='image' ? image : null
		}
		const drawing = {
			// legacy data names layer 0 'raster'; the group is really layer_0
			getLayerByName			: (name) => name==='layer_0' ? group : null,
			getCurrentLayerName		: () => 'layer_1',
			setCurrentLayer			: (name) => { calls.current.push(name) }
		}
		const editor = new vector_editor()
		// width/height are the mutable container size; user_* are the authored
		// SVG units the restored raster must keep
		editor.image_definition = { src:'data:,', width:10, height:10, user_width:700, user_height:500 }
		editor.stage = {
			getCurrentDrawing		: () => drawing,
			getResolution			: () => ({ w:640, h:480 }),
			leaveContext			: () => {},
			deleteCurrentLayer		: () => { calls.layer_deleted = true },
			selectOnly				: (elements) => { calls.selected = elements },
			deleteSelectedElements	: () => { calls.deleted++ },
			addSVGElementsFromJson	: (json) => {
				calls.added++
				calls.add_attrs = json.attr
				return make_node('image')
			},
			setHref					: () => {}
		}

		const ok = editor.reset_raster({ layer_id:0, name:'raster' })

		assert.isTrue(ok, 'reset_raster expected true when the group exists')
		assert.equal(calls.selected.length, 1, 'only the annotation expected selected')
		assert.equal(calls.selected[0], rect, 'selected element expected the annotation')
		assert.equal(calls.deleted, 1, 'annotation expected deleted')
		assert.equal(calls.added, 0, 'existing image must not be recreated')
		assert.isFalse(calls.layer_deleted, 'the raster layer itself must not be deleted')

		// the user had deleted the image element too: the raster is recreated
		group.children		= [title]
		group.querySelector	= () => null
		editor.reset_raster({ layer_id:0, name:'raster' })

		assert.equal(calls.added, 1, 'missing image expected recreated')
		assert.equal(calls.add_attrs.width, 700, 'image width expected the authored user units')
		assert.equal(calls.add_attrs.height, 500, 'image height expected the authored user units')
		assert.deepEqual(calls.current, ['layer_0','layer_1'], 'raster targeted then previous layer restored')

		// legacy state without authored units falls back to the document resolution
		editor.image_definition.user_width = undefined
		editor.image_definition.user_height = undefined
		editor.reset_raster({ layer_id:0, name:'raster' })

		assert.equal(calls.added, 2, 'image expected recreated again')
		assert.equal(calls.add_attrs.width, 640, 'fallback width expected the document resolution')
		assert.equal(calls.add_attrs.height, 480, 'fallback height expected the document resolution')
	})



	it(`remove_layer splices the data in place and keeps a valid active layer`, async function() {

		const {vector_editor} = await import('../../../core/component_image/js/vector_editor.js')

		const ar_layers = [
			{ layer_id:0, name:'layer_0' },
			{ layer_id:1, name:'layer_1' },
			{ layer_id:2, name:'layer_2' }
		]

		const calls = { current:[], deleted:0 }
		let drawing_current = 'layer_2'
		const drawing = {
			setCurrentLayer		: (name) => { calls.current.push(name); return true },
			getCurrentLayerName	: () => drawing_current
		}
		const editor = new vector_editor()
		editor.active_layer = ar_layers[2]
		editor.stage = {
			getCurrentDrawing	: () => drawing,
			deleteCurrentLayer	: () => { calls.deleted++; return true }
		}

		const published = []
		event_manager.subscribe_once(
			'active_layer_remove_test',
			(layer) => published.push(layer)
		)

		// delete a layer that is NOT the active one: the active layer survives
		const ok = editor.remove_layer({ ar_layers, id:'remove_test' }, ar_layers[1])

		assert.isTrue(ok, 'remove_layer expected true')
		assert.equal(calls.deleted, 1, 'SvgCanvas layer expected deleted')
		assert.deepEqual(ar_layers.map(layer => layer.layer_id), [0, 2], 'data spliced in place')
		assert.equal(editor.active_layer, ar_layers[1], 'surviving active layer expected kept')
		assert.equal(calls.current[calls.current.length-1], 'layer_2', 'drawing expected on the active layer')
		assert.equal(published[published.length-1], ar_layers[1], 'active layer expected published')
		assert.equal(editor._layer_snapshots.get('layer_1')?.layer_id, 1, 'removed layer expected snapshotted for undo')

		// delete the active layer: fall back to what SvgCanvas left current
		drawing_current = 'layer_0'
		editor.remove_layer({ ar_layers, id:'remove_test' }, ar_layers[1])

		assert.deepEqual(ar_layers.map(layer => layer.layer_id), [0], 'last vector layer removed')
		assert.equal(editor.active_layer, ar_layers[0], 'raster expected as fallback')
		assert.equal(calls.current[calls.current.length-1], 'layer_0', 'drawing expected on the fallback layer')
	})



	it(`undo/redo shortcuts map Cmd/Ctrl+Z and ignore text fields`, async function() {

		const {vector_editor} = await import('../../../core/component_image/js/vector_editor.js')

		let undo = 0
		let redo = 0
		const editor = new vector_editor()
		editor.undo = () => { undo++ }
		editor.redo = () => { redo++ }
		editor.keyboard_shortcuts()

		const keydown = (options, target = document.body) => target.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles:true, ...options })
		)

		keydown({ key:'z', metaKey:true })
		assert.equal(undo, 1, 'Cmd+Z expected undo')
		keydown({ key:'z', ctrlKey:true })
		assert.equal(undo, 2, 'Ctrl+Z expected undo')
		keydown({ key:'z', metaKey:true, shiftKey:true })
		assert.equal(redo, 1, 'Shift+Cmd+Z expected redo')
		keydown({ key:'z', ctrlKey:true, shiftKey:true })
		assert.equal(redo, 2, 'Ctrl+Shift+Z expected redo')
		keydown({ key:'y', ctrlKey:true })
		assert.equal(redo, 3, 'Ctrl+Y expected redo')

		// a text field keeps its native undo
		const input = document.createElement('input')
		document.body.appendChild(input)
		keydown({ key:'z', metaKey:true }, input)
		assert.equal(undo, 2, 'text field must keep native undo')

		input.remove()
		editor.destroy()
	})



	it(`sync_layer_descriptors restores and removes layers with the canvas history`, async function() {

		const {vector_editor} = await import('../../../core/component_image/js/vector_editor.js')

		const layer_node = (name) => ({ getName: () => name })
		const drawing = {
			identifyLayers		: () => {},
			all_layers			: [layer_node('layer_0'), layer_node('layer_1')],
			getCurrentLayerName	: () => 'layer_1',
			setCurrentLayer		: (name) => { drawing.current = name; return true }
		}
		const editor = new vector_editor()
		editor.stage = { getCurrentDrawing: () => drawing }
		const self = { ar_layers: [{ layer_id:0, name:'layer_0' }], id:'sync_test' }
		editor.active_layer = self.ar_layers[0]
		editor._layer_snapshots.set('layer_1', { layer_id:1, name:'layer_1', layer_color:'#fff' })

		// undo of a layer delete: the DOM layer is back, the descriptor is not
		assert.isTrue(editor.sync_layer_descriptors(self))
		assert.deepEqual(self.ar_layers.map(layer => layer.name), ['layer_0','layer_1'])
		assert.equal(drawing.current, 'layer_0', 'surviving active layer expected current')

		// redo of the layer delete: the DOM layer is gone, the descriptor is not
		drawing.all_layers			= [layer_node('layer_0')]
		drawing.getCurrentLayerName	= () => 'layer_0'
		editor.active_layer			= self.ar_layers[1]
		assert.isTrue(editor.sync_layer_descriptors(self))
		assert.deepEqual(self.ar_layers.map(layer => layer.name), ['layer_0'])
		assert.equal(editor._layer_snapshots.get('layer_1')?.layer_id, 1)
		assert.equal(editor.active_layer, self.ar_layers[0], 'active expected to follow the drawing')

		// redo of the layer add: the descriptor comes back from the snapshot
		drawing.all_layers = [layer_node('layer_0'), layer_node('layer_1')]
		assert.isTrue(editor.sync_layer_descriptors(self))
		assert.deepEqual(self.ar_layers.map(layer => layer.name), ['layer_0','layer_1'])
	})



	it(`add_layer records a Create Layer command and skips ids held by undo snapshots`, async function() {

		const {vector_editor} = await import('../../../core/component_image/js/vector_editor.js')

		const group = { id:'' }
		const calls = { created:null }
		const drawing = { getCurrentLayer: () => group }
		const editor = new vector_editor()
		editor.stage = {
			getCurrentDrawing	: () => drawing,
			createLayer			: (name) => { calls.created = name }
		}
		const self = { ar_layers: [{ layer_id:0, name:'layer_0' }], id:'add_test' }
		const layer = editor.add_layer(self)

		assert.equal(calls.created, 'layer_1', 'stage wrapper expected (history-recording)')
		assert.equal(layer.name, 'layer_1')
		assert.equal(group.id, 'layer_1')
		assert.equal(editor.active_layer, layer)

		// a layer kept by an undo snapshot must not be reused
		editor._layer_snapshots.set('layer_1', { layer_id:1, name:'layer_1' })
		const self2 = { ar_layers: [{ layer_id:0, name:'layer_0' }], id:'add_test' }
		const layer2 = editor.add_layer(self2)
		assert.equal(layer2.layer_id, 2, 'reserved snapshot id expected skipped')
		assert.equal(layer2.name, 'layer_2')
	})



	it(`real SvgCanvas history: one draw is one undo, and redo restores it`, async function() {

		const {vector_editor} = await import('../../../core/component_image/js/vector_editor.js')
		const {default: SvgCanvas} = await import('../../../lib/svgedit/dist/svgcanvas.js')

		const container = document.createElement('div')
		document.body.appendChild(container)
		const stage = new SvgCanvas(container, {
			initFill	: { color:'FFFFFF', opacity:1 },
			initStroke	: { color:'000000', opacity:1, width:1 },
			text		: { stroke_width:0, font_size:24, font_family:'serif' },
			initOpacity	: 1,
			imgPath		: '',
			dimensions	: [100, 100],
			baseUnit	: 'px'
		})
		const rect = stage.addSVGElementsFromJson({
			element	: 'rect',
			attr	: { x:1, y:1, width:10, height:10, id:'undo_test' }
		})
		// the shape's transient setup the library records before the insert
		const opacity = new stage.history.BatchCommand('Change opacity')
		opacity.addSubCommand(new stage.history.ChangeElementCommand(rect, { opacity:'1' }))
		stage.undoMgr.addCommandToHistory(opacity)
		stage.undoMgr.addCommandToHistory(new stage.history.InsertElementCommand(rect))

		const editor = new vector_editor()
		editor.stage = stage
		editor.compact_history()
		assert.equal(stage.undoMgr.getUndoStackSize(), 1, 'transient opacity command expected dropped')

		editor.undo()
		assert.isNull(document.getElementById('undo_test'), 'undo expected to remove the shape')
		editor.redo()
		assert.isOk(document.getElementById('undo_test'), 'redo expected to restore the shape')

		container.remove()
	})
})



// @license-end
