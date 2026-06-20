<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.env_loader.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.env_sync.php';
require_once dirname(__DIR__, 3) . '/install/class.migration_destination.php';
require_once dirname(__DIR__, 3) . '/install/class.env_writer.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';

final class env_writer_Test extends TestCase {

	private function entry(migration_destination $d, mixed $value, string $kind = 'literal') : array {
		$raw = is_array($value) ? (string) json_encode($value) : (string) $value;
		return ['destination' => $d, 'record' => ['value' => $value, 'raw' => $raw, 'kind' => $kind, 'file' => 'f', 'line' => 1], 'scope' => null];
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

	public function test_array_secret_is_json_encoded_and_round_trips() : void {
		// list/map secrets (API_WEB_USER_CODE_MULTIPLE, etc.) go to .env as JSON text
		$classification = [
			'API_WEB_USER_CODE_MULTIPLE' => $this->entry(migration_destination::ENV, ['srv' => 'tok123', 'srv2' => 'tok456']),
		];
		$parsed = env_loader::parse(env_writer::render_php($classification));
		$this->assertArrayHasKey('API_WEB_USER_CODE_MULTIPLE', $parsed);
		$this->assertSame(['srv' => 'tok123', 'srv2' => 'tok456'], json_decode($parsed['API_WEB_USER_CODE_MULTIPLE'], true));
	}

	public function test_json_secret_emits_readable_single_quoted_not_escaped() : void {
		$classification = [
			'API_WEB_USER_CODE_MULTIPLE' => $this->entry(migration_destination::ENV, [['db_name' => '', 'code' => '', 'api_ui' => null]]),
		];
		$content = env_writer::render_php($classification);
		// readable single-quoted JSON, NOT escaped double-quotes
		$this->assertStringContainsString("API_WEB_USER_CODE_MULTIPLE='[{", $content);
		$this->assertStringNotContainsString('\\"', $content);
		// and it still round-trips through env_loader
		$parsed = env_loader::parse($content);
		$this->assertSame([['db_name' => '', 'code' => '', 'api_ui' => null]], json_decode($parsed['API_WEB_USER_CODE_MULTIPLE'], true));
	}

	public function test_bool_secret_serializes_as_true_false_not_one_empty() : void {
		// secrets use the same readable bool encoding as install_config_persistor — never 1/''
		$classification = [
			'DD_FLAG_ON'  => $this->entry(migration_destination::ENV, true),
			'DD_FLAG_OFF' => $this->entry(migration_destination::ENV, false),
		];
		$content = env_writer::render_php($classification);
		$this->assertStringContainsString('DD_FLAG_ON=true', $content);
		$this->assertStringContainsString('DD_FLAG_OFF=false', $content);
		// round-trips back to the same booleans through the boot cast set
		$parsed = env_loader::parse($content);
		$this->assertTrue(in_array(strtolower($parsed['DD_FLAG_ON']), ['1', 'true', 'yes', 'on'], true));
		$this->assertFalse(in_array(strtolower($parsed['DD_FLAG_OFF']), ['1', 'true', 'yes', 'on'], true));
	}

	public function test_render_config_emits_non_default_overrides_typed() : void {
		$catalog = [
			new config_key('db.host', 'DD_C_HOST', 'string', 'localhost', config_scope::STATIC),
			new config_key('feat.x',  'DD_C_FLAG', 'bool',   false,       config_scope::STATIC),
			new config_key('lim.n',   'DD_C_N',    'int',    10,          config_scope::STATIC),
			new config_key('db.port', 'DD_C_PORT', 'string', '5432',      config_scope::STATIC),
		];
		$cls = [
			'DD_C_HOST' => $this->entry(migration_destination::CONFIG, 'pg.example.org'), // != default
			'DD_C_FLAG' => $this->entry(migration_destination::CONFIG, true),             // != default
			'DD_C_N'    => $this->entry(migration_destination::CONFIG, 10),               // == default → skipped
			'DD_C_PORT' => $this->entry(migration_destination::CONFIG, null),             // null override
		];
		$out = env_writer::render_config($cls, $catalog);
		$this->assertStringContainsString('DD_C_HOST=pg.example.org', $out);
		$this->assertStringContainsString('DD_C_FLAG=true', $out);   // readable bool
		$this->assertStringContainsString('DD_C_PORT=null', $out);   // null literal
		$this->assertStringNotContainsString('DD_C_N=', $out);       // equals default → omitted
	}
}
