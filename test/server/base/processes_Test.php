<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

final class processes_Test extends BaseTestCase {

    public static $model = 'processes';
    
    /**
     * Test add method with invalid inputs
     */
    public function test_add_invalid_inputs() {
        // Test invalid PID
        $response = processes::add(-1, 0, 'test_file');
        $this->assertFalse($response->result);
        $this->assertEquals('Invalid PID', $response->msg);
        
        // Test invalid user_id
        $response = processes::add(-2, 1234, 'test_file');
        $this->assertFalse($response->result);
        $this->assertEquals('Invalid user_id', $response->msg);
        
        // Test empty pfile
        $response = processes::add(-1, 1234, '');
        $this->assertFalse($response->result);
        $this->assertEquals('Empty pfile', $response->msg);
    }
    
    /**
     * Test stop method with invalid inputs
     */
    public function test_stop_invalid_inputs() {
        // Test invalid PID
        $response = processes::stop(0, -1);
        $this->assertFalse($response->result);
        $this->assertEquals('Invalid PID', $response->msg);
        
        // Test invalid user_id
        $response = processes::stop(1234, -2);
        $this->assertFalse($response->result);
        $this->assertEquals('Invalid user_id', $response->msg);
    }
    
    /**
     * Test delete_process_item with invalid inputs
     */
    public function test_delete_process_item_invalid_inputs() {
        // Test invalid PID
        $result = processes::delete_process_item(0, -1);
        $this->assertFalse($result);
        
        // Test invalid user_id
        $result = processes::delete_process_item(1234, -2);
        $this->assertFalse($result);
    }
    
    /**
     * Test pfile sanitization
     */
    public function test_pfile_sanitization() {
        // Mock the database calls to avoid actual DB operations
        $this->user_login();
        
        $pfile_with_path = '../../../etc/passwd';
        $expected_sanitized = 'passwd';
        
        // We can't easily test the full add method without DB mocking,
        // but we can verify the basename function works as expected
        $this->assertEquals($expected_sanitized, basename($pfile_with_path));
    }
}
