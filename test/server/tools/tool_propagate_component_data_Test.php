<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class tool_propagate_component_data_test extends BaseTestCase {

    public static $section_tipo   = 'test3';
    public static $component_tipo = 'test52'; // component_input_text
    public static $lang           = 'lg-spa';

    /**
    * TEST_USER_LOGIN
    */
    public function test_user_login() : void {
        $user_id = TEST_USER_ID;
        if (login::is_logged() === false) {
            login_test::force_login($user_id);
        }
        $this->assertTrue(login::is_logged() === true, 'expected login true');
    }

    /**
    * CREATE_TEST_RECORD
    */
    private function create_test_record() : int {
        $this->test_user_login();
        $section = section::get_instance(self::$section_tipo, 'edit', false);
        return $section->create_record();
    }

    /**
    * TEST_PROPAGATE_COMPONENT_DATA_ADD
    */
    public function test_propagate_component_data_add() : void {
        $section_id = $this->create_test_record();

        $options = new stdClass();
        $options->section_tipo          = self::$section_tipo;
        $options->component_tipo        = self::$component_tipo;
        $options->action                = 'add';
        $options->lang                  = self::$lang;
        $options->propagate_data_value  = [(object)['lang' => self::$lang, 'value' => 'Test Value Add']];
        $options->bulk_process_label    = 'Test Bulk Add';
        $options->total                 = 1;

        // Build SQO targeting only the new record
        $sqo = new stdClass();
        $sqo->section_tipo = self::$section_tipo;
        $sqo->filter = (object)[
            '$and' => [
                (object)[
                    'q' => $section_id,
                    'path' => [
                        (object)[
                            'section_tipo' => self::$section_tipo,
                            'component_tipo' => 'test102', // component_section_id
                            'model' => 'component_section_id'
                        ]
                    ]
                ]
            ]
        ];
        $options->sqo = $sqo;

        $response = tool_propagate_component_data::propagate_component_data($options);

        $this->assertTrue($response->result, 'Expected result true. Msg: ' . ($response->msg ?? ''));
        $this->assertEquals(1, $response->counter, 'Expected 1 record processed');

        // Verify data
        $model = ontology_node::get_model_by_tipo(self::$component_tipo, true);
        $component = component_common::get_instance($model, self::$component_tipo, $section_id, 'list', self::$lang, self::$section_tipo);
        $data = $component->get_data();

        $this->assertIsArray($data);
        $found = false;
        foreach ($data as $item) {
            if ($item->lang === self::$lang && $item->value === 'Test Value Add') {
                $found = true;
                break;
            }
        }
        $this->assertTrue($found, 'Component data should contain the added value');
    }

    /**
    * TEST_PROPAGATE_COMPONENT_DATA_REPLACE
    */
    public function test_propagate_component_data_replace() : void {
        $section_id = $this->create_test_record();

        // Setup initial data
        $model = ontology_node::get_model_by_tipo(self::$component_tipo, true);
        $component = component_common::get_instance($model, self::$component_tipo, $section_id, 'edit', self::$lang, self::$section_tipo);
        $initial_data = [(object)['lang' => self::$lang, 'value' => 'Initial Value']];
        $component->set_data($initial_data);
        $component->save();

        $options = new stdClass();
        $options->section_tipo          = self::$section_tipo;
        $options->component_tipo        = self::$component_tipo;
        $options->action                = 'replace';
        $options->lang                  = self::$lang;
        $options->propagate_data_value  = [(object)['lang' => self::$lang, 'value' => 'Replaced Value']];
        $options->bulk_process_label    = 'Test Bulk Replace';
        $options->total                 = 1;

        $sqo = new stdClass();
        $sqo->section_tipo = self::$section_tipo;
        $sqo->filter = (object)[
            '$and' => [
                (object)[
                    'q' => $section_id,
                    'path' => [
                        (object)[
                            'section_tipo' => self::$section_tipo,
                            'component_tipo' => 'test102', // component_section_id
                            'model' => 'component_section_id'
                        ]
                    ]
                ]
            ]
        ];
        $options->sqo = $sqo;

        $response = tool_propagate_component_data::propagate_component_data($options);

        $this->assertTrue($response->result, 'Expected result true. Msg: ' . ($response->msg ?? ''));

        // Verify data
        $component = component_common::get_instance($model, self::$component_tipo, $section_id, 'list', self::$lang, self::$section_tipo);
        $data = $component->get_data();

        $this->assertCount(1, $data);
        $this->assertEquals('Replaced Value', $data[0]->value);
    }

    /**
    * TEST_PROPAGATE_COMPONENT_DATA_DELETE
    */
    public function test_propagate_component_data_delete() : void {
        $section_id = $this->create_test_record();

        // Setup initial data
        $model = ontology_node::get_model_by_tipo(self::$component_tipo, true);
        $component = component_common::get_instance($model, self::$component_tipo, $section_id, 'edit', self::$lang, self::$section_tipo);
        $initial_data = [
            (object)['lang' => self::$lang, 'value' => 'Value to Keep'],
            (object)['lang' => self::$lang, 'value' => 'Value to Delete']
        ];
        $component->set_data($initial_data);
        $component->save();

        $options = new stdClass();
        $options->section_tipo          = self::$section_tipo;
        $options->component_tipo        = self::$component_tipo;
        $options->action                = 'delete';
        $options->lang                  = self::$lang;

        // Retrieve saved data to get the objects with IDs (system adds IDs on save)
        $component = component_common::get_instance($model, self::$component_tipo, $section_id, 'edit', self::$lang, self::$section_tipo);
        $saved_data = $component->get_data();
        $to_delete = array_values(array_filter($saved_data, function($item) {
            return $item->value === 'Value to Delete';
        }));

        // The delete action expects propagate_data_value to be an array of values to delete
        $options->propagate_data_value  = $to_delete;
        $options->bulk_process_label    = 'Test Bulk Delete';
        $options->total                 = 1;

        $sqo = new stdClass();
        $sqo->section_tipo = self::$section_tipo;
        $sqo->filter = (object)[
            '$and' => [
                (object)[
                    'q' => $section_id,
                    'path' => [
                        (object)[
                            'section_tipo' => self::$section_tipo,
                            'component_tipo' => 'test102', // component_section_id
                            'model' => 'component_section_id'
                        ]
                    ]
                ]
            ]
        ];
        $options->sqo = $sqo;

        $response = tool_propagate_component_data::propagate_component_data($options);

        $this->assertTrue($response->result, 'Expected result true. Msg: ' . ($response->msg ?? ''));

        // Verify data
        $component = component_common::get_instance($model, self::$component_tipo, $section_id, 'list', self::$lang, self::$section_tipo);
        $data = $component->get_data();

        $this->assertCount(1, $data);
        $this->assertEquals('Value to Keep', $data[0]->value);
    }

    /**
    * TEST_PROPAGATE_COMPONENT_DATA_INVALID_SQO
    */
    /**
    * TEST_PROPAGATE_COMPONENT_DATA_INVALID_SQO
    */
    public function test_propagate_component_data_invalid_sqo() : void {
        $options = new stdClass();
        $options->sqo = null;

        $response = tool_propagate_component_data::propagate_component_data($options);

        $this->assertFalse($response->result);
        $this->assertStringContainsString('Missing required parameters', $response->errors[0]);
    }

    /**
    * TEST_PROPAGATE_COMPONENT_DATA_TOTAL_MISMATCH
    */
    public function test_propagate_component_data_total_mismatch() : void {
        $section_id = $this->create_test_record();

        $options = new stdClass();
        $options->section_tipo   = self::$section_tipo;
        $options->component_tipo = self::$component_tipo;
        $options->sqo = (object)[
            'section_tipo' => self::$section_tipo,
            'sql_filter' => "section_id = $section_id"
        ];
        $options->total = 0; // Should be 1
        $options->lang = self::$lang;
        $options->action = 'add';

        $response = tool_propagate_component_data::propagate_component_data($options);

        $this->assertFalse($response->result);
        $this->assertStringContainsString('Record count mismatch', $response->errors[0]);
    }
}
