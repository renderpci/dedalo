<?php declare(strict_types=1);

require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

final class dd_diffusion_api_test extends BaseTestCase {

    protected function setUp(): void {
        // Ensure we are logged in as superuser for tests
        login_Test::force_login(1);
    }

    /**
     * TEST_GET_ONTOLOGY_MAP
     * Verifies that the API returns the correct ddo_map for a diffusion node.
     */
    public function test_get_ontology_map(): void {
        
        $source_tipo = 'numisdata411'; // A table with migrated ddo_map
        
        $rqo = (object)[
            'dd_api' => 'diffusion_api',
            'action' => 'get_ontology_map',
            'source' => (object)[
                'diffusion_node_tipo' => $source_tipo
            ]
        ];

        $_ENV['DEDALO_LAST_ERROR'] = null;
        $response = diffusion_api::get_ontology_map($rqo);

        $this->assertTrue(empty($_ENV['DEDALO_LAST_ERROR']), 'Should run without errors');
        $this->assertTrue($response->result === true, 'Response result should be true');
        $this->assertIsObject($response->data, 'Should return data as object');
        $this->assertIsArray($response->data->ddo_map, 'Should return ddo_map as array');
        $this->assertGreaterThan(0, count($response->data->ddo_map), 'ddo_map should not be empty');
        
        // Verify structure of first item
        $first_item = $response->data->ddo_map[0];
        $this->assertObjectHasProperty('tipo', $first_item);
        $this->assertObjectHasProperty('parent', $first_item);
        $this->assertObjectHasProperty('section_tipo', $first_item);
    }

    /**
     * TEST_VALIDATE
     * Verifies the validation of a diffusion request.
     */
    public function test_validate(): void {
        
        $rqo = (object)[
            'dd_api' => 'diffusion_api',
            'action' => 'validate',
            'source' => (object)[
                'diffusion_node_tipo' => 'numisdata411'
            ],
            'sqo' => (object)[
                'section_tipo' => ['numisdata3'],
                'limit' => 1
            ]
        ];

        $_ENV['DEDALO_LAST_ERROR'] = null;
        $response = diffusion_api::validate($rqo);

        $this->assertTrue(empty($_ENV['DEDALO_LAST_ERROR']), 'Should run without errors');
        $this->assertTrue($response->result === true, 'Validation should pass');
    }

    /**
     * TEST_DIFFUSE
     * Verifies the full diffusion process for a specific record.
     */
    public function test_diffuse(): void {
        
        // Use a section that is likely to have data or just check execution
        $rqo = (object)[
            'dd_api' => 'diffusion_api',
            'action' => 'diffuse',
            'source' => (object)[
                'diffusion_node_tipo' => 'numisdata411'
            ],
            'sqo' => (object)[
                'section_tipo' => ['numisdata3'],
                'limit' => 1
            ],
            'options' => (object)[
                'include_debug' => true,
                'levels' => 3
            ]
        ];

        $_ENV['DEDALO_LAST_ERROR'] = null;
        $response = diffusion_api::diffuse($rqo);

        $this->assertTrue(empty($_ENV['DEDALO_LAST_ERROR']), 'Should run without errors. ' . ($_ENV['DEDALO_LAST_ERROR'] ?? ''));
        $this->assertTrue($response->result === true, 'Diffusion should succeed');
        $this->assertIsArray($response->langs, 'Should return langs array');
        $this->assertIsArray($response->main, 'Should return main hierarchy');
        $this->assertIsArray($response->datum, 'Should return datum array');
        
        if (count($response->datum) > 0) {
            $first_datum = $response->datum[0];
            $this->assertObjectHasProperty('diffusion_node', $first_datum);
            $this->assertObjectHasProperty('section_tipo', $first_datum);
            $this->assertObjectHasProperty('context', $first_datum);
            $this->assertObjectHasProperty('data', $first_datum);
        }
    }


    /**
     * TEST_MISSING_PARAMS
     * Verifies error handling for missing parameters.
     */
    public function test_missing_params(): void {
        
        $rqo = (object)[
            'dd_api' => 'diffusion_api',
            'action' => 'diffuse',
            'source' => (object)[] // Missing diffusion_node_tipo
        ];

        $_ENV['DEDALO_LAST_ERROR'] = null;
        $response = diffusion_api::diffuse($rqo);

        $this->assertFalse($response->result, 'Should fail without required params');
        $this->assertNotEmpty($response->errors, 'Should contain error messages');
    }


     /**
     * TEST_NEW_PROPERTIES
     * Verifies that the API returns the correct ddo_map for a diffusion node.
     */
    public function test_new_properties(): void {
        
        $source_tipo = 'rsc264'; // A table with migrated ddo_map
        
         // Use a section that is likely to have data or just check execution
        $rqo = (object)[
            'dd_api' => 'diffusion_api',
            'action' => 'diffuse',
            'source' => (object)[
                'diffusion_node_tipo' => $source_tipo
            ],
            'sqo' => (object)[
                'select' => [],
                'section_tipo' => ['rsc170'],
                'limit' => 2
            ],
            'options' => (object)[
                'include_debug' => true,
                'levels' => 2
            ]
        ];

        $_ENV['DEDALO_LAST_ERROR'] = null;
        $response = diffusion_api::diffuse($rqo);

        
        $this->assertIsArray($response->datum, 'Should return datum array');
        
        if (count($response->datum) > 0) {
            $first_datum = $response->datum[0];
            $this->assertObjectHasProperty('diffusion_node', $first_datum);
            $this->assertObjectHasProperty('context', $first_datum);
            $this->assertObjectHasProperty('data', $first_datum);
        }
    }

    /**
     * TEST_VERIFY_RSC267_RESOLUTION
     * Runs diffusion on rsc264 (which uses rsc267/rsc28 for cross-section) and checks output
     */
    public function test_verify_rsc267_resolution(): void {
        
        $source_tipo = 'rsc264';
        
        $rqo = (object)[
            'dd_api' => 'diffusion_api',
            'action' => 'diffuse',
            'source' => (object)[
                'diffusion_node_tipo' => $source_tipo,
                'lang' => 'lg-eng'
            ],
            'sqo' => (object)[
                'section_tipo' => ['rsc170'],
                'limit'        => 1
            ],
            'options' => (object)[
                'include_debug' => true,
                'include_empty' => true
            ]
        ];

        $response = diffusion_api::diffuse($rqo);
        
        if (empty($response->datum)) {
            print_r($response);
            $this->fail("RESPONSE ERROR: datum is empty.");
        }

        $datum    = $response->datum[0] ?? null;
        if (!$datum) { 
            print_r($response);
            $this->fail("Datum is null"); 
        }
        
        // Data is now inside datum->value (not data property, typically) or datum->data?
        // Standard DDO from API has 'data' as array of records.
        $entries = $datum->data[0]->entries ?? null;
        if ($entries === null) {
            print_r($datum);
            $this->fail("Entries is null inside data[0]!");
        }

        // Verify rsc927 (Project) - rsc28 maps to rsc927 diffusion node
        if (property_exists($entries, 'rsc927')) { // Using diffusion node tipo as key
             $rsc28_val = $entries->rsc927;
             
             // Should be list of values
             $this->assertIsArray($rsc28_val, "rsc927 value should be an array");
             
             if (!empty($rsc28_val)) {
                $first_item = $rsc28_val[0];
                echo "DEBUG: rsc927 item[0]: " . print_r($first_item, true) . PHP_EOL;
                
                // VERIFY: It should be a diffusion_data_object (The "New Object" requested by user)
                $this->assertInstanceOf(diffusion_data_object::class, $first_item, "rsc927 item should be a diffusion_data_object");
                
                // Verify Metadata
                $this->assertNotEmpty($first_item->diffusion_node_tipo, "DDO should have diffusion_node_tipo");
                // Expected: oh112 (Project) or similar
                
                // Verify Deep Data Resolution
                // The value of this DDO should contain the project's resolved data (entries)
                $target_value = $first_item->value;
                $this->assertIsArray($target_value, "DDO value should be an array (entries list)");
                $this->assertNotEmpty($target_value, "DDO value should not be empty");
                
                // Check content of target entries if possible (e.g. project name)
                // $target_entry = $target_value[0];
                
                echo "SUCCESS: rsc927 contains valid EXPANDED DDO." . PHP_EOL;
             } else {
                 echo "WARNING: rsc927 value is empty." . PHP_EOL;
             }
        } else {
             // Try check if key is not rsc28 but something else?
             // Standard api uses diffusion keys usually.. but if component resolution uses component key..
             // Let's print keys
             print_r(array_keys((array)$entries));
             $this->fail("rsc927 field not found within rsc264 entries.");
        }
    }
}
