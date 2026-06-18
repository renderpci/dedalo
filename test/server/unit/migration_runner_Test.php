<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/install/class.migration_extractor.php';
require_once dirname(__DIR__, 3) . '/install/class.migration_destination.php';
require_once dirname(__DIR__, 3) . '/install/class.constant_map.php';
require_once dirname(__DIR__, 3) . '/install/class.migration_classifier.php';
require_once dirname(__DIR__, 3) . '/install/class.env_writer.php';
require_once dirname(__DIR__, 3) . '/install/class.config_writer.php';
require_once dirname(__DIR__, 3) . '/install/class.state_writer.php';
require_once dirname(__DIR__, 3) . '/install/class.passthrough_writer.php';
require_once dirname(__DIR__, 3) . '/install/class.migration_runner.php';

final class migration_runner_Test extends TestCase {

	private string $dir;

	protected function setUp() : void {
		parent::setUp();
		$this->dir = dirname(__FILE__) . '/fixtures';
		if (!is_dir($this->dir)) { mkdir($this->dir, 0755, true); }
	}

	private function catalog() : array {
		return [
			new config_key('db.password', 'DEDALO_PASSWORD_CONN', 'string', null, config_scope::SECRET),
			new config_key('db.host',      'DEDALO_HOSTNAME_CONN', 'string', 'localhost', config_scope::STATIC),
			new config_key('state.info',    'DEDALO_INFO_KEY',      'string', null, config_scope::STATE),
			new config_key('identity.entity','DEDALO_ENTITY',       'string', 'my_entity_name', config_scope::STATIC),
		];
	}

	private function fixture() : string {
		$f = $this->dir . '/mr_config.php';
		file_put_contents($f, <<<'PHP'
		<?php
		define('DEDALO_ENTITY', 'acme');
		define('DEDALO_PASSWORD_CONN', 'sup3rsecret');
		define('DEDALO_HOSTNAME_CONN', 'pg.acme.org');
		define('DEDALO_INFO_KEY', 'acme');
		define('DEDALO_PATATA', 'potato');
		PHP);
		return $f;
	}

	public function test_plan_routes_each_constant_into_the_right_artifact() : void {
		$plan = migration_runner::plan([$this->fixture()], $this->catalog());

		$this->assertSame('acme', $plan['entity']);
		$this->assertStringContainsString('DEDALO_PASSWORD_CONN=', $plan['artifacts']['env_php']);
		$this->assertStringContainsString("'identity.entity' => 'acme'", $plan['artifacts']['config']);   // entity differs from default
		$this->assertStringContainsString("'db.host' => 'pg.acme.org'", $plan['artifacts']['config']);
		$this->assertStringContainsString("'state.info' => 'acme'", $plan['artifacts']['state']);
		$this->assertStringContainsString("define('DEDALO_PATATA', 'potato')", $plan['artifacts']['passthrough']);
	}

	public function test_dry_run_report_lists_names_never_values() : void {
		$plan = migration_runner::plan([$this->fixture()], $this->catalog());
		$report = migration_runner::dry_run_report($plan);

		$this->assertStringContainsString('DEDALO_PASSWORD_CONN', $report); // name shown
		$this->assertStringNotContainsString('sup3rsecret', $report);       // value hidden
		$this->assertStringContainsString('entity: acme', $report); // the non-secret install identifier is shown by design
		$this->assertStringContainsString('DEDALO_PATATA', $report);
		$this->assertStringContainsString('schema_version', $report);
	}
}
