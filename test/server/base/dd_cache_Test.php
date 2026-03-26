<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

/**
 * DD_CACHE_TEST
 * Unit tests for dd_cache class
 *
 * Tests cache operations, security validations, and error handling.
 *
 * @covers dd_cache
 */
final class dd_cache_Test extends BaseTestCase {

    private static $test_prefix;

    /**
     * Set up test environment before all tests
     */
    public static function setUpBeforeClass(): void {
        parent::setUpBeforeClass();

        // Create a unique test prefix for isolation
        self::$test_prefix = 'test_' . uniqid() . '_';

        // Define test constants if not already defined
        if (!defined('PHP_BIN_PATH')) {
            define('PHP_BIN_PATH', '/usr/bin/php');
        }
    }

    /**
     * Set up before each test - clean cache files
     */
    public function setUp(): void {
        parent::setUp();
        dd_cache::delete_cache_files(null, self::$test_prefix);
    }

    /**
     * Tear down after each test - clean cache files
     */
    public function tearDown(): void {
        parent::tearDown();
        dd_cache::delete_cache_files(null, self::$test_prefix);
    }

    // =========================================================================
    // HELPER METHODS
    // =========================================================================

    /**
     * Builds standard test options object
     */
    private function build_test_options() : object {
        return (object)[
            'data' => (object)['test_key' => 'test_value', 'number' => 42],
            'file_name' => 'test_cache_file.php'
        ];
    }

    /**
     * Wraps cache_to_file with test prefix for isolation
     */
    private function cache_to_file_with_test_prefix(object $options) : bool {
        $test_options = clone $options;
        $test_options->prefix = self::$test_prefix;
        return dd_cache::cache_to_file($test_options);
    }

    /**
     * Wraps cache_from_file with test prefix for isolation
     */
    private function cache_from_file_with_test_prefix(object $options) : mixed {
        $test_options = clone $options;
        $test_options->prefix = self::$test_prefix;
        return dd_cache::cache_from_file($test_options);
    }

    /**
     * Wraps cache_file_exists with test prefix for isolation
     */
    private function cache_file_exists_with_test_prefix(object $options) : bool {
        $test_options = clone $options;
        $test_options->prefix = self::$test_prefix;
        return dd_cache::cache_file_exists($test_options);
    }

    /**
     * Deletes cache files with test prefix
     */
    private function delete_cache_files_with_test_prefix() : bool {
        return dd_cache::delete_cache_files(null, self::$test_prefix);
    }

    // =========================================================================
    // CACHE_TO_FILE TESTS
    // =========================================================================

    /**
     * Test successful cache file creation
     * @covers dd_cache::cache_to_file
     */
    public function test_cache_to_file_success() {
        $options = $this->build_test_options();

        $result = $this->cache_to_file_with_test_prefix($options);
        $this->assertTrue($result, "cache_to_file should return true on success");
    }

    /**
     * Test cache_to_file with missing data parameter
     * @covers dd_cache::cache_to_file
     */
    public function test_cache_to_file_missing_data() {
        $options = (object)[
            'file_name' => 'test.php'
            // Missing data
        ];

        $result = $this->cache_to_file_with_test_prefix($options);
        $this->assertFalse($result, "cache_to_file should fail with missing data");
    }

    /**
     * Test cache_to_file with missing file_name parameter
     * @covers dd_cache::cache_to_file
     */
    public function test_cache_to_file_missing_file_name() {
        $options = (object)[
            'data' => (object)['test' => 'value']
            // Missing file_name
        ];

        $result = $this->cache_to_file_with_test_prefix($options);
        $this->assertFalse($result, "cache_to_file should fail with missing file_name");
    }

    /**
     * Test cache_to_file rejects directory traversal with '../'
     * @covers dd_cache::cache_to_file
     */
    public function test_cache_to_file_rejects_directory_traversal_dots() {
        $options = (object)[
            'data' => (object)['test' => 'value'],
            'file_name' => '../../../etc/passwd'
        ];

        $result = $this->cache_to_file_with_test_prefix($options);
        $this->assertFalse($result, "cache_to_file should reject file_name with '../'");
    }

    /**
     * Test cache_to_file rejects forward slash in file_name
     * @covers dd_cache::cache_to_file
     */
    public function test_cache_to_file_rejects_forward_slash() {
        $options = (object)[
            'data' => (object)['test' => 'value'],
            'file_name' => 'subdir/file.php'
        ];

        $result = $this->cache_to_file_with_test_prefix($options);
        $this->assertFalse($result, "cache_to_file should reject file_name with '/'");
    }

    /**
     * Test cache_to_file with custom prefix
     * @covers dd_cache::cache_to_file
     */
    public function test_cache_to_file_with_custom_prefix() {
        $custom_prefix = 'custom_' . uniqid() . '_';
        $options = (object)[
            'data' => (object)['test' => 'value'],
            'file_name' => 'custom_test.php',
            'prefix' => $custom_prefix
        ];

        $result = dd_cache::cache_to_file($options);
        $this->assertTrue($result, "cache_to_file should succeed with custom prefix");

        // Cleanup
        dd_cache::delete_cache_files(null, $custom_prefix);
    }

    // =========================================================================
    // CACHE_FROM_FILE TESTS
    // =========================================================================

    /**
     * Test successful cache retrieval
     * @covers dd_cache::cache_from_file
     */
    public function test_cache_from_file_success() {
        $options = $this->build_test_options();

        // Create cache
        $this->cache_to_file_with_test_prefix($options);

        // Retrieve cache
        $cached_data = $this->cache_from_file_with_test_prefix($options);
        $this->assertNotNull($cached_data, "cache_from_file should return cached data");
        $this->assertEquals($options->data, $cached_data, "Cached data should match original data");
    }

    /**
     * Test cache_from_file returns null for non-existent file
     * @covers dd_cache::cache_from_file
     */
    public function test_cache_from_file_nonexistent_returns_null() {
        $options = (object)[
            'file_name' => 'nonexistent_file.php'
        ];

        $result = $this->cache_from_file_with_test_prefix($options);
        $this->assertNull($result, "cache_from_file should return null for nonexistent files");
    }

    /**
     * Test cache_from_file returns null on validation failure (missing file_name)
     * @covers dd_cache::cache_from_file
     */
    public function test_cache_from_file_missing_file_name_returns_null() {
        $options = (object)[];

        $result = $this->cache_from_file_with_test_prefix($options);
        $this->assertNull($result, "cache_from_file should return null with missing file_name");
    }

    /**
     * Test cache_from_file returns null with invalid file_name (directory traversal)
     * @covers dd_cache::cache_from_file
     */
    public function test_cache_from_file_invalid_file_name_returns_null() {
        $options = (object)[
            'file_name' => '../../../etc/passwd'
        ];

        $result = $this->cache_from_file_with_test_prefix($options);
        $this->assertNull($result, "cache_from_file should return null for invalid file_name");
    }

    /**
     * Test cache_from_file returns null with forward slash in file_name
     * @covers dd_cache::cache_from_file
     */
    public function test_cache_from_file_forward_slash_returns_null() {
        $options = (object)[
            'file_name' => 'subdir/file.php'
        ];

        $result = $this->cache_from_file_with_test_prefix($options);
        $this->assertNull($result, "cache_from_file should return null for file_name with '/'");
    }

    // =========================================================================
    // CACHE_FILE_EXISTS TESTS
    // =========================================================================

    /**
     * Test cache_file_exists returns false initially
     * @covers dd_cache::cache_file_exists
     */
    public function test_cache_file_exists_false_initially() {
        $options = $this->build_test_options();

        $exists = $this->cache_file_exists_with_test_prefix($options);
        $this->assertFalse($exists, "Cache file should not exist initially");
    }

    /**
     * Test cache_file_exists returns true after creation
     * @covers dd_cache::cache_file_exists
     */
    public function test_cache_file_exists_true_after_creation() {
        $options = $this->build_test_options();

        $this->cache_to_file_with_test_prefix($options);

        $exists = $this->cache_file_exists_with_test_prefix($options);
        $this->assertTrue($exists, "Cache file should exist after creation");
    }

    /**
     * Test cache_file_exists returns false on validation failure
     * @covers dd_cache::cache_file_exists
     */
    public function test_cache_file_exists_invalid_file_name_returns_false() {
        $options = (object)[
            'file_name' => '../../../etc/passwd'
        ];

        $result = $this->cache_file_exists_with_test_prefix($options);
        $this->assertFalse($result, "cache_file_exists should return false for invalid file_name");
    }

    // =========================================================================
    // DELETE_CACHE_FILES TESTS
    // =========================================================================

    /**
     * Test delete_cache_files removes cache files
     * @covers dd_cache::delete_cache_files
     */
    public function test_delete_cache_files_removes_files() {
        $options = $this->build_test_options();

        $this->cache_to_file_with_test_prefix($options);
        $this->assertTrue($this->cache_file_exists_with_test_prefix($options), "Cache file should exist");

        $result = $this->delete_cache_files_with_test_prefix();
        $this->assertTrue($result, "delete_cache_files should return true");

        $this->assertFalse($this->cache_file_exists_with_test_prefix($options), "Cache file should be deleted");
    }

    /**
     * Test delete_cache_files with specific file list
     * @covers dd_cache::delete_cache_files
     */
    public function test_delete_cache_files_with_specific_list() {
        $file1 = 'specific_file_1.php';
        $file2 = 'specific_file_2.php';

        // Create two cache files
        $this->cache_to_file_with_test_prefix((object)[
            'data' => (object)['id' => 1],
            'file_name' => $file1
        ]);
        $this->cache_to_file_with_test_prefix((object)[
            'data' => (object)['id' => 2],
            'file_name' => $file2
        ]);

        // Delete only first file
        $result = dd_cache::delete_cache_files([$file1], self::$test_prefix);
        $this->assertTrue($result, "delete_cache_files should return true");

        // Verify first is deleted, second still exists
        $this->assertFalse(
            $this->cache_file_exists_with_test_prefix((object)['file_name' => $file1]),
            "First file should be deleted"
        );
        $this->assertTrue(
            $this->cache_file_exists_with_test_prefix((object)['file_name' => $file2]),
            "Second file should still exist"
        );
    }

    /**
     * Test delete_cache_files with custom prefix
     * @covers dd_cache::delete_cache_files
     */
    public function test_delete_cache_files_with_custom_prefix() {
        $custom_prefix = 'custom_delete_' . uniqid() . '_';
        $options = (object)[
            'data' => (object)['test' => 'value'],
            'file_name' => 'custom_delete_test.php',
            'prefix' => $custom_prefix
        ];

        // Create with custom prefix
        dd_cache::cache_to_file($options);
        $this->assertTrue(dd_cache::cache_file_exists($options), "File should exist");

        // Delete with custom prefix
        $result = dd_cache::delete_cache_files(null, $custom_prefix);
        $this->assertTrue($result, "delete_cache_files should return true");

        // Verify deleted
        $this->assertFalse(dd_cache::cache_file_exists($options), "File should be deleted");
    }

    // =========================================================================
    // GET_CACHE_FILE_PREFIX TESTS
    // =========================================================================

    /**
     * Test get_cache_file_prefix returns correct format
     * @covers dd_cache::get_cache_file_prefix
     */
    public function test_get_cache_file_prefix_format() {
        $this->user_login();
        $prefix = dd_cache::get_cache_file_prefix();

        $this->assertIsString($prefix, "get_cache_file_prefix should return a string");
        $this->assertStringEndsWith('_', $prefix, "Prefix should end with underscore");
        $this->assertStringContainsString(DEDALO_ENTITY, $prefix, "Prefix should contain entity name");
    }

    /**
     * Test get_cache_file_prefix with no logged user (anonymous)
     * @covers dd_cache::get_cache_file_prefix
     */
    public function test_get_cache_file_prefix_anonymous() {
        // Save current session state
        $saved_session = $_SESSION['dedalo']['auth']['user_id'] ?? null;

        // Clear session to simulate anonymous user
        unset($_SESSION['dedalo']['auth']['user_id']);

        $prefix = dd_cache::get_cache_file_prefix();

        $this->assertStringContainsString('anonymous', $prefix, "Prefix should contain 'anonymous' for non-logged user");
        $this->assertStringEndsWith('_', $prefix, "Prefix should end with underscore");

        // Restore session state
        if ($saved_session !== null) {
            $_SESSION['dedalo']['auth']['user_id'] = $saved_session;
        }
    }

    // =========================================================================
    // PROCESS_AND_CACHE_TO_FILE TESTS
    // =========================================================================

    /**
     * Test process_and_cache_to_file fails with missing process_file
     * @covers dd_cache::process_and_cache_to_file
     */
    public function test_process_and_cache_to_file_missing_process_file() {
        $options = (object)[
            'data' => (object)['test' => 'value'],
            'file_name' => 'test.php'
            // Missing process_file
        ];

        $result = dd_cache::process_and_cache_to_file($options);
        $this->assertFalse($result, "process_and_cache_to_file should fail with missing process_file");
    }

    /**
     * Test process_and_cache_to_file fails with missing data
     * @covers dd_cache::process_and_cache_to_file
     */
    public function test_process_and_cache_to_file_missing_data() {
        $options = (object)[
            'process_file' => DEDALO_CORE_PATH . '/test.php',
            'file_name' => 'test.php'
            // Missing data
        ];

        $result = dd_cache::process_and_cache_to_file($options);
        $this->assertFalse($result, "process_and_cache_to_file should fail with missing data");
    }

    /**
     * Test process_and_cache_to_file fails with missing file_name
     * @covers dd_cache::process_and_cache_to_file
     */
    public function test_process_and_cache_to_file_missing_file_name() {
        $options = (object)[
            'process_file' => DEDALO_CORE_PATH . '/test.php',
            'data' => (object)['test' => 'value']
            // Missing file_name
        ];

        $result = dd_cache::process_and_cache_to_file($options);
        $this->assertFalse($result, "process_and_cache_to_file should fail with missing file_name");
    }

    /**
     * Test process_and_cache_to_file fails with non-existent process_file
     * @covers dd_cache::process_and_cache_to_file
     */
    public function test_process_and_cache_to_file_nonexistent_process_file() {
        $options = (object)[
            'process_file' => '/nonexistent/file.php',
            'data' => (object)['test' => 'value'],
            'file_name' => 'test.php'
        ];

        $result = dd_cache::process_and_cache_to_file($options);
        $this->assertFalse($result, "process_and_cache_to_file should fail with nonexistent process file");
    }

    /**
     * Test process_and_cache_to_file rejects process_file outside allowed paths
     * @covers dd_cache::process_and_cache_to_file
     */
    public function test_process_and_cache_to_file_rejects_outside_allowed_paths() {
        // Create a temp file outside DEDALO_CORE_PATH and DEDALO_LIB_PATH
        $temp_file = sys_get_temp_dir() . '/malicious_script_' . uniqid() . '.php';
        file_put_contents($temp_file, '<?php echo "test";');

        $options = (object)[
            'process_file' => $temp_file,
            'data' => (object)['test' => 'value'],
            'file_name' => 'test.php'
        ];

        $result = dd_cache::process_and_cache_to_file($options);
        $this->assertFalse($result, "process_and_cache_to_file should reject files outside allowed paths");

        // Cleanup
        unlink($temp_file);
    }

    /**
     * Test process_and_cache_to_file rejects invalid file_name
     * @covers dd_cache::process_and_cache_to_file
     */
    public function test_process_and_cache_to_file_invalid_file_name() {
        $options = (object)[
            'process_file' => DEDALO_CORE_PATH . '/base/cache_test_file.php',
            'data' => (object)['test' => 'value'],
            'file_name' => '../../../etc/passwd'
        ];

        $result = dd_cache::process_and_cache_to_file($options);
        $this->assertFalse($result, "process_and_cache_to_file should reject invalid file_name");
    }

    /**
     * Test process_and_cache_to_file with valid process_file (synchronous)
     * @covers dd_cache::process_and_cache_to_file
     */
    public function test_process_and_cache_to_file_valid_process() {
        // Use existing test cache file if available
        $cache_test_file = DEDALO_CORE_PATH . '/base/cache_test_file.php';
        if (!file_exists($cache_test_file)) {
            $this->markTestSkipped("cache_test_file.php not found - skipping integration test");
        }

        $options = (object)[
            'process_file' => $cache_test_file,
            'data' => (object)['test' => 'value'],
            'file_name' => 'process_test.json',
            'prefix' => self::$test_prefix,
            'wait' => true
        ];

        $result = dd_cache::process_and_cache_to_file($options);
        // Result can be string (last line) or false on failure
        $this->assertNotFalse($result, "process_and_cache_to_file should succeed with valid process_file");
    }

    // =========================================================================
    // INTEGRATION TESTS
    // =========================================================================

    /**
     * Test full cache lifecycle: create, read, delete
     * @covers dd_cache::cache_to_file
     * @covers dd_cache::cache_from_file
     * @covers dd_cache::cache_file_exists
     * @covers dd_cache::delete_cache_files
     */
    public function test_full_cache_lifecycle() {
        $options = $this->build_test_options();

        // 1. Initially doesn't exist
        $this->assertFalse($this->cache_file_exists_with_test_prefix($options));

        // 2. Create cache
        $this->assertTrue($this->cache_to_file_with_test_prefix($options));

        // 3. Verify exists
        $this->assertTrue($this->cache_file_exists_with_test_prefix($options));

        // 4. Read and verify data
        $cached = $this->cache_from_file_with_test_prefix($options);
        $this->assertEquals($options->data, $cached);

        // 5. Delete
        $this->assertTrue($this->delete_cache_files_with_test_prefix());

        // 6. Verify deleted
        $this->assertFalse($this->cache_file_exists_with_test_prefix($options));
    }

    /**
     * Test cache isolation with different prefixes
     * @covers dd_cache::cache_to_file
     * @covers dd_cache::cache_file_exists
     */
    public function test_cache_prefix_isolation() {
        $prefix1 = 'isolate1_' . uniqid() . '_';
        $prefix2 = 'isolate2_' . uniqid() . '_';
        $file_name = 'isolation_test.php';

        // Create with prefix1
        $options1 = (object)[
            'data' => (object)['prefix' => 1],
            'file_name' => $file_name,
            'prefix' => $prefix1
        ];
        dd_cache::cache_to_file($options1);

        // Create with prefix2
        $options2 = (object)[
            'data' => (object)['prefix' => 2],
            'file_name' => $file_name,
            'prefix' => $prefix2
        ];
        dd_cache::cache_to_file($options2);

        // Verify both exist independently
        $this->assertTrue(dd_cache::cache_file_exists($options1));
        $this->assertTrue(dd_cache::cache_file_exists($options2));

        // Verify data is different
        $data1 = dd_cache::cache_from_file($options1);
        $data2 = dd_cache::cache_from_file($options2);
        $this->assertEquals(1, $data1->prefix);
        $this->assertEquals(2, $data2->prefix);

        // Cleanup
        dd_cache::delete_cache_files(null, $prefix1);
        dd_cache::delete_cache_files(null, $prefix2);
    }
}
