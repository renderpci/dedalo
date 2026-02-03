<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class tm_record_test extends BaseTestCase {

    public static $model = 'tm_record';
    private static $test_id;

    /**
    * TEST_USER_LOGIN
    */
    public function test_user_login() : void {
        if (!login::is_logged()) {
            login_test::force_login(TEST_USER_ID);
        }
        $this->assertTrue(login::is_logged(), 'User should be logged in');
    }

    /**
    * TEST_CREATE
    */
    public function test_create() : void {
        $values = new stdClass();
        $values->section_id     = 123456;
        $values->section_tipo   = 'dd12';
        $values->tipo           = 'dd1212';
        $values->lang           = 'lg-eng';
        $values->data           = (object)['test' => 'data'];

        $tm_record = tm_record::create($values);

        $this->assertInstanceOf(tm_record::class, $tm_record, 'Expected instance of tm_record');
        $this->assertGreaterThan(0, $tm_record->id, 'Expected tm_record ID > 0');

        self::$test_id = $tm_record->id;
    }

    /**
    * TEST_GET_INSTANCE
    * @depends test_create
    */
    public function test_get_instance() : void {
        $tm_record = tm_record::get_instance(self::$test_id);
        $this->assertInstanceOf(tm_record::class, $tm_record);
        $this->assertEquals(self::$test_id, $tm_record->id);
    }

    /**
    * TEST_GET_DATA
    * @depends test_create
    */
    public function test_get_data() : void {
        $tm_record = tm_record::get_instance(self::$test_id);
        $data = $tm_record->get_data();

        $this->assertIsObject($data);
        $this->assertEquals(123456, $data->section_id);
        $this->assertEquals('dd12', $data->section_tipo);
    }

    /**
    * TEST_GET_ELEMENT_DATA
    * @depends test_create
    */
    public function test_get_element_data() : void {
        $tm_record = tm_record::get_instance(self::$test_id);
        $element_data = $tm_record->get_element_data();

        $this->assertIsObject($element_data);
        $this->assertEquals('data', $element_data->test);
    }

    /**
    * TEST_SET_DATA
    * @depends test_create
    */
    public function test_set_data() : void {
        $tm_record = tm_record::get_instance(self::$test_id);
        $data = $tm_record->get_data();
        $data->section_id = 654321;

        $result = $tm_record->set_data($data);
        $this->assertTrue($result);

        $updated_data = $tm_record->get_data();
        $this->assertEquals(654321, $updated_data->section_id);
    }

    /**
    * TEST_SEARCH
    * @depends test_create
    */
    public function test_search() : void {
        $search_values = new stdClass();
        $search_values->section_id = 654321;

        $db_result = tm_record::search($search_values);
        $this->assertInstanceOf(db_result::class, $db_result);
        $this->assertGreaterThanOrEqual(1, $db_result->row_count());
    }

    /**
    * TEST_GET_SECTION_RECORD
    * @depends test_create
    */
    public function test_get_section_record() : void {
        $tm_record = tm_record::get_instance(self::$test_id);
        $section_record = $tm_record->get_section_record();

        $this->assertInstanceOf(section_record::class, $section_record);
        // tm_record::get_section_record returns a section_record with type 'dd15'
        $this->assertEquals('dd15', $section_record->section_tipo);
    }

    /**
    * TEST_DELETE
    * @depends test_create
    */
    // public function test_delete() : void {
    //     $tm_record = tm_record::get_instance(self::$test_id);
    //     $result = $tm_record->delete();

    //     $this->assertTrue($result);

    //     // Verify it's gone
    //     $search_values = new stdClass();
    //     $search_values->id = self::$test_id;
    //     $db_result = tm_record::search($search_values);
    //     $this->assertEquals(0, $db_result->row_count());
    // }
}
