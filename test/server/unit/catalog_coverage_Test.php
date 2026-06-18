<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';

final class catalog_coverage_Test extends TestCase {

	/** @return config_key[] */
	private function catalog() : array {
		return require dirname(__DIR__, 3) . '/core/base/config/catalog/catalog.php';
	}

	public function test_no_duplicate_paths_or_consts() : void {
		$paths = $consts = [];
		foreach ($this->catalog() as $k) {
			$this->assertArrayNotHasKey($k->path, $paths, "duplicate path {$k->path}");
			$paths[$k->path] = true;
			if ($k->const !== null) {
				$this->assertArrayNotHasKey($k->const, $consts, "duplicate const {$k->const}");
				$consts[$k->const] = true;
			}
		}
	}

	public function test_all_types_are_known() : void {
		$ok = ['int', 'bool', 'string', 'list', 'map'];
		foreach ($this->catalog() as $k) {
			$this->assertContains($k->type, $ok, "bad type '{$k->type}' for {$k->path}");
		}
	}

	public function test_request_user_secret_state_sets_exact() : void {
		$byScope = ['request' => [], 'user' => [], 'secret' => [], 'state' => []];
		foreach ($this->catalog() as $k) {
			$s = $k->scope->value;
			if (isset($byScope[$s])) { $byScope[$s][] = $k->const ?? $k->path; sort($byScope[$s]); }
		}
		$expectRequest = ['DEDALO_APPLICATION_LANG', 'DEDALO_DATA_LANG']; sort($expectRequest);
		$expectUser    = ['LOGGER_LEVEL', 'SHOW_DEBUG', 'SHOW_DEVELOPER']; sort($expectUser);
		$expectSecret  = ['API_WEB_USER_CODE_MULTIPLE', 'CODE_SERVERS', 'DEDALO_DIFFUSION_INTERNAL_TOKEN', 'DEDALO_PASSWORD_CONN', 'DEDALO_SALT_STRING', 'MYSQL_DEDALO_PASSWORD_CONN', 'ONTOLOGY_SERVERS']; sort($expectSecret);
		$expectState   = ['DEDALO_INFORMATION', 'DEDALO_INFO_KEY', 'DEDALO_INSTALL_STATUS', 'DEDALO_MAINTENANCE_MODE']; sort($expectState);
		$this->assertSame($expectRequest, $byScope['request'], 'REQUEST set drift');
		$this->assertSame($expectUser, $byScope['user'], 'USER set drift');
		$this->assertSame($expectSecret, $byScope['secret'], 'SECRET set drift');
		$this->assertSame($expectState, $byScope['state'], 'STATE set drift');
	}

	public function test_secret_and_state_keys_have_no_compiled_default() : void {
		foreach ($this->catalog() as $k) {
			if (in_array($k->scope, [config_scope::SECRET, config_scope::STATE], true)) {
				$this->assertNull($k->default, "{$k->path} (".$k->scope->value.") must not ship a compiled default");
			}
		}
	}

	public function test_no_compiled_key_looks_like_a_secret() : void {
		$compiled = [config_scope::STATIC, config_scope::DERIVED, config_scope::DERIVED_REQUEST, config_scope::PASSTHROUGH];
		foreach ($this->catalog() as $k) {
			if ($k->const !== null && in_array($k->scope, $compiled, true)) {
				$this->assertSame(0, preg_match('/PASS|SECRET|TOKEN|SALT|_KEY$|CODE$/i', $k->const),
					"compiled-scope key {$k->const} looks like a secret — should it be scope SECRET?");
			}
		}
	}

	public function test_derived_keys_have_a_closure() : void {
		foreach ($this->catalog() as $k) {
			if ($k->scope === config_scope::DERIVED) {
				$this->assertInstanceOf(\Closure::class, $k->derived, "DERIVED key {$k->path} must have a derived closure");
			}
		}
	}

	public function test_minimum_catalog_size() : void {
		// full config-settings catalog (paths deferred to 3b) — sanity floor
		$this->assertGreaterThanOrEqual(145, count($this->catalog()), 'catalog smaller than expected');
	}

	public function test_slice_continuity_preserved() : void {
		$by = [];
		foreach ($this->catalog() as $k) { $by[$k->path] = $k; }
		$this->assertSame(222, $by['media.image.thumb_width']->default);
		$this->assertSame('DEDALO_IMAGE_THUMB_WIDTH', $by['media.image.thumb_width']->const);
		$this->assertSame(config_scope::REQUEST, $by['lang.application_lang']->scope);
		$this->assertSame(config_scope::SECRET, $by['db.password']->scope);
		$this->assertSame(config_scope::DERIVED, $by['media.image.file_url']->scope);
		$this->assertSame('/dedalo/core', $by['paths.core_url']->default);
	}
}
