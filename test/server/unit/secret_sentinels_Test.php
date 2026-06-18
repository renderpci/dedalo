<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.secret_sentinels.php';

final class secret_sentinels_Test extends TestCase {

	public function test_evaluate_flags_sample_defaults() : void {
		$v = secret_sentinels::evaluate([
			'DEDALO_PASSWORD_CONN' => 'mypassword',
			'DEDALO_SALT_STRING'   => 'dedalo_six',
			'DEDALO_USERNAME_CONN' => 'realuser',
		]);
		sort($v);
		$this->assertSame(['DEDALO_PASSWORD_CONN', 'DEDALO_SALT_STRING'], $v);
	}

	public function test_evaluate_flags_short_salt() : void {
		$v = secret_sentinels::evaluate(['DEDALO_SALT_STRING' => 'short']);
		$this->assertSame(['DEDALO_SALT_STRING'], $v);
	}

	public function test_evaluate_passes_strong_values() : void {
		$v = secret_sentinels::evaluate([
			'DEDALO_PASSWORD_CONN' => 'a-strong-passphrase',
			'DEDALO_SALT_STRING'   => 'a-32-char-or-longer-random-salt!!',
		]);
		$this->assertSame([], $v);
	}

	public function test_evaluate_context_info_key_equals_entity() : void {
		$v = secret_sentinels::evaluate_context([
			'DEDALO_INFO_KEY' => 'my_entity',
			'DEDALO_ENTITY'   => 'my_entity',
		], true);
		$this->assertSame(['DEDALO_INFO_KEY'], $v);
	}

	public function test_evaluate_context_empty_diffusion_token_only_in_prod() : void {
		$prod = secret_sentinels::evaluate_context(['DEDALO_DIFFUSION_INTERNAL_TOKEN' => ''], true);
		$dev  = secret_sentinels::evaluate_context(['DEDALO_DIFFUSION_INTERNAL_TOKEN' => ''], false);
		$this->assertSame(['DEDALO_DIFFUSION_INTERNAL_TOKEN'], $prod);
		$this->assertSame([], $dev);
	}

	public function test_should_enforce_production_default_fails_closed() : void {
		$this->assertTrue(secret_sentinels::should_enforce(['X'], true, false, null));
	}

	public function test_should_enforce_dev_only_warns() : void {
		$this->assertFalse(secret_sentinels::should_enforce(['X'], false, false, null));
	}

	public function test_should_enforce_install_carveout() : void {
		$this->assertFalse(secret_sentinels::should_enforce(['X'], true, true, null));
	}

	public function test_should_enforce_explicit_override() : void {
		$this->assertTrue(secret_sentinels::should_enforce(['X'], false, false, true));   // force even in dev
		$this->assertFalse(secret_sentinels::should_enforce(['X'], true, false, false));  // disable even in prod
	}

	public function test_should_enforce_no_violations_never_enforces() : void {
		$this->assertFalse(secret_sentinels::should_enforce([], true, false, true));
	}
}
