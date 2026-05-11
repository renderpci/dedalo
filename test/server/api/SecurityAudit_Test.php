<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

final class SecurityAudit_Test extends BaseTestCase {

    public static $section_tipo = 'test3';

    /**
     * TEST_SQL_INJECTION_REMEDIATION
     * Verify that malicious strings in filter_by_locators are treated as literals, not SQL commands.
     */
    public function test_sql_injection_remediation() : void {
        $this->user_login();

        // Malicious SQO payload attempting SQL injection in filter_by_locators
        $rqo = (object)[
            "action" => "read",
            "source" => (object)[
                "tipo" => self::$section_tipo,
                "section_tipo" => self::$section_tipo,
                "lang" => DEDALO_DATA_NOLAN
            ],
            "sqo" => (object)[
                "section_tipo" => [self::$section_tipo],
                "filter_by_locators" => [
                    (object)[
                        "section_tipo" => "test3' OR '1'='1",
                        "section_id" => "1"
                    ]
                ],
                "limit" => 1
            ]
        ];

        // We expect this to NOT return any records because 'test3\' OR \'1\'=\'1'
        // is now a parameter and won't match any real section_tipo.
        $response = dd_core_api::read($rqo);

        $this->assertEmpty($response->result->data, "SQL injection string should not match any section_tipo as it is now sanitized via placeholders");
    }

    /**
     * TEST_AUTHORIZATION_REDACTION
     * Verify that data is redacted when the user has insufficient permissions (< 1).
     */
    public function test_authorization_redaction() : void {
        // Use a non-admin user to test permission restriction
        $this->force_limited_user_login(999);

        // Attempting to read a section ('test3' is usually a real section).
        $rqo = (object)[
            "action" => "read",
            "source" => (object)[
                "tipo" => self::$section_tipo,
                "section_tipo" => self::$section_tipo,
                "lang" => DEDALO_DATA_NOLAN
            ],
            "sqo" => (object)[
                "section_tipo" => [self::$section_tipo],
                "limit" => 1
            ]
        ];

        $response = dd_core_api::read($rqo);

        $this->assertEmpty($response->result->data, "Data should be redacted for sections without READ permissions");
    }

    /**
     * TEST_DUPLICATE_PERMISSION_CHECK
     * Verify that duplication is blocked for records the user cannot read.
     */
    public function test_duplicate_permission_check() : void {
        $this->force_limited_user_login(999);

        $rqo = (object)[
            "action" => "duplicate",
            "source" => (object)[
                "tipo" => self::$section_tipo,
                "section_tipo" => self::$section_tipo,
                "section_id" => "1",
                "lang" => DEDALO_DATA_NOLAN
            ]
        ];

        $response = dd_core_api::duplicate($rqo);

        $this->assertContains('insufficient permissions', $response->errors, "Should return insufficient permissions error for duplicate");
    }

    /**
     * TEST_DELETE_PERMISSION_CHECK
     * Verify that deletion is blocked for records the user cannot write/delete.
     */
    public function test_delete_permission_check() : void {
        $this->force_limited_user_login(999);

        $rqo = (object)[
            "action" => "delete",
            "source" => (object)[
                "tipo" => self::$section_tipo,
                "section_tipo" => self::$section_tipo,
                "section_id" => "1",
                "delete_mode" => "delete_record",
                "lang" => DEDALO_DATA_NOLAN
            ]
        ];

        $response = dd_core_api::delete($rqo);

        $this->assertContains('insufficient permissions', $response->errors, "Should return insufficient permissions error for delete");
    }

    /**
     * TEST_CREATE_PERMISSION_CHECK
     * Verify that creation is blocked for sections the user cannot write to.
     */
    public function test_create_permission_check() : void {
        $this->force_limited_user_login(999);

        $rqo = (object)[
            'action' => 'create',
            'source' => (object)[
                'section_tipo' => self::$section_tipo
            ]
        ];

        $response = dd_core_api::create($rqo);

        $this->assertContains('insufficient permissions', $response->errors, "Should return insufficient permissions error for create");
    }

    /**
     * TEST_READ_RAW_PERMISSION_CHECK
     * Verify that read_raw is blocked for sections the user cannot read.
     */
    public function test_read_raw_permission_check() : void {
        $this->force_limited_user_login(999);

        $rqo = (object)[
            'action' => 'read_raw',
            'options' => (object)[
                'section_tipo' => self::$section_tipo,
                'tipo' => self::$section_tipo,
                'type' => 'section'
            ],
            'sqo' => (object)[
                'section_tipo' => [self::$section_tipo],
                'mode' => 'list'
            ]
        ];

        $response = dd_core_api::read_raw($rqo);

        $this->assertContains('insufficient permissions', $response->errors, "Should return insufficient permissions error for read_raw");
    }

    /**
     * TEST_TS_ADD_CHILD_PERMISSION_CHECK
     * Verify that add_child is blocked for sections the user cannot write to.
     */
    public function test_ts_add_child_permission_check() : void {
        $this->force_limited_user_login(999);

        $rqo = (object)[
            'action' => 'add_child',
            'dd_api' => 'dd_ts_api',
            'source' => (object)[
                'section_tipo' => self::$section_tipo,
                'section_id' => '1'
            ]
        ];

        $response = dd_ts_api::add_child($rqo);

        $this->assertContains('insufficient permissions', $response->errors, "Should return insufficient permissions error for add_child");
    }

    /**
     * TEST_TS_UPDATE_PARENT_PERMISSION_CHECK
     * Verify that update_parent_data is blocked for sections the user cannot write to.
     */
    public function test_ts_update_parent_permission_check() : void {
        $this->force_limited_user_login(999);

        $rqo = (object)[
            'action' => 'update_parent_data',
            'dd_api' => 'dd_ts_api',
            'source' => (object)[
                'section_tipo' => self::$section_tipo,
                'section_id' => '1',
                'old_parent_section_tipo' => self::$section_tipo,
                'old_parent_section_id' => '2',
                'new_parent_section_tipo' => self::$section_tipo,
                'new_parent_section_id' => '3'
            ]
        ];

        $response = dd_ts_api::update_parent_data($rqo);

        $this->assertContains('insufficient permissions', $response->errors, "Should return insufficient permissions error for update_parent_data");
    }

    /**
     * TEST_TS_SAVE_ORDER_PERMISSION_CHECK
     * Verify that save_order is blocked for sections the user cannot write to.
     */
    public function test_ts_save_order_permission_check() : void {
        $this->force_limited_user_login(999);

        $rqo = (object)[
            'action' => 'save_order',
            'dd_api' => 'dd_ts_api',
            'source' => (object)[
                'section_tipo' => self::$section_tipo,
                'ar_locators' => [],
                'parent_section_tipo' => self::$section_tipo,
                'parent_section_id' => '1'
            ]
        ];

        $response = dd_ts_api::save_order($rqo);

        $this->assertContains('insufficient permissions', $response->errors, "Should return insufficient permissions error for save_order");
    }

    /**
     * TEST_DIFFUSION_ONTOLOGY_MAP_PERMISSION_CHECK
     * Verify that get_ontology_map is blocked for non-admin users.
     */
    public function test_diffusion_ontology_map_permission_check() : void {
        $this->force_limited_user_login(999);

        $rqo = (object)[
            'action' => 'get_ontology_map',
            'dd_api' => 'dd_diffusion_api',
            'options' => (object)[
                'diffusion_tipo' => 'rsc450'
            ]
        ];

        $response = dd_diffusion_api::get_ontology_map($rqo);

        $this->assertContains('insufficient permissions', $response->errors, "Should return insufficient permissions error for get_ontology_map for non-admins");
    }

    /**
     * TEST_TOOL_REQUEST_REFLECTION_CHECK
     * Verify that tool_request blocks non-public/non-static methods.
     */
    public function test_tool_request_reflection_check() : void {
        $this->user_login();

        $rqo = (object)[
            'action' => 'tool_request',
            'dd_api' => 'dd_tools_api',
            'source' => (object)[
                'model' => 'tool_time_machine', // valid standard tool
                'action' => '__construct'
            ]
        ];

        $response = dd_tools_api::tool_request($rqo);

        $this->assertTrue(
            in_array('unauthorized_method', $response->errors)
                || in_array('Tool not authorized for current user: tool_time_machine', $response->errors)
                || strpos($response->msg, 'tool method not accessible') !== false
                || strpos($response->msg, 'Tool not authorized') !== false,
            "Should be blocked by security layer. errors: " . json_encode($response->errors) . " msg: " . $response->msg
        );
    }

    private function force_limited_user_login(int $user_id) : void {
        login_test::force_login($user_id);
        $_SESSION['dedalo']['auth']['is_global_admin'] = false;
        $_SESSION['dedalo']['auth']['is_developer'] = false;
        security::clean_cache();
    }
}
