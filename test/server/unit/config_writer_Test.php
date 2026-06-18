<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/install/class.migration_destination.php';
require_once dirname(__DIR__, 3) . '/install/class.config_writer.php';

final class config_writer_Test extends TestCase {

	private function catalog() : array {
		return [
			new config_key('db.host', 'DB_HOST_C', 'string', 'localhost', config_scope::STATIC),
			new config_key('img.w',   'IMG_W_C',   'int',    222,        config_scope::STATIC),
		];
	}

	private function entry(mixed $value) : array {
		return ['destination' => migration_destination::CONFIG, 'record' => ['value' => $value, 'raw' => (string) $value, 'kind' => 'literal', 'file' => 'f', 'line' => 1], 'scope' => config_scope::STATIC];
	}

	/** require the generated PHP file content (handles its declare(strict_types) header, which eval() cannot) */
	private function php_return(string $content) : mixed {
		$tmp = tempnam(sys_get_temp_dir(), 'cw_') . '.php';
		file_put_contents($tmp, $content);
		$result = require $tmp;
		unlink($tmp);
		return $result;
	}

	public function test_emits_only_values_differing_from_catalog_default() : void {
		$classification = [
			'DB_HOST_C' => $this->entry('pg.example.org'), // differs from 'localhost' -> override
			'IMG_W_C'   => $this->entry(222),              // equals default -> skipped
		];
		$overrides = $this->php_return(config_writer::render($classification, $this->catalog()));
		$this->assertSame(['db.host' => 'pg.example.org'], $overrides);
	}

	public function test_empty_when_all_match_defaults() : void {
		$classification = ['IMG_W_C' => $this->entry(222)];
		$overrides = $this->php_return(config_writer::render($classification, $this->catalog()));
		$this->assertSame([], $overrides);
	}

	public function test_ignores_non_config_and_runtime_values() : void {
		$classification = [
			'DB_HOST_C' => ['destination' => migration_destination::ENV, 'record' => ['value' => 'x', 'raw' => 'x', 'kind' => 'literal', 'file' => 'f', 'line' => 1], 'scope' => config_scope::SECRET],
			'IMG_W_C'   => ['destination' => migration_destination::CONFIG, 'record' => ['value' => null, 'raw' => 'f()', 'kind' => 'runtime', 'file' => 'f', 'line' => 1], 'scope' => config_scope::STATIC],
		];
		$overrides = $this->php_return(config_writer::render($classification, $this->catalog()));
		$this->assertSame([], $overrides); // ENV ignored; runtime CONFIG not baked
	}
}
