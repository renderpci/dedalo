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

	public function test_short_salt_is_warning_not_violation() : void {
		// a short, non-default salt must NOT be an enforceable violation...
		$this->assertSame([], secret_sentinels::evaluate(['DEDALO_SALT_STRING' => 'short']));
		// ...but it IS surfaced as a warning
		$this->assertSame(['DEDALO_SALT_STRING'], secret_sentinels::evaluate_warnings(['DEDALO_SALT_STRING' => 'short']));
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

	public function test_should_enforce_production_default_warns_in_phase1() : void {
		// Phase 1: production default does NOT enforce (warn only). 503 requires explicit opt-in.
		$this->assertFalse(secret_sentinels::should_enforce(['X'], true, false, null));
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

	public function test_evaluate_warnings_ignores_default_and_long_salt() : void {
		// dedalo_six is an enforceable violation, NOT a warning
		$this->assertSame([], secret_sentinels::evaluate_warnings(['DEDALO_SALT_STRING' => 'dedalo_six']));
		// a >=16 char salt is clean
		$this->assertSame([], secret_sentinels::evaluate_warnings(['DEDALO_SALT_STRING' => 'a-16-char-salt!!']));
	}

	public function test_salt_length_boundary() : void {
		$fifteen = str_repeat('a', 15);
		$sixteen = str_repeat('a', 16);
		$this->assertSame(['DEDALO_SALT_STRING'], secret_sentinels::evaluate_warnings(['DEDALO_SALT_STRING' => $fifteen]));
		$this->assertSame([], secret_sentinels::evaluate_warnings(['DEDALO_SALT_STRING' => $sixteen]));
	}

	public function test_normalize_bool_coercion() : void {
		$this->assertTrue(secret_sentinels::normalize_bool(true));
		$this->assertTrue(secret_sentinels::normalize_bool('true'));
		$this->assertTrue(secret_sentinels::normalize_bool('1'));
		$this->assertTrue(secret_sentinels::normalize_bool('YES'));
		$this->assertTrue(secret_sentinels::normalize_bool('on'));
		$this->assertFalse(secret_sentinels::normalize_bool(false));
		$this->assertFalse(secret_sentinels::normalize_bool('false'));   // the bug this fixes
		$this->assertFalse(secret_sentinels::normalize_bool('0'));
		$this->assertFalse(secret_sentinels::normalize_bool(''));
		$this->assertFalse(secret_sentinels::normalize_bool('no'));
		$this->assertFalse(secret_sentinels::normalize_bool('off'));
	}
}
