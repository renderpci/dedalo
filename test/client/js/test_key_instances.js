// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	section_tipo,
	section_id,
	mode,
	lang
} from './elements.js'
import {
	key_instances_builder
} from '../../../core/common/js/instances.js'




describe("INSTANCES : KEY_INSTANCES (USING KEY_INSTANCES_BUILDER)", function() {

	function make_test (elements, expected) {
		it(`${JSON.stringify(elements)} => '${expected}'`, async function() {
			assert.equal( key_instances_builder(elements), expected);
		});
	}

	const model	= 'component_input_text'
	const tipo	= 'test52'

	// keys: ['model','tipo','section_tipo','section_id','mode','lang']

	describe("Builds instance key based on options (using component_input_text)", function() {

		// using section_id value as int
			make_test(
				{
					"model"			: model,
					"tipo"			: tipo,
					"section_tipo"	: section_tipo,
					"section_id"	: section_id,
					"mode"			: mode,
					"lang"			: lang
				},
				`${model}_${tipo}_${section_tipo}_${section_id}_${mode}_${lang}` // expected like 'component_input_text_test52_test65_1_edit_lg-eng'
			);

		// using null as section_id value
			make_test(
				{
					"model"			: model,
					"tipo"			: tipo,
					"section_tipo"	: section_tipo,
					"section_id"	: null,
					"mode"			: mode,
					"lang"			: lang
				},
				`${model}_${tipo}_${section_tipo}_${mode}_${lang}` // expected like 'component_input_text_test52_test65_edit_lg-eng'
			);

		// without receive some vars like section_id and lang
			make_test(
				{
					"model"			: model,
					"tipo"			: tipo,
					"section_tipo"	: section_tipo,
					"section_id"	: null,
					"mode"			: mode,
					"lang"			: null
				},
				`${model}_${tipo}_${section_tipo}_${mode}` // expected like 'component_input_text_test52_test65_edit'
			);
	});
});



// @license-end
