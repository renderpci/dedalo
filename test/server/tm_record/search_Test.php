<?php
/**
 * Test class for tm_record::search() method.
 *
 * @coversDefaultClass 	m_record
 */
require_once '/Users/render/Desktop/trabajos/dedalo/v6/master_dedalo/core/tm_record/class.tm_record.php';

class tm_record_search_test extends PHPUnit\Framework\TestCase {
    /**
     * @test
     * @covers ::search
     */
    public function test_search_method() {
        // Use string ID '1' instead of integer
        $record = tm_record::get_instance('1');

        // Call search method
        $result = $record->search([]);

        // Assert results are valid
        $this->assertIsArray($result);
        $this->assertArrayHasKey('records', $result);
        $this->assertIsArray($result['records']);
        $this->assertGreaterThanOrEqual(0, count($result['records']));
    }
}

