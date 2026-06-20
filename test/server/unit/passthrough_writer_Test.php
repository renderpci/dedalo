<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/install/class.migration_destination.php';
require_once dirname(__DIR__, 3) . '/install/class.passthrough_writer.php';

final class passthrough_writer_Test extends TestCase {

	private function pt(string $raw, string $kind = 'literal') : array {
		return ['destination' => migration_destination::PASSTHROUGH, 'record' => ['value' => null, 'raw' => $raw, 'kind' => $kind, 'file' => 'f', 'line' => 1], 'scope' => null];
	}

	public function test_reproduces_passthrough_defines_verbatim_and_guarded() : void {
		$classification = [
			'DEDALO_PATATA' => $this->pt("'potato'"),
			'DEDALO_CORS'   => $this->pt("'*'"),
			'CUSTOM_DIR'    => $this->pt('dirname(__FILE__) . "/x"', 'runtime'), // runtime expr preserved verbatim
		];
		$content = passthrough_writer::render($classification);

		$this->assertStringContainsString("if (!defined('DEDALO_PATATA')) { define('DEDALO_PATATA', 'potato'); }", $content);
		$this->assertStringContainsString("if (!defined('CUSTOM_DIR')) { define('CUSTOM_DIR', dirname(__FILE__) . \"/x\"); }", $content);

		// the produced file is valid PHP and actually defines the literal ones when included
		$tmp = tempnam(sys_get_temp_dir(), 'pt_') . '.php';
		file_put_contents($tmp, $content);
		require $tmp;
		$this->assertSame('potato', DEDALO_PATATA);
		$this->assertSame('*', DEDALO_CORS);
		unlink($tmp);
	}

	public function test_ignores_non_passthrough_destinations() : void {
		$classification = ['X' => ['destination' => migration_destination::ENV, 'record' => ['value' => 's', 'raw' => "'s'", 'kind' => 'literal', 'file' => 'f', 'line' => 1], 'scope' => null]];
		$content = passthrough_writer::render($classification);
		$this->assertStringNotContainsString("define('X'", $content);
	}
}
