<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.env_loader.php';
require_once dirname(__DIR__, 3) . '/core/installer/class.installer_setup_manager.php';

/**
* INSTALL_SETUP_MANAGER_TEST
* build_artifacts() is the pure core of the "Persist configuration" step: it routes every
* collected value to the right destination (db/entity/secrets → .env by constant name;
* info_key/information → state.php by dot-path; the mysql/token subset → the Bun .env),
* auto-generates the two secrets, and merges over whatever already exists on disk. Disk I/O
* is a separate thin wrapper; this is the part that must be provably correct.
*/
final class installer_setup_manager_Test extends TestCase {

	private function submitted(bool $with_diffusion) : object {
		$o = (object)[
			'db_database' => 'dedalo7',
			'db_username' => 'dd_user',
			'db_password' => 'p@ss "x" #1',
			'db_hostname' => 'localhost',
			'db_port'     => '5432',
			'db_socket'   => null,
			'entity'      => 'museum_x',
			'entity_label'=> 'Museum X',
			'timezone'    => 'Europe/Madrid',
			'locale'      => 'es-ES',
			'information' => 'Museum X archive',
			'info_key'    => 'museum_x_key',
			'diffusion'   => $with_diffusion,
		];
		if ($with_diffusion) {
			$o->mysql_hostname = 'localhost';
			$o->mysql_port     = 3306;
			$o->mysql_username = 'web';
			$o->mysql_password = 'mysqlpw';
			$o->mysql_database = 'web_dedalo';
		}
		return $o;
	}

	public function test_db_entity_and_secrets_go_to_env_round_tripping() : void {
		$out = installer_setup_manager::build_artifacts($this->submitted(false), [], [], false);
		$env = env_loader::parse($out->env_php);

		$this->assertSame('dedalo7', $env['DEDALO_DATABASE_CONN']);
		$this->assertSame('dd_user', $env['DEDALO_USERNAME_CONN']);
		$this->assertSame('p@ss "x" #1', $env['DEDALO_PASSWORD_CONN']); // specials survive quoting
		$this->assertSame('museum_x', $env['DEDALO_ENTITY']);
		$this->assertSame('Museum X', $env['DEDALO_ENTITY_LABEL']);
		$this->assertSame('null', $env['DEDALO_SOCKET_CONN']);          // optional → null marker
		// auto-generated salt is present and exposed to the caller for one-time display
		$this->assertSame(64, strlen($env['DEDALO_SALT_STRING']));
		$this->assertSame($env['DEDALO_SALT_STRING'], $out->generated['DEDALO_SALT_STRING']);
	}

	public function test_info_key_and_information_go_to_state_not_env() : void {
		$out = installer_setup_manager::build_artifacts($this->submitted(false), [], [], false);
		$env   = env_loader::parse($out->env_php);
		$state = $this->require_valid_php($out->state_php);

		$this->assertArrayNotHasKey('DEDALO_INFORMATION', $env);
		$this->assertArrayNotHasKey('DEDALO_INFO_KEY', $env);
		$this->assertSame('Museum X archive', $state['state.information']);
		$this->assertSame('museum_x_key', $state['state.info_key']);
	}

	public function test_diffusion_off_writes_no_bun_env() : void {
		$out = installer_setup_manager::build_artifacts($this->submitted(false), [], [], false);
		$this->assertNull($out->env_bun);
		$env = env_loader::parse($out->env_php);
		$this->assertArrayNotHasKey('MYSQL_DEDALO_DATABASE_CONN', $env);
		$this->assertArrayNotHasKey('DEDALO_DIFFUSION_INTERNAL_TOKEN', $env);
	}

	public function test_diffusion_on_dual_writes_and_generates_token() : void {
		$out = installer_setup_manager::build_artifacts($this->submitted(true), [], [], true);
		$env = env_loader::parse($out->env_php);
		$bun = env_loader::parse($out->env_bun);

		// PHP side carries ONLY the shared token now — MariaDB is Bun-only
		$this->assertArrayNotHasKey('MYSQL_DEDALO_DATABASE_CONN', $env);
		$this->assertSame(64, strlen($env['DEDALO_DIFFUSION_INTERNAL_TOKEN']));
		// Bun side carries MariaDB (via env_sync::BUN_DB_MAP) + the shared token
		$this->assertSame('web_dedalo', $bun['DB_NAME']);
		$this->assertSame('mysqlpw', $bun['DB_PASSWORD']);
		$this->assertSame($env['DEDALO_DIFFUSION_INTERNAL_TOKEN'], $bun['DIFFUSION_INTERNAL_TOKEN']);
	}

	public function test_existing_secret_is_preserved_when_merging() : void {
		// a salt written in an earlier wizard run must NOT be regenerated/lost
		$existing_env = ['DEDALO_SALT_STRING' => 'pre-existing-salt'];
		$out = installer_setup_manager::build_artifacts($this->submitted(false), $existing_env, [], false);
		$env = env_loader::parse($out->env_php);
		$this->assertSame('pre-existing-salt', $env['DEDALO_SALT_STRING']);
	}

	private function require_valid_php(string $php) : mixed {
		$tmp = tmpfile();
		$this->assertIsResource($tmp);

		fwrite($tmp, $php);
		$meta = stream_get_meta_data($tmp);
		$path = $meta['uri'];

		try {
			return require $path;
		} finally {
			fclose($tmp);
		}
	}
}
