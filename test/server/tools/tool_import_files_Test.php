<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class tool_import_files_test extends BaseTestCase {

    public static $model = 'tool_import_files';

    /**
    * TEST_USER_LOGIN
    * @return void
    */
    public function test_user_login() {

        $user_id = TEST_USER_ID; // Defined in bootstrap

        if (login::is_logged()===false) {
            login_test::force_login($user_id);
        }

        $this->assertTrue(
            login::is_logged()===true ,
            'expected login true'
        );
    }//end test_user_login

    /**
    * TEST_GET_FILE_DATA
    * @return void
    */
    public function test_get_file_data() {

        $dir = '/tmp';
        $file = '73-my image-A.tiff';

        // Mock filesize if needed, but get_file_data calls filesize() directly
        // Create a dummy file to avoid errors
        $file_path = $dir . '/' . $file;
        file_put_contents($file_path, 'test content');

        $ar_data = tool_import_files::get_file_data($dir, $file);

        $this->assertIsArray($ar_data);
        $this->assertEquals($dir, $ar_data['dir_path']);
        $this->assertEquals('73-my image-A', $ar_data['file_name']);

        $regex = $ar_data['regex'];
        $this->assertInstanceOf('stdClass', $regex);
        $this->assertEquals('73', $regex->section_id);
        $this->assertEquals('my image', $regex->base_name);
        $this->assertEquals('A', $regex->letter);
        $this->assertEquals('tiff', $regex->extension);

        // Test with simple filename
        $file2 = 'ánfora.jpg';
        $file_path2 = $dir . '/' . $file2;
        file_put_contents($file_path2, 'test content');

        $ar_data2 = tool_import_files::get_file_data($dir, $file2);
        $this->assertEquals('ánfora', $ar_data2['regex']->base_name);
        $this->assertEmpty($ar_data2['regex']->section_id);

        // cleanup
        unlink($file_path);
        unlink($file_path2);
    }//end test_get_file_data

    /**
    * TEST_GET_MEDIA_FILE_DATE
    * @return void
    */
    public function test_get_media_file_date() {
        // This method depends on ImageMagick, Ffmpeg or pdfinfo
        // We can test if it returns null for unknown models or empty files

        $media_file = [
            'file_path' => '/tmp/non_existent_file.jpg'
        ];

        $date = tool_import_files::get_media_file_date($media_file, 'invalid_model');
        $this->assertNull($date);
    }//end test_get_media_file_date

    /**
    * TEST_SET_COMPONENTS_DATA
    * @return void
    */
    public function test_set_components_data() {

        $this->user_login();

        $options = new stdClass();
        $options->ar_ddo_map = [
            (object)[
                'role' => 'target_filename',
                'tipo' => 'rsc23', // example
                'section_tipo' => 'rsc12',
                'only_basename' => true
            ]
        ];
        $options->section_tipo = 'rsc12';
        $options->section_id = 1;
        $options->target_section_id = 1;
        $options->target_ddo_component = (object)['tipo' => 'rsc29'];
        $options->file_data = [
            'regex' => (object)['base_name' => 'test_file']
        ];
        $options->current_file_name = 'test_file.jpg';
        $options->target_component_model = 'component_image';
        $options->components_temp_data = [];

        // This might fail if rsc23 or others don't exist in the test DB
        // But we can check if it executes without errors
        try {
            tool_import_files::set_components_data($options);
            $this->assertTrue(true);
        } catch (Exception $e) {
            $this->fail('set_components_data threw an exception: ' . $e->getMessage());
        }
    }//end test_set_components_data

    /**
    * TEST_GET_MEDIA_SECTION_MATCH
    * @return void
    */
    public function test_get_media_section_match() {
        // This calls ontology_node and possibly DB
        // We check if it returns an array
        $options = new stdClass();
        $options->target_filename = (object)[
            'tipo' => 'rsc29',
            'section_tipo' => 'rsc170'
        ]; // example
        $options->full_name = 'test.jpg';

        $result = tool_import_files::get_media_section_match($options);
        $this->assertIsArray($result);
    }//end test_get_media_section_match

}//end class tool_import_files_test
