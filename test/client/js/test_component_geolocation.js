// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

import { elements } from './elements.js'
import { get_instance } from '../../../core/common/js/instances.js'
import { ui } from '../../../core/common/js/ui.js'

describe('component_geolocation tests', function() {

	const element_config = elements.find(el => el.model === 'component_geolocation')
	const content_container = document.getElementById('content')

	// Helper to create instance
	async function create_geo_instance(permissions = 2) {
		const instance = await get_instance({
			...element_config,
			mode: 'edit',
			view: 'default',
			id_variant: 'test_geo_' + Math.random()
		})
		await instance.build(true)
		instance.permissions = permissions
		return instance
	}

	it('should render correctly in edit mode', async function() {
		const instance = await create_geo_instance()
		const node = await instance.render()
		content_container.appendChild(node)

		assert.exists(node.querySelector('.content_value'), 'content_value should exist')
		assert.exists(node.querySelector('.map_inputs'), 'map_inputs should exist')
		assert.exists(node.querySelector('.leaflet_map'), 'leaflet_map should exist')

		// Clean up
		node.remove()
	})

	it('should initialize current_value correctly', async function() {
		const instance = await create_geo_instance()
		await instance.render()

		assert.exists(instance.current_value[0], 'current_value[0] should be initialized')
		assert.property(instance.current_value[0], 'lat', 'should have lat property')
		assert.property(instance.current_value[0], 'lon', 'should have lon property')
	})

	it('should update current_value on input change', async function() {
		const instance = await create_geo_instance()
		const node = await instance.render()
		content_container.appendChild(node)

		const lat_input = node.querySelector('.lat')
		lat_input.value = '40.5'
		lat_input.dispatchEvent(new Event('change'))

		assert.equal(instance.current_value[0].lat, 40.5, 'lat should be updated to 40.5')
		assert.isTrue(instance.is_data_changed, 'is_data_changed should be true')

		// Clean up
		node.remove()
	})

	it('should reset values on refresh click', async function() {
		const instance = await create_geo_instance()
		const node = await instance.render()
		content_container.appendChild(node)

		const initial_lat = instance.current_value[0].lat
		const lat_input = node.querySelector('.lat')

		// Change value
		lat_input.value = '10.0'
		lat_input.dispatchEvent(new Event('change'))
		assert.equal(instance.current_value[0].lat, 10.0)

		// Refresh
		const refresh_btn = node.querySelector('.map_reload')
		refresh_btn.dispatchEvent(new Event('click'))

		assert.equal(instance.current_value[0].lat, initial_lat, 'lat should be reset to initial value')
		assert.equal(parseFloat(lat_input.value), initial_lat, 'input value should be reset')
		assert.isFalse(instance.is_data_changed, 'is_data_changed should be reset to false')

		// Clean up
		node.remove()
	})

	it('should handle non-numeric inputs gracefully', async function() {
		const instance = await create_geo_instance()
		const node = await instance.render()
		content_container.appendChild(node)

		const lat_input = node.querySelector('.lat')
		lat_input.value = 'abc'
		lat_input.dispatchEvent(new Event('change'))

		assert.isTrue(isNaN(instance.current_value[0].lat), 'lat should be NaN for non-numeric input')

		// Clean up
		node.remove()
	})

	it('should handle empty inputs gracefully', async function() {
		const instance = await create_geo_instance()
		const node = await instance.render()
		content_container.appendChild(node)

		const lat_input = node.querySelector('.lat')
		lat_input.value = ''
		lat_input.dispatchEvent(new Event('change'))

		assert.isNull(instance.current_value[0].lat, 'lat should be null for empty input')

		// Clean up
		node.remove()
	})

	it('should update altitude correctly', async function() {
		const instance = await create_geo_instance()
		const node = await instance.render()
		content_container.appendChild(node)

		const alt_input = node.querySelector('.altitude')
		alt_input.value = '150.5'
		alt_input.dispatchEvent(new Event('change'))

		assert.equal(instance.current_value[0].alt, 150.5, 'altitude should be updated to 150.5')

		// Clean up
		node.remove()
	})

	it('should render read-only view when permissions is 1', async function() {
		const instance = await create_geo_instance(1)
		const node = await instance.render()
		content_container.appendChild(node)

		assert.exists(node.querySelector('.read_only'), 'should have read_only class')
		assert.notExists(node.querySelector('.geo_active_input'), 'should not have active inputs')
		assert.notExists(node.querySelector('.map_reload'), 'should not have refresh button')

		// Clean up
		node.remove()
	})

})
