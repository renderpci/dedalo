<?php declare(strict_types=1);
/**
 * API_CONTRACT_SNAPSHOT_TEST
 * Contract testing for API response structure stability
 * Detects breaking changes in JSON API responses
 *
 * @package Test
 * @subpackage Contract
 */

require_once dirname(__DIR__) . '/bootstrap.php';
require_once __DIR__ . '/SnapshotComparator.php';

final class ApiContractSnapshotTest extends BaseTestCase {

    /**
     * UPDATE_SNAPSHOTS
     * Set via UPDATE_SNAPSHOTS=true environment variable
     */
    private bool $update_snapshots = false;

    /**
     * SNAPSHOT_COMPARATOR
     * Instance of snapshot comparator utility
     */
    private SnapshotComparator $comparator;

    /**
     * SETUP
     * Initialize test environment
     */
    protected function setUp(): void {
        parent::setUp();
        
        // Check for update flag
        $this->update_snapshots = getenv('UPDATE_SNAPSHOTS') === 'true';
        
        // Initialize comparator
        $this->comparator = new SnapshotComparator(__DIR__ . '/snapshots');
        
        // Ensure user is logged in for API calls
        $this->user_login();
    }

    /**
     * GET_SNAPSHOT_PATH
     * Resolve snapshot file path for a test
     *
     * @param string $test_name Test/snapshot name
     * @return string Full path to snapshot file
     */
    protected function getSnapshotPath(string $test_name): string {
        return $this->comparator->getSnapshotPath($test_name);
    }

    /**
     * ASSERT_MATCHES_SNAPSHOT
     * Main assertion: verify current response matches stored snapshot
     *
     * @param object|array $actual Current API response
     * @param string $snapshot_name Name of snapshot to compare against
     * @param string $message Optional custom assertion message
     * @return void
     */
    protected function assertMatchesSnapshot(
        object|array $actual,
        string $snapshot_name,
        ?string $message = null
    ): void {
        // Update mode: save and skip
        if ($this->update_snapshots) {
            $this->updateSnapshot($actual, $snapshot_name);
            $this->markTestSkipped("Snapshot '$snapshot_name' updated");
            return;
        }

        // Compare against existing snapshot
        $result = $this->comparator->compare($actual, $snapshot_name);

        if (!$result['matches']) {
            $failure_message = $message ?? $result['message'];

            // Add helpful context for CI
            $failure_message .= $this->formatFailureContext($result, $snapshot_name);

            $this->fail($failure_message);
        }

        // Assert true to record successful assertion
        $this->assertTrue(true, $result['message']);
    }

    /**
     * UPDATE_SNAPSHOT
     * Save current response as new snapshot
     *
     * @param object|array $data Data to save
     * @param string $snapshot_name Snapshot name
     * @return void
     */
    protected function updateSnapshot(object|array $data, string $snapshot_name): void {
        $success = $this->comparator->saveSnapshot($snapshot_name, $data);

        if (!$success) {
            $this->fail("Failed to save snapshot '$snapshot_name'");
        }

        echo "\n✅ Snapshot updated: $snapshot_name\n";
    }

    /**
     * FORMAT_FAILURE_CONTEXT
     * Add helpful context for CI failure messages
     *
     * @param array $result Comparison result
     * @param string $snapshot_name Snapshot name
     * @return string Formatted context
     */
    private function formatFailureContext(array $result, string $snapshot_name): string {
        $context = "\n\n";
        $context .= "📋 To update this snapshot (if change is intentional):\n";
        $context .= "   UPDATE_SNAPSHOTS=true vendor/bin/phpunit --filter test_get_ontology_map_contract\n\n";

        if ($result['snapshot'] === null) {
            $context .= "⚠️  Snapshot '$snapshot_name.json' does not exist.\n";
            $context .= "   Run with UPDATE_SNAPSHOTS=true to create it.\n";
        } else {
            $context .= "📁 Snapshot location: " . $this->getSnapshotPath($snapshot_name) . "\n";
        }

        return $context;
    }

    /**
     * TEST_GET_ONTOLOGY_MAP_CONTRACT
     * Verify dd_diffusion_api::get_ontology_map response structure
     */
    public function test_get_ontology_map_contract(): void {

        $rqo = (object)[
            'dd_api' => 'dd_diffusion_api',
            'action' => 'get_ontology_map',
            'source' => (object)[
                'diffusion_tipo' => 'test1' // Generic test tipo
            ]
        ];

        $_ENV['DEDALO_LAST_ERROR'] = null;
        $response = dd_diffusion_api::{$rqo->action}($rqo);

        // Verify response is valid object before snapshot comparison
        $this->assertIsObject($response, 'Response should be an object');
        $this->assertTrue(property_exists($response, 'result'), 'Response should have result property');
        $this->assertTrue(property_exists($response, 'msg'), 'Response should have msg property');
        $this->assertTrue(property_exists($response, 'data'), 'Response should have data property');

        // Compare against snapshot
        $this->assertMatchesSnapshot(
            $response,
            'dd_diffusion_api_get_ontology_map',
            'get_ontology_map response structure should match contract'
        );
    }

    /**
     * TEST_GET_LOGIN_CONTEXT_CONTRACT
     * Verify dd_utils_api::get_login_context response structure
     */
    public function test_get_login_context_contract(): void {
        
        $rqo = (object)[
            'action' => 'get_login_context',
            'dd_api' => 'dd_utils_api',
            'source' => (object)[]
        ];

        $_ENV['DEDALO_LAST_ERROR'] = null;
        $response = dd_utils_api::{$rqo->action}($rqo);

        $this->assertIsObject($response, 'Response should be an object');
        $this->assertTrue(property_exists($response, 'result'), 'Response should have result property');
        $this->assertTrue(property_exists($response, 'msg'), 'Response should have msg property');

        // Login context returns context in result
        if ($response->result !== false) {
            $this->assertIsObject($response->result, 'Result should be context object');
        }

        $this->assertMatchesSnapshot(
            $response,
            'dd_utils_api_get_login_context',
            'get_login_context response structure should match contract'
        );
    }

    /**
     * TEST_GET_ELEMENT_CONTEXT_CONTRACT
     * Verify dd_utils_api::get_element_context response structure for a component
     */
    public function test_get_element_context_contract(): void {
        
        // Use a test component tipo (component_input_text)
        $rqo = (object)[
            'action' => 'get_element_context',
            'dd_api' => 'dd_utils_api',
            'source' => (object)[
                'tipo' => 'test80', // component_input_text test tipo
                'section_tipo' => 'test3',
                'mode' => 'edit'
            ]
        ];

        $_ENV['DEDALO_LAST_ERROR'] = null;
        $response = dd_utils_api::{$rqo->action}($rqo);

        $this->assertIsObject($response, 'Response should be an object');
        $this->assertTrue(property_exists($response, 'context'), 'Response should have context property');
        $this->assertTrue(property_exists($response, 'data'), 'Response should have data property');

        $this->assertMatchesSnapshot(
            $response,
            'dd_utils_api_get_element_context',
            'get_element_context response structure should match contract'
        );
    }

    /**
     * TEST_DIFFUSE_VALIDATE_CONTRACT
     * Verify dd_diffusion_api::validate response structure
     */
    public function test_diffuse_validate_contract(): void {

        $rqo = (object)[
            'dd_api' => 'dd_diffusion_api',
            'action' => 'validate',
            'source' => (object)[
                'diffusion_tipo' => 'test1'
            ],
            'sqo' => (object)[
                'section_tipo' => ['test3'],
                'limit' => 1
            ]
        ];

        $_ENV['DEDALO_LAST_ERROR'] = null;
        $response = dd_diffusion_api::{$rqo->action}($rqo);

        $this->assertIsObject($response, 'Response should be an object');
        $this->assertTrue(property_exists($response, 'result'), 'Response should have result property');
        $this->assertTrue(property_exists($response, 'msg'), 'Response should have msg property');

        $this->assertMatchesSnapshot(
            $response,
            'dd_diffusion_api_validate',
            'diffuse validate response structure should match contract'
        );
    }

    /**
     * TEST_COMPONENT_INPUT_TEXT_CONTEXT_CONTRACT
     * Verify component_input_text JSON structure (context + data)
     */
    public function test_component_input_text_context_contract(): void {
        
        // Build component instance
        $component = component_common::get_instance(
            'component_input_text',
            'test80', // test tipo for component_input_text
            1,
            'edit',
            DEDALO_DATA_NOLAN,
            'test3'
        );

        $this->assertInstanceOf(component_input_text::class, $component);

        // Get JSON output
        $get_json_options = new stdClass();
            $get_json_options->get_context = true;
            $get_json_options->get_data = true;
        $json = $component->get_json($get_json_options);

        $this->assertIsObject($json, 'JSON should be object');
        $this->assertTrue(property_exists($json, 'context'), 'JSON should have context property');
        $this->assertTrue(property_exists($json, 'data'), 'JSON should have data property');

        $this->assertMatchesSnapshot(
            $json,
            'component_input_text_context',
            'component_input_text JSON structure should match contract'
        );
    }

    /**
     * TEST_SNAPSHOT_COMPARATOR_UTILITY
     * Verify the comparator utility works correctly
     */
    public function test_snapshot_comparator_utility(): void {

        // Create test data
        $test_data = (object)[
            'result' => true,
            'msg' => 'OK',
            'data' => (object)[
                'items' => ['a', 'b', 'c'],
                'count' => 3
            ]
        ];

        $snapshot_name = '_test_util_validation';

        // Save test snapshot
        $this->comparator->saveSnapshot($snapshot_name, $test_data);

        // Verify snapshot exists
        $this->assertTrue(
            $this->comparator->snapshotExists($snapshot_name),
            'Snapshot should exist after saving'
        );

        // Test comparison (should match)
        $result = $this->comparator->compare($test_data, $snapshot_name);
        $this->assertTrue($result['matches'], 'Identical data should match snapshot');

        // Test with different structure (should fail)
        $different_data = (object)[
            'result' => true,
            'msg' => 'OK',
            'data' => (object)[
                'items' => ['a', 'b', 'c']
                // Missing 'count' field
            ]
        ];

        $result = $this->comparator->compare($different_data, $snapshot_name);
        $this->assertFalse($result['matches'], 'Different structure should not match');
        $this->assertNotEmpty($result['differences'], 'Should report differences');

        // Cleanup test snapshot
        $test_snapshot_path = $this->getSnapshotPath($snapshot_name);
        if (file_exists($test_snapshot_path)) {
            unlink($test_snapshot_path);
        }
    }

}//end ApiContractSnapshotTest
