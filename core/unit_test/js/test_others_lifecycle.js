/*global it, describe, assert, page_globals */
/*eslint no-undef: "error"*/

// import {
// 	elements
// } from './elements.js'
import {get_instance} from '../../common/js/instances.js'
import {data_manager} from '../../common/js/data_manager.js'


// general values
	const section_tipo	= 'test3'
	const section_id	= 1
	const mode			= 'edit'
	const lang			= 'lg-eng'
	const permissions	= 2


// get_elelemnts
	function get_elelemnts(){

		const elements = [];

		// time_machine_list
			elements.push({
				model			: 'time_machine_list',
				tipo			: 'test52', // input text
				section_tipo	: section_tipo,
				section_id		: section_id,
				mode			: mode,
				lang			: page_globals.dedalo_data_nolan
			})

		// login
			elements.push({
				model	: 'login',
				tipo	: 'dd229',
				mode	: mode,
				lang	: lang,
				context	: async function(){
					const rqo = {
						action	: 'get_element_context',
						source	: {model : 'login'}
					}
					const login_api_response = await data_manager.request({
						body : rqo
					})
					return login_api_response.result.find(el => el.model==='login')
				}
			})
			// elements.push(login_context)


		return elements
	}//end get_elelemnts
	// throw "exit";





describe("OTHERS LIFE-CYCLE", function() {

	const elements =  get_elelemnts()
		console.log('-- > elements:', elements);

	for (let i = 0; i < elements.length; i++) {

		const element = elements[i]
		console.log('-- element:', i, element.model, element);


		describe(element.model, async function() {

			let new_instance = null

			it(`${element.model} INIT`, async function() {

				const expected = 'initiated'

				// context function case. Call and wait here
					if (element.context && typeof element.context==='function') {
						element.context = await element.context()
					}

				// init instance
					new_instance = await get_instance(element)
					console.log('init new_instance:', new_instance);

				assert.equal(new_instance.status, expected);
			});

			it(`${element.model} BUILD (autoload=true)`, async function() {

				const expected = 'builded'

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
					console.log('render new_instance:', new_instance);

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

				assert.equal(new_instance.status, expected)
				assert.deepEqual(new_instance.ar_instances, [])
				assert.deepEqual(new_instance.node, null)
			});
		});//end describe(element.model, function()
	}//end for (let i = 0; i < elements.length; i++)
});
