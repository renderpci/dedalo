<?php declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use PHPUnit\Framework\TestCase;

class locators_result_Test extends TestCase
{
    public function test_iteration()
    {
        $locators = [
            (object)['section_tipo' => 'rsc1', 'section_id' => 1],
            (object)['section_tipo' => 'rsc2', 'section_id' => 2],
        ];

        $result = new locators_result($locators);

        $count = 0;
        foreach ($result as $locator) {
            $this->assertEquals($locators[$count]->section_tipo, $locator->section_tipo);
            $this->assertEquals($locators[$count]->section_id, $locator->section_id);
            $count++;
        }

        $this->assertEquals(2, $count);
    }

    public function test_row_count()
    {
        $locators = [
            (object)['section_tipo' => 'rsc1', 'section_id' => 1],
            (object)['section_tipo' => 'rsc2', 'section_id' => 2],
        ];

        $result = new locators_result($locators);
        $this->assertEquals(2, $result->row_count());
    }

    public function test_fetch_one()
    {
        $locators = [
            (object)['section_tipo' => 'rsc1', 'section_id' => 1],
            (object)['section_tipo' => 'rsc2', 'section_id' => 2],
        ];

        $result = new locators_result($locators);

        $row1 = $result->fetch_one();
        $this->assertEquals('rsc1', $row1->section_tipo);

        $row2 = $result->fetch_one();
        $this->assertEquals('rsc2', $row2->section_tipo);

        $row3 = $result->fetch_one();
        $this->assertFalse($row3);
    }

    public function test_fetch_all()
    {
        $locators = [
            (object)['section_tipo' => 'rsc1', 'section_id' => 1],
            (object)['section_tipo' => 'rsc2', 'section_id' => 2],
        ];

        $result = new locators_result($locators);
        $rows = $result->fetch_all();

        $this->assertCount(2, $rows);
        $this->assertEquals('rsc1', $rows[0]->section_tipo);
    }

    public function test_seek()
    {
        $locators = [
            (object)['section_tipo' => 'rsc1', 'section_id' => 1],
            (object)['section_tipo' => 'rsc2', 'section_id' => 2],
        ];

        $result = new locators_result($locators);

        $result->fetch_one(); // index 1
        $result->seek(0);
        $row = $result->fetch_one();

        $this->assertEquals('rsc1', $row->section_tipo);
    }

    public function test_as_array()
    {
        $locators = [
            (object)['section_tipo' => 'rsc1', 'section_id' => 1],
        ];

        $result = new locators_result($locators, true);
        $row = $result->fetch_one();

        $this->assertIsArray($row);
        $this->assertEquals('rsc1', $row['section_tipo']);
    }

    public function test_map_iterator()
    {
        $locators = [
            (object)['section_tipo' => 'rsc1', 'section_id' => 1],
            (object)['section_tipo' => 'rsc2', 'section_id' => 2],
        ];

        $result = new locators_result($locators);
        $mapped = $result->map_iterator(fn($item) => $item->section_tipo . '_' . $item->section_id);

        $this->assertInstanceOf(Generator::class, $mapped);
        $items = iterator_to_array($mapped);

        $this->assertEquals('rsc1_1', $items[0]);
        $this->assertEquals('rsc2_2', $items[1]);
    }
}
