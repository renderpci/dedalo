// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals */
/*eslint no-undef: "error"*/

// import {
// 	elements
// } from './elements.js'
import {get_instance, get_all_instances} from '../../common/js/instances.js'



// general values
	const section_tipo	= 'test3'
	const section_id	= 1
	const mode			= 'edit'
	const lang			= 'lg-eng'
	const permissions	= 2


// get_elelemnts
	function get_elelemnts(){

		const elements = [];

		// login
			elements.push({
				model	: 'login',
				tipo	: 'dd229',
				mode	: mode,
				lang	: lang
			})

		// install
			// const install_context = await (async function(){
			// 	const rqo = {
			// 		action	: 'get_element_context',
			// 		source	: {model : 'install'}
			// 	}
			// 	const install_api_response = await data_manager.request({
			// 		body : rqo
			// 	})
			// 	return install_api_response.result
			// 		? install_api_response.result.find(el => el.model==='install')
			// 		: {}
			// })()
			elements.push({
				model	: 'install',
				tipo	: 'dd1590',
				mode	: 'install',
				lang	: lang,
				// context	: async function(){
				// 	const rqo = {
				// 		action	: 'get_element_context',
				// 		source	: {model : 'install'}
				// 	}
				// 	const install_api_response = await data_manager.request({
				// 		body : rqo
				// 	})
				// 	console.log('install_api_response:', install_api_response);
				// 	return install_api_response.result
				// 		? install_api_response.result.find(el => el.model==='install')
				// 		: {}
				// }
			})

		// menu
			elements.push({
				model	: 'menu',
				lang	: lang
			})

		// page
			elements.push({
				model	: 'page',
				menu	: true
			})


		return elements
	}//end get_elelemnts



describe("OTHERS LIFE-CYCLE", async function() {

	const elements =  get_elelemnts()

	for (let i = 0; i < elements.length; i++) {

		const element = elements[i]
		// console.log('-- element:', i, element.model, element);


		describe(element.model, async function() {

			let new_instance = null

			it(`${element.model} INIT`, async function() {

				const expected = 'initialized'

				// context function case. Call and wait here
					if (element.context && typeof element.context==='function') {
						element.context = await element.context()
					}

					const options = {
						id_variant		: Math.random() + '-' + Math.random(),
						lang			: element.lang,
						mode			: 'edit',
						model			: element.model,
						section_id		: element.section_id,
						section_tipo	: element.section_tipo,
						tipo			: element.tipo,
						view			: element.view,
						context			: element.context || null
					}

				// init instance
					new_instance = await get_instance(options)
					// console.log('init new_instance:', new_instance);

				assert.equal(new_instance.status, expected);
			});

			it(`${element.model} BUILD (autoload=true)`, async function() {

				const expected = 'built'

				// init instance
					await new_instance.build(true)
					console.log('build new_instance:', new_instance);
					if (element.context) {
						new_instance.context = element.context
					}

				assert.equal(new_instance.status, expected);
			});

			it(`${element.model} RENDER`, async function() {

				const expected = 'rendered'

				// init instance
					await new_instance.render()
					// console.log('render new_instance:', new_instance);

				assert.equal(new_instance.status, expected);
			});

			it(`${element.model} DESTROY`, async function() {

				const expected = 'destroyed'

				// init instance
					await new_instance.destroy(
						true,  // delete_self . default true
						true, // delete_dependencies . default false
						true // remove_dom . default false
					)

				const all_instances = get_all_instances()

				assert.equal(new_instance.status, expected)
				assert.deepEqual(new_instance.ar_instances, [])
				assert.deepEqual(new_instance.node, null)
				assert.deepEqual(new_instance.events_tokens, [])
				assert.deepEqual(all_instances, [])
			});
		});//end describe(element.model, function()
	}//end for (let i = 0; i < elements.length; i++)
});



// @license-end
