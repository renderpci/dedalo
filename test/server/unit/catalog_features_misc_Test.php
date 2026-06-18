<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';

final class catalog_features_misc_Test extends TestCase {

	/** @return array<string,config_key> by path */
	private function load(string $file) : array {
		$by = [];
		foreach (require dirname(__DIR__, 3) . '/core/base/config/catalog/domains/' . $file as $k) {
			$by[$k->path] = $k;
		}
		return $by;
	}

	// -------------------------------------------------------------------------
	// features.php
	// -------------------------------------------------------------------------

	public function test_features_keys_present() : void {
		$by = $this->load('features.php');
		$expect = [
			'features.upload.chunk_files'          => [config_scope::STATIC, 'DEDALO_UPLOAD_SERVICE_CHUNK_FILES'],
			'features.upload.max_concurrent'       => [config_scope::STATIC, 'DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT'],
			'features.geo_provider'                => [config_scope::STATIC, 'DEDALO_GEO_PROVIDER'],
			'features.entity_media_area_tipo'      => [config_scope::STATIC, 'DEDALO_ENTITY_MEDIA_AREA_TIPO'],
			'features.entity_menu_skip_tipos'      => [config_scope::STATIC, 'DEDALO_ENTITY_MENU_SKIP_TIPOS'],
			'features.test_install'                => [config_scope::STATIC, 'DEDALO_TEST_INSTALL'],
			'features.lock_components'             => [config_scope::STATIC, 'DEDALO_LOCK_COMPONENTS'],
			'features.media_access_mode'           => [config_scope::STATIC, 'DEDALO_MEDIA_ACCESS_MODE'],
			'features.protect_media_files'         => [config_scope::STATIC, 'DEDALO_PROTECT_MEDIA_FILES'],
			'features.notifications'               => [config_scope::STATIC, 'DEDALO_NOTIFICATIONS'],
			'features.ar_exclude_components'       => [config_scope::STATIC, 'DEDALO_AR_EXCLUDE_COMPONENTS'],
			'features.filter_user_records_by_id'   => [config_scope::STATIC, 'DEDALO_FILTER_USER_RECORDS_BY_ID'],
			'features.search_client_max_limit'     => [config_scope::STATIC, 'DEDALO_SEARCH_CLIENT_MAX_LIMIT'],
			'features.ip_api'                      => [config_scope::STATIC, 'IP_API'],
		];
		foreach ($expect as $path => [$scope, $const]) {
			$this->assertArrayHasKey($path, $by, "missing features key: $path");
			$this->assertSame($scope, $by[$path]->scope, "scope of $path");
			$this->assertSame($const, $by[$path]->const, "const of $path");
		}
	}

	public function test_features_defaults() : void {
		$by = $this->load('features.php');
		$this->assertSame(4,       $by['features.upload.chunk_files']->default);
		$this->assertSame(50,      $by['features.upload.max_concurrent']->default);
		$this->assertSame('VARIOUS', $by['features.geo_provider']->default);
		$this->assertSame('',      $by['features.entity_media_area_tipo']->default);
		$this->assertSame([],      $by['features.entity_menu_skip_tipos']->default);
		$this->assertTrue($by['features.test_install']->default);
		$this->assertTrue($by['features.lock_components']->default);
		$this->assertFalse($by['features.media_access_mode']->default);
		$this->assertFalse($by['features.protect_media_files']->default);
		$this->assertFalse($by['features.notifications']->default);
		$this->assertSame([],      $by['features.ar_exclude_components']->default);
		$this->assertFalse($by['features.filter_user_records_by_id']->default);
		$this->assertSame(1000,    $by['features.search_client_max_limit']->default);
	}

	public function test_features_ip_api_map_shape() : void {
		$by  = $this->load('features.php');
		$map = $by['features.ip_api']->default;
		$this->assertIsArray($map);
		$this->assertArrayHasKey('url',          $map, 'ip_api.url missing');
		$this->assertArrayHasKey('href',         $map, 'ip_api.href missing');
		$this->assertArrayHasKey('country_code', $map, 'ip_api.country_code missing');
		$this->assertSame('https://api.country.is/$ip', $map['url']);
		$this->assertSame('https://ip-api.com/#$ip',    $map['href']);
		$this->assertSame('country',                    $map['country_code']);
	}

	// -------------------------------------------------------------------------
	// diffusion.php
	// -------------------------------------------------------------------------

	public function test_diffusion_keys_present() : void {
		$by = $this->load('diffusion.php');
		$expect = [
			'diffusion.socket_path'              => [config_scope::STATIC, 'DEDALO_DIFFUSION_SOCKET_PATH'],
			'diffusion.service_cmd'              => [config_scope::STATIC, 'DEDALO_DIFFUSION_SERVICE_CMD'],
			'diffusion.internal_token'           => [config_scope::SECRET, 'DEDALO_DIFFUSION_INTERNAL_TOKEN'],
			'diffusion.domain'                   => [config_scope::STATIC, 'DEDALO_DIFFUSION_DOMAIN'],
			'diffusion.resolve_levels'           => [config_scope::STATIC, 'DEDALO_DIFFUSION_RESOLVE_LEVELS'],
			'diffusion.publication_clean_url'    => [config_scope::STATIC, 'DEDALO_PUBLICATION_CLEAN_URL'],
			'diffusion.custom'                   => [config_scope::STATIC, 'DEDALO_DIFFUSION_CUSTOM'],
			'diffusion.api_web_user_code_multiple' => [config_scope::SECRET, 'API_WEB_USER_CODE_MULTIPLE'],
			'diffusion.structure_from_server'    => [config_scope::STATIC, 'STRUCTURE_FROM_SERVER'],
			'diffusion.is_an_ontology_server'    => [config_scope::STATIC, 'IS_AN_ONTOLOGY_SERVER'],
			'diffusion.ontology_servers'         => [config_scope::SECRET, 'ONTOLOGY_SERVERS'],
			'diffusion.is_a_code_server'         => [config_scope::STATIC, 'IS_A_CODE_SERVER'],
			'diffusion.code_servers'             => [config_scope::SECRET, 'CODE_SERVERS'],
		];
		foreach ($expect as $path => [$scope, $const]) {
			$this->assertArrayHasKey($path, $by, "missing diffusion key: $path");
			$this->assertSame($scope, $by[$path]->scope, "scope of $path");
			$this->assertSame($const, $by[$path]->const, "const of $path");
		}
	}

	public function test_diffusion_static_defaults() : void {
		$by = $this->load('diffusion.php');
		$this->assertSame('/tmp/diffusion.sock', $by['diffusion.socket_path']->default);
		$this->assertSame('',                   $by['diffusion.service_cmd']->default);
		$this->assertSame('default',            $by['diffusion.domain']->default);
		$this->assertSame(2,                    $by['diffusion.resolve_levels']->default);
		$this->assertFalse($by['diffusion.publication_clean_url']->default);
		$this->assertFalse($by['diffusion.custom']->default);
		$this->assertTrue($by['diffusion.structure_from_server']->default);
		$this->assertFalse($by['diffusion.is_an_ontology_server']->default);
		$this->assertFalse($by['diffusion.is_a_code_server']->default);
	}

	public function test_diffusion_secret_keys_have_no_default() : void {
		$by = $this->load('diffusion.php');
		$secrets = [
			'diffusion.internal_token',
			'diffusion.api_web_user_code_multiple',
			'diffusion.ontology_servers',
			'diffusion.code_servers',
		];
		foreach ($secrets as $p) {
			$this->assertSame(config_scope::SECRET, $by[$p]->scope, "$p must be SECRET");
			$this->assertNull($by[$p]->default, "SECRET key $p must have no default");
		}
	}

	// -------------------------------------------------------------------------
	// db.php
	// -------------------------------------------------------------------------

	public function test_db_keys_present() : void {
		$by = $this->load('db.php');
		$expect = [
			'db.type'           => [config_scope::STATIC, 'DEDALO_DB_TYPE'],
			'db.hostname'       => [config_scope::STATIC, 'DEDALO_HOSTNAME_CONN'],
			'db.port'           => [config_scope::STATIC, 'DEDALO_DB_PORT_CONN'],
			'db.socket'         => [config_scope::STATIC, 'DEDALO_SOCKET_CONN'],
			'db.database'       => [config_scope::STATIC, 'DEDALO_DATABASE_CONN'],
			'db.username'       => [config_scope::STATIC, 'DEDALO_USERNAME_CONN'],
			'db.password'       => [config_scope::SECRET, 'DEDALO_PASSWORD_CONN'],
			'db.slow_query_ms'  => [config_scope::STATIC, 'SLOW_QUERY_MS'],
			'db.management'     => [config_scope::STATIC, 'DEDALO_DB_MANAGEMENT'],
			'db.bin_path'       => [config_scope::STATIC, 'DB_BIN_PATH'],
			'db.php_bin_path'   => [config_scope::STATIC, 'PHP_BIN_PATH'],
			'db.mysql.hostname' => [config_scope::STATIC, 'MYSQL_DEDALO_HOSTNAME_CONN'],
			'db.mysql.username' => [config_scope::STATIC, 'MYSQL_DEDALO_USERNAME_CONN'],
			'db.mysql.password' => [config_scope::SECRET, 'MYSQL_DEDALO_PASSWORD_CONN'],
			'db.mysql.database' => [config_scope::STATIC, 'MYSQL_DEDALO_DATABASE_CONN'],
			'db.mysql.port'     => [config_scope::STATIC, 'MYSQL_DEDALO_DB_PORT_CONN'],
			'db.mysql.socket'   => [config_scope::STATIC, 'MYSQL_DEDALO_SOCKET_CONN'],
			'db.mysql.bin_path' => [config_scope::STATIC, 'MYSQL_DB_BIN_PATH'],
		];
		foreach ($expect as $path => [$scope, $const]) {
			$this->assertArrayHasKey($path, $by, "missing db key: $path");
			$this->assertSame($scope, $by[$path]->scope, "scope of $path");
			$this->assertSame($const, $by[$path]->const, "const of $path");
		}
	}

	public function test_db_password_slice_identity() : void {
		$by = $this->load('db.php');
		$k  = $by['db.password'];
		$this->assertSame('db.password',       $k->path,  'db.password path');
		$this->assertSame('DEDALO_PASSWORD_CONN', $k->const, 'db.password const');
		$this->assertSame(config_scope::SECRET, $k->scope, 'db.password scope');
		$this->assertNull($k->default,                     'db.password no default');
	}

	public function test_db_static_defaults() : void {
		$by = $this->load('db.php');
		$this->assertSame('postgresql', $by['db.type']->default);
		$this->assertSame('localhost',  $by['db.hostname']->default);
		$this->assertSame('5432',       $by['db.port']->default);
		$this->assertNull($by['db.socket']->default);
		$this->assertSame(6000,         $by['db.slow_query_ms']->default);
		$this->assertTrue($by['db.management']->default);
		$this->assertSame('/usr/bin/',  $by['db.bin_path']->default);
		$this->assertSame(3306,         $by['db.mysql.port']->default);
		$this->assertNull($by['db.mysql.socket']->default);
	}

	public function test_db_secret_keys_have_no_default() : void {
		$by = $this->load('db.php');
		foreach (['db.password', 'db.mysql.password'] as $p) {
			$this->assertSame(config_scope::SECRET, $by[$p]->scope, "$p must be SECRET");
			$this->assertNull($by[$p]->default, "SECRET key $p must have no default");
		}
	}

	// -------------------------------------------------------------------------
	// areas.php
	// -------------------------------------------------------------------------

	public function test_areas_keys_present() : void {
		$by = $this->load('areas.php');
		$this->assertArrayHasKey('areas.deny',  $by, 'missing areas.deny');
		$this->assertArrayHasKey('areas.allow', $by, 'missing areas.allow');
	}

	public function test_areas_const_is_null() : void {
		$by = $this->load('areas.php');
		$this->assertNull($by['areas.deny']->const,  'areas.deny const must be null');
		$this->assertNull($by['areas.allow']->const, 'areas.allow const must be null');
	}

	public function test_areas_defaults() : void {
		$by = $this->load('areas.php');
		$deny = $by['areas.deny']->default;
		$this->assertIsArray($deny);
		$this->assertContains('dd137',      $deny, 'areas.deny must contain dd137');
		$this->assertContains('rsc1',       $deny, 'areas.deny must contain rsc1');
		$this->assertContains('hierarchy20', $deny, 'areas.deny must contain hierarchy20');
		$this->assertSame([], $by['areas.allow']->default);
	}

	// -------------------------------------------------------------------------
	// state.php
	// -------------------------------------------------------------------------

	public function test_state_keys_present() : void {
		$by = $this->load('state.php');
		$expect = [
			'state.install_status'   => 'DEDALO_INSTALL_STATUS',
			'state.maintenance_mode' => 'DEDALO_MAINTENANCE_MODE',
			'state.information'      => 'DEDALO_INFORMATION',
			'state.info_key'         => 'DEDALO_INFO_KEY',
		];
		foreach ($expect as $path => $const) {
			$this->assertArrayHasKey($path, $by, "missing state key: $path");
			$this->assertSame(config_scope::STATE, $by[$path]->scope, "scope of $path must be STATE");
			$this->assertSame($const, $by[$path]->const, "const of $path");
		}
	}

	public function test_state_keys_have_no_default() : void {
		$by = $this->load('state.php');
		foreach (['state.install_status', 'state.maintenance_mode', 'state.information', 'state.info_key'] as $p) {
			$this->assertNull($by[$p]->default, "STATE key $p must have no default");
		}
	}
}
