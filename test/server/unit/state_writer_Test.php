<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/install/class.migration_destination.php';
require_once dirname(__DIR__, 3) . '/install/class.state_writer.php';

final class state_writer_Test extends TestCase {

	private function catalog() : array {
		return [
			new config_key('state.info_key',      'DEDALO_INFO_KEY',      'string', null, config_scope::STATE),
			new config_key('state.information',    'DEDALO_INFORMATION',   'string', null, config_scope::STATE),
			new config_key('state.install_status', 'DEDALO_INSTALL_STATUS', 'string', null, config_scope::STATE),
		];
	}

	private function entry(mixed $value) : array {
		return ['destination' => migration_destination::STATE, 'record' => ['value' => $value, 'raw' => (string) $value, 'kind' => 'literal', 'file' => 'f', 'line' => 1], 'scope' => config_scope::STATE];
	}

	private function php_return(string $content) : mixed {
		$tmp = tempnam(sys_get_temp_dir(), 'sw_') . '.php';
		file_put_contents($tmp, $content);
		$result = require $tmp;
		unlink($tmp);
		return $result;
	}

	public function test_emits_state_constants_keyed_by_dot_path() : void {
		$classification = [
			'DEDALO_INFO_KEY'       => $this->entry('my_inst'),
			'DEDALO_INFORMATION'    => $this->entry('Dédalo install 7.x'),
			'DEDALO_INSTALL_STATUS' => $this->entry('installed'),
		];
		$state = $this->php_return(state_writer::render($classification, $this->catalog()));
		$this->assertSame('my_inst', $state['state.info_key']);
		$this->assertSame('Dédalo install 7.x', $state['state.information']);
		$this->assertSame('installed', $state['state.install_status']);
	}

	public function test_ignores_non_state_destinations() : void {
		$classification = [
			'DEDALO_INFO_KEY' => $this->entry('k'),
			'OTHER'           => ['destination' => migration_destination::CONFIG, 'record' => ['value' => 'v', 'raw' => 'v', 'kind' => 'literal', 'file' => 'f', 'line' => 1], 'scope' => config_scope::STATIC],
		];
		$state = $this->php_return(state_writer::render($classification, $this->catalog()));
		$this->assertSame(['state.info_key' => 'k'], $state);
	}
}
