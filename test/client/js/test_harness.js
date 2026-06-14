// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0

/**
 * TEST_HARNESS
 * Shared helpers for component lifecycle tests.
 */

import {get_instance} from '../../../core/common/js/instances.js'
import {ui} from '../../../core/common/js/ui.js'

/** Standard mode/view matrix used across lifecycle tests */
export const lifecycle_matrix = {
	edit   : ['default', 'line'],
	list   : ['default'],
	search : ['default']
}

/**
 * BUILD_INSTANCE_OPTIONS
 * Merge element definition with runtime mode/view overrides.
 */
export function build_instance_options(element, mode, view, overrides = {}) {
	return {
		id_variant   : `${mode}_${view}_${Math.random()}`,
		lang         : element.lang,
		mode,
		model        : element.model,
		section_id   : element.section_id,
		section_tipo : element.section_tipo,
		tipo         : element.tipo,
		view,
		...overrides
	}
}

/**
 * CREATE_COMPONENT_CONTAINER
 * Returns a DOM container under #content for component render tests.
 */
export function create_component_container(class_name = 'component_container') {
	const container = document.getElementById('content')
	return ui.create_dom_element({
		element_type : 'div',
		class_name,
		parent       : container
	})
}

/**
 * BUILD_RENDER_COMPONENT
 * Instantiate, build, and render a component; append node to container.
 */
export async function build_render_component(options, container) {
	const component = await get_instance(options)
	await component.build(true)
	const node = await component.render()
	if (container && node) {
		container.appendChild(node)
	}
	return component
}

/**
 * RUN_LIFECYCLE_MATRIX
 * Generates describe/it blocks for init → render → destroy across mode/view pairs.
 */
export function run_lifecycle_matrix({ label, element, container, matrix = lifecycle_matrix, timeout = 4000 }) {
	for (const [mode, views] of Object.entries(matrix)) {
		for (const view of views) {
			describe(`${label} ${mode}/${view}`, function() {
				this.timeout(timeout)
				let component

				it('init build render', async function() {
					const options = build_instance_options(element, mode, view)
					component = await build_render_component(options, container)
					assert.equal(component.model, element.model)
					assert.equal(component.tipo, element.tipo)
					assert.equal(component.section_tipo, element.section_tipo)
					assert.equal(component.section_id, element.section_id)
					assert.equal(component.mode, mode)
					assert.equal(component.status, 'rendered')
					assert.equal(component.node instanceof Element, true)
				})

				it('destroy', async function() {
					await component.destroy(true)
					assert.equal(component.status, 'destroyed')
					assert.equal(component.node, null)
				})
			})
		}
	}
}

// @license-end
