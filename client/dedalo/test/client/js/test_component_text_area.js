// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {elements} from './elements.js'
import {get_instance} from '../../../core/common/js/instances.js'
import {is_empty} from '../../../core/component_common/js/component_common.js'
import {ui} from '../../../core/common/js/ui.js'

const container = document.getElementById('content');
const component_container = ui.create_dom_element({element_type:'div',class_name:'component_container',parent:container})
const component_options = elements.find(el => el.model==='component_text_area')
const section_tipo = 'test3'
const section_id = 1

describe(`COMPONENT_TEXT_AREA LIFECYCLE`, function() {
	this.timeout(4000);
	let component
	const pairs = [{mode:'edit',view:'default'},{mode:'edit',view:'line'},{mode:'list',view:'default'},{mode:'search',view:'default'}]
	pairs.forEach(pair => {
		describe(`${pair.mode}/${pair.view}`, function() {
			it(`init build render`, async function() {
				const options = Object.assign({}, component_options, {section_id:section_id,mode:pair.mode,view:pair.view,tipo:'test17',section_tipo:section_tipo});
				component = await get_instance(options)
				await component.build(true)
				const node = await component.render()
				component_container.appendChild(node)
				assert.equal(component.model,'component_text_area')
				assert.equal(component.tipo,'test17')
				assert.equal(component.section_tipo,section_tipo)
				assert.equal(component.section_id,section_id)
				assert.equal(component.mode,pair.mode)
				assert.equal(component.status,'rendered')
				assert.equal((node instanceof Element),true)
			});
			it(`render output`, async function() {
				assert.equal((component.node instanceof Element),true)
				assert.equal(component.node.classList.contains('component_text_area'),true)
			});
			it(`destroy`, async function() {
				await component.destroy(true)
				assert.equal(component.status,'destroyed')
				assert.equal(component.node,null)
			});
		});
	});
});

describe(`COMPONENT_TEXT_AREA DATA`, function() {
	this.timeout(4000);
	let component
	it(`init build render edit`, async function() {
		const options = Object.assign({}, component_options, {section_id:section_id,mode:'edit',view:'default',tipo:'test17',section_tipo:section_tipo,permissions:2});
		component = await get_instance(options)
		await component.build(true)
		const node = await component.render()
		component_container.appendChild(node)
		assert.equal(component.status,'rendered')
		assert.equal((node instanceof Element),true)
	});
	it(`data entries`, async function() {
		assert.equal(Array.isArray(component.data.entries),true)
	});
	it(`add data`, async function() {
		await component.change_value({
			changed_data: [{
				action: 'set_data',
				value: [{id:1, value:'Test text', lang:component.lang}]
			}]
		})
		assert.equal(component.data.entries.length>0, true)
	});
	it(`update data`, async function() {
		await component.change_value({
			changed_data: [{
				action: 'update',
				id: 1,
				value: {id:1, value:'Updated text', lang:component.lang}
			}]
		})
		assert.equal(component.data.entries.length>0, true)
	});
	it(`remove data`, async function() {
		await component.change_value({
			changed_data: [{
				action: 'remove',
				id: 1,
				value: null
			}]
		})
		assert.equal(component.data.entries.length, 0)
	});
	it(`refresh`, async function() {
		await component.refresh({autoload:false})
		assert.equal(component.status,'rendered')
	});
	it(`is_empty`, async function() {
		assert.equal(typeof is_empty(component),'boolean')
	});
	it(`id set`, async function() {
		assert.equal(typeof component.id,'string')
		assert.equal(component.id.length>0,true)
	});
	it(`destroy data`, async function() {
		await component.destroy(true)
		assert.equal(component.status,'destroyed')
		assert.equal(component.node,null)
	});
});

describe(`COMPONENT_TEXT_AREA SEARCH`, function() {
	this.timeout(4000);
	let component
	it(`init build render search`, async function() {
		const options = Object.assign({}, component_options, {section_id:section_id,mode:'search',view:'default',tipo:'test17',section_tipo:section_tipo});
		component = await get_instance(options)
		await component.build(true)
		const node = await component.render()
		component_container.appendChild(node)
		assert.equal(component.model,'component_text_area')
		assert.equal(component.mode,'search')
		assert.equal(component.status,'rendered')
		assert.equal((node instanceof Element),true)
	});
	it(`search data structure`, async function() {
		assert.equal(Array.isArray(component.data.entries),true)
	});
	it(`destroy search`, async function() {
		await component.destroy(true)
		assert.equal(component.status,'destroyed')
		assert.equal(component.node,null)
	});
});
// @license-end
