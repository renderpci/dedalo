<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.env_loader.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.env_sync.php';
require_once dirname(__DIR__, 3) . '/core/installer/class.installer_config_persistor.php';

/**
* INSTALL_CONFIG_PERSISTOR_TEST
* The runtime writer the install wizard uses to persist collected values into
* ../private/.env (PHP side), diffusion/api/v1/.env (Bun side) and ../private/state.php.
* The contract is round-trip fidelity: whatever the wizard submits must read back
* identically through env_loader (the real boot reader) / `require` (state).
*/
final class installer_config_persistor_Test extends TestCase {

	public function test_render_env_merges_existing_and_new_values_round_tripping() : void {
		// existing .env already carries a secret from a previous wizard step
		$existing = ['DEDALO_SALT_STRING' => 'keep-me', 'DEDALO_USERNAME_CONN' => 'old_user'];
		// the wizard now submits db config (new user wins over the stale one)
		$values = [
			'DEDALO_DATABASE_CONN' => 'dedalo7',
			'DEDALO_USERNAME_CONN' => 'new_user',
			'DEDALO_PASSWORD_CONN' => 'p@ss"w0rd with #hash',
			'DEDALO_DB_PORT_CONN'  => null, // socket connection: the null marker
		];

		$content = installer_config_persistor::render_env($existing, $values);
		$parsed  = env_loader::parse($content);

		$this->assertSame('keep-me', $parsed['DEDALO_SALT_STRING']);            // preserved
		$this->assertSame('new_user', $parsed['DEDALO_USERNAME_CONN']);         // overwritten
		$this->assertSame('dedalo7', $parsed['DEDALO_DATABASE_CONN']);          // added
		$this->assertSame('p@ss"w0rd with #hash', $parsed['DEDALO_PASSWORD_CONN']); // specials survive
		$this->assertSame('null', $parsed['DEDALO_DB_PORT_CONN']);             // null → literal `null` marker
	}

	public function test_render_bun_maps_php_keys_to_bun_keys() : void {
		$values = [
			'MYSQL_DEDALO_HOSTNAME_CONN'      => 'db.local',
			'MYSQL_DEDALO_DB_PORT_CONN'       => 3306,
			'MYSQL_DEDALO_USERNAME_CONN'      => 'web',
			'MYSQL_DEDALO_PASSWORD_CONN'      => 'secret',
			'MYSQL_DEDALO_DATABASE_CONN'      => 'web_dedalo',
			'DEDALO_DIFFUSION_INTERNAL_TOKEN' => 'tok-abc',
			'DEDALO_DATABASE_CONN'            => 'ignored_not_in_map',
		];

		$bun = env_loader::parse(installer_config_persistor::render_bun($values));

		$this->assertSame('db.local', $bun['DB_HOST']);
		$this->assertSame('3306', $bun['DB_PORT']);
		$this->assertSame('web', $bun['DB_USER']);
		$this->assertSame('secret', $bun['DB_PASSWORD']);
		$this->assertSame('web_dedalo', $bun['DB_NAME']);
		$this->assertSame('tok-abc', $bun['DIFFUSION_INTERNAL_TOKEN']);
		$this->assertArrayNotHasKey('DEDALO_DATABASE_CONN', $bun); // not in env_sync::MAP
	}

	public function test_render_state_merges_dot_paths_and_keeps_install_status_string() : void {
		$existing = ['state.maintenance_mode' => false, 'state.info_key' => 'old'];
		$state    = [
			'state.info_key'       => 'development',
			'state.information'    => 'My Archive',
			'state.install_status' => 'installed', // legacy string the whole codebase gates on
		];

		$php = installer_config_persistor::render_state($existing, $state);

		$returned = $this->require_valid_php($php);
		$this->assertSame('installed', $returned['state.install_status']);
		$this->assertSame('development', $returned['state.info_key']);   // overwritten
		$this->assertSame('My Archive', $returned['state.information']); // added
		$this->assertFalse($returned['state.maintenance_mode']);         // preserved
	}

	public function test_render_env_groups_by_typology_with_docs_and_preserves_custom_keys() : void {
		$existing = ['MY_CUSTOM_LEGACY' => 'keepme']; // a hand-added key not in the catalog
		$values = [
			'DEDALO_DATABASE_CONN' => 'dedalo7',
			'DEDALO_PASSWORD_CONN' => 'secret-pw',
			'DEDALO_ENTITY'        => 'my_museum',
			'DEDALO_SALT_STRING'   => 'salt-xyz',
		];

		$content = installer_config_persistor::render_env($existing, $values);
		$parsed  = env_loader::parse($content);

		// round-trip fidelity preserved despite the new section/comment lines
		$this->assertSame('dedalo7', $parsed['DEDALO_DATABASE_CONN']);
		$this->assertSame('secret-pw', $parsed['DEDALO_PASSWORD_CONN']);
		$this->assertSame('keepme', $parsed['MY_CUSTOM_LEGACY']);            // custom key never dropped

		// grouped by typology, with per-variable docs and secret markers
		$this->assertStringContainsString('Database (PostgreSQL)', $content); // catalog-domain section header
		$this->assertStringContainsString('# PostgreSQL database name.', $content); // catalog doc as comment
		$this->assertStringContainsString('[secret — keep private]', $content);     // SECRET-scope marker
		$this->assertStringContainsString('Other / custom', $content);              // catch-all for non-catalog keys
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
