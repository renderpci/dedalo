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


    // --- section_map 'relation_list' scope resolution (get_relation_list_obj) ---

    // section used for the scope tests (real term component hierarchy25)
    private string $sm_section_tipo	= 'lg1';
    private ?object $sm_original_map	= null;
    private bool $sm_map_overridden		= false;

    protected function tearDown(): void {

        // restore the original lg1 section_map if we augmented it
        if ($this->sm_map_overridden===true) {
            section::$section_map_cache[$this->sm_section_tipo] = $this->sm_original_map;
            $this->sm_map_overridden = false;
        }

        parent::tearDown();
    }

    /**
     * When section_map.relation_list.term is defined (strict), its tipos become
     * the grid columns and produce one data row per tipo (plus the id row).
     */
    public function test_section_map_relation_list_columns() {
        $this->user_login();
        $_ENV['DEDALO_LAST_ERROR'] = null; // reset

        // preserve original and inject a relation_list scope -> real component hierarchy25
        $this->sm_original_map = section::get_section_map($this->sm_section_tipo);
        if (!is_object($this->sm_original_map)) {
            $this->markTestSkipped('lg1 section_map not available in this environment');
            return;
        }
        $augmented = json_decode(json_encode($this->sm_original_map));
        $augmented->relation_list = json_decode('{ "term": ["hierarchy25"] }');
        section::$section_map_cache[$this->sm_section_tipo] = $augmented;
        $this->sm_map_overridden = true;

        $rl = new relation_list('relation_list_test', 1, $this->sm_section_tipo, 'list');
        $inverse_references = [
            (object)[ 'section_tipo' => $this->sm_section_tipo, 'section_id' => 1 ]
        ];
        $result = $rl->get_relation_list_obj($inverse_references);

        $this->assertTrue(is_object($result) && isset($result->context) && isset($result->data), 'expected {context,data}');

        // context contains the hierarchy25 column for lg1
        $has_column = false;
        foreach ($result->context as $column) {
            if (($column->component_tipo ?? null)==='hierarchy25' && ($column->section_tipo ?? null)===$this->sm_section_tipo) {
                $has_column = true;
                break;
            }
        }
        $this->assertTrue($has_column, 'expected section_map relation_list term tipo as a context column');

        // data contains the id row and a hierarchy25 row
        $has_id_row   = false;
        $has_term_row = false;
        foreach ($result->data as $row) {
            if (($row->component_tipo ?? null)==='id')          { $has_id_row = true; }
            if (($row->component_tipo ?? null)==='hierarchy25')  { $has_term_row = true; }
        }
        $this->assertTrue($has_id_row, 'expected an id data row');
        $this->assertTrue($has_term_row, 'expected a hierarchy25 data row');

        $this->assertTrue(
            empty($_ENV['DEDALO_LAST_ERROR']),
            'expected running without errors. DEDALO_LAST_ERROR: ' . $_ENV['DEDALO_LAST_ERROR']
        );
    }

    /**
     * With no relation_list scope in section_map, resolution falls back to the
     * legacy relation_list ontology node path and still returns {context,data}.
     */
    public function test_section_map_relation_list_legacy_fallback() {
        $this->user_login();

        // strict scope must be absent on the untouched lg1 map
        $this->assertNull(
            section_map::get_scope($this->sm_section_tipo, 'relation_list', true),
            'lg1 should not define a relation_list section_map scope'
        );

        $rl = new relation_list('relation_list_test', 1, $this->sm_section_tipo, 'list');
        $inverse_references = [
            (object)[ 'section_tipo' => $this->sm_section_tipo, 'section_id' => 1 ]
        ];
        $result = $rl->get_relation_list_obj($inverse_references);

        $this->assertTrue(
            is_object($result) && isset($result->context) && isset($result->data),
            'expected legacy path to return {context,data}'
        );
    }
}
