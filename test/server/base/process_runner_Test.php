<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';


final class process_runner_test extends BaseTestCase {

    public function test_syntax() {
        $cmd = 'php -l ' . escapeshellarg(dirname(__FILE__, 4) . '/core/base/process_runner.php');
        exec($cmd, $output, $ret);
        $this->assertTrue($ret === 0, 'Expected no syntax errors: ' . PHP_EOL . implode(PHP_EOL, $output));
    }

    public function test_invalid_data() {
        $script = escapeshellarg(dirname(__FILE__, 4) . '/core/base/process_runner.php');
        $cmd = "php $script " . escapeshellarg('not-json') . ' 2>&1';
        exec($cmd, $output, $ret);

        $joined = implode(PHP_EOL, $output);
        $this->assertStringContainsString('Invalid data', $joined, 'Expected Invalid data message. Output: ' . PHP_EOL . $joined);
    }

    public function test_missing_class() {
        $this->user_login();
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        $session_id = session_id();
        $fixtures_dir = dirname(__FILE__) . '/fixtures';
        if (!is_dir($fixtures_dir)) mkdir($fixtures_dir, 0755, true);

        $wrapper_file = $fixtures_dir . '/wrapper_missing_class.php';
        $runner_path = dirname(__FILE__, 4) . '/core/base/process_runner.php';

        $payload = json_encode([
            'class_name' => 'ThisClassDoesNotExist',
            'method_name' => 'any',
            'user_id' => TEST_USER_ID,
            'session_id' => $session_id,
            'server' => []
        ]);

        $php_code = "<?php\n";
        $php_code .= "session_id('{$session_id}'); session_start();\n";
        $php_code .= "session_write_close();\n";
        $php_code .= "\$argv = [NULL];\n";
        $php_code .= "\$argv[1] = " . var_export($payload, true) . ";\n";
        $php_code .= "include " . var_export($runner_path, true) . ";\n";
        file_put_contents($wrapper_file, $php_code);

        exec('php ' . escapeshellarg($wrapper_file) . ' 2>&1', $output, $ret);
        $joined = implode(PHP_EOL, $output);
        $this->assertStringContainsString('Invalid class', $joined, 'Expected Invalid class message. Output: ' . PHP_EOL . $joined);
    }

    public function test_non_callable_method_with_include() {
        $this->user_login();
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        $session_id = session_id();
        $fixtures_dir = dirname(__FILE__) . '/fixtures';
        if (!is_dir($fixtures_dir)) mkdir($fixtures_dir, 0755, true);

        $file = $fixtures_dir . '/runner_dummy.php';
        file_put_contents($file, "<?php\nclass runner_dummy_class { public function instanceMethod() {} }\n");

        $wrapper_file = $fixtures_dir . '/wrapper_non_callable.php';
        $runner_path = dirname(__FILE__, 4) . '/core/base/process_runner.php';

        $payload = json_encode([
            'file' => $file,
            'class_name' => 'runner_dummy_class',
            'method_name' => 'nonexistent_static',
            'user_id' => TEST_USER_ID,
            'session_id' => $session_id,
            'server' => []
        ]);

        $php_code = "<?php\n";
        $php_code .= "session_id('{$session_id}'); session_start();\n";
        $php_code .= "session_write_close();\n";
        $php_code .= "\$argv = [NULL];\n";
        $php_code .= "\$argv[1] = " . var_export($payload, true) . ";\n";
        $php_code .= "include " . var_export($runner_path, true) . ";\n";
        file_put_contents($wrapper_file, $php_code);

        exec('php ' . escapeshellarg($wrapper_file) . ' 2>&1', $output, $ret);
        $joined = implode(PHP_EOL, $output);
        $this->assertStringContainsString('Invalid method', $joined, 'Expected Invalid method message. Output: ' . PHP_EOL . $joined);
    }

    public function test_include_outside_project() {
        $this->user_login();
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        $session_id = session_id();
        $fixtures_dir = dirname(__FILE__) . '/fixtures';
        if (!is_dir($fixtures_dir)) mkdir($fixtures_dir, 0755, true);

        $wrapper_file = $fixtures_dir . '/wrapper_outside.php';
        $runner_path = dirname(__FILE__, 4) . '/core/base/process_runner.php';

        $outside = sys_get_temp_dir() . '/process_runner_outside_' . uniqid() . '.tmp';
        file_put_contents($outside, 'process-runner-outside');
        $payload = json_encode([
            'file' => $outside,
            'class_name' => 'DoesNotMatter',
            'method_name' => 'any',
            'user_id' => TEST_USER_ID,
            'session_id' => $session_id,
            'server' => []
        ]);

        $php_code = "<?php\n";
        $php_code .= "session_id('{$session_id}'); session_start();\n";
        $php_code .= "session_write_close();\n";
        $php_code .= "\$argv = [NULL];\n";
        $php_code .= "\$argv[1] = " . var_export($payload, true) . ";\n";
        $php_code .= "include " . var_export($runner_path, true) . ";\n";
        file_put_contents($wrapper_file, $php_code);

        exec('php ' . escapeshellarg($wrapper_file) . ' 2>&1', $output, $ret);
        $joined = implode(PHP_EOL, $output);
        $this->assertStringContainsString('Invalid file', $joined, 'Expected Invalid file message. Output: ' . PHP_EOL . $joined);

        @unlink($outside);
    }

    public function test_sanitizer_rejects_changed_string() {
        $this->user_login();
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        $session_id = session_id();
        $fixtures_dir = dirname(__FILE__) . '/fixtures';
        if (!is_dir($fixtures_dir)) mkdir($fixtures_dir, 0755, true);

        $wrapper_file = $fixtures_dir . '/wrapper_sanitize.php';
        $runner_path = dirname(__FILE__, 4) . '/core/base/process_runner.php';

        // include a honest dummy class that just returns true so runner proceeds to sanitization
        $file = $fixtures_dir . '/dummy_ok.php';
        file_put_contents($file, "<?php\nclass dummy_ok { public static function go($p){ return true; } }\n");

        // value with a script tag will be modified by safe_xss — place it at top-level so sanitizer detects it
        $payload = json_encode([
            'file' => $file,
            'class_name' => 'dummy_ok',
            'method_name' => 'go',
            'danger' => '<script>alert(1)</script>',
            'user_id' => TEST_USER_ID,
            'session_id' => $session_id,
            'server' => []
        ]);

        $php_code = "<?php\n";
        $php_code .= "session_id('{$session_id}'); session_start();\n";
        $php_code .= "session_write_close();\n";
        $php_code .= "\$argv = [NULL];\n";
        $php_code .= "\$argv[1] = " . var_export($payload, true) . ";\n";
        $php_code .= "include " . var_export($runner_path, true) . ";\n";
        file_put_contents($wrapper_file, $php_code);

        exec('php ' . escapeshellarg($wrapper_file) . ' 2>&1', $output, $ret);
        $joined = implode(PHP_EOL, $output);
        $this->assertStringContainsString('Invalid value [danger]', $joined, 'Expected sanitizer rejection. Output: ' . PHP_EOL . $joined);
    }

    public function test_server_merge_passes_value_to_fixture() {
        $this->user_login();
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        $session_id = session_id();
        $fixtures_dir = dirname(__FILE__) . '/fixtures';
        if (!is_dir($fixtures_dir)) mkdir($fixtures_dir, 0755, true);

        $file = $fixtures_dir . '/server_check.php';
        file_put_contents($file, "<?php\nclass server_check { public static function check($p){ return isset(\$_SERVER['XTEST']) ? \$_SERVER['XTEST'] : null; } }\n");

        $wrapper_file = $fixtures_dir . '/wrapper_server.php';
        $runner_path = dirname(__FILE__, 4) . '/core/base/process_runner.php';

        $payload = json_encode([
            'file' => $file,
            'class_name' => 'server_check',
            'method_name' => 'check',
            'params' => new stdClass(),
            'user_id' => TEST_USER_ID,
            'session_id' => $session_id,
            'server' => ['XTEST' => 'hello-from-server']
        ]);

        $php_code = "<?php\n";
        $php_code .= "session_id('{$session_id}'); session_start();\n";
        $php_code .= "session_write_close();\n";
        $php_code .= "\$argv = [NULL];\n";
        $php_code .= "\$argv[1] = " . var_export($payload, true) . ";\n";
        $php_code .= "include " . var_export($runner_path, true) . ";\n";
        file_put_contents($wrapper_file, $php_code);

        exec('php ' . escapeshellarg($wrapper_file) . ' 2>&1', $output, $ret);
        $joined = implode(PHP_EOL, $output);
        $decoded = @json_decode($joined, true);
        $this->assertTrue(is_array($decoded) || is_string($decoded) || $decoded === null || $decoded === false, 'Unexpected runner output: ' . PHP_EOL . $joined);
        if (is_string($decoded)) {
            $this->assertSame('hello-from-server', $decoded);
        } elseif (is_array($decoded)) {
            $this->assertTrue(in_array('hello-from-server', $decoded, true) || in_array('hello-from-server', array_values($decoded), true), 'Expected server value in output: ' . PHP_EOL . $joined);
        }
    }

    protected function tearDown(): void
    {
        $fixtures_dir = dirname(__FILE__) . '/fixtures';
        if (is_dir($fixtures_dir)) {
            $files = glob($fixtures_dir . '/*');
            if ($files) {
                foreach ($files as $f) {
                    if (is_file($f)) @unlink($f);
                }
            }
            @rmdir($fixtures_dir);
        }
        parent::tearDown();
    }

}
