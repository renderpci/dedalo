<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.env_loader.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.entrypoint_profile.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_state.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_phase.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_secret_state_phases.php';

final class boot_secret_state_phases_Test extends TestCase {

	private string $dir;

	protected function setUp() : void {
		parent::setUp();
		boot::reset();
		env_loader::reset();
		$this->dir = dirname(__FILE__) . '/fixtures';
		if (!is_dir($this->dir)) { mkdir($this->dir, 0755, true); }
	}
	protected function tearDown() : void { boot::reset(); env_loader::reset(); }

	private function catalog() : array {
		return [
			new config_key('db.password', 'DD_T1_SECRET', 'string', null, config_scope::SECRET),
			new config_key('state.info',  'DD_T1_STATE',  'string', null, config_scope::STATE),
			new config_key('db.host',     'DD_T1_STATIC', 'string', 'localhost', config_scope::STATIC),
		];
	}

	public function test_emits_secret_from_env_and_state_from_state_file() : void {
		$env = $this->dir . '/ss_env.env';
		file_put_contents($env, "DD_T1_SECRET=topsecret\n");
		chmod($env, 0600);
		env_loader::load($env);

		$state = $this->dir . '/ss_state.php';
		file_put_contents($state, "<?php return ['state.info' => 'fingerprint-x'];\n");

		$recorded = [];
		$spy = static function (string $name, mixed $value) use (&$recorded) : void { $recorded[$name] = $value; };

		boot::run(entrypoint_profile::CLI, [boot_secret_state_phases::emit_phase($this->catalog(), $state, $spy)]);

		$this->assertSame(boot_state::READY, boot::state());
		$this->assertSame('topsecret', $recorded['DD_T1_SECRET']);     // SECRET from .env (key == const name)
		$this->assertSame('fingerprint-x', $recorded['DD_T1_STATE']);  // STATE from state.php (by dot-path)
		$this->assertArrayNotHasKey('DD_T1_STATIC', $recorded);        // STATIC is compat_shim's job, not this phase
	}

	public function test_skips_secret_absent_from_env_and_state_absent_from_file() : void {
		$recorded = [];
		$spy = static function (string $name, mixed $value) use (&$recorded) : void { $recorded[$name] = $value; };
		// no env loaded, no state file
		boot::run(entrypoint_profile::CLI, [boot_secret_state_phases::emit_phase($this->catalog(), null, $spy)]);
		$this->assertSame([], $recorded);
	}

	public function test_list_secret_is_json_decoded_by_catalog_type() : void {
		$env = $this->dir . '/ss_list.env';
		file_put_contents($env, 'DD_T1_LIST={"srv":"tok"}' . "\n");
		chmod($env, 0600);
		env_loader::load($env);

		$catalog = [ new config_key('a.list', 'DD_T1_LIST', 'list', null, config_scope::SECRET) ];
		$recorded = [];
		$spy = static function (string $name, mixed $value) use (&$recorded) : void { $recorded[$name] = $value; };

		boot::run(entrypoint_profile::CLI, [boot_secret_state_phases::emit_phase($catalog, null, $spy)]);

		// a list-typed secret stored as JSON text in .env is decoded back to an array
		$this->assertSame(['srv' => 'tok'], $recorded['DD_T1_LIST']);
	}
}
