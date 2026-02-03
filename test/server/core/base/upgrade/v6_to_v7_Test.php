<?php declare(strict_types=1);
require_once dirname(dirname(dirname(dirname(__FILE__)))) . '/bootstrap.php';
require_once dirname(dirname(dirname(dirname(dirname(dirname(__FILE__)))))) . '/core/base/upgrade/class.v6_to_v7.php';

final class v6_to_v7_Test extends BaseTestCase {

    public function test_process_matrix_row_data_misc_fallback() {

        $table = 'matrix_test';
        $section_tipo = 'dd123';
        $section_id = 1;

        // Pass an empty map so any model resolved will fallback to MISC
        $value_type_map = (object)[];

        $response = new stdClass();
        $response->errors = [];

        // Prepare sample data with a likely valid key format 'dd1'
        // We assume 'dd1' is structurally valid (dd + number)
        // to pass the ontology_node validation even if not in DB.
        // If strict DB, we depend on test DB state.
        $datos = [
            'components' => (object)[
                'dd1' => (object)[
                    'dato' => (object)[
                        'lg-spa' => ['Test Value']
                    ]
                ]
            ],
            'created_date' => '2023-01-01 00:00:00',
            'created_by_userID' => 1
        ];

        $result = v6_to_v7::process_matrix_row_data(
            $datos,
            $table,
            $section_tipo,
            $section_id,
            $value_type_map,
            $response
        );

        $this->assertIsObject($result);

        // 1. Verify general data mapping
        $this->assertObjectHasProperty('data', $result);
        $data_obj = $result->data;

        $this->assertEquals(1, $data_obj->created_by_user_id, 'created_by_userID should be renamed to created_by_user_id');
        $this->assertEquals('2023-01-01 00:00:00', $data_obj->created_date);

        // 2. Verify fallback to misc
        $this->assertObjectHasProperty('misc', $result);
        $misc_obj = $result->misc;

        $this->assertNotEmpty((array)$misc_obj, 'Should have content in misc due to fallback');
        $this->assertTrue(property_exists($misc_obj, 'dd1'));
        $this->assertEquals('Test Value', $misc_obj->dd1[0]->value);

        // 3. Verify meta count
        $this->assertObjectHasProperty('meta', $result);
        $meta_obj = $result->meta;

        $this->assertEquals(1, $meta_obj->dd1[0]->count);
    }

    public function test_process_matrix_row_data_relations() {
        $table = 'matrix_test';
        $section_tipo = 'dd123';
        $section_id = 1;
        $value_type_map = v6_to_v7::get_value_type_map();
        $response = new stdClass();
        $response->errors = [];

        $datos = [
            'relations' => [
                (object)[
                    'from_component_tipo' => 'dd1', // Use dd1 as valid format
                    'section_id' => 10,
                    'section_tipo' => 'dd_target_tipo'
                ]
            ]
        ];

        $result = v6_to_v7::process_matrix_row_data(
            $datos,
            $table,
            $section_tipo,
            $section_id,
            $value_type_map,
            $response
        );

        $this->assertObjectHasProperty('relation', $result);
        $rel_obj = $result->relation;

        $this->assertTrue(property_exists($rel_obj, 'dd1'));
        $this->assertEquals(10, $rel_obj->dd1[0]->section_id);
        $this->assertEquals(1, $rel_obj->dd1[0]->id, "Relation ID/Order should be assigned");

        // Meta should also track relations count
        $this->assertObjectHasProperty('meta', $result);
        $meta_obj = $result->meta;

        $this->assertEquals(1, $meta_obj->dd1[0]->count);
    }

    public function test_process_matrix_row_data_invalid_input() {
        $table = 'matrix_test';
        $section_tipo = 'dd123';
        $section_id = 1;
        $value_type_map = v6_to_v7::get_value_type_map();
        $response = new stdClass();
        $response->errors = [];

        // Missing 'dato' in component
        // Use 'dd1' again to pass tipo validation
        $datos = [
            'components' => (object)[
                'dd1' => (object)[
                    'some_garbage' => 'value'
                ]
            ]
        ];

        $result = v6_to_v7::process_matrix_row_data(
            $datos,
            $table,
            $section_tipo,
            $section_id,
            $value_type_map,
            $response
        );

        // Should produce an error
        $this->assertNotEmpty($response->errors);
        $this->assertStringContainsString('Bad component data', $response->errors[0]);
    }

    public function test_get_value_type_map() {
        $map = v6_to_v7::get_value_type_map();
        $this->assertIsObject($map);
        $this->assertObjectHasProperty('component_input_text', $map);
        $this->assertEquals(DEDALO_VALUE_TYPE_STRING, $map->component_input_text);
    }

}
