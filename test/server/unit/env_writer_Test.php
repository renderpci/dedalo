<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.env_loader.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.env_sync.php';
require_once dirname(__DIR__, 3) . '/install/class.migration_destination.php';
require_once dirname(__DIR__, 3) . '/install/class.env_writer.php';

final class env_writer_Test extends TestCase {

	private function entry(migration_destination $d, mixed $value, string $kind = 'literal') : array {
		return ['destination' => $d, 'record' => ['value' => $value, 'raw' => (string) $value, 'kind' => $kind, 'file' => 'f', 'line' => 1], 'scope' => null];
	}

	public function test_env_round_trips_through_env_loader_including_salt_and_specials() : void {
		$classification = [
			'DEDALO_SALT_STRING'   => $this->entry(migration_destination::ENV, 'S0me$alt-with #hash and space'),
			'DEDALO_PASSWORD_CONN' => $this->entry(migration_destination::ENV, 'p@ss"w0rd'),
			'DEDALO_USERNAME_CONN' => $this->entry(migration_destination::ENV, 'simpleuser'),
			'DD_NOT_SECRET'        => $this->entry(migration_destination::CONFIG, 'ignored'),
		];
		$content = env_writer::render_php($classification);
		$parsed = env_loader::parse($content);

		$this->assertSame('S0me$alt-with #hash and space', $parsed['DEDALO_SALT_STRING']);
		$this->assertSame('p@ss"w0rd', $parsed['DEDALO_PASSWORD_CONN']);
		$this->assertSame('simpleuser', $parsed['DEDALO_USERNAME_CONN']);
		// only ENV-destination constants are written
		$this->assertArrayNotHasKey('DD_NOT_SECRET', $parsed);
	}

	public function test_bun_env_uses_the_appendix_b_map() : void {
		$classification = [
			// DB password is SECRET→ENV; username/host are CONFIG; all are env_sync::MAP php-keys
			'MYSQL_DEDALO_PASSWORD_CONN' => $this->entry(migration_destination::ENV, 'mysqlpw'),
			'MYSQL_DEDALO_USERNAME_CONN' => $this->entry(migration_destination::CONFIG, 'web_dedalo'),
			'DEDALO_DIFFUSION_INTERNAL_TOKEN' => $this->entry(migration_destination::ENV, 'tok123'),
			// a MAP key whose value is runtime/derived must be skipped
			'DEDALO_API_URL' => $this->entry(migration_destination::CONFIG, null, 'runtime'),
		];
		$bun = env_loader::parse(env_writer::render_bun($classification));

		$this->assertSame('mysqlpw', $bun['DB_PASSWORD']);        // MYSQL_DEDALO_PASSWORD_CONN -> DB_PASSWORD
		$this->assertSame('web_dedalo', $bun['DB_USER']);          // MYSQL_DEDALO_USERNAME_CONN -> DB_USER
		$this->assertSame('tok123', $bun['DIFFUSION_INTERNAL_TOKEN']);
		$this->assertArrayNotHasKey('DEDALO_API_URL', $bun);       // runtime value skipped
	}

	public function test_runtime_secret_is_skipped_not_emitted_empty() : void {
		$classification = ['WEIRD_SECRET' => $this->entry(migration_destination::ENV, null, 'runtime')];
		$parsed = env_loader::parse(env_writer::render_php($classification));
		$this->assertArrayNotHasKey('WEIRD_SECRET', $parsed);
	}
}
