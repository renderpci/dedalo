<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_compiler.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.compat_shim.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.entrypoint_profile.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_state.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_phase.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_config_phases.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_runtime_phases.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_paths.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_subsystem_phases.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_secret_state_phases.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_web_phases.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_web_profile.php';

final class boot_web_profile_Test extends TestCase {

	private function catalog() : array {
		return [ new config_key('db.host', 'DD_WP_HOST', 'string', 'localhost', config_scope::STATIC) ];
	}

	public function test_assembles_full_ordered_phase_list() : void {
		$phases = boot_web_profile::phases(
			$this->catalog(), [], '/no/such/.env', [], '/no/such/state.php', null,
			'/srv/dedalo', ['HTTP_HOST' => 'x', 'REQUEST_URI' => '/d/x'], 'fpm-fcgi'
		);
		$names = array_map(static fn(boot_phase $p) : string => $p->name, $phases);
		// fake repo has no config/local/passthrough.php → passthrough phase omitted; version.inc is unconditional
		$this->assertSame([
			'error_handlers', 'env_load', 'config_build', 'compat_shim', 'secret_state_emit',
			'core_functions', 'autoloader', 'logger', 'dd_tipos', 'version', 'apply_locale',
			'session_start', 'request_state',
		], $names);
	}

	public function test_passthrough_phase_included_when_file_present() : void {
		$pt = sys_get_temp_dir() . '/wp_pt_' . getmypid() . '.php';
		file_put_contents($pt, "<?php\n");
		try {
			$phases = boot_web_profile::phases(
				$this->catalog(), [], null, [], null, $pt,
				'/srv/dedalo', ['HTTP_HOST' => 'x', 'REQUEST_URI' => '/d/x'], 'fpm-fcgi'
			);
			$names = array_map(static fn(boot_phase $p) : string => $p->name, $phases);
			$this->assertContains('passthrough', $names);
		} finally {
			@unlink($pt);
		}
	}

	public function test_web_only_phases_carry_skip_in() : void {
		$phases = boot_web_profile::phases(
			$this->catalog(), [], null, [], null, null,
			'/srv/dedalo', ['HTTP_HOST' => 'x', 'REQUEST_URI' => '/d/x'], 'fpm-fcgi'
		);
		$by = [];
		foreach ($phases as $p) { $by[$p->name] = $p; }
		$this->assertFalse($by['session_start']->should_run(entrypoint_profile::CLI)); // session_start is web-only
		$this->assertTrue($by['request_state']->should_run(entrypoint_profile::CLI));  // request-state runs in CLI/cron too (defines consts), like v6
		$this->assertTrue($by['compat_shim']->should_run(entrypoint_profile::CLI));    // surface phases run everywhere
	}

	public function test_env_load_omitted_when_no_env_path() : void {
		$phases = boot_web_profile::phases(
			$this->catalog(), [], null, [], null, null,
			'/srv/dedalo', ['HTTP_HOST' => 'x', 'REQUEST_URI' => '/d/x'], 'fpm-fcgi'
		);
		$names = array_map(static fn(boot_phase $p) : string => $p->name, $phases);
		$this->assertNotContains('env_load', $names); // null env_path => no env_load phase
	}
}
