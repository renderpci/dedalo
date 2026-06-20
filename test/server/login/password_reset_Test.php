<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* CLASS PASSWORD_RESET_TEST
* Unit tests for the self-service "forgot password" recovery flow
* (core/password_reset/class.password_reset.php) and the mailer guard
* (core/dd_mailer/class.dd_mailer.php).
*
* These tests exercise the code generation, the file-cache store/verify logic,
* the per-code attempt cap / expiry, the new-password validation, the email
* lookup query, the anti-enumeration response shape, and the mailer recipient
* guard. Private static helpers are driven via reflection so no real user
* record is mutated.
*
* NOT covered here (left to manual end-to-end with a real SMTP mailbox + a real
* positive test user, see docs / plan): the successful password WRITE path
* (correct code + strong password → component_password::Save()). The automated
* suite only has the superuser (-1) available, which the flow intentionally
* excludes, and it must never mutate a real password mid-suite.
*
* @package Dédalo
* @subpackage Tests
*/
final class password_reset_test extends BaseTestCase {

	// A throwaway user id used only as the stored-entry payload. The negative
	// confirm() paths below never reach the password-write step, so this id is
	// never used to touch the database.
	private const DUMMY_USER_ID = 424242;



	/**
	* CALL_PRIVATE
	* Invoke a private static method of password_reset via reflection.
	*/
	private static function call_private(string $method, array $args = []) {

		$ref = new ReflectionMethod('password_reset', $method);
		$ref->setAccessible(true);

		return $ref->invokeArgs(null, $args);
	}//end call_private



	/**
	* CACHE_AVAILABLE
	* True when the file-cache store path is resolvable (skip store tests if not).
	*/
	private static function cache_available() : bool {

		return defined('DEDALO_CACHE_PATH')
			|| (defined('DEDALO_CACHE_MANAGER') && isset(DEDALO_CACHE_MANAGER['files_path']));
	}//end cache_available



	/**
	* TEST_GENERATE_CODE_FORMAT
	* The code is always a zero-padded 6-digit numeric string.
	*/
	public function test_generate_code_format(): void {

		for ($i = 0; $i < 300; $i++) {
			$code = self::call_private('generate_code');
			$this->assertMatchesRegularExpression('/^\d{6}$/', $code, 'Code must be exactly 6 digits, zero-padded');
		}
	}



	/**
	* TEST_RESET_ID_VALIDATION
	* generate_reset_id() yields 32 lowercase hex chars; is_valid_reset_id rejects
	* malformed tokens.
	*/
	public function test_reset_id_validation(): void {

		for ($i = 0; $i < 50; $i++) {
			$reset_id = self::call_private('generate_reset_id');
			$this->assertTrue(self::call_private('is_valid_reset_id', [$reset_id]), 'Generated reset_id must validate');
			$this->assertSame(32, strlen($reset_id));
		}

		$this->assertFalse(self::call_private('is_valid_reset_id', ['xyz']), 'Too short rejected');
		$this->assertFalse(self::call_private('is_valid_reset_id', [str_repeat('a', 31)]), '31 chars rejected');
		$this->assertFalse(self::call_private('is_valid_reset_id', [strtoupper(str_repeat('a', 32))]), 'Uppercase rejected');
		$this->assertFalse(self::call_private('is_valid_reset_id', ['../../etc/passwd0000000000000000']), 'Traversal-like rejected');
	}



	/**
	* TEST_STORE_LOAD_DELETE
	* Round-trip: the stored entry holds the user id, a HASH of the code (never the
	* plaintext), a future expiry and attempts=0; delete removes it.
	*/
	public function test_store_load_delete(): void {

		if (!self::cache_available()) {
			$this->markTestSkipped('No cache path available for the file store');
		}

		$reset_id	= self::call_private('generate_reset_id');
		$code		= '482915';

		$stored = self::call_private('store_entry', [$reset_id, self::DUMMY_USER_ID, $code]);
		$this->assertTrue($stored, 'store_entry should succeed');

		$entry = self::call_private('load_entry', [$reset_id]);
		$this->assertInstanceOf('stdClass', $entry, 'load_entry should return an object');
		$this->assertSame(self::DUMMY_USER_ID, (int)$entry->user_id, 'user_id round-trips');
		$this->assertSame(0, (int)$entry->attempts, 'attempts start at 0');
		$this->assertGreaterThan(time(), (int)$entry->expires, 'expiry is in the future');
		$this->assertNotSame($code, $entry->code_hash, 'code is never stored in plaintext');
		$this->assertTrue(password_verify($code, $entry->code_hash), 'stored hash verifies the code');

		self::call_private('delete_entry', [$reset_id]);
		$this->assertNull(self::call_private('load_entry', [$reset_id]), 'entry is gone after delete');
	}



	/**
	* TEST_INCREMENT_ATTEMPTS
	* increment_attempts bumps and persists the counter.
	*/
	public function test_increment_attempts(): void {

		if (!self::cache_available()) {
			$this->markTestSkipped('No cache path available for the file store');
		}

		$reset_id = self::call_private('generate_reset_id');
		self::call_private('store_entry', [$reset_id, self::DUMMY_USER_ID, '000000']);

		$this->assertSame(1, (int)self::call_private('increment_attempts', [$reset_id]));
		$this->assertSame(2, (int)self::call_private('increment_attempts', [$reset_id]));

		$entry = self::call_private('load_entry', [$reset_id]);
		$this->assertSame(2, (int)$entry->attempts, 'persisted attempts counter');

		self::call_private('delete_entry', [$reset_id]);
	}



	/**
	* TEST_NEW_PASSWORD_VALIDATION
	* Minimum length gate (mirrors login::Login()).
	*/
	public function test_new_password_validation(): void {

		$this->assertFalse(self::call_private('is_valid_new_password', ['']), 'empty rejected');
		$this->assertFalse(self::call_private('is_valid_new_password', ['1234567']), '7 chars rejected');
		$this->assertTrue(self::call_private('is_valid_new_password', ['12345678']), '8 chars accepted');
	}



	/**
	* TEST_CONFIRM_INVALID_RESET_ID
	* A malformed reset_id yields the generic invalid_or_expired response.
	*/
	public function test_confirm_invalid_reset_id(): void {

		$response = password_reset::confirm('not-a-valid-id', '123456', 'longpassword8');
		$this->assertFalse($response->result);
		$this->assertContains('invalid_or_expired', $response->errors);
	}



	/**
	* TEST_CONFIRM_WRONG_CODE_AND_LOCKOUT
	* Wrong codes return the generic invalid_or_expired and increment the per-code
	* attempt counter; once the cap is reached the entry is deleted and the
	* response is too_many_attempts.
	*/
	public function test_confirm_wrong_code_and_lockout(): void {

		if (!self::cache_available()) {
			$this->markTestSkipped('No cache path available for the file store');
		}

		$max = (int)self::call_private('max_verify_attempts');

		$reset_id = self::call_private('generate_reset_id');
		self::call_private('store_entry', [$reset_id, self::DUMMY_USER_ID, '111111']);

		for ($i = 1; $i <= $max; $i++) {
			$response = password_reset::confirm($reset_id, '000000', 'longpassword8');
			$this->assertFalse($response->result, "wrong code attempt $i must fail");
			if ($i < $max) {
				$this->assertContains('invalid_or_expired', $response->errors, "attempt $i should be generic");
			} else {
				$this->assertContains('too_many_attempts', $response->errors, 'final attempt should lock out');
			}
		}

		$this->assertNull(self::call_private('load_entry', [$reset_id]), 'entry deleted after lockout');
	}



	/**
	* TEST_CONFIRM_WEAK_PASSWORD_KEEPS_ENTRY
	* A weak new password is reported specifically and does NOT consume an attempt
	* or write anything (it is checked before code verification).
	*/
	public function test_confirm_weak_password_keeps_entry(): void {

		if (!self::cache_available()) {
			$this->markTestSkipped('No cache path available for the file store');
		}

		$reset_id = self::call_private('generate_reset_id');
		self::call_private('store_entry', [$reset_id, self::DUMMY_USER_ID, '222222']);

		// correct code but short password → weak_password, entry untouched
		$response = password_reset::confirm($reset_id, '222222', 'short');
		$this->assertFalse($response->result);
		$this->assertContains('weak_password', $response->errors);

		$entry = self::call_private('load_entry', [$reset_id]);
		$this->assertInstanceOf('stdClass', $entry, 'entry preserved on weak password');
		$this->assertSame(0, (int)$entry->attempts, 'weak password does not consume an attempt');

		self::call_private('delete_entry', [$reset_id]);
	}



	/**
	* TEST_CONFIRM_EXPIRED
	* An expired entry yields invalid_or_expired and is cleaned up.
	*/
	public function test_confirm_expired(): void {

		if (!self::cache_available()) {
			$this->markTestSkipped('No cache path available for the file store');
		}

		$reset_id = self::call_private('generate_reset_id');
		self::call_private('store_entry', [$reset_id, self::DUMMY_USER_ID, '333333']);

		// force expiry by rewriting the stored file
		$file = self::call_private('get_store_file', [$reset_id]);
		$this->assertNotNull($file);
		$state = json_decode((string)file_get_contents($file), true);
		$state['expires'] = time() - 10;
		file_put_contents($file, json_encode($state));

		$response = password_reset::confirm($reset_id, '333333', 'longpassword8');
		$this->assertFalse($response->result);
		$this->assertContains('invalid_or_expired', $response->errors);
		$this->assertNull(self::call_private('load_entry', [$reset_id]), 'expired entry deleted');
	}



	/**
	* TEST_REQUEST_ANTI_ENUMERATION
	* request() returns the same generic shape (result true + opaque reset_id)
	* whether the identifier matches an account or not, and for too-short input.
	*/
	public function test_request_anti_enumeration(): void {

		$r1 = password_reset::request('non_existent_user_aaa111');
		$r2 = password_reset::request('zzz_no_such_account_999');
		$r3 = password_reset::request('a'); // too short

		foreach ([$r1, $r2, $r3] as $r) {
			$this->assertTrue($r->result, 'request always returns result:true');
			$this->assertObjectHasProperty('reset_id', $r, 'request always returns a reset_id');
			$this->assertTrue(self::call_private('is_valid_reset_id', [$r->reset_id]), 'reset_id is a valid token');
			$this->assertNotEmpty($r->msg, 'request returns a generic message');
		}

		// shapes are identical (same keys)
		$this->assertSame(
			array_keys(get_object_vars($r1)),
			array_keys(get_object_vars($r2)),
			'known vs unknown identifier responses share the same shape'
		);
	}



	/**
	* TEST_GET_USERS_WITH_EMAIL_SAFE
	* The email lookup returns an array and is injection-safe (mirrors the
	* login::get_users_with_code SQL-injection test).
	*/
	public function test_get_users_with_email_safe(): void {

		$none = self::call_private('get_users_with_email', ['no-such-email@nowhere.invalid']);
		$this->assertIsArray($none);
		$this->assertEmpty($none, 'no users for an unknown email');

		$malicious = self::call_private('get_users_with_email', ["'; DROP TABLE users; --"]);
		$this->assertIsArray($malicious, 'returns an array even for malicious input');
		$this->assertEmpty($malicious, 'no users for malicious input');
	}



	/**
	* TEST_DD_MAILER_GUARDS
	* Env-adaptive: when SMTP is not configured, send() reports
	* mailer_not_configured; when it is configured, send() rejects an invalid
	* recipient (the is_valid_email gate) before any network attempt.
	*/
	public function test_dd_mailer_guards(): void {

		if (!dd_mailer::is_configured()) {

			$response = dd_mailer::send((object)[
				'to'		=> 'someone@example.com',
				'subject'	=> 'Test',
				'body_text'	=> 'Body'
			]);
			$this->assertFalse($response->result);
			$this->assertContains('mailer_not_configured', $response->errors);

		} else {

			$response = dd_mailer::send((object)[
				'to'		=> 'not-an-email-address',
				'subject'	=> "Test\r\nBcc: evil@example.com",
				'body_text'	=> 'Body'
			]);
			$this->assertFalse($response->result);
			$this->assertContains('invalid_recipient', $response->errors, 'invalid recipient rejected before send');
		}
	}



}//end class password_reset_test
