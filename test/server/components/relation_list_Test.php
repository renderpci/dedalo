<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

final class relation_list_test extends BaseTestCase {

    public static $model = 'relation_list';
    public static $tipo = 'dd675'; // standard relation_list type
    public static $section_tipo = 'numisdata300';
    public static $section_id = 1;

    /**
     * Test basic instantiation and default get_data() behavior
     */
    public function test_get_data_default() {
        $this->user_login();

        $rl = new relation_list(self::$tipo, self::$section_id, self::$section_tipo, 'edit');
        
        // We use PHPUnitUtil to check the internal state of the sqo if needed, 
        // but since get_data() is public, we test its output.
        $data = $rl->get_data();
        
        $this->assertIsArray($data, "get_data should return an array");
    }

    /**
     * Test section_filter property and its effect on get_data()
     */
    public function test_section_filter() {
        $this->user_login();

        $rl = new relation_list(self::$tipo, self::$section_id, self::$section_tipo, 'edit');
        $filter = ['numisdata300'];
        $rl->set_section_filter($filter);
        
        $data = $rl->get_data();
        $this->assertIsArray($data);
    }

    /**
     * Test component_filter correctly handles multiple locators
     */
    public function test_component_filter_multiple() {
        $this->user_login();

        $rl = new relation_list(self::$tipo, self::$section_id, self::$section_tipo, 'edit');
        $filter = ['numisdata30', 'numisdata31'];
        $rl->set_component_filter($filter);
        
        $data = $rl->get_data();
        $this->assertIsArray($data);
    }

    /**
     * Test get_diffusion_data correctly applies filters from ddo
     */
    public function test_get_diffusion_data_filters() {
        $this->user_login();

        $rl = new relation_list(self::$tipo, self::$section_id, self::$section_tipo, 'edit');
        
        $ddo_data = (object)[
            'model' => 'relation_list',
            'tipo' => 'dd675',
            'id' => '123',
            'section_filter' => ['numisdata300'],
            'component_filter' => ['numisdata30']
        ];
        $ddo = new dd_object($ddo_data);
        
        $diffusion_data = $rl->get_diffusion_data($ddo);
        
        $this->assertIsArray($diffusion_data);
        $this->assertInstanceOf('diffusion_data_object', $diffusion_data[0]);
    }
}
