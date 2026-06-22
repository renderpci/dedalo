<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/installer/class.installer_secret.php';

/**
* INSTALL_SECRET_TEST
* The installer auto-generates the two secrets the administrator must never hand-write:
* DEDALO_SALT_STRING (encrypts stored credentials) and DEDALO_DIFFUSION_INTERNAL_TOKEN.
* They must be high-entropy, .env-safe (plain hex → no quoting surprises) and unique per call.
*/
final class installer_secret_Test extends TestCase {

	public function test_generate_token_is_hex_of_requested_length() : void {
		$token = installer_secret::generate_token(32);
		$this->assertSame(64, strlen($token));                 // 32 bytes → 64 hex chars
		$this->assertMatchesRegularExpression('/^[0-9a-f]+$/', $token); // .env-safe plain token
	}

	public function test_generate_token_is_unique_across_calls() : void {
		$this->assertNotSame(installer_secret::generate_token(), installer_secret::generate_token());
	}
}
